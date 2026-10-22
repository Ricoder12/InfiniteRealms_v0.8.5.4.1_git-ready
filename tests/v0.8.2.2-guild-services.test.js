'use strict';
// Run: node tests/v0.8.2.2-guild-services.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const siteRows = [
  { id: 'city', geoId: 'site:city', name: 'Greyhaven', type: 'settlement', settlementType: 'city', services: ['guild', 'market'], routes: [] },
  { id: 'village', geoId: 'site:village', name: 'Reedbrook', type: 'settlement', settlementType: 'village', services: ['market'], routes: [] }
];
function makeWorld(includeGuild = true) {
  return {
    id: 'world:fixture', seed: 'guild-services-fixture', siteId: 'city',
    region: { id: 'region:fixture', sites: clone(siteRows), routes: [] },
    polities: []
  };
}
const context = {
  console, Object, Array, String, Number, Math, Set, Map, encodeURIComponent,
  IR_V05_FACTION_DEFS: {
    adventurers: { name: "Adventurers' Guild", desc: 'Guild information.', req: 'Settlement' },
    merchants: { name: 'Merchant Consortium', desc: 'Trade group.', req: 'Market' },
    shadow: { name: 'Shadow Network', desc: 'Criminal network.', req: 'Contact' },
    arcanum: { name: 'Circle of the Arcanum', desc: 'Magical order.', req: 'Library' },
    royal: { name: 'Regional Authority', desc: 'Civic authority.', req: 'Work board' }
  },
  IR06_NAMES: ['Alden', 'Mira', 'Tavi', 'Bram'],
  IR06_SURNAMES: ['Fen', 'Alder', 'Reed', 'Stone'],
  state: null, modal: null, persistCalls: 0, remembered: [],
  ir06Hash(value) { let h = 2166136261; for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; },
  generateProceduralWorld() { return makeWorld(true); },
  normalizeSave(input) { const out = clone(input); out.world = context.generateProceduralWorld(); return out; },
  ir06EnsureNPCs() { return []; },
  ir071Sites() { return context.state?.world?.region?.sites || []; },
  ir071MigrateNPC(npc) { npc.ir071ScheduleVersion = 1; return npc; },
  ir071ScheduleFor(npc) { return { state: 'working', siteId: npc.workSite, label: `Working at ${npc.workSite}` }; },
  ir06Present(npc, locationId) { return npc?.workSite === locationId; },
  site() { return context.state?.world?.region?.sites?.find(row => row.id === context.state.world.siteId) || null; },
  ir072NPC(id) { return context.state?.character?.npcs?.find(npc => npc.id === id) || null; },
  ir072IsPresent(npc) { return !!npc && npc.workSite === context.site()?.id; },
  ir072Blocked() { return false; },
  ir072RequireNPC(id) { const npc = context.ir072NPC(id); return npc && context.ir072IsPresent(npc) ? npc : null; },
  ir072RememberAction(npc, title, detail, kind) { context.remembered.push({ id: npc.id, title, detail, kind }); npc.memories.unshift({ text: detail, kind }); context.persist(); },
  ir072InteractionModal() { return 'legacy interaction modal'; },
  ir072Action() { return false; },
  renderModal() { return 'legacy modal'; },
  runAction() {},
  persist() { context.persistCalls++; },
  toast(message) { context.lastToast = message; },
  esc(value) { return String(value); },
  document: { title: '' }
};
vm.createContext(context);
for (const file of [
  'js/game/61-faction-foundation-v0.8.0.js',
  'js/game/62-organization-records-v0.8.1.js',
  'js/game/63-guild-services-v0.8.2.2.js'
]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });

function start(includeGuild = true) {
  const world = context.generateProceduralWorld();
  if (!includeGuild) world.organizations = [];
  context.state = { world, character: { factionMembership: null, factionStanding: { adventurers: 0 }, relationships: {}, npcs: [] } };
  return world;
}

// Both roles are attached to the actual guild organization and map geoId -> site.id correctly.
const world = start(true);
const guild = world.organizations.find(record => record.organizationType === 'adventurers-guild');
assert.ok(guild);
let serviceNpcs = context.ir0822EnsureGuildServiceNPCs();
assert.equal(serviceNpcs.length, 2);
assert.ok(guild.receptionistNpcId);
assert.ok(guild.guildmasterNpcId);
const receptionist = context.ir072NPC(guild.receptionistNpcId);
const guildmaster = context.ir072NPC(guild.guildmasterNpcId);
assert.equal(receptionist.guildServiceRole, 'receptionist');
assert.equal(guildmaster.guildServiceRole, 'guildmaster');
assert.equal(receptionist.organizationId, guild.id);
assert.equal(guildmaster.organizationId, guild.id);
assert.equal(receptionist.workSite, 'city');
assert.equal(guildmaster.workSite, 'city');
assert.equal(context.ir0822ValidateGuildServices(world, context.state.character).ok, true);

// Repeated initialization returns the same two IDs and never duplicates NPC records.
const npcIds = context.state.character.npcs.map(npc => npc.id).sort();
context.ir0822EnsureGuildServiceNPCs();
assert.deepEqual(context.state.character.npcs.map(npc => npc.id).sort(), npcIds);
assert.equal(context.state.character.npcs.filter(npc => npc.organizationId === guild.id).length, 2);

