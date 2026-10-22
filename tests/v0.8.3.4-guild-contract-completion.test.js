'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const noop = () => {};
const element = () => ({ textContent: '', innerHTML: '', title: '', style: {}, dataset: {}, appendChild: noop, remove: noop, click: noop, focus: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });

function game(seed = 'V0834-CONTRACT-TEST') {
  const storage = new Map();
  const ctx = {
    console: { warn: noop, log: noop, error: console.error }, Math: Object.create(Math),
    document: { title: '', head: element(), body: element(), documentElement: element(), addEventListener: noop, querySelector: selector => selector === '#app' ? element() : null, querySelectorAll: () => [], getElementById: () => null, createElement: element },
    window: { scrollTo: noop, addEventListener: noop },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    setTimeout: () => 0, clearTimeout: noop, requestAnimationFrame: noop, URL, Blob: global.Blob, FileReader: function () {}, navigator: { userAgent: 'v0.8.3.4 contract test' }
  };
  ctx.Math.random = () => 0.999999;
  vm.createContext(ctx);
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of index.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    if (match[1].endsWith('/27-boot.js')) continue;
    vm.runInContext(fs.readFileSync(path.join(root, match[1]), 'utf8'), ctx, { filename: match[1] });
  }
  ctx.toast = message => { ctx.lastToast = String(message); };
  vm.runInContext(`createSeed=${JSON.stringify(seed)};createStart='settlement';state=makeInitial('Contract Tester','human','village');ir05EnsureState(state);`, ctx);
  const guild = vm.runInContext("state.world.organizations.find(row=>row.organizationType==='adventurers-guild')", ctx);
  assert.ok(guild, 'world generation provides a guild');
  vm.runInContext(`state.world.siteId=state.world.region.sites.find(row=>row.geoId===${JSON.stringify(guild.locationGeoId)}).id;ir06EnsureNPCs();state.character.factionMembership='adventurers'`, ctx);
  const npcId = vm.runInContext(`state.world.organizations.find(row=>row.id===${JSON.stringify(guild.id)}).receptionistNpcId`, ctx);
  assert.ok(npcId, 'guild receptionist exists');
  const run = source => vm.runInContext(source, ctx);
  const click = (action, extra = {}) => run(`ir072Action({dataset:${JSON.stringify({ action, npc: npcId, guild: guild.id, ...extra })}})`);
  const contractId = template => `guild-contract:${guild.id}:${template}`;
  const accept = (template, extra = {}) => click('ir0834-accept-contract', { contract: contractId(template), template, ...extra });
  return { ctx, guild, npcId, run, click, accept, contractId, storage };
}

test('rank rules use the authoritative personal rank and fail closed for invalid or quarantined data', () => {
  const g = game();
  assert.equal(g.run("ir0834RankAccess('route-survey').eligible"), true, 'F rank can use an unrestricted contract');
  assert.equal(g.run("ir0834RankAccess('supply-ledger').eligible"), true, 'F rank can use another unrestricted contract');
  assert.equal(g.run("ir0834RankAccess('monster-signs').eligible"), false, 'F rank is below the approved E minimum');
  g.run("state.character.adventurerProgression.currentRank='E'");
  assert.equal(g.run("ir0834RankAccess('monster-signs').eligible"), true);
  g.run("state.character.adventurerProgression.currentRank='SSS'");
  assert.equal(g.run("ir0834RankAccess('monster-signs').eligible"), true);
  g.run("state.character.adventurerProgression.currentRank='A+';");
  assert.equal(g.run("ir0834RankAccess('route-survey').status"), 'unresolved');
  g.run("state.character.adventurerProgression.currentRank='F';state.character.adventurerProgressionIntegrity={status:'quarantined',reason:'test quarantine'}");
  assert.equal(g.run("ir0834RankAccess('monster-signs').eligible"), false);
  g.accept('monster-signs');
  assert.equal(g.run('state.character.guildContractState'), undefined, 'quarantine blocks acceptance without inventing a fallback rank');
});

