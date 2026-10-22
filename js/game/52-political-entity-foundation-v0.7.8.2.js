'use strict';
// Infinite Realms v0.7.8.2 — political entity data foundation.
// Political identities live in world.polities[] and reference authoritative geography by ID.
// This module adds no political content, territory ownership, gameplay interactions, or migrations.

var IR_POLITICAL_ENTITY_TYPES = Object.freeze([
  'country',
  'kingdom',
  'empire',
  'city-state',
  'tribal-territory'
]);

function irPoliticalEntityEncode(value) {
  if (typeof irGeoEncode === 'function') return irGeoEncode(String(value ?? ''));
  return Array.from(String(value ?? ''), ch => ch.codePointAt(0).toString(16)).join('-') || 'empty';
}

// Build stable IDs from the stable world ID and a caller-supplied logical key.
// Never derive identity from a display name, array position, random value, or generation order.
function irPoliticalEntityId(worldId, stableKey) {
  const worldKey = String(worldId ?? '').trim();
  const logicalKey = String(stableKey ?? '').trim();
  if (!worldKey || !logicalKey) return null;
  return `polity:${worldKey}:${irPoliticalEntityEncode(logicalKey)}`;
}

// Minimal record factory. It creates a record only when explicitly called; no generated-world
// startup path seeds polities. Physical location/site/route records are never copied.
function irCreatePoliticalEntityRecord(world, input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const id = typeof source.id === 'string' && source.id.trim()
    ? source.id.trim()
    : irPoliticalEntityId(world?.id, source.stableKey);
  const record = {
    id,
    name: typeof source.name === 'string' ? source.name.trim() : '',
    type: source.type
  };
  if (source.description !== undefined && source.description !== null) record.description = source.description;
  if (source.regionIds !== undefined) record.regionIds = Array.isArray(source.regionIds) ? [...source.regionIds] : source.regionIds;
  if (source.capitalSiteGeoId !== undefined && source.capitalSiteGeoId !== null && source.capitalSiteGeoId !== '') {
    record.capitalSiteGeoId = source.capitalSiteGeoId;
  }
  if (source.governingEntityId !== undefined && source.governingEntityId !== null && source.governingEntityId !== '') {
    record.governingEntityId = source.governingEntityId;
  }
  return record;
}

// Older saves do not have a polity registry. Add the empty optional collection without changing
// the world, its seed, geographic IDs, sites, routes, discovery, or player progress.
function irEnsurePoliticalEntityRegistry(world) {
  if (!world || typeof world !== 'object') return world;
  if (!Array.isArray(world.polities)) world.polities = [];
  return world;
}

function irPoliticalEntityGeographicRecords(world) {
  // Current architecture owns one populated world.region object. world.geography is a derived
  // reference index and is deliberately not treated as another region registry.
  const region = world?.region && typeof world.region === 'object' ? world.region : null;
  const sites = Array.isArray(region?.sites) ? region.sites : [];
  return {
    regions: region ? [region] : [],
    sites,
    regionsById: new Map(region && typeof region.id === 'string' && region.id ? [[region.id, region]] : []),
    sitesByGeoId: sites.reduce((map, site) => {
      if (typeof site?.geoId !== 'string' || !site.geoId) return map;
      if (!map.has(site.geoId)) map.set(site.geoId, []);
      map.get(site.geoId).push(site);
      return map;
    }, new Map())
  };
}

