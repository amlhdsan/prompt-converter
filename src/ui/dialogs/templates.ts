import { deleteTemplate, loadTemplates, upsertTemplate, type Template } from '../../storage';
import { esc, modal, toast, uid } from '../dom';
import { persist, rerender, st, t } from '../state';

export function openTemplates(editId?: string) {
  const d = t();
  const list = loadTemplates();
  const cur: Template = list.find((x) => x.id === editId) ?? { id: '', name: '', icon: '⭐', prompt: '', at: 0 };
  modal(d.templates, `
    <div class="tpl-list" role="list">${list.length ? list.map((x) => `
      <div class="tpl-item${x.id === editId ? ' editing' : ''}" data-id="${esc(x.id)}" role="listitem">
        <span class="tpl-icon" aria-hidden="true">${esc(x.icon || '⭐')}</span>
        <div class="tpl-main"><div class="tpl-name">${esc(x.name)}</div><div class="small muted tpl-desc">${esc(x.prompt.slice(0, 90))}</div></div>
        <button class="ghost small" data-tpl-edit="${esc(x.id)}" aria-label="${d.edit} ${esc(x.name)}">${d.edit}</button>
        <button class="ghost small danger" data-tpl-del="${esc(x.id)}" aria-label="${d.del} ${esc(x.name)}">${d.del}</button>
      </div>`).join('') : `<div class="placeholder small">${d.tplEmpty}</div>`}</div>
    <div class="divider"></div>
    <div class="form">
      <div class="label">${cur.id ? d.editTemplate : d.newTemplate}</div>
      <div class="row tpl-row">
        <label class="tpl-icon-field">${d.tplIcon}<input id="f-tpl-icon" value="${esc(cur.icon)}" maxlength="4"/></label>
        <label class="grow">${d.tplName}<input id="f-tpl-name" value="${esc(cur.name)}" maxlength="40" spellcheck="false" ${cur.id ? 'autofocus' : ''}/></label>
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
      if (!cur.id) st.s.mode = 'tpl:' + tpl.id; persist();
      rerender(); openTemplates(); toast(d.tplSaved);
    });
    root.querySelector('#tpl-cancel')?.addEventListener('click', () => openTemplates());
    root.querySelectorAll<HTMLElement>('[data-tpl-edit]').forEach((b) => b.addEventListener('click', () => openTemplates(b.dataset.tplEdit)));
    root.querySelectorAll<HTMLButtonElement>('[data-tpl-del]').forEach((b) => b.addEventListener('click', () => {
      if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = d.confirmDel; return; }
      const id = b.dataset.tplDel!; deleteTemplate(id);
      if (st.s.mode === 'tpl:' + id) { st.s.mode = 'general'; persist(); }
      rerender(); openTemplates(); toast(d.tplDeleted);
    }));
  }, 'wide');
}
