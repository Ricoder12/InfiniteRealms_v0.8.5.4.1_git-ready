'use strict';
// Infinite Realms v0.7.8.3 — regional hierarchy.
// world.region remains the canonical geographic/route container. Nested subregions are
// metadata-only geographic containers; they never copy sites, terrain, or route records.
// A location's regionId is geographic. ownerPolityId/governingPolityId are separate political refs.

function irGeoRegionId(worldId, stableKey) {
  const worldKey = String(worldId ?? '').trim();
  const logicalKey = String(stableKey ?? '').trim();
  if (!worldKey || !logicalKey) return null;
  const encoded = typeof irGeoEncode === 'function'
    ? irGeoEncode(logicalKey)
    : Array.from(logicalKey, ch => ch.codePointAt(0).toString(16)).join('-');
  return `region:${worldKey}:sub:${encoded || 'empty'}`;
}

function irRegionalHierarchyCollect(world) {
  const entries = [], issues = [], seenObjects = new Set();
  const root = world?.region && typeof world.region === 'object' ? world.region : null;
  if (!root) return { entries, issues: ['Missing primary region'], root: null };
  function visit(region, parent, depth) {
    if (!region || typeof region !== 'object' || Array.isArray(region)) {
      issues.push(`Invalid geographic region nested under ${parent?.id || '(world root)'}`);
      return;
    }
    if (seenObjects.has(region)) {
      issues.push(`Repeated or circular geographic region object encountered at ${region.id || '(unknown)'}`);
      return;
    }
    seenObjects.add(region);
    entries.push({ region, parent, depth });
    if (region.subregions === undefined || region.subregions === null) return;
    if (!Array.isArray(region.subregions)) {
      issues.push(`Region ${region.id || '(unknown)'} has invalid subregions container`);
      return;
    }
    for (const child of region.subregions) visit(child, region, depth + 1);
  }
  visit(root, null, 0);
  return { entries, issues, root };
}

function irGetGeographicRegions(world) {
  return irRegionalHierarchyCollect(world).entries.map(entry => entry.region);
}

function irRegionalRegionIndex(world) {
  const collected = irRegionalHierarchyCollect(world);
  const byId = new Map();
  for (const entry of collected.entries) {
    const id = entry.region?.id;
    if (typeof id !== 'string' || !id.trim()) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(entry.region);
  }
  return { ...collected, byId };
}

function irRegionalPoliticalIndex(world) {
  const byId = new Map();
  for (const polity of Array.isArray(world?.polities) ? world.polities : []) {
    if (typeof polity?.id !== 'string' || !polity.id.trim()) continue;
    if (!byId.has(polity.id)) byId.set(polity.id, []);
    byId.get(polity.id).push(polity);
  }
  return byId;
}

// Add missing optional hierarchy fields without guessing IDs or replacing unresolved references.
// Old saves without site.regionId are safely assigned to the existing primary region.
function irEnsureRegionalHierarchy(world) {
  if (!world || typeof world !== 'object' || !world.region || typeof world.region !== 'object') return world;
  const root = world.region;
  if (root.parentRegionId === undefined) root.parentRegionId = null;
  if (root.subregions === undefined || root.subregions === null) root.subregions = [];

  const collected = irRegionalHierarchyCollect(world);
  for (const entry of collected.entries) {
    const region = entry.region;
    if (region.subregions === undefined || region.subregions === null) region.subregions = [];
    if (entry.parent && (region.parentRegionId === undefined || region.parentRegionId === null || region.parentRegionId === '')) {
      region.parentRegionId = entry.parent.id;
    }
    if (region.continentId === undefined) region.continentId = null;
    if (region.countryId === undefined) region.countryId = null;
    if (region.ownerPolityId === undefined) region.ownerPolityId = null;
    if (region.governingPolityId === undefined) region.governingPolityId = null;
  }

  const sites = Array.isArray(root.sites) ? root.sites : [];
  for (const site of sites) {
    if (!site || typeof site !== 'object') continue;
    if (site.regionId === undefined || site.regionId === null || site.regionId === '') site.regionId = root.id;
  }

  // geography is a reference-only index. Keep any unrelated extension fields intact.
  if (!world.geography || typeof world.geography !== 'object' || Array.isArray(world.geography)) world.geography = {};
  const regionIds = [];
  const seenIds = new Set();
  for (const entry of irRegionalHierarchyCollect(world).entries) {
    const id = entry.region?.id;
    if (typeof id === 'string' && id.trim() && !seenIds.has(id)) {
      seenIds.add(id);
      regionIds.push(id);
    }
  }
  world.geography.regionIds = regionIds;
  world.regionalHierarchyVersion = Math.max(1, Number(world.regionalHierarchyVersion) || 1);
  return world;
}

