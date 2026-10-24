import { describe, expect, it } from 'vitest';
import { DICT } from '../../src/i18n';

type Tree = Record<string, unknown>;
const flat = (o: Tree, p = ''): Record<string, unknown> => Object.entries(o).reduce((acc, [k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? { ...acc, ...flat(v as Tree, p + k + '.') } : { ...acc, [p + k]: v }), {});
const vars = (s: unknown) => (typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : []);

describe('i18n completeness', () => {
  const base = flat(DICT.zh as unknown as Tree);
  for (const lang of ['en', 'ja'] as const) {
    const other = flat(DICT[lang] as unknown as Tree);
    it(`${lang} has exactly the same keys as zh`, () => { expect(Object.keys(other).sort()).toEqual(Object.keys(base).sort()); });
    it(`${lang} has no empty strings and the same {placeholders}`, () => {
      for (const [k, v] of Object.entries(base)) {
        expect(typeof other[k], k).toBe(typeof v);
        if (typeof v === 'string') { expect((other[k] as string).trim().length, k).toBeGreaterThan(0); expect(vars(other[k]), k).toEqual(vars(v)); }
      }
    });
  }
});
