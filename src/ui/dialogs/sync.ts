// Cloud sync settings + push/pull (WebDAV or private GitHub Gist), merging by id (newest wins).
import { exportData, importData, loadHistory, loadSettings, loadTemplates, loadWorkspace, saveSettings } from '../../storage';
import { mergeById, pull, push, SyncError, type SyncConfig } from '../../lib/sync';
import { APP_VERSION } from '../../update';
import { esc, fmt, modal, toast } from '../dom';
import { persist, rerender, st, t } from '../state';

/** Pull → merge → push. Returns a short summary. */
export async function syncNow(): Promise<string> {
  const d = t(); const x = d.x; const c = st.s.sync;
  const remote = await pull(c) as { history?: unknown[]; templates?: unknown[]; workspace?: unknown[]; settings?: Record<string, unknown> } | null;
  let merged = 0;
  if (remote && typeof remote === 'object') {
    // Merge remote lists into local first (importData validates and merges by id).
    const r = importData({ app: 'prompt-converter', ...remote, settings: undefined });
    merged = r.history + r.templates + (r.workspace ?? 0);
  }
  const b = exportData(APP_VERSION, { settings: true, templates: true, history: true, keys: c.includeKeys });
  if (b.settings) { const s = b.settings as Partial<typeof st.s>; delete s.sync; delete s.onboarded; }
  b.history = mergeById(loadHistory(), []); b.templates = loadTemplates(); b.workspace = loadWorkspace();
  const id = await push(c, b);
  const cur = loadSettings();
  cur.sync = { ...cur.sync, lastSync: Date.now(), ...(id ? { gistId: id } : {}) };
  saveSettings(cur); st.s.sync = cur.sync;
  return fmt(x.syncDone, { n: merged });
}

export function syncError(e: unknown): string {
  const x = t().x;
  if (e instanceof SyncError) return ({ config: x.syncErrConfig, auth: x.syncErrAuth, notfound: x.syncErrNotFound, network: x.syncErrNetwork, http: x.syncErrHttp, format: x.syncErrFormat })[e.kind] + (e.kind === 'http' ? ` (${e.message})` : '');
  return String((e as Error)?.message ?? e);
}

export function openSync() {
  const d = t(); const x = d.x; const c: SyncConfig = st.s.sync;
  modal(x.sync, `<p class="small muted">${x.syncHint}</p>
    <div class="seg mini" role="radiogroup" id="sy-kind">${(['off', 'webdav', 'gist'] as const).map((k) => `<button role="radio" data-sy="${k}" aria-checked="${c.kind === k}" class="${c.kind === k ? 'on' : ''}">${k === 'off' ? x.syncOff : k === 'webdav' ? 'WebDAV' : 'GitHub Gist'}</button>`).join('')}</div>
    <div class="form" ${c.kind === 'webdav' ? '' : 'hidden'} id="sy-dav">
      <label>${x.syncUrl}<input id="sy-url" type="url" value="${esc(c.url)}" placeholder="https://dav.example.com/remote.php/dav/files/me/" spellcheck="false" autocomplete="off"/></label>
      <div class="row gap wrap"><label class="grow">${x.syncUser}<input id="sy-user" value="${esc(c.user)}" autocomplete="off"/></label><label class="grow">${x.syncPass}<input id="sy-pass" type="password" value="${esc(c.pass)}" autocomplete="off"/></label></div>
    </div>
    <div class="form" ${c.kind === 'gist' ? '' : 'hidden'} id="sy-gist">
      <label><span class="row between">${x.syncToken}<a class="small" href="https://github.com/settings/tokens/new?scopes=gist&description=Prompt%20Converter%20sync" target="_blank" rel="noopener">${x.syncCreateToken} ↗</a></span><input id="sy-token" type="password" value="${esc(c.token)}" placeholder="ghp_… / github_pat_…" autocomplete="off" spellcheck="false"/></label>
      <label>Gist ID<input id="sy-gid" value="${esc(c.gistId)}" placeholder="${esc(x.syncGistAuto)}" autocomplete="off" spellcheck="false"/></label>
    </div>
    <label class="check"><input type="checkbox" id="sy-keys" ${c.includeKeys ? 'checked' : ''}/> ${x.syncIncludeKeys}</label>
    <div class="row between wrap"><span class="small muted" id="sy-status" aria-live="polite">${c.lastSync ? fmt(x.syncLast, { t: new Date(c.lastSync).toLocaleString() }) : ''}</span>
      <button class="primary" id="sy-now" ${c.kind === 'off' ? 'disabled' : ''}>${x.syncNow}</button></div>`, (root) => {
    const $r = <T extends HTMLElement = HTMLInputElement>(s: string) => root.querySelector(s) as T;
    const save = () => {
      st.s.sync = { ...st.s.sync, url: $r('#sy-url').value.trim(), user: $r('#sy-user').value, pass: $r('#sy-pass').value, token: $r('#sy-token').value.trim(), gistId: $r('#sy-gid').value.trim(), includeKeys: $r('#sy-keys').checked };
      persist();
    };
    root.querySelectorAll<HTMLElement>('[data-sy]').forEach((b) => b.addEventListener('click', () => { save(); st.s.sync = { ...st.s.sync, kind: b.dataset.sy as SyncConfig['kind'] }; persist(); openSync(); }));
    root.addEventListener('input', save); root.addEventListener('change', save);
    $r('#sy-now').addEventListener('click', async () => {
      save(); const el = $r<HTMLElement>('#sy-status'); const btn = $r<HTMLButtonElement>('#sy-now');
      el.innerHTML = `<span class="spin"></span>${esc(x.syncing)}`; btn.disabled = true;
      try { const msg = await syncNow(); el.textContent = '✓ ' + msg; $r('#sy-gid').value = st.s.sync.gistId; toast(msg); rerender(); }
      catch (e) { el.textContent = '✕ ' + syncError(e); }
      finally { btn.disabled = false; }
    });
  });
}
