'use strict';
// Infinite Realms v0.7.5.4 — integrate generated worlds with the geographic schema.
// Existing generation and gameplay entities stay authoritative; valid saved v2 worlds are reused.

function ir0754NormalizedSeed(value) {
  return String(value || 'INFINITE-REALMS').trim().slice(0, 32) || 'INFINITE-REALMS';
}
function ir0754CloneJson(value) {
  if (typeof clone === 'function') {
    try { return clone(value); } catch (_) { /* fall through to JSON clone */ }
  }
  return JSON.parse(JSON.stringify(value));
}

// Gate save reuse on a coherent existing v2 world. Geographic IDs may be absent in older saves;
// numeric route endpoints and legacy site IDs remain supported and will be enriched after cloning.
function ir0754ReusableSavedWorld(save) {
  if (!save || typeof save !== 'object' || Number(save.version) < 2) return null;
  const world = save.world;
  const region = world?.region;
  if (!world || world.generationVersion !== 2 || !region || typeof region !== 'object' ||
      !Array.isArray(region.sites) || region.sites.length < 49 || !Array.isArray(region.routes)) return null;
  const seed = ir0754NormalizedSeed(world.seed);
  if (!world.seed || seed !== String(world.seed).trim().slice(0, 32)) return null;
  const sites = region.sites;
  const byLegacyId = new Map();
  for (const site of sites) {
    if (!site || typeof site !== 'object' || typeof site.id !== 'string' || !site.id || !Array.isArray(site.routes)) return null;
    if (byLegacyId.has(site.id)) return null;
    byLegacyId.set(site.id, site);
  }
  if (!byLegacyId.has(world.siteId)) return null;
  for (const id of [...(Array.isArray(world.known) ? world.known : []), ...(Array.isArray(world.visited) ? world.visited : [])]) {
    // Unknown references are safely filtered by the existing normalizer; they do not invalidate the map.
    if (typeof id !== 'string') return null;
  }
  const effectiveWorldId = world.id || (typeof irGeoWorldId === 'function' ? irGeoWorldId(seed) : `world-${seed}`);
  const geoIdToSite = new Map();
  for (const site of sites) {
    const geoId = site.geoId || (typeof irGeoSiteId === 'function' ? irGeoSiteId(effectiveWorldId, site.id) : `site:${effectiveWorldId}:${site.id}`);
    if (geoIdToSite.has(geoId)) return null;
    geoIdToSite.set(geoId, site);
  }
  const usedRouteIds = new Set(), usedPairs = new Set();
  for (const edge of region.routes) {
    if (!edge || typeof edge !== 'object') return null;
    let from = null, to = null;
    if (edge.fromGeoId || edge.toGeoId) {
      if (!edge.fromGeoId || !edge.toGeoId) return null;
      from = geoIdToSite.get(edge.fromGeoId) || null;
      to = geoIdToSite.get(edge.toGeoId) || null;
    } else {
      if (!Number.isInteger(edge.a) || !Number.isInteger(edge.b)) return null;
      from = sites[edge.a] || null;
      to = sites[edge.b] || null;
    }
    if (!from || !to || from === to) return null;
    if (edge.geoId) {
      if (usedRouteIds.has(edge.geoId)) return null;
      usedRouteIds.add(edge.geoId);
    }
    const a = from.geoId || (typeof irGeoSiteId === 'function' ? irGeoSiteId(effectiveWorldId, from.id) : from.id);
    const b = to.geoId || (typeof irGeoSiteId === 'function' ? irGeoSiteId(effectiveWorldId, to.id) : to.id);
    const pair = edge.directed === true ? `${a}->${b}` : [a, b].sort().join('<->');
    if (usedPairs.has(pair)) return null;
    usedPairs.add(pair);
  }
  for (const site of sites) {
    for (const route of site.routes) {
      if (!route || typeof route !== 'object' || typeof route.to !== 'string' || !byLegacyId.has(route.to)) return null;
    }
  }
  // Current geographic hierarchy pointers must be valid if a save already contains them.
  const continents = Array.isArray(world.continents) ? world.continents : [];
  const countries = Array.isArray(world.countries) ? world.countries : [];
  const uniqueEntityId = (arr, id) => arr.filter(x => x && x.id === id).length === 1;
  if (region.continentId && !uniqueEntityId(continents, region.continentId)) return null;
  if (region.countryId && !uniqueEntityId(countries, region.countryId)) return null;
  for (const country of countries) if (country?.continentId && !uniqueEntityId(continents, country.continentId)) return null;
  if (region.id) {
    for (const site of sites) if (site.regionId && site.regionId !== region.id) return null;
  }
  return { world, seed, startCircumstance: typeof irValidCircumstance === 'function' ? irValidCircumstance(world.startCircumstance) : (world.startCircumstance || 'settlement'), used: false };
}

function ir0754PrepareWorld(world, source = 'generated') {
  if (!world || typeof world !== 'object') return world;
  if (typeof irEnsureGeographicIds === 'function') irEnsureGeographicIds(world);
  if (typeof irEnsureGeographicHierarchy === 'function') irEnsureGeographicHierarchy(world);
  // Marker only; no parallel copies of locations, biomes, or connections are stored here.
  world.generationIntegrationVersion = 1;
  const idReport = typeof irValidateGeographicIds === 'function' ? irValidateGeographicIds(world) : { ok: true, errors: [] };
  const hierarchyReport = typeof irValidateGeographicHierarchy === 'function' ? irValidateGeographicHierarchy(world) : { ok: true, errors: [] };
  if ((!idReport.ok || !hierarchyReport.ok) && typeof console !== 'undefined' && console.warn) {
    console.warn(`[Infinite Realms] v0.7.5.4 ${source} geographic validation`, [...(idReport.errors || []), ...(hierarchyReport.errors || [])]);
  }
  return world;
}

const ir0754GenerateBase = generateProceduralWorld;
let ir0754PendingSavedWorld = null;
generateProceduralWorld = function(seedInput, startCircumstance = 'settlement') {
  const seed = ir0754NormalizedSeed(seedInput);
  const pending = ir0754PendingSavedWorld;
  // normalizeSave invokes the shared generator. Reuse the saved region when the incoming v2 world
  // passed structural checks; do not throw away saved names, routes, discovery flags, or world data.
  if (pending && !pending.used && pending.seed === seed && pending.startCircumstance === (typeof irValidCircumstance === 'function' ? irValidCircumstance(startCircumstance) : startCircumstance)) {
    pending.used = true;
    return ir0754PrepareWorld(ir0754CloneJson(pending.world), 'reused-save');
  }
  return ir0754PrepareWorld(ir0754GenerateBase(seedInput, startCircumstance), 'generated');
};

const ir0754NormalizeBase = normalizeSave;
normalizeSave = function(input) {
  const pending = ir0754ReusableSavedWorld(input);
  const previousPending = ir0754PendingSavedWorld;
  ir0754PendingSavedWorld = pending;
  let normalized;
  try {
    normalized = ir0754NormalizeBase(input);
  } finally {
    ir0754PendingSavedWorld = previousPending;
  }
  if (normalized?.world) ir0754PrepareWorld(normalized.world, pending?.used ? 'reused-save-normalization' : 'normalized-world');
  return normalized;
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.5.4';
