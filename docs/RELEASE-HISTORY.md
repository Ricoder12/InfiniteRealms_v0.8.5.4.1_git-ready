# Infinite Realms v0.8.3.7 — Branch and Quest Board Redesign

**Release status: candidate; awaiting review.** This candidate starts from the verified v0.8.3.6 source tree and preserves its standalone, source archive, and working tree. The latest explicitly accepted rollback remains v0.8.3.4. Branch details are grouped, branch navigation identifies the player's branch or the branch at the current location, and contract/duty boards share a consistent quest-card presentation. Existing authoritative acceptance, completion, progression, reward, and persistence services remain responsible for game state.

**Validation:** see `docs/v0.8.3.7-test-report.md` for actual test, syntax, build, and package results. No browser interaction test or user-exported save file test is claimed.

---

# Infinite Realms v0.8.3.4 — Rank-Gated Guild Contracts and Completion

**Release status: candidate; not yet accepted.** This candidate starts from the explicitly accepted v0.8.3.3 source. It adds rank-gated guild contract acceptance, verified route/creature/market objectives, receptionist reporting, exact-once coin rewards, and idempotent contract-state migration. Contract completion awards no guild-duty credit and does not change rank.

**Approved contract configuration:** `route-survey` and `supply-ledger` accept ranks F–SSS; `monster-signs` accepts ranks E–SSS. Verified completion rewards are 20, 35, and 15 coins respectively. No contract-derived personal progression credit is awarded.

**Validation:** see `docs/v0.8.3.4-test-report.md` for actual regression, production-path, syntax, build, and standalone results. Browser interaction and user-exported saves were not tested unless the report says otherwise.

---

# Historical: Infinite Realms v0.8.3.3 — Guild Duty Lifecycle and Progression Tracking

**Release status: accepted by the user on 2026-10-19.** This release adds persistent character-owned adventurer duty records and credit, receptionist duty services, authoritative combat/herbalism/delivery events, daily category caps, 14 in-game day expiry, cancellation, idempotent save migration, and quarantine for invalid progression data. Rank remains personal and is never automatically advanced.

**Approved configuration:** templates are Goblin (`goblin`) ×3, Bitterleaf (`herb`) ×5 via herbalism, and Field Bandage (`bandage`) ×2 delivered at the issuing guild. Each completed duty awards 1 credit, capped at 2 credits per category per `character.daysLived`; duties beyond the cap remain complete and award no credit.

**Validation:** see `docs/v0.8.3.3-test-report.md` for the actual Node regression, production-path, syntax, build, and standalone results.

---

# Infinite Realms v0.7.8.8 — Save Compatibility and Regression

**Release status: built and regression-checked.** This release starts from the supplied v0.7.8.7 source archive, retains the accepted v0.7.8.7 standalone byte-for-byte as rollback, and uses the v0.7.7.9 accepted standalone as the pre-v0.7.8 comparison baseline. The only runtime change is the visible release version; stale regression title expectations were updated. No gameplay or save behavior changed.

**Validation:** 33/33 Node regression files passed; 3/3 standalone smoke suites passed (24 explicit checks plus 54 embedded script blocks inspected); 105/105 JavaScript syntax checks passed; standalone build passed. Browser integration and screenshots were not tested because the available browser blocks local-file navigation and disallows alternate routes. Python syntax checks were not tested because Python is unavailable. No user-exported save was supplied.

See `docs/v0.7.8.8-test-report.md`, `docs/v0.7.8.8-change-log.md`, `docs/v0.7.8.8-changed-files.txt`, `docs/v0.7.8.8-release-manifest.json`, and the per-check logs/checksums.

---

# Historical: Infinite Realms v0.7.8.7 — Map and Location Integration

**Release status: built and validated against the available v0.7.8.6 candidate.** The requested v0.7.8.6 starting artifact was present, but its earlier release report did not mark that build formally accepted. This release therefore records the exact baseline caveat and preserves the v0.7.8.6 candidate as a rollback rather than claiming an unverified acceptance status.

This release fixes deterministic political generation and connects the generated political/regional metadata to the existing World, Regional, and Local map views. Fresh seeded worlds receive a small deterministic set of political territories and valid capital references. Legacy saved worlds lacking political data receive conservative initialization without repartitioning their valid existing location assignments. The political map UI displays only information permitted by discovery state, distinguishes explicit unclaimed territory from unknown ownership, and does not draw unsupported political boundary geometry or add travel actions.

**Validation:** 33/33 Node regression test files passed; 90/90 assertions across five independently run Chromium suites passed; three standalone smoke suites passed (24 explicit checks plus 54 embedded script blocks inspected); 104/104 JavaScript syntax checks passed; 22/22 Python test scripts compiled; standalone build and source ZIP integrity passed. Five seeds each generated three validated polities, and repeated generation with the same seed reproduced the same political records and regional assignments. Browser save/load checks preserved political records and legacy geographic assignments.

