import './style.css';
import { chat, LLMError, PROVIDERS } from './llm';
import { buildMessages, MODES, type Mode, type OutLang } from './prompts';
import { DICT, type Dict } from './i18n';
import { addHistory, clearHistory, loadHistory, loadSettings, saveSettings, type Settings } from './storage';

const s: Settings = loadSettings();
let input = '';
let output = '';
let busy = false;
let view: 'single' | 'diff' = 'single';
let ctrl: AbortController | null = null;
let error = '';
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const t = (): Dict => DICT[s.uiLang];
const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const persist = () => saveSettings(s);

function applyTheme() {
  const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.lang = s.uiLang === 'zh' ? 'zh-CN' : 'en';
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
  x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};
const modeIcon: Record<Mode, string> = { general: '🧭', coding: '💻', writing: '✍️', analysis: '🔬', image: '🎨' };

function render() {
  applyTheme();
  const d = t();
  const prov = PROVIDERS.find((p) => p.id === s.provider) ?? PROVIDERS[3];
  $('#app').innerHTML = `
  <!-- Frosted, sticky app bar: compact brand mark + utility actions -->
  <header class="appbar">
    <div class="appbar-inner">
      <div class="brand"><span class="logo" aria-hidden="true">${icons.mark}</span><span class="brand-name">${d.title}</span></div>
      <nav class="actions" aria-label="toolbar">
        <button class="icon" id="btn-history" title="${d.history}" aria-label="${d.history}">${icons.clock}</button>
        <button class="icon" id="btn-theme" title="${d.theme[s.theme]}" aria-label="${d.theme[s.theme]}">${s.theme === 'dark' ? icons.moon : s.theme === 'light' ? icons.sun : icons.auto}</button>
        <button class="pill" id="btn-lang" aria-label="Language">${s.uiLang === 'zh' ? 'EN' : '中文'}</button>
        <button class="icon" id="btn-settings" title="${d.settings}" aria-label="${d.settings}">${icons.gear}</button>
        <a class="icon" href="https://github.com/amlhdsan/prompt-converter" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">${icons.gh}</a>
      </nav>
    </div>
  </header>

  <!-- Hero: large headline establishes hierarchy -->
  <section class="hero">
    <h1>${d.title}</h1>
    <p>${d.subtitle}</p>
  </section>

  <main>
    <section class="toolbar">
      <div class="seg" role="tablist" aria-label="${d.mode}">
        ${MODES.map((m) => `<button role="tab" data-mode="${m}" aria-selected="${s.mode === m}" class="${s.mode === m ? 'on' : ''}">${d.modes[m]}</button>`).join('')}
      </div>
      <label class="sel">${d.outLang}
        <select id="out-lang">${(['auto', 'zh', 'en'] as OutLang[]).map((l) => `<option value="${l}" ${s.outLang === l ? 'selected' : ''}>${d.langs[l]}</option>`).join('')}</select>
      </label>
    </section>
    ${!s.apiKeys[s.provider] ? `<div class="banner">${d.err.noKey} · <button class="link" id="open-set2">${d.settings}</button> · <span class="muted">${esc(prov.name)}</span></div>` : ''}

    <section class="grid">
      <div class="card">
        <div class="card-h"><span>${d.original}</span><span class="muted" id="in-count">${input.length} ${d.chars}</span></div>
        <textarea id="input" spellcheck="false" placeholder="${esc(d.placeholder)}">${esc(input)}</textarea>
        <div class="card-f">
          <span class="muted small">${d.shortcut}</span>
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
  <footer>MIT © amlhdsan · <a href="https://github.com/amlhdsan/prompt-converter" target="_blank" rel="noopener">GitHub</a> · ${s.uiLang === 'zh' ? '觉得有用？点个 ⭐ 吧' : 'Find it useful? Leave a ⭐'}</footer>
  <div id="modal-root"></div>
  <div id="toast"></div>`;
  bind();
}

