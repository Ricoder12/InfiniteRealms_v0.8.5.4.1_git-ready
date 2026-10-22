'use strict';
// Run: node tests/v0.8.5.2-role-combat.test.js
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

vm.runInContext("createSeed='V0852-RoleTest';createStart='settlement';state=makeInitial('Role Tester','human','village')",ctx);
const ids = Array.from(vm.runInContext('state.character.npcs.slice(0,2).map(n=>n.id)',ctx));
for (const id of ids) {
  vm.runInContext(`state.character.relationships['${id}']={affinity:12,trust:10,status:'Companion',milestones:[]}`,ctx);
  assert.equal(vm.runInContext(`ir0842RecruitCompanion('${id}').ok`,ctx),true);
}
const squadId = vm.runInContext('ir0841Squads()[0].id',ctx);
assert.equal(vm.runInContext(`ir0843FormParty('${squadId}',['${ids[0]}']).ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843AddPartyMember('${ids[1]}').ok`,ctx),true);
for (const [id, attack, defense] of [[ids[0],100,2],[ids[1],1,1]]) {
  ctx.profile = { maxHealth:100,currentHealth:100,attack,defense };
  assert.equal(vm.runInContext(`ir0851ConfigureCompanionCombatProfile('${id}',profile).ok`,ctx),true);
  delete ctx.profile;
}
assert.equal(vm.runInContext("ir0851ValidProfile({schema:1,maxHealth:20,currentHealth:20,attack:'bad',defense:0})",ctx),false,'malformed attack values cannot form a valid combat profile');
assert.equal(vm.runInContext("ir0851ValidProfile({schema:1,maxHealth:20,currentHealth:20,attack:10,defense:NaN})",ctx),false,'malformed defense values cannot form a valid combat profile');

assert.deepEqual(Array.from(vm.runInContext('IR_V0843_PARTY_ROLES',ctx)),['leader','member','tank','damage dealer','healer','support']);
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[1]}','leader').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843ActiveParty().members.filter(m=>m.role==='leader').length`,ctx),1,'leader remains unique');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[1]}','tank').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843ActiveParty().members.find(m=>m.npcId==='${ids[1]}').role`,ctx),'leader','combat role does not overwrite leadership');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[1]}','damage dealer').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843ActiveParty().members.find(m=>m.npcId==='${ids[1]}').combatRole`,ctx),'damage dealer');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[1]}','bard').ok`,ctx),false,'unsupported roles are rejected');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('missing-npc','tank').ok`,ctx),false,'role assignment requires an active party member');

// Only the damage dealer receives the approved runtime attack multiplier; persisted base stats stay unchanged.
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[0]}','damage dealer').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[1]}','member').ok`,ctx),true);
vm.runInContext("startCombat('goblin',{type:'wild'});state.combat.enemyHP=500;state.combat.enemyMaxHP=500;state.combat.enemyDefense=0;irBattleMove('defend')",ctx);
assert.equal(vm.runInContext('state.combat.enemyHP',ctx),435,'damage dealer uses 1.5x attack in existing basic-attack formula');
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].attack`,ctx),100,'runtime attack does not alter saved base attack');
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${ids[1]}'].attack`,ctx),1,'member uses unmodified attack');
vm.runInContext('state.combat.enemyHP=500;state.combat.enemyMaxHP=500;irEnemyTurn()',ctx);
assert.equal(vm.runInContext('state.combat.enemyHP',ctx),435,'repeated damage dealer attacks do not stack the runtime multiplier');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[0]}','member').ok`,ctx),true);
vm.runInContext('state.combat.enemyHP=500;state.combat.enemyMaxHP=500;state.combat.enemyDefense=0;state.character.health=100;state.combat.playerOut=false;irEnemyTurn()',ctx);
assert.equal(vm.runInContext('state.combat.enemyHP',ctx),456,'leader/member attacks remain unmodified by role multipliers');

// Tank reduction is applied only on companion damage; role changes affect later actions and base defense never changes.
vm.runInContext('state.character.health=1;state.combat.enemyHP=500;state.combat.enemyMaxHP=500;state.combat.enemyAttack=15;state.combat.playerOut=true',ctx);
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[0]}','tank').ok`,ctx),true);
let tankBefore = vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx);
vm.runInContext('irEnemyTurn()',ctx);
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx),tankBefore-12,'tank receives 1.5x configured defense (flooring final damage)');
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].defense`,ctx),2,'runtime defense does not alter saved base defense');
tankBefore = vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx);
vm.runInContext('irEnemyTurn()',ctx);
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx),tankBefore-12,'repeated tank defense does not stack the runtime multiplier');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[0]}','member').ok`,ctx),true);
tankBefore = vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx);
vm.runInContext('irEnemyTurn()',ctx);
assert.equal(vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth`,ctx),tankBefore-13,'role change removes multiplier on the next enemy action');

// Save/load retains combat roles, configured base stats, and the stable encounter roster.
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[1]}','damage dealer').ok`,ctx),true);
vm.runInContext('persist()',ctx);
const saved = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())',ctx));
ctx.saved = saved;
const loaded = vm.runInContext('normalizeSave(saved)',ctx);
delete ctx.saved;
assert.equal(loaded.character.activeParty.members.find(m=>m.npcId===ids[0]).combatRole,null);
assert.equal(loaded.character.activeParty.members.find(m=>m.npcId===ids[1]).role,'leader','existing leader handoff survives role changes and save/load');
assert.equal(loaded.character.activeParty.members.find(m=>m.npcId===ids[1]).combatRole,'damage dealer','combat role survives save/load');
assert.deepEqual(Array.from(loaded.combat.partyNpcIds),ids,'save/load retains stable companion encounter IDs');
assert.equal(loaded.character.companionCombatProfiles[ids[0]].attack,100);
assert.equal(loaded.character.companionCombatProfiles[ids[0]].defense,2);

// Defeated companions are excluded; the original solo combat path remains available and unchanged.
vm.runInContext(`state.character.companionCombatProfiles['${ids[0]}'].currentHealth=0`,ctx);
assert.equal(vm.runInContext(`ir0851AvailableCombatCompanions().some(c=>c.npcId==='${ids[0]}')`,ctx),false);
vm.runInContext('irCombatEnd("victory","role test complete");ir0843DisbandParty();startCombat("goblin",{type:"wild"})',ctx);
assert.equal(vm.runInContext('state.combat.partyNpcIds',ctx),undefined,'solo combat has no companion encounter state');
const basePlayerAttack = fs.readFileSync(path.join(root,'js/game/04-life-paths-combat-v0.3.js'),'utf8');
assert.ok(basePlayerAttack.includes('function irBattleMove'), 'player combat implementation remains present');

console.log('v0.8.5.2 role combat tests passed');