**Scope exclusions:** No wars, conquest, diplomacy, faction screens, or dynamic political borders. Political boundaries are shown only where explicit boundary geometry exists; the current data model does not yet define real boundary polygons. No user-exported save was supplied. The v0.7.8.6 starting build was a candidate whose earlier report had unresolved regression/browser work, and this release does not retroactively label that build accepted.

## Main implementation files

- `js/game/55-world-political-generation-v0.7.8.6.js` — fixes fresh-world generation, deterministic subregion assignment, valid settlement capitals, and legacy-save initialization behavior.
- `js/game/56-political-map-integration-v0.7.8.7.js` — read-only political map and location detail rendering with discovery-safe facts.
- `css/political-map-v0.7.8.7.css` — scoped responsive political map styling.
- `tests/v0.7.8.7-political-map-integration.test.js` and `tests/v0.7.8.7-political-map-browser.py` — focused and Chromium integration coverage.

See `docs/v0.7.8.7-test-report.md`, `docs/v0.7.8.7-change-log.md`, `docs/v0.7.8.7-rollback.md`, and the per-suite logs for detailed evidence.

---

# Historical: Infinite Realms v0.7.8.3 — Regional Hierarchy

This accepted release adds hierarchical geographic subregion metadata while keeping the existing `world.region.sites[]` and `world.region.routes[]` as the authoritative physical-location and travel registries. Each subregion has a deterministic stable ID and parent reference; sites point to a region through `site.regionId`; region ownership and governance links (`ownerPolityId`, `governingPolityId`) remain separate from geography. The release contains no seeded political entities or faction/political gameplay.

**Historical validation record for v0.7.8.3:** The accepted regional-hierarchy release added nested region metadata and corrected the existing save-preparation behavior that could flatten valid non-primary `site.regionId` values. This historical source copy preserves the previous release notes and tests; use the top section of this README and the v0.7.8.5-specific reports for the current candidate. No political leadership or capital fields were part of v0.7.8.3.

## Historical v0.7.8.3 — Regional Hierarchy

- Keeps `world.region` as the primary geographic container and preserves its single canonical `sites[]` and `routes[]` registries. Nested regions are metadata-only `subregions[]` and never copy settlement, terrain, site, or route records.
- Assigns stable child region IDs through `irGeoRegionId(world.id, stableKey)`; each child has an explicit `parentRegionId`. `world.geography.regionIds` is a flattened reference index, not a second region registry.
- Each site uses `site.regionId`. Missing legacy references safely default to the primary region; an explicit unresolved reference is reported by the resolver/validator and is safely repaired by legacy save normalization with a compatibility notice.
- Region ownership and governance (`ownerPolityId`, `governingPolityId`) are separate nullable references to `world.polities[]`. Both null support unclaimed regions. Parent-child hierarchy never infers ownership or adjacency.
- Added `irGetGeographicRegions`, `irCreateGeographicRegionRecord`, `irAddGeographicSubregion`, `irResolveLocationRegion`, `irAssignLocationRegion`, `irEnsureRegionalHierarchy`, and `irValidateRegionalHierarchy`.
- The v0.7.5.5 save-preparation layer used to force every non-primary `site.regionId` to the root region. The v0.7.8.3 wrapper restores only region assignments that resolve uniquely in both the input and prepared region trees; malformed/dangling assignments retain the existing safe fallback.
- Validation: focused hierarchy 27/27; Node regression 30/30 files and 262/262 counted assertions; Chromium 68/68 across four current-release suites; standalone smoke 3/3; JavaScript syntax 99/99; Python syntax 15/15. Browser suites generated old saves from accepted v0.7.6.6/v0.7.7.7 builds and tested route/travel, save/load, and hierarchy persistence.
- Core implementation: `js/game/53-regional-hierarchy-v0.7.8.3.js`. For current v0.7.8.5 details, see `docs/v0.7.8.5-government-leadership-capitals-schema.md` and `docs/v0.7.8.5-test-report.md`.

---

# Infinite Realms v0.7.8.2 — Political Entity Foundation

This source project preserves the established relationship/reputation, geographic identity/hierarchy, biome ecology, map/travel, Character UI, save-compatibility, and final acceptance layers. v0.7.8.2 adds a minimal `world.polities[]` registry, stable IDs derived from a world ID plus a logical key, a record factory, and non-mutating validation of entity types and references. It does not seed political content, add region ownership, alter geographic records, or introduce political interactions.

