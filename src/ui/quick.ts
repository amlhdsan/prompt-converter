// Compact quick-convert window (desktop floating window; also reachable on the web via #quick).
import { hideQuick, modKey, readClipboard, showMain } from '../platform';
import { $, copyText, esc, fmt } from './dom';
import { allModes, convert } from './actions';
import { icons } from './icons';
import { out, persist, rerender, st, t } from './state';
import { renderOutput } from './output';
import { openSettings } from './dialogs/settings';

export function renderQuick() {
  const d = t();
  const modes = allModes();
  $('#app').innerHTML = `
  <div class="quick-wrap" data-tauri-drag-region>
    <div class="quick-bar" data-tauri-drag-region>
      <span class="logo" aria-hidden="true">${icons.mark}</span><strong data-tauri-drag-region>${d.quickTitle}</strong>
      <select id="q-mode" aria-label="${d.mode}">${modes.map((m) => `<option value="${esc(m.id)}" ${st.s.mode === m.id ? 'selected' : ''}>${esc(m.icon)} ${esc(m.label)}</option>`).join('')}</select>
      <span class="grow" data-tauri-drag-region></span>
      <button class="ghost small" id="q-paste">${d.pasteClip}</button>
      <button class="ghost small" id="q-main">${d.openMain}</button>
      <button class="icon tiny" id="q-hide" aria-label="${d.close}">${icons.x}</button>
    </div>
    <textarea id="input" class="q-input" spellcheck="false" aria-label="${esc(d.original)}" placeholder="${esc(d.placeholder)}">${esc(st.input)}</textarea>
    <div class="q-out ${st.busy ? 'busy' : ''}"><div id="output-wrap" aria-live="polite" aria-busy="${st.busy}">${renderOutput()}</div></div>
    ${st.error ? `<div class="error small" role="alert">⚠️ ${esc(st.error)}</div>` : ''}
    <div class="quick-foot">
      <span class="muted small">${fmt(d.quickHint, { m: modKey })}</span>
      <span class="row">
        <button class="primary soft" id="btn-copy" ${out() ? '' : 'disabled'}>${icons.copy}<span>${d.copy}</span></button>
        <button class="primary" id="btn-convert">${st.busy ? `<span class="spin"></span>${d.stop}` : d.convert.replace('✨ ', '')}</button>
      </span>
    </div>
  </div>
  <div id="modal-root"></div>
  <div id="toast" role="status" aria-live="polite"></div>`;
  const ta = $<HTMLTextAreaElement>('#input');
  ta.addEventListener('input', () => { st.input = ta.value; });
  $('#btn-convert').addEventListener('click', () => convert(openSettings));
  $('#btn-copy').addEventListener('click', () => out() && copyText(out()));
  $('#q-paste').addEventListener('click', () => pasteClipboard(true));
  $('#q-main').addEventListener('click', () => showMain());
  $('#q-hide').addEventListener('click', () => hideQuick());
  $<HTMLSelectElement>('#q-mode').addEventListener('change', (e) => { st.s.mode = (e.target as HTMLSelectElement).value; persist(); });
}

export async function pasteClipboard(force = false) {
  try {
    const clip = (await readClipboard()).trim();
    if (clip && (force || clip !== out())) { st.input = clip; st.outputs = []; st.error = ''; rerender(); }
  } catch { /* clipboard unavailable */ }
  const ta = $<HTMLTextAreaElement>('#input'); ta?.focus(); ta?.select();
}
