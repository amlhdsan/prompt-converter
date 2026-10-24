// LLM client: OpenAI chat-completions + Anthropic Messages, streaming (SSE) with JSON fallback,
// idle timeout, abort, and error classification for friendly messages.
import { pfetch } from './platform';
import type { ApiKind } from './providers';
import { createSSEParser } from './lib/sse';
export { PROVIDERS } from './providers';

export type ErrorKind = 'auth' | 'rate' | 'server' | 'timeout' | 'cors' | 'network' | 'http' | 'config' | 'aborted' | 'empty';
export class LLMError extends Error {
  /** Text received before the failure (e.g. a stream that stalled midway). */
  partial = '';
  constructor(public kind: ErrorKind, message: string, public status?: number, public retryAfter?: number) { super(message); }
}
/** Errors worth retrying when nothing was received yet (requests are idempotent until output arrives). */
export const isTransient = (e: unknown) => e instanceof LLMError && ['rate', 'server', 'network', 'timeout'].includes(e.kind) && !e.partial;

// Track in-flight requests so they can all be aborted on navigation / unload.
const inflight = new Set<AbortController>();
export function abortAll() { inflight.forEach((c) => c.abort()); inflight.clear(); }
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export interface ChatRequest {
  baseUrl: string; apiKey: string; model: string; kind?: ApiKind;
  messages: ChatMessage[];
  stream?: boolean; signal?: AbortSignal; onDelta?: (text: string) => void;
  temperature?: number;
  /** Abort if no data arrives for this many ms (default 60s). */
  timeoutMs?: number;
  /** Retries for transient errors before any output arrived (default 0). */
  retries?: number;
  /** Called before each retry (attempt is 1-based). */
  onRetry?: (attempt: number, max: number, err: LLMError) => void;
  maxTokens?: number;
}

/** Extracts the incremental text from one streamed JSON event (OpenAI or Anthropic). Throws on error events. */
export function extractDelta(kind: ApiKind, j: any): string {
  if (kind === 'anthropic' && j?.type === 'error') throw new LLMError(j.error?.type === 'overloaded_error' ? 'server' : 'http', String(j.error?.message ?? 'error'));
  if (j?.error) throw new LLMError('http', String(j.error.message ?? j.error));
  if (kind === 'anthropic') {
    if (j?.type === 'error') throw new LLMError(j.error?.type === 'overloaded_error' ? 'server' : 'http', String(j.error?.message ?? 'error'));
    return j?.type === 'content_block_delta' ? String(j.delta?.text ?? '') : '';
  }
  const c = j?.choices?.[0];
  return String(c?.delta?.content ?? c?.text ?? '');
}
/** Extracts the full text from a non-streaming JSON response. */
export function extractMessage(kind: ApiKind, j: any): string {
  if (j?.error) throw new LLMError('http', String(j.error.message ?? j.error));
  if (kind === 'anthropic') return Array.isArray(j?.content) ? j.content.map((c: any) => (c?.type === 'text' || c?.text ? c.text ?? '' : '')).join('') : '';
  const c = j?.choices?.[0];
  const m = c?.message?.content;
  if (Array.isArray(m)) return m.map((p: any) => p?.text ?? '').join('');
  return String(m ?? c?.text ?? '');
}
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  if (signal?.aborted) return rej(new LLMError('aborted', 'aborted'));
  const h = setTimeout(() => { signal?.removeEventListener('abort', on); res(); }, ms);
  const on = () => { clearTimeout(h); rej(new LLMError('aborted', 'aborted')); };
  signal?.addEventListener('abort', on, { once: true });
});
export const backoffMs = (attempt: number, retryAfter?: number) =>
  Math.min(retryAfter ? retryAfter * 1000 : 600 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250), 10_000);

