// Core actions: modes, convert (with variants), refine, test-run, error messages.
import { chat, LLMError, type ChatMessage } from '../llm';
import { buildMessages, buildRefine, MODES, MODE_HINTS, type Mode } from '../prompts';
import { providerById, needsKey } from '../providers';
import { addHistory, loadTemplates } from '../storage';
import { isDesktop, isQuick, pasteBack, showMain } from '../platform';
import { $, copyText, fmt, toast, uid } from './dom';
import { out, persist, reloadSettings, rerender, st, t } from './state';

export const modeIcon: Record<Mode, string> = { general: '🧭', coding: '💻', writing: '✍️', analysis: '🔬', image: '🎨' };
export interface ModeOpt { id: string; label: string; icon: string; hint: string; custom: boolean }
export function allModes(): ModeOpt[] {
  const d = t();
  return [
    ...MODES.map((m) => ({ id: m, label: d.modes[m], icon: modeIcon[m], hint: MODE_HINTS[m], custom: false })),
    ...loadTemplates().map((x) => ({ id: 'tpl:' + x.id, label: x.name, icon: x.icon || '⭐', hint: x.prompt, custom: true })),
  ];
}
export const currentMode = (): ModeOpt => { const all = allModes(); return all.find((m) => m.id === st.s.mode) ?? all[0]; };
export const modeLabel = (id: string) => allModes().find((m) => m.id === id) ?? { label: id, icon: '' };
export const setMode = (id: string) => { st.s.mode = id; persist(); rerender(); };

export function errorMessage(e: unknown): string {
  const d = t();
  if (e instanceof LLMError) {
    const retry = e.retryAfter ? ` · ${fmt(d.err.retryIn, { s: e.retryAfter })}` : '';
    if (e.kind === 'http') return `${d.err.http} — ${e.message}`;
    if (e.kind === 'auth' && e.status) return `${d.err.auth} (${e.message})`;
    if (e.kind === 'auth') return d.err.noKey;
    if (e.kind === 'rate' || e.kind === 'server') return `${d.err[e.kind]}${retry}${e.message ? ` (${e.message})` : ''}`;
    return d.err[e.kind];
  }
  return String((e as Error)?.message ?? e);
}

/** Common request options from current settings. */
export function reqBase() {
  const p = providerById(st.s.provider);
  return { baseUrl: st.s.baseUrl, model: st.s.model, apiKey: st.s.apiKeys[st.s.provider] || '', kind: p.kind, stream: st.s.stream, timeoutMs: Math.max(5, st.s.timeoutSec || 60) * 1000 };
}
/** Returns false (and guides the user) when a key is required but missing. */
export function ensureKey(openSettings: () => void): boolean {
  const p = providerById(st.s.provider);
  if (!needsKey(p) || st.s.apiKeys[st.s.provider]) return true;
  st.error = t().err.noKey; rerender();
  if (isQuick) { if (isDesktop) showMain(); } else openSettings();
  return false;
}
const strip = (x: string) => x.replace(/^```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();

async function run(build: (i: number) => ChatMessage[], n: number, saveInput: string) {
  st.busy = true; st.error = ''; st.outputs = Array(n).fill(''); st.active = 0; st.ctrl = new AbortController(); rerender();
  const base = reqBase();
  const signal = st.ctrl.signal;
  const results = await Promise.allSettled(Array.from({ length: n }, (_, i) => chat({
    ...base, signal, messages: build(i), temperature: n > 1 ? 0.4 + i * 0.3 : 0.4,
    onDelta: (txt) => { st.outputs[i] = txt; if (i === st.active) updateOutputLive(); else updateVariantTabs(); },
  })));
  let ok = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { st.outputs[i] = strip(r.value); ok++; }
    else if (!(r.reason instanceof LLMError && r.reason.kind === 'aborted') && !st.error) st.error = errorMessage(r.reason);
  });
  const firstOk = results.findIndex((r) => r.status === 'fulfilled');
  if (firstOk >= 0) st.active = firstOk;
  if (ok) {
    if (n > 1) st.outputs = st.outputs.map((o, i) => (results[i].status === 'fulfilled' ? o : '')).filter((o, i) => o || i === st.active);
    addHistory({ id: uid(), at: Date.now(), mode: st.s.mode, input: saveInput, output: out(), model: st.s.model });
    if (ok === n) st.error = '';
  }
  st.busy = false; st.ctrl = null; st.task = '';
  return ok > 0;
}

export async function convert(openSettings: () => void) {
  if (st.busy) { st.ctrl?.abort(); return; }
  reloadSettings(); // pick up changes made in another window (desktop)
  if (!st.input.trim()) { toast(t().inputEmpty); $('#input')?.focus(); return; }
  if (!ensureKey(openSettings)) return;
  const mode = currentMode();
  const n = isQuick ? 1 : st.s.variants;
  st.task = 'convert';
  const ok = await run(() => buildMessages(st.input, mode.hint, st.s.outLang, st.s.customLang), n, st.input);
  rerender();
  if (ok && isQuick && st.s.quickAutoCopy) {
    await copyText(out(), true);
    if (isDesktop && st.s.autoPaste) { pasteBack().catch((e) => { st.error = String(e); rerender(); }); return; }
    toast(t().copied);
  }
}

export async function refine(instruction: string, openSettings: () => void) {
  if (st.busy || !out() || !instruction.trim()) return;
  reloadSettings();
  if (!ensureKey(openSettings)) return;
  const prev = out(); const mode = currentMode();
  st.task = 'refine';
  await run(() => buildRefine(st.input, prev, instruction.trim(), mode.hint, st.s.outLang, st.s.customLang), 1, st.input);
  rerender();
}

// Live streaming updates without a full re-render (keeps focus/scroll).
let liveHook: () => void = () => {};
let tabsHook: () => void = () => {};
export const setLiveHooks = (live: () => void, tabs: () => void) => { liveHook = live; tabsHook = tabs; };
const updateOutputLive = () => liveHook();
const updateVariantTabs = () => tabsHook();
