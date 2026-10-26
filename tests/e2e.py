"""End-to-end test: serves dist via `vite preview`, mocks an OpenAI-compatible API, drives the UI with Playwright.
Run: npm run build && python3 tests/e2e.py   (requires: pip install playwright && playwright install chromium)"""
import subprocess, time, sys, os, json, re
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mock = subprocess.Popen(['node', 'tests/mock-server.mjs', '8787'], cwd=ROOT)
prev = subprocess.Popen(['npx', 'vite', 'preview', '--port', '4174', '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL, start_new_session=True)
def wait_http(url, timeout=30):
    # Poll until a server answers instead of sleeping a fixed time (fixes flaky cold starts).
    import urllib.request
    end = time.time() + timeout
    while time.time() < end:
        try: urllib.request.urlopen(url, timeout=1); return
        except Exception as e:
            if getattr(e, 'code', None): return  # any HTTP response means it's up
            time.sleep(0.2)
    raise RuntimeError('server did not start: ' + url)
wait_http('http://127.0.0.1:8787/__last'); wait_http('http://127.0.0.1:4174/')
ok = True
def check(c, msg):
    global ok
    print(('PASS ' if c else 'FAIL ') + msg); ok = ok and c
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 960}, device_scale_factor=2, accept_downloads=True, permissions=['clipboard-read', 'clipboard-write'], bypass_csp=True)
        pg = ctx.new_page()
        pg.goto('http://127.0.0.1:4174/')
        settings = {'provider': 'custom', 'baseUrl': 'http://127.0.0.1:8787/v1', 'model': 'mock-model', 'apiKeys': {'custom': 'sk-test'}, 'stream': True}
        pg.evaluate(f"localStorage.setItem('pc.settings.v1', JSON.stringify({json.dumps(settings)}))")
        pg.evaluate("localStorage.setItem('pc.updateApi','http://127.0.0.1:8787'); localStorage.setItem('pc.setAdv','1'); localStorage.removeItem('pc.update.v1')")
        pg.reload()
        pg.wait_for_selector('#update-notice', timeout=15000)
        check('v9.9.0' in pg.inner_text('#update-notice'), 'update notice shown for newer release')
        pg.locator('#update-notice').screenshot(path=os.path.join(ROOT, 'docs/update-notice.png'))
        pg.screenshot(path=os.path.join(ROOT, 'docs/update-notice-full.png'))
        pg.click('#update-dismiss')
        check(pg.locator('#update-notice').count() == 0, 'update notice dismissible')
        pg.reload(); pg.wait_for_timeout(300)
        check(pg.locator('#update-notice').count() == 0, 'dismissal persists')
        VER = json.load(open(os.path.join(ROOT, 'package.json')))['version']
        check('v' + VER in pg.inner_text('footer'), 'version in footer')
        check('提示词转换器' in pg.inner_text('h1'), 'default UI is Chinese')
        pg.fill('#input', '帮我写个python脚本批量重命名图片')
        pg.click('[data-mode="coding"]')
        pg.click('#btn-convert')
        pg.wait_for_selector('#output'); pg.wait_for_function("!document.querySelector('.card.busy')")
        out = pg.inner_text('#output')
        check('资深 Python 工程师' in out and '输出格式' in out, 'streaming conversion rendered')
        hist = pg.evaluate("JSON.parse(localStorage.getItem('pc.history.v1')||'[]').length")
        check(hist == 1, 'history saved')
        pg.click('[data-view="compare"]'); check(pg.locator('.diff').count() == 1, 'compare view')
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
            return json.loads(urllib.request.urlopen('http://127.0.0.1:8787/__last').read() or b'null')['body']
        def last_headers():
            return json.loads(urllib.request.urlopen('http://127.0.0.1:8787/__last').read())['headers']
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
        pg.click('#btn-templates'); check('My templates' in pg.inner_text('.modal-h'), 'templates dialog in English'); pg.keyboard.press('Escape'); pg.click('#btn-lang'); pg.click('#btn-lang')
        # quick-convert view (desktop floating window UI, rendered via #quick)
        q = ctx.new_page(); q.set_viewport_size({'width': 600, 'height': 440})
        q.goto('http://127.0.0.1:4174/#quick'); q.wait_for_selector('.quick-wrap')
        q.fill('#input', 'quick test'); q.press('#input', 'Control+Enter'); q.wait_for_selector('#output')
        q.wait_for_function("!document.querySelector('.q-out.busy')")
        check('输出格式' in q.inner_text('#output'), 'quick window converts')
        q.screenshot(path=os.path.join(ROOT, 'docs/quick-window.png')); q.close()

        # ---------- v1.3 features ----------
        def patch(obj, reload=True):
            pg.evaluate("(p)=>{const s=JSON.parse(localStorage.getItem('pc.settings.v1'));Object.assign(s,p);localStorage.setItem('pc.settings.v1',JSON.stringify(s))}", obj)
            if reload: pg.reload(); pg.wait_for_selector('#input')
        BASE = {'provider': 'custom', 'baseUrl': 'http://127.0.0.1:8787/v1', 'model': 'mock-model', 'apiKeys': {'custom': 'sk-test'}, 'stream': True, 'variants': 1, 'render': 'md', 'timeoutSec': 60, 'mode': 'coding', 'uiLang': 'zh', 'theme': 'light', 'outLang': 'auto', 'retries': 0}
        patch(BASE)
        def convert_text(txt):
            pg.fill('#input', txt); pg.click('#btn-convert'); pg.wait_for_selector('#output'); wait_done()
        convert_text('帮我写个python脚本批量重命名图片')
        # markdown render / raw toggle
        check(pg.locator('#output.md h3, #output.md h2').count() >= 3, 'markdown rendered by default')
        pg.click('[data-render="raw"]'); check(pg.locator('pre#output').count() == 1 and '## 角色' in pg.inner_text('#output'), 'raw view shows markdown source')
        pg.click('[data-render="md"]')
        # diff view
        pg.click('[data-view="diff"]'); check(pg.locator('.diffview ins').count() > 0, 'diff view highlights insertions')
        pg.screenshot(path=os.path.join(ROOT, 'docs/diff.png'))
        pg.click('[data-view="single"]')
        # tokens + cost + quality
        check('tokens' in pg.inner_text('#out-count'), 'token estimate shown')
        q = pg.locator('#quality .num').all_inner_texts()
        check(len(q) == 2 and int(q[1]) > int(q[0]), f'quality score improves {q}')
        check(pg.locator('#q-tips li').count() >= 1, 'quality suggestions listed')
        # refine
        pg.click('[data-refine="shorter"]'); pg.wait_for_selector('#refine-input'); wait_done()
        check('精简版' in pg.inner_text('#output') and any(m['role'] == 'assistant' for m in last_req()['messages']), 'refine chip sends follow-up with context')
        pg.fill('#refine-input', '加上错误处理'); pg.press('#refine-input', 'Enter'); pg.wait_for_selector('#refine-input'); wait_done()
        check('加上错误处理' in last_req()['messages'][-1]['content'], 'custom refine instruction')
        # test run
        pg.click('#btn-test'); pg.wait_for_function("document.querySelector('#tr-out') && document.querySelector('#tr-out').innerText.includes('TEST_RUN_ANSWER')")
        check(pg.locator('#tr-out pre code').count() == 1, 'test run renders answer (code block)')
        check(last_req()['messages'][0]['content'].startswith('## 角色'), 'test run sends converted prompt as user message')
        pg.screenshot(path=os.path.join(ROOT, 'docs/test-run.png'))
        pg.keyboard.press('Escape')
        # export .md / .txt
        pg.click('#btn-more'); check(pg.locator('#more-menu').is_visible(), 'more menu opens')
        with pg.expect_download() as dl:
            pg.click('#btn-export-md')
        md = open(dl.value.path(), encoding='utf-8').read()
        check(dl.value.suggested_filename.endswith('.md') and '## 原始提示词' in md and '## 转换结果' in md, 'export markdown')
        pg.click('#btn-more')
        with pg.expect_download() as dl:
            pg.click('#btn-export-txt')
        check(dl.value.suggested_filename.endswith('.txt'), 'export txt')
        # share via URL hash
        pg.click('#btn-more'); pg.click('#btn-share'); pg.wait_for_timeout(300)
        url = pg.evaluate('navigator.clipboard.readText()')
        check('#share=' in url, 'share link copied')
        sp = ctx.new_page(); sp.goto(url); sp.wait_for_selector('#shared-banner')
        check('精简版' in sp.inner_text('#output') and sp.input_value('#input').startswith('帮我写个python'), 'share link restores prompt')
        check('#share' not in sp.url, 'share hash removed from address bar')
        sp.close()
        # variants
        patch({'variants': 2})
        convert_text('多版本测试')
        check(pg.locator('[data-variant]').count() == 2, 'two variants generated')
        pg.click('[data-variant="1"]'); check(pg.get_attribute('[data-variant="1"]', 'aria-selected') == 'true', 'switch variant')
        patch({'variants': 1})
        # library
        pg.click('#btn-library'); pg.wait_for_selector('.lib-item')
        check(pg.locator('.lib-item').count() >= 10, 'example library')
        pg.click('[data-ex="weekly"]'); check('周报' in pg.input_value('#input') and pg.get_attribute('[data-mode="writing"]', 'aria-selected') == 'true', 'example fills input and mode')
        # errors: rate limit, server, timeout
        patch({'apiKeys': {'custom': 'sk-rate'}}); pg.fill('#input', 'x'); pg.click('#btn-convert'); pg.wait_for_selector('.error')
        check('429' in pg.inner_text('.error') and '7' in pg.inner_text('.error'), 'rate-limit error with retry-after')
        patch({'apiKeys': {'custom': 'sk-500'}}); pg.fill('#input', 'x'); pg.click('#btn-convert'); pg.wait_for_selector('.error')
        check('5xx' in pg.inner_text('.error'), 'server error message')
        patch({'apiKeys': {'custom': 'sk-slow'}, 'timeoutSec': 5}); pg.fill('#input', 'x'); pg.click('#btn-convert'); pg.wait_for_selector('.error', timeout=12000)
        check('超时' in pg.inner_text('.error'), 'idle timeout error')
        patch(BASE)
        # stop / abort
        pg.fill('#input', '停止测试'); pg.click('#btn-convert'); pg.wait_for_timeout(60); pg.click('#btn-convert'); wait_done()
        check(pg.locator('.error').count() == 0, 'abort shows no error')
        # Anthropic native API
        patch({'provider': 'anthropic', 'baseUrl': 'http://127.0.0.1:8787/v1', 'model': 'claude-test', 'apiKeys': {'anthropic': 'sk-test'}})
        convert_text('anthropic test')
        h = last_headers(); b2 = last_req()
        check(h.get('x-api-key') == 'sk-test' and h.get('anthropic-version') and 'system' in b2 and all(m['role'] != 'system' for m in b2['messages']), 'Anthropic Messages API format')
        check('输出格式' in pg.inner_text('#output'), 'Anthropic streaming parsed')
        # local provider without key
        patch({'provider': 'ollama', 'baseUrl': 'http://127.0.0.1:8787/nokey/v1', 'model': 'qwen2.5:7b', 'apiKeys': {}})
        check(pg.locator('.banner').count() == 0, 'no key banner for local provider')
        convert_text('ollama test'); check('输出格式' in pg.inner_text('#output'), 'local provider works without key')
        patch(BASE)
        # settings: providers, fetch models, profiles
        pg.click('#btn-settings'); pg.wait_for_selector('[data-prov]')
        names = pg.locator('[data-prov]').all_inner_texts()
        check(all(any(n in x for x in names) for n in ['Anthropic', 'Gemini', 'Ollama', 'LM Studio', 'OpenRouter', 'SiliconFlow', 'Kimi', 'GLM']), 'new provider presets listed')
        pg.click('#f-models'); pg.wait_for_function("document.querySelector('#f-models-status').innerText.includes('3')")
        check(pg.locator('#model-list option').count() == 3, 'model list fetched')
        pg.fill('#p-name', 'Mock 本地'); pg.click('#p-save'); pg.wait_for_selector('[data-profile]')
        check(pg.locator('[data-profile]').count() == 1, 'profile saved')
        pg.click('[data-prov="deepseek"]'); check('deepseek' in pg.input_value('#f-base'), 'switch provider')
        pg.click('[data-profile]'); check(pg.input_value('#f-base') == 'http://127.0.0.1:8787/v1' and pg.input_value('#f-key') == 'sk-test', 'profile restores endpoint + key')
        # session-only keys
        pg.check('#f-session'); pg.wait_for_timeout(100)
        stored = pg.evaluate("JSON.parse(localStorage.getItem('pc.settings.v1'))")
        check(not stored['apiKeys'].get('custom') and all(not p['apiKey'] for p in stored['profiles']), 'session keys not written to localStorage')
        pg.keyboard.press('Escape'); pg.reload(); pg.wait_for_selector('#input')
        check(pg.locator('.banner').count() == 0, 'session key survives reload in same tab')
        pg.click('#btn-settings'); pg.uncheck('#f-session'); pg.keyboard.press('Escape')
        # accessibility: focus trap + restore
        pg.click('#btn-keys'); pg.wait_for_selector('#keys-table')
        for _ in range(4): pg.keyboard.press('Tab')
        check(pg.evaluate("!!document.activeElement.closest('.modal')"), 'focus trapped in dialog')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(50)
        check(pg.evaluate("document.activeElement && document.activeElement.id") == 'btn-keys', 'focus restored after closing dialog')
        pg.focus('[data-mode="general"]'); pg.keyboard.press('ArrowRight')
        check(pg.evaluate("document.activeElement.dataset.mode") == 'coding', 'arrow keys move between mode tabs')
        # XSS safety
        evil = {'id': 'evil', 'at': 1800000000000, 'mode': 'general', 'input': '<img src=x onerror="window.__xss=1">', 'output': '<img src=x onerror="window.__xss=1"> [click](javascript:alert(1)) **ok**', 'model': 'm'}
        pg.evaluate("(e)=>localStorage.setItem('pc.history.v1', JSON.stringify([e]))", evil); pg.reload()
        pg.click('#btn-history'); pg.click('[data-open="evil"]'); pg.wait_for_timeout(200)
        check(pg.evaluate("window.__xss === undefined && !document.querySelector('#output img') && !document.querySelector('a[href^=javascript]')"), 'no XSS from rendered content')
        pg.click('[data-view="diff"]'); pg.wait_for_timeout(100)
        check(pg.evaluate("window.__xss === undefined && !document.querySelector('.diffview img')"), 'no XSS in diff view')
        pg.click('[data-view="single"]')

        # ---------- v1.4: stability + tools ----------
        patch(BASE)
        # retry with backoff on transient 503
        patch({'apiKeys': {'custom': 'sk-flaky'}, 'retries': 2})
        pg.fill('#input', '重试测试'); pg.click('#btn-convert'); pg.wait_for_selector('#output'); wait_done()
        check(pg.locator('.error').count() == 0 and '输出格式' in pg.inner_text('#output'), 'transient 503 is retried automatically')
        # stalled stream keeps the partial output
        patch({'apiKeys': {'custom': 'sk-stall'}, 'timeoutSec': 5, 'retries': 2})
        pg.fill('#input', '中断测试'); pg.click('#btn-convert')
        pg.wait_for_function("!document.querySelector('.card.busy')", timeout=15000)
        check('已收到的内容' in pg.inner_text('#output') and '保留' in pg.inner_text('#notice-line'), 'stalled stream keeps partial result + notice')
        patch(BASE)
        # connection test
        pg.click('#btn-settings'); pg.click('#f-conn'); pg.wait_for_function("document.querySelector('#f-conn-status').innerText.includes('✓')")
        check('mock-model' in pg.inner_text('#f-conn-status') and last_req()['stream'] is False, 'connection test succeeds (non-stream ping)')
        pg.fill('#f-key', 'sk-bad'); pg.click('#f-conn'); pg.wait_for_function("document.querySelector('#f-conn-status').innerText.includes('✕')")
        check(True, 'connection test reports failure')
        pg.fill('#f-key', 'sk-test'); pg.keyboard.press('Escape')
        # built-in mode instruction editor
        pg.click('#btn-templates'); pg.click('#tpl-builtin'); pg.wait_for_selector('#mh-text')
        pg.click('[data-mh="writing"]'); pg.fill('#mh-text', 'CUSTOM_WRITING_HINT 请写得像诗。'); pg.click('#mh-save')
        check(pg.inner_text('#mh-state') != '', 'mode hint marked customized')
        pg.keyboard.press('Escape'); pg.click('[data-mode="writing"]'); convert_text('写一段文案')
        check('CUSTOM_WRITING_HINT' in last_req()['messages'][0]['content'], 'custom built-in mode hint is sent')
        pg.click('#btn-templates'); pg.click('#tpl-builtin'); pg.click('[data-mh="writing"]'); pg.click('#mh-reset')
        check('CUSTOM_WRITING_HINT' not in pg.input_value('#mh-text'), 'mode hint reset to default')
        pg.keyboard.press('Escape'); pg.click('[data-mode="coding"]')
        # placeholder fill
        convert_text('PLACEHOLDER 产品介绍')
        check(pg.locator('#btn-fill').count() == 1, 'fill-placeholders button appears')
        pg.click('#btn-fill'); pg.wait_for_selector('[data-ph]')
        check(pg.locator('[data-ph]').count() == 2, 'two placeholders detected')
        pg.fill('[data-ph="0"]', '星光咖啡'); pg.click('#fill-form button[type=submit]'); pg.wait_for_timeout(100)
        o = pg.inner_text('#output')
        check('星光咖啡' in o and '请补充' not in o and 'TODO' in o, 'placeholders filled, blanks kept')
        # command palette
        pg.keyboard.press('Control+k'); pg.wait_for_selector('#cp-input')
        pg.keyboard.type('history'); pg.wait_for_timeout(50)
        check(pg.locator('.cp-item').count() >= 1, 'palette filters commands')
        pg.fill('#cp-input', 'zzzzqqq'); check(pg.locator('.cp-item').count() == 0, 'palette shows empty state')
        pg.fill('#cp-input', '主题'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
        check(not pg.evaluate("!!document.querySelector('#modal-root .overlay')"), 'palette runs a command and closes')
        patch({'theme': 'light'})
        pg.keyboard.press('Control+k'); pg.wait_for_selector('#cp-input'); pg.fill('#cp-input', '写作'); pg.keyboard.press('ArrowDown'); pg.keyboard.press('ArrowUp'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
        check(pg.get_attribute('[data-mode="writing"]', 'aria-selected') == 'true', 'palette switches mode')
        pg.click('[data-mode="coding"]')
        # batch convert
        pg.keyboard.press('Control+Shift+B'); pg.wait_for_selector('#b-input')
        pg.fill('#b-input', '第一条\n第二条\n第三条'); check('3' in pg.inner_text('#b-status'), 'batch counts prompts')
        pg.click('#b-run'); pg.wait_for_function("document.querySelectorAll('.batch-item').length === 3 && !document.querySelector('#b-list .spin') && !document.querySelector('#b-copy').disabled", timeout=15000)
        check(pg.locator('.batch-item.failed').count() == 0 and '3/3' in pg.inner_text('#b-status'), 'batch converts all items')
        with pg.expect_download() as dl:
            pg.click('#b-export')
        bm = open(dl.value.path(), encoding='utf-8').read()
        import re; check(len(re.findall(r'^## \d+\. ', bm, re.M)) == 3 and '第二条' in bm, 'batch export markdown')
        pg.keyboard.press('Escape')
        # history markdown export
        pg.click('#btn-history'); pg.wait_for_selector('#h-export')
        with pg.expect_download() as dl:
            pg.click('#h-export')
        hm = open(dl.value.path(), encoding='utf-8').read()
        check(hm.startswith('# 历史记录') and '第三条' in hm, 'history export markdown')
        pg.keyboard.press('Escape')
        # corrupted storage recovery
        pg.evaluate("localStorage.setItem('pc.history.v1', '{broken')"); pg.reload(); pg.wait_for_selector('#input')
        check(pg.locator('#recovered-banner').count() == 1 and pg.evaluate("localStorage.getItem('pc.corrupt.pc.history.v1') === '{broken'"), 'corrupted data recovered + backed up')
        pg.click('#recovered-dismiss')
        # error boundary: a render crash shows the recovery UI, reset restores
        pg.evaluate("window.dispatchEvent(new ErrorEvent('error', {error: new Error('boom-test'), message: 'boom-test'}))"); pg.wait_for_timeout(100)
        check(pg.evaluate("JSON.parse(localStorage.getItem('pc.errors.v1')||'[]').some(e => e.msg === 'boom-test')"), 'global errors are logged locally')
        pg.click('#btn-settings'); pg.click('#f-viewlog'); pg.wait_for_selector('#log-pre')
        check('boom-test' in pg.inner_text('#log-pre'), 'error log viewer')
        pg.click('#log-clear'); check(pg.locator('#log-pre').count() == 0, 'error log cleared'); pg.keyboard.press('Escape')
        pg.evaluate("localStorage.setItem('pc.settings.v1', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('pc.settings.v1')), {mode: {bad: 1}})))")
        pg.evaluate("localStorage.setItem('pc.history.v1', JSON.stringify([{id:'x',at:1,mode:'general',input:'a',output:'b',model:'m'}]))")
        pg.reload(); pg.wait_for_selector('#input')
        check(pg.locator('.crash').count() == 0, 'malformed settings are sanitized instead of crashing')
        # multi-tab sync
        t2 = ctx.new_page(); t2.goto('http://127.0.0.1:4174/'); t2.wait_for_selector('#input')
        pg.click('[data-mode="analysis"]'); t2.wait_for_timeout(300)
        check(t2.get_attribute('[data-mode="analysis"]', 'aria-selected') == 'true', 'settings sync across tabs')
        t2.close(); pg.click('[data-mode="coding"]')
        # mobile layout
        m = ctx.new_page(); m.set_viewport_size({'width': 390, 'height': 844}); m.goto('http://127.0.0.1:4174/'); m.wait_for_selector('#input')
        cols = m.evaluate("getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length")
        check(cols == 1, 'single-column layout on mobile')
        check(m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), 'no horizontal overflow on mobile')
        m.fill('#input', '帮我写个python脚本批量重命名图片'); m.click('#btn-convert'); m.wait_for_selector('#output'); m.wait_for_function("!document.querySelector('.card.busy')")
        m.screenshot(path=os.path.join(ROOT, 'docs/mobile.png'), full_page=False)
        m.close()
        # PWA
        check(pg.locator('link[rel=manifest]').count() == 1, 'manifest linked')
        ok_sw = pg.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r)")
        if not ok_sw:
            pg.wait_for_timeout(1500); ok_sw = pg.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r)")
        check(ok_sw, 'service worker registered (offline-capable)')
        man = pg.evaluate("fetch('./manifest.webmanifest').then(r=>r.json())")
        check(len(man['icons']) >= 2 and man['display'] == 'standalone', 'manifest valid')
        check(pg.evaluate("!!document.querySelector('meta[http-equiv=Content-Security-Policy]')"), 'CSP meta present')
        patch({'theme': 'light'})
        convert_text('帮我写个python脚本批量重命名图片')
        pg.screenshot(path=os.path.join(ROOT, 'docs/screenshot.png'))
        pg.click('#btn-lang'); check('Prompt Converter' in pg.inner_text('h1'), 'English toggle')
        pg.click('#btn-lang'); check(pg.evaluate("document.documentElement.lang") == 'ja' and 'プロンプト' in pg.inner_text('h1'), 'Japanese toggle')
        pg.click('#btn-lang'); check(pg.evaluate("document.documentElement.lang") == 'zh-CN', 'language cycles back to Chinese')
        # ===== v1.5 =====
        def tools(item):
            pg.click('#btn-tools'); pg.click(f'#tools-menu [data-menu="{item}"]'); pg.wait_for_selector('#modal-root .overlay')
        def close_modal():
            pg.keyboard.press('Escape'); pg.wait_for_function("!document.querySelector('#modal-root .overlay')")
        patch({'theme': 'light', 'apiKeys': {'custom': 'sk-test'}, 'baseUrl': 'http://127.0.0.1:8787/v1', 'stream': True})
        # undo/redo + counter + draft
        pg.fill('#input', ''); pg.type('#input', 'abc'); pg.fill('#input', 'abcdef'); pg.dispatch_event('#input', 'input')
        check('6' in pg.inner_text('#in-count'), 'character counter updates')
        pg.wait_for_timeout(900); pg.reload(); pg.wait_for_selector('#input')
        check(pg.input_value('#input') == 'abcdef', 'draft restored after reload')
        pg.fill('#input', 'xyz'); pg.wait_for_timeout(50); pg.click('#btn-undo'); check(pg.input_value('#input') == 'abcdef', 'undo restores previous text')
        pg.click('#btn-redo'); check(pg.input_value('#input') == 'xyz', 'redo reapplies')
        # auto-detect chip
        pg.click('[data-mode="general"]'); pg.fill('#input', '帮我写一个 Python 函数，修复这个 bug 并给出代码'); pg.dispatch_event('#input', 'input'); pg.wait_for_timeout(500)
        check(pg.locator('#detect-apply').count() == 1, 'auto-detect suggests a mode')
        pg.click('#detect-apply'); check(pg.get_attribute('[data-mode="coding"]', 'aria-selected') == 'true', 'detect chip switches mode')
        # drag & drop a text file
        pg.fill('#input', ''); pg.evaluate("""()=>{const dt=new DataTransfer();dt.items.add(new File(['dropped text 123'],'a.txt',{type:'text/plain'}));const el=document.querySelector('#input');el.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true}));el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}))}""")
        pg.wait_for_timeout(300); check(pg.input_value('#input') == 'dropped text 123', 'drag & drop imports a text file')
        # clear with undo toast
        pg.click('#btn-clear'); pg.wait_for_selector('#toast-action'); pg.click('#toast-action'); check(pg.input_value('#input') == 'dropped text 123', 'clear is undoable')
        # convert & copy
        convert_text('帮我写个python脚本批量重命名图片')
        pg.fill('#input', '帮我写个python脚本批量重命名图片'); pg.click('#btn-convert-copy'); pg.wait_for_function("!document.querySelector('.card.busy')"); pg.wait_for_timeout(300)
        check('资深 Python' in pg.evaluate("navigator.clipboard.readText()"), 'convert & copy puts result on clipboard')
        # workspace
        pg.keyboard.press('Control+s'); pg.wait_for_timeout(200)
        n_ws = pg.evaluate("JSON.parse(localStorage.getItem('pc.workspace.v1')||'[]').length"); check(n_ws == 1, 'Ctrl+S saves to library')
        pg.click('#btn-workspace'); pg.wait_for_selector('#ws-list')
        check(pg.locator('[data-ws-use]').count() == 1, 'library lists saved prompt')
        pg.fill('#ws-search', 'zzzqqq'); pg.wait_for_timeout(150); check(pg.locator('[data-ws-use]').count() == 0, 'library search filters')
        pg.fill('#ws-search', ''); pg.wait_for_timeout(150)
        pg.click('[data-ws-edit]'); pg.wait_for_selector('#we-body'); pg.fill('#we-body', 'edited body v2'); pg.fill('#we-tags', 'e2e, demo'); pg.click('#we-save'); pg.wait_for_timeout(200)
        w = pg.evaluate("JSON.parse(localStorage.getItem('pc.workspace.v1'))[0]")
        check(w['body'] == 'edited body v2' and len(w['versions']) >= 1 and 'e2e' in w['tags'], 'edit creates a version + tags')
        if pg.locator('#ws-list').count() == 0: pg.click('#btn-workspace'); pg.wait_for_selector('#ws-list')
        pg.click('[data-ws-hist]'); pg.wait_for_selector('#ver-restore'); pg.locator('#ver-list [data-ver]').last.click(); pg.click('#ver-restore'); pg.wait_for_timeout(200)
        check('资深' in pg.evaluate("JSON.parse(localStorage.getItem('pc.workspace.v1'))[0].body"), 'version restore works')
        if pg.locator('#modal-root .overlay').count(): close_modal()
        pg.click('#btn-workspace'); pg.wait_for_selector('#ws-list'); pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(ROOT, 'docs/workspace.png'))
        pg.click('[data-ws-del]'); pg.wait_for_timeout(100)
        if pg.locator('[data-ws-del]').count(): pg.click('[data-ws-del]')
        pg.wait_for_selector('#toast-action'); check(pg.evaluate("JSON.parse(localStorage.getItem('pc.workspace.v1')).length") == 0, 'library delete')
        pg.click('#toast-action'); pg.wait_for_timeout(100); check(pg.evaluate("JSON.parse(localStorage.getItem('pc.workspace.v1')).length") == 1, 'library delete undo')
        if pg.locator('#modal-root .overlay').count(): close_modal()
        # compare
        tools('compare'); pg.fill('#cmp-extra', 'mock-b'); pg.click('#cmp-run')
        pg.wait_for_function("document.querySelectorAll('.cmp-col').length >= 2 && !document.querySelector('#cmp-grid .spin')", timeout=15000)
        check(pg.locator('.cmp-col').count() >= 2 and pg.inner_text('#cmp-grid').count('TEST_RUN_ANSWER') >= 2, 'compare runs models side by side')
        pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(ROOT, 'docs/compare.png')); close_modal()
        # chat
        pg.click('#btn-chat'); pg.wait_for_selector('#chat-input'); pg.fill('#chat-input', '你好'); pg.click('#chat-send')
        pg.wait_for_function("document.querySelectorAll('#chat-log .msg').length >= 2 && !document.querySelector('#chat-log .spin')", timeout=15000)
        lr = pg.evaluate("fetch('http://127.0.0.1:8787/__last').then(r=>r.json())")['body']
        check(lr['messages'][0]['role'] == 'system' and '资深' in lr['messages'][0]['content'] and lr['messages'][-1]['content'] == '你好', 'chat uses converted prompt as system')
        close_modal()
        # toolbox
        before = pg.inner_text('#output')
        tools('toolbox'); pg.click('[data-tool="cot"]'); pg.click('#tool-go'); pg.wait_for_timeout(200)
        check(pg.inner_text('#output') != before, 'toolbox applies chain-of-thought')
        if pg.locator('#modal-root .overlay').count(): close_modal()
        tools('toolbox'); pg.click('[data-tool="image"]'); pg.wait_for_selector('#img-preview')
        pg.wait_for_timeout(100); check('--ar' in pg.inner_text('#img-preview'), 'image preset formats Midjourney params')
        close_modal()
        # gallery
        n0 = pg.evaluate("JSON.parse(localStorage.getItem('pc.templates.v1')||'[]').length")
        tools('gallery'); pg.locator('[data-gl-install]').first.click(); pg.wait_for_timeout(150)
        check(pg.evaluate("JSON.parse(localStorage.getItem('pc.templates.v1')||'[]').length") == n0 + 1, 'gallery installs a template')
        pg.click('.gl-import summary'); pg.fill('#gl-url', 'http://127.0.0.1:8787/pack.json'); pg.click('#gl-fetch'); pg.wait_for_function("document.querySelector('#gl-status').textContent.includes('E2E')", timeout=8000)
        check('E2E Pack' in pg.inner_text('#modal-root'), 'gallery imports a pack by URL')
        pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(ROOT, 'docs/gallery.png')); close_modal()
        # stats
        tools('stats'); n_calls = int(re.sub(r'\D', '', pg.inner_text('#kpi-calls')) or 0)
        check(n_calls >= 3, f'stats records usage ({n_calls})'); pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(ROOT, 'docs/stats.png')); close_modal()
        # sync: webdav + gist round trip
        tools('sync'); pg.click('[data-sy="webdav"]'); pg.fill('#sy-url', 'http://127.0.0.1:8787/dav/'); pg.fill('#sy-user', 'u'); pg.fill('#sy-pass', 'p')
        pg.click('#sy-now'); pg.wait_for_function("/[0-9]/.test(document.querySelector('#sy-status').textContent) && !document.querySelector('#sy-now').disabled", timeout=8000)
        dav = pg.evaluate("fetch('http://127.0.0.1:8787/dav/prompt-converter-sync.json',{headers:{Authorization:'Basic '+btoa('u:p')}}).then(r=>r.status)")
        check(dav == 200, 'WebDAV push stored the bundle')
        pg.fill('#sy-pass', 'wrong'); pg.click('#sy-now'); pg.wait_for_timeout(500)
        check(pg.evaluate("document.querySelector('#sy-status').className").find('err') >= 0, 'WebDAV auth error shown')
        pg.evaluate("localStorage.setItem('pc.gistApi','http://127.0.0.1:8787')")
        pg.click('[data-sy="gist"]'); pg.fill('#sy-token', 'ghp-test'); pg.click('#sy-now'); pg.wait_for_timeout(800)
        check(pg.evaluate("JSON.parse(localStorage.getItem('pc.settings.v1')).sync.gistId") == 'g1', 'Gist sync creates a private gist')
        close_modal()
        # settings search + appearance
        pg.click('#btn-settings'); pg.wait_for_selector('#set-search'); pg.fill('#set-search', '强调'); pg.wait_for_timeout(150)
        check(pg.locator('[data-accent]').first.is_visible(), 'settings search finds accent option')
        pg.locator('[data-accent]').nth(2).click(); pg.fill('#set-search', ''); pg.locator('#f-compact').check(); pg.click('.modal [data-close].primary')
        pg.wait_for_timeout(200)
        if pg.locator('#modal-root .overlay').count(): close_modal()
        s2 = pg.evaluate("JSON.parse(localStorage.getItem('pc.settings.v1'))")
        check(s2.get('compact') is True and pg.evaluate("document.documentElement.classList.contains('compact') || document.body.classList.contains('compact')"), 'compact mode applied')
        patch({'compact': False, 'accent': ''})
        # onboarding + demo mode (fresh profile)
        pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('#ob-next', timeout=8000)
        check(True, 'onboarding shown on first run'); pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(ROOT, 'docs/onboarding.png'))
        pg.click('#ob-demo'); pg.wait_for_timeout(200)
        check(pg.locator('#demo-exit').count() == 1, 'demo mode banner')
        pg.fill('#input', '写一封请假邮件'); pg.click('#btn-convert'); pg.wait_for_function("!document.querySelector('.card.busy')", timeout=15000)
        check(len(pg.inner_text('#output')) > 40, 'demo mode produces sample output without a key')
        pg.click('#demo-exit'); pg.wait_for_timeout(200); check(pg.locator('#demo-exit').count() == 0, 'demo mode exits')
        pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector('#ob-next')
        pg.click('#ob-next'); pg.locator('[data-ob-prov="custom"]').first.dispatch_event('click'); pg.wait_for_timeout(100); pg.click('#ob-next'); pg.wait_for_selector('#ob-base')
        pg.fill('#ob-base', 'http://127.0.0.1:8787/v1'); pg.fill('#ob-key', 'sk-test'); pg.fill('#ob-model', 'mock-model'); pg.click('#ob-test')
        pg.wait_for_function("document.querySelector('#ob-status').className.includes('ok')", timeout=8000); check(True, 'onboarding connection test')
        pg.click('#ob-next'); pg.click('#ob-run'); pg.wait_for_function("document.querySelector('#ob-out') && document.querySelector('#ob-out').textContent.length > 20", timeout=15000)
        check(True, 'onboarding sample conversion'); pg.click('#ob-finish'); pg.wait_for_timeout(200)
        s3 = pg.evaluate("JSON.parse(localStorage.getItem('pc.settings.v1'))"); check(s3['onboarded'] and s3['apiKeys'].get('custom') == 'sk-test', 'onboarding saves provider + key')
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
