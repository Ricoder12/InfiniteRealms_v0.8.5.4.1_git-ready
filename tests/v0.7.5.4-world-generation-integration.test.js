'use strict';
// v0.7.5.4 generation + save migration checks. Run: node tests/v0.7.5.4-world-generation-integration.test.js
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = {
  console: { warn() {}, log() {}, error: console.error }, Math, String, Array, Object, Map, Set, Number, JSON, RegExp,
  Date, parseInt, parseFloat,
  clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
  clone: value => JSON.parse(JSON.stringify(value)), state: null
};
vm.createContext(context);
const files = [
  'js/data/config.js', 'js/data/world.js', 'js/data/backgrounds.js', 'js/data/races.js',
  'js/data/skills.js', 'js/data/items.js', 'js/data/jobs.js', 'js/data/npcs.js', 'js/data/events.js',
  'js/game/02-worldgen-v0.2.js', 'js/game/03-stability-v0.2.1.js',
  'js/game/33-stable-geographic-identifiers-v0.7.5.2.js',
  'js/game/34-geographic-hierarchy-connections-v0.7.5.3.js',
  'js/game/35-world-generation-integration-v0.7.5.4.js'
];
for (const relative of files) vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
const results = [];
function test(name, fn) { try { const result = fn(); results.push({ name, status: result ? 'PASS' : 'FAIL' }); } catch (e) { results.push({ name, status: 'FAIL', detail: e?.stack || e.message }); } }
const generate = (seed = 'IR-0754-GENERATION', start = 'settlement') => context.generateProceduralWorld(seed, start);
const stringify = value => JSON.stringify(value);
function snapshotGameplay(world) {
  return {
    seed: world.seed, generationVersion: world.generationVersion, siteId: world.siteId,
    startCircumstance: world.startCircumstance, known: world.known, visited: world.visited,
    travelCount: world.travelCount,
    region: { name: world.region.name, biome: world.region.biome, desc: world.region.desc,
      sites: world.region.sites.map(s => ({ id:s.id,index:s.index,row:s.row,col:s.col,x:s.x,y:s.y,name:s.name,icon:s.icon,
        biomeId:s.biomeId,biome:s.biome,type:s.type,settlementType:s.settlementType,kind:s.kind,risk:s.risk,desc:s.desc,
        services:s.services,opportunities:s.opportunities,routes:s.routes,discovered:s.discovered,visits:s.visits,changes:s.changes })),
      routes: world.region.routes.map(({geoId,fromGeoId,toGeoId,directed,...edge}) => edge) },
    journal: world.journal
  };
}
function worldIsConnected(world) {
  const sites = world.region.sites, geoById = new Map(sites.map(s => [s.geoId, s]));
  if (!sites.length || sites.some(s => !s.geoId)) return false;
  const adj = new Map(sites.map(s => [s.geoId, []]));
  for (const edge of world.region.routes) {
    const a = geoById.get(edge.fromGeoId), b = geoById.get(edge.toGeoId);
    if (!a || !b || a === b) return false;
    adj.get(a.geoId).push(b.geoId); adj.get(b.geoId).push(a.geoId);
  }
  const seen = new Set([sites[0].geoId]), stack = [sites[0].geoId];
  while (stack.length) for (const next of adj.get(stack.pop()) || []) if (!seen.has(next)) { seen.add(next); stack.push(next); }
  return seen.size === sites.length;
}
function makeSave(world) {
  return { version: 2, character: { name:'Test Wayfarer', race:'human', background:'village', attrs:{}, skills:{}, inventory:{}, equipment:{}, relationships:{}, discoveries:[], npcs:[], ageMonths:240, daysLived:0, coin:20, maxHealth:100, health:100, maxEnergy:100, energy:80, hunger:80, mood:60, reputation:0, job:null, jobShifts:0 }, calendar:{day:8,month:3,year:102}, world, feed:[], view:'World', eventQueue:[], settings:{} };
}

test('Several new worlds across seeds and starting circumstances have valid geographic IDs and parent references', () => {
  const seeds = ['ASHEN-COAST','FROST-ROAD','MISTWOOD','IRON-VALLEY','TIDAL-MARCHES','SUN-UNDER-RAIN'];
  const starts = ['settlement','wilderness','remote','roadside']; let count = 0;
  for (const seed of seeds) for (const start of starts) {
    const w = generate(seed, start);
    const ids = context.irValidateGeographicIds(w), hierarchy = context.irValidateGeographicHierarchy(w);
    if (!ids.ok || !hierarchy.ok || w.region.sites.length !== 49 || w.generationIntegrationVersion !== 1) return false;
    count++;
  }
  return count === 24;
});