**Historical release status:** v0.7.8.2 passed 17/17 focused Node political-entity tests, all 29 Node regression test files, 24/24 Chromium save/integration checks, 3/3 standalone smoke suites, and the recorded JavaScript/Python syntax checks. Saves generated by accepted v0.7.6.6 and v0.7.7.7 builds loaded in Chromium. The new optional registry defaults to an empty array on older saves; existing sites, routes, discovery, inventory/equipment, NPCs, relationships, reputation and progression were preserved in the tested scenarios. No formal save-schema migration or world regeneration was introduced. No user-exported player save was supplied. See `docs/v0.7.8.2-*` for schema, test, rollback, and checksum details.

## Historical v0.7.8.2 — Political Entity Foundation

- Added one separate political-identity registry, `world.polities[]`; the existing `world.countries[]` remains part of the geographic hierarchy and is not copied into the political registry.
- Supported entity types: `country`, `kingdom`, `empire`, `city-state`, and `tribal-territory`. The validator does not impose a type-based hierarchy.
- Stable polity IDs use `irPoliticalEntityId(world.id, stableKey)`, never display names, random values, or array positions.
- Optional `regionIds`, `capitalSiteGeoId`, `governingEntityId`, and `description` are checked when supplied. Geographic IDs must resolve to the existing primary region or an existing settlement; governing references must resolve to a unique polity, cannot self-reference, and cannot form cycles.
- Older/new worlds receive `polities: []` without generating political content or changing geographic/site/route records. Invalid existing polity records are reported, not silently rewritten or discarded.
- “Unclaimed” is not a political-entity type. Territorial status remains reserved for the later territory/ownership data layer; no regional ownership or status property is added in this foundation release.
- Key implementation: `js/game/52-political-entity-foundation-v0.7.8.2.js`. Tests: `tests/v0.7.8.2-political-entity-foundation.test.js` and `tests/v0.7.8.2-political-entity-browser.py`.
- Validation: focused political model 17/17, Node regression 29/29 files, Chromium compatibility/integration 24/24, standalone smoke 3/3, JavaScript syntax checks passed, Python syntax checks passed.
- See `docs/v0.7.8.2-political-entity-schema.md`, `docs/v0.7.8.2-test-report.md`, and `docs/v0.7.8.2-rollback.md`.

## Historical v0.7.7.8 — Save Compatibility and Integration

- No formal save-schema migration. Existing geographic/save normalizers remain authoritative; this release only supplies safe defaults for absent optional arrays/objects and initializes the existing `world.v0723` lead store before the first render.
- Preserves valid site IDs, geographic IDs, route IDs, arrays, character progress, discovered/visited sites, inventory/equipment, NPC and relationship data, reputation, and progression. No world regeneration or replacement of a valid current location.
- Resets transient World/Regional/Local selection when loading a different state. Rendering and switching map views are checked against serialized world state for unintended mutations.
- Key implementation: `js/game/50-save-compatibility-v0.7.7.8.js`. Node test: `tests/v0.7.7.8-save-compatibility.test.js`. Chromium compatibility test: `tests/v0.7.7.8-save-compatibility-browser.py`.
- Validation: 21/21 focused browser checks, 27/27 Node suites, 3/3 standalone smoke suites, 93/93 JavaScript syntax checks, and 10/10 Python test scripts compiled.
- Compatibility coverage uses saves generated through the accepted v0.7.6.6 and v0.7.7.7 game code, plus a deterministic extensive-exploration fixture. No user-exported save was available. No formal migration was added.
- See `docs/v0.7.7.8-test-report.md`, `docs/v0.7.7.8-migration-details.md`, `docs/v0.7.7.8-save-audit.md`, and `docs/v0.7.7.8-rollback.md`.

## Run it
Open `index.html` in a browser. To rebuild one standalone HTML file, run `node build.js` and use `dist/infinite-realms.html`.

## Layout
```
index.html          shell + <script> tags in load order
css/                base.css, world-map.css, ui-polish-v0.7.7.7.css
js/data/            game data tables and version/save config
js/game/            game layers plus isolated v0.7.3.1 through v0.7.3.6 patches
  27-npc-memory-reliability-v0.7.3.1.js
  28-witness-based-reputation-v0.7.3.2.js
  29-reputation-based-npc-reactions-v0.7.3.3.js
  30-positive-reputation-v0.7.3.4.js
  31-contextual-favors-information-v0.7.3.5.js
  32-feedback-antifarming-regression-v0.7.3.6.js
  33-stable-geographic-identifiers-v0.7.5.2.js
  34-geographic-hierarchy-connections-v0.7.5.3.js
  35-world-generation-integration-v0.7.5.4.js
  36-save-compatibility-regression-v0.7.5.5.js
  37-biome-profile-validation-v0.7.6.1.js
  38-biome-resources-gathering-v0.7.6.2.js
  43-shared-map-data-v0.7.7.1.js
  44-world-map-v0.7.7.2.js
  45-regional-map-v0.7.7.3.js
  46-local-map-v0.7.7.4.js
  47-travel-route-integration-v0.7.7.5.js
  48-character-status-v0.7.7.6.js
  49-unified-map-character-ui-v0.7.7.7.js
  50-save-compatibility-v0.7.7.8.js
  27-boot.js        remains last in the actual script load order
build.js            bundles source into dist/infinite-realms.html
docs/               patch reports and source notes
tests/              deterministic Node/browser regression and compatibility checks
backups/            untouched standalone baselines, including the accepted v0.7.7.1 rollback build
```

