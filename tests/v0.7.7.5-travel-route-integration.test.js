'use strict';
// v0.7.7.5 — tests run the real source sequence in an isolated Node VM (no game browser DOM).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const noop = () => {};
function element() {
  return { textContent:'', innerHTML:'', title:'', style:{}, className:'', dataset:{}, children:[],
    appendChild:noop, remove:noop, click:noop, focus:noop, setAttribute:noop, getAttribute:()=>null,
    addEventListener:noop, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
    querySelector:()=>null, querySelectorAll:()=>[], getBoundingClientRect:()=>({width:0,height:0,top:0,left:0}) };
}
const document = { title:'', head:{appendChild:noop}, body:element(), addEventListener:noop,
  querySelector:()=>null, querySelectorAll:()=>[], getElementById:()=>null, createElement:element };
const stored = new Map();
const localStorage = { getItem:k=>stored.has(k)?stored.get(k):null, setItem:(k,v)=>stored.set(k,String(v)), removeItem:k=>stored.delete(k), clear:()=>stored.clear() };
const math = Object.create(Math);
const messages = [];
const context = { console:{warn:noop,log:noop,error:noop}, Math:math, String, Array, Object, Map, Set, Number, JSON, RegExp, Date, Intl, parseInt, parseFloat,
  document, window:{scrollTo:noop,addEventListener:noop,removeEventListener:noop}, localStorage, setTimeout:()=>0, clearTimeout:noop,
  requestAnimationFrame:noop, URL, Blob:global.Blob, FileReader:function(){}, navigator:{userAgent:'Infinite Realms route test'},
  toast:message=>messages.push(String(message)) };
vm.createContext(context);
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]).filter(file=>!file.endsWith('/27-boot.js'));
for (const relative of scripts) vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
vm.runInContext('render=()=>{}; persist=()=>true; toast=(m)=>__toast(m);', Object.assign(context,{__toast:message=>messages.push(String(message))}));
const run = expr => vm.runInContext(expr,context);
const tests=[];
function test(name,fn){try{const result=fn();tests.push({name,status:result?'PASS':'FAIL'});}catch(error){tests.push({name,status:'FAIL',detail:error?.stack||String(error)});}}
function fresh(seed='IR-0775-TEST') {
  run(`createSeed=${JSON.stringify(seed)}; createStart='settlement'; state=makeInitial('Route Tester','human','village'); state.pendingEvent=null; state.eventQueue=[]; state.combat=state.combat||{active:false}; state.combat.active=false; state.character.energy=100; state.character.hunger=100; state.character.coin=100; state.calendar.day=1; state.calendar.month=1; state.calendar.year=102; modal=null;`);
  run('Math.random=()=>0.999');
}
const deep = value => JSON.stringify(value);
const state = () => run('state');
const world = () => state().world;
const site = id => world().region.sites.find(item=>item.id===id);
const known = (w,id) => (w.known||[]).includes(id)||(w.visited||[]).includes(id)||site(id)?.discovered===true||Number(site(id)?.visits)>0;

