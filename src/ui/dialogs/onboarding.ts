// First-run welcome flow: choose provider → paste key → connection test → sample conversion. Or try the no-key demo.
import { chat, LLMError } from '../../llm';
import { PROVIDERS, providerById, needsKey } from '../../providers';
import { buildMessages } from '../../prompts';
import { EXAMPLES } from '../../lib/library';
import { demoOutput } from '../../lib/demo';
import { renderMarkdown } from '../../lib/markdown';
import { closeModal, esc, fmt, modal } from '../dom';
import { allModes, errorMessage, reqBase, strip } from '../actions';
import { lang2, persist, rerender, st, t } from '../state';

const FEATURED = ['deepseek', 'openai', 'anthropic', 'gemini', 'qwen', 'ollama', 'openrouter', 'custom'];
export function openOnboarding(step = 0) {
  const d = t(); const x = d.x; const s = st.s;
  const prov = providerById(s.provider);
  const dots = [0, 1, 2, 3].map((i) => `<span class="dot${i === step ? ' on' : ''}${i < step ? ' done' : ''}" aria-hidden="true"></span>`).join('');
  const sample = EXAMPLES[0][lang2()].p;
  const bodies = [
    `<div class="ob-hero"><div class="ob-logo" aria-hidden="true">✨</div><h3>${x.obWelcome}</h3><p class="muted">${x.obWelcomeText}</p></div>
     <ul class="ob-points"><li>🧠 ${x.obPoint1}</li><li>🔒 ${x.obPoint2}</li><li>⚡ ${x.obPoint3}</li></ul>
     <div class="row end wrap"><button class="ghost" id="ob-demo">${x.obTryDemo}</button><button class="primary" id="ob-next">${x.obStart}</button></div>`,
    `<p class="small muted">${x.obPickProvider}</p>
     <div class="ob-grid" role="radiogroup" aria-label="${esc(d.provider)}">${FEATURED.map((id) => providerById(id)).filter((p, i, a) => a.indexOf(p) === i).map((p) => `<button role="radio" class="ob-prov${s.provider === p.id ? ' on' : ''}" aria-checked="${s.provider === p.id}" data-ob-prov="${p.id}"><strong>${esc(p.name)}</strong><span class="small muted">${p.noKey ? x.obLocal : p.id === 'custom' ? x.obAnyOpenAI : x.obCloud}</span></button>`).join('')}</div>
     <details class="small"><summary>${x.obMore} (${PROVIDERS.length})</summary><div class="chips">${PROVIDERS.filter((p) => !FEATURED.includes(p.id)).map((p) => `<button data-ob-prov="${p.id}" class="${s.provider === p.id ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div></details>
     <div class="row between"><button class="ghost" id="ob-back">${x.back}</button><button class="primary" id="ob-next">${x.next}</button></div>`,
    `<p class="small muted">${needsKey(prov) ? fmt(x.obKeyHint, { p: prov.name }) : x.obNoKeyNeeded}</p>
     ${prov.id === 'custom' || !needsKey(prov) ? `<label>${d.baseUrl}<input id="ob-base" value="${esc(s.baseUrl)}" spellcheck="false" autocomplete="off"/></label><label>${d.model}<input id="ob-model" value="${esc(s.model)}" spellcheck="false" autocomplete="off"/></label>` : ''}
     ${needsKey(prov) || prov.id === 'custom' ? `<label><span class="row between">${d.apiKey}${prov.keyUrl ? `<a class="small" href="${prov.keyUrl}" target="_blank" rel="noopener">${d.getKey} ↗</a>` : ''}</span><input id="ob-key" type="password" value="${esc(s.apiKeys[s.provider] || '')}" placeholder="sk-..." autocomplete="off" spellcheck="false"/></label>` : ''}
     <div class="row wrap"><button class="ghost" id="ob-test">${d.connTest}</button><span class="small" id="ob-status" aria-live="polite"></span></div>
     <div class="row between"><button class="ghost" id="ob-back">${x.back}</button><button class="primary" id="ob-next">${x.next}</button></div>`,
    `<p class="small muted">${x.obSample}</p><div class="ob-sample"><span class="badge">${esc(allModes()[1].icon)} ${esc(allModes()[1].label)}</span> ${esc(sample)}</div>
     <div class="tr-out md" id="ob-out" aria-live="polite"></div>
     <div class="row between"><button class="ghost" id="ob-back">${x.back}</button><span class="row"><button class="ghost" id="ob-run">${x.obRunSample}</button><button class="primary" id="ob-finish">${x.obFinish}</button></span></div>`,
  ];
  modal(`${x.obTitle} <span class="ob-dots">${dots}</span>`, bodies[step], (root) => {
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T | null;
    const finish = (demo: boolean) => { s.onboarded = true; s.demo = demo; persist(); closeModal(); rerender(); };
    q('#ob-next')?.addEventListener('click', () => openOnboarding(step + 1));
    q('#ob-back')?.addEventListener('click', () => openOnboarding(step - 1));
    q('#ob-demo')?.addEventListener('click', () => { st.input = sample; st.s.mode = 'coding'; finish(true); });
    root.querySelectorAll<HTMLElement>('[data-ob-prov]').forEach((b) => b.addEventListener('click', () => {
      const p = providerById(b.dataset.obProv!); s.provider = p.id; if (p.id !== 'custom') { s.baseUrl = p.baseUrl; s.model = p.model; } persist(); openOnboarding(1);
      (document.querySelector(`[data-ob-prov="${p.id}"]`) as HTMLElement | null)?.focus();
    }));
    q<HTMLInputElement>('#ob-key')?.addEventListener('input', (e) => { s.apiKeys[s.provider] = (e.target as HTMLInputElement).value.trim(); persist(); });
    q<HTMLInputElement>('#ob-base')?.addEventListener('input', (e) => { s.baseUrl = (e.target as HTMLInputElement).value.trim(); persist(); });
    q<HTMLInputElement>('#ob-model')?.addEventListener('input', (e) => { s.model = (e.target as HTMLInputElement).value.trim(); persist(); });
    q('#ob-test')?.addEventListener('click', async () => {
      const el = q('#ob-status')!; el.textContent = d.connTesting; el.className = 'small muted';
      const t0 = performance.now();
      try { await chat({ ...reqBase(), stream: false, retries: 0, maxTokens: 8, timeoutMs: 20_000, messages: [{ role: 'user', content: 'ping' }] }); el.textContent = '✓ ' + fmt(d.connOk, { ms: Math.round(performance.now() - t0), model: s.model }); el.className = 'small ok'; }
      catch (e) { if (e instanceof LLMError && e.kind === 'empty') { el.textContent = '✓'; el.className = 'small ok'; } else { el.textContent = '✕ ' + errorMessage(e); el.className = 'small err'; } }
    });
    q('#ob-run')?.addEventListener('click', async () => {
      const box = q('#ob-out')!; const btn = q<HTMLButtonElement>('#ob-run')!; btn.disabled = true;
      box.innerHTML = `<span class="spin"></span>${esc(d.converting)}`;
      const noKey = needsKey(providerById(s.provider)) && !s.apiKeys[s.provider];
      try {
        const r = noKey ? demoOutput('coding', lang2()) : strip(await chat({ ...reqBase(), messages: buildMessages(sample, allModes()[1].hint, s.outLang, s.customLang), onDelta: (txt) => { box.innerHTML = renderMarkdown(txt); } }));
        box.innerHTML = renderMarkdown(r); st.input = sample; st.outputs = [r]; st.active = 0; st.s.mode = 'coding';
      } catch (e) { box.innerHTML = `<div class="err">⚠️ ${esc(errorMessage(e))}</div>`; }
      finally { btn.disabled = false; }
    });
    q('#ob-finish')?.addEventListener('click', () => finish(needsKey(providerById(s.provider)) && !s.apiKeys[s.provider]));
    (q('#ob-next') ?? q('#ob-run'))?.focus();
  }, 'onboarding');
}
