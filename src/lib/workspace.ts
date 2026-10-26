// Prompt workspace: saved prompts with folders, tags, stars and per-prompt version history.
export interface PromptVersion { at: number; body: string; note?: string }
export interface SavedPrompt {
  id: string; title: string; body: string; source?: string; mode?: string;
  tags: string[]; folder: string; star?: boolean; at: number; updated: number; uses?: number;
  versions: PromptVersion[];
}
export const VERSION_MAX = 30;

export const normTags = (tags: string | string[]) =>
  [...new Set((Array.isArray(tags) ? tags : tags.split(/[,，#\s]+/)).map((x) => x.trim().replace(/^#/, '').slice(0, 30)).filter(Boolean))].slice(0, 20);

export function sanitizePrompt(v: unknown): SavedPrompt | null {
  const o = v as Partial<SavedPrompt> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !o.id || typeof o.body !== 'string') return null;
  const now = Date.now();
  const versions = (Array.isArray(o.versions) ? o.versions : [])
    .filter((x): x is PromptVersion => !!x && typeof x === 'object' && typeof (x as PromptVersion).body === 'string')
    .map((x) => ({ at: Number(x.at) || now, body: x.body.slice(0, 100_000), ...(typeof x.note === 'string' ? { note: x.note.slice(0, 200) } : {}) }))
    .slice(0, VERSION_MAX);
  return {
    id: o.id.slice(0, 100), title: (typeof o.title === 'string' && o.title.trim() ? o.title.trim() : o.body.split('\n')[0]).slice(0, 120) || 'Untitled',
    body: o.body.slice(0, 100_000), source: typeof o.source === 'string' ? o.source.slice(0, 50_000) : undefined,
    mode: typeof o.mode === 'string' ? o.mode.slice(0, 120) : undefined,
    tags: normTags(Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : []),
    folder: typeof o.folder === 'string' ? o.folder.trim().slice(0, 60) : '', ...(o.star === true ? { star: true } : {}),
    at: Number(o.at) || now, updated: Number(o.updated) || Number(o.at) || now, uses: Math.max(0, Number(o.uses) || 0), versions,
  };
}

/** Returns a new prompt with `body` updated; the previous body is kept as a version (newest first). */
export function withNewBody(p: SavedPrompt, body: string, note?: string, now = Date.now()): SavedPrompt {
  if (body === p.body) return p;
  const versions = [{ at: p.updated, body: p.body, ...(note ? { note } : {}) }, ...p.versions].slice(0, VERSION_MAX);
  return { ...p, body, updated: now, versions };
}
export function restoreVersion(p: SavedPrompt, index: number, now = Date.now()): SavedPrompt {
  const v = p.versions[index]; if (!v) return p;
  return withNewBody(p, v.body, 'restore', now);
}

export interface Query { text?: string; tag?: string; folder?: string; starred?: boolean; sort?: 'updated' | 'title' | 'uses' }
export function searchPrompts(list: SavedPrompt[], q: Query): SavedPrompt[] {
  const terms = (q.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const res = list.filter((p) => {
    if (q.starred && !p.star) return false;
    if (q.tag && !p.tags.includes(q.tag)) return false;
    if (q.folder !== undefined && q.folder !== '*' && p.folder !== q.folder) return false;
    const hay = `${p.title}\n${p.body}\n${p.tags.join(' ')}\n${p.folder}`.toLowerCase();
    return terms.every((t) => (t.startsWith('#') ? p.tags.some((x) => x.toLowerCase() === t.slice(1)) : hay.includes(t)));
  });
  const sort = q.sort ?? 'updated';
  return res.sort((a, b) => (Number(!!b.star) - Number(!!a.star)) ||
    (sort === 'title' ? a.title.localeCompare(b.title) : sort === 'uses' ? (b.uses ?? 0) - (a.uses ?? 0) : b.updated - a.updated));
}
export const allTags = (list: SavedPrompt[]) => { const m = new Map<string, number>(); list.forEach((p) => p.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
export const allFolders = (list: SavedPrompt[]) => [...new Set(list.map((p) => p.folder).filter(Boolean))].sort();
