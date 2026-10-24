// Persistence layer. Everything lives on this device (localStorage / sessionStorage); nothing is uploaded.
// Robustness: versioned schema + migrations, corrupted-JSON recovery (bad value is backed up, defaults used),
// quota-exceeded fallback (evict old history, then in-memory), sanitising of every record on load and import,
// and a multi-tab change subscription via the `storage` event.
import { logError } from './lib/errlog';

export const K = { settings: 'pc.settings.v1', history: 'pc.history.v1', templates: 'pc.templates.v1', schema: 'pc.schema' } as const;
export const SCHEMA_VERSION = 2;
export type UiLang = 'zh' | 'en' | 'ja';
export const UI_LANGS: UiLang[] = ['zh', 'en', 'ja'];

export interface Settings {
  provider: string; baseUrl: string; model: string; apiKeys: Record<string, string>;
  mode: string; outLang: string; customLang: string; uiLang: UiLang; theme: 'light' | 'dark' | 'system'; stream: boolean;
  autoUpdate: boolean; dismissedUpdate: string;
  /** Desktop only: global hotkey for the quick-convert window (Tauri accelerator syntax). */
  hotkey: string;
  /** Desktop only: after a quick conversion, copy the result to the clipboard automatically. */
  quickAutoCopy: boolean;
  /** Desktop only: after copying, hide the quick window and paste into the previously focused app. */
  autoPaste: boolean;
  /** Saved endpoint profiles (provider + base URL + model + key). */
  profiles: Profile[];
  activeProfile: string;
  /** How many variants to generate per conversion (1–3). */
  variants: number;
  /** Output display: rendered Markdown or raw text. */
  render: 'md' | 'raw';
  /** Idle timeout for API calls, seconds. */
  timeoutSec: number;
  /** Retries for transient errors (429 / 5xx / network) before any data arrived. */
  retries: number;
  /** Keep API keys only for this browser session (sessionStorage) instead of localStorage. */
  sessionKeys: boolean;
  /** Show the local quality score panel. */
  showScore: boolean;
  /** User overrides of the built-in modes' system instructions. */
  modeHints: Record<string, string>;
  /** Keep a local error log that can be copied for bug reports. */
  errorLog: boolean;
}
export interface Profile { id: string; name: string; provider: string; baseUrl: string; model: string; apiKey: string }
export interface HistoryItem { id: string; at: number; mode: string; input: string; output: string; model: string; fav?: boolean }
/** A user-defined conversion mode. `prompt` is the instruction given to the model on how to restructure. */
export interface Template { id: string; name: string; icon: string; prompt: string; at: number }

export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';
export const DEFAULT_SETTINGS: Settings = {
  provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKeys: {},
  mode: 'general', outLang: 'auto', customLang: '', uiLang: 'zh', theme: 'system', stream: true,
  autoUpdate: true, dismissedUpdate: '', hotkey: DEFAULT_HOTKEY, quickAutoCopy: true, autoPaste: false,
  profiles: [], activeProfile: '', variants: 1, render: 'md', timeoutSec: 60, retries: 2, sessionKeys: false, showScore: true,
  modeHints: {}, errorLog: true,
};
export const HISTORY_MAX = 100;

// ---------- low-level safe access ----------
const mem = new Map<string, string>();
/** True when we had to fall back to memory (storage disabled or full). The UI shows a warning. */
export const health = { degraded: false, recovered: [] as string[] };

function rawGet(key: string): string | null {
  try { const v = localStorage.getItem(key); return v ?? mem.get(key) ?? null; } catch { health.degraded = true; return mem.get(key) ?? null; }
}
const isQuota = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
/** Writes with quota handling: evict the oldest non-favourite history and retry; finally keep in memory. */
export function rawSet(key: string, value: string): boolean {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { localStorage.setItem(key, value); mem.delete(key); return true; } catch (e) {
      if (!isQuota(e)) break;
      if (!evictHistory(key === K.history ? value : undefined)) break;
      if (key === K.history) value = rawGet(K.history) ?? value;
    }
  }
  health.degraded = true; mem.set(key, value); return false;
}
/** Halves non-favourite history. Returns false when there is nothing left to evict. */
function evictHistory(pending?: string): boolean {
  let h: HistoryItem[] = [];
  try { h = JSON.parse(pending ?? rawGet(K.history) ?? '[]'); } catch { /* corrupt */ }
  const normal = h.filter((x) => !x.fav);
  if (!normal.length) return false;
  const keep = new Set(normal.slice(0, Math.floor(normal.length / 2)).map((x) => x.id));
  const next = h.filter((x) => x.fav || keep.has(x.id));
  try { localStorage.setItem(K.history, JSON.stringify(next)); return true; } catch { mem.set(K.history, JSON.stringify(next)); return next.length < h.length; }
}
function rawDel(key: string) { mem.delete(key); try { localStorage.removeItem(key); } catch { /* ignore */ } }

