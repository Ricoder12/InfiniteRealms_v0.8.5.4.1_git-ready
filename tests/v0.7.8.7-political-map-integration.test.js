'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/game/56-political-map-integration-v0.7.8.7.js'), 'utf8');

function buildWorld() {
  const root = { id: 'geo-root', name: 'Emberfall Vale', parentRegionId: null, subregions: [] };
  const r1 = { id: 'geo-kingdom', name: 'Crownmarch', parentRegionId: root.id, subregions: [], ownerPolityId: 'polity-crown', governingPolityId: 'polity-crown' };
  const r2 = { id: 'geo-council', name: 'Glass Coast', parentRegionId: root.id, subregions: [], ownerPolityId: 'polity-glass', governingPolityId: 'polity-glass' };
  const r3 = { id: 'geo-unclaimed', name: 'Unclaimed Reach', parentRegionId: root.id, subregions: [], ownerPolityId: null, governingPolityId: null, territorialStatus: 'unclaimed' };
  root.subregions.push(r1, r2, r3);
  const sites = [
    { id: 's1', geoId: 'site-s1', name: 'Ashcombe', type: 'settlement', regionId: r1.id, x: 10, y: 12, visits: 1 },
    { id: 's2', geoId: 'site-s2', name: 'Glasshaven', type: 'settlement', regionId: r2.id, x: 25, y: 25, visits: 1 },
    { id: 's3', geoId: 'site-s3', name: 'Old Reach', type: 'landmark', regionId: r3.id, x: 45, y: 35, visits: 1 },
    { id: 's4', geoId: 'site-s4', name: 'Unknown Hollow', type: 'settlement', regionId: root.id, x: 65, y: 45, visits: 1 },
    { id: 's5', geoId: 'site-s5', name: 'Hidden Capital', type: 'settlement', regionId: r2.id, x: 85, y: 60, visits: 0 }
  ];
  root.sites = sites; root.routes = [{ id: 'route-s1-s2', a: 's1', b: 's2', from: 's1', to: 's2', distanceKm: 10 }];
  const world = { id: 'world-test', seed: 'seed-test', region: root, siteId: 's1', known: sites.map(s => s.id), visited: ['s1','s2','s3','s4'], polities: [
    { id: 'polity-crown', name: 'Crownmarch Kingdom', type: 'kingdom', regionIds: [r1.id], capitalSiteGeoId: 'site-s1', governmentType: 'monarchy', governmentDescription: 'A hereditary crown' },
    { id: 'polity-glass', name: 'Glass Coast Council', type: 'city-state', regionIds: [r2.id], capitalSiteGeoId: 'site-s5' }
  ] };
  return { world, root, regions: [r1,r2,r3], sites };
}
function harness() {
  const fixture = buildWorld();
  const context = {
    console, document: { title: '' }, state: { world: fixture.world, character: { npcs: [] } },
    esc: value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    irGetGeographicRegions(world) { const out=[]; function visit(region){if(!region)return;out.push(region);(region.subregions||[]).forEach(visit)} visit(world?.region); return out; },
    irResolveLocationRegion(world, site) { const all=[]; function visit(region){if(!region)return;all.push(region);(region.subregions||[]).forEach(visit)} visit(world?.region); const id=site.regionId || world.region.id; const matches=all.filter(r=>r.id===id); return matches.length===1?{ok:true,region:matches[0],status:'resolved'}:{ok:false,status:'unresolved-region-reference'}; },
    irGetPoliticalEntitySummary(worldOrState, id) { const w=worldOrState.world || worldOrState; const polity=w.polities.find(p=>p.id===id); if(!polity)return null; const all=[]; function visit(region){if(!region)return;all.push(region);(region.subregions||[]).forEach(visit)} visit(w.region); const regions=all.filter(r=>r.ownerPolityId===id||r.governingPolityId===id); const capital=w.region.sites.find(s=>s.geoId===polity.capitalSiteGeoId); return {id:polity.id,name:polity.name,type:polity.type,governmentType:polity.governmentType||null,governmentLabel:polity.governmentType==='monarchy'?'Monarchy':null,governmentDescription:polity.governmentDescription||null,capital:capital?{geoId:capital.geoId,name:capital.name,site:capital}:null,leader:null,leaderStatus:'unassigned',controlledRegionCount:regions.length,controlledRegionCountKnown:regions.length>0}; },
    ir0772RenderWorldAtlas() { return '<main><div class="baseline-atlas">ATLAS BASE</div></main>'; },
    ir0772RenderRegionalMap(model) { return `<section class="ir0773-regional-panel"><button class="world-node ir0773-map-node visited" data-action="ir0772-inspect-location" data-site="s1" data-geo-id="site-s1"><span class="node-label">Ashcombe</span></button><button class="world-node ir0773-map-node visited" data-action="ir0772-inspect-location" data-site="s3" data-geo-id="site-s3"><span class="node-label">Old Reach</span></button></section>`; },
    ir0773RenderLocalView() { return '<section class="ir0773-local-panel">LOCAL BASE</section>'; },
    ir0773SelectedRecord(model) { return model.sites.find(s=>s.id===model.world.siteId) || model.current; },
    shell(html) { return String(html); }, renderTitle(html) { return String(html); }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: '56-political-map-integration-v0.7.8.7.js' });
  return { context, ...fixture };
}

