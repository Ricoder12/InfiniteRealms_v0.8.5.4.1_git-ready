'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const moduleSource = fs.readFileSync(path.join(root, 'js/game/49-unified-map-character-ui-v0.7.7.7.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/ui-polish-v0.7.7.7.css'), 'utf8');
const results = [];
function test(name, ok, detail='') { results.push({name,status:ok?'PASS':'FAIL',detail}); }
test('Standalone entry point uses the v0.8.3.7 release title', index.includes('<title>Infinite Realms — Version 0.8.3.7</title>'));
test('Scoped polish stylesheet loads with the map stylesheet', index.includes('css/world-map.css') && index.includes('css/ui-polish-v0.7.7.7.css') && index.indexOf('css/world-map.css') < index.indexOf('css/ui-polish-v0.7.7.7.css'));
test('Unified map UI module loads after Character status and before application boot', index.indexOf('48-character-status-v0.7.7.6.js') < index.indexOf('49-unified-map-character-ui-v0.7.7.7.js') && index.indexOf('49-unified-map-character-ui-v0.7.7.7.js') < index.indexOf('js/game/27-boot.js'));
test('All three map view actions are implemented and use existing map-scope state', ['ir0777-map-world','ir0777-map-regional','ir0777-map-local'].every(action=>moduleSource.includes(action)) && moduleSource.includes('ir0772MapScope = \'atlas\'') && moduleSource.includes('ir0772MapScope = \'regional\'') && moduleSource.includes('ir0772MapScope = \'local\''));
test('View controls expose accessible state and native button interactions', moduleSource.includes('aria-current="page"') && moduleSource.includes('aria-pressed=') && moduleSource.includes('aria-label="Map views"'));
test('Existing renderers are wrapped instead of replacing map geometry or travel mechanics', moduleSource.includes('ir0777RenderWorldBase.apply(this, arguments)') && moduleSource.includes('ir0777RenderCharacterBase.apply(this, arguments)') && !moduleSource.includes('state.world.routes =') && !moduleSource.includes('state.character.health ='));
test('Focused keyboard states and disabled map controls have scoped styles', css.includes('.ir0777-map-view-switcher button:focus-visible') && css.includes('button:disabled') && css.includes('@media(max-width:760px)'));
test('Character meters and travel estimates use tabular numeric displays', css.includes('.ir0776-meter-label b') && css.includes('font-variant-numeric:tabular-nums') && css.includes('.ir0775-route-modal .ir051-trip-summary'));
test('Responsive and reduced-motion rules avoid unnecessary animation', css.includes('@media(max-width:380px)') && css.includes('@media(prefers-reduced-motion:reduce)'));
const failed=results.filter(r=>r.status==='FAIL');
console.log(JSON.stringify({suite:'Infinite Realms v0.7.7.7 UI polish integration',total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length) process.exit(1);


