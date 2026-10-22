'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = { console, Math, String, Array, Object, Map, Set, Number, JSON, RegExp,
  clamp: (n, min, max) => Math.max(min, Math.min(max, n)), normalizeSave: input => input, state: null };
vm.createContext(context);
for (const relative of [
  'js/data/world.js', 'js/data/backgrounds.js', 'js/game/02-worldgen-v0.2.js',
  'js/game/33-stable-geographic-identifiers-v0.7.5.2.js',
  'js/game/34-geographic-hierarchy-connections-v0.7.5.3.js',
  'js/game/52-political-entity-foundation-v0.7.8.2.js',
  'js/game/53-regional-hierarchy-v0.7.8.3.js'
]) vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });

const results = [];
function test(name, fn) { try { results.push({ name, status: fn() ? 'PASS' : 'FAIL' }); } catch (error) { results.push({ name, status: 'FAIL', detail: error.message }); } }
const generate = seed => context.generateProceduralWorld(seed);
const clone = value => JSON.parse(JSON.stringify(value));
const valid = () => generate('GEO-INTEGRITY-792');

test('New-world generation produces stable unique geographic IDs and required site fields', () => {
  const world = valid(), report = context.irValidateGeographicHierarchy(world);
  return report.ok && context.irValidateGeographicIds(world).ok && world.region.sites.length > 0 &&
    world.region.sites.every(site => site.id && site.geoId && site.regionId && site.name && site.type && site.biomeId && Number.isFinite(site.x) && Number.isFinite(site.y));
});
test('Missing required site fields and unresolved biome IDs are reported', () => {
  const world = valid();
  delete world.region.sites[0].name;
  world.region.sites[1].biomeId = 'biome:missing';
  world.region.sites[2].x = Number.NaN;
  const report = context.irValidateGeographicHierarchy(world);
  return !report.ok && report.errors.some(error => error.includes('required name')) && report.errors.some(error => error.includes('unresolved biomeId')) && report.warnings.some(warning => warning.includes('optional x coordinate'));
});
test('Repeated generation and validation leave valid world bytes unchanged', () => {
  const first = valid(), second = valid(), before = JSON.stringify(first);
  return JSON.stringify(first) === JSON.stringify(second) && context.irValidateGeographicHierarchy(first).ok && JSON.stringify(first) === before;
});
test('Existing-world hierarchy ensure preserves valid IDs, relationships, route records, and political references', () => {
  const world = valid(), before = JSON.stringify({ id: world.id, region: world.region, sites: world.region.sites, routes: world.region.routes, geography: world.geography });
  const region = context.irAddGeographicSubregion(world, world.region.id, { stableKey: 'west', name: 'West' }).region;
  if (!region || !context.irAssignLocationRegion(world, world.region.sites[0].id, region.id).ok) return false;
  world.polities = [{ id: 'polity:one', name: 'One', type: 'kingdom' }];
  region.ownerPolityId = 'polity:one';
  const preserved = JSON.stringify({ id: world.id, routes: world.region.routes, siteGeoIds: world.region.sites.map(site => site.geoId), assignedRegion: world.region.sites[0].regionId, owner: region.ownerPolityId });
  context.irEnsureGeographicHierarchy(world);
  return context.irValidateGeographicHierarchy(world).ok && JSON.stringify({ id: world.id, routes: world.region.routes, siteGeoIds: world.region.sites.map(site => site.geoId), assignedRegion: world.region.sites[0].regionId, owner: region.ownerPolityId }) === preserved && before.length > 0;
});
test('Duplicate location, geographic-region, continent, and country IDs are reported', () => {
  const world = valid();
  world.region.sites[1].geoId = world.region.sites[0].geoId;
  world.region.subregions = [{ id: 'region:duplicate', name: 'A', parentRegionId: world.region.id }, { id: 'region:duplicate', name: 'B', parentRegionId: world.region.id }];
  world.continents = [{ id: 'continent:same' }, { id: 'continent:same' }];
  world.countries = [{ id: 'country:same' }, { id: 'country:same' }];
  const report = context.irValidateGeographicHierarchy(world);
  return !report.ok && report.errors.some(error => error.includes('Duplicate location geoId')) && report.errors.some(error => error.includes('Duplicate geographic region ID')) && report.errors.some(error => error.includes('Duplicate continent id')) && report.errors.some(error => error.includes('Duplicate country id'));
});
test('Missing parent references, self-parenting, and object cycles fail validation without throwing', () => {
  const world = valid(), child = { id: 'region:child', name: 'Child', parentRegionId: 'missing' };
  world.region.subregions = [child];
  let missing = context.irValidateGeographicHierarchy(world);
  if (missing.ok || !missing.errors.some(error => error.includes('parentRegionId'))) return false;
  child.parentRegionId = child.id;
  let self = context.irValidateGeographicHierarchy(world);
  if (self.ok) return false;
  child.parentRegionId = world.region.id; child.subregions = [child];
  const cycle = context.irValidateGeographicHierarchy(world);
  return !cycle.ok && cycle.errors.some(error => /Repeated or circular/.test(error));
});
test('Missing route targets, self-connections, invalid distances, and contradictory legacy endpoints fail', () => {
  const base = valid(), scenarios = [];
  for (const mutate of [
    world => { world.region.routes[0].toGeoId = 'site:missing'; },
    world => { world.region.routes[0].toGeoId = world.region.routes[0].fromGeoId; world.region.routes[0].b = world.region.routes[0].a; },
    world => { world.region.routes[0].distanceKm = -1; },
    world => { world.region.routes[0].distanceKm = Number.NaN; },
    world => { world.region.routes[0].a = 9; }
  ]) { const world = clone(base); mutate(world); scenarios.push(!context.irValidateGeographicHierarchy(world).ok); }
  return scenarios.every(Boolean);
});
test('Duplicate and contradictory local/global route records are reported without repair', () => {
  const duplicate = clone(valid()), first = duplicate.region.routes[0];
  duplicate.region.routes.push({ ...first, geoId: 'route:duplicate' });
  const duplicateReport = context.irValidateGeographicHierarchy(duplicate);
  const mismatch = clone(valid()), edge = mismatch.region.routes[0];
  mismatch.region.sites[edge.a].routes.find(route => route.to === mismatch.region.sites[edge.b].id).distanceKm += 1;
  const before = JSON.stringify(mismatch.region.sites[edge.a].routes);
  const mismatchReport = context.irValidateGeographicHierarchy(mismatch);
  return !duplicateReport.ok && duplicateReport.errors.some(error => error.includes('Duplicate connection endpoints')) && !mismatchReport.ok && mismatchReport.errors.some(error => error.includes('distanceKm')) && JSON.stringify(mismatch.region.sites[edge.a].routes) === before;
});
test('A genuinely disconnected location remains valid', () => {
  const world = valid(), isolated = world.region.sites.find(site => site.id !== world.siteId);
  world.region.routes = world.region.routes.filter(edge => edge.fromGeoId !== isolated.geoId && edge.toGeoId !== isolated.geoId);
  isolated.routes = [];
  for (const site of world.region.sites) site.routes = site.routes.filter(route => route.to !== isolated.id);
  return context.irValidateGeographicHierarchy(world).ok && isolated.routes.length === 0;
});
test('Missing optional collections are safe; malformed optional collections produce diagnostics, not exceptions', () => {
  const world = valid();
  delete world.known; delete world.visited; delete world.journal;
  delete world.region.sites[0].x; delete world.region.sites[0].y;
  const optionalReport = context.irValidateGeographicHierarchy(world);
  if (!optionalReport.ok || !optionalReport.warnings.some(warning => warning.includes('optional x coordinate'))) return false;
  world.known = {}; world.journal = { discoveries: {} };
  const report = context.irValidateGeographicHierarchy(world);
  return !report.ok && report.errors.some(error => error.includes('known')) && report.errors.some(error => error.includes('discoveries'));
});
test('Political ownership remains separate from physical routes and hierarchy', () => {
  const world = valid(), region = context.irAddGeographicSubregion(world, world.region.id, { stableKey: 'south', name: 'South' }).region;
  world.polities = [{ id: 'polity:one', name: 'One', type: 'kingdom' }];
  region.ownerPolityId = 'polity:one';
  const before = JSON.stringify(world.region.routes);
  const result = context.irAssignLocationRegion(world, world.region.sites[0].id, region.id);
  return result.ok && context.irValidateGeographicHierarchy(world).ok && JSON.stringify(world.region.routes) === before && region.ownerPolityId === 'polity:one';
});

const failed = results.filter(result => result.status === 'FAIL');
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, tests: results }, null, 2));
if (failed.length) process.exitCode = 1;
