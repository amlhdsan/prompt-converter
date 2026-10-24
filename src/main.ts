import './style.css';
import { chat, LLMError, PROVIDERS } from './llm';
import { buildMessages, MODES, MODE_HINTS, OUT_LANGS, type Mode } from './prompts';
import { DICT, type Dict } from './i18n';
import { APP_VERSION, REPO_URL, checkForUpdate, type UpdateInfo } from './update';
import {
  addHistory, clearHistory, deleteHistory, deleteTemplate, exportData, importData, loadHistory, loadSettings, loadTemplates,
  saveSettings, toggleFav, upsertTemplate, DEFAULT_HOTKEY, type Settings, type Template,
} from './storage';
import {
  eventToAccelerator, getAutostart, hideQuick, isDesktop, isQuick, modKey, onEvent, openExternal, prettyAccel,
  readClipboard, setAutostart, setHotkey, showMain, writeClipboard,
} from './platform';

let s: Settings = loadSettings();
let input = '';
let output = '';
let busy = false;
let view: 'single' | 'diff' = 'single';
let ctrl: AbortController | null = null;
let error = '';
let update: UpdateInfo | null = null; // latest known update info
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const t = (): Dict => DICT[s.uiLang];
const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const persist = () => saveSettings(s);
const fmt = (str: string, v: Record<string, string | number>) => str.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function applyTheme() {
  const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.lang = s.uiLang === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.classList.toggle('quick', isQuick);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
const icons = {
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  gh: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.2-3.1-.1-.4-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.3 2.8.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  mark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  kbd: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};const modeIcon: Record<Mode, string> = { general: '🧭', coding: '💻', writing: '✍️', analysis: '🔬', image: '🎨' };

// ---- Modes: built-in + user templates ("tpl:<id>") ----
interface ModeOpt { id: string; label: string; icon: string; hint: string; custom: boolean }
function allModes(): ModeOpt[] {
  const d = t();
  return [
    ...MODES.map((m) => ({ id: m, label: d.modes[m], icon: modeIcon[m], hint: MODE_HINTS[m], custom: false })),
    ...loadTemplates().map((x) => ({ id: 'tpl:' + x.id, label: x.name, icon: x.icon || '⭐', hint: x.prompt, custom: true })),
  ];
}
const currentMode = (): ModeOpt => { const all = allModes(); return all.find((m) => m.id === s.mode) ?? all[0]; };
const modeLabel = (id: string) => allModes().find((m) => m.id === id) ?? { label: id, icon: '' };

function render() {
  applyTheme();
  if (isQuick) return renderQuick();
  const d = t();
  const prov = PROVIDERS.find((p) => p.id === s.provider) ?? PROVIDERS[3];
  const modes = allModes();
  $('#app').innerHTML = `
  <!-- Frosted, sticky app bar: compact brand mark + utility actions -->
  <header class="appbar">
    <div class="appbar-inner">
      <div class="brand"><span class="logo" aria-hidden="true">${icons.mark}</span><span class="brand-name">${d.title}</span></div>
      <nav class="actions" aria-label="toolbar">
        <button class="icon" id="btn-keys" title="${d.shortcuts} (?)" aria-label="${d.shortcuts}">${icons.kbd}</button>
        <button class="icon" id="btn-history" title="${d.history}" aria-label="${d.history}">${icons.clock}</button>
        <button class="icon" id="btn-theme" title="${d.theme[s.theme]}" aria-label="${d.theme[s.theme]}">${s.theme === 'dark' ? icons.moon : s.theme === 'light' ? icons.sun : icons.auto}</button>
        <button class="pill" id="btn-lang" aria-label="Language">${s.uiLang === 'zh' ? 'EN' : '中文'}</button>
        <button class="icon" id="btn-settings" title="${d.settings}" aria-label="${d.settings}">${icons.gear}</button>
        <a class="icon" href="${REPO_URL}" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">${icons.gh}</a>
      </nav>
    </div>
  </header>

  <!-- Hero: large headline establishes hierarchy -->
  <section class="hero">
    <h1>${d.title}</h1>
    <p>${d.subtitle}</p>
  </section>

  <main>
    ${renderUpdateNotice()}
    <section class="toolbar">
      <div class="seg scroll" role="tablist" aria-label="${d.mode}">
        ${modes.map((m) => `<button role="tab" data-mode="${esc(m.id)}" aria-selected="${s.mode === m.id}" class="${s.mode === m.id ? 'on' : ''}${m.custom ? ' custom' : ''}">${m.custom ? `<span aria-hidden="true">${esc(m.icon)}</span> ` : ''}${esc(m.label)}</button>`).join('')}
        <button id="btn-templates" class="add" title="${d.templates}" aria-label="${d.templates}">${icons.plus}</button>
      </div>
      <label class="sel">${d.outLang}
        <select id="out-lang">${OUT_LANGS.map((l) => `<option value="${l}" ${s.outLang === l ? 'selected' : ''}>${d.langs[l]}</option>`).join('')}</select>
        ${s.outLang === 'custom' ? `<input id="custom-lang" class="mini-input" value="${esc(s.customLang)}" placeholder="${esc(d.customLang)}" spellcheck="false"/>` : ''}
      </label>
    </section>
    ${!s.apiKeys[s.provider] ? `<div class="banner">${d.err.noKey} · <button class="link" id="open-set2">${d.settings}</button> · <span class="muted">${esc(prov.name)}</span></div>` : ''}

    <section class="grid">
      <div class="card">
        <div class="card-h"><span>${d.original}</span><span class="muted" id="in-count">${input.length} ${d.chars}</span></div>
        <textarea id="input" spellcheck="false" placeholder="${esc(d.placeholder)}">${esc(input)}</textarea>
        <div class="card-f">
          <span class="muted small">${fmt(d.shortcut, { m: modKey })}</span>
          <div class="row">
            <button class="ghost" id="btn-clear">${d.clear}</button>
            <button class="primary" id="btn-convert">${busy ? `<span class="spin"></span>${d.stop}` : d.convert.replace('✨ ', '')}</button>
          </div>
        </div>
      </div>
      <div class="card ${busy ? 'busy' : ''}">
        <div class="card-h">
          <span>${d.converted} <span class="muted small">${esc(s.model)}</span></span>
          <div class="seg mini"><button data-view="single" class="${view === 'single' ? 'on' : ''}">${d.single}</button><button data-view="diff" class="${view === 'diff' ? 'on' : ''}">${d.diff}</button></div>
        </div>
        <div id="output-wrap">${renderOutput()}</div>
        <div class="card-f">
          <span class="muted small" id="out-count">${output ? `${output.length} ${d.chars}` : ''}</span>
          <div class="row">
            <button class="ghost" id="btn-reuse" ${output && !busy ? '' : 'disabled'}>${d.useAsInput}</button>
            <button class="primary soft" id="btn-copy" ${output ? '' : 'disabled'}>${icons.copy}<span>${d.copy}</span></button>
          </div>
        </div>
      </div>
    </section>
    ${error ? `<div class="error" role="alert">⚠️ ${esc(error)}</div>` : ''}
    <p class="privacy">${d.privacy}</p>
  </main>
  <footer>v${APP_VERSION}${isDesktop ? ` · ${d.desktop}` : ''} · MIT © amlhdsan · <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a> · ${s.uiLang === 'zh' ? '觉得有用？点个 ⭐ 吧' : 'Find it useful? Leave a ⭐'}</footer>
  <div id="modal-root"></div>
  <div id="toast"></div>`;
  bind();
}

/** Apple-style update notice (dismissible per version). */
function renderUpdateNotice(): string {
  if (!update?.available || s.dismissedUpdate === update.latest) return '';
  const d = t();
  const title = update.kind === 'release' ? `${d.updateTitle}: v${esc(update.latest)}` : `${d.updateCommit} (${esc(update.latest)})`;
  return `<aside class="notice" id="update-notice" role="status">
    <div class="notice-icon" aria-hidden="true">${icons.arrow}</div>
    <div class="notice-body">
      <div class="notice-title">${title} <span class="muted small">· ${d.current} v${APP_VERSION}</span></div>
      <div class="notice-text">${esc(isDesktop ? d.updateHowDesktop : d.updateHow)}</div>
    </div>
    <div class="notice-actions">
      <a class="primary soft" href="${esc(update.url)}" target="_blank" rel="noopener">${d.changelog}</a>
      <button class="ghost" id="update-dismiss">${d.later}</button>
    </div>
  </aside>`;
}

function renderOutput(): string {
  const d = t();
  const out = output
    ? `<pre class="out" id="output">${esc(output)}${busy ? '<span class="caret"></span>' : ''}</pre>`
    : `<div class="placeholder">${busy ? `<span class="spin"></span> ${d.converting}` : `<div class="ph-icon">${icons.mark}</div><div>${d.empty}</div><div class="small">${fmt(isQuick ? d.quickHint : d.shortcut, { m: modKey })}</div>`}</div>`;
  if (view === 'diff' && !isQuick) {
    return `<div class="diff"><div><div class="tag">${d.original}</div><pre class="out dim">${esc(input) || '—'}</pre></div><div><div class="tag accent">${d.converted}</div>${out}</div></div>`;
  }
  return out;
}

function updateOutput() {
  const w = $('#output-wrap');
  if (!w) return;
  w.innerHTML = renderOutput();
  const pre = w.querySelector('#output');
  if (pre && busy) pre.scrollTop = pre.scrollHeight;
  const c = $('#out-count'); if (c) c.textContent = output ? `${output.length} ${t().chars}` : '';
}

function toast(msg: string) {
  const el = $('#toast'); if (!el) return; el.textContent = msg; el.className = 'show';
  clearTimeout((toast as any).h); (toast as any).h = setTimeout(() => (el.className = ''), 2200);
}

async function copyText(txt: string, silent = false) {
  try { await writeClipboard(txt); } catch {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  if (!silent) toast(t().copied);
}

function errorMessage(e: unknown): string {
  const d = t();
  if (e instanceof LLMError) {
    if (e.kind === 'http') return `${d.err.http} — ${e.message}`;
    if (e.kind === 'auth' && e.status) return `${d.err.auth} (${e.message})`;
    if (e.kind === 'auth') return d.err.noKey;
    return d.err[e.kind];
  }
  return String((e as Error)?.message ?? e);
}

async function convert() {
  if (busy) { ctrl?.abort(); return; }
  s = { ...loadSettings(), uiLang: s.uiLang }; // pick up changes made in the other window (desktop)
  if (!input.trim()) { toast(t().inputEmpty); $('#input')?.focus(); return; }
  const key = s.apiKeys[s.provider] || '';
  if (!key) { error = t().err.noKey; render(); if (isQuick) { if (isDesktop) showMain(); return; } openSettings(); return; }
  const mode = currentMode();
  busy = true; error = ''; output = ''; ctrl = new AbortController(); render();
  let ok = false;
  try {
    output = await chat({
      baseUrl: s.baseUrl, model: s.model, apiKey: key, stream: s.stream, signal: ctrl.signal,
      messages: buildMessages(input, mode.hint, s.outLang, s.customLang),
      onDelta: (txt) => { output = txt; updateOutput(); },
    });
    output = output.replace(/^```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
    addHistory({ id: uid(), at: Date.now(), mode: mode.id, input, output, model: s.model });
    ok = true;
  } catch (e) {
    if (!(e instanceof LLMError && e.kind === 'aborted')) error = errorMessage(e);
  } finally { busy = false; ctrl = null; render(); }
  if (ok && isQuick && s.quickAutoCopy) { await copyText(output, true); toast(t().copied); }
}

let closeModal: (() => void) | null = null;
function modal(title: string, body: string, onMount: (root: HTMLElement) => void, cls = '') {
  const root = $('#modal-root');
  closeModal?.();
  root.innerHTML = `<div class="overlay"><div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${title}</h2><button class="icon" data-close aria-label="${t().close}">${icons.x}</button></div>${body}</div></div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); closeModal = null; };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); render(); } };
  closeModal = close;
  document.addEventListener('keydown', onKey);
  root.querySelector('.overlay')!.addEventListener('click', (e) => { if (e.target === e.currentTarget) { close(); render(); } });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { close(); render(); }));
  onMount(root);
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function saveBackup(json: string) {
  const name = `prompt-converter-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (isDesktop) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: name, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!path) return false;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_text_file', { path, contents: json });
    return true;
  }
  download(name, json); return true;
}

function openSettings() {
  const d = t();
  const prov = () => PROVIDERS.find((p) => p.id === s.provider)!;
  modal(d.settings, `
    <div class="form">
      <label>${d.provider}<div class="chips">${PROVIDERS.map((p) => `<button data-prov="${p.id}" class="${s.provider === p.id ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div></label>
      <label>${d.baseUrl}<input id="f-base" value="${esc(s.baseUrl)}" placeholder="https://your-endpoint/v1" spellcheck="false"/></label>
      <label>${d.model}<input id="f-model" value="${esc(s.model)}" placeholder="model-name" spellcheck="false"/></label>
      <label><span class="row between">${d.apiKey}${prov().keyUrl ? `<a href="${prov().keyUrl}" target="_blank" rel="noopener" class="small">${d.getKey} ↗</a>` : ''}</span>
        <div class="pw"><input id="f-key" type="password" value="${esc(s.apiKeys[s.provider] || '')}" placeholder="sk-..." autocomplete="off" spellcheck="false"/><button class="ghost small" id="f-eye">👁</button></div></label>
      <label class="check"><input type="checkbox" id="f-stream" ${s.stream ? 'checked' : ''}/> ${d.stream}</label>
      ${isDesktop ? `
      <div class="divider"></div>
      <div class="label">${d.desktop}</div>
      <label>${d.hotkey}<div class="pw"><input id="f-hotkey" readonly value="${esc(prettyAccel(s.hotkey))}" title="${esc(d.hotkeyHint)}" placeholder="${esc(d.hotkeyHint)}"/><button class="ghost small" id="f-hotkey-reset">${d.reset}</button></div>
        <span class="small muted" id="f-hotkey-status">${d.hotkeyHint}</span></label>
      <label class="check"><input type="checkbox" id="f-autostart"/> ${d.autostart}</label>
      <label class="check"><input type="checkbox" id="f-quickcopy" ${s.quickAutoCopy ? 'checked' : ''}/> ${d.quickAutoCopy}</label>` : ''}
      <div class="divider"></div>
      <div class="label">${d.data}</div>
      <div class="row wrap">
        <button class="ghost" id="f-export">${d.exportData}</button>
        <button class="ghost" id="f-import">${d.importData}</button>
        <input type="file" id="f-import-file" accept="application/json,.json" hidden/>
      </div>
      <label class="check"><input type="checkbox" id="f-export-keys"/> ${d.includeKeys}</label>
      <div class="small muted" id="f-data-status" aria-live="polite"></div>
      <div class="divider"></div>
      <div class="row between"><span class="label">${d.version} <strong>v${APP_VERSION}</strong> <a class="small" href="${REPO_URL}/blob/main/CHANGELOG.md" target="_blank" rel="noopener">CHANGELOG ↗</a></span>
        <button class="ghost" id="f-check">${d.checkUpdate}</button></div>
      <div class="small muted" id="f-check-status" aria-live="polite"></div>
      <label class="check"><input type="checkbox" id="f-auto" ${s.autoUpdate ? 'checked' : ''}/> ${d.autoUpdate}</label>
      <p class="privacy small">${d.privacy}</p>
      <div class="row end"><button class="primary" data-close>${d.save}</button></div>
    </div>`, (root) => {
    const q = (id: string) => root.querySelector('#' + id) as HTMLInputElement;
    root.querySelectorAll<HTMLButtonElement>('[data-prov]').forEach((b) => b.addEventListener('click', () => {
      const p = PROVIDERS.find((x) => x.id === b.dataset.prov)!;
      s.provider = p.id; if (p.id !== 'custom') { s.baseUrl = p.baseUrl; s.model = p.model; }
      persist(); openSettings();
    }));
    q('f-base').addEventListener('input', (e) => { s.baseUrl = (e.target as HTMLInputElement).value; persist(); });
    q('f-model').addEventListener('input', (e) => { s.model = (e.target as HTMLInputElement).value; persist(); });
    q('f-key').addEventListener('input', (e) => { s.apiKeys[s.provider] = (e.target as HTMLInputElement).value.trim(); persist(); });
    q('f-stream').addEventListener('change', (e) => { s.stream = (e.target as HTMLInputElement).checked; persist(); });
    q('f-auto').addEventListener('change', (e) => { s.autoUpdate = (e.target as HTMLInputElement).checked; persist(); });
    q('f-check').addEventListener('click', async () => {
      const st = root.querySelector('#f-check-status')!; st.textContent = d.checking;
      try {
        update = await checkForUpdate(true);
        if (update?.available) { s.dismissedUpdate = ''; persist(); }
        st.innerHTML = update?.available
          ? `${esc(update.kind === 'release' ? `${d.updateTitle}: v${update.latest}` : `${d.updateCommit} (${update.latest})`)} · <a href="${esc(update.url)}" target="_blank" rel="noopener">${d.changelog} ↗</a>`
          : d.upToDate;
      } catch { st.textContent = d.checkFailed; }
    });
    q('f-eye').addEventListener('click', () => { const k = q('f-key'); k.type = k.type === 'password' ? 'text' : 'password'; });
    // Data import / export
    const ds = root.querySelector('#f-data-status')!;
    q('f-export').addEventListener('click', async () => {
      const json = JSON.stringify(exportData(APP_VERSION, { settings: true, templates: true, history: true, keys: q('f-export-keys').checked }), null, 2);
      try { if (await saveBackup(json)) { ds.textContent = d.exported; toast(d.exported); } } catch (e) { ds.textContent = String(e); }
    });
    q('f-import').addEventListener('click', () => q('f-import-file').click());
    q('f-import-file').addEventListener('change', async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
      try {
        const r = importData(JSON.parse(await f.text()));
        const uiLang = s.uiLang; s = loadSettings(); if (!r.settings) s.uiLang = uiLang;
        const msg = fmt(t().imported, { s: r.settings ? t().yes : t().no, t: r.templates, h: r.history });
        openSettings(); toast(msg); (document.querySelector('#f-data-status') as HTMLElement).textContent = msg;
      } catch { ds.textContent = d.importFailed; toast(d.importFailed); }
    });
    if (isDesktop) bindDesktopSettings(root);
  });
}

