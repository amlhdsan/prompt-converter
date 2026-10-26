// Prompt-engineering toolbox: deterministic transforms plus message builders for model-assisted ones.
export type TechLang = 'zh' | 'en' | 'ja';
const L = (lang: TechLang, zh: string, en: string, ja: string) => (lang === 'zh' ? zh : lang === 'ja' ? ja : en);

export function chainOfThought(prompt: string, lang: TechLang = 'en', visible = true): string {
  const block = visible
    ? L(lang, '## 推理方式\n请先逐步思考：1) 复述任务与约束；2) 列出关键假设；3) 分步推理并检查每一步；4) 最后给出结论。将推理放在「思考过程」小节，结论放在「最终答案」小节。',
      '## Reasoning\nThink step by step before answering: 1) restate the task and constraints; 2) list key assumptions; 3) reason through each step and check it; 4) give the conclusion. Put the reasoning under "Reasoning" and the result under "Final answer".',
      '## 推論方法\n回答する前に段階的に考えてください：1) タスクと制約を言い換える 2) 主要な前提を挙げる 3) 各ステップを検証しながら推論する 4) 結論を述べる。推論は「思考過程」、結論は「最終回答」に分けてください。')
    : L(lang, '## 推理方式\n请在内部逐步推理并自我检查，但只输出最终答案。', '## Reasoning\nReason step by step internally and double-check, but output only the final answer.', '## 推論方法\n内部で段階的に推論・検証し、最終回答のみを出力してください。');
  return `${prompt.trim()}\n\n${block}`;
}

export interface Shot { input: string; output: string }
export function fewShot(prompt: string, shots: Shot[], lang: TechLang = 'en'): string {
  const ok = shots.filter((s) => s.input.trim() && s.output.trim());
  if (!ok.length) return prompt.trim();
  const h = L(lang, '## 示例', '## Examples', '## 例');
  const i = L(lang, '输入', 'Input', '入力'), o = L(lang, '输出', 'Output', '出力');
  const body = ok.map((s, n) => `### ${n + 1}\n**${i}:**\n${s.input.trim()}\n\n**${o}:**\n${s.output.trim()}`).join('\n\n');
  return `${prompt.trim()}\n\n${h}\n${L(lang, '请严格遵循以下示例的格式与风格：', 'Follow the format and style of these examples exactly:', '次の例の形式とスタイルに厳密に従ってください：')}\n\n${body}`;
}

export interface Role { role: string; expertise?: string; audience?: string; tone?: string; avoid?: string }
export function roleBlock(r: Role, lang: TechLang = 'en'): string {
  if (!r.role.trim()) return '';
  const lines = [
    L(lang, `你是${r.role.trim()}。`, `You are ${r.role.trim()}.`, `あなたは${r.role.trim()}です。`),
    r.expertise?.trim() && L(lang, `专长：${r.expertise.trim()}。`, `Expertise: ${r.expertise.trim()}.`, `専門：${r.expertise.trim()}。`),
    r.audience?.trim() && L(lang, `面向读者：${r.audience.trim()}。`, `Audience: ${r.audience.trim()}.`, `対象読者：${r.audience.trim()}。`),
    r.tone?.trim() && L(lang, `语气：${r.tone.trim()}。`, `Tone: ${r.tone.trim()}.`, `トーン：${r.tone.trim()}。`),
    r.avoid?.trim() && L(lang, `避免：${r.avoid.trim()}。`, `Avoid: ${r.avoid.trim()}.`, `避けること：${r.avoid.trim()}。`),
  ].filter(Boolean);
  return `${L(lang, '## 角色', '## Role', '## 役割')}\n${lines.join('\n')}`;
}
/** Prepends a role block, replacing an existing leading "## Role/角色/役割" section. */
export function applyRole(prompt: string, r: Role, lang: TechLang = 'en'): string {
  const block = roleBlock(r, lang); if (!block) return prompt;
  const stripped = prompt.replace(/^\s*#{1,3}\s*(role|角色|役割)\b[^\n]*\n[\s\S]*?(?=\n#{1,3}\s|$)/i, '').trim();
  return `${block}\n\n${stripped}`;
}

export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
export interface Field { name: string; type: FieldType; description?: string; required?: boolean; items?: FieldType }
export function jsonSchema(fields: Field[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    const name = f.name.trim(); if (!name) continue;
    const p: Record<string, unknown> = { type: f.type };
    if (f.description?.trim()) p.description = f.description.trim();
    if (f.type === 'array') p.items = { type: f.items ?? 'string' };
    if (f.type === 'object') p.additionalProperties = true;
    props[name] = p;
    if (f.required !== false) required.push(name);
  }
  return { type: 'object', properties: props, required, additionalProperties: false };
}
export function withJsonFormat(prompt: string, fields: Field[], lang: TechLang = 'en'): string {
  const schema = JSON.stringify(jsonSchema(fields), null, 2);
  return `${prompt.trim()}\n\n${L(lang, '## 输出格式\n只输出一个符合以下 JSON Schema 的 JSON 对象，不要输出任何其他文字或代码块标记：', '## Output format\nRespond with a single JSON object that validates against this JSON Schema. Output nothing else (no prose, no code fences):', '## 出力形式\n次の JSON Schema に適合する JSON オブジェクトのみを出力してください（説明文やコードフェンスは不要）：')}\n\n\`\`\`json\n${schema}\n\`\`\``;
}

export const buildExplain = (prompt: string, uiLang: TechLang) => [
  { role: 'system' as const, content: `You are a prompt-engineering reviewer. Analyse the user's prompt. Answer in ${L(uiLang, 'Simplified Chinese', 'English', 'Japanese')} using Markdown with these sections: 1) Intent (one sentence) 2) Structure (what each part does) 3) Techniques used 4) Weaknesses & ambiguities 5) Concrete improvement suggestions. Be concise.` },
  { role: 'user' as const, content: `Prompt to analyse:\n"""\n${prompt}\n"""` },
];
export const buildTranslate = (prompt: string, target: string) => [
  { role: 'system' as const, content: `Translate the user's prompt into ${target}. Preserve the structure exactly: Markdown headings, lists, numbering, code blocks, placeholders in [brackets], variables like {name} or {{name}}, JSON keys and technical terms. Do not answer, shorten or add anything. Output only the translation.` },
  { role: 'user' as const, content: prompt },
];
/** Checks that a translation kept the prompt's skeleton (headings, list items, code fences, placeholders). */
export function structureOf(s: string) {
  return {
    headings: (s.match(/^#{1,6}\s/gm) ?? []).length,
    bullets: (s.match(/^\s*([-*+]|\d+[.)])\s/gm) ?? []).length,
    fences: (s.match(/^```/gm) ?? []).length,
    vars: (s.match(/\{\{?\w+\}?\}/g) ?? []).sort(),
  };
}
