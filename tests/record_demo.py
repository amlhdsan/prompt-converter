"""Records the README demo (docs/demo.gif) against the mock API. Run: npm run build && python3 tests/record_demo.py"""
import subprocess, time, os, json, glob, shutil
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = dict(os.environ, MOCK_DELAY='90')
mock = subprocess.Popen(['node', 'tests/mock-server.mjs', '8787'], cwd=ROOT, env=env)
prev = subprocess.Popen(['npx', 'vite', 'preview', '--port', '4174', '--strictPort'], cwd=ROOT, stdout=subprocess.DEVNULL)
time.sleep(2.5)
vid = '/tmp/demo-video'; shutil.rmtree(vid, ignore_errors=True)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1280, 'height': 800}, record_video_dir=vid, record_video_size={'width': 1280, 'height': 800}, permissions=['clipboard-read', 'clipboard-write'], bypass_csp=True)
        pg = ctx.new_page()
        pg.goto('http://127.0.0.1:4174/')
        st = {'provider': 'custom', 'baseUrl': 'http://127.0.0.1:8787/v1', 'model': 'deepseek-chat', 'apiKeys': {'custom': 'sk-test'}, 'stream': True, 'autoUpdate': False, 'theme': 'light', 'onboarded': True}
        pg.evaluate(f"localStorage.clear(); localStorage.setItem('pc.settings.v1', JSON.stringify({json.dumps(st)}))")
        pg.reload(); pg.wait_for_timeout(1500)
        pg.click('#input'); pg.keyboard.type('帮我写个 Python 脚本批量重命名图片，并给出代码', delay=90); pg.wait_for_timeout(900)
        pg.hover('#detect-apply'); pg.wait_for_timeout(500); pg.click('#detect-apply'); pg.wait_for_timeout(700)  # auto mode suggestion
        pg.hover('#btn-convert'); pg.wait_for_timeout(400); pg.click('#btn-convert')
        pg.wait_for_function("!document.querySelector('.card.busy')", timeout=30000); pg.wait_for_timeout(1200)
        pg.click('[data-view="diff"]'); pg.wait_for_timeout(1600); pg.click('[data-view="single"]'); pg.wait_for_timeout(600)
        pg.keyboard.press('Control+s'); pg.wait_for_timeout(900)  # save to library
        pg.click('#btn-tools'); pg.wait_for_timeout(500); pg.click('#tools-menu [data-menu="toolbox"]'); pg.wait_for_selector('#tool-go'); pg.wait_for_timeout(900)
        pg.click('[data-tool="image"]'); pg.wait_for_timeout(1500); pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
        pg.click('#btn-tools'); pg.click('#tools-menu [data-menu="compare"]'); pg.wait_for_selector('#cmp-extra'); pg.fill('#cmp-extra', 'deepseek-reasoner'); pg.wait_for_timeout(500)
        pg.click('#cmp-run'); pg.wait_for_function("document.querySelectorAll('.cmp-col').length >= 2 && !document.querySelector('#cmp-grid .spin')", timeout=30000); pg.wait_for_timeout(2000)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        pg.click('#btn-workspace'); pg.wait_for_selector('#ws-list'); pg.wait_for_timeout(2000); pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
        pg.hover('#btn-copy'); pg.wait_for_timeout(400); pg.click('#btn-copy'); pg.wait_for_timeout(1800)
        ctx.close(); b.close()
finally:
    mock.terminate(); prev.terminate()
print(glob.glob(vid + '/*.webm')[0])