## Load order matters
Earlier version files wrap functions defined in prior layers. Keep the exact script order in `index.html`. The relationship/reputation layers must remain in their historical order, followed by shared map data (v0.7.7.1), world atlas (v0.7.7.2), regional discovery/route layer (v0.7.7.3), local illustrative scene (v0.7.7.4), and canonical travel integration (v0.7.7.5). Application boot remains last.

## v0.7.3.1 — NPC Memory Reliability
- Preserves NPC identity and relationship history using the existing `world.v06.registry` and `world.v06.changes` records.
- Merges/deduplicates memories, removes duplicate active NPC IDs, and migrates older save shapes without changing save schema 8.
- Run `node tests/v0.7.3.1-npc-memory-reliability.test.js`.
- See `docs/v0.7.3.1-test-report.md`.

## v0.7.3.2 — Witness-Based Reputation
- Keeps unwitnessed harm private in public reputation while retaining the victim's existing personal relationship/memory consequences.
- Persists IDs of NPCs who could witness the event under current location/schedule rules; re-checks the fatal moment in an NPC assault.
- Prevents the same incident's assault/report stage and murder-death resolution from replaying their reputation changes.
- Preserves the existing save schema (8) and combat handler chain. No new reputation meter, combat balance changes, or visible report UI was added.

Run the isolated patch tests with:
```
node tests/v0.7.3.2-witness-reputation.test.js
```

See `docs/v0.7.3.2-test-report.md` for executed test results, limitations, and rollback instructions. A passing isolated harness is not a substitute for a full browser playtest.

## v0.7.3.3 — Reputation-Based NPC Reactions
- Restricts reputation refusals to appropriate social interactions and bargaining, rather than hiding all NPC interactions and occupation services.
- Uses the current public reputation tiers and existing affinity/trust data. High reputation continues to improve talk and eligible bargain outcomes; personal harm memories suppress the reputation-based merchant bonus until a more direct reconciliation is recorded.
- Keeps merchants, blacksmiths, guards, hunters, scholars, innkeepers, farmers, and residents on their existing occupation paths.
- Adds finite, non-negative market-price guarding and preserves save schema 8.
- Run isolated checks with `node tests/v0.7.3.3-reputation-reactions.test.js`.


## v0.7.3.4 — Positive Reputation Sources
- Adds +1 public reputation for a completed paid work shift, with a 30-day cooldown.
- Routes existing farmer-work reputation through a shared ledger, preserving its +1 reward while limiting it to once per 7 days across farmers.
- Tracks successful community choices (returning lost property, helping a courier, completed supply/escort contracts, mediation, trail warnings, fair salvage sharing, safe curse removal, tool repair, and safe research assistance) with activity-specific cooldowns. Existing reputation-positive choices are normalized through the ledger instead of stacking their original direct update on top.
- A private hunt does not grant public reputation automatically. Selling an eligible hunting material to an existing hunter can grant +1 once per 14 days, because the sale is a real information/community-supply path; failed sales grant nothing.
- Preserves existing one-time bounty (+5), criminal-group (+3/+4), and bounded daily road-bandit reward paths. The reputation tracker is stored under `world.v0734`; save schema remains 8.
- Run isolated checks with `node tests/v0.7.3.4-positive-reputation.test.js`.

See `docs/v0.7.3.4-test-report.md` for executed tests, limitations, and independent rollback instructions.


## v0.7.3.5 — Contextual Favors and Information
- Reuses memories already attached to the relevant NPC. A qualifying helpful memory can improve one favor attempt; the same memory is not reused for repeated favor bonuses. A remembered broken promise or serious harm can reduce a favor score or block a favor when the NPC is an enemy / trust is negative.
- Personal grievance takes precedence over public standing for sensitive optional information. Guards can keep specific event details private, hunters can limit themselves to general trail signs, and scholars can stick to existing record titles when trust/history does not justify deeper detail. More detail can come only from already-recorded regional events, biome pools, or journal records.
- Innkeepers may withhold an optional rumor from a distrusted player; a relevant help memory can overcome a low-public-standing hurdle once. The existing rumor/map reveal path is preserved.
- Relevant prior cooperation can improve one targeted hunting lead by +1 quality, once for that memory/topic. It does not guarantee an encounter or change combat balance.
- Context-use markers are stored in `world.v0735`; existing NPC memories are read-only and save schema 8 is retained.
- Run isolated checks with `node tests/v0.7.3.5-contextual-favors-information.test.js`.