test('acceptance requires membership and a valid rank gate even when invoked directly', () => {
  const g = game();
  const route = g.run('ir0834RouteOptions(site().id)[0]');
  assert.ok(route);
  g.run("state.character.factionMembership=null");
  g.accept('route-survey', { route: route.routeId });
  assert.match(g.ctx.lastToast, /membership/i);
  assert.equal(g.run('state.character.guildContractState'), undefined);
  g.run("state.character.factionMembership='adventurers'");
  g.accept('monster-signs');
  assert.match(g.ctx.lastToast, /rank E/i);
  assert.equal(g.run('state.character.guildContractState'), undefined);
});

test('route survey counts only the selected canonical edge after committed travel, then pays once at the issuing guild', () => {
  const g = game();
  const guildSiteId = g.run('site().id');
  const route = g.run('ir0834RouteOptions(site().id)[0]');
  assert.ok(route?.routeId && route.toSiteId);
  g.accept('route-survey', { route: route.routeId });
  const instance = g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='route-survey')");
  assert.equal(instance.objective.traversed, false);
  g.run(`ir051TravelQuote(${JSON.stringify(route.toSiteId)},'foot')`);
  assert.equal(g.run('state.character.guildContractState.accepted[0].objective.traversed'), false, 'preview does not count');
  assert.equal(g.run(`ir0775CommitTravel(${JSON.stringify(route.toSiteId)},'foot')`), true);
  assert.equal(g.run('state.character.guildContractState.accepted[0].objective.status'), 'verified');
  assert.equal(g.run('state.character.guildContractState.accepted[0].objective.travelEventIds.length'), 1);
  assert.equal(g.run(`ir0775CommitTravel(${JSON.stringify(guildSiteId)},'foot')`), true);
  assert.equal(g.run(`ir0775CommitTravel(${JSON.stringify(route.toSiteId)},'foot')`), true);
  assert.equal(g.run('state.character.guildContractState.accepted[0].objective.travelEventIds.length'), 1, 'repeated traversal cannot duplicate progress');
  assert.equal(g.run(`ir0775CommitTravel(${JSON.stringify(guildSiteId)},'foot')`), true);
  const before = g.run('state.character.coin');
  const data = { npc: g.npcId, instance: instance.instanceId };
  g.click('ir0834-report-route', data);
  assert.equal(g.run('state.character.guildContractState.accepted[0].status'), 'completed');
  assert.equal(g.run('state.character.coin'), before + 20);
  g.click('ir0834-report-route', data);
  assert.equal(g.run('state.character.coin'), before + 20, 'repeat submission pays nothing');
  g.run('persist();state=readAutosave()');
  assert.equal(g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='route-survey').status"), 'completed');
  g.click('ir0834-report-route', data);
  assert.equal(g.run('state.character.coin'), before + 20, 'a reloaded receipt cannot be paid again');
});

test('multi-leg travel counts only a selected canonical segment and never a different edge', () => {
  const g = game();
  const origin = g.run('site().id');
  const route = g.run('ir0834RouteOptions(site().id)[0]');
  const secondLegTarget = g.run(`ir0775ConnectionsFrom(${JSON.stringify(route.toSiteId)}).map(edge=>edge.to).find(id=>id!==${JSON.stringify(origin)}&&id!==${JSON.stringify(origin)})`);
  assert.ok(route && secondLegTarget, 'a two-leg connected path exists');
  g.accept('route-survey', { route: route.routeId });
  const record = g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='route-survey')");
  g.run(`ir0775CommitTravel(${JSON.stringify(route.toSiteId)},'foot')`);
  assert.equal(record.objective.status, 'verified', 'the selected segment is recorded on its actual committed leg');
  assert.equal(record.objective.travelEventIds.length, 1);
  assert.equal(g.run(`ir0775CommitTravel(${JSON.stringify(secondLegTarget)},'foot')`), true);
  assert.equal(record.objective.travelEventIds.length, 1, 'later legs do not add duplicate progress');
});

