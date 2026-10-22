'use strict';
// Run: node tests/v0.8.4.4-party-systems-integration.test.js
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
vm.runInContext("createSeed='V0844-INTEGRATION';createStart='settlement';state=makeInitial('Integration Tester','human','village')",ctx);
const [first, second] = Array.from(vm.runInContext('state.character.npcs.slice(0,2).map(n=>n.id)',ctx));

// Recruitment, default squad membership, party formation, and a single-leader role handoff.
for (const id of [first, second]) vm.runInContext(`state.character.relationships['${id}']={affinity:12,trust:10,status:'Companion',milestones:[]}`,ctx);
assert.equal(vm.runInContext(`ir0842RecruitCompanion('${first}').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0842RecruitCompanion('${second}').ok`,ctx),true);
const squadId = vm.runInContext('ir0841Squads()[0].id',ctx);
assert.equal(vm.runInContext(`ir0843FormParty('${squadId}').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843AddPartyMember('${second}').ok`,ctx),false,'a recruited duplicate cannot join twice');
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${second}','leader').ok`,ctx),true);
assert.equal(vm.runInContext("ir0843ActiveParty().members.filter(m=>m.role==='leader').length",ctx),1);
assert.equal(vm.runInContext(`ir0843AssignPartyRole('${first}','member').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843ActiveParty().members.find(m=>m.npcId==='${second}').role`,ctx),'leader');

// Leaving the squad or dismissing the companion synchronizes the active party and leader role.
assert.equal(vm.runInContext(`ir0841RemoveTemporarySquadMember('${squadId}','${second}').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843ActiveParty().members.some(m=>m.npcId==='${second}')`,ctx),false);
assert.equal(vm.runInContext(`ir0843ActiveParty().members[0].role`,ctx),'leader');
assert.equal(vm.runInContext(`ir0842DismissCompanion('${first}').ok`,ctx),true);
assert.equal(vm.runInContext('ir0843ActiveParty()',ctx),null);
assert.equal(vm.runInContext(`state.character.npcs.filter(n=>n.id==='${first}').length`,ctx),1,'dismissal preserves the NPC record');
assert.equal(vm.runInContext(`ir0841Squads().find(s=>s.id==='${squadId}').memberNpcIds.includes('${first}')`,ctx),false);

// Re-recruit, reform, and round-trip valid state; an older save gets only the required empty party default.
assert.equal(vm.runInContext(`ir0842RecruitCompanion('${first}').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0843FormParty('${squadId}').ok`,ctx),true);
vm.runInContext('persist()',ctx);
const validLoaded = vm.runInContext('normalizeSave(JSON.parse(JSON.stringify(readAutosave())))',ctx);
assert.equal(validLoaded.character.activeParty.members[0].npcId,first);
assert.equal(validLoaded.character.activeParty.members[0].role,'leader');
assert.equal(validLoaded.character.temporarySquads[0].memberNpcIds.includes(first),true);
assert.equal(validLoaded.character.npcs.find(n=>n.id===first).companionRecruitment.status,'recruited');
const legacy = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())',ctx));
delete legacy.character.activeParty;
delete legacy.character.temporarySquads;
delete legacy.character.temporarySquadSequence;
ctx.legacySave = legacy;
const legacyLoaded = vm.runInContext('normalizeSave(legacySave)',ctx);
delete ctx.legacySave;
assert.equal(legacyLoaded.character.activeParty,null);
assert.deepEqual(Array.from(legacyLoaded.character.temporarySquads),[]);
assert.equal(legacyLoaded.character.temporarySquadSequence,0);
assert.equal(legacyLoaded.character.npcs.find(n=>n.id===first).companionRecruitment.status,'recruited');

// Disband operations clear only the relevant party/squad association.
assert.equal(vm.runInContext('ir0843DisbandParty().ok',ctx),true);
assert.equal(vm.runInContext(`ir0843FormParty('${squadId}').ok`,ctx),true);
assert.equal(vm.runInContext(`ir0841DisbandTemporarySquad('${squadId}').ok`,ctx),true);
assert.equal(vm.runInContext('ir0843ActiveParty()',ctx),null);
console.log('v0.8.4.4 party systems integration tests: PASS');