// Construct a metadata-only subregion record. `id` is the stable geographic ID; do not use
// display names or array indexes as a fallback key. Insertion is explicit via irAddGeographicSubregion.
function irCreateGeographicRegionRecord(world, input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const explicitId = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : null;
  const id = explicitId || irGeoRegionId(world?.id, source.stableKey);
  if (!id) return null;
  const parentRegionId = source.parentRegionId !== undefined
    ? source.parentRegionId
    : (world?.region?.id || null);
  const record = {
    id,
    name: typeof source.name === 'string' ? source.name.trim() : '',
    parentRegionId,
    subregions: [],
    continentId: source.continentId ?? null,
    countryId: source.countryId ?? null,
    ownerPolityId: source.ownerPolityId ?? null,
    governingPolityId: source.governingPolityId ?? null
  };
  if (source.description !== undefined && source.description !== null) record.description = source.description;
  return record;
}

function irAddGeographicSubregion(world, parentRegionId, input = {}) {
  const index = irRegionalRegionIndex(world);
  const parentMatches = index.byId.get(parentRegionId) || [];
  if (parentMatches.length !== 1) return { ok: false, region: null, errors: [`Parent region ${String(parentRegionId)} does not resolve uniquely`] };
  const parent = parentMatches[0];
  if (parent.subregions === undefined || parent.subregions === null) parent.subregions = [];
  if (!Array.isArray(parent.subregions)) return { ok: false, region: null, errors: [`Parent region ${parent.id} has invalid subregions container`] };
  const record = irCreateGeographicRegionRecord(world, { ...input, parentRegionId: parent.id });
  if (!record || !record.name) return { ok: false, region: null, errors: ['A stable ID and non-empty region name are required'] };
  if (index.byId.has(record.id)) return { ok: false, region: null, errors: [`Duplicate geographic region ID ${record.id}`] };
  if (Object.prototype.hasOwnProperty.call(input || {}, 'sites') || Object.prototype.hasOwnProperty.call(input || {}, 'routes')) {
    return { ok: false, region: null, errors: ['Subregions cannot contain duplicate sites or route records; use location regionId references'] };
  }
  const beforeReport = irValidateRegionalHierarchy(world);
  const beforeErrorCounts = new Map();
  for (const error of beforeReport.errors) beforeErrorCounts.set(error, (beforeErrorCounts.get(error) || 0) + 1);
  parent.subregions.push(record);
  irEnsureRegionalHierarchy(world);
  const afterReport = irValidateRegionalHierarchy(world);
  const introducedErrors = [];
  for (const error of afterReport.errors) {
    const oldCount = beforeErrorCounts.get(error) || 0;
    if (oldCount > 0) beforeErrorCounts.set(error, oldCount - 1);
    else introducedErrors.push(error);
  }
  // Existing political/geographic problems elsewhere do not prevent adding a valid region.
  // This keeps hierarchy editing separate from political ownership and unrelated saved data.
  if (introducedErrors.length) {
    parent.subregions = parent.subregions.filter(region => region !== record);
    irEnsureRegionalHierarchy(world);
    return { ok: false, region: null, errors: introducedErrors };
  }
  return { ok: true, region: record, errors: [] };
}

