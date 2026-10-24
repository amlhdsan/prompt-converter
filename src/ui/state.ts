// Shared UI state + tiny render bus. Modules mutate `st` and call `rerender()`.
import { DICT, type Dict } from '../i18n';
import { loadSettings, saveSettings, type Settings } from '../storage';
import type { UpdateInfo } from '../update';

export type View = 'single' | 'compare' | 'diff';
export const st = {
  s: loadSettings() as Settings,
  input: '',
  /** One entry per generated variant. */
  outputs: [] as string[],
  active: 0,
  busy: false,
  /** What the current request is doing (for button labels). */
  task: '' as '' | 'convert' | 'refine',
  view: 'single' as View,
  ctrl: null as AbortController | null,
  error: '',
  update: null as UpdateInfo | null,
  shared: false,
  /** Transient status line (retrying, stalled stream…). */
  notice: '',
  /** Set when the global error boundary caught something. */
  crashed: null as null | { msg: string },
};
/** Content language for data that only exists in zh/en (examples, provider notes). */
export const lang2 = (): 'zh' | 'en' => (st.s.uiLang === 'zh' ? 'zh' : 'en');
export const out = () => st.outputs[st.active] ?? '';
export const t = (): Dict => DICT[st.s.uiLang];
export const persist = () => saveSettings(st.s);
/** Re-read settings written by another window/tab, keeping the UI language of this one. */
export const reloadSettings = () => { const ui = st.s.uiLang; st.s = loadSettings(); st.s.uiLang = ui; };

let renderFn: () => void = () => {};
export const onRender = (fn: () => void) => { renderFn = fn; };
export const rerender = () => renderFn();