/** Parses JSON; on corruption backs up the raw value under `pc.corrupt.*`, logs it, and returns the fallback. */
export function readJSON<T>(key: string, fallback: T): T {
  const raw = rawGet(key);
  if (raw == null || raw === '') return fallback;
  try { return JSON.parse(raw) as T; } catch (e) {
    health.recovered.push(key);
    try { localStorage.setItem(`pc.corrupt.${key}`, raw.slice(0, 200_000)); } catch { /* ignore */ }
    rawDel(key);
    logError(e, `storage:${key}`);
    return fallback;
  }
}

// ---------- sanitisers (used on load and on import) ----------
const str = (v: unknown, d = '', max = 100_000) => (typeof v === 'string' ? v.slice(0, max) : d);
const num = (v: unknown, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const strMap = (v: unknown): Record<string, string> => {
  const o: Record<string, string> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'string') o[k.slice(0, 100)] = x.slice(0, 20_000);
  return o;
};

export function sanitizeProfile(p: unknown): Profile | null {
  const o = p as Partial<Profile> | null;
  if (!o || typeof o !== 'object' || !o.id || typeof o.id !== 'string') return null;
  return { id: str(o.id, '', 100), name: str(o.name, 'Profile', 60) || 'Profile', provider: str(o.provider, 'custom', 40), baseUrl: str(o.baseUrl, '', 500), model: str(o.model, '', 200), apiKey: str(o.apiKey, '', 1000) };
}
export function sanitizeSettings(v: unknown): Settings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    provider: str(o.provider, d.provider, 40) || d.provider, baseUrl: str(o.baseUrl, d.baseUrl, 500), model: str(o.model, d.model, 200),
    apiKeys: strMap(o.apiKeys), mode: str(o.mode, d.mode, 120) || d.mode, outLang: str(o.outLang, d.outLang, 20) || d.outLang,
    customLang: str(o.customLang, '', 60), uiLang: oneOf(o.uiLang, UI_LANGS, d.uiLang), theme: oneOf(o.theme, ['light', 'dark', 'system'] as const, d.theme),
    stream: bool(o.stream, d.stream), autoUpdate: bool(o.autoUpdate, d.autoUpdate), dismissedUpdate: str(o.dismissedUpdate, '', 40),
    hotkey: str(o.hotkey, d.hotkey, 80) || d.hotkey, quickAutoCopy: bool(o.quickAutoCopy, d.quickAutoCopy), autoPaste: bool(o.autoPaste, d.autoPaste),
    profiles: (Array.isArray(o.profiles) ? o.profiles : []).map(sanitizeProfile).filter((x): x is Profile => !!x).slice(0, 50),
    activeProfile: str(o.activeProfile, '', 100), variants: Math.round(num(o.variants, d.variants, 1, 3)),
    render: oneOf(o.render, ['md', 'raw'] as const, d.render), timeoutSec: num(o.timeoutSec, d.timeoutSec, 5, 600),
    retries: Math.round(num(o.retries, d.retries, 0, 5)), sessionKeys: bool(o.sessionKeys, d.sessionKeys), showScore: bool(o.showScore, d.showScore),
    modeHints: strMap(o.modeHints), errorLog: bool(o.errorLog, d.errorLog),
  };
}
export function sanitizeHistoryItem(v: unknown): HistoryItem | null {
  const o = v as Partial<HistoryItem> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !o.id || typeof o.input !== 'string' || typeof o.output !== 'string') return null;
  const it: HistoryItem = { id: o.id.slice(0, 100), at: num(o.at, Date.now(), 0, 8.64e15), mode: str(o.mode, 'general', 120) || 'general', input: o.input.slice(0, 50_000), output: o.output.slice(0, 100_000), model: str(o.model, '', 200) };
  if (o.fav === true) it.fav = true;
  return it;
}
export function sanitizeTemplate(v: unknown): Template | null {
  const o = v as Partial<Template> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !o.id || typeof o.name !== 'string' || !o.name.trim() || typeof o.prompt !== 'string' || !o.prompt.trim()) return null;
  return { id: o.id.slice(0, 100), name: o.name.trim().slice(0, 40), icon: str(o.icon, '⭐', 8) || '⭐', prompt: o.prompt.slice(0, 20_000), at: num(o.at, Date.now(), 0, 8.64e15) };
}
const sanitizeList = <T>(v: unknown, f: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v.map(f).filter((x): x is T => !!x) : []);