// Non-mutating validation. Existing malformed records are reported, not silently repaired or
// discarded. A geographic anchor is either one or more existing region IDs or a capital site ID.
function irValidatePoliticalEntities(world) {
  const errors = [];
  const warnings = [];
  if (!world || typeof world !== 'object') {
    return { ok: false, errors: ['Missing world object'], warnings, counts: { polities: 0 } };
  }
  if (!Array.isArray(world.polities)) {
    warnings.push('Political entity registry is absent or invalid; save normalization supplies an empty registry.');
    return { ok: true, errors, warnings, counts: { polities: 0 } };
  }

  const geo = irPoliticalEntityGeographicRecords(world);
  const entitiesById = new Map();
  const optionalStringFields = ['description'];

  for (const [index, entity] of world.polities.entries()) {
    const label = typeof entity?.id === 'string' && entity.id ? entity.id : `record at index ${index}`;
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
      errors.push(`Invalid political entity ${label}`);
      continue;
    }
    if (typeof entity.id !== 'string' || !entity.id.trim()) {
      errors.push(`Political entity ${label} is missing a stable id`);
    } else {
      if (!entitiesById.has(entity.id)) entitiesById.set(entity.id, []);
      entitiesById.get(entity.id).push(entity);
    }
    if (typeof entity.name !== 'string' || !entity.name.trim()) {
      errors.push(`Political entity ${label} is missing a display name`);
    }
    if (!IR_POLITICAL_ENTITY_TYPES.includes(entity.type)) {
      errors.push(`Political entity ${label} has unsupported type ${String(entity.type)}`);
    }
    for (const field of optionalStringFields) {
      if (entity[field] !== undefined && entity[field] !== null && typeof entity[field] !== 'string') {
        errors.push(`Political entity ${label} has invalid optional ${field}`);
      }
    }

    let regionIds = [];
    if (entity.regionIds !== undefined && entity.regionIds !== null) {
      if (!Array.isArray(entity.regionIds)) {
        errors.push(`Political entity ${label} has invalid regionIds; expected an array`);
      } else {
        regionIds = entity.regionIds;
        const seenRegions = new Set();
        for (const regionId of regionIds) {
          if (typeof regionId !== 'string' || !regionId.trim()) {
            errors.push(`Political entity ${label} has an invalid region reference`);
          } else if (seenRegions.has(regionId)) {
            errors.push(`Political entity ${label} repeats region reference ${regionId}`);
          } else {
            seenRegions.add(regionId);
            if ((geo.regionsById.get(regionId) ? 1 : 0) !== 1) {
              errors.push(`Political entity ${label} has unresolved regionId ${regionId}`);
            }
          }
        }
      }
    }

    if (entity.capitalSiteGeoId !== undefined && entity.capitalSiteGeoId !== null && entity.capitalSiteGeoId !== '') {
      if (typeof entity.capitalSiteGeoId !== 'string') {
        errors.push(`Political entity ${label} has an invalid capitalSiteGeoId`);
      } else {
        const matches = geo.sitesByGeoId.get(entity.capitalSiteGeoId) || [];
        if (matches.length !== 1) {
          errors.push(`Political entity ${label} has unresolved/ambiguous capitalSiteGeoId ${entity.capitalSiteGeoId}`);
        } else if (matches[0].type !== 'settlement') {
          errors.push(`Political entity ${label} capital ${entity.capitalSiteGeoId} is not an existing settlement`);
        }
      }
    }

    const hasRegionAnchor = Array.isArray(entity.regionIds) && entity.regionIds.some(
      regionId => typeof regionId === 'string' && geo.regionsById.has(regionId)
    );
    const hasCapitalAnchor = typeof entity.capitalSiteGeoId === 'string' &&
      (geo.sitesByGeoId.get(entity.capitalSiteGeoId) || []).length === 1;
    if (!hasRegionAnchor && !hasCapitalAnchor) {
      errors.push(`Political entity ${label} must reference an existing geographic region or settlement`);
    }
  }

  for (const [id, records] of entitiesById) {
    if (records.length > 1) errors.push(`Duplicate political entity id: ${id}`);
  }

  for (const entity of world.polities) {
    if (!entity || typeof entity !== 'object') continue;
    const id = typeof entity.id === 'string' && entity.id ? entity.id : '(unknown)';
    const governingId = entity.governingEntityId;
    if (governingId === undefined || governingId === null || governingId === '') continue;
    if (typeof governingId !== 'string') {
      errors.push(`Political entity ${id} has an invalid governingEntityId`);
      continue;
    }
    const matches = entitiesById.get(governingId) || [];
    if (matches.length !== 1) errors.push(`Political entity ${id} has unresolved/ambiguous governingEntityId ${governingId}`);
    if (governingId === entity.id) errors.push(`Political entity ${id} cannot govern itself`);
  }

  // Governing links form a directed hierarchy. Reject cycles without imposing any type order:
  // an empire, kingdom, country, city-state, or tribal territory can relate as data allows.
  const byUniqueId = new Map([...entitiesById.entries()].filter(([, records]) => records.length === 1).map(([id, records]) => [id, records[0]]));
  const completed = new Set();
  for (const entity of world.polities) {
    if (!entity || typeof entity.id !== 'string' || !byUniqueId.has(entity.id) || completed.has(entity.id)) continue;
    const path = new Set();
    let cursor = entity;
    while (cursor && typeof cursor.id === 'string' && byUniqueId.has(cursor.id) && !completed.has(cursor.id)) {
      if (path.has(cursor.id)) {
        errors.push(`Circular governingEntityId chain involving ${cursor.id}`);
        break;
      }
      path.add(cursor.id);
      cursor = typeof cursor.governingEntityId === 'string' ? byUniqueId.get(cursor.governingEntityId) : null;
    }
    for (const id of path) completed.add(id);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts: {
      polities: world.polities.length,
      uniqueIds: entitiesById.size,
      geographicRegions: geo.regions.length,
      geographicSites: geo.sites.length
    }
  };
}

