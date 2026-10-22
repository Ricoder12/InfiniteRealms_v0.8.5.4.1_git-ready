#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const testRows = [];
function check(name, ok, detail = '') {
  testRows.push({ name, status: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  else console.log(`PASS: ${name}${detail ? ` — ${detail}` : ''}`);
}
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const compat = fs.readFileSync(path.join(root, 'js/game/50-save-compatibility-v0.7.7.8.js'), 'utf8');
const acceptance = fs.readFileSync(path.join(root, 'js/game/51-final-acceptance-v0.7.7.9.js'), 'utf8');
const mapData = fs.readFileSync(path.join(root, 'js/game/43-shared-map-data-v0.7.7.1.js'), 'utf8');
const worldMap = fs.readFileSync(path.join(root, 'js/game/44-world-map-v0.7.7.2.js'), 'utf8');
const regionalMap = fs.readFileSync(path.join(root, 'js/game/45-regional-map-v0.7.7.3.js'), 'utf8');
const localMap = fs.readFileSync(path.join(root, 'js/game/46-local-map-v0.7.7.4.js'), 'utf8');
const travel = fs.readFileSync(path.join(root, 'js/game/47-travel-route-integration-v0.7.7.5.js'), 'utf8');
const character = fs.readFileSync(path.join(root, 'js/game/48-character-status-v0.7.7.6.js'), 'utf8');
const uiPolish = fs.readFileSync(path.join(root, 'js/game/49-unified-map-character-ui-v0.7.7.7.js'), 'utf8');
const politicalMap = fs.readFileSync(path.join(root, 'js/game/56-political-map-integration-v0.7.8.7.js'), 'utf8');
const geographicIntegrity = fs.readFileSync(path.join(root, 'js/game/57-geographic-data-integrity-v0.7.9.2.js'), 'utf8');
const politicalGeographyIntegrity = fs.readFileSync(path.join(root, 'js/game/58-political-geography-integrity-v0.7.9.5.js'), 'utf8');
const npcWorldIntegrity = fs.readFileSync(path.join(root, 'js/game/59-npc-world-integrity-v0.7.9.6.js'), 'utf8');
const scripts = [...index.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const pos = value => scripts.indexOf(value);
check('Current metadata retains prior layers and includes NPC/world integrity guard', index.includes('Infinite Realms — Version 0.8.3.7') && acceptance.includes('Version 0.7.7.9') && politicalMap.includes('ir0787WorldPoliticalPanel') && geographicIntegrity.includes('Version 0.7.9.2') && politicalGeographyIntegrity.includes('ir0795SiteOwnershipErrors') && npcWorldIntegrity.includes('ir0796HasStaleScheduleReference'));
check('Political map presentation loads after generated political data and before boot', index.indexOf('55-world-political-generation-v0.7.8.6.js') < index.indexOf('56-political-map-integration-v0.7.8.7.js') && index.indexOf('56-political-map-integration-v0.7.8.7.js') < index.indexOf('js/game/27-boot.js'));
check('Geographic integrity diagnostics load after politics and before boot', index.indexOf('56-political-map-integration-v0.7.8.7.js') < index.indexOf('57-geographic-data-integrity-v0.7.9.2.js') && index.indexOf('57-geographic-data-integrity-v0.7.9.2.js') < index.indexOf('js/game/27-boot.js'));
check('NPC/world integrity guard runs after political validation and before boot', index.indexOf('58-political-geography-integrity-v0.7.9.5.js') < index.indexOf('59-npc-world-integrity-v0.7.9.6.js') && index.indexOf('59-npc-world-integrity-v0.7.9.6.js') < index.indexOf('js/game/71-association-tab-assignment-gate-v0.8.3.6.js') && index.indexOf('js/game/71-association-tab-assignment-gate-v0.8.3.6.js') < index.indexOf('js/game/27-boot.js'));
check('Acceptance branding layer runs after compatibility/UI layers and political foundation before boot', pos('js/game/51-final-acceptance-v0.7.7.9.js') > pos('js/game/50-save-compatibility-v0.7.7.8.js') && pos('js/game/51-final-acceptance-v0.7.7.9.js') < pos('js/game/52-political-entity-foundation-v0.7.8.2.js') && pos('js/game/52-political-entity-foundation-v0.7.8.2.js') < pos('js/game/53-regional-hierarchy-v0.7.8.3.js') && pos('js/game/53-regional-hierarchy-v0.7.8.3.js') < pos('js/game/54-government-leadership-capitals-v0.7.8.5.js') && pos('js/game/54-government-leadership-capitals-v0.7.8.5.js') < pos('js/game/27-boot.js'));
check('World, regional, local maps share the prior canonical data layer', mapData.includes('function irMapSharedData') && worldMap.includes('const region = world.region') && regionalMap.includes('ir0772WorldMapModel()') && localMap.includes('ir0773RenderLocalView') && localMap.includes('ir0774RenderLocalViewBase = ir0773RenderLocalView'));
check('Map views and character status avoid adding gameplay/save migrations', !/saveVersion\s*=|schemaVersion\s*=/.test(acceptance) && !/function\s+generateWorld|function\s+makeInitial/.test(acceptance));
check('Map state replacement resets transient selection without replacing valid geography', compat.includes('ir0778ResetMapUiForState') && compat.includes('ir0778ObservedState') && compat.includes('Never rewrite geographic IDs'));
check('Travel integration delegates to existing route/travel code', /ir0775/.test(travel) && /travel|route/i.test(travel));
check('Character summary reads from existing character/equipment data', /renderCharacter/.test(character) && /equipment|character/i.test(character));
check('UI polish uses existing map view controls and Character addendum', uiPolish.includes('ir0777-map-view-switcher') && character.includes('ir0776-addendum'));
check('Compatibility defaults are conservative and idempotent', /if \(!Array\.isArray\(world\.visited\)\)/.test(compat) && /if \(!Array\.isArray\(world\.known\)\)/.test(compat) && /ir0778NormalizeSaveBase\(prepared\)/.test(compat));
check('No external framework/CDN added by v0.7.7.9 acceptance', !/<script[^>]+src="https?:\/\//i.test(index) && !/<link[^>]+href="https?:\/\//i.test(index));
const passed = testRows.filter(r => r.status === 'PASS').length;
const failed = testRows.length - passed;
console.log(`SUMMARY ${passed}/${testRows.length} PASS; ${failed} FAIL`);
if (failed) process.exitCode = 1;


