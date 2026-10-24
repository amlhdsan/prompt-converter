// Markdown export of history / batch results.
export interface MdEntry { at?: number; mode?: string; model?: string; input: string; output: string; fav?: boolean }

const fence = (s: string) => { const n = Math.max(3, ...[...s.matchAll(/`{3,}/g)].map((m) => m[0].length + 1)); const f = '`'.repeat(n); return `${f}text\n${s}\n${f}`; };

export function toMarkdown(title: string, items: MdEntry[], labels: { original: string; converted: string }, modeName: (id: string) => string = (x) => x): string {
  const parts = [`# ${title}`, '', `> ${items.length} · ${new Date().toISOString().slice(0, 10)}`, ''];
  items.forEach((it, i) => {
    const meta = [it.at ? new Date(it.at).toLocaleString() : '', it.mode ? modeName(it.mode) : '', it.model ?? ''].filter(Boolean).join(' · ');
    parts.push(`## ${i + 1}. ${it.fav ? '★ ' : ''}${it.input.split('\n')[0].slice(0, 60)}`, '');
    if (meta) parts.push(`_${meta}_`, '');
    parts.push(`### ${labels.original}`, '', fence(it.input), '', `### ${labels.converted}`, '', it.output, '', '---', '');
  });
  return parts.join('\n');
}
