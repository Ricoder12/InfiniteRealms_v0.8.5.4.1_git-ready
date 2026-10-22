'use strict';
// Run: node tests/v0.7.8.3-regional-hierarchy.test.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = {
  console, Math, String, Array, Object, Map, Set, Number, JSON, RegExp, Date,
  clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
  clone: value => JSON.parse(JSON.stringify(value)),
  normalizeSave: input => JSON.parse(JSON.stringify(input)),
  state: null
};
vm.createContext(context);
const load = relative => vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
for (const relative of [
  'js/data/config.js', 'js/data/world.js', 'js/data/backgrounds.js',
  'js/game/02-worldgen-v0.2.js',
  'js/game/33-stable-geographic-identifiers-v0.7.5.2.js',
  'js/game/34-geographic-hierarchy-connections-v0.7.5.3.js',
  'js/game/35-world-generation-integration-v0.7.5.4.js',
  'js/game/36-save-compatibility-regression-v0.7.5.5.js',
  'js/game/50-save-compatibility-v0.7.7.8.js',
  'js/game/51-final-acceptance-v0.7.7.9.js',
  'js/game/52-political-entity-foundation-v0.7.8.2.js',
  'js/game/53-regional-hierarchy-v0.7.8.3.js',
  'js/game/58-political-geography-integrity-v0.7.9.5.js'
]) load(relative);
const results = [];
function test(name, fn) {
  try { const detail = fn(); results.push({ name, status: detail ? 'PASS' : 'FAIL' }); }
  catch (error) { results.push({ name, status: 'FAIL', detail: error?.stack || String(error) }); }
}
const generate = seed => context.generateProceduralWorld(seed || 'REGIONAL-HIERARCHY-TEST');
const json = value => JSON.stringify(value);
const add = (world, parentId, key, extra = {}) => context.irAddGeographicSubregion(world, parentId, { stableKey: key, name: `Region ${key}`, ...extra });
const polity = (world, key, type = 'kingdom') => context.irCreatePoliticalEntityRecord(world, { stableKey: key, name: `Polity ${key}`, type, regionIds: [world.region.id] });

const initial = generate('REGIONAL-BASELINE');
test('Existing primary region remains the canonical geographic and route container', () =>
  initial.region.id === `region:${initial.id}:primary` && initial.region.sites.length === 49 && Array.isArray(initial.region.routes) && initial.geography.regionIds.includes(initial.region.id));
test('New worlds default to no subregions and no political owner/government', () =>
  Array.isArray(initial.region.subregions) && initial.region.subregions.length === 0 && initial.region.ownerPolityId === null && initial.region.governingPolityId === null && initial.region.parentRegionId === null);
