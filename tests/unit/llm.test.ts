// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/platform', () => ({ pfetch: (...a: Parameters<typeof fetch>) => globalThis.fetch(...a) }));
import { abortAll, backoffMs, chat, endpoint, extractDelta, extractMessage, isTransient, listModels, LLMError } from '../../src/llm';

const enc = new TextEncoder();
function sse(chunks: string[], opts: { stallAfter?: boolean; status?: number } = {}) {
  const body = new ReadableStream<Uint8Array>({
    async start(c) {
      for (const ch of chunks) { c.enqueue(enc.encode(ch)); await new Promise((r) => setTimeout(r, 1)); }
      if (!opts.stallAfter) c.close(); // else: never closes → idle timeout
    },
  });
  return new Response(body, { status: opts.status ?? 200, headers: { 'content-type': 'text/event-stream' } });
}
const json = (v: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json', ...headers } });
const base = { baseUrl: 'https://api.test/v1', model: 'm', apiKey: 'k', messages: [{ role: 'system' as const, content: 'S' }, { role: 'user' as const, content: 'U' }] };
const oa = (s: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}\n\n`;
const an = (s: string) => `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: s } })}\n\n`;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('endpoint', () => {
  it('normalises base URLs', () => {
    expect(endpoint('https://a/v1/')).toBe('https://a/v1/chat/completions');
    expect(endpoint('https://a/v1/chat/completions')).toBe('https://a/v1/chat/completions');
    expect(endpoint('https://api.anthropic.com/v1', 'anthropic')).toMatch(/\/v1\/messages$/);
  });
});

describe('response parsing', () => {
  it('extracts OpenAI deltas and messages (string, array, legacy text)', () => {
    expect(extractDelta('openai', { choices: [{ delta: { content: 'hi' } }] })).toBe('hi');
    expect(extractDelta('openai', { choices: [{ delta: {} }] })).toBe('');
    expect(extractDelta('openai', { choices: [{ text: 'x' }] })).toBe('x');
    expect(extractMessage('openai', { choices: [{ message: { content: 'full' } }] })).toBe('full');
    expect(extractMessage('openai', { choices: [{ message: { content: [{ type: 'text', text: 'a' }, { text: 'b' }] } }] })).toBe('ab');
    expect(extractMessage('openai', {})).toBe('');
  });
  it('extracts Anthropic deltas and messages', () => {
    expect(extractDelta('anthropic', { type: 'content_block_delta', delta: { text: 'yo' } })).toBe('yo');
    expect(extractDelta('anthropic', { type: 'message_start' })).toBe('');
    expect(extractMessage('anthropic', { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('ab');
  });
  it('throws on error events', () => {
    expect(() => extractDelta('openai', { error: { message: 'bad' } })).toThrow('bad');
    expect(() => extractDelta('anthropic', { type: 'error', error: { type: 'overloaded_error', message: 'busy' } })).toThrow(LLMError);
    try { extractDelta('anthropic', { type: 'error', error: { type: 'overloaded_error', message: 'busy' } }); } catch (e) { expect((e as LLMError).kind).toBe('server'); }
  });
});

describe('chat()', () => {
  it('streams OpenAI SSE with split chunks, CRLF, keep-alives, non-JSON lines and [DONE]', async () => {
    const raw = `: ping\r\n\r\n${oa('Hel')}data: not-json\n\n${oa('lo')}data: [DONE]\n\n`.replace(/\n/g, '\r\n');
    fetchMock.mockResolvedValue(sse([raw.slice(0, 7), raw.slice(7, 30), raw.slice(30)]));
    const deltas: string[] = [];
    expect(await chat({ ...base, stream: true, onDelta: (s) => deltas.push(s) })).toBe('Hello');
    expect(deltas.slice(-1)[0]).toBe('Hello');
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'm', stream: true, messages: base.messages });
    expect(init.headers.Authorization ?? init.headers.authorization).toBe('Bearer k');
  });
  it('streams Anthropic and sends system separately', async () => {
    fetchMock.mockResolvedValue(sse([`event: message_start\ndata: {"type":"message_start"}\n\n`, an('A'), an('B'), 'event: message_stop\ndata: {"type":"message_stop"}\n\n']));
    expect(await chat({ ...base, kind: 'anthropic', stream: true })).toBe('AB');
    const init = fetchMock.mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.system).toBe('S');
    expect(body.messages).toEqual([{ role: 'user', content: 'U' }]);
    expect(init.headers['x-api-key']).toBe('k');
  });
  it('surfaces mid-stream error events', async () => {
    fetchMock.mockResolvedValue(sse([oa('x'), 'event: error\ndata: {"type":"error","error":{"type":"api_error","message":"boom"}}\n\n'], {}));
    await expect(chat({ ...base, kind: 'anthropic', stream: true })).rejects.toThrow('boom');
  });
  it('parses non-streaming JSON and falls back when a stream is requested but JSON returned', async () => {
    fetchMock.mockResolvedValue(json({ choices: [{ message: { content: 'ok' } }] }));
    expect(await chat({ ...base, stream: true })).toBe('ok');
  });
  it('parses SSE bodies returned for non-stream requests', async () => {
    fetchMock.mockResolvedValue(new Response(oa('a') + oa('b') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/plain' } }));
    expect(await chat({ ...base })).toBe('ab');
  });
  it('rejects invalid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    await expect(chat(base)).rejects.toMatchObject({ kind: 'http' });
  });
  it('classifies HTTP errors', async () => {
    for (const [status, kind] of [[401, 'auth'], [403, 'auth'], [429, 'rate'], [500, 'server'], [504, 'timeout'], [400, 'http']] as const) {
      fetchMock.mockResolvedValueOnce(json({ error: { message: 'nope' } }, status));
      await expect(chat(base)).rejects.toMatchObject({ kind, status });
    }
  });
  it('validates config', async () => {
    await expect(chat({ ...base, baseUrl: ' ' })).rejects.toMatchObject({ kind: 'config' });
    await expect(chat({ ...base, model: '' })).rejects.toMatchObject({ kind: 'config' });
  });
  it('retries transient errors with backoff, honouring Retry-After, then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'busy' }, 503)).mockResolvedValueOnce(json({}, 429, { 'retry-after': '0' })).mockResolvedValueOnce(json({ choices: [{ message: { content: 'ok' } }] }));
    const retries: number[] = [];
    expect(await chat({ ...base, retries: 3, onRetry: (n) => retries.push(n) })).toBe('ok');
    expect(retries).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('does not retry non-transient errors', async () => {
    fetchMock.mockResolvedValue(json({ error: 'bad key' }, 401));
    await expect(chat({ ...base, retries: 3 })).rejects.toMatchObject({ kind: 'auth' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('falls back to non-streaming on the last retry', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 502)).mockResolvedValueOnce(json({ choices: [{ message: { content: 'plain' } }] }));
    expect(await chat({ ...base, stream: true, retries: 1 })).toBe('plain');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).stream).toBe(false);
  });
  it('keeps partial output when a stream stalls midway and never retries it', async () => {
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      const r = sse([oa('part')], { stallAfter: true });
      // emulate fetch abort semantics for the body
      const reader = r.body!.getReader();
      const body = new ReadableStream({ async pull(c) { const abort = new Promise<never>((_, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))); const v = await Promise.race([reader.read(), abort]); if (v.done) c.close(); else c.enqueue(v.value); } });
      return Promise.resolve(new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
    });
    const err = await chat({ ...base, stream: true, timeoutMs: 60, retries: 2 }).catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.kind).toBe('timeout');
    expect(err.message).toBe('stalled');
    expect(err.partial).toBe('part');
    expect(isTransient(err)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('aborts cleanly via signal and abortAll()', async () => {
    fetchMock.mockImplementation((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))));
    const c = new AbortController();
    const p = chat({ ...base, signal: c.signal, retries: 2 });
    c.abort();
    await expect(p).rejects.toMatchObject({ kind: 'aborted' });
    const p2 = chat({ ...base });
    await new Promise((r) => setTimeout(r, 5));
    abortAll();
    await expect(p2).rejects.toMatchObject({ kind: 'aborted' });
  });
  it('maps fetch TypeErrors to cors/network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(chat(base)).rejects.toMatchObject({ kind: expect.stringMatching(/cors|network/) });
  });
});

describe('backoff', () => {
  it('grows exponentially, caps at 10s and honours Retry-After', () => {
    expect(backoffMs(1)).toBeGreaterThanOrEqual(600);
    expect(backoffMs(2)).toBeGreaterThanOrEqual(1200);
    expect(backoffMs(10)).toBe(10_000);
    expect(backoffMs(1, 3)).toBe(3000);
    expect(backoffMs(1, 60)).toBe(10_000);
  });
});

describe('listModels', () => {
  it('lists OpenAI-style models sorted', async () => {
    fetchMock.mockResolvedValue(json({ data: [{ id: 'b' }, { id: 'a' }] }));
    expect(await listModels('https://api.test/v1', 'k')).toEqual(expect.arrayContaining(['a', 'b']));
  });
});
