"""Chromium integration tests for Infinite Realms v0.7.8.7 political map information.
The political records and regional assignments are temporary test fixtures added to an isolated
in-memory world. No generated save or accepted baseline is modified.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / 'dist' / 'infinite-realms.html'
LOG_PATH = ROOT / 'docs' / 'v0.7.8.7-political-map-browser-log.json'
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

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':1000}, device_scale_factor=1)
    page.set_default_timeout(7000)
    page.on('pageerror', lambda error: errors.append('pageerror: '+str(error)))
    page.on('console', lambda msg: errors.append('console error: '+msg.text) if msg.type=='error' else None)
    page.set_content(source, wait_until='load', timeout=60000)
    add('Standalone release title identifies v0.7.8.8', page.title()=='Infinite Realms — Version 0.7.8.8', page.title())
    if page.locator('#newName').count(): page.locator('#newName').fill('Political Map Tester')
    if page.locator('#worldSeed').count(): page.locator('#worldSeed').fill('IR-0787-POLITICAL-MAP-SEED')
    page.locator('#app [data-action="create"]').first.click(); wait(page,450)
    started=page.evaluate("typeof state !== 'undefined' && !!state?.world?.region?.sites?.length && !!state?.character")
    add('New game initializes before political map records are inspected', started, page.evaluate("state?.world?.seed+' / '+state?.world?.region?.sites?.length+' sites'") if started else 'new game failed')
    if started:
        initial=page.evaluate('''() => ({
          worldId:state.world.id, sites:state.world.region.sites, root:state.world.region,
          routeIds:JSON.stringify(state.world.region.routes.map(r=>r.geoId||r.id||[r.a,r.b])),
          siteRefs:JSON.stringify(state.world.region.sites.map(s=>({id:s.id,geoId:s.geoId,x:s.x,y:s.y,biomeId:s.biomeId,type:s.type}))),
          actualPolities:Array.isArray(state.world.polities)?state.world.polities.length:0,
          politicalValidation:irValidatePoliticalEntities(state.world), regionalValidation:irValidateRegionalHierarchy(state.world),
          geography:JSON.stringify({siteIds:state.world.region.sites.map(s=>[s.id,s.geoId]),routes:state.world.region.routes.map(r=>[r.geoId||r.id,r.a,r.b,r.from,r.to,r.distanceKm,r.terrain]),coords:state.world.region.sites.map(s=>[s.id,s.x,s.y,s.row,s.col,s.biomeId,s.biome,s.type])})
        })''')
        add('Fresh world generates a small validated political set after geographic generation', initial['actualPolities']>0 and initial['politicalValidation']['ok'] and initial['regionalValidation']['ok'], f"{initial['actualPolities']} polities; political errors={initial['politicalValidation']['errors']}; regional errors={initial['regionalValidation']['errors']}")
        seeds=page.evaluate('''() => {
          const snapshot=w=>JSON.stringify({sites:w.region.sites.map(s=>[s.id,s.geoId,s.x,s.y,s.row,s.col,s.biomeId,s.biome,s.type,s.routes]),routes:w.region.routes.map(r=>[r.geoId||r.id,r.a,r.b,r.from,r.to,r.distanceKm,r.terrain])});
          const rows=[];
          for(const seed of ['ALPHA-0787','BETA-0787','GAMMA-0787','IR-0787-POLITICAL-MAP-SEED','NORTH-MARCH-0787']) {
            const base=ir0786GenerateBase(seed,'settlement'), next=generateProceduralWorld(seed,'settlement');
            const capitalOk=next.polities.every(p=>!p.capitalSiteGeoId || (()=>{const hits=next.region.sites.filter(s=>s.geoId===p.capitalSiteGeoId);return hits.length===1&&hits[0].type==='settlement'&&p.regionIds.includes(hits[0].regionId)})());
            rows.push({seed,count:next.polities.length,physicalUnchanged:snapshot(base)===snapshot(next),politicalValid:irValidatePoliticalEntities(next).ok,regionalValid:irValidateRegionalHierarchy(next).ok,capitalOk,uniqueIds:new Set(next.polities.map(p=>p.id)).size===next.polities.length});
          }
          const a=generateProceduralWorld('EXACT-SAME-SEED','settlement'), b=generateProceduralWorld('EXACT-SAME-SEED','settlement');
          return {rows,sameSeedStable:JSON.stringify(a.polities)===JSON.stringify(b.polities)&&JSON.stringify(a.region.sites.map(s=>s.regionId))===JSON.stringify(b.region.sites.map(s=>s.regionId))};
        }''')
        add('Five seeds produce valid capitals, owners, and hierarchy without physical geography changes', all(r['count']>0 and r['physicalUnchanged'] and r['politicalValid'] and r['regionalValid'] and r['capitalOk'] and r['uniqueIds'] for r in seeds['rows']), json.dumps(seeds['rows'],ensure_ascii=False))
        add('Repeating an identical seed reproduces polity records and region assignments', seeds['sameSeedStable'], str(seeds['sameSeedStable']))
        persisted=page.evaluate('''() => {
          const beforePolities=JSON.stringify(state.world.polities), beforeAssignments=JSON.stringify(state.world.region.sites.map(s=>[s.geoId,s.regionId])), beforeCurrent=state.world.siteId;
          saveSlot(0); const saved=!!readSlots()[0]?.data;
          state.world.polities=[]; for(const s of state.world.region.sites)s.regionId=state.world.region.id;
          loadSlot(0);
          return {saved,politiesMatch:JSON.stringify(state.world.polities)===beforePolities,assignmentsMatch:JSON.stringify(state.world.region.sites.map(s=>[s.geoId,s.regionId]))===beforeAssignments,currentRestored:state.world.siteId===beforeCurrent,politicalValid:irValidatePoliticalEntities(state.world).ok,regionalValid:irValidateRegionalHierarchy(state.world).ok};
        }''')
        add('Save-slot reload preserves generated polity IDs and all regional assignments', persisted['saved'] and persisted['politiesMatch'] and persisted['assignmentsMatch'] and persisted['currentRestored'] and persisted['politicalValid'] and persisted['regionalValid'], json.dumps(persisted,ensure_ascii=False))
        # Capture actual generated political data before the synthetic owner/unclaimed fixture below.
        page.evaluate("state.view='World'; if(typeof ir0772MapScope !== 'undefined') ir0772MapScope='atlas'; render()")
        wait(page, 160)
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.7-generated-political-world.png'), full_page=True)
        fixture=page.evaluate('''() => {
          const w=state.world, root=w.region, sites=root.sites;
          if (!Array.isArray(root.subregions) || root.subregions.length < 3) return {ok:false,reason:'three existing nested regions are unavailable'};
          const settlements=sites.filter(s=>s && s.type==='settlement' && typeof s.geoId==='string');
          if (settlements.length<4) return {ok:false,reason:'not enough settlement records for capital fixture'};
          const capital=settlements[0];
          const routeNeighbors=sites.filter(s=>s!==capital && typeof irRouteBetween==='function' && !!irRouteBetween(capital.id,s.id));
          if (routeNeighbors.length<2) return {ok:false,reason:'not enough existing direct route neighbors'};
          const ownedNeighbor=routeNeighbors[0], unclaimedNeighbor=routeNeighbors[1];
          const extra=sites.find(s=>s!==capital && s!==ownedNeighbor && s!==unclaimedNeighbor && s.type==='settlement' && s!==settlements[settlements.length-1]) || sites.find(s=>s!==capital && s!==ownedNeighbor && s!==unclaimedNeighbor);
          const hiddenCapital=settlements.slice().reverse().find(s=>s!==capital && s!==ownedNeighbor && s!==unclaimedNeighbor && s!==extra);
          if (!extra || !hiddenCapital) return {ok:false,reason:'could not select distinct test sites'};
          const [r1,r2,r3]=root.subregions;
          for (const region of irGetGeographicRegions(w)) { region.ownerPolityId=null; region.governingPolityId=null; delete region.territorialStatus; delete region.ownershipStatus; delete region.politicalStatus; delete region.unclaimed; }
          root.ownerPolityId=null; root.governingPolityId=null;
          r1.name='Crownmarch'; r1.ownerPolityId=null; r1.governingPolityId=null; r1.territorialStatus=null;
          r2.name='Glass Coast'; r2.ownerPolityId=null; r2.governingPolityId=null; r2.territorialStatus=null;
          r3.name='Unclaimed Reach'; r3.ownerPolityId=null; r3.governingPolityId=null; r3.territorialStatus='unclaimed';
          const fixtures=[capital,ownedNeighbor,unclaimedNeighbor,extra,hiddenCapital];
          for (const s of fixtures) { delete s.ownerPolityId; s.regionId=root.id; }
          capital.regionId=r1.id; ownedNeighbor.regionId=r2.id; unclaimedNeighbor.regionId=r3.id; hiddenCapital.regionId=r2.id; extra.regionId=root.id;
          for (const s of [capital,ownedNeighbor,unclaimedNeighbor,extra]) s.visits=1;
          hiddenCapital.visits=0; hiddenCapital.discovered=false;
          w.siteId=capital.id; w.known=[...new Set([...(Array.isArray(w.known)?w.known:[]),...fixtures.map(s=>s.id)])];
          w.visited=[...new Set([...(Array.isArray(w.visited)?w.visited:[]),capital.id,ownedNeighbor.id,unclaimedNeighbor.id,extra.id])];
          const p1=irCreatePoliticalEntityRecord(w,{id:'polity:fixture:crownmarch',stableKey:'fixture-crownmarch',name:'Crownmarch Kingdom',type:'kingdom',regionIds:[r1.id],capitalSiteGeoId:capital.geoId,governmentType:'monarchy',governmentDescription:'A hereditary crown'});
          const p2=irCreatePoliticalEntityRecord(w,{id:'polity:fixture:glass-coast',stableKey:'fixture-glass-coast',name:'Glass Coast Council',type:'city-state',regionIds:[r2.id],capitalSiteGeoId:hiddenCapital.geoId});
          const p3=irCreatePoliticalEntityRecord(w,{id:'polity:fixture:site-hold',stableKey:'fixture-site-hold',name:'Old Hollow Wardens',type:'tribal-territory'});
          r1.ownerPolityId=p1.id; r1.governingPolityId=p1.id;
          r2.ownerPolityId=p2.id; r2.governingPolityId=p2.id;
          extra.ownerPolityId=p3.id; // site-level political association; root region itself stays unassigned.
          w.polities=[p1,p2,p3];
          irEnsureRegionalHierarchy(w);
          state.view='World'; ir0772MapScope='atlas'; ir0772SelectedGeoId=capital.geoId; ir0772SelectedFromIntel=false;
          render();
          return {ok:true, sites:{capital:capital.id,owned:ownedNeighbor.id,unclaimed:unclaimedNeighbor.id,siteOnly:extra.id,hiddenCapital:hiddenCapital.id},geoIds:{capital:capital.geoId,hiddenCapital:hiddenCapital.geoId},directNeighborCount:routeNeighbors.length,polityCount:w.polities.length,regionCount:irGetGeographicRegions(w).length,routeCount:root.routes.length};
        }''')
        add('Temporary test fixture contains owned, site-owned, unclaimed, and unknown regions', fixture.get('ok',False), json.dumps(fixture,ensure_ascii=False))
        if fixture.get('ok'):
            routeGeo=page.evaluate('''() => ({routeIds:JSON.stringify(state.world.region.routes.map(r=>r.id)),geoIds:JSON.stringify(state.world.region.sites.map(s=>s.geoId)),coordinates:JSON.stringify(state.world.region.sites.map(s=>[s.id,s.x,s.y]))})''')
            # The display is an index because no geographic boundary polygons exist in this build.
            panel=page.locator('#app .ir0787-political-panel').first
            text=panel.inner_text() if panel.count() else ''
            add('World atlas shows known political entities and their types', panel.count()==1 and 'Crownmarch Kingdom' in text and 'Glass Coast Council' in text and 'Old Hollow Wardens' in text and 'Kingdom' in text and 'City-state' in text, text[:1000])
            add('Known capital is marked while an undiscovered capital name stays hidden', 'Capital · '+page.evaluate('(id)=>state.world.region.sites.find(s=>s.geoId===id)?.name',fixture['geoIds']['capital']) in text and 'Capital recorded · location not yet charted' in text and page.evaluate('(id)=>state.world.region.sites.find(s=>s.geoId===id)?.name',fixture['geoIds']['hiddenCapital']) not in text, 'Known capital label present; undiscovered capital name absent')
            add('Explicit unclaimed region and unknown ownership are visually distinct', 'Unclaimed Reach' in text and 'Confirmed unclaimed' in text and 'Ownership unknown' in text, 'Unknown is not treated as unclaimed')
            add('Atlas explains missing political boundary geometry instead of drawing invented borders', 'no political lines are inferred' in text.lower() and page.locator('#app .ir0787-political-boundary').count()==0, 'Boundary note present; no synthetic boundary paths')
            add('Political summary is informational and has no travel/action buttons', panel.locator('button,[data-action]').count()==0, f"interactive controls in political panel={panel.locator('button,[data-action]').count()}")
            page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.7-world-political-index.png'),full_page=True)
            # Open regional view using the existing control and inspect an owned location.
            page.locator('#app [data-action="ir0777-map-regional"]').first.click(); wait(page)
            owned=fixture['sites']['owned']
            page.locator(f'#app .ir0773-map-node[data-site="{owned}"]').click(); wait(page)
            regional_text=page.locator('#app .ir0787-location-political-panel').inner_text()
            add('Regional selection shows the selected location’s political owner', 'Glass Coast Council' in regional_text and 'Geographic region' in regional_text, regional_text[:700])
            add('Capital marker appears only on the discovered capital marker', page.locator(f'#app .ir0773-map-node[data-site="{fixture["sites"]["capital"]}"] .ir0787-map-capital').count()==1 and page.locator(f'#app .ir0773-map-node[data-site="{fixture["sites"]["hiddenCapital"]}"] .ir0787-map-capital').count()==0, 'One visited capital badge; no hidden-capital badge')
            # Selecting the explicit unclaimed area is inspection only, not travel.
            before=page.evaluate('''() => ({siteId:state.world.siteId,age:state.character.ageMonths,energy:state.character.energy,travelCount:state.world.travelCount,routeIds:JSON.stringify(state.world.region.routes.map(r=>r.id))})''')
            unclaimed=fixture['sites']['unclaimed']
            page.locator(f'#app .ir0773-map-node[data-site="{unclaimed}"]').click(); wait(page)
            unclaimed_text=page.locator('#app .ir0787-location-political-panel').inner_text()
            after_select=page.evaluate('''() => ({siteId:state.world.siteId,age:state.character.ageMonths,energy:state.character.energy,travelCount:state.world.travelCount,routeIds:JSON.stringify(state.world.region.routes.map(r=>r.id))})''')
            add('Selecting a marker shows confirmed unclaimed status without starting travel', 'Confirmed unclaimed territory' in unclaimed_text and before==after_select, json.dumps({'politicalText':unclaimed_text,'before':before,'after':after_select},ensure_ascii=False))
            # A location whose region has no owner is not falsely labelled unclaimed.
            unknown=fixture['sites']['siteOnly']
            page.locator(f'#app .ir0773-map-node[data-site="{unknown}"]').click(); wait(page)
            unknown_text=page.locator('#app .ir0787-location-political-panel').inner_text()
            add('Site-level political link does not imply regional ownership', 'Old Hollow Wardens' in unknown_text and 'Geographic region' in unknown_text and 'Ownership unknown' in page.locator('#app .ir0787-political-panel').inner_text(), unknown_text[:700])
            # Selecting/reading a political card is informational and must not consume time or movement.
            before_card=page.evaluate('''() => ({siteId:state.world.siteId,age:state.character.ageMonths,energy:state.character.energy,travelCount:state.world.travelCount})''')
            page.locator('#app .ir0787-political-panel').last.click(position={'x':15,'y':15}); wait(page,60)
            after_card=page.evaluate('''() => ({siteId:state.world.siteId,age:state.character.ageMonths,energy:state.character.energy,travelCount:state.world.travelCount})''')
            add('Political information panel selection does not initiate travel or advance time', before_card==after_card, json.dumps({'before':before_card,'after':after_card}))
            # Physical geography invariants hold through all UI interactions.
            after_geo=page.evaluate('''() => ({routeIds:JSON.stringify(state.world.region.routes.map(r=>r.id)),geoIds:JSON.stringify(state.world.region.sites.map(s=>s.geoId)),coordinates:JSON.stringify(state.world.region.sites.map(s=>[s.id,s.x,s.y]))})''')
            add('Political UI leaves site IDs, marker coordinates, and route IDs unchanged', routeGeo==after_geo, 'Geographic IDs, coordinates and route IDs unchanged by the UI')
            # Verify a normal direct travel control still executes the existing travel action.
            page.locator(f'#app .ir0773-map-node[data-site="{owned}"]').click(); wait(page)
            travel_btn=page.locator('#app .ir0787-location-political-panel button[data-action="travel"]')
            if not travel_btn.count(): travel_btn=page.locator('#app .ir0773-inspect-card button[data-action="travel"]')
            # This selection is a direct route fixture, so the existing inspection card should offer travel.
            before_travel=page.evaluate('''() => ({siteId:state.world.siteId,count:Number(state.world.travelCount)||0})''')
            can_travel=travel_btn.count()>0
            if can_travel:
                travel_btn.first.click(); wait(page,200)
                # Existing travel controls intentionally open the normal preview first. Confirm
                # through the established action so this verifies the real user interaction flow.
                confirm=page.locator('#app [data-action="travel-confirm"][data-site="'+owned+'"]')
                if confirm.count() and confirm.is_enabled(): confirm.click(); wait(page,600)
            after_travel=page.evaluate('''() => ({siteId:state.world.siteId,count:Number(state.world.travelCount)||0,modal:modal?.kind||null})''')
            add('Existing travel preview and confirmation remain functional after political inspection', can_travel and after_travel['siteId']==owned and after_travel['count']>before_travel['count'] and after_travel['modal'] is None, json.dumps({'before':before_travel,'after':after_travel,'travelButton':can_travel}))
            page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.7-regional-political-details.png'),full_page=True)
            # Check responsive political panel at a narrow viewport.
            page.set_viewport_size({'width':390,'height':844}); wait(page)
            # The map is already open; avoid clicking the hidden desktop-nav duplicate at mobile width.
            wait(page)
            scroll_width=page.evaluate('document.documentElement.scrollWidth')
            add('Political information stays within mobile viewport width', scroll_width<=390, f'document scrollWidth={scroll_width}')
            page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.7-world-political-index-mobile.png'),full_page=True)
    add('No uncaught browser or console errors', not errors, json.dumps(errors,ensure_ascii=False))
    browser.close()
summary={'suite':'Infinite Realms v0.7.8.7 Political Map Integration browser','total':len(results),'passed':sum(r['status']=='PASS' for r in results),'failed':sum(r['status']=='FAIL' for r in results),'results':results,'browser_errors':errors}
LOG_PATH.parent.mkdir(parents=True,exist_ok=True)
LOG_PATH.write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('\nSUMMARY',summary['passed'],'/',summary['total'],'passed;',summary['failed'],'failed')
if summary['failed']: raise SystemExit(1)