// Resolve a location's geographic region without requiring a political owner or government.
// Missing legacy regionId defaults to the primary region; an explicit unresolved ID is an error.
function irResolveLocationRegion(world, locationRef) {
  const root = world?.region && typeof world.region === 'object' ? world.region : null;
  const sites = Array.isArray(root?.sites) ? root.sites : [];
  if (!root) return { ok: false, status: 'missing-world-region', site: null, region: null };
  let matches = [];
  if (typeof locationRef === 'string') {
    matches = sites.filter(site => site?.geoId === locationRef || site?.id === locationRef);
  } else if (locationRef && typeof locationRef === 'object') {
    if (typeof locationRef.geoId === 'string' && locationRef.geoId) matches = sites.filter(site => site?.geoId === locationRef.geoId);
    else if (typeof locationRef.id === 'string' && locationRef.id) matches = sites.filter(site => site?.id === locationRef.id);
  }
  if (matches.length !== 1) {
    return { ok: false, status: matches.length ? 'ambiguous-location' : 'missing-location', site: null, region: null };
  }
  const site = matches[0];
  const regionIndex = irRegionalRegionIndex(world);
  const regionId = site.regionId === undefined || site.regionId === null || site.regionId === '' ? root.id : site.regionId;
  if (typeof regionId !== 'string' || !regionId.trim()) {
    return { ok: false, status: 'missing-region-reference', site, region: null };
  }
  const regionMatches = regionIndex.byId.get(regionId) || [];
  if (regionMatches.length !== 1) {
    return { ok: false, status: 'unresolved-region-reference', site, region: null, regionId };
  }
  const region = regionMatches[0];
  return {
    ok: true,
    status: site.regionId === undefined || site.regionId === null || site.regionId === '' ? 'primary-region-default' : 'explicit-region',
    site,
    region,
    regionId: region.id,
    ownerPolityId: region.ownerPolityId ?? null,
    governingPolityId: region.governingPolityId ?? null
  };
}

// Reassign only the geographic reference. This helper never changes the route graph or political refs.
function irAssignLocationRegion(world, locationRef, regionId) {
  // Resolve the physical location independently of its current region/political references so
  // this helper can also repair an explicitly unresolved regionId without touching world topology.
  const sites = Array.isArray(world?.region?.sites) ? world.region.sites : [];
  let matches = [];
  if (typeof locationRef === 'string') matches = sites.filter(site => site?.geoId === locationRef || site?.id === locationRef);
  else if (locationRef && typeof locationRef === 'object') {
    if (typeof locationRef.geoId === 'string' && locationRef.geoId) matches = sites.filter(site => site?.geoId === locationRef.geoId);
    else if (typeof locationRef.id === 'string' && locationRef.id) matches = sites.filter(site => site?.id === locationRef.id);
  }
  if (matches.length !== 1) return { ok: false, errors: [`Location does not resolve uniquely (${matches.length} matches)`] };
  const index = irRegionalRegionIndex(world);
  const regionMatches = index.byId.get(regionId) || [];
  if (regionMatches.length !== 1) return { ok: false, errors: [`Target region ${String(regionId)} does not resolve uniquely`] };
  const site = matches[0];
  const previousRegionId = site.regionId;
  site.regionId = regionId;
  return { ok: true, siteGeoId: site.geoId, previousRegionId: previousRegionId ?? world.region.id, regionId };
}

