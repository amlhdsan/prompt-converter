// Incremental Server-Sent-Events parser (WHATWG-style): handles chunks split anywhere, \n / \r\n / \r line
// endings, multi-line `data:` fields, `event:` names, comments and a trailing event without a final blank line.
export interface SSEEvent { event: string; data: string }

export function createSSEParser(onEvent: (e: SSEEvent) => void) {
  let buf = '';
  let data: string[] = [];
  let event = '';
  let pendingCR = false;
  const dispatch = () => {
    if (data.length) onEvent({ event: event || 'message', data: data.join('\n') });
    data = []; event = '';
  };
  const line = (l: string) => {
    if (l === '') { dispatch(); return; }
    if (l.startsWith(':')) return; // comment / keep-alive
    const i = l.indexOf(':');
    const field = i < 0 ? l : l.slice(0, i);
    let value = i < 0 ? '' : l.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    // `id` / `retry` are irrelevant for one-shot completions.
  };
  return {
    push(chunk: string) {
      if (pendingCR && chunk.startsWith('\n')) chunk = chunk.slice(1);
      pendingCR = false;
      buf += chunk;
      let start = 0;
      for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        if (c === '\n' || c === '\r') {
          line(buf.slice(start, i));
          if (c === '\r') { if (buf[i + 1] === '\n') i++; else if (i === buf.length - 1) pendingCR = true; }
          start = i + 1;
        }
      }
      buf = buf.slice(start);
    },
    /** Call at end of stream: dispatches a final event that lacked the terminating blank line. */
    end() { if (buf) { line(buf); buf = ''; } dispatch(); },
  };
}
