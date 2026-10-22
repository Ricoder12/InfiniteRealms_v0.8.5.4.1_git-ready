'use strict';
// Infinite Realms v0.7.6.1 — validation and compatibility checks for the authoritative IR_BIOMES registry.
// This module adds no biome gameplay effects and does not rewrite saved sites.
const IR_BIOME_PROFILE_SCHEMA_VERSION = 1;

function irValidateBiomeProfiles(world = null) {
  const errors = [], warnings = [];
  const keys = Object.keys(IR_BIOMES || {});
  if (!keys.length) errors.push('Biome registry is empty');
  if (new Set(keys).size !== keys.length) errors.push('Duplicate biome registry keys');

  for (const key of keys) {
    const p = IR_BIOMES[key];
    if (!p || typeof p !== 'object') { errors.push(`Biome ${key} has no profile object`); continue; }
    if (!/^[a-z][a-z0-9_-]*$/.test(key)) errors.push(`Biome key ${key} is not a stable identifier`);
    if (typeof p.name !== 'string' || !p.name.trim()) errors.push(`Biome ${key} has no display name`);
    if (typeof p.desc !== 'string' || !p.desc.trim()) errors.push(`Biome ${key} has no description`);
    if (typeof p.icon !== 'string' || !p.icon.trim()) errors.push(`Biome ${key} has no icon`);
    if (typeof p.terrain !== 'string' || !p.terrain.trim()) errors.push(`Biome ${key} has no terrain classification`);
    if (!Array.isArray(p.opportunities) || !p.opportunities.length) errors.push(`Biome ${key} has no opportunities list`);
    if (!Array.isArray(p.conditions) || !p.conditions.length || p.conditions.some(x => typeof x !== 'string' || !x.trim())) errors.push(`Biome ${key} has missing or invalid environmental conditions`);
    if (!Array.isArray(p.habitats) || !p.habitats.length || p.habitats.some(x => typeof x !== 'string' || !x.trim())) errors.push(`Biome ${key} has missing or invalid habitat categories`);
    if (!Number.isFinite(Number(p.foragingChanceModifier)) || Number(p.foragingChanceModifier) < -1 || Number(p.foragingChanceModifier) > 1) errors.push(`Biome ${key} has invalid existing foraging modifier`);
    if (!Array.isArray(p.resources) || !p.resources.length) { errors.push(`Biome ${key} has no resource records`); continue; }
    const itemIds = new Set(), categories = new Set();
    for (const resource of p.resources) {
      if (!resource || typeof resource !== 'object') { errors.push(`Biome ${key} has an invalid resource record`); continue; }
      if (typeof resource.category !== 'string' || !resource.category.trim()) errors.push(`Biome ${key} has a resource without a category`);
      else if (categories.has(resource.category)) errors.push(`Biome ${key} repeats resource category ${resource.category}`);
      else categories.add(resource.category);
      if (typeof resource.itemId !== 'string' || !resource.itemId.trim()) errors.push(`Biome ${key} has a resource without an itemId`);
      else {
        if (itemIds.has(resource.itemId)) errors.push(`Biome ${key} repeats resource item ${resource.itemId}`);
        itemIds.add(resource.itemId);
        const itemKnown = (typeof ITEMS !== 'undefined' && Object.prototype.hasOwnProperty.call(ITEMS, resource.itemId)) ||
          (typeof IR_V04_ITEM_DATA !== 'undefined' && Object.prototype.hasOwnProperty.call(IR_V04_ITEM_DATA, resource.itemId));
        if (!itemKnown) errors.push(`Biome ${key} resource item ${resource.itemId} is not present in existing item definitions`);
      }
      for (const weightKey of ['forageWeight','scoutWeight']) {
        const weight = Number(resource[weightKey]);
        if (!Number.isInteger(weight) || weight < 0 || weight > 20) errors.push(`Biome ${key} resource ${resource.itemId || '(unknown)'} has invalid ${weightKey}`);
      }
    }
    if (!p.resources.some(r => Number(r?.forageWeight) > 0)) errors.push(`Biome ${key} has no foraging resources`);
    if (!p.resources.some(r => Number(r?.scoutWeight) > 0)) errors.push(`Biome ${key} has no scouting resources`);
    const gatheringMethods = ['mining','woodcutting','herbalism','fishing'];
    if (!p.gatheringPools || typeof p.gatheringPools !== 'object') errors.push(`Biome ${key} has no gathering pools`);
    else for (const method of gatheringMethods) {
      const pool = p.gatheringPools[method];
      if (!Array.isArray(pool) || !pool.length) errors.push(`Biome ${key} has no ${method} gathering pool`);
      else for (const itemId of pool) {
        const itemKnown = (typeof ITEMS !== 'undefined' && Object.prototype.hasOwnProperty.call(ITEMS, itemId)) ||
          (typeof IR_V04_ITEM_DATA !== 'undefined' && Object.prototype.hasOwnProperty.call(IR_V04_ITEM_DATA, itemId));
        if (typeof itemId !== 'string' || !itemKnown) errors.push(`Biome ${key} ${method} pool references unknown item ${String(itemId)}`);
      }
    }
    if (!Array.isArray(p.gatheringAvailability) || new Set(p.gatheringAvailability).size !== p.gatheringAvailability.length || p.gatheringAvailability.some(method => !gatheringMethods.includes(method))) errors.push(`Biome ${key} has invalid gathering availability metadata`);
    if (typeof IR_BIOME_ENEMIES !== 'undefined') {
      const pool = IR_BIOME_ENEMIES[key];
      if (!Array.isArray(pool) || !pool.length) errors.push(`Biome ${key} has no existing encounter pool`);
      else if (typeof IR_ENEMIES !== 'undefined') for (const id of pool) if (!Object.prototype.hasOwnProperty.call(IR_ENEMIES, id)) errors.push(`Biome ${key} references unknown encounter ${id}`);
    }
  }

  if (world && typeof world === 'object') {
    const sites = world.region?.sites;
    if (!Array.isArray(sites)) errors.push('World has no site array for biome-reference validation');
    else {
      for (const site of sites) {
        if (!site || typeof site !== 'object') { errors.push('World contains an invalid site record'); continue; }
        if (typeof site.biomeId !== 'string' || !Object.prototype.hasOwnProperty.call(IR_BIOMES, site.biomeId)) {
          errors.push(`Site ${site.id || '(unknown)'} has missing or invalid biomeId ${String(site.biomeId ?? '(missing)')}`);
          const fallback = irResolveBiomeProfile(site);
          if (fallback.fallback) warnings.push(`Site ${site.id || '(unknown)'} uses the safe woodland profile at runtime; saved biome assignment was not changed`);
          else warnings.push(`Site ${site.id || '(unknown)'} can resolve via ${fallback.source}, but its saved biomeId was not changed`);
          continue;
        }
        const profile = IR_BIOMES[site.biomeId];
        if (typeof site.biome === 'string' && site.biome.trim() && site.biome.trim() !== profile.name) warnings.push(`Site ${site.id || site.geoId || '(unknown)'} has legacy biome label '${site.biome}' that differs from profile '${profile.name}'`);
        if (Array.isArray(site.opportunities) && JSON.stringify(site.opportunities) !== JSON.stringify(profile.opportunities)) warnings.push(`Site ${site.id || '(unknown)'} has a legacy opportunities snapshot that differs from profile ${site.biomeId}`);
      }
    }
  }
  return {ok:errors.length===0, errors, warnings, profileCount:keys.length, siteCount:Array.isArray(world?.region?.sites)?world.region.sites.length:null, schemaVersion:IR_BIOME_PROFILE_SCHEMA_VERSION};
}

// Generation should be already valid by construction; validate without changing the seeded output.
const ir0761GenerateBase = generateProceduralWorld;
generateProceduralWorld = function(seedInput, startCircumstance = 'settlement') {
  const world = ir0761GenerateBase(seedInput, startCircumstance);
  const report = irValidateBiomeProfiles(world);
  if (!report.ok && typeof console !== 'undefined' && console.warn) console.warn('[Infinite Realms] Generated world has biome-profile issues:', report.errors);
  return world;
};

// Saved worlds are inspected after the existing migration chain. This adds no profile snapshots and
// deliberately leaves missing/invalid assignments unchanged for transparent diagnostics.
const ir0761NormalizeBase = normalizeSave;
normalizeSave = function(input) {
  const normalized = ir0761NormalizeBase(input);
  if (normalized?.world) {
    const report = irValidateBiomeProfiles(normalized.world);
    if (!report.ok && typeof console !== 'undefined' && console.warn) console.warn('[Infinite Realms] Loaded world has biome-profile issues:', report.errors);
  }
  return normalized;
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.6.1';
