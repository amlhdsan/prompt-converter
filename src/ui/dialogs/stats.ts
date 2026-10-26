// Statistics dashboard: calls, tokens, estimated cost over time, by model and by feature. All local.
import { clearStats, loadStats } from '../../storage';
import { barChart, summarize } from '../../lib/stats';
import { fmtCost } from '../../lib/tokens';
import { download, esc, fmt, modal, undoToast } from '../dom';
import { rawSet, K } from '../../storage';
import { st, t } from '../state';

let range: 7 | 14 | 30 = 14;
export function openStats() {
  const d = t(); const x = d.x;
  const ev = loadStats();
  const s = summarize(ev, range);
  const nf = (n: number) => n.toLocaleString();
  const kinds = Object.entries(s.byKind).sort((a, b) => b[1] - a[1]);
  modal(x.stats, ev.length ? `
    <div class="row between wrap"><div class="seg mini" role="tablist">${([7, 14, 30] as const).map((r) => `<button role="tab" data-range="${r}" class="${r === range ? 'on' : ''}" aria-selected="${r === range}">${fmt(x.statsDays, { n: r })}</button>`).join('')}</div>
      <span class="small muted">${st.s.stats ? x.statsLocal : x.statsOff}</span></div>
    <div class="kpis">
      <div class="kpi"><span class="kpi-n" id="kpi-calls">${nf(s.calls)}</span><span class="small muted">${x.statsCalls}</span></div>
      <div class="kpi"><span class="kpi-n">${s.calls ? Math.round((s.ok / s.calls) * 100) : 0}%</span><span class="small muted">${x.statsSuccess}</span></div>
      <div class="kpi"><span class="kpi-n">${nf(s.inTok + s.outTok)}</span><span class="small muted">${x.statsTokens}</span></div>
      <div class="kpi"><span class="kpi-n">${fmtCost(s.cost)}</span><span class="small muted">${x.statsCost}</span></div>
      <div class="kpi"><span class="kpi-n">${(s.avgMs / 1000).toFixed(1)}s</span><span class="small muted">${x.statsLatency}</span></div>
      <div class="kpi"><span class="kpi-n">${s.streak}</span><span class="small muted">${x.statsStreak}</span></div>
    </div>
    <h3 class="small">${x.statsPerDay}</h3>
    ${barChart(s.days.map((v) => ({ label: v.day.slice(5).replace('-', '/'), value: v.calls })), 560, 150)}
    <div class="row gap wrap stats-cols">
      <div class="grow"><h3 class="small">${x.statsByModel}</h3><table class="keys">${s.byModel.slice(0, 8).map(([m, n]) => `<tr><td>${esc(m)}</td><td>${n}</td></tr>`).join('')}</table></div>
      <div class="grow"><h3 class="small">${x.statsByKind}</h3><table class="keys">${kinds.map(([k, n]) => `<tr><td>${esc(x[`kind_${k}` as keyof typeof x] ?? k)}</td><td>${n}</td></tr>`).join('')}</table></div>
    </div>
    <p class="small muted">${x.statsNote}</p>
    <div class="row end"><button class="ghost" id="st-export">CSV</button><button class="ghost danger" id="st-clear">${x.statsClear}</button></div>`
    : `<div class="placeholder"><div class="ph-icon" aria-hidden="true">📊</div>${x.statsEmpty}<span class="small">${x.statsEmptyTip}</span></div>`, (root) => {
    root.querySelectorAll<HTMLElement>('[data-range]').forEach((b) => b.addEventListener('click', () => { range = Number(b.dataset.range) as typeof range; openStats(); }));
    root.querySelector('#st-export')?.addEventListener('click', () => download('prompt-converter-usage.csv', ['time,kind,model,input_tokens,output_tokens,cost_usd,ms,ok', ...ev.map((e) => [new Date(e.at).toISOString(), e.kind, JSON.stringify(e.model), e.inTok, e.outTok, e.cost ?? '', e.ms ?? '', e.ok].join(','))].join('\n'), 'text/csv'));
    root.querySelector('#st-clear')?.addEventListener('click', () => { clearStats(); openStats(); undoToast(x.statsCleared, () => { rawSet(K.stats, JSON.stringify(ev)); openStats(); }); });
  }, 'wide');
}