function bindDesktopSettings(root: HTMLElement) {
  const d = t();
  const hk = root.querySelector('#f-hotkey') as HTMLInputElement;
  const st = root.querySelector('#f-hotkey-status')!;
  const apply = async (accel: string) => {
    try { await setHotkey(accel); s.hotkey = accel; persist(); hk.value = prettyAccel(accel); st.textContent = d.hotkeySaved; }
    catch (e) { st.textContent = `${d.hotkeyFailed}: ${e}`; hk.value = prettyAccel(s.hotkey); }
  };
  hk.addEventListener('keydown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const a = eventToAccelerator(e); if (a) apply(a);
  });
  root.querySelector('#f-hotkey-reset')!.addEventListener('click', () => apply(DEFAULT_HOTKEY));
  const as = root.querySelector('#f-autostart') as HTMLInputElement;
  getAutostart().then((v) => (as.checked = v)).catch(() => (as.disabled = true));
  as.addEventListener('change', () => setAutostart(as.checked).catch(() => (as.checked = !as.checked)));
  (root.querySelector('#f-quickcopy') as HTMLInputElement).addEventListener('change', (e) => { s.quickAutoCopy = (e.target as HTMLInputElement).checked; persist(); });
}

let histTab: 'all' | 'fav' = 'all';
let histQuery = '';
function openHistory() {
  const d = t();
  modal(d.history, `
    <div class="hist-tools">
      <input id="h-search" type="search" placeholder="${esc(d.search)}" value="${esc(histQuery)}" spellcheck="false" autocomplete="off"/>
      <div class="seg mini"><button id="h-tab-all" class="${histTab === 'all' ? 'on' : ''}">${d.all}</button><button id="h-tab-fav" class="${histTab === 'fav' ? 'on' : ''}">★ ${d.favorites}</button></div>
    </div>
    <div class="hist" id="h-list"></div>
    <div class="row end" id="h-foot"></div>`, (root) => {
    const list = root.querySelector('#h-list')!;
    const draw = () => {
      const all = loadHistory();
      const qq = histQuery.trim().toLowerCase();
      const h = all.filter((x) => (histTab === 'all' || x.fav) && (!qq || (x.input + '\n' + x.output + '\n' + modeLabel(x.mode).label).toLowerCase().includes(qq)));
      list.innerHTML = h.length ? h.map((it) => {
        const ml = modeLabel(it.mode);
        return `
        <div class="hist-item${it.fav ? ' fav' : ''}" data-id="${esc(it.id)}" tabindex="0">
          <div class="row between"><span class="badge">${esc(ml.icon)} ${esc(ml.label)}</span>
            <span class="row"><span class="muted small">${new Date(it.at).toLocaleString()} · ${esc(it.model)}</span>
              <button class="icon tiny star${it.fav ? ' on' : ''}" data-fav="${esc(it.id)}" title="${it.fav ? d.unfav : d.fav}" aria-label="${it.fav ? d.unfav : d.fav}" aria-pressed="${!!it.fav}">${icons.star}</button>
              <button class="icon tiny" data-del="${esc(it.id)}" title="${d.del}" aria-label="${d.del}">${icons.trash}</button></span></div>
          <div class="hist-in">${esc(it.input.slice(0, 140))}</div>
          <div class="hist-out muted">${esc(it.output.slice(0, 200))}</div>
        </div>`;
      }).join('') : `<div class="placeholder">${all.length ? d.noMatch : d.noHistory}</div>`;
      root.querySelector('#h-foot')!.innerHTML = all.length ? `<button class="ghost danger" id="h-clear">${d.clearHistory}</button>` : '';
      root.querySelector('#h-clear')?.addEventListener('click', () => { clearHistory(); draw(); });
      root.querySelector('#h-tab-all')!.className = histTab === 'all' ? 'on' : '';
      root.querySelector('#h-tab-fav')!.className = histTab === 'fav' ? 'on' : '';
    };
    list.addEventListener('click', (e) => {
      const tgt = e.target as HTMLElement;
      const fav = tgt.closest<HTMLElement>('[data-fav]'); if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav!); draw(); return; }
      const del = tgt.closest<HTMLElement>('[data-del]'); if (del) { e.stopPropagation(); deleteHistory(del.dataset.del!); draw(); return; }
      const el = tgt.closest<HTMLElement>('.hist-item'); if (!el) return;
      const it = loadHistory().find((x) => x.id === el.dataset.id); if (!it) return;
      input = it.input; output = it.output; if (allModes().some((m) => m.id === it.mode)) s.mode = it.mode; persist(); closeModal?.(); render();
    });
    const search = root.querySelector('#h-search') as HTMLInputElement;
    search.addEventListener('input', () => { histQuery = search.value; draw(); });
    root.querySelector('#h-tab-all')!.addEventListener('click', () => { histTab = 'all'; draw(); });
    root.querySelector('#h-tab-fav')!.addEventListener('click', () => { histTab = 'fav'; draw(); });
    draw(); search.focus();
  });
}

