'use strict';
// Regional-map accuracy tests. Run with: node tests/v0.7.7.3-regional-map.test.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = {
  console, Math, String, Array, Object, Map, Set, Number, JSON, RegExp, Date,
  clamp: (n,min,max)=>Math.max(min,Math.min(max,n)),
  esc: value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
  irSafeIcon: value => String(value || '✧'),
  irSettlementTitle: kind => ({hamlet:'Hamlet',village:'Village',remote:'Remote Settlement',town:'Town',city:'City'})[kind] || 'Settlement',
  irCurrentTransportDays: (km,transport) => Math.max(1,Math.ceil(Number(km||1)/(transport==='foot'?20:30))),
  pageHead: (title,desc) => `<header><h1>${title}</h1><p>${desc}</p></header>`,
  normalizeSave: input => input,
  toast: () => {}, render: () => { context.renderCount = (context.renderCount || 0) + 1; },
  renderCount: 0, testIntelSiteId: null,
  document: {title:''}
};
vm.createContext(context);
for (const relative of [
  'js/data/config.js','js/data/world.js','js/data/races.js','js/data/backgrounds.js',
  'js/data/skills.js','js/data/items.js','js/data/ui.js',
  'js/game/02-worldgen-v0.2.js','js/game/33-stable-geographic-identifiers-v0.7.5.2.js',
  'js/game/34-geographic-hierarchy-connections-v0.7.5.3.js','js/game/43-shared-map-data-v0.7.7.1.js'
]) vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
const world = context.generateProceduralWorld('WORLD-MAP-773-REGIONAL-TEST');
context.irEnsureGeographicHierarchy(world);
context.state = {world,character:{name:'Test Wayfarer',daysLived:0,coin:100,energy:100,maxEnergy:100},calendar:{day:1,month:1,year:102},view:'World',combat:{active:false}};
context.irSiteById = id => context.state?.world?.region?.sites?.find(s=>s.id===id)||null;
context.irRouteBetween = (a,b) => context.irSiteById(a)?.routes?.find(route=>route.to===b)||null;
context.mapPanel = function() {
  const sites=context.state.world.region.sites;
  return `<section class="panel panel-pad world-map-panel"><div class="world-map-v2">${sites.map(site=>{
    const classes=`world-node${site.id===context.state.world.siteId?' current':''}${site.id===context.testIntelSiteId?' intel-target':''}`;
    return `<button class="${classes}" style="left:${site.x}%;top:${site.y}%" data-action="travel" data-site="${site.id}" data-transport="foot" disabled title="Unexplored location"><span class="node-icon">?</span><span class="node-label">Uncharted</span></button>`;
  }).join('')}</div></section>`;
};
context.renderWorld=()=>'<header>A world generated for this life.</header>'+context.mapPanel();
context.runAction=()=>{context.baselineActionCalled=(context.baselineActionCalled||0)+1;};
for(const relative of ['js/game/44-world-map-v0.7.7.2.js','js/game/45-regional-map-v0.7.7.3.js'])
  vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});

const results=[];
function test(name,fn){try{results.push({name,status:fn()?'PASS':'FAIL'});}catch(error){results.push({name,status:'FAIL',detail:error?.stack||error.message});}}
const stable=()=>context.state.world;
const deep=value=>JSON.stringify(value);
const site=id=>stable().region.sites.find(item=>item.id===id);
const known=(s,w=stable())=>s===w.region.sites.find(item=>item.id===w.siteId)||(w.known||[]).includes(s.id)||(w.visited||[]).includes(s.id)||s.discovered===true||Number(s.visits)>0;
const markup=()=>context.ir0773RenderRegionalMap(context.ir0772WorldMapModel(stable()));
const setSelected=(id,intel=false)=>{context.testSelectionId=id;context.testSelectionIntel=intel;vm.runInContext('ir0772SelectedGeoId=testSelectionId;ir0772SelectedFromIntel=testSelectionIntel;',context);};
const outputWithWorld=(world,fn)=>{const prior=context.state.world;context.state.world=world;try{return fn();}finally{context.state.world=prior;}};

// Initialize selection to the actual current site for stable-render assertions.
setSelected(stable().region.sites.find(s=>s.id===stable().siteId).geoId,false);