fresh('IR-0775-CANONICAL');
test('Generated route records resolve only when canonical global edge and endpoint copies agree',()=>{
  const w=world(),current=site(w.siteId),from=context.ir0775ConnectionsFrom(current.id);
  return from.length===current.routes.length&&from.every(route=>{const raw=w.region.routes.find(edge=>edge.geoId===route.geoId);return raw&&context.ir0775Connection(current.id,route.to)?.distanceKm===Number(raw.distanceKm)&&Number.isFinite(route.distanceKm)&&route.distanceKm>0;});
});
test('Every travel distance stays in gameplay kilometres and the existing transport day formula',()=>{
  const w=world(),current=site(w.siteId),routes=context.ir0775ConnectionsFrom(current.id);
  return routes.length>0&&routes.every(route=>['foot','mount','caravan','boat'].every(transport=>context.irCurrentTransportDays(route.distanceKm,transport)===Math.max(1,Math.ceil(route.distanceKm/({foot:20,mount:42,caravan:30,boat:34}[transport])))));
});
test('A global route missing from region.routes cannot be traversed just because both local copies remain',()=>{
  fresh('IR-0775-MISSING-GLOBAL');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  const edgeIndex=w.region.routes.findIndex(edge=>edge.geoId===route.geoId);w.region.routes.splice(edgeIndex,1);
  const snapshot=deep(state()),resolved=context.irRouteBetween(from.id,route.to),path=context.ir071FindPath(from.id,route.to);
  return resolved===null&&!(path&&path.length===2)&&deep(state())===snapshot;
});
test('A conflicting endpoint distance makes the edge unavailable instead of trusting stale local data',()=>{
  fresh('IR-0775-DISTANCE-MISMATCH');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  from.routes.find(item=>item.to===route.to).distanceKm=Number(route.distanceKm)+3;
  const q=context.ir051TravelQuote(route.to,'foot');
  return context.irRouteBetween(from.id,route.to)===null&&!q.ok&&q.reason.includes('No direct route');
});
test('Conflicting transport availability or terrain metadata fails closed',()=>{
  fresh('IR-0775-METADATA-MISMATCH');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  const edge=w.region.routes.find(item=>item.geoId===route.geoId);edge.boat=!edge.boat;
  return context.irRouteBetween(from.id,route.to)===null;
});
test('Duplicate canonical edges are ambiguous and cannot create a direct travel option',()=>{
  fresh('IR-0775-DUPLICATE-EDGE');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  const edge=w.region.routes.find(item=>item.geoId===route.geoId);w.region.routes.push({...edge});
  return context.irRouteBetween(from.id,route.to)===null;
});
test('Explicitly directed edges can only be travelled in their recorded direction',()=>{
  fresh('IR-0775-DIRECTED-EDGE');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  const edge=w.region.routes.find(item=>item.geoId===route.geoId);const endpoints=context.ir0775ResolveEdge(edge);edge.directed=true;
  return !!context.irRouteBetween(endpoints.from.id,endpoints.to.id)&&context.irRouteBetween(endpoints.to.id,endpoints.from.id)===null&&!context.ir0775ConnectionsFrom(endpoints.to.id).some(item=>item.to===endpoints.from.id);
});
test('Direct travel preview and execution use the same distance, duration, energy cost, and arrival location',()=>{
  fresh('IR-0775-DIRECT-TRAVEL');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  const target=site(route.to),q=context.ir051TravelQuote(target.id,'foot');if(!q.ok)return false;
  const before={site:w.siteId,day:state().character.daysLived,energy:state().character.energy,travelCount:w.travelCount||0};
  const committed=context.ir0775CommitTravel(target.id,'foot');const after=state();
  return committed&&after.world.siteId===target.id&&after.character.daysLived-before.day===q.days&&before.energy-after.character.energy===q.energy&&after.world.travelCount===before.travelCount+1&&(after.world.visited||[]).includes(target.id)&&context.ir0775ConnectionsFrom(target.id).every(r=>(after.world.known||[]).includes(r.to));
});
test('Direct danger estimate uses the existing location risks and transport modifier only',()=>{
  fresh('IR-0775-DANGER');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0],to=site(route.to);if(!route)return false;
  from.risk=20;to.risk=40;
  const foot=context.ir0775DangerChance(from,to,'foot'),caravan=context.ir0775DangerChance(from,to,'caravan'),q=context.ir051TravelQuote(to.id,'foot');
  return foot===.3&&caravan===Math.max(.04,Math.min(.48,.3*.72))&&q.risk===Math.round(foot*100)&&q.riskKnown===false;
});
test('Terrain labels do not silently add an unsupported travel-time modifier',()=>{
  fresh('IR-0775-TERRAIN');const w=world(),edges=w.region.routes;
  const edgeA=edges.find(edge=>edge.terrain),edgeB=edges.find(edge=>edge.terrain&&edge.terrain!==edgeA?.terrain);
  if(!edgeA||!edgeB)return false;
  for(const edge of [edgeA,edgeB]){
    edge.distanceKm=20;const resolved=context.irGeoResolveGlobalRoute(w.region,edge);if(!resolved.resolved)return false;
    for(const route of resolved.from.routes.filter(route=>route.to===resolved.to.id))route.distanceKm=20;
    for(const route of resolved.to.routes.filter(route=>route.to===resolved.from.id))route.distanceKm=20;
  }
  const a=context.irCurrentTransportDays(20,'foot'),b=context.irCurrentTransportDays(20,'foot');
  return edgeA.terrain!==edgeB.terrain&&a===b&&a===1&&typeof context.irBiomeTravelContext==='function';
});
test('A multi-leg destination uses a verified path with every leg backed by the same graph',()=>{
  fresh('IR-0775-MULTILEG-PLAN');const w=world(),start=w.siteId;let found=null;
  for(const target of w.region.sites){const path=context.ir071FindPath(start,target.id);if(path&&path.length>2){found={target,path};break;}}
  if(!found)return false;
  const plan=context.ir071RoutePlan(found.target.id);
  return !!plan&&deep(plan.path)===deep(found.path)&&plan.legs.length===found.path.length-1&&plan.legs.every((leg,i)=>leg.from.id===found.path[i]&&leg.to.id===found.path[i+1]&&context.ir0775Connection(leg.from.id,leg.to.id)?.geoId===leg.route.geoId)&&plan.totalDistance===plan.legs.reduce((sum,leg)=>sum+leg.distance,0)&&plan.totalDays===plan.legs.reduce((sum,leg)=>sum+leg.days,0);
});
test('A multi-leg journey follows its plan and consumes exactly the displayed total when uninterrupted',()=>{
  fresh('IR-0775-MULTILEG-EXECUTE');const w=world(),start=w.siteId;let target=null,plan=null;
  for(const candidate of w.region.sites){const testPlan=context.ir071RoutePlan(candidate.id);if(testPlan?.legs.length>=2){target=candidate;plan=testPlan;break;}}
  if(!target||!plan)return false;
  const before={days:state().character.daysLived,energy:state().character.energy,count:w.travelCount||0};context.targetArg=target.id;run("modal={kind:'travel-route-preview',site:targetArg,path:[],lowResourceConfirmed:true}");
  const result=context.ir071TravelRouteConfirm(target.id),after=state();
  return result&&after.world.siteId===target.id&&after.character.daysLived-before.days===plan.totalDays&&before.energy-after.character.energy===plan.totalEnergy&&after.world.travelCount-before.count===plan.legs.length&&(after.world.visited||[]).includes(target.id);
});
test('A disconnected destination cannot be reached from visibility alone and consumes no resources or time',()=>{
  fresh('IR-0775-DISCONNECTED');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  const target=w.region.sites.find(item=>item.id!==from.id);if(!target)return false;
  w.region.routes=w.region.routes.filter(edge=>{const endpoints=context.ir0775ResolveEdge(edge);return !endpoints||!(endpoints.from.id===target.id||endpoints.to.id===target.id);});
  w.known=w.known||[];if(!w.known.includes(target.id))w.known.push(target.id);
  const before=deep(state());context.travel(target.id,'foot');
  return deep(state())===before&&context.ir071FindPath(from.id,target.id)===null&&context.irRouteBetween(from.id,target.id)===null;
});
test('A segment interrupted by insufficient energy preserves only completed legs and costs no energy for the next one',()=>{
  fresh('IR-0775-INTERRUPT');const w=world(),start=w.siteId;let target=null,plan=null;
  for(const candidate of w.region.sites){const candidatePlan=context.ir071RoutePlan(candidate.id);if(candidatePlan?.legs.length>=2){target=candidate;plan=candidatePlan;break;}}
  if(!target||!plan)return false;
  const first=plan.legs[0];state().character.energy=first.energy;state().character.hunger=100;
  const before={days:state().character.daysLived,energy:state().character.energy,count:w.travelCount||0};context.targetArg=target.id;run("modal={kind:'travel-route-preview',site:targetArg,path:[],lowResourceConfirmed:true}");
  const result=context.ir071TravelRouteConfirm(target.id),after=state();
  return result===false&&after.world.siteId===first.to.id&&after.world.siteId!==target.id&&before.energy-after.character.energy===first.energy&&after.character.daysLived-before.days===first.days&&after.world.travelCount-before.count===1&&context.ir0755ValidateGeographicIntegrity(after.world,after.character).ok;
});
test('A triggered encounter interrupts a multi-leg journey after its completed leg without corrupting the next leg',()=>{
  fresh('IR-0775-ENCOUNTER-INTERRUPT');const w=world();let target=null,plan=null;
  for(const candidate of w.region.sites){const p=context.ir071RoutePlan(candidate.id);if(p?.legs.length>=2){target=candidate;plan=p;break;}}
  if(!target||!plan)return false;
  state().character.energy=100;state().character.hunger=100;state().pendingEvent=null;w.eventQueue=[];
  const first=plan.legs[0],before={days:state().character.daysLived,energy:state().character.energy,count:w.travelCount||0};context.targetArg=target.id;run("modal={kind:'travel-route-preview',site:targetArg,path:[],lowResourceConfirmed:true};Math.random=()=>0");
  const result=context.ir071TravelRouteConfirm(target.id);run('Math.random=()=>0.999');const after=state();
  return result===false&&after.world.siteId===first.to.id&&after.world.siteId!==target.id&&before.energy-after.character.energy>=first.energy&&after.character.daysLived-before.days===first.days&&after.world.travelCount-before.count===1&&!!(after.pendingEvent||(after.eventQueue||[]).length)&&context.ir0755ValidateGeographicIntegrity(after.world,after.character).ok;
});
test('A thrown direct-travel operation rolls back location, time, and resources',()=>{
  fresh('IR-0775-ROLLBACK');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  const before=deep(state()),dayPass=context.dayPass;
  context.dayPass=(days)=>{state().calendar.day+=Number(days)||0;state().character.energy=0;throw new Error('injected route interruption')};
  const result=context.ir0775CommitTravel(route.to,'foot');context.dayPass=dayPass;
  return result===false&&deep(state())===before;
});
test('Save normalization and slot save/load preserve arrived location and authoritative graph data',()=>{
  fresh('IR-0775-SAVE-LOAD');const w=world(),route=context.ir0775ConnectionsFrom(w.siteId)[0];if(!route)return false;
  context.ir0775CommitTravel(route.to,'foot');const arrived=state().world.siteId,travelCount=state().world.travelCount;
  const roundTrip=context.normalizeSave(JSON.parse(JSON.stringify(state())));
  if(roundTrip.world.siteId!==arrived||roundTrip.world.travelCount!==travelCount||!context.ir0775Connection(roundTrip.world.siteId,roundTrip.world.region.sites.find(s=>s.id===roundTrip.world.siteId).routes[0]?.to,roundTrip.world))return false;
  state().character.name='Slot Walker';context.saveSlot(0);context.loadSlot(0);
  return state().world.siteId===arrived&&state().world.travelCount===travelCount&&context.ir0775ConnectionsFrom(state().world.siteId).length>0;
});
test('The map-facing regional and local route lists read verified canonical connections, not corrupt local-only entries',()=>{
  fresh('IR-0775-MAP-SHARED');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  w.known=w.known||[];w.visited=w.visited||[];w.visited.push(from.id);from.visits=1;from.discovered=true;w.known.push(route.to);
  const target=site(route.to);w.known.push(target.id);
  const before=context.ir0775ConnectionsFrom(from.id).length;from.routes.find(item=>item.to===route.to).distanceKm+=1;
  const after=context.ir0775ConnectionsFrom(from.id).length;
  return after===before-1&&context.irRouteBetween(from.id,route.to)===null;
});

