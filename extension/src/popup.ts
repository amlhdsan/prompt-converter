// Popup: quick convert + settings (also used as the options page via #settings).
import { MODES, OUT_LANGS } from '../../src/prompts';
import { PROVIDERS, providerById } from '../../src/providers';
import { convert, loadSettings, saveSettings, type ExtSettings } from './core';

const zh = navigator.language.startsWith('zh');
const T = zh
  ? { go: '转换', copy: '复制', copied: '已复制', ph: '输入随手写的想法…', prov: '服务商', base: 'API 地址', model: '模型', key: 'API Key', lang: '输出语言', save: '保存', saved: '已保存', nokey: '请先在 ⚙︎ 中填写 API Key', busy: '转换中…', privacy: 'Key 只保存在本浏览器（chrome.storage.local），请求直接发往你选择的服务商。', modes: { general: '通用', coding: '编程', writing: '写作', analysis: '分析', image: '图像' } as Record<string, string> }
  : { go: 'Convert', copy: 'Copy', copied: 'Copied', ph: 'Type a rough idea…', prov: 'Provider', base: 'API base URL', model: 'Model', key: 'API key', lang: 'Output language', save: 'Save', saved: 'Saved', nokey: 'Add an API key in ⚙︎ first', busy: 'Converting…', privacy: 'Your key stays in this browser (chrome.storage.local); requests go straight to the provider you pick.', modes: { general: 'General', coding: 'Coding', writing: 'Writing', analysis: 'Analysis', image: 'Image' } as Record<string, string> };
const $ = <E extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as E;
const label = (id: string, text: string) => $(id).prepend(text);

async function init() {
  let s: ExtSettings = await loadSettings();
  $('go').textContent = T.go; $('copy').textContent = T.copy; $('save').textContent = T.save; $<HTMLTextAreaElement>('in').placeholder = T.ph; $('privacy').textContent = T.privacy;
  label('l-prov', T.prov); label('l-base', T.base); label('l-model', T.model); label('l-key', T.key); label('l-lang', T.lang);
  $('mode').innerHTML = MODES.map((m) => `<option value="${m}">${T.modes[m]}</option>`).join('');
  $('prov').innerHTML = PROVIDERS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  $('lang').innerHTML = OUT_LANGS.filter((l) => l !== 'custom').map((l) => `<option value="${l}">${l}</option>`).join('');
  const fill = () => { $('mode').setAttribute('value', s.mode); ($('mode') as unknown as HTMLSelectElement).value = s.mode; ($('prov') as unknown as HTMLSelectElement).value = s.provider; $('base').value = s.baseUrl; $('model').value = s.model; $('key').value = s.apiKey; ($('lang') as unknown as HTMLSelectElement).value = s.lang; };
  fill();
  const show = (set: boolean) => { $('v-set').hidden = !set; $('v-conv').hidden = set; };
  show(location.hash === '#settings' || !s.apiKey && !providerById(s.provider).noKey);
  $('tab-set').onclick = () => show($('v-set').hidden);
  $('prov').onchange = () => { const p = providerById(($('prov') as unknown as HTMLSelectElement).value); $('base').value = p.baseUrl; $('model').value = p.model; };
  $('save').onclick = async () => {
    s = { ...s, provider: ($('prov') as unknown as HTMLSelectElement).value, baseUrl: $('base').value.trim(), model: $('model').value.trim(), apiKey: $('key').value.trim(), lang: ($('lang') as unknown as HTMLSelectElement).value };
    await saveSettings(s); $('saved').textContent = T.saved; setTimeout(() => show(false), 400);
  };
  $('mode').onchange = async () => { s = { ...s, mode: ($('mode') as unknown as HTMLSelectElement).value as ExtSettings['mode'] }; await saveSettings(s); };
  $('go').onclick = async () => {
    const text = $<HTMLTextAreaElement>('in').value.trim(); if (!text) return;
    const out = $('out'); out.hidden = false; $('out-actions').hidden = false; $('status').textContent = T.busy; $('go').setAttribute('disabled', '');
    try { const r = await convert(text, s, (d) => (out.textContent = d)); out.textContent = r; $('status').textContent = ''; }
    catch (e) { out.textContent = (e as Error).message === 'NO_KEY' ? T.nokey : '⚠️ ' + (e as Error).message; $('status').textContent = ''; }
    finally { $('go').removeAttribute('disabled'); }
  };
  $('copy').onclick = () => navigator.clipboard.writeText($('out').textContent ?? '').then(() => ($('status').textContent = T.copied));
}
init();
