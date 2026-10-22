# Infinite Realms — Baseline and Output Manifest (maintained through v0.7.6.2)

This version is built from the accepted v0.7.5.1 source audit working copy. The original standalone v0.7.3.6 baseline is preserved unchanged at `backups/InfiniteRealms_v0.7.3.6_baseline.html`.

- Baseline standalone SHA-256: `4fa32379add642710060666c949bb2283887cc774b45f51b021ac14356e5f57c`
- Original accepted source archive SHA-256: `c39516b928184c217455f1a1694bb41bc42bad2eac871e76a60e66ce8e24e67c`
- v0.7.5.2 standalone output: `dist/infinite-realms.html`
- New geographic identifier module: `js/game/33-stable-geographic-identifiers-v0.7.5.2.js`
- Identifier design: `docs/v0.7.5.2-geographic-identifiers.md`
- Test report: `docs/v0.7.5.2-test-report.md`
- Rollback instructions: `docs/v0.7.5.2-rollback.md`

The audit itself made no gameplay changes. v0.7.5.2 adds stable IDs and a small route-renderer compatibility adapter. It does not implement the later v0.7.5.3 migration work.


## v0.7.5.4 — World Generation Integration

- Based on the accepted v0.7.5.3 source and geographic hierarchy module.
- Added `js/game/35-world-generation-integration-v0.7.5.4.js`; no earlier version module was edited.
- Standalone output: `dist/infinite-realms.html`.
- New tests: `tests/v0.7.5.4-world-generation-integration.test.js` and `tests/v0.7.5.4-gameplay-integration.test.js`.
- Documentation: `docs/v0.7.5.4-world-generation-integration.md`, `docs/v0.7.5.4-test-report.md`, and `docs/v0.7.5.4-rollback.md`.
- Accepted v0.7.5.3 standalone backup: `backups/InfiniteRealms_v0.7.5.3_backup.html`; SHA-256 `1c1b925c07e4e2adc9a072e1571ed377de0873c0ec7e947302aeb89f050f1672`.
- Test result: 125 automated checks passed, 0 failed; all JS syntax checks and the standalone build passed. The Chromium smoke attempt is inconclusive because `about:blank` also timed out.
- Integration behavior: new worlds pass through existing ID/hierarchy enrichment; structurally valid v2 saves reuse their existing region rather than rebuilding it simply because geographic fields have been added. Invalid saves retain the existing fallback path.

## v0.7.5.5 — Save Compatibility and Regression

- Based on the accepted v0.7.5.4 build and source archive; earlier standalone artifacts remain unchanged.
- Added `js/game/36-save-compatibility-regression-v0.7.5.5.js` for conservative geographic save validation, migration notices, ambiguous-reference handling, and integrity checks.
- Added `tests/v0.7.5.5-save-compatibility-regression.test.js` (14 checks) and `tests/v0.7.5.5-gameplay-regression.test.js` (6 checks).
- Documentation: `docs/v0.7.5.5-save-compatibility-and-regression.md`, `docs/v0.7.5.5-geographic-data-integrity.md`, `docs/v0.7.5.5-test-report.md`, and `docs/v0.7.5.5-rollback.md`.
- Rollback build: `backups/InfiniteRealms_v0.7.5.4_backup.html`, copied from the accepted v0.7.5.4 standalone; SHA-256 `eebafbb5fc51a34ba516ef7f42c5a52948b6f349a34aa7e069b69dc961d33d2c`.
- Test result: **145 automated checks passed, 0 failed**, JavaScript syntax checks passed, build passed. The Node tests cover a synthetic v0.7.3.6 state generated with that version's real source, not a user-exported save file.
- Browser runtime and actual browser localStorage remain blocked in this environment because headless Chromium also timed out on `about:blank`. See `docs/v0.7.5.5-test-report.md` for statuses and limitations.


## v0.7.6.1 — Biome Data and Ecology Profiles

