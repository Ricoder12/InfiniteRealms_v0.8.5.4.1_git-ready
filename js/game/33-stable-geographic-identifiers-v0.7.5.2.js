'use strict';
// Infinite Realms v0.7.5.2 — additive stable geographic identifiers.
// Legacy site IDs, route indexes, and gameplay fields remain intact for compatibility.

function irGeoEncode(value) {
  return Array.from(String(value ?? ''), ch => ch.codePointAt(0).toString(16)).join('-') || 'empty';
}
function irGeoWorldId(seed) {
  // Collision-free encoding of the normalized seed (maximum 32 Unicode code points).
  // This is intentionally independent of generated display names and array order.
  return `world-${irGeoEncode(String(seed || 'INFINITE-REALMS').trim().slice(0, 32) || 'INFINITE-REALMS')}`;
}
function irGeoSiteId(worldId, legacySiteId) {
  return `site:${worldId}:${String(legacySiteId)}`;
}
function irGeoRouteId(worldId, siteIdA, siteIdB) {
  const pair = [String(siteIdA), String(siteIdB)].sort();
  return `route:${worldId}:${pair[0]}:${pair[1]}`;
}
function irEnsureGeographicIds(world) {
  if (!world || typeof world !== 'object') return world;
  const seed = String(world.seed || 'INFINITE-REALMS').trim().slice(0, 32) || 'INFINITE-REALMS';
  if (!world.id) world.id = irGeoWorldId(seed);
  if (world.region && typeof world.region === 'object') {
    const region = world.region;
    if (!region.id) region.id = `region:${world.id}:primary`;
    const sites = Array.isArray(region.sites) ? region.sites : [];
    const byLegacyId = new Map();
    const byGeoId = new Map();
    for (const site of sites) {
      if (!site || typeof site !== 'object') continue;
      if (typeof site.id === 'string' && site.id) {
        if (!site.geoId) site.geoId = irGeoSiteId(world.id, site.id);
        if (!byLegacyId.has(site.id)) byLegacyId.set(site.id, []);
        byLegacyId.get(site.id).push(site);
        if (!byGeoId.has(site.geoId)) byGeoId.set(site.geoId, []);
        byGeoId.get(site.geoId).push(site);
      }
    }
    // Add stable endpoint references without removing legacy numeric a/b fields.
    for (const edge of (Array.isArray(region.routes) ? region.routes : [])) {
      if (!edge || typeof edge !== 'object') continue;
      let a = null, b = null;
      if (edge.fromGeoId && edge.toGeoId) {
        const aa = byGeoId.get(edge.fromGeoId) || [], bb = byGeoId.get(edge.toGeoId) || [];
        if (aa.length === 1 && bb.length === 1) { a = aa[0]; b = bb[0]; }
      } else if (Number.isInteger(edge.a) && Number.isInteger(edge.b)) {
        // Legacy indexes are used only to enrich old edges; the new ID is not based on them.
        a = sites[edge.a] || null;
        b = sites[edge.b] || null;
      }
      if (!a || !b || !a.id || !b.id || a === b) continue;
      if (!edge.geoId) edge.geoId = irGeoRouteId(world.id, a.id, b.id);
      if (!edge.fromGeoId) edge.fromGeoId = a.geoId;
      if (!edge.toGeoId) edge.toGeoId = b.geoId;
    }
    // Local routes remain compatible with legacy `to` (site.id), adding stable references.
    for (const site of sites) {
      if (!site || !Array.isArray(site.routes)) continue;
      for (const route of site.routes) {
        if (!route || typeof route !== 'object') continue;
        const targets = byLegacyId.get(route.to) || [];
        // Never choose arbitrarily if a malformed save contains duplicate legacy IDs.
        if (targets.length !== 1) continue;
        const target = targets[0];
        if (!route.toGeoId) route.toGeoId = target.geoId;
        if (!route.geoId && site.id !== target.id) route.geoId = irGeoRouteId(world.id, site.id, target.id);
      }
    }
  }
  world.geographicIdVersion = Math.max(1, Number(world.geographicIdVersion) || 1);
  return world;
}

