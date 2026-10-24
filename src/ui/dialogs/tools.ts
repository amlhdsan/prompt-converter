// Batch convert, placeholder fill, command palette, mode-hint editor, error log and crash screen.
import { chat, LLMError } from '../../llm';
import { buildMessages, MODES, MODE_HINTS, type Mode } from '../../prompts';
import { addHistory, loadHistory } from '../../storage';
import { APP_VERSION } from '../../update';
import { clearErrors, formatErrors, getErrors } from '../../lib/errlog';
import { splitBatch, runPool } from '../../lib/batch';
import { toMarkdown } from '../../lib/export';
import { fillPlaceholders, findPlaceholders } from '../../lib/placeholders';
import { closeModal, copyText, download, esc, fmt, modal, toast, uid } from '../dom';
import { allModes, currentMode, ensureKey, errorMessage, modeLabel, reqBase, strip } from '../actions';
import { icons } from '../icons';
import { out, persist, rerender, st, t } from '../state';
import { openSettings } from './settings';

// ---------- Batch convert ----------
let batchText = '';
export function openBatch() {
  const d = t();
  if (!ensureKey(openSettings)) return;
  let ctrl: AbortController | null = null;
  let results: { input: string; output: string; error?: string }[] = [];
  const mode = currentMode();
  modal(d.batch, `
    <p class="small muted">${d.batchHint}</p>
    <div class="small"><span class="badge">${esc(mode.icon)} ${esc(mode.label)}</span> <span class="muted">${esc(st.s.model)}</span></div>
    <textarea id="b-input" rows="7" spellcheck="false" placeholder="${esc(d.placeholder)}">${esc(batchText)}</textarea>
    <div class="row between wrap"><span class="small muted" id="b-status" aria-live="polite"></span>
      <span class="row"><button class="ghost" id="b-copy" disabled>${icons.copy} ${d.batchCopyAll}</button><button class="ghost" id="b-export" disabled>${icons.download} ${d.batchExport}</button><button class="primary" id="b-run">${d.batchRun}</button></span></div>
    <div class="batch-list" id="b-list" role="list"></div>`, (root) => {
    const ta = root.querySelector('#b-input') as HTMLTextAreaElement;
    const status = root.querySelector('#b-status')!;
    const list = root.querySelector('#b-list')!;
    const run = root.querySelector('#b-run') as HTMLButtonElement;
    const copyB = root.querySelector('#b-copy') as HTMLButtonElement;
    const expB = root.querySelector('#b-export') as HTMLButtonElement;
    const count = () => { const n = splitBatch(ta.value).length; if (!ctrl) status.textContent = n ? fmt(d.batchCount, { n }) : ''; };
    ta.addEventListener('input', () => { batchText = ta.value; count(); });
    count();
    const draw = () => {
      list.innerHTML = results.map((r, i) => `<div class="batch-item${r.error ? ' failed' : ''}" role="listitem" data-b="${i}">
        <div class="row between"><strong class="small">${i + 1}. ${esc(r.input.slice(0, 80))}</strong>
          ${r.output ? `<button class="icon tiny" data-bcopy="${i}" aria-label="${d.copy}" title="${d.copy}">${icons.copy}</button>` : ''}</div>
        <div class="small ${r.error ? 'err' : 'muted'} batch-out">${r.error ? '⚠️ ' + esc(r.error) : r.output ? esc(r.output.slice(0, 400)) : '<span class="spin"></span>'}</div></div>`).join('');
    };
    list.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-bcopy]'); if (b) copyText(results[Number(b.dataset.bcopy)].output); });
    const md = () => toMarkdown(d.batch, results.filter((r) => r.output).map((r) => ({ input: r.input, output: r.output, mode: mode.id, model: st.s.model })), { original: d.original, converted: d.converted }, (id) => modeLabel(id).label);
    copyB.addEventListener('click', () => copyText(results.filter((r) => r.output).map((r) => r.output).join('\n\n---\n\n')));
    expB.addEventListener('click', () => download('batch.md', md(), 'text/markdown'));
    run.addEventListener('click', async () => {
      if (ctrl) { ctrl.abort(); return; }
      const items = splitBatch(ta.value);
      if (!items.length) { status.textContent = d.batchEmpty; ta.focus(); return; }
      ctrl = new AbortController(); const signal = ctrl.signal;
      results = items.map((input) => ({ input, output: '' }));
      run.textContent = d.stop; copyB.disabled = expB.disabled = true; draw();
      let ok = 0; const base = reqBase();
      status.textContent = fmt(d.batchDone, { ok, n: items.length });
      await runPool(items, 2, async (input, i) => {
        try {
          const r = strip(await chat({ ...base, stream: false, signal, messages: buildMessages(input, mode.hint, st.s.outLang, st.s.customLang) }));
          if (!r) throw new LLMError('empty', 'empty');
          results[i].output = r; ok++;
          addHistory({ id: uid(), at: Date.now(), mode: mode.id, input, output: r, model: st.s.model });
        } catch (e) { results[i].error = e instanceof LLMError && e.kind === 'aborted' ? '—' : errorMessage(e); }
        status.textContent = fmt(d.batchDone, { ok, n: items.length }); draw();
      }, signal);
      results.forEach((r) => { if (!r.output && !r.error) r.error = '—'; });
      draw(); ctrl = null; run.textContent = d.batchRun; copyB.disabled = expB.disabled = !ok;
      status.textContent = fmt(d.batchDone, { ok, n: items.length });
    });
    ta.focus();
  }, 'wide');
}

