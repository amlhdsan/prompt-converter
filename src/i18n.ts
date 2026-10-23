export type Lang = 'zh' | 'en';
const zh = {
  title: '提示词转换器', subtitle: '把随手写的想法，变成结构清晰、效果更好的提示词',
  settings: '设置', provider: '服务商', baseUrl: 'Base URL', model: '模型', apiKey: 'API Key', getKey: '获取 Key',
  stream: '流式输出', privacy: '🔒 你的 API Key 只保存在本浏览器的 localStorage 中，请求从浏览器直接发往你配置的接口，不经过任何第三方服务器。',
  mode: '场景', outLang: '输出语言', original: '原始提示词', converted: '转换结果',
  placeholder: '在这里粘贴或输入你的原始提示词，例如：\n帮我写个python脚本批量重命名图片', convert: '✨ 转换', stop: '停止', converting: '转换中…',
  copy: '复制', copied: '已复制 ✓', clear: '清空', history: '历史记录', clearHistory: '清空历史', noHistory: '暂无历史记录',
  empty: '转换后的提示词会显示在这里', chars: '字', shortcut: 'Ctrl/⌘ + Enter 快速转换', useAsInput: '作为输入',
  diff: '对比', single: '结果', inputEmpty: '请先输入提示词', close: '关闭', save: '完成',
  modes: { general: '通用', coding: '编程', writing: '写作', analysis: '分析 / 研究', image: '图像生成' },
  langs: { auto: '跟随原文', zh: '中文', en: 'English' },
  theme: { light: '浅色', dark: '深色', system: '跟随系统' },
  err: {
    auth: '认证失败：API Key 无效或无权限，请检查 Key 与服务商是否匹配。',
    cors: '请求被拦截：可能是跨域（CORS）限制或网络无法访问该地址。请确认 Base URL 正确，该服务允许浏览器直连，或使用支持 CORS 的代理。',
    network: '网络错误：连接中断或离线，请检查网络后重试。',
    http: '接口返回错误', config: '配置不完整：请在设置中填写 Base URL 和模型。', empty: '模型返回了空内容，请重试或更换模型。', aborted: '已停止',
    noKey: '请先在设置中填写 API Key',
  },
};
const en: typeof zh = {
  title: 'Prompt Converter', subtitle: 'Turn rough ideas into clear, structured, high-performing prompts',
  settings: 'Settings', provider: 'Provider', baseUrl: 'Base URL', model: 'Model', apiKey: 'API Key', getKey: 'Get key',
  stream: 'Streaming', privacy: '🔒 Your API key is stored only in this browser\'s localStorage. Requests go directly from your browser to the endpoint you configure — no third-party server.',
  mode: 'Mode', outLang: 'Output language', original: 'Original prompt', converted: 'Converted prompt',
  placeholder: 'Paste or type your rough prompt here, e.g.\nwrite a python script to bulk rename images', convert: '✨ Convert', stop: 'Stop', converting: 'Converting…',
  copy: 'Copy', copied: 'Copied ✓', clear: 'Clear', history: 'History', clearHistory: 'Clear history', noHistory: 'No history yet',
  empty: 'Your converted prompt will appear here', chars: 'chars', shortcut: 'Ctrl/⌘ + Enter to convert', useAsInput: 'Use as input',
  diff: 'Compare', single: 'Result', inputEmpty: 'Please enter a prompt first', close: 'Close', save: 'Done',
  modes: { general: 'General', coding: 'Coding', writing: 'Writing', analysis: 'Analysis / Research', image: 'Image generation' },
  langs: { auto: 'Same as input', zh: '中文', en: 'English' },
  theme: { light: 'Light', dark: 'Dark', system: 'System' },
  err: {
    auth: 'Authentication failed: the API key is invalid or lacks permission. Check the key matches the provider.',
    cors: 'Request blocked: likely a CORS restriction or the endpoint is unreachable. Verify the Base URL, that the provider allows browser requests, or use a CORS-enabled proxy.',
    network: 'Network error: connection lost or offline. Check your network and retry.',
    http: 'API returned an error', config: 'Incomplete config: set Base URL and model in Settings.', empty: 'The model returned an empty response. Retry or switch models.', aborted: 'Stopped',
    noKey: 'Please set your API key in Settings first',
  },
};
export const DICT = { zh, en };
export type Dict = typeof zh;
