'use strict';
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'infinite-realms.html'), 'utf8');
const checks = [
  ['standalone has no external script/style references', !/<script\s+src=|<link\s+rel="stylesheet"/i.test(html)],
  ['document title advertises current release v0.8.2.5', /<title>Infinite Realms — Version 0\.8\.2\.5<\/title>/.test(html)],
  ['shared map data module remains embedded', html.includes('function irMapSharedData(')],
  ['interactive world atlas model and renderer are embedded', html.includes('function ir0772WorldMapModel(') && html.includes('function ir0772RenderWorldAtlas(')],
  ['v0.7.7.2 regional base and v0.7.7.3 accuracy renderer are embedded', html.includes('function ir0772RenderRegionalMap(') && html.includes('function ir0773RenderRegionalMap(')],
  ['regional inspection, local detail, and local illustrated scene are embedded', html.includes("action === 'ir0772-inspect-location'") && html.includes('function ir0773RenderLocalView(') && html.includes('function ir0774LocalScene(') && html.includes("action === 'travel'")],
  ['v0.7.7.5 travel module uses the authoritative route graph for direct and multi-leg travel', html.includes('function ir0775Connection(') && html.includes('function ir0775ConnectionsFrom(') && html.includes('ir0775CommitTravel') && html.includes('ir071TravelRouteConfirm = function')],
  ['map CSS is bundled', html.includes('.ir0772-atlas-frame') && html.includes('.ir0772-regional-node') && html.includes('.ir0773-route-line')],
  ['accepted v0.7.7.1 content remains available as exact backup', fs.existsSync(path.join(__dirname, '..', 'backups', 'InfiniteRealms_v0.7.7.1_accepted_baseline.html'))],
  ['shared data → atlas → regional → local scene → travel integration → boot order is preserved', html.indexOf('function irMapSharedData(') < html.indexOf('function ir0772RenderWorldAtlas(') && html.indexOf('function ir0772RenderWorldAtlas(') < html.indexOf('function ir0773RenderRegionalMap(') && html.indexOf('function ir0773RenderRegionalMap(') < html.indexOf('function ir0774LocalScene(') && html.indexOf('function ir0774LocalScene(') < html.indexOf('function ir0775Connection(') && html.indexOf('function ir0775Connection(') < html.lastIndexOf('boot();') && html.lastIndexOf('boot();') >= 0],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}\t${name}`); if (!ok) failed++; }
console.log(`CHECKS=${checks.length} PASS=${checks.length-failed} FAIL=${failed}`);
if (failed) process.exitCode = 1;
