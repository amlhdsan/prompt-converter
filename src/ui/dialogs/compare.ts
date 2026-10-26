// Multi-model side-by-side comparison of a conversion (or a test run of the current result).
import { chat, LLMError, type ChatMessage } from '../../llm';
import { buildMessages, buildTestRun } from '../../prompts';
import { providerById } from '../../providers';
import { renderMarkdown } from '../../lib/markdown';
import { estimateTokens } from '../../lib/tokens';
import { copyText, esc, fmt, modal, toast } from '../dom';
import { currentMode, errorMessage, inDemo, strip, track } from '../actions';
import { icons } from '../icons';
import { out, st, t } from '../state';
import { demoOutput, fakeStream } from '../../lib/demo';
import { lang2 } from '../state';

interface Target { id: string; label: string; provider: string; baseUrl: string; model: string; apiKey: string }
function targets(): Target[] {
  const s = st.s;
  const cur: Target = { id: 'current', label: `${providerById(s.provider).name} · ${s.model}`, provider: s.provider, baseUrl: s.baseUrl, model: s.model, apiKey: s.apiKeys[s.provider] || '' };
  const profs = s.profiles.map((p) => ({ id: p.id, label: `${p.name} · ${p.model}`, provider: p.provider, baseUrl: p.baseUrl, model: p.model, apiKey: p.apiKey || s.apiKeys[p.provider] || '' }));
  return [cur, ...profs.filter((p) => !(p.baseUrl === cur.baseUrl && p.model === cur.model))];
}

let picked: string[] = [];
export function openCompare(what: 'convert' | 'test' = 'convert') {
  const d = t(); const x = d.x;
  const all = targets();
  picked = picked.filter((id) => all.some((a) => a.id === id));
  if (!picked.length) picked = all.slice(0, 3).map((a) => a.id);
  let task = what;
  let ctrl: AbortController | null = null;
  modal(x.compare, `
    <p class="small muted">${x.compareHint}</p>
    <div class="row wrap gap">
      <div class="seg mini" role="tablist"><button role="tab" data-ctask="convert">${d.convert.replace('✨ ', '')}</button><button role="tab" data-ctask="test" ${out() ? '' : 'disabled'}>${d.testRun}</button></div>
      <span class="small muted">${x.compareModels}</span>
      <div class="chips" id="cmp-pick">${all.map((a) => `<label class="chip-check"><input type="checkbox" value="${esc(a.id)}" ${picked.includes(a.id) ? 'checked' : ''}/> ${esc(a.label)}</label>`).join('')}</div>
    </div>
    ${all.length < 2 ? `<div class="banner info small">${x.compareNeedProfiles}</div>` : ''}
    <label class="inline small">${x.compareExtra}<input id="cmp-extra" placeholder="model-a, model-b" spellcheck="false" autocomplete="off"/></label>
    <div class="row end"><button class="primary" id="cmp-run">${x.compareRun}</button></div>
    <div class="cmp-grid" id="cmp-grid"></div>`, (root) => {
    const grid = root.querySelector('#cmp-grid') as HTMLElement;
    const runBtn = root.querySelector('#cmp-run') as HTMLButtonElement;
    const drawTabs = () => root.querySelectorAll<HTMLElement>('[data-ctask]').forEach((b) => { b.className = b.dataset.ctask === task ? 'on' : ''; b.setAttribute('aria-selected', String(b.dataset.ctask === task)); });
    root.querySelectorAll<HTMLElement>('[data-ctask]').forEach((b) => b.addEventListener('click', () => { task = b.dataset.ctask as typeof task; drawTabs(); }));
    drawTabs();
    root.querySelector('#cmp-pick')!.addEventListener('change', () => { picked = [...root.querySelectorAll<HTMLInputElement>('#cmp-pick input:checked')].map((i) => i.value); });
    runBtn.addEventListener('click', async () => {
      if (ctrl) { ctrl.abort(); return; }
      if (!st.input.trim() && task === 'convert') { toast(d.inputEmpty); return; }
      const extra = (root.querySelector('#cmp-extra') as HTMLInputElement).value.split(',').map((m) => m.trim()).filter(Boolean);
      const base = all.find((a) => a.id === 'current')!;
      const list: Target[] = [...all.filter((a) => picked.includes(a.id)), ...extra.map((m, i) => ({ ...base, id: 'extra' + i, label: `${providerById(base.provider).name} · ${m}`, model: m }))].slice(0, 4);
      if (!list.length) { toast(x.comparePick); return; }
      ctrl = new AbortController(); runBtn.textContent = d.stop;
      const msgs: ChatMessage[] = task === 'convert' ? buildMessages(st.input, currentMode().hint, st.s.outLang, st.s.customLang) : buildTestRun(out());
      grid.style.setProperty('--cols', String(list.length));
      grid.innerHTML = list.map((tg, i) => `<div class="cmp-col" data-col="${i}"><div class="cmp-h"><strong class="small">${esc(tg.label)}</strong><span class="small muted" data-meta="${i}"><span class="spin"></span></span></div><div class="cmp-out md" data-out="${i}" aria-live="polite"></div><div class="row end"><button class="ghost small" data-cmp-copy="${i}" disabled>${icons.copy} ${d.copy}</button>${task === 'convert' ? `<button class="primary soft small" data-cmp-use="${i}" disabled>${x.compareUse}</button>` : ''}</div></div>`).join('');
      const results: string[] = list.map(() => '');
      const demo = inDemo();
      await Promise.all(list.map(async (tg, i) => {
        const o = grid.querySelector(`[data-out="${i}"]`) as HTMLElement; const meta = grid.querySelector(`[data-meta="${i}"]`) as HTMLElement;
        const t0 = performance.now();
        try {
          const onDelta = (txt: string) => { results[i] = txt; o.innerHTML = renderMarkdown(txt); };
          const r = demo ? await fakeStream(demoOutput(st.s.mode, lang2()), onDelta, ctrl!.signal)
            : await chat({ baseUrl: tg.baseUrl, model: tg.model, apiKey: tg.apiKey, kind: providerById(tg.provider).kind, stream: st.s.stream, timeoutMs: st.s.timeoutSec * 1000, retries: st.s.retries, signal: ctrl!.signal, messages: msgs, onDelta });
          results[i] = task === 'convert' ? strip(r) : r; o.innerHTML = renderMarkdown(results[i]);
          const ms = Math.round(performance.now() - t0);
          meta.textContent = fmt(x.compareMeta, { s: (ms / 1000).toFixed(1), n: estimateTokens(results[i]) });
          track('compare', msgs, results[i], t0, true, tg.model);
          grid.querySelectorAll<HTMLButtonElement>(`[data-cmp-copy="${i}"],[data-cmp-use="${i}"]`).forEach((b) => (b.disabled = false));
        } catch (e) {
          meta.textContent = '';
          if (!(e instanceof LLMError && e.kind === 'aborted') && (e as Error).name !== 'AbortError') { o.innerHTML = `<div class="err small">⚠️ ${esc(errorMessage(e))}</div>`; track('compare', msgs, '', t0, false, tg.model); }
        }
      }));
      ctrl = null; runBtn.textContent = x.compareRun;
      grid.querySelectorAll<HTMLElement>('[data-cmp-copy]').forEach((b) => b.addEventListener('click', () => copyText(results[Number(b.dataset.cmpCopy)])));
      grid.querySelectorAll<HTMLElement>('[data-cmp-use]').forEach((b) => b.addEventListener('click', () => { st.outputs = [results[Number(b.dataset.cmpUse)]]; st.active = 0; toast(x.compareUsed); }));
    });
  }, 'xwide');
}
