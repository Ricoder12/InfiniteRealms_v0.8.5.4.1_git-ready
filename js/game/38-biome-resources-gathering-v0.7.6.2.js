'use strict';
// Infinite Realms v0.7.6.2 — biome-specific resource delivery and gathering safety.
// Extends the single IR_BIOMES registry; item definitions, recipes, carry rules, and game costs stay authoritative elsewhere.
const IR_V0762_BIOME_RESOURCE_VERSION = 1;
const IR_V0762_GATHERING_METHODS = ['mining','woodcutting','herbalism','fishing'];
const IR_V0762_EXPLORE_MODES = ['forage','scout'];

function ir0762KnownItem(itemId) {
  return typeof itemId === 'string' && !!itemId &&
    ((typeof ITEMS !== 'undefined' && Object.prototype.hasOwnProperty.call(ITEMS,itemId)) ||
     (typeof IR_V04_ITEM_DATA !== 'undefined' && Object.prototype.hasOwnProperty.call(IR_V04_ITEM_DATA,itemId)));
}

// Do not use site(), which intentionally falls back to the first site for rendering legacy screens.
// Actions require the actual current-location ID to resolve exactly.
function ir0762CurrentSite() {
  const w=state?.world, sites=w?.region?.sites;
  if (!w || !Array.isArray(sites) || typeof w.siteId !== 'string') return null;
  const matches=sites.filter(s=>s && s.id===w.siteId);
  return matches.length===1 ? matches[0] : null;
}

function ir0762ResourceContext(siteRecord, activity, kind='gathering') {
  if (!siteRecord) return {ok:false,reason:'The current location could not be resolved. No time or energy was spent.'};
  const resolved=irResolveBiomeProfile(siteRecord);
  if (resolved.fallback) return {ok:false,reason:'This location has a missing or unrecognized biome reference. Gathering is paused and the saved location was not changed.'};
  let items=[];
  if (kind==='gathering') {
    if (!IR_V0762_GATHERING_METHODS.includes(activity)) return {ok:false,reason:'Unknown gathering activity.'};
    if (!irBiomeGatheringAvailable(siteRecord,activity)) return {ok:false,reason:`${activity[0].toUpperCase()+activity.slice(1)} is not available in this location.`};
    items=irBiomeGatheringItems(siteRecord,activity);
  } else {
    if (!IR_V0762_EXPLORE_MODES.includes(activity)) return {ok:false,reason:'Unknown exploration activity.'};
    items=irBiomeResourceItems(siteRecord,activity);
  }
  if (!Array.isArray(items) || !items.length || items.some(id=>!ir0762KnownItem(id))) {
    return {ok:false,reason:'No valid resource profile is available here. No item was created.'};
  }
  return {ok:true,site:siteRecord,biomeId:resolved.id,profile:resolved.profile,items};
}

