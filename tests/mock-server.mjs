// Mock LLM server for tests & demos: OpenAI-compatible + Anthropic Messages, SSE streaming + JSON, /models,
// error simulation, and a mock GitHub releases API. Usage: node tests/mock-server.mjs [port]
//   Keys: sk-test → OK · sk-rate → 429 · sk-500 → 500 · sk-slow → never answers (timeout) · sk-flaky → 503 on every
//   odd request, then OK · sk-stall → streams a few chunks then hangs · anything else → 401
import http from 'node:http';
const port = Number(process.argv[2] || 8787);
const REPLY = '## 角色\n你是一名资深 Python 工程师。\n\n## 目标\n编写一个批量重命名图片的脚本。\n\n## 约束\n- 使用 Python 3.10+ 标准库\n- 处理重名冲突\n\n## 步骤\n1. 扫描目录\n2. 生成新文件名\n3. 安全重命名\n\n## 输出格式\n完整代码 + 使用说明';
const REFINED = '## 角色\n资深 Python 工程师\n\n## 目标\n批量重命名图片（精简版）\n\n## 输出格式\n完整代码';
const ANSWER = '```python\nimport os\nfor i, f in enumerate(sorted(os.listdir("."))):\n    os.rename(f, f"img_{i}.jpg")\n```\n\nTEST_RUN_ANSWER';
let flaky = 0;
const dav = new Map(); const gists = new Map(); let gistSeq = 0;
const readBody = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); });
const PACK = { name: 'E2E Pack', templates: [{ id: 'e2e-tpl', name: 'E2E 模板', icon: '🧪', desc: 'from url', prompt: 'You are an e2e template.' }] };
const PH_REPLY = '## 角色\n你是一名文案策划。\n\n## 目标\n为 [请补充：产品名称] 写一段介绍，面向 [TODO: 目标用户]。\n\n## 输出格式\n3 段文字';
let last = null; // last chat request body (for assertions)
let lastHeaders = null;
const json = (res, code, obj, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...extra }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Depth, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && req.url.startsWith('/repos/amlhdsan/prompt-converter/releases/latest')) {
    return json(res, 200, { tag_name: 'v9.9.0', html_url: 'https://github.com/amlhdsan/prompt-converter/releases/tag/v9.9.0' });
  }
  if (req.url.startsWith('/dav/')) {
    if (req.headers.authorization !== 'Basic ' + Buffer.from('u:p').toString('base64')) return json(res, 401, {});
    if (req.method === 'PUT') return readBody(req).then((b) => { dav.set(req.url, b); res.writeHead(201); res.end(); });
    if (dav.has(req.url)) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(dav.get(req.url)); }
    return json(res, 404, {});
  }
  if (req.url === '/pack.json') return json(res, 200, PACK);
  if (req.url.startsWith('/gists')) {
    if (req.headers.authorization !== 'Bearer ghp-test') return json(res, 401, {});
    const id = req.url.split('/')[2];
    if (req.method === 'GET') return gists.has(id) ? json(res, 200, { id, files: gists.get(id) }) : json(res, 404, {});
    return readBody(req).then((b) => { const g = JSON.parse(b); const nid = id || 'g' + ++gistSeq; gists.set(nid, g.files); json(res, req.method === 'POST' ? 201 : 200, { id: nid }); });
  }
  if (req.method === 'GET' && req.url === '/__last') return json(res, 200, { body: last, headers: lastHeaders });
  const key = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer /, '');
  const anthropic = req.url.endsWith('/messages');
  if (req.method === 'GET' && req.url.endsWith('/models')) {
    if (key !== 'sk-test' && !req.url.startsWith('/nokey')) return json(res, 401, { error: { message: 'Invalid API key' } });
    return json(res, 200, { data: [{ id: 'mock-model' }, { id: 'mock-large' }, { id: 'mock-mini' }] });
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const noKeyOk = req.url.startsWith('/nokey');
    if (key === 'sk-slow') return; // never respond → client idle timeout
    if (key === 'sk-flaky' && flaky++ % 2 === 0) return json(res, 503, { error: { message: 'Service unavailable' } });
    if (key === 'sk-stall') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '## 部分结果\n已收到的内容' } }] })}\n\n`); return; }
    if (key === 'sk-rate') return json(res, 429, { error: { message: 'Rate limit reached' } }, { 'Retry-After': '7' });
    if (key === 'sk-500') return json(res, 500, { error: { message: 'Internal error' } });
    if (key !== 'sk-test' && key !== 'sk-flaky' && !noKeyOk) return json(res, 401, { error: { message: 'Invalid API key' } });
    const j = JSON.parse(body || '{}');
    last = j; lastHeaders = req.headers;
    const msgs = j.messages || [];
    const isTest = msgs.length === 1 && msgs[0].role === 'user' && !j.system;
    const isRefine = msgs.some((m) => m.role === 'assistant');
    const wantsPh = msgs.some((m) => m.role === 'user' && String(m.content).includes('PLACEHOLDER'));
    const reply = isTest ? ANSWER : isRefine ? REFINED : wantsPh ? PH_REPLY : (msgs.slice(-1)[0]?.content === 'ping' ? 'pong' : REPLY);
    if (j.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const parts = reply.match(/[\s\S]{1,6}/g);
      let i = 0;
      const tick = () => {
        if (i < parts.length) {
          const p = parts[i++];
          res.write(anthropic
            ? `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } })}\n\n`
            : `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
          setTimeout(tick, Number(process.env.MOCK_DELAY || 15));
        } else { res.write(anthropic ? 'event: message_stop\ndata: {"type":"message_stop"}\n\n' : 'data: [DONE]\n\n'); res.end(); }
      };
      tick();
    } else {
      json(res, 200, anthropic ? { content: [{ type: 'text', text: reply }] } : { choices: [{ message: { content: reply } }] });
    }
  });
}).listen(port, () => console.log(`mock on http://127.0.0.1:${port}/v1`));
