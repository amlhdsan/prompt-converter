// DOM helpers: escaping, toast, accessible modal (focus trap + focus restore), clipboard, downloads.
import { escapeHtml } from '../lib/markdown';
import { writeClipboard } from '../platform';
import { icons } from './icons';
import { rerender, t } from './state';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const esc = escapeHtml;
export const fmt = (str: string, v: Record<string, string | number>) => str.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
export const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function toast(msg: string) {
  const el = $('#toast'); if (!el) return;
  el.textContent = msg; el.className = 'show';
  clearTimeout((toast as any).h); (toast as any).h = setTimeout(() => (el.className = ''), 2400);
}

export async function copyText(txt: string, silent = false) {
  try { await writeClipboard(txt); } catch {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  if (!silent) toast(t().copied);
}

export function download(name: string, text: string, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let closeCurrent: (() => void) | null = null;
export const modalOpen = () => !!document.querySelector('#modal-root .overlay');
export const closeModal = (refresh = true) => { closeCurrent?.(); if (refresh) rerender(); };

/** Opens a sheet-style dialog. Esc / backdrop / [data-close] close it; focus is trapped inside and restored after. */
export function modal(title: string, body: string, onMount: (root: HTMLElement) => void, cls = '') {
  const root = $('#modal-root');
  const opener = (closeCurrent ? (modal as any).opener : document.activeElement) as HTMLElement | null;
  closeCurrent?.();
  (modal as any).opener = opener;
  root.innerHTML = `<div class="overlay"><div class="modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-h"><h2 id="modal-title">${title}</h2><button class="icon" data-close aria-label="${t().close}">${icons.x}</button></div><div class="modal-b">${body}</div></div></div>`;
  const dlg = root.querySelector('.modal') as HTMLElement;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeModal(); return; }
    if (e.key === 'Tab') {
      const f = [...dlg.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  const close = () => {
    root.innerHTML = ''; document.removeEventListener('keydown', onKey, true); closeCurrent = null;
    const o = (modal as any).opener as HTMLElement | null; (modal as any).opener = null;
    setTimeout(() => { const same = o?.id ? document.getElementById(o.id) : null; (same ?? (o?.isConnected ? o : null))?.focus?.(); }, 0);
  };
  closeCurrent = close;
  document.addEventListener('keydown', onKey, true);
  root.querySelector('.overlay')!.addEventListener('mousedown', (e) => { if (e.target === e.currentTarget) closeModal(); });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal()));
  onMount(dlg);
  if (!dlg.contains(document.activeElement)) (dlg.querySelector<HTMLElement>('[autofocus]') ?? dlg.querySelector<HTMLElement>('.modal-b ' + FOCUSABLE.split(',').join(',.modal-b ')) ?? dlg.querySelector<HTMLElement>(FOCUSABLE))?.focus();
}
