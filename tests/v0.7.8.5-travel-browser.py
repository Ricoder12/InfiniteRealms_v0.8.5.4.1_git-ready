"""Chromium browser validation for Infinite Realms v0.7.8.5 travel integration."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / 'dist' / 'infinite-realms.html'
LOG_PATH = ROOT / 'docs' / 'v0.7.8.5-travel-browser-regression.json'
SCREENSHOT_DIR = ROOT / 'docs' / 'screenshots'
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
source = HTML_PATH.read_text(encoding='utf-8')
storage_shim = '''<script>(function(){const store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()}});window.__irTestStore=store;})();</script>'''
source = source.replace('<body>', '<body>' + storage_shim, 1)
results, errors = [], []
def add(name, passed, detail=''):
    row={'test':name,'status':'PASS' if passed else 'FAIL','detail':detail}
    results.append(row)
    print(row['status'] + ': ' + name, detail, flush=True)
def wait(page, ms=80): page.wait_for_timeout(ms)
def create_game(page):
    if page.locator('#newName').count(): page.locator('#newName').fill('Route Integration Tester')
    if page.locator('#worldSeed').count(): page.locator('#worldSeed').fill('IR-0775-BROWSER-ROUTE-SEED')
    create=page.locator('#app [data-action="create"]').first
    if not create.count(): return False
    create.click(); wait(page,220)
    return page.evaluate("typeof state !== 'undefined' && !!state?.world?.region?.sites?.length")

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':1000}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: errors.append('console error: '+msg.text) if msg.type=='error' else None)
    page.set_content(source, wait_until='load', timeout=60000)
    boot=page.title()=='Infinite Realms — Version 0.7.8.5' and page.evaluate("typeof ir0775Connection==='function' && typeof ir0775ConnectionsFrom==='function'")
    add('Standalone build boot and travel module loaded',boot,page.title())
    started=create_game(page)
    graph=page.evaluate('''() => {const w=state?.world,r=w?.region;return {siteCount:r?.sites?.length,globalEdges:r?.routes?.length,localRecords:r?.sites?.reduce((n,s)=>n+(s.routes?.length||0),0),connections:typeof ir0775ConnectionsFrom==='function'?ir0775ConnectionsFrom(w.siteId).length:0};}''') if started else {}
    add('Start a deterministic game with the existing canonical connection graph',started and graph.get('siteCount')==49 and graph.get('globalEdges')>0 and graph.get('localRecords')>0 and graph.get('connections')>0,json.dumps(graph))
    chrome_version=page.locator('#app .topbar').inner_text() if started and page.locator('#app .topbar').count() else ''
    add('Visible game chrome carries v0.7.8.5 map-and-travel metadata',started and 'VERSION 0.7.8.5 · MAPS, CHARACTER & SAVE INTEGRITY' in chrome_version,chrome_version[:240])
    if started:
        # Deterministic chance control keeps random encounters from interrupting the positive path tests.
        page.evaluate('Math.random=()=>0.999')
        direct=page.evaluate('''() => {
          const w=state.world,from=w.region.sites.find(s=>s.id===w.siteId),route=ir0775ConnectionsFrom(from.id)[0];if(!route)return {ok:false,why:'no direct canonical edge'};
          const target=w.region.sites.find(s=>s.id===route.to);w.visited=(w.visited||[]).filter(id=>id!==target.id);target.visits=0;target.discovered=false;w.known=w.known||[];if(!w.known.includes(target.id))w.known.push(target.id);
          state.character.energy=100;state.character.hunger=100;state.character.coin=10000;state.pendingEvent=null;state.combat=state.combat||{active:false};state.combat.active=false;
          const q=ir051TravelQuote(target.id,'foot');travel(target.id,'foot');render();
          const text=document.querySelector('#app .overlay[role="dialog"]')?.innerText||document.querySelector('#app .overlay')?.innerText||'';
          return {ok:!!q.ok,id:target.id,name:target.name,days:q.days,energy:q.energy,distance:q.route?.distanceKm,from:from.id,modal:modal?.kind||null,hasMaskedName:!text.includes(target.name),hasUnknownRisk:text.includes('Encounter risk unknown')&&text.includes('Unknown until surveyed'),hasEstimate:text.includes(`${q.days} day(s)`)&&text.includes(`${q.route.distanceKm} km`),hasHazardVarianceNote:text.includes('Energy is the base travel cost'),text};
        }''')
        direct_ok=direct.get('ok') and direct.get('modal')=='travel-preview' and direct.get('hasMaskedName') and direct.get('hasUnknownRisk') and direct.get('hasEstimate') and direct.get('hasHazardVarianceNote')
        add('Direct preview uses a real edge and masks unsurveyed name and danger',bool(direct_ok),json.dumps({k:v for k,v in direct.items() if k!='text'},ensure_ascii=False))
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.5-route-direct-preview.png'),full_page=False)
        before=page.evaluate('''() => ({site:state.world.siteId,days:state.character.daysLived,energy:state.character.energy,coin:state.character.coin,quote:ir051TravelQuote(modal.site,modal.transport||'foot')})''')
        confirm=page.locator('#app [data-action="travel-confirm"]').first
        if confirm.count() and confirm.is_enabled(): confirm.click(); wait(page,260)
        else: wait(page,50)
        after=page.evaluate('''() => ({site:state.world.siteId,days:state.character.daysLived,energy:state.character.energy,coin:state.character.coin,visited:state.world.visited||[],travelCount:state.world.travelCount||0})''')
        direct_actual=after.get('site')==direct.get('id') and after.get('days')-before.get('days')==direct.get('days') and before.get('energy')-after.get('energy')==direct.get('energy') and direct.get('id') in after.get('visited',[])
        add('Confirming direct travel arrives and consumes the exact displayed time and energy',bool(direct_actual),json.dumps({'quote':{'days':direct.get('days'),'energy':direct.get('energy'),'distance':direct.get('distance')},'before':{k:before[k] for k in ['site','days','energy']},'after':after}))
        # Pick an actual multi-leg target with enough current energy, not a direct neighbor.
        multi=page.evaluate('''() => {
          const w=state.world,start=w.siteId,sites=w.region.sites;state.character.energy=100;state.character.hunger=100;state.character.coin=10000;state.pendingEvent=null;state.combat.active=false;
          const options=sites.map(s=>({s,p:ir071RoutePlan(s.id)})).filter(x=>x.p&&x.p.legs.length>=2&&!ir0775Connection(start,x.s.id)&&x.p.totalEnergy<=100).sort((a,b)=>a.p.legs.length-b.p.legs.length||a.p.totalDays-b.p.totalDays);
          if(!options.length)return {ok:false,why:'no multi-leg candidate'};
          const pick=options[0],hidden=pick.p.path.slice(1).map(id=>sites.find(s=>s.id===id));
          w.visited=(w.visited||[]).filter(id=>!hidden.some(s=>s.id===id));hidden.forEach(s=>{s.visits=0;s.discovered=false;w.known=w.known||[];if(!w.known.includes(s.id))w.known.push(s.id);});
          const plan=ir071RoutePlan(pick.s.id);travel(pick.s.id,'foot');render();const text=document.querySelector('#app .ir0775-route-modal')?.innerText||'';
          return {ok:modal?.kind==='travel-route-preview',target:pick.s.id,targetName:pick.s.name,path:plan.path,legs:plan.legs.length,totalDistance:plan.totalDistance,totalDays:plan.totalDays,totalEnergy:plan.totalEnergy,modal:modal?.kind,hasLegList:document.querySelectorAll('#app .ir0775-leg-list .ir0775-leg').length===plan.legs.length,hiddenNamesMasked:hidden.every(s=>!text.includes(s.name)),hasTerrainUnknown:text.includes('Terrain not surveyed')&&text.includes('Unknown until surveyed'),pathText:document.querySelector('#app .ir071-route-path')?.innerText||''};
        }''')
        multi_ok=multi.get('ok') and multi.get('legs',0)>=2 and multi.get('hasLegList') and multi.get('hiddenNamesMasked') and multi.get('hasTerrainUnknown')
        add('Multi-leg preview lists only verified graph legs and hides unsurveyed waypoints',bool(multi_ok),json.dumps({k:v for k,v in multi.items() if k not in ('targetName','pathText')},ensure_ascii=False))
        page.screenshot(path=str(SCREENSHOT_DIR/'v0.7.8.5-route-multileg-preview.png'),full_page=False)
        multi_before=page.evaluate('''() => ({site:state.world.siteId,days:state.character.daysLived,energy:state.character.energy,count:state.world.travelCount||0,plan:ir071RoutePlan(modal.site)})''')
        multi_button=page.locator('#app [data-action="travel-route-confirm"]').first
        if multi_button.count() and multi_button.is_enabled(): multi_button.click(); wait(page,400)
        else: wait(page,60)
        multi_after=page.evaluate('''() => ({site:state.world.siteId,days:state.character.daysLived,energy:state.character.energy,count:state.world.travelCount||0,visited:state.world.visited||[],modal:modal?.kind||null})''')
        multi_actual=multi_after.get('site')==multi.get('target') and multi_after.get('days')-multi_before.get('days')==multi.get('totalDays') and multi_before.get('energy')-multi_after.get('energy')==multi.get('totalEnergy') and multi_after.get('count')-multi_before.get('count')==multi.get('legs') and multi.get('target') in multi_after.get('visited',[])
        add('Executing the multi-leg preview follows its exact path and totals',bool(multi_actual),json.dumps({'planned':{k:multi.get(k) for k in ['target','legs','totalDistance','totalDays','totalEnergy']},'before':{k:multi_before[k] for k in ['site','days','energy','count']},'after':multi_after},ensure_ascii=False))
        # Save, disturb in-memory location, and load the same slot using the actual save pipeline.
        savecheck=page.evaluate('''() => {
          const id=state.world.siteId,count=state.world.travelCount||0;saveSlot(0);const saved=!!readSlots()[0]?.data;
          state.world.siteId=state.world.region.sites.find(s=>s.id!==id)?.id||id;loadSlot(0);
          return {saved,id,count,loadedSite:state.world.siteId,loadedCount:state.world.travelCount||0,connections:ir0775ConnectionsFrom(state.world.siteId).length};
        }''')
        add('Save-slot round trip restores arrived location and usable canonical connections',savecheck.get('loadedSite')==savecheck.get('id') and savecheck.get('loadedCount')==savecheck.get('count') and savecheck.get('connections')>0,json.dumps(savecheck))
        # Remove every canonical global edge incident to a target. A visible/known site must not be reachable.
        disconnected=page.evaluate('''() => {
          const w=state.world,current=w.siteId;const target=w.region.sites.find(s=>s.id!==current&&!ir0775Connection(current,s.id));if(!target)return {ok:false,why:'no non-neighbor candidate'};
          const beforeEdges=w.region.routes.length;w.region.routes=w.region.routes.filter(edge=>{const endpoints=ir0775ResolveEdge(edge,w.region);return !endpoints||!(endpoints.from.id===target.id||endpoints.to.id===target.id);});
          const site=target.id;w.known=w.known||[];if(!w.known.includes(site))w.known.push(site);const before=JSON.stringify(state);travel(site,'foot');const unchanged=JSON.stringify(state)===before;
          return {ok:true,target:site,path:ir071FindPath(current,site),direct:irRouteBetween(current,site),modal:modal?.kind||null,unchanged,beforeEdges,afterEdges:w.region.routes.length};
        }''')
        add('A disconnected but visible destination fails without time/resource/location mutation',disconnected.get('ok') and disconnected.get('path') is None and disconnected.get('direct') is None and disconnected.get('modal') is None and disconnected.get('unchanged'),json.dumps(disconnected))
        add('No uncaught browser or console errors',not errors,json.dumps(errors,ensure_ascii=False))
    else:
        add('Travel scenarios require successful character creation',False,'Creation failed; downstream scenarios skipped.')
        add('No uncaught browser or console errors',not errors,json.dumps(errors,ensure_ascii=False))
    browser.close()
report={'suite':'Infinite Realms v0.7.8.5 Travel Route Integration browser smoke','total':len(results),'passed':sum(r['status']=='PASS' for r in results),'failed':sum(r['status']=='FAIL' for r in results),'tests':results}
LOG_PATH.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2,ensure_ascii=False))
if report['failed']: raise SystemExit(1)
