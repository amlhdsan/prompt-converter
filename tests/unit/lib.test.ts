import { describe, expect, it } from 'vitest';
import { diff, diffHtml } from '../../src/lib/diff';
import { assess, grade } from '../../src/lib/quality';
import { estimateCost, estimateTokens, fmtCost } from '../../src/lib/tokens';
import { decodeShare, encodeShare } from '../../src/lib/share';
import { escapeHtml, renderMarkdown } from '../../src/lib/markdown';
import { fillPlaceholders, findPlaceholders } from '../../src/lib/placeholders';
import { runPool, splitBatch } from '../../src/lib/batch';
import { toMarkdown } from '../../src/lib/export';
import { clearErrors, formatErrors, getErrors, logError } from '../../src/lib/errlog';
import { EXAMPLES } from '../../src/lib/library';
import { PROVIDERS, providerById, needsKey } from '../../src/providers';
import { buildMessages, buildRefine, langRule, MODES, MODE_HINTS, OUT_LANGS } from '../../src/prompts';
import { cmpVersion } from '../../src/update';

describe('diff', () => {
  const join = (ops: ReturnType<typeof diff>, keep: string[]) => ops.filter((o) => keep.includes(o.t)).map((o) => o.v).join('');
  it('reconstructs both sides', () => {
    const a = 'The quick brown fox 跳过了 懒狗', b = 'The slow brown fox 跳过 一只 懒狗!';
    const ops = diff(a, b);
    expect(join(ops, ['eq', 'del'])).toBe(a);
    expect(join(ops, ['eq', 'add'])).toBe(b);
  });
  it('handles identical and empty inputs', () => {
    expect(diff('same', 'same')).toEqual([{ t: 'eq', v: 'same' }]);
    expect(diff('', '')).toEqual([]);
    expect(diff('', 'x')).toEqual([{ t: 'add', v: 'x' }]);
  });
  it('escapes HTML and counts changes', () => {
    const r = diffHtml('<a>', '<b>');
    expect(r.html).not.toContain('<a>');
    expect(r.added).toBeGreaterThan(0); expect(r.removed).toBeGreaterThan(0);
  });
  it('survives huge inputs', () => {
    const big = 'word '.repeat(5000);
    expect(diff(big, big + 'x').length).toBeGreaterThan(0);
  });
});

describe('quality score', () => {
  it('scores a structured prompt higher than a vague one', () => {
    const good = '# Role\nYou are a senior engineer.\n## Goal\nWrite a function that parses CSV.\n## Context\nUsed by data team.\n## Constraints\n- Do not use external libs\n## Output format\nReturn markdown with code.\n## Steps\n1. Parse\n2. Validate\n## Example\nInput: a,b → Output: ["a","b"]';
    const a = assess(good), b = assess('help me');
    expect(a.score).toBeGreaterThan(b.score);
    expect(grade(a.score)).not.toBe('low');
    expect(b.missing).toContain('length');
  });
  it('counts placeholders', () => {
    expect(assess('Role: you are X. [请补充：目标用户] and [TODO: deadline]').placeholders).toBe(2);
  });
  it('grades boundaries', () => { expect([grade(80), grade(50), grade(49)]).toEqual(['good', 'ok', 'low']); });
});

describe('tokens', () => {
  it('estimates CJK and latin text', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('你好世界')).toBeGreaterThanOrEqual(2);
    expect(estimateTokens('hello world '.repeat(100))).toBeGreaterThan(150);
  });
  it('estimates cost and formats it', () => {
    expect(estimateCost('some-unknown-model-xyz', 1000, 1000)).toBeNull();
    expect(estimateCost('anything', 10, 10, true)).toBe(0);
    expect(fmtCost(0)).toBe('$0'); expect(fmtCost(0.00001)).toBe('<$0.0001');
  });
});

describe('share', () => {
  it('round-trips unicode payloads', async () => {
    const p = { i: '原始 prompt 🚀'.repeat(50), o: 'out\n'.repeat(100), m: 'coding' };
    const enc = await encodeShare(p);
    expect(enc).toMatch(/^[zb][A-Za-z0-9_-]+$/);
    expect(await decodeShare(enc)).toEqual(p);
  });
  it('returns null on garbage', async () => {
    for (const g of ['', 'x', 'zzzz', 'b!!!', 'b' + btoa('{"i":1}')]) expect(await decodeShare(g)).toBeNull();
  });
});

