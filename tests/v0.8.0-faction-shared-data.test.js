'use strict';
// Run: node tests/v0.8.0-faction-shared-data.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { console, Object, Array, String, Number, Math };
context.IR_V05_FACTION_DEFS = {
  adventurers: { name: "Adventurers' Guild", desc: 'Existing guild.', req: 'Settlement' },
  merchants: { name: 'Merchant Consortium', desc: 'Existing trade group.', req: 'Market' },
  shadow: { name: 'Shadow Network', desc: 'Existing criminal network.', req: 'Contact' },
  arcanum: { name: 'Circle of the Arcanum', desc: 'Existing magical order.', req: 'Library' },
  royal: { name: 'Regional Authority', desc: 'Existing civic authority.', req: 'Work board' }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/game/61-faction-foundation-v0.8.0.js'), 'utf8'), context);

const expected = [
  ['faction:adventurers', 'adventurers', 'adventurers-guild'],
  ['faction:merchants', 'merchants', 'merchant-company'],
  ['faction:shadow', 'shadow', 'criminal-organization'],
  ['faction:arcanum', 'arcanum', 'magical-order'],
  ['faction:royal', 'royal', 'civic-organization']
];
assert.equal(context.IR_V08_FACTION_TYPE_IDS.includes('monster-clan'), true);
for (const [id, legacyId, type] of expected) {
  const faction = context.irV08FactionById(id);
  assert.equal(faction.id, id);
  assert.equal(faction.legacyId, legacyId);
  assert.equal(faction.organizationType, type);
  assert.equal(context.irV08FactionId(legacyId), id);
}
assert.equal(context.irV08FactionById('faction:missing'), null);

const character = {
  factionMembership: 'adventurers',
  factionStanding: { adventurers: 25, merchants: -10, shadow: 0, arcanum: 4, royal: 8 },
  reputation: -55,
  relationships: { npc1: { trust: 80 } }
};
assert.equal(context.irV08ValidateFactionState(character).ok, true);
assert.equal(context.irV08FactionStanding(character, 'faction:adventurers'), 25);
assert.equal(context.irV08FactionStanding(character, 'merchants'), -10);
assert.equal(character.reputation, -55);
assert.equal(character.relationships.npc1.trust, 80);
assert.equal(context.irV08ValidateFactionState({ factionMembership: 'kingdom', factionStanding: {} }).ok, false);
assert.equal(context.irV08ValidateFactionState({ factionMembership: null, factionStanding: { adventurers: 101 } }).ok, false);
console.log('v0.8.0 faction shared-data tests: PASS');
