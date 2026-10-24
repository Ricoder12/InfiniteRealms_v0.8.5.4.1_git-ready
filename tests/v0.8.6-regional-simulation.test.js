'use strict';
// Run: node tests/v0.8.6-regional-simulation.test.js
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

function fresh(name) {
  ctx.characterName = name;
  vm.runInContext("createSeed='V086-Regional';createStart='settlement';state=makeInitial(characterName,'human','village')",ctx);
}
function exposeSettlement() {
  ctx.siteRef = vm.runInContext("state.world.region.sites.find(site=>site.type==='settlement').id",ctx);
  ctx.regionRef = vm.runInContext('irResolveLocationRegion(state.world,siteRef).regionId',ctx);
  assert.ok(ctx.siteRef && ctx.regionRef,'generated settlement resolves to one geographic region');
}

fresh('Regional Tester');
exposeSettlement();
assert.equal(vm.runInContext('state.world.v086.schema',ctx),1,'new games initialize the v0.8.6 save namespace');
assert.equal(vm.runInContext('state.world.v086.lastTickDay',ctx),0,'new games begin the simulation on their current day');
const initialEventThreat = vm.runInContext(`state.world.v05.activeEvent?.stage === 'warning' ? Math.max(0,15-state.world.v05.activeEvent.daysInStage) : state.world.v05.activeEvent?.stage === 'escalation' ? Math.max(0,33-state.world.v05.activeEvent.daysInStage) : 0`,ctx);
assert.equal(vm.runInContext(`state.world.v086.regions[regionRef].threat`,ctx),initialEventThreat,'an existing initial event seeds regional threat deterministically');
assert.equal(vm.runInContext('ir086ValidateState().ok',ctx),true,'generated regional assignments validate');
const counts = vm.runInContext('ir086ResourceSiteCounts(ir086Model(state.world,state.character))',ctx);
for (const id of ['bread','herb','wood','ore']) assert.equal(vm.runInContext(`state.world.v086.regions[regionRef].resources.${id}`,ctx),Math.min(100,2*(counts[ctx.regionRef]?.[id]||0)),`initial ${id} pool follows current biome gathering data`);

// Old saves receive defaults at their current day and do not create or advance markets.
vm.runInContext('state.world.v05.activeEvent=null;state.world.v05.eventInitialized=true;persist()',ctx);
const oldSave = JSON.parse(vm.runInContext('JSON.stringify(readAutosave())',ctx));
delete oldSave.world.v086;
oldSave.character.daysLived = 12;
oldSave.world.economy.markets = {};
ctx.oldSave = oldSave;
const migrated = vm.runInContext('normalizeSave(oldSave)',ctx);
delete ctx.oldSave;
assert.equal(migrated.world.v086.lastTickDay,12,'legacy save starts without replaying previous days');
assert.equal(Object.keys(migrated.world.economy.markets).length,0,'migration does not create regional markets');

// Bad leaves are replaced with deterministic defaults while valid siblings remain.
const invalidSave = JSON.parse(JSON.stringify(migrated));
invalidSave.world.v086.regions[ctx.regionRef].threat = 101;
invalidSave.world.v086.regions[ctx.regionRef].resources.bread = -4;
invalidSave.world.v086.influence[ctx.siteRef]['faction:merchants'] = 'bad';
invalidSave.world.v086.lastTickDay = 999;
invalidSave.world.v086.lastTickSummary = { malformed: true };
ctx.invalidSave = invalidSave;
const repaired = vm.runInContext('normalizeSave(invalidSave)',ctx);
delete ctx.invalidSave;
assert.equal(repaired.world.v086.lastTickDay,12,'invalid tick cursor resets to the current character day');
assert.equal(repaired.world.v086.regions[ctx.regionRef].threat,0,'invalid threat leaf uses its deterministic default');
assert.equal(repaired.world.v086.influence[ctx.siteRef]['faction:merchants'],58,'invalid influence leaf uses the existing faction baseline');
assert.equal(repaired.world.v086.lastTickSummary,null,'invalid action summary is dropped safely');

