export type Mode = 'general' | 'coding' | 'writing' | 'analysis' | 'image';
export const MODES: Mode[] = ['general', 'coding', 'writing', 'analysis', 'image'];
export type OutLang = 'auto' | 'zh' | 'en';

const MODE_HINTS: Record<Mode, string> = {
  general: 'General-purpose task. Use sections: Role, Goal, Context, Constraints, Steps, Output Format.',
  coding: 'Software engineering task. Specify language/framework/version assumptions, inputs/outputs, edge cases, code quality requirements (readability, tests, error handling), and the exact deliverable format (e.g. full file, diff, explanation). Sections: Role, Goal, Context (tech stack), Requirements, Constraints, Steps, Output Format.',
  writing: 'Writing task. Specify audience, tone, style, length, structure, key points, and things to avoid. Sections: Role, Goal, Audience & Tone, Context, Constraints, Outline/Steps, Output Format.',
  analysis: 'Analysis / research task. Ask for clear reasoning, evidence and sources, assumptions, alternative views, and a concise conclusion. Sections: Role, Goal, Background, Scope & Constraints, Method/Steps, Output Format (e.g. summary + findings + recommendations).',
  image: 'Image-generation task (Midjourney / Stable Diffusion / DALL·E / 即梦 etc.). Output a rich, concrete visual prompt: subject, scene, composition, lighting, color palette, style/medium, camera/lens, mood, aspect ratio, plus a short negative prompt. Do NOT use the Role/Steps structure; output: 1) a single-paragraph main prompt, 2) an English comma-separated keyword version, 3) Negative prompt, 4) suggested parameters.',
};

export function buildMessages(input: string, mode: Mode, lang: OutLang) {
  const langRule = lang === 'zh' ? 'Write the final prompt in Simplified Chinese.'
    : lang === 'en' ? 'Write the final prompt in English.'
    : 'Write the final prompt in the same language as the user\'s original prompt.';
  const system = [
    'You are an expert prompt engineer. Rewrite the user\'s rough prompt into a well-structured, highly effective prompt for a large language model.',
    MODE_HINTS[mode],
    'Rules:',
    '- Preserve the user\'s intent exactly; do not invent facts. Where key info is missing, insert clearly marked placeholders like [请补充: ...] / [TODO: ...].',
    '- Be specific and actionable; remove ambiguity; keep it concise.',
    '- Use Markdown headings or bold labels for each section.',
    '- Output ONLY the rewritten prompt itself. Do not answer the prompt, do not add commentary before or after, do not wrap in code fences.',
    `- ${langRule}`,
  ].join('\n');
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: `Original prompt:\n"""\n${input}\n"""` },
  ];
}