See `docs/v0.7.3.5-test-report.md` for executed results, remaining browser checks, and rollback instructions.


## v0.7.3.6 — Feedback, Anti-Farming, and Regression
- Consolidates relationship and public-reputation feedback using the actual final affinity/trust/reputation deltas, and keeps distinct public and personal consequences explicit.
- Caps lifetime affinity/trust gains by NPC and meaningful action type. Gifts can still use distinct item types, but each gift type only grants its relationship reward once per NPC.
- The same action/NPC callback is deduplicated for 450 ms. Persistent guard-disturbance reports cannot repeatedly pay the same public and personal reward.
- Re-saves the new reward ledger after it is updated, preserving limits if the player immediately closes the game. Valid old ledger records are not pruned, so old NPC caps cannot reset just because many other NPCs are encountered.
- Keeps existing pay, skill progression, items, discounts, combat rewards, and occupation handlers on their original paths. Save schema remains version 8.
- Run `node tests/v0.7.3.6-feedback-antifarming.test.js`.
- See `docs/v0.7.3.6-test-report.md` and `docs/v0.7.3.6-version-summary.md`.

## Regression suites
Run the six relationship/reputation suites with:
```
node tests/v0.7.3.1-npc-memory-reliability.test.js
node tests/v0.7.3.2-witness-reputation.test.js
node tests/v0.7.3.3-reputation-reactions.test.js
node tests/v0.7.3.4-positive-reputation.test.js
node tests/v0.7.3.5-contextual-favors-information.test.js
node tests/v0.7.3.6-feedback-antifarming.test.js
```

These are deterministic Node tests with mocked game callbacks. They are valuable logic checks, but do not replace the final normal-browser checklist. The current execution environment's Chromium timed out even on `about:blank`; live UI, fresh-game, and actual save/load tests remain untested.


## v0.7.5.4 — World Generation Integration
- New-world generation continues to use the existing seeded 7×7 site/route algorithm. Geographic IDs and hierarchy are added through the established v0.7.5.2/v0.7.5.3 layers; no new continent/country content is created.
- A structurally valid version-2 saved world is reused during normalization, preserving saved site records, route metadata, discovery state, and world extensions. Invalid or older saves keep the established fallback migration behavior.
- Test commands: `node tests/v0.7.5.4-world-generation-integration.test.js` and `node tests/v0.7.5.4-gameplay-integration.test.js`.
- The complete current test report is in `docs/v0.7.5.4-test-report.md`; 125 automated checks passed, 0 failed. Browser startup and real localStorage reload remain unverified because the available headless Chromium also times out on `about:blank`.

## v0.7.5.5 — Save Compatibility and Regression
- Adds a geographic integrity validator for biome IDs, settlement and point-of-interest indexes, global route endpoints, local travel-target identity, current/known/visited references, and NPC location references.
- Uses cautious compatibility repairs only where existing saved relationships uniquely identify the intended target. Ambiguous route/current-location references are not redirected to an arbitrary site; fallback normalization is explicitly marked in the saved world when necessary.
- Preserves unrecognized geographic-index extension fields across index rebuilds. Keeps sites, routes, journal, NPC state, relationship records, and character inventory/equipment on their existing source structures.
- Run `node tests/v0.7.5.5-save-compatibility-regression.test.js` and `node tests/v0.7.5.5-gameplay-regression.test.js`; the full report is `docs/v0.7.5.5-test-report.md`.
- All 145 automated checks currently pass. The live browser and real localStorage round trip remain blocked by the headless Chromium environment; user-exported old save files were not available for direct testing.


## v0.7.6.1 — Biome Data and Ecology Profiles

`IR_BIOMES` is the authoritative registry for the nine existing biome profiles. It now contains environmental condition tags, generalized habitat categories, weighted resource records for the existing forage/scout actions, the existing forage-chance modifier, and the legacy per-biome gathering pools/availability rules. The existing encounter pools remain authoritative for specific encounter IDs. No travel-speed modifier, racial affinity, environmental damage, new biome, or new map view is introduced. The v0.7.6.1 suite has 21 PASS / 0 FAIL; the available existing regression suites total 145 PASS. All 64 source/test JavaScript files and the standalone build pass. Chromium timed out on both the game and an `about:blank` control, so browser startup and real-browser save persistence are BLOCKED. See `docs/v0.7.6.1-biome-profile-reference.md`, `docs/v0.7.6.1-change-log.md`, `docs/v0.7.6.1-test-report.md`, and `docs/v0.7.6.1-rollback.md`.


## v0.7.6.2 — Biome Resources and Gathering

