'use strict';
// Infinite Realms v0.7.5.5 — focused geographic save compatibility and regression guard.
// Existing site records, legacy site IDs, and local route.to fields remain authoritative.

function ir0755Clone(value) {
  try { return typeof clone === 'function' ? clone(value) : JSON.parse(JSON.stringify(value)); }
  catch (_) { return JSON.parse(JSON.stringify(value)); }
}
function ir0755MapBySiteId(sites) {
  const byId = new Map();
  for (const site of Array.isArray(sites) ? sites : []) {
    if (!site || typeof site.id !== 'string' || !site.id) continue;
    if (!byId.has(site.id)) byId.set(site.id, []);
    byId.get(site.id).push(site);
  }
  return byId;
}
function ir0755UniqueList(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(x => typeof x === 'string' && x))];
}
function ir0755AddNotice(list, notice) {
  if (notice && !list.includes(notice)) list.push(notice);
}

// Keep unknown geographic-index extension fields across the earlier module's index rebuild.
// Supported index keys are still regenerated from authoritative records each time.
const ir0755EnsureHierarchyBase = irEnsureGeographicHierarchy;
irEnsureGeographicHierarchy = function(world) {
  const before = world?.geography && typeof world.geography === 'object' ? { ...world.geography } : null;
  const result = ir0755EnsureHierarchyBase(world);
  if (result && before && result.geography && typeof result.geography === 'object') {
    result.geography = { ...before, ...result.geography };
  }
  return result;
};

