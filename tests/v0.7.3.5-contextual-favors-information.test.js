'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const patchPath = path.join(__dirname, '..', 'js', 'game', '31-contextual-favors-information-v0.7.3.5.js');
const patch = fs.readFileSync(patchPath, 'utf8');

function setup(options = {}) {
  const npc = options.npc || { id: 'npc-1', name: 'Mara', occupation: 'farmer', tier: 'ordinary', memories: [], traits: { cautious: false } };
  const state = {
    character: {
      reputation: options.reputation ?? 0, daysLived: options.day ?? 10, energy: 50, coin: 10,
      relationships: { [npc.id]: { affinity: options.affinity ?? 3, trust: options.trust ?? 2, status: options.status ?? 'acquaintance' } },
      npcs: [npc], inventory: {}, skills: {}, maxEnergy: 100
    },
    world: {
      siteId: 'town-1', region: { sites: [{ id: 'town-1', name: 'Greyhaven', biome: 'woodland', biomeId: 'woodland', risk: 20, services: ['inn'], routes: [{ to: 'road-1' }] }, { id: 'road-1', name: 'North Road', risk: 60, biome: 'woodland', biomeId: 'woodland', routes: [] }] },
      journal: { discoveries: [{ title: 'Old Watchtower', detail: 'A damaged survey says the watchtower overlooks the north road.', siteId: 'town-1' }], rumors: [{ id: 'rumor-1', title: 'A missing caravan', text: 'A caravan was last seen on a forest route.', targetId: 'road-1', resolved: false }] },
      v05: { activeEvent: { siteId: 'town-1', title: 'Roadside thieves', stage: 'warning', warning: 'Travelers report thefts near the northern fork.', escalation: 'The thieves have begun stopping caravans.' }, history: [] }
    },
    feed: [], combat: null, pendingEvent: null, hunt: null
  };
  const calls = { toast: [], feed: [], persist: 0, render: 0, action: [], reveal: [] };
  const sandbox = {
    state, console, Math, SAVE_KEY: 'ir-v0735-test', IR073_SAVE_SCHEMA: 8,
    localStorage: { setItem() {} }, modal: { kind: 'ir072-interactions', npc: npc.id },
    site: () => state.world.region.sites.find(s => s.id === state.world.siteId),
    ir072NPC: id => state.character.npcs.find(n => String(n.id) === String(id)) || null,
    ir072IsPresent: () => true, ir072Blocked: () => false,
    ir072Occupation: n => String(n?.occupation || n?.role || '').toLowerCase().includes('innkeeper') ? 'innkeeper' : String(n?.occupation || n?.role || '').toLowerCase().includes('guard') ? 'guard' : String(n?.occupation || n?.role || '').toLowerCase().includes('hunter') ? 'hunter' : String(n?.occupation || n?.role || '').toLowerCase().includes('scholar') ? 'scholar' : String(n?.occupation || n?.role || '').toLowerCase().includes('farmer') ? 'farmer' : 'resident',
    ir072RequireNPC: id => sandbox.ir072NPC(id),
    ir072Action: target => { calls.action.push(target?.dataset?.action); return false; },
    ir073ShouldRefuse: n => state.character.reputation <= -10 && sandbox.ir072Occupation(n) !== 'guard',
    ir073Rep: () => Math.max(-100, Math.min(100, Math.trunc(Number(state.character.reputation) || 0))),
    ir0733PersonalGrievance: n => String(sandbox.ir06Relationship(n)?.status || '').toLowerCase() === 'enemy' ? { kind: 'personal-rivalry', text: 'This NPC regards you as a personal enemy.' } : null,
    ir06Relationship: n => state.character.relationships[n.id] ||= { affinity: Number(n.affinity) || 0, trust: Number(n.trust) || 0, status: 'acquaintance' },
    ir06Trait: (n, trait) => !!n?.traits?.[trait],
    ir06Remember: (n, text, kind = 'memory') => {
      n.memories = Array.isArray(n.memories) ? n.memories : [];
      const day = Number(state.character.daysLived) || 0;
      if (!n.memories.some(m => Number(m.day) === day && String(m.kind) === String(kind) && String(m.text) === String(text))) n.memories.unshift({ day, kind, text });
    },
    ir072RememberAction: (n, title, detail, kind = 'conversation') => {
      sandbox.ir06Remember(n, detail, kind); sandbox.addFeed('♧', title, detail, 'social'); sandbox.persist(); sandbox.render(); sandbox.toast(title);
    },
    ir0724PersistNPC: () => {},
    addFeed: (icon, title, detail, type = 'activity') => { const f = { icon, title, detail, type }; state.feed.unshift(f); calls.feed.push(f); },
    toast: msg => calls.toast.push(String(msg)), persist: () => { calls.persist++; }, render: () => { calls.render++; },
    dayPass: () => { state.character.daysLived++; },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    IR_BIOME_ENEMIES: { woodland: ['wolf', 'spider', 'goblin'] }, IR_ENEMIES: { wolf: { name: 'Wolf' }, spider: { name: 'Spider' }, goblin: { name: 'Goblin' } },
    ir071SiteName: id => state.world.region.sites.find(s => s.id === id)?.name || 'unknown location',
    revealRumor: id => { const r = state.world.journal.rumors.find(x => x.id === id); if (r) r.resolved = true; calls.reveal.push(id); },
    ir0724TrackTarget: function (n, enemyId) { if (state.hunt) return false; state.hunt = { quality: 3, trackerNpcId: n.id, target: enemyId, targeted: true }; sandbox.addFeed('🐾', 'Hunter tracked a target', 'A target trail was recorded.', 'discovery'); return true; },
    normalizeSave: input => JSON.parse(JSON.stringify(input)), shell: inner => `VERSION 0.7.3.4 ${inner || ''}`, topbar: () => 'VERSION 0.7.3.4',
    document: undefined
  };
  vm.createContext(sandbox);
  vm.runInContext(patch, sandbox, { filename: patchPath });
  return { sandbox, state, calls, npc };
}

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS: ${name}`); }

// 1. Relevant player-help memory improves one favor, and the same record is not reused later.
test('relevant help improves one favor only once', () => {
  const n = { id: 'farmer-1', name: 'Mara', occupation: 'farmer', memories: [{ day: 2, kind: 'work', text: 'You helped Mara with farm work near Greyhaven and earned 14 coins.' }], traits: { cautious: true } };
  const x = setup({ npc: n, affinity: 3, trust: 2 });
  x.sandbox.ir06Favor(n.id);
  assert.equal(x.state.character.coin, 12, 'first favor succeeds with contextual help bonus');
  assert.ok(x.state.world.v0735.contextUses && Object.keys(x.state.world.v0735.contextUses).some(k => k.startsWith('favor:farmer-1:')));
  x.state.character.daysLived = 13;
  x.sandbox.ir06Favor(n.id);
  assert.equal(x.state.character.coin, 12, 'same memory no longer raises the second favor score');
  assert.ok(x.calls.toast.some(t => /could not help|unable to assist/i.test(t)));
});

// 2. An unresolved broken promise makes the favor harder, even with high public reputation.
test('broken promise penalizes a relevant favor without being erased by public reputation', () => {
  const n = { id: 'npc-promise', name: 'Mara', occupation: 'farmer', memories: [{ day: 3, kind: 'promise-broken', text: 'You broke a promise to Mara and left the repair work unfinished.' }], traits: {} };
  const x = setup({ npc: n, reputation: 60, affinity: 3, trust: 2 });
  x.sandbox.ir06Favor(n.id);
  assert.equal(x.state.character.coin, 10);
  assert.ok(x.state.feed.some(f => f.title === 'A favor declined' && /broken promise/i.test(f.detail)));
});

// 3. Generic gifts are not treated as meaningful help for favors.
test('unrelated gift memory does not create a favor bonus', () => {
  const n = { id: 'npc-gift', name: 'Mara', occupation: 'farmer', memories: [{ day: 4, kind: 'gift', text: 'You gave Mara a loaf of bread.' }], traits: { cautious: true } };
  const x = setup({ npc: n, affinity: 3, trust: 2 });
  x.sandbox.ir06Favor(n.id);
  assert.equal(x.state.character.coin, 10);
  assert.equal(Object.keys(x.state.world.v0735?.contextUses || {}).length, 0);
});

// 4. The helpful history of one NPC is never used to influence another NPC's favor.
test('memory on a different NPC cannot affect this NPC', () => {
  const target = { id: 'npc-target', name: 'Mara', occupation: 'farmer', memories: [], traits: { cautious: true } };
  const helper = { id: 'npc-other', name: 'Tarin', occupation: 'hunter', memories: [{ day: 2, kind: 'work', text: 'You helped Tarin with supplies for his work.' }], traits: {} };
  const x = setup({ npc: target, affinity: 3, trust: 2 });
  x.state.character.npcs.push(helper);
  x.state.character.relationships[helper.id] = { affinity: 5, trust: 4, status: 'friend' };
  x.sandbox.ir06Favor(target.id);
  assert.equal(x.state.character.coin, 10);
  assert.equal(Object.keys(x.state.world.v0735?.contextUses || {}).length, 0);
});

// 5. A severe personal grievance prevents a favor before spending energy, without blocking other NPCs.
test('serious unresolved harm can block the affected NPC favor only', () => {
  const n = { id: 'npc-harmed', name: 'Mara', occupation: 'farmer', memories: [{ day: 5, kind: 'crime', text: 'You stole from Mara and threatened her.' }], traits: {} };
  const x = setup({ npc: n, affinity: 5, trust: -2 });
  const beforeEnergy = x.state.character.energy;
  x.sandbox.ir06Favor(n.id);
  assert.equal(x.state.character.energy, beforeEnergy);
  assert.match(x.calls.toast.join(' '), /remember the personal harm/i);
});

// 6. Low trust/personal grievance can withhold optional rumor information, but does not mutate the rumor.
test('innkeeper with a personal grievance withholds optional rumor', () => {
  const n = { id: 'npc-inn', name: 'Bera', occupation: 'innkeeper', memories: [{ day: 5, kind: 'crime', text: 'You stole from Bera and hurt her.' }], traits: {} };
  const x = setup({ npc: n, affinity: 0, trust: -2 });
  const rumor = x.state.world.journal.rumors[0];
  x.sandbox.ir072Action({ dataset: { action: 'ir072-rumor', npc: n.id } });
  assert.equal(rumor.resolved, false);
  assert.deepEqual(x.calls.reveal, []);
  assert.ok(x.calls.toast.some(t => /remember|personal history/i.test(t)));
  assert.ok(n.memories.some(m => m.kind === 'contextual-refusal'));
});

// 7. A trusted guard shares current event details; unknown/low context gets only the general warning.
test('guard information is detailed only when relationship context supports it', () => {
  const trusted = { id: 'guard-1', name: 'Darin', occupation: 'guard', memories: [], traits: {} };
  const x = setup({ npc: trusted, affinity: 4, trust: 2 });
  x.sandbox.ir072Action({ dataset: { action: 'ir072-guard-info', npc: trusted.id } });
  const detailed = trusted.memories[0].text;
  assert.match(detailed, /Roadside thieves/);
  const wary = { id: 'guard-2', name: 'Oren', occupation: 'guard', memories: [{ day: 4, kind: 'crime', text: 'You threatened Oren during a dispute.' }], traits: {} };
  const y = setup({ npc: wary, affinity: 0, trust: -1 });
  y.sandbox.ir072Action({ dataset: { action: 'ir072-guard-info', npc: wary.id } });
  assert.doesNotMatch(wary.memories[0].text, /Roadside thieves|Travelers report thefts/);
  assert.match(wary.memories[0].text, /keeps the specific report private/i);
});

// 8. Trusted/helpful context expands scholar information only with data already recorded in the journal.
test('scholar detail comes from an existing record rather than invented lore', () => {
  const n = { id: 'scholar-1', name: 'Edrin', occupation: 'scholar', memories: [{ day: 1, kind: 'research', text: 'You helped Edrin research an ancient survey for the local archive.' }], traits: {} };
  const x = setup({ npc: n, affinity: 1, trust: 0 });
  x.sandbox.ir072Action({ dataset: { action: 'ir072-scholar-info', npc: n.id } });
  assert.match(n.memories[0].text, /A damaged survey says the watchtower overlooks the north road/);
  assert.ok(Object.keys(x.state.world.v0735.contextUses).some(k => k.startsWith('lore:scholar-1:')));
});

// 9. Relevant prior cooperation improves one targeted hunt lead, not every later lead.
test('relevant hunting cooperation improves one target lead once', () => {
  const n = { id: 'hunter-1', name: 'Rook', occupation: 'hunter', memories: [{ day: 2, kind: 'hunting', text: 'You helped Rook prepare supplies for a hunt and returned safely.' }], traits: {} };
  const x = setup({ npc: n, affinity: 1, trust: 0 });
  x.sandbox.ir0724TrackTarget(n, 'wolf');
  assert.equal(x.state.hunt.quality, 4);
  assert.ok(x.calls.toast.some(t => /shared history helped/i.test(t)));
  x.state.hunt = null;
  x.state.character.daysLived += 3;
  x.sandbox.ir0724TrackTarget(n, 'wolf');
  assert.equal(x.state.hunt.quality, 3);
});

// 10. Old unrelated memories are left intact by contextual decisions.
test('contextual decisions do not delete or rewrite original memory records', () => {
  const original = { day: 1, kind: 'work', text: 'You helped Mara with farm work near Greyhaven and earned 14 coins.' };
  const n = { id: 'farmer-stored', name: 'Mara', occupation: 'farmer', memories: [original], traits: { cautious: true } };
  const x = setup({ npc: n, affinity: 3, trust: 2 });
  x.sandbox.ir06Favor(n.id);
  assert.ok(n.memories.some(m => m.day === 1 && m.kind === 'work' && m.text === original.text));
});

// 11. Save normalization preserves consumed context, keeps schema 8, and advances version metadata.
test('context-use ledger persists through save normalization without changing schema', () => {
  const x = setup();
  const input = { character: { name: 'Test' }, saveSchemaVersion: 8, world: { v0734: { schema: 1, contextUses: {} }, v0735: { schema: 1, contextUses: { 'favor:npc-1:abc123': 42 } } } };
  const out = x.sandbox.normalizeSave(input);
  assert.equal(out.gameVersion, '0.7.3.5');
  assert.equal(out.saveSchemaVersion, 8);
  assert.equal(out.world.v0735.contextUses['favor:npc-1:abc123'], 42);
});

// 12. Optional rumor remains available when the relationship context supports sharing.
test('innkeeper still shares a rumor when context allows it', () => {
  const n = { id: 'npc-inn-2', name: 'Bera', occupation: 'innkeeper', memories: [], traits: {} };
  const x = setup({ npc: n, affinity: 3, trust: 2 });
  x.sandbox.ir072Action({ dataset: { action: 'ir072-rumor', npc: n.id } });
  assert.equal(x.state.world.journal.rumors[0].resolved, true);
  assert.deepEqual(x.calls.reveal, ['rumor-1']);
});

// 13. Natural-language broken-promise text is recognized even if the record kind is generic.
test('a plain-language broken promise is recognized as a personal grievance', () => {
  const n = { id: 'npc-promise-text', name: 'Mara', occupation: 'farmer', memories: [{ day: 3, kind: 'promise', text: 'You broke a promise to Mara and left the repair work unfinished.' }], traits: {} };
  const x = setup({ npc: n, reputation: 60, affinity: 3, trust: 2 });
  x.sandbox.ir06Favor(n.id);
  assert.equal(x.state.character.coin, 10);
  assert.ok(x.state.feed.some(f => f.title === 'A favor declined' && /broken promise/i.test(f.detail)));
});

// 14. A help memory can override a public-standing rumor refusal once, then cannot be repeatedly reused.
test('relevant help permits one optional rumor at low reputation, not repeated access from the same memory', () => {
  const n = { id: 'npc-inn-3', name: 'Bera', occupation: 'innkeeper', memories: [{ day: 1, kind: 'work', text: 'You helped Bera carry delivery crates to the inn.' }], traits: {} };
  const x = setup({ npc: n, reputation: -20, affinity: 0, trust: 0 });
  x.sandbox.ir072Action({ dataset: { action: 'ir072-rumor', npc: n.id } });
  assert.equal(x.state.world.journal.rumors[0].resolved, true);
  assert.ok(Object.keys(x.state.world.v0735.contextUses).some(k => k.startsWith('rumor:npc-inn-3:')));
  x.state.world.journal.rumors.push({ id: 'rumor-2', title: 'A second lead', text: 'Existing test rumor.', targetId: 'road-1', resolved: false });
  x.sandbox.ir072Action({ dataset: { action: 'ir072-rumor', npc: n.id } });
  assert.equal(x.state.world.journal.rumors[1].resolved, false);
  assert.equal(x.calls.reveal.length, 1);
  assert.ok(x.calls.toast.some(t => /public reputation/i.test(t)));
});

console.log(`v0.7.3.5 contextual favors/information tests: ${passed} checks passed`);
