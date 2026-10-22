'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const patchPath = path.join(__dirname, '..', 'js', 'game', '32-feedback-antifarming-regression-v0.7.3.6.js');
const patch = fs.readFileSync(patchPath, 'utf8');

function setup(options = {}) {
  let now = 10_000;
  class TestDate extends Date { static now() { return now; } }
  const npc = options.npc || { id: 'npc-1', name: 'Mara', occupation: 'farmer', tier: 'routine', traits: [], memories: [], affinity: 0, trust: 0 };
  const state = {
    gameVersion: '0.7.3.5', saveSchemaVersion: 8,
    character: {
      reputation: options.reputation ?? 0, daysLived: options.day ?? 10, energy: 60, coin: 20, health: 100,
      maxHealth: 100, maxEnergy: 100, hunger: 80, mood: 60,
      relationships: { [npc.id]: { affinity: options.affinity ?? 0, trust: options.trust ?? 0, status: options.status ?? 'Acquaintance', milestones: [] } },
      npcs: [npc], inventory: options.inventory || {}, skills: { Social: { level: 1, xp: 0 }, Combat: { level: 1, xp: 0 } }, attrs: { Charisma: 10 },
      combatStats: { wins: 0 }, jobShifts: 0
    },
    world: {
      siteId: 'town-1', region: { sites: [{ id: 'town-1', name: 'Greyhaven', type: 'settlement', biome: 'woodland', biomeId: 'woodland', risk: 20, services: ['inn', 'market'], changes: {}, routes: [] }] },
      v06: { schema: 2, changes: {}, registry: {}, journal: [], socialQuests: [] },
      v073: { schema: 1, events: [], refusals: {}, giftCooldowns: {} }, v0734: { schema: 1, cooldowns: {}, awards: [] },
      v0735: { schema: 1, contextUses: {} }, v05: { history: [], activeEvent: null }, journal: { discoveries: [], rumors: [] }
    },
    feed: [], combat: null, pendingEvent: null, hunt: null
  };
  const calls = { toasts: [], feed: [], persist: 0, render: 0, bargain: 0, event: 0 };
  const sandbox = {
    state, console, Math, Date: TestDate, SAVE_KEY: 'ir-v0736-test', IR073_SAVE_SCHEMA: 8, IR_ENEMIES: {}, ITEMS: { bread: { name: 'Bread' }, herb: { name: 'Herb' }, charm: { name: 'Charm' }, scrap: { name: 'Scrap' } },
    localStorage: { setItem() {} }, document: undefined, modal: null,
    __advanceNow: ms => { now += ms; },
    site: () => state.world.region.sites[0],
    ir072NPC: id => state.character.npcs.find(n => String(n.id) === String(id)) || null,
    ir072IsPresent: () => true, ir072Blocked: () => false,
    ir073ShouldRefuse: n => state.character.reputation <= -10 && String(n?.occupation || '').toLowerCase() !== 'guard',
    ir073Rep: () => Math.max(-100, Math.min(100, Math.trunc(Number(state.character.reputation) || 0))),
    ir073MemoryStanding: () => 0, ir06Trait: (n, trait) => (n?.traits || []).includes(trait) || !!n?.traits?.[trait],
    ir06Relationship: n => state.character.relationships[n.id] ||= { affinity: Number(n.affinity) || 0, trust: Number(n.trust) || 0, status: 'Acquaintance', milestones: [] },
    ir062Rel: id => state.character.relationships[id] ||= { affinity: 0, trust: 0, status: 'Acquaintance', milestones: [] },
    ir06Remember: (n, text, kind = 'memory') => {
      n.memories = Array.isArray(n.memories) ? n.memories : [];
      const m = { day: Number(state.character.daysLived) || 0, date: `Day ${state.character.daysLived}`, text: String(text), kind };
      n.memories.unshift(m); n.memories = n.memories.slice(0, 5);
      const v = state.world.v06;
      v.changes[n.id] = { ...(v.changes[n.id] || {}), id: n.id, name: n.name, memories: n.memories.map(x => ({ ...x })), affinity: state.character.relationships[n.id].affinity, trust: state.character.relationships[n.id].trust };
      v.registry[n.id] = { ...(v.registry[n.id] || {}), ...v.changes[n.id] };
      v.journal.unshift({ day: m.day, npc: n.name, kind, text: m.text });
    },
    ir0731StoreNPC: n => {
      const rel = state.character.relationships[n.id];
      state.world.v06.changes[n.id] = { ...(state.world.v06.changes[n.id] || {}), id: n.id, name: n.name, affinity: rel?.affinity || 0, trust: rel?.trust || 0, memories: (n.memories || []).map(m => ({ ...m })) };
      state.world.v06.registry[n.id] = { ...(state.world.v06.registry[n.id] || {}), ...state.world.v06.changes[n.id] };
    },
    ir0724PersistNPC: () => {},
    ir06Talk: function(id) {
      const c = state.character, n = sandbox.ir072NPC(id); if (!n) return;
      const last = Number(n.lastTalkDay ?? -2); if ((Number(c.daysLived) - last) < 2) { sandbox.toast('You have recently spoken with them.'); return; }
      if (c.energy < 5) { sandbox.toast('You need 5 energy.'); return; }
      const r = sandbox.ir06Relationship(n); c.energy -= 5; c.daysLived += 1;
      r.affinity = Math.min(100, r.affinity + 2); r.trust = Math.min(100, r.trust + 2); n.affinity = r.affinity; n.trust = r.trust; n.lastTalkDay = c.daysLived;
      sandbox.ir06Remember(n, `You talked with ${n.name}. Affinity +2, trust +2. Totals: affinity ${r.affinity}, trust ${r.trust}.`, 'conversation');
      sandbox.addFeed('♧', `Talked with ${n.name}`, 'You spoke together.', 'social'); sandbox.persist(); sandbox.render(); sandbox.toast(`Spent a day talking with ${n.name}.`);
    },
    ir06Favor: function(id) { const n = sandbox.ir072NPC(id); if (!n) return; const r = sandbox.ir06Relationship(n); state.character.coin += 2; r.trust += 1; n.trust = r.trust; sandbox.ir06Remember(n, `${n.name} helped you with a small favor.`, 'favor'); sandbox.addFeed('🤝', 'Favor helped', 'Favor resolved.', 'social'); sandbox.toast('The favor worked out.'); },
    ir061SpendTime: function(id) { const n = sandbox.ir072NPC(id), r = sandbox.ir06Relationship(n); state.character.energy -= 7; state.character.daysLived++; r.affinity += 2; r.trust += 1; n.affinity = r.affinity; n.trust = r.trust; sandbox.ir06Remember(n, 'You spent a day together. Affinity +2, trust +1.', 'time-together'); sandbox.addFeed('♧', 'Time well spent', 'Grew closer.', 'social'); sandbox.toast('You spent time together.'); },
    ir061Advice: function(id) { const n = sandbox.ir072NPC(id), r = sandbox.ir06Relationship(n); state.character.energy -= 2; state.character.skills.Social.xp += 7; if (sandbox.ir06Trait(n, 'generous')) r.affinity += 1; sandbox.ir06Remember(n, 'They shared advice about social skills.', 'advice'); sandbox.addFeed('📘', 'Advice', 'Advice recorded.', 'social'); sandbox.toast('Social skill improved.'); },
    ir061TrainTogether: function(id) { const n = sandbox.ir072NPC(id), r = sandbox.ir06Relationship(n); state.character.energy -= 12; state.character.daysLived++; state.character.skills.Social.xp += 22; r.affinity += 1; r.trust += 1; n.affinity = r.affinity; n.trust = r.trust; sandbox.ir06Remember(n, 'You trained together.', 'training'); sandbox.addFeed('💪', 'Training', 'Training complete.', 'social'); sandbox.toast('Training improved.'); },
    ir061WorkTogether: function(id) { const n = sandbox.ir072NPC(id), r = sandbox.ir06Relationship(n); state.character.energy -= 10; state.character.daysLived++; state.character.coin += 3; state.character.skills.Social.xp += 15; r.affinity += 1; r.trust += 1; n.affinity = r.affinity; n.trust = r.trust; sandbox.ir06Remember(n, 'You worked together and earned 3 coins.', 'work-together'); sandbox.addFeed('🤝', 'Worked together', 'Work complete.', 'social'); sandbox.toast('You worked together and earned 3 coins.'); },
    ir062Meal: function(id) { const n = sandbox.ir072NPC(id), r = sandbox.ir062Rel(id); state.character.coin -= 3; state.character.energy -= 4; state.character.daysLived++; r.affinity += 3; r.trust += 2; n.affinity = r.affinity; n.trust = r.trust; sandbox.ir06Remember(n, 'You shared a meal together.', 'shared-meal'); sandbox.addFeed('🍲', 'A meal shared', 'Meal complete.', 'social'); sandbox.toast('The shared meal strengthened your bond.'); },
    ir062Amends: function(id) { const n = sandbox.ir072NPC(id), r = sandbox.ir062Rel(id); if (r.status !== 'Enemy' && r.affinity > -10 && r.trust > -5) { sandbox.toast('There is no serious hostility to repair.'); return; } r.affinity = Math.min(100, r.affinity + 6); r.trust = Math.min(100, r.trust + 5); if (r.affinity >= 0 && r.trust >= 0) r.status = 'Acquaintance'; sandbox.ir06Remember(n, `You tried to make amends with ${n.name}.`, 'reconciliation'); sandbox.addFeed('🕊️', 'Amends', 'Reconciliation.', 'social'); sandbox.toast('Your apology made some progress.'); },
    ir062SetStatus: function(id, status) { const n = sandbox.ir072NPC(id), r = sandbox.ir062Rel(id); const old = r.status; if (status === 'Enemy') { r.affinity = Math.min(r.affinity, -10); r.trust = Math.min(r.trust, -5); } else { r.status = status; } sandbox.ir06Remember(n, `Your relationship with ${n.name} is now: ${status}.`, 'relationship'); sandbox.addFeed('♧', 'Relationship updated', `${old} → ${status}`, 'social'); sandbox.toast(`Relationship updated: ${status}.`); },
    ir062ReportTask: function(id) { const n = sandbox.ir072NPC(id), q = state.world.v06.socialQuests.find(x => x.npcId === id && x.status === 'active'); if (!q || q.progress < q.goal) { sandbox.toast('No completed task to report.'); return; } q.status = 'complete'; state.character.coin += q.reward; const r = sandbox.ir062Rel(id); r.affinity += 4; r.trust += 3; n.affinity = r.affinity; n.trust = r.trust; sandbox.ir06Remember(n, 'You completed their personal task.', 'task-complete'); sandbox.addFeed('📜', 'Task complete', 'Task complete.', 'social'); sandbox.toast('Task complete.'); },
    ir063Special: function(id, kind) { const n = sandbox.ir072NPC(id), r = sandbox.ir062Rel(id); state.character.daysLived++; if (kind === 'bar') { state.character.coin -= 5; state.character.energy -= 6; r.affinity += 3; r.trust += 2; } else if (kind === 'campfire') { state.character.energy -= 1; r.affinity += 3; r.trust += 3; } else if (kind === 'romance') { r.affinity += 4; r.trust += 3; } else if (kind === 'mentor') { state.character.attrs.Charisma++; state.character.skills.Social.xp += 18; r.affinity += 1; r.trust += 2; } n.affinity = r.affinity; n.trust = r.trust; sandbox.ir06Remember(n, `A ${kind} activity with ${n.name}.`, `special-${kind}`); sandbox.addFeed('♧', 'Special activity', 'Activity complete.', 'social'); sandbox.toast('Your time together strengthened the relationship.'); },
    ir0724FarmWork: function(n) { const r = sandbox.ir06Relationship(n); state.character.energy -= 10; state.character.daysLived++; state.character.coin += 14; state.character.reputation += 1; r.trust += 1; n.ir0724LastFarmDay = state.character.daysLived - 1; sandbox.ir06Remember(n, `You helped ${n.name} with farm work.`, 'work'); sandbox.addFeed('🌾', 'Farm work completed', 'Farm work complete.', 'milestone'); sandbox.toast('Farm work complete.'); },
    ir0724GuardReport: function(n) { const ev = state.world.v05.activeEvent; ev.reported = true; state.character.coin += 5; state.character.reputation += 3; const r = sandbox.ir06Relationship(n); r.trust += 2; n.trust = r.trust; sandbox.ir06Remember(n, 'You reported the disturbance to the guard.', 'crime-report'); sandbox.addFeed('⚖️', 'Crime report recorded', 'Report received.', 'warning'); sandbox.toast('Crime report recorded.'); },
    ir072Bargain: function(id) { const n = sandbox.ir072NPC(id), r = sandbox.ir06Relationship(n); calls.bargain++; state.world.v072 = state.world.v072 || {}; state.world.v072.activeBargain = { npcId: id, percent: 8, use: calls.bargain }; r.trust += 1; n.trust = r.trust; sandbox.ir06Remember(n, 'Bargain accepted.', 'bargain'); sandbox.addFeed('🤝', 'Bargain accepted', 'Discount active.', 'trade'); sandbox.toast('Bargain accepted.'); },
    ir0726AttackNPC: function(n) { const npc = sandbox.ir072NPC(n?.id || n); const r = sandbox.ir06Relationship(npc); r.affinity -= 2; r.trust -= 8; state.character.reputation -= 17; state.combat = { active: true, source: { type: 'npc-assault', npcId: npc.id } }; sandbox.ir06Remember(npc, 'You assaulted this NPC; the harm remains in their personal history.', 'crime'); sandbox.addFeed('⚖️', 'Crime recorded', 'Public and personal consequences.', 'warning'); sandbox.toast('Assault started. Witnesses are present; public reputation will suffer.'); },
    irCombatEnd: function(kind) { const battle = state.combat; if (!battle) return; const src = battle.source || {}; if (src.type === 'spar') { const n = sandbox.ir072NPC(src.npcId), r = sandbox.ir06Relationship(n); r.affinity += 1; r.trust += 1; n.affinity = r.affinity; n.trust = r.trust; state.character.skills.Social.xp += 28; state.character.combatStats.wins++; state.combat = null; sandbox.ir06Remember(n, `You completed a controlled spar with ${n.name}. Respect and trust improved.`, 'sparring'); sandbox.addFeed('🥊', 'Sparring complete', 'Training complete.', 'social'); sandbox.toast('Sparring won; discipline improved.'); } else { state.character.combatStats.wins++; state.character.coin += 3; state.character.inventory.wolf_fang = (state.character.inventory.wolf_fang || 0) + 1; state.character.skills.Combat.xp += 10; state.combat = null; sandbox.addFeed('⚔️', 'Victory', 'Combat reward granted.', 'milestone'); sandbox.toast('Combat victory.'); } },
    chooseEvent: function(choice) { if (!state.pendingEvent) return; calls.event++; state.pendingEvent = null; state.character.reputation += 2; sandbox.addFeed('📦', 'Supply contract completed', 'Contract succeeded.', 'milestone'); sandbox.toast('Choice recorded.'); },
    ir0734EventRewards: { 'notice:accept': { detail: 'You completed a supply delivery that helped local stores.' } },
    ir0724NPC: id => sandbox.ir072NPC(id),
    ir0724TrackTarget: () => {}, ir0724Data: () => state.world.v0724 || (state.world.v0724 = { crimeLog: [] }),
    ir06EnsureNPCs: () => {}, ir072RequireNPC: id => sandbox.ir072NPC(id),
    actionCost: () => true, dayPass: () => { state.character.daysLived++; }, gainSkill: (skill, xp) => { state.character.skills[skill] ||= { level: 1, xp: 0 }; state.character.skills[skill].xp += xp; },
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)), addFeed: (icon, title, detail, type='activity') => { const feed = { icon, title, detail, type }; state.feed.unshift(feed); calls.feed.push(feed); },
    toast: message => calls.toasts.push(String(message)), persist: () => { calls.persist++; }, render: () => { calls.render++; },
    normalizeSave: input => JSON.parse(JSON.stringify(input)), shell: inner => `VERSION 0.7.3.5 ${inner || ''}`, topbar: () => 'VERSION 0.7.3.5',
    runAction: () => {}, IR073_SAVE_SCHEMA: 8, SAVE_KEY: 'ir-test', localStorage: { setItem(key, value) { calls.saved = JSON.parse(value); calls.savedWrites = (calls.savedWrites || 0) + 1; } }
  };
  // The harness intentionally provides just the existing callback contracts touched by this patch.
  vm.createContext(sandbox);
  vm.runInContext(patch, sandbox, { filename: patchPath });
  return { sandbox, state, calls, npc, advance(ms=500) { now += ms; } };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS: ${name}`); }

// One generic conversation source can contribute only its configured lifetime total to this NPC.
test('repeated talk rewards stop at the per-NPC cap while time/energy still behave normally', () => {
  const x = setup(); const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 4; i++) { if (i) { x.state.character.daysLived += 2; x.advance(500); } x.sandbox.ir06Talk(x.npc.id); }
  assert.equal(r.affinity, 6); assert.equal(r.trust, 6);
  assert.ok(x.state.character.daysLived >= 17, 'conversation still consumes simulated time');
  assert.ok(x.state.character.energy < 60, 'conversation still consumes energy');
  assert.match(x.calls.toasts.at(-1), /relationship benefit available|relationship-reward limit/i);
});

test('actual deltas are reported and the just-created memory matches capped values', () => {
  const x = setup({ affinity: 5, trust: 5 });
  x.state.world.v0736 = { schema: 1, earned: { 'talk:npc-1': { affinity: 5, trust: 5 } }, claims: {} };
  x.sandbox.ir06Talk(x.npc.id);
  assert.equal(x.state.character.relationships[x.npc.id].affinity, 6);
  assert.equal(x.state.character.relationships[x.npc.id].trust, 6);
  assert.match(x.npc.memories[0].text, /Affinity \+1, trust \+1\. Totals: affinity 6, trust 6\./);
  assert.match(x.calls.toasts.at(-1), /affinity \+1, trust \+1/i);
});

test('a duplicate same-action callback within the guard window does not charge twice', () => {
  const x = setup(); x.sandbox.ir06Talk(x.npc.id);
  const before = { day: x.state.character.daysLived, energy: x.state.character.energy, affinity: x.state.character.relationships[x.npc.id].affinity };
  x.sandbox.ir06Talk(x.npc.id);
  assert.equal(x.state.character.daysLived, before.day);
  assert.equal(x.state.character.energy, before.energy);
  assert.equal(x.state.character.relationships[x.npc.id].affinity, before.affinity);
  assert.match(x.calls.toasts.at(-1), /already processed/i);
});

test('a different meaningful action retains its own relationship allowance after talk reaches its cap', () => {
  const x = setup(); const r = x.state.character.relationships[x.npc.id];
  x.state.world.v0736 = { schema: 1, earned: { 'talk:npc-1': { affinity: 6, trust: 6 } }, claims: {} };
  x.sandbox.ir061SpendTime(x.npc.id);
  assert.equal(r.affinity, 2); assert.equal(r.trust, 1);
  assert.match(x.calls.toasts.at(-1), /affinity \+2, trust \+1/i);
});

test('each gift item type contributes only once to a given NPC', () => {
  const x = setup({ inventory: { bread: 2 } }); const r = x.state.character.relationships[x.npc.id];
  x.sandbox.ir06Gift(x.npc.id); const first = { affinity: r.affinity, trust: r.trust };
  x.state.character.daysLived += 3; x.advance(500); x.sandbox.ir06Gift(x.npc.id);
  assert.equal(x.state.character.inventory.bread, 1, 'repeating the already-recorded gift does not consume another item');
  assert.deepEqual({ affinity: r.affinity, trust: r.trust }, first);
  x.state.character.inventory.herb = 1; x.state.character.daysLived += 3; x.advance(500); x.sandbox.ir06Gift(x.npc.id);
  assert.equal(x.state.character.inventory.herb, 0, 'a distinct gift type remains eligible');
  assert.ok(r.affinity > first.affinity || r.trust > first.trust);
  assert.ok(Object.keys(x.state.world.v0736.claims).some(k => /gift:npc-1:bread/.test(k)));
  assert.ok(Object.keys(x.state.world.v0736.claims).some(k => /gift:npc-1:herb/.test(k)));
});

test('favor trust rewards have a finite per-NPC limit while favor payments remain intact', () => {
  const x = setup(); const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 8; i++) { if (i) { x.state.character.daysLived += 3; x.advance(500); } x.sandbox.ir06Favor(x.npc.id); }
  assert.equal(r.trust, 4);
  assert.equal(x.state.character.coin, 36, 'all eight successful favors retain their existing coin reward');
});

test('spending time caps relationship gains without cancelling time and energy costs', () => {
  const x = setup(); const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 8; i++) { if (i) x.advance(500); x.sandbox.ir061SpendTime(x.npc.id); }
  assert.equal(r.affinity, 6); assert.equal(r.trust, 4);
  assert.equal(x.state.character.energy, 4, 'all successful sessions retain their energy cost');
});

test('training-together gains stop at their limit but skill practice still accumulates', () => {
  const x = setup({ affinity: 1, trust: 1 }); const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 8; i++) { if (i) x.advance(500); x.sandbox.ir061TrainTogether(x.npc.id); }
  assert.equal(r.affinity, 5); assert.equal(r.trust, 5);
  assert.equal(x.state.character.skills.Social.xp, 176);
});

test('shared meals stop farming relationship points but keep charging for each real meal', () => {
  const x = setup(); const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 5; i++) { if (i) x.advance(500); x.sandbox.ir062Meal(x.npc.id); }
  assert.equal(r.affinity, 6); assert.equal(r.trust, 4);
  assert.equal(x.state.character.coin, 5);
  assert.equal(x.state.character.energy, 40);
});

test('repeated romantic evenings have a finite relationship reward and preserve other action effects', () => {
  const x = setup({ status: 'Lover' }); const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 4; i++) { if (i) x.advance(500); x.sandbox.ir063Special(x.npc.id, 'romance'); }
  assert.equal(r.affinity, 8); assert.equal(r.trust, 6);
  assert.equal(x.state.character.daysLived, 14);
});

test('work-together relationship gains are capped without removing wages or skill practice', () => {
  const x = setup(); const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 7; i++) { if (i) x.advance(500); x.sandbox.ir061WorkTogether(x.npc.id); }
  assert.equal(r.affinity, 5); assert.equal(r.trust, 5);
  assert.equal(x.state.character.coin, 41, 'all seven completed work actions still pay coins');
  assert.equal(x.state.character.skills.Social.xp, 105, 'all seven completed actions still grant skill practice');
});

test('capped relationship feedback still retains the completed work and wage notification', () => {
  const x = setup();
  x.state.world.v0736 = { schema: 1, earned: { 'work-together:npc-1': { affinity: 5, trust: 5 } }, claims: {} };
  x.sandbox.ir061WorkTogether(x.npc.id);
  const notice = x.calls.toasts.at(-1);
  assert.match(notice, /relationship benefit available/i);
  assert.match(notice, /earned 3 coins/i);
  assert.equal(x.state.character.coin, 23);
});

test('advice relationship bonus is limited while the existing skill benefit remains', () => {
  const x = setup({ npc: { id: 'npc-1', name: 'Mara', occupation: 'scholar', tier: 'routine', traits: ['generous'], memories: [], affinity: 0, trust: 0 } });
  const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 5; i++) { if (i) x.advance(500); x.sandbox.ir061Advice(x.npc.id); }
  assert.equal(r.affinity, 3); assert.equal(r.trust, 0);
  assert.equal(x.state.character.skills.Social.xp, 35, 'advice skill benefit still resolves');
});

test('different special activities each retain their separate finite contribution', () => {
  const n = { id: 'npc-1', name: 'Mara', occupation: 'resident', tier: 'routine', traits: [], memories: [], affinity: 0, trust: 0 };
  const x = setup({ npc: n, affinity: 0, trust: 0, status: 'Friend' });
  const r = x.state.character.relationships[n.id];
  for (let i = 0; i < 4; i++) { if (i) x.advance(500); x.sandbox.ir063Special(n.id, 'bar'); }
  assert.equal(r.affinity, 6); assert.equal(r.trust, 4);
  x.advance(500); x.sandbox.ir063Special(n.id, 'campfire');
  assert.equal(r.affinity, 9); assert.equal(r.trust, 7, 'campfire remains a distinct meaningful activity');
});

test('personal-task relationship rewards are capped while task completion pays the existing reward', () => {
  const x = setup(); const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 3; i++) {
    const id = `task-${i}`; x.state.world.v06.socialQuests.push({ id, npcId: x.npc.id, status: 'active', progress: 2, goal: 2, reward: 8 });
    x.advance(500); x.sandbox.ir062ReportTask(x.npc.id);
  }
  assert.equal(r.affinity, 8); assert.equal(r.trust, 6);
  assert.equal(x.state.character.coin, 44, 'all distinct completed tasks still pay the established coin reward');
});

test('bargain discounts remain available after relationship trust reaches its cap', () => {
  const x = setup(); const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 5; i++) { x.advance(500); x.sandbox.ir072Bargain(x.npc.id); }
  assert.equal(r.trust, 3);
  assert.equal(x.calls.bargain, 5);
  assert.equal(x.state.world.v072.activeBargain.use, 5, 'existing discount handler still runs each time');
});

test('sparring relationship reward is capped while combat progression remains intact', () => {
  const x = setup(); const r = x.state.character.relationships[x.npc.id];
  for (let i = 0; i < 5; i++) {
    x.state.combat = { active: true, source: { type: 'spar', npcId: x.npc.id } };
    x.advance(500); x.sandbox.irCombatEnd('victory');
  }
  assert.equal(r.affinity, 3); assert.equal(r.trust, 3);
  assert.equal(x.state.character.skills.Social.xp, 140, 'existing controlled-spar practice remains available');
  assert.equal(x.state.character.combatStats.wins, 5);
});

test('ordinary combat still grants the original coin, inventory, skill, and victory rewards', () => {
  const x = setup();
  x.state.combat = { active: true, source: { type: 'wild' } };
  const coinBefore = x.state.character.coin;
  x.sandbox.irCombatEnd('victory');
  assert.equal(x.state.character.coin, coinBefore + 3);
  assert.equal(x.state.character.inventory.wolf_fang, 1);
  assert.equal(x.state.character.skills.Combat.xp, 10);
  assert.equal(x.state.character.combatStats.wins, 1);
  assert.equal(x.state.combat, null);
});

test('one persistent guard disturbance cannot pay public reputation repeatedly', () => {
  const x = setup({ reputation: 0 });
  const guard = { id: 'guard-1', name: 'Renn', occupation: 'guard', tier: 'routine', traits: [], memories: [] };
  x.state.character.npcs.push(guard); x.state.character.relationships[guard.id] = { affinity: 0, trust: 0, status: 'Acquaintance', milestones: [] };
  x.state.world.v05.activeEvent = { id: 'disturbance-1', siteId: 'town-1', title: 'Roadside thieves', reported: false };
  x.sandbox.ir0724GuardReport(guard); const first = x.state.character.reputation;
  x.advance(500); x.sandbox.ir0724GuardReport(guard);
  assert.equal(first, 3); assert.equal(x.state.character.reputation, 3);
  assert.equal(x.state.character.relationships[guard.id].trust, 2);
  assert.match(x.calls.toasts.at(-1), /already been reported|already processed/i);
});

test('reconciliation feedback acknowledges the new attempt without implying past harm vanished', () => {
  const x = setup({ affinity: -20, trust: -10, status: 'Enemy' });
  x.npc.memories = [{ day: 9, kind: 'broken-promise', text: 'You broke your promise to Mara.' }];
  x.sandbox.ir062Amends(x.npc.id);
  const notice = x.calls.toasts.at(-1);
  assert.match(notice, /reconciliation attempt/i);
  assert.match(notice, /earlier harm is not erased automatically/i);
  assert.doesNotMatch(notice, /Mara remember the broken promise\./i);
});

test('public reputation and the affected NPC relationship are explained separately', () => {
  const x = setup({ reputation: 0 });
  x.sandbox.ir0726AttackNPC(x.npc);
  const notice = x.calls.toasts.at(-1);
  assert.match(notice, /affinity -2/i); assert.match(notice, /trust -8/i); assert.match(notice, /public reputation -17/i); assert.match(notice, /separately/i);
});

test('mapped completed event consolidates duplicate toasts and explains public reputation', () => {
  const x = setup({ reputation: 0 }); x.state.pendingEvent = 'notice';
  x.sandbox.chooseEvent('accept');
  assert.equal(x.state.character.reputation, 2);
  assert.equal(x.calls.toasts.length, 1, 'the generic and reward toasts become one clear notification');
  assert.match(x.calls.toasts[0], /public reputation \+2/i);
  assert.match(x.calls.toasts[0], /supply delivery/i);
});

test('old per-NPC caps and gift claims are retained when the ledger grows', () => {
  const x = setup({ inventory: { bread: 2 } });
  const earned = { 'talk:npc-1': { affinity: 6, trust: 6 } };
  const claims = { 'gift:npc-1:bread': 1 };
  for (let i = 0; i < 850; i++) earned[`talk:older-npc-${i}`] = { affinity: 6, trust: 6 };
  for (let i = 0; i < 1400; i++) claims[`gift:older-npc-${i}:charm`] = 1;
  x.state.world.v0736 = { schema: 1, earned, claims };
  x.advance(500); x.sandbox.ir06Talk(x.npc.id);
  assert.equal(x.state.character.relationships[x.npc.id].affinity, 0, 'an old talk cap is not forgotten after many other NPCs');
  assert.equal(x.state.world.v0736.earned['talk:older-npc-0'].affinity, 6);
  x.advance(500); x.sandbox.ir06Gift(x.npc.id);
  assert.equal(x.state.character.inventory.bread, 2, 'an old gift claim prevents consuming another identical gift');
  assert.equal(x.state.world.v0736.claims['gift:npc-1:bread'], 1);
});

test('save normalization preserves old relationship/memory records and sanitizes the new ledger', () => {
  const x = setup();
  x.state.world.v0736 = { schema: 1, earned: { 'talk:npc-1': { affinity: 6, trust: 6 }, 'bad key!': { affinity: 99, trust: 99 } }, claims: { 'gift:npc-1:bread': 10 } };
  x.npc.memories = [{ day: 2, kind: 'help', text: 'You helped Mara.' }];
  x.state.world.v06.registry[x.npc.id] = { id: x.npc.id, memories: [{ day: 2, kind: 'help', text: 'You helped Mara.' }] };
  const migrated = x.sandbox.normalizeSave(JSON.parse(JSON.stringify(x.state)));
  assert.equal(migrated.gameVersion, '0.7.3.6'); assert.equal(migrated.saveSchemaVersion, 8);
  assert.equal(migrated.character.relationships[x.npc.id].affinity, 0);
  assert.equal(migrated.world.v0736.earned['talk:npc-1'].affinity, 6);
  assert.equal(migrated.world.v0736.earned['bad key!'], undefined);
  assert.equal(migrated.world.v06.registry[x.npc.id].memories[0].text, 'You helped Mara.');
  assert.deepEqual(migrated.world.v0735.contextUses, {});
});

test('the latest persisted save includes the anti-farming ledger immediately after an awarded interaction', () => {
  const x = setup();
  x.sandbox.ir06Talk(x.npc.id);
  assert.ok(x.calls.savedWrites >= 2, 'the final ledger write occurs after the original interaction persistence');
  assert.equal(x.calls.saved.world.v0736.earned['talk:npc-1'].affinity, 2);
  assert.equal(x.calls.saved.world.v0736.earned['talk:npc-1'].trust, 2);
});

test('failed interactions retain the original reason and award no relationship budget', () => {
  const x = setup(); x.state.character.energy = 0; x.sandbox.ir06Talk(x.npc.id);
  assert.equal(x.state.character.relationships[x.npc.id].affinity, 0);
  assert.equal(x.state.world.v0736.earned['talk:npc-1'], undefined);
  assert.match(x.calls.toasts.at(-1), /need 5 energy/i);
});

console.log(`\n${passed} v0.7.3.6 checks passed.`);
