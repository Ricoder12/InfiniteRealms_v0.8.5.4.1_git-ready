'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const patchPath = path.join(__dirname, '..', 'js', 'game', '30-positive-reputation-v0.7.3.4.js');
const patch = fs.readFileSync(patchPath, 'utf8');

function setup() {
  const local = { id: 'settlement-1', name: 'Greyhaven', type: 'settlement', routes: [{ to: 'wild-1' }] };
  const wild = { id: 'wild-1', name: 'North Road', type: 'wilderness', routes: [{ to: 'settlement-1' }] };
  const remote = { id: 'remote-1', name: 'Far Wilds', type: 'wilderness', routes: [] };
  const state = {
    character: { reputation: 0, daysLived: 1, job: 'laborer', jobShifts: 0, coin: 20, energy: 50, hunger: 50, skills: { Survival: { level: 1 } }, inventory: { wolf_fang: 1, spider_silk: 1 }, relationships: {}, npcs: [], pathProgress: { contractsCompleted: 0 } },
    world: { siteId: 'wild-1', region: { sites: [local, wild, remote] }, v073: { schema: 1, events: [], refusals: {}, giftCooldowns: {}, lastObservedReputation: 0 } },
    feed: [], pendingEvent: null, combat: null
  };
  const calls = { toast: [], persist: 0, render: 0, storage: [] };
  const sandbox = {
    state, console, Math, SAVE_KEY: 'ir-v0734-test', IR073_SAVE_SCHEMA: 8,
    localStorage: { setItem: (key, value) => calls.storage.push([key, value]) },
    JOBS: [{ id: 'laborer', name: 'Laborer' }], ITEMS: { wolf_fang: { name: 'Wolf Fang' }, spider_silk: { name: 'Spider Silk' } }, IR_ENEMIES: { wolf: { name: 'Wolf' }, direwolf: { name: 'Direwolf' } },
    site: () => state.world.region.sites.find(s => s.id === state.world.siteId) || null,
    addFeed: (icon, title, detail, type = 'activity') => state.feed.unshift({ icon, title, detail, type }),
    toast: msg => calls.toast.push(String(msg)), persist: () => { calls.persist++; }, render: () => { calls.render++; },
    ir073Rep: () => Math.max(-100, Math.min(100, Math.trunc(Number(state.character?.reputation) || 0))),
    ir073Data: () => (state.world.v073 ||= { schema: 1, events: [], refusals: {}, giftCooldowns: {} }),
    ir073ChangeReputation: (delta, reason, detail) => {
      const before = sandbox.ir073Rep();
      const after = Math.max(-100, Math.min(100, before + Math.trunc(Number(delta) || 0)));
      state.character.reputation = after;
      const actual = after - before;
      if (actual) sandbox.ir073Data().events.unshift({ day: state.character.daysLived, delta: actual, before, after, reason, detail, public: true });
      return { before, after, delta: actual };
    },
    doWork: function() {
      state.character.daysLived += 5;
      state.character.jobShifts += 1;
      state.character.coin += 10;
      sandbox.addFeed('💼', 'Shift completed: Laborer', 'Paid shift completed.');
      return true;
    },
    ir0724FarmWork: function(n) {
      const beforeDay = Number(state.character.daysLived) || 0;
      n.ir0724LastFarmDay = beforeDay;
      state.character.daysLived += 1;
      state.character.energy -= 10;
      state.character.coin += 14;
      state.character.reputation = Math.max(-100, Math.min(100, state.character.reputation + 1));
      sandbox.addFeed('🌾', 'Farm work completed', 'Reputation increased slightly for honest work.');
      return true;
    },
    chooseEvent: function(choice) {
      const id = state.pendingEvent;
      if (id === 'path_mediation' && choice === 'mediate') {
        state.character.reputation = Math.max(-100, Math.min(100, state.character.reputation + 2));
        state.character.pathProgress.contractsCompleted += 1;
        state.pendingEvent = null;
        sandbox.addFeed('⚖️', 'A dispute resolved', 'Both traders accepted your terms.');
        return true;
      }
      if (id === 'path_escort' && choice === 'accept') {
        state.character.daysLived += 3;
        state.character.coin += 35;
        state.character.pathProgress.contractsCompleted += 1;
        state.pendingEvent = null;
        sandbox.addFeed('🛡️', 'Escort contract completed', 'Caravan arrived safely.');
        return true;
      }
      if (id === 'notice' && choice === 'accept') {
        state.character.daysLived += 2;
        state.character.coin += 18;
        state.pendingEvent = null;
        sandbox.addFeed('📌', 'Short contract completed', 'Supply bundle delivered.');
        return true;
      }
      if (id === 'purse' && choice === 'return') {
        state.character.reputation = Math.max(-100, Math.min(100, state.character.reputation + 2));
        state.pendingEvent = null;
        sandbox.addFeed('🤝', 'A good deed returned', 'Owner thanked you.');
        return true;
      }
      if (id === 'goblin' && choice === 'talk') {
        state.pendingEvent = null;
        sandbox.addFeed('🧤', 'The goblin keeps their distance', 'The conversation failed.');
        return false;
      }
      return false; // Models a cancelled/rejected action: no feed event or state completion.
    },
    irCombatEnd: function(kind) {
      if (kind === 'victory') sandbox.addFeed('🏆', 'Enemy defeated', 'Victory rewards recorded.');
      state.combat = null;
      return true;
    },
    ir0724HunterSell: function(n, item) {
      const c = state.character;
      if (!(Number(c.inventory?.[item]) > 0)) return false;
      c.inventory[item]--; c.coin += 3;
      sandbox.addFeed('🪙', 'Hunting material sold', 'Hunter bought a material for local supplies.');
      return true;
    },
    normalizeSave: input => JSON.parse(JSON.stringify(input)),
    shell: inner => `VERSION 0.7.3.3 ${inner || ''}`,
    topbar: () => 'VERSION 0.7.3.3',
    clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)),
    document: undefined
  };
  vm.createContext(sandbox);
  vm.runInContext(patch, sandbox, { filename: patchPath });
  return { sandbox, state, calls, local, wild, remote };
}

