'use strict';
// Infinite Realms v0.7.8.5 — descriptive government, leadership and capital metadata.
// Political records reference existing geography and NPCs; this module creates no people,
// government simulations, political actions, succession rules, or save-schema migration.

const IR_POLITICAL_GOVERNMENT_TYPES = Object.freeze([
  'monarchy',
  'council',
  'republic',
  'tribal-leadership',
  'city-state-administration',
  'other'
]);
const IR_POLITICAL_GOVERNMENT_LABELS = Object.freeze({
  monarchy: 'Monarchy',
  council: 'Council',
  republic: 'Republic',
  'tribal-leadership': 'Tribal leadership',
  'city-state-administration': 'City-state administration',
  other: 'Other government'
});

function ir0785Context(worldOrState, characterOverride) {
  if (worldOrState && typeof worldOrState === 'object' && worldOrState.world && worldOrState.character) {
    return { world: worldOrState.world, character: worldOrState.character };
  }
  let character = characterOverride || null;
  if (characterOverride && characterOverride.character && characterOverride.world) character = characterOverride.character;
  return { world: worldOrState, character };
}

// Resolve a reference to an existing person. Character NPC records are the active identity source;
// world.v06.changes is the existing persistence overlay for location-generated residents.
// A matching ID in both stores is the same person, not a reason to create another NPC.
function irResolvePoliticalLeader(worldOrState, npcId, characterOverride) {
  const { world, character } = ir0785Context(worldOrState, characterOverride);
  if (npcId === undefined || npcId === null || npcId === '') {
    return { ok: true, status: 'unassigned', npc: null, id: null };
  }
  if (typeof npcId !== 'string' || !npcId.trim()) {
    return { ok: false, status: 'invalid-reference', npc: null, id: null };
  }
  const id = npcId.trim();
  const charRecords = Array.isArray(character?.npcs) ? character.npcs.filter(npc => npc && typeof npc === 'object' && npc.id === id) : [];
  const worldRecords = Array.isArray(world?.npcs) ? world.npcs.filter(npc => npc && typeof npc === 'object' && npc.id === id) : [];
  const changeRecords = Object.entries(world?.v06?.changes && typeof world.v06.changes === 'object' ? world.v06.changes : {})
    .filter(([key, npc]) => npc && typeof npc === 'object' && (npc.id === id || (key === id && npc.id === undefined)))
    .map(([, npc]) => npc);

  if (charRecords.length > 1 || worldRecords.length > 1 || changeRecords.length > 1) {
    return { ok: false, status: 'ambiguous-reference', npc: null, id };
  }
  // Character and world.v06 may both hold the same stable NPC ID as live record + persistence overlay.
  const npc = charRecords[0] || worldRecords[0] || changeRecords[0] || null;
  if (!npc) return { ok: false, status: 'unresolved-reference', npc: null, id };
  return { ok: true, status: 'resolved', npc, id };
}

// Existing factory remains the only political-record constructor. Extend it with descriptive fields;
// do not create an NPC/person record here and do not duplicate capital/site data.
const ir0785CreatePoliticalEntityRecordBase = typeof irCreatePoliticalEntityRecord === 'function'
  ? irCreatePoliticalEntityRecord : null;
if (ir0785CreatePoliticalEntityRecordBase) {
  irCreatePoliticalEntityRecord = function (world, input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const record = ir0785CreatePoliticalEntityRecordBase(world, source);
    if (!record || typeof record !== 'object') return record;
    for (const field of ['governmentType', 'governmentDescription', 'leaderNpcId', 'leaderTitle']) {
      if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
      const value = source[field];
      if (value === undefined || value === null || value === '') continue;
      record[field] = value;
    }
    return record;
  };
}

function ir0785RegionIndex(world) {
  const regions = typeof irGetGeographicRegions === 'function'
    ? irGetGeographicRegions(world)
    : (world?.region ? [world.region] : []);
  const byId = new Map();
  for (const region of regions) {
    if (typeof region?.id !== 'string' || !region.id) continue;
    if (!byId.has(region.id)) byId.set(region.id, []);
    byId.get(region.id).push(region);
  }
  return { regions, byId };
}

function ir0785RegionIsWithin(world, candidateRegionId, territoryRootId) {
  const { byId } = ir0785RegionIndex(world);
  const matches = byId.get(candidateRegionId) || [];
  if (matches.length !== 1) return false;
  const seen = new Set();
  let cursor = matches[0];
  while (cursor && typeof cursor.id === 'string' && !seen.has(cursor.id)) {
    if (cursor.id === territoryRootId) return true;
    seen.add(cursor.id);
    const parentId = cursor.parentRegionId;
    if (typeof parentId !== 'string' || !parentId) break;
    const parents = byId.get(parentId) || [];
    if (parents.length !== 1) break;
    cursor = parents[0];
  }
  return false;
}