test('New generation is gameplay-equivalent to the v0.7.5.3 generator for the same seed', () => {
  for (const seed of ['BASELINE-A','BASELINE-B','BASELINE-C']) for (const start of ['settlement','wilderness','remote','roadside']) {
    const before = vm.runInContext(`ir0754GenerateBase(${JSON.stringify(seed)}, ${JSON.stringify(start)})`, context);
    const after = generate(seed, start);
    if (stringify(snapshotGameplay(before)) !== stringify(snapshotGameplay(after))) return false;
  }
  return true;
});

test('Same seed remains deterministic for site layout, biomes, settlement placement, and connections', () => {
  for (const seed of ['repeat-one','repeat-two','repeat-three']) {
    const a = generate(seed, 'wilderness'), b = generate(seed, 'wilderness');
    if (stringify(snapshotGameplay(a)) !== stringify(snapshotGameplay(b))) return false;
    if (stringify(a.region.sites.map(s=>s.geoId)) !== stringify(b.region.sites.map(s=>s.geoId))) return false;
  }
  return true;
});

test('Every generated travel graph is connected and route endpoint references resolve', () => {
  for (const seed of ['route-one','route-two','route-three','route-four','route-five']) {
    const w = generate(seed);
    if (!worldIsConnected(w)) return false;
    if (!w.region.routes.every(e => w.region.sites.some(s=>s.geoId===e.fromGeoId) && w.region.sites.some(s=>s.geoId===e.toGeoId))) return false;
    if (!w.region.sites.every(s => s.routes.every(r => w.region.sites.some(target=>target.id===r.to)))) return false;
  }
  return true;
});

test('Geographic integration is idempotent and does not duplicate sites, routes, or index references', () => {
  const w = generate('IDEMPOTENT-INIT');
  const before = { sites:w.region.sites.length, routes:w.region.routes.length, settlementRefs:w.geography.settlementRefs.length, poiRefs:w.geography.pointOfInterestRefs.length, connectionRefs:w.geography.connectionRefs.length };
  for (let i=0;i<4;i++) { context.irEnsureGeographicIds(w); context.irEnsureGeographicHierarchy(w); }
  return w.region.sites.length===before.sites && w.region.routes.length===before.routes && w.geography.settlementRefs.length===before.settlementRefs && w.geography.pointOfInterestRefs.length===before.poiRefs && w.geography.connectionRefs.length===before.connectionRefs && context.irValidateGeographicHierarchy(w).ok;
});

test('Valid saved v2 map is reused instead of regenerated and retains custom location and route state', () => {
  const w = generate('SAVE-MAP-REUSE');
  const selected = w.region.sites.find(s=>s.type==='wilderness');
  selected.name = 'A Saved, Renamed Clearing'; selected.customPersistentMarker = { quest:'old-watchtower', stage:3 };
  selected.discovered = true; selected.visits = 7; selected.changes.scouted = true; selected.changes.searches = 4; selected.changes.notes.push({date:'SAVE TEST',activity:'scout'});
  w.region.routes[0].customPersistentRouteState = 'bridge-repaired';
  w.region.name = 'Player-Preserved Marches';
  w.customWorldState = { weatherEvent:'quiet-rain', worldFlag:true };
  w.v06 = { npcSchedules:[{id:'town-guard-1',siteId:w.region.sites.find(s=>s.type==='settlement').id,shift:'evening'}] };
  w.known.push(selected.id); if (!w.visited.includes(selected.id)) w.visited.push(selected.id);
  w.journal.discoveries.unshift({id:'saved-discovery-unique',title:'A saved discovery',detail:'This entry should survive normalization.',siteId:selected.id,date:'SAVE TEST'});
  const originalRouteCount=w.region.routes.length, originalSiteCount=w.region.sites.length, current=w.siteId;
  const loaded=context.normalizeSave(JSON.parse(JSON.stringify(makeSave(w)))).world;
  const selectedLoaded=loaded.region.sites.find(s=>s.id===selected.id);
  return loaded.region.name==='Player-Preserved Marches' && selectedLoaded?.name==='A Saved, Renamed Clearing' && selectedLoaded.customPersistentMarker?.stage===3 && selectedLoaded.discovered===true && selectedLoaded.visits===7 && selectedLoaded.changes.scouted===true && selectedLoaded.changes.searches===4 && selectedLoaded.changes.notes.some(n=>n.date==='SAVE TEST') && loaded.region.routes[0].customPersistentRouteState==='bridge-repaired' && loaded.region.routes.length===originalRouteCount && loaded.region.sites.length===originalSiteCount && loaded.siteId===current && loaded.customWorldState?.weatherEvent==='quiet-rain' && loaded.v06?.npcSchedules?.[0]?.id==='town-guard-1' && loaded.journal.discoveries.some(d=>d.id==='saved-discovery-unique'&&d.siteId===selected.id) && context.irValidateGeographicHierarchy(loaded).ok;
});