// ---------- History → Markdown ----------
export function exportHistoryMd() {
  const d = t();
  const md = toMarkdown(d.history, loadHistory(), { original: d.original, converted: d.converted }, (id) => modeLabel(id).label);
  download(`prompt-history-${new Date().toISOString().slice(0, 10)}.md`, md, 'text/markdown');
}

// ---------- Placeholder fill ----------
export function openFill() {
  const d = t();
  const ph = findPlaceholders(out());
  if (!ph.length) return;
  modal(d.fillTitle, `<p class="small muted">${d.fillHint}</p>
    <form class="form" id="fill-form">${ph.map((p, i) => `<label>${esc(p.label)}${p.count > 1 ? ` <span class="muted small">×${p.count}</span>` : ''}<input data-ph="${i}" autocomplete="off" spellcheck="false"/></label>`).join('')}
    <div class="row end"><button class="ghost" type="button" data-close>${d.cancel}</button><button class="primary" type="submit">${d.fillApply}</button></div></form>`, (root) => {
    root.querySelector('#fill-form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const vals: Record<string, string> = {};
      root.querySelectorAll<HTMLInputElement>('[data-ph]').forEach((inp) => { vals[ph[Number(inp.dataset.ph)].text] = inp.value; });
      st.outputs[st.active] = fillPlaceholders(out(), vals);
      closeModal();
    });
    (root.querySelector('[data-ph]') as HTMLElement)?.focus();
  });
}

// ---------- Built-in mode instructions ----------
export function openModeHints(focus: Mode = 'general') {
  const d = t();
  let cur: Mode = focus;
  const custom = (m: Mode) => !!st.s.modeHints[m]?.trim() && st.s.modeHints[m].trim() !== MODE_HINTS[m];
  modal(d.builtinModes, `<p class="small muted">${d.modeHintHelp}</p>
    <div class="seg scroll" role="tablist" id="mh-tabs">${MODES.map((m) => `<button role="tab" data-mh="${m}">${esc(d.modes[m])}<span class="dot" hidden>•</span></button>`).join('')}</div>
    <textarea id="mh-text" rows="9" spellcheck="false" aria-label="${esc(d.builtinModes)}"></textarea>
    <div class="row between"><span class="small muted" id="mh-state"></span>
      <span class="row"><button class="ghost" id="mh-reset">${d.resetDefault}</button><button class="primary" id="mh-save">${d.save}</button></span></div>`, (root) => {
    const ta = root.querySelector('#mh-text') as HTMLTextAreaElement;
    const draw = () => {
      root.querySelectorAll<HTMLElement>('[data-mh]').forEach((b) => { const m = b.dataset.mh as Mode; b.className = m === cur ? 'on' : ''; b.setAttribute('aria-selected', String(m === cur)); (b.querySelector('.dot') as HTMLElement).hidden = !custom(m); });
      ta.value = st.s.modeHints[cur]?.trim() || MODE_HINTS[cur];
      root.querySelector('#mh-state')!.textContent = custom(cur) ? d.customized : '';
    };
    const save = () => { const v = ta.value.trim(); if (!v || v === MODE_HINTS[cur]) delete st.s.modeHints[cur]; else st.s.modeHints[cur] = v; st.s.modeHints = { ...st.s.modeHints }; persist(); };
    root.querySelectorAll<HTMLElement>('[data-mh]').forEach((b) => b.addEventListener('click', () => { save(); cur = b.dataset.mh as Mode; draw(); }));
    root.querySelector('#mh-reset')!.addEventListener('click', () => { delete st.s.modeHints[cur]; persist(); draw(); });
    root.querySelector('#mh-save')!.addEventListener('click', () => { save(); draw(); toast(d.hintSaved); });
    draw(); ta.focus();
  }, 'wide');
}

