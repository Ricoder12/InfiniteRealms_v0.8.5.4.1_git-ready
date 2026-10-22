'use strict';
// Run: node tests/v0.8.5.1-combat-party-integration.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
const element = () => ({ textContent: '', innerHTML: '', title: '', style: {}, dataset: {}, appendChild: noop, remove: noop, click: noop, focus: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
const storage = new Map();
const ctx = { console, Math: Object.create(Math), document: { title: '', head: element(), body: element(), documentElement: element(), addEventListener: noop, querySelector: s => s === '#app' ? element() : null, querySelectorAll: () => [], getElementById: () => null, createElement: element }, window: { scrollTo: noop, addEventListener: noop }, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) }, setTimeout: () => 0, clearTimeout: noop, requestAnimationFrame: noop, URL, Blob, FileReader: function(){}, navigator: { userAgent: 'Node test VM' } };
ctx.Math.random = () => 0;
vm.createContext(ctx);
const root = path.resolve(__dirname, '..');
for (const [,src] of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script src="([^"]+)"><\/script>/g)) {
  if (!src.endsWith('/27-boot.js')) vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),ctx,{filename:src});
}

function setup(name = 'Combat Party Tester') {
  vm.runInContext(`createSeed='V0851-${name.replace(/[^A-Za-z]/g,'')}';createStart='settlement';state=makeInitial('${name}','human','village')`,ctx);
  const ids = Array.from(vm.runInContext('state.character.npcs.slice(0,2).map(n=>n.id)',ctx));
  for (const id of ids) vm.runInContext(`state.character.relationships['${id}']={affinity:12,trust:10,status:'Companion',milestones:[]}`,ctx);
  for (const id of ids) assert.equal(vm.runInContext(`ir0842RecruitCompanion('${id}').ok`,ctx),true);
  const squadId = vm.runInContext('ir0841Squads()[0].id',ctx);
  assert.equal(vm.runInContext(`ir0843FormParty('${squadId}',['${ids[0]}']).ok`,ctx),true);
  assert.equal(vm.runInContext(`ir0843AddPartyMember('${ids[1]}').ok`,ctx),true);
  return ids;
}
function configure(id, profile) {
  ctx.profileInput = profile;
  const result = vm.runInContext(`ir0851ConfigureCompanionCombatProfile('${id}',profileInput)`,ctx);
  delete ctx.profileInput;
  return result;
}

let [first, second] = setup();
assert.equal(vm.runInContext('ir0851CombatParticipantIds().length',ctx),0,'companions without configured profiles remain recruitable but cannot participate');
assert.equal(configure(first,{maxHealth:100,currentHealth:100,attack:100,defense:2}).ok,true);
assert.equal(configure(second,{maxHealth:80,currentHealth:80,attack:70,defense:1}).ok,true);
assert.equal(configure('missing-npc',{maxHealth:100,currentHealth:100,attack:10,defense:0}).ok,false,'unknown NPC references cannot receive profiles');
assert.equal(configure(first,{maxHealth:100,currentHealth:101,attack:100,defense:2}).ok,false,'out-of-range health is rejected');
assert.equal(configure(first,{maxHealth:100,currentHealth:100,attack:0,defense:2}).ok,false,'invalid attack is rejected');
assert.equal(configure(first,{maxHealth:100,currentHealth:100,attack:100}).ok,false,'incomplete profiles are rejected');
assert.equal(vm.runInContext('ir0851CombatParticipantIds().length',ctx),2);

// Basic attacks run inside the existing enemy-turn lifecycle, use existing enemy defense,
// and do not grant companion skill progression.
assert.equal(vm.runInContext("startCombat('goblin',{type:'wild'})",ctx),true);
vm.runInContext('state.combat.enemyHP=145;state.combat.enemyMaxHP=145;state.character.skills.Combat.xp=0;irBattleMove("defend")',ctx);
assert.ok(vm.runInContext('state.combat.enemyHP',ctx) < 145,'companion basic attack damages the encounter enemy');
assert.equal(vm.runInContext('state.character.skills.Combat.xp',ctx),0,'companion attack grants no player progression');
assert.equal(vm.runInContext('state.combat.partyNpcIds.length',ctx),2,'encounter stores stable NPC IDs');
assert.ok(vm.runInContext('state.character.health',ctx) < 100,'enemy targets the player while the player is valid');
assert.match(vm.runInContext('irCombatPanel()',ctx),/PARTY COMBATANTS/);
assert.match(vm.runInContext('irCombatPanel()',ctx),/100\/100 HP/);

