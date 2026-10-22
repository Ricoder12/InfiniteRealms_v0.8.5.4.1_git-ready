'use strict';
// Run: node tests/v0.8.2.3-guild-membership.test.js
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
  vm.runInContext(fs.readFileSync(path.join(root, match[1]), 'utf8'), production, { filename: match[1] });
}
vm.runInContext("createSeed='V0823-GUILD-MEMBERSHIP';createStart='settlement';state=makeInitial('Membership Tester','human','village');ir05EnsureState(state)", production);
const guild = vm.runInContext("state.world.organizations.find(record=>record.organizationType==='adventurers-guild')", production);
assert.ok(guild, 'generated world supplies a guild organization');
vm.runInContext(`state.world.siteId=state.world.region.sites.find(row=>row.geoId===${JSON.stringify(guild.locationGeoId)}).id;ir06EnsureNPCs()`, production);
const receptionistId = vm.runInContext("state.world.organizations.find(record=>record.organizationType==='adventurers-guild').receptionistNpcId", production);
vm.runInContext(`modal={kind:'ir072-interactions',npc:${JSON.stringify(receptionistId)}}`, production);
let html = vm.runInContext('ir072InteractionModal()', production);
assert.match(html, /Membership information/);
assert.match(html, /Join guild/);
assert.match(html, /Membership requirement/);
assert.match(html, /Location:/);

// Inquiry reports current criteria without changing standing, public reputation, or relationships.
const beforeInquiry = vm.runInContext('JSON.stringify({standing:state.character.factionStanding.adventurers||0,reputation:state.character.reputation,relationships:state.character.relationships})', production);
vm.runInContext(`ir072Action({dataset:{action:'ir0823-guild-inquiry',npc:${JSON.stringify(receptionistId)}}})`, production);
assert.equal(vm.runInContext('JSON.stringify({standing:state.character.factionStanding.adventurers||0,reputation:state.character.reputation,relationships:state.character.relationships})', production), beforeInquiry);

// Successful membership uses the original faction implementation once.
vm.runInContext(`ir072Action({dataset:{action:'ir0823-guild-join',npc:${JSON.stringify(receptionistId)}}})`, production);
assert.equal(vm.runInContext('state.character.factionMembership', production), 'adventurers');
assert.equal(vm.runInContext('state.character.factionStanding.adventurers', production), 5);
const repAfterJoin = vm.runInContext('state.character.reputation', production);
const relationshipsAfterJoin = vm.runInContext('JSON.stringify(state.character.relationships)', production);
vm.runInContext(`ir072Action({dataset:{action:'ir0823-guild-join',npc:${JSON.stringify(receptionistId)}}})`, production);
assert.equal(vm.runInContext('state.character.factionStanding.adventurers', production), 5, 'repeated join does not duplicate membership or standing');
assert.equal(vm.runInContext('state.character.reputation', production), repAfterJoin);
assert.equal(vm.runInContext('JSON.stringify(state.character.relationships)', production), relationshipsAfterJoin);
html = vm.runInContext('ir072InteractionModal()', production);
assert.match(html, /Inspect membership/);
assert.match(html, /Leave guild/);
vm.runInContext(`ir072Action({dataset:{action:'ir0823-guild-membership',npc:${JSON.stringify(receptionistId)}}})`, production);
assert.equal(vm.runInContext('state.character.factionMembership', production), 'adventurers');

// Existing exclusive-membership rule blocks joining while in another faction; no mutation occurs.
vm.runInContext("state.character.factionMembership='merchants';state.character.factionStanding.adventurers=0;", production);
html = vm.runInContext('ir072InteractionModal()', production);
assert.match(html, /leave Merchant Consortium before joining/i);
assert.match(html, /disabled/);
const blockedStanding = vm.runInContext('state.character.factionStanding.adventurers', production);
vm.runInContext(`ir072Action({dataset:{action:'ir0823-guild-join',npc:${JSON.stringify(receptionistId)}}})`, production);
assert.equal(vm.runInContext('state.character.factionMembership', production), 'merchants');
assert.equal(vm.runInContext('state.character.factionStanding.adventurers', production), blockedStanding);

// Existing leave confirmation and handler remain authoritative, including the established standing penalty.
vm.runInContext("state.character.factionMembership='adventurers';state.character.factionStanding.adventurers=5;", production);
vm.runInContext(`ir072Action({dataset:{action:'ir0823-guild-leave',npc:${JSON.stringify(receptionistId)}}})`, production);
assert.equal(vm.runInContext('modal.kind', production), 'confirm-faction-leave');
vm.runInContext("runAction({dataset:{action:'confirm-faction-leave',faction:'adventurers'}})", production);
assert.equal(vm.runInContext('state.character.factionMembership', production), null);
assert.equal(vm.runInContext('state.character.factionStanding.adventurers', production), -5);
assert.equal(vm.runInContext('state.character.reputation', production), repAfterJoin);
assert.equal(vm.runInContext('JSON.stringify(state.character.relationships)', production), relationshipsAfterJoin);
vm.runInContext(`ir072Action({dataset:{action:'ir0823-guild-leave',npc:${JSON.stringify(receptionistId)}}})`, production);
assert.equal(vm.runInContext('state.character.factionMembership', production), null, 'repeat leave is safe');

// Authoritative membership survives the real autosave and load normalization path.
vm.runInContext("state.character.factionMembership='adventurers';state.character.factionStanding.adventurers=17;persist()", production);
const loaded = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())', production));
assert.equal(loaded.character.factionMembership, 'adventurers');
assert.equal(loaded.character.factionStanding.adventurers, 17);
const loadedGuild = loaded.world.organizations.find(record => record.organizationType === 'adventurers-guild');
assert.equal(loadedGuild.id, guild.id);

// Combat and pending-event restrictions are enforced by the pre-existing eligibility function.
vm.runInContext('state.combat={active:true}', production);
assert.match(vm.runInContext("ir051FactionEligibility('adventurers').reason", production), /combat/i);
vm.runInContext('state.combat={active:false};state.pendingEvent={id:"pending"}', production);
assert.match(vm.runInContext("ir051FactionEligibility('adventurers').reason", production), /pending event/i);
console.log('v0.8.2.3 guild membership tests: PASS');
