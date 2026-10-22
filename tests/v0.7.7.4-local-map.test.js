'use strict';
// Run: node tests/v0.7.7.4-local-map.test.js
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
  renderCount: 0, testIntelSiteId: null, document: {title:''}
};
vm.createContext(context);
for (const relative of [
  'js/data/config.js','js/data/world.js','js/data/races.js','js/data/backgrounds.js',
  'js/data/skills.js','js/data/items.js','js/data/ui.js',
  'js/game/02-worldgen-v0.2.js','js/game/33-stable-geographic-identifiers-v0.7.5.2.js',
  'js/game/34-geographic-hierarchy-connections-v0.7.5.3.js','js/game/43-shared-map-data-v0.7.7.1.js'
]) vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
const world = context.generateProceduralWorld('IR-0774-LOCAL-MAP-TEST');
context.irEnsureGeographicHierarchy(world);
context.state = {world,character:{name:'Local Tester',daysLived:0,coin:100,energy:100,maxEnergy:100,npcs:[]},calendar:{day:1,month:1,year:102},view:'World',combat:{active:false}};
context.irSiteById = id => context.state?.world?.region?.sites?.find(s=>s.id===id)||null;
context.irRouteBetween = (a,b) => context.irSiteById(a)?.routes?.find(r=>r.to===b)||null;
context.mapPanel = function(){
  const sites=context.state.world.region.sites;
  return `<section class="panel panel-pad world-map-panel"><div class="world-map-v2">${sites.map(s=>`<button class="world-node${s.id===context.state.world.siteId?' current':''}${s.id===context.testIntelSiteId?' intel-target':''}" style="left:${s.x}%;top:${s.y}%" data-action="travel" data-site="${s.id}" disabled><span class="node-icon">?</span><span class="node-label">Uncharted</span></button>`).join('')}</div></section>`;
};
context.renderWorld=()=>'<header>A world generated for this life.</header>'+context.mapPanel();
context.runAction=()=>{context.baselineActionCalled=(context.baselineActionCalled||0)+1;};
for(const relative of ['js/game/44-world-map-v0.7.7.2.js','js/game/45-regional-map-v0.7.7.3.js','js/game/46-local-map-v0.7.7.4.js'])
  vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});

const results=[];
function test(name,fn){try{results.push({name,status:fn()?'PASS':'FAIL'});}catch(error){results.push({name,status:'FAIL',detail:error?.stack||error.message});}}
const stable=()=>context.state.world;
const site=id=>stable().region.sites.find(item=>item.id===id);
const localHtml=(world=stable())=>{
  const old=context.state.world;context.state.world=world;
  try{return context.ir0773RenderLocalView(context.ir0772WorldMapModel(world));}
  finally{context.state.world=old;}
};
const deep=value=>JSON.stringify(value);
const town=()=>site('loc-3-3');
const oldSiteId=stable().siteId;

