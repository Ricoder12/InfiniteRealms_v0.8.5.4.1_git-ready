"""Chromium smoke/regression tests for Infinite Realms v0.7.7.9 Local Map."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / 'dist' / 'infinite-realms.html'
LOG_PATH = ROOT / 'docs' / 'v0.7.7.9-local-map-browser-log.json'
SCREENSHOT_DIR = ROOT / 'docs' / 'screenshots'
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
source = HTML_PATH.read_text(encoding='utf-8')
storage_shim = '''<script>(function(){const store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()}});window.__irTestStore=store;})();</script>'''
source = source.replace('<body>', '<body>' + storage_shim, 1)
results, errors = [], []
def add(name, passed, detail=''):
    row={'test': name, 'status': 'PASS' if passed else 'FAIL', 'detail': detail}
    results.append(row)
    print(row['status'] + ': ' + name, detail, flush=True)
def wait(page, ms=80):
    page.wait_for_timeout(ms)
def create_game(page, seed='IR-LOCAL-MAP-774-DETERMINISTIC'):
    name = page.locator('#newName')
    if name.count(): name.fill('Local Map Tester')
    seed_field = page.locator('#worldSeed')
    if seed_field.count(): seed_field.fill(seed)
    create = page.locator('#app [data-action="create"]').first
    if not create.count(): return False
    create.click(); wait(page, 180)
    return page.evaluate("typeof state !== 'undefined' && !!state?.world?.region?.sites?.length")
def visit_site(page, site_id):
    return page.evaluate('''(id) => {
      const w=state.world, s=w.region?.sites?.find(x=>x.id===id); if(!s) return {ok:false,reason:'site missing'};
      w.siteId=id; s.visits=Math.max(1,Number(s.visits)||0); s.discovered=true;
      w.known=Array.isArray(w.known)?w.known:[]; if(!w.known.includes(id))w.known.push(id);
      w.visited=Array.isArray(w.visited)?w.visited:[]; if(!w.visited.includes(id))w.visited.push(id);
      render(); return {ok:true,id,type:s.type,settlementType:s.settlementType,biomeId:s.biomeId,services:s.services||[]};
    }''', site_id)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: errors.append('console error: ' + msg.text) if msg.type == 'error' else None)
    page.set_content(source, wait_until='load', timeout=60000)
    add('Standalone boot and v0.7.7.9 metadata', page.title() == 'Infinite Realms — Version 0.7.7.9' and 'VERSION 0.7.7.9' in page.locator('#app .topbar').inner_text(), page.title())
    started = create_game(page)
    add('Create deterministic game and render world data', started, str(page.evaluate("({site:state?.world?.siteId,count:state?.world?.region?.sites?.length})")))
    if started:
        page.locator('#app [data-tab="World"]').first.click(); wait(page)
        add('World atlas and region navigation remain available', page.locator('#app .ir0772-atlas-frame').count()==1 and page.locator('#app [data-action="ir0772-open-region"]').count()==1)
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.7.9-localtest-world-atlas.png'), full_page=False)
        page.locator('#app .ir0777-map-view-switcher [data-action="ir0777-map-local"]').first.click(); wait(page)
        town = page.evaluate('''() => { const w=state.world,p=document.querySelector('#app .ir0773-local-panel'),scene=p?.querySelector('.ir0774-local-scene'); const services=w.region.sites.find(s=>s.id===w.siteId)?.services||[]; const routes=p?.querySelectorAll('.ir0773-local-route').length||0,travels=p?.querySelectorAll('.ir0773-local-route [data-action="travel"]').length||0; return {panel:!!p,scene:!!scene,settlementClass:[...(scene?.classList||[])].find(c=>c.startsWith('settlement-'))||'',buildings:scene?.querySelectorAll('.ir0774-service-building').length||0,serviceRows:services.length,routeRows:routes,travelButtons:travels,return:!!document.querySelector('#app .ir0777-map-view-switcher [data-action="ir0777-map-regional"]'),disclaimer:p?.innerText.includes('Illustration limits:')}; }''')
        add('Local view replaces the text-only detail with an illustrated settlement of the actual current type', town['panel'] and town['scene'] and town['settlementClass'].startswith('settlement-') and town['buildings']>0 and town['return'] and town['disclaimer'] and town['routeRows']==town['travelButtons'], json.dumps(town,ensure_ascii=False))
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.7.9-local-settlement.png'), full_page=False)
        scene_integrity = page.evaluate('''() => { const s=document.querySelector('#app .ir0774-local-scene'),w=state.world,site=w.region.sites.find(x=>x.id===w.siteId),allowed=new Set((site?.services||[]).map(x=>String(x).trim().toLowerCase().replace(/[ _]+/g,'-'))); const buildings=[...(s?.querySelectorAll('.ir0774-service-building')||[])]; const decor=[...(s?.querySelectorAll('.ir0774-decor-house,.ir0774-scenery-object')||[])]; const keys=buildings.map(b=>({tab:b.dataset.tab||'',action:b.dataset.action||'',name:b.querySelector('.ir0774-building-name')?.innerText||''})); return {buildings:keys,allHaveExistingAction:keys.every(b=>['Inventory','World','People'].includes(b.tab)||['local-rest','jobs-modal','local-healer','ask-rumor'].includes(b.action)),decorCount:decor.length,decorInert:decor.every(d=>d.tagName==='SPAN'&&d.getAttribute('aria-hidden')==='true'&&!d.dataset.action&&!d.dataset.tab),savedServices:site?.services||[],worldKeys:Object.keys(w).sort()}; }''')
        add('Clickable facilities map only recorded services to existing controls; scenery stays inert', scene_integrity['allHaveExistingAction'] and scene_integrity['decorCount']>0 and scene_integrity['decorInert'] and len(scene_integrity['buildings'])<=len(scene_integrity['savedServices']), json.dumps(scene_integrity,ensure_ascii=False))
        before_world = page.evaluate('JSON.stringify(state.world)')
        page.evaluate('render()'); wait(page)
        after_world = page.evaluate('JSON.stringify(state.world)')
        add('Rendering the local map does not mutate saved world data',before_world==after_world)
        # Settlement types use their existing settlementType and service arrays; no locations added.
        layout_fixtures=[]
        for site_id,expect in [('loc-0-0','settlement-hamlet'),('loc-0-6','settlement-village'),('loc-3-3','settlement-town'),('loc-6-6','settlement-city')]:
            fixture=visit_site(page,site_id); wait(page,45)
            cls=page.locator('#app .ir0774-local-scene').get_attribute('class') if page.locator('#app .ir0774-local-scene').count() else ''
            count=page.locator('#app .ir0774-service-building').count()
            bg=page.locator('#app .ir0774-local-scene').evaluate('(el)=>getComputedStyle(el).backgroundImage') if page.locator('#app .ir0774-local-scene').count() else ''
            terrain_ok=True if fixture.get('biomeId')!='snow' else ('243, 244, 232' in bg and '223, 229, 223' in bg)
            valid=fixture.get('ok') and expect in cls and (count>0) and terrain_ok
            layout_fixtures.append({'site':site_id,'expected':expect,'biome':fixture.get('biomeId'),'class':cls,'backgroundPreservesSnowBiome':terrain_ok,'computedBackground':bg if fixture.get('biomeId')=='snow' else '', 'serviceBuildings':count,'pass':bool(valid)})
            if site_id=='loc-0-0': page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.7.9-local-hamlet.png'),full_page=False)
            if site_id=='loc-6-6': page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.7.9-local-city.png'),full_page=False)
        add('Hamlet, village, town, and city layouts vary according to actual settlement types',all(x['pass'] for x in layout_fixtures),json.dumps(layout_fixtures,ensure_ascii=False))
        # Switch through real wilderness records in the deterministic test world; mark discovery only
        # in this isolated in-memory test fixture to exercise what each existing biome looks like.
        biome_fixtures=[]
        for biome,expect in [('woodland','terrain-woodland'),('desert','terrain-desert'),('swamp','terrain-swamp'),('snow','terrain-snow')]:
            record=page.evaluate('''(biome) => {const s=state.world.region.sites.find(x=>x.type==='wilderness'&&(x.biomeId===biome||(biome==='woodland'&&x.biomeId==='forest')));return s?{id:s.id,biomeId:s.biomeId,type:s.type}:null;}''',biome)
            if not record:
                biome_fixtures.append({'biome':biome,'pass':False,'reason':'No existing wilderness site with this biome in deterministic test world.'}); continue
            fixture=visit_site(page,record['id']); wait(page,45)
            cls=page.locator('#app .ir0774-local-scene').get_attribute('class') if page.locator('#app .ir0774-local-scene').count() else ''
            services=page.locator('#app .ir0774-service-building').count()
            ok=fixture.get('ok') and fixture.get('type')=='wilderness' and expect in cls and services==0
            biome_fixtures.append({'site':record['id'],'type':fixture.get('type'),'biome':fixture.get('biomeId'),'expected':expect,'class':cls,'serviceBuildings':services,'pass':bool(ok)})
            if biome in ('woodland','desert'): page.screenshot(path=str(SCREENSHOT_DIR/f"v0.7.7.9-local-{biome}.png"),full_page=False)
        add('Forest, desert, swamp, and snow scenes reflect saved biome IDs without settlement services',all(x['pass'] for x in biome_fixtures),json.dumps(biome_fixtures,ensure_ascii=False))
        # The selected town is a known settlement; verify clicking its existing market button follows the existing tab.
        visit_site(page,'loc-3-3'); wait(page)
        market=page.locator('#app .ir0774-service-building[data-tab="Inventory"]').first
        market_clicked=market.count()>0
        if market_clicked: market.click(timeout=5000,force=True); wait(page,80)
        active_tab=page.evaluate("document.querySelector('#app [data-tab].active')?.getAttribute('data-tab') || state?.view || ''")
        add('Clicking an interactive market building opens its existing inventory destination',market_clicked and ('Inventory' in str(active_tab) or page.locator('#app .tab-content').inner_text().lower().find('inventory')>=0),str(active_tab))
        page.locator('#app [data-tab="World"]').first.click(); wait(page,80)
        # Unsurveyed current-site fixture must not publish its name, biome, service buildings or NPC names.
        hidden=page.evaluate('''() => { const w=state.world,s=w.region.sites.find(x=>x.id===w.siteId); const secret={name:s.name,desc:s.desc,biome:s.biome,icon:s.icon,visits:s.visits,discovered:s.discovered,known:[...(w.known||[])],visited:[...(w.visited||[])]}; s.visits=0;s.discovered=false;w.known=(w.known||[]).filter(x=>x!==s.id);w.visited=(w.visited||[]).filter(x=>x!==s.id);render(); const html=document.querySelector('#app .ir0773-local-panel')?.innerHTML||''; const result={nameHidden:!secret.name||!html.includes(secret.name),descHidden:!secret.desc||!html.includes(secret.desc),biomeHidden:!secret.biome||!html.includes(secret.biome),noBuildings:!html.includes('ir0774-service-building'),genericSeal:html.includes('ir0773-local-seal">⌖'),sceneUnsurveyed:html.includes('scene-unsurveyed')}; s.visits=secret.visits;s.discovered=secret.discovered;w.known=secret.known;w.visited=secret.visited;render();return result; }''')
        add('Unsurveyed current location hides identifying labels, biome, and service buildings',all(hidden.values()),json.dumps(hidden,ensure_ascii=False))
        # Test missing optional local fields and ensure renderer doesn't add any fields to the world.
        missing=page.evaluate('''() => { const w=state.world,s=w.region.sites.find(x=>x.id===w.siteId),save={services:s.services,biome:s.biome,biomeId:s.biomeId,routes:s.routes,biomes:w.biomes};delete s.services;delete s.biome;delete s.biomeId;delete s.routes;delete w.biomes;let result={ok:false,scene:false};try{render();result.scene=!!document.querySelector('#app .ir0774-local-scene');result.ok=result.scene;}catch(e){result.error=String(e)} if(save.services!==undefined)s.services=save.services;if(save.biome!==undefined)s.biome=save.biome;if(save.biomeId!==undefined)s.biomeId=save.biomeId;if(save.routes!==undefined)s.routes=save.routes;if(save.biomes!==undefined)w.biomes=save.biomes;return result;}''')
        add('Missing optional service/biome/route fields render safely',missing.get('ok',False),json.dumps(missing))
        # Navigate back through existing map views.
        nav = page.locator('#app .ir0777-map-view-switcher [data-action="ir0777-map-regional"]').first
        if nav.count(): nav.click(); wait(page,60)
        regional_ok=page.locator('#app .ir0773-regional-panel').count()==1
        atlas_button=page.locator('#app .ir0777-map-view-switcher [data-action="ir0777-map-world"]').first
        if atlas_button.count(): atlas_button.click(); wait(page,60)
        atlas_ok=page.locator('#app .ir0772-atlas-frame').count()==1
        add('Regional/local/world view switching remains connected',regional_ok and atlas_ok)
        page.locator('#app .ir0777-map-view-switcher [data-action="ir0777-map-local"]').first.click(); wait(page)
        page.set_viewport_size({'width':390,'height':844}); wait(page,80)
        mobile=page.evaluate('''() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,scene:!!document.querySelector('#app .ir0774-local-scene'),buildings:document.querySelectorAll('#app .ir0774-service-building').length,back:!!document.querySelector('#app .ir0777-map-view-switcher [data-action="ir0777-map-regional"]')})''')
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.7.9-local-settlement-mobile.png'),full_page=False)
        add('Local map remains readable and navigable on a 390px phone viewport',mobile['scene'] and mobile['back'] and mobile['scrollWidth']<=mobile['width']+2,json.dumps(mobile))
        add('No uncaught browser errors',not errors,json.dumps(errors,ensure_ascii=False))
    else:
        add('Local-map browser scenarios',False,'Character/game creation failed; downstream browser tests were skipped.')
        add('No uncaught browser errors',not errors,json.dumps(errors,ensure_ascii=False))
    browser.close()
report={'suite':'Infinite Realms v0.7.7.9 Local Map browser smoke','total':len(results),'passed':sum(x['status']=='PASS' for x in results),'failed':sum(x['status']=='FAIL' for x in results),'tests':results}
LOG_PATH.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2,ensure_ascii=False))
if report['failed']: raise SystemExit(1)
