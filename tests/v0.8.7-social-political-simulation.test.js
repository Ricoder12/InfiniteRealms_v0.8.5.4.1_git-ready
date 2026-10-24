'use strict';
// Run: node tests/v0.8.7-social-political-simulation.test.js
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
function fresh(name = 'Social Tester') {
  ctx.characterName = name;
  vm.runInContext("createSeed='V087-Social';createStart='settlement';state=makeInitial(characterName,'human','village');state.world.siteId=state.world.region.sites.find(site=>site.type==='settlement').id;ir06EnsureNPCs()",ctx);
  ctx.siteRef = vm.runInContext("state.world.region.sites.find(site=>site.type==='settlement').id",ctx);
  ctx.regionRef = vm.runInContext('irResolveLocationRegion(state.world,siteRef).regionId',ctx);
  ctx.npcIds = vm.runInContext('state.character.npcs.filter(n=>n.homeSite===siteRef).map(n=>n.id)',ctx);
  assert.ok(ctx.siteRef && ctx.regionRef && ctx.npcIds.length >= 2,'fixture has a settlement, region, and local NPCs');
  vm.runInContext("state.world.v05.activeEvent=null;state.world.v05.eventInitialized=true;state.world.v05.nextEventDay=999999",ctx);
}
function dayPass(activity = 'v0.8.7 test') { vm.runInContext(`dayPass(1,${JSON.stringify(activity)})`,ctx); }
function run(code) { return vm.runInContext(code,ctx); }

fresh();
assert.equal(run('state.world.v087.schema'),1,'new games initialize the v0.8.7 save namespace');
assert.equal(run('ir087ValidateState().ok'),true,'new-game social state validates');
assert.equal(run(`Object.keys(state.world.v087.politics[siteRef]).length`),5,'every settlement receives one record per canonical faction');
assert.equal(run(`state.world.v087.npcs[npcIds[0]].ambition`), 'ambition:stability', 'unmatched legacy goals map deterministically to stability');
assert.deepEqual(JSON.parse(JSON.stringify(run(`state.world.v087.politics[siteRef]['faction:merchants']`))),{alliance:null,rivalry:null},'political links start empty');

