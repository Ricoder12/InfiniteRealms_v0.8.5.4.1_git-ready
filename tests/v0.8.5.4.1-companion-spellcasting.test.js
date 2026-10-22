'use strict';
// Run: node tests/v0.8.5.4.1-companion-spellcasting.test.js
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
vm.runInContext("createSeed='V08541-Spells';createStart='settlement';state=makeInitial('Spell Tester','human','village')",ctx);
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
ctx.spellConfig = { schema:1, permittedSpellIds:['healing_light'], attributes:{}, skills:{'Healing Magic':{level:5}}, naturalTalents:[], mana:{current:30,max:40} };
vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting=spellConfig`,ctx);
assert.equal(vm.runInContext(`ir08541SpellRequirements('healing_light','${ids[0]}').ok`,ctx),true,'explicit allowed spell with valid companion formula and mana data is eligible');
assert.equal(vm.runInContext(`ir08541SpellRequirements('fire_bolt','${ids[0]}').ok`,ctx),false,'unpermitted spell is rejected');
assert.equal(vm.runInContext(`ir08541SpellRequirements('unknown_spell','${ids[0]}').ok`,ctx),false,'unknown spell ID is rejected');
assert.equal(vm.runInContext(`ir08541CastCompanionSpell('missing-npc','healing_light','player').ok`,ctx),false,'missing caster NPC is rejected safely');
vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting.mana.max=181`,ctx);
assert.equal(vm.runInContext(`ir08541SpellRequirements('healing_light','${ids[0]}').ok`,ctx),false,'out-of-range mana configuration disables the spell');
vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting.mana.max=40`,ctx);
vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting.skills={}`,ctx);
assert.equal(vm.runInContext(`ir08541SpellRequirements('healing_light','${ids[0]}').ok`,ctx),false,'missing formula skill disables the spell instead of defaulting');
vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting={schema:1,permittedSpellIds:['healing_light'],attributes:{},skills:{'Healing Magic':{level:5}},naturalTalents:[],mana:{current:30,max:40}};ir0851Profile('${ids[1]}').currentHealth=60`,ctx);
vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting.permittedSpellIds=['arcane_bolt'];ir0851Profile('${ids[0]}').spellcasting.attributes={Wisdom:12};ir0851Profile('${ids[0]}').spellcasting.skills={Magic:{level:5}}`,ctx);
assert.equal(vm.runInContext(`ir08541SpellRequirements('arcane_bolt','${ids[0]}').ok`,ctx),true,'damage spell requires explicit Wisdom and Magic skill data');
vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting.attributes={};`,ctx);
assert.equal(vm.runInContext(`ir08541SpellRequirements('arcane_bolt','${ids[0]}').ok`,ctx),false,'missing Wisdom disables damage spells');
vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting.attributes={Wisdom:12};ir0851Profile('${ids[0]}').spellcasting.permittedSpellIds=['healing_light'];ir0851Profile('${ids[0]}').spellcasting.skills={'Healing Magic':{level:5}}`,ctx);

assert.equal(vm.runInContext("startCombat('goblin',{type:'wild'})",ctx),true);
vm.runInContext('state.combat.enemyHP=500;state.combat.enemyMaxHP=500;state.combat.enemyDefense=0;state.character.health=40',ctx);
const manaBefore = vm.runInContext(`ir08541SpellConfig('${ids[0]}').mana.current`,ctx);
const failed = vm.runInContext(`ir08541CastCompanionSpell('${ids[0]}','healing_light','missing-target')`,ctx);
assert.equal(failed.ok,false,'invalid target is rejected');
assert.equal(vm.runInContext(`ir08541SpellConfig('${ids[0]}').mana.current`,ctx),manaBefore,'invalid target consumes no mana');
const playerCast = vm.runInContext(`ir08541CastCompanionSpell('${ids[0]}','healing_light','player')`,ctx);
assert.equal(playerCast.ok,true,`eligible player target can be healed: ${JSON.stringify(playerCast)}`);
assert.ok(vm.runInContext('state.character.health',ctx)>40,'healing changes actual player health');
const companionCast = vm.runInContext(`ir08541CastCompanionSpell('${ids[0]}','healing_light','${ids[1]}')`,ctx);
assert.equal(companionCast.ok,true,'another injured eligible companion can be selected');
assert.ok(vm.runInContext(`ir0851Profile('${ids[1]}').currentHealth`,ctx)>60,'healing persists on the target companion profile');
vm.runInContext(`ir0851Profile('${ids[1]}').currentHealth=0`,ctx);
assert.equal(vm.runInContext(`ir08541CastCompanionSpell('${ids[0]}','healing_light','${ids[1]}').ok`,ctx),false,'defeated companion cannot be targeted');

