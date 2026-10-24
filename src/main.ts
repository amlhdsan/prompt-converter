import './style.css';
import { OUT_LANGS } from './prompts';
import { providerById, needsKey } from './providers';
import { APP_VERSION, REPO_URL, checkForUpdate } from './update';
import { decodeShare, encodeShare, shareFromHash } from './lib/share';
import { hideQuick, isDesktop, isQuick, modKey, onEvent, openExternal } from './platform';
import { $, copyText, download, esc, fmt, modalOpen, toast } from './ui/dom';
import { icons } from './ui/icons';
import { onRender, out, persist, reloadSettings, rerender, st, t, type View } from './ui/state';
import { allModes, convert, refine, setLiveHooks, setMode } from './ui/actions';
import { renderOutput, renderQuality, renderVariantTabs, statsText } from './ui/output';
import { openSettings } from './ui/dialogs/settings';
import { openHistory } from './ui/dialogs/history';
import { openTemplates } from './ui/dialogs/templates';
import { openLibrary, openShortcuts, openTestRun } from './ui/dialogs/extra';
import { pasteClipboard, renderQuick } from './ui/quick';
import { estimateTokens } from './lib/tokens';

const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const s = st.s;
  const dark = s.theme === 'dark' || (s.theme === 'system' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.lang = s.uiLang === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.classList.toggle('quick', isQuick);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#000000' : '#f5f5f7');
}
mq.addEventListener('change', applyTheme);

const doConvert = () => convert(openSettings);
const REFINE_CHIPS: Record<string, string> = {
  shorter: 'Make it shorter and more concise, keep every essential requirement.',
  detailed: 'Make it more detailed and specific: add missing context, constraints and acceptance criteria.',
  structured: 'Make the structure clearer with well-labelled sections and bullet points.',
  examples: 'Add a short example of the expected input/output to the prompt.',
  formal: 'Make the tone more formal and professional.',
};

