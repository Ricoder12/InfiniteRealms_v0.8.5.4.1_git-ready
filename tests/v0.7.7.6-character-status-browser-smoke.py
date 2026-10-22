"""Chromium checks for Infinite Realms v0.7.7.9 append-only Character Status update.
Run with: python tests/v0.7.7.9-character-status-browser-smoke.py
Uses a deterministic generated character and captures the actual bundled HTML.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / 'dist' / 'infinite-realms.html'
LOG_PATH = ROOT / 'docs' / 'v0.7.7.9-character-smoke-browser-log.json'
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
def create_game(page):
    if page.locator('#newName').count(): page.locator('#newName').fill('Status Window Tester')
    if page.locator('#worldSeed').count(): page.locator('#worldSeed').fill('IR-0776-CHARACTER-STATUS-SEED')
    create=page.locator('#app [data-action="create"]').first
    if not create.count(): return False
    create.click(); wait(page, 350)
    return page.evaluate("typeof state !== 'undefined' && !!state?.world?.region?.sites?.length && !!state?.character")

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':1000}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append('pageerror: '+str(error)))
    page.on('console', lambda msg: errors.append('console error: '+msg.text) if msg.type=='error' else None)
    page.set_content(source, wait_until='load', timeout=60000)
    add('Bundled HTML advertises v0.7.7.9 in document title', page.title()=='Infinite Realms — Version 0.7.7.9', page.title())
    started=create_game(page)
    add('New character creation succeeds on deterministic seed', started, page.evaluate("state?.character?.name+' / '+state?.world?.seed") if started else 'Character creation failed')
    if started:
        shell_text=page.locator('#app').inner_text()
        add('Visible game chrome advertises v0.7.7.9', 'VERSION 0.7.7.9' in shell_text, next((x for x in shell_text.splitlines() if x.startswith('VERSION ')), 'no version label'))
        page.locator('#app [data-tab="Character"]').first.click(); wait(page)
        body=page.locator('#app').inner_text()
        c=page.evaluate('''() => ({c:state.character,site:state.world.region.sites.find(s=>s.id===state.world.siteId),attr:state.character.attrs})''')
        add('Accepted Character screen is preserved (visual record, talents, attributes, learned skills, progression, history)', all(x in body for x in ['CHARACTER AT A GLANCE','Innate talents','Core attributes','Learned skills','Character progression','Character history']) and page.locator('#app .ir05-character-visual').count()==1, 'Original Character screen markers remain present')
        health_text=f"{c['c']['health']} / {c['c']['maxHealth']}"
        energy_text=f"{c['c']['energy']} / {c['c']['maxEnergy']}"
        add('Appended status area shows health and energy current/max values', health_text in body and energy_text in body and page.locator('#app .ir0776-addendum').count()==1, f'expected {health_text}; {energy_text}')
        actual_site=c.get('site',{}).get('name','')
        status_text=page.locator('#app .ir0776-addendum').inner_text()
        add('Current site is resolved from shared geographic state', bool(actual_site) and actual_site in status_text and 'Current location' in status_text and 'Location unavailable' not in status_text, f'actual site={actual_site!r}')
        attrs_ok=all(str(v) in body and k in body for k,v in c['attr'].items())
        add('Original attribute labels and values are retained', attrs_ok, f'{len(c["attr"])} stored attributes')
        skill_count=page.locator('#app .skill-bars > div').count()
        add('Original detailed skills display remains intact (not replaced with a summary)', skill_count > 5, f'{skill_count} skill rows rendered')
        order_ok=page.evaluate("document.querySelector('.ir05-character-visual')?.compareDocumentPosition(document.querySelector('.ir0776-addendum')) & Node.DOCUMENT_POSITION_FOLLOWING")
        add('New condition and equipment information is appended below the original screen', bool(order_ok), 'Original Character markup precedes the v0.7.7.9 addendum')
        wait(page, 3500)  # Let the transient character-created toast expire before screenshots.
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.7.9-character-preserved-screen-desktop.png'), full_page=False)
        # Verify status rerenders from the single game-state source rather than cached summary values.
        page.evaluate('state.character.health=57; render()'); wait(page)
        updated=page.locator('#app .ir0776-addendum').inner_text()
        add('Appended health meter refreshes when underlying game state changes', '57 / 100' in updated, 'Changed in-memory health then invoked normal render()')
        # Equipment summary is appended; the original visible equipment remains in place above it.
        gear_count=page.locator('#app .ir0776-addendum .ir0776-gear').count()
        inventory_link=page.locator('#app .ir0776-addendum [data-tab="Inventory"]').count()
        add('Equipment addendum uses existing slots and provides Inventory navigation', gear_count==8 and inventory_link==1, f'{gear_count} equipment slots; Inventory link count={inventory_link}')
        page.evaluate("state.character.equipment.weapon='iron_sword'; render()"); wait(page)
        weapon_card=page.locator('#app .ir0776-addendum .ir0776-gear').first.inner_text()
        add('Equipped-item summary refreshes from the existing equipment slot', 'Iron Sword' in weapon_card and 'Damage 9' in weapon_card, weapon_card)
        page.evaluate("document.documentElement.style.scrollBehavior='auto'; window.scrollTo({top:document.querySelector('.ir0776-addendum').getBoundingClientRect().top + window.scrollY,behavior:'instant'})"); wait(page, 250)
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.7.9-character-status-from-v76-desktop.png'), full_page=False)
        page.set_viewport_size({'width':390,'height':844}); wait(page)
        page.evaluate("document.documentElement.style.scrollBehavior='auto'; window.scrollTo({top:document.querySelector('.ir0776-addendum').getBoundingClientRect().top + window.scrollY,behavior:'instant'})"); wait(page, 250)
        gear_columns=page.locator('#app .ir0776-gear-grid').evaluate("e => getComputedStyle(e).gridTemplateColumns")
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.7.9-character-status-from-v76-mobile.png'), full_page=False)
        add('Equipment addendum adapts to a two-column mobile layout', len(gear_columns.split())==2, f'grid-template-columns={gear_columns}')
        page.locator('#app .ir0776-addendum [data-tab="Inventory"]').click(); wait(page)
        inventory_view=page.evaluate('state.view')
        add('Inventory navigation opens the existing Inventory tab', inventory_view=='Inventory', f'view={inventory_view}')
    else:
        for name in ['Visible game chrome advertises v0.7.7.9','Accepted Character screen is preserved (visual record, talents, attributes, learned skills, progression, history)','Appended status area shows health and energy current/max values','Current site is resolved from shared geographic state','Original attribute labels and values are retained','Original detailed skills display remains intact (not replaced with a summary)','New condition and equipment information is appended below the original screen','Appended health meter refreshes when underlying game state changes','Equipment addendum uses existing slots and provides Inventory navigation','Equipped-item summary refreshes from the existing equipment slot','Equipment addendum adapts to a two-column mobile layout','Inventory navigation opens the existing Inventory tab']:
            add(name, False, 'Skipped because character creation failed')
    add('No uncaught browser or console errors', not errors, json.dumps(errors, ensure_ascii=False))
    browser.close()
summary={'suite':'Infinite Realms v0.7.7.9 append-only Character Status','total':len(results),'passed':sum(r['status']=='PASS' for r in results),'failed':sum(r['status']=='FAIL' for r in results),'results':results,'browser_errors':errors}
LOG_PATH.write_text(json.dumps(summary,indent=2,ensure_ascii=False),encoding='utf-8')
print('\nSUMMARY',summary['passed'],'/',summary['total'],'passed;',summary['failed'],'failed')
