// Prompt workspace: saved prompts with folders, tags, stars, search, reuse and per-prompt version history.
import { deletePrompt, loadWorkspace, saveWorkspace, upsertPrompt } from '../../storage';
import { allFolders, allTags, normTags, restoreVersion, searchPrompts, withNewBody, type Query, type SavedPrompt } from '../../lib/workspace';
import { diffHtml } from '../../lib/diff';
import { closeModal, copyText, esc, fmt, modal, toast, uid, undoToast } from '../dom';
import { modeLabel } from '../actions';
import { icons } from '../icons';
import { out, persist, st, t } from '../state';

const q: Query = { text: '', folder: '*', sort: 'updated' };

/** Saves the current result (or input when there is no result) to the workspace. Returns the saved prompt. */
export function saveCurrent(): SavedPrompt | null {
  const body = out() || st.input;
  if (!body.trim()) return null;
  const list = loadWorkspace();
  // Same source + mode → treat as a new version of that prompt.
  const existing = list.find((p) => p.source && p.source === st.input && p.mode === st.s.mode && out());
  const now = Date.now();
  const p = existing ? withNewBody(existing, body, undefined, now) : { id: uid(), title: (st.input || body).split('\n')[0].slice(0, 60), body, source: out() ? st.input : undefined, mode: st.s.mode, tags: [], folder: '', at: now, updated: now, versions: [], uses: 0 };
  upsertPrompt(p);
  toast(existing ? t().x.wsVersionSaved : t().x.wsSaved);
  return p;
}

