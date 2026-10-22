'use strict';
// Infinite Realms v0.7.8.6 — deterministic political generation.
// Runs only after a NEW procedural world has been geographically generated. Loading/normalizing
// a saved world never regenerates political data. Physical sites, terrain, IDs, and routes are untouched.

function ir0786StableHash(value) {
  let h = 2166136261;
  for (const ch of String(value ?? '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function ir0786CollectRegions(world) {
  if (typeof irGetGeographicRegions === 'function') return irGetGeographicRegions(world);
  const out = [], seen = new Set();
  function visit(r) { if (!r || typeof r !== 'object' || seen.has(r)) return; seen.add(r); out.push(r); (Array.isArray(r.subregions) ? r.subregions : []).forEach(visit); }
  visit(world?.region); return out;
}
function ir0786GeneratePoliticalData(world, options = {}) {
  const allowRegionPartition = options?.allowRegionPartition !== false;
  if (!world || typeof world !== 'object' || !world.region || !Array.isArray(world.region.sites)) {
    return { ok: false, reason: 'Geographic world data is unavailable', generated: 0 };
  }
  if (Array.isArray(world.polities) && world.polities.length) {
    return { ok: true, skipped: true, reason: 'Political records already exist', generated: 0 };
  }
  if (typeof irEnsurePoliticalEntityRegistry === 'function') irEnsurePoliticalEntityRegistry(world);
  const root = world.region;
  const sites = root.sites.filter(s => s && typeof s.geoId === 'string' && s.geoId);
  if (sites.length < 3 || !root.id || !world.id) {
    return { ok: true, skipped: true, reason: 'World is too small or lacks stable geographic IDs', generated: 0 };
  }
  const seedKey = String(world.seed ?? world.id);
  const hash = ir0786StableHash(seedKey);
  const names = ['Asterfall', 'Dawnmere', 'Elderreach', 'Moonvale', 'Thornmarch', 'Westervale'];
  const types = ['kingdom', 'city-state', 'tribal-territory'];
  const descriptors = ['Northern Reach', 'Central Marches', 'Southern Vale'];
  const physicalSnapshot = {
    sites: sites.map(site => ({ site, regionId: site.regionId, hasRegionId: Object.prototype.hasOwnProperty.call(site, 'regionId') })),
    routesJson: JSON.stringify(root.routes || []),
    physicalIds: sites.map(site => [site.id, site.geoId]),
    coords: sites.map(site => [site.id, site.x, site.y, site.row, site.col, site.biomeId, site.biome, site.type]),
    originalSubregions: Array.isArray(root.subregions) ? root.subregions.slice() : null,
    hadSubregions: Object.prototype.hasOwnProperty.call(root, 'subregions'),
    geography: world.geography ? JSON.parse(JSON.stringify(world.geography)) : null,
    hadGeography: Object.prototype.hasOwnProperty.call(world, 'geography'),
    previousPolities: Array.isArray(world.polities) ? world.polities.slice() : []
  };
  const priorRegionPolitical = new Map(ir0786CollectRegions(world).map(region => [region, {
    owner: region.ownerPolityId, hadOwner: Object.prototype.hasOwnProperty.call(region, 'ownerPolityId'),
    governor: region.governingPolityId, hadGovernor: Object.prototype.hasOwnProperty.call(region, 'governingPolityId')
  }]));
  const restore = () => {
    for (const record of physicalSnapshot.sites) {
      if (record.hasRegionId) record.site.regionId = record.regionId;
      else delete record.site.regionId;
    }
    if (physicalSnapshot.hadSubregions) root.subregions = (physicalSnapshot.originalSubregions || []).slice();
    else delete root.subregions;
    if (physicalSnapshot.hadGeography) world.geography = physicalSnapshot.geography;
    else delete world.geography;
    world.polities = physicalSnapshot.previousPolities.slice();
    for (const [region, prior] of priorRegionPolitical) {
      if (prior.hadOwner) region.ownerPolityId = prior.owner; else delete region.ownerPolityId;
      if (prior.hadGovernor) region.governingPolityId = prior.governor; else delete region.governingPolityId;
    }
  };

  // Discover region assignments that already contain locations. Respect valid pre-existing
  // nested assignments. When every generated site still points at the root, create stable
  // metadata-only subregions and assign existing sites by their generator row (or stable order).
  // This changes geographic metadata only; it does not copy or edit any physical site or route.
  let regionList = ir0786CollectRegions(world).filter(region => region && typeof region.id === 'string' && region.id);
  const idCounts = new Map();
  for (const region of regionList) idCounts.set(region.id, (idCounts.get(region.id) || 0) + 1);
  if (idCounts.get(root.id) !== 1 || regionList.some(region => idCounts.get(region.id) !== 1)) {
    return { ok: false, reason: 'Geographic regions do not have unique stable IDs', generated: 0 };
  }
  const populatedIds = new Set();
  let unresolvedSiteRegion = false;
  for (const site of sites) {
    const regionId = typeof site.regionId === 'string' && site.regionId ? site.regionId : root.id;
    if (!idCounts.has(regionId)) { unresolvedSiteRegion = true; break; }
    populatedIds.add(regionId);
  }
  if (unresolvedSiteRegion) return { ok: false, reason: 'Existing location region references are unresolved', generated: 0 };

  if (allowRegionPartition && populatedIds.size === 1 && populatedIds.has(root.id)) {
    const desired = 3;
    if (!Array.isArray(root.subregions)) root.subregions = [];
    const generatedChildren = [];
    const currentIds = new Set(regionList.map(region => region.id));
    for (let i = 0; i < desired; i++) {
      const key = `generated-territory-${i + 1}`;
      let child = root.subregions.find(region => region?.generationKey === key);
      if (!child) {
        const id = typeof irGeoRegionId === 'function' ? irGeoRegionId(world.id, key) : `region:${world.id}:sub:${key}`;
        if (!id || currentIds.has(id)) { restore(); return { ok: false, reason: `Generated region ID collision for ${key}`, generated: 0 }; }
        child = typeof irCreateGeographicRegionRecord === 'function'
          ? irCreateGeographicRegionRecord(world, {
              id, name: `${root.name || 'Frontier'} · ${descriptors[i]}`, stableKey: key,
              parentRegionId: root.id, continentId: root.continentId ?? null, countryId: null,
              description: 'A procedural geographic subregion; physical sites and routes remain in the parent world container.'
            })
          : { id, name: `${root.name || 'Frontier'} · ${descriptors[i]}`, parentRegionId: root.id, subregions: [], continentId: root.continentId ?? null, countryId: null, ownerPolityId: null, governingPolityId: null };
        if (!child) { restore(); return { ok: false, reason: `Could not construct geographic region ${key}`, generated: 0 }; }
        child.generationKey = key;
        root.subregions.push(child);
        currentIds.add(id);
      }
      generatedChildren.push(child);
    }
    // Preserve existing site records and route graph exactly; only regionId metadata is assigned.
    const maxRow = Math.max(...sites.map(site => Number.isFinite(Number(site.row)) ? Number(site.row) : 0));
    const hasRows = sites.every(site => Number.isFinite(Number(site.row)) && Number.isFinite(Number(site.col)));
    const stableOrder = sites.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for (let i = 0; i < stableOrder.length; i++) {
      const site = stableOrder[i];
      let band;
      if (hasRows && maxRow > 0) band = Math.min(2, Math.floor((Number(site.row) * 3) / (maxRow + 1)));
      else band = Math.min(2, Math.floor(i * 3 / stableOrder.length));
      site.regionId = generatedChildren[band].id;
    }
    if (typeof irEnsureRegionalHierarchy === 'function') irEnsureRegionalHierarchy(world);
    regionList = ir0786CollectRegions(world);
    populatedIds.clear();
    for (const site of sites) populatedIds.add(site.regionId);
  }

  const regionById = new Map(regionList.filter(region => typeof region?.id === 'string').map(region => [region.id, region]));
  const usable = regionList.filter(region => populatedIds.has(region.id));
  if (!usable.length) { restore(); return { ok: true, skipped: true, reason: 'No populated geographic regions', generated: 0 }; }
  const count = Math.min(usable.length, 3, Math.max(1, Math.floor((sites.length + 2) / 6)));
  const selectedRegions = usable.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(0, count);
  const created = [];
  for (let i = 0; i < selectedRegions.length; i++) {
    const region = selectedRegions[i];
    const localHash = ir0786StableHash(`${seedKey}|polity|${region.id}|${i}`);
    const regionSites = sites.filter(site => (site.regionId || root.id) === region.id);
    if (!regionSites.length) continue;
    const settlementCandidates = regionSites.filter(site => site.type === 'settlement' && typeof site.geoId === 'string' && site.geoId);
    const capital = settlementCandidates.length ? settlementCandidates[localHash % settlementCandidates.length] : null;
    const id = typeof irPoliticalEntityId === 'function' ? irPoliticalEntityId(world.id, `generated-${region.id}`) : `polity:${world.id}:generated-${i + 1}`;
    const polityInput = {
      id, stableKey: `generated-${region.id}`,
      name: names[(hash + i) % names.length],
      type: types[(hash + i) % types.length],
      description: 'Procedurally generated political entity.',
      regionIds: [region.id]
    };
    if (capital) polityInput.capitalSiteGeoId = capital.geoId;
    const polity = typeof irCreatePoliticalEntityRecord === 'function'
      ? irCreatePoliticalEntityRecord(world, polityInput)
      : { id, name: polityInput.name, type: polityInput.type, regionIds: [region.id], ...(capital ? { capitalSiteGeoId: capital.geoId } : {}) };
    if (!id || world.polities.some(p => p?.id === id)) { restore(); return { ok: false, reason: `Duplicate generated political entity ID ${String(id)}`, generated: 0 }; }
    created.push({ polity, region, capital });
  }
  if (!created.length || new Set(created.map(item => item.polity.id)).size !== created.length) {
    restore();
    return { ok: false, reason: 'Could not construct unique political records for populated regions', generated: 0 };
  }

  // Validate the whole candidate against both political and geographic contracts before commit.
  world.polities.push(...created.map(item => item.polity));
  for (const item of created) {
    item.region.ownerPolityId = item.polity.id;
    item.region.governingPolityId = item.polity.id;
  }
  if (typeof irEnsureRegionalHierarchy === 'function') irEnsureRegionalHierarchy(world);
  const polityValidation = typeof irValidatePoliticalEntities === 'function' ? irValidatePoliticalEntities(world) : { ok: true, errors: [] };
  const regionValidation = typeof irValidateRegionalHierarchy === 'function' ? irValidateRegionalHierarchy(world) : { ok: true, errors: [] };
  if (!polityValidation.ok || !regionValidation.ok) {
    const errors = [...(polityValidation.errors || []), ...(regionValidation.errors || [])];
    restore();
    return { ok: false, reason: 'Political generation failed validation', errors, generated: 0 };
  }

  const physicalAfter = {
    routesJson: JSON.stringify(root.routes || []),
    physicalIds: sites.map(site => [site.id, site.geoId]),
    coords: sites.map(site => [site.id, site.x, site.y, site.row, site.col, site.biomeId, site.biome, site.type])
  };
  if (physicalAfter.routesJson !== physicalSnapshot.routesJson ||
      JSON.stringify(physicalAfter.physicalIds) !== JSON.stringify(physicalSnapshot.physicalIds) ||
      JSON.stringify(physicalAfter.coords) !== JSON.stringify(physicalSnapshot.coords)) {
    restore();
    return { ok: false, reason: 'Physical geography changed during political generation', generated: 0 };
  }
  return {
    ok: true, generated: created.length,
    polityIds: created.map(item => item.polity.id),
    regionIds: created.map(item => item.region.id),
    assignedSites: sites.length,
    capitalCount: created.filter(item => item.capital).length
  };
}

const ir0786GenerateBase = typeof generateProceduralWorld === 'function' ? generateProceduralWorld : null;
if (ir0786GenerateBase) {
  generateProceduralWorld = function () {
    const world = ir0786GenerateBase.apply(this, arguments);
    // A save-reuse call sets this existing marker before invoking the shared generator. Fresh
    // worlds may receive deterministic metadata subregions; legacy saves keep all valid location
    // region assignments and only initialize political records over regions already populated.
    const reusedSave = typeof ir0754PendingSavedWorld !== 'undefined' && !!ir0754PendingSavedWorld?.used;
    const report = ir0786GeneratePoliticalData(world, { allowRegionPartition: !reusedSave });
    if (!report.ok && typeof console !== 'undefined' && console.warn) console.warn('[Infinite Realms] Political generation skipped safely:', report.reason);
    return world;
  };
}
if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.8.6';
if (typeof globalThis !== 'undefined') {
  globalThis.ir0786StableHash = ir0786StableHash;
  globalThis.ir0786GeneratePoliticalData = ir0786GeneratePoliticalData;
}