function ir0755PrepareSaveInput(input) {
  let prepared;
  try { prepared = ir0755Clone(input || {}); }
  catch (_) { return { input, notices: [], unresolvedDiscoveries: [], unrecoverable: false, changed: false }; }
  const notices = [], unresolvedDiscoveries = [];
  const world = prepared?.world;
  if (!world || typeof world !== 'object' || Number(prepared.version) < 2 || world.generationVersion !== 2 || !world.region || !Array.isArray(world.region.sites)) {
    return { input: prepared, notices, unresolvedDiscoveries, unrecoverable: false, changed: false };
  }
  const sites = world.region.sites;
  const byLegacy = ir0755MapBySiteId(sites);
  const duplicateLegacyIds = [...byLegacy.entries()].filter(([, rows]) => rows.length !== 1).map(([id]) => id);
  if (duplicateLegacyIds.length) {
    ir0755AddNotice(notices, `The saved map contains duplicate or ambiguous legacy location IDs (${duplicateLegacyIds.slice(0, 4).join(', ')}). Those records were not guessed or merged; safe reuse may be unavailable. Keep the original backup until the map is reviewed.`);
    return { input: prepared, notices, unresolvedDiscoveries, unrecoverable: true, changed: false };
  }
  const changed = { value: false };
  const originalSiteIds = new Set(byLegacy.keys());
  const uniqueSavedSite = id => typeof id === 'string' && (byLegacy.get(id) || []).length === 1;

  // A broken current pointer can only be recovered from the saved travel history, never by
  // guessing from map order. The newest valid visited location is the fallback when available.
  if (!uniqueSavedSite(world.siteId)) {
    const previous = [...(Array.isArray(world.visited) ? world.visited : [])].reverse().find(uniqueSavedSite);
    if (previous) {
      world.siteId = previous;
      changed.value = true;
      ir0755AddNotice(notices, `The saved current-location reference was invalid. The game returned to the most recently recorded valid visited location (${previous}) rather than choosing an unrelated location.`);
    } else {
      ir0755AddNotice(notices, 'The saved current location could not be resolved and there is no valid visited location to restore. The map cannot be recovered safely; a seeded fallback may be required. Character progression will still be normalized, but keep the original backup for manual recovery.');
    }
  }

  for (const field of ['known', 'visited']) {
    if (!Array.isArray(world[field])) continue;
    const invalid = world[field].filter(id => !uniqueSavedSite(id));
    if (invalid.length) {
      ir0755AddNotice(notices, `The saved ${field} list contained ${invalid.length} unresolved location reference(s). Only references to existing saved locations can be retained; no replacement location was inferred.`);
    }
  }

  // Add missing world/site IDs first without letting the older helper infer an endpoint for a
  // partially populated global edge before its existing stable endpoint has been checked.
  const normalizedSeed = String(world.seed || 'INFINITE-REALMS').trim().slice(0, 32) || 'INFINITE-REALMS';
  if (!world.id && typeof irGeoWorldId === 'function') { world.id = irGeoWorldId(normalizedSeed); changed.value = true; }
  if (!world.region.id && world.id) { world.region.id = `region:${world.id}:primary`; changed.value = true; }
  for (const site of sites) {
    if (site && typeof site.id === 'string' && site.id && !site.geoId && typeof irGeoSiteId === 'function' && world.id) {
      site.geoId = irGeoSiteId(world.id, site.id); changed.value = true;
    }
  }
  for (const [i, edge] of (Array.isArray(world.region.routes) ? world.region.routes : []).entries()) {
    if (!edge || typeof edge !== 'object') continue;
    const hasFrom = !!edge.fromGeoId, hasTo = !!edge.toGeoId;
    if (hasFrom === hasTo) continue;
    const a = Number.isInteger(edge.a) ? sites[edge.a] : null;
    const b = Number.isInteger(edge.b) ? sites[edge.b] : null;
    const known = hasFrom ? edge.fromGeoId : edge.toGeoId;
    if (edge.directed !== true && a && b && a !== b && a.geoId && b.geoId && [a.geoId, b.geoId].includes(known)) {
      const counterpart = known === a.geoId ? b : a;
      if (hasFrom) edge.toGeoId = counterpart.geoId; else edge.fromGeoId = counterpart.geoId;
      changed.value = true;
      ir0755AddNotice(notices, `A missing endpoint on undirected connection ${edge.geoId || i} was filled only because its existing stable endpoint matched exactly one end of the saved legacy pair.`);
    } else if (edge.directed === true && a && b && a !== b && ((hasFrom && known === a.geoId) || (hasTo && known === b.geoId))) {
      if (hasFrom) edge.toGeoId = b.geoId; else edge.fromGeoId = a.geoId;
      changed.value = true;
      ir0755AddNotice(notices, `A missing endpoint on directed connection ${edge.geoId || i} was filled using its original from/to ordering.`);
    }
  }
  if (typeof irEnsureGeographicIds === 'function') {
    const beforeIdState = JSON.stringify({ id: world.id, region: world.region.id, sites: sites.map(s => [s?.id, s?.geoId]), routes: (world.region.routes || []).map(e => [e?.geoId, e?.fromGeoId, e?.toGeoId]) });
    irEnsureGeographicIds(world);
    if (JSON.stringify({ id: world.id, region: world.region.id, sites: sites.map(s => [s?.id, s?.geoId]), routes: (world.region.routes || []).map(e => [e?.geoId, e?.fromGeoId, e?.toGeoId]) }) !== beforeIdState) changed.value = true;
  }

  // A site is already contained in the primary region collection. Repair an absent or dangling
  // region pointer to that unambiguous parent; do not infer future country/continent ownership.
  if (world.region.id) {
    for (const site of sites) {
      if (site && site.regionId !== world.region.id) {
        const prior = site.regionId;
        site.regionId = world.region.id;
        changed.value = true;
        if (prior) ir0755AddNotice(notices, `Location ${site.id} had an unresolved region reference (${prior}); it was repaired to its containing primary region.`);
      }
    }
  }

  // Legacy site.routes[].to is still what the travel system uses. If that target uniquely resolves,
  // repair only the supplemental toGeoId; never replace route.to or guess between duplicate IDs.
  const refreshedByLegacy = ir0755MapBySiteId(sites);
  for (const site of sites) {
    if (!Array.isArray(site?.routes)) continue;
    for (const route of site.routes) {
      const targets = refreshedByLegacy.get(route?.to) || [];
      if (targets.length !== 1) continue;
      const target = targets[0];
      if (route.toGeoId !== target.geoId) {
        const hadRef = !!route.toGeoId;
        route.toGeoId = target.geoId;
        changed.value = true;
        if (hadRef) ir0755AddNotice(notices, `A stale stable destination reference on the local route from ${site.id} was repaired using its existing, uniquely resolved legacy destination (${target.id}).`);
      }
      if (!route.geoId && typeof irGeoRouteId === 'function' && site.id !== target.id) {
        route.geoId = irGeoRouteId(world.id, site.id, target.id);
        changed.value = true;
      }
    }
  }

  const routeSites = Array.isArray(world.region.routes) ? world.region.routes : [];
  for (const [i, edge] of routeSites.entries()) {
    if (!edge || typeof edge !== 'object') continue;
    const hasFrom = !!edge.fromGeoId, hasTo = !!edge.toGeoId;
    if (!hasFrom && !hasTo) continue; // The ID layer can safely enrich a purely legacy a/b edge.
    if (hasFrom && hasTo) {
      const from = sites.filter(s => s?.geoId === edge.fromGeoId);
      const to = sites.filter(s => s?.geoId === edge.toGeoId);
      if (from.length !== 1 || to.length !== 1) {
        ir0755AddNotice(notices, `Global connection ${edge.geoId || i} has an unresolved stable endpoint. It was not redirected using potentially stale numeric indexes.`);
      }
    } else {
      ir0755AddNotice(notices, `Global connection ${edge.geoId || i} has only one stable endpoint and no safe unambiguous repair; it was not assigned a guessed destination.`);
    }
  }

  // Retain the source IDs of broken journal references, so normalization never falsely relocates a
  // saved discovery to whichever place happens to be current after migration.
  const sourceDiscoveries = Array.isArray(world.journal?.discoveries) ? world.journal.discoveries : [];
  for (let i = 0; i < sourceDiscoveries.length; i++) {
    const entry = sourceDiscoveries[i];
    if (entry && typeof entry.siteId === 'string' && entry.siteId && !uniqueSavedSite(entry.siteId)) {
      unresolvedDiscoveries.push({ id: entry.id || null, index: i, unresolvedSiteId: entry.siteId });
      ir0755AddNotice(notices, `Journal discovery ${entry.id || `at index ${i}`} points to missing location ${entry.siteId}. Its content will be kept without falsely attaching it to another location.`);
    }
  }

  if (typeof irEnsureGeographicHierarchy === 'function') irEnsureGeographicHierarchy(world);
  return { input: prepared, notices, unresolvedDiscoveries, unrecoverable: false, changed: changed.value };
}