// 1. Completed paid work grants a small, persistent reputation reward.
{
  const x = setup();
  x.sandbox.doWork();
  assert.equal(x.state.character.jobShifts, 1);
  assert.equal(x.state.character.reputation, 1);
  assert.ok(x.state.world.v0734.awards.some(a => a.key === 'paid-job-shift'));
  assert.match(x.calls.toast.join(' '), /Public reputation \+1/i);
}

// 2. Repeated work inside the cooldown keeps pay/shifts but does not stack public reputation.
{
  const x = setup();
  x.sandbox.doWork();
  x.sandbox.doWork();
  assert.equal(x.state.character.jobShifts, 2);
  assert.equal(x.state.character.coin, 40);
  assert.equal(x.state.character.reputation, 1);
  x.state.character.daysLived += 25; // 30 days after the first shift's completion day.
  x.sandbox.doWork();
  assert.equal(x.state.character.reputation, 2);
}

// 3. Farmer work retains its existing +1 source but gets a global cooldown across different farmers.
{
  const x = setup();
  const f1 = { id: 'farmer-1', name: 'Mara', ir0724LastFarmDay: -1 };
  const f2 = { id: 'farmer-2', name: 'Tovan', ir0724LastFarmDay: -1 };
  x.sandbox.ir0724FarmWork(f1);
  assert.equal(x.state.character.reputation, 1);
  x.sandbox.ir0724FarmWork(f2);
  assert.equal(x.state.character.reputation, 1);
  assert.ok(x.state.world.v0734.awards.some(a => a.key === 'farmer-assistance'));
  assert.match(x.state.feed.find(f => f.title === 'Farm work completed').detail, /no additional public reputation/i);
}

// 4. Successful community mediation applies the legacy skill-scaled reward once, then observes cooldown.
{
  const x = setup();
  x.state.pendingEvent = 'path_mediation';
  x.sandbox.chooseEvent('mediate');
  assert.equal(x.state.character.reputation, 2);
  x.state.character.daysLived += 1;
  x.state.pendingEvent = 'path_mediation';
  x.sandbox.chooseEvent('mediate');
  assert.equal(x.state.character.reputation, 2);
  assert.ok(x.state.world.v0734.awards.some(a => a.key === 'path-community-mediation'));
  assert.match(x.state.feed.find(f => f.title === 'A dispute resolved').detail, /did not grant additional public reputation/i);
}