vm.runInContext(`ir0851Profile('${ids[1]}').currentHealth=60;ir0851Profile('${ids[0]}').spellcasting.mana.current=0`,ctx);
assert.equal(vm.runInContext(`ir08541SpellRequirements('healing_light','${ids[0]}').ok`,ctx),false,'insufficient mana blocks casting');
vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting.mana.current=5;dayPass(1,'spell test')`,ctx);
assert.equal(vm.runInContext(`ir08541SpellConfig('${ids[0]}').mana.current`,ctx),6,'configured companion mana follows existing daily regeneration');
vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting.mana.current=5;rest()`,ctx);
assert.ok(vm.runInContext(`ir08541SpellConfig('${ids[0]}').mana.current`,ctx)>5,'rest applies the existing player mana-rest fraction to explicitly configured companion mana');

vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting.mana.current=30;state.character.health=30;state.combat.enemyHP=500;irEnemyTurn()`,ctx);
assert.ok(vm.runInContext(`state.combat.log.some(line=>line.includes('casts Healing Light'))`,ctx),'eligible companion casts through the existing companion combat turn');
assert.ok(vm.runInContext('state.character.health',ctx)>30,'automatic healing targets the injured player and applies actual healing');
assert.equal(vm.runInContext(`ir08541SpellConfig('${ids[0]}').mana.current`,ctx),15,'automatic companion spell spends the existing spell cost once');
assert.match(vm.runInContext('irCombatPanel()',ctx),/COMPANION SPELLS & RESOURCES/,'combat UI displays companion spell readiness and current resources');

vm.runInContext(`ir0851Profile('${ids[0]}').spellcasting.permittedSpellIds=['arcane_bolt'];ir0851Profile('${ids[0]}').spellcasting.attributes={Wisdom:12};ir0851Profile('${ids[0]}').spellcasting.skills={Magic:{level:5}};ir0851Profile('${ids[0]}').spellcasting.mana={current:30,max:40};state.combat.enemyHP=500`,ctx);
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${ids[0]}','damage dealer').ok`,ctx),true,'companion can retain an accepted role while casting');
const enemyBefore = vm.runInContext('state.combat.enemyHP',ctx);
assert.equal(vm.runInContext(`ir08541CastCompanionSpell('${ids[0]}','arcane_bolt','enemy').ok`,ctx),true,'companion can cast an explicitly permitted basic damage spell');
const expectedDamage = vm.runInContext("Math.max(1,Math.round(IR_V05_SPELLS.arcane_bolt.base+12*.48+5*1.7))",ctx);
assert.equal(enemyBefore-vm.runInContext('state.combat.enemyHP',ctx),expectedDamage,'damage uses companion Wisdom and Magic values rather than player values');
assert.equal(expectedDamage,vm.runInContext("Math.round(IR_V05_SPELLS.arcane_bolt.base+12*.48+5*1.7)",ctx),'damage dealer basic-attack role multiplier does not stack onto spell formulas');

vm.runInContext('persist()',ctx);
const saved = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())',ctx));
assert.ok(saved.character.companionCombatProfiles[ids[0]].spellcasting,'companion permissions, formula fields, and mana survive save/load');
saved.character.companionCombatProfiles['missing-npc'] = saved.character.companionCombatProfiles[ids[0]];
saved.character.companionCombatProfiles[ids[0]].spellcasting.naturalTalents=['unknown_talent'];
const loaded = vm.runInContext('normalizeSave(saved)',Object.assign(ctx,{saved}));
assert.equal(loaded.character.companionCombatProfiles['missing-npc'],undefined,'spell profile for a missing NPC is ignored');
assert.equal(loaded.character.companionCombatProfiles[ids[0]].spellcasting.naturalTalents,undefined,'invalid talent configuration remains missing after load instead of silently becoming no talents');
assert.match(vm.runInContext(`ir0843PartyPanel()`,ctx),/Spellcasting/,'party panel exposes companion spell permissions and data status');
assert.match(vm.runInContext(`ir08541SpellcastingMarkup('${ids[1]}')`,ctx),/no explicit spell permissions/,'UI explains unconfigured companions remain unable to cast');

console.log('v0.8.5.4.1 companion spellcasting tests passed');