// ---------- migrations ----------
/** Ordered migrations: index i upgrades schema i → i+1. Each receives raw storage access. */
const MIGRATIONS: (() => void)[] = [
  // 0 → 1: pre-1.3 data had no schema marker; nothing structural to change.
  () => {},
  // 1 → 2: normalise every record (adds fields introduced in 1.3/1.4, drops malformed entries, de-dupes ids).
  () => {
    rawSet(K.settings, JSON.stringify(sanitizeSettings(readJSON(K.settings, {}))));
    const seen = new Set<string>();
    const h = sanitizeList(readJSON(K.history, []), sanitizeHistoryItem).filter((x) => !seen.has(x.id) && !!seen.add(x.id));
    rawSet(K.history, JSON.stringify(h));
    rawSet(K.templates, JSON.stringify(sanitizeList(readJSON(K.templates, []), sanitizeTemplate)));
  },
];
export function migrate(): number {
  const from = Number(rawGet(K.schema) ?? (rawGet(K.settings) || rawGet(K.history) ? 0 : SCHEMA_VERSION)) || 0;
  for (let v = from; v < SCHEMA_VERSION; v++) {
    try { MIGRATIONS[v]?.(); } catch (e) { logError(e, `migrate:${v}`); }
  }
  if (rawGet(K.schema) !== String(SCHEMA_VERSION)) rawSet(K.schema, String(SCHEMA_VERSION));
  return from;
}
migrate();

// ---------- settings ----------
const SESSION_KEYS = 'pc.keys.session';
function sessionGet(): { apiKeys?: Record<string, string>; profiles?: Record<string, string> } {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEYS) || '{}'); } catch { return {}; }
}
export function loadSettings(): Settings {
  const s = sanitizeSettings({ ...DEFAULT_SETTINGS, ...readJSON<Record<string, unknown>>(K.settings, {}) });
  if (s.sessionKeys) {
    const k = sessionGet();
    s.apiKeys = { ...s.apiKeys, ...strMap(k.apiKeys) };
    s.profiles = s.profiles.map((p) => ({ ...p, apiKey: k.profiles?.[p.id] ?? p.apiKey }));
  }
  return s;
}
/** Persists settings. With `sessionKeys`, secrets go to sessionStorage and are stripped from localStorage. */
export function saveSettings(s: Settings) {
  if (!s.sessionKeys) { rawSet(K.settings, JSON.stringify(s)); try { sessionStorage.removeItem(SESSION_KEYS); } catch { /* ignore */ } return; }
  try { sessionStorage.setItem(SESSION_KEYS, JSON.stringify({ apiKeys: s.apiKeys, profiles: Object.fromEntries(s.profiles.map((p) => [p.id, p.apiKey])) })); } catch { health.degraded = true; }
  rawSet(K.settings, JSON.stringify({ ...s, apiKeys: {}, profiles: s.profiles.map((p) => ({ ...p, apiKey: '' })) }));
}

// ---------- history ----------
export const loadHistory = (): HistoryItem[] => sanitizeList(readJSON(K.history, []), sanitizeHistoryItem);
export const saveHistory = (h: HistoryItem[]) => rawSet(K.history, JSON.stringify(h));
/** Adds an item; favorites are never evicted by the size cap. */
export function addHistory(item: HistoryItem, max = HISTORY_MAX) {
  const h = [item, ...loadHistory().filter((x) => x.id !== item.id)];
  let n = 0;
  saveHistory(h.filter((x) => x.fav || ++n <= max));
}
export function toggleFav(id: string): boolean {
  const h = loadHistory(); const it = h.find((x) => x.id === id); if (!it) return false;
  if (it.fav) delete it.fav; else it.fav = true;
  saveHistory(h); return !!it.fav;
}
export const deleteHistory = (id: string) => saveHistory(loadHistory().filter((x) => x.id !== id));
/** Clears history but keeps favorites. */
export const clearHistory = () => { const f = loadHistory().filter((x) => x.fav); if (f.length) saveHistory(f); else rawDel(K.history); };

