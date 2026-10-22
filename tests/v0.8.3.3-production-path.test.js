'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const noop = () => {};
const element = () => ({ textContent: '', innerHTML: '', title: '', style: {}, dataset: {}, appendChild: noop, remove: noop, click: noop, focus: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
const appRoot = element();
const storage = new Map();
const production = {
  console: { warn: noop, log: noop, error: console.error }, Math: Object.create(Math),
  document: { title: '', head: element(), body: element(), documentElement: element(), addEventListener: noop, querySelector: selector => selector === '#app' ? appRoot : null, querySelectorAll: () => [], getElementById: () => null, createElement: element },
  window: { scrollTo: noop, addEventListener: noop },
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  setTimeout: () => 0, clearTimeout: noop, requestAnimationFrame: noop, URL, Blob: global.Blob, FileReader: function () {}, navigator: { userAgent: 'Node production-path test' }
};
production.Math.random = () => 0;
vm.createContext(production);
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of index.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  if (match[1].endsWith('/27-boot.js')) continue;
  vm.runInContext(fs.readFileSync(path.join(root, match[1]), 'utf8'), production, { filename: match[1] });
}
production.toast = message => { production.lastToast = String(message); };
vm.runInContext("createSeed='V0833-PRODUCTION-DUTIES';createStart='settlement';state=makeInitial('Duty Tester','human','village');ir05EnsureState(state)", production);
const guild = vm.runInContext("state.world.organizations.find(row=>row.organizationType==='adventurers-guild')", production);
assert.ok(guild, 'fixture world generated an adventurers guild');
const guildSite = vm.runInContext(`ir0822GuildSite(state.world,state.world.organizations.find(row=>row.id===${JSON.stringify(guild.id)}))`, production);
assert.ok(guildSite, 'guild location resolves');
vm.runInContext(`state.world.siteId=${JSON.stringify(guildSite.id)};ir06EnsureNPCs()`, production);
const freshGuild = vm.runInContext(`state.world.organizations.find(row=>row.id===${JSON.stringify(guild.id)})`, production);
const receptionistId = freshGuild.receptionistNpcId;
assert.ok(receptionistId, 'guild receptionist resolves');
vm.runInContext("ir05JoinFaction('adventurers')", production);
if (!vm.runInContext(`ir0825GuildMembership(state.character,state.world.organizations.find(row=>row.id===${JSON.stringify(guild.id)}))`, production)) {
  vm.runInContext("state.character.factionMembership=IR_V08_FACTIONS.find(row=>row.organizationType==='adventurers-guild').legacyId", production);
}
assert.equal(vm.runInContext(`ir0825GuildMembership(state.character,state.world.organizations.find(row=>row.id===${JSON.stringify(guild.id)}))`, production), true);

// Render the actual Association page from the complete production source. Opening it must be read-only for progression.
const progressionBeforeTab = vm.runInContext('JSON.stringify(state.character.adventurerProgression)', production);
vm.runInContext("setTab('Association')", production);
assert.match(appRoot.innerHTML, /Adventurers’ Association/);
assert.match(appRoot.innerHTML, /QUEST MANAGEMENT/);
assert.match(appRoot.innerHTML, /MEMBERS &amp; RANKS|MEMBERS & RANKS/);
assert.match(appRoot.innerHTML, /data-tab="Association"/);
assert.match(appRoot.innerHTML, /ir0837-branch-nav/, 'Branch navigation is available in the Association view');
assert.match(appRoot.innerHTML, /href="#ir0837-branch-/, 'Branch navigation targets the matching branch card');
assert.match(appRoot.innerHTML, /YOUR BRANCH/, 'The player membership branch is visually selected');
assert.match(appRoot.innerHTML, /<dt>Location<\/dt>[\s\S]*?<dt>Reception<\/dt>[\s\S]*?<dt>Leadership<\/dt>/, 'Branch location and configured staff are grouped in branch details');
assert.doesNotMatch(appRoot.innerHTML, /data-action="ir0833-accept-duty"|data-action="ir0834-accept-contract"/, 'Offers are not duplicated inline; the dedicated boards own their detailed cards');
assert.equal(vm.runInContext('JSON.stringify(state.character.adventurerProgression)', production), progressionBeforeTab);
vm.runInContext("state.view='Life';render()", production);

const click = (action, extra = {}) => vm.runInContext(`ir072Action({dataset:${JSON.stringify({ action, npc: receptionistId, ...extra })}})`, production);
click('ir0833-open-duty-board');
assert.equal(vm.runInContext('modal.kind', production), 'ir0833-guild-duty-board');
const boardHtml = vm.runInContext('renderModal()', production);
assert.match(boardHtml, /Gather Bitterleaf/);
assert.match(boardHtml, /Deliver Field Bandages/);
assert.match(boardHtml, /GUILD DUTIES/);
assert.match(boardHtml, /ir0837-board/);
assert.match(boardHtml, /ir0837-quest-card/);
assert.match(boardHtml, /Target:<\/strong> 5 Bitterleaf/);
vm.runInContext(`modal={kind:'ir072-interactions',npc:${JSON.stringify(receptionistId)}}`, production);
assert.match(vm.runInContext('ir0823GuildMembershipModal()', production), /Open duties/);

// Real combat resolution awards only a confirmed target victory.
click('ir0833-accept-duty', { template: 'goblin-defeat-3' });
click('ir0836-open-duties', { guild: guild.id, npc: receptionistId });
const activeDutyBoard = vm.runInContext('renderModal()', production);
assert.match(activeDutyBoard, /One Association assignment is already active/);
assert.match(activeDutyBoard, /data-action="ir0833-accept-duty"[^>]*disabled aria-disabled="true"/);
const contractCountBeforeBlockedAttempt = vm.runInContext('state.character.guildContractState?.accepted?.length || 0', production);
vm.runInContext('ir0834AcceptContract({dataset:{}})', production);
assert.equal(vm.runInContext('state.character.guildContractState?.accepted?.length || 0', production), contractCountBeforeBlockedAttempt, 'An active duty blocks direct contract acceptance at the underlying service');
click('ir0833-accept-duty', { template: 'bitterleaf-gather-5' });
assert.equal(vm.runInContext('state.character.adventurerProgression.activeDuties.length', production), 1, 'A second duty cannot bypass the shared assignment slot');
click('ir0836-open-duties', { guild: guild.id, npc: receptionistId });
assert.equal(vm.runInContext('modal.kind', production), 'ir0833-guild-duty-board', 'The Association tab still links to the existing duty-management service while a duty is active');
vm.runInContext('modal=null;render()', production);
click('ir0836-open-contracts', { guild: guild.id, npc: receptionistId });
assert.equal(vm.runInContext('modal.kind', production), 'ir0824-guild-contract-board', 'The Association tab links to the existing contract-management service while another assignment is active');
vm.runInContext('modal=null;render()', production);
vm.runInContext("startCombat('goblin',{type:'wild'})", production);
vm.runInContext("irCombatEnd('victory','test-confirmed victory')", production);
assert.equal(vm.runInContext("state.character.adventurerProgression.activeDuties[0].progress", production), 1);
vm.runInContext("startCombat('goblin',{type:'wild'});irCombatEnd('escape','not a victory')", production);
assert.equal(vm.runInContext("state.character.adventurerProgression.activeDuties[0].progress", production), 1);
const goblinDuty = vm.runInContext("state.character.adventurerProgression.activeDuties[0].id", production);
click('ir0833-cancel-duty', { duty: goblinDuty });

// Actual herbalism gathering is hooked to produced inventory and never counts a failed yield.
const herbPool = vm.runInContext(`irBiomeGatheringItems(site(),'herbalism')`, production);
assert.ok(Array.isArray(herbPool) && herbPool.includes('herb'), 'selected site supports Bitterleaf herbalism');
click('ir0833-accept-duty', { template: 'bitterleaf-gather-5' });
const herbBefore = vm.runInContext('state.character.inventory.herb||0', production);
vm.runInContext("ir04Gather('herbalism')", production);
assert.equal(vm.runInContext("state.character.adventurerProgression.activeDuties.find(row=>row.templateId==='bitterleaf-gather-5').progress", production), Math.max(0, vm.runInContext('state.character.inventory.herb', production) - herbBefore));
const herbDuty = vm.runInContext("state.character.adventurerProgression.activeDuties.find(row=>row.templateId==='bitterleaf-gather-5').id", production);
click('ir0833-cancel-duty', { duty: herbDuty });

// Actual receptionist delivery removes inventory and records completed duty credit.
click('ir0833-accept-duty', { template: 'field-bandage-delivery-2' });
vm.runInContext('state.character.inventory.bandage=2', production);
const deliveryId = vm.runInContext("state.character.adventurerProgression.activeDuties.find(row=>row.templateId==='field-bandage-delivery-2').id", production);
const deliveryOperation = `${deliveryId}:deliver:0:${vm.runInContext('state.character.daysLived', production)}:2`;
click('ir0833-deliver-duty', { duty: deliveryId, operation: deliveryOperation });
assert.equal(vm.runInContext("state.character.inventory.bandage", production), 0);
assert.equal(vm.runInContext(`state.character.adventurerProgression.dutyHistory.find(row=>row.id===${JSON.stringify(deliveryId)}).status`, production), 'completed');

// Production save normalization initializes only missing rank data, preserves valid rank and unknown fields,
// and quarantines invalid rank records without replacing them.
const roundTrip = vm.runInContext('normalizeSave(JSON.parse(JSON.stringify(state)))', production);
assert.equal(roundTrip.character.adventurerProgression.currentRank, 'F');
assert.equal(roundTrip.character.adventurerProgression.dutyHistory.some(row => row.id === deliveryId), true);
const legacySave = JSON.parse(JSON.stringify(roundTrip));
delete legacySave.character.adventurerProgression;
legacySave.character.inventory.bandage = 4;
const migrated = vm.runInContext(`normalizeSave(JSON.parse(${JSON.stringify(JSON.stringify(legacySave))}))`, production);
assert.equal(migrated.character.adventurerProgression.currentRank, 'F');
assert.equal(migrated.character.inventory.bandage, 4);
const validRankSave = JSON.parse(JSON.stringify(roundTrip));
validRankSave.character.adventurerProgression.currentRank = 'B';
const validRankLoaded = vm.runInContext(`normalizeSave(JSON.parse(${JSON.stringify(JSON.stringify(validRankSave))}))`, production);
assert.equal(validRankLoaded.character.adventurerProgression.currentRank, 'B');
const invalidRankSave = JSON.parse(JSON.stringify(roundTrip));
invalidRankSave.character.adventurerProgression.currentRank = 'A+';
const invalidRaw = JSON.stringify(invalidRankSave.character.adventurerProgression);
const invalidLoaded = vm.runInContext(`normalizeSave(JSON.parse(${JSON.stringify(JSON.stringify(invalidRankSave))}))`, production);
assert.equal(JSON.stringify(invalidLoaded.character.adventurerProgression), invalidRaw);
assert.equal(invalidLoaded.character.adventurerProgressionIntegrity.status, 'quarantined');

console.log('v0.8.3.3 production-path tests: PASS');
