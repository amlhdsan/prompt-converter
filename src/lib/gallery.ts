// Template gallery: bundled packs plus import/validation of shared packs (JSON or URL).
export interface GalleryTemplate { id: string; name: string; icon: string; prompt: string; tags?: string[]; desc?: string }
export interface Pack { id: string; name: string; author?: string; desc?: string; templates: GalleryTemplate[] }

const T = (id: string, icon: string, name: string, desc: string, prompt: string, tags: string[]): GalleryTemplate => ({ id, icon, name, desc, prompt, tags });
export const BUNDLED: Pack[] = [
  { id: 'work', name: 'Work & Office · 职场办公', author: 'Prompt Converter', templates: [
    T('g-meeting', '📝', '会议纪要 Meeting notes', 'Turn raw notes into minutes', 'Meeting-notes task. Turn the input into structured minutes: Attendees, Agenda, Decisions, Action items (owner + due date as a table), Open questions. Keep facts only; mark unknown owners/dates as [TODO].', ['office', 'notes']),
    T('g-okr', '🎯', 'OKR 制定 OKR draft', 'Draft objectives and key results', 'OKR task. Produce 1–3 Objectives, each with 3–4 measurable Key Results (metric, baseline, target, deadline) and initiatives. Flag unmeasurable KRs. Output as Markdown table.', ['office', 'planning']),
    T('g-email-reply', '📧', '邮件回复 Email reply', 'Reply professionally', 'Email-reply task. Ask for: the original email, the desired outcome, tone, constraints. Output a subject line and a concise reply with a clear call to action.', ['writing', 'email']),
    T('g-prd', '📐', '需求文档 PRD', 'Product requirement doc', 'PRD task. Sections: Background, Goals & non-goals, Users & scenarios, Functional requirements (numbered, with priority), Non-functional requirements, Metrics, Risks, Milestones.', ['product']),
  ] },
  { id: 'dev', name: 'Developer · 开发者', author: 'Prompt Converter', templates: [
    T('g-unit', '🧪', '单元测试 Unit tests', 'Generate thorough tests', 'Unit-test task. Specify the language and framework, list cases (happy path, edge cases, errors), mocking strategy, and require runnable test code with clear names.', ['coding', 'testing']),
    T('g-refactor', '🧹', '代码重构 Refactor', 'Improve code safely', 'Refactoring task. Preserve behaviour; list code smells found, the refactoring plan, then the full refactored code and a short changelog. Note any behaviour that could not be preserved.', ['coding']),
    T('g-sqlopt', '🗄️', 'SQL 优化 SQL tuning', 'Explain & optimise a query', 'SQL-optimisation task. Ask for schema, indexes, data volume and DB engine. Output: explanation of the current plan, bottlenecks, optimised query, index suggestions, expected impact.', ['coding', 'sql']),
    T('g-commit', '🔖', '提交信息 Commit message', 'Conventional commits', 'Commit-message task. Output a Conventional Commits message: type(scope): subject (≤72 chars), blank line, body explaining why, and BREAKING CHANGE footer if applicable.', ['coding', 'git']),
  ] },
  { id: 'creative', name: 'Creative · 创作', author: 'Prompt Converter', templates: [
    T('g-story', '📖', '短篇故事 Short story', 'Story with structure', 'Fiction task. Specify genre, POV, setting, characters with goals, conflict, three-act outline, word count and ending type. Show, don\'t tell.', ['writing', 'fiction']),
    T('g-video', '🎬', '短视频脚本 Video script', 'Shot-by-shot script', 'Short-video script task. Output a table: shot #, duration, visuals, voice-over, on-screen text, music/SFX. Hook in the first 3 seconds; total length as specified.', ['writing', 'video']),
    T('g-brand', '💡', '品牌命名 Brand naming', 'Names with rationale', 'Brand-naming task. Ask for industry, values, audience, languages. Output 10 names with meaning, pronunciation notes, domain/handle ideas, and risks.', ['marketing']),
    T('g-mj', '🎨', 'Midjourney 海报 MJ poster', 'Poster prompt with params', 'Image-generation task for Midjourney. Output a vivid English prompt (subject, composition, lighting, palette, style), then the parameter string (--ar, --v, --s) and a --no list.', ['image']),
  ] },
  { id: 'learn', name: 'Learning · 学习', author: 'Prompt Converter', templates: [
    T('g-tutor', '🧑‍🏫', '苏格拉底导师 Socratic tutor', 'Teach by questions', 'Tutoring task. Act as a Socratic tutor: assess the learner\'s level, ask one guiding question at a time, give hints not answers, summarise key takeaways at the end.', ['education']),
    T('g-flash', '🗂️', '记忆卡片 Flashcards', 'Anki-style cards', 'Flashcard task. Produce Q/A cards (one fact each) as a CSV with columns front,back,tags. Cover definitions, examples and common mistakes.', ['education']),
    T('g-explain', '🔎', '通俗解释 ELI5', 'Explain simply', 'Explanation task. Explain the topic for the stated audience with an analogy, a simple example, common misconceptions, and a 3-bullet summary.', ['education']),
  ] },
];

export class PackError extends Error {}
/** Validates a pack (or a bare array of templates). */
export function parsePack(raw: unknown, fallbackName = 'Imported'): Pack {
  const o = (Array.isArray(raw) ? { templates: raw } : raw) as Partial<Pack> | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.templates)) throw new PackError('invalid');
  const templates = o.templates.map((t, i): GalleryTemplate | null => {
    const x = t as Partial<GalleryTemplate> | null;
    if (!x || typeof x !== 'object' || typeof x.name !== 'string' || !x.name.trim() || typeof x.prompt !== 'string' || !x.prompt.trim()) return null;
    return { id: typeof x.id === 'string' && x.id ? x.id.slice(0, 80) : `imp-${i}-${x.name.slice(0, 20)}`, name: x.name.trim().slice(0, 40), icon: typeof x.icon === 'string' && x.icon ? x.icon.slice(0, 8) : '⭐', prompt: x.prompt.slice(0, 20_000), desc: typeof x.desc === 'string' ? x.desc.slice(0, 200) : undefined, tags: Array.isArray(x.tags) ? x.tags.filter((s): s is string => typeof s === 'string').slice(0, 10) : undefined };
  }).filter((x): x is GalleryTemplate => !!x);
  if (!templates.length) throw new PackError('empty');
  return { id: typeof o.id === 'string' && o.id ? o.id.slice(0, 80) : `pack-${Date.now()}`, name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 80) : fallbackName, author: typeof o.author === 'string' ? o.author.slice(0, 80) : undefined, desc: typeof o.desc === 'string' ? o.desc.slice(0, 300) : undefined, templates };
}
/** Only http(s) URLs are allowed for remote packs. */
export const isPackUrl = (u: string) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; } };
