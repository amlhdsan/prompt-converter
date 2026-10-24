// Finds "[请补充 …]" / "[TODO: …]" style placeholders that the converter leaves for missing details.
export const PLACEHOLDER_RE = /\[(?:请补充|待补充|补充|請補充|TODO|TBD|FIXME|要補足|記入)[^\]\n]*\]/gi;

export interface Placeholder { text: string; label: string; count: number }

export function findPlaceholders(s: string): Placeholder[] {
  const map = new Map<string, Placeholder>();
  for (const m of s.matchAll(PLACEHOLDER_RE)) {
    const text = m[0];
    const label = text.slice(1, -1).replace(/^(?:请补充|待补充|补充|請補充|TODO|TBD|FIXME|要補足|記入)\s*[:：\-–]?\s*/i, '').trim() || text.slice(1, -1);
    const p = map.get(text); if (p) p.count++; else map.set(text, { text, label, count: 1 });
  }
  return [...map.values()];
}

/** Replaces each placeholder with its non-empty value; untouched ones stay as-is. */
export function fillPlaceholders(s: string, values: Record<string, string>): string {
  return s.replace(PLACEHOLDER_RE, (m) => (values[m]?.trim() ? values[m].trim() : m));
}
