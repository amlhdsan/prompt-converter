import { chat, listModels, LLMError } from '../../llm';
import { getErrors } from '../../lib/errlog';
import { openErrorLog } from './tools';
import { PROVIDERS, providerById, needsKey } from '../../providers';
import { ACCENTS, exportData, importData, ImportError, loadSettings, DEFAULT_HOTKEY, DEFAULT_SEL_HOTKEY, type Profile } from '../../storage';
import { openOnboarding } from './onboarding';
import { openStats } from './stats';
import { openSync } from './sync';
import { APP_VERSION, REPO_URL, checkForUpdate } from '../../update';
import { eventToAccelerator, getAutostart, isDesktop, prettyAccel, setAutostart, setHotkey, setSelectionHotkey } from '../../platform';
import { download, esc, fmt, modal, toast, uid } from '../dom';
import { errorMessage, inDemo, reqBase } from '../actions';
import { lang2, persist, rerender, st, t } from '../state';

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
  download(name, json, 'application/json'); return true;
}

let showAdv = false;
export function openSettings() {
  const d = t();
  const s = st.s;
  const prov = providerById(s.provider);
  const lang = lang2();
  const key = s.apiKeys[s.provider] || '';
  modal(d.settings, `
    <div class="form" id="set-form">
      <div class="set-top">
        <input id="set-search" type="search" placeholder="${esc(d.x.setSearch)}" aria-label="${esc(d.x.setSearch)}" autocomplete="off" spellcheck="false"/>
        <div class="seg mini" role="tablist" aria-label="${esc(d.x.setView)}"><button role="tab" id="set-basic" class="${showAdv ? '' : 'on'}" aria-selected="${!showAdv}">${d.x.setBasic}</button><button role="tab" id="set-adv" class="${showAdv ? 'on' : ''}" aria-selected="${showAdv}">${d.x.setAll}</button></div>
      </div>
      ${inDemo() ? `<div class="banner info small" id="set-demo">${d.x.demoSettings}</div>` : ''}
      <section class="profiles adv" aria-label="${d.profiles}">
        <span class="label">${d.profiles}</span>
        ${s.profiles.length ? `<div class="chips" id="p-list">${s.profiles.map((p) => `<span class="chip-wrap"><button data-profile="${esc(p.id)}" class="${s.activeProfile === p.id ? 'on' : ''}" title="${esc(providerById(p.provider).name)} · ${esc(p.model)}">${esc(p.name)}</button><button class="chip-x" data-profile-del="${esc(p.id)}" aria-label="${d.del} ${esc(p.name)}">×</button></span>`).join('')}</div>`
          : `<div class="small muted">${d.noProfiles}</div>`}
        <div class="pw"><input id="p-name" placeholder="${esc(d.profileName)}" aria-label="${esc(d.profileName)}" maxlength="40" autocomplete="off"/><button class="ghost small" id="p-save" type="button">＋ ${d.saveProfile}</button></div>
      </section>
      <div class="divider adv"></div>
      <div class="field"><span class="label" id="lbl-prov">${d.provider}</span><div class="chips" role="radiogroup" aria-labelledby="lbl-prov">${PROVIDERS.map((p) => `<button role="radio" aria-checked="${s.provider === p.id}" data-prov="${p.id}" class="${s.provider === p.id ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>
        ${prov.note ? `<span class="small muted">${esc(prov.note[lang])}</span>` : ''}</div>
      <label>${d.baseUrl}<input id="f-base" value="${esc(s.baseUrl)}" placeholder="https://your-endpoint/v1" spellcheck="false" autocomplete="off"/></label>
      <label><span class="row between">${d.model}<button class="ghost small" id="f-models" type="button">${d.fetchModels}</button></span>
        <input id="f-model" value="${esc(s.model)}" placeholder="model-name" spellcheck="false" list="model-list" autocomplete="off"/>
        <datalist id="model-list">${(prov.models ?? []).map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
        <span class="small muted" id="f-models-status" aria-live="polite"></span></label>
      ${needsKey(prov) || prov.id === 'custom' ? `<label><span class="row between">${d.apiKey}${prov.keyUrl ? `<a href="${prov.keyUrl}" target="_blank" rel="noopener" class="small">${d.getKey} ↗</a>` : ''}</span>
        <div class="pw"><input id="f-key" type="password" value="${esc(key)}" placeholder="sk-..." autocomplete="off" spellcheck="false"/><button class="ghost small" id="f-eye" type="button" aria-label="show / hide" aria-pressed="false">👁</button></div></label>`
        : `<div class="small muted" id="f-nokey">✓ ${d.noKeyNeeded}</div>`}
      <div class="row between wrap"><label class="check"><input type="checkbox" id="f-stream" ${s.stream ? 'checked' : ''}/> ${d.stream}</label>
        <button class="ghost small" id="f-conn" type="button">${d.connTest}</button></div>
      <div class="small muted" id="f-conn-status" aria-live="polite"></div>
      <div class="divider"></div>
      <div class="label">${d.x.appearance}</div>
      <div class="field"><span class="label small" id="lbl-acc">${d.x.accent}</span><div class="swatches" role="radiogroup" aria-labelledby="lbl-acc">${ACCENTS.map((c) => `<button role="radio" class="swatch${s.accent === c ? ' on' : ''}" aria-checked="${s.accent === c}" data-accent="${c}" style="--sw:${c}" aria-label="${c}"></button>`).join('')}<input type="color" id="f-accent" value="${esc(s.accent)}" aria-label="${esc(d.x.accentCustom)}"/></div></div>
      <div class="row wrap gap">
        <label class="inline">${d.x.fontSize}<select id="f-font">${(['sm', 'md', 'lg'] as const).map((f) => `<option value="${f}" ${s.fontSize === f ? 'selected' : ''}>${d.x[`font_${f}`]}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="f-compact" ${s.compact ? 'checked' : ''}/> ${d.x.compact}</label>
        <label class="check"><input type="checkbox" id="f-motion" ${s.motion === 'reduce' ? 'checked' : ''}/> ${d.x.reduceMotion}</label>
      </div>
      <div class="divider"></div>
      <div class="label">${d.x.behaviour}</div>
      <label class="check"><input type="checkbox" id="f-detect" ${s.autoDetect ? 'checked' : ''}/> ${d.x.autoDetect}</label>
      <label class="check"><input type="checkbox" id="f-autocopy" ${s.autoCopy ? 'checked' : ''}/> ${d.x.autoCopy}</label>
      <label class="check"><input type="checkbox" id="f-demo" ${s.demo ? 'checked' : ''}/> ${d.x.demoMode}</label>
      <div class="row wrap"><button class="ghost small" id="f-onboard" type="button">${d.x.rerunOnboarding}</button><button class="ghost small" id="f-stats" type="button">📊 ${d.x.stats}</button></div>
      <div class="adv">
      <div class="divider"></div>
      <div class="label">${d.advanced}</div>
      <div class="row wrap gap">
        <label class="inline">${d.variants}<select id="f-variants">${[1, 2, 3].map((n) => `<option ${s.variants === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="inline">${d.timeout}<input id="f-timeout" type="number" min="5" max="600" step="5" value="${s.timeoutSec}"/></label>
        <label class="inline">${d.retries}<select id="f-retries">${[0, 1, 2, 3].map((n) => `<option ${s.retries === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <label class="check"><input type="checkbox" id="f-score" ${s.showScore ? 'checked' : ''}/> ${d.showScore}</label>
      <label class="check"><input type="checkbox" id="f-session" ${s.sessionKeys ? 'checked' : ''}/> ${d.sessionKeys}</label>
      <label class="check"><input type="checkbox" id="f-statson" ${s.stats ? 'checked' : ''}/> ${d.x.statsRecord}</label>
      ${isDesktop ? `
      <div class="divider"></div>
      <div class="label">${d.desktop}</div>
      <label>${d.hotkey}<div class="pw"><input id="f-hotkey" readonly value="${esc(prettyAccel(s.hotkey))}" aria-describedby="f-hotkey-status"/><button class="ghost small" id="f-hotkey-reset" type="button">${d.reset}</button></div>
        <span class="small muted" id="f-hotkey-status" aria-live="polite">${d.hotkeyHint}</span></label>
      <label class="check"><input type="checkbox" id="f-autostart"/> ${d.autostart}</label>
      <label class="check"><input type="checkbox" id="f-quickcopy" ${s.quickAutoCopy ? 'checked' : ''}/> ${d.quickAutoCopy}</label>
      <label class="check"><input type="checkbox" id="f-autopaste" ${s.autoPaste ? 'checked' : ''}/> ${d.autoPaste}</label>
      <label>${d.x.selHotkey}<div class="pw"><input id="f-selhotkey" readonly value="${esc(prettyAccel(s.selHotkey))}" aria-describedby="f-selhotkey-status"/><button class="ghost small" id="f-selhotkey-reset" type="button">${d.reset}</button></div>
        <span class="small muted" id="f-selhotkey-status" aria-live="polite">${d.x.selHotkeyHint}</span></label>` : ''}
      <div class="divider"></div>
      <div class="label">${d.data}</div>
      <div class="row wrap">
        <button class="ghost" id="f-export" type="button">${d.exportData}</button>
        <button class="ghost" id="f-import" type="button">${d.importData}</button>
        <input type="file" id="f-import-file" accept="application/json,.json" hidden/>
      </div>
      <label class="check"><input type="checkbox" id="f-export-keys"/> ${d.includeKeys}</label>
      <div class="small muted" id="f-data-status" aria-live="polite"></div>
      <div class="row between wrap"><span class="small muted">☁️ ${d.x.sync}${s.sync.kind !== 'off' ? ` · ${s.sync.kind === 'gist' ? 'Gist' : 'WebDAV'}` : ''}</span><button class="ghost small" id="f-sync" type="button">${d.x.syncSetup}</button></div>
      <div class="row between wrap"><label class="check"><input type="checkbox" id="f-errlog" ${s.errorLog ? 'checked' : ''}/> ${d.errorLog}</label>
        <button class="ghost small" id="f-viewlog" type="button">${d.viewLog} (${getErrors().length})</button></div>
      </div>
      <div class="divider"></div>
      <div class="row between"><span class="label">${d.version} <strong>v${APP_VERSION}</strong> <a class="small" href="${REPO_URL}/blob/main/CHANGELOG.md" target="_blank" rel="noopener">CHANGELOG ↗</a></span>
        <button class="ghost" id="f-check" type="button">${d.checkUpdate}</button></div>
      <div class="small muted" id="f-check-status" aria-live="polite"></div>
      <label class="check"><input type="checkbox" id="f-auto" ${s.autoUpdate ? 'checked' : ''}/> ${d.autoUpdate}</label>
      <p class="privacy small">${d.privacy}</p>
      <div class="row end"><button class="primary" data-close>${d.save}</button></div>
    </div>`, (root) => {
    const q = <T extends HTMLElement = HTMLInputElement>(id: string) => root.querySelector('#' + id) as T;
    const form = q<HTMLElement>('set-form');
    const applyView = () => { form.classList.toggle('show-adv', showAdv || !!q('set-search').value.trim()); q('set-basic').className = showAdv ? '' : 'on'; q('set-adv').className = showAdv ? 'on' : ''; q('set-basic').setAttribute('aria-selected', String(!showAdv)); q('set-adv').setAttribute('aria-selected', String(showAdv)); };
    q('set-basic').addEventListener('click', () => { showAdv = false; applyView(); });
    q('set-adv').addEventListener('click', () => { showAdv = true; applyView(); });
    q('set-search').addEventListener('input', () => {
      const term = q('set-search').value.trim().toLowerCase(); applyView();
      form.querySelectorAll<HTMLElement>('label, .field, .profiles, .row.between, .row.wrap').forEach((el) => {
        if (el.closest('.set-top')) return;
        el.classList.toggle('search-hide', !!term && !el.textContent!.toLowerCase().includes(term));
      });
      form.classList.toggle('searching', !!term);
    });
    applyView();
    const ap = () => { persist(); rerender(); };
    root.querySelectorAll<HTMLElement>('[data-accent]').forEach((b) => b.addEventListener('click', () => { s.accent = b.dataset.accent!; ap(); root.querySelectorAll('[data-accent]').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-checked', String(o === b)); }); q('f-accent').value = s.accent; }));
    q('f-accent').addEventListener('input', (e) => { s.accent = (e.target as HTMLInputElement).value; ap(); });
    q<HTMLSelectElement>('f-font').addEventListener('change', (e) => { s.fontSize = (e.target as HTMLSelectElement).value as typeof s.fontSize; ap(); });
    q('f-compact').addEventListener('change', (e) => { s.compact = (e.target as HTMLInputElement).checked; ap(); });
    q('f-motion').addEventListener('change', (e) => { s.motion = (e.target as HTMLInputElement).checked ? 'reduce' : 'system'; ap(); });
    q('f-detect').addEventListener('change', (e) => { s.autoDetect = (e.target as HTMLInputElement).checked; persist(); });
    q('f-autocopy').addEventListener('change', (e) => { s.autoCopy = (e.target as HTMLInputElement).checked; persist(); });
    q('f-demo').addEventListener('change', (e) => { s.demo = (e.target as HTMLInputElement).checked; persist(); rerender(); });
    q('f-statson').addEventListener('change', (e) => { s.stats = (e.target as HTMLInputElement).checked; persist(); });
    q('f-onboard').addEventListener('click', () => openOnboarding());
    q('f-stats').addEventListener('click', () => openStats());
    q('f-sync').addEventListener('click', () => openSync());
    const reopen = () => { const y = root.closest('.overlay')?.querySelector('.modal')?.scrollTop ?? 0; openSettings(); const m = document.querySelector('#modal-root .modal'); if (m) m.scrollTop = y; };
    const clearProfile = () => { if (st.s.activeProfile) { st.s.activeProfile = ''; root.querySelectorAll('[data-profile]').forEach((b) => b.classList.remove('on')); } };
    root.querySelectorAll<HTMLButtonElement>('[data-prov]').forEach((b) => b.addEventListener('click', () => {
      const p = providerById(b.dataset.prov!);
      s.provider = p.id; if (p.id !== 'custom') { s.baseUrl = p.baseUrl; s.model = p.model; }
      s.activeProfile = ''; persist(); reopen(); (document.querySelector(`[data-prov="${p.id}"]`) as HTMLElement)?.focus();
    }));
    q('f-base').addEventListener('input', (e) => { s.baseUrl = (e.target as HTMLInputElement).value; clearProfile(); persist(); });
    q('f-model').addEventListener('input', (e) => { s.model = (e.target as HTMLInputElement).value; clearProfile(); persist(); });
    q('f-key')?.addEventListener('input', (e) => { s.apiKeys[s.provider] = (e.target as HTMLInputElement).value.trim(); clearProfile(); persist(); });
    q('f-eye')?.addEventListener('click', () => { const k = q('f-key'); const show = k.type === 'password'; k.type = show ? 'text' : 'password'; q('f-eye').setAttribute('aria-pressed', String(show)); });
    q('f-stream').addEventListener('change', (e) => { s.stream = (e.target as HTMLInputElement).checked; persist(); });
    q('f-auto').addEventListener('change', (e) => { s.autoUpdate = (e.target as HTMLInputElement).checked; persist(); });
    q<HTMLSelectElement>('f-variants').addEventListener('change', (e) => { s.variants = Number((e.target as HTMLSelectElement).value); persist(); });
    q('f-timeout').addEventListener('change', (e) => { s.timeoutSec = Math.min(600, Math.max(5, Number((e.target as HTMLInputElement).value) || 60)); persist(); });
    q<HTMLSelectElement>('f-retries').addEventListener('change', (e) => { s.retries = Number((e.target as HTMLSelectElement).value); persist(); });
    q('f-errlog').addEventListener('change', (e) => { s.errorLog = (e.target as HTMLInputElement).checked; persist(); });
    q('f-viewlog').addEventListener('click', () => openErrorLog());
    q('f-conn').addEventListener('click', async () => {
      const stEl = q('f-conn-status'); const btn = q<HTMLButtonElement>('f-conn');
      stEl.textContent = d.connTesting; btn.disabled = true;
      const t0 = performance.now();
      try {
        await chat({ ...reqBase(), stream: false, retries: 0, maxTokens: 8, timeoutMs: 20_000, messages: [{ role: 'user', content: 'ping' }] });
        stEl.textContent = '✓ ' + fmt(d.connOk, { ms: Math.round(performance.now() - t0), model: s.model });
      } catch (e) {
        // An empty reply still proves the endpoint, key and model work.
        if (e instanceof LLMError && e.kind === 'empty') stEl.textContent = '✓ ' + fmt(d.connOk, { ms: Math.round(performance.now() - t0), model: s.model });
        else stEl.textContent = '✕ ' + errorMessage(e);
      } finally { btn.disabled = false; }
    });
    q('f-score').addEventListener('change', (e) => { s.showScore = (e.target as HTMLInputElement).checked; persist(); });
    q('f-session').addEventListener('change', (e) => { s.sessionKeys = (e.target as HTMLInputElement).checked; persist(); });
    // Model list
    q('f-models').addEventListener('click', async () => {
      const stEl = q('f-models-status'); stEl.textContent = d.fetching;
      try {
        const ids = await listModels(s.baseUrl, s.apiKeys[s.provider] || '', providerById(s.provider).kind);
        q('model-list').innerHTML = ids.map((m) => `<option value="${esc(m)}">`).join('');
        stEl.textContent = fmt(d.modelsFound, { n: ids.length }) + (ids.length ? ` · ${ids.slice(0, 6).join(', ')}${ids.length > 6 ? '…' : ''}` : '');
        if (ids.length && !ids.includes(s.model)) q('f-model').focus();
      } catch (e) { stEl.textContent = `${d.modelsFailed}: ${errorMessage(e)}`; }
    });
    // Profiles
    q('p-save').addEventListener('click', () => {
      const name = q('p-name').value.trim() || `${providerById(s.provider).name} · ${s.model}`;
      const p: Profile = { id: uid(), name, provider: s.provider, baseUrl: s.baseUrl, model: s.model, apiKey: s.apiKeys[s.provider] || '' };
      s.profiles = [...s.profiles, p]; s.activeProfile = p.id; persist(); reopen(); toast(d.profileSaved);
    });
    root.querySelectorAll<HTMLButtonElement>('[data-profile]').forEach((b) => b.addEventListener('click', () => {
      const p = s.profiles.find((x) => x.id === b.dataset.profile); if (!p) return;
      s.provider = p.provider; s.baseUrl = p.baseUrl; s.model = p.model; if (p.apiKey) s.apiKeys[p.provider] = p.apiKey;
      s.activeProfile = p.id; persist(); reopen();
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-profile-del]').forEach((b) => b.addEventListener('click', () => {
      s.profiles = s.profiles.filter((x) => x.id !== b.dataset.profileDel); if (s.activeProfile === b.dataset.profileDel) s.activeProfile = '';
      persist(); reopen(); toast(d.profileDeleted);
    }));
    // Update check
    q('f-check').addEventListener('click', async () => {
      const stEl = q('f-check-status'); stEl.textContent = d.checking;
      try {
        st.update = await checkForUpdate(true);
        if (st.update?.available) { s.dismissedUpdate = ''; persist(); }
        stEl.innerHTML = st.update?.available
          ? `${esc(st.update.kind === 'release' ? `${d.updateTitle}: v${st.update.latest}` : `${d.updateCommit} (${st.update.latest})`)} · <a href="${esc(st.update.url)}" target="_blank" rel="noopener">${d.changelog} ↗</a>`
          : d.upToDate;
      } catch { stEl.textContent = d.checkFailed; }
    });
    // Data import / export
    const ds = q('f-data-status');
    q('f-export').addEventListener('click', async () => {
      const json = JSON.stringify(exportData(APP_VERSION, { settings: true, templates: true, history: true, keys: q('f-export-keys').checked }), null, 2);
      try { if (await saveBackup(json)) { ds.textContent = d.exported; toast(d.exported); } } catch (e) { ds.textContent = String(e); }
    });
    q('f-import').addEventListener('click', () => q('f-import-file').click());
    q('f-import-file').addEventListener('change', async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
      try {
        if (f.size > 20 * 1024 * 1024) throw new Error('too large');
        let raw: unknown; try { raw = JSON.parse(await f.text()); } catch { throw new ImportError('invalid'); }
        const r = importData(raw);
        const ui = st.s.uiLang; st.s = loadSettings(); if (!r.settings) st.s.uiLang = ui;
        const msg = fmt(t().imported, { s: r.settings ? t().yes : t().no, t: r.templates, h: r.history });
        rerender(); openSettings(); toast(msg); (document.querySelector('#f-data-status') as HTMLElement).textContent = msg;
      } catch (err) { const m = err instanceof ImportError && err.message === 'newer' ? d.importNewer : d.importFailed; ds.textContent = m; toast(m); }
      (e.target as HTMLInputElement).value = '';
    });
    if (isDesktop) bindDesktop(root);
  });
}

function bindDesktop(root: HTMLElement) {
  const d = t(); const s = st.s;
  const hk = root.querySelector('#f-hotkey') as HTMLInputElement;
  const stEl = root.querySelector('#f-hotkey-status')!;
  const apply = async (accel: string) => {
    try { await setHotkey(accel); s.hotkey = accel; persist(); hk.value = prettyAccel(accel); stEl.textContent = d.hotkeySaved; }
    catch (e) { stEl.textContent = `${d.hotkeyFailed}: ${e}`; hk.value = prettyAccel(s.hotkey); }
  };
  hk.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Escape') return; // keep keyboard navigation working
    e.preventDefault(); e.stopPropagation();
    const a = eventToAccelerator(e); if (a) apply(a);
  });
  root.querySelector('#f-hotkey-reset')!.addEventListener('click', () => apply(DEFAULT_HOTKEY));
  const sk = root.querySelector('#f-selhotkey') as HTMLInputElement; const sks = root.querySelector('#f-selhotkey-status')!;
  const applySel = async (accel: string) => {
    try { await setSelectionHotkey(accel); s.selHotkey = accel; persist(); sk.value = prettyAccel(accel); sks.textContent = d.hotkeySaved; }
    catch (e) { sks.textContent = `${d.hotkeyFailed}: ${e}`; sk.value = prettyAccel(s.selHotkey); }
  };
  sk.addEventListener('keydown', (e) => { if (e.key === 'Tab' || e.key === 'Escape') return; e.preventDefault(); e.stopPropagation(); const a = eventToAccelerator(e); if (a) applySel(a); });
  root.querySelector('#f-selhotkey-reset')!.addEventListener('click', () => applySel(DEFAULT_SEL_HOTKEY));
  const as = root.querySelector('#f-autostart') as HTMLInputElement;
  getAutostart().then((v) => (as.checked = v)).catch(() => (as.disabled = true));
  as.addEventListener('change', () => setAutostart(as.checked).catch(() => (as.checked = !as.checked)));
  (root.querySelector('#f-quickcopy') as HTMLInputElement).addEventListener('change', (e) => { s.quickAutoCopy = (e.target as HTMLInputElement).checked; persist(); });
  (root.querySelector('#f-autopaste') as HTMLInputElement).addEventListener('change', (e) => { s.autoPaste = (e.target as HTMLInputElement).checked; if (s.autoPaste) s.quickAutoCopy = true; persist(); });
}