// Player-first targeting is preserved. When the player falls, deterministic targeting
// moves to the first still-eligible companion in stable party order.
vm.runInContext('state.character.health=1;state.combat.enemyHP=200;state.combat.enemyMaxHP=200;state.combat.enemyAttack=15;irBattleMove("defend")',ctx);
assert.equal(vm.runInContext('state.combat.playerOut',ctx),true,'player defeat is recoverable while companions remain');
assert.equal(vm.runInContext('state.character.health',ctx),1,'existing defeat recovery keeps the player alive');
assert.match(vm.runInContext('irCombatPanel()',ctx),/Companions continue/);
const firstBefore = vm.runInContext(`state.character.companionCombatProfiles['${first}'].currentHealth`,ctx);
const secondBefore = vm.runInContext(`state.character.companionCombatProfiles['${second}'].currentHealth`,ctx);
vm.runInContext("irBattleMove('companion-turn')",ctx);
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${first}'].currentHealth`,ctx),firstBefore-13,'enemy targets first companion in stable party order and persists damage');
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${second}'].currentHealth`,ctx),secondBefore,'enemy does not apply companion-targeted damage to another NPC');
assert.equal(vm.runInContext('state.character.health',ctx),1,'companion-targeted enemy attack does not damage the player');

// Mid-encounter dismissal is revalidated; missing references are safely pruned on load.
assert.equal(vm.runInContext(`ir0843RemovePartyMember('${second}').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0851AvailableCombatCompanions().some(x=>x.npcId==='${second}')`,ctx),false,'removed companion cannot act');
assert.equal(vm.runInContext(`ir0843AddPartyMember('${second}').ok`,ctx),true);
vm.runInContext(`ir0842DismissCompanion('${second}')`,ctx);
assert.equal(vm.runInContext(`ir0851AvailableCombatCompanions().some(x=>x.npcId==='${second}')`,ctx),false,'dismissed companion cannot act');
vm.runInContext(`state.combat.partyNpcIds.push('missing-npc','${first}');persist()`,ctx);
const saved = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())',ctx));
ctx.saved = saved;
const loaded = vm.runInContext('normalizeSave(saved)',ctx);
delete ctx.saved;
assert.equal(loaded.combat.partyNpcIds.includes('missing-npc'),false,'invalid encounter references are removed');
assert.deepEqual(Array.from(loaded.combat.partyNpcIds),[first],'duplicate and dismissed encounter references are removed');
assert.equal(loaded.character.companionCombatProfiles[first].currentHealth,firstBefore-13,'companion health survives save/load');
assert.equal(loaded.character.activeParty.members.some(m=>m.npcId===second),false,'dismissed member remains removed from party');
const corrupted = JSON.parse(JSON.stringify(saved));
corrupted.character.companionCombatProfiles[first].currentHealth = 101;
corrupted.combat.partyNpcIds.push(first);
ctx.corrupted = corrupted;
const corruptLoaded = vm.runInContext('normalizeSave(corrupted)',ctx);
delete ctx.corrupted;
assert.equal(corruptLoaded.character.companionCombatProfiles[first],undefined,'invalid persisted profile data is rejected');
assert.equal(corruptLoaded.combat,null,'a restored encounter with no valid target is safely cleared');
const legacy = JSON.parse(JSON.stringify(saved));
delete legacy.character.companionCombatProfiles;
legacy.combat = null;
ctx.legacy = legacy;
const legacyLoaded = vm.runInContext('normalizeSave(legacy)',ctx);
delete ctx.legacy;
assert.deepEqual(Object.keys(legacyLoaded.character.companionCombatProfiles),[],'old saves receive only an empty optional profile map');
assert.equal(legacyLoaded.character.activeParty.members.some(m=>m.npcId===first),true,'old party state remains intact');

// Existing rest/healer amounts, costs, service restrictions, and player state remain intact.
ctx.loaded = loaded;
vm.runInContext('state=loaded;state.combat=null;state.character.coin=50',ctx);
delete ctx.loaded;
let healingSite = vm.runInContext("state.world.region.sites.find(s=>s.services?.includes('inn')&&s.services?.includes('healer'))||state.world.region.sites.find(s=>s.services?.includes('healer'))",ctx);
ctx.healingSite = healingSite;
vm.runInContext('state.world.siteId=healingSite.id',ctx);
delete ctx.healingSite;
const playerHealthBeforeRest = vm.runInContext('state.character.health',ctx);
const party = vm.runInContext('ir0843ActiveParty()',ctx);
const recoverable = party.members.find(m=>m.npcId===first)?.npcId;
assert.ok(recoverable,'first companion remains eligible for recovery');
const hpBeforeRest = vm.runInContext(`state.character.companionCombatProfiles['${first}'].currentHealth`,ctx);
if (vm.runInContext("site().services.includes('inn')||site().changes?.temporaryCamp",ctx)) {
  assert.equal(vm.runInContext(`ir0851RecoverCompanion('${first}','rest').ok`,ctx),true);
  const amount = vm.runInContext("site().services.includes('inn')?10:5",ctx);
  assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${first}'].currentHealth`,ctx),Math.min(100,hpBeforeRest+amount));
  assert.equal(vm.runInContext('state.character.health',ctx),playerHealthBeforeRest,'rest recovery leaves direct player health untouched');
}
if (vm.runInContext("site().services.includes('healer')",ctx)) {
  const hpBeforeHealer = vm.runInContext(`state.character.companionCombatProfiles['${first}'].currentHealth`,ctx);
  assert.equal(vm.runInContext(`ir0851RecoverCompanion('${first}','healer').ok`,ctx),true);
  assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${first}'].currentHealth`,ctx),Math.min(100,hpBeforeHealer+35));
  assert.equal(vm.runInContext('state.character.health',ctx),playerHealthBeforeRest,'healer recovery leaves direct player health untouched');
}
const wilderness = vm.runInContext("state.world.region.sites.find(s=>!(s.services||[]).includes('inn')&&!(s.services||[]).includes('healer')&&!s.changes?.temporaryCamp)",ctx);
if (wilderness) {
  ctx.wilderness = wilderness;
  vm.runInContext('state.world.siteId=wilderness.id',ctx);
  delete ctx.wilderness;
  const unavailableHealth = vm.runInContext(`state.character.companionCombatProfiles['${first}'].currentHealth`,ctx);
  const unavailableCoins = vm.runInContext('state.character.coin',ctx);
  assert.equal(vm.runInContext(`ir0851RecoverCompanion('${first}','rest').ok`,ctx),false,'rest cannot bypass location requirements');
  assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${first}'].currentHealth`,ctx),unavailableHealth);
  assert.equal(vm.runInContext('state.character.coin',ctx),unavailableCoins);
}

