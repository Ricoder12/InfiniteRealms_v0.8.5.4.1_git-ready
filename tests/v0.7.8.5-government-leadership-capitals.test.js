'use strict';
// Run: node tests/v0.7.8.5-government-leadership-capitals.test.js
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
  'js/data/config.js', 'js/data/world.js', 'js/data/backgrounds.js', 'js/data/npcs.js',
  'js/game/02-worldgen-v0.2.js',
  'js/game/33-stable-geographic-identifiers-v0.7.5.2.js',
  'js/game/34-geographic-hierarchy-connections-v0.7.5.3.js',
  'js/game/35-world-generation-integration-v0.7.5.4.js',
  'js/game/36-save-compatibility-regression-v0.7.5.5.js',
  'js/game/50-save-compatibility-v0.7.7.8.js',
  'js/game/51-final-acceptance-v0.7.7.9.js',
  'js/game/52-political-entity-foundation-v0.7.8.2.js',
  'js/game/53-regional-hierarchy-v0.7.8.3.js',
  'js/game/54-government-leadership-capitals-v0.7.8.5.js'
]) load(relative);
const results = [];
function test(name, fn) {
  try { const result = fn(); results.push({ name, status: result ? 'PASS' : 'FAIL' }); }
  catch (error) { results.push({ name, status: 'FAIL', detail: error?.stack || String(error) }); }
}
const generate = (seed = 'GOVERNMENT-TEST') => context.generateProceduralWorld(seed);
const json = value => JSON.stringify(value);
const makePolity = (world, key, extras = {}) => context.irCreatePoliticalEntityRecord(world, {
  stableKey: key, name: `Test ${key}`, type: 'kingdom', regionIds: [world.region.id], ...extras
});
const makeState = world => ({ world, character: { name: 'Test Voyager', npcs: [
  { id: 'npc1', name: 'Mira Fen', role: 'Innkeeper' },
  { id: 'npc2', name: 'Bram Alder', role: 'Road Warden' }
] } });

test('Government type list contains the requested descriptive options', () =>
  context.IR_POLITICAL_GOVERNMENT_TYPES.join('|') === 'monarchy|council|republic|tribal-leadership|city-state-administration|other');

test('Political record factory preserves government metadata and existing capital reference', () => {
  const world = generate('GOV-FACTORY'); const capital = world.region.sites.find(s => s.type === 'settlement');
  const polity = makePolity(world, 'monarch', { governmentType: 'monarchy', governmentDescription: 'Hereditary crown', leaderNpcId: 'npc1', leaderTitle: 'Queen', capitalSiteGeoId: capital.geoId });
  return polity.governmentType === 'monarchy' && polity.governmentDescription === 'Hereditary crown' && polity.leaderNpcId === 'npc1' && polity.leaderTitle === 'Queen' && polity.capitalSiteGeoId === capital.geoId;
});

test('All supported government types validate', () => {
  const world = generate('GOV-TYPES');
  world.polities = context.IR_POLITICAL_GOVERNMENT_TYPES.map((governmentType, i) => makePolity(world, `government-${i}`, { governmentType }));
  return context.irValidatePoliticalEntities(world).ok;
});

test('Unknown government type is rejected', () => {
  const world = generate('GOV-BAD-TYPE'); world.polities = [makePolity(world, 'bad-type', { governmentType: 'absolute-telepathy' })];
  const report = context.irValidatePoliticalEntities(world);
  return !report.ok && report.errors.some(e => e.includes('unsupported governmentType'));
});

test('Government description and leader title must be strings when supplied', () => {
  const world = generate('GOV-BAD-OPTIONAL');
  world.polities = [makePolity(world, 'bad-optional', { governmentDescription: { text: 'no' }, leaderTitle: 12 })];
  const report = context.irValidatePoliticalEntities(world);
  return !report.ok && report.errors.some(e => e.includes('governmentDescription')) && report.errors.some(e => e.includes('leaderTitle'));
});

test('Complete entity resolves existing NPC name without creating another NPC', () => {
  const world = generate('GOV-COMPLETE'); const state = makeState(world);
  const capital = world.region.sites.find(s => s.type === 'settlement');
  const polity = makePolity(world, 'complete', { governmentType: 'monarchy', governmentDescription: 'A hereditary crown', capitalSiteGeoId: capital.geoId, leaderNpcId: 'npc1', leaderTitle: 'Queen' });
  world.polities = [polity];
  const beforeNpcCount = state.character.npcs.length;
  const report = context.irValidatePoliticalEntities(world, state);
  const summary = context.irGetPoliticalEntitySummary(state, polity.id);
  return report.ok && summary.name === polity.name && summary.capital.name === capital.name && summary.governmentLabel === 'Monarchy' && summary.leader.name === 'Mira Fen' && summary.leader.title === 'Queen' && state.character.npcs.length === beforeNpcCount;
});

