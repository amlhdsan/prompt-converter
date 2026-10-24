// Optional local error log (never uploaded). Capped ring buffer in localStorage; falls back to memory.
export interface ErrEntry { at: number; ctx: string; msg: string; stack?: string }
const KEY = 'pc.errors.v1';
const MAX = 50;
let mem: ErrEntry[] = [];

export function getErrors(): ErrEntry[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : mem; } catch { return mem; }
}
export function logError(e: unknown, ctx = 'app'): ErrEntry {
  const err = e as { message?: unknown; stack?: unknown } | null;
  const entry: ErrEntry = { at: Date.now(), ctx, msg: String(err?.message ?? e).slice(0, 500) };
  if (typeof err?.stack === 'string') entry.stack = err.stack.slice(0, 2000);
  const list = [entry, ...getErrors()].slice(0, MAX);
  mem = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota / disabled: keep in memory */ }
  return entry;
}
export function clearErrors() { mem = []; try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
export const formatErrors = (list = getErrors(), version = '') =>
  [`Prompt Converter ${version} · ${navigator.userAgent}`, ...list.map((e) => `[${new Date(e.at).toISOString()}] (${e.ctx}) ${e.msg}${e.stack ? '\n' + e.stack : ''}`)].join('\n\n');