function ir0755ValidateGeographicIntegrity(world = (typeof state !== 'undefined' ? state?.world : null), character = (typeof state !== 'undefined' ? state?.character : null)) {
  const errors = [], warnings = [];
  if (!world || typeof world !== 'object') return { ok: false, errors: ['Missing world object'], warnings, checks: [] };
  const ids = typeof irValidateGeographicIds === 'function' ? irValidateGeographicIds(world) : { ok: true, errors: [], warnings: [] };
  const hierarchy = typeof irValidateGeographicHierarchy === 'function' ? irValidateGeographicHierarchy(world) : { ok: true, errors: [], warnings: [] };
  errors.push(...(ids.errors || []), ...(hierarchy.errors || []));
  warnings.push(...(ids.warnings || []), ...(hierarchy.warnings || []));
  const region = world.region || {}, sites = Array.isArray(region.sites) ? region.sites : [];
  const byLegacy = ir0755MapBySiteId(sites);
  const uniqueGeo = new Map();
  for (const site of sites) if (site?.geoId) uniqueGeo.set(site.geoId, (uniqueGeo.get(site.geoId) || 0) + 1);
  const siteByGeo = new Map(sites.filter(s => s?.geoId).map(s => [s.geoId, s]));
  for (const site of sites) {
    if (!site || typeof site !== 'object') continue;
    if (!site.biomeId || (typeof IR_BIOMES !== 'undefined' && !Object.prototype.hasOwnProperty.call(IR_BIOMES, site.biomeId))) {
      errors.push(`Location ${site.id || '(unknown)'} has an invalid biomeId ${String(site.biomeId ?? '(missing)')}`);
    }
    if (site.type === 'settlement' && !site.settlementId) errors.push(`Settlement ${site.id || '(unknown)'} is missing settlementId`);
    if (site.type !== 'settlement' && site.settlementId) errors.push(`Non-settlement ${site.id || '(unknown)'} has settlementId`);
    if (site.type === 'landmark' && !site.pointOfInterestId) errors.push(`Landmark ${site.id || '(unknown)'} is missing pointOfInterestId`);
    for (const [field, value] of [['homeSite', site.homeSite], ['workSite', site.workSite], ['restSite', site.restSite]]) {
      if (value && !byLegacy.has(value)) warnings.push(`Location record ${site.id || '(unknown)'} has unresolved ${field} ${value}`);
    }
  }
  const settlementIds = new Map(), poiIds = new Map();
  for (const site of sites) {
    if (site?.settlementId) settlementIds.set(site.settlementId, (settlementIds.get(site.settlementId) || 0) + 1);
    if (site?.pointOfInterestId) poiIds.set(site.pointOfInterestId, (poiIds.get(site.pointOfInterestId) || 0) + 1);
  }
  for (const [id, count] of settlementIds) if (count > 1) errors.push(`Duplicate settlementId ${id}`);
  for (const [id, count] of poiIds) if (count > 1) errors.push(`Duplicate pointOfInterestId ${id}`);

  const expectedSettlements = sites.filter(s => s?.type === 'settlement' && s.settlementId).map(s => `${s.settlementId}\u0000${s.geoId}`).sort();
  const expectedPois = sites.filter(s => s?.type === 'landmark' && s.pointOfInterestId).map(s => `${s.pointOfInterestId}\u0000${s.geoId}`).sort();
  const actualSettlements = (Array.isArray(world.geography?.settlementRefs) ? world.geography.settlementRefs : []).map(r => `${r?.id || ''}\u0000${r?.siteGeoId || ''}`).sort();
  const actualPois = (Array.isArray(world.geography?.pointOfInterestRefs) ? world.geography.pointOfInterestRefs : []).map(r => `${r?.id || ''}\u0000${r?.siteGeoId || ''}`).sort();
  if (JSON.stringify(expectedSettlements) !== JSON.stringify(actualSettlements)) errors.push('Settlement reference index does not exactly match authoritative settlement sites');
  if (JSON.stringify(expectedPois) !== JSON.stringify(actualPois)) errors.push('Point-of-interest reference index does not exactly match authoritative landmark sites');
  const expectedBiomes = [...new Set(sites.map(s => s?.biomeId).filter(Boolean))].sort();
  const actualBiomes = (Array.isArray(world.geography?.biomeIds) ? world.geography.biomeIds : []).slice().sort();
  if (JSON.stringify(expectedBiomes) !== JSON.stringify(actualBiomes)) errors.push('Biome reference index does not exactly match authoritative site biome IDs');

  // Stable endpoint identity and legacy travel destinations must identify the same actual site.
  for (const [i, edge] of (Array.isArray(region.routes) ? region.routes : []).entries()) {
    if (!edge || typeof edge !== 'object') continue;
    if (edge.fromGeoId && !siteByGeo.has(edge.fromGeoId)) errors.push(`Connection ${edge.geoId || i} has unresolved fromGeoId`);
    if (edge.toGeoId && !siteByGeo.has(edge.toGeoId)) errors.push(`Connection ${edge.geoId || i} has unresolved toGeoId`);
  }
  for (const site of sites) {
    for (const [i, route] of (Array.isArray(site?.routes) ? site.routes : []).entries()) {
      const targets = byLegacy.get(route?.to) || [];
      if (targets.length === 1 && route.toGeoId && route.toGeoId !== targets[0].geoId) errors.push(`Local route on ${site.id} at ${i} has a stable destination that disagrees with its authoritative legacy target ${route.to}`);
      else if (targets.length > 1) errors.push(`Local route on ${site.id} at ${i} has an ambiguous legacy target ${route.to}`);
    }
  }
  for (const field of ['known', 'visited']) {
    const list = Array.isArray(world[field]) ? world[field] : [];
    if (new Set(list).size !== list.length) warnings.push(`${field} contains duplicate location IDs`);
    for (const id of list) if (!byLegacy.has(id)) errors.push(`${field} contains unresolved location ${id}`);
  }
  if (!byLegacy.has(world.siteId)) errors.push(`Player current location ${world.siteId || '(missing)'} does not resolve`);
  for (const entry of Array.isArray(world.journal?.discoveries) ? world.journal.discoveries : []) {
    if (entry?.siteId && !byLegacy.has(entry.siteId)) warnings.push(`Journal discovery ${entry.id || '(unknown)'} retains unresolved source site ${entry.siteId}`);
  }
  for (const list of [character?.npcs, Object.values(world.v06?.registry || {}), Object.values(world.v06?.changes || {})]) {
    for (const npc of Array.isArray(list) ? list : Object.values(list || {})) {
      if (!npc || typeof npc !== 'object') continue;
      for (const field of ['homeSite', 'workSite', 'restSite', 'siteId', 'locationId']) {
        const value = npc[field];
        if (typeof value === 'string' && value && !byLegacy.has(value)) warnings.push(`NPC ${npc.id || npc.name || '(unknown)'} has unresolved ${field} ${value}`);
      }
    }
  }
  const compactErrors = [...new Set(errors)], compactWarnings = [...new Set(warnings)];
  const checks = [
    { name: 'world and region identity', status: world.id && region.id ? 'PASS' : 'FAIL' },
    { name: 'unique site identifiers', status: new Set(sites.map(s => s?.id)).size === sites.length && new Set(sites.map(s => s?.geoId)).size === sites.length ? 'PASS' : 'FAIL' },
    { name: 'biome references', status: sites.every(s => s?.biomeId && (typeof IR_BIOMES === 'undefined' || Object.prototype.hasOwnProperty.call(IR_BIOMES, s.biomeId))) ? 'PASS' : 'FAIL' },
    { name: 'settlement and POI indexes', status: JSON.stringify(expectedSettlements) === JSON.stringify(actualSettlements) && JSON.stringify(expectedPois) === JSON.stringify(actualPois) ? 'PASS' : 'FAIL' },
    { name: 'current location', status: byLegacy.has(world.siteId) ? 'PASS' : 'FAIL' },
    { name: 'routes and destinations', status: !compactErrors.some(e => /Connection|route|destination|Global route|Local route|Current location|does not resolve/.test(e)) ? 'PASS' : 'FAIL' }
  ];
  return { ok: compactErrors.length === 0, errors: compactErrors, warnings: compactWarnings, checks };
}