// Old saves migrate without time changes; malformed fields fall back independently.
run('state.character.daysLived=9;state.world.v087.npcs[npcIds[0]].ambition="ambition:wealth";state.world.v087.npcs[npcIds[0]].ambitionProgress=35;state.world.v087.npcs[npcIds[0]].rumors=[{eventId:"event:test",tickHeard:4}]');
const saved = JSON.parse(JSON.stringify(run('state')));
delete saved.world.v087;
saved.character.daysLived = 12;
ctx.oldSave = saved;
const migrated = run('normalizeSave(oldSave)');
delete ctx.oldSave;
assert.equal(migrated.world.v087.npcs[ctx.npcIds[0]].ambitionProgress,0,'old NPCs receive zero progress');
assert.equal(migrated.world.v087.npcs[ctx.npcIds[0]].rumors.length,0,'old NPCs receive no fabricated rumors');
assert.equal(migrated.character.daysLived,12,'migration does not advance time');
const invalid = JSON.parse(JSON.stringify(migrated));
invalid.world.v087.npcs[ctx.npcIds[0]].ambition = 'ambition:unknown';
invalid.world.v087.npcs[ctx.npcIds[0]].ambitionProgress = 101;
invalid.world.v087.npcs[ctx.npcIds[0]].rumors = [{eventId:'event:x',tickHeard:999,extra:true}];
invalid.world.v087.npcs.unknown_npc = {ambition:'ambition:wealth',ambitionProgress:10,rumors:[]};
invalid.world.v087.politics[ctx.siteRef]['faction:merchants'].alliance = 'faction:royal';
ctx.invalidSave = invalid;
const repaired = run('normalizeSave(invalidSave)');
delete ctx.invalidSave;
assert.equal(repaired.world.v087.npcs[ctx.npcIds[0]].ambition,'ambition:stability','invalid ambition falls back to goal-derived default');
assert.equal(repaired.world.v087.npcs[ctx.npcIds[0]].ambitionProgress,0,'invalid progress falls back independently');
assert.equal(repaired.world.v087.npcs[ctx.npcIds[0]].rumors.length,0,'invalid rumor array is discarded safely');
assert.equal(repaired.world.v087.npcs.unknown_npc,undefined,'unknown NPC data is ignored');
assert.equal(repaired.world.v087.politics[ctx.siteRef]['faction:merchants'].alliance,null,'asymmetric faction links are cleared');
run("state.world.v087.politics[siteRef]['faction:merchants'].rivalry='faction:royal'");
assert.equal(run('ir087ValidateState().ok'),false,'validation reports nonreciprocal political records');
run('ir087EnsureState(state)');
run('state.world.v087.npcs[npcIds[0]]={ambition:"ambition:knowledge",ambitionProgress:45,rumors:[{eventId:"event:test",tickHeard:4}]}');
run("state.world.v087.politics[siteRef]['faction:merchants'].alliance='faction:royal';state.world.v087.politics[siteRef]['faction:royal'].alliance='faction:merchants'");
const roundTrip = JSON.parse(JSON.stringify(run('state')));
ctx.roundTrip = roundTrip;
const loaded = run('normalizeSave(roundTrip)');
ctx.loaded = loaded;
const loadedTwice = run('normalizeSave(loaded)');
assert.deepEqual(JSON.parse(JSON.stringify(loadedTwice.world.v087)),JSON.parse(JSON.stringify(loaded.world.v087)),'v0.8.7 save normalization is idempotent');
assert.equal(loaded.world.v087.npcs[ctx.npcIds[0]].ambitionProgress,45,'valid progress survives save/load');
assert.equal(loaded.world.v087.npcs[ctx.npcIds[0]].rumors[0].tickHeard,4,'valid rumor data survives save/load');
assert.equal(loaded.world.v087.politics[ctx.siteRef]['faction:merchants'].alliance,'faction:royal','valid reciprocal politics survive save/load');
delete ctx.roundTrip; delete ctx.loaded;

// One active event spreads deterministic rumors to no more than two home-site residents per day.
fresh('Rumor Tester');
run(`state.world.v05.activeEvent={id:'event:rumor',effect:'security',siteId:siteRef,stage:'warning',daysInStage:0};state.world.v05.nextEventDay=999999`);
dayPass('rumor propagation');
let rumorCount = run(`npcIds.filter(id=>state.world.v087.npcs[id].rumors.some(r=>r.eventId==='event:rumor'&&r.tickHeard===1)).length`);
assert.ok(rumorCount <= 2,'at most two local NPCs hear a rumor on one day');
assert.ok(rumorCount > 0,'an active local warning reaches eligible residents');
assert.equal(run(`npcIds.every(id=>state.world.v087.npcs[id].rumors.length<=5)`),true,'rumor arrays respect the five-entry cap');
const firstRecipients = JSON.stringify(run(`npcIds.filter(id=>state.world.v087.npcs[id].rumors.some(r=>r.eventId==='event:rumor')).sort()`));
fresh('Rumor Tester');
run(`state.world.v05.activeEvent={id:'event:rumor',effect:'security',siteId:siteRef,stage:'warning',daysInStage:0};state.world.v05.nextEventDay=999999`);
dayPass('deterministic rumor propagation');
assert.equal(JSON.stringify(run(`npcIds.filter(id=>state.world.v087.npcs[id].rumors.some(r=>r.eventId==='event:rumor')).sort()`)),firstRecipients,'rumor recipient selection is deterministic for the same world and day');
run("ir05CloseWorldEvent('helped',true)");
dayPass('rumor cleanup');
assert.equal(run(`npcIds.every(id=>state.world.v087.npcs[id].rumors.length===0)`),true,'resolved event rumors are removed on the next successful tick');