function render() {
  applyTheme();
  if (isQuick) return renderQuick();
  const d = t();
  const s = st.s;
  const prov = providerById(s.provider);
  const modes = allModes();
  const o = out();
  const focusId = document.activeElement?.id;
  $('#app').innerHTML = `
  <a class="skip" href="#input">${s.uiLang === 'zh' ? '跳到输入框' : 'Skip to input'}</a>
  <header class="appbar">
    <div class="appbar-inner">
      <div class="brand"><span class="logo" aria-hidden="true">${icons.mark}</span><span class="brand-name">${d.title}</span></div>
      <nav class="actions" aria-label="toolbar">
        <button class="icon" id="btn-library" title="${d.library}" aria-label="${d.library}">${icons.book}</button>
        <button class="icon hide-sm" id="btn-keys" title="${d.shortcuts} (?)" aria-label="${d.shortcuts}">${icons.kbd}</button>
        <button class="icon" id="btn-history" title="${d.history}" aria-label="${d.history}">${icons.clock}</button>
        <button class="icon" id="btn-theme" title="${d.theme[s.theme]}" aria-label="${d.theme[s.theme]}">${s.theme === 'dark' ? icons.moon : s.theme === 'light' ? icons.sun : icons.auto}</button>
        <button class="pill" id="btn-lang" aria-label="Language / 语言">${s.uiLang === 'zh' ? 'EN' : '中文'}</button>
        <button class="icon" id="btn-settings" title="${d.settings}" aria-label="${d.settings}">${icons.gear}</button>
        <a class="icon hide-sm" href="${REPO_URL}" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">${icons.gh}</a>
      </nav>
    </div>
  </header>

  <section class="hero">
    <h1>${d.title}</h1>
    <p>${d.subtitle}</p>
  </section>

  <main>
    ${renderUpdateNotice()}
    ${st.shared ? `<div class="banner info" id="shared-banner">🔗 ${d.sharedBanner} · <button class="link" id="shared-dismiss">${d.dismiss}</button></div>` : ''}
    <section class="toolbar">
      <div class="seg scroll" role="tablist" aria-label="${d.mode}">
        ${modes.map((m) => `<button role="tab" data-mode="${esc(m.id)}" aria-selected="${s.mode === m.id}" tabindex="${s.mode === m.id ? 0 : -1}" class="${s.mode === m.id ? 'on' : ''}${m.custom ? ' custom' : ''}">${m.custom ? `<span aria-hidden="true">${esc(m.icon)}</span> ` : ''}${esc(m.label)}</button>`).join('')}
        <button id="btn-templates" class="add" title="${d.templates}" aria-label="${d.templates}">${icons.plus}</button>
      </div>
      <label class="sel">${d.outLang}
        <select id="out-lang">${OUT_LANGS.map((l) => `<option value="${l}" ${s.outLang === l ? 'selected' : ''}>${d.langs[l]}</option>`).join('')}</select>
        ${s.outLang === 'custom' ? `<input id="custom-lang" class="mini-input" value="${esc(s.customLang)}" placeholder="${esc(d.customLang)}" aria-label="${esc(d.customLang)}" spellcheck="false"/>` : ''}
      </label>
    </section>
    ${needsKey(prov) && !s.apiKeys[s.provider] ? `<div class="banner">${d.err.noKey} · <button class="link" id="open-set2">${d.settings}</button> · <span class="muted">${esc(prov.name)}</span></div>` : ''}

    <section class="grid">
      <div class="card">
        <div class="card-h"><label for="input">${d.original}</label><span class="muted" id="in-count">${st.input.length} ${d.chars}</span></div>
        <textarea id="input" spellcheck="false" placeholder="${esc(d.placeholder)}">${esc(st.input)}</textarea>
        <div class="card-f">
          <span class="muted small hide-sm">${fmt(d.shortcut, { m: modKey })}</span>
          <div class="row">
            <button class="ghost" id="btn-clear">${d.clear}</button>
            <button class="primary" id="btn-convert" aria-keyshortcuts="Control+Enter Meta+Enter">${st.busy && st.task === 'convert' ? `<span class="spin"></span>${d.stop}` : d.convert.replace('✨ ', '')}</button>
          </div>
        </div>
      </div>
      <div class="card out-card ${st.busy ? 'busy' : ''}">
        <div class="card-h">
          <span>${d.converted} <span class="muted small">${esc(s.model)}</span></span>
          <div class="row">
            <div class="seg mini" role="group" aria-label="${d.rendered} / ${d.raw}"><button data-render="md" aria-pressed="${s.render === 'md'}" class="${s.render === 'md' ? 'on' : ''}">${d.rendered}</button><button data-render="raw" aria-pressed="${s.render === 'raw'}" class="${s.render === 'raw' ? 'on' : ''}">${d.raw}</button></div>
            <div class="seg mini" role="group" aria-label="view"><button data-view="single" aria-pressed="${st.view === 'single'}" class="${st.view === 'single' ? 'on' : ''}">${d.single}</button><button data-view="compare" aria-pressed="${st.view === 'compare'}" class="${st.view === 'compare' ? 'on' : ''}">${d.diff}</button><button data-view="diff" aria-pressed="${st.view === 'diff'}" class="${st.view === 'diff' ? 'on' : ''}">${d.diffView}</button></div>
          </div>
        </div>
        <div id="variant-tabs">${renderVariantTabs()}</div>
        <div id="output-wrap" aria-live="polite" aria-busy="${st.busy}">${renderOutput()}</div>
        ${o && !st.busy ? `
        <div class="refine" id="refine">
          <div class="chips small-chips" role="group" aria-label="${d.refine}">${Object.keys(REFINE_CHIPS).map((k) => `<button data-refine="${k}">${(d.chips as Record<string, string>)[k]}</button>`).join('')}</div>
          <form class="refine-row" id="refine-form"><input id="refine-input" placeholder="${esc(d.refinePlaceholder)}" aria-label="${esc(d.refine)}" autocomplete="off"/><button class="primary soft" type="submit" id="refine-send">${d.send}</button></form>
        </div>` : ''}
        ${st.busy && st.task === 'refine' ? `<div class="refine"><button class="ghost" id="refine-stop"><span class="spin"></span>${d.stop}</button></div>` : ''}
        <div class="card-f">
          <span class="muted small" id="out-count">${statsText()}</span>
          <div class="row">
            <button class="ghost hide-sm" id="btn-reuse" ${o && !st.busy ? '' : 'disabled'}>${d.useAsInput}</button>
            <button class="ghost" id="btn-test" ${o && !st.busy ? '' : 'disabled'} title="${d.testRunHint}">${icons.play}<span>${d.testRun}</span></button>
            <div class="menu">
              <button class="icon" id="btn-more" aria-haspopup="menu" aria-expanded="false" aria-label="${d.more}" ${o && !st.busy ? '' : 'disabled'}>${icons.more}</button>
              <div class="menu-pop" role="menu" id="more-menu" hidden>
                <button role="menuitem" id="btn-export-md">${icons.download} ${d.exportMd}</button>
                <button role="menuitem" id="btn-export-txt">${icons.download} ${d.exportTxt}</button>
                <button role="menuitem" id="btn-share">${icons.share} ${d.share}</button>
              </div>
            </div>
            <button class="primary soft" id="btn-copy" ${o ? '' : 'disabled'}>${icons.copy}<span>${d.copy}</span></button>
          </div>
        </div>
      </div>
    </section>
    ${st.error ? `<div class="error" role="alert">⚠️ ${esc(st.error)}</div>` : ''}
    ${renderQuality()}
    <p class="privacy">${d.privacy}</p>
  </main>
  <footer>v${APP_VERSION}${isDesktop ? ` · ${d.desktop}` : ''} · MIT © amlhdsan · <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a> · ${s.uiLang === 'zh' ? '觉得有用？点个 ⭐ 吧' : 'Find it useful? Leave a ⭐'}</footer>
  <div id="modal-root"></div>
  <div id="toast" role="status" aria-live="polite"></div>`;
  bind();
  if (focusId && !modalOpen()) document.getElementById(focusId)?.focus?.();
}

