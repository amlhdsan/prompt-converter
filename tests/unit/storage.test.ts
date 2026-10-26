import { beforeEach, describe, expect, it, vi } from 'vitest';

type S = typeof import('../../src/storage');
const load = async (): Promise<S> => { vi.resetModules(); return import('../../src/storage'); };
const hist = (n: number, fav = (_i: number) => false) => Array.from({ length: n }, (_, i) => ({ id: 'h' + i, at: 1000 - i, mode: 'general', input: 'in' + i, output: 'out' + i, model: 'm', ...(fav(i) ? { fav: true } : {}) }));

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('migrations', () => {
  it('fresh install is stamped with the current schema and no-op', async () => {
    const s = await load();
    expect(localStorage.getItem(s.K.schema)).toBe(String(s.SCHEMA_VERSION));
    expect(s.loadSettings()).toEqual(expect.objectContaining({ retries: 2, errorLog: true, modeHints: {} }));
  });
  it('upgrades pre-schema (v1.2) data: fills new fields, drops malformed and duplicate entries', async () => {
    localStorage.setItem('pc.settings.v1', JSON.stringify({ provider: 'openai', model: 'gpt-x', uiLang: 'fr', variants: 9, timeoutSec: 'abc', apiKeys: { openai: 'sk', bad: 3 } }));
    localStorage.setItem('pc.history.v1', JSON.stringify([...hist(2), { id: 'h0', at: 1, input: 'dup', output: 'x' }, { nope: 1 }, null, 'str']));
    localStorage.setItem('pc.templates.v1', JSON.stringify([{ id: 't', name: 'T', prompt: 'P' }, { id: 'e', name: '', prompt: 'x' }]));
    const s = await load();
    const st = s.loadSettings();
    expect(st).toMatchObject({ provider: 'openai', model: 'gpt-x', uiLang: 'zh', variants: 3, timeoutSec: 60, retries: 2, apiKeys: { openai: 'sk' } });
    expect(s.loadHistory().map((h) => h.id)).toEqual(['h0', 'h1']);
    expect(s.loadTemplates()).toEqual([expect.objectContaining({ id: 't', icon: '⭐' })]);
    expect(localStorage.getItem('pc.schema')).toBe('3');
  });
  it('does not re-run migrations once stamped', async () => {
    localStorage.setItem('pc.schema', '3');
    localStorage.setItem('pc.history.v1', JSON.stringify([{ id: 'x', at: 1, input: 'a', output: 'b', extra: 1 }]));
    await load();
    expect(JSON.parse(localStorage.getItem('pc.history.v1')!)[0].extra).toBe(1);
  });
});

describe('corruption recovery', () => {
  it('backs up corrupted JSON, resets to defaults and reports it', async () => {
    localStorage.setItem('pc.schema', '3');
    localStorage.setItem('pc.settings.v1', '{not json');
    const s = await load();
    expect(s.loadSettings().provider).toBe(s.DEFAULT_SETTINGS.provider);
    expect(localStorage.getItem('pc.corrupt.pc.settings.v1')).toBe('{not json');
    expect(s.health.recovered).toContain('pc.settings.v1');
    expect(JSON.parse(localStorage.getItem('pc.errors.v1')!)[0].ctx).toBe('storage:pc.settings.v1');
  });
  it('treats non-array history as empty', async () => {
    localStorage.setItem('pc.schema', '3');
    localStorage.setItem('pc.history.v1', '{"a":1}');
    expect((await load()).loadHistory()).toEqual([]);
  });
});

describe('quota fallback', () => {
  it('evicts old non-favourite history, then falls back to memory', async () => {
    const s = await load();
    s.saveHistory(hist(40, (i) => i % 10 === 0));
    const orig = localStorage.setItem.bind(localStorage);
    let fail = 2;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === 'pc.settings.v1' && fail-- > 0) throw new DOMException('full', 'QuotaExceededError');
      return orig(k, v);
    });
    expect(s.rawSet('pc.settings.v1', '{"a":1}')).toBe(true);
    const h = s.loadHistory();
    expect(h.length).toBeLessThan(40);
    expect(h.filter((x) => x.fav).length).toBe(4); // favourites survive
    spy.mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(s.rawSet('pc.templates.v1', '[]')).toBe(false);
    expect(s.health.degraded).toBe(true);
    spy.mockRestore();
  });
  it('keeps working in memory when storage throws entirely', async () => {
    const s = await load();
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    s.saveSettings({ ...s.loadSettings(), model: 'mem-model' });
    expect(s.loadSettings().model).toBe('mem-model');
    expect(s.health.degraded).toBe(true);
  });
});