/** chat() with retries for transient failures. The last retry falls back to non-streaming. */
export async function chat(req: ChatRequest): Promise<string> {
  const max = Math.max(0, req.retries ?? 0);
  for (let attempt = 0; ; attempt++) {
    try {
      const stream = req.stream && !(attempt > 0 && attempt === max && req.stream);
      return await chatOnce({ ...req, stream });
    } catch (e) {
      if (attempt >= max || !isTransient(e) || req.signal?.aborted) throw e;
      const err = e as LLMError;
      req.onRetry?.(attempt + 1, max, err);
      await sleep(backoffMs(attempt + 1, err.retryAfter), req.signal);
    }
  }
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
  return { ctrl, signal: ctrl.signal, touch, timedOut: () => timedOut, done: () => { clearTimeout(h); signal?.removeEventListener('abort', onAbort); } };
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

async function chatOnce(req: ChatRequest): Promise<string> {
  const kind = req.kind ?? 'openai';
  if (!req.baseUrl.trim()) throw new LLMError('config', 'Base URL is empty');
  if (!req.model.trim()) throw new LLMError('config', 'Model is empty');
  const key = req.apiKey.trim();
  const t = withTimeout(req.signal, req.timeoutMs ?? 60_000);
  inflight.add(t.ctrl);
  let out = '';
  const abortErr = () => {
    const e = t.timedOut() ? new LLMError('timeout', out ? 'stalled' : 'timeout') : new LLMError('aborted', 'aborted');
    e.partial = out; return e;
  };
  const sys = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = req.messages.filter((m) => m.role !== 'system');
  const body = kind === 'anthropic'
    ? { model: req.model.trim(), max_tokens: req.maxTokens ?? 4096, system: sys || undefined, messages: rest, stream: !!req.stream, temperature: req.temperature ?? 0.4 }
    : { model: req.model.trim(), messages: req.messages, stream: !!req.stream, temperature: req.temperature ?? 0.4, ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}) };
  let res: Response;
  try {
    res = await pfetch(endpoint(req.baseUrl, kind), { method: 'POST', headers: headers(kind, key), body: JSON.stringify(body), signal: t.signal });
  } catch (e) {
    t.done(); inflight.delete(t.ctrl);
    if ((e as Error).name === 'AbortError' || t.signal.aborted) throw abortErr();
    // fetch() rejects with TypeError for both CORS blocks and network failures; browsers don't let us distinguish.
    throw new LLMError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'network' : 'cors', String((e as Error)?.message ?? e));
  }
  if (!res.ok) { t.done(); inflight.delete(t.ctrl); throw await errorFromResponse(res); }
  const ct = res.headers.get('content-type') || '';
  try {
    if (req.stream && res.body && ct.includes('text/event-stream')) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let failure: unknown = null;
      const parser = createSSEParser(({ data }) => {
        if (failure || !data || data === '[DONE]') return;
        let j: unknown; try { j = JSON.parse(data); } catch { return; } // non-JSON keep-alives
        try { const delta = extractDelta(kind, j); if (delta) { out += delta; req.onDelta?.(out); } } catch (err) { failure = err; }
      });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        t.touch();
        parser.push(dec.decode(value, { stream: true }));
        if (failure) { reader.cancel().catch(() => {}); throw failure; }
      }
      parser.push(dec.decode()); parser.end();
      if (failure) throw failure;
    } else {
      const text = await res.text();
      let j: unknown;
      try { j = JSON.parse(text); } catch {
        // Some proxies answer SSE even when stream=false; parse it instead of failing.
        if (/^\s*(data|event):/m.test(text)) { const p = createSSEParser(({ data }) => { if (data && data !== '[DONE]') { try { out += extractDelta(kind, JSON.parse(data)); } catch (err) { if (err instanceof LLMError) throw err; } } }); p.push(text); p.end(); }
        else throw new LLMError('http', `Invalid JSON response: ${text.slice(0, 120)}`);
      }
      if (j !== undefined) out = extractMessage(kind, j);
      req.onDelta?.(out);
    }
  } catch (e) {
    if (e instanceof LLMError) { if (!e.partial) e.partial = out; throw e; }
    if ((e as Error).name === 'AbortError' || t.signal.aborted) throw abortErr();
    const ne = new LLMError('network', String((e as Error)?.message ?? e)); ne.partial = out; throw ne;
  } finally { t.done(); inflight.delete(t.ctrl); }
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
    throw t.timedOut() ? new LLMError('timeout', 'timeout') : new LLMError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'network' : 'cors', String((e as Error)?.message ?? e));
  } finally { t.done(); }
  if (!res.ok) throw await errorFromResponse(res);
  const j = await res.json();
  const arr: any[] = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : Array.isArray(j) ? j : [];
  return [...new Set(arr.map((m) => String(m?.id ?? m?.name ?? m).replace(/^models\//, '')).filter(Boolean))].sort();
}
