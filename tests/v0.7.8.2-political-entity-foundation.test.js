'use strict';
// Run: node tests/v0.7.8.2-political-entity-foundation.test.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = {
  console,
  Math,
  String,
  Array,
  Object,
  Map,
  Set,
  Number,
  JSON,
  RegExp,
  Date,
  clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
  clone: value => JSON.parse(JSON.stringify(value)),
  // A pass-through normalizer lets the real geographic save wrappers and v0.7.8.2's own
  // additive defaulting be isolated without booting the full DOM/gameplay application.
  normalizeSave: input => JSON.parse(JSON.stringify(input)),
  state: null
};
vm.createContext(context);
const load = relative => vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
for (const relative of [
  'js/data/config.js',
  'js/data/world.js',
  'js/data/backgrounds.js',
  'js/game/02-worldgen-v0.2.js',
  'js/game/33-stable-geographic-identifiers-v0.7.5.2.js',
  'js/game/34-geographic-hierarchy-connections-v0.7.5.3.js',
  'js/game/35-world-generation-integration-v0.7.5.4.js',
  'js/game/50-save-compatibility-v0.7.7.8.js',
  'js/game/51-final-acceptance-v0.7.7.9.js',
  'js/game/52-political-entity-foundation-v0.7.8.2.js'
]) load(relative);
const results = [];
function test(name, fn) {
  try { const result = fn(); results.push({ name, status: result ? 'PASS' : 'FAIL' }); }
  catch (error) { results.push({ name, status: 'FAIL', detail: error?.stack || String(error) }); }
}
const generate = (seed = 'POLITY-FOUNDATION-TEST') => context.generateProceduralWorld(seed);
const json = value => JSON.stringify(value);
const baseWorld = generate();
const settlement = baseWorld.region.sites.find(site => site.type === 'settlement');
const record = (world, stableKey, extras = {}) => context.irCreatePoliticalEntityRecord(world, {
  stableKey, name: `Test ${stableKey}`, type: 'kingdom', regionIds: [world.region.id], ...extras
});

test('Generated world gains an empty polity registry without seeded political content', () =>
  Array.isArray(baseWorld.polities) && baseWorld.polities.length === 0 && Array.isArray(baseWorld.countries) && baseWorld.countries.length === 0 && Array.isArray(baseWorld.continents) && baseWorld.continents.length === 0);

test('Stable political IDs depend on world ID and logical key, not display name or array position', () => {
  const id = context.irPoliticalEntityId(baseWorld.id, 'western-crown');
  return !!id && id === context.irPoliticalEntityId(baseWorld.id, 'western-crown') && id !== context.irPoliticalEntityId(baseWorld.id, 'eastern-crown') && id !== context.irPoliticalEntityId('another-world', 'western-crown') && id.startsWith('polity:');
});

test('All five sovereign/entity types are supported by the registry validator', () => {
  const world = generate('POLITY-TYPES');
  world.polities = context.IR_POLITICAL_ENTITY_TYPES.map((type, index) => context.irCreatePoliticalEntityRecord(world, {
    stableKey: `entity-${index}`, name: `Entity ${index}`, type, regionIds: [world.region.id]
  }));
  const report = context.irValidatePoliticalEntities(world);
  return context.IR_POLITICAL_ENTITY_TYPES.join('|') === 'country|kingdom|empire|city-state|tribal-territory' && report.ok && report.counts.polities === 5;
});

test('Minimal valid record accepts missing optional description, capital, and governing entity', () => {
  const world = generate('POLITY-OPTIONAL');
  world.polities = [record(world, 'minimal')];
  const polity = world.polities[0];
  const report = context.irValidatePoliticalEntities(world);
  return report.ok && !('description' in polity) && !('capitalSiteGeoId' in polity) && !('governingEntityId' in polity);
});

test('Valid capital references an existing settlement by stable geoId', () => {
  const world = generate('POLITY-CAPITAL');
  const town = world.region.sites.find(site => site.type === 'settlement');
  world.polities = [record(world, 'capital', { capitalSiteGeoId: town.geoId, description: 'A minimal test polity.' })];
  return context.irValidatePoliticalEntities(world).ok && world.polities[0].capitalSiteGeoId === town.geoId;
});

test('Duplicate political IDs are reported and records are not silently removed', () => {
  const world = generate('POLITY-DUPLICATE');
  const first = record(world, 'dup');
  world.polities = [first, { ...first, name: 'Duplicate' }];
  const report = context.irValidatePoliticalEntities(world);
  return !report.ok && report.errors.some(message => message.includes('Duplicate political entity id')) && world.polities.length === 2;
});

test('Unsupported entity types are rejected; unclaimed territory is not a polity type', () => {
  const world = generate('POLITY-UNCLAIMED');
  world.polities = [record(world, 'unclaimed', { type: 'unclaimed-region' })];
  const report = context.irValidatePoliticalEntities(world);
  return !report.ok && report.errors.some(message => message.includes('unsupported type')) && !context.IR_POLITICAL_ENTITY_TYPES.includes('unclaimed-region');
});

test('Invalid region references are rejected', () => {
  const world = generate('POLITY-BAD-REGION');
  world.polities = [record(world, 'bad-region', { regionIds: ['region:missing'] })];
  const report = context.irValidatePoliticalEntities(world);
  return !report.ok && report.errors.some(message => message.includes('unresolved regionId'));
});