// Daily recovery, five-unit inbound trade, market demand, influence, and action summary.
fresh('Regional Trade Tester');
exposeSettlement();
ctx.market = { siteId: ctx.siteRef, stock: { bread: 2 }, sales: {}, demand: { food: 1 }, transactions: 0 };
ctx.suppliesBefore = 80;
vm.runInContext(`state.world.v05.activeEvent=null;state.world.v05.eventInitialized=true;state.world.v05.nextEventDay=9999;state.world.v086.regions[regionRef].threat=0;state.world.v086.regions[regionRef].resources.bread=7;state.world.v05.settlements[siteRef]={security:85,prosperity:40,supplies:80,stability:68,population:430,lastChangeDay:0};state.world.economy.markets[siteRef]=market`,ctx);
vm.runInContext("dayPass(1,'regional trade test')",ctx);
assert.equal(vm.runInContext('state.world.economy.markets[siteRef].stock.bread',ctx),7,'large shortages receive up to five regional units');
assert.equal(vm.runInContext('state.world.v086.regions[regionRef].resources.bread',ctx),3,'trade consumes the five transferred units after daily renewal');
assert.ok(Math.abs(vm.runInContext('state.world.economy.markets[siteRef].demand.food',ctx)-Math.pow(.985,5))<1e-12,'inbound trade adjusts existing demand once per unit');
assert.equal(vm.runInContext('state.world.economy.markets[siteRef].transactions',ctx),1,'multi-unit shipment counts as one transaction');
assert.equal(vm.runInContext('state.world.v05.settlements[siteRef].supplies',ctx),85,'bread transfer restores settlement supplies by moved units');
assert.equal(vm.runInContext('state.world.v05.settlements[siteRef].prosperity',ctx),42,'stable prosperity recovery and completed trade each contribute once');
assert.equal(vm.runInContext("state.world.v086.influence[siteRef]['faction:merchants']",ctx),59,'completed regional trade increases local merchant influence');
assert.equal(vm.runInContext('state.world.v086.lastTickSummary.days',ctx),1,'daily action summary records the processed day');
assert.equal(vm.runInContext('state.world.v086.lastTickSummary.transfers.count',ctx),1,'summary counts completed transfers');
assert.equal(vm.runInContext('state.world.v086.lastTickSummary.transfers.units',ctx),5,'summary counts all transferred units');
const savedAfterTrade = JSON.parse(vm.runInContext('JSON.stringify(state)',ctx));
ctx.savedAfterTrade = savedAfterTrade;
const loadedAfterTrade = vm.runInContext('normalizeSave(savedAfterTrade)',ctx);
delete ctx.savedAfterTrade;
assert.equal(loadedAfterTrade.world.v086.lastTickDay,savedAfterTrade.world.v086.lastTickDay,'save/load preserves the processed-day cursor');
assert.equal(loadedAfterTrade.world.v086.lastTickSummary.transfers.units,5,'save/load preserves the multi-unit action summary');
ctx.loadedAfterTrade = loadedAfterTrade;
const loadedAgain = vm.runInContext('normalizeSave(loadedAfterTrade)',ctx);
delete ctx.loadedAfterTrade;
assert.deepEqual(JSON.parse(JSON.stringify(loadedAgain.world.v086)),JSON.parse(JSON.stringify(loadedAfterTrade.world.v086)),'regional save normalization is idempotent after its first canonicalization');
assert.equal(loadedAfterTrade.world.economy.markets[ctx.siteRef].stock.bread,7,'save/load preserves existing market stock after a regional transfer');

// Outbound transfer cannot exceed regional capacity and applies the existing upward demand factor.
vm.runInContext("state.world.economy.markets[siteRef].stock.bread=17;state.world.economy.markets[siteRef].demand.food=1;state.world.v086.regions[regionRef].resources.bread=97;state.world.v086.lastTickDay=1;state.world.v086.lastTickSummary=null;state.character.daysLived=1;state.world.v05.activeEvent=null",ctx);
vm.runInContext("dayPass(1,'regional export test')",ctx);
assert.equal(vm.runInContext('state.world.economy.markets[siteRef].stock.bread',ctx),15,'outbound transfer returns market stock to normal plus the regional cap remainder');
assert.equal(vm.runInContext('state.world.v086.regions[regionRef].resources.bread',ctx),100,'outbound transfer respects the 0–100 regional resource bound');
assert.ok(Math.abs(vm.runInContext('state.world.economy.markets[siteRef].demand.food',ctx)-Math.pow(1.015,2))<1e-12,'outbound demand follows the transferred unit count');
assert.equal(vm.runInContext('state.world.v086.lastTickSummary.transfers.units',ctx),2,'outbound summary records the actual capped volume');