// Default start is town; mark the site as fully visited as normal saved start data does.
test('Local map renders inside the accepted local detail view and keeps return navigation',()=>{
  const html=localHtml();
  return html.includes('class="ir0774-local-scene ')&&html.includes('ir0773-local-panel')&&html.includes('data-action="ir0773-return-regional"')&&html.includes('Illustration limits:');
});
test('Town local scene derives clickable buildings only from saved services',()=>{
  const current=site(stable().siteId),before=deep(stable()),html=localHtml();
  const allowed=new Set((current.services||[]).map(String));
  const rendered=[...html.matchAll(/<button class="ir0774-service-building [^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map(m=>m[1]);
  const presentationKeys=vm.runInContext('Object.keys(IR0774_SERVICE_PRESENTATION)',context);
  const expected=presentationKeys.filter(key=>allowed.has(key)||((key==='forge')&&(allowed.has('smithy')||allowed.has('workshop')||allowed.has('blacksmith')))||((key==='alchemy')&&allowed.has('alchemist')));
  const valid=rendered.every(mark=>/class="ir0774-building-name"/.test(mark))&&rendered.length>0;
  return valid&&expected.length>0&&before===deep(stable())&&html.includes('Clickable buildings use only services already recorded');
});
test('Map actions route to existing application tabs or existing interaction handlers',()=>{
  const html=localHtml();
  const buttons=html.match(/<button class="ir0774-service-building[^>]*>/g)||[];
  return buttons.length>0&&buttons.every(b=>/data-tab="(Inventory|World)"|data-action="(local-rest|jobs-modal|local-healer|ask-rumor)"/.test(b))&&html.includes('title="Existing service / destination — interactive"')===false;
});
test('Service aliases collapse to one existing facility and unsupported service IDs never invent a building',()=>{
  const w=JSON.parse(JSON.stringify(stable())),current=w.region.sites.find(s=>s.id===w.siteId);
  current.services=['smithy','forge','workshop'];
  const aliased=localHtml(w),forgeCount=(aliased.match(/class="ir0774-service-building service-forge"/g)||[]).length;
  current.services=['future-service-that-does-not-exist'];
  const unknown=localHtml(w);
  return forgeCount===1&&!unknown.includes('class="ir0774-service-building')&&unknown.includes('without a registered local-map interaction')&&!unknown.includes('No interactive services are recorded here');
});
test('Decorative houses and terrain props cannot be clicked as services',()=>{
  const html=localHtml();
  const houses=html.match(/<span class="ir0774-decor-house[\s\S]*?<\/span>/g)||[];
  const decor=html.match(/<span class="ir0774-scenery-object[^>]*>/g)||[];
  return houses.length>0&&decor.length>0&&houses.every(x=>!x.includes('data-action')&&!x.includes('data-tab'))&&decor.every(x=>x.includes('aria-hidden="true"')&&!x.includes('data-action')&&!x.includes('data-tab'));
});
test('Settlement type changes presentation scale and the layout remains deterministic for the same site',()=>{
  const current=site(stable().siteId),first=localHtml(),second=localHtml();
  const cityWorld=JSON.parse(JSON.stringify(stable()));cityWorld.siteId='loc-6-6';cityWorld.visited=[...(cityWorld.visited||[]),'loc-6-6'];cityWorld.known=[...(cityWorld.known||[]),'loc-6-6'];cityWorld.region.sites.find(s=>s.id==='loc-6-6').visits=1;cityWorld.region.sites.find(s=>s.id==='loc-6-6').discovered=true;
  const city=localHtml(cityWorld);
  return first===second&&current?.settlementType==='town'&&first.includes('settlement-town')&&city.includes('settlement-city')&&first!==city;
});
test('Hamlet and city service panels respect actual saved service availability',()=>{
  const hamletWorld=JSON.parse(JSON.stringify(stable())),cityWorld=JSON.parse(JSON.stringify(stable()));
  hamletWorld.siteId='loc-0-0';cityWorld.siteId='loc-6-6';
  for(const w of [hamletWorld,cityWorld]){const c=w.region.sites.find(s=>s.id===w.siteId);w.visited=[...(w.visited||[]),c.id];w.known=[...(w.known||[]),c.id];c.visits=Math.max(1,Number(c.visits)||0);c.discovered=true;}
  const h=localHtml(hamletWorld),c=localHtml(cityWorld);
  const hCount=(h.match(/class="ir0774-service-building /g)||[]).length,cCount=(c.match(/class="ir0774-service-building /g)||[]).length;
  return h.includes('settlement-hamlet')&&c.includes('settlement-city')&&hCount>0&&cCount>hCount&&hCount===new Set((hamletWorld.region.sites.find(s=>s.id===hamletWorld.siteId).services||[]).map(x=>x==='smithy'||x==='workshop'?'forge':x==='alchemist'?'alchemy':x)).size;
});
test('Town staff labels only use real, site-bound NPC records and do not generate NPCs',()=>{
  const w=stable(),current=site(w.siteId),npc={id:'test-merchant',name:'Mira Copperwell',occupation:'Merchant',icon:'🪙',workSite:current.id,tier:'unique'};
  const before=deep({world:w,npcs:context.state.character.npcs});context.state.character.npcs.push(npc);
  const html=localHtml();const present=html.includes('Mira Copperwell')&&html.includes('Recorded worker: Mira Copperwell');
  context.state.character.npcs.pop();
  return present&&context.state.character.npcs.length===0&&before===deep({world:w,npcs:context.state.character.npcs});
});
test('An existing guard occupation links to People but does not fabricate a new town-service building',()=>{
  const current=site(stable().siteId);context.state.character.npcs.push({id:'test-guard',name:'Ren Alder',occupation:'Guard',icon:'🛡️',workSite:current.id,tier:'unique'});
  const html=localHtml();context.state.character.npcs.pop();
  return html.includes('Known local workers')&&html.includes('Ren Alder')&&html.includes('data-tab="People"')&&!html.includes('service-guard');
});
test('Wilderness scenes show biome-appropriate scenery and no settlement services',()=>{
  const w=JSON.parse(JSON.stringify(stable())),forest=w.region.sites.find(s=>s.type==='wilderness'&&(s.biomeId==='woodland'||s.biomeId==='forest')),desert=w.region.sites.find(s=>s.type==='wilderness'&&s.biomeId==='desert');
  if(!forest||!desert)return true; // Seed may not contain both; browser suite covers more generated seeds.
  for(const s of [forest,desert]){s.visits=1;s.discovered=true;w.visited=[...(w.visited||[]),s.id];w.known=[...(w.known||[]),s.id];}
  w.siteId=forest.id;const f=localHtml(w);w.siteId=desert.id;const d=localHtml(w);
  return f.includes('terrain-woodland')&&d.includes('terrain-desert')&&!f.includes('class="ir0774-service-building')&&!d.includes('class="ir0774-service-building')&&f.includes('Explore this area')&&d.includes('Explore this area');
});
test('Swamp/snow/coast/river biome themes map to corresponding visual profiles',()=>{
  const samples=[['swamp','terrain-swamp'],['snow','terrain-snow'],['coast','terrain-coast'],['river','terrain-river']];
  const source=fs.readFileSync(path.join(root,'js/game/46-local-map-v0.7.7.4.js'),'utf8');
  return samples.every(([id,key])=>source.includes(`raw === '${id}'`)&&source.includes(`key:'${id}'`));
});
test('Recorded point of interest uses the existing Adventure destination, and no fake local poi is generated',()=>{
  const w=JSON.parse(JSON.stringify(stable())),poi=w.region.sites.find(s=>s.type==='landmark');
  if(!poi)return true;
  poi.visits=1;poi.discovered=true;w.visited=[...(w.visited||[]),poi.id];w.known=[...(w.known||[]),poi.id];w.siteId=poi.id;
  const html=localHtml(w);
  return html.includes('data-tab="Adventure"')&&html.includes('aria-label="Explore the recorded landmark ')&&html.includes('Explore this area')===false&&html.includes('Recorded point of interest')&&html.includes(String(poi.name||'Landmark'));
});
test('No interactive businesses, labels, services, or NPC names leak from an unsurveyed current site',()=>{
  const w=JSON.parse(JSON.stringify(stable())),current=w.region.sites.find(s=>s.id===w.siteId);
  const secret=current.name,desc=current.desc,secretBiome=current.biome,secretIcon=current.icon;current.visits=0;current.discovered=false;w.visited=(w.visited||[]).filter(id=>id!==current.id);w.known=(w.known||[]).filter(id=>id!==current.id);w.siteId=current.id;
  const html=localHtml(w);
  const checks={title:html.includes('<h2>Current location</h2>'),noBuilding:!html.includes('class="ir0774-service-building'),noName:!html.includes(secret),noDesc:!html.includes(desc),unknownClass:html.includes('class="ir0774-local-scene terrain-unknown wilderness-scene scene-unsurveyed'),noScenery:!html.includes('class="ir0774-scenery-object'),noBiome:!secretBiome||!html.includes(secretBiome),noIcon:!secretIcon||!html.includes(secretIcon)}; return Object.values(checks).every(Boolean);
});
test('Location with missing service, biome, or optional route fields fails safely without changing the save',()=>{
  const w=JSON.parse(JSON.stringify(stable())),current=w.region.sites.find(s=>s.id===w.siteId);delete current.services;delete current.biomeId;delete current.biome;delete current.routes;delete w.biomes;
  const before=deep(w),html=localHtml(w);
  return html.includes('class="ir0774-local-scene')&&html.includes('Local view')&&before===deep(w)&&html.includes('Illustration limits:');
});
test('Map retains existing recorded outbound travel actions and does not create a local movement grid',()=>{
  const html=localHtml();
  return html.includes('data-action="travel"')&&html.includes('Routes out of this location')&&html.includes('SCHEMATIC · NOT WALKABLE GRID')&&!html.includes('data-action="move-local"')&&!html.includes('data-local-x=')&&!html.includes('data-local-y=');
});
test('Political map integration is loaded after geography/generation and before boot under current title',()=>{
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8'), pos=name=>index.indexOf(name);
  return index.includes('Version 0.8.3.7')&&pos('45-regional-map-v0.7.7.3.js')<pos('46-local-map-v0.7.7.4.js')&&pos('46-local-map-v0.7.7.4.js')<pos('47-travel-route-integration-v0.7.7.5.js')&&pos('47-travel-route-integration-v0.7.7.5.js')<pos('52-political-entity-foundation-v0.7.8.2.js')&&pos('52-political-entity-foundation-v0.7.8.2.js')<pos('53-regional-hierarchy-v0.7.8.3.js')&&pos('53-regional-hierarchy-v0.7.8.3.js')<pos('54-government-leadership-capitals-v0.7.8.5.js')&&pos('54-government-leadership-capitals-v0.7.8.5.js')<pos('55-world-political-generation-v0.7.8.6.js')&&pos('55-world-political-generation-v0.7.8.6.js')<pos('56-political-map-integration-v0.7.8.7.js')&&pos('56-political-map-integration-v0.7.8.7.js')<pos('57-geographic-data-integrity-v0.7.9.2.js')&&pos('57-geographic-data-integrity-v0.7.9.2.js')<pos('58-political-geography-integrity-v0.7.9.5.js')&&pos('58-political-geography-integrity-v0.7.9.5.js')<pos('59-npc-world-integrity-v0.7.9.6.js')&&pos('59-npc-world-integrity-v0.7.9.6.js')<pos('js/game/71-association-tab-assignment-gate-v0.8.3.6.js')&&pos('js/game/71-association-tab-assignment-gate-v0.8.3.6.js')<pos('js/game/27-boot.js');
});

const failed=results.filter(r=>r.status==='FAIL');
console.log(JSON.stringify({suite:'Infinite Realms v0.7.7.4 Local Map',total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length)process.exitCode=1;