function renderUpdateNotice(): string {
  const u = st.update;
  if (!u?.available || st.s.dismissedUpdate === u.latest) return '';
  const d = t();
  const title = u.kind === 'release' ? `${d.updateTitle}: v${esc(u.latest)}` : `${d.updateCommit} (${esc(u.latest)})`;
  return `<aside class="notice" id="update-notice" role="status">
    <div class="notice-icon" aria-hidden="true">${icons.arrow}</div>
    <div class="notice-body">
      <div class="notice-title">${title} <span class="muted small">· ${d.current} v${APP_VERSION}</span></div>
      <div class="notice-text">${esc(isDesktop ? d.updateHowDesktop : d.updateHow)}</div>
    </div>
    <div class="notice-actions">
      <a class="primary soft" href="${esc(u.url)}" target="_blank" rel="noopener">${d.changelog}</a>
      <button class="ghost" id="update-dismiss">${d.later}</button>
    </div>
  </aside>`;
}

function updateLive() {
  const w = $('#output-wrap'); if (!w) return;
  w.innerHTML = renderOutput();
  const pre = w.querySelector('#output'); if (pre && st.busy) pre.scrollTop = pre.scrollHeight;
  const c = $('#out-count'); if (c) c.innerHTML = statsText();
  updateTabs();
}
function updateTabs() { const v = $('#variant-tabs'); if (v) { v.innerHTML = renderVariantTabs(); bindVariantTabs(); } }
function bindVariantTabs() {
  document.querySelectorAll<HTMLButtonElement>('[data-variant]').forEach((b) => b.addEventListener('click', () => { st.active = Number(b.dataset.variant); if (st.busy) updateLive(); else render(); }));
}
setLiveHooks(updateLive, updateTabs);

