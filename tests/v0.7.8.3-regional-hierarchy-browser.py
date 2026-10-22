"""Chromium integration checks for Infinite Realms v0.7.8.7 regional hierarchy."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'dist' / 'infinite-realms.html'
LOG = ROOT / 'docs' / 'v0.7.8.7-regional-hierarchy-browser-log.json'
SCREENSHOTS = ROOT / 'docs' / 'screenshots'
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


def storage_shim():
    initial = json.dumps({}, ensure_ascii=False)
    return """<script>(function(){const initial=%s;const store=new Map(Object.entries(initial));const shim={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear(),key:i=>Array.from(store.keys())[i]||null,get length(){return store.size}};Object.defineProperty(window,'localStorage',{configurable:true,value:shim});window.__irTestStore=store;})();</script>""" % initial


def with_storage(html):
    if '<body>' not in html:
        raise RuntimeError('Standalone HTML has no body tag')
    return html.replace('<body>', '<body>' + storage_shim(), 1)


results = []
browser_errors = []
defect = None
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: browser_errors.append('pageerror: ' + str(error)))
    page.on('console', lambda msg: browser_errors.append('console error: ' + msg.text) if msg.type == 'error' else None)
    page.set_content(with_storage(HTML.read_text(encoding='utf-8')), wait_until='load', timeout=60000)
    page.wait_for_timeout(100)
    results = page.evaluate(r'''() => {
      const tests=[];
      const check=(name,pass,detail='')=>tests.push({name,status:pass?'PASS':'FAIL',detail:String(detail||'')});
      const safe=(name,fn)=>{try{const result=fn();if(result&&typeof result==='object'&&Object.prototype.hasOwnProperty.call(result,'pass'))check(name,!!result.pass,result.detail||'');else check(name,!!result,result===false?'returned false':(result&&result.detail)||'');}catch(error){check(name,false,error?.stack||String(error));}};
      check('Standalone title identifies v0.7.8.8', document.title==='Infinite Realms — Version 0.7.8.8', document.title);
      createSeed='REGIONAL-HIERARCHY-BROWSER'; createStart='settlement';
      state=makeInitial('Regional Surveyor','human','village');
      state.view='World'; render();
      const w=state.world;
      safe('Fresh game has stable primary region, generated child regions and validated political data',()=>w.region.id===`region:${w.id}:primary`&&Array.isArray(w.region.subregions)&&w.region.subregions.length===3&&Array.isArray(w.polities)&&w.polities.length===3&&w.region.sites.length===49&&w.region.sites.every(s=>irGetGeographicRegions(w).filter(r=>r.id===s.regionId).length===1));
      safe('Full geographic hierarchy validator passes for generated world',()=>irValidateRegionalHierarchy(w).ok&&irValidateGeographicHierarchy(w).ok);
      const rootId=w.region.id;
      const routesBefore=JSON.stringify(w.region.routes);
      const siteIdsBefore=JSON.stringify(w.region.sites.map(s=>[s.id,s.geoId]));
      const kingdom=irCreatePoliticalEntityRecord(w,{stableKey:'browser-kingdom',name:'Browser Kingdom',type:'kingdom',regionIds:[rootId]});
      const empire=irCreatePoliticalEntityRecord(w,{stableKey:'browser-empire',name:'Browser Empire',type:'empire',regionIds:[rootId]});
      w.polities.push(kingdom,empire);
      const childResult=irAddGeographicSubregion(w,rootId,{stableKey:'browser-river-valley',name:'River Valley',ownerPolityId:kingdom.id,governingPolityId:empire.id});
      const child=childResult.region;
      safe('Subregion uses stable ID and explicit parent while political owner/governor remain separate',()=>childResult.ok&&child.id===irGeoRegionId(w.id,'browser-river-valley')&&child.parentRegionId===rootId&&child.ownerPolityId===kingdom.id&&child.governingPolityId===empire.id&&child.ownerPolityId!==child.governingPolityId);
      safe('Region index and political foundation recognize generated and added nested regions',()=>irGetGeographicRegions(w).some(r=>r.id===child.id)&&w.geography.regionIds.includes(child.id)&&irValidatePoliticalEntities(w).ok&&irValidateRegionalHierarchy(w).ok);
      const selected=w.region.sites.find(site=>site.type==='settlement');
      const assign=irAssignLocationRegion(w,selected.geoId,child.id);
      const located=irResolveLocationRegion(w,selected.geoId);
      safe('Settlement resolves to its assigned geographic region',()=>assign.ok&&selected.regionId===child.id&&located.ok&&located.region.id===child.id&&located.regionId===child.id);
      safe('Regional assignment does not duplicate or modify route records or location IDs',()=>w.region.sites.length===49&&JSON.stringify(w.region.routes)===routesBefore&&JSON.stringify(w.region.sites.map(s=>[s.id,s.geoId]))===siteIdsBefore);
      const unclaimed=irAddGeographicSubregion(w,rootId,{stableKey:'browser-unclaimed-wood',name:'Unclaimed Wood'});
      const secondSite=w.region.sites.find(site=>site.geoId!==selected.geoId);
      const assignedUnclaimed=irAssignLocationRegion(w,secondSite.geoId,unclaimed.region.id);
      const unclaimedResolution=irResolveLocationRegion(w,secondSite.geoId);
      safe('Unclaimed region works with null ownership and still resolves its location',()=>unclaimed.ok&&assignedUnclaimed.ok&&unclaimed.region.ownerPolityId===null&&unclaimed.region.governingPolityId===null&&unclaimedResolution.ok&&unclaimedResolution.region.id===unclaimed.region.id);
      const savedPolitical=child.ownerPolityId;
      child.ownerPolityId='polity:does-not-exist';
      const resolveWithoutOwner=irResolveLocationRegion(w,selected.geoId);
      const badPolitical=irValidateRegionalHierarchy(w);
      safe('Geographic resolution remains available even when political reference is invalid',()=>resolveWithoutOwner.ok&&resolveWithoutOwner.region.id===child.id&&!badPolitical.ok&&badPolitical.errors.some(e=>e.includes('ownerPolityId')));
      child.ownerPolityId=savedPolitical;
      selected.regionId='region:unresolved-browser';
      const unresolved=irResolveLocationRegion(w,selected.geoId);
      const unresolvedReport=irValidateRegionalHierarchy(w);
      safe('Explicit unresolved location reference is reported without guessing a replacement',()=>!unresolved.ok&&unresolved.status==='unresolved-region-reference'&&!unresolvedReport.ok&&unresolvedReport.errors.some(e=>e.includes('unresolved/ambiguous regionId')));
      const repaired=irAssignLocationRegion(w,selected.geoId,child.id);
      safe('Location assignment helper can repair an unresolved region reference',()=>repaired.ok&&irResolveLocationRegion(w,selected.geoId).region.id===child.id);
      const worldRenderBefore=JSON.stringify({routes:w.region.routes,sites:w.region.sites,regionIds:w.geography.regionIds,tree:w.region.subregions});
      const model=ir0772WorldMapModel(w);
      const atlas=ir0772RenderWorldAtlas(w);
      const regional=ir0772RenderRegionalMap(model);
      const local=ir0773RenderLocalView(model);
      const worldRenderAfter=JSON.stringify({routes:w.region.routes,sites:w.region.sites,regionIds:w.geography.regionIds,tree:w.region.subregions});
      safe('World, regional, and local renderers keep geography and routes unchanged',()=>!!atlas.includes('Atlas of Known Lands')&&!!regional.length&&!!local.length&&worldRenderBefore===worldRenderAfter);
      safe('UI still renders World view after nested regional data is present',()=>state.view==='World'&&document.querySelector('#app')?.innerText.includes('Atlas of Known Lands'));
      const once=normalizeSave(JSON.parse(JSON.stringify(state)));
      const twice=normalizeSave(JSON.parse(JSON.stringify(once)));
      const roundSite=twice.world.region.sites.find(s=>s.geoId===selected.geoId);
      const roundUnclaimedSite=twice.world.region.sites.find(s=>s.geoId===secondSite.geoId);
      const roundChild=twice.world.region.subregions.find(r=>r.id===child.id);
      const roundRegional=irValidateRegionalHierarchy(twice.world), roundPolitical=irValidatePoliticalEntities(twice.world);
      safe('Save normalization roundtrip preserves hierarchy, regional assignments, and politics',()=>({pass:twice.world.region.subregions.some(r=>r.id===child.id)&&twice.world.region.subregions.some(r=>r.id===unclaimed.region.id)&&roundSite?.regionId===child.id&&roundUnclaimedSite?.regionId===unclaimed.region.id&&roundChild?.ownerPolityId===kingdom.id&&JSON.stringify(twice.world.region.routes)===routesBefore&&roundRegional.ok&&roundPolitical.ok,detail:JSON.stringify({subregions:twice.world.region.subregions.map(r=>({id:r.id,parentRegionId:r.parentRegionId,owner:r.ownerPolityId,governor:r.governingPolityId})),siteRegion:roundSite?.regionId,expectedChild:child.id,unclaimedSiteRegion:roundUnclaimedSite?.regionId,expectedUnclaimed:unclaimed.region.id,routesSame:JSON.stringify(twice.world.region.routes)===routesBefore,regional:roundRegional,political:roundPolitical})}));
      const dup=JSON.parse(JSON.stringify(w)); dup.region.subregions.push({...dup.region.subregions[0],name:'Duplicate ID',parentRegionId:dup.region.id});
      safe('Duplicate region IDs are rejected by the validator',()=>!irValidateRegionalHierarchy(dup).ok&&irValidateRegionalHierarchy(dup).errors.some(e=>e.includes('Duplicate geographic region ID')));
      state.view='World'; render();
      return tests;
    }''')
    page.screenshot(path=str(SCREENSHOTS / 'v0.7.8.7-regional-hierarchy-world-map.png'), full_page=True)
    # A second screen capture documents the regional view entry while using actual current game UI.
    try:
        page.locator('[data-action="ir0772-open-region"]').first.click(timeout=3000)
        page.wait_for_timeout(50)
        page.screenshot(path=str(SCREENSHOTS / 'v0.7.8.7-regional-hierarchy-regional-map.png'), full_page=True)
    except Exception:
        # The first screenshot is still evidence; the navigation test results remain explicit.
        pass
    browser.close()

summary = {
    'suite': 'v0.7.8.7 Regional Hierarchy browser integration',
    'total': len(results),
    'passed': sum(1 for row in results if row['status'] == 'PASS'),
    'failed': sum(1 for row in results if row['status'] == 'FAIL'),
    'browserErrors': browser_errors,
    'tests': results,
}
LOG.write_text(json.dumps(summary, indent=2), encoding='utf-8')
for row in results:
    print(f"{row['status']}: {row['name']}" + (f" — {row['detail']}" if row['detail'] else ''), flush=True)
print(json.dumps({'total': summary['total'], 'passed': summary['passed'], 'failed': summary['failed'], 'browserErrors': browser_errors}, indent=2), flush=True)
if summary['failed'] or browser_errors:
    raise SystemExit(1)
