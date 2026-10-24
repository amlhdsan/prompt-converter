// Built-in provider presets. `kind` selects the wire protocol; everything except Anthropic speaks the OpenAI chat-completions dialect.
export type ApiKind = 'openai' | 'anthropic';
export interface Provider {
  id: string; name: string; baseUrl: string; model: string; kind: ApiKind;
  keyUrl?: string;
  /** No API key needed (local servers). */
  noKey?: boolean;
  /** Typical model ids offered as suggestions before the list is fetched. */
  models?: string[];
  /** Short hint shown under the provider chips. */
  note?: { zh: string; en: string };
}

export const PROVIDERS: Provider[] = [
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'] },
  { id: 'anthropic', name: 'Anthropic Claude', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5', keyUrl: 'https://console.anthropic.com/settings/keys', models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'] },
  { id: 'gemini', name: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/app/apikey', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'] },
  { id: 'qwen', name: '通义千问 Qwen', kind: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', keyUrl: 'https://dashscope.console.aliyun.com/apiKey', models: ['qwen-plus', 'qwen-max', 'qwen-turbo'] },
  { id: 'moonshot', name: 'Kimi (Moonshot)', kind: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', keyUrl: 'https://platform.moonshot.cn/console/api-keys', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-latest'] },
  { id: 'zhipu', name: '智谱 GLM', kind: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', models: ['glm-4-flash', 'glm-4-plus', 'glm-4-air'] },
  { id: 'siliconflow', name: 'SiliconFlow 硅基流动', kind: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', keyUrl: 'https://cloud.siliconflow.cn/account/ak', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'THUDM/glm-4-9b-chat'] },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', keyUrl: 'https://openrouter.ai/keys', models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat'] },
  { id: 'ollama', name: 'Ollama', kind: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', noKey: true, models: ['qwen2.5:7b', 'llama3.1:8b'],
    note: { zh: '本地运行，无需 Key。浏览器版需允许跨域：OLLAMA_ORIGINS=* ollama serve', en: 'Runs locally, no key. For the web version allow CORS: OLLAMA_ORIGINS=* ollama serve' } },
  { id: 'lmstudio', name: 'LM Studio', kind: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'local-model', noKey: true,
    note: { zh: '本地运行，无需 Key。在 LM Studio 的 Developer 页启动服务器并开启 CORS。', en: 'Runs locally, no key. Start the server in LM Studio → Developer and enable CORS.' } },
  { id: 'custom', name: 'Custom / 自定义', kind: 'openai', baseUrl: '', model: '',
    note: { zh: '任意 OpenAI 兼容接口（OneAPI / 中转 / vLLM 等），Key 可留空。', en: 'Any OpenAI-compatible endpoint (OneAPI, proxies, vLLM…). Key is optional.' } },
];
export const providerById = (id: string): Provider => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
/** Key required? Local presets and custom endpoints may run without one. */
export const needsKey = (p: Provider) => !p.noKey && p.id !== 'custom';
