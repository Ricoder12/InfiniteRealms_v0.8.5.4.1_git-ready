# Infinite Realms

A browser-based fantasy life simulation. Create a character, work, train, explore a
generated frontier, join the adventurer association, and form a party. No server,
no dependencies: it is plain HTML, CSS and JavaScript, and saves live in your browser.

Current source version: **0.8.6** (regional simulation candidate).

## Play

Open `index.html` in a browser.

To get a single standalone file (easy to share or host):

```
node build.js        # Node 14+, no packages needed
```

This writes `dist/infinite-realms.html`.

## Project layout

```
index.html     page shell; lists every script in load order
build.js       bundles everything into one HTML file
css/           stylesheets
js/data/       game data tables (races, items, enemies, world, config)
js/game/       game systems, numbered in load order (01 ... 78)
tests/         Node regression tests and Python/Chromium browser tests
docs/          change logs, test reports, design notes
```

Order matters: files in `js/game/` load in the order listed in `index.html`,
and later files can extend or override earlier ones.

## Running tests

Node tests (example):

```
node tests/v0.8.5.4.1-companion-spellcasting.test.js
node tests/v0.8.5.4-companion-equipment-skill-synergy.test.js
node tests/v0.8.5.2-role-combat.test.js
node tests/v0.8.5.3-healer-support.test.js
node tests/v0.8.6-regional-simulation.test.js
```

Browser tests under `tests/*.py` need Python with Playwright and Chromium.

## Versioning

Commit once per version and tag it, for example:

```
git tag v0.8.6
```

Use tags to go back to an older build instead of keeping copies of the game folder.

## History

Detailed release notes from earlier versions are kept in `docs/RELEASE-HISTORY.md`.
The v0.8.6 rules and implementation report is in `docs/v0.8.6-test-report.md`.