function irValidateRegionalHierarchy(world) {
  const errors = [], warnings = [];
  if (!world || typeof world !== 'object') return { ok: false, errors: ['Missing world object'], warnings, counts: { regions: 0, sites: 0 } };
  const collected = irRegionalHierarchyCollect(world);
  errors.push(...collected.issues);
  if (!collected.root) return { ok: false, errors, warnings, counts: { regions: 0, sites: 0 } };
  const regionIdMap = new Map();
  for (const entry of collected.entries) {
    const region = entry.region;
    if (typeof region.id !== 'string' || !region.id.trim()) errors.push('Geographic region is missing its stable id');
    else {
      if (!regionIdMap.has(region.id)) regionIdMap.set(region.id, []);
      regionIdMap.get(region.id).push(region);
    }
    if (entry.depth === 0) {
      if (region.parentRegionId !== undefined && region.parentRegionId !== null && region.parentRegionId !== '') {
        errors.push(`Primary region ${region.id || '(unknown)'} must not have parentRegionId; use its continentId/countryId geographic references`);
      }
    } else if (region.parentRegionId !== entry.parent?.id) {
      errors.push(`Region ${region.id || '(unknown)'} parentRegionId does not match its containing parent`);
    }
    if (region.subregions !== undefined && region.subregions !== null && !Array.isArray(region.subregions)) {
      errors.push(`Region ${region.id || '(unknown)'} has invalid subregions container`);
    }
    if (entry.depth > 0 && (Object.prototype.hasOwnProperty.call(region, 'sites') || Object.prototype.hasOwnProperty.call(region, 'routes'))) {
      errors.push(`Subregion ${region.id || '(unknown)'} must not duplicate sites or route records`);
    }
    if (region.continentId !== undefined && region.continentId !== null && region.continentId !== '') {
      const matches = (Array.isArray(world.continents) ? world.continents : []).filter(record => record?.id === region.continentId);
      if (matches.length !== 1) errors.push(`Region ${region.id || '(unknown)'} has unresolved/ambiguous continentId ${region.continentId}`);
    }
    if (region.countryId !== undefined && region.countryId !== null && region.countryId !== '') {
      const matches = (Array.isArray(world.countries) ? world.countries : []).filter(record => record?.id === region.countryId);
      if (matches.length !== 1) errors.push(`Region ${region.id || '(unknown)'} has unresolved/ambiguous countryId ${region.countryId}`);
    }
  }
  for (const [id, regions] of regionIdMap) if (regions.length !== 1) errors.push(`Duplicate geographic region ID: ${id}`);

  const polityIndex = irRegionalPoliticalIndex(world);
  for (const entry of collected.entries) {
    const region = entry.region;
    for (const field of ['ownerPolityId', 'governingPolityId']) {
      const value = region[field];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value !== 'string' || !value.trim()) {
        errors.push(`Region ${region.id || '(unknown)'} has invalid ${field}`);
      } else if ((polityIndex.get(value) || []).length !== 1) {
        errors.push(`Region ${region.id || '(unknown)'} has unresolved/ambiguous ${field} ${value}`);
      }
    }
  }

  const regionIndex = irRegionalRegionIndex(world);
  const sites = Array.isArray(collected.root.sites) ? collected.root.sites : [];
  const geoIds = new Map();
  for (const site of sites) {
    if (!site || typeof site !== 'object') { errors.push('Invalid location record in primary physical geography'); continue; }
    if (typeof site.geoId === 'string' && site.geoId) {
      if (!geoIds.has(site.geoId)) geoIds.set(site.geoId, []);
      geoIds.get(site.geoId).push(site);
    }
    if (site.regionId === undefined || site.regionId === null || site.regionId === '') {
      warnings.push(`Location ${site.geoId || site.id || '(unknown)'} has no regionId; legacy resolution defaults to the primary region`);
      continue;
    }
    if (typeof site.regionId !== 'string' || (regionIndex.byId.get(site.regionId) || []).length !== 1) {
      errors.push(`Location ${site.geoId || site.id || '(unknown)'} has unresolved/ambiguous regionId ${String(site.regionId)}`);
    }
  }
  for (const [id, records] of geoIds) if (records.length !== 1) errors.push(`Duplicate location geoId: ${id}`);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts: { regions: collected.entries.length, subregions: Math.max(0, collected.entries.length - 1), sites: sites.length }
  };
}

