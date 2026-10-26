import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/platform', () => ({ pfetch: (...a: Parameters<typeof fetch>) => globalThis.fetch(...a) }));
import { detectMode } from '../../src/lib/detect';
import { UndoStack } from '../../src/lib/undo';
import { allFolders, allTags, normTags, restoreVersion, sanitizePrompt, searchPrompts, VERSION_MAX, withNewBody, type SavedPrompt } from '../../src/lib/workspace';
import { applyRole, buildExplain, buildTranslate, chainOfThought, fewShot, jsonSchema, roleBlock, structureOf, withJsonFormat } from '../../src/lib/techniques';
import { formatImagePrompt } from '../../src/lib/imageprompt';
import { BUNDLED, isPackUrl, PackError, parsePack } from '../../src/lib/gallery';
import { barChart, dayKey, summarize, type UsageEvent } from '../../src/lib/stats';
import { DEFAULT_SYNC, mergeById, pull, push, SyncError, SYNC_FILE } from '../../src/lib/sync';
import { DEMO_OUTPUTS, demoOutput, fakeStream } from '../../src/lib/demo';
import { MODES } from '../../src/prompts';

describe('mode detection', () => {
  it.each([
    ['帮我写个python脚本批量重命名图片', 'coding'], ['fix this bug in my React component', 'coding'],
    ['画一张赛博朋克风格的城市海报', 'image'], ['a photorealistic portrait of an old fisherman', 'image'],
    ['帮我写一封邮件给客户', 'writing'], ['write a blog post about remote work', 'writing'],
    ['对比一下 React 和 Vue 的优缺点', 'analysis'], ['analyze the market trend for EVs', 'analysis'],
  ])('%s → %s', (s, m) => { expect(detectMode(s)?.mode).toBe(m); });
  it('returns null for short or neutral text', () => { expect(detectMode('hi')).toBeNull(); expect(detectMode('今天天气不错呀')).toBeNull(); });
  it('confidence is within 0..1', () => { const r = detectMode('python python python script'); expect(r!.confidence).toBeGreaterThan(0); expect(r!.confidence).toBeLessThanOrEqual(1); });
});

describe('undo stack', () => {
  it('undoes and redoes, clears redo on new push, ignores duplicates, caps size', () => {
    const u = new UndoStack('a', 3);
    u.push('b'); u.push('b'); u.push('c');
    expect(u.undo()).toBe('b'); expect(u.undo()).toBe('a'); expect(u.undo()).toBeNull();
    expect(u.redo()).toBe('b'); u.push('x'); expect(u.canRedo).toBe(false);
    for (const v of ['1', '2', '3', '4', '5']) u.push(v);
    let n = 0; while (u.undo() !== null) n++; expect(n).toBe(3);
    u.replace('typed'); expect(u.value).toBe('typed'); u.reset('z'); expect(u.canUndo).toBe(false);
  });
});

describe('workspace', () => {
  const mk = (o: Partial<SavedPrompt>): SavedPrompt => sanitizePrompt({ id: 'p' + Math.random(), body: 'b', ...o })!;
  it('sanitises input and normalises tags', () => {
    expect(sanitizePrompt({ id: 1, body: 'x' })).toBeNull();
    const p = sanitizePrompt({ id: 'a', body: 'First line\nmore', tags: ['#ai', 'ai', ' x ', 3], versions: [{ body: 'old' }, 'junk'] })!;
    expect(p.title).toBe('First line'); expect(p.tags).toEqual(['ai', 'x']); expect(p.versions.length).toBe(1);
    expect(normTags('a, b，#c  a')).toEqual(['a', 'b', 'c']);
  });
  it('keeps versions newest first, capped, and restores', () => {
    let p = mk({ body: 'v0', updated: 1 });
    for (let i = 1; i <= VERSION_MAX + 5; i++) p = withNewBody(p, 'v' + i, undefined, 100 + i);
    expect(p.body).toBe('v' + (VERSION_MAX + 5)); expect(p.versions.length).toBe(VERSION_MAX); expect(p.versions[0].body).toBe('v' + (VERSION_MAX + 4));
    expect(withNewBody(p, p.body)).toBe(p);
    const r = restoreVersion(p, 2); expect(r.body).toBe(p.versions[2].body); expect(r.versions[0].body).toBe(p.body);
    expect(restoreVersion(p, 999)).toBe(p);
  });
  it('searches by text, #tag, folder, star and sorts starred first', () => {
    const list = [mk({ title: 'SQL helper', tags: ['db'], folder: 'Work', updated: 3 }), mk({ title: 'Poem', tags: ['fun'], star: true, updated: 1 }), mk({ title: 'Email', tags: ['db', 'mail'], folder: 'Work', updated: 2, uses: 9 })];
    expect(searchPrompts(list, {}).map((p) => p.title)).toEqual(['Poem', 'SQL helper', 'Email']);
    expect(searchPrompts(list, { text: '#db' }).length).toBe(2);
    expect(searchPrompts(list, { text: 'sql' }).map((p) => p.title)).toEqual(['SQL helper']);
    expect(searchPrompts(list, { folder: 'Work', sort: 'uses' }).map((p) => p.title)).toEqual(['Email', 'SQL helper']);
    expect(searchPrompts(list, { starred: true }).length).toBe(1);
    expect(searchPrompts(list, { tag: 'mail' }).length).toBe(1);
    expect(allTags(list)[0]).toEqual(['db', 2]); expect(allFolders(list)).toEqual(['Work']);
  });
});

