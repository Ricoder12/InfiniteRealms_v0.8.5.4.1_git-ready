'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
let contractCalls = 0, dutyCalls = 0, persistCalls = 0;
let persistResult = true;
const guild = { id: 'guild-a', name: 'North Hall', organizationType: 'adventurers-guild', factionId: 'adventurers', locationGeoId: 'geo-a', receptionistNpcId: 'npc-rec', guildmasterNpcId: 'npc-master' };
const receptionist = { id: 'npc-rec', name: 'Mara', organizationId: guild.id, guildServiceRole: 'receptionist', workSite: 'site-a' };
const master = { id: 'npc-master', name: 'Tarin', organizationId: guild.id, guildServiceRole: 'guildmaster', workSite: 'site-a' };
const char = () => ({ name: 'Ari', daysLived: 10, factionMembership: 'adventurers', factionStanding: { adventurers: 12 }, reputation: 4,
  adventurerProgression: { schema: 1, currentRank: 'F', dutyCredit: 0, activeDuties: [], dutyHistory: [], dailyCredit: { day: 10, byCategory: {} }, processedEventIds: [], nextDutySequence: 1, nextEventSequence: 1, pendingGatherEvent: null },
  guildContractState: { schema: 2, accepted: [], nextInstanceSequence: 1, nextEventSequence: 1 }, npcs: [receptionist, master] });
let character = char();
let contractGate = () => { contractCalls++; return true; };
let dutyGate = () => { dutyCalls++; return true; };
const world = { organizations: [guild], region: { sites: [{ id: 'site-a', name: 'North Hall' }] }, v06: { changes: {} } };
const context = vm.createContext({
  document: { title: '', querySelector: () => ({ innerHTML: '' }) }, window: { scrollTo() {} },
  NAV: [['Life','☼']], state: { character, world, view: 'Life' }, modal: null,
  IR_V0832_RANK_DEFINITIONS: ['F','E','D','C','B','A','S','SS','SSS'].map(id => ({ id })),
  IR_V0824_GUILD_OFFER_TEMPLATES: [{ key: 'route-survey', title: 'Survey the road', description: 'Inspect one connected route.' }],
  IR_V0833_DUTY_TEMPLATES: [{ id: 'goblin-defeat-3', title: 'Clear goblins' }],
  IR_V0833_PROGRESSION_CONFIG: { dutyDurationDays: 14 },
  ITEMS: {}, IR_ENEMIES: {},
  pageHead: title => `<h1>${title}</h1>`, shell: html => html, esc: value => String(value ?? ''),
  site: () => ({ id: 'site-a', name: 'North Hall' }),
  ir0822GuildSite: (_world, org) => org ? { id: 'site-a', name: 'North Hall' } : null,
  ir072IsPresent: () => true,
  ir072NPC: id => [receptionist, master].find(npc => npc.id === id) || null,
  ir0835KnownNpcRecords: () => new Map([[receptionist.id, receptionist], [master.id, master]]),
  ir0825GuildMembership: (c, org) => c?.factionMembership === 'adventurers' && org?.factionId === 'adventurers',
  ir0825GuildStanding: c => c?.factionStanding?.adventurers ?? null,
  ir0834ContractId: (guildId, templateId) => `guild-contract:${guildId}:${templateId}`,
  ir0834RankAccess: () => ({ eligible: true, reason: 'Rank F is eligible.' }),
  ir0834OfferMarkup: (_org, _npc, template, record) => `<article>${template.title} ${record?.status || 'AVAILABLE'}</article>`,
  ir0833SourcesVerified: () => true,
  ir0833ProgressionValidation: () => ({ ok: true, errors: [] }),
  ir0834ContractStateValid: () => ({ ok: true, errors: [] }),
  ir0833ExpireDue(progression, day) {
    const expired = [];
    progression.activeDuties = progression.activeDuties.filter(row => {
      if (day - row.acceptedDay < 14) return true;
      row.status = 'expired'; row.closedDay = day; progression.dutyHistory.push(row); expired.push(row); return false;
    });
    return expired;
  },
  persist: () => { persistCalls++; return persistResult; }, render() {}, toast() {},
  ir0834AcceptContractBase() { return contractGate(); },
  ir0833GuildActionBase(action) { if (action === 'ir0833-accept-duty') return dutyGate(); return false; },
  ir0834AcceptContract() { return contractGate(); },
  ir0833GuildAction(action) { if (action === 'ir0833-accept-duty') return dutyGate(); return false; },
  ir072Action() { return false; }, renderModal() { return ''; }
});
context.globalThis = context;
vm.runInContext(fs.readFileSync(path.join(root, 'js/game/71-association-tab-assignment-gate-v0.8.3.6.js'), 'utf8'), context);
const run = code => vm.runInContext(code, context);
const setCharacter = value => { context.state.character = value; character = value; };
const activeContract = () => ({ instanceId: 'contract-1', contractId: 'guild-contract:guild-a:route-survey', guildId: guild.id, templateId: 'route-survey', status: 'active', objective: { type: 'route-survey', status: 'tracking', routeId: 'route-a', traversed: false } });
const activeDuty = (id = 'duty-1') => ({ id, guildId: guild.id, templateId: 'goblin-defeat-3', category: 'monster-defeat', status: 'active', progress: 1, required: 3, acceptedDay: 10 });