describe('history & templates', () => {
  it('caps history but keeps favourites, toggles favourites, clear keeps favourites', async () => {
    const s = await load();
    for (const h of hist(5).reverse()) s.addHistory(h, 3);
    expect(s.loadHistory().length).toBe(3);
    const id = s.loadHistory()[2].id;
    s.toggleFav(id);
    s.addHistory({ ...hist(1)[0], id: 'new' }, 3);
    expect(s.loadHistory().some((x) => x.id === id)).toBe(true);
    s.clearHistory();
    expect(s.loadHistory().map((x) => x.id)).toEqual([id]);
  });
  it('upserts and deletes templates', async () => {
    const s = await load();
    s.upsertTemplate({ id: 'a', name: 'A', icon: '1', prompt: 'p', at: 1 });
    s.upsertTemplate({ id: 'a', name: 'A2', icon: '1', prompt: 'p', at: 2 });
    expect(s.loadTemplates().map((t) => t.name)).toEqual(['A2']);
    s.deleteTemplate('a');
    expect(s.loadTemplates()).toEqual([]);
  });
});

describe('import / export', () => {
  it('round-trips and strips keys unless requested', async () => {
    const s = await load();
    s.saveSettings({ ...s.loadSettings(), apiKeys: { openai: 'sk-1' }, profiles: [{ id: 'p', name: 'P', provider: 'openai', baseUrl: '', model: 'm', apiKey: 'sk-p' }] });
    s.saveHistory(hist(2));
    const noKeys = s.exportData('1.4.0', { settings: true, templates: true, history: true, keys: false });
    expect(noKeys.schema).toBe(s.SCHEMA_VERSION);
    expect(noKeys.settings!.apiKeys).toBeUndefined();
    expect(noKeys.settings!.profiles![0].apiKey).toBe('');
    expect(s.exportData('1', { settings: true, templates: false, history: false, keys: true }).settings!.apiKeys).toEqual({ openai: 'sk-1' });
    localStorage.clear();
    const s2 = await load();
    const r = s2.importData(JSON.parse(JSON.stringify(noKeys)));
    expect(r).toEqual({ settings: true, templates: 0, history: 2, skipped: 0, workspace: 0 });
    expect(s2.loadHistory().length).toBe(2);
  });
  it('rejects invalid, newer and malformed backups', async () => {
    const s = await load();
    for (const bad of [null, [], 'x', 42, {}, { app: 'other' }]) expect(() => s.importData(bad)).toThrow(s.ImportError);
    expect(() => s.importData({ app: 'prompt-converter', schema: 99 })).toThrow('newer');
    expect(() => s.importData({ app: 'prompt-converter', history: {} })).toThrow('history');
    expect(() => s.importData({ app: 'prompt-converter', templates: 'x' })).toThrow('templates');
  });
  it('skips malformed entries, merges by id and keeps existing keys', async () => {
    const s = await load();
    s.saveSettings({ ...s.loadSettings(), apiKeys: { openai: 'keep' } });
    s.saveHistory([hist(1)[0]]);
    const r = s.importData({ app: 'prompt-converter', settings: { model: 'imp', theme: 'neon' }, history: [{ ...hist(1)[0], output: 'replaced' }, { id: 1 }], templates: [{ id: 't', name: 'T', prompt: 'p' }, {}] });
    expect(r).toEqual({ settings: true, templates: 1, history: 1, skipped: 2 });
    const st = s.loadSettings();
    expect(st).toMatchObject({ model: 'imp', theme: 'system', apiKeys: { openai: 'keep' } });
    expect(s.loadHistory()[0].output).toBe('replaced');
  });
});

describe('session keys & multi-tab sync', () => {
  it('stores keys in sessionStorage only when sessionKeys is on', async () => {
    const s = await load();
    s.saveSettings({ ...s.loadSettings(), sessionKeys: true, apiKeys: { openai: 'secret' } });
    expect(localStorage.getItem('pc.settings.v1')).not.toContain('secret');
    expect(s.loadSettings().apiKeys.openai).toBe('secret');
  });
  it('notifies on external changes to our keys only', async () => {
    const s = await load();
    const cb = vi.fn();
    const off = s.onExternalChange(cb);
    window.dispatchEvent(new StorageEvent('storage', { key: 'pc.settings.v1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    window.dispatchEvent(new StorageEvent('storage', { key: 'pc.history.v1' }));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