// 5. A completed short supply contract grants reputation only when actually completed; a cancelled choice does not.
{
  const x = setup();
  x.state.pendingEvent = 'notice';
  x.sandbox.chooseEvent('accept');
  assert.equal(x.state.character.reputation, 2);
  const y = setup();
  y.state.pendingEvent = 'notice';
  y.sandbox.chooseEvent('cancel');
  assert.equal(y.state.character.reputation, 0);
  assert.equal(y.state.world.v0734, undefined);
}

// 6. Successful caravan escort is a separate community source, distinct from personal relationship data.
{
  const x = setup();
  x.state.pendingEvent = 'path_escort';
  x.sandbox.chooseEvent('accept');
  assert.equal(x.state.character.reputation, 2);
  assert.equal(x.state.character.relationships && Object.keys(x.state.character.relationships).length, 0);
  assert.ok(x.state.world.v0734.awards.some(a => a.key === 'path-caravan-escort'));
}

// 7. Failed roadside conversation does not earn a public reputation reward.
{
  const x = setup();
  x.state.pendingEvent = 'goblin';
  x.sandbox.chooseEvent('talk');
  assert.equal(x.state.character.reputation, 0);
  assert.equal((x.state.world.v0734?.awards || []).length, 0);
}

// 8. Selling a real hunting material to an existing hunter provides a public knowledge path and a modest reward.
{
  const x = setup();
  const hunter = { id: 'hunter-1', name: 'Tarin', occupation: 'hunter' };
  x.sandbox.ir0724HunterSell(hunter, 'wolf_fang');
  assert.equal(x.state.character.reputation, 1);
  assert.ok(x.state.world.v0734.awards.some(a => a.key === 'hunter-material-turn-in'));
  x.sandbox.ir0724HunterSell(hunter, 'spider_silk');
  assert.equal(x.state.character.reputation, 1);
}

// 9. Private/remote hunts and failed hunt attempts do not make the player publicly famous.
{
  const remote = setup();
  remote.state.combat = { active: true, enemyId: 'wolf', enemyName: 'Wolf', source: { type: 'hunt', siteId: 'remote-1' } };
  remote.sandbox.irCombatEnd('victory');
  assert.equal(remote.state.character.reputation, 0);
  const failedSale = setup();
  failedSale.state.character.inventory.wolf_fang = 0;
  const hunter = { id: 'hunter-2', name: 'Tarin', occupation: 'hunter' };
  failedSale.sandbox.ir0724HunterSell(hunter, 'wolf_fang');
  assert.equal(failedSale.state.character.reputation, 0);
  assert.equal((failedSale.state.world.v0734?.awards || []).length, 0);
}

// 10. Save migration keeps pre-existing tracking records, preserves schema 8, and records version 0.7.3.4.
{
  const x = setup();
  const input = { character: { name: 'Test', reputation: 3 }, saveSchemaVersion: 8, world: { v0734: { schema: 1, cooldowns: { 'paid-job-shift': 44 }, awards: [{ day: 44, key: 'paid-job-shift', delta: 1, reason: 'completed-paid-work', detail: 'work', after: 3 }] } } };
  const out = x.sandbox.normalizeSave(input);
  assert.equal(out.gameVersion, '0.7.3.4');
  assert.equal(out.saveSchemaVersion, 8);
  assert.equal(out.world.v0734.cooldowns['paid-job-shift'], 44);
  x.sandbox.persist();
  assert.equal(x.state.gameVersion, '0.7.3.4');
  assert.equal(x.state.saveSchemaVersion, 8);
}

// 11. All reputation changes expose a feed entry and remain bounded by the current reputation cap.
{
  const x = setup();
  x.state.character.reputation = 99;
  x.state.pendingEvent = 'path_escort';
  x.sandbox.chooseEvent('accept');
  assert.equal(x.state.character.reputation, 100);
  assert.ok(x.state.feed.some(f => f.title === 'Public reputation improved'));
  assert.ok(x.state.world.v0734.awards.every(a => a.delta >= 0 && a.delta <= 10));
}

console.log('v0.7.3.4 positive reputation tests: 11 checks passed');
