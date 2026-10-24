// Shortcuts help, example library, test-run preview.
import { chat, LLMError } from '../../llm';
import { buildTestRun } from '../../prompts';
import { EXAMPLES } from '../../lib/library';
import { renderMarkdown } from '../../lib/markdown';
import { isDesktop, modKey, prettyAccel } from '../../platform';
import { closeModal, copyText, esc, modal } from '../dom';
import { ensureKey, errorMessage, modeLabel, reqBase } from '../actions';
import { icons } from '../icons';
import { out, persist, st, t } from '../state';
import { openSettings } from './settings';

export function openShortcuts() {
  const d = t();
  const k = (...keys: string[]) => keys.map((x) => `<kbd>${esc(x)}</kbd>`).join('<span class="plus">+</span>');
  const rows: [string, string][] = [
    [k(modKey, 'Enter'), d.keys.convert],
    [k(modKey, 'Shift', 'C'), d.keys.copy],
    [k(modKey, 'Shift', 'R'), d.testRun],
    [k(modKey, ','), d.keys.settings],
    [k(modKey, 'Shift', 'H'), d.keys.history],
    [k(modKey, 'Shift', 'T'), d.keys.templates],
    [k(modKey, 'Shift', 'E'), d.library],
    [k('Alt', '1…9'), d.keys.mode],
    [k('?'), d.keys.help],
    [k('Esc'), d.keys.esc],
    [isDesktop ? k(...prettyAccel(st.s.hotkey).split(' + ')) : k(modKey, 'Shift', 'Space'), d.keys.global],
  ];
  modal(d.shortcuts, `<table class="keys" id="keys-table"><caption class="sr-only">${d.shortcuts}</caption>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`, () => {});
}

export function openLibrary(onPick: () => void) {
  const d = t(); const lang = st.s.uiLang;
  modal(d.library, `<p class="small muted">${d.libraryHint}</p>
    <div class="lib" role="list">${EXAMPLES.map((x) => `
      <button class="lib-item" data-ex="${x.id}" role="listitem">
        <span class="badge">${esc(modeLabel(x.mode).icon)} ${esc(modeLabel(x.mode).label)}</span>
        <strong>${esc(x[lang].t)}</strong><span class="small muted">${esc(x[lang].p)}</span>
      </button>`).join('')}</div>`, (root) => {
    root.querySelectorAll<HTMLElement>('[data-ex]').forEach((b) => b.addEventListener('click', () => {
      const ex = EXAMPLES.find((x) => x.id === b.dataset.ex)!;
      st.input = ex[lang].p; st.s.mode = ex.mode; st.outputs = []; st.error = ''; persist(); closeModal(); onPick();
    }));
  }, 'wide');
}

export function openTestRun() {
  const d = t();
  const prompt = out(); if (!prompt) return;
  if (!ensureKey(openSettings)) return;
  let ctrl: AbortController | null = null;
  let answer = '';
  modal(d.testRunTitle, `
    <p class="small muted">${d.testRunHint}</p>
    <div class="tr-out md" id="tr-out" aria-live="polite" aria-busy="true"></div>
    <div class="row between"><span class="small muted" id="tr-status"></span>
      <span class="row"><button class="ghost" id="tr-copy" disabled>${icons.copy} ${d.copy}</button><button class="primary" id="tr-run">${d.stop}</button></span></div>`, (root) => {
    const box = root.querySelector('#tr-out') as HTMLElement;
    const btn = root.querySelector('#tr-run') as HTMLButtonElement;
    const status = root.querySelector('#tr-status')!;
    const copyB = root.querySelector('#tr-copy') as HTMLButtonElement;
    copyB.addEventListener('click', () => copyText(answer));
    const go = async () => {
      if (ctrl) { ctrl.abort(); return; }
      ctrl = new AbortController(); answer = ''; btn.textContent = d.stop; status.innerHTML = `<span class="spin"></span>${d.converting}`; box.setAttribute('aria-busy', 'true');
      try {
        answer = await chat({ ...reqBase(), signal: ctrl.signal, messages: buildTestRun(prompt), temperature: 0.7, onDelta: (txt) => { if (!box.isConnected) { ctrl?.abort(); return; } answer = txt; box.innerHTML = renderMarkdown(txt); box.scrollTop = box.scrollHeight; } });
        box.innerHTML = renderMarkdown(answer); status.textContent = `${answer.length} ${d.chars} · ${esc(st.s.model)}`;
      } catch (e) {
        status.textContent = e instanceof LLMError && e.kind === 'aborted' ? d.err.aborted : errorMessage(e);
      } finally { ctrl = null; btn.textContent = d.rerun; copyB.disabled = !answer; box.setAttribute('aria-busy', 'false'); }
    };
    btn.addEventListener('click', go);
    root.querySelector('[data-close]')!.addEventListener('click', () => ctrl?.abort(), { capture: true });
    go();
  }, 'wide');
}
