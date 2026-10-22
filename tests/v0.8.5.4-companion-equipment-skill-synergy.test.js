'use strict';
// Run: node tests/v0.8.5.4-companion-equipment-skill-synergy.test.js
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

vm.runInContext("createSeed='V0854-Equipment';createStart='settlement';state=makeInitial('Equipment Tester','human','village')",ctx);
const ids = Array.from(vm.runInContext('state.character.npcs.slice(0,2).map(n=>n.id)',ctx));
for (const id of ids) {
  vm.runInContext(`state.character.relationships['${id}']={affinity:12,trust:10,status:'Companion',milestones:[]}`,ctx);
  assert.equal(vm.runInContext(`ir0842RecruitCompanion('${id}').ok`,ctx),true);
}
const squadId = vm.runInContext('ir0841Squads()[0].id',ctx);
assert.equal(vm.runInContext(`ir0843FormParty('${squadId}',['${ids[0]}','${ids[1]}']).ok`,ctx),true);
for (const id of ids) {
  ctx.profile = { maxHealth:100,currentHealth:100,attack:20,defense:4 };
  assert.equal(vm.runInContext(`ir0851ConfigureCompanionCombatProfile('${id}',profile).ok`,ctx),true);
  delete ctx.profile;
}

// Slot compatibility and inventory-backed item ownership.
vm.runInContext("state.character.inventory.dagger=2;state.character.equipment.weapon='dagger';state.character.inventory.iron_helmet=1;state.character.inventory.sword=1",ctx);
assert.equal(vm.runInContext(`ir0854EquipCompanion('${ids[0]}','dagger','weapon').ok`,ctx),true,'a second owned dagger can be assigned');
assert.equal(vm.runInContext(`ir0854EquipCompanion('${ids[1]}','dagger','weapon').ok`,ctx),false,'the same owned copy cannot be duplicated');
assert.equal(vm.runInContext(`ir0854EquipCompanion('${ids[0]}','iron_helmet','head').ok`,ctx),true,'compatible head armor equips');
assert.equal(vm.runInContext(`ir0854EquipCompanion('${ids[0]}','iron_helmet','weapon').ok`,ctx),false,'incompatible slot is rejected');
assert.equal(vm.runInContext(`ir0854EquipCompanion('${ids[0]}','unknown_item','weapon').ok`,ctx),false,'unknown item is rejected');
assert.equal(vm.runInContext(`ir0854EquipCompanion('missing-npc','sword','weapon').ok`,ctx),false,'missing NPC is rejected');
assert.equal(vm.runInContext(`ir0854EquipCompanion('${ids[0]}','sword','weapon').ok`,ctx),true,'a different available weapon replaces the current one');
assert.equal(vm.runInContext(`ir0854UnequipCompanion('${ids[0]}','weapon').ok`,ctx),true,'companion weapon can be unequipped');
assert.equal(vm.runInContext(`ir0854UnequipCompanion('${ids[0]}','weapon').ok`,ctx),false,'empty slot cannot be unequipped twice');
vm.runInContext('state.character.inventory.shield=1',ctx);
vm.runInContext(`ir072Action({dataset:{action:'ir0854-equip-companion',npc:'${ids[0]}',item:'shield',slot:'offhand'}})`,ctx);
assert.equal(vm.runInContext(`ir0854Equipment(state.character,'${ids[0]}').offhand`,ctx),'shield','party equipment button routes through the shared action handler');
vm.runInContext(`ir072Action({dataset:{action:'ir0854-unequip-companion',npc:'${ids[0]}',slot:'offhand'}})`,ctx);
assert.equal(vm.runInContext(`ir0854Equipment(state.character,'${ids[0]}').offhand`,ctx),undefined,'party unequip button routes through the shared action handler');

