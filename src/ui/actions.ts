// Core actions: modes, convert (with variants), refine, test-run, error messages.
import { chat, LLMError, type ChatMessage } from '../llm';
import { buildMessages, buildRefine, MODES, MODE_HINTS, type Mode } from '../prompts';
import { providerById, needsKey } from '../providers';
import { addHistory, loadTemplates, recordUsage } from '../storage';
import { estimateCost, estimateTokens } from '../lib/tokens';
import { demoOutput, fakeStream } from '../lib/demo';
import type { UsageKind } from '../lib/stats';
import { isDesktop, isQuick, pasteBack, showMain } from '../platform';
import { $, copyText, fmt, toast, uid } from './dom';
import { lang2, out, persist, reloadSettings, rerender, st, t } from './state';

export const modeIcon: Record<Mode, string> = { general: '🧭', coding: '💻', writing: '✍️', analysis: '🔬', image: '🎨' };
export interface ModeOpt { id: string; label: string; icon: string; hint: string; custom: boolean }
export function allModes(): ModeOpt[] {
  const d = t();
  return [
    ...MODES.map((m) => ({ id: m, label: d.modes[m], icon: modeIcon[m], hint: st.s.modeHints[m]?.trim() || MODE_HINTS[m], custom: false })),
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
  return { baseUrl: st.s.baseUrl, model: st.s.model, apiKey: st.s.apiKeys[st.s.provider] || '', kind: p.kind, stream: st.s.stream, timeoutMs: Math.max(5, st.s.timeoutSec || 60) * 1000, retries: st.s.retries };
}
/** Returns false (and guides the user) when a key is required but missing. */
export function ensureKey(openSettings: () => void): boolean {
  const p = providerById(st.s.provider);
  if (!needsKey(p) || st.s.apiKeys[st.s.provider]) return true;
  st.error = t().err.noKey; rerender();
  if (isQuick) { if (isDesktop) showMain(); } else openSettings();
  return false;
}
export const strip = (x: string) => x.replace(/^```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();

/** Demo mode is active when the user chose it and has no usable key. */
export const inDemo = () => st.s.demo && needsKey(providerById(st.s.provider)) && !st.s.apiKeys[st.s.provider];

/** Records a usage event for the statistics dashboard (local only). */
export function track(kind: UsageKind, messages: ChatMessage[], output: string, t0: number, ok: boolean, model = st.s.model) {
  if (!st.s.stats || inDemo()) return;
  const inTok = estimateTokens(messages.map((m) => m.content).join('\n'));
  const outTok = estimateTokens(output);
  const local = !!providerById(st.s.provider).noKey;
  try { recordUsage({ at: Date.now(), kind, model, inTok, outTok, cost: estimateCost(model, inTok, outTok, local), ms: Math.round(performance.now() - t0), ok }); } catch { /* stats are best-effort */ }
}

async function run(build: (i: number) => ChatMessage[], n: number, saveInput: string, kind: UsageKind = 'convert') {
  st.busy = true; st.error = ''; st.outputs = Array(n).fill(''); st.active = 0; st.ctrl = new AbortController(); st.startedAt = performance.now(); rerender();
  const base = reqBase();
  const signal = st.ctrl.signal;
  const t0 = performance.now();
  const demo = inDemo();
  const results = await Promise.allSettled(Array.from({ length: n }, (_, i) => demo
    ? fakeStream(demoOutput(st.s.mode, lang2()), (txt) => { st.outputs[i] = txt; if (i === st.active) updateOutputLive(); else updateVariantTabs(); }, signal).catch((e) => { throw (e as Error).name === 'AbortError' ? new LLMError('aborted', 'aborted') : e; })
    : chat({
    ...base, signal, messages: build(i), temperature: n > 1 ? 0.4 + i * 0.3 : 0.4,
    onRetry: (a, m) => { st.notice = fmt(t().retrying, { n: a, m }); noticeHook(); },
    onDelta: (txt) => { st.outputs[i] = txt; if (i === st.active) updateOutputLive(); else updateVariantTabs(); },
  }).then((r) => { track(kind, build(i), r, t0, true); return r; }, (e) => { if (!(e instanceof LLMError && e.kind === 'aborted')) track(kind, build(i), '', t0, false); throw e; })));
  let ok = 0;
  st.notice = '';
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { st.outputs[i] = strip(r.value); ok++; return; }
    const e = r.reason;
    // Keep whatever arrived before a stall / abort so the user doesn't lose it.
    if (e instanceof LLMError && e.partial) { st.outputs[i] = e.partial; if (e.kind === 'timeout') st.notice = t().stalled; }
    if (!(e instanceof LLMError && e.kind === 'aborted') && !(e instanceof LLMError && e.partial && e.kind === 'timeout') && !st.error) st.error = errorMessage(e);
  });
  if (!ok && st.outputs.some(Boolean)) st.active = Math.max(0, st.outputs.findIndex(Boolean));
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
  if (!inDemo() && !ensureKey(openSettings)) return;
  const mode = currentMode();
  const n = isQuick ? 1 : st.s.variants;
  st.task = 'convert';
  const ok = await run(() => buildMessages(st.input, mode.hint, st.s.outLang, st.s.customLang), n, st.input);
  rerender();
  if (ok && !isQuick && (st.s.autoCopy || st.copyNext)) { st.copyNext = false; await copyText(out()); }
  if (ok && isQuick && st.s.quickAutoCopy) {
    await copyText(out(), true);
    if (isDesktop && st.s.autoPaste) { pasteBack().catch((e) => { st.error = String(e); rerender(); }); return; }
    toast(t().copied);
  }
}

export async function refine(instruction: string, openSettings: () => void) {
  if (st.busy || !out() || !instruction.trim()) return;
  reloadSettings();
  if (!inDemo() && !ensureKey(openSettings)) return;
  const prev = out(); const mode = currentMode();
  st.task = 'refine';
  await run(() => buildRefine(st.input, prev, instruction.trim(), mode.hint, st.s.outLang, st.s.customLang), 1, st.input, 'refine');
  rerender();
}

// Live streaming updates without a full re-render (keeps focus/scroll).
let liveHook: () => void = () => {};
let tabsHook: () => void = () => {};
let noticeHook: () => void = () => {};
export const setNoticeHook = (fn: () => void) => { noticeHook = fn; };
export const setLiveHooks = (live: () => void, tabs: () => void) => { liveHook = live; tabsHook = tabs; };
const updateOutputLive = () => liveHook();
const updateVariantTabs = () => tabsHook();