export function openWorkspace(focusId?: string) {
  const d = t(); const x = d.x;
  modal(x.workspace, `
    <div class="ws-tools">
      <input id="ws-search" type="search" placeholder="${esc(x.wsSearch)}" aria-label="${esc(x.wsSearch)}" value="${esc(q.text ?? '')}" autocomplete="off" spellcheck="false"/>
      <select id="ws-folder" aria-label="${esc(x.wsFolder)}"></select>
      <select id="ws-sort" aria-label="${esc(x.wsSort)}"><option value="updated">${x.wsSortUpdated}</option><option value="title">${x.wsSortTitle}</option><option value="uses">${x.wsSortUses}</option></select>
      <button class="ghost small${q.starred ? ' on' : ''}" id="ws-star" aria-pressed="${!!q.starred}">★ ${d.favorites}</button>
    </div>
    <div class="chips small-chips" id="ws-tags" role="group" aria-label="${esc(x.wsTags)}"></div>
    <div class="ws-list" id="ws-list" role="list"></div>
    <div class="row between wrap"><span class="small muted" id="ws-count"></span><button class="primary soft" id="ws-save-cur" ${out() || st.input.trim() ? '' : 'disabled'}>${icons.plus} ${x.wsSaveCurrent}</button></div>`, (root) => {
    const $r = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
    const draw = () => {
      const all = loadWorkspace();
      const folders = allFolders(all);
      $r<HTMLSelectElement>('#ws-folder').innerHTML = `<option value="*">${x.wsAllFolders}</option><option value="">${x.wsNoFolder}</option>${folders.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}`;
      $r<HTMLSelectElement>('#ws-folder').value = q.folder ?? '*';
      $r<HTMLSelectElement>('#ws-sort').value = q.sort ?? 'updated';
      $r('#ws-tags').innerHTML = allTags(all).slice(0, 20).map(([tag, n]) => `<button data-tag="${esc(tag)}" class="${q.tag === tag ? 'on' : ''}" aria-pressed="${q.tag === tag}">#${esc(tag)} <span class="muted">${n}</span></button>`).join('');
      const list = searchPrompts(all, q);
      $r('#ws-count').textContent = fmt(x.wsCount, { n: list.length, total: all.length });
      $r('#ws-list').innerHTML = list.length ? list.map((p) => `
        <div class="ws-item${p.star ? ' fav' : ''}${p.id === focusId ? ' editing' : ''}" data-id="${esc(p.id)}" role="listitem">
          <div class="row between">
            <strong class="ws-title">${esc(p.title)}</strong>
            <span class="row">
              <button class="icon tiny star${p.star ? ' on' : ''}" data-ws-star="${esc(p.id)}" aria-pressed="${!!p.star}" aria-label="${p.star ? d.unfav : d.fav}" title="${p.star ? d.unfav : d.fav}">${icons.star}</button>
              <button class="icon tiny" data-ws-del="${esc(p.id)}" aria-label="${d.del}" title="${d.del}">${icons.trash}</button>
            </span>
          </div>
          <div class="small muted ws-meta">${p.folder ? `📁 ${esc(p.folder)} · ` : ''}${p.mode ? `${esc(modeLabel(p.mode).icon)} ${esc(modeLabel(p.mode).label)} · ` : ''}${new Date(p.updated).toLocaleDateString()}${p.versions.length ? ` · ${fmt(x.wsVersions, { n: p.versions.length + 1 })}` : ''}${p.uses ? ` · ${fmt(x.wsUses, { n: p.uses })}` : ''}</div>
          <div class="small ws-body">${esc(p.body.slice(0, 220))}</div>
          ${p.tags.length ? `<div class="tags">${p.tags.map((tg) => `<span class="tag">#${esc(tg)}</span>`).join('')}</div>` : ''}
          <div class="row wrap ws-actions">
            <button class="primary soft small" data-ws-use="${esc(p.id)}">${x.wsUse}</button>
            <button class="ghost small" data-ws-copy="${esc(p.id)}">${icons.copy} ${d.copy}</button>
            <button class="ghost small" data-ws-edit="${esc(p.id)}">${d.edit}</button>
            ${p.versions.length ? `<button class="ghost small" data-ws-hist="${esc(p.id)}">${icons.clock} ${x.wsHistory}</button>` : ''}
          </div>
        </div>`).join('') : `<div class="placeholder"><div class="ph-icon" aria-hidden="true">🗂️</div>${all.length ? d.noMatch : x.wsEmpty}<span class="small">${all.length ? '' : x.wsEmptyTip}</span></div>`;
    };
    const find = (id: string) => loadWorkspace().find((p) => p.id === id);
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const a = (attr: string) => el.closest<HTMLElement>(`[data-${attr}]`)?.dataset[attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())];
      let id: string | undefined;
      if ((id = a('tag'))) { q.tag = q.tag === id ? undefined : id; draw(); return; }
      if ((id = a('ws-star'))) { const p = find(id); if (p) { upsertPrompt({ ...p, star: !p.star }); draw(); } return; }
      if ((id = a('ws-del'))) {
        const before = loadWorkspace(); deletePrompt(id); draw();
        undoToast(x.wsDeleted, () => { saveWorkspace(before); if (document.querySelector('#ws-list')) draw(); });
        return;
      }
      if ((id = a('ws-copy'))) { const p = find(id); if (p) copyText(p.body); return; }
      if ((id = a('ws-use'))) {
        const p = find(id); if (!p) return;
        upsertPrompt({ ...p, uses: (p.uses ?? 0) + 1 });
        st.input = p.source ?? p.body; st.outputs = p.source ? [p.body] : []; st.active = 0; st.error = '';
        if (p.mode) st.s.mode = p.mode; persist(); closeModal(); return;
      }
      if ((id = a('ws-edit'))) { openEditor(id); return; }
      if ((id = a('ws-hist'))) { openVersions(id); return; }
    });
    const search = $r<HTMLInputElement>('#ws-search');
    search.addEventListener('input', () => { q.text = search.value; draw(); });
    $r<HTMLSelectElement>('#ws-folder').addEventListener('change', (e) => { q.folder = (e.target as HTMLSelectElement).value; draw(); });
    $r<HTMLSelectElement>('#ws-sort').addEventListener('change', (e) => { q.sort = (e.target as HTMLSelectElement).value as Query['sort']; draw(); });
    $r('#ws-star').addEventListener('click', (e) => { q.starred = !q.starred; (e.currentTarget as HTMLElement).classList.toggle('on', q.starred); (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(q.starred)); draw(); });
    $r('#ws-save-cur').addEventListener('click', () => { const p = saveCurrent(); if (p) openEditor(p.id); });
    draw(); search.focus();
  }, 'wide');
}