function irValidateBiomeResourceIntegrity(world=null) {
  const errors=[],warnings=[];
  const ids=Object.keys(IR_BIOMES||{});
  if (!ids.length) errors.push('The authoritative biome registry is empty.');
  if (new Set(ids).size!==ids.length) errors.push('Duplicate biome identifiers exist.');
  for (const biomeId of ids) {
    const p=IR_BIOMES[biomeId];
    if (!p || typeof p!=='object') {errors.push(`Biome ${biomeId} has no profile object.`);continue;}
    if (!Array.isArray(p.resources) || !p.resources.length) errors.push(`Biome ${biomeId} has no exploration resource profile.`);
    else for (const r of p.resources) if (!r || !ir0762KnownItem(r.itemId)) errors.push(`Biome ${biomeId} references unknown exploration item ${String(r?.itemId)}.`);
    if (!p.gatheringPools || typeof p.gatheringPools!=='object') {errors.push(`Biome ${biomeId} has no gathering pools.`);continue;}
    for (const method of IR_V0762_GATHERING_METHODS) {
      const pool=p.gatheringPools[method];
      if (!Array.isArray(pool) || !pool.length) errors.push(`Biome ${biomeId} has no ${method} pool.`);
      else for (const itemId of pool) if (!ir0762KnownItem(itemId)) errors.push(`Biome ${biomeId} ${method} pool references unknown item ${String(itemId)}.`);
    }
    if (!Array.isArray(p.gatheringAvailability) || p.gatheringAvailability.some(m=>!IR_V0762_GATHERING_METHODS.includes(m)) || new Set(p.gatheringAvailability).size!==p.gatheringAvailability.length) errors.push(`Biome ${biomeId} has invalid gathering availability.`);
    for (const method of p.gatheringAvailability||[]) if (!Array.isArray(p.gatheringPools?.[method]) || !p.gatheringPools[method].some(ir0762KnownItem)) errors.push(`Biome ${biomeId} marks ${method} available without a valid item pool.`);
  }
  if (world && typeof world==='object') {
    const sites=world.region?.sites;
    if (!Array.isArray(sites)) errors.push('World has no authoritative site array.');
    else {
      const siteIds=new Set();
      for (const s of sites) {
        if (!s || typeof s!=='object') {errors.push('World contains an invalid site record.');continue;}
        if (siteIds.has(s.id)) errors.push(`Duplicate site ID ${String(s.id)}.`); else siteIds.add(s.id);
        const r=irResolveBiomeProfile(s);
        if (r.fallback) errors.push(`Site ${String(s.id)} has no resolvable biome reference (${String(s.biomeId??s.biome??'missing')}).`);
        else if (!Array.isArray(r.profile.resources) || !r.profile.resources.length) errors.push(`Site ${String(s.id)} resolves to ${r.id} without exploration resources.`);
      }
      for (const id of world.known||[]) if (!siteIds.has(id)) warnings.push(`Known location ${String(id)} is unresolved; it was not rewritten.`);
      for (const id of world.visited||[]) if (!siteIds.has(id)) warnings.push(`Visited location ${String(id)} is unresolved; it was not rewritten.`);
      if (world.siteId && !siteIds.has(world.siteId)) errors.push(`Current location ${String(world.siteId)} is unresolved.`);
    }
  }
  return {ok:errors.length===0,errors,warnings,biomeCount:ids.length,itemDefinitionCount:typeof ITEMS!=='undefined'?Object.keys(ITEMS).length:0,schemaVersion:IR_V0762_BIOME_RESOURCE_VERSION};
}

// Enforce valid current-location and biome data at the action boundary, without duplicating the base rules.
// Existing skill-scaled success, energy, time, carry weight, XP, racial talents, and inventory logic remain in ir04Gather.
const ir0762GatherBase = ir04Gather;
ir04Gather = function(method) {
  if (!state?.character) return ir0762GatherBase(method);
  const context=ir0762ResourceContext(ir0762CurrentSite(),method,'gathering');
  if (!context.ok) { if (typeof toast==='function') toast(context.reason); return; }
  return ir0762GatherBase(method);
};

const ir0762ExploreBase = irExplore;
irExplore = function(mode='scout') {
  if (IR_V0762_EXPLORE_MODES.includes(mode)) {
    const context=ir0762ResourceContext(ir0762CurrentSite(),mode,'exploration');
    if (!context.ok) { if (typeof toast==='function') toast(context.reason); return; }
  }
  return ir0762ExploreBase(mode);
};

// Avoid presenting the woodland safety fallback as a real gathering site when a save has a broken location/biome reference.
const ir0762GatherPanelBase=ir04GatherPanel;
ir04GatherPanel=function() {
  const s=ir0762CurrentSite();
  if (!s || irResolveBiomeProfile(s).fallback) {
    return `<section class="panel panel-pad ir04-block" style="margin-top:15px"><div class="panel-heading"><div><h3>Gather resources</h3><p>Gathering is paused because the current location or biome reference could not be resolved. The saved world has not been changed.</p></div><span class="tag">Biome unavailable</span></div></section>`;
  }
  return ir0762GatherPanelBase();
};

if (typeof document!=='undefined') document.title='Infinite Realms — Version 0.7.6.2';
