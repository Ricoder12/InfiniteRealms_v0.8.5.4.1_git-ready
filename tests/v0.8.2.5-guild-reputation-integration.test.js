'use strict';
// Run: node tests/v0.8.2.5-guild-reputation-integration.test.js
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
production.toast = message => { production.lastToast = String(message); };
vm.runInContext("createSeed='V0825-GUILD-STANDING';createStart='settlement';state=makeInitial('Standing Tester','human','village');ir05EnsureState(state)", production);
const guild = vm.runInContext("state.world.organizations.find(row=>row.organizationType==='adventurers-guild')", production);
assert.ok(guild);
assert.equal(vm.runInContext(`ir0825GuildFaction(state.world.organizations.find(row=>row.id===${JSON.stringify(guild.id)})).id`, production), 'faction:adventurers');
assert.equal(vm.runInContext(`ir0825GuildStanding(state.character,state.world.organizations.find(row=>row.id===${JSON.stringify(guild.id)}))`, production), 0);
assert.equal(vm.runInContext(`ir0825GuildMembership(state.character,state.world.organizations.find(row=>row.id===${JSON.stringify(guild.id)}))`, production), false);
assert.equal(vm.runInContext(`ir0825ValidateGuildReputation(state.world,state.character).ok`, production), true);

const siteId = vm.runInContext(`state.world.region.sites.find(row=>row.geoId===${JSON.stringify(guild.locationGeoId)}).id`, production);
vm.runInContext(`state.world.siteId=${JSON.stringify(siteId)};ir06EnsureNPCs()`, production);
const serviceId = vm.runInContext(`state.world.organizations.find(row=>row.id===${JSON.stringify(guild.id)}).receptionistNpcId`, production);
vm.runInContext(`modal={kind:'ir072-interactions',npc:${JSON.stringify(serviceId)}}`, production);
let html = vm.runInContext('ir072InteractionModal()', production);
assert.match(html, /Shared Adventurers’ Guild standing: \+0/i);
assert.match(html, /Membership requirement:/i);

// The shared getter, not a parallel guild field, reflects established standing changes.
vm.runInContext("state.character.factionStanding.adventurers=23;", production);
assert.equal(vm.runInContext(`ir0825GuildStanding(state.character,state.world.organizations.find(row=>row.id===${JSON.stringify(guild.id)}))`, production), 23);
html = vm.runInContext('ir072InteractionModal()', production);
assert.match(html, /Shared Adventurers’ Guild standing: \+23/i);
assert.equal(vm.runInContext('state.character.guildStanding', production), undefined);

// Existing join/leave flows remain the only v0.8.2 membership standing changes.
vm.runInContext(`ir072Action({dataset:{action:'ir0823-guild-join',npc:${JSON.stringify(serviceId)}}})`, production);
assert.equal(vm.runInContext('state.character.factionMembership', production), 'adventurers');
assert.equal(vm.runInContext('state.character.factionStanding.adventurers', production), 28);
vm.runInContext(`ir072Action({dataset:{action:'ir0823-guild-leave',npc:${JSON.stringify(serviceId)}}})`, production);
vm.runInContext("runAction({dataset:{action:'confirm-faction-leave',faction:'adventurers'}})", production);
assert.equal(vm.runInContext('state.character.factionStanding.adventurers', production), 18);
assert.equal(vm.runInContext('state.character.reputation', production), 0);
assert.equal(vm.runInContext('ir0825GuildMembership(state.character,state.world.organizations.find(row=>row.id===state.world.organizations[0].id))', production), false);

// Contract board uses the same membership/standing records and acceptance grants neither.
vm.runInContext("state.character.factionMembership='adventurers';state.character.factionStanding.adventurers=-7;", production);
vm.runInContext(`modal={kind:'ir0824-guild-contract-board',guildId:${JSON.stringify(guild.id)},npcId:${JSON.stringify(serviceId)}}`, production);
html = vm.runInContext('renderModal()', production);
assert.match(html, /Shared Adventurers’ Guild standing: -7/);
assert.match(html, /no standing threshold beyond the existing membership requirement/i);
const route = vm.runInContext(`ir0834RouteOptions(site().id)[0]`, production);
assert.ok(route, 'the guild has a canonical route to survey');
const offerId = `guild-contract:${guild.id}:route-survey`;
const before = vm.runInContext('JSON.stringify({standing:state.character.factionStanding.adventurers,reputation:state.character.reputation,relationships:state.character.relationships,coin:state.character.coin,days:state.character.daysLived})', production);
vm.runInContext(`ir072Action({dataset:{action:'ir0834-accept-contract',npc:${JSON.stringify(serviceId)},guild:${JSON.stringify(guild.id)},contract:${JSON.stringify(offerId)},template:'route-survey',route:${JSON.stringify(route.routeId)}}})`, production);
assert.equal(vm.runInContext('ir0824ContractStateValid(state.character).ok', production), true);
assert.equal(vm.runInContext('JSON.stringify({standing:state.character.factionStanding.adventurers,reputation:state.character.reputation,relationships:state.character.relationships,coin:state.character.coin,days:state.character.daysLived})', production), before);

// Legacy save state remains authoritative through the actual normalization path.
vm.runInContext('persist()', production);
const loaded = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())', production));
assert.equal(loaded.character.factionStanding.adventurers, -7);
assert.equal(loaded.character.factionMembership, 'adventurers');
assert.equal(loaded.character.guildContractState.accepted.length, 1);
assert.equal(loaded.character.reputation, 0);

// Invalid/missing guild faction references cannot grant membership or make a valid-looking service.
assert.equal(vm.runInContext("ir0825GuildFaction({id:'bad',organizationType:'adventurers-guild',factionId:'faction:royal'})", production), null);
const invalid = vm.runInContext(`ir0825ValidateGuildReputation({organizations:[{id:'bad-guild',organizationType:'adventurers-guild',factionId:'faction:missing'}]},state.character)`, production);
assert.equal(invalid.ok, false);
assert.match(invalid.errors[0], /shared Adventurers/);
console.log('v0.8.2.5 guild reputation integration tests: PASS');