function openEditor(id: string) {
  const d = t(); const x = d.x;
  const p = loadWorkspace().find((v) => v.id === id); if (!p) return;
  const folders = allFolders(loadWorkspace());
  modal(x.wsEdit, `<div class="form">
    <label>${x.wsTitle}<input id="we-title" value="${esc(p.title)}" maxlength="120"/></label>
    <div class="row gap wrap"><label class="grow">${x.wsFolder}<input id="we-folder" list="we-folders" value="${esc(p.folder)}" maxlength="60" placeholder="${esc(x.wsNoFolder)}"/><datalist id="we-folders">${folders.map((f) => `<option value="${esc(f)}">`).join('')}</datalist></label>
      <label class="grow">${x.wsTags}<input id="we-tags" value="${esc(p.tags.join(', '))}" placeholder="${esc(x.wsTagsHint)}"/></label></div>
    <label>${x.wsBody}<textarea id="we-body" rows="10" spellcheck="false">${esc(p.body)}</textarea></label>
    <label>${x.wsNote}<input id="we-note" maxlength="200" placeholder="${esc(x.wsNoteHint)}"/></label>
    <div class="row end"><button class="ghost" id="we-cancel">${d.cancel}</button><button class="primary" id="we-save">${d.save}</button></div></div>`, (root) => {
    const v = (s: string) => (root.querySelector(s) as HTMLInputElement).value;
    root.querySelector('#we-cancel')!.addEventListener('click', () => openWorkspace(id));
    root.querySelector('#we-save')!.addEventListener('click', () => {
      const cur = loadWorkspace().find((z) => z.id === id) ?? p;
      const next = { ...withNewBody(cur, v('#we-body'), v('#we-note').trim() || undefined), title: v('#we-title').trim() || cur.title, folder: v('#we-folder').trim(), tags: normTags(v('#we-tags')) };
      upsertPrompt(next); toast(x.wsSaved); openWorkspace(id);
    });
    (root.querySelector('#we-title') as HTMLElement).focus();
  }, 'wide');
}

function openVersions(id: string) {
  const d = t(); const x = d.x;
  const p = loadWorkspace().find((v) => v.id === id); if (!p) return;
  let sel = 0;
  modal(`${x.wsHistory} · ${esc(p.title)}`, `<div class="ver-layout"><div class="ver-list" role="listbox" id="ver-list" aria-label="${esc(x.wsHistory)}"></div><div class="ver-view"><div class="small muted" id="ver-label"></div><div class="diffview" id="ver-diff"></div>
    <div class="row end"><button class="ghost" id="ver-back">${x.back}</button><button class="ghost" id="ver-copy">${icons.copy} ${d.copy}</button><button class="primary" id="ver-restore">${x.wsRestore}</button></div></div></div>`, (root) => {
    const draw = () => {
      const all = [{ at: p.updated, body: p.body, note: x.wsCurrent }, ...p.versions];
      root.querySelector('#ver-list')!.innerHTML = all.map((v, i) => `<button role="option" aria-selected="${i === sel}" class="ver-item${i === sel ? ' on' : ''}" data-ver="${i}"><span>${i === 0 ? '● ' : ''}${new Date(v.at).toLocaleString()}</span>${v.note ? `<span class="small muted">${esc(v.note)}</span>` : ''}</button>`).join('');
      const v = all[sel];
      root.querySelector('#ver-label')!.textContent = sel === 0 ? x.wsCurrent : x.wsDiffHint;
      root.querySelector('#ver-diff')!.innerHTML = sel === 0 ? esc(p.body) : diffHtml(v.body, p.body).html;
      (root.querySelector('#ver-restore') as HTMLButtonElement).disabled = sel === 0;
    };
    root.querySelector('#ver-list')!.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ver]'); if (b) { sel = Number(b.dataset.ver); draw(); } });
    root.querySelector('#ver-back')!.addEventListener('click', () => openWorkspace(id));
    root.querySelector('#ver-copy')!.addEventListener('click', () => copyText(sel === 0 ? p.body : p.versions[sel - 1].body));
    root.querySelector('#ver-restore')!.addEventListener('click', () => { if (sel > 0) { upsertPrompt(restoreVersion(p, sel - 1)); toast(x.wsRestored); openWorkspace(id); } });
    draw();
  }, 'wide');
}