test('Region stable IDs depend on world ID and logical key, not names or array positions', () => {
  const a = context.irGeoRegionId(initial.id, 'north-coast');
  return a === context.irGeoRegionId(initial.id, 'north-coast') && a !== context.irGeoRegionId(initial.id, 'south-coast') && a !== context.irGeoRegionId('different-world', 'north-coast') && a.startsWith(`region:${initial.id}:sub:`);
});
test('Subregion creation stores one metadata record and an explicit parent reference', () => {
  const world = generate('REGIONAL-ADD');
  const sitesBefore = json(world.region.sites), routesBefore = json(world.region.routes);
  const result = add(world, world.region.id, 'north-march');
  return result.ok && result.region.parentRegionId === world.region.id && world.region.subregions[0] === result.region && world.geography.regionIds.includes(result.region.id) && !('sites' in result.region) && !('routes' in result.region) && json(world.region.sites) === sitesBefore && json(world.region.routes) === routesBefore;
});
test('Nested subregions can have a parent below the primary region', () => {
  const world = generate('REGIONAL-NESTED');
  const parent = add(world, world.region.id, 'highlands');
  const child = add(world, parent.region.id, 'eastern-highlands');
  const report = context.irValidateRegionalHierarchy(world);
  return parent.ok && child.ok && child.region.parentRegionId === parent.region.id && context.irGetGeographicRegions(world).length === 3 && report.ok;
});
test('Duplicate region IDs are rejected without adding a second region', () => {
  const world = generate('REGIONAL-DUPLICATE');
  const result = add(world, world.region.id, 'duplicate-key');
  const duplicate = context.irCreateGeographicRegionRecord(world, { id: world.region.id, name: 'Duplicate root', stableKey: 'ignored' });
  const rejected = context.irAddGeographicSubregion(world, world.region.id, duplicate);
  return result.ok && !rejected.ok && world.region.subregions.length === 1 && context.irValidateRegionalHierarchy(world).ok;
});
test('Geographic parent reference must match structural nesting', () => {
  const world = generate('REGIONAL-BAD-PARENT');
  const result = add(world, world.region.id, 'misparented');
  result.region.parentRegionId = 'region:missing-parent';
  const report = context.irValidateRegionalHierarchy(world);
  return !report.ok && report.errors.some(error => error.includes('parentRegionId does not match'));
});
test('Missing optional parent reference defaults to the containing parent during normalization', () => {
  const world = generate('REGIONAL-MISSING-PARENT');
  const result = add(world, world.region.id, 'default-parent');
  delete result.region.parentRegionId;
  context.irEnsureRegionalHierarchy(world);
  return result.region.parentRegionId === world.region.id && context.irValidateRegionalHierarchy(world).ok;
});
test('Locations resolve to explicit child regions while remaining in the single canonical site registry', () => {
  const world = generate('REGIONAL-SITE-ASSIGN');
  const child = add(world, world.region.id, 'silver-vale');
  const site = world.region.sites.find(item => item.type === 'settlement');
  const sitesBefore = world.region.sites.length, routesBefore = json(world.region.routes);
  const assigned = context.irAssignLocationRegion(world, site.geoId, child.region.id);
  const resolved = context.irResolveLocationRegion(world, site.id);
  return child.ok && assigned.ok && resolved.ok && resolved.region.id === child.region.id && resolved.regionId === child.region.id && sitesBefore === 49 && world.region.sites.length === sitesBefore && json(world.region.routes) === routesBefore && world.region.sites.filter(item => item.geoId === site.geoId).length === 1;
});
test('Missing location regionId safely resolves to the primary region for legacy data', () => {
  const world = generate('REGIONAL-LEGACY-ASSIGN');
  const site = world.region.sites[0]; delete site.regionId;
  const direct = context.irResolveLocationRegion(world, site.geoId);
  context.irEnsureRegionalHierarchy(world);
  return direct.ok && direct.status === 'primary-region-default' && direct.region.id === world.region.id && site.regionId === world.region.id && context.irValidateRegionalHierarchy(world).ok;
});
test('Explicit unresolved location regionId remains untouched and is reported', () => {
  const world = generate('REGIONAL-UNRESOLVED-SITE');
  const site = world.region.sites[0]; site.regionId = 'region:does-not-exist';
  context.irEnsureRegionalHierarchy(world);
  const direct = context.irResolveLocationRegion(world, site.geoId);
  const report = context.irValidateRegionalHierarchy(world);
  return direct.status === 'unresolved-region-reference' && site.regionId === 'region:does-not-exist' && !report.ok && report.errors.some(error => error.includes('unresolved/ambiguous regionId'));
});
test('Valid nested regional assignments do not create a false save-migration change', () => {
  const world = generate('REGIONAL-SAVE-UNCHANGED');
  const child = add(world, world.region.id, 'unchanged-child');
  const site = world.region.sites[0];
  site.regionId = child.region.id;
  const save = { version: 2, character: { name: 'No-op regional save' }, world };
  const migration = context.ir0755PrepareSaveInput(save);
  return child.ok && migration.changed === false && migration.notices.length === 0 && migration.input.world.region.sites[0].regionId === child.region.id;
});
test('Save preparation preserves only uniquely valid nested region assignments', () => {
  const world = generate('REGIONAL-SAVE-PREP');
  const child = add(world, world.region.id, 'save-prep-region');
  const validSite = world.region.sites[0];
  const invalidSite = world.region.sites[1];
  validSite.regionId = child.region.id;
  invalidSite.regionId = 'region:missing-save-reference';
  const migration = context.ir0755PrepareSaveInput({ version: 2, character: { name: 'Save prep test' }, world });
  const preparedSites = migration.input.world.region.sites;
  const preparedValid = preparedSites.find(site => site.geoId === validSite.geoId);
  const preparedInvalid = preparedSites.find(site => site.geoId === invalidSite.geoId);
  return preparedValid?.regionId === child.region.id && preparedInvalid?.regionId === migration.input.world.region.id && !migration.notices.some(notice => notice.includes(`(${child.region.id})`)) && migration.notices.some(notice => notice.includes('(region:missing-save-reference)'));
});
test('Unclaimed region resolves geographically when political refs are null', () => {
  const world = generate('REGIONAL-UNCLAIMED');
  const child = add(world, world.region.id, 'unclaimed-woods');
  const site = world.region.sites[0];
  const assigned = context.irAssignLocationRegion(world, site.id, child.region.id);
  const resolved = context.irResolveLocationRegion(world, site.id);
  return child.ok && assigned.ok && child.region.ownerPolityId === null && child.region.governingPolityId === null && resolved.ok && resolved.region.id === child.region.id && context.irValidateRegionalHierarchy(world).ok;
});
test('Separate owner and governing references validate against political entity IDs', () => {
  const world = generate('REGIONAL-POLITICAL-REFS');
  const owner = polity(world, 'local-kingdom', 'kingdom');
  const governor = polity(world, 'overkingdom', 'empire');
  world.polities = [owner, governor];
  const child = add(world, world.region.id, 'river-province', { ownerPolityId: owner.id, governingPolityId: governor.id });
  const report = context.irValidateRegionalHierarchy(world);
  const polityReport = context.irValidatePoliticalEntities(world);
  return child.ok && child.region.ownerPolityId === owner.id && child.region.governingPolityId === governor.id && report.ok && polityReport.ok;
});
test('Unresolved political owner and governor are reported without breaking geographic resolution', () => {
  const world = generate('REGIONAL-BAD-POLITICAL-REFS');
  const child = add(world, world.region.id, 'unclaimed-check');
  child.region.ownerPolityId = 'polity:missing-owner';
  child.region.governingPolityId = 'polity:missing-governor';
  const site = world.region.sites[0];
  const assigned = context.irAssignLocationRegion(world, site.geoId, child.region.id);
  const resolved = context.irResolveLocationRegion(world, site.geoId);
  const report = context.irValidateRegionalHierarchy(world);
  return child.ok && assigned.ok && resolved.ok && resolved.region.id === child.region.id && !report.ok && report.errors.some(error => error.includes('ownerPolityId')) && report.errors.some(error => error.includes('governingPolityId'));
});
test('Political foundation accepts an entity anchored to a nested geographic region', () => {
  const world = generate('REGIONAL-POLITY-ANCHOR');
  const child = add(world, world.region.id, 'polity-region');
  const p = context.irCreatePoliticalEntityRecord(world, { stableKey: 'nested-anchor', name: 'Nested Anchor Kingdom', type: 'kingdom', regionIds: [child.region.id] });
  world.polities = [p];
  return child.ok && context.irPoliticalEntityGeographicRecords(world).regionsById.has(child.region.id) && context.irValidatePoliticalEntities(world).ok;
});
test('Region assignment rejects invalid target IDs without mutating a location', () => {
  const world = generate('REGIONAL-REJECT-ASSIGN');
  const site = world.region.sites[0];
  const previous = site.regionId, routes = json(world.region.routes);
  const result = context.irAssignLocationRegion(world, site.geoId, 'region:missing');
  return !result.ok && site.regionId === previous && json(world.region.routes) === routes;
});
test('Location region assignment can repair an explicit unresolved region reference without changing routes', () => {
  const world = generate('REGIONAL-REPAIR-ASSIGN');
  const child = add(world, world.region.id, 'repaired-region');
  const site = world.region.sites[0]; site.regionId = 'region:missing-old';
  const routesBefore = json(world.region.routes);
  const result = context.irAssignLocationRegion(world, site.geoId, child.region.id);
  return child.ok && result.ok && site.regionId === child.region.id && context.irResolveLocationRegion(world, site.geoId).region.id === child.region.id && json(world.region.routes) === routesBefore;
});