function ir0785ExplicitTerritoryRegions(world, polity) {
  const { regions } = ir0785RegionIndex(world);
  // Only explicit regional ownership/governance refs are authoritative territory here.
  // polity.regionIds are geographic anchors in the earlier schema and are not silently
  // reinterpreted as ownership.
  return regions.filter(region => region && (
    region.ownerPolityId === polity?.id || region.governingPolityId === polity?.id
  ));
}

function ir0785ValidateCapitalTerritory(world, polity, errors) {
  if (!polity || typeof polity.capitalSiteGeoId !== 'string' || !polity.capitalSiteGeoId) return;
  const geo = typeof irPoliticalEntityGeographicRecords === 'function'
    ? irPoliticalEntityGeographicRecords(world)
    : { sitesByGeoId: new Map(), regions: [] };
  const siteMatches = geo.sitesByGeoId?.get(polity.capitalSiteGeoId) || [];
  if (siteMatches.length !== 1) return; // Base validator reports unresolved/ambiguous capital refs.
  const territory = ir0785ExplicitTerritoryRegions(world, polity);
  if (!territory.length) return; // Territory is not assigned yet; there is not enough data to infer it.
  const site = siteMatches[0];
  const siteRegionId = site.regionId || world?.region?.id;
  const inTerritory = territory.some(region => ir0785RegionIsWithin(world, siteRegionId, region.id));
  if (!inTerritory) {
    errors.push(`Political entity ${polity.id || '(unknown)'} capital ${polity.capitalSiteGeoId} is outside its explicitly referenced political territory`);
  }
}

// Extend the existing validator. Calls that only have a world can validate data types and capitals;
// full NPC resolution is performed when the state/character context is available (e.g. save/load).
const ir0785ValidatePoliticalEntitiesBase = typeof irValidatePoliticalEntities === 'function'
  ? irValidatePoliticalEntities : null;
if (ir0785ValidatePoliticalEntitiesBase) {
  irValidatePoliticalEntities = function (worldOrState, context) {
    const firstIsState = !!(worldOrState && worldOrState.world && worldOrState.character);
    const world = firstIsState ? worldOrState.world : worldOrState;
    const stateContext = firstIsState ? worldOrState : context;
    const characterContext = stateContext?.character
      ? stateContext.character
      : (Array.isArray(stateContext?.npcs) ? stateContext : null);
    const report = ir0785ValidatePoliticalEntitiesBase(world);
    if (!world || !Array.isArray(world.polities)) return report;

    for (const polity of world.polities) {
      if (!polity || typeof polity !== 'object' || Array.isArray(polity)) continue;
      const label = typeof polity.id === 'string' && polity.id ? polity.id : '(unknown)';
      if (polity.governmentType !== undefined && polity.governmentType !== null && polity.governmentType !== '' &&
          (typeof polity.governmentType !== 'string' || !IR_POLITICAL_GOVERNMENT_TYPES.includes(polity.governmentType))) {
        report.errors.push(`Political entity ${label} has unsupported governmentType ${String(polity.governmentType)}`);
      }
      for (const field of ['governmentDescription', 'leaderTitle']) {
        if (polity[field] !== undefined && polity[field] !== null && typeof polity[field] !== 'string') {
          report.errors.push(`Political entity ${label} has invalid optional ${field}`);
        }
      }
      if (polity.leaderNpcId !== undefined && polity.leaderNpcId !== null && polity.leaderNpcId !== '') {
        if (typeof polity.leaderNpcId !== 'string' || !polity.leaderNpcId.trim()) {
          report.errors.push(`Political entity ${label} has invalid leaderNpcId`);
        } else if (characterContext) {
          const resolved = irResolvePoliticalLeader(world, polity.leaderNpcId, characterContext);
          if (!resolved.ok) report.errors.push(`Political entity ${label} leaderNpcId ${polity.leaderNpcId} is ${resolved.status}`);
        }
      }
      ir0785ValidateCapitalTerritory(world, polity, report.errors);
    }
    report.ok = report.errors.length === 0;
    return report;
  };
}