const {context,world,root,regions,sites} = harness();
let before = JSON.stringify(world);
let rendered = context.ir0787WorldPoliticalPanel(world);
assert.match(rendered, /Crownmarch Kingdom/);
assert.match(rendered, /Glass Coast Council/);
assert.match(rendered, /♛ Capital · Ashcombe/);
assert.match(rendered, /Capital recorded · location not yet charted/);
assert.match(rendered, /Confirmed unclaimed areas/);
assert.match(rendered, /Unclaimed Reach/);
assert.match(rendered, /borders are drawn only when explicit boundary geometry exists/i);
assert.doesNotMatch(rendered, /Hidden Capital/); // undiscovered capital name must remain hidden
assert.doesNotMatch(rendered, /data-action=/); // political card is informational only
assert.equal(JSON.stringify(world), before); // render has no world mutation

const model = { world, sites, current: sites[0], region: root, knownIds: new Set(world.known), visitedIds: new Set(world.visited) };
const regional = context.ir0787RegionalPoliticalPanel(model);
assert.match(regional, /Geographic region/);
assert.match(regional, /Crownmarch/);
assert.match(regional, /Monarchy/);
assert.doesNotMatch(regional, /data-action=/);

const nodes = context.ir0787AnnotateRegionalNodes(`<section><button class="world-node visited" data-action="ir0772-inspect-location" data-site="s1" data-geo-id="site-s1"><span class="node-label">Ashcombe</span></button><button class="world-node visited" data-action="ir0772-inspect-location" data-site="s5" data-geo-id="site-s5"><span class="node-label">Known terrain area</span></button></section>`, model);
assert.match(nodes, /ir0787-map-capital/);
assert.match(nodes, /ir0787-map-affiliation/);
assert.doesNotMatch(nodes, /Hidden Capital/);
assert.equal(JSON.stringify(world), before);

// Known unclaimed and unknown are distinct; a missing owner must not be labeled unclaimed.
world.siteId = 's3';
const unclaimed = context.ir0787RegionalPoliticalPanel(model);
assert.match(unclaimed, /Confirmed unclaimed territory/);
world.siteId = 's4';
const unknown = context.ir0787RegionalPoliticalPanel(model);
assert.match(unknown, /Ownership not recorded/);
assert.doesNotMatch(unknown, /Confirmed unclaimed territory/);

// A malformed owner reference is surfaced as unresolved and cannot impersonate a valid entity.
regions[2].ownerPolityId = 'missing-polity';
const unresolved = context.ir0787SitePolitics(sites[2], context.ir0787MapContext(world));
assert.equal(unresolved.status, 'unresolved-owner');
regions[2].ownerPolityId = null;

// Site ownership is an explicit optional override supported by the map model.
const ownershipBefore = JSON.stringify(world);
sites[0].ownerPolityId = 'polity-glass';
assert.equal(context.ir0787SitePolitics(sites[0], context.ir0787MapContext(world)).owner.id, 'polity-glass');
sites[0].ownerPolityId = 'missing-site-owner';
assert.equal(context.ir0787SitePolitics(sites[0], context.ir0787MapContext(world)).status, 'unresolved-owner');
delete sites[0].ownerPolityId;
assert.equal(JSON.stringify(world), ownershipBefore);

console.log('v0.7.8.7 political map integration tests: passed');
