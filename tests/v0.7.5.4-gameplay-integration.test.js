'use strict';
// Uses the full app script sequence with a minimal DOM shim; no browser UI is exercised here.
// Run: node tests/v0.7.5.4-gameplay-integration.test.js
const fs=require('node:fs'); const vm=require('node:vm'); const path=require('node:path');
const root=path.resolve(__dirname,'..'); const noop=()=>{};
const document={title:'',head:{appendChild:noop},addEventListener:noop,querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,
  createElement:()=>({textContent:'',style:{},className:'',appendChild:noop,remove:noop})};
const localStorage={getItem:()=>null,setItem:noop,removeItem:noop};
const context={console:{warn:noop,log:noop,error:console.error},Math:Object.create(Math),String,Array,Object,Map,Set,Number,JSON,RegExp,Date,parseInt,parseFloat,
  document,window:{scrollTo:noop},localStorage,setTimeout:()=>0,clearTimeout:noop,requestAnimationFrame:noop,URL,Blob:global.Blob};
vm.createContext(context);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]).filter(f=>!f.endsWith('/27-boot.js'));
for(const relative of scripts) vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
vm.runInContext('render=()=>{}; persist=()=>true; toast=()=>{};',context);
const results=[]; function test(name,fn){try{const result=fn();results.push({name,status:result?'PASS':'FAIL'});}catch(e){results.push({name,status:'FAIL',detail:e?.stack||e.message});}}
const evalIn=(expr)=>vm.runInContext(expr,context);

test('Full application script sequence generates a world accepted by both geographic validators',()=>{
  evalIn("createSeed='PLAY-TEST-0754'; createStart='settlement'; state=makeInitial('Route Tester','human','village');");
  return evalIn('irValidateGeographicIds(state.world).ok && irValidateGeographicHierarchy(state.world).ok && state.world.generationIntegrationVersion===1 && state.world.region.sites.length===49');
});

test('Existing travel action changes location, marks the destination visited, and records discovery',()=>{
  evalIn('state.pendingEvent=null; state.character.energy=100; state.character.hunger=100; Math.random=()=>0.999;');
  const from=evalIn('site()'); const destId=evalIn('site().routes[0].to');
  evalIn(`ir051TravelBase(${JSON.stringify(destId)},'foot')`);
  return evalIn(`state.world.siteId===${JSON.stringify(destId)} && state.world.visited.includes(${JSON.stringify(destId)}) && state.world.journal.discoveries.some(d=>d.siteId===${JSON.stringify(destId)}) && state.world.travelCount>=1`) && from.id!==destId;
});

test('Route-triggered encounter uses an existing event definition without corrupting geographic references',()=>{
  evalIn('state.pendingEvent=null; state.character.energy=100; state.character.hunger=100; Math.random=()=>0;');
  const destId=evalIn('site().routes[0].to');
  evalIn(`ir051TravelBase(${JSON.stringify(destId)},'foot')`);
  return evalIn('!!state.pendingEvent && !!EVENTS[state.pendingEvent] && irValidateGeographicIds(state.world).ok && irValidateGeographicHierarchy(state.world).ok');
});

test('Gathering still reads the authoritative current site biome and awards a material',()=>{
  evalIn("state.pendingEvent=null; const target=state.world.region.sites.find(s=>s.biomeId==='forest'); state.world.siteId=target.id; target.risk=45; state.character.energy=100; state.character.hunger=100; Math.random=()=>0;");
  const before=evalIn('Object.values(state.character.inventory).reduce((a,n)=>a+(Number(n)||0),0)');
  evalIn("ir04Gather('woodcutting')");
  const after=evalIn('Object.values(state.character.inventory).reduce((a,n)=>a+(Number(n)||0),0)');
  return after>before && evalIn('state.world.region.sites.some(s=>s.id===state.world.siteId && !!s.biomeId) && irValidateGeographicHierarchy(state.world).ok');
});

test('Location-based NPC and occupation systems reuse generated settlements without duplicate resident IDs or invalid regional references',()=>{
  const siteId=evalIn("state.world.region.sites.find(s=>s.type==='settlement').id");
  evalIn(`state.world.siteId=${JSON.stringify(siteId)}; state.character.daysLived=14;`);
  const first=evalIn('ir06EnsureNPCs()'); const firstIds=first.map(n=>n.id).sort();
  const second=evalIn('ir06EnsureNPCs()'); const secondIds=second.map(n=>n.id).sort();
  return first.length>0 && new Set(firstIds).size===firstIds.length && new Set(secondIds).size===secondIds.length && JSON.stringify(firstIds)===JSON.stringify(secondIds) && evalIn('ir071Sites().every(s=>s.geoId && irGetGeographicRegions(state.world).filter(r=>r.id===s.regionId).length===1)');
});

test('Local point-of-interest discovery remains tied to its existing site record',()=>{
  const poiId=evalIn("state.world.region.sites.find(s=>s.type==='landmark').id");
  evalIn(`irRecordDiscovery('Integration landmark','Recorded with its legacy site ID.',${JSON.stringify(poiId)},'✧')`);
  return evalIn(`state.world.journal.discoveries.some(d=>d.title==='Integration landmark'&&d.siteId===${JSON.stringify(poiId)}) && state.world.region.sites.some(s=>s.id===${JSON.stringify(poiId)} && s.pointOfInterestId) && irValidateGeographicHierarchy(state.world).ok`);
});

const failed=results.filter(r=>r.status==='FAIL');
console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length) process.exitCode=1;
