// Prompt techniques toolbox: chain-of-thought, few-shot, role, JSON schema, explain, translate, image presets.
import { chat, LLMError } from '../../llm';
import { applyRole, buildExplain, buildTranslate, chainOfThought, fewShot, structureOf, withJsonFormat, type Field, type FieldType, type Shot, type TechLang } from '../../lib/techniques';
import { ASPECTS, DEFAULT_NEGATIVE, STYLE_PRESETS, formatImagePrompt, type ImagePlatform } from '../../lib/imageprompt';
import { renderMarkdown } from '../../lib/markdown';
import { copyText, esc, modal, toast, undoToast } from '../dom';
import { ensureKey, errorMessage, inDemo, reqBase, strip, track } from '../actions';
import { icons } from '../icons';
import { out, rerender, st, t } from '../state';
import { openSettings } from './settings';

export type Tool = 'cot' | 'few' | 'role' | 'json' | 'explain' | 'translate' | 'image';
export const TOOLS: Tool[] = ['cot', 'few', 'role', 'json', 'explain', 'translate', 'image'];
const TARGET_LANGS = ['English', '简体中文', '繁體中文', '日本語', '한국어', 'Français', 'Deutsch', 'Español', 'Русский', 'Português'];

/** Applies a transformed prompt to the current result (or input when there is no result), with undo. */
function apply(next: string) {
  const prevOut = [...st.outputs]; const prevActive = st.active;
  if (out()) st.outputs[st.active] = next; else { st.outputs = [next]; st.active = 0; }
  rerender();
  undoToast(t().x.toolApplied, () => { st.outputs = prevOut; st.active = prevActive; rerender(); });
}