test('Subregions cannot introduce duplicate site or route registries', () => {
  const world = generate('REGIONAL-NO-DUPLICATE-GEOGRAPHY');
  const result = context.irAddGeographicSubregion(world, world.region.id, { stableKey: 'bad-duplicate', name: 'Bad Duplicate', sites: [], routes: [] });
  return !result.ok && world.region.subregions.length === 0 && world.region.sites.length === 49 && world.region.routes.length > 0;
});
test('Country and continent references are validated independently of regional parentage', () => {
  const world = generate('REGIONAL-COUNTRY-REFS');
  world.continents = [{ id: 'continent:test', name: 'Test Continent' }];
  world.countries = [{ id: 'country:test', name: 'Test Country', continentId: 'continent:test' }];
  const child = add(world, world.region.id, 'named-container', { continentId: 'continent:test', countryId: 'country:test' });
  const good = context.irValidateRegionalHierarchy(world);
  child.region.countryId = 'country:missing';
  const bad = context.irValidateRegionalHierarchy(world);
  return child.ok && good.ok && !bad.ok && bad.errors.some(error => error.includes('unresolved/ambiguous countryId'));
});
test('Legacy save adds hierarchy defaults without changing valid site IDs or route records', () => {
  const world = generate('REGIONAL-LEGACY-SAVE');
  const ids = json(world.region.sites.map(site => [site.id, site.geoId]));
  const routes = json(world.region.routes);
  delete world.region.subregions; delete world.region.parentRegionId; delete world.region.ownerPolityId; delete world.region.governingPolityId;
  for (const site of world.region.sites) delete site.regionId;
  const once = context.normalizeSave({ version: 2, world, character: { name: 'Legacy' } });
  const twice = context.normalizeSave(once);
  return Array.isArray(twice.world.region.subregions) && twice.world.region.parentRegionId === null && json(twice.world.region.sites.map(site => [site.id, site.geoId])) === ids && json(twice.world.region.routes) === routes && twice.world.region.sites.every(site => site.regionId === twice.world.region.id) && twice.world.geography.regionIds.includes(twice.world.region.id);
});
test('Accepted-save reuse gate no longer rejects valid nested regional assignments', () => {
  const world = generate('REGIONAL-REUSE-GATE');
  const child = add(world, world.region.id, 'reuse-gate-child');
  const site = world.region.sites[0];
  const assigned = context.irAssignLocationRegion(world, site.geoId, child.region.id);
  const originalRegionId = site.regionId;
  const save = { version: 2, world, character: { name: 'Reuse Gate' } };
  const pending = context.ir0754ReusableSavedWorld(save);
  return child.ok && assigned.ok && !!pending && pending.world === world && site.regionId === originalRegionId && originalRegionId === child.region.id;
});

