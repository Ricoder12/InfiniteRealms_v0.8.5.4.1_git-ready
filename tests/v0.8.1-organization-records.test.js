'use strict';
// Run: node tests/v0.8.1-organization-records.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { console, Object, Array, String, Number, Math, Set };
context.IR_V05_FACTION_DEFS = {
  adventurers: { name: "Adventurers' Guild", desc: 'Existing guild.', req: 'Settlement' },
  merchants: { name: 'Merchant Consortium', desc: 'Existing trade group.', req: 'Market' },
  shadow: { name: 'Shadow Network', desc: 'Existing criminal network.', req: 'Contact' },
  arcanum: { name: 'Circle of the Arcanum', desc: 'Existing magical order.', req: 'Library' },
  royal: { name: 'Regional Authority', desc: 'Existing civic authority.', req: 'Work board' }
};
context.normalizeSave = input => JSON.parse(JSON.stringify(input));
context.generateProceduralWorld = () => world();
vm.createContext(context);
for (const file of ['js/game/61-faction-foundation-v0.8.0.js', 'js/game/62-organization-records-v0.8.1.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const world = () => ({
  id: 'world:fixture', seed: 'fixture', polities: [{ id: 'polity:kingdom', name: 'Existing Kingdom' }],
  region: { id: 'region:fixture', sites: [
    { id: 'city', geoId: 'site:city', type: 'settlement', settlementType: 'city', services: ['guild', 'market', 'library'], routes: [] },
    { id: 'town', geoId: 'site:town', type: 'settlement', settlementType: 'town', services: ['market'], routes: [] },
    { id: 'gang', geoId: 'site:gang', type: 'settlement', settlementType: 'village', services: [], changes: { criminalIntel: { type: 'gangs', status: 'confirmed' } }, routes: [] }
  ], routes: [] }
});

const generated = world();
const result = context.ir081EnsureOrganizationRecords(generated);
assert.equal(result.ok, true);
assert.deepEqual(Array.from(generated.organizations, record => record.organizationType).sort(), [
  'adventurers-guild', 'criminal-organization', 'magical-order', 'merchant-company'
].sort());
assert.equal(generated.organizations.filter(record => record.organizationType === 'merchant-company').length, 1);
assert.equal(generated.organizations.some(record => record.organizationType === 'monster-clan'), false);
assert.equal(generated.organizations.some(record => record.factionId === 'polity:kingdom'), false);
assert.equal(generated.organizations.every(record => generated.region.sites.some(site => site.geoId === record.locationGeoId)), true);
assert.equal(context.ir081ValidateOrganizations(generated).ok, true);
const snapshot = JSON.stringify(generated.organizations);
assert.equal(context.ir081EnsureOrganizationRecords(generated).created, undefined);
assert.equal(JSON.stringify(generated.organizations), snapshot);
const generatedWorldA = context.generateProceduralWorld('stable-seed');
const generatedWorldB = context.generateProceduralWorld('stable-seed');
assert.equal(JSON.stringify(generatedWorldA.organizations), JSON.stringify(generatedWorldB.organizations));

const empty = { ...world(), organizations: [] };
assert.equal(context.ir081EnsureOrganizationRecords(empty).ok, true);
assert.equal(empty.organizations.length, 0);
const malformed = { ...world(), organizations: { invalid: true } };
assert.equal(context.ir081EnsureOrganizationRecords(malformed).ok, false);
assert.deepEqual(malformed.organizations, { invalid: true });
const invalidRef = world();
invalidRef.organizations = [{ id: 'organization:world:fixture:faction:adventurers:site-3a', factionId: 'faction:adventurers', organizationType: 'adventurers-guild', name: 'Guild', locationGeoId: 'site:missing' }];
assert.equal(context.ir081ValidateOrganizations(invalidRef).ok, false);
const typeMismatch = world();
typeMismatch.organizations = [{ id: 'organization:world:fixture:bad', factionId: 'faction:adventurers', organizationType: 'merchant-company', name: 'Wrong Type' }];
assert.equal(context.ir081ValidateOrganizations(typeMismatch).ok, false);

const migrated = context.normalizeSave({ character: { name: 'Saved' }, world: world() });
const migratedAgain = context.normalizeSave(migrated);
assert.equal(migrated.world.organizationRegistryVersion, 1);
assert.equal(JSON.stringify(migratedAgain.world.organizations), JSON.stringify(migrated.world.organizations));
assert.equal(migrated.world.region.sites.length, 3);
assert.equal(migrated.world.polities[0].id, 'polity:kingdom');
console.log('v0.8.1 organization record tests: PASS');
