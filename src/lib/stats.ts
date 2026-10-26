// Local usage statistics: every model call is recorded as a small event; aggregated by day / model / kind.
export type UsageKind = 'convert' | 'refine' | 'test' | 'chat' | 'batch' | 'compare' | 'tool';
export interface UsageEvent { at: number; kind: UsageKind; model: string; inTok: number; outTok: number; cost: number | null; ms?: number; ok: boolean }
export const STATS_MAX = 5000;

export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export interface Summary { calls: number; ok: number; inTok: number; outTok: number; cost: number; avgMs: number; byKind: Record<string, number>; byModel: [string, number][]; days: { day: string; calls: number; tokens: number; cost: number }[]; streak: number }
export function summarize(events: UsageEvent[], days = 14, now = Date.now()): Summary {
  const byKind: Record<string, number> = {}; const byModel = new Map<string, number>();
  let inTok = 0, outTok = 0, cost = 0, ok = 0, ms = 0, msN = 0;
  const dayMap = new Map<string, { calls: number; tokens: number; cost: number }>();
  for (let i = days - 1; i >= 0; i--) dayMap.set(dayKey(now - i * 86_400_000), { calls: 0, tokens: 0, cost: 0 });
  for (const e of events) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1; byModel.set(e.model, (byModel.get(e.model) ?? 0) + 1);
    inTok += e.inTok; outTok += e.outTok; cost += e.cost ?? 0; if (e.ok) ok++; if (e.ms) { ms += e.ms; msN++; }
    const d = dayMap.get(dayKey(e.at)); if (d) { d.calls++; d.tokens += e.inTok + e.outTok; d.cost += e.cost ?? 0; }
  }
  const active = new Set(events.map((e) => dayKey(e.at)));
  let streak = 0; while (active.has(dayKey(now - streak * 86_400_000))) streak++;
  return { calls: events.length, ok, inTok, outTok, cost, avgMs: msN ? Math.round(ms / msN) : 0, byKind, byModel: [...byModel.entries()].sort((a, b) => b[1] - a[1]), days: [...dayMap.entries()].map(([day, v]) => ({ day, ...v })), streak };
}
/** Simple accessible SVG bar chart (no dependencies). */
export function barChart(values: { label: string; value: number }[], w = 560, h = 140): string {
  const max = Math.max(1, ...values.map((v) => v.value));
  const bw = w / Math.max(1, values.length);
  const bars = values.map((v, i) => { const bh = Math.round((v.value / max) * (h - 24)); return `<g><rect x="${(i * bw + 3).toFixed(1)}" y="${h - 18 - bh}" width="${(bw - 6).toFixed(1)}" height="${bh}" rx="3"><title>${v.label}: ${v.value}</title></rect><text x="${(i * bw + bw / 2).toFixed(1)}" y="${h - 4}" text-anchor="middle">${v.label}</text></g>`; }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="chart">${bars}</svg>`;
}