test('A v2 save created before geography fields existed is enriched in place without replacing its sites or routes', () => {
  const w = generate('LEGACY-V2-GEO-FIELDS');
  delete w.id; delete w.region.id; delete w.geographicIdVersion; delete w.geographicHierarchyVersion; delete w.generationIntegrationVersion; delete w.geography;
  delete w.continents; delete w.countries; delete w.region.continentId; delete w.region.countryId;
  for (const s of w.region.sites) { delete s.geoId; delete s.regionId; delete s.continentId; delete s.countryId; delete s.settlementId; delete s.pointOfInterestId; for (const r of s.routes) { delete r.geoId; delete r.toGeoId; } }
  for (const e of w.region.routes) { delete e.geoId; delete e.fromGeoId; delete e.toGeoId; delete e.directed; }
  const originalIds=w.region.sites.map(s=>s.id), originalCount=w.region.routes.length;
  const loaded=context.normalizeSave(JSON.parse(JSON.stringify(makeSave(w)))).world;
  return stringify(loaded.region.sites.map(s=>s.id))===stringify(originalIds) && loaded.region.routes.length===originalCount && loaded.region.sites.every(s=>s.geoId&&s.regionId===loaded.region.id) && loaded.region.routes.every(e=>e.geoId&&e.fromGeoId&&e.toGeoId) && loaded.generationIntegrationVersion===1 && context.irValidateGeographicHierarchy(loaded).ok;
});

test('Repeated save/reload cycles do not duplicate geographic records or NPC schedule records', () => {
  let w=generate('MULTI-LOAD');
  w.v06={npcSchedules:[{id:'unique-scheduled-npc',siteId:w.region.sites[4].id,shift:'morning'}]};
  let saved=makeSave(w);
  for(let i=0;i<3;i++) { saved=context.normalizeSave(JSON.parse(JSON.stringify(saved))); }
  w=saved.world;
  const scheduleIds=w.v06.npcSchedules.map(x=>x.id);
  return w.region.sites.length===49 && new Set(w.region.sites.map(s=>s.id)).size===49 && new Set(w.region.sites.map(s=>s.geoId)).size===49 && new Set(w.region.routes.map(r=>r.geoId)).size===w.region.routes.length && scheduleIds.length===1 && scheduleIds[0]==='unique-scheduled-npc' && context.irValidateGeographicHierarchy(w).ok;
});

test('Current location, visited and known state, site discovery, and journal entries survive a normalized reload', () => {
  const w=generate('DISCOVERY-RELOAD'); const target=w.region.sites[8];
  w.siteId=target.id; target.discovered=true; target.visits=6; target.changes.temporaryCamp=true;
  w.visited=[w.region.sites[24].id,target.id]; w.known=[...new Set([...w.visited,...target.routes.map(r=>r.to)])];
  w.journal.discoveries.unshift({id:'reload-note',title:'The old trail',detail:'Saved discovery remains.',siteId:target.id,date:'RELOAD'});
  const loaded=context.normalizeSave(JSON.parse(JSON.stringify(makeSave(w)))).world;
  return loaded.siteId===target.id && stringify(loaded.visited)===stringify(w.visited) && w.known.every(id=>loaded.known.includes(id)) && loaded.region.sites.find(s=>s.id===target.id)?.discovered && loaded.region.sites.find(s=>s.id===target.id)?.visits===6 && loaded.region.sites.find(s=>s.id===target.id)?.changes.temporaryCamp && loaded.journal.discoveries.some(d=>d.id==='reload-note'&&d.siteId===target.id);
});

test('Invalid saved route endpoints reject reuse and fall back to a valid seeded world', () => {
  const w=generate('BROKEN-SAVE-FALLBACK'); w.customWorldState={shouldNotSurviveInvalidMap:true}; w.region.routes[0].toGeoId='site:missing';
  const loaded=context.normalizeSave(JSON.parse(JSON.stringify(makeSave(w)))).world;
  return loaded.generationIntegrationVersion===1 && !loaded.customWorldState && context.irValidateGeographicIds(loaded).ok && context.irValidateGeographicHierarchy(loaded).ok && loaded.region.sites.length===49;
});

test('Settlement identity and biome references remain indexes into the authoritative generated site records', () => {
  const w=generate('AUTHORITATIVE-SITES'); const siteByGeo=new Map(w.region.sites.map(s=>[s.geoId,s]));
  return w.geography.settlementRefs.every(ref=>siteByGeo.get(ref.siteGeoId)?.settlementId===ref.id && Object.keys(ref).sort().join(',')==='id,siteGeoId') && w.geography.biomeIds.every(biomeId=>w.region.sites.some(s=>s.biomeId===biomeId)) && w.region.sites.filter(s=>s.type==='settlement').length===w.geography.settlementRefs.length;
});

const failed=results.filter(result=>result.status==='FAIL');
console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length) process.exitCode=1;