assert.equal(context.NAV.some(([name]) => name === 'Association'), true, 'Association appears in top-level navigation');
const clean = char(); clean.adventurerProgression.activeDuties.push(activeDuty()); clean.guildContractState.accepted.push(activeContract());
const before = JSON.stringify(clean.adventurerProgression); setCharacter(clean); context.state.view = 'Association'; context.render();
assert.match(context.ir0836AssociationView(), /Adventurers’ Association/);
assert.match(context.ir0836AssociationView(), /ASSIGNMENT CONFLICT|Assignment conflict/i);
assert.equal(JSON.stringify(clean.adventurerProgression), before, 'Opening/rendering the Association page does not alter progression');
assert.match(context.ir0836AssociationView(), /not a complete membership list or leaderboard/);
setCharacter({ name: 'Legacy', daysLived: 0, factionMembership: null, reputation: 0, guildContractState: null, npcs: [] });
context.state.view = 'Association'; const persistBeforeOpen = persistCalls; context.render();
assert.equal(Object.hasOwn(context.state.character, 'adventurerProgression'), false, 'Opening the tab does not migrate or create progression');
assert.equal(persistCalls, persistBeforeOpen, 'Opening the tab does not trigger save-side migration');

setCharacter(char()); context.state.character.guildContractState.accepted.push(activeContract());
assert.match(context.ir0836AssignmentGateMessage(), /active Association contract/i);
assert.equal(context.ir0834AcceptContract({ dataset: {} }), true, 'Active contract blocks direct contract service call');
assert.equal(contractCalls, 0);
assert.equal(context.ir0833GuildAction('ir0833-accept-duty', { dataset: {} }), true, 'Active contract blocks duty service call');
assert.equal(dutyCalls, 0);

setCharacter(char()); context.state.character.adventurerProgression.activeDuties.push(activeDuty());
assert.match(context.ir0836AssignmentGateMessage(), /active Association duty/i);
assert.equal(context.ir0834AcceptContract({ dataset: {} }), true, 'Active duty blocks contract service call');
assert.equal(context.ir0833GuildAction('ir0833-accept-duty', { dataset: {} }), true, 'Active duty blocks second duty service call');
assert.equal(contractCalls, 0); assert.equal(dutyCalls, 0);

setCharacter(char()); contractCalls = 0; dutyCalls = 0;
assert.equal(context.ir0834AcceptContract({ dataset: {} }), true, 'A free slot delegates to existing contract acceptance');
assert.equal(contractCalls, 1);
assert.equal(context.ir0833GuildAction('ir0833-accept-duty', { dataset: {} }), true, 'A free slot delegates to existing duty acceptance');
assert.equal(dutyCalls, 1);

setCharacter(char()); context.state.character.guildContractState.accepted.push(activeContract(), { ...activeContract(), instanceId: 'contract-2', contractId: 'guild-contract:guild-a:monster-signs', templateId: 'monster-signs', objective: { type: 'monster-signs', status: 'tracking' } });
assert.match(context.ir0836AssignmentGateMessage(), /multiple active Association assignments/);
assert.equal(context.ir0834AcceptContract({ dataset: {} }), true, 'Pre-existing multi-active contract save blocks acceptance without changing records');
assert.equal(context.state.character.guildContractState.accepted.length, 2);

setCharacter(char()); context.state.character.adventurerProgression.activeDuties.push(activeDuty());
context.state.character.daysLived = 24;
const expireGate = context.ir0836AssignmentGateMessage();
assert.equal(expireGate, '', 'Existing 14-day duty expiry is finalized before releasing the shared slot');
assert.equal(context.state.character.adventurerProgression.activeDuties.length, 0);
assert.equal(context.state.character.adventurerProgression.dutyHistory[0].status, 'expired');

setCharacter(char()); const due = activeDuty('duty-due'); context.state.character.adventurerProgression.activeDuties.push(due);
context.state.character.daysLived = 24; persistResult = false;
assert.match(context.ir0836AssignmentGateMessage(), /could not be saved/i);
assert.equal(context.state.character.adventurerProgression.activeDuties[0].id, 'duty-due', 'Failed expiry save restores the active assignment and keeps the slot held');
persistResult = true;

setCharacter(char()); contractCalls = 0; dutyCalls = 0;
contractGate = () => { context.ir0833GuildAction('ir0833-accept-duty', { dataset: {} }); return true; };
context.ir0834AcceptContract({ dataset: {} });
assert.equal(dutyCalls, 0, 'Nested duplicate acceptance is rejected while the authoritative acceptance operation is in flight');
contractGate = () => { contractCalls++; return true; };

setCharacter(char()); context.state.character.adventurerProgressionIntegrity = { status: 'quarantined', reason: 'broken fixture' };
assert.match(context.ir0836AssignmentGateMessage(), /broken fixture/i);
setCharacter({ name: 'Quarantined duty record', daysLived: 10, adventurerProgressionIntegrity: { status: 'quarantined', reason: 'missing duty records' }, guildContractState: null });
assert.match(context.ir0836AssignmentGateMessage(), /missing duty records/i, 'Quarantined duty data blocks acceptance even when its original field is absent');
setCharacter({ name: 'Quarantined contract record', daysLived: 10, adventurerProgression: null, guildContractIntegrity: { status: 'quarantined', reason: 'missing contract records' }, guildContractState: null });
assert.match(context.ir0836AssignmentGateMessage(), /missing contract records/i, 'Quarantined contract data blocks acceptance even when its original field is absent');
console.log('v0.8.3.6 association tab and assignment gate tests passed');
