'use strict';
// Run: node tests/v0.8.2.4-guild-contract-board.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const noop = () => {};
const element = () => ({ textContent: '', innerHTML: '', title: '', style: {}, dataset: {}, appendChild: noop, remove: noop, click: noop, focus: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
const storage = new Map();
const production = {
  console: { warn: noop, log: noop, error: console.error }, Math: Object.create(Math),
  document: { title: '', head: element(), body: element(), documentElement: element(), addEventListener: noop, querySelector: selector => selector === '#app' ? element() : null, querySelectorAll: () => [], getElementById: () => null, createElement: element },
  window: { scrollTo: noop, addEventListener: noop },
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  setTimeout: () => 0, clearTimeout: noop, requestAnimationFrame: noop, URL, Blob: global.Blob, FileReader: function () {}, navigator: { userAgent: 'Node test VM' }
};
vm.createContext(production);
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of index.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  if (match[1].endsWith('/27-boot.js')) continue;
  // This historical suite verifies the v0.8.2.4 acceptance-only implementation in isolation.
  // The v0.8.3.4 integrated behavior is covered by its dedicated production-path suite.
  if (match[1].endsWith('/69-guild-contract-rank-completion-v0.8.3.4.js') || match[1].endsWith('/71-association-tab-assignment-gate-v0.8.3.6.js')) continue;
  vm.runInContext(fs.readFileSync(path.join(root, match[1]), 'utf8'), production, { filename: match[1] });
}
production.toast = message => { production.lastToast = String(message); };
vm.runInContext("createSeed='V0824-GUILD-CONTRACTS';createStart='settlement';state=makeInitial('Contract Tester','human','village');ir05EnsureState(state)", production);
const guild = vm.runInContext("state.world.organizations.find(row=>row.organizationType==='adventurers-guild')", production);
assert.ok(guild, 'generated world contains an adventurers guild');
vm.runInContext(`state.world.siteId=state.world.region.sites.find(row=>row.geoId===${JSON.stringify(guild.locationGeoId)}).id;ir06EnsureNPCs()`, production);
const guildData = vm.runInContext("state.world.organizations.find(row=>row.organizationType==='adventurers-guild')", production);
const npcId = guildData.receptionistNpcId;
assert.ok(npcId);

// Offers are deterministic, stable, and scoped to the organization providing the board.
const offers = JSON.parse(vm.runInContext(`JSON.stringify(ir0824GuildOffers(state.world.organizations.find(row=>row.id===${JSON.stringify(guildData.id)})))`, production));
assert.equal(offers.length, 3);
assert.ok(offers.every(row => row.guildId === guildData.id && row.availability === 'available'));
assert.ok(offers.every(row => row.id.startsWith(`guild-contract:${guildData.id}:`)));
assert.ok(offers.every(row => row.requirements.includes('Adventurers’ Guild membership') && row.objective));
const otherGuildOffers = JSON.parse(vm.runInContext(`JSON.stringify(ir0824GuildOffers({id:'organization:test:second-guild',organizationType:'adventurers-guild'}))`, production));
assert.ok(otherGuildOffers.every(row => row.guildId === 'organization:test:second-guild' && !offers.some(original => original.id === row.id)));

const clickAction = (action, contractId = '', guildId = guildData.id) => vm.runInContext(
  `ir072Action({dataset:{action:${JSON.stringify(action)},npc:${JSON.stringify(npcId)},guild:${JSON.stringify(guildId)},contract:${JSON.stringify(contractId)}}})`, production);
clickAction('ir0824-open-contract-board');
assert.equal(vm.runInContext('modal.kind', production), 'ir0824-guild-contract-board');
let board = vm.runInContext('renderModal()', production);
assert.match(board, /Guild contract board/i);
assert.match(board, /Survey a Guild Route/);
assert.match(board, /Objective:/);
assert.match(board, /membership/);
assert.match(board, /disabled/);

// Membership is mandatory; submitting the action directly cannot bypass the disabled UI.
const firstOffer = offers[0];
clickAction('ir0824-accept-contract', firstOffer.id);
assert.equal(vm.runInContext('state.character.guildContractState', production), undefined);
assert.match(vm.runInContext('lastToast', production), /Join the Adventurers/);

// Acceptance persists one accepted record and changes no reward, time, inventory, reputation, or standing.
vm.runInContext("state.character.factionMembership='adventurers';", production);
const before = JSON.parse(vm.runInContext('JSON.stringify({coin:state.character.coin,energy:state.character.energy,days:state.character.daysLived,inventory:state.character.inventory,reputation:state.character.reputation,standing:state.character.factionStanding.adventurers})', production));
clickAction('ir0824-accept-contract', firstOffer.id);
let accepted = JSON.parse(vm.runInContext('JSON.stringify(state.character.guildContractState)', production));
assert.equal(accepted.schema, 1);
assert.equal(accepted.accepted.length, 1);
assert.deepEqual({ contractId: accepted.accepted[0].contractId, guildId: accepted.accepted[0].guildId, status: accepted.accepted[0].status }, { contractId: firstOffer.id, guildId: guildData.id, status: 'accepted' });
assert.equal(Object.hasOwn(accepted.accepted[0], 'reward'), false);
assert.equal(vm.runInContext('ir0824ContractStateValid(state.character).ok', production), true);
const after = JSON.parse(vm.runInContext('JSON.stringify({coin:state.character.coin,energy:state.character.energy,days:state.character.daysLived,inventory:state.character.inventory,reputation:state.character.reputation,standing:state.character.factionStanding.adventurers})', production));
assert.deepEqual(after, before);
assert.match(vm.runInContext('lastToast', production), /Objective tracking and rewards are not available/i);
board = vm.runInContext('renderModal()', production);
assert.match(board, /ACCEPTED · ACTIVE/);
assert.match(board, /completion and rewards are not available/i);
assert.doesNotMatch(board, /data-action="ir0824-complete-contract"|Claim reward/i);

// Repeated clicks and repeated initialization do not create duplicate accepted entries.
clickAction('ir0824-accept-contract', firstOffer.id);
vm.runInContext('ir06EnsureNPCs();ir06EnsureNPCs()', production);
accepted = JSON.parse(vm.runInContext('JSON.stringify(state.character.guildContractState)', production));
assert.equal(accepted.accepted.filter(row => row.contractId === firstOffer.id).length, 1);
assert.equal(accepted.accepted.length, 1);

// A guild mismatch or unknown/expired offer ID is rejected without writes.
const persistBeforeMismatch = storage.get(vm.runInContext('SAVE_KEY', production));
clickAction('ir0824-accept-contract', offers[1].id, `${guildData.id}:other`);
assert.match(vm.runInContext('lastToast', production), /belongs to a different guild/i);
clickAction('ir0824-accept-contract', 'guild-contract:expired:missing');
assert.match(vm.runInContext('lastToast', production), /not available/i);
assert.equal(storage.get(vm.runInContext('SAVE_KEY', production)), persistBeforeMismatch);

// Combat and pending events block acceptance; no reward or active record is added.
vm.runInContext('state.combat={active:true}', production);
clickAction('ir0824-accept-contract', offers[1].id);
assert.match(vm.runInContext('lastToast', production), /combat/i);
vm.runInContext('state.combat={active:false};state.pendingEvent={id:"pending"}', production);
clickAction('ir0824-accept-contract', offers[1].id);
assert.match(vm.runInContext('lastToast', production), /event/i);
vm.runInContext('state.pendingEvent=null', production);
assert.equal(vm.runInContext('state.character.guildContractState.accepted.length', production), 1);

// Accept remaining offers and verify the empty-available state is explicit.
for (const offer of offers.slice(1)) clickAction('ir0824-accept-contract', offer.id);
assert.equal(vm.runInContext('state.character.guildContractState.accepted.length', production), offers.length);
board = vm.runInContext('renderModal()', production);
assert.match(board, /No available offers remain/);

// Real save/load normalization preserves accepted IDs, status, and guild link; old saves remain absent.
vm.runInContext('persist()', production);
const loaded = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())', production));
assert.equal(loaded.character.guildContractState.accepted.length, 3);
assert.equal(loaded.character.guildContractState.accepted[0].contractId, firstOffer.id);
assert.equal(loaded.character.guildContractState.accepted[0].guildId, guildData.id);
assert.equal(loaded.character.guildContractState.accepted[0].status, 'accepted');
const oldSave = JSON.parse(vm.runInContext('JSON.stringify(state)', production));
delete oldSave.character.guildContractState;
const oldLoaded = vm.runInContext(`normalizeSave(JSON.parse(${JSON.stringify(JSON.stringify(oldSave))}))`, production);
assert.equal(oldLoaded.character.guildContractState, undefined);
assert.equal(oldLoaded.character.name, 'Contract Tester');

// Ordinary job applications still use the existing employment records and work path.
vm.runInContext('state.character.guildContractState={schema:1,accepted:[]};state.character.job=null;findWork("laborer")', production);
assert.equal(vm.runInContext('state.character.job', production), 'laborer');
assert.equal(vm.runInContext('JOBS.find(job=>job.id===state.character.job).name', production), 'Quarry Hand');

// Malformed and duplicate contract state is detected, never silently normalized.
assert.equal(vm.runInContext("ir0824ContractStateValid({guildContractState:{schema:1,accepted:[{contractId:'x',guildId:'x',status:'accepted'},{contractId:'x',guildId:'x',status:'accepted'}]}}).ok", production), false);
console.log('v0.8.2.4 guild contract board tests: PASS');
