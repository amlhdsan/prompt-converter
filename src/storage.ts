// All persistence is browser localStorage only. Nothing is sent anywhere except the LLM endpoint you configure.
const K = { settings: 'pc.settings.v1', history: 'pc.history.v1' };

export interface Settings {
  provider: string; baseUrl: string; model: string; apiKeys: Record<string, string>;
  mode: string; outLang: string; uiLang: 'zh' | 'en'; theme: 'light' | 'dark' | 'system'; stream: boolean;
}
export interface HistoryItem { id: string; at: number; mode: string; input: string; output: string; model: string }

export const DEFAULT_SETTINGS: Settings = {
  provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKeys: {},
  mode: 'general', outLang: 'auto', uiLang: 'zh', theme: 'system', stream: true,
};

function read<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } as T : d; } catch { return d; }
}
export const loadSettings = (): Settings => read(K.settings, DEFAULT_SETTINGS);
export const saveSettings = (s: Settings) => localStorage.setItem(K.settings, JSON.stringify(s));

export function loadHistory(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(K.history) || '[]'); } catch { return []; }
}
export function addHistory(item: HistoryItem, max = 30) {
  const h = [item, ...loadHistory()].slice(0, max);
  localStorage.setItem(K.history, JSON.stringify(h));
}
export const clearHistory = () => localStorage.removeItem(K.history);