function irGetPoliticalEntitySummary(worldOrState, polityId, characterOverride) {
  const { world, character } = ir0785Context(worldOrState, characterOverride);
  if (!world || typeof polityId !== 'string' || !Array.isArray(world.polities)) return null;
  const matches = world.polities.filter(polity => polity && polity.id === polityId);
  if (matches.length !== 1) return null;
  const polity = matches[0];
  const geo = typeof irPoliticalEntityGeographicRecords === 'function'
    ? irPoliticalEntityGeographicRecords(world)
    : { sitesByGeoId: new Map(), regions: [] };

  let capital = null;
  if (typeof polity.capitalSiteGeoId === 'string') {
    const sites = geo.sitesByGeoId?.get(polity.capitalSiteGeoId) || [];
    if (sites.length === 1) {
      capital = { geoId: sites[0].geoId, name: sites[0].name || null, regionId: sites[0].regionId || world.region?.id || null };
    }
  }

  let leader = null, leaderStatus = 'unassigned';
  if (typeof polity.leaderNpcId === 'string' && polity.leaderNpcId) {
    const resolved = irResolvePoliticalLeader(world, polity.leaderNpcId, character);
    leaderStatus = resolved.status;
    if (resolved.ok && resolved.npc) {
      leader = { npcId: resolved.id, name: typeof resolved.npc.name === 'string' && resolved.npc.name.trim() ? resolved.npc.name : null,
        title: typeof polity.leaderTitle === 'string' && polity.leaderTitle.trim() ? polity.leaderTitle : null };
    }
  }

  const regions = typeof irGetGeographicRegions === 'function'
    ? irGetGeographicRegions(world)
    : (world.region ? [world.region] : []);
  const owned = regions.filter(region => region?.ownerPolityId === polity.id);
  const governed = regions.filter(region => region?.governingPolityId === polity.id);
  const controlledIds = new Set([...owned, ...governed].map(region => region.id).filter(id => typeof id === 'string' && id));
  const ownershipKnown = owned.length > 0 || governed.length > 0;

  return {
    id: polity.id,
    name: polity.name,
    type: polity.type,
    governmentType: polity.governmentType || null,
    governmentLabel: polity.governmentType ? (IR_POLITICAL_GOVERNMENT_LABELS[polity.governmentType] || polity.governmentType) : null,
    governmentDescription: typeof polity.governmentDescription === 'string' && polity.governmentDescription.trim() ? polity.governmentDescription : null,
    capital,
    leader,
    leaderNpcId: typeof polity.leaderNpcId === 'string' ? polity.leaderNpcId : null,
    leaderStatus,
    leaderTitle: typeof polity.leaderTitle === 'string' && polity.leaderTitle.trim() ? polity.leaderTitle : null,
    ownedRegionCount: owned.length || null,
    governedRegionCount: governed.length || null,
    controlledRegionCount: ownershipKnown ? controlledIds.size : null,
    controlledRegionCountKnown: ownershipKnown
  };
}

// Save/load runs through the existing normalization chain. Do not migrate the schema, create
// people, assign governments, or coerce malformed optional fields; validate and preserve records.
const ir0785NormalizeSaveBase = typeof normalizeSave === 'function' ? normalizeSave : null;
if (ir0785NormalizeSaveBase) {
  normalizeSave = function () {
    const normalized = ir0785NormalizeSaveBase.apply(this, arguments);
    if (normalized?.world) {
      if (typeof irEnsurePoliticalEntityRegistry === 'function') irEnsurePoliticalEntityRegistry(normalized.world);
      const report = irValidatePoliticalEntities(normalized.world, normalized);
      if (!report.ok && typeof console !== 'undefined' && console.warn) {
        console.warn('[Infinite Realms] Government/leadership/capital validation:', report.errors);
      }
    }
    return normalized;
  };
}

// Release branding only. No political gameplay or legacy save-version changes.
if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.8.5';
const ir0785ShellBase = typeof shell === 'function' ? shell : null;
if (ir0785ShellBase) shell = function () { return ir0785ShellBase.apply(this, arguments).replace(/0\.7\.8\.3/g, '0.7.8.5'); };
const ir0785RenderTitleBase = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0785RenderTitleBase) renderTitle = function () { return ir0785RenderTitleBase.apply(this, arguments).replace(/0\.7\.8\.3/g, '0.7.8.5'); };
const ir0785RenderCharacterBase = typeof renderCharacter === 'function' ? renderCharacter : null;
if (ir0785RenderCharacterBase) renderCharacter = function () {
  const html = ir0785RenderCharacterBase.apply(this, arguments);
  return typeof html === 'string' ? html.replace(/CHARACTER STATUS · v0\.7\.8\.3/g, 'CHARACTER STATUS · v0.7.8.5') : html;
};

if (typeof globalThis !== 'undefined') {
  globalThis.IR_POLITICAL_GOVERNMENT_TYPES = IR_POLITICAL_GOVERNMENT_TYPES;
  globalThis.IR_POLITICAL_GOVERNMENT_LABELS = IR_POLITICAL_GOVERNMENT_LABELS;
  globalThis.irResolvePoliticalLeader = irResolvePoliticalLeader;
  globalThis.irGetPoliticalEntitySummary = irGetPoliticalEntitySummary;
}
