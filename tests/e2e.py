"""End-to-end test: serves dist via `vite preview`, mocks an OpenAI-compatible API, drives the UI with Playwright.
Run: npm run build && python3 tests/e2e.py   (requires: pip install playwright && playwright install chromium)"""
import subprocess, time, sys, os, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mock = subprocess.Popen(['node', 'tests/mock-server.mjs', '8787'], cwd=ROOT)
prev = subprocess.Popen(['npx', 'vite', 'preview', '--port', '4174', '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL)
time.sleep(2.5)
ok = True
def check(c, msg):
    global ok
    print(('PASS ' if c else 'FAIL ') + msg); ok = ok and c
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1440, 'height': 960}, device_scale_factor=2)
        pg.goto('http://127.0.0.1:4174/')
        settings = {'provider': 'custom', 'baseUrl': 'http://127.0.0.1:8787/v1', 'model': 'mock-model', 'apiKeys': {'custom': 'sk-test'}, 'stream': True}
        pg.evaluate(f"localStorage.setItem('pc.settings.v1', JSON.stringify({json.dumps(settings)}))")
        pg.evaluate("localStorage.setItem('pc.updateApi','http://127.0.0.1:8787'); localStorage.removeItem('pc.update.v1')")
        pg.reload()
        pg.wait_for_selector('#update-notice', timeout=5000)
        check('v9.9.0' in pg.inner_text('#update-notice'), 'update notice shown for newer release')
        pg.locator('#update-notice').screenshot(path=os.path.join(ROOT, 'docs/update-notice.png'))
        pg.screenshot(path=os.path.join(ROOT, 'docs/update-notice-full.png'))
        pg.click('#update-dismiss')
        check(pg.locator('#update-notice').count() == 0, 'update notice dismissible')
        pg.reload(); pg.wait_for_timeout(300)
        check(pg.locator('#update-notice').count() == 0, 'dismissal persists')
        check('v1.1.0' in pg.inner_text('footer'), 'version in footer')
        check('提示词转换器' in pg.inner_text('h1'), 'default UI is Chinese')
        pg.fill('#input', '帮我写个python脚本批量重命名图片')
        pg.click('[data-mode="coding"]')
        pg.click('#btn-convert')
        pg.wait_for_selector('#output'); pg.wait_for_function("!document.querySelector('.card.busy')")
        out = pg.inner_text('#output')
        check('资深 Python 工程师' in out and '输出格式' in out, 'streaming conversion rendered')
        hist = pg.evaluate("JSON.parse(localStorage.getItem('pc.history.v1')||'[]').length")
        check(hist == 1, 'history saved')
        pg.screenshot(path=os.path.join(ROOT, 'docs/screenshot.png'))
        pg.click('[data-view="diff"]'); check(pg.locator('.diff').count() == 1, 'compare view')
        pg.click('[data-view="single"]')
        # non-stream path
        pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('pc.settings.v1'));s.stream=false;localStorage.setItem('pc.settings.v1',JSON.stringify(s))})()")
        pg.reload(); pg.fill('#input', 'test'); pg.click('#btn-convert'); pg.wait_for_function("!document.querySelector('.card.busy')")
        check('输出格式' in pg.inner_text('#output'), 'non-streaming conversion')
        # auth error
        pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('pc.settings.v1'));s.apiKeys.custom='bad';localStorage.setItem('pc.settings.v1',JSON.stringify(s))})()")
        pg.reload(); pg.fill('#input', 'x'); pg.click('#btn-convert'); pg.wait_for_selector('.error')
        check('认证失败' in pg.inner_text('.error'), 'auth error message')
        # unreachable / CORS
        pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('pc.settings.v1'));s.baseUrl='http://127.0.0.1:9/v1';localStorage.setItem('pc.settings.v1',JSON.stringify(s))})()")
        pg.reload(); pg.fill('#input', 'x'); pg.click('#btn-convert'); pg.wait_for_selector('.error')
        check('CORS' in pg.inner_text('.error'), 'network/CORS error message')
        pg.click('#btn-lang'); check('Prompt Converter' in pg.inner_text('h1'), 'English toggle')
        pg.click('#btn-lang')
        # dark screenshot
        pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('pc.settings.v1'));s.theme='dark';s.apiKeys.custom='sk-test';s.baseUrl='http://127.0.0.1:8787/v1';s.stream=true;localStorage.setItem('pc.settings.v1',JSON.stringify(s))})()")
        pg.reload(); pg.fill('#input', '帮我写个python脚本批量重命名图片'); pg.click('[data-mode="coding"]'); pg.click('#btn-convert')
        pg.wait_for_function("!document.querySelector('.card.busy')")
        pg.screenshot(path=os.path.join(ROOT, 'docs/screenshot-dark.png'))
        b.close()
finally:
    mock.terminate(); prev.terminate()
print('ALL PASSED' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
