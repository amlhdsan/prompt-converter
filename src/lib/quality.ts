// Local, instant prompt-quality heuristic (no API call). Scores the presence of the elements that make
// prompts work well and returns concrete suggestions for what is missing.
export type CheckId = 'role' | 'goal' | 'context' | 'constraints' | 'format' | 'steps' | 'examples' | 'length' | 'placeholders';
export interface Quality { score: number; passed: CheckId[]; missing: CheckId[]; placeholders: number }

const CHECKS: { id: CheckId; w: number; re?: RegExp }[] = [
  { id: 'role', w: 14, re: /(角色|扮演|你是一[名位个]|作为一[名位个]|\brole\b|\byou are\b|\bact as\b|\bpersona\b)/i },
  { id: 'goal', w: 16, re: /(目标|任务|目的|需求|\bgoal\b|\btask\b|\bobjective\b|\bpurpose\b)/i },
  { id: 'context', w: 10, re: /(背景|上下文|情境|场景|受众|\bcontext\b|\bbackground\b|\baudience\b)/i },
  { id: 'constraints', w: 14, re: /(约束|限制|要求|不要|避免|必须|不超过|\bconstraints?\b|\brequirements?\b|\bmust\b|\bavoid\b|\bdo not\b|\bdon't\b)/i },
  { id: 'format', w: 16, re: /(输出格式|格式|返回|以.{0,6}形式|表格|json|markdown|\bformat\b|\boutput\b|\bdeliverable\b)/i },
  { id: 'steps', w: 10, re: /(步骤|流程|首先|然后|\bsteps?\b|^\s*\d+[.)、]\s|^\s*[-*]\s)/im },
  { id: 'examples', w: 8, re: /(示例|例如|比如|样例|\bexamples?\b|\be\.g\.|\bfor instance\b)/i },
  { id: 'length', w: 12 },
];

export function assess(text: string): Quality {
  const t = text.trim();
  const passed: CheckId[] = [], missing: CheckId[] = [];
  let score = 0;
  for (const c of CHECKS) {
    const ok = c.id === 'length' ? t.length >= 80 : !!c.re?.test(t);
    if (ok) { passed.push(c.id); score += c.w; } else missing.push(c.id);
  }
  // Partial credit for length.
  if (!passed.includes('length') && t.length >= 30) score += 5;
  const placeholders = (t.match(/\[(请补充|待补充|TODO|TBD|补充)[^\]]*\]/gi) ?? []).length;
  if (placeholders) missing.push('placeholders');
  if (!t) score = 0;
  return { score: Math.min(100, score), passed, missing, placeholders };
}
export const grade = (n: number) => (n >= 80 ? 'good' : n >= 50 ? 'ok' : 'low');
