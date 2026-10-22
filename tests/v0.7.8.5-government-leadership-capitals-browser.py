"""Chromium integration checks for descriptive governments, existing NPC leaders, and capitals."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'dist' / 'infinite-realms.html'
LOG = ROOT / 'docs' / 'v0.7.8.5-government-leadership-capitals-browser-log.json'
SCREENSHOTS = ROOT / 'docs' / 'screenshots'
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

def with_storage(html):
    shim = """<script>(function(){const store=new Map();const shim={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear(),key:i=>Array.from(store.keys())[i]||null,get length(){return store.size}};Object.defineProperty(window,'localStorage',{configurable:true,value:shim});window.__irTestStore=store;})();</script>"""
    if '<body>' not in html:
        raise RuntimeError('Standalone HTML has no body tag')
    return html.replace('<body>', '<body>' + shim, 1)

results, browser_errors = [], []
def add(name, passed, detail=''):
    results.append({'test': name, 'status': 'PASS' if passed else 'FAIL', 'detail': str(detail)})
    print(('PASS' if passed else 'FAIL') + ': ' + name + (': ' + str(detail) if detail else ''), flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: browser_errors.append('pageerror: ' + str(error)))
    page.on('console', lambda msg: browser_errors.append('console error: ' + msg.text) if msg.type == 'error' else None)
    page.set_content(with_storage(HTML.read_text(encoding='utf-8')), wait_until='load', timeout=60000)
    page.wait_for_timeout(100)
    results = page.evaluate(r'''() => {
      const tests=[];
      const check=(name,pass,detail='')=>tests.push({test:name,status:pass?'PASS':'FAIL',detail:String(detail||'')});
      const safe=(name,fn)=>{try{const value=fn();if(value&&typeof value==='object'&&Object.hasOwn(value,'pass'))check(name,!!value.pass,value.detail||'');else check(name,!!value,value&&value.detail||'');}catch(e){check(name,false,e?.stack||String(e));}};
      check('Runtime title identifies v0.7.8.5',document.title==='Infinite Realms — Version 0.7.8.5',document.title);
      createSeed='GOVERNMENT-CAPITAL-BROWSER';createStart='settlement';
      state=makeInitial('Court Archivist','human','village');state.view='World';render();
      const w=state.world,c=state.character;
      safe('Fresh world starts with an empty political registry and existing NPC records',()=>Array.isArray(w.polities)&&w.polities.length===0&&w.region.sites.length===49&&Array.isArray(c.npcs));
      const rootId=w.region.id;
      const capital=w.region.sites.find(s=>s.type==='settlement');
      const npcCountBefore=c.npcs.length;
      const polity=irCreatePoliticalEntityRecord(w,{stableKey:'browser-crown',name:'Crown of the Vale',type:'kingdom',regionIds:[rootId],capitalSiteGeoId:capital.geoId,governmentType:'monarchy',governmentDescription:'A hereditary crown advised by regional stewards.',leaderNpcId:'npc1',leaderTitle:'Queen'});
      w.polities.push(polity);w.region.ownerPolityId=polity.id;
      safe('Complete political record can reference an existing capital and NPC ID',()=>polity.capitalSiteGeoId===capital.geoId&&polity.leaderNpcId==='npc1'&&c.npcs.length===npcCountBefore);
      safe('Complete entity summary returns type, government, capital name and referenced leader name',()=>{const s=irGetPoliticalEntitySummary(state,polity.id);return s&&s.name==='Crown of the Vale'&&s.type==='kingdom'&&s.governmentLabel==='Monarchy'&&s.governmentDescription.includes('stewards')&&s.capital.name===capital.name&&s.leader.name===c.npcs.find(n=>n.id==='npc1').name&&s.leader.title==='Queen';});
      safe('Territory ownership and valid capital location pass political validator',()=>irValidatePoliticalEntities(w,state).ok&&irValidateRegionalHierarchy(w).ok);
      safe('No NPC record or geography copy was created for political leadership',()=>c.npcs.length===npcCountBefore&&w.region.sites.length===49&&w.region.routes.length>0&&!Object.hasOwn(polity,'leaderName')&&!Object.hasOwn(polity,'capital'));
      const partial=irCreatePoliticalEntityRecord(w,{stableKey:'browser-council',name:'Free Council',type:'city-state',regionIds:[rootId]});w.polities.push(partial);
      safe('Partial entity without government, ruler, title or capital remains valid',()=>{const s=irGetPoliticalEntitySummary(state,partial.id);return irValidatePoliticalEntities(w,state).ok&&s.capital===null&&s.governmentType===null&&s.governmentDescription===null&&s.leader===null&&s.leaderStatus==='unassigned';});
      safe('Controlled region count is reported only from explicit owner/governor assignments',()=>irGetPoliticalEntitySummary(state,polity.id).controlledRegionCount===1&&irGetPoliticalEntitySummary(state,partial.id).controlledRegionCount===null);
      const badGov=JSON.parse(JSON.stringify(w));badGov.polities.find(p=>p.id===polity.id).governmentType='crowned-by-comets';
      safe('Unsupported government type is reported',()=>!irValidatePoliticalEntities(badGov,state).ok&&irValidatePoliticalEntities(badGov,state).errors.some(e=>e.includes('unsupported governmentType')));
      const badLeader=JSON.parse(JSON.stringify(w));badLeader.polities.find(p=>p.id===polity.id).leaderNpcId='npc:missing';
      safe('Unresolved leader NPC ID is reported without creating an NPC',()=>!irValidatePoliticalEntities(badLeader,state).ok&&irValidatePoliticalEntities(badLeader,state).errors.some(e=>e.includes('unresolved-reference'))&&c.npcs.length===npcCountBefore);
      const outsideWorld=JSON.parse(JSON.stringify(w));
      const outsideCapital=outsideWorld.region.sites.find(s=>s.geoId===capital.geoId);
      const outsidePolity=irCreatePoliticalEntityRecord(outsideWorld,{stableKey:'browser-outside-capital',name:'Remote Territory Crown',type:'kingdom',regionIds:[outsideWorld.region.id],capitalSiteGeoId:outsideCapital.geoId});
      outsideWorld.polities.push(outsidePolity);
      const remoteRegion=irAddGeographicSubregion(outsideWorld,outsideWorld.region.id,{stableKey:'remote-political-territory',name:'Remote Political Territory',ownerPolityId:outsidePolity.id});
      safe('Capital outside known political territory is rejected',()=>remoteRegion.ok&&!irValidatePoliticalEntities(outsideWorld,state).ok&&irValidatePoliticalEntities(outsideWorld,state).errors.some(e=>e.includes('outside its explicitly referenced political territory')));
      const overlayWorld=JSON.parse(JSON.stringify(w));overlayWorld.v06={schema:2,changes:{'ir06_prior-official':{id:'ir06_prior-official',name:'Prior Official',occupation:'Official'}},journal:[]};
      safe('Existing location NPC can resolve through the v06 saved-person overlay',()=>irResolvePoliticalLeader(overlayWorld,'ir06_prior-official',{npcs:[]}).npc.name==='Prior Official');
      const sitesBefore=JSON.stringify(w.region.sites),routesBefore=JSON.stringify(w.region.routes),geoBefore=JSON.stringify(w.geography);
      irGetPoliticalEntitySummary(state,polity.id);
      safe('Summary lookup is read-only for sites, routes, and geography index',()=>JSON.stringify(w.region.sites)===sitesBefore&&JSON.stringify(w.region.routes)===routesBefore&&JSON.stringify(w.geography)===geoBefore);
      persist();saveSlot(0);
      const expected=JSON.parse(JSON.stringify(state.world.polities));
      state.world.polities=[];
      loadSlot(0);
      const reloaded=state.world.polities||[];
      const reloadedPolity=reloaded.find(p=>p.id===polity.id);
      const report=irValidatePoliticalEntities(state.world,state);
      safe('Actual save-slot round trip preserves government, capital, and leader references',()=>({pass:!!reloadedPolity&&reloadedPolity.governmentType==='monarchy'&&reloadedPolity.governmentDescription===expected.find(p=>p.id===polity.id).governmentDescription&&reloadedPolity.capitalSiteGeoId===capital.geoId&&reloadedPolity.leaderNpcId==='npc1'&&reloadedPolity.leaderTitle==='Queen'&&report.ok,detail:JSON.stringify({polities:reloaded.map(p=>({id:p.id,governmentType:p.governmentType,capitalSiteGeoId:p.capitalSiteGeoId,leaderNpcId:p.leaderNpcId})),report})}));
      safe('Leader resolves after actual save-slot reload',()=>irGetPoliticalEntitySummary(state,polity.id)?.leader?.name===state.character.npcs.find(n=>n.id==='npc1')?.name);
      const sitesAfterReload=state.world.region.sites.length,routeCountAfterReload=state.world.region.routes.length;
      safe('Load preserves canonical physical site/route counts without duplicates',()=>sitesAfterReload===49&&JSON.stringify(state.world.region.routes)===routesBefore,`sites=${sitesAfterReload}; routes=${routeCountAfterReload}; routeGraphPreserved=${JSON.stringify(state.world.region.routes)===routesBefore}`);
      state.view='World';render();
      return tests;
    }''')
    page.screenshot(path=str(SCREENSHOTS / 'v0.7.8.5-government-capitals-desktop.png'), full_page=False)
    browser.close()

summary={'suite':'v0.7.8.5 Government, Leadership and Capitals Chromium integration','total':len(results),'passed':sum(r['status']=='PASS' for r in results),'failed':sum(r['status']=='FAIL' for r in results),'browserErrors':browser_errors,'tests':results}
LOG.write_text(json.dumps(summary,indent=2),encoding='utf-8')
for row in results:
    print(f"{row['status']}: {row['test']}" + (f" — {row['detail']}" if row['detail'] else ''),flush=True)
print(json.dumps({'total':summary['total'],'passed':summary['passed'],'failed':summary['failed'],'browserErrors':browser_errors},indent=2),flush=True)
if summary['failed'] or browser_errors: raise SystemExit(1)