// v0.7.9.2 integrity additions. Report malformed geography without changing it.
const ir0792ValidateRegionalBase = irValidateRegionalHierarchy;
irValidateRegionalHierarchy = function (world) {
  const report = ir0792ValidateRegionalBase(world);
  if (!world || typeof world !== 'object' || !world.region || typeof world.region !== 'object') return report;
  const errors = [...report.errors];
  const warnings = [...report.warnings];
  const sites = Array.isArray(world.region.sites) ? world.region.sites : [];
  const edges = Array.isArray(world.region.routes) ? world.region.routes : [];
  const siteByGeo = new Map(), siteById = new Map();
  for (const site of sites) {
    if (typeof site?.geoId === 'string' && site.geoId) siteByGeo.set(site.geoId, site);
    if (typeof site?.id === 'string' && site.id) siteById.set(site.id, site);
    if (!site || typeof site !== 'object') continue;
    for (const field of ['name', 'type', 'biomeId']) {
      if (typeof site[field] !== 'string' || !site[field].trim()) errors.push(`Location ${site.id || site.geoId || '(unknown)'} is missing required ${field}`);
    }
    if (site.biomeId && typeof IR_BIOMES !== 'undefined' && !Object.prototype.hasOwnProperty.call(IR_BIOMES, site.biomeId)) {
      errors.push(`Location ${site.id || site.geoId || '(unknown)'} has unresolved biomeId ${site.biomeId}`);
    }
    for (const field of ['x', 'y']) {
      if (!Number.isFinite(site[field])) warnings.push(`Location ${site.id || site.geoId || '(unknown)'} has missing or invalid optional ${field} coordinate`);
    }
  }
  const pairKey = (from, to, directed) => directed ? `${from}\u0000${to}` : [from, to].sort().join('\u0000');
  const globalByPair = new Map();
  for (const [i, edge] of edges.entries()) {
    if (!edge || typeof edge !== 'object') continue;
    const label = edge.geoId || i;
    const distance = edge.distanceKm;
    if (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0) errors.push(`Connection ${label} has invalid distanceKm`);
    for (const field of ['caravan', 'boat', 'shortcut', 'directed']) {
      if (edge[field] !== undefined && typeof edge[field] !== 'boolean') errors.push(`Connection ${label} has invalid ${field} flag`);
    }
    if (edge.terrain !== undefined && typeof edge.terrain !== 'string') errors.push(`Connection ${label} has invalid terrain`);
    let from = edge.fromGeoId ? siteByGeo.get(edge.fromGeoId) : null;
    let to = edge.toGeoId ? siteByGeo.get(edge.toGeoId) : null;
    if (!from && Number.isInteger(edge.a)) from = sites[edge.a] || null;
    if (!to && Number.isInteger(edge.b)) to = sites[edge.b] || null;
    if (from && to && from === to) errors.push(`Connection ${label} connects a location to itself`);
    if (from && to && Number.isInteger(edge.a) && Number.isInteger(edge.b)) {
      const legacyA = sites[edge.a], legacyB = sites[edge.b];
      const aligned = legacyA === from && legacyB === to;
      const reversedUndirected = edge.directed !== true && legacyA === to && legacyB === from;
      if (!aligned && !reversedUndirected) errors.push(`Connection ${label} has contradictory stable and legacy endpoints`);
    }
    if (from && to) {
      const key = pairKey(from.geoId || from.id, to.geoId || to.id, edge.directed === true);
      if (!globalByPair.has(key)) globalByPair.set(key, []);
      globalByPair.get(key).push({ edge, from, to });
    }
  }
  // The global graph is authoritative, but compatibility route mirrors must agree because
  // travel resolution requires them. Diagnose drift here; never rewrite either representation.
  const compareLocal = (entry, from, to) => {
    const candidates = (Array.isArray(from?.routes) ? from.routes : []).filter(route => route?.to === to?.id);
    const edge = entry.edge, label = edge.geoId || '(unnamed connection)';
    if (candidates.length !== 1) {
      errors.push(`Connection ${label} has ${candidates.length ? 'ambiguous' : 'missing'} local route mirror from ${from?.id} to ${to?.id}`);
      return;
    }
    const route = candidates[0];
    if (route.distanceKm !== edge.distanceKm) errors.push(`Connection ${label} disagrees with local route ${from.id} -> ${to.id} on distanceKm`);
    for (const field of ['caravan', 'boat', 'shortcut']) {
      if (Boolean(route[field]) !== Boolean(edge[field])) errors.push(`Connection ${label} disagrees with local route ${from.id} -> ${to.id} on ${field}`);
    }
    if ((route.terrain || '') !== (edge.terrain || '')) errors.push(`Connection ${label} disagrees with local route ${from.id} -> ${to.id} on terrain`);
    if (route.toGeoId && route.toGeoId !== to.geoId) errors.push(`Connection ${label} local route has a contradictory geographic destination`);
    if (route.geoId && edge.geoId && route.geoId !== edge.geoId) errors.push(`Connection ${label} local route has a contradictory connection ID`);
  };
  for (const entries of globalByPair.values()) {
    for (const entry of entries) {
      compareLocal(entry, entry.from, entry.to);
      if (entry.edge.directed !== true) compareLocal(entry, entry.to, entry.from);
    }
  }
  for (const site of sites) {
    for (const route of Array.isArray(site?.routes) ? site.routes : []) {
      const target = siteById.get(route?.to);
      if (!target) continue; // The base validator already reports unresolved destinations.
      const matches = edges.filter(edge => {
        const from = edge?.fromGeoId ? siteByGeo.get(edge.fromGeoId) : sites[edge?.a];
        const to = edge?.toGeoId ? siteByGeo.get(edge.toGeoId) : sites[edge?.b];
        return (from === site && to === target) || (edge?.directed !== true && from === target && to === site);
      });
      if (matches.length !== 1) errors.push(`Local route ${site.id} -> ${target.id} has ${matches.length ? 'ambiguous' : 'no'} authoritative global connection`);
    }
  }
  for (const field of ['known', 'visited']) {
    if (world[field] !== undefined && !Array.isArray(world[field])) errors.push(`World ${field} references must be an array`);
  }
  if (world.journal !== undefined && (!world.journal || typeof world.journal !== 'object' || Array.isArray(world.journal))) {
    errors.push('World journal must be an object when present');
  } else if (world.journal) {
    for (const field of ['discoveries', 'rumors']) {
      if (world.journal[field] !== undefined && !Array.isArray(world.journal[field])) errors.push(`World journal ${field} must be an array when present`);
    }
  }
  const uniqueErrors = [...new Set(errors)];
  return { ...report, ok: uniqueErrors.length === 0, errors: uniqueErrors, warnings: [...new Set(warnings)] };
};