- Extends `IR_BIOMES` in `js/data/world.js` with biome-specific weighting for the existing mining, woodcutting, herbalism, and fishing pools. It uses only registered item IDs; no new items, recipes, equipment records, or inventory structures are added.
- The active gathering pool follows the exact current site biome. Valid failed attempts preserve the established time/energy cost and skill progress; an invalid site/biome or unavailable activity cannot award fallback loot or spend gathering time/energy.
- Existing forage/scout resource weights and forage-chance modifiers are unchanged. Existing crafting recipes, skill formulas, carry limits, racial talent effects, and all per-action costs stay on the original code paths.
- New module: `js/game/38-biome-resources-gathering-v0.7.6.2.js`.
- Test commands: `node tests/v0.7.6.2-biome-profile-system-regression.test.js` and `node tests/v0.7.6.2-resource-safety-crafting.test.js`.
- Final full run: 181 automated checks passed / 0 failed across 16 test files; syntax checks and standalone build passed. Normal-browser startup and real `localStorage` reload remain blocked by the available Chromium runtime; user-exported historical saves were not provided.
- Reference: `docs/v0.7.6.2-biome-resource-reference.md`; report: `docs/v0.7.6.2-test-report.md`; rollback: `docs/v0.7.6.2-rollback.md`.

Run all currently available test suites with:
```
for f in tests/*.test.js; do node "$f" || exit 1; done
find js tests -name '*.js' -print0 | xargs -0 -n1 node --check
node --check build.js
node build.js
```


## v0.7.6.6 — Biome and Racial Affinity Stabilization
- Adds a combined non-mutating integrity report for biome profiles, resources, hazards, affinity matrix, monster habitats, and geographic references.
- Fixes invalid saved biome references falling back into Woodland random encounters. Unknown biome data remains unchanged; uncontrolled encounters pause until the reference is repaired. Recognized legacy labels, settlement rules, explicit scripted fights, dungeon bosses, and controlled spar remain available.
- Does not change world generation, race data, affinity values, hazard values, enemy statistics, rewards, or save schema.
- Run `node tests/v0.7.6.6-biome-ecology-stabilization.test.js` and `node tests/v0.7.6.6-standalone-smoke.js`.
- See `docs/v0.7.6.6-test-report.md`, `docs/v0.7.6.6-biome-resource-integrity.md`, `docs/v0.7.6.6-racial-affinity-validation.md`, and `docs/v0.7.6.6-rollback.md`.


## v0.7.7.1 — Map Architecture and Shared Data (preparation only)

- Audited the accepted v0.7.6.6 geography and biome ecology source.
- Added read-only shared map-data accessors; no map view, travel behavior, save schema, or world-generation behavior changed.
- Run `node tests/v0.7.7.1-shared-map-data.test.js` and `node tests/v0.7.7.1-standalone-smoke.js`.
- Read `docs/v0.7.7.1-map-architecture-audit.md`, `docs/v0.7.7.1-change-log.md`, `docs/v0.7.7.1-test-report.md`, and `docs/v0.7.7.1-rollback.md`.
- Known prerequisite: the current generator has one region, no populated continents/countries, and only regional layout coordinates. Do not fabricate world-scale or local-settlement geometry.


## v0.7.7.2 — World Map (accepted baseline)

- Adds an interactive fantasy-atlas index and regional terrain chart using existing region, site, biome, stable geography IDs, and route relationships.
- The world layer opens the actual populated region; the generator has no populated continent/country records or genuine world-scale coordinates, so this release does not invent continents or political borders.
- Map scope and selected location are transient UI state. Selecting a place inspects it; travel goes through the existing travel preview.
- Accepted release baseline: `backups/InfiniteRealms_v0.7.7.2_accepted_baseline.html`.
- Original 0.7.7.2 reports remain in `docs/v0.7.7.2-*` where provided. The current atlas and regional-layer regression tests are kept together in the v0.7.7.3 suites listed below.

## v0.7.7.3 — Regional Map

- Replaces the regional renderer used by the v0.7.7.2 atlas with a discovery-aware chart driven by actual site coordinates, biome IDs, stable geographic IDs, canonical region edges, and matching local travel-route records.
- Ordinary undirected edges require reciprocal endpoint route records; explicitly directed edges need their recorded forward route. Incomplete or mismatched links are omitted. A location is only ring-highlighted as directly reachable when the same verified edge supports the travel action.
- Terrain patches are illustrative biome classifications, not surveyed boundaries. Straight connector lines are explicitly schematic. Unsupported rivers, coasts, mountain-range polygons, crossings, roads/path traces, and political borders are not drawn or inferred.
- Inspection does not start travel. Travel actions delegate to the existing route preview and existing travel-duration/danger systems; no travel formula, world-generation rule, biome effect, discovery reward, or save-schema field was changed.
- Unknown location names, IDs, coordinates, settlement types, route exits, and details are filtered from the respective map/detail markup unless exploration or the existing intelligence marker allows the information. Current position remains identifiable even where the underlying site has not been marked visited; details stay concealed in that case.
- Adds a local detail view as a service-and-known-exit panel for the actual current site. The project has no local street/building geometry, so this is intentionally not represented as a fabricated spatial local map.
- Atlas, regional, and local UI navigation retains a valid selected `geoId` in transient state, falls back safely when a selection becomes unavailable, and does not write map state into the saved world.
- No new locations, continents, countries, settlements, roads, or map-data records were generated.