// Explicit NPC weapon proficiency is used for existing weapon/skill synergy only.
vm.runInContext(`state.character.npcs.find(n=>n.id==='${ids[0]}').skills={'Swordsmanship':{level:11}};ir0854EquipCompanion('${ids[0]}','sword','weapon')`,ctx);
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext(`ir0854CompanionSkillEntries('${ids[0]}').map(x=>[x.skill,x.level])`,ctx))),[['Swordsmanship',11]]);
assert.equal(vm.runInContext(`ir0854CompanionWeaponBonus('${ids[0]}')`,ctx),12,'sword base damage and configured Swordsmanship level use existing weapon formula');
assert.equal(vm.runInContext(`ir0854CompanionWeaponBonus('${ids[1]}')`,ctx),0,'companion without configured weapon skill receives no skill-derived bonus');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[0]}','damage dealer').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0852EffectiveCompanionAttack('${ids[0]}',ir0851Profile('${ids[0]}'))`,ctx),48,'damage dealer multiplier applies once to profile plus supported weapon contribution');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[0]}','tank').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0852EffectiveCompanionDefense('${ids[0]}',ir0851Profile('${ids[0]}'))`,ctx),7.5,'tank multiplier applies once to profile and helmet defense');
const swordCountBeforeSell = vm.runInContext('state.character.inventory.sword',ctx);
vm.runInContext("ir04Equip('sword');ir04MarketSell('sword')",ctx);
assert.equal(vm.runInContext('state.character.inventory.sword',ctx),swordCountBeforeSell,'player equipment and market cannot take a companion-assigned item');

// Combat uses companion gear while keeping solo combat data and player stats separate.
assert.equal(vm.runInContext("startCombat('goblin',{type:'wild'})",ctx),true);
vm.runInContext('state.combat.enemyHP=500;state.combat.enemyMaxHP=500;state.combat.enemyDefense=0',ctx);
const weaponConditionBefore = vm.runInContext("state.character.itemCondition.sword",ctx);
vm.runInContext('irEnemyTurn()',ctx);
assert.ok(vm.runInContext('state.combat.enemyHP',ctx)<500,'equipped companion attacks using existing encounter damage handling');
assert.ok(vm.runInContext("state.character.itemCondition.sword",ctx)<weaponConditionBefore,'companion weapon follows existing durability wear');
assert.match(vm.runInContext('ir0843PartyPanel()',ctx),/Equipment ·/,'party UI exposes companion equipment management');
assert.match(vm.runInContext('ir0843PartyPanel()',ctx),/No combat skills are configured for this NPC/,'party UI reports absent companion skills');
assert.match(vm.runInContext('ir0843PartyPanel()',ctx),/Swordsmanship/,'party UI shows explicitly configured weapon proficiency');
assert.equal(vm.runInContext('ir0854EquipCompanion("'+ids[0]+'","dagger","weapon").ok',ctx),false,'equipment cannot change during combat');

// Save/load keeps valid equipment and skills, removes missing references and duplicate over-allocation.
vm.runInContext('persist()',ctx);
const saved = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())',ctx));
saved.character.companionEquipment['missing-npc']={weapon:'dagger'};
saved.character.companionEquipment[ids[1]]={weapon:'dagger'};
saved.character.inventory.dagger=1;
const loaded = vm.runInContext('normalizeSave(saved)',Object.assign(ctx,{saved}));
assert.equal(loaded.character.companionEquipment['missing-npc'],undefined,'missing NPC equipment reference is dropped');
assert.equal(loaded.character.companionEquipment[ids[0]].weapon,'sword','valid companion equipment persists');
assert.equal(loaded.character.companionEquipment[ids[1]],undefined,'over-allocated item reference is dropped');
assert.equal(vm.runInContext(`state.character.npcs.find(n=>n.id==='${ids[0]}').skills.Swordsmanship.level`,ctx),11,'configured NPC skill state remains on the original NPC record');

// Player equipment remains supported; equipment is not granted to companions by default.
assert.equal(vm.runInContext(`ir0854Equipment(state.character,'${ids[1]}').weapon`,ctx),undefined);
vm.runInContext('state.combat=null;state.character.companionEquipment={};state.character.equipment.weapon=null;state.character.activeParty=null;startCombat("goblin",{type:"wild"})',ctx);
assert.equal(vm.runInContext('state.combat.partyNpcIds',ctx),undefined,'combat without a valid configured companion remains the solo path');

console.log('v0.8.5.4 companion equipment and skill synergy tests passed');