// Political-entity foundation v0.7.8.2 originally knew only the primary region. Extend its
// geographic lookup to all nested regions while retaining the one canonical site registry.
if (typeof irPoliticalEntityGeographicRecords === 'function') {
  irPoliticalEntityGeographicRecords = function (world) {
    const regions = irGetGeographicRegions(world);
    const root = world?.region && typeof world.region === 'object' ? world.region : null;
    const sites = Array.isArray(root?.sites) ? root.sites : [];
    const regionsById = new Map();
    for (const region of regions) {
      if (!region || typeof region.id !== 'string' || !region.id) continue;
      if (!regionsById.has(region.id)) regionsById.set(region.id, []);
      regionsById.get(region.id).push(region);
    }
    const sitesByGeoId = sites.reduce((map, site) => {
      if (typeof site?.geoId !== 'string' || !site.geoId) return map;
      if (!map.has(site.geoId)) map.set(site.geoId, []);
      map.get(site.geoId).push(site);
      return map;
    }, new Map());
    return { regions, sites, regionsById, sitesByGeoId };
  };
}

// Preserve all existing geographic validation (IDs, routes, known/visited references), but adapt
// its legacy assumption that every site belongs directly to world.region. The dedicated regional
// validator above checks the real location regionId values without mutating the saved world.
const ir0783ValidateGeographicHierarchyBase = typeof irValidateGeographicHierarchy === 'function' ? irValidateGeographicHierarchy : null;
if (ir0783ValidateGeographicHierarchyBase) {
  irValidateGeographicHierarchy = function (world) {
    let baseReport = { ok: true, errors: [], warnings: [] };
    if (world && typeof world === 'object' && world.region && typeof world.region === 'object') {
      // The legacy validator only needs the flat primary geography. Avoid JSON cloning the
      // entire save: nested hierarchy may intentionally contain a cycle that we must report,
      // and optional host objects must not make validation itself throw.
      const root = world.region;
      const compatible = {
        ...world,
        continents: Array.isArray(world.continents) ? world.continents.map(item => item && typeof item === 'object' ? { ...item } : item) : world.continents,
        countries: Array.isArray(world.countries) ? world.countries.map(item => item && typeof item === 'object' ? { ...item } : item) : world.countries,
        region: {
          ...root,
          sites: (Array.isArray(root.sites) ? root.sites : []).map(site => site && typeof site === 'object' ? { ...site, regionId: root.id } : site),
          routes: Array.isArray(root.routes) ? root.routes.map(edge => edge && typeof edge === 'object' ? { ...edge } : edge) : root.routes
        }
      };
      baseReport = ir0783ValidateGeographicHierarchyBase(compatible);
    } else {
      baseReport = ir0783ValidateGeographicHierarchyBase(world);
    }
    const regionalReport = irValidateRegionalHierarchy(world);
    const idReport = typeof irValidateGeographicIds === 'function' ? irValidateGeographicIds(world) : { errors: [], warnings: [] };
    const errors = [...new Set([...(baseReport.errors || []), ...regionalReport.errors, ...(idReport.errors || [])])];
    const warnings = [...new Set([...(baseReport.warnings || []), ...regionalReport.warnings, ...(idReport.warnings || [])])];
    return { ...baseReport, ok: errors.length === 0, errors, warnings, regionalCounts: regionalReport.counts };
  };
}