### v0.7.7.3 checks

```sh
node tests/v0.7.7.3-world-map.test.js
node tests/v0.7.7.3-regional-map.test.js
node tests/v0.7.7.3-standalone-smoke.js
python3 tests/v0.7.7.3-browser-smoke.py
find js tests -name '*.js' -print0 | xargs -0 -n1 node --check
node --check build.js
node build.js
```

Read `docs/v0.7.7.3-regional-map-audit.md`, `docs/v0.7.7.3-change-log.md`, `docs/v0.7.7.3-test-report.md`, `docs/v0.7.7.3-rollback.md`, and the Node/browser/release-check logs. Screenshots are in `docs/screenshots/`.


## v0.7.7.4 — Local Map

- Adds a biome-themed illustrative site scene in the existing local-detail panel. Settlement layout scale responds to the recorded settlement type; wilderness scenes use the recorded biome profile where the location is known.
- Only known entries in the current site's saved `services` list can create interactive facility markers. Known service aliases collapse to one canonical visual facility; unsupported IDs are not converted into invented businesses. Buttons delegate to established action handlers or existing tabs.
- Ordinary homes, paths, gathering greens, rocks, trees, and other scenery are non-interactive and labelled as illustrative. The player marker identifies the current site without pretending the game tracks a precise tile position.
- Existing site-bound NPC records may add worker references. The map does not generate NPCs, alter schedules/occupations, create interiors, or add services. Existing recorded points of interest use the Adventure view already in the game.
- Unsurveyed sites receive neutral generic terrain and no identifying site/biome/service content. Until the current site is surveyed, route cards keep real exits/travel buttons but suppress biome-specific descriptions/icons for unvisited destinations to avoid inferring the hidden current-site biome.
- No save-schema fields, travel formulas, danger formulas, encounter/exploration rewards, or movement rules are changed. Exact local building/street coordinates, surveyed roads, crossings, and interiors are not part of the current data model; the local scene is a schematic information view, not a walkable tactical map.

### v0.7.7.4 checks

```sh
node tests/v0.7.7.4-local-map.test.js
python3 tests/v0.7.7.4-browser-smoke.py
for f in tests/*.test.js; do node "$f" || exit 1; done
find js tests -name '*.js' -print0 | xargs -0 -n1 node --check
node --check build.js
node build.js
```

Final result: 24/24 Node regression suites passed; the focused local-map suite reports 16/16; the Chromium browser suite reports 14/14; 86 JavaScript files passed syntax checks. Historical baseline smoke checks remained available, with the integrated current standalone smoke reporting 9/9. The browser harness uses deterministic generated data and an in-memory storage shim; user-exported real saves were not independently tested. Reports, screenshots, and logs are in `docs/v0.7.7.4-*` and `docs/screenshots/`.


## v0.7.7.5 — Travel and Route Integration

- Treats `world.region.routes` as the authoritative geographic graph for direct route resolution, regional-map connection visibility, local exit lists, and multi-leg path planning. Existing `site.routes[]` rows remain in saves as compatibility data but must corroborate endpoint, distance, terrain, and transportation metadata.
- Ambiguous duplicate edges, missing canonical connections, invalid endpoint IDs, conflicting mirror records, and unavailable transport flags fail closed. Undirected routes require consistent records at both endpoints; a record explicitly marked directed cannot be travelled backwards.
- Direct trips retain the accepted v0.7.7.4 transport rules and event implementation. Multi-leg trips follow a verified path one leg at a time and revalidate the next edge immediately before each leg. A later failed/under-resourced leg costs nothing; a completed leg remains committed if an event or resource shortage pauses the journey.
- Estimates continue using gameplay `distanceKm`, not screen coordinates. Existing travel-day rates remain foot 20 km/day, mount 42 km/day, caravan 30 km/day, boat 34 km/day (rounded up, minimum one day). Base energy remains `max(4, ceil(days * 3 + (foot ? 2 : 0)))`; existing fare/transport requirements are unchanged.
- Route terrain remains descriptive because the current records do not define a validated travel-speed modifier. Risk remains the existing location-level risk model plus transport multiplier; there is no route-specific danger data. An exact risk estimate is shown only when the relevant locations are surveyed. Unsurveyed destinations and waypoints use generic labels and unknown risk/terrain.
- Existing environmental hazards can add energy/health strain when day progression reaches their saved cadence. Travel previews identify the base energy estimate and keep relevant current-site hazard warnings; these existing effects are not converted into invented route terrain modifiers.
- No new route registry, route geometry, locations, transportation type, survival mechanic, or save-schema field was added.

