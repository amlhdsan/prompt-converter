// Thin platform layer: everything desktop-specific (Tauri v2) is loaded lazily so the web build stays dependency-free at runtime.
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isQuick = location.hash === '#quick';
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';

/** fetch used for LLM + update calls. On desktop it goes through the Rust HTTP client, so provider CORS rules don't apply. */
export async function pfetch(input: string, init?: RequestInit): Promise<Response> {
  if (!isDesktop) return fetch(input, init);
  const { fetch: tfetch } = await import('@tauri-apps/plugin-http');
  return tfetch(input, init);
}

export async function openExternal(url: string) {
  if (!isDesktop) { window.open(url, '_blank', 'noopener'); return; }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}

export async function readClipboard(): Promise<string> {
  if (isDesktop) { const { readText } = await import('@tauri-apps/plugin-clipboard-manager'); return (await readText()) ?? ''; }
  return navigator.clipboard.readText();
}
export async function writeClipboard(txt: string) {
  if (isDesktop) { const { writeText } = await import('@tauri-apps/plugin-clipboard-manager'); return writeText(txt); }
  return navigator.clipboard.writeText(txt);
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}
/** Re-registers the global quick-convert hotkey. Rejects with a message if the accelerator is invalid or taken. */
export const setHotkey = (accel: string) => invoke<void>('set_hotkey', { accel });
export const getAutostart = () => invoke<boolean>('get_autostart');
export const setAutostart = (enabled: boolean) => invoke<void>('set_autostart', { enabled });
export const hideQuick = () => invoke<void>('hide_quick');
export const showMain = () => invoke<void>('show_main');

/** Subscribe to a Tauri event (no-op on web). */
export async function onEvent(name: string, cb: () => void) {
  if (!isDesktop) return;
  const { listen } = await import('@tauri-apps/api/event');
  await listen(name, cb);
}

/** Convert a KeyboardEvent into a Tauri accelerator string, e.g. "CommandOrControl+Shift+Space". Returns '' for bare modifiers. */
export function eventToAccelerator(e: KeyboardEvent): string {
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return '';
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (!parts.length) return '';
  const code = e.code;
  let key = code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? 'Space' : /^F\d+$/.test(code) ? code : k.length === 1 ? k.toUpperCase() : code;
  parts.push(key);
  return parts.join('+');
}
export const prettyAccel = (a: string) => a.replace('CommandOrControl', modKey).replace(/\+/g, ' + ');
