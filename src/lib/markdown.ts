// Tiny, safe Markdown renderer for converted prompts. Everything is HTML-escaped first; only a small,
// known set of tags is generated, and links are restricted to http(s)/mailto. No raw HTML passthrough.
export const escapeHtml = (x: string) => x.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function inline(src: string): string {
  const codes: string[] = [];
  let s = escapeHtml(src).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  const para: string[] = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)\s*$/);
    if (fence) {
      flush(); const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) buf.push(lines[i++]);
      i++; out.push(`<pre class="md-code"><code>${escapeHtml(buf.join('\n'))}</code></pre>`); continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); const n = Math.min(h[1].length + 1, 6); out.push(`<h${n}>${inline(h[2].replace(/\s+#+\s*$/, ''))}</h${n}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(line)) {
      flush(); const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`); continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush();
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const head = cells(line); i += 2; const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (m && /\d/.test(m[2]) === ordered) {
          const task = m[3].match(/^\[( |x|X)\]\s+(.*)$/);
          items.push(task ? `<li class="task"><input type="checkbox" disabled ${task[1] !== ' ' ? 'checked' : ''}> ${inline(task[2])}</li>` : `<li>${inline(m[3])}</li>`);
          i++;
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1] = items[items.length - 1].replace(/<\/li>$/, `<br>${inline(lines[i].trim())}</li>`); i++;
        } else break;
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line); i++;
  }
  flush();
  return out.join('\n');
}
