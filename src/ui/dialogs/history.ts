import { clearHistory, deleteHistory, loadHistory, toggleFav } from '../../storage';
import { closeModal, esc, modal } from '../dom';
import { allModes, modeLabel } from '../actions';
import { icons } from '../icons';
import { persist, st, t } from '../state';
import { exportHistoryMd } from './tools';

let tab: 'all' | 'fav' = 'all';
let query = '';
export function openHistory() {
  const d = t();
  modal(d.history, `
    <div class="hist-tools">
      <input id="h-search" type="search" placeholder="${esc(d.search)}" aria-label="${esc(d.search)}" value="${esc(query)}" spellcheck="false" autocomplete="off"/>
      <div class="seg mini" role="tablist"><button role="tab" id="h-tab-all">${d.all}</button><button role="tab" id="h-tab-fav">★ ${d.favorites}</button></div>
    </div>
    <div class="hist" id="h-list" role="list"></div>
    <div class="row end" id="h-foot"></div>`, (root) => {
    const list = root.querySelector('#h-list')!;
    const draw = () => {
      const all = loadHistory();
      const qq = query.trim().toLowerCase();
      const h = all.filter((x) => (tab === 'all' || x.fav) && (!qq || (x.input + '\n' + x.output + '\n' + modeLabel(x.mode).label).toLowerCase().includes(qq)));
      list.innerHTML = h.length ? h.map((it) => {
        const ml = modeLabel(it.mode);
        return `
        <div class="hist-item${it.fav ? ' fav' : ''}" data-id="${esc(it.id)}" role="listitem">
          <div class="row between"><span class="badge">${esc(ml.icon)} ${esc(ml.label)}</span>
            <span class="row"><span class="muted small">${new Date(it.at).toLocaleString()} · ${esc(it.model)}</span>
              <button class="icon tiny star${it.fav ? ' on' : ''}" data-fav="${esc(it.id)}" title="${it.fav ? d.unfav : d.fav}" aria-label="${it.fav ? d.unfav : d.fav}" aria-pressed="${!!it.fav}">${icons.star}</button>
              <button class="icon tiny" data-del="${esc(it.id)}" title="${d.del}" aria-label="${d.del}">${icons.trash}</button></span></div>
          <button class="hist-open" data-open="${esc(it.id)}">
            <span class="hist-in">${esc(it.input.slice(0, 140))}</span>
            <span class="hist-out muted">${esc(it.output.slice(0, 200))}</span>
          </button>
        </div>`;
      }).join('') : `<div class="placeholder">${all.length ? d.noMatch : d.noHistory}</div>`;
      root.querySelector('#h-foot')!.innerHTML = all.length ? `<button class="ghost" id="h-export">${icons.download} ${d.exportHistoryMd}</button><button class="ghost danger" id="h-clear">${d.clearHistory}</button>` : '';
      root.querySelector('#h-export')?.addEventListener('click', exportHistoryMd);
      root.querySelector('#h-clear')?.addEventListener('click', () => { clearHistory(); draw(); });
      for (const [id, v] of [['h-tab-all', 'all'], ['h-tab-fav', 'fav']] as const) {
        const b = root.querySelector('#' + id)!; b.className = tab === v ? 'on' : ''; b.setAttribute('aria-selected', String(tab === v));
      }
    };
    list.addEventListener('click', (e) => {
      const tgt = e.target as HTMLElement;
      const fav = tgt.closest<HTMLElement>('[data-fav]'); if (fav) { toggleFav(fav.dataset.fav!); draw(); (root.querySelector(`[data-fav="${CSS.escape(fav.dataset.fav!)}"]`) as HTMLElement)?.focus(); return; }
      const del = tgt.closest<HTMLElement>('[data-del]'); if (del) { deleteHistory(del.dataset.del!); draw(); return; }
      const el = tgt.closest<HTMLElement>('.hist-item'); if (!el) return;
      const it = loadHistory().find((x) => x.id === el.dataset.id); if (!it) return;
      st.input = it.input; st.outputs = [it.output]; st.active = 0; st.error = '';
      if (allModes().some((m) => m.id === it.mode)) st.s.mode = it.mode;
      persist(); closeModal();
    });
    const search = root.querySelector('#h-search') as HTMLInputElement;
    search.addEventListener('input', () => { query = search.value; draw(); });
    root.querySelector('#h-tab-all')!.addEventListener('click', () => { tab = 'all'; draw(); });
    root.querySelector('#h-tab-fav')!.addEventListener('click', () => { tab = 'fav'; draw(); });
    draw(); search.focus();
  });
}