test('monster contract tracks one qualifying post-acceptance outdoor victory and excludes sparring', () => {
  const g = game();
  g.run("state.character.adventurerProgression.currentRank='E'");
  const guildSiteId = g.run('site().id');
  const candidates = g.run(`ir0775ConnectionsFrom(${JSON.stringify(guildSiteId)}).map(edge=>irSiteById(edge.to)).filter(location=>location&&location.type!=='settlement'&&ir0834MonsterSiteQualifies(location.id)).map(location=>location.id)`);
  assert.ok(candidates.length, 'test world has a non-settlement site connected to a settlement');
  g.accept('monster-signs');
  const record = g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='monster-signs')");
  g.run(`ir0775CommitTravel(${JSON.stringify(candidates[0])},'foot')`);
  g.run("startCombat('goblin',{type:'spar',noLoot:true});state.combat.enemyHP=0;irCombatEnd('victory','spar test')");
  assert.equal(g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='monster-signs').objective.status"), 'tracking');
  g.run("startCombat('goblin',{type:'wild'});state.combat.enemyHP=0;irCombatEnd('victory','qualifying test')");
  assert.equal(g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='monster-signs').objective.status"), 'verified');
  const eventId = g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='monster-signs').objective.qualifyingEventId");
  assert.match(eventId, /^guild-combat-event:/);
  const before = g.run('state.character.coin');
  g.run(`state.world.siteId=${JSON.stringify(guildSiteId)};ir06EnsureNPCs()`);
  g.click('ir0834-report-monster', { npc: g.npcId, instance: record.instanceId });
  assert.equal(g.run('state.character.coin'), before + 35);
  assert.equal(g.run('state.character.adventurerProgression.dutyCredit'), 0, 'contract completion does not grant duty credit');
});

test('monster objective rejects disallowed source types and contaminated wild encounters', () => {
  const g = game();
  const siteId = g.run("state.world.region.sites.find(location=>location.type!=='settlement'&&ir0834MonsterSiteQualifies(location.id)).id");
  g.run(`state.world.siteId=${JSON.stringify(siteId)}`);
  const battle = { enemyId: 'goblin', ir0834StartedSiteId: siteId, source: {} };
  for (const type of ['spar', 'dungeon', 'npc', 'human', 'escape']) {
    battle.source = { type };
    assert.equal(g.run(`ir0834MonsterEventQualifies(JSON.parse(${JSON.stringify(JSON.stringify(battle))}),'victory','event-${type}')`), false, `${type} does not qualify`);
  }
  battle.source = { type: 'wild', room: 'dungeon-room' };
  assert.equal(g.run(`ir0834MonsterEventQualifies(JSON.parse(${JSON.stringify(JSON.stringify(battle))}),'victory','event-room')`), false, 'dungeon/room sources do not qualify');
  battle.source = { type: 'wild' };
  assert.equal(g.run(`ir0834MonsterEventQualifies(JSON.parse(${JSON.stringify(JSON.stringify(battle))}),'escape','event-escape')`), false, 'non-victory outcomes do not qualify');
  assert.equal(g.run(`ir0834MonsterEventQualifies(JSON.parse(${JSON.stringify(JSON.stringify(battle))}),'victory','event-wild')`), true, 'a clean wild victory at a qualifying site can count');
});

test('supply ledger snapshots existing market stock, rejects false reports, and pays only once', () => {
  const g = game();
  const siteId = g.run('site().id');
  const itemId = g.run("Object.entries(IR_V04_ITEM_DATA).find(([id,data])=>ITEMS[id]&&Number(data.stock)>0)?.[0]");
  assert.ok(itemId);
  g.run(`(()=>{const stock={};for(const [id,data] of Object.entries(IR_V04_ITEM_DATA)){if(Number(data.stock)>0)stock[id]=Math.floor(data.stock)}stock[${JSON.stringify(itemId)}]=Math.max(0,Math.floor(IR_V04_ITEM_DATA[${JSON.stringify(itemId)}].stock)-1);state.world.economy.markets[${JSON.stringify(siteId)}]={siteId:${JSON.stringify(siteId)},stock,sales:{},demand:{},baseDemand:{},transactions:1,lastRestockDay:state.character.daysLived}})()`);
  g.accept('supply-ledger');
  const record = g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='supply-ledger')");
  assert.ok(record.objective.snapshot.some(row => row.itemId === itemId && row.actualStock < row.normalStock));
  g.run(`state.world.economy.markets[${JSON.stringify(siteId)}].stock[${JSON.stringify(itemId)}]=IR_V04_ITEM_DATA[${JSON.stringify(itemId)}].stock`);
  const before = g.run('state.character.coin');
  const nonShortage = g.run(`Object.keys(state.world.economy.markets[${JSON.stringify(siteId)}].stock).find(id=>id!==${JSON.stringify(itemId)}&&state.world.economy.markets[${JSON.stringify(siteId)}].stock[id]>=IR_V04_ITEM_DATA[id].stock)`);
  if (nonShortage) {
    g.click('ir0834-report-shortage', { npc: g.npcId, instance: record.instanceId, item: nonShortage });
    assert.equal(g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='supply-ledger').status"), 'active', 'a catalog item outside the captured shortage cannot be reported');
  }
  g.click('ir0834-report-shortage', { npc: g.npcId, instance: record.instanceId, item: 'not-a-real-item' });
  assert.equal(g.run('state.character.coin'), before);
  assert.equal(g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='supply-ledger').status"), 'active');
  g.click('ir0834-report-shortage', { npc: g.npcId, instance: record.instanceId, item: itemId });
  assert.equal(g.run('state.character.coin'), before + 15);
  g.click('ir0834-report-shortage', { npc: g.npcId, instance: record.instanceId, item: itemId });
  assert.equal(g.run('state.character.coin'), before + 15);
});

