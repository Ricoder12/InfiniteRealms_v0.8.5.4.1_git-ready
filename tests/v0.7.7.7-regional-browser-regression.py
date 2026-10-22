"""Browser smoke test for Infinite Realms v0.7.7.9-regional.
Requires Python Playwright and /usr/bin/chromium in the test environment.
Standalone HTML is loaded with set_content so no server/local URL permissions are required.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / 'dist' / 'infinite-realms.html'
LOG_PATH = ROOT / 'docs' / 'v0.7.7.9-regional-browser-test-log.json'
SCREENSHOT_DIR = ROOT / 'docs' / 'screenshots'
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
source = HTML_PATH.read_text(encoding='utf-8')
# The app is designed for local-file localStorage; provide an isolated storage shim because
# Chromium's about:blank origin does not consistently permit storage in restricted runtimes.
storage_shim = '''<script>(function(){const store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()}});window.__irTestStore=store;})();</script>'''
source = source.replace('<body>', '<body>' + storage_shim, 1)
results = []
errors = []
def add(name, passed, detail=''):
    results.append({'test': name, 'status': 'PASS' if passed else 'FAIL', 'detail': detail})

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: errors.append('console error: ' + msg.text) if msg.type == 'error' else None)
    page.set_content(source, wait_until='load', timeout=60000)
    add('Standalone boot and version metadata', page.title() == 'Infinite Realms — Version 0.7.7.9' and 'VERSION 0.7.7.9' in page.locator('#app .topbar').inner_text(), page.title())

    name = page.locator('#newName')
    if name.count(): name.fill('Atlas Tester')
    seed = page.locator('#worldSeed')
    if seed.count(): seed.fill('IR-WORLD-MAP-772-DETERMINISTIC')
    started = False
    for button in page.locator('#app button').all():
        if button.get_attribute('data-action') == 'create':
            button.click(); started = True; break
    page.wait_for_timeout(150)
    add('Create character and game shell', started and page.locator('#app [data-tab="World"]').count() > 0 and page.evaluate("typeof state !== 'undefined' && !!state?.world?.region?.sites?.length"))

    page.locator('#app [data-tab="World"]').first.click()
    page.wait_for_timeout(80)
    atlas_html = page.locator('#app').inner_html()
    add('World tab opens interactive atlas index', page.locator('#app .ir0772-atlas-frame').count() == 1 and page.locator('#app [data-action="ir0772-open-region"]').count() == 1)
    page.screenshot(path=str(SCREENSHOT_DIR / 'v0.7.7.9-regional-world-atlas.png'), full_page=False)

    hidden_check = page.evaluate('''() => {
      const w=state.world; const known=new Set([...(w.known||[]),...(w.visited||[]),w.siteId]);
      const unknown=(w.region?.sites||[]).filter(s=>!known.has(s.id)&&s.discovered!==true);
      const html=document.querySelector('#app').innerHTML;
      return {count:unknown.length, leaks:unknown.filter(s=>s.name&&html.includes(s.name)).map(s=>s.id+': '+s.name).slice(0,5), markerLeaks:unknown.filter(s=>html.includes('data-site="'+s.id+'"')).map(s=>s.id).slice(0,5)};
    }''')
    add('Atlas hides undiscovered site names and markers', not hidden_check['leaks'] and not hidden_check['markerLeaks'], json.dumps(hidden_check, ensure_ascii=False))

    missing_fields = page.evaluate('''() => {
      const w=state.world; const prev={continents:w.continents,countries:w.countries,geography:w.geography};
      delete w.continents; delete w.countries; delete w.geography;
      let result={ok:false,atlas:false,regional:false};
      try { result.atlas=ir0772RenderWorldAtlas(w).includes('No political boundary geometry recorded'); result.regional=ir0772RenderRegionalMap(ir0772WorldMapModel(w)).includes('REGIONAL TERRAIN CHART'); result.ok=result.atlas&&result.regional; }
      catch(e){result.error=String(e)}
      if(prev.continents!==undefined)w.continents=prev.continents; if(prev.countries!==undefined)w.countries=prev.countries; if(prev.geography!==undefined)w.geography=prev.geography;
      return result;
    }''')
    add('Missing optional world hierarchy fields do not crash atlas or regional renderer', missing_fields.get('ok', False), json.dumps(missing_fields))

    local_entry = page.locator('#app [data-action="ir0773-open-local"]')
    if local_entry.count():
        local_entry.first.click(); page.wait_for_timeout(100)
        local_state = page.evaluate('''() => { const w=state.world,p=document.querySelector('#app .ir0773-local-panel'),h=p?.innerHTML||''; const known=new Set([...(w.known||[]),...(w.visited||[]),w.siteId]); const hidden=(w.region?.sites||[]).filter(s=>!known.has(s.id)&&s.discovered!==true&&!(Number(s.visits)>0)); return {panel:!!p,title:p?.querySelector('.ir0773-local-hero h2')?.innerText||'',services:!!p?.querySelector('.ir0773-local-services'),returns:!!document.querySelector('#app .ir0777-map-view-switcher [data-action="ir0777-map-regional"]'),geometryDisclaimer:h.includes('Illustration limits:'),hiddenLeaks:hidden.filter(s=>(s.name&&h.includes(s.name))||(s.geoId&&h.includes(s.geoId))||h.includes('data-site="'+s.id+'"')).map(s=>s.id).slice(0,5)}; }''')
        page.screenshot(path=str(SCREENSHOT_DIR / 'v0.7.7.9-regional-local-detail.png'), full_page=False)
        add('Local view opens with current site data and no fabricated street geometry', local_state['panel'] and local_state['returns'] and local_state['geometryDisclaimer'] and not local_state['hiddenLeaks'], json.dumps(local_state, ensure_ascii=False))
        page.locator('#app .ir0777-map-view-switcher [data-action="ir0777-map-regional"]').first.click(); page.wait_for_timeout(80)
        returned_regional = page.locator('#app .ir0773-regional-panel').count() == 1
        known_marker = page.locator('#app .ir0772-regional-node:not(.current)').first
        selected_geo = None
        if known_marker.count():
            known_marker.click(); page.wait_for_timeout(60)
            selected_geo = page.evaluate('''() => ir0772SelectedGeoId''')
            page.locator('#app [data-action="ir0777-map-world"]').click(); page.wait_for_timeout(60)
            atlas_reentry = page.locator('#app [data-action="ir0773-open-local"]')
            if atlas_reentry.count(): atlas_reentry.first.click(); page.wait_for_timeout(60)
            retained = page.locator('#app .ir0773-local-selection').count() == 1 and page.locator('#app .ir0773-local-selection').inner_text().find('RETAINED REGIONAL SELECTION') >= 0
            page.locator('#app .ir0777-map-view-switcher [data-action="ir0777-map-regional"]').first.click(); page.wait_for_timeout(60)
            restored = page.evaluate('''() => ({scope:ir0772MapScope,selected:ir0772SelectedGeoId})''')
            add('World → regional → local → regional keeps a valid selection without changing the save', returned_regional and selected_geo and retained and restored['scope']=='regional' and restored['selected']==selected_geo, json.dumps({'selectedGeoId':selected_geo,'retainedInLocal':retained,'afterReturn':restored}, ensure_ascii=False))
        else:
            add('World → regional → local → regional keeps a valid selection without changing the save', False, 'No second known regional marker was available for the selection-persistence fixture.')
    else:
        add('Local view opens with current site data and no fabricated street geometry', False, 'The atlas did not render the local-view entry control.')
        add('World → regional → local → regional keeps a valid selection without changing the save', False, 'Local-view entry control was missing.')
    # Tests above return to the atlas; reopen the regional chart for the route and discovery tests.
    if page.locator('#app [data-action="ir0772-open-region"]').count():
        page.locator('#app [data-action="ir0772-open-region"]').click(); page.wait_for_timeout(100)
    page.screenshot(path=str(SCREENSHOT_DIR / 'v0.7.7.9-regional-regional-map.png'), full_page=False)
    map_state = page.evaluate('''() => {
      const w=state.world, m=document.querySelector('#app .ir0772-regional-panel');
      return {panel:!!m, markerCount:m?.querySelectorAll('button.ir0772-regional-node').length||0,
        currentMarkers:m?[...m.querySelectorAll('button.ir0772-regional-node.current')].map(n=>n.dataset.site):[],
        currentSite:w.siteId, fog:m?.querySelectorAll('.ir0772-uncharted-terrain').length||0,
        hiddenNames:(w.region.sites||[]).filter(s=>!(w.known||[]).includes(s.id)&&!(w.visited||[]).includes(s.id)&&s.discovered!==true&&s.id!==w.siteId&&s.name&&m?.innerHTML.includes(s.name)).map(s=>s.name).slice(0,5),
        hiddenCoordinates:(w.region.sites||[]).filter(s=>!(w.known||[]).includes(s.id)&&!(w.visited||[]).includes(s.id)&&s.discovered!==true&&s.id!==w.siteId&&m?.innerHTML.includes(`left:${Number(s.x)||0}%;top:${Number(s.y)||0}%`)).map(s=>s.id).slice(0,5)};
    }''')
    add('Regional view opens with visible markers, fog, and current-location highlight', map_state['panel'] and map_state['markerCount'] > 0 and map_state['currentMarkers'] == [map_state['currentSite']] and map_state['fog'] > 0 and not map_state['hiddenNames'] and not map_state['hiddenCoordinates'], json.dumps(map_state, ensure_ascii=False))
    regional_accuracy = page.evaluate('''() => {
      const panel=document.querySelector('#app .ir0773-regional-panel');
      const html=panel?.innerHTML||'';
      return {accuracyClass:!!panel, routeLines:panel?.querySelectorAll('path.ir0773-route-line').length||0,
        connectionRows:panel?.querySelectorAll('.ir0773-connection-row').length||0,
        inventedWaterMarkup:html.includes('ir05-river')||html.includes('ir05-map-water')||html.includes('ir05-map-ridges'),
        explainsMissingGeometry:html.includes('does not contain traced river courses'),
        routeLegend:html.includes('Recorded connection')&&html.includes('Directly reachable')};
    }''')
    add('Regional map uses recorded connections and does not draw unsupported obstacle geometry', regional_accuracy['accuracyClass'] and regional_accuracy['routeLines'] > 0 and not regional_accuracy['inventedWaterMarkup'] and regional_accuracy['explainsMissingGeometry'] and regional_accuracy['routeLegend'], json.dumps(regional_accuracy, ensure_ascii=False))

    no_route = page.evaluate('''() => {
      const w=state.world; const target=w.region.sites.find(s=>s.id!==w.siteId&&!irRouteBetween(w.siteId,s.id));
      if(!target) return null;
      const wasKnown=(w.known||[]).includes(target.id);
      if(!wasKnown) { w.known=w.known||[]; w.known.push(target.id); render(); }
      return {id:target.id,addedToKnownForFixture:!wasKnown};
    }''')
    if no_route:
        target_id = no_route['id']
        page.wait_for_timeout(60)
        before = page.evaluate('''() => ({site:state.world.siteId,day:state.character.daysLived,known:JSON.stringify(state.world.known),visited:JSON.stringify(state.world.visited)})''')
        page.locator(f'#app .ir0772-regional-node[data-site="{target_id}"]').click()
        page.wait_for_timeout(100)
        after = page.evaluate('''() => ({site:state.world.siteId,day:state.character.daysLived,known:JSON.stringify(state.world.known),visited:JSON.stringify(state.world.visited),card:document.querySelector('#app .ir0772-inspect-card')?.innerText||'',travel:!!document.querySelector('#app .ir0772-inspect-card [data-action="travel"]')})''')
        unchanged = before['site']==after['site'] and before['day']==after['day'] and before['known']==after['known'] and before['visited']==after['visited']
        add('Selecting a known location only inspects it and does not advance time or travel', unchanged and 'No direct route' in after['card'] and not after['travel'], json.dumps({'target':no_route,'before':before,'after':after}, ensure_ascii=False))
    else:
        add('Selecting a known location only inspects it and does not advance time or travel', False, 'No known non-adjacent location was available in this generated seed.')

    direct = page.evaluate('''() => state.world.region.sites.find(s=>s.id!==state.world.siteId&&(state.world.known||[]).includes(s.id)&&!!irRouteBetween(state.world.siteId,s.id))?.id || null''')
    if direct:
        page.locator(f'#app .ir0772-regional-node[data-site="{direct}"]').click()
        page.wait_for_timeout(80)
        travel_button = page.locator('#app .ir0772-inspect-card [data-action="travel"]')
        card_has_travel = travel_button.count() == 1
        before_trip = page.evaluate('''() => ({site:state.world.siteId,days:state.character.daysLived,day:state.calendar?.day,travelCount:state.world.travelCount||0})''')
        if card_has_travel:
            travel_button.click()
            page.wait_for_timeout(120)
        modal_present = page.locator('#app [data-action="travel-confirm"]').count() > 0
        after_trip = page.evaluate('''() => ({site:state.world.siteId,days:state.character.daysLived,day:state.calendar?.day,travelCount:state.world.travelCount||0})''')
        add('Travel is a separate route-gated action and opens the existing travel preview', card_has_travel and modal_present and before_trip==after_trip, json.dumps({'direct':direct,'modal':modal_present,'before':before_trip,'after':after_trip}))
        if page.locator('#app [data-action="cancel-travel"]').count():
            page.locator('#app [data-action="cancel-travel"]').first.click(); page.wait_for_timeout(60)
    else:
        add('Travel is a separate route-gated action and opens the existing travel preview', False, 'No known direct route was available in this generated seed.')

    if page.locator('#app [data-action="ir0777-map-world"]').count():
        page.locator('#app [data-action="ir0777-map-world"]').click(); page.wait_for_timeout(80)
    add('Return control reopens the atlas', page.locator('#app .ir0772-atlas-frame').count() == 1)

    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(80)
    page.screenshot(path=str(SCREENSHOT_DIR / 'v0.7.7.9-regional-world-atlas-mobile.png'), full_page=False)
    mobile_atlas = page.evaluate('''() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,atlas:!!document.querySelector('#app .ir0772-atlas-frame'),open:!!document.querySelector('#app [data-action="ir0772-open-region"]')})''')
    add('Atlas remains usable at a phone viewport', mobile_atlas['atlas'] and mobile_atlas['open'] and mobile_atlas['scrollWidth'] <= mobile_atlas['width'] + 2, json.dumps(mobile_atlas))
    page.locator('#app [data-action="ir0772-open-region"]').click()
    page.wait_for_timeout(80)
    page.screenshot(path=str(SCREENSHOT_DIR / 'v0.7.7.9-regional-regional-map-mobile.png'), full_page=False)
    mobile_regional = page.evaluate('''() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,panel:!!document.querySelector('#app .ir0772-regional-panel'),markers:document.querySelectorAll('#app .ir0772-regional-node').length,return:!!document.querySelector('#app .ir0777-map-view-switcher [data-action="ir0777-map-world"]')})''')
    add('Regional chart and navigation remain usable at a phone viewport', mobile_regional['panel'] and mobile_regional['markers'] > 0 and mobile_regional['return'] and mobile_regional['scrollWidth'] <= mobile_regional['width'] + 2, json.dumps(mobile_regional))
    page.locator('#app [data-action="ir0777-map-world"]').click(); page.wait_for_timeout(60)
    page.locator('#app [data-action="ir0773-open-local"]').first.click(); page.wait_for_timeout(80)
    page.screenshot(path=str(SCREENSHOT_DIR / 'v0.7.7.9-regional-local-detail-mobile.png'), full_page=False)
    mobile_local = page.evaluate('''() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,panel:!!document.querySelector('#app .ir0773-local-panel'),routes:document.querySelectorAll('#app .ir0773-local-route').length,return:!!document.querySelector('#app .ir0777-map-view-switcher [data-action="ir0777-map-regional"]')})''')
    add('Local detail panel remains navigable at a phone viewport', mobile_local['panel'] and mobile_local['return'] and mobile_local['scrollWidth'] <= mobile_local['width'] + 2, json.dumps(mobile_local))
    page.locator('#app [data-action="ir0777-map-world"]').click()
    page.wait_for_timeout(50)

    # UI state does not add keys to the saved world or overwrite known/visited progress.
    save = page.evaluate('''() => ({worldKeys:Object.keys(state.world).sort(),known:JSON.stringify(state.world.known),visited:JSON.stringify(state.world.visited),scope:ir0772MapScope})''')
    add('Atlas/map navigation keeps map scope transient and leaves the world schema unchanged', save['scope']=='atlas' and 'worldMap' not in save['worldKeys'] and 'mapScope' not in save['worldKeys'], json.dumps(save))
    add('No uncaught browser errors', not errors, json.dumps(errors))
    browser.close()

report = {'suite':'Infinite Realms v0.7.7.9-regional browser smoke', 'total':len(results), 'passed':sum(r['status']=='PASS' for r in results), 'failed':sum(r['status']=='FAIL' for r in results), 'tests':results}
LOG_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2, ensure_ascii=False))
if report['failed']: raise SystemExit(1)