test('Regional layer uses the existing region, site records, and canonical route registry without adding geography',()=>{
  const w=stable(),before=deep(w),m=context.ir0772WorldMapModel(w),html=markup();
  return m.region===w.region&&m.sites.length===w.region.sites.length&&m.sites.every((s,i)=>s===w.region.sites[i])&&m.routes.length===w.region.routes.length&&m.routes.every((r,i)=>r===w.region.routes[i])&&before===deep(w)&&!html.includes('worldMap')&&!html.includes('new-region')&&!html.includes('boundary-generated');
});
test('No invented river course, coast edge, ridgeline, or water-band markup is drawn',()=>{
  const html=markup();
  return !html.includes('ir05-river')&&!html.includes('ir05-map-water')&&!html.includes('ir05-map-ridges')&&!/d="M0 90 C120 140/.test(html)&&html.includes('Map-data limit')&&html.includes('not contain traced river courses');
});
test('Every drawn line resolves to a canonical connection with a matching existing travel route',()=>{
  const m=context.ir0772WorldMapModel(stable()),ids=context.ir0773IntelIds(m),expected=context.ir0773ResolvedVisibleEdges(m,ids).filter(record=>context.ir0773Coordinates(record.from)&&context.ir0773Coordinates(record.to)).length;
  const html=markup(),actual=(html.match(/class="[^"]*ir0773-route-line[^"]*"/g)||[]).length;
  return actual===expected&&actual>0&&html.includes('aria-label="Recorded connections only"');
});
test('A malformed global edge is not shown when its local travel records are absent',()=>{
  const copy=JSON.parse(JSON.stringify(stable()));
  const current=copy.region.sites.find(s=>s.id===copy.siteId),targetId=copy.known.find(id=>id!==copy.siteId&&current.routes.some(r=>r.to===id));
  if(!targetId)return false;
  const edge=copy.region.routes.find(e=>{const r=context.irGeoResolveGlobalRoute(copy.region,e);return r.resolved&&((r.from.id===current.id&&r.to.id===targetId)||(r.to.id===current.id&&r.from.id===targetId));});
  if(!edge)return false;
  current.routes=current.routes.filter(r=>r.to!==targetId);copy.region.sites.find(s=>s.id===targetId).routes=copy.region.sites.find(s=>s.id===targetId).routes.filter(r=>r.to!==current.id);
  return outputWithWorld(copy,()=>!markup().includes(`data-route="${edge.geoId||''}"`));
});

test('An undirected canonical edge is not drawn when the reciprocal local route record is missing',()=>{
  const copy=JSON.parse(JSON.stringify(stable())),current=copy.region.sites.find(s=>s.id===copy.siteId);
  const targetId=(copy.known||[]).find(id=>id!==copy.siteId&&current.routes.some(r=>r.to===id));
  if(!targetId)return false;
  const target=copy.region.sites.find(s=>s.id===targetId);
  const edge=copy.region.routes.find(e=>{const r=context.irGeoResolveGlobalRoute(copy.region,e);return !e.directed&&r?.resolved&&((r.from.id===current.id&&r.to.id===targetId)||(r.to.id===current.id&&r.from.id===targetId));});
  if(!edge)return true;
  target.routes=(target.routes||[]).filter(r=>r.to!==current.id);
  const html=outputWithWorld(copy,markup);
  const targetButton=(html.match(new RegExp(`<button class="[^"]*ir0772-regional-node[^"]*"[^>]*data-site="${targetId}"[^>]*>`))||[])[0]||'';
  return !html.includes(`data-route="${edge.geoId||''}"`)&&!targetButton.includes('direct-reachable');
});

