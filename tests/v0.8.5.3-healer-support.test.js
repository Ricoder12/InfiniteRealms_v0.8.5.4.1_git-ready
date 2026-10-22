'use strict';
// Run: node tests/v0.8.5.3-healer-support.test.js
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

vm.runInContext("createSeed='V0853-RoleTest';createStart='settlement';state=makeInitial('Support Tester','human','village')",ctx);
const ids = Array.from(vm.runInContext('state.character.npcs.slice(0,2).map(n=>n.id)',ctx));
for (const id of ids) {
  vm.runInContext(`state.character.relationships['${id}']={affinity:12,trust:10,status:'Companion',milestones:[]}`,ctx);
  assert.equal(vm.runInContext(`ir0842RecruitCompanion('${id}').ok`,ctx),true);
}
const squadId = vm.runInContext('ir0841Squads()[0].id',ctx);
assert.equal(vm.runInContext(`ir0843FormParty('${squadId}',['${ids[0]}']).ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843AddPartyMember('${ids[1]}').ok`,ctx),true);
for (const [id, attack, defense] of [[ids[0],40,4],[ids[1],30,2]]) {
  ctx.profile = { maxHealth:100,currentHealth:100,attack,defense };
  assert.equal(vm.runInContext(`ir0851ConfigureCompanionCombatProfile('${id}',profile).ok`,ctx),true);
  delete ctx.profile;
}

const roles = ['leader','member','tank','damage dealer','healer','support'];
assert.deepEqual(Array.from(vm.runInContext('IR_V0843_PARTY_ROLES',ctx)),roles);
for (const role of roles) assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[0]}','${role}').ok`,ctx),true,`${role} is assignable`);
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[0]}','bard').ok`,ctx),false,'unsupported role assignment is rejected');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('missing-npc','healer').ok`,ctx),false,'roles require a valid party member');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[0]}','support').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[1]}','healer').ok`,ctx),true);

// Support reuses the existing guard state and damage calculation, with no added energy or mana cost.
assert.equal(vm.runInContext("startCombat('goblin',{type:'wild'})",ctx),true);
vm.runInContext('state.combat.enemyHP=500;state.combat.enemyMaxHP=500;state.combat.enemyAttack=20;state.combat.enemyDefense=0;state.character.health=100',ctx);
const before = vm.runInContext('({ health:state.character.health, energy:state.character.energy, mana:state.character.mana })',ctx);
vm.runInContext('irEnemyTurn()',ctx);
assert.equal(vm.runInContext('state.combat.guarding',ctx),false,'existing enemy turn consumes the guard state');
assert.match(vm.runInContext('state.combat.log.join(" ")',ctx),/braces to guard/,'support action is visible in the combat log');
assert.match(vm.runInContext('state.combat.log.join(" ")',ctx),/through your guard/,'the existing guard damage path resolves');
const after = vm.runInContext('({ health:state.character.health, energy:state.character.energy, mana:state.character.mana })',ctx);
const defense = vm.runInContext('irCurrentDefense()',ctx);
assert.equal(before.health-after.health,Math.max(1,Math.ceil((20-defense)*.45)),'support reuses the existing guard mitigation');
assert.equal(after.energy,before.energy,'support does not add an energy cost');
assert.equal(after.mana,before.mana,'support does not add a mana cost');
vm.runInContext('persist()',ctx);
const saved = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())',ctx));
ctx.saved = saved;
const loaded = vm.runInContext('normalizeSave(saved)',ctx);
delete ctx.saved;
assert.equal(loaded.character.activeParty.members.find(m=>m.npcId===ids[0]).combatRole,'support','support assignment survives save/load');
assert.equal(loaded.character.activeParty.members.find(m=>m.npcId===ids[1]).combatRole,'healer','healer assignment survives save/load');
assert.deepEqual(Array.from(loaded.combat.partyNpcIds),ids,'party combat IDs remain stable after save/load');
vm.runInContext('state.combat.playerOut=false;state.character.health=100;state.combat.enemyHP=500;state.combat.enemyMaxHP=500;state.combat.guarding=true;irEnemyTurn()',ctx);
assert.ok(vm.runInContext('state.combat.enemyHP',ctx)<500,'support takes its normal attack when an existing guard is already active');

// Healer role remains selectable, but companions have no known-spell or mana data to resolve Healing Light.
assert.match(vm.runInContext('ir0843PartyPanel()',ctx),/Combat healing unavailable/,'healer capability limitation is shown');
const allyHealthBefore = vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx);
const healerManaBefore = vm.runInContext('state.character.mana',ctx);
assert.equal(vm.runInContext(`state.character.npcs.find(n=>n.id==='${ids[1]}').knownSpells`,ctx),undefined,'persistent NPC records have no spell list');
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${ids[1]}'].mana`,ctx),undefined,'companion profile has no mana resource');
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx),allyHealthBefore,'healer assignment does not invent a healing action or target');
assert.equal(vm.runInContext('state.character.mana',ctx),healerManaBefore,'unsupported companion healing does not spend player mana');
vm.runInContext("state.character.knownSpells.push('healing_light');state.character.naturalTalents=[];state.character.naturalTalentsGenerated=true;ir05EnsureState();state.character.mana=state.character.maxMana;state.character.health=30",ctx);
const playerManaBeforeSpell = vm.runInContext('state.character.mana',ctx);
vm.runInContext("ir05CastSpell('healing_light')",ctx);
assert.equal(vm.runInContext('state.character.mana',ctx),playerManaBeforeSpell-15,'existing Healing Light retains its player mana cost');
assert.match(vm.runInContext('state.combat.log.join(" ")',ctx),/Healing Light restores 26 health/,'existing Healing Light retains its configured combat heal');
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx),allyHealthBefore,'existing Healing Light remains player-targeted');

// Existing deterministic targeting still chooses the first eligible companion once the player is down.
vm.runInContext('state.character.health=1;state.combat.playerOut=true;state.combat.enemyHP=500;state.combat.enemyAttack=20',ctx);
const firstBefore = vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx);
const secondBefore = vm.runInContext(`state.character.companionCombatProfiles['${ids[1]}'].currentHealth`,ctx);
vm.runInContext('irEnemyTurn()',ctx);
assert.ok(vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx)<firstBefore,'first eligible companion remains the enemy target');
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${ids[1]}'].currentHealth`,ctx),secondBefore,'enemy does not retarget a later companion');
assert.equal(vm.runInContext('state.combat.guarding',ctx),false,'support cannot guard a down player or redirect targeting');

console.log('v0.8.5.3 healer/support tests passed; companion spell healing remains unsupported');