test('Partial entity metadata remains valid without capital, government, or leader', () => {
  const world = generate('GOV-PARTIAL'); const polity = makePolity(world, 'partial'); world.polities = [polity];
  const summary = context.irGetPoliticalEntitySummary({ world, character: { npcs: [] } }, polity.id);
  return context.irValidatePoliticalEntities(world, { character: { npcs: [] } }).ok && summary.capital === null && summary.governmentType === null && summary.leader === null && summary.controlledRegionCount === null;
});

test('Entity with no capital and no ruler is valid when its geographic anchor exists', () => {
  const world = generate('GOV-NO-CAPITAL'); world.polities = [makePolity(world, 'no-capital')];
  return context.irValidatePoliticalEntities(world, makeState(world)).ok;
});

test('Optional missing government fields are not inserted as fake values', () => {
  const world = generate('GOV-MISSING-OPTIONAL'); const polity = makePolity(world, 'missing'); world.polities = [polity];
  const summary = context.irGetPoliticalEntitySummary({ world, character: { npcs: [] } }, polity.id);
  return !Object.hasOwn(polity, 'governmentType') && !Object.hasOwn(polity, 'governmentDescription') && !Object.hasOwn(polity, 'leaderNpcId') && summary.governmentDescription === null && summary.leaderStatus === 'unassigned';
});

test('Existing active NPC is referenced by ID instead of copied into political data', () => {
  const world = generate('GOV-NPC-REFERENCE'); const state = makeState(world);
  const polity = makePolity(world, 'references-existing-person', { leaderNpcId: state.character.npcs[1].id });
  world.polities = [polity];
  return context.irResolvePoliticalLeader(state, polity.leaderNpcId).npc === state.character.npcs[1] && !Object.hasOwn(polity, 'leaderName') && context.irValidatePoliticalEntities(world, state).ok;
});

test('Existing location-generated NPC is resolved through the existing v06 persistence overlay', () => {
  const world = generate('GOV-WORLD-NPC'); world.v06 = { schema: 2, changes: { 'ir06_saved-leader': { id: 'ir06_saved-leader', name: 'Saved Resident', occupation: 'Official' } }, journal: [] };
  const polity = makePolity(world, 'overlay-leader', { leaderNpcId: 'ir06_saved-leader' }); world.polities = [polity];
  const resolution = context.irResolvePoliticalLeader(world, 'ir06_saved-leader', { npcs: [] });
  return resolution.ok && resolution.npc.name === 'Saved Resident' && resolution.status === 'resolved';
});

test('Missing ruler reference is rejected when full character context is available', () => {
  const world = generate('GOV-MISSING-NPC'); world.polities = [makePolity(world, 'missing-npc', { leaderNpcId: 'npc:does-not-exist' })];
  const report = context.irValidatePoliticalEntities(world, { character: { npcs: [] } });
  return !report.ok && report.errors.some(e => e.includes('unresolved-reference'));
});

test('Duplicate NPC IDs are ambiguous and never silently cloned', () => {
  const world = generate('GOV-DUPLICATE-NPC'); const state = makeState(world); state.character.npcs.push({ id: 'npc1', name: 'Impostor' });
  const resolved = context.irResolvePoliticalLeader(state, 'npc1');
  const polity = makePolity(world, 'ambiguous-leader', { leaderNpcId: 'npc1' }); world.polities = [polity];
  const report = context.irValidatePoliticalEntities(world, state);
  return !resolved.ok && resolved.status === 'ambiguous-reference' && !report.ok && report.errors.some(e => e.includes('ambiguous-reference'));
});

test('Capital must reference a unique existing settlement', () => {
  const world = generate('GOV-CAPITAL-REF'); const polity = makePolity(world, 'capital-ref', { capitalSiteGeoId: 'geo:missing-capital' }); world.polities = [polity];
  const report = context.irValidatePoliticalEntities(world);
  return !report.ok && report.errors.some(e => e.includes('capitalSiteGeoId'));
});

test('Capital outside explicitly owned/governed territory is rejected when territory is known', () => {
  const world = generate('GOV-CAPITAL-TERRITORY');
  const polity = makePolity(world, 'territorial-polity'); world.polities = [polity];
  const childResult = context.irAddGeographicSubregion(world, world.region.id, { stableKey: 'far-away-territory', name: 'Far Away Territory', ownerPolityId: polity.id });
  const capital = world.region.sites.find(s => s.type === 'settlement'); // still in the primary region
  polity.capitalSiteGeoId = capital.geoId;
  const report = context.irValidatePoliticalEntities(world);
  return childResult.ok && !report.ok && report.errors.some(e => e.includes('outside its explicitly referenced political territory'));
});

