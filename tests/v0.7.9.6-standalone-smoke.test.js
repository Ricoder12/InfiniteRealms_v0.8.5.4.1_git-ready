'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const htmlPath = path.join(__dirname, '..', 'dist', 'infinite-realms.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const noop = () => {};
const element = () => ({ textContent: '', innerHTML: '', title: '', style: {}, dataset: {}, appendChild: noop,
  remove: noop, click: noop, focus: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } });
const context = { console: { warn: noop, log: noop, error: console.error }, Math: Object.create(Math), String, Array, Object,
  Map, Set, Number, JSON, RegExp, Date, Intl, parseInt, parseFloat,
  document: { title: '', head: { appendChild: noop }, body: element(), addEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: element },
  window: { scrollTo: noop, addEventListener: noop }, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  setTimeout: () => 0, clearTimeout: noop, requestAnimationFrame: noop, URL, Blob: global.Blob };
vm.createContext(context);
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
for (let i = 0; i < scripts.length - 1; i++) vm.runInContext(scripts[i], context, { filename: `standalone-script-${i + 1}` });
vm.runInContext('render=()=>{}; persist=()=>true; toast=()=>{};', context);
const checks = [];
function check(name, fn) { try { checks.push({ name, status: (typeof fn === 'function' ? fn() : fn) ? 'PASS' : 'FAIL' }); }
  catch (error) { checks.push({ name, status: 'FAIL', detail: error?.stack || String(error) }); } }
check('Standalone has no external script or stylesheet dependencies', !/<script\s+src=|<link\s+rel=["']stylesheet/i.test(html));
check('Standalone advertises v0.8.3.7 and embeds the NPC integrity guard', html.includes('<title>Infinite Realms — Version 0.8.3.7</title>') && html.includes('function ir0796HasStaleScheduleReference'));
check('Built standalone embeds the rank ladder and keeps undecided eligibility blocked', () => vm.runInContext("IR_V0832_RANK_DEFINITIONS.map(rank=>rank.id).join(',')==='F,E,D,C,B,A,S,SS,SSS'&&ir0832EvaluateRankEligibility({currentRank:'F'},'E').status==='ineligible'", context));
check('Standalone generates a world with valid resolvable NPC schedule locations', () => vm.runInContext("(()=>{createSeed='SMOKE-796';createStart='settlement';state=makeInitial('Smoke Tester','human','village');ir06EnsureNPCs();return ir0755ValidateGeographicIntegrity(state.world,state.character).ok&&state.character.npcs.filter(n=>String(n.id).startsWith('ir06_')).every(n=>{const s=ir071ScheduleFor(n,14);return s.state==='traveling'?!!ir0796UniqueSite(s.destinationSiteId):s.state==='unknown'?false:!!ir0796UniqueSite(s.siteId)})})()", context));
check('Standalone leaves stale NPC location references unchanged and unavailable', () => vm.runInContext("(()=>{const n={id:'npc-smoke-stale',homeSite:'missing:site',workSite:'missing:site',ir071ScheduleVersion:1},before=JSON.stringify(n);ir071MigrateNPC(n,state.world,state.world.region.sites);const s=ir071ScheduleFor(n,2);return JSON.stringify(n)===before&&s.state==='unknown'&&s.siteId===null})()", context));
check('Political leader reference resolves to the existing NPC without cloning it', () => vm.runInContext("(()=>{const n=state.character.npcs[0],count=state.character.npcs.length,r=irResolvePoliticalLeader({world:state.world,character:state.character},n.id);return r.ok&&r.npc===n&&count===state.character.npcs.length})()", context));
const failed = checks.filter(item => item.status === 'FAIL');
console.log(JSON.stringify({ total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
if (failed.length) process.exitCode = 1;


