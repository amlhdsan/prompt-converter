"""End-to-end test: serves dist via `vite preview`, mocks an OpenAI-compatible API, drives the UI with Playwright.
Run: npm run build && python3 tests/e2e.py   (requires: pip install playwright && playwright install chromium)"""
import subprocess, time, sys, os, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mock = subprocess.Popen(['node', 'tests/mock-server.mjs', '8787'], cwd=ROOT)
prev = subprocess.Popen(['npx', 'vite', 'preview', '--port', '4174', '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, start_new_session=True)
time.sleep(2.5)
ok = True
def check(c, msg):
    global ok
    print(('PASS ' if c else 'FAIL ') + msg); ok = ok and c
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 960}, device_scale_factor=2, accept_downloads=True)
        pg = ctx.new_page()
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
        check('v1.2.0' in pg.inner_text('footer'), 'version in footer')
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

        # ---------- v1.2 features ----------
        import urllib.request
        def last_req():
            return json.loads(urllib.request.urlopen('http://127.0.0.1:8787/__last').read() or b'null')
        def sys_prompt():
            return last_req()['messages'][0]['content']
        def wait_done():
            pg.wait_for_function("!document.querySelector('.card.busy') && !document.querySelector('.q-out.busy')")
        pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('pc.settings.v1'));s.apiKeys.custom='sk-test';s.baseUrl='http://127.0.0.1:8787/v1';s.stream=true;localStorage.setItem('pc.settings.v1',JSON.stringify(s));localStorage.removeItem('pc.history.v1')})()")
        pg.reload()
        # Ctrl/Cmd+Enter shortcut
        pg.fill('#input', 'shortcut test'); pg.press('#input', 'Control+Enter'); pg.wait_for_selector('#output'); wait_done()
        check('输出格式' in pg.inner_text('#output'), 'Ctrl+Enter converts')
        # output language: preset + custom
        pg.select_option('#out-lang', 'ja'); pg.fill('#input', 'lang test'); pg.click('#btn-convert'); wait_done()
        check('Japanese' in sys_prompt(), 'output language preset sent to model')
        pg.select_option('#out-lang', 'custom'); pg.fill('#custom-lang', 'Klingon'); pg.fill('#input', 'custom lang'); pg.click('#btn-convert'); wait_done()
        check('Klingon' in sys_prompt(), 'custom output language sent to model')
        pg.reload(); check(pg.input_value('#custom-lang') == 'Klingon', 'output language persisted')
        pg.select_option('#out-lang', 'auto')
        # custom templates: create
        pg.click('#btn-templates'); pg.wait_for_selector('#f-tpl-name')
        pg.fill('#f-tpl-icon', '📕'); pg.fill('#f-tpl-name', '小红书文案'); pg.fill('#f-tpl-prompt', 'XHS_STYLE_MARKER rewrite as a Xiaohongshu post prompt')
        pg.click('#tpl-save'); pg.wait_for_selector('.tpl-item')
        check(pg.locator('.tpl-item').count() == 1, 'template created')
        pg.keyboard.press('Escape')
        btn = pg.locator('[data-mode^="tpl:"]')
        check(btn.count() == 1 and '小红书文案' in btn.inner_text() and btn.get_attribute('aria-selected') == 'true', 'template appears as selected mode')
        pg.fill('#input', '写一篇咖啡店探店'); pg.click('#btn-convert'); wait_done()
        check('XHS_STYLE_MARKER' in sys_prompt(), 'template instructions used for conversion')
        # edit
        pg.click('#btn-templates'); pg.click('[data-tpl-edit]'); pg.fill('#f-tpl-name', '小红书爆款'); pg.click('#tpl-save'); pg.wait_for_timeout(100)
        check('小红书爆款' in pg.inner_text('.tpl-list'), 'template edited')
        pg.keyboard.press('Escape')
        check('小红书爆款' in pg.inner_text('[data-mode^="tpl:"]'), 'edited name shown in modes')
        pg.screenshot(path=os.path.join(ROOT, 'docs/templates.png'))
        # history: search + favorites
        pg.click('#btn-history'); pg.wait_for_selector('#h-search')
        n_all = pg.locator('.hist-item').count()
        check(n_all == 4, f'history has 4 entries ({n_all})')
        pg.fill('#h-search', '咖啡店'); pg.wait_for_timeout(100)
        check(pg.locator('.hist-item').count() == 1, 'history search filters')
        pg.click('.hist-item [data-fav]')
        check(pg.locator('.hist-item.fav').count() == 1, 'favorite toggled')
        pg.fill('#h-search', ''); pg.click('#h-tab-fav'); pg.wait_for_timeout(100)
        check(pg.locator('.hist-item').count() == 1, 'favorites tab')
        pg.click('#h-tab-all'); pg.click('#h-clear'); pg.wait_for_timeout(100)
        check(pg.locator('.hist-item').count() == 1 and pg.locator('.hist-item.fav').count() == 1, 'clear history keeps favorites')
        pg.fill('#h-search', 'nothing-matches-zzz'); check('没有匹配' in pg.inner_text('#h-list'), 'no-match state')
        pg.keyboard.press('Escape')
        # export
        pg.keyboard.press('Control+,'); pg.wait_for_selector('#f-export')
        with pg.expect_download() as dl:
            pg.click('#f-export')
        data = json.loads(open(dl.value.path(), encoding='utf-8').read())
        check(data.get('app') == 'prompt-converter' and len(data['templates']) == 1 and len(data['history']) == 1, 'export contains templates + history')
        check('apiKeys' not in data['settings'], 'export excludes API keys by default')
        pg.check('#f-export-keys')
        with pg.expect_download() as dl2:
            pg.click('#f-export')
        check(json.loads(open(dl2.value.path(), encoding='utf-8').read())['settings']['apiKeys'].get('custom') == 'sk-test', 'export can include API keys')
        # import (merge)
        backup = {'app': 'prompt-converter', 'version': '1.2.0', 'settings': {'theme': 'light'},
                  'templates': [{'id': 'imp1', 'name': 'Imported Tpl', 'icon': '🧪', 'prompt': 'IMPORTED', 'at': 1}],
                  'history': [{'id': 'h-imp', 'at': 1700000000000, 'mode': 'general', 'input': 'imported input', 'output': 'imported output', 'model': 'm', 'fav': True}]}
        imp = os.path.join(ROOT, 'tests', '.import.json'); open(imp, 'w', encoding='utf-8').write(json.dumps(backup, ensure_ascii=False))
        pg.set_input_files('#f-import-file', imp); pg.wait_for_timeout(300); os.remove(imp)
        check('导入成功' in pg.inner_text('#f-data-status'), 'import success message')
        n_tpl = pg.evaluate("JSON.parse(localStorage.getItem('pc.templates.v1')).length")
        n_hist = pg.evaluate("JSON.parse(localStorage.getItem('pc.history.v1')).length")
        check(n_tpl == 2 and n_hist == 2, f'import merged (templates {n_tpl}, history {n_hist})')
        check(pg.evaluate("JSON.parse(localStorage.getItem('pc.settings.v1')).apiKeys.custom") == 'sk-test', 'import keeps existing keys')
        bad = os.path.join(ROOT, 'tests', '.bad.json'); open(bad, 'w').write('{"hello":1}')
        pg.set_input_files('#f-import-file', bad); pg.wait_for_timeout(200); os.remove(bad)
        check('导入失败' in pg.inner_text('#f-data-status'), 'invalid import rejected')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        check(pg.locator('[data-mode^="tpl:"]').count() == 2, 'imported template in modes')
        # delete template (two-step confirm)
        pg.click('#btn-templates'); pg.click('[data-tpl-del="imp1"]')
        check(pg.locator('.tpl-item').count() == 2, 'delete needs confirmation')
        pg.click('[data-tpl-del="imp1"]'); pg.wait_for_timeout(100)
        check(pg.locator('.tpl-item').count() == 1, 'template deleted')
        pg.keyboard.press('Escape')
        # keyboard shortcuts help + other shortcuts
        pg.click('h1'); pg.keyboard.press('?'); pg.wait_for_selector('#keys-table')
        check('Enter' in pg.inner_text('#keys-table') and pg.locator('#keys-table tr').count() >= 8, 'shortcuts help via ?')
        pg.screenshot(path=os.path.join(ROOT, 'docs/shortcuts.png'))
        pg.keyboard.press('Escape'); check(pg.locator('#keys-table').count() == 0, 'Esc closes dialog')
        pg.click('#btn-keys'); check(pg.locator('#keys-table').count() == 1, 'shortcuts button'); pg.keyboard.press('Escape')
        pg.keyboard.press('Control+Shift+H'); check(pg.locator('#h-search').count() == 1, 'Ctrl+Shift+H opens history'); pg.keyboard.press('Escape')
        pg.click('h1'); pg.keyboard.press('Alt+2'); check(pg.get_attribute('[data-mode="coding"]', 'aria-selected') == 'true', 'Alt+2 switches mode')
        pg.click('#btn-lang'); pg.click('#btn-keys'); check('Convert' in pg.inner_text('#keys-table'), 'shortcuts help in English'); pg.keyboard.press('Escape')
        pg.click('#btn-templates'); check('My templates' in pg.inner_text('.modal-h'), 'templates dialog in English'); pg.keyboard.press('Escape'); pg.click('#btn-lang')
        # quick-convert view (desktop floating window UI, rendered via #quick)
        q = ctx.new_page(); q.set_viewport_size({'width': 600, 'height': 440})
        q.goto('http://127.0.0.1:4174/#quick'); q.wait_for_selector('.quick-wrap')
        q.fill('#input', 'quick test'); q.press('#input', 'Control+Enter'); q.wait_for_selector('#output')
        q.wait_for_function("!document.querySelector('.q-out.busy')")
        check('输出格式' in q.inner_text('#output'), 'quick window converts')
        q.screenshot(path=os.path.join(ROOT, 'docs/quick-window.png')); q.close()
        pg.click('#btn-lang'); check('Prompt Converter' in pg.inner_text('h1'), 'English toggle')
        pg.click('#btn-lang')
        # dark screenshot
        pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('pc.settings.v1'));s.theme='dark';s.apiKeys.custom='sk-test';s.baseUrl='http://127.0.0.1:8787/v1';s.stream=true;localStorage.setItem('pc.settings.v1',JSON.stringify(s))})()")
        pg.reload(); pg.fill('#input', '帮我写个python脚本批量重命名图片'); pg.click('[data-mode="coding"]'); pg.click('#btn-convert')
        pg.wait_for_function("!document.querySelector('.card.busy')")
        pg.screenshot(path=os.path.join(ROOT, 'docs/screenshot-dark.png'))
        b.close()
finally:
    import signal
    mock.terminate()
    try: os.killpg(prev.pid, signal.SIGTERM)
    except Exception: prev.terminate()
print('ALL PASSED' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