- Source base: accepted v0.7.5.5. The original v0.7.3.6 baseline and v0.7.5.2–v0.7.5.5 standalone builds were hash-compared with their in-project backups and remain unchanged.
- Accepted v0.7.5.5 rollback SHA-256: `be2600a8770e5c58ec254639baee157e99a55c4bd59e11c6794b93f8b6a7fb9e`.
- Authoritative registry: `IR_BIOMES` in `js/data/world.js`; new biome/profile validation module: `js/game/37-biome-profile-validation-v0.7.6.1.js`.
- Consolidated existing forage/scout weighted lists and per-method gathering pools into the profiles; preserved all existing encounter pools in `js/data/enemies.js`.
- Test suite: `tests/v0.7.6.1-biome-profile-system.test.js` (21 PASS / 0 FAIL). The previous 145 available regression checks also passed in the current source sequence; combined total **166 PASS / 0 FAIL**.
- Validation: all 64 JavaScript files under `js/` and `tests/` plus `build.js` pass `node --check`; `node build.js` passes. World-generation parity matched the accepted v0.7.5.5 generator JSON for 12 seed/start cases.
- Browser test: BLOCKED; current build and `about:blank` control each timed out in headless Chromium with empty stdout. Real browser localStorage and user-exported old save validation remain untested.
- Documentation: `docs/v0.7.6.1-biome-profile-reference.md`, `docs/v0.7.6.1-change-log.md`, `docs/v0.7.6.1-test-report.md`, `docs/v0.7.6.1-rollback.md`.
- Standalone build path: `dist/infinite-realms.html`; SHA-256: `ee4d38bb6a80a525f147a39580f1579f1eedb77b6f66a69f7a52dbb672e3230e`.

## v0.7.6.2 — Biome Resources and Gathering

- Built from the accepted v0.7.6.1 source; no prior standalone HTML builds or baseline assets were overwritten.
- Rollback standalone: `backups/InfiniteRealms_v0.7.6.1_backup.html`; SHA-256 `ee4d38bb6a80a525f147a39580f1579f1eedb77b6f66a69f7a52dbb672e3230e`.
- Changed canonical resource data: `js/data/world.js` (existing `IR_BIOMES` gathering pool entries only for resource outcomes, plus safe unavailable-biome behavior and legacy-cave profile resolution).
- Added integration module: `js/game/38-biome-resources-gathering-v0.7.6.2.js`; script included before the existing boot script.
- New tests: `tests/v0.7.6.2-biome-profile-system-regression.test.js` (21 checks) and `tests/v0.7.6.2-resource-safety-crafting.test.js` (15 checks). Two older test setups now choose valid sites for direct woodcutting calls; this is fixture alignment only.
- Test report: `docs/v0.7.6.2-test-report.md`; reference: `docs/v0.7.6.2-biome-resource-reference.md`; change log: `docs/v0.7.6.2-change-log.md`; rollback: `docs/v0.7.6.2-rollback.md`.
- Final test result: **181 PASS / 0 FAIL** across 16 test files. All JavaScript syntax checks and the standalone build passed. Generation and forage/scouting profile parity checks passed. Live-browser and real `localStorage` tests remain blocked; user-exported historical saves were unavailable.
- The patch does not introduce new item definitions, recipes, item weights, equipment records, racial affinity, environmental hazards, new map views, political simulation, or a save-schema-version increment.


## v0.7.6.6 — Biome and Racial Affinity Stabilization

- Source baseline: accepted v0.7.6.5 standalone `InfiniteRealms_v0.7.6.5.html` (SHA-256 `e072f3cdfb9698a52226db0411837909539afbab7a96e037c1387f2718b5d07d`); copied unchanged to `backups/InfiniteRealms_v0.7.6.5_accepted_baseline.html`.
- Added `js/game/42-biome-ecology-stabilization-v0.7.6.6.js`; no previous version module was edited.
- Confirmed defect fixed: invalid biome references could use the Woodland fallback for uncontrolled random encounters. New guard prevents this without rewriting saved references; settlement, scripted enemy, dungeon and spar paths are preserved.
- Test result: 20/20 suites, 281/281 automated assertions, 7/7 standalone smoke checks, 74 JS syntax checks passed.
- Live browser and real browser localStorage remain BLOCKED in this environment; real user-exported old saves were NOT TESTED. See `docs/v0.7.6.6-test-report.md`.
