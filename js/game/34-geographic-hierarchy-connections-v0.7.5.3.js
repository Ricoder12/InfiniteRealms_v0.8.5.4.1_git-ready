'use strict';
// Infinite Realms v0.7.5.3 — geographic relationships and connection integrity.
// Additive reference model: existing region.sites and region.routes remain authoritative.

function irGeoIndexById(items) {
  const index = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id) continue;
    if (!index.has(item.id)) index.set(item.id, []);
    index.get(item.id).push(item);
  }
  return index;
}
function irEnsureGeographicHierarchy(world) {
  if (!world || typeof world !== 'object' || !world.region || typeof world.region !== 'object') return world;
  // v0.7.5.2 owns stable IDs; never derive new IDs from names or array positions here.
  if (typeof irEnsureGeographicIds === 'function') irEnsureGeographicIds(world);
  const region = world.region;
  if (!Array.isArray(world.continents)) world.continents = [];
  if (!Array.isArray(world.countries)) world.countries = [];
  if (!region.continentId) region.continentId = null;
  if (!region.countryId) region.countryId = null;
  const sites = Array.isArray(region.sites) ? region.sites : [];
  const routes = Array.isArray(region.routes) ? region.routes : [];
  const regionId = region.id;
  for (const site of sites) {
    if (!site || typeof site !== 'object') continue;
    if (!site.regionId) site.regionId = regionId;
    if (!Object.prototype.hasOwnProperty.call(site, 'continentId')) site.continentId = region.continentId || null;
    if (!Object.prototype.hasOwnProperty.call(site, 'countryId')) site.countryId = region.countryId || null;
    // The site record remains the sole authority for its name, biome and coordinates.
    if (site.type === 'settlement' && !site.settlementId) site.settlementId = `settlement:${site.geoId}`;
    if (site.type === 'landmark' && !site.pointOfInterestId) site.pointOfInterestId = `poi:${site.geoId}`;
  }
  const byGeo = irGeoIndexById(sites.map(s => s && ({ id: s.geoId, site: s })).filter(Boolean));
  const byLegacy = irGeoIndexById(sites.map(s => s && ({ id: s.id, site: s })).filter(Boolean));
  for (const edge of routes) {
    if (!edge || typeof edge !== 'object') continue;
    // Existing generated connections are undirected. Preserve any future explicit direction.
    if (typeof edge.directed !== 'boolean') edge.directed = false;
    if (edge.fromGeoId && edge.toGeoId && !edge.geoId) {
      const from = byGeo.get(edge.fromGeoId) || [], to = byGeo.get(edge.toGeoId) || [];
      if (from.length === 1 && to.length === 1 && from[0].site?.id && to[0].site?.id && typeof irGeoRouteId === 'function') {
        edge.geoId = irGeoRouteId(world.id, from[0].site.id, to[0].site.id);
      }
    }
  }
  // Reference-only indexes: never duplicate names, biome labels, coordinates, or route data.
  const settlementRefs = sites.filter(s => s?.type === 'settlement' && s.settlementId).map(s => ({ id: s.settlementId, siteGeoId: s.geoId }));
  const poiRefs = sites.filter(s => s?.type === 'landmark' && s.pointOfInterestId).map(s => ({ id: s.pointOfInterestId, siteGeoId: s.geoId }));
  const biomeIds = [...new Set(sites.map(s => s?.biomeId).filter(id => typeof id === 'string' && id))].sort();
  const connectionRefs = routes.filter(r => r?.geoId).map(r => ({ id: r.geoId }));
  world.geography = {
    schemaVersion: 1,
    // Reserved entity collections are empty until real content is introduced in a later version.
    continentIds: world.continents.filter(x => x && typeof x.id === 'string').map(x => x.id),
    countryIds: world.countries.filter(x => x && typeof x.id === 'string').map(x => x.id),
    regionIds: regionId ? [regionId] : [],
    biomeIds,
    settlementRefs,
    pointOfInterestRefs: poiRefs,
    connectionRefs
  };
  world.geographicHierarchyVersion = 1;
  return world;
}

