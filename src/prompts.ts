export type Mode = 'general' | 'coding' | 'writing' | 'analysis' | 'image';
export const MODES: Mode[] = ['general', 'coding', 'writing', 'analysis', 'image'];
/** Output language: auto (same as input), a preset language code, or 'custom' (free text in settings.customLang). */
export type OutLang = 'auto' | 'zh' | 'zh-TW' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'ru' | 'custom';
export const OUT_LANGS: OutLang[] = ['auto', 'zh', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'custom'];
const LANG_NAMES: Record<string, string> = {
  zh: 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', en: 'English', ja: 'Japanese', ko: 'Korean',
  fr: 'French', de: 'German', es: 'Spanish', ru: 'Russian',
};

export const MODE_HINTS: Record<Mode, string> = {
  general: 'General-purpose task. Use sections: Role, Goal, Context, Constraints, Steps, Output Format.',
  coding: 'Software engineering task. Specify language/framework/version assumptions, inputs/outputs, edge cases, code quality requirements (readability, tests, error handling), and the exact deliverable format (e.g. full file, diff, explanation). Sections: Role, Goal, Context (tech stack), Requirements, Constraints, Steps, Output Format.',
  writing: 'Writing task. Specify audience, tone, style, length, structure, key points, and things to avoid. Sections: Role, Goal, Audience & Tone, Context, Constraints, Outline/Steps, Output Format.',
  analysis: 'Analysis / research task. Ask for clear reasoning, evidence and sources, assumptions, alternative views, and a concise conclusion. Sections: Role, Goal, Background, Scope & Constraints, Method/Steps, Output Format (e.g. summary + findings + recommendations).',
  image: 'Image-generation task (Midjourney / Stable Diffusion / DALL·E / 即梦 etc.). Output a rich, concrete visual prompt: subject, scene, composition, lighting, color palette, style/medium, camera/lens, mood, aspect ratio, plus a short negative prompt. Do NOT use the Role/Steps structure; output: 1) a single-paragraph main prompt, 2) an English comma-separated keyword version, 3) Negative prompt, 4) suggested parameters.',
};

export function langRule(lang: string, custom = ''): string {
  if (lang === 'custom' && custom.trim()) return `Write the final prompt in ${custom.trim()}.`;
  if (LANG_NAMES[lang]) return `Write the final prompt in ${LANG_NAMES[lang]}.`;
  return 'Write the final prompt in the same language as the user\'s original prompt.';
}

/** `hint` is a built-in mode hint or a user template's instructions. */
export function buildMessages(input: string, hint: string, lang: string, customLang = '') {
  const system = [
    'You are an expert prompt engineer. Rewrite the user\'s rough prompt into a well-structured, highly effective prompt for a large language model.',
    hint,
    'Rules:',
    '- Preserve the user\'s intent exactly; do not invent facts. Where key info is missing, insert clearly marked placeholders like [请补充: ...] / [TODO: ...].',
    '- Be specific and actionable; remove ambiguity; keep it concise.',
    '- Use Markdown headings or bold labels for each section (unless the instructions above specify another format).',
    '- Output ONLY the rewritten prompt itself. Do not answer the prompt, do not add commentary before or after, do not wrap in code fences.',
    `- ${langRule(lang, customLang)}`,
  ].join('\n');
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: `Original prompt:\n"""\n${input}\n"""` },
  ];
}