test('failed completion persistence rolls back contract status, coin, receipt, and feed together', () => {
  const g = game();
  const route = g.run('ir0834RouteOptions(site().id)[0]');
  g.accept('route-survey', { route: route.routeId });
  const record = g.run("state.character.guildContractState.accepted.find(row=>row.templateId==='route-survey')");
  g.run(`ir0775CommitTravel(${JSON.stringify(route.toSiteId)},'foot')`);
  g.run('persist=()=>false');
  const before = g.run('JSON.stringify({coin:state.character.coin,feed:state.character.feed,record:state.character.guildContractState.accepted[0]})');
  g.click('ir0834-report-route', { npc: g.npcId, instance: record.instanceId });
  const after = g.run('JSON.stringify({coin:state.character.coin,feed:state.character.feed,record:state.character.guildContractState.accepted[0]})');
  assert.equal(after, before, 'failed persistence leaves all in-memory reward and lifecycle fields unchanged');
});

test('market absence never creates stock and disables supply-ledger acceptance', () => {
  const g = game();
  const siteId = g.run('site().id');
  g.run(`delete state.world.economy.markets[${JSON.stringify(siteId)}]`);
  g.accept('supply-ledger');
  assert.match(g.ctx.lastToast, /saved market stock record/i);
  assert.equal(g.run('state.character.guildContractState'), undefined);
  assert.equal(g.run(`state.world.economy.markets[${JSON.stringify(siteId)}]`), undefined, 'acceptance does not initialize market data');
});

test('legacy accepted contracts migrate idempotently without inferring prior objective progress', () => {
  const g = game();
  const id = g.contractId('route-survey');
  const old = JSON.parse(g.run('JSON.stringify(state)'));
  old.character.guildContractState = { schema: 1, accepted: [{ contractId: id, guildId: g.guild.id, status: 'accepted', acceptedAt: 'Old date', unknownLegacyField: 'keep me' }] };
  const migrated = g.run(`normalizeSave(JSON.parse(${JSON.stringify(JSON.stringify(old))}))`);
  assert.equal(migrated.character.guildContractState.schema, 2);
  assert.equal(migrated.character.guildContractState.accepted[0].status, 'active');
  assert.equal(migrated.character.guildContractState.accepted[0].objective.traversed, false);
  assert.equal(migrated.character.guildContractState.accepted[0].objective.status, 'awaiting-route-selection');
  assert.equal(migrated.character.guildContractState.accepted[0].unknownLegacyField, 'keep me');
  const twice = g.run(`normalizeSave(JSON.parse(${JSON.stringify(JSON.stringify(migrated))}))`);
  assert.deepEqual(JSON.parse(JSON.stringify(twice.character.guildContractState)), JSON.parse(JSON.stringify(migrated.character.guildContractState)));
  const corrupt = JSON.parse(JSON.stringify(old)); corrupt.character.guildContractState.accepted[0].guildId = 'missing-guild';
  const corruptRaw = JSON.stringify(corrupt.character.guildContractState);
  const quarantined = g.run(`normalizeSave(JSON.parse(${JSON.stringify(JSON.stringify(corrupt))}))`);
  assert.equal(JSON.stringify(quarantined.character.guildContractState), corruptRaw);
  assert.equal(quarantined.character.guildContractIntegrity.status, 'quarantined');
});