// Ambitions advance only from their approved condition; completion rewards affinity and resets progress.
fresh('Ambition Tester');
run(`state.character.npcs.find(n=>n.id===npcIds[0]).goal='Earn coin';state.world.v087.npcs[npcIds[0]]={ambition:'ambition:wealth',ambitionProgress:95,rumors:[]};state.world.v087.npcs[npcIds[1]]={ambition:'ambition:influence',ambitionProgress:0,rumors:[]};state.world.v086.regions[regionRef].resources.bread=100;state.world.economy.markets[siteRef]={siteId:siteRef,stock:{bread:0,herb:7,wood:8,ore:5},sales:{},demand:{food:1,herbs:1,wood:1,ore:1},transactions:0}`);
dayPass('wealth ambition');
assert.equal(run('state.world.v087.npcs[npcIds[0]].ambitionProgress'),0,'completed ambition progress resets');
assert.equal(run('state.character.relationships[npcIds[0]].affinity'),2,'completion grants two affinity');
assert.equal(run('state.character.relationships[npcIds[0]].trust'),0,'ambition reward leaves trust unchanged');
assert.equal(run('state.world.v087.npcs[npcIds[1]].ambitionProgress'),5,'trade-driven faction influence advances influence ambition');
assert.ok(run('state.world.economy.markets[siteRef].stock.bread') > 1,'the fixture completes a multi-unit existing-market transfer');

fresh('Condition Ambition Tester');
run(`state.world.v086.regions[regionRef].threat=1;state.world.v05.settlements[siteRef].security=81;state.world.v086.influence[siteRef]['faction:arcanum']=51;state.world.v087.npcs[npcIds[0]]={ambition:'ambition:security',ambitionProgress:0,rumors:[]};state.world.v087.npcs[npcIds[1]]={ambition:'ambition:knowledge',ambitionProgress:0,rumors:[]};state.world.v05.activeEvent=null`);
dayPass('security and knowledge ambitions');
assert.equal(run('state.world.v087.npcs[npcIds[0]].ambitionProgress'),5,'security ambition advances after threat decays to zero');
assert.equal(run('state.world.v087.npcs[npcIds[1]].ambitionProgress'),5,'knowledge ambition advances above the Arcanum threshold');
assert.equal(run('state.world.v087.npcs[npcIds[2]].ambitionProgress'),5,'stability ambition advances in a region without an active event');

fresh('Late Influence Tester');
run(`state.world.v087.npcs[npcIds[0]]={ambition:'ambition:influence',ambitionProgress:0,rumors:[]};state.world.v05.activeEvent={id:'event:late-help',effect:'security',siteId:siteRef,stage:'warning',daysInStage:0}`);
dayPass('prepare late influence');
assert.equal(run('state.world.v087.npcs[npcIds[0]].ambitionProgress'),0,'no influence ambition progress is awarded without an influence gain');
run("ir05CloseWorldEvent('helped',true)");
assert.equal(run('state.world.v087.npcs[npcIds[0]].ambitionProgress'),5,'a helped-event influence gain after the daily tick still counts for that day');