const slug = () => (st.input.trim().slice(0, 24).replace(/[\\/:*?"<>|\s]+/g, '-') || 'prompt');
function exportMd() {
  const d = t();
  const md = `# ${d.title}\n\n> ${new Date().toLocaleString()} · ${st.s.model}\n\n## ${d.original}\n\n${st.input}\n\n## ${d.converted}\n\n${out()}\n`;
  download(`${slug()}.md`, md, 'text/markdown');
}
async function share() {
  const hash = await encodeShare({ i: st.input, o: out(), m: st.s.mode });
  const url = `${location.origin}${location.pathname}#share=${hash}`;
  await copyText(url, true);
  toast(t().shareCopied);
  return url;
}

function bind() {
  const ta = $<HTMLTextAreaElement>('#input');
  ta.addEventListener('input', () => { st.input = ta.value; $('#in-count').textContent = `${st.input.length} ${t().chars} · ${fmt(t().tokens, { n: estimateTokens(st.input) })}`; });
  $('#btn-convert').addEventListener('click', () => (st.busy && st.task !== 'convert' ? st.ctrl?.abort() : doConvert()));
  $('#btn-clear').addEventListener('click', () => { st.input = ''; st.outputs = []; st.error = ''; render(); $('#input').focus(); });
  $('#btn-copy').addEventListener('click', () => out() && copyText(out()));
  $('#btn-reuse').addEventListener('click', () => { st.input = out(); st.outputs = []; render(); });
  $('#btn-test').addEventListener('click', openTestRun);
  $('#update-dismiss')?.addEventListener('click', () => { if (st.update) { st.s.dismissedUpdate = st.update.latest; persist(); render(); } });
  $('#shared-dismiss')?.addEventListener('click', () => { st.shared = false; render(); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#open-set2')?.addEventListener('click', openSettings);
  $('#btn-history').addEventListener('click', openHistory);
  $('#btn-keys').addEventListener('click', openShortcuts);
  $('#btn-library').addEventListener('click', () => openLibrary(focusInput));
  $('#btn-examples')?.addEventListener('click', () => openLibrary(focusInput));
  $('#btn-templates').addEventListener('click', () => openTemplates());
  $('#btn-lang').addEventListener('click', () => { st.s.uiLang = st.s.uiLang === 'zh' ? 'en' : 'zh'; persist(); render(); });
  $('#btn-theme').addEventListener('click', () => { const s = st.s; s.theme = s.theme === 'system' ? 'light' : s.theme === 'light' ? 'dark' : 'system'; persist(); render(); });
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode!)));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => { st.view = b.dataset.view as View; render(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-render]').forEach((b) => b.addEventListener('click', () => { st.s.render = b.dataset.render as 'md' | 'raw'; persist(); render(); }));
  bindVariantTabs();
  $<HTMLSelectElement>('#out-lang').addEventListener('change', (e) => { st.s.outLang = (e.target as HTMLSelectElement).value; persist(); render(); if (st.s.outLang === 'custom') $('#custom-lang')?.focus(); });
  $('#custom-lang')?.addEventListener('input', (e) => { st.s.customLang = (e.target as HTMLInputElement).value; persist(); });
  // Refine
  document.querySelectorAll<HTMLButtonElement>('[data-refine]').forEach((b) => b.addEventListener('click', () => refine(REFINE_CHIPS[b.dataset.refine!], openSettings)));
  $('#refine-form')?.addEventListener('submit', (e) => { e.preventDefault(); const v = $<HTMLInputElement>('#refine-input').value; if (v.trim()) refine(v, openSettings); });
  $('#refine-stop')?.addEventListener('click', () => st.ctrl?.abort());
  // More menu
  const more = $('#btn-more'), pop = $('#more-menu');
  const setMenu = (open: boolean) => { pop.hidden = !open; more.setAttribute('aria-expanded', String(open)); if (open) (pop.querySelector('button') as HTMLElement)?.focus(); };
  more.addEventListener('click', (e) => { e.stopPropagation(); setMenu(pop.hidden); });
  pop.addEventListener('keydown', (e) => {
    const items = [...pop.querySelectorAll<HTMLElement>('[role=menuitem]')]; const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); more.focus(); }
  });
  $('#btn-export-md').addEventListener('click', () => { setMenu(false); exportMd(); });
  $('#btn-export-txt').addEventListener('click', () => { setMenu(false); download(`${slug()}.txt`, out()); });
  $('#btn-share').addEventListener('click', () => { setMenu(false); share(); });
}
document.addEventListener('click', (e) => { const pop = document.getElementById('more-menu'); if (pop && !pop.hidden && !(e.target as HTMLElement).closest('.menu')) { pop.hidden = true; $('#btn-more')?.setAttribute('aria-expanded', 'false'); } });
const focusInput = () => { const ta = $<HTMLTextAreaElement>('#input'); ta?.focus(); ta?.setSelectionRange(ta.value.length, ta.value.length); };

// ---- Keyboard ----
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const inModal = modalOpen();
  // Roving focus inside tablists / segmented controls.
  const tl = (e.target as HTMLElement)?.closest?.('[role=tablist]');
  if (tl && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !typing(e.target)) {
    const items = [...tl.querySelectorAll<HTMLElement>('button')]; const i = items.indexOf(e.target as HTMLElement);
    if (i >= 0) { e.preventDefault(); items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length].focus(); }
    return;
  }
  if (mod && e.key === 'Enter') {
    if (inModal || (e.target as HTMLElement)?.id === 'refine-input') return;
    e.preventDefault(); doConvert(); return;
  }
  if (e.key === 'Escape') {
    if (inModal) return;
    if (st.busy) { st.ctrl?.abort(); return; }
    if (isQuick) hideQuick();
    return;
  }
  if (isQuick || inModal) return;
  if (mod && e.shiftKey && e.code === 'KeyC') { if (out()) { e.preventDefault(); copyText(out()); } return; }
  if (mod && e.shiftKey && e.code === 'KeyR') { if (out() && !st.busy) { e.preventDefault(); openTestRun(); } return; }
  if (mod && e.key === ',') { e.preventDefault(); openSettings(); return; }
  if (mod && e.shiftKey && e.code === 'KeyH') { e.preventDefault(); openHistory(); return; }
  if (mod && e.shiftKey && e.code === 'KeyT') { e.preventDefault(); openTemplates(); return; }
  if (mod && e.shiftKey && e.code === 'KeyE') { e.preventDefault(); openLibrary(focusInput); return; }
  if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) {
    const m = allModes()[Number(e.code.slice(5)) - 1];
    if (m) { e.preventDefault(); setMode(m.id); }
    return;
  }
  if (e.key === '?' && !typing(e.target)) { e.preventDefault(); openShortcuts(); }
});