### v0.7.7.5 checks

```sh
node tests/v0.7.7.5-travel-route-integration.test.js
python3 tests/v0.7.7.5-browser-smoke.py
node tests/v0.7.7.3-standalone-smoke.js
for f in tests/*.test.js; do node "$f" || exit 1; done
find js tests -name '*.js' -print0 | xargs -0 -n1 node --check
node --check build.js
node build.js
```

The current run covers direct travel, two-or-more-leg travel, no-path failures, graph/mirror corruption, directed routes, estimates, location-level danger, environmental hazard compatibility, triggered encounter interruption, resource interruption, direct rollback, and save-slot reload. Browser tests use deterministic generated data and an in-memory localStorage shim; they do not replace testing a real user-exported save. Reports, logs, and screenshots are in `docs/v0.7.7.5-*` and `docs/screenshots/`.


## v0.7.7.6 — Character Status Window (review build)

- Character identity, current condition, existing attributes, equipment, and a skills area are now rendered in the Character tab.
- No save schema migration or new character creation fields were added.
- **Not accepted:** five focused browser checks fail. The current site name is not resolved, skills are not yet compact, the Skills shortcut targets Life, and runtime version branding remains v0.7.7.5.
- Run `python tests/v0.7.7.6-character-status-browser-smoke.py` for the focused Chromium checks. See `docs/v0.7.7.6-test-report.md` for results and limitations.


## v0.7.7.7 — Unified Map and Character UI Polish

- Reuses one labelled, keyboard-accessible World/Regional/Local switcher on all three map views. The active view is exposed via ARIA state and the existing transient map-scope value; switching layers does not change location, travel time, or save data.
- Standardizes the map-layer panel, selected/current marker rings, selected connection lines, travel estimates, disabled controls, focus-visible indicators, and native tooltips. Map legends clarify that map lines are recorded graph connections, not surveyed road geometry.
- Applies a scoped fantasy atlas palette (forest ink, parchment, and muted gold) to the new controls, existing map cards, route estimate panels, and Character Status addendum. Character health/energy values use consistent meter labels, tabular numbers, and explanatory tooltips.
- Responsive layout was checked at a 390px viewport. Existing Life, Adventure, People, Journal, Skills, and Inventory navigation remains intact. No framework/dependency, attribute, travel formula, save field, or game mechanic was added.
- Focused/compatibility validation: UI browser suite 22/22; Character browser regression 15/15; travel regression 10/10; regional-map regression 17/17; local-map regression 14/14; Node regression 26/26; standalone smoke 3/3; JavaScript syntax 91/91. All browser suites recorded zero uncaught browser errors.

Run `node build.js` to rebuild `dist/infinite-realms.html`. See `docs/v0.7.7.7-test-report.md` and `docs/v0.7.7.7-change-log.md` for details.

---

# Infinite Realms v0.7.7.9 — Final Regression and Acceptance

**Status:** Automated regression acceptance passed for the tested build and fixture set. This version is the candidate accepted baseline for future roadmap work. No v0.7.8 implementation has been started.

## Release artifacts

- Standalone: `dist/infinite-realms.html`
- Accepted baseline: `backups/InfiniteRealms_v0.7.7.9_accepted_baseline.html`
- Rollback: `backups/InfiniteRealms_v0.7.7.8_accepted_baseline.html`
- Pre-v0.7.7 comparison: `backups/InfiniteRealms_v0.7.6.6_accepted_baseline.html`

## Acceptance results

- Node regression files: 28/28 passed.
- Chromium browser suites: 10 suites, 155/155 assertions passed.
- Historical standalone smoke: 3/3 suites passed.
- JavaScript syntax: 94/94 files passed; `build.js` passed.
- Python browser test syntax: 10/10 passed.
- No final test suite reported a failing assertion or uncaught browser error.

Production delta is limited to release branding in `index.html` and new `js/game/51-final-acceptance-v0.7.7.9.js`. Test harnesses were adjusted for v0.7.7.9 version metadata and current map controls. No gameplay balancing, world-generation, map, travel, save schema, Character stat, NPC, or crafting changes were introduced in this acceptance build.

**Limitations:** no real user-exported save was provided; compatibility tests used saves generated by accepted older builds and a deterministic extensive-exploration fixture. The current world data also lacks true world-scale coordinates/continent geometry, so the World view remains an atlas/index rather than fabricating geography. See `docs/v0.7.7.9-final-test-report.md`, `docs/v0.7.7.9-test-limitations.md`, and `docs/v0.7.7.9-final-browser-rerun-summary.txt` for evidence.
