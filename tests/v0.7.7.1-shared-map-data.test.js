'use strict';
// v0.7.7.1 shared map-data preparation tests. Run: node tests/v0.7.7.1-shared-map-data.test.js
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = { console, Math, String, Array, Object, Map, Set, Number, JSON, RegExp,
  clamp: (n, min, max) => Math.max(min, Math.min(max, n)), normalizeSave: input => input, state: null };
vm.createContext(context);
for (const relative of ['js/data/config.js','js/data/world.js','js/data/backgrounds.js','js/game/02-worldgen-v0.2.js','js/game/33-stable-geographic-identifiers-v0.7.5.2.js','js/game/34-geographic-hierarchy-connections-v0.7.5.3.js','js/game/43-shared-map-data-v0.7.7.1.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
}
const results = [];
function test(name, fn) { try { results.push({ name, status: fn() ? 'PASS' : 'FAIL' }); } catch (e) { results.push({ name, status: 'FAIL', detail: e.message }); } }
const generate = (seed='MAP-DATA-TEST') => context.generateProceduralWorld(seed);
const json = value => JSON.stringify(value);

test('Shared map facade references existing world, region, site array, connection array, and biome registry', () => { const w=generate(), d=context.irMapSharedData(w); return d.world===w && d.region===w.region && d.locations===w.region.sites && d.connections===w.region.routes && d.biomes===vm.runInContext("IR_BIOMES",context); });
test('Every generated location resolves uniquely by stable geoId', () => { const w=generate(); return w.region.sites.every(s=>context.irMapLocationByGeoId(s.geoId,w)===s); });
test('Names, legacy IDs, and array positions are not accepted as stable map keys', () => { const w=generate(), s=w.region.sites[0]; return context.irMapLocationByGeoId(s.name,w)===null && context.irMapLocationByGeoId(s.id,w)===null && context.irMapLocationByGeoId('0',w)===null; });
test('Duplicate stable location IDs fail closed instead of selecting an arbitrary record', () => { const w=generate(), duplicate={...w.region.sites[0]}; w.region.sites.push(duplicate); return context.irMapLocationByGeoId(duplicate.geoId,w)===null; });
test('Every global connection resolves by stable ID and endpoints reference actual locations', () => { const w=generate(); return w.region.routes.every(e=>context.irMapConnectionByGeoId(e.geoId,w)===e && context.irMapLocationByGeoId(e.fromGeoId,w) && context.irMapLocationByGeoId(e.toGeoId,w)); });
test('Per-location connection view contains only canonical route object references incident to that location', () => { const w=generate(), s=w.region.sites[0], routes=context.irMapConnectionsForLocation(s.geoId,w); return routes.length>0 && routes.every(e=>w.region.routes.includes(e) && (e.fromGeoId===s.geoId||e.toGeoId===s.geoId)); });
test('Current, known, visited, and discovered flags read existing save fields without mutating them', () => { const w=generate(), s=w.region.sites.find(x=>x.id===w.siteId); const before=json({known:w.known,visited:w.visited,discovered:s.discovered}); const v=context.irMapLocationVisibility(s.geoId,w); return v.location===s && v.current && v.known && v.visited && v.discovered===true && json({known:w.known,visited:w.visited,discovered:s.discovered})===before; });
test('Unknown visibility references return null rather than guessing', () => { const w=generate(); return context.irMapLocationVisibility('site:missing',w)===null; });
test('Biome accessor returns the authoritative IR_BIOMES object by biomeId', () => { const w=generate(); return w.region.sites.every(s=>context.irMapBiomeForLocation(s.geoId,w)===vm.runInContext("IR_BIOMES",context)[s.biomeId]); });
test('Unknown biome IDs return null without substituting a default biome', () => { const w=generate(), s=w.region.sites[0], old=s.biomeId; s.biomeId='unknown-biome'; const result=context.irMapBiomeForLocation(s.geoId,w); s.biomeId=old; return result===null; });
test('Current coordinates are passed through unchanged and no world-scale coordinates are fabricated', () => { const w=generate(), before=json(w.region.sites.map(s=>[s.geoId,s.x,s.y,s.row,s.col])); const d=context.irMapSharedData(w); return json(d.locations.map(s=>[s.geoId,s.x,s.y,s.row,s.col]))===before && d.locations.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.y)) && !('worldX' in d.locations[0]) && !('worldY' in d.locations[0]); });
test('JSON save/load preserves location and connection IDs consumed by the shared facade', () => { const original=generate('MAP-DATA-SAVE'), restored=JSON.parse(JSON.stringify(original)); context.irEnsureGeographicHierarchy(restored); return restored.siteId===original.siteId && restored.region.sites.every((s,i)=>context.irMapLocationByGeoId(s.geoId,restored)===s && s.geoId===original.region.sites[i].geoId) && restored.region.routes.every((e,i)=>context.irMapConnectionByGeoId(e.geoId,restored)===e && e.geoId===original.region.routes[i].geoId); });
test('Empty continent/country collections stay empty; helper does not invent hierarchy entities', () => { const w=generate(), before=json([w.continents,w.countries]); context.irMapSharedData(w); return before===json([w.continents,w.countries]) && w.continents.length===0 && w.countries.length===0; });
test('Shared data module is included before application boot without adding a new map renderer', () => { const html=fs.readFileSync(path.join(root,'index.html'),'utf8'); return html.includes('js/game/43-shared-map-data-v0.7.7.1.js') && html.indexOf('43-shared-map-data-v0.7.7.1.js')<html.indexOf('js/game/27-boot.js') && !html.includes('renderWorldMapV3') && !html.includes('localMapRenderer'); });
const failed=results.filter(x=>x.status==='FAIL');
console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length) process.exitCode=1;