// A missing optional role remains absent, and settlements without a guild get no service NPCs.
const missingRoleWorld = start(true);
const partialGuild = missingRoleWorld.organizations.find(record => record.organizationType === 'adventurers-guild');
partialGuild.guildmasterNpcId = null;
assert.equal(context.ir0822EnsureGuildServiceNPCs().length, 1);
assert.equal(context.ir072NPC(partialGuild.guildmasterNpcId), null);
assert.equal(context.ir0822ValidateGuildServices(missingRoleWorld, context.state.character).ok, true);
const noGuildWorld = start(false);
assert.equal(context.ir0822EnsureGuildServiceNPCs().length, 0);
assert.equal(context.state.character.npcs.length, 0);

// The shared occupation modal and action router expose role-specific guidance.
start(true);
const activeGuild = context.state.world.organizations.find(record => record.organizationType === 'adventurers-guild');
context.ir0822EnsureGuildServiceNPCs();
context.modal = { npc: activeGuild.receptionistNpcId };
assert.match(context.ir072InteractionModal(), /Guild information/);
assert.match(context.ir072InteractionModal(), /persistent guild contract board is not available yet/i);
assert.equal(context.ir072Action({ dataset: { action: 'ir0822-guild-details', npc: activeGuild.receptionistNpcId } }), true);
assert.equal(context.remembered.at(-1).kind, 'guild-service');
context.modal = { npc: activeGuild.guildmasterNpcId };
assert.match(context.ir072InteractionModal(), /Guildmaster/);
assert.match(context.ir072InteractionModal(), /Rank review is available here; examinations require an authorized Association examiner/);

// Normalization rebuilds the world in the existing save layer; this module carries only
// the stable service assignments and corresponding NPC records through that rebuild.
const saved = clone(context.state);
const oldReceptionist = saved.character.npcs.find(npc => npc.id === activeGuild.receptionistNpcId);
oldReceptionist.memories = [{ text: 'Saved guild conversation', kind: 'guild-service' }];
saved.world.v06.changes[oldReceptionist.id] = clone(oldReceptionist);
const loaded = context.normalizeSave(saved);
const loadedGuild = loaded.world.organizations.find(record => record.id === activeGuild.id);
assert.equal(loadedGuild.receptionistNpcId, activeGuild.receptionistNpcId);
assert.equal(loadedGuild.guildmasterNpcId, activeGuild.guildmasterNpcId);
const loadedReceptionist = loaded.character.npcs.find(npc => npc.id === activeGuild.receptionistNpcId);
assert.equal(loadedReceptionist.memories[0].text, 'Saved guild conversation');
assert.equal(loadedReceptionist.organizationId, loadedGuild.id);
assert.equal(context.ir0822ValidateGuildServices(loaded.world, loaded.character).ok, true);

// Production scripts: exercise the actual autosave and normalizeSave path with a generated world.
const noop = () => {};
const element = () => ({ textContent: '', innerHTML: '', title: '', style: {}, dataset: {},
  appendChild: noop, remove: noop, click: noop, focus: noop,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
const storage = new Map();
const production = {
  console: { warn: noop, log: noop, error: console.error }, Math: Object.create(Math),
  document: { title: '', head: element(), body: element(), documentElement: element(), addEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: element },
  window: { scrollTo: noop, addEventListener: noop },
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  setTimeout: () => 0, clearTimeout: noop, requestAnimationFrame: noop, URL, Blob: global.Blob,
  FileReader: function () {}, navigator: { userAgent: 'Node test VM' }
};
vm.createContext(production);
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of index.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  if (match[1].endsWith('/27-boot.js')) continue;
  vm.runInContext(fs.readFileSync(path.join(root, match[1]), 'utf8'), production, { filename: match[1] });
}
vm.runInContext("createSeed='V0822-SERVICE-SAVE';createStart='settlement';state=makeInitial('Guild Save Tester','human','village');", production);
const productionGuild = vm.runInContext("state.world.organizations.find(record=>record.organizationType==='adventurers-guild')", production);
assert.ok(productionGuild, 'generated production world contains an available guild');
vm.runInContext(`state.world.siteId=state.world.region.sites.find(site=>site.geoId===${JSON.stringify(productionGuild.locationGeoId)}).id;ir06EnsureNPCs();`, production);
const productionReceptionistId = productionGuild.receptionistNpcId;
const productionSiteId = vm.runInContext('state.world.siteId', production);
vm.runInContext(`ir06Remember(ir072NPC(${JSON.stringify(productionReceptionistId)}),'Production save memory','guild-service');persist()`, production);
const productionLoaded = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())', production));
const productionLoadedGuild = productionLoaded.world.organizations.find(record => record.id === productionGuild.id);
assert.equal(productionLoadedGuild.receptionistNpcId, productionReceptionistId);
assert.equal(productionLoadedGuild.guildmasterNpcId, productionGuild.guildmasterNpcId);
assert.equal(productionLoaded.character.npcs.find(npc => npc.id === productionReceptionistId).memories[0].text, 'Production save memory');
assert.equal(productionSiteId, productionLoaded.world.siteId);

console.log('v0.8.2.2 guild service tests: PASS');
