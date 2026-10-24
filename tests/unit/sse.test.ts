import { describe, expect, it } from 'vitest';
import { createSSEParser, type SSEEvent } from '../../src/lib/sse';

const parse = (chunks: string[]) => { const ev: SSEEvent[] = []; const p = createSSEParser((e) => ev.push(e)); chunks.forEach((c) => p.push(c)); p.end(); return ev; };

describe('SSE parser', () => {
  it('parses simple events', () => {
    expect(parse(['data: a\n\ndata: b\n\n']).map((e) => e.data)).toEqual(['a', 'b']);
  });
  it('handles chunks split anywhere, including mid-field and mid-CRLF', () => {
    const src = 'data: {"x":1}\r\n\r\nevent: error\r\ndata: oops\r\n\r\ndata: [DONE]\r\n\r\n';
    const whole = parse([src]);
    for (let i = 1; i < src.length; i++) expect(parse([src.slice(0, i), src.slice(i)])).toEqual(whole);
    expect(parse(src.split(''))).toEqual(whole);
    expect(whole).toEqual([{ event: 'message', data: '{"x":1}' }, { event: 'error', data: 'oops' }, { event: 'message', data: '[DONE]' }]);
  });
  it('supports bare CR line endings', () => {
    expect(parse(['data: a\r\rdata: b\r', '\r']).map((e) => e.data)).toEqual(['a', 'b']);
  });
  it('joins multi-line data and ignores comments / unknown fields', () => {
    expect(parse([': keep-alive\nid: 1\nretry: 5\ndata: line1\ndata: line2\n\n'])).toEqual([{ event: 'message', data: 'line1\nline2' }]);
  });
  it('keeps values without a space after the colon and fields without colon', () => {
    expect(parse(['data:x\n\ndata\n\n']).map((e) => e.data)).toEqual(['x', '']);
  });
  it('flushes a trailing event without the final blank line', () => {
    expect(parse(['data: tail']).map((e) => e.data)).toEqual(['tail']);
  });
  it('emits nothing for empty input or blank lines only', () => {
    expect(parse(['', '\n\n\n'])).toEqual([]);
  });
});