describe('techniques', () => {
  it('chain of thought (visible / hidden, 3 languages)', () => {
    expect(chainOfThought('P', 'en')).toContain('step by step');
    expect(chainOfThought('P', 'zh')).toContain('逐步');
    expect(chainOfThought('P', 'ja', false)).toContain('最終回答のみ');
  });
  it('few-shot skips empty examples', () => {
    expect(fewShot('P', [{ input: '', output: 'x' }])).toBe('P');
    const s = fewShot('P', [{ input: 'a', output: 'b' }, { input: 'c', output: 'd' }]);
    expect(s).toContain('## Examples'); expect(s).toContain('### 2');
  });
  it('role builder replaces an existing role section', () => {
    expect(roleBlock({ role: '' })).toBe('');
    const out = applyRole('## Role\nold role\n\n## Goal\nG', { role: 'a lawyer', tone: 'formal' });
    expect(out).toContain('You are a lawyer.'); expect(out).toContain('Tone: formal.'); expect(out).not.toContain('old role'); expect(out).toContain('## Goal');
  });
  it('json schema builder', () => {
    const s = jsonSchema([{ name: 'title', type: 'string', description: 'T' }, { name: 'tags', type: 'array', items: 'string', required: false }, { name: ' ', type: 'number' }]) as any;
    expect(Object.keys(s.properties)).toEqual(['title', 'tags']); expect(s.required).toEqual(['title']); expect(s.properties.tags.items.type).toBe('string');
    const f = withJsonFormat('P', [{ name: 'a', type: 'integer' }]);
    expect(JSON.parse(f.split('```json\n')[1].split('\n```')[0]).properties.a.type).toBe('integer');
  });
  it('explain / translate builders and structure check', () => {
    expect(buildExplain('X', 'ja')[0].content).toContain('Japanese');
    expect(buildTranslate('X', 'French')[0].content).toContain('French');
    const a = structureOf('# A\n- x\n1. y\n```\ncode\n```\n{name} {{v}}');
    expect(a).toEqual({ headings: 1, bullets: 2, fences: 2, vars: ['{name}', '{{v}}'] });
  });
});

describe('image prompts', () => {
  const base = 'a red fox in snow --ar 1:1';
  it('Midjourney flags', () => {
    const s = formatImagePrompt(base, 'mj', { aspect: '16:9', style: 'cinematic', stylize: 250, negative: 'text, watermark', raw: true, seed: 42, quality: 'high' });
    expect(s).toMatch(/^a red fox in snow, cinematic --ar 16:9 --v 6\.1 --s 250 --style raw --no text, watermark --seed 42 --q 2$/);
  });
  it('Stable Diffusion block with size from aspect', () => {
    const s = formatImagePrompt(base, 'sd', { aspect: '16:9', steps: 25, cfg: 6 });
    expect(s).toContain('Negative prompt:'); expect(s).toContain('Steps: 25'); expect(s).toMatch(/Size: (\d+)x(\d+)/);
    const [, w, h] = s.match(/Size: (\d+)x(\d+)/)!; expect(Number(w)).toBeGreaterThan(Number(h)); expect(Number(w) % 64).toBe(0);
  });
  it('DALL·E natural sentence + size', () => {
    expect(formatImagePrompt(base, 'dalle', { aspect: '9:16' })).toContain('1024x1792');
    expect(formatImagePrompt(base, 'dalle', { aspect: '1:1', quality: 'high' })).toMatch(/^A red fox in snow\./);
  });
});