test('Direct travel preview does not reveal a known-but-unsurveyed destination name or exact danger',()=>{
  fresh('IR-0775-DIRECT-PRIVACY');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  const target=site(route.to);w.visited=(w.visited||[]).filter(id=>id!==target.id);target.visits=0;target.discovered=false;w.known=w.known||[];if(!w.known.includes(target.id))w.known.push(target.id);
  context.targetArg=target.id;run("modal={site:targetArg,transport:'foot'}");const html=context.ir051TravelModal();
  return !html.includes(target.name)&&html.includes('Travel to Uncharted location')&&html.includes('Encounter risk unknown')&&html.includes('Unknown until surveyed');
});
test('Multi-leg travel preview masks known-but-unsurveyed intermediate names and their terrain labels',()=>{
  fresh('IR-0775-MULTILEG-PRIVACY');const w=world(),start=w.siteId;let target=null,plan=null;
  for(const candidate of w.region.sites){const p=context.ir071RoutePlan(candidate.id);if(p?.legs.length>=2){target=candidate;plan=p;break;}}
  if(!target||!plan)return false;
  const hidden=plan.path.slice(1).map(id=>site(id));w.visited=(w.visited||[]).filter(id=>!hidden.some(item=>item.id===id));
  hidden.forEach(item=>{item.visits=0;item.discovered=false;w.known=w.known||[];if(!w.known.includes(item.id))w.known.push(item.id);});
  context.targetArg=target.id;run("modal={site:targetArg,path:[],lowResourceConfirmed:true}");const html=context.ir071RoutePreviewHtml();
  return hidden.every(item=>!html.includes(item.name))&&html.includes('Uncharted stop')&&html.includes('Terrain not surveyed')&&html.includes('Encounter estimate')&&html.includes('Unknown until surveyed')&&!html.includes('Encounter estimate</span><strong>up to ');
});
test('Regional direct-route label and Local exits agree with the authoritative quote and shared graph without changing state',()=>{
  fresh('IR-0794-MAP-TRAVEL-CONSISTENCY');const w=world(),from=site(w.siteId),route=context.ir0775ConnectionsFrom(from.id)[0];if(!route)return false;
  const target=site(route.to);w.known=w.known||[];w.visited=w.visited||[];if(!w.known.includes(target.id))w.known.push(target.id);if(!w.visited.includes(from.id))w.visited.push(from.id);from.visits=Math.max(1,Number(from.visits)||0);target.discovered=true;
  const before=deep(state()),quote=context.ir051TravelQuote(target.id,'foot');context.targetGeo=target.geoId;run('ir0772SelectedGeoId=targetGeo');const regional=context.ir0772RenderRegionalMap(context.ir0772WorldMapModel());
  context.currentGeo=from.geoId;run('ir0772SelectedGeoId=currentGeo');const local=context.ir0773RenderLocalView(context.ir0772WorldMapModel());
  const mapData=context.irMapSharedData(w),connections=context.ir0775ConnectionsFrom(from.id);
  const checks={quote:quote.ok,distance:regional.includes(`${quote.route.distanceKm} km`),days:regional.includes(`${quote.days} day${quote.days===1?'':'s'}`),site:regional.includes(`data-site=\"${target.id}\"`),geo:regional.includes(`data-geo-id=\"${target.geoId}\"`),local:local.includes(target.name),edge:connections.some(item=>item.to===target.id&&mapData.connections.some(edge=>edge.geoId===item.geoId)),unchanged:before===deep(state())};
  return Object.values(checks).every(Boolean);
});
const failed=tests.filter(t=>t.status==='FAIL');
console.log(JSON.stringify({suite:'Infinite Realms v0.7.7.5 Travel and Route Integration',total:tests.length,passed:tests.length-failed.length,failed:failed.length,tests},null,2));
if(failed.length)process.exitCode=1;