function openTemplates(editId?: string) {
  const d = t();
  const list = loadTemplates();
  const cur: Template = list.find((x) => x.id === editId) ?? { id: '', name: '', icon: '⭐', prompt: '', at: 0 };
  modal(d.templates, `
    <div class="tpl-list">${list.length ? list.map((x) => `
      <div class="tpl-item${x.id === editId ? ' editing' : ''}" data-id="${esc(x.id)}">
        <span class="tpl-icon">${esc(x.icon || '⭐')}</span>
        <div class="tpl-main"><div class="tpl-name">${esc(x.name)}</div><div class="small muted tpl-desc">${esc(x.prompt.slice(0, 90))}</div></div>
        <button class="ghost small" data-tpl-edit="${esc(x.id)}">${d.edit}</button>
        <button class="ghost small danger" data-tpl-del="${esc(x.id)}">${d.del}</button>
      </div>`).join('') : `<div class="placeholder small">${d.tplEmpty}</div>`}</div>
    <div class="divider"></div>
    <div class="form">
      <div class="label">${cur.id ? d.editTemplate : d.newTemplate}</div>
      <div class="row tpl-row">
        <label class="tpl-icon-field">${d.tplIcon}<input id="f-tpl-icon" value="${esc(cur.icon)}" maxlength="4"/></label>
        <label class="grow">${d.tplName}<input id="f-tpl-name" value="${esc(cur.name)}" maxlength="40" spellcheck="false"/></label>
      </div>
      <label>${d.tplPrompt}<textarea id="f-tpl-prompt" rows="5" placeholder="${esc(d.tplPromptHint)}">${esc(cur.prompt)}</textarea></label>
      <div class="row end">
        ${cur.id ? `<button class="ghost" id="tpl-cancel">${d.cancel}</button>` : ''}
        <button class="primary" id="tpl-save">${cur.id ? d.save : d.addTemplate}</button>
      </div>
    </div>`, (root) => {
    const v = (id: string) => (root.querySelector('#' + id) as HTMLInputElement).value.trim();
    root.querySelector('#tpl-save')!.addEventListener('click', () => {
      const name = v('f-tpl-name'), prompt = v('f-tpl-prompt');
      if (!name || !prompt) { toast(d.tplNeedName); return; }
      const tpl: Template = { id: cur.id || uid(), name, icon: v('f-tpl-icon') || '⭐', prompt, at: Date.now() };
      upsertTemplate(tpl);
      if (!cur.id) s.mode = 'tpl:' + tpl.id; persist();
      render(); openTemplates(); toast(d.tplSaved);
    });
    root.querySelector('#tpl-cancel')?.addEventListener('click', () => openTemplates());
    root.querySelectorAll<HTMLElement>('[data-tpl-edit]').forEach((b) => b.addEventListener('click', () => openTemplates(b.dataset.tplEdit)));
    root.querySelectorAll<HTMLButtonElement>('[data-tpl-del]').forEach((b) => b.addEventListener('click', () => {
      if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = d.confirmDel; return; }
      const id = b.dataset.tplDel!; deleteTemplate(id);
      if (s.mode === 'tpl:' + id) { s.mode = 'general'; persist(); }
      render(); openTemplates(); toast(d.tplDeleted);
    }));
  }, 'wide');
}

