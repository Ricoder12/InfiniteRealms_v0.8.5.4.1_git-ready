'use strict';
// Stable geographic ID tests. Run: node tests/v0.7.5.2-stable-geographic-identifiers.test.js
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = { console, Math, String, Array, Object, Map, Set, Number, JSON, RegExp,
  clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
  normalizeSave: input => input,
  state: null };
vm.createContext(context);
for (const relative of ['js/data/world.js', 'js/data/backgrounds.js', 'js/game/02-worldgen-v0.2.js', 'js/game/33-stable-geographic-identifiers-v0.7.5.2.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
}
const results = [];
function test(name, fn) { try { const result = fn(); results.push({ name, status: result ? 'PASS' : 'FAIL' }); } catch (e) { results.push({ name, status: 'FAIL', detail: e.message }); } }
const generate = (seed='GEO-ID-TEST') => context.generateProceduralWorld(seed);
const json = value => JSON.stringify(value);

test('World, primary region, all sites, and all global routes receive stable IDs', () => { const w=generate(); return !!w.id && !!w.region.id && w.region.sites.every(s=>!!s.geoId) && w.region.routes.every(r=>!!r.geoId && !!r.fromGeoId && !!r.toGeoId); });
test('Identifier layer does not change generated layout, biome, risk, or route properties', () => { const base=vm.runInContext("ir0752GenerateBase('LAYOUT-COMPAT')",context), patched=generate('LAYOUT-COMPAT'); const clean=w=>{ const out=JSON.parse(JSON.stringify(w)); delete out.id; delete out.geographicIdVersion; delete out.region.id; out.region.sites.forEach(s=>{delete s.geoId; s.routes.forEach(r=>{delete r.geoId;delete r.toGeoId;});}); out.region.routes.forEach(r=>{delete r.geoId;delete r.fromGeoId;delete r.toGeoId;}); return out; }; return json(clean(base))===json(clean(patched)); });
test('IDs are unique within their scopes', () => { const w=generate(); return new Set(w.region.sites.map(s=>s.geoId)).size===w.region.sites.length && new Set(w.region.routes.map(r=>r.geoId)).size===w.region.routes.length; });
test('Renaming display names does not change geographic identity', () => { const w=generate(); const before=w.region.sites.map(s=>[s.id,s.geoId]); w.region.name='Renamed Region'; w.region.sites.forEach((s,i)=>s.name=`Renamed ${i}`); context.irEnsureGeographicIds(w); return before.every(([id,geoId])=>w.region.sites.find(s=>s.id===id)?.geoId===geoId) && w.region.id===`region:${w.id}:primary`; });
test('Reordering site arrays preserves IDs and stable global route resolution', () => { const w=generate(), before=new Map(w.region.sites.map(s=>[s.id,s.geoId])), routes=w.region.routes.map(r=>[r.geoId,r.fromGeoId,r.toGeoId]); w.region.sites.reverse(); context.irEnsureGeographicIds(w); return before.size===w.region.sites.length && [...before].every(([id,g])=>w.region.sites.find(s=>s.id===id)?.geoId===g) && routes.every(([id,a,b])=>{const e=w.region.routes.find(x=>x.geoId===id), resolved=context.irGeoResolveGlobalRoute(w.region,e); return e && e.fromGeoId===a && e.toGeoId===b && resolved.resolved && resolved.from.geoId===a && resolved.to.geoId===b;}); });
test('Legacy numeric route indexes and legacy site IDs remain present for compatibility', () => { const w=generate(); return w.region.routes.every(r=>Number.isInteger(r.a)&&Number.isInteger(r.b)) && w.region.sites.every(s=>/^loc-\d+-\d+$/.test(s.id)) && w.region.sites.every(s=>s.routes.every(r=>typeof r.to==='string')); });
test('Same seed reload preserves deterministic world, region, site, and route IDs', () => { const a=generate('SAME-SEED'), b=generate('SAME-SEED'); return a.id===b.id && a.region.id===b.region.id && json(a.region.sites.map(s=>s.geoId))===json(b.region.sites.map(s=>s.geoId)) && json(a.region.routes.map(r=>r.geoId))===json(b.region.routes.map(r=>r.geoId)); });
test('Different seeds receive distinct world-scoped geographic IDs', () => { const a=generate('SEED-A'),b=generate('SEED-B'); return a.id!==b.id && a.region.sites[0].geoId!==b.region.sites[0].geoId; });
test('JSON save/load round-trip preserves the assigned geographic identifiers', () => { const original=generate('ROUND-TRIP'); const restored=JSON.parse(JSON.stringify(original)); const before={world:restored.id,region:restored.region.id,sites:restored.region.sites.map(s=>s.geoId),routes:restored.region.routes.map(r=>r.geoId)}; context.irEnsureGeographicIds(restored); return restored.id===before.world && restored.region.id===before.region && json(restored.region.sites.map(s=>s.geoId))===json(before.sites) && json(restored.region.routes.map(r=>r.geoId))===json(before.routes); });
test('Legacy-shaped world receives IDs without changing location count or active location', () => { const w=generate(); for (const s of w.region.sites) delete s.geoId; delete w.id; delete w.region.id; for (const e of w.region.routes) { delete e.geoId; delete e.fromGeoId; delete e.toGeoId; } for (const s of w.region.sites) for (const r of s.routes) { delete r.geoId; delete r.toGeoId; } const current=w.siteId; context.irEnsureGeographicIds(w); return w.region.sites.length===49 && w.siteId===current && !!w.id && !!w.region.id && w.region.sites.every(s=>s.geoId) && w.region.routes.every(e=>e.geoId); });
test('Validator reports duplicate IDs and unresolved references without deleting sites', () => { const w=generate(), count=w.region.sites.length; w.region.sites[1].geoId=w.region.sites[0].geoId; w.region.routes[0].toGeoId='missing-site'; const report=context.irValidateGeographicIds(w); return !report.ok && report.errors.some(e=>e.includes('Duplicate site geoId')) && report.errors.some(e=>e.includes('invalid toGeoId')) && w.region.sites.length===count; });
test('Save-normalization wrapper attaches identifiers to a legacy-shaped world', () => { const w=generate(); delete w.id; delete w.region.id; w.region.sites.forEach(s=>delete s.geoId); const out=context.normalizeSave({world:w}); return !!out.world.id && !!out.world.region.id && out.world.region.sites.every(s=>s.geoId); });
const failed=results.filter(x=>x.status==='FAIL');
console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length) process.exitCode=1;
