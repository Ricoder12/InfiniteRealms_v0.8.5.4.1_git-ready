'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const patchPath = path.join(__dirname, '..', 'js', 'game', '28-witness-based-reputation-v0.7.3.2.js');
const patch = fs.readFileSync(patchPath, 'utf8');

function setup({ witnessedNPCs = [], reputation = 0 } = {}) {
  const victim = { id: 'npc-victim', name: 'Mira', occupation: 'resident', homeSite: 'town-1', memories: [] };
  const bystanders = witnessedNPCs.map((id, i) => ({ id, name: `Witness ${i + 1}`, occupation: 'resident', homeSite: 'town-1', memories: [] }));
  const relationships = {};
  const character = { reputation, daysLived: 12, npcs: [victim, ...bystanders], relationships, combatStats: { wins: 0 } };
  const state = { character, world: { siteId: 'town-1', v0724: { schema: 1, crimeLog: [], bounties: [] }, v073: { schema: 1, events: [] } }, combat: null };
  const sandbox = {
    state,
    SAVE_KEY: 'ir-test-save',
    IR073_SAVE_SCHEMA: 8,
    localStorage: { setItem() {} },
    console,
    site: () => ({ id: 'town-1', name: 'Greyhaven' }),
    ir0724Data: () => state.world.v0724,
    ir072NPC: id => state.character.npcs.find(n => n.id === id) || null,
    ir072IsPresent: () => true,
    ir071ScheduleFor: () => ({ siteId: 'town-1' }),
    ir0724PersistNPC: () => {},
    addFeed: () => {},
    persist: () => {},
    shell: function (inner) { return String(inner || 'VERSION 0.7.3'); },
    topbar: function () { return 'VERSION 0.7.3'; },
    normalizeSave: function (input) { return structuredClone(input); },
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    ir06Relationship(n) {
      const r = state.character.relationships[n.id] || (state.character.relationships[n.id] = { affinity: 0, trust: 0 });
      return r;
    },
    ir06Remember(n, text, kind = 'memory') {
      n.memories = Array.isArray(n.memories) ? n.memories : [];
      n.memories.unshift({ day: state.character.daysLived, kind, text });
      n.memories = n.memories.slice(0, 5);
    },
    ir073Data() {
      state.world.v073 = state.world.v073 || { schema: 1, events: [] };
      state.world.v073.events = state.world.v073.events || [];
      return state.world.v073;
    },
    ir073ChangeReputation(delta, reason, detail = '') {
      const before = Math.max(-100, Math.min(100, Math.trunc(Number(state.character.reputation) || 0)));
      const after = Math.max(-100, Math.min(100, before + Math.trunc(Number(delta) || 0)));
      state.character.reputation = after;
      if (after !== before) sandbox.ir073Data().events.unshift({ before, after, delta: after - before, reason, detail, public: true });
      return { before, after, delta: after - before };
    },
    ir073Rep() { return Math.max(-100, Math.min(100, Math.trunc(Number(state.character.reputation) || 0))); },
    ir0724RecordCrime(type, n, detail, penalty, { witnessed = false, reported = false } = {}) {
      const c = state.character, v = sandbox.ir0724Data(), s = sandbox.site();
      const basePenalty = Math.max(0, Math.trunc(Number(penalty) || 0));
      const publicKnowledge = !!(witnessed || reported), before = sandbox.ir073Rep();
      if (publicKnowledge) sandbox.ir073ChangeReputation(-(basePenalty + (witnessed ? 5 : 0)), `witnessed-${type}`, detail);
      const rec = { id: `crime-${Date.now()}-${v.crimeLog.length}`, type, npcId: n?.id || '', npcName: n?.name || 'Unknown person', siteId: s?.id || '', siteName: s?.name || '', day: Number(c.daysLived) || 0, detail, witnessed: !!witnessed, reported: !!reported, publicKnowledge, publicReputationBefore: before, publicReputationAfter: sandbox.ir073Rep(), publicPenaltyApplied: publicKnowledge };
      v.crimeLog.unshift(rec);
      if (n) {
        const r = sandbox.ir06Relationship(n); r.trust -= witnessed ? 8 : 4; r.affinity -= 2;
        sandbox.ir06Remember(n, `${detail} ${publicKnowledge ? 'This became known publicly.' : 'No witness saw this; it remains in the victim’s personal memory and relationship.'}`, 'crime');
      }
      sandbox.persist();
      return rec;
    },
    irCombatEnd(kind) {
      const b = state.combat, src = b?.source || {}, c = state.character;
      if (src.type === 'npc-assault' && kind === 'victory' && b && c) {
        const n = sandbox.ir072NPC(src.npcId);
        if (n) {
          n.dead = true; n.ir0724Dead = true;
          const publicMurder = sandbox.ir0724Data().crimeLog.some(x => x.id === src.crimeId && (x.witnessed || x.reported));
          sandbox.ir06Remember(n, `You killed ${n.name}. ${publicMurder ? 'A witness knows what happened, so public reputation also suffers.' : 'No witness saw the killing; public reputation does not change.'}`, 'death');
          if (publicMurder) c.reputation = Math.max(-100, c.reputation - 25);
          c.combatStats.wins++;
          const rec = sandbox.ir0724Data().crimeLog.find(x => x.id === src.crimeId);
          if (rec) { rec.type = 'murder'; rec.killed = true; rec.witnessed = !!rec.witnessed; rec.publicPenaltyApplied = publicMurder; }
          state.combat = null; sandbox.persist(); return;
        }
      }
      if (kind === 'victory') c.combatStats.wins++;
      state.combat = null;
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(patch, sandbox, { filename: patchPath });
  return { sandbox, victim, bystanders, state };
}

function beginAssault(ctx, record, victim = ctx.victim) {
  ctx.state.combat = { active: true, source: { type: 'npc-assault', npcId: victim.id, crimeId: record.id }, enemyId: 'ir-test-npc' };
}

// 1. Unwitnessed harm stays private and leaves public reputation unchanged, including at death.
{
  const x = setup();
  const repBefore = x.state.character.reputation;
  const crime = x.sandbox.ir0724RecordCrime('assault', x.victim, 'You attacked Mira.', 12, { witnessed: false });
  assert.equal(x.state.character.reputation, repBefore);
  assert.equal(crime.publicKnowledge, false);
  assert.equal(crime.publicPenaltyApplied, false);
  assert.ok(x.victim.memories.some(m => m.kind === 'crime'));
  assert.equal(x.state.character.relationships[x.victim.id].trust, -4);
  assert.equal(x.state.character.relationships[x.victim.id].affinity, -2);
  beginAssault(x, crime);
  x.sandbox.irCombatEnd('victory');
  assert.equal(x.state.character.reputation, repBefore);
  assert.equal(crime.ir0732MurderPenaltyApplied, false);
  assert.equal(crime.ir0732DeathProcessed, true);
  assert.ok(x.victim.memories.some(m => m.kind === 'death'));
}

// 2. Witnessed assault gets the established assault penalty; witnesses are a boolean, not a multiplier.
{
  const x = setup({ witnessedNPCs: ['w1', 'w2', 'w3'] });
  const crime = x.sandbox.ir0724RecordCrime('assault', x.victim, 'You attacked Mira.', 12, { witnessed: true });
  assert.equal(x.state.character.reputation, -17, '12 assault + 5 witnessed surcharge, independent of witness count');
  assert.equal(crime.witnessNpcIds.length, 3);
  beginAssault(x, crime);
  x.sandbox.irCombatEnd('victory');
  assert.equal(x.state.character.reputation, -42, 'the distinct existing murder escalation applies once after the assault penalty');
  assert.equal(crime.ir0732MurderPenaltyAmount, 25);
  assert.equal(crime.ir0732MurderPenaltyApplied, true);
  assert.equal(x.state.character.combatStats.wins, 1);
  // Simulate a duplicate callback with the same incident still attached.
  x.state.combat = { active: true, source: { type: 'npc-assault', npcId: x.victim.id, crimeId: crime.id }, enemyId: 'ir-test-npc' };
  x.sandbox.irCombatEnd('victory');
  assert.equal(x.state.character.reputation, -42);
  assert.equal(x.state.character.combatStats.wins, 1);
}

// 3. A surviving victim can credibly report a private assault; same incident ID cannot apply it twice.
{
  const x = setup();
  const crime = x.sandbox.ir0724RecordCrime('assault', x.victim, 'You attacked Mira.', 12, { witnessed: false });
  assert.equal(x.state.character.reputation, 0);
  const first = x.sandbox.ir0732ReportCrimeRecord(crime.id, x.victim.id);
  assert.equal(first.ok, true);
  assert.equal(first.penaltyApplied, true);
  assert.equal(x.state.character.reputation, -12);
  const second = x.sandbox.ir0732ReportCrimeRecord(crime.id, x.victim.id);
  assert.equal(second.ok, true);
  assert.equal(second.penaltyApplied, false);
  assert.equal(x.state.character.reputation, -12);
  assert.equal(crime.reported, true);
  assert.equal(crime.ir0732ActionPenaltySettled, true);
  beginAssault(x, crime);
  x.sandbox.irCombatEnd('victory');
  assert.equal(x.state.character.reputation, -37, 'a reported murder gets the existing additional penalty once');
  x.state.combat = { active: true, source: { type: 'npc-assault', npcId: x.victim.id, crimeId: crime.id }, enemyId: 'ir-test-npc' };
  x.sandbox.irCombatEnd('victory');
  assert.equal(x.state.character.reputation, -37);
  assert.equal(x.state.character.combatStats.wins, 1);
}

// 4. An NPC who was not the victim and was not recorded as a witness cannot report a secret crime.
{
  const x = setup();
  const outsider = { id: 'outsider', name: 'Outsider', memories: [] };
  x.state.character.npcs.push(outsider);
  const crime = x.sandbox.ir0724RecordCrime('assault', x.victim, 'You attacked Mira.', 12, { witnessed: false });
  const report = x.sandbox.ir0732ReportCrimeRecord(crime.id, outsider.id);
  assert.equal(report.ok, false);
  // Even the victim cannot report through this hook if the save contains no evidence
  // that they personally knew about the event.
  x.victim.memories = [];
  delete x.victim.ir073LastHarm;
  const uninformedVictimReport = x.sandbox.ir0732ReportCrimeRecord(crime.id, x.victim.id);
  assert.equal(uninformedVictimReport.ok, false);
  assert.equal(x.state.character.reputation, 0);
  assert.equal(crime.publicKnowledge, false);
}


// 4. Legacy v0.7.3.1 crime rows can still be credibly reported without resetting their records.
{
  const x = setup();
  const legacy = { id: 'legacy-assault-1', type: 'assault', npcId: x.victim.id, npcName: x.victim.name, siteId: 'town-1', day: 10, detail: 'You attacked Mira.', witnessed: false, reported: false, publicKnowledge: false, publicPenaltyApplied: false };
  x.victim.memories.push({ day: 10, kind: 'crime', text: 'You attacked Mira.' });
  x.victim.ir073LastHarm = { day: 10, type: 'assault', detail: 'You attacked Mira.' };
  x.state.world.v0724.crimeLog.push(legacy);
  const result = x.sandbox.ir0732ReportCrimeRecord(legacy.id, x.victim.id);
  assert.equal(result.ok, true);
  assert.equal(x.state.character.reputation, -12);
  assert.equal(legacy.id, 'legacy-assault-1');
  assert.equal(legacy.reported, true);
}


// 6. A bystander who arrives after the assault began can witness the fatal act without making the earlier assault public.
{
  const x = setup();
  const crime = x.sandbox.ir0724RecordCrime('assault', x.victim, 'You attacked Mira.', 12, { witnessed: false });
  assert.equal(x.state.character.reputation, 0);
  const laterWitness = { id: 'late-witness', name: 'Late Witness', occupation: 'resident', homeSite: 'town-1', memories: [] };
  x.state.character.npcs.push(laterWitness);
  beginAssault(x, crime);
  x.sandbox.irCombatEnd('victory');
  assert.equal(x.state.character.reputation, -25, 'only the publicly witnessed murder escalation applies');
  assert.equal(crime.witnessed, true);
  assert.ok(crime.witnessNpcIds.includes(laterWitness.id));
  assert.equal(crime.ir0732ActionPenaltyAmount, 0);
  assert.equal(crime.ir0732MurderPenaltyAmount, 25);
}

// 7. Generic enemy victories do not gain a crime penalty from this patch.
{
  const x = setup({ reputation: 7 });
  x.state.combat = { active: true, source: { type: 'wild' }, enemyId: 'wolf' };
  x.sandbox.irCombatEnd('victory');
  assert.equal(x.state.character.reputation, 7);
}

// 8. Existing save schema is retained while save metadata is advanced to this patch version.
{
  const x = setup();
  const normalized = x.sandbox.normalizeSave({ character: { name: 'Test' }, world: {} });
  assert.equal(normalized.gameVersion, '0.7.3.2');
  assert.equal(normalized.saveSchemaVersion, 8);
}

console.log('PASS: unwitnessed NPC harm is private and keeps personal consequences');
console.log('PASS: witnessed penalty is independent of witness count; murder escalation is applied once');
console.log('PASS: eligible victim report applies the incident penalty once');
console.log('PASS: unrelated NPC cannot report a secret event');
console.log('PASS: legacy crime rows remain reportable without replacing their identity');
console.log('PASS: a bystander arriving before death can witness the fatal act without retroactively exposing the assault');
console.log('PASS: generic enemy victory does not receive a public crime penalty');
console.log('PASS: save schema remains compatible and version metadata advances');