function openShortcuts() {
  const d = t();
  const k = (...keys: string[]) => keys.map((x) => `<kbd>${esc(x)}</kbd>`).join('<span class="plus">+</span>');
  const rows: [string, string][] = [
    [k(modKey, 'Enter'), d.keys.convert],
    [k(modKey, 'Shift', 'C'), d.keys.copy],
    [k(modKey, ','), d.keys.settings],
    [k(modKey, 'Shift', 'H'), d.keys.history],
    [k(modKey, 'Shift', 'T'), d.keys.templates],
    [k('Alt', '1…9'), d.keys.mode],
    [k('?'), d.keys.help],
    [k('Esc'), d.keys.esc],
    [isDesktop ? prettyAccel(s.hotkey).split(' + ').map((x) => `<kbd>${esc(x)}</kbd>`).join('<span class="plus">+</span>') : k(modKey, 'Shift', 'Space'), d.keys.global],
  ];
  modal(d.shortcuts, `<table class="keys" id="keys-table">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`, () => {});
}

function bind() {
  const ta = $<HTMLTextAreaElement>('#input');
  ta.addEventListener('input', () => { input = ta.value; $('#in-count').textContent = `${input.length} ${t().chars}`; });
  $('#btn-convert').addEventListener('click', convert);
  $('#btn-clear').addEventListener('click', () => { input = ''; output = ''; error = ''; render(); $('#input').focus(); });
  $('#btn-copy').addEventListener('click', () => output && copyText(output));
  $('#btn-reuse').addEventListener('click', () => { input = output; output = ''; render(); });
  $('#update-dismiss')?.addEventListener('click', () => { if (update) { s.dismissedUpdate = update.latest; persist(); render(); } });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#open-set2')?.addEventListener('click', openSettings);
  $('#btn-history').addEventListener('click', openHistory);
  $('#btn-keys').addEventListener('click', openShortcuts);
  $('#btn-templates').addEventListener('click', () => openTemplates());
  $('#btn-lang').addEventListener('click', () => { s.uiLang = s.uiLang === 'zh' ? 'en' : 'zh'; persist(); render(); });
  $('#btn-theme').addEventListener('click', () => { s.theme = s.theme === 'system' ? 'light' : s.theme === 'light' ? 'dark' : 'system'; persist(); render(); });
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => { s.mode = b.dataset.mode!; persist(); render(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view as any; render(); }));
  $<HTMLSelectElement>('#out-lang').addEventListener('change', (e) => { s.outLang = (e.target as HTMLSelectElement).value; persist(); render(); if (s.outLang === 'custom') $('#custom-lang')?.focus(); });
  $('#custom-lang')?.addEventListener('input', (e) => { s.customLang = (e.target as HTMLInputElement).value; persist(); });
}

