// Chat mode: continue a conversation using the converted prompt as the system prompt.
import { chat, LLMError, type ChatMessage } from '../../llm';
import { renderMarkdown } from '../../lib/markdown';
import { toMarkdown } from '../../lib/export';
import { copyText, download, esc, modal, toast } from '../dom';
import { errorMessage, inDemo, reqBase, track } from '../actions';
import { icons } from '../icons';
import { out, t } from '../state';
import { fakeStream } from '../../lib/demo';

let convo: ChatMessage[] = [];
let convoSystem = '';
export function openChat() {
  const d = t(); const x = d.x;
  const system = out();
  if (convoSystem !== system) { convo = []; convoSystem = system; }
  let ctrl: AbortController | null = null;
  modal(x.chat, `
    <details class="small chat-sys"><summary>${x.chatSystem}</summary><pre class="errlog">${esc(system)}</pre></details>
    <div class="chat-log" id="chat-log" aria-live="polite" role="log"></div>
    <form class="chat-form" id="chat-form">
      <textarea id="chat-input" rows="2" placeholder="${esc(x.chatPlaceholder)}" aria-label="${esc(x.chatPlaceholder)}"></textarea>
      <div class="row between"><span class="row"><button class="ghost small" type="button" id="chat-clear">${x.chatNew}</button><button class="ghost small" type="button" id="chat-export">${icons.download} ${d.exportMd}</button></span><button class="primary" type="submit" id="chat-send">${d.send}</button></div>
    </form>`, (root) => {
    const log = root.querySelector('#chat-log') as HTMLElement;
    const ta = root.querySelector('#chat-input') as HTMLTextAreaElement;
    const send = root.querySelector('#chat-send') as HTMLButtonElement;
    const draw = (live = '') => {
      const items = [...convo, ...(live || ctrl ? [{ role: 'assistant' as const, content: live }] : [])];
      log.innerHTML = items.length ? items.map((m, i) => `<div class="msg ${m.role}"><div class="bubble ${m.role === 'assistant' ? 'md' : ''}">${m.role === 'assistant' ? (m.content ? renderMarkdown(m.content) : '<span class="spin"></span>') : esc(m.content)}</div>${m.role === 'assistant' && m.content && i < convo.length ? `<button class="icon tiny" data-copy-msg="${i}" aria-label="${d.copy}" title="${d.copy}">${icons.copy}</button>` : ''}</div>`).join('') : `<div class="placeholder small">${x.chatEmpty}</div>`;
      log.scrollTop = log.scrollHeight;
    };
    log.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-copy-msg]'); if (b) copyText(convo[Number(b.dataset.copyMsg)].content); });
    const submit = async () => {
      if (ctrl) { ctrl.abort(); return; }
      const text = ta.value.trim(); if (!text) return;
      convo.push({ role: 'user', content: text }); ta.value = '';
      ctrl = new AbortController(); send.textContent = d.stop; draw();
      const msgs: ChatMessage[] = [{ role: 'system', content: system }, ...convo];
      const t0 = performance.now();
      let partial = '';
      try {
        const r = inDemo() ? await fakeStream(`${x.chatDemoReply}\n\n> ${text}`, (s) => { partial = s; draw(s); }, ctrl.signal)
          : await chat({ ...reqBase(), signal: ctrl.signal, messages: msgs, onDelta: (s) => { partial = s; draw(s); } });
        convo.push({ role: 'assistant', content: r }); track('chat', msgs, r, t0, true);
      } catch (e) {
        if (partial) convo.push({ role: 'assistant', content: partial });
        if (!(e instanceof LLMError && e.kind === 'aborted') && (e as Error).name !== 'AbortError') { toast(errorMessage(e)); track('chat', msgs, '', t0, false); }
      }
      ctrl = null; send.textContent = d.send; draw(); ta.focus();
    };
    root.querySelector('#chat-form')!.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
    root.querySelector('#chat-clear')!.addEventListener('click', () => { ctrl?.abort(); convo = []; draw(); ta.focus(); });
    root.querySelector('#chat-export')!.addEventListener('click', () => {
      const pairs = []; for (let i = 0; i < convo.length; i += 2) pairs.push({ input: convo[i]?.content ?? '', output: convo[i + 1]?.content ?? '' });
      download('chat.md', `> System prompt\n\n${system}\n\n` + toMarkdown(x.chat, pairs, { original: x.chatYou, converted: x.chatAssistant }), 'text/markdown');
    });
    draw(); ta.focus();
  }, 'wide chat-modal');
}