const shots: Shot[] = [{ input: '', output: '' }];
const fields: Field[] = [{ name: 'title', type: 'string', description: '' }];
export function openToolbox(tool: Tool = 'cot') {
  const d = t(); const x = d.x;
  const lang: TechLang = st.s.uiLang;
  const src = out() || st.input;
  const tabs = TOOLS.map((k) => `<button role="tab" data-tool="${k}" aria-selected="${k === tool}" class="${k === tool ? 'on' : ''}">${x[`tool_${k}`]}</button>`).join('');
  const noSrc = !src.trim() && tool !== 'image' ? `<div class="banner info small">${x.toolNeedText}</div>` : '';
  const bodies: Record<Tool, string> = {
    cot: `<p class="small muted">${x.cotHint}</p><label class="check"><input type="checkbox" id="cot-visible" checked/> ${x.cotVisible}</label>`,
    few: `<p class="small muted">${x.fewHint}</p><div id="few-list" class="form"></div><button class="ghost small" id="few-add" type="button">${icons.plus} ${x.fewAdd}</button>`,
    role: `<p class="small muted">${x.roleHint}</p><div class="form"><label>${x.roleRole}<input id="r-role" placeholder="${esc(x.roleRolePh)}"/></label><label>${x.roleExpertise}<input id="r-exp"/></label><div class="row gap wrap"><label class="grow">${x.roleAudience}<input id="r-aud"/></label><label class="grow">${x.roleTone}<input id="r-tone" list="r-tones"/><datalist id="r-tones">${x.roleTones.split('|').map((v) => `<option value="${esc(v)}">`).join('')}</datalist></label></div><label>${x.roleAvoid}<input id="r-avoid"/></label></div>`,
    json: `<p class="small muted">${x.jsonHint}</p><div id="json-list" class="form"></div><button class="ghost small" id="json-add" type="button">${icons.plus} ${x.jsonAdd}</button><pre class="errlog small" id="json-preview"></pre>`,
    explain: `<p class="small muted">${x.explainHint}</p><div class="tr-out md" id="tool-out" aria-live="polite"></div>`,
    translate: `<p class="small muted">${x.translateHint}</p><label class="inline">${x.translateTo}<select id="tr-lang">${TARGET_LANGS.map((l) => `<option>${l}</option>`).join('')}</select></label><div class="tr-out md" id="tool-out" aria-live="polite"></div><div class="small muted" id="tr-check"></div>`,
    image: `<p class="small muted">${x.imageHint}</p>
      <div class="seg mini" role="radiogroup" id="img-plat">${(['mj', 'sd', 'dalle'] as ImagePlatform[]).map((p, i) => `<button role="radio" data-plat="${p}" aria-checked="${i === 0}" class="${i === 0 ? 'on' : ''}">${p === 'mj' ? 'Midjourney' : p === 'sd' ? 'Stable Diffusion' : 'DALL·E'}</button>`).join('')}</div>
      <div class="row wrap gap"><label class="inline">${x.imgAspect}<select id="img-ar">${ASPECTS.map((a) => `<option ${a === '16:9' ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label class="inline">${x.imgStyle}<select id="img-style"><option value="">—</option>${STYLE_PRESETS.map((s) => `<option>${s}</option>`).join('')}</select></label>
        <label class="inline">${x.imgQuality}<select id="img-q"><option value="standard">${x.imgStd}</option><option value="high">${x.imgHigh}</option><option value="draft">${x.imgDraft}</option></select></label>
        <label class="inline">Seed<input id="img-seed" type="number" min="0" class="mini-input" placeholder="—"/></label></div>
      <div class="row wrap gap" id="img-mj"><label class="inline">--v<select id="img-v"><option>6.1</option><option>6</option><option>5.2</option><option>niji 6</option></select></label><label class="inline">--s<input id="img-s" type="number" min="0" max="1000" value="250" class="mini-input"/></label><label class="inline">--c<input id="img-c" type="number" min="0" max="100" value="0" class="mini-input"/></label><label class="check"><input type="checkbox" id="img-raw"/> --style raw</label></div>
      <div class="row wrap gap" id="img-sd" hidden><label class="inline">Steps<input id="img-steps" type="number" min="1" max="150" value="30" class="mini-input"/></label><label class="inline">CFG<input id="img-cfg" type="number" min="1" max="30" step="0.5" value="7" class="mini-input"/></label><label class="inline">Sampler<select id="img-sampler"><option>DPM++ 2M Karras</option><option>Euler a</option><option>DPM++ SDE Karras</option><option>DDIM</option></select></label></div>
      <label>${x.imgNegative}<input id="img-neg" value="${esc(DEFAULT_NEGATIVE)}"/></label>
      <pre class="errlog" id="img-preview" aria-live="polite"></pre>`,
  };
  modal(x.toolbox, `<div class="seg scroll" role="tablist" id="tool-tabs">${tabs}</div>${noSrc}<div class="tool-body">${bodies[tool]}</div>
    <div class="row end wrap" id="tool-actions">${tool === 'explain' || tool === 'translate' ? `<button class="ghost" id="tool-copy" disabled>${icons.copy} ${d.copy}</button>` : ''}<button class="primary" id="tool-go" ${!src.trim() && tool !== 'image' ? 'disabled' : ''}>${tool === 'explain' ? x.explainRun : tool === 'translate' ? x.translateRun : x.toolApply}</button></div>`, (root) => {
    const $r = <T extends HTMLElement = HTMLInputElement>(s: string) => root.querySelector(s) as T;
    root.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => b.addEventListener('click', () => openToolbox(b.dataset.tool as Tool)));
    const go = $r<HTMLButtonElement>('#tool-go');
    let result = '';
    const runModel = async (msgs: ReturnType<typeof buildExplain>, after?: (r: string) => void) => {
      if (!inDemo() && !ensureKey(openSettings)) return;
      const box = $r<HTMLElement>('#tool-out'); go.disabled = true; box.innerHTML = `<span class="spin"></span>${esc(d.converting)}`;
      const t0 = performance.now();
      try {
        result = inDemo() ? x.toolDemo : strip(await chat({ ...reqBase(), messages: msgs, onDelta: (s) => { box.innerHTML = renderMarkdown(s); } }));
        box.innerHTML = renderMarkdown(result); track('tool', msgs, result, t0, true);
        $r<HTMLButtonElement>('#tool-copy').disabled = false; after?.(result);
      } catch (e) { if (!(e instanceof LLMError && e.kind === 'aborted')) box.innerHTML = `<div class="err">⚠️ ${esc(errorMessage(e))}</div>`; track('tool', msgs, '', t0, false); }
      finally { go.disabled = false; }
    };
    $r('#tool-copy')?.addEventListener('click', () => copyText(result));
    if (tool === 'cot') go.addEventListener('click', () => { apply(chainOfThought(src, lang, $r('#cot-visible').checked)); });
    if (tool === 'few') {
      const list = $r<HTMLElement>('#few-list');
      const draw = () => { list.innerHTML = shots.map((s, i) => `<div class="shot"><span class="small muted">#${i + 1}</span><textarea rows="2" data-shot-in="${i}" placeholder="${esc(x.fewInput)}">${esc(s.input)}</textarea><textarea rows="2" data-shot-out="${i}" placeholder="${esc(x.fewOutput)}">${esc(s.output)}</textarea><button class="icon tiny" data-shot-del="${i}" aria-label="${d.del}">${icons.x}</button></div>`).join(''); };
      list.addEventListener('input', (e) => { const el = e.target as HTMLTextAreaElement; if (el.dataset.shotIn) shots[Number(el.dataset.shotIn)].input = el.value; if (el.dataset.shotOut) shots[Number(el.dataset.shotOut)].output = el.value; });
      list.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-shot-del]'); if (b) { shots.splice(Number(b.dataset.shotDel), 1); if (!shots.length) shots.push({ input: '', output: '' }); draw(); } });
      $r('#few-add').addEventListener('click', () => { shots.push({ input: '', output: '' }); draw(); (list.querySelector(`[data-shot-in="${shots.length - 1}"]`) as HTMLElement)?.focus(); });
      draw();
      go.addEventListener('click', () => { if (!shots.some((s) => s.input.trim() && s.output.trim())) { toast(x.fewNeed); return; } apply(fewShot(src, shots, lang)); });
    }
    if (tool === 'role') go.addEventListener('click', () => { const role = $r('#r-role').value; if (!role.trim()) { toast(x.roleNeed); $r('#r-role').focus(); return; } apply(applyRole(src, { role, expertise: $r('#r-exp').value, audience: $r('#r-aud').value, tone: $r('#r-tone').value, avoid: $r('#r-avoid').value }, lang)); });
    if (tool === 'json') {
      const list = $r<HTMLElement>('#json-list');
      const TYPES: FieldType[] = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
      const preview = () => { $r<HTMLElement>('#json-preview').textContent = withJsonFormat('', fields, lang).trim(); };
      const draw = () => { list.innerHTML = fields.map((f, i) => `<div class="field-row"><input data-f-name="${i}" value="${esc(f.name)}" placeholder="${esc(x.jsonName)}" spellcheck="false"/><select data-f-type="${i}">${TYPES.map((ty) => `<option ${ty === f.type ? 'selected' : ''}>${ty}</option>`).join('')}</select><input data-f-desc="${i}" value="${esc(f.description ?? '')}" placeholder="${esc(x.jsonDesc)}"/><label class="check small"><input type="checkbox" data-f-req="${i}" ${f.required !== false ? 'checked' : ''}/> ${x.jsonRequired}</label><button class="icon tiny" data-f-del="${i}" aria-label="${d.del}">${icons.x}</button></div>`).join(''); preview(); };
      list.addEventListener('input', (e) => { const el = e.target as HTMLInputElement; const i = Number(el.dataset.fName ?? el.dataset.fType ?? el.dataset.fDesc ?? el.dataset.fReq); if (Number.isNaN(i)) return; if (el.dataset.fName !== undefined) fields[i].name = el.value; if (el.dataset.fType !== undefined) fields[i].type = el.value as FieldType; if (el.dataset.fDesc !== undefined) fields[i].description = el.value; if (el.dataset.fReq !== undefined) fields[i].required = el.checked; preview(); });
      list.addEventListener('change', (e) => list.dispatchEvent(new Event('input', { bubbles: true })) && e);
      list.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f-del]'); if (b) { fields.splice(Number(b.dataset.fDel), 1); if (!fields.length) fields.push({ name: '', type: 'string' }); draw(); } });
      $r('#json-add').addEventListener('click', () => { fields.push({ name: '', type: 'string' }); draw(); (list.querySelector(`[data-f-name="${fields.length - 1}"]`) as HTMLElement)?.focus(); });
      draw();
      go.addEventListener('click', () => { if (!fields.some((f) => f.name.trim())) { toast(x.jsonNeed); return; } apply(withJsonFormat(src, fields, lang)); });
    }
    if (tool === 'explain') go.addEventListener('click', () => runModel(buildExplain(src, lang)));
    if (tool === 'translate') go.addEventListener('click', () => runModel(buildTranslate(src, $r<HTMLSelectElement>('#tr-lang').value), (r) => {
      const a = structureOf(src), b = structureOf(r);
      const same = a.headings === b.headings && a.fences === b.fences && JSON.stringify(a.vars) === JSON.stringify(b.vars);
      $r<HTMLElement>('#tr-check').textContent = same ? `✓ ${x.translateKept}` : `⚠️ ${x.translateDiff}`;
      const btn = document.createElement('button'); btn.className = 'primary soft'; btn.id = 'tr-apply'; btn.textContent = x.toolApply;
      btn.addEventListener('click', () => apply(r)); $r<HTMLElement>('#tool-actions').prepend(btn);
    }));
    if (tool === 'image') {
      let plat: ImagePlatform = 'mj';
      const base = src.trim() || 'a cozy cabin in a snowy forest at night';
      const params = () => ({ aspect: $r<HTMLSelectElement>('#img-ar').value, style: $r<HTMLSelectElement>('#img-style').value, quality: $r<HTMLSelectElement>('#img-q').value as 'standard', negative: $r('#img-neg').value, seed: $r('#img-seed').value === '' ? '' as const : Number($r('#img-seed').value), mjVersion: $r<HTMLSelectElement>('#img-v').value, stylize: Number($r('#img-s').value), chaos: Number($r('#img-c').value), raw: $r('#img-raw').checked, steps: Number($r('#img-steps').value), cfg: Number($r('#img-cfg').value), sampler: $r<HTMLSelectElement>('#img-sampler').value });
      const preview = () => { $r<HTMLElement>('#img-preview').textContent = formatImagePrompt(base.split('\n').find((l) => l.trim() && !/^#/.test(l)) ?? base, plat, params()); };
      root.querySelectorAll<HTMLElement>('[data-plat]').forEach((b) => b.addEventListener('click', () => {
        plat = b.dataset.plat as ImagePlatform;
        root.querySelectorAll<HTMLElement>('[data-plat]').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-checked', String(o === b)); });
        $r<HTMLElement>('#img-mj').hidden = plat !== 'mj'; $r<HTMLElement>('#img-sd').hidden = plat !== 'sd'; preview();
      }));
      root.querySelector('.tool-body')!.addEventListener('input', preview); root.querySelector('.tool-body')!.addEventListener('change', preview);
      preview(); go.disabled = false;
      go.textContent = x.toolApply;
      const copyB = document.createElement('button'); copyB.className = 'ghost'; copyB.innerHTML = `${icons.copy} ${esc(d.copy)}`; copyB.id = 'img-copy';
      copyB.addEventListener('click', () => copyText($r<HTMLElement>('#img-preview').textContent ?? '')); $r<HTMLElement>('#tool-actions').prepend(copyB);
      go.addEventListener('click', () => apply($r<HTMLElement>('#img-preview').textContent ?? ''));
    }
  }, 'wide');
}
