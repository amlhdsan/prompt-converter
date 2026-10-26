// MV3 service worker: context menu "Convert selection" + message API used by the popup and content script.
import { convert } from './core';

const zh = () => chrome.i18n?.getUILanguage?.().startsWith('zh');
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'pc-convert', title: zh() ? '✨ 转换为结构化提示词' : '✨ Convert to a structured prompt', contexts: ['selection', 'editable'] });
});

async function showInTab(tabId: number, msg: unknown) {
  try { await chrome.tabs.sendMessage(tabId, msg); }
  catch { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); await chrome.tabs.sendMessage(tabId, msg); }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'pc-convert' || !tab?.id) return;
  const text = (info.selectionText ?? '').trim();
  if (!text) return;
  await showInTab(tab.id, { type: 'pc-busy' });
  try { await showInTab(tab.id, { type: 'pc-result', text: await convert(text) }); }
  catch (e) { await showInTab(tab.id, { type: 'pc-error', error: (e as Error).message }); }
});

chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m?.type !== 'pc-convert') return false;
  convert(String(m.text ?? '')).then((text) => reply({ ok: true, text }), (e) => reply({ ok: false, error: (e as Error).message }));
  return true; // async reply
});
