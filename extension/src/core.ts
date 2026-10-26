// Shared conversion core for the extension: reuses the web app's prompts, providers and LLM client.
import { chat } from '../../src/llm';
import { buildMessages, MODE_HINTS, type Mode } from '../../src/prompts';
import { providerById } from '../../src/providers';

export interface ExtSettings { provider: string; baseUrl: string; model: string; apiKey: string; mode: Mode; lang: string }
export const DEFAULTS: ExtSettings = { provider: 'openai', baseUrl: providerById('openai').baseUrl, model: providerById('openai').model, apiKey: '', mode: 'general', lang: 'auto' };

export async function loadSettings(): Promise<ExtSettings> {
  const r = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(r.settings ?? {}) };
}
export const saveSettings = (s: ExtSettings) => chrome.storage.local.set({ settings: s });

const strip = (x: string) => x.replace(/^```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();

export async function convert(text: string, s?: ExtSettings, onDelta?: (t: string) => void): Promise<string> {
  const cfg = s ?? (await loadSettings());
  const p = providerById(cfg.provider);
  if (!cfg.apiKey && !p.noKey && p.id !== 'custom') throw new Error('NO_KEY');
  const messages = buildMessages(text, MODE_HINTS[cfg.mode] ?? MODE_HINTS.general, cfg.lang);
  const out = await chat({ baseUrl: cfg.baseUrl || p.baseUrl, apiKey: cfg.apiKey, model: cfg.model || p.model, kind: p.kind, messages, stream: !!onDelta, onDelta, retries: 1 });
  return strip(out);
}
