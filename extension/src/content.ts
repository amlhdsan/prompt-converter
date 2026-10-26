// Content script: a ✨ button next to the chat box on AI sites (converts the draft in place) and a result card
// for context-menu conversions on any page.
(() => {
  const w = window as unknown as { __pcLoaded?: boolean };
  if (w.__pcLoaded) return; w.__pcLoaded = true;
  const zh = navigator.language.startsWith('zh');
  const L = zh ? { conv: '✨ 优化提示词', busy: '转换中…', copy: '复制', replace: '替换输入框', close: '关闭', nokey: '请先在扩展弹窗中填写 API Key', copied: '已复制' }
    : { conv: '✨ Improve prompt', busy: 'Converting…', copy: 'Copy', replace: 'Replace input', close: 'Close', nokey: 'Add an API key in the extension popup first', copied: 'Copied' };
  const css = `#pc-card{position:fixed;right:20px;bottom:20px;z-index:2147483647;width:min(460px,90vw);max-height:60vh;display:flex;flex-direction:column;background:#fff;color:#1d1d1f;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.25);font:14px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;overflow:hidden}
  #pc-card pre{margin:0;padding:14px 16px;overflow:auto;white-space:pre-wrap;flex:1;font:inherit}
  #pc-card .r{display:flex;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid rgba(0,0,0,.08)}
  #pc-card button,#pc-fab{border:0;border-radius:980px;padding:6px 14px;font:600 13px -apple-system,sans-serif;cursor:pointer;background:#f2f2f4;color:#1d1d1f}
  #pc-card button.p,#pc-fab{background:#0071e3;color:#fff}
  #pc-fab{position:fixed;z-index:2147483646;box-shadow:0 4px 14px rgba(0,113,227,.35);display:none}
  @media (prefers-color-scheme:dark){#pc-card{background:#1c1c1e;color:#f5f5f7}#pc-card button{background:#2c2c2e;color:#f5f5f7}}`;
  const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);

  let target: HTMLElement | null = null;
  const editable = (el: Element | null): HTMLElement | null => {
    const e = el as HTMLElement | null;
    return e && (e.tagName === 'TEXTAREA' || e.isContentEditable) ? e : null;
  };
  const getText = (el: HTMLElement) => (el.tagName === 'TEXTAREA' ? (el as HTMLTextAreaElement).value : el.innerText);
  function setText(el: HTMLElement, v: string) {
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const ta = el as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(ta, v); ta.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('selectAll'); document.execCommand('insertText', false, v);
    }
  }

  function card(body: string, actions = true) {
    document.getElementById('pc-card')?.remove();
    const c = document.createElement('div'); c.id = 'pc-card';
    const pre = document.createElement('pre'); pre.textContent = body; c.appendChild(pre);
    const r = document.createElement('div'); r.className = 'r';
    const btn = (label: string, fn: () => void, primary = false) => { const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'p'; b.onclick = fn; r.appendChild(b); return b; };
    if (actions) {
      const cp = btn(L.copy, () => { navigator.clipboard.writeText(body).then(() => (cp.textContent = L.copied)); }, true);
      if (target && document.contains(target)) btn(L.replace, () => { setText(target!, body); c.remove(); });
    }
    btn(L.close, () => c.remove());
    c.appendChild(r); document.documentElement.appendChild(c);
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (m?.type === 'pc-busy') { target = editable(document.activeElement); card(L.busy, false); }
    if (m?.type === 'pc-result') card(m.text);
    if (m?.type === 'pc-error') card(m.error === 'NO_KEY' ? L.nokey : '⚠️ ' + m.error, false);
  });

  // Floating button for chat inputs on supported sites.
  const fab = document.createElement('button'); fab.id = 'pc-fab'; fab.textContent = L.conv; document.documentElement.appendChild(fab);
  const place = () => {
    if (!target || !document.contains(target) || !getText(target).trim()) { fab.style.display = 'none'; return; }
    const r = target.getBoundingClientRect();
    fab.style.display = 'block'; fab.style.top = `${Math.max(8, r.top - 40)}px`; fab.style.left = `${Math.max(8, r.right - 150)}px`;
  };
  document.addEventListener('focusin', (e) => { const el = editable(e.target as Element); if (el) { target = el; place(); } });
  document.addEventListener('input', () => place(), true);
  window.addEventListener('resize', place);
  fab.addEventListener('mousedown', (e) => e.preventDefault());
  fab.addEventListener('click', async () => {
    if (!target) return; const el = target; const text = getText(el).trim(); if (!text) return;
    fab.textContent = L.busy; fab.disabled = true;
    try {
      const r = await chrome.runtime.sendMessage({ type: 'pc-convert', text });
      if (r?.ok) setText(el, r.text); else card(r?.error === 'NO_KEY' ? L.nokey : '⚠️ ' + (r?.error ?? 'error'), false);
    } finally { fab.textContent = L.conv; fab.disabled = false; place(); }
  });
})();