function irValidateGeographicHierarchy(world) {
  const errors = [], warnings = [];
  if (!world || typeof world !== 'object') return { ok: false, errors: ['Missing world object'], warnings };
  if (!world.region || typeof world.region !== 'object') return { ok: false, errors: ['Missing primary region'], warnings };
  const region = world.region;
  const sites = Array.isArray(region.sites) ? region.sites : [];
  const edges = Array.isArray(region.routes) ? region.routes : [];
  const continents = Array.isArray(world.continents) ? world.continents : [];
  const countries = Array.isArray(world.countries) ? world.countries : [];
  const continentIndex = irGeoIndexById(continents), countryIndex = irGeoIndexById(countries);
  const regionIndex = irGeoIndexById([region]);
  const siteGeoIndex = irGeoIndexById(sites.map(s => s && ({ id: s.geoId, site: s })).filter(Boolean));
  const siteLegacyIndex = irGeoIndexById(sites.map(s => s && ({ id: s.id, site: s })).filter(Boolean));
  const routeIndex = irGeoIndexById(edges);
  continents.forEach((record, index) => {
    if (!record || typeof record.id !== 'string' || !record.id.trim()) errors.push(`Continent record ${index} is missing its stable id`);
  });
  countries.forEach((record, index) => {
    if (!record || typeof record.id !== 'string' || !record.id.trim()) errors.push(`Country record ${index} is missing its stable id`);
  });
  for (const [id, list] of continentIndex) if (list.length > 1) errors.push(`Duplicate continent id: ${id}`);
  for (const [id, list] of countryIndex) if (list.length > 1) errors.push(`Duplicate country id: ${id}`);
  for (const [id, list] of siteGeoIndex) if (list.length > 1) errors.push(`Duplicate site geoId: ${id}`);
  for (const [id, list] of siteLegacyIndex) if (list.length > 1) errors.push(`Duplicate legacy site id: ${id}`);
  for (const [id, list] of routeIndex) if (list.length > 1) errors.push(`Duplicate connection id: ${id}`);
  if (!region.id) errors.push('Primary region is missing id');
  if (region.continentId && (continentIndex.get(region.continentId) || []).length !== 1) errors.push(`Region has unresolved continentId ${region.continentId}`);
  if (region.countryId && (countryIndex.get(region.countryId) || []).length !== 1) errors.push(`Region has unresolved countryId ${region.countryId}`);
  for (const country of countries) {
    if (country?.continentId && (continentIndex.get(country.continentId) || []).length !== 1) errors.push(`Country ${country.id || '(unknown)'} has unresolved continentId ${country.continentId}`);
  }
  for (const site of sites) {
    if (!site || typeof site !== 'object') { errors.push('Invalid site record'); continue; }
    if (!site.geoId) errors.push(`Site ${site.id || '(unknown)'} is missing geoId`);
    if (site.regionId !== region.id) errors.push(`Site ${site.id || site.geoId} has invalid regionId ${site.regionId}`);
    if (site.continentId && (continentIndex.get(site.continentId) || []).length !== 1) errors.push(`Site ${site.id} has unresolved continentId ${site.continentId}`);
    if (site.countryId && (countryIndex.get(site.countryId) || []).length !== 1) errors.push(`Site ${site.id} has unresolved countryId ${site.countryId}`);
    if (site.settlementId && site.type !== 'settlement') errors.push(`Non-settlement ${site.id} has settlementId`);
    if (site.pointOfInterestId && site.type !== 'landmark') errors.push(`Non-landmark ${site.id} has pointOfInterestId`);
    // Wilderness is intentionally allowed without settlement/POI parent.
  }
  const connectionPairs = new Map();
  for (const [i, edge] of edges.entries()) {
    if (!edge || typeof edge !== 'object') { errors.push(`Invalid connection at index ${i}`); continue; }
    let from = null, to = null;
    if (edge.fromGeoId || edge.toGeoId) {
      const aa = siteGeoIndex.get(edge.fromGeoId) || [], bb = siteGeoIndex.get(edge.toGeoId) || [];
      if (aa.length !== 1) errors.push(`Connection ${edge.geoId || i} has unresolved/ambiguous fromGeoId`); else from = aa[0].site;
      if (bb.length !== 1) errors.push(`Connection ${edge.geoId || i} has unresolved/ambiguous toGeoId`); else to = bb[0].site;
    } else {
      from = sites[edge.a] || null; to = sites[edge.b] || null;
      if (!from || !to) errors.push(`Connection ${edge.geoId || i} has invalid legacy endpoints`);
    }
    if (from && to && from === to) errors.push(`Connection ${edge.geoId || i} connects a site to itself`);
    if (from && to) {
      const a = from.geoId || from.id, b = to.geoId || to.id;
      const pair = edge.directed ? `${a}->${b}` : [a, b].sort().join('<->');
      if (connectionPairs.has(pair)) errors.push(`Duplicate connection endpoints: ${pair}`); else connectionPairs.set(pair, edge.geoId || i);
    }
  }
  for (const site of sites) {
    if (!site || !Array.isArray(site.routes)) continue;
    for (const route of site.routes) {
      if (!route || typeof route !== 'object') { errors.push(`Invalid local route on ${site.id}`); continue; }
      const target = siteLegacyIndex.get(route.to) || [];
      if (target.length !== 1) errors.push(`Local route on ${site.id} has unresolved/ambiguous target ${route.to}`);
      if (route.toGeoId && (siteGeoIndex.get(route.toGeoId) || []).length !== 1) errors.push(`Local route on ${site.id} has invalid toGeoId ${route.toGeoId}`);
    }
  }
  // Parent graph cycle detection for optional future continent/country/region relationships.
  const parentRecords = [...continents, ...countries, region, ...sites].filter(x => x && typeof x.id === 'string');
  const parentIndex = irGeoIndexById(parentRecords);
  const parentOf = entity => entity.parentId || (countries.includes(entity) ? entity.continentId : null) || (entity === region ? (region.countryId || region.continentId) : null) || (sites.includes(entity) ? entity.regionId : null) || null;
  for (const entity of parentRecords) {
    const seen = new Set([entity.id]); let cursor = entity; let steps = 0;
    while (cursor && parentOf(cursor) && steps++ <= parentRecords.length + 1) {
      const parentId = parentOf(cursor);
      if (seen.has(parentId)) { errors.push(`Circular geographic parent chain at ${entity.id}`); break; }
      seen.add(parentId);
      const next = parentIndex.get(parentId) || [];
      if (next.length !== 1) { errors.push(`Entity ${cursor.id} has unresolved/ambiguous parent reference ${parentId}`); break; }
      cursor = next[0];
    }
    if (steps > parentRecords.length + 1) errors.push(`Circular geographic parent chain at ${entity.id}`);
  }
  if (world.siteId && (siteLegacyIndex.get(world.siteId) || []).length !== 1) errors.push(`Current location ${world.siteId} does not resolve`);
  for (const field of ['known', 'visited']) {
    if (world[field] !== undefined && !Array.isArray(world[field])) errors.push(`World ${field} references must be an array`);
    for (const id of Array.isArray(world[field]) ? world[field] : []) if ((siteLegacyIndex.get(id) || []).length !== 1) errors.push(`Known/visited location ${id} does not resolve`);
  }
  if (world.journal !== undefined && (!world.journal || typeof world.journal !== 'object' || Array.isArray(world.journal))) {
    errors.push('World journal must be an object when present');
  } else if (world.journal) {
    for (const field of ['discoveries', 'rumors']) {
      if (world.journal[field] !== undefined && !Array.isArray(world.journal[field])) errors.push(`World journal ${field} must be an array when present`);
    }
    for (const entry of (Array.isArray(world.journal.discoveries) ? world.journal.discoveries : [])) if (entry?.siteId && (siteLegacyIndex.get(entry.siteId) || []).length !== 1) warnings.push(`Discovery ${entry.id || '(unknown)'} references missing site ${entry.siteId}`);
    for (const rumor of (Array.isArray(world.journal.rumors) ? world.journal.rumors : [])) if (rumor?.targetId && (siteLegacyIndex.get(rumor.targetId) || []).length !== 1) warnings.push(`Rumor ${rumor.id || '(unknown)'} references missing site ${rumor.targetId}`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

const ir0753GenerateBase = generateProceduralWorld;
generateProceduralWorld = function(seedInput, startCircumstance = 'settlement') {
  return irEnsureGeographicHierarchy(ir0753GenerateBase(seedInput, startCircumstance));
};

const ir0753NormalizeBase = normalizeSave;
normalizeSave = function(input) {
  const normalized = ir0753NormalizeBase(input);
  if (normalized?.world) {
    irEnsureGeographicHierarchy(normalized.world);
    const report = irValidateGeographicHierarchy(normalized.world);
    if (!report.ok && typeof console !== 'undefined' && console.warn) console.warn('[Infinite Realms] Geographic hierarchy validation:', report.errors);
  }
  return normalized;
};
