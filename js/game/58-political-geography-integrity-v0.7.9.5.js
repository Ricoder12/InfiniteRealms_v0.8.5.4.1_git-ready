'use strict';
// Infinite Realms v0.7.9.5 — political geography integrity.
// Validate supported site-level ownership references and keep geographic and political IDs distinct.

function ir0795WorldFromPoliticalContext(worldOrState) {
  return worldOrState?.world && worldOrState?.character ? worldOrState.world : worldOrState;
}

function ir0795PoliticalIdDomainErrors(world) {
  if (!world || typeof world !== 'object') return [];
  const geographicIds = new Set((typeof irGetGeographicRegions === 'function' ? irGetGeographicRegions(world) : [])
    .map(region => region?.id).filter(id => typeof id === 'string' && id));
  const politicalIds = new Set((Array.isArray(world.polities) ? world.polities : [])
    .map(polity => polity?.id).filter(id => typeof id === 'string' && id));
  return [...geographicIds].filter(id => politicalIds.has(id))
    .map(id => `Geographic region ID ${id} collides with a political entity ID`);
}

function ir0795SiteOwnershipErrors(world) {
  if (!world || typeof world !== 'object' || !world.region || !Array.isArray(world.region.sites)) return [];
  const byId = new Map();
  for (const polity of Array.isArray(world.polities) ? world.polities : []) {
    if (typeof polity?.id !== 'string' || !polity.id.trim()) continue;
    if (!byId.has(polity.id)) byId.set(polity.id, []);
    byId.get(polity.id).push(polity);
  }
  const errors = [];
  for (const site of world.region.sites) {
    if (!site || typeof site !== 'object' || site.ownerPolityId === undefined || site.ownerPolityId === null || site.ownerPolityId === '') continue;
    const label = site.geoId || site.id || '(unknown)';
    if (typeof site.ownerPolityId !== 'string' || !site.ownerPolityId.trim()) {
      errors.push(`Location ${label} has invalid ownerPolityId`);
      continue;
    }
    const matches = byId.get(site.ownerPolityId) || [];
    if (matches.length !== 1) errors.push(`Location ${label} has unresolved/ambiguous ownerPolityId ${site.ownerPolityId}`);
  }
  return errors;
}

const ir0795RegionalValidationBase = typeof irValidateRegionalHierarchy === 'function' ? irValidateRegionalHierarchy : null;
if (ir0795RegionalValidationBase) {
  irValidateRegionalHierarchy = function (world) {
    const base = ir0795RegionalValidationBase.apply(this, arguments);
    const errors = [...(base?.errors || []), ...ir0795SiteOwnershipErrors(world)];
    return { ...base, ok: errors.length === 0, errors: [...new Set(errors)] };
  };
}

const ir0795PoliticalValidationBase = typeof irValidatePoliticalEntities === 'function' ? irValidatePoliticalEntities : null;
if (ir0795PoliticalValidationBase) {
  irValidatePoliticalEntities = function (worldOrState, context) {
    const base = ir0795PoliticalValidationBase.apply(this, arguments);
    const world = ir0795WorldFromPoliticalContext(worldOrState);
    const errors = [...(base?.errors || []), ...ir0795PoliticalIdDomainErrors(world)];
    return { ...base, ok: errors.length === 0, errors: [...new Set(errors)] };
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.ir0795PoliticalIdDomainErrors = ir0795PoliticalIdDomainErrors;
  globalThis.ir0795SiteOwnershipErrors = ir0795SiteOwnershipErrors;
}
