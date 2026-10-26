// Heuristic mode detection from the raw input (no network). Returns the best mode and a confidence 0–1.
import type { Mode } from '../prompts';

const RULES: [Mode, RegExp, number][] = [
  ['image', /(midjourney|stable ?diffusion|dall[·.\- ]?e|sdxl|画一[张幅个]|生成.{0,6}(图|图片|插画|海报|头像|壁纸)|插画|海报|壁纸|logo|渲染图|摄影风格|赛博朋克|水彩|油画|写实风|\bimage of\b|\b(draw|illustrat|render|poster|wallpaper|photo ?realistic|portrait of|logo)\w*|画像|イラスト|描いて)/gi, 3],
  ['coding', /(```|\b(python|java(script)?|typescript|golang|rust|c\+\+|c#|sql|regex|api|bug|debug|function|class|script|code|react|vue|node|docker|kubernetes|bash|shell|json|yaml|html|css|algorithm|refactor|unit test|compile|stack ?trace|exception)\b|代码|脚本|函数|报错|编程|接口|数据库|正则|算法|重构|部署|コード|関数|スクリプト)/gi, 2],
  ['analysis', /(\b(analy[sz]e|analysis|compare|comparison|pros and cons|research|evaluate|assess|trend|market|report on|summari[sz]e|why does|explain why|data)\b|分析|对比|比较|调研|研究|评估|趋势|优缺点|利弊|总结|原因|数据|分析して|比較|調査)/gi, 3],
  ['writing', /(\b(write|essay|article|blog|email|letter|story|poem|copy|caption|tweet|post|slogan|speech|resume|cover letter|newsletter)\b|写一?[篇封段首]|文案|文章|邮件|周报|日报|小红书|朋友圈|演讲稿|简历|故事|诗|标题|润色|改写|メール|文章|ブログ|書いて)/gi, 2],
];

export function detectMode(text: string): { mode: Mode; confidence: number } | null {
  const s = text.trim();
  if (s.length < 4) return null;
  const scores = RULES.map(([mode, re, w]) => ({ mode, score: (s.match(re) ?? []).length * w }));
  scores.sort((a, b) => b.score - a.score);
  const [top, second] = scores;
  if (!top.score) return null;
  const confidence = Math.min(1, (top.score - (second?.score ?? 0)) / Math.max(top.score, 1) + Math.min(top.score, 6) / 12);
  return { mode: top.mode, confidence: Math.round(confidence * 100) / 100 };
}