// Threat pressure, calm prosperity recovery, and weekly influence normalization.
vm.runInContext("state.world.economy.markets={};state.world.v086.regions[regionRef].threat=31;state.world.v05.settlements[siteRef]={security:50,prosperity:50,supplies:50,stability:68,population:430,lastChangeDay:0};state.world.v086.lastTickDay=2;state.world.v086.lastTickSummary=null;state.character.daysLived=2",ctx);
vm.runInContext("dayPass(1,'threat pressure test')",ctx);
assert.equal(vm.runInContext('state.world.v086.regions[regionRef].threat',ctx),30,'regional threat decays once per day');
assert.equal(vm.runInContext('state.world.v05.settlements[siteRef].security',ctx),49,'threat at the pressure threshold lowers security');
assert.equal(vm.runInContext('state.world.v05.settlements[siteRef].supplies',ctx),49,'threat at the pressure threshold lowers supplies');
assert.equal(vm.runInContext('state.world.v05.settlements[siteRef].prosperity',ctx),49,'high threat lowers prosperity');
vm.runInContext("state.world.v086.regions[regionRef].threat=11;state.world.v05.settlements[siteRef]={security:81,prosperity:50,supplies:76,stability:68,population:430,lastChangeDay:0};state.world.v086.lastTickDay=3;state.character.daysLived=3",ctx);
vm.runInContext("dayPass(1,'prosperity recovery test')",ctx);
assert.equal(vm.runInContext('state.world.v05.settlements[siteRef].prosperity',ctx),51,'calm, secure, supplied settlement recovers prosperity');
vm.runInContext("state.world.v086.regions[regionRef].threat=0;state.world.v086.lastTickDay=6;state.character.daysLived=6;for(const f of Object.keys(state.world.v086.influence[siteRef]))state.world.v086.influence[siteRef][f]=51",ctx);
vm.runInContext("dayPass(1,'weekly normalization test')",ctx);
assert.equal(vm.runInContext("state.world.v086.influence[siteRef]['faction:royal']",ctx),50,'weekly normalization lowers scores above 50 once on day seven');
vm.runInContext("dayPass(1,'normalization boundary test')",ctx);
assert.equal(vm.runInContext("state.world.v086.influence[siteRef]['faction:royal']",ctx),50,'influence does not decay again on a nonweekly day');

// A multi-day action accumulates its full tick count in one persisted summary.
vm.runInContext("state.world.v05.activeEvent=null;state.world.v05.eventInitialized=true;state.world.v05.nextEventDay=999999;state.world.v086.lastTickSummary=null;state.character.energy=100;state.character.hunger=80",ctx);
vm.runInContext("runAction({dataset:{action:'advance-month'}})",ctx);
assert.equal(vm.runInContext('state.world.v086.lastTickSummary.days',ctx),30,'a 30-day UI action keeps all daily deltas in one summary');
assert.equal(vm.runInContext('state.world.v086.lastTickSummary.endDay-state.world.v086.lastTickSummary.startDay',ctx),30,'multi-day summary spans the full action interval');

// Event close changes are included in the same regional data and summary path.
fresh('Regional Event Tester');
exposeSettlement();
vm.runInContext("state.world.v05.eventInitialized=true;state.world.v05.activeEvent={id:'security-test',effect:'security',siteId:siteRef,stage:'warning',daysInStage:0};state.world.v086.regions[regionRef].threat=15;state.world.v086.lastTickDay=0;state.world.v086.lastTickSummary=null",ctx);
vm.runInContext("ir05CloseWorldEvent('helped',true)",ctx);
assert.equal(vm.runInContext('state.world.v086.regions[regionRef].threat',ctx),0,'helped event reduces regional threat within its bound');
assert.equal(vm.runInContext("state.world.v086.influence[siteRef]['faction:adventurers']",ctx),56,'security assistance increases local Adventurers Guild influence');
assert.equal(vm.runInContext("state.world.v086.influence[siteRef]['faction:royal']",ctx),68,'security assistance increases local authority influence');

console.log('v0.8.6 regional simulation tests passed');
