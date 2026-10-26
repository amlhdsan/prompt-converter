// Template gallery: bundled packs + import from URL / JSON file; installs templates as custom modes.
import { pfetch } from '../../platform';
import { loadTemplates, upsertTemplate } from '../../storage';
import { BUNDLED, isPackUrl, parsePack, type GalleryTemplate, type Pack } from '../../lib/gallery';
import { readJSON, rawSet } from '../../storage';
import { esc, fmt, modal, toast } from '../dom';
import { persist, rerender, st, t } from '../state';

const IMPORTED = 'pc.packs.v1';
const loadImported = (): Pack[] => { const v = readJSON<unknown>(IMPORTED, []); if (!Array.isArray(v)) return []; return v.map((p) => { try { return parsePack(p); } catch { return null; } }).filter((p): p is Pack => !!p); };
const installedIds = () => new Set(loadTemplates().map((x) => x.id));

export function installTemplate(g: GalleryTemplate) {
  upsertTemplate({ id: g.id, name: g.name, icon: g.icon, prompt: g.prompt, at: Date.now() });
}

let filter = '';
export function openGallery() {
  const d = t(); const x = d.x;
  modal(x.gallery, `
    <p class="small muted">${x.galleryHint}</p>
    <div class="ws-tools"><input id="gl-search" type="search" placeholder="${esc(x.gallerySearch)}" value="${esc(filter)}" aria-label="${esc(x.gallerySearch)}" autocomplete="off"/></div>
    <div id="gl-packs"></div>
    <details class="gl-import"><summary>${x.galleryImport}</summary>
      <div class="pw"><input id="gl-url" type="url" placeholder="https://…/pack.json" spellcheck="false" autocomplete="off" aria-label="URL"/><button class="ghost small" id="gl-fetch">${x.galleryFetch}</button></div>
      <textarea id="gl-json" rows="3" placeholder='{"name":"My pack","templates":[{"name":"…","icon":"⭐","prompt":"…"}]}' aria-label="JSON" spellcheck="false"></textarea>
      <div class="row between"><span class="small muted" id="gl-status" aria-live="polite"></span><button class="ghost small" id="gl-add">${x.galleryAddJson}</button></div>
    </details>`, (root) => {
    const $r = <T extends HTMLElement = HTMLInputElement>(s: string) => root.querySelector(s) as T;
    const draw = () => {
      const have = installedIds(); const q = filter.trim().toLowerCase();
      const packs = [...BUNDLED, ...loadImported()];
      $r<HTMLElement>('#gl-packs').innerHTML = packs.map((p) => {
        const items = p.templates.filter((g) => !q || `${g.name} ${g.desc ?? ''} ${(g.tags ?? []).join(' ')}`.toLowerCase().includes(q));
        if (!items.length) return '';
        return `<section class="gl-pack"><div class="row between"><h3>${esc(p.name)}</h3><button class="ghost small" data-gl-all="${esc(p.id)}">${x.galleryInstallAll}</button></div>
          <div class="gl-grid">${items.map((g) => `<div class="gl-card"><div class="gl-icon" aria-hidden="true">${esc(g.icon)}</div><div class="gl-main"><strong>${esc(g.name)}</strong><span class="small muted">${esc(g.desc ?? g.prompt.slice(0, 80))}</span></div>
            ${have.has(g.id) ? `<span class="badge ok">✓ ${x.galleryInstalled}</span>` : `<button class="primary soft small" data-gl-install="${esc(p.id)}::${esc(g.id)}">${x.galleryInstall}</button>`}</div>`).join('')}</div></section>`;
      }).join('') || `<div class="placeholder small">${d.noMatch}</div>`;
    };
    const packById = (id: string) => [...BUNDLED, ...loadImported()].find((p) => p.id === id);
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const ins = el.closest<HTMLElement>('[data-gl-install]');
      if (ins) { const [pid, gid] = ins.dataset.glInstall!.split('::'); const g = packById(pid)?.templates.find((z) => z.id === gid); if (g) { installTemplate(g); toast(fmt(x.galleryDone, { n: 1 })); draw(); rerender(); } return; }
      const all = el.closest<HTMLElement>('[data-gl-all]');
      if (all) { const p = packById(all.dataset.glAll!); if (p) { p.templates.forEach(installTemplate); toast(fmt(x.galleryDone, { n: p.templates.length })); draw(); rerender(); } }
    });
    const status = $r<HTMLElement>('#gl-status');
    const addPack = (raw: unknown) => {
      try {
        const p = parsePack(raw);
        const list = loadImported().filter((z) => z.id !== p.id); list.unshift(p); rawSet(IMPORTED, JSON.stringify(list.slice(0, 20)));
        status.textContent = fmt(x.galleryImported, { n: p.templates.length, name: p.name }); draw();
      } catch { status.textContent = x.galleryInvalid; }
    };
    $r('#gl-fetch').addEventListener('click', async () => {
      const u = $r('#gl-url').value.trim(); if (!isPackUrl(u)) { status.textContent = x.galleryBadUrl; return; }
      status.textContent = '…';
      try { const r = await pfetch(u, { method: 'GET' }); if (!r.ok) throw new Error(String(r.status)); addPack(JSON.parse(await r.text())); }
      catch { status.textContent = x.galleryFetchFailed; }
    });
    $r('#gl-add').addEventListener('click', () => { try { addPack(JSON.parse($r<HTMLTextAreaElement>('#gl-json').value)); } catch { status.textContent = x.galleryInvalid; } });
    const s = $r('#gl-search'); s.addEventListener('input', () => { filter = s.value; draw(); });
    draw(); s.focus();
    void st; void persist;
  }, 'wide');
}
