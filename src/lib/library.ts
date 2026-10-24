// Built-in example prompts (the "prompt library"). Each entry fills the input and picks a mode.
import type { Mode } from '../prompts';
export interface Example { id: string; mode: Mode; zh: { t: string; p: string }; en: { t: string; p: string } }

export const EXAMPLES: Example[] = [
  { id: 'py-rename', mode: 'coding', zh: { t: '批量重命名脚本', p: '帮我写个python脚本批量重命名图片，按拍摄日期命名' }, en: { t: 'Bulk rename script', p: 'write a python script to bulk rename photos by the date they were taken' } },
  { id: 'code-review', mode: 'coding', zh: { t: '代码审查', p: '帮我review一下这段代码，看看有没有bug和性能问题' }, en: { t: 'Code review', p: 'review this code for bugs and performance problems' } },
  { id: 'sql', mode: 'coding', zh: { t: 'SQL 查询', p: '写个sql查最近30天每天的新用户数和留存' }, en: { t: 'SQL query', p: 'sql to get daily new users and retention for the last 30 days' } },
  { id: 'weekly', mode: 'writing', zh: { t: '周报', p: '帮我写周报，这周做了登录页改版和修了几个bug' }, en: { t: 'Weekly report', p: 'write my weekly update: redesigned the login page and fixed some bugs' } },
  { id: 'email', mode: 'writing', zh: { t: '催款邮件', p: '写封邮件礼貌地催客户付款，已经逾期两周' }, en: { t: 'Payment reminder', p: 'write a polite email asking a client to pay an invoice that is two weeks overdue' } },
  { id: 'xhs', mode: 'writing', zh: { t: '小红书文案', p: '给我们新开的咖啡店写个小红书探店文案' }, en: { t: 'Social post', p: 'write an instagram post for our new coffee shop opening' } },
  { id: 'compare', mode: 'analysis', zh: { t: '方案对比', p: '对比一下 React 和 Vue 哪个更适合我们的小团队' }, en: { t: 'Compare options', p: 'compare React and Vue for a small team' } },
  { id: 'paper', mode: 'analysis', zh: { t: '论文解读', p: '帮我读懂这篇论文，讲讲核心贡献和局限' }, en: { t: 'Paper summary', p: 'help me understand this paper: key contributions and limitations' } },
  { id: 'market', mode: 'analysis', zh: { t: '市场分析', p: '分析一下国内宠物食品市场的机会' }, en: { t: 'Market analysis', p: 'analyze opportunities in the pet food market' } },
  { id: 'logo', mode: 'image', zh: { t: '品牌 Logo', p: '画一个极简风格的咖啡店logo' }, en: { t: 'Brand logo', p: 'a minimalist logo for a coffee shop' } },
  { id: 'poster', mode: 'image', zh: { t: '电影海报', p: '赛博朋克风格的城市夜景海报，下雨' }, en: { t: 'Movie poster', p: 'cyberpunk city at night poster, raining' } },
  { id: 'plan', mode: 'general', zh: { t: '学习计划', p: '帮我制定一个三个月学会英语口语的计划' }, en: { t: 'Study plan', p: 'make me a 3-month plan to get conversational in Spanish' } },
  { id: 'trip', mode: 'general', zh: { t: '旅行攻略', p: '五一去成都玩三天，帮我安排行程' }, en: { t: 'Trip itinerary', p: 'plan a 3-day trip to Kyoto in spring' } },
];
