// Rough token estimate (no tokenizer download) and a cost estimate from public list prices (USD / 1M tokens).
// Clearly labelled as an estimate in the UI.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]/g) ?? []).length;
  const rest = text.length - cjk;
  return Math.max(1, Math.round(cjk * 1.1 + rest / 3.8));
}

// [pattern, input $/1M, output $/1M] — first match wins, so put specific ids first.
const PRICES: [RegExp, number, number][] = [
  [/gpt-4o-mini/, 0.15, 0.6], [/gpt-4\.1-nano/, 0.1, 0.4], [/gpt-4\.1-mini/, 0.4, 1.6], [/gpt-4\.1/, 2, 8], [/gpt-4o/, 2.5, 10],
  [/o4-mini|o3-mini/, 1.1, 4.4], [/gpt-5-mini/, 0.25, 2], [/gpt-5/, 1.25, 10],
  [/claude.*haiku/, 1, 5], [/claude.*opus/, 15, 75], [/claude.*sonnet/, 3, 15],
  [/gemini-2\.5-pro/, 1.25, 10], [/gemini-2\.5-flash-lite/, 0.1, 0.4], [/gemini.*flash/, 0.3, 2.5],
  [/deepseek-reasoner|deepseek-r1/i, 0.55, 2.19], [/deepseek/i, 0.27, 1.1],
  [/qwen-max/, 1.6, 6.4], [/qwen-plus/, 0.4, 1.2], [/qwen-turbo/, 0.05, 0.2],
  [/glm-4-flash/, 0, 0], [/glm-4-plus/, 0.7, 0.7], [/glm/, 0.14, 0.14],
  [/moonshot-v1-8k|kimi/, 0.17, 0.17], [/moonshot-v1-32k/, 0.33, 0.33],
];
/** Returns USD cost or null when the model's price is unknown. Local providers are free. */
export function estimateCost(model: string, inTok: number, outTok: number, local = false): number | null {
  if (local) return 0;
  const id = model.toLowerCase();
  const p = PRICES.find(([re]) => re.test(id));
  if (!p) return null;
  return (inTok * p[1] + outTok * p[2]) / 1_000_000;
}
export const fmtCost = (c: number) => (c === 0 ? '$0' : c < 0.0001 ? '<$0.0001' : `$${c < 0.01 ? c.toFixed(4) : c.toFixed(3)}`);