test('Invalid, ambiguous, or non-settlement capital references are rejected', () => {
  const world = generate('POLITY-BAD-CAPITAL');
  const wilderness = world.region.sites.find(site => site.type !== 'settlement');
  world.polities = [record(world, 'bad-capital', { capitalSiteGeoId: 'site:missing' })];
  const missing = context.irValidatePoliticalEntities(world);
  world.polities[0].capitalSiteGeoId = wilderness.geoId;
  const nonSettlement = context.irValidatePoliticalEntities(world);
  return !missing.ok && missing.errors.some(message => message.includes('capitalSiteGeoId')) && !nonSettlement.ok && nonSettlement.errors.some(message => message.includes('not an existing settlement'));
});

test('Missing geographic anchors are rejected without requiring optional capital/governing fields', () => {
  const world = generate('POLITY-NO-ANCHOR');
  world.polities = [context.irCreatePoliticalEntityRecord(world, { stableKey: 'anchorless', name: 'Anchorless', type: 'kingdom' })];
  const report = context.irValidatePoliticalEntities(world);
  return !report.ok && report.errors.some(message => message.includes('must reference an existing geographic region or settlement'));
});

test('Missing and invalid governing references are rejected', () => {
  const world = generate('POLITY-GOVERNING');
  world.polities = [record(world, 'vassal', { governingEntityId: 'polity:missing' })];
  const report = context.irValidatePoliticalEntities(world);
  return !report.ok && report.errors.some(message => message.includes('unresolved/ambiguous governingEntityId'));
});

test('Governing relationships allow mixed entity types and reject cycles/self-governance', () => {
  const valid = generate('POLITY-GOVERNING-VALID');
  const empire = record(valid, 'empire', { type: 'empire' });
  const cityState = record(valid, 'city-state', { type: 'city-state', governingEntityId: empire.id });
  valid.polities = [empire, cityState];
  const good = context.irValidatePoliticalEntities(valid);
  const cyclic = generate('POLITY-GOVERNING-CYCLE');
  const a = record(cyclic, 'a', { type: 'kingdom', governingEntityId: context.irPoliticalEntityId(cyclic.id, 'b') });
  const b = record(cyclic, 'b', { type: 'empire', governingEntityId: a.id });
  cyclic.polities = [a, b];
  const bad = context.irValidatePoliticalEntities(cyclic);
  const selfWorld = generate('POLITY-GOVERNING-SELF');
  const self = record(selfWorld, 'self', { type: 'kingdom' });
  self.governingEntityId = self.id;
  selfWorld.polities = [self];
  const selfReport = context.irValidatePoliticalEntities(selfWorld);
  return good.ok && !bad.ok && bad.errors.some(message => message.includes('Circular governingEntityId chain')) && !selfReport.ok && selfReport.errors.some(message => message.includes('cannot govern itself'));
});

test('World generation keeps stable geographic IDs and route records unchanged apart from additive empty registry', () => {
  const sameBefore = vm.runInContext("ir0782GenerateBase('POLITY-DETERMINISM')", context);
  const sameAfter = generate('POLITY-DETERMINISM');
  const simplify = world => ({ id: world.id, siteId: world.siteId, sites: world.region.sites.map(site => ({ id: site.id, geoId: site.geoId, regionId: site.regionId })), routes: world.region.routes.map(route => ({ geoId: route.geoId, fromGeoId: route.fromGeoId, toGeoId: route.toGeoId, a: route.a, b: route.b })) });
  return json(simplify(sameBefore)) === json(simplify(sameAfter)) && sameAfter.polities.length === 0 && sameAfter.region.sites.length === 49;
});

test('Polity registry does not duplicate physical locations, routes, or geography indexes', () => {
  const world = generate('POLITY-NO-DUPLICATE-GEOGRAPHY');
  const before = json({ sites: world.region.sites, routes: world.region.routes, geography: world.geography });
  world.polities.push(record(world, 'single-entity', { capitalSiteGeoId: settlement?.geoId }));
  const after = json({ sites: world.region.sites, routes: world.region.routes, geography: world.geography });
  return before === after && world.region.sites.length === 49 && world.polities.length === 1;
});

test('Older save missing polities loads with an empty registry and preserves geographic IDs', () => {
  const world = generate('POLITY-LEGACY-SAVE');
  delete world.polities;
  const originalIds = world.region.sites.map(site => site.geoId);
  const normalized = context.normalizeSave({ version: 2, world, marker: 'legacy', character: { name: 'Legacy' } });
  return Array.isArray(normalized.world.polities) && normalized.world.polities.length === 0 && json(normalized.world.region.sites.map(site => site.geoId)) === json(originalIds) && normalized.world.siteId === world.siteId;
});

test('Existing valid polity records survive repeated save normalization unchanged', () => {
  const world = generate('POLITY-SAVE-ROUNDTRIP');
  const polity = record(world, 'saved-kingdom', { capitalSiteGeoId: world.region.sites.find(site => site.type === 'settlement').geoId, description: 'Saved entity', governingEntityId: null });
  world.polities = [polity];
  const save = { version: 2, world, character: { name: 'Saved' } };
  const once = context.normalizeSave(save);
  const twice = context.normalizeSave(once);
  return context.irValidatePoliticalEntities(once.world).ok && context.irValidatePoliticalEntities(twice.world).ok && json(twice.world.polities) === json(once.world.polities) && twice.world.polities[0].id === polity.id;
});

test('Invalid registry container safely defaults to empty without touching geographic IDs', () => {
  const world = generate('POLITY-MALFORMED-REGISTRY');
  const ids = world.region.sites.map(site => site.geoId);
  world.polities = { not: 'an array' };
  const normalized = context.normalizeSave({ version: 2, world, character: { name: 'Saved' } });
  return Array.isArray(normalized.world.polities) && normalized.world.polities.length === 0 && json(normalized.world.region.sites.map(site => site.geoId)) === json(ids);
});

const failed = results.filter(result => result.status === 'FAIL');
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, tests: results }, null, 2));
if (failed.length) process.exitCode = 1;