const ir0782GenerateBase = typeof generateProceduralWorld === 'function' ? generateProceduralWorld : null;
if (ir0782GenerateBase) {
  generateProceduralWorld = function () {
    const world = ir0782GenerateBase.apply(this, arguments);
    return irEnsurePoliticalEntityRegistry(world);
  };
}

const ir0782NormalizeBase = typeof normalizeSave === 'function' ? normalizeSave : null;
if (ir0782NormalizeBase) {
  normalizeSave = function () {
    const normalized = ir0782NormalizeBase.apply(this, arguments);
    if (normalized?.world) {
      const hadRegistry = Array.isArray(normalized.world.polities);
      irEnsurePoliticalEntityRegistry(normalized.world);
      const report = irValidatePoliticalEntities(normalized.world);
      // Keep invalid records for explicit recovery; never guess a replacement for their IDs/refs.
      if (!report.ok && typeof console !== 'undefined' && console.warn) {
        console.warn('[Infinite Realms] Political entity validation:', report.errors);
      } else if (!hadRegistry && typeof console !== 'undefined' && console.info) {
        console.info('[Infinite Realms] Added empty political-entity registry for compatibility.');
      }
    }
    return normalized;
  };
}

// Release branding only. This module does not alter gameplay or the legacy save version field.
if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.8.2';
const ir0782ShellBase = typeof shell === 'function' ? shell : null;
if (ir0782ShellBase) shell = function () { return ir0782ShellBase.apply(this, arguments).replace(/0\.7\.7\.9/g, '0.7.8.2'); };
const ir0782RenderTitleBase = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0782RenderTitleBase) renderTitle = function () { return ir0782RenderTitleBase.apply(this, arguments).replace(/0\.7\.7\.9/g, '0.7.8.2'); };
const ir0782RenderCharacterBase = typeof renderCharacter === 'function' ? renderCharacter : null;
if (ir0782RenderCharacterBase) renderCharacter = function () {
  const html = ir0782RenderCharacterBase.apply(this, arguments);
  return typeof html === 'string' ? html.replace(/CHARACTER STATUS · v0\.7\.7\.9/g, 'CHARACTER STATUS · v0.7.8.2') : html;
};

if (typeof globalThis !== 'undefined') {
  globalThis.IR_POLITICAL_ENTITY_TYPES = IR_POLITICAL_ENTITY_TYPES;
  globalThis.irPoliticalEntityId = irPoliticalEntityId;
  globalThis.irCreatePoliticalEntityRecord = irCreatePoliticalEntityRecord;
  globalThis.irEnsurePoliticalEntityRegistry = irEnsurePoliticalEntityRegistry;
  globalThis.irValidatePoliticalEntities = irValidatePoliticalEntities;
}
