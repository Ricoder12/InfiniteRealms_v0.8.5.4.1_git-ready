'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const patch = fs.readFileSync(path.join(__dirname, '..', 'js', 'game', '27-npc-memory-reliability-v0.7.3.1.js'), 'utf8');

function makeNPC(id, name, extras = {}) {
  return { id, name, occupation: 'merchant', generatedKey: 'A', memories: [], affinity: 0, trust: 0, ...extras };
}
function setup(initialState = null) {
  const state = initialState || {
    gameVersion: '0.7.3', saveSchemaVersion: 8,
    character: { daysLived: 12, relationships: {}, npcs: [], npcsByLocation: {} },
    world: { siteId: 'A', v06: { schema: 1, changes: {}, registry: {}, journal: [] } }
  };
  let location = 'A'; let duplicateA = false; let rememberCalls = 0; let persistCalls = 0;
  const sandbox = {
    state, console, Math, Map, Set, JSON,
    ir06LocKey: () => location,
    dateLabel: () => `Day ${state.character.daysLived}`,
    persist: () => { persistCalls++; },
    ir06EnsureNPCs: function() {
      if (location === 'A') {
        const first = makeNPC('npc-merchant-A', 'Mara', { generatedKey: 'A' });
        state.character.npcs = duplicateA ? [first, makeNPC('npc-merchant-A', 'Mara Duplicate', { generatedKey: 'A' })] : [first];
      } else {
        state.character.npcs = [makeNPC('npc-merchant-B', 'Tovin', { generatedKey: 'B' })];
      }
    },
    ir06Remember: function(n, text, kind = 'memory') {
      rememberCalls++;
      const entry = { date: `Day ${state.character.daysLived}`, day: state.character.daysLived, npc: n.name, text: String(text), kind };
      n.memories = Array.isArray(n.memories) ? n.memories : [];
      n.memories.unshift({ day: entry.day, text: entry.text, kind: entry.kind });
      n.memories = n.memories.slice(0, 5);
      state.world.v06.journal.unshift(entry);
      state.world.v06.journal = state.world.v06.journal.slice(0, 60);
    },
    ir06Relationship: n => state.character.relationships[n.id] ||= { affinity: Number(n.affinity) || 0, trust: Number(n.trust) || 0 },
    boot: () => 'booted',
    normalizeSave: input => JSON.parse(JSON.stringify(input))
  };
  vm.createContext(sandbox);
  vm.runInContext(patch, sandbox, { filename: '27-npc-memory-reliability-v0.7.3.1.js' });
  return {
    state, sandbox,
    setLocation(value, duplicates = false) { location = value; duplicateA = duplicates; state.world.siteId = value; },
    get rememberCalls() { return rememberCalls; },
    get persistCalls() { return persistCalls; }
  };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS: ${name}`); }

test('NPC identity, memories, affinity, and trust survive a simulated travel round-trip', () => {
  const x = setup();
  x.state.character.npcs = [makeNPC('npc-merchant-A', 'Mara', { generatedKey: 'A', memories: [{ day: 2, kind: 'help', text: 'You carried the merchant supplies.' }] })];
  x.state.character.relationships['npc-merchant-A'] = { affinity: 7, trust: 4, status: 'Friend', milestones: [] };
  x.sandbox.ir06EnsureNPCs();
  x.setLocation('B'); x.sandbox.ir06EnsureNPCs();
  assert.equal(x.state.character.npcs.length, 1);
  assert.equal(x.state.character.npcs[0].id, 'npc-merchant-B');
  x.setLocation('A'); x.sandbox.ir06EnsureNPCs();
  const mara = x.state.character.npcs.find(n => n.id === 'npc-merchant-A');
  assert.ok(mara, 'the same stable NPC ID is generated on return');
  assert.equal(mara.name, 'Mara');
  assert.equal(mara.memories[0].text, 'You carried the merchant supplies.');
  assert.equal(x.state.character.relationships['npc-merchant-A'].affinity, 7);
  assert.equal(x.state.character.relationships['npc-merchant-A'].trust, 4);
});

test('same-day identical memory is not recorded twice', () => {
  const x = setup();
  x.state.character.npcs = [makeNPC('npc-merchant-A', 'Mara')];
  x.sandbox.ir06EnsureNPCs();
  const n = x.state.character.npcs[0];
  x.sandbox.ir06Remember(n, 'You returned the missing purse.', 'help');
  x.sandbox.ir06Remember(n, 'You returned the missing purse.', 'help');
  assert.equal(n.memories.filter(m => m.kind === 'help' && m.text === 'You returned the missing purse.').length, 1);
  assert.equal(x.state.world.v06.journal.filter(m => m.kind === 'help' && m.text === 'You returned the missing purse.').length, 1);
});

test('duplicate active NPC IDs are collapsed while known memories remain', () => {
  const x = setup();
  x.state.world.v06.registry['npc-merchant-A'] = { id: 'npc-merchant-A', name: 'Mara', memories: [{ day: 1, kind: 'help', text: 'Known help.' }], affinity: 6, trust: 2 };
  x.state.character.relationships['npc-merchant-A'] = { affinity: 6, trust: 2, status: 'Friend', milestones: [] };
  x.setLocation('A', true); x.sandbox.ir06EnsureNPCs();
  assert.equal(x.state.character.npcs.filter(n => n.id === 'npc-merchant-A').length, 1);
  assert.equal(x.state.character.npcs[0].memories.some(m => m.text === 'Known help.'), true);
});

test('legacy save normalization preserves relationship and registry history', () => {
  const x = setup();
  const oldSave = {
    gameVersion: '0.7.3', saveSchemaVersion: 8,
    character: {
      daysLived: 40,
      relationships: { 'npc-merchant-A': { affinity: 9, trust: 5, status: 'Friend', milestones: ['helped'] } },
      npcs: [
        makeNPC('npc-merchant-A', 'Mara', { memories: [{ day: 3, kind: 'help', text: 'Saved memory A.' }] }),
        makeNPC('npc-merchant-A', 'Mara duplicate', { memories: [{ day: 4, kind: 'promise', text: 'Saved memory B.' }] })
      ]
    },
    world: { v06: { schema: 1, changes: {}, registry: {}, journal: [] } }
  };
  const migrated = x.sandbox.normalizeSave(oldSave);
  assert.equal(migrated.character.npcs.length, 1);
  assert.equal(migrated.character.relationships['npc-merchant-A'].affinity, 9);
  assert.equal(migrated.character.relationships['npc-merchant-A'].trust, 5);
  assert.equal(migrated.world.v06.registry['npc-merchant-A'].memories.some(m => m.text === 'Saved memory A.'), true);
  assert.equal(migrated.world.v06.registry['npc-merchant-A'].memories.some(m => m.text === 'Saved memory B.'), true);
  assert.equal(migrated.character.relationships['npc-merchant-A'].status, 'Friend');
});

console.log(`\n${passed} v0.7.3.1 checks passed.`);
