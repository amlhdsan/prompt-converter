// Output pane rendering: variants, single / compare / diff views, Markdown vs raw, tokens & cost, quality.
import { diffHtml } from '../lib/diff';
import { renderMarkdown } from '../lib/markdown';
import { assess, grade, type Quality } from '../lib/quality';
import { estimateCost, estimateTokens, fmtCost } from '../lib/tokens';
import { providerById } from '../providers';
import { isQuick, modKey } from '../platform';
import { esc, fmt } from './dom';
import { icons } from './icons';
import { out, st, t } from './state';

function body(text: string): string {
  if (st.s.render === 'md' && !st.busy) return `<div class="out md" id="output" tabindex="0">${renderMarkdown(text)}</div>`;
  return `<pre class="out" id="output" tabindex="0">${esc(text)}${st.busy ? '<span class="caret"></span>' : ''}</pre>`;
}
export function renderOutput(): string {
  const d = t();
  const o = out();
  const main = o
    ? body(o)
    : `<div class="placeholder">${st.busy ? `<span class="spin"></span> ${d.converting}` : `<div class="ph-icon">${icons.mark}</div><div>${d.empty}</div><div class="small">${fmt(isQuick ? d.quickHint : d.shortcut, { m: modKey })}</div>${isQuick ? '' : `<button class="ghost small" id="btn-examples">${icons.book} ${d.examples}</button>`}`}</div>`;
  if (isQuick || st.view === 'single') return main;
  if (st.view === 'compare') {
    return `<div class="diff"><div><div class="tag">${d.original}</div><pre class="out dim">${esc(st.input) || '—'}</pre></div><div><div class="tag accent">${d.converted}</div>${main}</div></div>`;
  }
  if (!o || st.busy) return main;
  const r = diffHtml(st.input, o);
  return `<div class="diffview"><div class="small muted diff-stat"><ins>+${r.added}</ins> ${d.added} · <del>−${r.removed}</del> ${d.removed}</div><pre class="out" id="output" tabindex="0">${r.html}</pre></div>`;
}

export function renderVariantTabs(): string {
  if (st.outputs.length < 2) return '';
  const d = t();
  return `<div class="seg mini variants" role="tablist" aria-label="${d.variants}">${st.outputs.map((o, i) =>
    `<button role="tab" data-variant="${i}" aria-selected="${i === st.active}" class="${i === st.active ? 'on' : ''}">${fmt(d.variant, { n: i + 1 })}${o ? '' : ' …'}</button>`).join('')}</div>`;
}

export function statsText(): string {
  const o = out();
  if (!o) return '';
  const d = t();
  const inTok = estimateTokens(o), outTok = Math.round(inTok * 1.5);
  const p = providerById(st.s.provider);
  const cost = estimateCost(st.s.model, inTok, outTok, !!p.noKey);
  return `${o.length} ${d.chars} · ${fmt(d.tokens, { n: inTok })}${cost === null ? '' : ` · <span title="${esc(d.costEst)}">${cost === 0 ? d.free : '≈ ' + fmtCost(cost) + '/run'}</span>`}`;
}

const ring = (q: Quality, label: string) => `<div class="score ${grade(q.score)}" role="img" aria-label="${esc(label)} ${q.score}/100">
  <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" class="bg"/><circle cx="18" cy="18" r="15.9" class="fg" stroke-dasharray="${q.score} 100"/></svg>
  <span class="num">${q.score}</span><span class="lbl">${esc(label)}</span></div>`;

export function renderQuality(): string {
  if (!st.s.showScore || isQuick || (!st.input.trim() && !out())) return '';
  const d = t();
  const a = assess(st.input), b = out() && !st.busy ? assess(out()) : null;
  const target = b ?? a;
  const tips = target.missing.map((m) => `<li>${esc(fmt(d.checks[m], { n: target.placeholders }))}</li>`).join('');
  return `<section class="quality card" id="quality" aria-label="${d.score}">
    <div class="q-rings">${ring(a, d.original)}${b ? `<span class="q-arrow" aria-hidden="true">→</span>${ring(b, d.converted)}` : ''}</div>
    <div class="q-tips"><div class="label">${d.score}${b ? ` <span class="muted small">${fmt(d.scoreOf, { a: a.score, b: b.score })}</span>` : ''}</div>
      ${tips ? `<div class="small muted">${d.suggestions}</div><ul id="q-tips">${tips}</ul>` : `<div class="small muted">✓</div>`}</div>
  </section>`;
}