// Desktop: open external links in the system browser instead of the webview.
if (isDesktop) {
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
    if (a && /^https?:/.test(a.href) && (a.target === '_blank' || !a.href.startsWith(location.origin))) { e.preventDefault(); openExternal(a.href); }
  });
}

// Cross-window / cross-tab sync.
window.addEventListener('storage', (e) => {
  if (!e.key?.startsWith('pc.')) return;
  reloadSettings();
  if (!st.busy && !modalOpen()) render();
});
if (isQuick) onEvent('quick-shown', () => { if (st.busy) return; reloadSettings(); pasteClipboard(); });

onRender(render);

async function boot() {
  const sh = shareFromHash();
  if (sh) {
    const p = await decodeShare(sh);
    if (p) { st.input = p.i; st.outputs = [p.o]; st.shared = true; if (p.m && allModes().some((m) => m.id === p.m)) st.s.mode = p.m; }
    history.replaceState(null, '', location.pathname + location.search);
  }
  render();
  // Background update check (throttled, silent on failure). Only the main window shows the notice.
  if (st.s.autoUpdate && !isQuick) checkForUpdate().then((u) => { if (u) { st.update = u; if (u.available && !modalOpen()) render(); } });
  // PWA: offline support for the web build (not inside Tauri, not in dev).
  if (!isDesktop && import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* optional */ });
  }
}
boot();
