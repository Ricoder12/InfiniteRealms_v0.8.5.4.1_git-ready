'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
const element = () => ({ textContent: '', innerHTML: '', title: '', style: {}, dataset: {}, appendChild: noop, remove: noop, click: noop, focus: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
const storage = new Map();
const ctx = { console, Math: Object.create(Math), document: { title: '', head: element(), body: element(), documentElement: element(), addEventListener: noop, querySelector: s => s === '#app' ? element() : null, querySelectorAll: () => [], getElementById: () => null, createElement: element }, window: { scrollTo: noop, addEventListener: noop }, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) }, setTimeout: () => 0, clearTimeout: noop, requestAnimationFrame: noop, URL, Blob, FileReader: function(){}, navigator: { userAgent: 'Node test VM' } };
vm.createContext(ctx);
const root = path.resolve(__dirname, '..');
for (const [,src] of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script src="([^"]+)"><\/script>/g)) { if (!src.endsWith('/27-boot.js')) vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),ctx,{filename:src}); }
vm.runInContext("createSeed='V0843-PARTY';createStart='settlement';state=makeInitial('Party Tester','human','village')",ctx);
const [first, second, third] = Array.from(vm.runInContext('state.character.npcs.slice(0,3).map(n=>n.id)',ctx));
const attrsBefore = vm.runInContext('JSON.stringify(state.character.attrs)',ctx);
for (const id of [first, second]) {
  vm.runInContext(`state.character.relationships['${id}']={affinity:12,trust:10,status:'Companion',milestones:[]};ir0842RecruitCompanion('${id}')`,ctx);
}
const squadId = vm.runInContext('ir0841Squads()[0].id',ctx);
assert.equal(vm.runInContext(`ir0841AddTemporarySquadMember('${squadId}','${third}').ok`,ctx),true);

// Party formation accepts only unique recruited companions in the selected squad.
assert.match(vm.runInContext('ir06PeopleScreen()',ctx),/Traveling party/);
assert.equal(vm.runInContext('ir0843PartyPanel()',ctx).includes('Form party'),true);
assert.equal(vm.runInContext(`ir072Action({dataset:{action:'ir0843-form-party',squad:'${squadId}'}})`,ctx),true);
assert.equal(vm.runInContext('ir0843ActiveParty().members.length',ctx),2);
assert.equal(vm.runInContext("ir0843ActiveParty().members.filter(m=>m.role==='leader').length",ctx),1);
assert.equal(vm.runInContext(`ir0843FormParty('${squadId}',['${first}','${first}']).ok`,ctx),false);
assert.equal(vm.runInContext(`ir0843FormParty('${squadId}',['missing-npc']).ok`,ctx),false);
assert.equal(vm.runInContext(`ir0843FormParty('${squadId}',['${third}']).ok`,ctx),false,'an existing but unrecruited NPC is ineligible');
assert.equal(vm.runInContext("ir0843FormParty('missing-squad').ok",ctx),false);
assert.match(vm.runInContext('ir0843PartyPanel()',ctx),/Active party/);

// Role assignment is restricted to leader/member; handoffs preserve one leader.
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${first}','member').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843ActiveParty().members.find(m=>m.npcId==='${first}').role`,ctx),'member');
assert.equal(vm.runInContext(`ir0843ActiveParty().members.find(m=>m.npcId==='${second}').role`,ctx),'leader');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${first}','damage-dealer').ok`,ctx),false);
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${third}','leader').ok`,ctx),false);
assert.equal(vm.runInContext(`ir072Action({dataset:{action:'ir0843-assign-party-role',npc:'${first}',role:'leader'}})`,ctx),true);
assert.equal(vm.runInContext("ir0843ActiveParty().members.filter(m=>m.role==='leader').length",ctx),1);

// Membership changes preserve the squad roster and clean party references.
assert.equal(vm.runInContext(`ir0843AddPartyMember('${second}').ok`,ctx),false,'duplicate party member rejected');
assert.equal(vm.runInContext(`ir0843AddPartyMember('${third}').ok`,ctx),false,'unrecruited squad outsiders rejected');
assert.equal(vm.runInContext(`ir0841RemoveTemporarySquadMember('${squadId}','${first}').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843ActiveParty().members.some(m=>m.npcId==='${first}')`,ctx),false);
assert.equal(vm.runInContext(`ir0843ActiveParty().members[0].role`,ctx),'leader');
assert.equal(vm.runInContext(`ir0842DismissCompanion('${second}').ok`,ctx),true);
assert.equal(vm.runInContext('ir0843ActiveParty()',ctx),null);
assert.equal(vm.runInContext(`ir0841Squads().some(s=>s.id==='${squadId}')`,ctx),true,'party changes do not disband or corrupt the squad');

// Re-form, save, and normalize: party roles and members survive the existing save path.
assert.equal(vm.runInContext(`ir0841AddTemporarySquadMember('${squadId}','${first}').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843FormParty('${squadId}').ok`,ctx),true);
vm.runInContext('persist()',ctx);
const loaded = vm.runInContext('normalizeSave(JSON.parse(JSON.stringify(readAutosave())))',ctx);
assert.equal(loaded.character.activeParty.squadId,squadId);
assert.equal(loaded.character.activeParty.members[0].npcId,first);
assert.equal(loaded.character.activeParty.members[0].role,'leader');
assert.equal(loaded.character.temporarySquads.find(s=>s.id===squadId).memberNpcIds.includes(first),true);
assert.equal(vm.runInContext('JSON.stringify(state.character.attrs)',ctx),attrsBefore,'party operations do not alter character balance');
assert.equal(vm.runInContext('ir0843DisbandParty().ok',ctx),true);
assert.equal(vm.runInContext('ir0843ActiveParty()',ctx),null);
console.log('v0.8.4.3 party formation tests: PASS');
