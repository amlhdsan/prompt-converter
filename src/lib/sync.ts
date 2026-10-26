// Optional cloud sync of settings (without keys by default), templates, history and the workspace via a user-provided
// WebDAV server or a private GitHub Gist. Merge is by id with "newest wins".
import { pfetch } from '../platform';

export interface SyncConfig { kind: 'off' | 'webdav' | 'gist'; url: string; user: string; pass: string; token: string; gistId: string; includeKeys: boolean; lastSync: number }
export const DEFAULT_SYNC: SyncConfig = { kind: 'off', url: '', user: '', pass: '', token: '', gistId: '', includeKeys: false, lastSync: 0 };
export const SYNC_FILE = 'prompt-converter-sync.json';

export interface Stamped { id: string; at?: number; updated?: number }
/** Merges two lists by id, keeping the item with the newer `updated ?? at`. Result sorted newest first. */
export function mergeById<T extends Stamped>(a: T[], b: T[]): T[] {
  const m = new Map<string, T>();
  const ts = (x: T) => x.updated ?? x.at ?? 0;
  for (const x of [...a, ...b]) { const cur = m.get(x.id); if (!cur || ts(x) > ts(cur)) m.set(x.id, x); }
  return [...m.values()].sort((x, y) => ts(y) - ts(x));
}

export class SyncError extends Error { constructor(public kind: 'config' | 'auth' | 'notfound' | 'network' | 'http' | 'format', msg: string) { super(msg); } }
const auth = (c: SyncConfig): Record<string, string> => (c.kind === 'webdav'
  ? (c.user || c.pass ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${c.user}:${c.pass}`))) } : {})
  : { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json' });
const gistApi = () => { try { return localStorage.getItem('pc.gistApi') || 'https://api.github.com'; } catch { return 'https://api.github.com'; } };
const davUrl = (c: SyncConfig) => (c.url.endsWith('.json') ? c.url : c.url.replace(/\/?$/, '/') + SYNC_FILE);

async function req(url: string, init: RequestInit): Promise<Response> {
  let r: Response;
  try { r = await pfetch(url, init); } catch (e) { throw new SyncError('network', String((e as Error).message ?? e)); }
  if (r.status === 401 || r.status === 403) throw new SyncError('auth', `HTTP ${r.status}`);
  return r;
}
export function validate(c: SyncConfig) {
  if (c.kind === 'webdav' && !/^https?:\/\//.test(c.url)) throw new SyncError('config', 'url');
  if (c.kind === 'gist' && !c.token.trim()) throw new SyncError('config', 'token');
  if (c.kind === 'off') throw new SyncError('config', 'off');
}
/** Downloads the remote bundle; null when it doesn't exist yet. */
export async function pull(c: SyncConfig): Promise<unknown | null> {
  validate(c);
  if (c.kind === 'webdav') {
    const r = await req(davUrl(c), { method: 'GET', headers: auth(c) });
    if (r.status === 404) return null;
    if (!r.ok) throw new SyncError('http', `HTTP ${r.status}`);
    try { return JSON.parse(await r.text()); } catch { throw new SyncError('format', 'json'); }
  }
  if (!c.gistId) return null;
  const r = await req(`${gistApi()}/gists/${encodeURIComponent(c.gistId)}`, { method: 'GET', headers: auth(c) });
  if (r.status === 404) throw new SyncError('notfound', 'gist');
  if (!r.ok) throw new SyncError('http', `HTTP ${r.status}`);
  const j = await r.json();
  const f = j?.files?.[SYNC_FILE];
  if (!f) return null;
  let content = f.content as string;
  if (f.truncated && f.raw_url) content = await (await req(f.raw_url, { method: 'GET', headers: auth(c) })).text();
  try { return JSON.parse(content); } catch { throw new SyncError('format', 'json'); }
}
/** Uploads the bundle. For Gist, creates a private gist when no id is set and returns its id. */
export async function push(c: SyncConfig, bundle: unknown): Promise<string> {
  validate(c);
  const body = JSON.stringify(bundle, null, 1);
  if (c.kind === 'webdav') {
    const r = await req(davUrl(c), { method: 'PUT', headers: { ...auth(c), 'Content-Type': 'application/json' }, body });
    if (!r.ok) throw new SyncError('http', `HTTP ${r.status}`);
    return '';
  }
  const payload = JSON.stringify({ description: 'Prompt Converter sync', public: false, files: { [SYNC_FILE]: { content: body } } });
  const url = c.gistId ? `${gistApi()}/gists/${encodeURIComponent(c.gistId)}` : `${gistApi()}/gists`;
  const r = await req(url, { method: c.gistId ? 'PATCH' : 'POST', headers: { ...auth(c), 'Content-Type': 'application/json' }, body: payload });
  if (!r.ok) throw new SyncError(r.status === 404 ? 'notfound' : 'http', `HTTP ${r.status}`);
  const j = await r.json();
  return String(j?.id ?? c.gistId);
}
