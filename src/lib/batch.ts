// Batch input splitting and a small concurrency-limited runner.
export function splitBatch(raw: string): string[] {
  const text = raw.replace(/\r\n?/g, '\n');
  if (/^\s*-{3,}\s*$/m.test(text)) return text.split(/^\s*-{3,}\s*$/m).map((x) => x.trim()).filter(Boolean);
  return text.split('\n').map((x) => x.trim()).filter(Boolean);
}

export async function runPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>, signal?: AbortSignal): Promise<PromiseSettledResult<R>[]> {
  const res: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const i = next++;
      try { res[i] = { status: 'fulfilled', value: await fn(items[i], i) }; } catch (reason) { res[i] = { status: 'rejected', reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  for (let i = 0; i < items.length; i++) if (!res[i]) res[i] = { status: 'rejected', reason: new Error('aborted') };
  return res;
}
