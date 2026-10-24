// Word-level diff (CJK characters are individual tokens) using LCS. Falls back to line-level for huge inputs.
import { escapeHtml } from './markdown';

export type Op = { t: 'eq' | 'add' | 'del'; v: string };
const tokenize = (s: string): string[] => [...(s.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]|[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) ?? [])];

function lcs(a: string[], b: string[]): Op[] {
  const n = a.length, m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: Op[] = [];
  let i = 0, j = 0;
  const push = (t: Op['t'], v: string) => { const last = ops[ops.length - 1]; if (last?.t === t) last.v += v; else ops.push({ t, v }); };
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('eq', a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', a[i++]);
    else push('add', b[j++]);
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);
  return ops;
}

export function diff(a: string, b: string): Op[] {
  let ta = tokenize(a), tb = tokenize(b);
  if (ta.length * tb.length > 4_000_000) { ta = a.split(/(?<=\n)/); tb = b.split(/(?<=\n)/); }
  if (ta.length * tb.length > 16_000_000) return [{ t: 'del', v: a }, { t: 'add', v: b }];
  return lcs(ta, tb);
}

export function diffHtml(a: string, b: string): { html: string; added: number; removed: number } {
  const ops = diff(a, b);
  let added = 0, removed = 0;
  const html = ops.map((o) => {
    const v = escapeHtml(o.v);
    if (o.t === 'add') { added += o.v.trim().length; return `<ins>${v}</ins>`; }
    if (o.t === 'del') { removed += o.v.trim().length; return `<del>${v}</del>`; }
    return v;
  }).join('');
  return { html, added, removed };
}
