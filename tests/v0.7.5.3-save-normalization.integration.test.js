'use strict';
// Integration check using the production normalizeSave() implementation.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = { console, Math, String, Array, Object, Map, Set, Number, JSON, RegExp,
  clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
  clone: o => JSON.parse(JSON.stringify(o)), state: null };
vm.createContext(context);
const files = [
  'js/data/config.js','js/data/world.js','js/data/backgrounds.js','js/data/races.js',
  'js/data/skills.js','js/data/items.js','js/data/jobs.js','js/data/npcs.js','js/data/events.js',
  'js/game/02-worldgen-v0.2.js','js/game/03-stability-v0.2.1.js',
  'js/game/33-stable-geographic-identifiers-v0.7.5.2.js','js/game/34-geographic-hierarchy-connections-v0.7.5.3.js'
];
for (const relative of files) vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
const originalWorld = context.generateProceduralWorld('PRODUCTION-NORMALIZE-TEST', 'wilderness');
originalWorld.visited.push(originalWorld.region.sites[3].id);
originalWorld.known.push(originalWorld.region.sites[3].id);
originalWorld.region.sites[3].discovered = true;
const save = {
  version: 2,
  character: { name:'Test Wayfarer', race:'human', background:'village', attrs:{}, skills:{}, inventory:{}, equipment:{}, relationships:{}, discoveries:[], npcs:[], ageMonths:240, daysLived:0, coin:20, maxHealth:100, health:100, maxEnergy:100, energy:80, hunger:80, mood:60, reputation:0, job:null, jobShifts:0 },
  calendar: { day:8, month:3, year:102 }, world: originalWorld, feed: [], view:'World', eventQueue:[], settings:{}
};
const reloaded = context.normalizeSave(JSON.parse(JSON.stringify(save)));
const report = context.irValidateGeographicHierarchy(reloaded.world);
const checks = { validation:report.ok, currentLocation:reloaded.world.siteId === originalWorld.siteId, visitedPreserved:JSON.stringify(reloaded.world.visited) === JSON.stringify(originalWorld.visited), knownPreserved:originalWorld.known.every(id => reloaded.world.known.includes(id)), discoveryPreserved:reloaded.world.region.sites.some(s => s.id === originalWorld.region.sites[3].id && s.discovered), siteReferences:reloaded.world.region.sites.every(s => !!s.geoId && s.regionId === reloaded.world.region.id), routeReferences:reloaded.world.region.routes.every(r => !!r.geoId && !!r.fromGeoId && !!r.toGeoId) };
const passed = Object.values(checks).every(Boolean);
console.log(JSON.stringify({total:1,passed:passed?1:0,failed:passed?0:1,checks,validation:report,original:{siteId:originalWorld.siteId,visited:originalWorld.visited,known:originalWorld.known},reloaded:{siteId:reloaded.world.siteId,visited:reloaded.world.visited,known:reloaded.world.known}},null,2));
if (!passed) process.exitCode = 1;
