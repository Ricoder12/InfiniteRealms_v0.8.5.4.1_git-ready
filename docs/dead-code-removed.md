# Dead code removed during the split

In the original single file, 42 function declarations were **shadowed by a later function with the same name**. JavaScript hoists the *last* declaration of a name to the top of its scope, so the earlier copies could never run. They were removed here; behavior is unchanged (verified by the regression test).

Line numbers refer to the original `infinite_realms_v073.html`.

| Function | Dead copy (original line) | Live version (original line) | Live version now lives in |
|---|---|---|---|
| `advanceMonth` | 96 (core-v0.1) | 267 | `js/game/02-worldgen-v0.2.js` |
| `boot` | 174 (core-v0.1) | 338 | `js/game/02-worldgen-v0.2.js` |
| `buyItem` | 106 (core-v0.1) | 312 | `js/game/02-worldgen-v0.2.js` |
| `buyMeal` | 104 (core-v0.1) | 311 | `js/game/02-worldgen-v0.2.js` |
| `dayPass` | 94 (core-v0.1) | 263 | `js/game/02-worldgen-v0.2.js` |
| `doWork` | 98 (core-v0.1) | 307 | `js/game/02-worldgen-v0.2.js` |
| `explore` | 109 (core-v0.1) | 405 | `js/game/03-stability-v0.2.1.js` |
| `explore` | 315 (worldgen-v0.2) | 405 | `js/game/03-stability-v0.2.1.js` |
| `exportSave` | 138 (core-v0.1) | 299 | `js/game/02-worldgen-v0.2.js` |
| `gainSkill` | 93 (core-v0.1) | 306 | `js/game/02-worldgen-v0.2.js` |
| `importSave` | 139 (core-v0.1) | 300 | `js/game/02-worldgen-v0.2.js` |
| `ir0726AttackNPC` | 3658 (reputation-gang-boss-v0.7.2.6) | 4001 | `js/game/26-reputation-consequences-v0.7.3.js` |
| `ir072BlacksmithCards` | 2343 (npc-occupations-v0.7.2) | 2883 | `js/game/18-facility-polish-v0.7.2.js` |
| `ir072ShopCard` | 2333 (npc-occupations-v0.7.2) | 2623 | `js/game/17-town-services-road-trading-v0.7.2.js` |
| `loadSlot` | 90 (core-v0.1) | 298 | `js/game/02-worldgen-v0.2.js` |
| `makeInitial` | 79 (core-v0.1) | 302 | `js/game/02-worldgen-v0.2.js` |
| `mapPanel` | 154 (core-v0.1) | 422 | `js/game/03-stability-v0.2.1.js` |
| `mapPanel` | 327 (worldgen-v0.2) | 422 | `js/game/03-stability-v0.2.1.js` |
| `normalizeSave` | 85 (core-v0.1) | 346 | `js/game/03-stability-v0.2.1.js` |
| `normalizeSave` | 275 (worldgen-v0.2) | 346 | `js/game/03-stability-v0.2.1.js` |
| `onMonthPassed` | 95 (core-v0.1) | 266 | `js/game/02-worldgen-v0.2.js` |
| `persist` | 82 (core-v0.1) | 404 | `js/game/03-stability-v0.2.1.js` |
| `persist` | 293 (worldgen-v0.2) | 404 | `js/game/03-stability-v0.2.1.js` |
| `readAutosave` | 83 (core-v0.1) | 294 | `js/game/02-worldgen-v0.2.js` |
| `readSlots` | 86 (core-v0.1) | 295 | `js/game/02-worldgen-v0.2.js` |
| `renderAdventure` | 157 (core-v0.1) | 329 | `js/game/02-worldgen-v0.2.js` |
| `renderCharacter` | 161 (core-v0.1) | 334 | `js/game/02-worldgen-v0.2.js` |
| `renderInventory` | 158 (core-v0.1) | 330 | `js/game/02-worldgen-v0.2.js` |
| `renderWorld` | 156 (core-v0.1) | 328 | `js/game/02-worldgen-v0.2.js` |
| `saveSlot` | 89 (core-v0.1) | 297 | `js/game/02-worldgen-v0.2.js` |
| `shell` | 144 (core-v0.1) | 333 | `js/game/02-worldgen-v0.2.js` |
| `study` | 100 (core-v0.1) | 308 | `js/game/02-worldgen-v0.2.js` |
| `talkToNpc` | 111 (core-v0.1) | 322 | `js/game/02-worldgen-v0.2.js` |
| `topbar` | 141 (core-v0.1) | 332 | `js/game/02-worldgen-v0.2.js` |
| `train` | 101 (core-v0.1) | 309 | `js/game/02-worldgen-v0.2.js` |
| `travel` | 107 (core-v0.1) | 313 | `js/game/02-worldgen-v0.2.js` |
| `triggerEvent` | 108 (core-v0.1) | 270 | `js/game/02-worldgen-v0.2.js` |
| `useItem` | 105 (core-v0.1) | 421 | `js/game/03-stability-v0.2.1.js` |
| `useItem` | 310 (worldgen-v0.2) | 421 | `js/game/03-stability-v0.2.1.js` |
| `validSave` | 84 (core-v0.1) | 345 | `js/game/03-stability-v0.2.1.js` |
| `validSave` | 274 (worldgen-v0.2) | 345 | `js/game/03-stability-v0.2.1.js` |
| `writeSlots` | 87 (core-v0.1) | 296 | `js/game/02-worldgen-v0.2.js` |
