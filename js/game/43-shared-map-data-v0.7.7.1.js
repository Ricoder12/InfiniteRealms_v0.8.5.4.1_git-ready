'use strict';
// Infinite Realms v0.7.7.1 — shared map data accessors.
// Read-only facade over the existing world/region/site/route registries; creates no duplicate geography.

function irMapSharedData(world = (typeof state !== 'undefined' ? state?.world : null)) {
  if (!world || typeof world !== 'object' || !world.region || typeof world.region !== 'object') return null;
  if (!Array.isArray(world.region.sites) || !Array.isArray(world.region.routes)) return null;
  return {
    world,
    region: world.region,
    locations: world.region.sites,
    connections: world.region.routes,
    continents: Array.isArray(world.continents) ? world.continents : null,
    countries: Array.isArray(world.countries) ? world.countries : null,
    geographyRefs: world.geography || null,
    biomes: typeof IR_BIOMES !== 'undefined' ? IR_BIOMES : null
  };
}

// Map-facing identity is always a stable geoId. Names, array indexes, and legacy IDs are not fallback keys.
function irMapLocationByGeoId(geoId, world = (typeof state !== 'undefined' ? state?.world : null)) {
  if (typeof geoId !== 'string' || !geoId) return null;
  const data = irMapSharedData(world);
  if (!data) return null;
  const matches = data.locations.filter(location => location?.geoId === geoId);
  return matches.length === 1 ? matches[0] : null;
}

function irMapConnectionByGeoId(connectionGeoId, world = (typeof state !== 'undefined' ? state?.world : null)) {
  if (typeof connectionGeoId !== 'string' || !connectionGeoId) return null;
  const data = irMapSharedData(world);
  if (!data) return null;
  const matches = data.connections.filter(connection => connection?.geoId === connectionGeoId);
  return matches.length === 1 ? matches[0] : null;
}

function irMapConnectionsForLocation(geoId, world = (typeof state !== 'undefined' ? state?.world : null)) {
  const data = irMapSharedData(world);
  const location = irMapLocationByGeoId(geoId, world);
  if (!data || !location) return [];
  // Return a view list of references to canonical route records, not cloned route objects.
  return data.connections.filter(connection => connection && (
    connection.fromGeoId === geoId || connection.toGeoId === geoId
  ));
}

function irMapLocationVisibility(geoId, world = (typeof state !== 'undefined' ? state?.world : null)) {
  const location = irMapLocationByGeoId(geoId, world);
  if (!location || !world) return null;
  const known = Array.isArray(world.known) ? world.known : [];
  const visited = Array.isArray(world.visited) ? world.visited : [];
  return {
    location,
    current: world.siteId === location.id,
    known: known.includes(location.id),
    visited: visited.includes(location.id),
    discovered: location.discovered === true
  };
}

function irMapBiomeForLocation(geoId, world = (typeof state !== 'undefined' ? state?.world : null)) {
  const location = irMapLocationByGeoId(geoId, world);
  if (!location || typeof IR_BIOMES === 'undefined') return null;
  return Object.prototype.hasOwnProperty.call(IR_BIOMES, location.biomeId) ? IR_BIOMES[location.biomeId] : null;
}