// ---- Global keyboard shortcuts ----
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const inModal = !!$('#modal-root')?.firstElementChild;
  if (mod && e.key === 'Enter') {
    if (inModal) return;
    e.preventDefault(); convert(); return;
  }
  if (e.key === 'Escape') {
    if (inModal) return; // modal handles it
    if (busy) { ctrl?.abort(); return; }
    if (isQuick) hideQuick();
    return;
  }
  if (isQuick) return;
  if (mod && e.shiftKey && e.code === 'KeyC') { if (output) { e.preventDefault(); copyText(output); } return; }
  if (mod && e.key === ',') { e.preventDefault(); openSettings(); return; }
  if (mod && e.shiftKey && e.code === 'KeyH') { e.preventDefault(); openHistory(); return; }
  if (mod && e.shiftKey && e.code === 'KeyT') { e.preventDefault(); openTemplates(); return; }
  if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) {
    const m = allModes()[Number(e.code.slice(5)) - 1];
    if (m && !inModal) { e.preventDefault(); s.mode = m.id; persist(); render(); }
    return;
  }
  if (e.key === '?' && !typing(e.target) && !inModal) { e.preventDefault(); openShortcuts(); }
});

// Desktop: open external links in the system browser instead of the webview.
if (isDesktop) {
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
    if (a && /^https?:/.test(a.href) && (a.target === '_blank' || !a.href.startsWith(location.origin))) { e.preventDefault(); openExternal(a.href); }
  });
}

