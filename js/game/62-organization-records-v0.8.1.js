'use strict';
// Infinite Realms v0.8.1 — deterministic world organization records.
// Political kingdoms remain in world.polities; this module never turns a polity into a faction.

const IR_V081_TYPE_BY_LEGACY_FACTION = Object.freeze({
  adventurers: 'adventurers-guild',
  merchants: 'merchant-company',
  shadow: 'criminal-organization',
  arcanum: 'magical-order',
  royal: 'civic-organization'
});

function ir081OrganizationId(worldId, factionId, locationGeoId) {
  if (typeof worldId !== 'string' || !worldId || typeof factionId !== 'string' || !factionId) return null;
  const anchor = String(locationGeoId || 'unanchored');
  return `organization:${worldId}:${factionId}:${Array.from(anchor, ch => ch.codePointAt(0).toString(16)).join('-')}`;
}

function ir081OrganizationSources(world) {
  const sites = Array.isArray(world?.region?.sites) ? world.region.sites : [];
  const rows = [];
  const add = (legacyId, site, nameOverride) => {
    const faction = typeof irV08FactionByLegacyId === 'function' ? irV08FactionByLegacyId(legacyId) : null;
    if (!faction || !site?.geoId) return;
    rows.push({
      id: ir081OrganizationId(world.id, faction.id, site.geoId),
      factionId: faction.id,
      organizationType: faction.organizationType,
      name: nameOverride || faction.name,
      description: faction.description,
      locationGeoId: site.geoId
    });
  };

  // Guild halls are explicitly present in the generated site service data.
  for (const site of sites.filter(item => item && Array.isArray(item.services) && item.services.includes('guild'))) {
    add('adventurers', site);
  }

  // A world-level merchant company is anchored to the first stable-ID major market, not every town.
  const majorMarket = sites.filter(site => site && Array.isArray(site.services) && site.services.includes('market') &&
    ['town', 'city'].includes(site.settlementType) && typeof site.geoId === 'string').sort((a, b) => a.geoId.localeCompare(b.geoId))[0];
  if (majorMarket) add('merchants', majorMarket);

  // An arcanum organization is present only where a library service actually exists.
  const library = sites.filter(site => site && Array.isArray(site.services) && site.services.includes('library') &&
    typeof site.geoId === 'string').sort((a, b) => a.geoId.localeCompare(b.geoId))[0];
  if (library) add('arcanum', library);

  // Criminal groups are represented only when an existing saved lead identifies one.
  for (const site of sites) {
    const lead = site?.changes?.criminalIntel;
    if (lead && lead.type === 'gangs' && lead.status !== 'cleared' && site.geoId) add('shadow', site, 'Local criminal group');
  }

  return rows;
}

function ir081ValidateOrganizations(world, organizations = world?.organizations) {
  const errors = [];
  if (!world || typeof world !== 'object') return { ok: false, errors: ['Missing world object'] };
  if (!Array.isArray(organizations)) return { ok: false, errors: ['Organization registry must be an array'] };
  const sites = Array.isArray(world.region?.sites) ? world.region.sites : [];
  const ids = new Set();
  const factionIds = new Set(Object.keys(IR_V08_FACTION_DEFINITIONS));
  for (const [index, record] of organizations.entries()) {
    const label = `Organization ${index + 1}`;
    if (!record || typeof record !== 'object' || Array.isArray(record)) { errors.push(`${label} must be an object`); continue; }
    if (typeof record.id !== 'string' || !record.id.startsWith(`organization:${world.id}:`)) errors.push(`${label} has an invalid stable ID`);
    else if (ids.has(record.id)) errors.push(`Duplicate organization ID ${record.id}`);
    else ids.add(record.id);
    const faction = IR_V08_FACTION_DEFINITIONS[record.factionId];
    if (!factionIds.has(record.factionId)) errors.push(`${label} references an unknown faction ID`);
    if (typeof record.organizationType !== 'string' || !IR_V08_FACTION_TYPE_IDS.includes(record.organizationType)) errors.push(`${label} has an unsupported organization type`);
    else if (faction && faction.organizationType !== record.organizationType) errors.push(`${label} organization type does not match its shared faction definition`);
    if (typeof record.name !== 'string' || !record.name.trim()) errors.push(`${label} has no display name`);
    if (record.locationGeoId != null && !sites.some(site => site?.geoId === record.locationGeoId)) errors.push(`${label} has an unresolved location reference`);
    if (record.polityId != null && !(Array.isArray(world.polities) && world.polities.filter(polity => polity?.id === record.polityId).length === 1)) errors.push(`${label} has an unresolved political reference`);
  }
  return { ok: errors.length === 0, errors };
}

function ir081EnsureOrganizationRecords(world) {
  if (!world || typeof world !== 'object') return { ok: false, created: 0, errors: ['Missing world object'] };
  if (Object.prototype.hasOwnProperty.call(world, 'organizations')) {
    return ir081ValidateOrganizations(world);
  }
  world.organizations = ir081OrganizationSources(world);
  const report = ir081ValidateOrganizations(world);
  if (!report.ok) {
    delete world.organizations;
    return { ok: false, created: 0, errors: report.errors };
  }
  world.organizationRegistryVersion = 1;
  return { ok: true, created: world.organizations.length, errors: [] };
}

function ir081OrganizationsForFaction(world, factionId) {
  return (Array.isArray(world?.organizations) ? world.organizations : [])
    .filter(record => record?.factionId === factionId).map(record => ({ ...record }));
}

const ir081GenerateWorldBase = typeof generateProceduralWorld === 'function' ? generateProceduralWorld : null;
if (ir081GenerateWorldBase) {
  generateProceduralWorld = function () {
    const world = ir081GenerateWorldBase.apply(this, arguments);
    const result = ir081EnsureOrganizationRecords(world);
    if (!result.ok && typeof console !== 'undefined' && console.warn) console.warn('[Infinite Realms] Organization initialization skipped safely:', result.errors);
    return world;
  };
}

const ir081NormalizeBase = typeof normalizeSave === 'function' ? normalizeSave : null;
if (ir081NormalizeBase) {
  normalizeSave = function (input) {
    const normalized = ir081NormalizeBase.apply(this, arguments);
    if (normalized?.world) {
      const result = ir081EnsureOrganizationRecords(normalized.world);
      if (!result.ok && typeof console !== 'undefined' && console.warn) console.warn('[Infinite Realms] Saved organization registry retained with validation errors:', result.errors);
    }
    return normalized;
  };
}

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.1';
if (typeof globalThis !== 'undefined') {
  globalThis.ir081OrganizationId = ir081OrganizationId;
  globalThis.ir081OrganizationSources = ir081OrganizationSources;
  globalThis.ir081ValidateOrganizations = ir081ValidateOrganizations;
  globalThis.ir081EnsureOrganizationRecords = ir081EnsureOrganizationRecords;
  globalThis.ir081OrganizationsForFaction = ir081OrganizationsForFaction;
}
