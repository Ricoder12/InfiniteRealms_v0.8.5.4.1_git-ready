'use strict';
// Run: node tests/v0.7.7.3-world-map.test.js
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
  renderCount: 0, testIntelSiteId: null
};
vm.createContext(context);
for (const relative of [
  'js/data/config.js','js/data/world.js','js/data/races.js','js/data/backgrounds.js',
  'js/data/skills.js','js/data/items.js','js/data/ui.js',
  'js/game/02-worldgen-v0.2.js','js/game/33-stable-geographic-identifiers-v0.7.5.2.js',
  'js/game/34-geographic-hierarchy-connections-v0.7.5.3.js',
  'js/game/43-shared-map-data-v0.7.7.1.js'
]) vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
const world = context.generateProceduralWorld('WORLD-MAP-772-TEST');
context.irEnsureGeographicHierarchy(world);
context.state = { world, character:{name:'Test Wayfarer',daysLived:0}, calendar:{day:1,month:1,year:102}, view:'World', combat:{active:false} };
context.irSiteById = id => context.state?.world?.region?.sites?.find(s=>s.id===id) || null;
context.irRouteBetween = (a,b) => context.irSiteById(a)?.routes?.find(r=>r.to===b) || null;
context.mapPanel = function() {
  const sites = context.state.world.region.sites;
  return `<section class="panel panel-pad world-map-panel"><div class="world-map-v2">${sites.map(s => {
    const classes = `world-node${s.id===context.state.world.siteId?' current':''}${s.id===context.testIntelSiteId?' intel-target':''}`;
    return `<button class="${classes}" style="left:${s.x}%;top:${s.y}%" data-action="travel" data-site="${s.id}" data-transport="foot" disabled title="Unexplored location" aria-label="Uncharted location"><span class="node-icon">?</span><span class="node-label">Uncharted</span></button>`;
  }).join('')}</div><div class="map-legend"></div></section>`;
};
context.renderWorld = () => '<header>A world generated for this life. Travel a connected map, learn its biomes, and make discoveries that remain in your journal.</header>' + context.mapPanel();
context.runAction = () => { context.baselineActionCalled = (context.baselineActionCalled || 0) + 1; };
vm.runInContext(fs.readFileSync(path.join(root,'js/game/44-world-map-v0.7.7.2.js'),'utf8'),context,{filename:'js/game/44-world-map-v0.7.7.2.js'});
const results=[];
function test(name,fn){try{results.push({name,status:fn()?'PASS':'FAIL'});}catch(e){results.push({name,status:'FAIL',detail:e.message});}}
const deep = v => JSON.stringify(v);
const byId = id => context.state.world.region.sites.find(s=>s.id===id);
const initialWorld = context.state.world;

