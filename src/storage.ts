// All persistence is browser localStorage only. Nothing is sent anywhere except the LLM endpoint you configure.
const K = { settings: 'pc.settings.v1', history: 'pc.history.v1', templates: 'pc.templates.v1' };

export interface Settings {
  provider: string; baseUrl: string; model: string; apiKeys: Record<string, string>;
  mode: string; outLang: string; customLang: string; uiLang: 'zh' | 'en'; theme: 'light' | 'dark' | 'system'; stream: boolean;
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
  /** Keep API keys only for this browser session (sessionStorage) instead of localStorage. */
  sessionKeys: boolean;
  /** Show the local quality score panel. */
  showScore: boolean;
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
  profiles: [], activeProfile: '', variants: 1, render: 'md', timeoutSec: 60, sessionKeys: false, showScore: true,
};
export const HISTORY_MAX = 100;

function read<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } as T : d; } catch { return d; }
}
const readArr = <T>(k: string): T[] => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

const SESSION_KEYS = 'pc.keys.session';
export function loadSettings(): Settings {
  const s = read(K.settings, DEFAULT_SETTINGS);
  s.apiKeys = { ...(s.apiKeys || {}) }; s.profiles = Array.isArray(s.profiles) ? s.profiles : [];
  s.variants = Math.min(3, Math.max(1, Number(s.variants) || 1));
  if (s.sessionKeys) {
    try {
      const k = JSON.parse(sessionStorage.getItem(SESSION_KEYS) || '{}');
      s.apiKeys = { ...s.apiKeys, ...(k.apiKeys || {}) };
      s.profiles = s.profiles.map((p) => ({ ...p, apiKey: k.profiles?.[p.id] ?? p.apiKey }));
    } catch { /* ignore */ }
  }
  return s;
}
/** Persists settings. With `sessionKeys`, secrets go to sessionStorage and are stripped from localStorage. */
export function saveSettings(s: Settings) {
  if (!s.sessionKeys) { localStorage.setItem(K.settings, JSON.stringify(s)); sessionStorage.removeItem(SESSION_KEYS); return; }
  sessionStorage.setItem(SESSION_KEYS, JSON.stringify({ apiKeys: s.apiKeys, profiles: Object.fromEntries(s.profiles.map((p) => [p.id, p.apiKey])) }));
  localStorage.setItem(K.settings, JSON.stringify({ ...s, apiKeys: {}, profiles: s.profiles.map((p) => ({ ...p, apiKey: '' })) }));
}

export const loadHistory = (): HistoryItem[] => readArr<HistoryItem>(K.history);
const saveHistory = (h: HistoryItem[]) => localStorage.setItem(K.history, JSON.stringify(h));
/** Adds an item; favorites are never evicted by the size cap. */
export function addHistory(item: HistoryItem, max = HISTORY_MAX) {
  const h = [item, ...loadHistory()];
  let n = 0;
  saveHistory(h.filter((x) => x.fav || ++n <= max));
}
export function toggleFav(id: string): boolean {
  const h = loadHistory(); const it = h.find((x) => x.id === id); if (!it) return false;
  it.fav = !it.fav; saveHistory(h); return it.fav;
}
export const deleteHistory = (id: string) => saveHistory(loadHistory().filter((x) => x.id !== id));
/** Clears history but keeps favorites. */
export const clearHistory = () => { const f = loadHistory().filter((x) => x.fav); f.length ? saveHistory(f) : localStorage.removeItem(K.history); };

export const loadTemplates = (): Template[] => readArr<Template>(K.templates);
export const saveTemplates = (t: Template[]) => localStorage.setItem(K.templates, JSON.stringify(t));
export function upsertTemplate(t: Template) {
  const all = loadTemplates(); const i = all.findIndex((x) => x.id === t.id);
  if (i >= 0) all[i] = t; else all.push(t);
  saveTemplates(all);
}
export const deleteTemplate = (id: string) => saveTemplates(loadTemplates().filter((x) => x.id !== id));

// ---- Import / export ----
export interface Backup { app: 'prompt-converter'; version: string; exportedAt: string; settings?: Partial<Settings>; templates?: Template[]; history?: HistoryItem[] }
export function exportData(version: string, opts: { settings: boolean; templates: boolean; history: boolean; keys: boolean }): Backup {
  const b: Backup = { app: 'prompt-converter', version, exportedAt: new Date().toISOString() };
  if (opts.settings) { const s: Partial<Settings> = { ...loadSettings() }; if (!opts.keys) { delete s.apiKeys; s.profiles = (s.profiles || []).map((p) => ({ ...p, apiKey: '' })); } b.settings = s; }
  if (opts.templates) b.templates = loadTemplates();
  if (opts.history) b.history = loadHistory();
  return b;
}
/** Merges a backup into local storage. Templates/history are merged by id (imported wins). Returns counts. */
export function importData(raw: unknown): { settings: boolean; templates: number; history: number } {
  const b = raw as Backup;
  if (!b || typeof b !== 'object' || b.app !== 'prompt-converter') throw new Error('invalid');
  const res = { settings: false, templates: 0, history: 0 };
  if (b.settings && typeof b.settings === 'object') {
    const cur = loadSettings();
    const inc = b.settings;
    const profs = new Map(cur.profiles.map((p) => [p.id, p]));
    (Array.isArray(inc.profiles) ? inc.profiles : []).forEach((p) => p?.id && profs.set(p.id, { ...p, apiKey: p.apiKey || profs.get(p.id)?.apiKey || '' }));
    saveSettings({ ...cur, ...inc, apiKeys: { ...cur.apiKeys, ...(inc.apiKeys || {}) }, profiles: [...profs.values()] });
    res.settings = true;
  }
  if (Array.isArray(b.templates)) {
    const ok = b.templates.filter((t) => t && t.id && t.name && typeof t.prompt === 'string');
    const m = new Map(loadTemplates().map((t) => [t.id, t])); ok.forEach((t) => m.set(t.id, t));
    saveTemplates([...m.values()]); res.templates = ok.length;
  }
  if (Array.isArray(b.history)) {
    const ok = b.history.filter((h) => h && h.id && typeof h.input === 'string' && typeof h.output === 'string');
    const m = new Map(loadHistory().map((h) => [h.id, h])); ok.forEach((h) => m.set(h.id, h));
    saveHistory([...m.values()].sort((a, b) => b.at - a.at)); res.history = ok.length;
  }
  return res;
}
