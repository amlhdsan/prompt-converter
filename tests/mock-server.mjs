// Minimal OpenAI-compatible mock (CORS + SSE streaming + JSON). Usage: node tests/mock-server.mjs [port]
import http from 'node:http';
const port = Number(process.argv[2] || 8787);
const REPLY = '## 角色\n你是一名资深 Python 工程师。\n\n## 目标\n编写一个批量重命名图片的脚本。\n\n## 约束\n- 使用 Python 3.10+ 标准库\n- 处理重名冲突\n\n## 步骤\n1. 扫描目录\n2. 生成新文件名\n3. 安全重命名\n\n## 输出格式\n完整代码 + 使用说明';
let last = null; // last chat request body (for assertions)
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  // Mock GitHub API for the update checker
  if (req.method === 'GET' && req.url.startsWith('/repos/amlhdsan/prompt-converter/releases/latest')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ tag_name: 'v9.9.0', html_url: 'https://github.com/amlhdsan/prompt-converter/releases/tag/v9.9.0' }));
  }
  if (req.method === 'GET' && req.url === '/__last') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(last)); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.headers.authorization !== 'Bearer sk-test') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
    }
    const j = JSON.parse(body || '{}');
    last = j;
    if (j.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const parts = REPLY.match(/[\s\S]{1,6}/g);
      let i = 0;
      const tick = () => {
        if (i < parts.length) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] })}\n\n`); setTimeout(tick, Number(process.env.MOCK_DELAY || 15)); }
        else { res.write('data: [DONE]\n\n'); res.end(); }
      };
      tick();
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: REPLY } }] }));
    }
  });
}).listen(port, () => console.log(`mock on http://127.0.0.1:${port}/v1`));