// ---- Quick-convert window (desktop floating window, also reachable on web via #quick) ----
function renderQuick() {
  const d = t();
  const modes = allModes();
  $('#app').innerHTML = `
  <div class="quick-wrap" data-tauri-drag-region>
    <div class="quick-bar" data-tauri-drag-region>
      <span class="logo" aria-hidden="true">${icons.mark}</span><strong data-tauri-drag-region>${d.quickTitle}</strong>
      <select id="q-mode" aria-label="${d.mode}">${modes.map((m) => `<option value="${esc(m.id)}" ${s.mode === m.id ? 'selected' : ''}>${esc(m.icon)} ${esc(m.label)}</option>`).join('')}</select>
      <span class="grow" data-tauri-drag-region></span>
      <button class="ghost small" id="q-paste">${d.pasteClip}</button>
      <button class="ghost small" id="q-main">${d.openMain}</button>
      <button class="icon tiny" id="q-hide" aria-label="${d.close}">${icons.x}</button>
    </div>
    <textarea id="input" class="q-input" spellcheck="false" placeholder="${esc(d.placeholder)}">${esc(input)}</textarea>
    <div class="q-out ${busy ? 'busy' : ''}"><div id="output-wrap">${renderOutput()}</div></div>
    ${error ? `<div class="error small" role="alert">⚠️ ${esc(error)}</div>` : ''}
    <div class="quick-foot">
      <span class="muted small">${fmt(d.quickHint, { m: modKey })}</span>
      <span class="row">
        <button class="primary soft" id="btn-copy" ${output ? '' : 'disabled'}>${icons.copy}<span>${d.copy}</span></button>
        <button class="primary" id="btn-convert">${busy ? `<span class="spin"></span>${d.stop}` : d.convert.replace('✨ ', '')}</button>
      </span>
    </div>
  </div>
  <div id="modal-root"></div>
  <div id="toast"></div>`;
  const ta = $<HTMLTextAreaElement>('#input');
  ta.addEventListener('input', () => { input = ta.value; });
  $('#btn-convert').addEventListener('click', convert);
  $('#btn-copy').addEventListener('click', () => output && copyText(output));
  $('#q-paste').addEventListener('click', () => pasteClipboard(true));
  $('#q-main').addEventListener('click', () => showMain());
  $('#q-hide').addEventListener('click', () => hideQuick());
  $<HTMLSelectElement>('#q-mode').addEventListener('change', (e) => { s.mode = (e.target as HTMLSelectElement).value; persist(); });
}

async function pasteClipboard(force = false) {
  try {
    const clip = (await readClipboard()).trim();
    if (clip && (force || clip !== output)) { input = clip; output = ''; error = ''; render(); }
  } catch { /* clipboard unavailable */ }
  const ta = $<HTMLTextAreaElement>('#input'); ta?.focus(); ta?.select();
}

if (isQuick) {
  // Each time the hotkey shows the window: reload settings/templates and pull in the clipboard text.
  onEvent('quick-shown', () => { if (busy) return; s = loadSettings(); pasteClipboard(); });
  window.addEventListener('storage', () => { s = loadSettings(); if (!busy) render(); });
} else if (isDesktop) {
  window.addEventListener('storage', (e) => { if (e.key === 'pc.templates.v1' || e.key === 'pc.history.v1') { s = loadSettings(); if (!$('#modal-root')?.firstElementChild) render(); } });
}

render();
// Background update check (throttled, silent on failure). Only the main window shows the notice.
if (s.autoUpdate && !isQuick) checkForUpdate().then((u) => { if (u) { update = u; if (u.available) render(); } });