describe('gallery', () => {
  it('bundled packs are valid and ids unique', () => {
    const ids = BUNDLED.flatMap((p) => p.templates.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length); expect(ids.length).toBeGreaterThanOrEqual(12);
    for (const p of BUNDLED) expect(parsePack(p).templates.length).toBe(p.templates.length);
  });
  it('parses packs and bare arrays, rejects junk', () => {
    expect(parsePack([{ name: 'A', prompt: 'p' }, { name: '' }]).templates.length).toBe(1);
    expect(() => parsePack({})).toThrow(PackError); expect(() => parsePack({ templates: [{}] })).toThrow('empty');
    expect(isPackUrl('https://x.com/p.json')).toBe(true); expect(isPackUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('stats', () => {
  it('summarises by day, kind, model and computes streak', () => {
    const now = new Date('2026-10-26T12:00:00').getTime();
    const ev: UsageEvent[] = [
      { at: now, kind: 'convert', model: 'a', inTok: 10, outTok: 20, cost: 0.01, ms: 100, ok: true },
      { at: now - 86_400_000, kind: 'chat', model: 'b', inTok: 5, outTok: 5, cost: null, ms: 300, ok: false },
      { at: now - 30 * 86_400_000, kind: 'convert', model: 'a', inTok: 1, outTok: 1, cost: 0, ok: true },
    ];
    const s = summarize(ev, 7, now);
    expect(s).toMatchObject({ calls: 3, ok: 2, inTok: 16, outTok: 26, avgMs: 200, streak: 2, byKind: { convert: 2, chat: 1 } });
    expect(s.byModel[0]).toEqual(['a', 2]); expect(s.days.length).toBe(7); expect(s.days[6]).toMatchObject({ day: dayKey(now), calls: 1, tokens: 30 });
    expect(barChart([{ label: 'x', value: 2 }])).toContain('<rect');
  });
});

describe('sync', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('merges by id keeping the newest', () => {
    const r = mergeById([{ id: 'a', at: 1, v: 1 }, { id: 'b', at: 5 }], [{ id: 'a', updated: 3, v: 2 }, { id: 'c', at: 2 }] as any);
    expect(r.map((x: any) => x.id)).toEqual(['b', 'a', 'c']); expect((r[1] as any).v).toBe(2);
  });
  it('WebDAV push / pull with basic auth', async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: RequestInit) => {
      expect((init.headers as any).Authorization).toBe('Basic ' + btoa('me:pw'));
      if (init.method === 'PUT') { store[u] = init.body as string; return new Response('', { status: 201 }); }
      return store[u] ? new Response(store[u]) : new Response('', { status: 404 });
    }));
    const c = { ...DEFAULT_SYNC, kind: 'webdav' as const, url: 'https://dav.test/dir', user: 'me', pass: 'pw' };
    expect(await pull(c)).toBeNull();
    await push(c, { x: 1 });
    expect(Object.keys(store)[0]).toBe('https://dav.test/dir/' + SYNC_FILE);
    expect(await pull(c)).toEqual({ x: 1 });
  });
  it('Gist creates then updates, maps auth errors', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: RequestInit) => {
      calls.push(`${init.method} ${u}`);
      if (init.method === 'POST') return new Response(JSON.stringify({ id: 'g1' }), { status: 201 });
      if (init.method === 'PATCH') return new Response(JSON.stringify({ id: 'g1' }));
      return new Response(JSON.stringify({ files: { [SYNC_FILE]: { content: '{"y":2}' } } }));
    }));
    const c = { ...DEFAULT_SYNC, kind: 'gist' as const, token: 't' };
    expect(await push(c, {})).toBe('g1');
    expect(await push({ ...c, gistId: 'g1' }, {})).toBe('g1');
    expect(await pull({ ...c, gistId: 'g1' })).toEqual({ y: 2 });
    expect(calls[0]).toMatch(/^POST .*\/gists$/); expect(calls[1]).toMatch(/^PATCH .*\/gists\/g1$/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(pull({ ...c, gistId: 'g1' })).rejects.toMatchObject({ kind: 'auth' });
    await expect(push({ ...c, token: '' }, {})).rejects.toBeInstanceOf(SyncError);
  });
});

describe('demo mode', () => {
  it('has outputs for every mode and language', () => { for (const m of MODES) { expect(DEMO_OUTPUTS[m].zh.length).toBeGreaterThan(50); expect(DEMO_OUTPUTS[m].en.length).toBeGreaterThan(50); } expect(demoOutput('tpl:x', 'en')).toBe(DEMO_OUTPUTS.general.en); });
  it('fake stream emits progressively and aborts', async () => {
    const seen: string[] = [];
    expect(await fakeStream('abcdefghij', (s) => seen.push(s), undefined, 4, 0)).toBe('abcdefghij');
    expect(seen).toEqual(['abcd', 'abcdefgh', 'abcdefghij']);
    const c = new AbortController(); c.abort();
    await expect(fakeStream('abc', () => {}, c.signal)).rejects.toThrow('aborted');
  });
});
