"""Extension smoke test: loads dist-ext/ into Chromium, configures the popup against the mock server and converts.
Run: node extension/build.mjs && python3 tests/e2e_ext.py"""
import subprocess, sys, os, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, 'dist-ext')
mock = subprocess.Popen(['node', os.path.join(ROOT, 'tests/mock-server.mjs'), '8788'])
for _ in range(100):
    try: urllib.request.urlopen('http://127.0.0.1:8788/__last'); break
    except Exception: time.sleep(0.1)
ok = True
def check(c, msg):
    global ok; print(('PASS ' if c else 'FAIL ') + msg); ok = ok and c
try:
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel='chromium', headless=True, args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=15000)
        ext_id = sw.url.split('/')[2]
        check(len(ext_id) == 32, 'extension service worker loaded')
        pg = ctx.new_page(); pg.goto(f'chrome-extension://{ext_id}/popup.html')
        check(pg.is_visible('#v-set'), 'popup opens settings when no key')
        pg.select_option('#prov', 'custom'); pg.fill('#base', 'http://127.0.0.1:8788/v1'); pg.fill('#model', 'mock-model'); pg.fill('#key', 'sk-test'); pg.click('#save')
        pg.wait_for_selector('#v-conv:not([hidden])')
        pg.fill('#in', '帮我写个python脚本批量重命名图片'); pg.click('#go')
        for _ in range(150):
            if '输出格式' in pg.inner_text('#out') and not pg.is_disabled('#go'): break
            time.sleep(0.1)
        check('资深 Python' in pg.inner_text('#out'), 'popup converts via shared core')
        stored = sw.evaluate("chrome.storage.local.get('settings').then(r => r.settings)")
        check(stored['apiKey'] == 'sk-test' and stored['provider'] == 'custom', 'settings persisted in chrome.storage')
        # message API used by the content script
        res = pg.evaluate("chrome.runtime.sendMessage({type:'pc-convert', text:'写个周报'})")
        check(res['ok'] and '角色' in res['text'], 'background message API converts')
        pg.screenshot(path=os.path.join(ROOT, 'docs/extension-popup.png'))
        ctx.close()
finally:
    mock.terminate()
print('ALL PASSED' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