// Non-destructive validation: reports errors; never removes, renames, or guesses entities.
function irValidateGeographicIds(world = (typeof state !== 'undefined' ? state?.world : null)) {
  const errors = [], warnings = [];
  if (!world || typeof world !== 'object') return { ok: false, errors: ['Missing world object'], warnings };
  if (typeof world.id !== 'string' || !world.id) errors.push('World is missing a stable id');
  if (!world.region || typeof world.region !== 'object') return { ok: false, errors: errors.concat('Missing region object'), warnings };
  const region = world.region;
  if (typeof region.id !== 'string' || !region.id) errors.push('Primary region is missing a stable id');
  const sites = Array.isArray(region.sites) ? region.sites : [];
  const geoIds = new Map(), legacyIds = new Map();
  for (const site of sites) {
    if (!site || typeof site !== 'object') { errors.push('Invalid site record'); continue; }
    if (typeof site.id !== 'string' || !site.id) errors.push('Site is missing legacy id');
    if (typeof site.geoId !== 'string' || !site.geoId) errors.push(`Site ${site.id || '(unknown)'} is missing geoId`);
    else { if (!geoIds.has(site.geoId)) geoIds.set(site.geoId, []); geoIds.get(site.geoId).push(site); }
    if (site.id) { if (!legacyIds.has(site.id)) legacyIds.set(site.id, []); legacyIds.get(site.id).push(site); }
  }
  for (const [id, list] of geoIds) if (list.length > 1) errors.push(`Duplicate site geoId: ${id}`);
  for (const [id, list] of legacyIds) if (list.length > 1) errors.push(`Ambiguous legacy site id: ${id}`);
  const byGeo = new Map(sites.filter(s => s && s.geoId).map(s => [s.geoId, s]));
  const byLegacy = new Map(sites.filter(s => s && s.id).map(s => [s.id, s]));
  const routeIds = new Set();
  for (const [i, edge] of (Array.isArray(region.routes) ? region.routes : []).entries()) {
    if (!edge || typeof edge !== 'object') { errors.push(`Invalid global route at index ${i}`); continue; }
    if (typeof edge.geoId !== 'string' || !edge.geoId) errors.push(`Global route ${i} is missing geoId`);
    else if (routeIds.has(edge.geoId)) errors.push(`Duplicate route geoId: ${edge.geoId}`); else routeIds.add(edge.geoId);
    if (edge.fromGeoId || edge.toGeoId) {
      if (!byGeo.has(edge.fromGeoId)) errors.push(`Global route ${edge.geoId || i} has invalid fromGeoId`);
      if (!byGeo.has(edge.toGeoId)) errors.push(`Global route ${edge.geoId || i} has invalid toGeoId`);
    } else if (!sites[edge.a] || !sites[edge.b]) errors.push(`Global route ${i} has invalid legacy index references`);
  }
  for (const site of sites) {
    if (!site || !Array.isArray(site.routes)) continue;
    for (const [i, route] of site.routes.entries()) {
      if (!route || typeof route !== 'object') { errors.push(`Invalid local route on ${site.id} at ${i}`); continue; }
      if (!byLegacy.has(route.to)) errors.push(`Local route on ${site.id} has unresolved legacy target ${route.to}`);
      else if ((legacyIds.get(route.to) || []).length !== 1) errors.push(`Local route on ${site.id} has ambiguous legacy target ${route.to}`);
      if (route.toGeoId && !byGeo.has(route.toGeoId)) errors.push(`Local route on ${site.id} has invalid toGeoId`);
      if (!route.geoId) warnings.push(`Local route on ${site.id} at ${i} has no route geoId`);
    }
  }
  if (!byLegacy.has(world.siteId)) errors.push(`Current location ${world.siteId} does not resolve`);
  for (const field of ['known', 'visited']) {
    if (world[field] !== undefined && !Array.isArray(world[field])) errors.push(`World ${field} references must be an array`);
    for (const id of Array.isArray(world[field]) ? world[field] : []) if (!byLegacy.has(id)) errors.push(`Known/visited location ${id} does not resolve`);
  }
  if (world.journal !== undefined && (!world.journal || typeof world.journal !== 'object' || Array.isArray(world.journal))) {
    errors.push('World journal must be an object when present');
  } else if (world.journal) {
    for (const field of ['discoveries', 'rumors']) {
      if (world.journal[field] !== undefined && !Array.isArray(world.journal[field])) errors.push(`World journal ${field} must be an array when present`);
    }
    for (const entry of (Array.isArray(world.journal.discoveries) ? world.journal.discoveries : [])) if (entry?.siteId && !byLegacy.has(entry.siteId)) warnings.push(`Discovery ${entry.id || '(unknown)'} references missing site ${entry.siteId}`);
    for (const rumor of (Array.isArray(world.journal.rumors) ? world.journal.rumors : [])) if (rumor?.targetId && !byLegacy.has(rumor.targetId)) warnings.push(`Rumor ${rumor.id || '(unknown)'} references missing site ${rumor.targetId}`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

// Stable endpoint resolution is used by map renderers while retaining old a/b indexes.
function irGeoResolveGlobalRoute(region, edge) {
  if (!region || !edge || !Array.isArray(region.sites)) return { from: null, to: null, resolved: false };
  if (edge.fromGeoId || edge.toGeoId) {
    const fromMatches = region.sites.filter(site => site?.geoId === edge.fromGeoId);
    const toMatches = region.sites.filter(site => site?.geoId === edge.toGeoId);
    if (fromMatches.length !== 1 || toMatches.length !== 1) return { from: null, to: null, resolved: false };
    return { from: fromMatches[0], to: toMatches[0], resolved: true };
  }
  const from = Number.isInteger(edge.a) ? region.sites[edge.a] : null;
  const to = Number.isInteger(edge.b) ? region.sites[edge.b] : null;
  return { from: from || null, to: to || null, resolved: !!(from && to) };
}

const ir0752GenerateBase = generateProceduralWorld;
generateProceduralWorld = function(seedInput, startCircumstance = 'settlement') {
  return irEnsureGeographicIds(ir0752GenerateBase(seedInput, startCircumstance));
};
const ir0752NormalizeBase = normalizeSave;
normalizeSave = function(input) {
  const normalized = ir0752NormalizeBase(input);
  irEnsureGeographicIds(normalized.world);
  const validation = irValidateGeographicIds(normalized.world);
  if (!validation.ok && typeof console !== 'undefined' && console.warn) {
    console.warn('[Infinite Realms] Geographic ID validation found unresolved references:', validation.errors);
  }
  return normalized;
};