// The v0.7.5.4 saved-world reuse gate predates regional assignments and rejected any site whose
// regionId differed from the primary container ID. During that one structural-reuse check only,
// temporarily present sites as belonging to the primary container, then restore every original
// regionId byte-for-byte. All other world, route, stable-ID, and save checks remain in the baseline
// gate; the regional validator below independently reports explicit unresolved assignments.
const ir0783ReusableSavedWorldBase = typeof ir0754ReusableSavedWorld === 'function' ? ir0754ReusableSavedWorld : null;
if (ir0783ReusableSavedWorldBase) {
  ir0754ReusableSavedWorld = function (save) {
    const world = save?.world;
    const region = world?.region;
    const sites = Array.isArray(region?.sites) ? region.sites : null;
    if (!region || typeof region.id !== 'string' || !region.id || !sites) {
      return ir0783ReusableSavedWorldBase(save);
    }
    const snapshot = sites.filter(site => site && typeof site === 'object').map(site => ({
      site,
      hadRegionId: Object.prototype.hasOwnProperty.call(site, 'regionId'),
      regionId: site.regionId
    }));
    try {
      for (const item of snapshot) item.site.regionId = region.id;
      return ir0783ReusableSavedWorldBase(save);
    } finally {
      for (const item of snapshot) {
        if (item.hadRegionId) item.site.regionId = item.regionId;
        else delete item.site.regionId;
      }
    }
  };
}

// Adapt the legacy save-preparation layer, which predates nested regions and otherwise rewrites
// every non-primary site.regionId to the root. Preserve only references that resolve uniquely in
// both the incoming and prepared region trees; missing/dangling/ambiguous references keep the
// legacy safe-primary fallback. Physical sites and routes remain in their original registries.
const ir0783PrepareSaveInputBase = typeof ir0755PrepareSaveInput === 'function' ? ir0755PrepareSaveInput : null;
if (ir0783PrepareSaveInputBase) {
  ir0755PrepareSaveInput = function (input) {
    const sourceWorld = input?.world;
    const sourceSites = Array.isArray(sourceWorld?.region?.sites) ? sourceWorld.region.sites : [];
    const sourceIndex = irRegionalRegionIndex(sourceWorld);
    const sourceSiteIdCounts = new Map();
    const sourceGeoIdCounts = new Map();
    for (const site of sourceSites) {
      if (typeof site?.id === 'string' && site.id) sourceSiteIdCounts.set(site.id, (sourceSiteIdCounts.get(site.id) || 0) + 1);
      if (typeof site?.geoId === 'string' && site.geoId) sourceGeoIdCounts.set(site.geoId, (sourceGeoIdCounts.get(site.geoId) || 0) + 1);
    }
    const validAssignments = [];
    for (const site of sourceSites) {
      if (!site || typeof site !== 'object' || typeof site.regionId !== 'string' || !site.regionId) continue;
      if ((sourceIndex.byId.get(site.regionId) || []).length !== 1) continue;
      if (site.geoId && sourceGeoIdCounts.get(site.geoId) === 1) {
        validAssignments.push({ key: site.geoId, keyField: 'geoId', legacyId: site.id, regionId: site.regionId });
      } else if (site.id && sourceSiteIdCounts.get(site.id) === 1) {
        validAssignments.push({ key: site.id, keyField: 'id', legacyId: site.id, regionId: site.regionId });
      }
    }

    const result = ir0783PrepareSaveInputBase(input);
    const targetWorld = result?.input?.world;
    if (!targetWorld || !validAssignments.length) return result;
    irEnsureRegionalHierarchy(targetWorld);
    const targetIndex = irRegionalRegionIndex(targetWorld);
    const targetSites = Array.isArray(targetWorld.region?.sites) ? targetWorld.region.sites : [];
    const restoredNotices = new Set();
    for (const assignment of validAssignments) {
      if ((targetIndex.byId.get(assignment.regionId) || []).length !== 1) continue;
      const matches = targetSites.filter(site => site?.[assignment.keyField] === assignment.key);
      if (matches.length !== 1) continue;
      matches[0].regionId = assignment.regionId;
      restoredNotices.add(`Location ${assignment.legacyId || assignment.key} had an unresolved region reference (${assignment.regionId}); it was repaired to its containing primary region.`);
    }
    if (Array.isArray(result.notices) && restoredNotices.size) {
      result.notices = result.notices.filter(notice => !restoredNotices.has(notice));
    }
    // If restoring valid regional references leaves the prepared save byte-equivalent to the
    // original input, do not report a migration solely because the legacy layer temporarily
    // flattened those references during validation.
    if (result.changed && input && JSON.stringify(input) === JSON.stringify(result.input)) result.changed = false;
    return result;
  };
}

