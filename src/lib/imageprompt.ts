// Image-generation prompt formatting for Midjourney, Stable Diffusion and DALL·E.
export type ImagePlatform = 'mj' | 'sd' | 'dalle';
export interface ImageParams {
  aspect: string; // e.g. "16:9"
  style?: string; quality?: 'draft' | 'standard' | 'high';
  negative?: string; seed?: number | '';
  mjVersion?: string; stylize?: number; chaos?: number; raw?: boolean;
  steps?: number; cfg?: number; sampler?: string;
  dalleSize?: '1024x1024' | '1792x1024' | '1024x1792'; dalleStyle?: 'vivid' | 'natural';
}
export const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];
export const STYLE_PRESETS = ['photorealistic', 'cinematic', 'anime', 'watercolor', 'oil painting', '3d render', 'pixel art', 'line art', 'isometric', 'minimalist flat'];
export const DEFAULT_NEGATIVE = 'blurry, low quality, lowres, jpeg artifacts, watermark, text, signature, extra fingers, deformed hands, bad anatomy';

const ar2size = (ar: string): ImageParams['dalleSize'] => { const [w, h] = ar.split(':').map(Number); return !w || !h || w === h ? '1024x1024' : w > h ? '1792x1024' : '1024x1792'; };
const ar2px = (ar: string, base = 1024): [number, number] => {
  const [w, h] = ar.split(':').map(Number); if (!w || !h) return [base, base];
  const r = w / h; const W = Math.round(Math.sqrt(base * base * r) / 64) * 64; const H = Math.round(W / r / 64) * 64; return [W, H];
};
const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/\s*--\w+(\s+[^\s-][^\s]*)?/g, '').trim().replace(/[,.]$/, '');

export function formatImagePrompt(base: string, platform: ImagePlatform, p: ImageParams): string {
  const subject = clean(base);
  const style = p.style?.trim();
  if (platform === 'mj') {
    const q = p.quality === 'draft' ? ' --q 0.5' : p.quality === 'high' ? ' --q 2' : '';
    const flags = [`--ar ${p.aspect || '1:1'}`, `--v ${p.mjVersion || '6.1'}`, p.stylize != null ? `--s ${p.stylize}` : '', p.chaos ? `--c ${p.chaos}` : '', p.raw ? '--style raw' : '', p.negative?.trim() ? `--no ${p.negative.trim().replace(/\s*,\s*/g, ', ')}` : '', p.seed !== '' && p.seed != null ? `--seed ${p.seed}` : ''].filter(Boolean).join(' ');
    return `${subject}${style ? `, ${style}` : ''} ${flags}${q}`.trim();
  }
  if (platform === 'sd') {
    const [w, h] = ar2px(p.aspect || '1:1');
    const quality = p.quality === 'high' ? 'masterpiece, best quality, highly detailed, ' : p.quality === 'draft' ? '' : 'best quality, detailed, ';
    return [`Positive prompt:\n${quality}${subject}${style ? `, ${style}` : ''}`, `Negative prompt:\n${p.negative?.trim() || DEFAULT_NEGATIVE}`,
      `Parameters: Steps: ${p.steps ?? 30}, Sampler: ${p.sampler || 'DPM++ 2M Karras'}, CFG scale: ${p.cfg ?? 7}, Size: ${w}x${h}${p.seed !== '' && p.seed != null ? `, Seed: ${p.seed}` : ''}`].join('\n\n');
  }
  const size = p.dalleSize || ar2size(p.aspect || '1:1');
  const avoid = p.negative?.trim() ? ` Avoid: ${p.negative.trim()}.` : '';
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)}.${style ? ` Style: ${style}.` : ''}${avoid}\n\n(size: ${size}, style: ${p.dalleStyle || 'vivid'}${p.quality === 'high' ? ', quality: hd' : ''})`;
}
