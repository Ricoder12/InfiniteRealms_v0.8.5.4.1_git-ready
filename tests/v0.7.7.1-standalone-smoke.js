'use strict';
const fs = require('node:fs');
const path = require('node:path');
const historicalPath = path.join(__dirname, '..', 'backups', 'InfiniteRealms_v0.7.7.1_accepted_baseline.html');
const htmlPath = fs.existsSync(historicalPath) ? historicalPath : path.join(__dirname, '..', 'dist', 'infinite-realms.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const checks = [
  ['standalone has no external script/style links', !/<script\s+src=|<link\s+rel="stylesheet"/i.test(html)],
  ['title is v0.7.7.1', /<title>Infinite Realms — Version 0\.7\.7\.1<\/title>/.test(html)],
  ['shared map data module is embedded', html.includes('function irMapSharedData(')],
  ['stable geoId resolver is embedded', html.includes('function irMapLocationByGeoId(')],
  ['connection resolver is embedded', html.includes('function irMapConnectionByGeoId(')],
  ['no new map renderer is embedded', !html.includes('renderWorldMapV3') && !html.includes('localMapRenderer')],
  ['application boot remains after shared map data module', html.indexOf('function irMapSharedData(') < html.lastIndexOf('boot();') && html.lastIndexOf('boot();') >= 0],
];
let failed=0;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'}\t${name}`); if(!ok) failed++; }
console.log(`CHECKS=${checks.length} PASS=${checks.length-failed} FAIL=${failed}`);
if(failed) process.exitCode=1;