// Defeated companions are excluded, then existing recovery can restore them without combat-end healing.
vm.runInContext(`state.character.companionCombatProfiles['${first}'].currentHealth=0`,ctx);
assert.equal(vm.runInContext('ir0851CombatParticipantIds().includes("'+first+'")',ctx),false);
assert.match(vm.runInContext('ir0843PartyPanel()',ctx),/Defeated/);

// A restored encounter with no valid player or companion target closes safely.
vm.runInContext('state.character.combatStats.defeats=0;startCombat("goblin",{type:"wild"});state.combat.partyNpcIds=["'+first+'"];state.combat.playerOut=true;irEnemyTurn()',ctx);
assert.equal(vm.runInContext('state.combat',ctx),null,'no-target encounter resolves through existing defeat cleanup');
assert.equal(vm.runInContext('state.character.combatStats.defeats',ctx),1);

// The original player rest/healer handlers retain their existing recovery amounts and costs.
const innSite = vm.runInContext("state.world.region.sites.find(s=>s.services?.includes('inn'))",ctx);
const healerSite = vm.runInContext("state.world.region.sites.find(s=>s.services?.includes('healer'))",ctx);
assert.ok(innSite && healerSite,'world exposes the existing rest and healer services');
ctx.innSite = innSite;
vm.runInContext('state.world.siteId=innSite.id;state.character.health=50;state.character.coin=50;localRest()',ctx);
delete ctx.innSite;
assert.equal(vm.runInContext('state.character.health',ctx),60,'player inn rest retains its existing +10 health');
assert.equal(vm.runInContext('state.character.coin',ctx),38,'player inn rest retains its existing 12 coin cost');
ctx.healerSite = healerSite;
vm.runInContext('state.world.siteId=healerSite.id;state.character.health=50;state.character.coin=50;localHealer()',ctx);
delete ctx.healerSite;
assert.equal(vm.runInContext('state.character.health',ctx),85,'player healer retains its existing +35 health');
assert.equal(vm.runInContext('state.character.coin',ctx),42,'player healer retains its existing 8 coin cost');

// Solo combat still follows the original resolver, enemy turn, rewards, and cleanup.
vm.runInContext('state.character.activeParty=null;state.character.combatStats.wins=0;state.character.combatStats.defeats=0;state.character.health=100;startCombat("goblin",{type:"wild"});state.combat.enemyHP=200;state.combat.enemyMaxHP=200',ctx);
assert.equal(vm.runInContext('state.combat.partyNpcIds',ctx),undefined,'solo combat has no companion encounter state');
const soloHealth = vm.runInContext('state.character.health',ctx);
vm.runInContext('irBattleMove("attack")',ctx);
assert.ok(vm.runInContext('state.character.health',ctx)<soloHealth,'solo enemy turn still damages the player');
assert.equal(vm.runInContext('state.combat.round',ctx),2,'solo round progression remains unchanged');
const soloCoins = vm.runInContext('state.character.coin',ctx);
vm.runInContext('state.combat.enemyHP=1;state.combat.enemyMaxHP=1;state.character.attrs.Strength=40;state.character.skills.Combat.level=10;irBattleMove("attack")',ctx);
assert.equal(vm.runInContext('state.combat',ctx),null,'solo victory cleans up combat');
assert.equal(vm.runInContext('state.character.combatStats.wins',ctx),1,'solo victory progression is preserved');
assert.equal(vm.runInContext('state.character.combatStats.monstersDefeated',ctx),1,'solo kill record is preserved');
assert.ok(vm.runInContext('state.character.coin',ctx)>soloCoins,'solo victory reward is preserved');
assert.equal(vm.runInContext('state.character.companionCombatProfiles["'+first+'"].currentHealth',ctx),0,'combat end does not restore companion health');
console.log('v0.8.5.1 combat party integration tests: PASS');