test('Capital within an explicitly owned child region validates', () => {
  const world = generate('GOV-CAPITAL-IN-TERRITORY');
  const polity = makePolity(world, 'territorial-capital'); world.polities = [polity];
  const childResult = context.irAddGeographicSubregion(world, world.region.id, { stableKey: 'capital-territory', name: 'Capital Territory', ownerPolityId: polity.id });
  const capital = world.region.sites.find(s => s.type === 'settlement');
  capital.regionId = childResult.region.id;
  polity.capitalSiteGeoId = capital.geoId;
  const report = context.irValidatePoliticalEntities(world);
  return childResult.ok && report.ok;
});

test('Capital location is allowed when no territorial ownership data exists yet', () => {
  const world = generate('GOV-CAPITAL-UNKNOWN-TERRITORY'); const capital = world.region.sites.find(s => s.type === 'settlement');
  world.polities = [makePolity(world, 'capital-without-territory-data', { capitalSiteGeoId: capital.geoId })];
  return context.irValidatePoliticalEntities(world).ok;
});

test('Controlled region counts use only explicit owner/governor links and do not infer parentage', () => {
  const world = generate('GOV-CONTROLLED-COUNT');
  const polity = makePolity(world, 'counted-polity'); world.polities = [polity];
  const one = context.irAddGeographicSubregion(world, world.region.id, { stableKey: 'owned-region', name: 'Owned Region', ownerPolityId: polity.id });
  const two = context.irAddGeographicSubregion(world, world.region.id, { stableKey: 'governed-region', name: 'Governed Region', governingPolityId: polity.id });
  const summary = context.irGetPoliticalEntitySummary({ world, character: { npcs: [] } }, polity.id);
  return one.ok && two.ok && summary.ownedRegionCount === 1 && summary.governedRegionCount === 1 && summary.controlledRegionCount === 2 && summary.controlledRegionCountKnown;
});

test('Controlled region count is unknown rather than falsely reporting zero without explicit territory links', () => {
  const world = generate('GOV-CONTROLLED-UNKNOWN'); world.polities = [makePolity(world, 'unknown-control')];
  const summary = context.irGetPoliticalEntitySummary({ world, character: { npcs: [] } }, world.polities[0].id);
  return summary.controlledRegionCount === null && summary.controlledRegionCountKnown === false;
});

test('Capital and leader summary lookup is non-mutating', () => {
  const world = generate('GOV-SUMMARY-NONMUTATING'); const state = makeState(world); const capital = world.region.sites.find(s => s.type === 'settlement');
  const polity = makePolity(world, 'summary', { capitalSiteGeoId: capital.geoId, leaderNpcId: 'npc1', governmentType: 'council' }); world.polities = [polity];
  const before = json({ world, character: state.character });
  const summary = context.irGetPoliticalEntitySummary({ world, character: state.character }, polity.id);
  return !!summary && before === json({ world, character: state.character });
});

test('Repeated save normalization preserves capital, government, and leader references', () => {
  const world = generate('GOV-NORMALIZATION'); const state = makeState(world); const capital = world.region.sites.find(s => s.type === 'settlement');
  const polity = makePolity(world, 'roundtrip', { capitalSiteGeoId: capital.geoId, governmentType: 'council', governmentDescription: 'A small elected council', leaderNpcId: 'npc2', leaderTitle: 'First Speaker' });
  world.polities = [polity];
  const once = context.normalizeSave(state); const twice = context.normalizeSave(once);
  const saved = twice.world.polities[0];
  const report = context.irValidatePoliticalEntities(twice.world, twice);
  return report.ok && saved.id === polity.id && saved.capitalSiteGeoId === capital.geoId && saved.governmentType === 'council' && saved.governmentDescription === 'A small elected council' && saved.leaderNpcId === 'npc2' && saved.leaderTitle === 'First Speaker';
});

test('No NPC, site, route, or geographic registry is created by leadership metadata', () => {
  const world = generate('GOV-NO-DUPLICATES'); const state = makeState(world); const capital = world.region.sites.find(s => s.type === 'settlement');
  const sitesBefore = json(world.region.sites), routesBefore = json(world.region.routes), geoBefore = json(world.geography), npcBefore = json(state.character.npcs);
  world.polities = [makePolity(world, 'metadata-only', { capitalSiteGeoId: capital.geoId, governmentType: 'republic', leaderNpcId: 'npc1' })];
  context.irGetPoliticalEntitySummary(state, world.polities[0].id);
  return json(world.region.sites) === sitesBefore && json(world.region.routes) === routesBefore && json(world.geography) === geoBefore && json(state.character.npcs) === npcBefore;
});

test('Summary returns null for missing or ambiguous political IDs', () => {
  const world = generate('GOV-SUMMARY-MISSING'); const polity = makePolity(world, 'ambiguous'); world.polities = [polity, { ...polity }];
  return context.irGetPoliticalEntitySummary(world, 'missing') === null && context.irGetPoliticalEntitySummary(world, polity.id) === null;
});

const failed = results.filter(result => result.status === 'FAIL');
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, tests: results }, null, 2));
if (failed.length) process.exitCode = 1;