test('World atlas model reads the actual primary region and never fabricates extra regions',()=>{
  const m=context.ir0772WorldMapModel(initialWorld);
  return m.region===initialWorld.region && m.sites.length===initialWorld.region.sites.length && m.sites.every((s,i)=>s===initialWorld.region.sites[i]) && m.routes.length===initialWorld.region.routes.length && m.current.id===initialWorld.siteId && m.continents.length===0 && m.countries.length===0;
});
test('Optional continent/country/geography fields may be absent without crashing',()=>{
  const copy=JSON.parse(JSON.stringify(initialWorld));delete copy.continents;delete copy.countries;delete copy.geography;
  const m=context.ir0772WorldMapModel(copy);
  context.missingWorldTest=copy;
  const html=vm.runInContext('ir0772RenderWorldAtlas(missingWorldTest)',context);
  delete context.missingWorldTest;
  return m && m.continents.length===0 && m.countries.length===0 && html.includes('No political boundary geometry recorded') && html.includes('World position not defined');
});
test('World atlas only lists the actual region and never lists undiscovered locations by name',()=>{
  const html=vm.runInContext('ir0772RenderWorldAtlas()',context);
  const unknown=initialWorld.region.sites.find(s=>!initialWorld.known.includes(s.id)&&!initialWorld.visited.includes(s.id)&&!s.discovered);
  return !!unknown && html.includes(initialWorld.region.name) && !html.includes(unknown.name) && !html.includes(`data-site=\"${unknown.id}\"`);
});
test('Known biome summary is derived only from known/visited/discovered site records',()=>{
  const m=context.ir0772WorldMapModel(initialWorld);
  const allowed=new Set([...initialWorld.known,...initialWorld.visited,initialWorld.siteId]);
  return m.visibleSites.every(s=>allowed.has(s.id)||s.discovered===true) && Object.values(m.visibleBiomeCounts).reduce((a,b)=>a+b,0)===m.visibleSites.length;
});
test('Current location is always part of visible map data and is highlighted in the atlas',()=>{
  const m=context.ir0772WorldMapModel(initialWorld),html=vm.runInContext('ir0772RenderWorldAtlas()',context);
  return m.visibleSites.includes(m.current) && html.includes('YOUR POSITION') && html.includes('CURRENT');
});
test('Visited settlement/landmark index excludes unvisited settlement and landmark records',()=>{
  const m=context.ir0772WorldMapModel(initialWorld),places=context.ir0772AtlasKnownPlaces(m);
  return places.every(s=>['settlement','landmark'].includes(s.type)&&(m.visitedIds.has(s.id)||Number(s.visits)>0||s===m.current));
});
test('Opening regional view changes only session UI state, not saved world geography',()=>{
  const before=deep(initialWorld),current=byId(initialWorld.siteId);
  context.runAction({dataset:{action:'ir0772-open-region'}});
  const scope=vm.runInContext('ir0772MapScope',context);
  return scope==='regional' && deep(initialWorld)===before && vm.runInContext('ir0772SelectedGeoId',context)===(current.geoId||null);
});
test('Returning to atlas is a separate UI action and does not mutate discovery progress',()=>{
  const before=deep(initialWorld);
  context.runAction({dataset:{action:'ir0772-return-atlas'}});
  return vm.runInContext('ir0772MapScope',context)==='atlas' && deep(initialWorld)===before;
});
test('Location inspection selects an actual known geoId without triggering travel or advancing time',()=>{
  const targetId=initialWorld.known.find(id=>id!==initialWorld.siteId),target=byId(targetId);
  if(!target) return false;
  const before=deep({world:initialWorld,calendar:context.state.calendar,days:context.state.character.daysLived});
  context.runAction({dataset:{action:'ir0772-inspect-location',site:target.id,geoId:target.geoId},classList:{contains:()=>false}});
  const after=deep({world:initialWorld,calendar:context.state.calendar,days:context.state.character.daysLived});
  return vm.runInContext('ir0772SelectedGeoId',context)===target.geoId && vm.runInContext('ir0772MapScope',context)==='regional' && before===after;
});
test('Regional map removes undiscovered markers and turns visible markers into inspection-only buttons',()=>{
  context.testIntelSiteId=null;
  const html=context.ir0772RenderRegionalMap(context.ir0772WorldMapModel(initialWorld));
  const uncharted=initialWorld.region.sites.filter(s=>!initialWorld.known.includes(s.id)&&!initialWorld.visited.includes(s.id)&&!s.discovered);
  const visible=initialWorld.region.sites.filter(s=>initialWorld.known.includes(s.id)||initialWorld.visited.includes(s.id)||s.discovered||s.id===initialWorld.siteId);
  const markerCount=(html.match(/class="[^"]*world-node/g)||[]).length;
  const markers=html.match(/<button class="[^"]*world-node[^"]*"[^>]*>[\s\S]*?<\/button>/g)||[];
  return markerCount===visible.length && !uncharted.some(s=>html.includes(`data-site="${s.id}"`)) && markers.every(mark=>mark.includes('data-action="ir0772-inspect-location"')) && html.includes('ir0772-inspect-location');
});
test('Paid-intelligence marker remains visible without making unrelated hidden sites visible',()=>{
  const intel=initialWorld.region.sites.find(s=>!initialWorld.known.includes(s.id)&&!initialWorld.visited.includes(s.id)&&!s.discovered);
  if(!intel) return false;
  context.testIntelSiteId=intel.id;
  const html=context.ir0772RenderRegionalMap(context.ir0772WorldMapModel(initialWorld));
  const visibleHidden=initialWorld.region.sites.filter(s=>!initialWorld.known.includes(s.id)&&!initialWorld.visited.includes(s.id)&&!s.discovered&&s.id!==intel.id);
  const pass=html.includes(`data-site="${intel.id}"`)&&html.includes('intel-target')&&!visibleHidden.some(s=>html.includes(`data-site="${s.id}"`));
  context.testIntelSiteId=null;
  return pass;
});
test('Regional location card separates inspection from route-based travel',()=>{
  const oldKnown=initialWorld.known.slice(), oldSelected=vm.runInContext('ir0772SelectedGeoId',context);
  const distant=initialWorld.region.sites.find(s=>s.id!==initialWorld.siteId&&!initialWorld.known.includes(s.id)&&!initialWorld.visited.includes(s.id)&&!s.discovered&&!context.irRouteBetween(initialWorld.siteId,s.id));
  if(!distant)return false;
  initialWorld.known.push(distant.id);
  context.runAction({dataset:{action:'ir0772-inspect-location',site:distant.id,geoId:distant.geoId},classList:{contains:()=>false}});
  const html=context.ir0772RenderRegionalMap(context.ir0772WorldMapModel(initialWorld));
  initialWorld.known=oldKnown;
  context.ir0772SelectedGeoId=oldSelected;
  return html.includes('Known terrain:') && html.includes('No direct route from your current location') && html.includes('Markers show known places');
});
test('Regional renderer does not disclose hidden destination markers, names, biome identities, or coordinates',()=>{
  const m=context.ir0772WorldMapModel(initialWorld);
  const hidden=m.sites.filter(s=>!m.knownIds.has(s.id)&&!m.visitedIds.has(s.id)&&!s.discovered&&s!==m.current);
  if(!hidden.length)return false;
  const html=context.ir0772RenderRegionalMap(m);
  return hidden.every(s=>!html.includes(`data-site="${s.id}"`) && !(s.name && html.includes(s.name)) &&
    !html.includes(`left:${Number(s.x)||0}%;top:${Number(s.y)||0}%`) &&
    !html.includes(`data-geo-id="${s.geoId||'__no_geo_id__'}"`)) &&
    html.includes('ir0772-uncharted-terrain') && html.includes('aria-label="Interactive regional terrain map"');
});
test('Regional map positions edge markers with inset labels',()=>{
  const m=context.ir0772WorldMapModel(initialWorld);
  const html=context.ir0772RenderRegionalMap(m);
  return html.includes('edge-west') && html.includes('edge-east') && html.includes('data-action="ir0772-inspect-location"');
});
test('Malformed/missing optional site hierarchy does not make map model throw',()=>{
  const copy=JSON.parse(JSON.stringify(initialWorld));delete copy.region.continentId;delete copy.region.countryId;copy.continents=null;copy.countries=undefined;copy.geography=null;
  const m=context.ir0772WorldMapModel(copy);
  return !!m && m.continents.length===0 && m.countries.length===0 && m.sites.length===49;
});
test('Map model remains consistent across different generated regional seeds',()=>{
  const seeds=['NORTH-MARCH-772','GREEN-VALLEY-772','ASHEN-COAST-772'];
  return seeds.every(seed=>{
    const w=context.generateProceduralWorld(seed);context.irEnsureGeographicHierarchy(w);
    const m=context.ir0772WorldMapModel(w);
    return m && m.region===w.region && m.current && m.current.id===w.siteId && m.visibleSites.includes(m.current) && m.sites.length===49 && m.continents.length===0 && m.countries.length===0;
  });
});
test('Atlas, regional, political-info layers remain ordered before boot with current release title',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'), pos=name=>html.indexOf(name);
  return html.includes('js/game/44-world-map-v0.7.7.2.js')&&html.includes('js/game/45-regional-map-v0.7.7.3.js')&&html.includes('js/game/46-local-map-v0.7.7.4.js')&&html.includes('Version 0.8.3.7')&&pos('44-world-map-v0.7.7.2.js')<pos('45-regional-map-v0.7.7.3.js')&&pos('45-regional-map-v0.7.7.3.js')<pos('46-local-map-v0.7.7.4.js')&&pos('46-local-map-v0.7.7.4.js')<pos('47-travel-route-integration-v0.7.7.5.js')&&pos('47-travel-route-integration-v0.7.7.5.js')<pos('52-political-entity-foundation-v0.7.8.2.js')&&pos('52-political-entity-foundation-v0.7.8.2.js')<pos('53-regional-hierarchy-v0.7.8.3.js')&&pos('53-regional-hierarchy-v0.7.8.3.js')<pos('54-government-leadership-capitals-v0.7.8.5.js')&&pos('54-government-leadership-capitals-v0.7.8.5.js')<pos('55-world-political-generation-v0.7.8.6.js')&&pos('55-world-political-generation-v0.7.8.6.js')<pos('56-political-map-integration-v0.7.8.7.js')&&pos('56-political-map-integration-v0.7.8.7.js')<pos('57-geographic-data-integrity-v0.7.9.2.js')&&pos('57-geographic-data-integrity-v0.7.9.2.js')<pos('58-political-geography-integrity-v0.7.9.5.js')&&pos('58-political-geography-integrity-v0.7.9.5.js')<pos('59-npc-world-integrity-v0.7.9.6.js')&&pos('59-npc-world-integrity-v0.7.9.6.js')<pos('js/game/71-association-tab-assignment-gate-v0.8.3.6.js')&&pos('js/game/71-association-tab-assignment-gate-v0.8.3.6.js')<pos('js/game/27-boot.js');
});
const failed=results.filter(x=>x.status==='FAIL');
console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length)process.exitCode=1;