const ir0755NormalizeBase = normalizeSave;
normalizeSave = function(input) {
  const migration = ir0755PrepareSaveInput(input);
  // Match the exact v0.7.5.4 reuse gate before normalization, so recovery metadata is factual.
  const savedWorldReusable = typeof ir0754ReusableSavedWorld === 'function' ? !!ir0754ReusableSavedWorld(migration.input) : false;
  let normalized;
  try {
    normalized = ir0755NormalizeBase(migration.input);
  } catch (error) {
    throw error;
  }
  if (!normalized?.world) return normalized;
  if (typeof irEnsureGeographicIds === 'function') irEnsureGeographicIds(normalized.world);
  if (typeof irEnsureGeographicHierarchy === 'function') irEnsureGeographicHierarchy(normalized.world);

  // Undo the older normalizer's accidental reassignment of a broken discovery to the current site.
  const rawDiscoveryRows = migration.unresolvedDiscoveries || [];
  for (const raw of rawDiscoveryRows) {
    let entry = raw.id ? normalized.world.journal?.discoveries?.find(d => d?.id === raw.id) : null;
    if (!entry) entry = normalized.world.journal?.discoveries?.[raw.index];
    if (!entry) continue;
    entry.unresolvedSiteId = raw.unresolvedSiteId;
    delete entry.siteId;
  }

  const report = ir0755ValidateGeographicIntegrity(normalized.world, normalized.character);
  const newNotices = [...migration.notices];
  if (report.errors.length) ir0755AddNotice(newNotices, `Geographic integrity validation found ${report.errors.length} unresolved or inconsistent issue(s). They were reported rather than repaired by guessing: ${report.errors.slice(0, 4).join('; ')}.`);
  if (report.warnings.length && migration.changed) ir0755AddNotice(newNotices, `Geographic migration completed with ${report.warnings.length} warning(s). Review the integrity report before relying on the affected references.`);
  if (newNotices.length) {
    const prior = normalized.world.geographyCompatibility && typeof normalized.world.geographyCompatibility === 'object' ? normalized.world.geographyCompatibility : {};
    const notices = ir0755UniqueList([...(Array.isArray(prior.notices) ? prior.notices : []), ...newNotices]).slice(0, 50);
    normalized.world.geographyCompatibility = {
      ...prior,
      schemaVersion: 1,
      notices,
      recovery: savedWorldReusable ? 'saved-world-reused' : 'seeded-fallback-used',
      integrityErrors: report.errors.slice(0, 50),
      integrityWarnings: report.warnings.slice(0, 50)
    };
    const detail = newNotices.join(' ');
    normalized.feed = Array.isArray(normalized.feed) ? normalized.feed : [];
    if (!normalized.feed.some(f => f?.title === 'Geographic save compatibility notice' && f.detail === detail)) {
      normalized.feed.unshift({ icon: '⚠️', title: 'Geographic save compatibility notice', detail, date: 'SAVE MIGRATION', type: 'warning' });
      normalized.feed = normalized.feed.slice(0, 150);
    }
  }
  return normalized;
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.5.5';
