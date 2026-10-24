// Share a conversion via the URL hash only (#share=…): nothing is uploaded anywhere.
// Payload is JSON → deflate-raw (when CompressionStream exists) → base64url.
export interface SharePayload { i: string; o: string; m?: string }

const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(data: Uint8Array, stream: { readable: ReadableStream; writable: WritableStream }) {
  const w = stream.writable.getWriter();
  // Write errors (e.g. corrupt deflate data) also reject the readable side; swallow them here to avoid unhandled rejections.
  w.write(data).catch(() => {}); w.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
function chunkedB64(bytes: Uint8Array) {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function encodeShare(p: SharePayload): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(p));
  if (typeof CompressionStream !== 'undefined') return 'z' + chunkedB64(await pipe(raw, new CompressionStream('deflate-raw')));
  return 'b' + (raw.length > 0x8000 ? chunkedB64(raw) : b64u(raw));
}
export async function decodeShare(s: string): Promise<SharePayload | null> {
  try {
    const kind = s[0]; let bytes = unb64u(s.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'b') return null;
    const j = JSON.parse(new TextDecoder().decode(bytes));
    return typeof j?.i === 'string' && typeof j?.o === 'string' ? { i: j.i.slice(0, 50_000), o: j.o.slice(0, 100_000), m: typeof j.m === 'string' ? j.m : undefined } : null;
  } catch { return null; }
}
export const shareFromHash = () => (location.hash.startsWith('#share=') ? location.hash.slice(7) : '');
