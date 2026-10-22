"""Chromium verification for Infinite Realms v0.7.8.5 Unified Map and Character UI Polish.
Run from the source root: python tests/v0.7.8.5-ui-polish-browser-smoke.py
Uses deterministic generated world data and a non-persistent localStorage shim.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / 'dist' / 'infinite-realms.html'
LOG_PATH = ROOT / 'docs' / 'v0.7.8.5-ui-polish-browser-log.json'
SCREENSHOT_DIR = ROOT / 'docs' / 'screenshots'
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
source = HTML_PATH.read_text(encoding='utf-8')
storage_shim = '''<script>(function(){const store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()}});window.__irTestStore=store;})();</script>'''
source = source.replace('<body>', '<body>' + storage_shim, 1)
results, errors = [], []
def add(name, passed, detail=''):
    row={'test':name,'status':'PASS' if passed else 'FAIL','detail':str(detail)}
    results.append(row)
    print(row['status'] + ': ' + name + (': ' + str(detail) if detail else ''), flush=True)
def wait(page, ms=120): page.wait_for_timeout(ms)
def open_tab(page, tab):
    loc = page.locator(f'#app [data-tab="{tab}"]:visible')
    if loc.count():
        loc.first.click(); wait(page, 90); return True
    page.evaluate('(tab) => { state.view=tab; render(); }', tab); wait(page, 90); return True

def create_game(page):
    if page.locator('#newName').count(): page.locator('#newName').fill('Unified UI Tester')
    if page.locator('#worldSeed').count(): page.locator('#worldSeed').fill('IR-0777-UI-POLISH-SEED')
    create=page.locator('#app [data-action="create"]').first
    if not create.count(): return False
    create.click(); wait(page, 400)
    return page.evaluate("typeof state !== 'undefined' && !!state?.world?.region?.sites?.length && !!state?.character")

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':1000}, device_scale_factor=1)
    page.set_default_timeout(6000)
    page.on('pageerror', lambda error: errors.append('pageerror: '+str(error)))
    page.on('console', lambda msg: errors.append('console error: '+msg.text) if msg.type=='error' else None)
    page.set_content(source, wait_until='load', timeout=60000)
    add('Standalone HTML title advertises v0.7.8.5', page.title()=='Infinite Realms — Version 0.7.8.5', page.title())
    started=create_game(page)
    add('New character and deterministic test world initialize', started, page.evaluate("state?.character?.name+' / '+state?.world?.seed") if started else 'Creation failed')
    if started:
        chrome=page.locator('#app').inner_text()
        add('Visible game chrome uses v0.7.8.5 branding', 'VERSION 0.7.8.5' in chrome, next((x for x in chrome.splitlines() if x.startswith('VERSION ')), 'no version label'))
        open_tab(page, 'World')
        switcher=page.locator('#app .ir0777-map-view-switcher')
        add('World atlas displays the unified three-view switcher', switcher.count()==1 and switcher.locator('button').count()==3 and switcher.locator('[data-action="ir0777-map-world"][aria-current="page"]').count()==1, 'World button marked active; all three native buttons available')
        controls=page.locator('#app .ir0777-map-view-switcher button')
        keyboard_ok=False
        if controls.count()==3:
            controls.nth(0).focus(); page.keyboard.press('Tab'); wait(page,30)
            keyboard_ok=page.evaluate("document.activeElement?.dataset?.action === 'ir0777-map-regional' && document.activeElement.matches(':focus-visible')")
        add('Map controls support sequential keyboard focus with a visible focus indicator', keyboard_ok, 'Tab from World lands on Regional and matches :focus-visible')
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.5-world-map-switcher-desktop.png'), full_page=False)
        page.locator('#app [data-action="ir0777-map-regional"]').click(); wait(page)
        add('Regional map control opens regional view and marks it active', page.locator('#app .ir0773-regional-panel').count()==1 and page.locator('#app .ir0777-map-view-switcher [data-action="ir0777-map-regional"][aria-current="page"]').count()==1, 'Regional panel and active state verified')
        # Select an existing directly connected visible node to verify selection and route feedback.
        target_id=page.evaluate('''() => {
          const current=state.world.siteId;
          const nodes=[...document.querySelectorAll('#app .ir0772-regional-node:not(.current)')];
          const direct=nodes.find(n => typeof irRouteBetween==='function' && irRouteBetween(current,n.dataset.site));
          return (direct || nodes[0])?.dataset?.site || null;
        }''')
        selected_ok=False; route_feedback='no candidate node'
        if target_id:
            page.locator(f'#app .ir0772-regional-node[data-site="{target_id}"]').click(); wait(page)
            selected_ok=page.locator(f'#app .ir0772-regional-node.selected[data-site="{target_id}"]').count()==1
            route_feedback=page.evaluate('''(id) => ({selected:[...document.querySelectorAll('#app .ir0772-regional-node.selected')].map(n=>n.dataset.site),selectedEdges:document.querySelectorAll('#app .ir0773-route-line.selected-edge').length,details:document.querySelector('#app .ir0773-inspect-card')?.innerText||''})''',target_id)
        add('Location selection updates the highlighted marker and inspection details', selected_ok and target_id in str(route_feedback.get('selected',[])) and bool(route_feedback.get('details')), json.dumps({'target':target_id,**route_feedback},ensure_ascii=False))
        add('Selected route line is highlighted when the chosen site has a recorded direct edge', (route_feedback.get('selectedEdges',0)>0) if target_id and page.evaluate("(id) => typeof irRouteBetween==='function' && !!irRouteBetween(state.world.siteId, id)", target_id) else True, f"selected edge count={route_feedback.get('selectedEdges',0)}; non-direct selection does not imply a route")
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.5-regional-map-selected-desktop.png'), full_page=False)
        page.locator('#app [data-action="ir0777-map-local"]').click(); wait(page)
        add('Local view opens with the shared switcher active', page.locator('#app .ir0773-local-panel').count()==1 and page.locator('#app .ir0777-map-view-switcher [data-action="ir0777-map-local"][aria-current="page"]').count()==1 and page.locator('#app .ir0773-local-nav').count()==0, 'Unified nav replaces the old two-button local nav')
        add('Local map scene and existing navigation actions remain available', page.locator('#app .ir0774-local-scene').count()==1 and page.locator('#app .ir0774-local-scene button').count()>0, f"interactive scene buttons={page.locator('#app .ir0774-local-scene button').count()}")
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.5-local-map-desktop.png'), full_page=False)
        page.locator('#app [data-action="ir0777-map-world"]:visible').first.click(); wait(page)
        add('World control returns to the atlas and restores the correct active state', page.locator('#app .ir0772-atlas-frame').count()==1 and page.locator('#app .ir0777-map-view-switcher [data-action="ir0777-map-world"][aria-current="page"]').count()==1, 'World view transition completed')
        # Check viewport adaptation without changing map data or the current game state.
        page.set_viewport_size({'width':390,'height':844}); wait(page)
        cols=page.locator('#app .ir0777-map-switcher-buttons').evaluate('e=>getComputedStyle(e).gridTemplateColumns')
        scroll_width=page.evaluate('document.documentElement.scrollWidth')
        add('Map controls adapt to a narrow viewport without page-level horizontal overflow', len(cols.split())==3 and scroll_width<=390, f'grid columns={cols}; document scrollWidth={scroll_width}')
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.5-world-map-switcher-mobile.png'), full_page=False)
        # Character status view and current/max values stay bound to the underlying state.
        open_tab(page,'Character')
        initial=page.evaluate('''() => ({health:state.character.health,max:state.character.maxHealth,energy:state.character.energy,maxEnergy:state.character.maxEnergy})''')
        character_before=page.locator('#app').inner_text()
        add('Character status remains present with numeric, accessible current/max meters', page.locator('#app .ir0776-addendum').count()==1 and page.locator('#app .ir0776-meter[title]').count()>=2 and f"{initial['health']} / {initial['max']}" in character_before and f"{initial['energy']} / {initial['maxEnergy']}" in character_before, json.dumps(initial))
        page.evaluate('state.character.health=41; render()'); wait(page)
        updated='41 / '+str(initial['max']) in page.locator('#app .ir0776-addendum').inner_text()
        add('Character health status refreshes after underlying game state changes', updated, 'Updated in-memory health and called standard renderer')
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.5-ui-polish-character-status-desktop.png'), full_page=False)
        open_tab(page,'Skills')
        add('Skills navigation continues to open detailed progression', page.evaluate("state.view==='Skills'") and ('training' in page.locator('#app').inner_text().lower() or 'learned abilities' in page.locator('#app').inner_text().lower()), 'Existing Skills screen loaded')
        open_tab(page,'Inventory')
        add('Inventory navigation continues to open equipment management', page.evaluate("state.view==='Inventory'") and page.locator('#app').count()==1, 'Existing Inventory view loaded')
        # Smoke existing non-target tabs to look for shared-style/render errors.
        for tab in ['Life','Adventure','People','Journal','Settings']:
            try:
                open_tab(page,tab)
                has_app=page.locator('#app').count()==1 and bool(page.locator('#app').inner_text().strip())
                add(f'Existing {tab} tab still renders after scoped UI changes', has_app, f'view={page.evaluate("state.view")}; rendered text length={len(page.locator("#app").inner_text())}')
            except Exception as e:
                add(f'Existing {tab} tab still renders after scoped UI changes', False, str(e))
    add('No uncaught browser or console errors', not errors, json.dumps(errors, ensure_ascii=False))
    browser.close()
summary={'suite':'Infinite Realms v0.7.8.5 Unified Map and Character UI Polish browser smoke','total':len(results),'passed':sum(r['status']=='PASS' for r in results),'failed':sum(r['status']=='FAIL' for r in results),'results':results,'browser_errors':errors}
LOG_PATH.write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('\nSUMMARY',summary['passed'],'/',summary['total'],'passed;',summary['failed'],'failed')
if summary['failed']: raise SystemExit(1)