// ---------- templates ----------
export const loadTemplates = (): Template[] => sanitizeList(readJSON(K.templates, []), sanitizeTemplate);
export const saveTemplates = (t: Template[]) => rawSet(K.templates, JSON.stringify(t));
export function upsertTemplate(t: Template) {
  const all = loadTemplates(); const i = all.findIndex((x) => x.id === t.id);
  if (i >= 0) all[i] = t; else all.push(t);
  saveTemplates(all);
}
export const deleteTemplate = (id: string) => saveTemplates(loadTemplates().filter((x) => x.id !== id));

// ---------- import / export ----------
export interface Backup { app: 'prompt-converter'; version: string; schema?: number; exportedAt: string; settings?: Partial<Settings>; templates?: Template[]; history?: HistoryItem[] }
export function exportData(version: string, opts: { settings: boolean; templates: boolean; history: boolean; keys: boolean }): Backup {
  const b: Backup = { app: 'prompt-converter', version, schema: SCHEMA_VERSION, exportedAt: new Date().toISOString() };
  if (opts.settings) {
    const s: Partial<Settings> = { ...loadSettings() };
    if (!opts.keys) { delete s.apiKeys; s.profiles = (s.profiles || []).map((p) => ({ ...p, apiKey: '' })); }
    b.settings = s;
  }
  if (opts.templates) b.templates = loadTemplates();
  if (opts.history) b.history = loadHistory();
  return b;
}
export class ImportError extends Error {}
/** Validates and merges a backup. Templates/history are merged by id (imported wins). Throws ImportError when invalid. */
export function importData(raw: unknown): { settings: boolean; templates: number; history: number; skipped: number } {
  const b = raw as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b) || b.app !== 'prompt-converter') throw new ImportError('invalid');
  if (typeof b.schema === 'number' && b.schema > SCHEMA_VERSION) throw new ImportError('newer');
  const res = { settings: false, templates: 0, history: 0, skipped: 0 };
  if (b.settings && typeof b.settings === 'object' && !Array.isArray(b.settings)) {
    const cur = loadSettings();
    const inc = b.settings as Record<string, unknown>;
    const merged = sanitizeSettings({ ...cur, ...inc });
    const profs = new Map(cur.profiles.map((p) => [p.id, p]));
    merged.profiles.forEach((p) => profs.set(p.id, { ...p, apiKey: p.apiKey || profs.get(p.id)?.apiKey || '' }));
    saveSettings({ ...merged, apiKeys: { ...cur.apiKeys, ...strMap(inc.apiKeys) }, profiles: [...profs.values()] });
    res.settings = true;
  }
  if (b.templates !== undefined) {
    if (!Array.isArray(b.templates)) throw new ImportError('templates');
    const ok = sanitizeList(b.templates, sanitizeTemplate); res.skipped += b.templates.length - ok.length;
    const m = new Map(loadTemplates().map((t) => [t.id, t])); ok.forEach((t) => m.set(t.id, t));
    saveTemplates([...m.values()]); res.templates = ok.length;
  }
  if (b.history !== undefined) {
    if (!Array.isArray(b.history)) throw new ImportError('history');
    const ok = sanitizeList(b.history, sanitizeHistoryItem); res.skipped += b.history.length - ok.length;
    const m = new Map(loadHistory().map((h) => [h.id, h])); ok.forEach((h) => m.set(h.id, h));
    saveHistory([...m.values()].sort((a, c) => c.at - a.at)); res.history = ok.length;
  }
  return res;
}

// ---------- multi-tab sync ----------
/** Calls `cb(key)` whenever another tab/window changes one of our keys. Returns an unsubscribe function. */
export function onExternalChange(cb: (key: string) => void): () => void {
  const h = (e: StorageEvent) => { if (e.key === null || e.key.startsWith('pc.')) cb(e.key ?? '*'); };
  window.addEventListener('storage', h);
  return () => window.removeEventListener('storage', h);
}

/** Reads every store once so corruption is detected (and recovered) at startup rather than on first use. */
export function checkIntegrity(): string[] {
  loadSettings(); loadHistory(); loadTemplates();
  return health.recovered;
}