// Political pairs are reciprocal, bounded by deterministic thresholds, and affect existing systems only.
fresh('Politics Tester');
run(`state.world.v086.influence[siteRef]['faction:merchants']=80;state.world.v086.influence[siteRef]['faction:shadow']=20;state.world.v087.politics[siteRef]['faction:merchants'].rivalry='faction:shadow';state.world.v087.politics[siteRef]['faction:shadow'].rivalry='faction:merchants';state.world.economy.markets[siteRef]={siteId:siteRef,stock:{bread:0,herb:7,wood:8,ore:5},sales:{},demand:{food:1,herbs:1,wood:1,ore:1},transactions:0};state.world.v086.regions[regionRef].resources.bread=100`);
dayPass('rivalry trade block');
assert.equal(run(`state.world.v087.politics[siteRef]['faction:merchants'].rivalry`),'faction:shadow','qualifying rivalry is established');
assert.equal(run(`state.world.v087.politics[siteRef]['faction:shadow'].rivalry`),'faction:merchants','rivalry remains mutual');
assert.equal(run('state.world.economy.markets[siteRef].transactions'),0,'merchant rivalry blocks regional trade');
run(`state.world.v086.influence[siteRef]['faction:royal']=65;state.world.v086.influence[siteRef]['faction:merchants']=70;state.world.v086.influence[siteRef]['faction:shadow']=50;state.world.v087.politics[siteRef]['faction:merchants'].alliance='faction:royal';state.world.v087.politics[siteRef]['faction:royal'].alliance='faction:merchants';state.world.v05.activeEvent={id:'event:help',effect:'security',siteId:siteRef,stage:'warning',daysInStage:0}`);
run("ir05CloseWorldEvent('helped',true)");
assert.equal(run(`state.world.v086.influence[siteRef]['faction:merchants']`),71,'allied faction receives one bounded event influence bonus');
assert.equal(run(`state.world.v086.influence[siteRef]['faction:royal']`),67,'original helped-event influence gain is preserved');
dayPass('political alliance evaluation');
assert.equal(run(`state.world.v087.politics[siteRef]['faction:merchants'].alliance`),'faction:royal','qualifying influence creates a mutual alliance');
assert.equal(run(`state.world.v087.politics[siteRef]['faction:royal'].alliance`),'faction:merchants','created alliance is reciprocal');

fresh('Rivalry Clearing Tester');
run(`state.world.v086.influence[siteRef]['faction:merchants']=80;state.world.v086.influence[siteRef]['faction:shadow']=20`);
dayPass('create rivalry');
run("state.world.v086.influence[siteRef]['faction:shadow']=41");
dayPass('clear rivalry');
assert.equal(run(`state.world.v087.politics[siteRef]['faction:merchants'].rivalry`),null,'rivalry clears when its qualification thresholds fail');
assert.equal(run(`state.world.v087.politics[siteRef]['faction:shadow'].rivalry`),null,'cleared rivalry is removed from both factions');

fresh('Weekly Rivalry Tester');
run(`state.world.v086.influence[siteRef]['faction:merchants']=80;state.world.v086.influence[siteRef]['faction:shadow']=20;state.world.v087.politics[siteRef]['faction:merchants'].rivalry='faction:shadow';state.world.v087.politics[siteRef]['faction:shadow'].rivalry='faction:merchants'`);
run("dayPass(7,'weekly rivalry consequence')");
assert.equal(run(`state.world.v086.influence[siteRef]['faction:merchants']`),77,'weekly rivalry penalty combines with v0.8.6 normalization');
assert.equal(run(`state.world.v086.influence[siteRef]['faction:shadow']`),18,'weekly rivalry penalty also applies to the other faction');

// A failed social extension rolls back the entire v0.8.6/v0.8.7 daily transaction.
fresh('Rollback Tester');
const beforeTick = JSON.parse(JSON.stringify(run('({v086:state.world.v086,v087:state.world.v087,settlements:state.world.v05.settlements,markets:state.world.economy.markets})')));
run('ir087TickBaseFixture=ir087Tick;ir087Tick=function(){throw new Error("intentional rollback test")};state.character.daysLived=1');
assert.equal(run('ir086DailyTick(1)'),false,'a social tick failure reports rollback');
assert.deepEqual(JSON.parse(JSON.stringify(run('({v086:state.world.v086,v087:state.world.v087,settlements:state.world.v05.settlements,markets:state.world.economy.markets})'))),beforeTick,'failed social tick restores regional and social state');
run('ir087Tick=ir087TickBaseFixture');
assert.equal(run('ir086DailyTick(1)'),true,'a rolled-back tick can be retried successfully');

const peopleHtml = run('ir06PeopleScreen()');
assert.ok(peopleHtml.includes('Local ambitions and rumors'),'People screen exposes ambition and rumor details');
const livingHtml = run('ir086SimulationPanel()');
assert.ok(livingHtml.includes('Faction ties') && livingHtml.includes('Alliance:') && livingHtml.includes('Rivalry:'),'Living panel exposes political relationships');
console.log('v0.8.7 social and political simulation tests passed');
