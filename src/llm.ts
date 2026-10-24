// LLM client: OpenAI chat-completions + Anthropic Messages, streaming (SSE) with JSON fallback,
// idle timeout, abort, and error classification for friendly messages.
import { pfetch } from './platform';
import type { ApiKind } from './providers';
export { PROVIDERS } from './providers';

export type ErrorKind = 'auth' | 'rate' | 'server' | 'timeout' | 'cors' | 'network' | 'http' | 'config' | 'aborted' | 'empty';
export class LLMError extends Error {
  constructor(public kind: ErrorKind, message: string, public status?: number, public retryAfter?: number) { super(message); }
}
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export interface ChatRequest {
  baseUrl: string; apiKey: string; model: string; kind?: ApiKind;
  messages: ChatMessage[];
  stream?: boolean; signal?: AbortSignal; onDelta?: (text: string) => void;
  temperature?: number;
  /** Abort if no data arrives for this many ms (default 60s). */
  timeoutMs?: number;
}

const trimBase = (b: string) => b.trim().replace(/\/+$/, '');
export function endpoint(baseUrl: string, kind: ApiKind = 'openai'): string {
  const b = trimBase(baseUrl);
  if (kind === 'anthropic') return b.endsWith('/messages') ? b : `${b}/messages`;
  return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`;
}
function headers(kind: ApiKind, key: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (kind === 'anthropic') {
    h['anthropic-version'] = '2023-06-01';
    h['anthropic-dangerous-direct-browser-access'] = 'true';
    if (key) h['x-api-key'] = key;
  } else if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

/** Wraps the caller's signal with an idle timeout. `touch()` resets the timer whenever data arrives. */
function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const ctrl = new AbortController();
  let timedOut = false;
  let h: ReturnType<typeof setTimeout> | undefined;
  const touch = () => { clearTimeout(h); h = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms); };
  const onAbort = () => ctrl.abort();
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  touch();
  return { signal: ctrl.signal, touch, timedOut: () => timedOut, done: () => { clearTimeout(h); signal?.removeEventListener('abort', onAbort); } };
}

async function errorFromResponse(res: Response): Promise<LLMError> {
  let detail = '';
  try { const t = await res.text(); try { const j = JSON.parse(t); detail = j?.error?.message ?? j?.message ?? j?.error ?? t; } catch { detail = t; } } catch { /* ignore */ }
  const msg = `HTTP ${res.status}${detail ? ': ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`;
  const s = res.status;
  const ra = Number(res.headers.get('retry-after')) || undefined;
  const kind: ErrorKind = s === 401 || s === 403 ? 'auth' : s === 429 ? 'rate' : s === 408 || s === 504 ? 'timeout' : s >= 500 ? 'server' : 'http';
  return new LLMError(kind, msg, s, ra);
}

export async function chat(req: ChatRequest): Promise<string> {
  const kind = req.kind ?? 'openai';
  if (!req.baseUrl.trim()) throw new LLMError('config', 'Base URL is empty');
  if (!req.model.trim()) throw new LLMError('config', 'Model is empty');
  const key = req.apiKey.trim();
  const t = withTimeout(req.signal, req.timeoutMs ?? 60_000);
  const abortErr = () => (t.timedOut() ? new LLMError('timeout', 'timeout') : new LLMError('aborted', 'aborted'));
  const sys = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = req.messages.filter((m) => m.role !== 'system');
  const body = kind === 'anthropic'
    ? { model: req.model.trim(), max_tokens: 4096, system: sys || undefined, messages: rest, stream: !!req.stream, temperature: req.temperature ?? 0.4 }
    : { model: req.model.trim(), messages: req.messages, stream: !!req.stream, temperature: req.temperature ?? 0.4 };
  let res: Response;
  try {
    res = await pfetch(endpoint(req.baseUrl, kind), { method: 'POST', headers: headers(kind, key), body: JSON.stringify(body), signal: t.signal });
  } catch (e) {
    t.done();
    if ((e as Error).name === 'AbortError' || t.signal.aborted) throw abortErr();
    // fetch() rejects with TypeError for both CORS blocks and network failures; browsers don't let us distinguish.
    throw new LLMError(navigator.onLine === false ? 'network' : 'cors', String((e as Error)?.message ?? e));
  }
  if (!res.ok) { t.done(); throw await errorFromResponse(res); }
  const ct = res.headers.get('content-type') || '';
  let out = '';
  try {
    if (req.stream && res.body && ct.includes('text/event-stream')) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        t.touch();
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let j: any; try { j = JSON.parse(data); } catch { continue; } // partial / keepalive
          if (j?.error) throw new LLMError('http', String(j.error.message ?? j.error));
          const delta = kind === 'anthropic' ? (j?.type === 'content_block_delta' ? j.delta?.text : '') : j?.choices?.[0]?.delta?.content;
          if (delta) { out += delta; req.onDelta?.(out); }
        }
      }
    } else {
      const j = await res.json();
      out = kind === 'anthropic'
        ? (Array.isArray(j?.content) ? j.content.map((c: any) => c?.text ?? '').join('') : '')
        : j?.choices?.[0]?.message?.content ?? '';
      req.onDelta?.(out);
    }
  } catch (e) {
    if (e instanceof LLMError) throw e;
    if ((e as Error).name === 'AbortError' || t.signal.aborted) throw abortErr();
    throw new LLMError('network', String((e as Error)?.message ?? e));
  } finally { t.done(); }
  if (!out.trim()) throw new LLMError('empty', 'Empty response');
  return out;
}

/** Fetch the model ids an endpoint offers (`GET /models`). */
export async function listModels(baseUrl: string, apiKey: string, kind: ApiKind = 'openai'): Promise<string[]> {
  if (!baseUrl.trim()) throw new LLMError('config', 'Base URL is empty');
  let res: Response;
  const t = withTimeout(undefined, 15_000);
  try {
    res = await pfetch(`${trimBase(baseUrl)}/models`, { headers: headers(kind, apiKey.trim()), signal: t.signal });
  } catch (e) {
    throw t.timedOut() ? new LLMError('timeout', 'timeout') : new LLMError(navigator.onLine === false ? 'network' : 'cors', String((e as Error)?.message ?? e));
  } finally { t.done(); }
  if (!res.ok) throw await errorFromResponse(res);
  const j = await res.json();
  const arr: any[] = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : Array.isArray(j) ? j : [];
  return [...new Set(arr.map((m) => String(m?.id ?? m?.name ?? m).replace(/^models\//, '')).filter(Boolean))].sort();
}