test('Repeated normalization preserves nested region IDs, regional assignments, and political references', () => {
  const world = generate('REGIONAL-ROUNDTRIP');
  const p = polity(world, 'roundtrip'); world.polities = [p];
  const child = add(world, world.region.id, 'roundtrip-region', { ownerPolityId: p.id });
  const site = world.region.sites[0];
  const assigned = context.irAssignLocationRegion(world, site.geoId, child.region.id);
  const once = context.normalizeSave({ version: 2, world, character: { name: 'Roundtrip' } });
  const twice = context.normalizeSave(once);
  return assigned.ok && context.irValidateRegionalHierarchy(twice.world).ok && context.irValidatePoliticalEntities(twice.world).ok && twice.world.region.subregions[0].id === child.region.id && twice.world.region.subregions[0].ownerPolityId === p.id && twice.world.region.sites[0].regionId === child.region.id && json(twice.world.region.routes) === json(world.region.routes);
});
test('Same-seed generation remains deterministic and creates no ungrounded political or subregion content', () => {
  const a = generate('REGIONAL-DETERMINISM'); const b = generate('REGIONAL-DETERMINISM');
  const simplify = world => ({ id: world.id, regionId: world.region.id, siteIds: world.region.sites.map(site => [site.id, site.geoId, site.regionId]), routes: world.region.routes.map(route => [route.geoId, route.fromGeoId, route.toGeoId]), subregions: world.region.subregions.map(region => region.id), polities: world.polities });
  return json(simplify(a)) === json(simplify(b)) && a.region.subregions.length === 0 && a.polities.length === 0 && context.irValidateGeographicHierarchy(a).ok;
});
test('Malformed subregions container is reported rather than silently discarded', () => {
  const world = generate('REGIONAL-MALFORMED-CHILDREN');
  world.region.subregions = { invalid: true };
  context.irEnsureRegionalHierarchy(world);
  const report = context.irValidateRegionalHierarchy(world);
  return !report.ok && !Array.isArray(world.region.subregions) && report.errors.some(error => error.includes('invalid subregions container'));
});
test('Old geographic validator accepts child regional assignments while preserving route validation', () => {
  const world = generate('REGIONAL-LEGACY-VALIDATOR');
  const child = add(world, world.region.id, 'validator-child');
  const site = world.region.sites[2];
  const assignment = context.irAssignLocationRegion(world, site.geoId, child.region.id);
  const report = context.irValidateGeographicHierarchy(world);
  return assignment.ok && report.ok && report.regionalCounts.regions === 2 && report.regionalCounts.sites === 49;
});
test('Optional site owner references must resolve to one political entity while sites and routes remain unchanged', () => {
  const world = generate('POLITICAL-SITE-OWNER-REF');
  const entity = polity(world, 'site-owner'); world.polities = [entity];
  const site = world.region.sites[0]; site.ownerPolityId = entity.id;
  const physical = json({ sites: world.region.sites.map(s => [s.id, s.geoId, s.biomeId, s.regionId]), routes: world.region.routes });
  const valid = context.irValidateRegionalHierarchy(world).ok;
  const roundTrip = context.normalizeSave({ version: 2, world, character: { name: 'Owner Reference' } });
  const retained = roundTrip.world.polities[0].id === entity.id && roundTrip.world.region.sites[0].ownerPolityId === entity.id;
  site.ownerPolityId = 'region:missing-owner';
  const invalid = context.irValidateRegionalHierarchy(world);
  return valid && retained && !invalid.ok && invalid.errors.some(error => error.includes('ownerPolityId')) &&
    json({ sites: world.region.sites.map(s => [s.id, s.geoId, s.biomeId, s.regionId]), routes: world.region.routes }) === physical;
});
test('Political entity IDs cannot collide with geographic region IDs', () => {
  const world = generate('POLITICAL-GEO-ID-COLLISION');
  const colliding = context.irCreatePoliticalEntityRecord(world, { id: world.region.id, name: 'Invalid Cross-Domain ID', type: 'kingdom', regionIds: [world.region.id] });
  world.polities = [colliding]; world.region.ownerPolityId = colliding.id;
  const report = context.irValidatePoliticalEntities(world);
  return !report.ok && report.errors.some(error => error.includes('collides with a political entity ID'));
});
test('A polity may have no assigned territory, capital, or ruler when its geographic anchor exists', () => {
  const world = generate('POLITICAL-OPTIONAL-CAPITAL-LEADER');
  const entity = polity(world, 'unassigned-entity'); world.polities = [entity];
  return context.irValidatePoliticalEntities(world).ok && world.region.ownerPolityId === null &&
    !Object.prototype.hasOwnProperty.call(entity, 'capitalSiteGeoId') && !Object.prototype.hasOwnProperty.call(entity, 'leaderNpcId');
});

const failed = results.filter(result => result.status === 'FAIL');
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, tests: results }, null, 2));
if (failed.length) process.exitCode = 1;
