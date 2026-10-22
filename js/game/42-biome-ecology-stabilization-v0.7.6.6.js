'use strict';
// Infinite Realms v0.7.6.6 — biome ecology stabilization and conservative invalid-reference handling.
// This layer validates existing systems and prevents invalid saved biome IDs from silently becoming Woodland encounters.
// It does not regenerate worlds, rewrite saved biome IDs, or change combat/reward data.
const IR_V0766_ECOLOGY_VERSION = 1;

function ir0766KnownItem(itemId) {
  return typeof itemId === 'string' && !!itemId &&
    ((typeof ITEMS !== 'undefined' && Object.prototype.hasOwnProperty.call(ITEMS, itemId)) ||
     (typeof IR_V04_ITEM_DATA !== 'undefined' && Object.prototype.hasOwnProperty.call(IR_V04_ITEM_DATA, itemId)));
}

function irValidateBiomeEcology(world = null) {
  const errors = [], warnings = [];
  const biomeIds = Object.keys(IR_BIOMES || {});
  if (!biomeIds.length) errors.push('The authoritative biome registry is empty.');
  if (new Set(biomeIds).size !== biomeIds.length) errors.push('Duplicate biome IDs exist in the authoritative registry.');
  const methods = Array.isArray(IR_V0762_GATHERING_METHODS) ? IR_V0762_GATHERING_METHODS : ['mining','woodcutting','herbalism','fishing'];
  for (const id of biomeIds) {
    const p = IR_BIOMES[id];
    if (!p || typeof p !== 'object') { errors.push(`Biome ${id} has no profile object.`); continue; }
    if (typeof p.name !== 'string' || !p.name.trim()) errors.push(`Biome ${id} has no display name.`);
    if (!Array.isArray(p.resources) || !p.resources.length) errors.push(`Biome ${id} has no exploration resources.`);
    for (const r of p.resources || []) {
      if (!r || !ir0766KnownItem(r.itemId)) errors.push(`Biome ${id} references unknown exploration item ${String(r?.itemId)}.`);
      for (const weightKey of ['forageWeight','scoutWeight']) {
        const weight = r?.[weightKey];
        if (!Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 20) errors.push(`Biome ${id} has invalid ${weightKey} for ${String(r?.itemId)}.`);
      }
    }
    if (!p.gatheringPools || typeof p.gatheringPools !== 'object') errors.push(`Biome ${id} has no gathering pool registry.`);
    for (const method of methods) {
      const pool = p.gatheringPools?.[method];
      if (!Array.isArray(pool) || !pool.length) errors.push(`Biome ${id} has no ${method} pool.`);
      for (const itemId of pool || []) if (!ir0766KnownItem(itemId)) errors.push(`Biome ${id} ${method} references unknown item ${String(itemId)}.`);
    }
    if (!Array.isArray(p.gatheringAvailability) || new Set(p.gatheringAvailability).size !== p.gatheringAvailability.length || p.gatheringAvailability.some(m => !methods.includes(m))) errors.push(`Biome ${id} has invalid gathering availability.`);
    for (const method of p.gatheringAvailability || []) if (!(p.gatheringPools?.[method] || []).some(ir0766KnownItem)) errors.push(`Biome ${id} marks ${method} available without valid resources.`);
  }

  const hazardReport = typeof irValidateEnvironmentalHazards === 'function' ? irValidateEnvironmentalHazards(world) : {ok:false,errors:['Environmental hazard validator is unavailable.'],warnings:[]};
  const affinityReport = typeof irValidateRacialBiomeAffinities === 'function' ? irValidateRacialBiomeAffinities() : {ok:false,errors:['Racial affinity validator is unavailable.'],warnings:[]};
  const habitatReport = typeof irValidateMonsterHabitats === 'function' ? irValidateMonsterHabitats() : {ok:false,errors:['Monster habitat validator is unavailable.'],warnings:[]};
  for (const [label, report] of [['Hazard',hazardReport],['Affinity',affinityReport],['Habitat',habitatReport]]) {
    for (const error of report.errors || []) errors.push(`${label}: ${error}`);
    for (const warning of report.warnings || []) warnings.push(`${label}: ${warning}`);
  }
  const profileReport = typeof irValidateBiomeProfiles === 'function' ? irValidateBiomeProfiles(world) : {ok:false,errors:['Biome profile validator is unavailable.'],warnings:[]};
  for (const error of profileReport.errors || []) errors.push(`Profile: ${error}`);
  for (const warning of profileReport.warnings || []) warnings.push(`Profile: ${warning}`);

  if (world) {
    const sites = world.region?.sites;
    if (!Array.isArray(sites)) errors.push('World has no site array.');
    else {
      const ids = new Set(), geoIds = new Set();
      for (const s of sites) {
        if (!s || typeof s !== 'object') { errors.push('World contains an invalid site record.'); continue; }
        if (typeof s.id !== 'string' || !s.id) errors.push('A site is missing its stable local ID.');
        else if (ids.has(s.id)) errors.push(`Duplicate site ID ${s.id}.`);
        else ids.add(s.id);
        if (s.geoId) { if (geoIds.has(s.geoId)) errors.push(`Duplicate geographic ID ${s.geoId}.`); else geoIds.add(s.geoId); }
        const resolved = irResolveBiomeProfile(s);
        if (resolved.fallback) errors.push(`Site ${String(s.id)} has an unresolved biome reference.`);
      }
      if (world.siteId && !ids.has(world.siteId)) errors.push(`Current site ${world.siteId} does not resolve.`);
      for (const route of world.region?.routes || []) {
        if (route.from && !ids.has(route.from)) warnings.push(`Route has unresolved local origin ${route.from}.`);
        if (route.to && !ids.has(route.to)) warnings.push(`Route has unresolved local destination ${route.to}.`);
      }
    }
    for (const fn of ['irValidateGeographicIds','irValidateGeographicHierarchy','ir0755ValidateGeographicIntegrity']) {
      if (typeof globalThis !== 'undefined' && typeof globalThis[fn] === 'function') {
        try {
          const report = globalThis[fn](world);
          for (const error of report.errors || []) errors.push(`Geography (${fn}): ${error}`);
          for (const warning of report.warnings || []) warnings.push(`Geography (${fn}): ${warning}`);
        } catch (e) { warnings.push(`Geography validator ${fn} could not run: ${e.message}`); }
      }
    }
  }
  return {ok:errors.length===0, errors:[...new Set(errors)], warnings:[...new Set(warnings)], biomeCount:biomeIds.length,
    resourceItemCount:typeof ITEMS!=='undefined'?Object.keys(ITEMS).length:0,
    raceCount:Object.keys(IR_V0764_RACIAL_AFFINITIES||{}).length,
    raceBiomeCells:Object.keys(IR_V0764_RACIAL_AFFINITIES||{}).length*biomeIds.length,
    hazardCount:Object.keys(IR_V0763_BIOME_HAZARDS||{}).length,
    habitatCount:Object.keys(IR_V0765_MONSTER_HABITATS||{}).length,
    schemaVersion:IR_V0766_ECOLOGY_VERSION};
}