describe('markdown', () => {
  it('escapes HTML and never emits script', () => {
    expect(escapeHtml('<&>"\'')).toBe('&lt;&amp;&gt;&quot;&#39;');
    const h = renderMarkdown('# T\n<script>alert(1)</script>\n[x](javascript:alert(1))\n- a\n- b\n\n```js\nconst a = 1 < 2;\n```');
    expect(h).not.toMatch(/<script|href="javascript:/i);
    expect(h).toContain('<h2'); expect(h).toContain('<li'); expect(h).toContain('&lt;');
  });
});

describe('placeholders', () => {
  it('finds, de-dupes and fills placeholders', () => {
    const s = 'A [请补充：目标读者] B [TODO: deadline] C [请补充：目标读者] [not one]';
    const ph = findPlaceholders(s);
    expect(ph.map((p) => [p.label, p.count])).toEqual([['目标读者', 2], ['deadline', 1]]);
    expect(fillPlaceholders(s, { '[请补充：目标读者]': '工程师', '[TODO: deadline]': ' ' })).toBe('A 工程师 B [TODO: deadline] C 工程师 [not one]');
  });
});

describe('batch', () => {
  it('splits by line or by --- blocks', () => {
    expect(splitBatch('a\n\n b \r\nc')).toEqual(['a', 'b', 'c']);
    expect(splitBatch('line1\nline2\n---\nsecond\n  ----  \n\n')).toEqual(['line1\nline2', 'second']);
    expect(splitBatch('  ')).toEqual([]);
  });
  it('limits concurrency and keeps result order', async () => {
    let live = 0, peak = 0;
    const r = await runPool([30, 10, 20, 5], 2, async (ms, i) => { live++; peak = Math.max(peak, live); await new Promise((x) => setTimeout(x, ms)); live--; if (i === 2) throw new Error('x'); return i; });
    expect(peak).toBe(2);
    expect(r.map((x) => x.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled']);
  });
  it('stops on abort', async () => {
    const c = new AbortController();
    const r = await runPool([1, 2, 3, 4], 1, async (x) => { if (x === 2) c.abort(); return x; }, c.signal);
    expect(r.filter((x) => x.status === 'fulfilled').length).toBe(2);
  });
});

describe('markdown export', () => {
  it('fences inputs safely and lists every entry', () => {
    const md = toMarkdown('History', [{ input: 'has ``` fence', output: 'OUT', mode: 'coding', model: 'm', fav: true }, { input: 'b', output: 'c' }], { original: 'O', converted: 'C' }, (x) => x.toUpperCase());
    expect(md).toContain('# History');
    expect(md).toContain('````text\nhas ``` fence\n````');
    expect(md).toContain('## 1. ★ has');
    expect(md).toContain('CODING');
    expect(md.match(/^## /gm)!.length).toBe(2);
  });
});

describe('error log', () => {
  it('records, caps and formats errors', () => {
    clearErrors();
    for (let i = 0; i < 60; i++) logError(new Error('e' + i), 'test');
    expect(getErrors().length).toBe(50);
    expect(getErrors()[0].msg).toBe('e59');
    expect(formatErrors(getErrors().slice(0, 1), '1.4.0')).toContain('(test) e59');
    clearErrors(); expect(getErrors()).toEqual([]);
  });
});

describe('providers & prompts', () => {
  it('has unique, well-formed presets', () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    for (const p of PROVIDERS) { expect(['openai', 'anthropic']).toContain(p.kind); if (p.id !== 'custom') expect(p.baseUrl).toMatch(/^https?:\/\//); }
    expect(providerById('nope').id).toBe('custom');
    expect(needsKey(providerById('custom'))).toBe(false);
  });
  it('builds messages with mode hints and language rules', () => {
    for (const m of MODES) expect(MODE_HINTS[m].length).toBeGreaterThan(20);
    const msgs = buildMessages('做一个网站', MODE_HINTS.coding, 'en');
    expect(msgs[0].role).toBe('system');
    expect(msgs.slice(-1)[0]!.content).toContain('做一个网站');
    expect(langRule('custom', 'Klingon')).toContain('Klingon');
    for (const l of OUT_LANGS) expect(typeof langRule(l, 'X')).toBe('string');
    expect(buildRefine('in', 'prev', 'shorter', 'h', 'auto').map((m) => m.content).join()).toContain('shorter');
  });
  it('library examples are complete', () => { for (const e of EXAMPLES) { expect(e.zh.p && e.en.p && e.zh.t && e.en.t).toBeTruthy(); expect(MODES).toContain(e.mode); } });
  it('compares versions', () => { expect(Math.sign(cmpVersion('1.4.0', '1.3.9'))).toBe(1); expect(cmpVersion('v1.2', '1.2.0')).toBe(0); expect(Math.sign(cmpVersion('1.2.0', '1.10.0'))).toBe(-1); });
});