// Extend the existing hierarchy initializer, retaining canonical site and route data.
const ir0783EnsureGeographicHierarchyBase = typeof irEnsureGeographicHierarchy === 'function' ? irEnsureGeographicHierarchy : null;
if (ir0783EnsureGeographicHierarchyBase) {
  irEnsureGeographicHierarchy = function (world) {
    const result = ir0783EnsureGeographicHierarchyBase(world);
    return irEnsureRegionalHierarchy(result);
  };
}

const ir0783GenerateBase = typeof generateProceduralWorld === 'function' ? generateProceduralWorld : null;
if (ir0783GenerateBase) {
  generateProceduralWorld = function () {
    return irEnsureRegionalHierarchy(ir0783GenerateBase.apply(this, arguments));
  };
}

const ir0783NormalizeBase = typeof normalizeSave === 'function' ? normalizeSave : null;
if (ir0783NormalizeBase) {
  normalizeSave = function () {
    const normalized = ir0783NormalizeBase.apply(this, arguments);
    if (normalized?.world) {
      irEnsureRegionalHierarchy(normalized.world);
      const report = irValidateRegionalHierarchy(normalized.world);
      if (!report.ok && typeof console !== 'undefined' && console.warn) {
        console.warn('[Infinite Realms] Regional hierarchy validation:', report.errors);
      }
    }
    return normalized;
  };
}

// Release branding only. No gameplay, save-version, route, or map rendering rules change here.
if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.8.3';
const ir0783ShellBase = typeof shell === 'function' ? shell : null;
if (ir0783ShellBase) shell = function () { return ir0783ShellBase.apply(this, arguments).replace(/0\.7\.8\.2/g, '0.7.8.3'); };
const ir0783RenderTitleBase = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0783RenderTitleBase) renderTitle = function () { return ir0783RenderTitleBase.apply(this, arguments).replace(/0\.7\.8\.2/g, '0.7.8.3'); };
const ir0783RenderCharacterBase = typeof renderCharacter === 'function' ? renderCharacter : null;
if (ir0783RenderCharacterBase) renderCharacter = function () {
  const html = ir0783RenderCharacterBase.apply(this, arguments);
  return typeof html === 'string' ? html.replace(/CHARACTER STATUS · v0\.7\.8\.2/g, 'CHARACTER STATUS · v0.7.8.3') : html;
};

if (typeof globalThis !== 'undefined') {
  globalThis.irGeoRegionId = irGeoRegionId;
  globalThis.irGetGeographicRegions = irGetGeographicRegions;
  globalThis.irEnsureRegionalHierarchy = irEnsureRegionalHierarchy;
  globalThis.irCreateGeographicRegionRecord = irCreateGeographicRegionRecord;
  globalThis.irAddGeographicSubregion = irAddGeographicSubregion;
  globalThis.irResolveLocationRegion = irResolveLocationRegion;
  globalThis.irAssignLocationRegion = irAssignLocationRegion;
  globalThis.irValidateRegionalHierarchy = irValidateRegionalHierarchy;
}