// Invalid/corrupt biome references may use the woodland profile for display only. They must not silently
// create a Woodland random encounter or hunting target. Recognized legacy labels (including "cave") still resolve normally.
// Some historical regression harnesses intentionally omit v0.7.6.5; in that case this integration is a safe no-op.
if (typeof ir0765IsHabitatEligible === 'function' && typeof ir0765HabitatEncounterIds === 'function') {
  const ir0766HabitatEligibilityBase = ir0765IsHabitatEligible;
  ir0765IsHabitatEligible = function(id, siteOrId, purpose = 'random') {
    if (purpose !== 'settlement' && purpose !== 'dungeon') {
      const resolved = irResolveBiomeProfile(siteOrId);
      if (!resolved || resolved.fallback) return false;
    }
    return ir0766HabitatEligibilityBase(id, siteOrId, purpose);
  };
  const ir0766HabitatIdsBase = ir0765HabitatEncounterIds;
  ir0765HabitatEncounterIds = function(siteOrId, purpose = 'random', candidates = null) {
    if (purpose !== 'settlement' && purpose !== 'dungeon') {
      const resolved = irResolveBiomeProfile(siteOrId);
      if (!resolved || resolved.fallback) return [];
    }
    return ir0766HabitatIdsBase(siteOrId, purpose, candidates);
  };
  const ir0766EnemyForSiteBase = irEnemyForSite;
  irEnemyForSite = function(forceId = null) {
    if (forceId && IR_ENEMIES?.[forceId]) return ir0766EnemyForSiteBase(forceId);
    const s = typeof site === 'function' ? site() : null;
    if (s && s.type !== 'settlement' && irResolveBiomeProfile(s).fallback) return null;
    return ir0766EnemyForSiteBase(forceId);
  };
  const ir0766StartCombatBase = startCombat;
  startCombat = function(enemyId = null, source = {type:'wild'}) {
    if (!(typeof enemyId === 'string' && IR_ENEMIES?.[enemyId])) {
      const s = typeof site === 'function' ? site() : null;
      if (s && s.type !== 'settlement' && irResolveBiomeProfile(s).fallback) {
        if (source && typeof source === 'object' && source.type === 'spar') {
          // Preserve the existing controlled spar flow; this is not a wild biome encounter and the spar handler suppresses loot/death.
          return ir0766StartCombatBase('goblin', source);
        }
        if (typeof toast === 'function') toast('This location has an unresolved biome reference. Random encounters are paused until the saved location data is repaired.');
        return false;
      }
    }
    return ir0766StartCombatBase.apply(this, arguments);
  };
}

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.6.6';
