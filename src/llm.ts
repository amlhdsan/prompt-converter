// OpenAI-compatible chat completions client (streaming via SSE, fallback to JSON).
export interface Provider { id: string; name: string; baseUrl: string; model: string; keyUrl?: string }

export const PROVIDERS: Provider[] = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'qwen', name: '通义千问 Qwen (DashScope)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', keyUrl: 'https://dashscope.console.aliyun.com/apiKey' },
  { id: 'custom', name: 'Custom / 自定义', baseUrl: '', model: '' },
];

export type ErrorKind = 'auth' | 'cors' | 'network' | 'http' | 'config' | 'aborted' | 'empty';
export class LLMError extends Error {
  constructor(public kind: ErrorKind, message: string, public status?: number) { super(message); }
}

export interface ChatRequest {
  baseUrl: string; apiKey: string; model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  stream?: boolean; signal?: AbortSignal; onDelta?: (text: string) => void;
}

export function endpoint(baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '');
  return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`;
}

import { pfetch } from './platform';

export async function chat(req: ChatRequest): Promise<string> {
  if (!req.baseUrl.trim()) throw new LLMError('config', 'Base URL is empty');
  if (!req.model.trim()) throw new LLMError('config', 'Model is empty');
  if (!req.apiKey.trim()) throw new LLMError('auth', 'API key is empty');
  let res: Response;
  try {
    res = await pfetch(endpoint(req.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey.trim()}` },
      body: JSON.stringify({ model: req.model.trim(), messages: req.messages, stream: !!req.stream, temperature: 0.4 }),
      signal: req.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new LLMError('aborted', 'aborted');
    // fetch() rejects with TypeError for both CORS blocks and network failures; browsers don't let us distinguish.
    throw new LLMError(navigator.onLine === false ? 'network' : 'cors', (e as Error).message);
  }
  if (!res.ok) {
    let detail = '';
    try { const t = await res.text(); try { const j = JSON.parse(t); detail = j?.error?.message ?? j?.message ?? t; } catch { detail = t; } } catch { /* ignore */ }
    const kind: ErrorKind = res.status === 401 || res.status === 403 ? 'auth' : 'http';
    throw new LLMError(kind, `HTTP ${res.status}${detail ? ': ' + String(detail).slice(0, 300) : ''}`, res.status);
  }
  const ct = res.headers.get('content-type') || '';
  let out = '';
  if (req.stream && res.body && ct.includes('text/event-stream')) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
            if (delta) { out += delta; req.onDelta?.(out); }
          } catch { /* partial / keepalive */ }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new LLMError('aborted', 'aborted');
      throw new LLMError('network', (e as Error).message);
    }
  } else {
    const j = await res.json();
    out = j?.choices?.[0]?.message?.content ?? '';
    req.onDelta?.(out);
  }
  if (!out.trim()) throw new LLMError('empty', 'Empty response');
  return out;
}