test('Known current location is highlighted and remains selected; travel stays a separate control',()=>{
  const w=stable(),current=site(w.siteId);setSelected(current.geoId,false);const html=markup();
  const node=(html.match(/<button class="[^"]*ir0772-regional-node[^"]*current[^"]*"[^>]*>/)||[])[0]||'';
  return !!current&&node.includes(`data-site="${current.id}"`)&&node.includes('selected')&&html.includes('You are here now')&&!node.includes('data-action="travel"');
});
test('Selecting a directly connected known destination reports the real route distance and provides travel action',()=>{
  const w=stable(),cur=site(w.siteId),targetId=(w.known||[]).find(id=>id!==cur.id&&context.irRouteBetween(cur.id,id)),target=site(targetId);
  if(!target)return false;
  setSelected(target.geoId,false);
  const html=markup(),route=context.irRouteBetween(cur.id,target.id);
  return html.includes('data-action="travel"')&&html.includes(`${Number(route.distanceKm)} km`)&&html.includes('Travel here')&&html.includes('Current location');
});
test('Known but disconnected destination is inspectable without a false direct-travel button',()=>{
  const prior=stable(),copy=JSON.parse(JSON.stringify(prior)),cur=copy.region.sites.find(s=>s.id===copy.siteId);
  const target=copy.region.sites.find(s=>s.id!==cur.id&&!cur.routes.some(r=>r.to===s.id)&&!known(s,copy));
  if(!target)return false;
  copy.known=copy.known||[];if(!copy.known.includes(target.id))copy.known.push(target.id);
  setSelected(target.geoId,false);
  const html=outputWithWorld(copy,markup);
  return html.includes('No direct route from your current location')&&!html.includes(`data-action="travel" data-site="${target.id}"`)&&/<strong>Discovery:<\/strong> Known, not yet visited/.test(html);
});
test('Connection details list only visible neighbors and conceal unvisited proper names',()=>{
  const w=stable(),cur=site(w.siteId);setSelected(cur.geoId,false);
  const html=markup(),hidden=w.region.sites.filter(s=>!known(s,w));
  return html.includes('Recorded connections')&&(html.match(/class="ir0773-connection-row"/g)||[]).length>0&&hidden.every(s=>!html.includes(`data-site="${s.id}"`)&&!(s.name&&html.includes(s.name)));
});
test('Hidden site IDs, coordinates, and unique names never appear in the regional markup',()=>{
  const w=stable(),html=markup(),hidden=w.region.sites.filter(s=>!known(s,w));
  return hidden.length>0&&hidden.every(s=>!html.includes(`data-site="${s.id}"`)&&!(s.name&&html.includes(s.name))&&!(s.geoId&&html.includes(`data-geo-id="${s.geoId}"`))&&(!context.ir0773Coordinates(s)||!html.includes(`left:${Number(s.x)}%;top:${Number(s.y)}%`)));
});
test('Explicit intelligence may mark one reported lead but does not reveal its neighbors',()=>{
  const w=stable(),target=w.region.sites.find(s=>!known(s,w));if(!target)return false;
  context.testIntelSiteId=target.id;setSelected(target.geoId,true);
  const html=markup();
  const pass=html.includes(`data-site="${target.id}"`)&&html.includes('Reported lead')&&!html.includes('Reported lead area')&&/reported lead does not reveal neighboring routes/i.test(html);
  context.testIntelSiteId=null;setSelected(target.geoId,false);
  return pass;
});
test('Sites lacking coordinates remain available through a list and never default to 0,0',()=>{
  const copy=JSON.parse(JSON.stringify(stable()));
  const target=copy.region.sites.find(s=>known(s,copy)&&s.id!==copy.siteId);
  if(!target)return false;
  delete target.x;delete target.y;
  const html=outputWithWorld(copy,()=>{setSelected(copy.region.sites.find(s=>s.id===copy.siteId).geoId,false);return markup();});
  return html.includes('Known places without usable map coordinates')&&html.includes(`data-site="${target.id}"`)&&!html.includes('style="left:0%;top:0%"');
});
test('Optional continent, country, hierarchy and route arrays fail safely without invented geometry',()=>{
  const copy=JSON.parse(JSON.stringify(stable()));delete copy.continents;delete copy.countries;delete copy.geography;delete copy.region.routes;
  const m=context.ir0772WorldMapModel(copy);
  return !!m&&m.routes.length===0&&outputWithWorld(copy,()=>markup()).includes('REGIONAL TERRAIN CHART');
});
test('Switching atlas and regional layers preserves a still-known selected geoId without save mutation',()=>{
  const w=stable(),target=w.region.sites.find(s=>s.id!==w.siteId&&(w.known||[]).includes(s.id));if(!target)return false;
  setSelected(target.geoId,false);context.ir0772MapScope='regional';
  const before=deep(w);
  context.runAction({dataset:{action:'ir0772-return-atlas'}});
  context.runAction({dataset:{action:'ir0772-open-region'}});
  return vm.runInContext('ir0772MapScope',context)==='regional'&&vm.runInContext('ir0772SelectedGeoId',context)===target.geoId&&before===deep(w);
});
test('Route helper/travel time function remains the original implementation',()=>{
  const fn=context.irCurrentTransportDays;
  setSelected(site(stable().siteId).geoId,false);markup();
  return context.irCurrentTransportDays===fn;
});

test('Local detail view uses the actual current site, saved biome, and non-spatial disclaimer',()=>{
  const w=stable(),m=context.ir0772WorldMapModel(w),html=context.ir0773RenderLocalView(m),current=site(w.siteId);
  return html.includes('LOCAL DETAIL')&&html.includes('Local geometry is not recorded')&&html.includes('No houses, roads within settlements')&&html.includes(String(current.name||'Current location'))&&html.includes(String(m.biomes?.[current.biomeId]?.name||current.biome||'Terrain profile unavailable'));
});
test('Local detail view does not enumerate or expose undiscovered exits',()=>{
  const w=stable(),copy=JSON.parse(JSON.stringify(w)),current=copy.region.sites.find(s=>s.id===copy.siteId);
  const hidden=copy.region.sites.find(s=>s.id!==current.id&&!(copy.known||[]).includes(s.id)&&!(copy.visited||[]).includes(s.id)&&s.discovered!==true&&!(Number(s.visits)>0)&&current.routes.some(r=>r.to===s.id));
  if(!hidden)return true;
  const html=outputWithWorld(copy,()=>context.ir0773RenderLocalView(context.ir0772WorldMapModel(copy)));
  return !html.includes(`data-site="${hidden.id}"`)&&!(hidden.geoId&&html.includes(hidden.geoId))&&!(hidden.name&&html.includes(hidden.name));
});
test('Switching regional to local and back preserves a valid selected geoId and does not mutate the save',()=>{
  const w=stable(),target=w.region.sites.find(s=>s.id!==w.siteId&&(w.known||[]).includes(s.id));if(!target)return false;
  const before=deep(w);setSelected(target.geoId,false);context.ir0772MapScope='regional';
  context.runAction({dataset:{action:'ir0773-open-local'}});
  const localScope=vm.runInContext('ir0772MapScope',context),localHtml=context.ir0773RenderLocalView(context.ir0772WorldMapModel(w));
  context.runAction({dataset:{action:'ir0773-return-regional'}});
  return localScope==='local'&&localHtml.includes('RETAINED REGIONAL SELECTION')&&vm.runInContext('ir0772MapScope',context)==='regional'&&vm.runInContext('ir0772SelectedGeoId',context)===target.geoId&&before===deep(w);
});

test('An unvisited current site does not reveal its saved place name, type, risk, description, or services',()=>{
  const copy=JSON.parse(JSON.stringify(stable())),current=copy.region.sites.find(s=>s.id===copy.siteId);
  current.visits=0;current.discovered=false;copy.visited=(copy.visited||[]).filter(id=>id!==current.id);copy.known=(copy.known||[]).filter(id=>id!==current.id);
  const regional=outputWithWorld(copy,()=>{setSelected(current.geoId,false);return markup();});
  const local=outputWithWorld(copy,()=>context.ir0773RenderLocalView(context.ir0772WorldMapModel(copy)));
  return !regional.includes(`>${current.name}</span>`)&&local.includes('<h2>Current location</h2>')&&local.includes('Unsurveyed location')&&local.includes('Not surveyed')&&local.includes('Explore this location to reveal its recorded local services')&&!(current.name&&local.includes(current.name))&&!(current.desc&&local.includes(current.desc));
});

test('A site with missing optional local route/biome details produces a safe local panel',()=>{
  const copy=JSON.parse(JSON.stringify(stable())),current=copy.region.sites.find(s=>s.id===copy.siteId);delete current.routes;delete current.biomeId;delete current.biome;delete copy.biomes;
  const html=outputWithWorld(copy,()=>context.ir0773RenderLocalView(context.ir0772WorldMapModel(copy)));
  return html.includes('Local view')&&html.includes('CURRENT LOCATION')&&html.includes('Terrain profile unavailable')&&html.includes('Local geometry is not recorded');
});

test('Regional layer remains ordered before local layer, political metadata, and boot with current release title',()=>{
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const pos=name=>index.indexOf(name);
  return index.includes('Version 0.8.3.7')&&pos('44-world-map-v0.7.7.2.js')<pos('45-regional-map-v0.7.7.3.js')&&pos('45-regional-map-v0.7.7.3.js')<pos('46-local-map-v0.7.7.4.js')&&pos('46-local-map-v0.7.7.4.js')<pos('47-travel-route-integration-v0.7.7.5.js')&&pos('47-travel-route-integration-v0.7.7.5.js')<pos('52-political-entity-foundation-v0.7.8.2.js')&&pos('52-political-entity-foundation-v0.7.8.2.js')<pos('53-regional-hierarchy-v0.7.8.3.js')&&pos('53-regional-hierarchy-v0.7.8.3.js')<pos('54-government-leadership-capitals-v0.7.8.5.js')&&pos('54-government-leadership-capitals-v0.7.8.5.js')<pos('55-world-political-generation-v0.7.8.6.js')&&pos('55-world-political-generation-v0.7.8.6.js')<pos('56-political-map-integration-v0.7.8.7.js')&&pos('56-political-map-integration-v0.7.8.7.js')<pos('57-geographic-data-integrity-v0.7.9.2.js')&&pos('57-geographic-data-integrity-v0.7.9.2.js')<pos('58-political-geography-integrity-v0.7.9.5.js')&&pos('58-political-geography-integrity-v0.7.9.5.js')<pos('59-npc-world-integrity-v0.7.9.6.js')&&pos('59-npc-world-integrity-v0.7.9.6.js')<pos('js/game/71-association-tab-assignment-gate-v0.8.3.6.js')&&pos('js/game/71-association-tab-assignment-gate-v0.8.3.6.js')<pos('js/game/27-boot.js');
});
const failed=results.filter(r=>r.status==='FAIL');
console.log(JSON.stringify({suite:'v0.7.7.3 Regional Map',total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length)process.exitCode=1;