function renderOutput(): string {
  const d = t();
  const out = output
    ? `<pre class="out" id="output">${esc(output)}${busy ? '<span class="caret"></span>' : ''}</pre>`
    : `<div class="placeholder">${busy ? `<span class="spin"></span> ${d.converting}` : `<div class="ph-icon">${icons.mark}</div><div>${d.empty}</div><div class="small">${d.shortcut}</div>`}</div>`;
  if (view === 'diff') {
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
  const el = $('#toast'); el.textContent = msg; el.className = 'show';
  clearTimeout((toast as any).h); (toast as any).h = setTimeout(() => (el.className = ''), 1800);
}

async function copyText(txt: string) {
  try { await navigator.clipboard.writeText(txt); } catch {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast(t().copied);
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
  if (!input.trim()) { toast(t().inputEmpty); $('#input')?.focus(); return; }
  const key = s.apiKeys[s.provider] || '';
  if (!key) { error = t().err.noKey; render(); openSettings(); return; }
  busy = true; error = ''; output = ''; ctrl = new AbortController(); render();
  try {
    output = await chat({
      baseUrl: s.baseUrl, model: s.model, apiKey: key, stream: s.stream, signal: ctrl.signal,
      messages: buildMessages(input, s.mode as Mode, s.outLang as OutLang),
      onDelta: (txt) => { output = txt; updateOutput(); },
    });
    output = output.replace(/^```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
    addHistory({ id: crypto.randomUUID?.() ?? String(Date.now()), at: Date.now(), mode: s.mode, input, output, model: s.model });
  } catch (e) {
    if (!(e instanceof LLMError && e.kind === 'aborted')) error = errorMessage(e);
  } finally { busy = false; ctrl = null; render(); }
}

function modal(title: string, body: string, onMount: (root: HTMLElement) => void) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal" role="dialog" aria-modal="true"><div class="modal-h"><h2>${title}</h2><button class="icon" data-close>${icons.x}</button></div>${body}</div></div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  root.querySelector('.overlay')!.addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { close(); render(); }));
  onMount(root);
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
    q('f-eye').addEventListener('click', () => { const k = q('f-key'); k.type = k.type === 'password' ? 'text' : 'password'; });
  });
}

function openHistory() {
  const d = t();
  const h = loadHistory();
  modal(d.history, `
    <div class="hist">${h.length ? h.map((it) => `
      <div class="hist-item" data-id="${it.id}">
        <div class="row between"><span class="badge">${modeIcon[it.mode as Mode] ?? ''} ${d.modes[it.mode as Mode] ?? it.mode}</span><span class="muted small">${new Date(it.at).toLocaleString()} · ${esc(it.model)}</span></div>
        <div class="hist-in">${esc(it.input.slice(0, 140))}</div>
        <div class="hist-out muted">${esc(it.output.slice(0, 200))}</div>
      </div>`).join('') : `<div class="placeholder">${d.noHistory}</div>`}</div>
    ${h.length ? `<div class="row end"><button class="ghost danger" id="h-clear">${d.clearHistory}</button></div>` : ''}`, (root) => {
    root.querySelectorAll<HTMLElement>('.hist-item').forEach((el) => el.addEventListener('click', () => {
      const it = h.find((x) => x.id === el.dataset.id)!;
      input = it.input; output = it.output; s.mode = it.mode; persist(); root.innerHTML = ''; render();
    }));
    root.querySelector('#h-clear')?.addEventListener('click', () => { clearHistory(); openHistory(); });
  });
}

function bind() {
  const ta = $<HTMLTextAreaElement>('#input');
  ta.addEventListener('input', () => { input = ta.value; $('#in-count').textContent = `${input.length} ${t().chars}`; });
  ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); convert(); } });
  $('#btn-convert').addEventListener('click', convert);
  $('#btn-clear').addEventListener('click', () => { input = ''; output = ''; error = ''; render(); $('#input').focus(); });
  $('#btn-copy').addEventListener('click', () => output && copyText(output));
  $('#btn-reuse').addEventListener('click', () => { input = output; output = ''; render(); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#open-set2')?.addEventListener('click', openSettings);
  $('#btn-history').addEventListener('click', openHistory);
  $('#btn-lang').addEventListener('click', () => { s.uiLang = s.uiLang === 'zh' ? 'en' : 'zh'; persist(); render(); });
  $('#btn-theme').addEventListener('click', () => { s.theme = s.theme === 'system' ? 'light' : s.theme === 'light' ? 'dark' : 'system'; persist(); render(); });
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => { s.mode = b.dataset.mode!; persist(); render(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view as any; render(); }));
  $<HTMLSelectElement>('#out-lang').addEventListener('change', (e) => { s.outLang = (e.target as HTMLSelectElement).value; persist(); });
}

render();