// ---------- Error log ----------
export function openErrorLog() {
  const d = t();
  const list = getErrors();
  modal(d.viewLog, `${list.length ? `<pre class="errlog" id="log-pre" tabindex="0">${esc(formatErrors(list, APP_VERSION))}</pre>` : `<div class="placeholder">${d.logEmpty}</div>`}
    <div class="row end"><button class="ghost danger" id="log-clear" ${list.length ? '' : 'disabled'}>${d.clearLog}</button><button class="primary" id="log-copy" ${list.length ? '' : 'disabled'}>${icons.copy} ${d.copyLog}</button></div>`, (root) => {
    root.querySelector('#log-copy')!.addEventListener('click', async () => { await copyText(formatErrors(getErrors(), APP_VERSION), true); toast(d.logCopied); });
    root.querySelector('#log-clear')!.addEventListener('click', () => { clearErrors(); openErrorLog(); });
  }, 'wide');
}

// ---------- Command palette ----------
export interface Command { id: string; label: string; hint?: string; run: () => void }
export function openPalette(commands: Command[]) {
  const d = t();
  let sel = 0; let shown = commands;
  modal(d.palette, `<input id="cp-input" type="search" role="combobox" aria-expanded="true" aria-controls="cp-list" aria-autocomplete="list" placeholder="${esc(d.paletteHint)}" autocomplete="off" spellcheck="false"/>
    <div class="palette" id="cp-list" role="listbox"></div>`, (root) => {
    const inp = root.querySelector('#cp-input') as HTMLInputElement;
    const listEl = root.querySelector('#cp-list') as HTMLElement;
    const score = (c: Command, q: string) => {
      const hay = (c.label + ' ' + (c.hint ?? '') + ' ' + c.id).toLowerCase();
      if (!q) return 1;
      if (hay.includes(q)) return 3 - hay.indexOf(q) / 1000;
      let j = 0; for (const ch of hay) if (ch === q[j]) j++; // subsequence fuzzy match
      return j === q.length ? 1 : 0;
    };
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      shown = commands.map((c) => [c, score(c, q)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([c]) => c);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      listEl.innerHTML = shown.length ? shown.map((c, i) => `<div role="option" id="cp-${i}" class="cp-item${i === sel ? ' on' : ''}" aria-selected="${i === sel}" data-cp="${i}"><span>${esc(c.label)}</span>${c.hint ? `<span class="muted small">${esc(c.hint)}</span>` : ''}</div>`).join('') : `<div class="placeholder small">${d.noCommands}</div>`;
      inp.setAttribute('aria-activedescendant', shown.length ? `cp-${sel}` : '');
      listEl.querySelector('.on')?.scrollIntoView?.({ block: 'nearest' });
    };
    const exec = (i: number) => { const c = shown[i]; if (!c) return; closeModal(false); c.run(); };
    inp.addEventListener('input', () => { sel = 0; draw(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); exec(sel); }
    });
    listEl.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cp]'); if (el) exec(Number(el.dataset.cp)); });
    draw(); inp.focus();
  }, 'palette-modal');
}

// ---------- Crash screen (global error boundary) ----------
export function renderCrash(msg: string) {
  const d = t();
  const app = document.getElementById('app'); if (!app) return;
  app.innerHTML = `<div class="crash" role="alert">
    <div class="crash-icon" aria-hidden="true">⚠️</div>
    <h1>${d.crashTitle}</h1><p>${d.crashText}</p>
    <pre class="errlog small">${esc(msg)}</pre>
    <div class="row center wrap"><button class="primary" id="crash-reload">${d.crashReload}</button><button class="ghost" id="crash-reset">${d.crashReset}</button><button class="ghost" id="crash-copy">${d.copyLog}</button></div>
  </div><div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div>`;
  document.getElementById('crash-reload')!.addEventListener('click', () => location.reload());
  document.getElementById('crash-reset')!.addEventListener('click', () => {
    st.crashed = null; st.input = ''; st.outputs = []; st.error = ''; st.view = 'single'; st.busy = false;
    if (!allModes().some((m) => m.id === st.s.mode)) st.s.mode = 'general';
    persist(); rerender();
  });
  document.getElementById('crash-copy')!.addEventListener('click', async () => { await copyText(formatErrors(getErrors(), APP_VERSION), true); toast(d.logCopied); });
}
