// Applies appearance preferences (accent colour, font size, compact density, reduced motion) as CSS variables/classes.
import type { Settings } from '../storage';

function hexToRgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function applyAppearance(s: Settings, dark: boolean) {
  const r = document.documentElement;
  const [R, G, B] = hexToRgb(s.accent || '#0071e3');
  // Lighten the accent slightly in dark mode for contrast, as Apple does.
  const lift = (c: number) => Math.min(255, Math.round(c + (255 - c) * (dark ? 0.12 : 0)));
  const acc = `rgb(${lift(R)}, ${lift(G)}, ${lift(B)})`;
  r.style.setProperty('--accent', acc);
  r.style.setProperty('--accent-hover', `rgb(${Math.min(255, lift(R) + 12)}, ${Math.min(255, lift(G) + 12)}, ${Math.min(255, lift(B) + 12)})`);
  r.style.setProperty('--accent-tint', `rgba(${R}, ${G}, ${B}, ${dark ? 0.18 : 0.1})`);
  r.dataset.font = s.fontSize;
  r.classList.toggle('compact', s.compact);
  r.classList.toggle('reduce-motion', s.motion === 'reduce');
}
