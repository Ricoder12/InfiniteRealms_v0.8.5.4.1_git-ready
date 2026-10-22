'use strict';
// v0.7.5.5 source/runtime compatibility suite. It executes the real app scripts in Node's VM;
// browser DOM rendering and genuine browser localStorage remain a separate manual check.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'backups', 'InfiniteRealms_v0.7.3.6_baseline.html');

function createContext() {
  const stored = new Map();
  const noop = () => {};
  const element = () => ({ textContent:'', innerHTML:'', title:'', style:{}, className:'', dataset:{}, appendChild:noop, remove:noop, click:noop, focus:noop, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false}, matches:()=>false, closest:()=>null });
  const document = { title:'', head:{appendChild:noop}, body:element(), addEventListener:noop, querySelector:()=>null, querySelectorAll:()=>[], getElementById:()=>null, createElement:element };
  const localStorage = { getItem:key=>stored.has(key)?stored.get(key):null, setItem:(key,value)=>stored.set(key,String(value)), removeItem:key=>stored.delete(key), _data:stored };
  const context = { console:{ warn:noop, log:noop, error:console.error }, Math:Object.create(Math), String, Array, Object, Map, Set, Number, JSON, RegExp, Date, Intl, parseInt, parseFloat,
    document, window:{scrollTo:noop, addEventListener:noop}, localStorage, setTimeout:()=>0, clearTimeout:noop, requestAnimationFrame:noop, URL, Blob:global.Blob, FileReader:function(){}, navigator:{userAgent:'Node test VM'} };
  vm.createContext(context);
  return context;
}
function loadCurrent() {
  const context = createContext();
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]).filter(f=>!f.endsWith('/27-boot.js'));
  for (const relative of scripts) vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, {filename:relative});
  vm.runInContext('render=()=>{}; toast=()=>{};', context);
  return context;
}
function loadBaseline() {
  const context = createContext();
  const html = fs.readFileSync(baselinePath, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>x.trim());
  // The final inline script is the old version's boot call; load definitions without starting UI.
  for (const [i, code] of scripts.slice(0, -1).entries()) vm.runInContext(code, context, {filename:`v0.7.3.6-inline-${i}`});
  return context;
}
function run(context, code) { return vm.runInContext(code, context); }
function same(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
const results=[];
function test(name, fn) { try { const value=fn(); results.push({name,status:value?'PASS':'FAIL'}); } catch(e) { results.push({name,status:'FAIL',detail:e?.stack||e.message}); } }

let current;
try { current=loadCurrent(); } catch(e) { console.error('Unable to load current app source sequence:',e); process.exit(1); }

test('New-world generation passes stable-ID, geographic hierarchy, biome, settlement-index, and route checks',()=>{
  run(current,"createSeed='0755-GENERATED-CHECK'; createStart='wilderness'; state=makeInitial('Map Auditor','human','village');");
  const r=run(current,'ir0755ValidateGeographicIntegrity(state.world,state.character)');
  return r.ok && r.checks.every(c=>c.status==='PASS') && run(current,'state.world.region.sites.length===49 && state.world.siteId===site().id');
});

test('A save produced by the actual v0.7.3.6 source migrates without losing valid character progression or map history',()=>{
  const old=loadBaseline();
  run(old,`createSeed='ACTUAL-V0736-SNAPSHOT'; createStart='roadside'; state=makeInitial('Legacy Cartographer','elf','ranger');`);
  const siteId=run(old,'state.world.siteId');
  run(old,`state.character.ageMonths=437; state.character.daysLived=128; state.character.coin=321; state.character.reputation=17; state.character.attrs.Intelligence=23; state.character.skills.Lore={level:12,xp:41}; state.character.inventory={journal:2,herb:7,bread:3,sword:1,leather_armor:1,shield:1}; state.character.equipment={weapon:'sword',armor:'leather_armor',offhand:'shield'}; state.character.relationships.npc1={affinity:8,trust:6,status:'Friend',milestones:['met','trusted']}; state.character.npcs[0].memories=[{day:80,kind:'help',text:'A remembered favor.'}]; state.world.region.sites.find(s=>s.id===state.world.siteId).changes.scouted=true; state.world.region.sites.find(s=>s.id===state.world.siteId).visits=5; state.world.region.name='Saved Old Borderlands'; state.world.v06={schema:2,changes:{},journal:[{id:'legacy-memory-note',day:80,kind:'help',npc:'Local Smith',text:'A remembered favor.'}],socialQuests:[],registry:{'ir06-legacy-smith':{id:'ir06-legacy-smith',name:'Local Smith',homeSite:state.world.siteId,memories:[{text:'Registry memory from v0.7.3.6 save'}]}}}; state.world.journal.discoveries.unshift({id:'legacy-unique-note',title:'Old road discovered',detail:'A pre-geography journal entry.',siteId:state.world.siteId,date:'DAY 128'}); state.world.visited.push(state.world.region.sites[2].id); state.world.known.push(state.world.region.sites[2].id);`);
  const save=run(old,'JSON.parse(JSON.stringify(state))');
  current.migrationInput=JSON.parse(JSON.stringify(save)); const out=run(current,'normalizeSave(migrationInput)');
  const snapshot=JSON.parse(JSON.stringify(out));
  const target=snapshot.world.region.sites.find(s=>s.id===siteId);
  return snapshot.character.name==='Legacy Cartographer' && snapshot.character.race==='elf' && snapshot.character.ageMonths===437 && snapshot.character.daysLived===128 && snapshot.character.coin===321 && snapshot.character.reputation===17 && snapshot.character.attrs.Intelligence===23 && snapshot.character.skills.Lore.level===12 && snapshot.character.skills.Lore.xp===41 && snapshot.character.inventory.journal===2 && snapshot.character.inventory.herb===7 && snapshot.character.equipment.weapon==='sword' && snapshot.character.equipment.armor==='leather_armor' && snapshot.character.equipment.offhand==='shield' && snapshot.character.relationships.npc1.affinity===8 && snapshot.character.relationships.npc1.trust===6 && snapshot.character.relationships.npc1.status==='Friend' && snapshot.world.v06.journal.some(m=>m.text==='A remembered favor.') && snapshot.world.v06.registry['ir06-legacy-smith'].memories.some(m=>m.text==='Registry memory from v0.7.3.6 save') && snapshot.world.region.name==='Saved Old Borderlands' && snapshot.world.siteId===siteId && target?.changes?.scouted && target?.visits>=5 && snapshot.world.journal.discoveries.some(d=>d.id==='legacy-unique-note'&&d.siteId===siteId) && snapshot.world.id && snapshot.world.region.id && run(current,`ir0755ValidateGeographicIntegrity(${JSON.stringify(snapshot.world)},${JSON.stringify(snapshot.character)}).ok`);
});

test('Repeated normalization preserves world and site IDs, custom location changes, discoveries, and route state',()=>{
  run(current,"createSeed='REPEATED-SAVE-0755'; createStart='settlement'; state=makeInitial('Repeat Tester','human','village');");
  run(current,"state.world.region.name='A Persisted Region Name'; state.world.region.routes[0].customRoadState='bridge-restored'; const t=state.world.region.sites[5]; t.name='Remembered Glade'; t.changes.scouted=true; t.visits=4; state.world.siteId=t.id; state.world.visited=[t.id]; state.world.known=[t.id]; state.world.journal.discoveries.unshift({id:'persisted-0755',title:'Persisted note',detail:'Still here',siteId:t.id,date:'SAVED'});");
  const before=run(current,'JSON.parse(JSON.stringify(state.world))');
  let out=run(current,'JSON.parse(JSON.stringify(state))');
  for(let i=0;i<3;i++) { current.savedTemp=JSON.stringify(out); out=run(current,'normalizeSave(JSON.parse(savedTemp))'); }
  const w=out.world, site=w.region.sites.find(s=>s.id===before.siteId);
  return w.region.name===before.region.name && w.siteId===before.siteId && same(w.region.sites.map(s=>[s.id,s.geoId]),before.region.sites.map(s=>[s.id,s.geoId])) && site?.name==='Remembered Glade' && site?.changes?.scouted && site?.visits===4 && w.region.routes[0].customRoadState==='bridge-restored' && w.journal.discoveries.some(d=>d.id==='persisted-0755'&&d.siteId===before.siteId) && w.region.sites.length===49 && w.region.routes.length===before.region.routes.length && run(current,'ir0755ValidateGeographicIntegrity('+JSON.stringify(w)+').ok');
});

test('Broken current pointer recovers only to the latest saved valid visited location and records the reason',()=>{
  run(current,"createSeed='RECOVER-POINTER'; state=makeInitial('Return Walker','human','village'); state.world.region.name='My Preserved Region'; state.world.visited=[state.world.region.sites[4].id,state.world.region.sites[7].id]; state.world.siteId='missing-location-xyz';");
  const input=run(current,'JSON.parse(JSON.stringify(state))');
  const expected=input.world.visited[input.world.visited.length-1];
  current.migrationInput=JSON.parse(JSON.stringify(input)); const out=run(current,'normalizeSave(migrationInput)');
  return out.world.siteId===expected && out.world.region.name==='My Preserved Region' && out.world.geographyCompatibility?.notices?.some(n=>n.includes('most recently recorded valid visited location')) && out.feed.some(f=>f.title==='Geographic save compatibility notice'&&/most recently recorded valid visited location/.test(f.detail));
});

test('Unrecoverable current pointer produces an explicit notice instead of silent location substitution',()=>{
  run(current,"createSeed='NO-RECOVERY-POINTER'; state=makeInitial('No History','human','village'); state.world.siteId='missing-nowhere'; state.world.visited=[]; state.world.known=[];");
  const input=run(current,'JSON.parse(JSON.stringify(state))');
  current.migrationInput=JSON.parse(JSON.stringify(input)); const out=run(current,'normalizeSave(migrationInput)');
  return out.world.siteId && out.world.region.sites.some(s=>s.id===out.world.siteId) && out.world.geographyCompatibility?.notices?.some(n=>n.includes('there is no valid visited location')) && out.feed.some(f=>f.title==='Geographic save compatibility notice');
});

test('Broken journal location is kept as an unresolved source reference, not reassigned to the current place',()=>{
  run(current,"createSeed='BROKEN-DISCOVERY'; state=makeInitial('Journal Keeper','human','village'); state.world.journal.discoveries.unshift({id:'broken-note',title:'Somewhere lost',detail:'Original note stays',siteId:'lost-location-999',date:'PAST'});");
  const out=run(current,'normalizeSave(JSON.parse(JSON.stringify(state)))');
  const note=out.world.journal.discoveries.find(d=>d.id==='broken-note');
  return note && note.unresolvedSiteId==='lost-location-999' && !note.siteId && out.feed.some(f=>f.title==='Geographic save compatibility notice'&&/falsely attaching it/.test(f.detail));
});

test('A stale local stable destination is repaired only when legacy route.to uniquely resolves',()=>{
  run(current,"createSeed='LOCAL-ROUTE-REPAIR'; state=makeInitial('Route Repair','human','village'); const s=state.world.region.sites[0]; s.routes[0].toGeoId='site:wrong-world:missing';");
  const input=run(current,'JSON.parse(JSON.stringify(state))');
  const from=input.world.region.sites[0], target=input.world.region.sites.find(s=>s.id===from.routes[0].to);
  current.migrationInput=JSON.parse(JSON.stringify(input)); const out=run(current,'normalizeSave(migrationInput)');
  const repaired=out.world.region.sites.find(s=>s.id===from.id).routes.find(r=>r.to===target.id);
  return repaired.toGeoId===target.geoId && out.world.region.name===input.world.region.name && out.world.geographyCompatibility?.notices?.some(n=>n.includes('stale stable destination reference')) && run(current,'ir0755ValidateGeographicIntegrity('+JSON.stringify(out.world)+').ok');
});

test('Invalid stable global route endpoint is not redirected to unrelated numeric-index endpoints',()=>{
  run(current,"createSeed='BAD-GLOBAL-ENDPOINT'; state=makeInitial('Safe Routes','human','village'); state.world.region.name='Should Not Be Reused'; state.world.region.routes[0].toGeoId='site:missing:entity';");
  const input=run(current,'JSON.parse(JSON.stringify(state))');
  current.migrationInput=JSON.parse(JSON.stringify(input)); const out=run(current,'normalizeSave(migrationInput)');
  return out.world.region.name!=='Should Not Be Reused' && out.world.geographyCompatibility?.notices?.some(n=>/unresolved stable endpoint/.test(n)) && out.feed.some(f=>f.title==='Geographic save compatibility notice') && run(current,'ir0755ValidateGeographicIntegrity('+JSON.stringify(out.world)+').ok');
});

test('Duplicate legacy location IDs are not arbitrarily merged or used to resolve a broken pointer',()=>{
  run(current,"createSeed='DUPLICATE-SITE-ID'; state=makeInitial('Duplicate Tester','human','village'); state.world.region.name='Unsafe Duplicate Map'; state.world.region.sites[1].id=state.world.region.sites[0].id; state.world.siteId=state.world.region.sites[0].id; state.world.visited=[];");
  const input=run(current,'JSON.parse(JSON.stringify(state))');
  current.migrationInput=JSON.parse(JSON.stringify(input)); const out=run(current,'normalizeSave(migrationInput)');
  return out.world.region.name!=='Unsafe Duplicate Map' && out.world.geographyCompatibility?.notices?.some(n=>/duplicate or ambiguous legacy location IDs/.test(n)) && out.feed.some(f=>f.title==='Geographic save compatibility notice');
});

test('Geographic index rebuild preserves unrelated extension fields and remains idempotent',()=>{
  run(current,"createSeed='INDEX-EXTENSIONS'; state=makeInitial('Index Keeper','human','village'); state.world.geography.futureIndexMetadata={source:'future-module',revision:4};");
  run(current,'irEnsureGeographicHierarchy(state.world); irEnsureGeographicHierarchy(state.world);');
  const w=run(current,'state.world');
  return w.geography.futureIndexMetadata?.source==='future-module' && w.geography.futureIndexMetadata.revision===4 && run(current,'ir0755ValidateGeographicIntegrity(state.world).ok') && w.region.sites.length===49;
});

test('Integrity validator detects invalid biome IDs and mismatched settlement/POI reference indexes without mutating source',()=>{
  run(current,"createSeed='CORRUPT-INTEGRITY'; state=makeInitial('Integrity Test','human','village');");
  const before=run(current,'JSON.stringify(state.world)');
  const w=run(current,'JSON.parse(JSON.stringify(state.world))');
  w.region.sites[0].biomeId='not-a-real-biome';
  w.geography.settlementRefs.push({id:'ghost-settlement',siteGeoId:'site:ghost'});
  const report=run(current,`ir0755ValidateGeographicIntegrity(${JSON.stringify(w)},null)`);
  return !report.ok && report.errors.some(e=>e.includes('invalid biomeId')) && report.errors.some(e=>e.includes('Settlement reference index')) && run(current,'JSON.stringify(state.world)')===before;
});

test('Production persist writes a real serialized save to the storage shim and normalized reload retains geographic and character state',()=>{
  run(current,"createSeed='STORAGE-ROUNDTRIP'; state=makeInitial('Storage Tester','dwarf','blacksmith'); state.character.coin=222; state.character.reputation=11; const d=state.world.region.sites[3]; d.discovered=true; d.visits=3; state.world.siteId=d.id; state.world.visited=[d.id]; state.world.known=[d.id];");
  const saved=run(current,'persist()');
  const raw=run(current,'localStorage.getItem(SAVE_KEY)');
  if(!saved||!raw) return false;
  const out=run(current,'normalizeSave(JSON.parse(localStorage.getItem(SAVE_KEY)))');
  return out.character.name==='Storage Tester' && out.character.race==='dwarf' && out.character.coin===222 && out.character.reputation===11 && out.world.siteId===run(current,'state.world.siteId') && out.world.region.sites.find(s=>s.id===out.world.siteId)?.discovered && out.world.region.sites.find(s=>s.id===out.world.siteId)?.geoId && run(current,'ir0755ValidateGeographicIntegrity('+JSON.stringify(out.world)+','+JSON.stringify(out.character)+').ok');
});

test('Character creation and thirty-day time advancement retain the current map and geographic references',()=>{
  run(current,"createSeed='TIME-AND-CREATION'; createStart='remote'; state=makeInitial('Month Tester','orc','orc_raider');");
  const before=run(current,'({age:state.character.ageMonths,days:state.character.daysLived,day:state.calendar.day,month:state.calendar.month,site:state.world.siteId,worldId:state.world.id})');
  run(current,"dayPass(30,'regression-test');");
  const after=run(current,'({age:state.character.ageMonths,days:state.character.daysLived,day:state.calendar.day,month:state.calendar.month,site:state.world.siteId,worldId:state.world.id})');
  return before.age===216 && after.age===before.age+1 && after.days===before.days+30 && after.day===before.day && after.month===before.month+1 && after.site===before.site && after.worldId===before.worldId && run(current,'ir0755ValidateGeographicIntegrity(state.world,state.character).ok');
});

test('NPC relationship, trust, memory, public reputation, inventory, equipment, and job state survive geography normalization',()=>{
  run(current,"createSeed='SOCIAL-PROGRESSION-ROUNDTRIP'; state=makeInitial('Social Tester','human','village'); const npc=state.character.npcs[0]; npc.memories=[{day:4,kind:'help',text:'Saved shared memory'}]; state.character.relationships[npc.id]={affinity:13,trust:11,status:'Companion',milestones:['friendship','companion']}; state.character.reputation=34; state.character.inventory={sword:1,leather_armor:1,shield:1,herb:4}; state.character.equipment={weapon:'sword',armor:'leather_armor',offhand:'shield'}; state.character.job='laborer'; state.character.jobShifts=6; state.world.v06=state.world.v06||{schema:2,changes:{},journal:[],socialQuests:[],registry:{}}; state.world.v06.registry['ir06-regression-npc']={id:'ir06-regression-npc',name:'Persistent Local',homeSite:state.world.siteId,workSite:state.world.region.sites[1].id,restSite:state.world.region.sites[2].id,memories:[{text:'Registry memory'}]};");
  const raw=run(current,'JSON.stringify(state)'); current.migrationInput=JSON.parse(raw); const out=run(current,'normalizeSave(migrationInput)');
  const npc=out.character.npcs.find(n=>n.id===out.character.npcs[0].id);
  return out.character.name==='Social Tester' && out.character.relationships[npc.id].affinity===13 && out.character.relationships[npc.id].trust===11 && out.character.relationships[npc.id].status==='Companion' && out.world.v06.registry['ir06-regression-npc'].memories.some(m=>m.text==='Registry memory') && out.character.reputation===34 && out.character.inventory.sword===1 && out.character.inventory.leather_armor===1 && out.character.equipment.weapon==='sword' && out.character.equipment.armor==='leather_armor' && out.character.equipment.offhand==='shield' && out.character.job==='laborer' && out.character.jobShifts===6 && out.world.v06.registry['ir06-regression-npc'].memories[0].text==='Registry memory' && run(current,'ir0755ValidateGeographicIntegrity('+JSON.stringify(out.world)+','+JSON.stringify(out.character)+').ok');
});

const failed=results.filter(r=>r.status==='FAIL');
console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length) process.exitCode=1;
