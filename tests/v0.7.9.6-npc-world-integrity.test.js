'use strict';
// Run: node tests/v0.7.9.6-npc-world-integrity.test.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const noop = () => {};
const element = () => ({ textContent: '', innerHTML: '', title: '', style: {}, dataset: {},
  appendChild: noop, remove: noop, click: noop, focus: noop,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
const storage = new Map();
const context = { console: { warn: noop, log: noop, error: console.error }, Math: Object.create(Math),
  String, Array, Object, Map, Set, Number, JSON, RegExp, Date, Intl, parseInt, parseFloat,
  document: { title: '', head: { appendChild: noop }, body: element(), addEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: element },
  window: { scrollTo: noop, addEventListener: noop },
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
  setTimeout: () => 0, clearTimeout: noop, requestAnimationFrame: noop, URL, Blob: global.Blob,
  FileReader: function () {}, navigator: { userAgent: 'Node test VM' } };
vm.createContext(context);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(f => !f.endsWith('/27-boot.js'));
for (const relative of scripts) vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
vm.runInContext('render=()=>{}; persist=()=>true; toast=()=>{};', context);
const results = [];
function test(name, fn) { try { results.push({ name, status: fn() ? 'PASS' : 'FAIL' }); }
  catch (error) { results.push({ name, status: 'FAIL', detail: error?.stack || String(error) }); } }

test('Valid generated schedules remain stable and resolve to unique sites after repeated initialization', () => {
  vm.runInContext("createSeed='NPC-796-VALID'; createStart='settlement'; state=makeInitial('NPC Tester','human','village'); ir06EnsureNPCs();", context);
  const before = vm.runInContext("JSON.stringify(state.character.npcs.filter(n=>String(n.id).startsWith('ir06_')).map(n=>[n.id,n.homeSite,n.workSite,n.restSite,n.socialSite]))", context);
  vm.runInContext('ir06EnsureNPCs()', context);
  const after = vm.runInContext("JSON.stringify(state.character.npcs.filter(n=>String(n.id).startsWith('ir06_')).map(n=>[n.id,n.homeSite,n.workSite,n.restSite,n.socialSite]))", context);
  return before === after && vm.runInContext("state.character.npcs.filter(n=>String(n.id).startsWith('ir06_')).every(n=>{const s=ir071ScheduleFor(n,14);return s.state==='traveling'?ir0796UniqueSite(s.destinationSiteId):ir0796UniqueSite(s.siteId)})", context);
});

test('Versioned NPC with stale explicit home/work references is not relocated during migration', () => {
  const npc = { id: 'npc-stale-796', homeSite: 'site:deleted', workSite: 'site:deleted', restSite: 'site:deleted', socialSite: 'site:deleted', ir071ScheduleVersion: 1 };
  context.npc = npc;
  const before = JSON.stringify(npc);
  vm.runInContext("ir071MigrateNPC(npc,state.world,state.world.region.sites)", context);
  const schedule = vm.runInContext("ir071Schedule(npc,3,{worldSeed:'x',sites:state.world.region.sites})", context);
  return JSON.stringify(npc) === before && schedule.state === 'unknown' && schedule.siteId === null;
});

test('Legacy NPC with explicit stale location is preserved instead of assigned to the first/current site', () => {
  const npc = { id: 'legacy-stale-796', homeSite: 'site:deleted', workSite: 'site:deleted' };
  context.npc = npc;
  const before = JSON.stringify(npc);
  vm.runInContext("ir071MigrateNPC(npc,state.world,state.world.region.sites)", context);
  return JSON.stringify(npc) === before && vm.runInContext("ir071Schedule(npc,2,{worldSeed:'x',sites:state.world.region.sites}).state==='unknown'", context);
});

test('Duplicate site IDs make schedules unavailable rather than resolving an arbitrary location', () => {
  const sites = [{ id: 'duplicate', name: 'First' }, { id: 'duplicate', name: 'Second' }];
  const npc = { id: 'npc-duplicate-site', homeSite: 'duplicate', workSite: 'duplicate', ir071ScheduleVersion: 1 };
  context.sitesArg = sites; context.npc = npc;
  const schedule = vm.runInContext("ir071Schedule(npc,1,{worldSeed:'x',sites:sitesArg})", context);
  return schedule.state === 'unknown' && schedule.siteId === null && vm.runInContext("ir071SiteById('duplicate',sitesArg)===null", context);
});

test('Travel-role NPC schedule ignores a stale local route that is absent from the authoritative graph', () => {
  const fixture = vm.runInContext("(()=>{const sites=state.world.region.sites,work=sites.find(s=>s.type==='settlement'),target=sites.find(s=>s.id!==work.id&&!ir0775Connection(work.id,s.id));const npc={id:'merchant-stale-edge-796',occupation:'merchant',ir071TravelRole:true,homeSite:work.id,workSite:work.id,restSite:work.id,socialSite:work.id,ir071ScheduleVersion:1};work.routes=[{to:target.id}];const ctx={worldSeed:state.world.seed,sites};let day=-1;for(let i=0;i<500;i++){if(ir0796ScheduleBase(npc,i,ctx).state==='traveling'){day=i;break}}return {npc,ctx,day,target:target.id}})()", context);
  context.fixture = fixture;
  const schedule = vm.runInContext("ir071Schedule(fixture.npc,fixture.day,fixture.ctx)", context);
  return fixture.day >= 0 && schedule.state === 'unknown' && schedule.siteId === null && schedule.destinationSiteId === undefined;
});

test('Supported occupation interaction panels render only when the NPC is scheduled at the current location', () => {
  const result = vm.runInContext("(()=>{const current=site(),roles=[['merchant','merchant','Merchant services'],['blacksmith','blacksmith','Blacksmith services'],['guard','guard','Guard services'],['hunter','hunter','Hunter services'],['scholar','scholar','Scholar services'],['innkeeper','innkeeper','Innkeeper services'],['farmer','farmer','Produce and farm work']],rows=[];for(const [id,occupation,expected] of roles){const n={id:'occupation-'+id+'-796',name:'Test '+id,occupation,role:occupation,homeSite:current.id,workSite:current.id,restSite:current.id,socialSite:current.id,ir071ScheduleVersion:1};state.character.npcs.push(n);let day=-1;for(let d=0;d<60;d++){const s=ir071ScheduleFor(n,d);if(s.state!=='traveling'&&s.siteId===current.id){day=d;break}}state.character.daysLived=day;modal={kind:'ir072-interactions',npc:n.id};const html=ir072InteractionModal();rows.push({id,day,present:ir072IsPresent(n),kind:ir072Occupation(n),expected,found:html.includes(expected),away:html.includes('Not available here right now')})}const awaySite=state.world.region.sites.find(s=>s.id!==current.id),away={id:'occupation-away-796',name:'Away Merchant',occupation:'merchant',homeSite:awaySite.id,workSite:awaySite.id,restSite:awaySite.id,socialSite:awaySite.id,ir071ScheduleVersion:1};state.character.npcs.push(away);state.world.siteId=current.id;state.character.daysLived=14;modal={kind:'ir072-interactions',npc:away.id};const awayHtml=ir072InteractionModal();globalThis.__occDiag={rows,away:awayHtml.includes('Not available here right now'),merchantServices:awayHtml.includes('Merchant services')};return rows.every(r=>r.day>=0&&r.present&&r.found&&!r.away)&&globalThis.__occDiag.away&&!globalThis.__occDiag.merchantServices})()", context);
  return result;
});

test('Political leader lookup reuses the existing NPC object and does not duplicate its identity', () => {
  return vm.runInContext("(()=>{const npc=state.character.npcs[0],count=state.character.npcs.length; const result=irResolvePoliticalLeader({world:state.world,character:state.character},npc.id); return result.ok&&result.npc===npc&&state.character.npcs.length===count})()", context);
});

const failed = results.filter(result => result.status === 'FAIL');
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, tests: results }, null, 2));
if (failed.length) process.exitCode = 1;
