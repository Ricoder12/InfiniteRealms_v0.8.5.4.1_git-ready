'use strict';
// Audit-only smoke tests for the existing v0.2 seeded world generator.
// Run from the extracted source tree with: node tests/v0.7.5.1-world-data-audit.test.js
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = {
  console, Math, String, Array, Object, Map, Set, Number, JSON,
  clamp: (n, min, max) => Math.max(min, Math.min(max, n))
};
vm.createContext(context);
for (const relative of ['js/data/world.js', 'js/data/backgrounds.js', 'js/game/02-worldgen-v0.2.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
}
const results = [];
function test(name, fn) {
  try { results.push({ name, status: fn() ? 'PASS' : 'FAIL' }); }
  catch (error) { results.push({ name, status: 'FAIL', detail: error.message }); }
}
function generate(seed = 'AUDIT-SEED', circumstance = 'settlement') {
  return context.generateProceduralWorld(seed, circumstance);
}
const serialize = value => JSON.stringify(value);

test('Same seed and starting circumstance produce identical worlds', () => serialize(generate('AUDIT-SEED', 'settlement')) === serialize(generate('AUDIT-SEED', 'settlement')));
test('Different seeds change generated content', () => serialize(generate('AUDIT-SEED')) !== serialize(generate('OTHER-SEED')));
test('Generator creates exactly 49 sites', () => generate().region.sites.length === 49);
test('Site IDs are unique within one generated world', () => { const sites = generate().region.sites; return new Set(sites.map(site => site.id)).size === sites.length; });
test('IDs, linear indexes, rows and columns agree with the 7x7 layout', () => generate().region.sites.every((site, i) => site.id === `loc-${Math.floor(i / 7)}-${i % 7}` && site.index === i && site.row === Math.floor(i / 7) && site.col === i % 7));
test('All 49 sites are reachable from the start for each existing circumstance (audit seed)', () => ['settlement', 'remote', 'roadside', 'wilderness'].every(circumstance => {
  const world = generate('AUDIT-SEED', circumstance), byId = new Map(world.region.sites.map(site => [site.id, site]));
  const seen = new Set([world.siteId]), queue = [world.siteId];
  for (let i = 0; i < queue.length; i++) for (const edge of byId.get(queue[i]).routes) if (byId.has(edge.to) && !seen.has(edge.to)) { seen.add(edge.to); queue.push(edge.to); }
  return seen.size === 49;
}));
test('Global route edges reference valid site-array indexes', () => { const world = generate(); return world.region.routes.every(edge => Number.isInteger(edge.a) && Number.isInteger(edge.b) && world.region.sites[edge.a] && world.region.sites[edge.b]); });
test('Global edges agree with symmetric per-site route entries', () => { const world = generate(); return world.region.routes.every(edge => {
  const from = world.region.sites[edge.a], to = world.region.sites[edge.b];
  const forward = from.routes.find(route => route.to === to.id), reverse = to.routes.find(route => route.to === from.id);
  return forward && reverse && forward.distanceKm === edge.distanceKm && reverse.distanceKm === edge.distanceKm && forward.boat === edge.boat && reverse.boat === edge.boat;
}); });
test('All four circumstances initialize current, visited, known and discovered state', () => ['settlement', 'remote', 'roadside', 'wilderness'].every(circumstance => {
  const world = generate('AUDIT-SEED', circumstance), current = world.region.sites.find(site => site.id === world.siteId);
  return !!current && world.visited[0] === current.id && world.known.includes(current.id) && current.discovered && current.visits === 1;
}));
test('Legacy static REGIONS IDs differ from generated loc-* IDs', () => vm.runInContext("REGIONS.every(region => region.sites.every(site => !/^loc-\\d+-\\d+$/.test(site.id)))", context));

const failed = results.filter(result => result.status === 'FAIL');
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, tests: results }, null, 2));
if (failed.length) process.exitCode = 1;
