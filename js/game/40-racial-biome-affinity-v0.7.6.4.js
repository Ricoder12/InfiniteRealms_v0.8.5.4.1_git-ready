'use strict';
// Infinite Realms v0.7.6.4 — modest racial-biome affinities.
// A single resolver supplies gathering, hazard, and UI feedback. Neutral affinities never restrict access.
const IR_V0764_AFFINITY_VERSION = 1;
const IR_V0764_AFFINITY_BIOMES = Object.freeze(['forest','plains','mountain','swamp','desert','snow','coast','river','woodland']);
const IR_V0764_RACIAL_AFFINITIES = Object.freeze({
  human:    {label:'Adaptive',      biomes:{forest:'adaptive',plains:'adaptive',mountain:'adaptive',swamp:'adaptive',desert:'adaptive',snow:'adaptive',coast:'adaptive',river:'adaptive',woodland:'adaptive'}},
  dwarf:    {label:'Stonewise',     biomes:{mountain:'strong',forest:'familiar',woodland:'familiar'}},
  elf:      {label:'Greenward',     biomes:{forest:'strong',woodland:'strong',river:'familiar',snow:'familiar'}},
  beastkin: {label:'Wildsense',     biomes:{forest:'strong',plains:'strong',woodland:'strong',river:'familiar',snow:'familiar'}},
  orc:      {label:'Hardy',         biomes:{mountain:'strong',snow:'strong',desert:'familiar',plains:'familiar'}},
  goblin:   {label:'Scavengerwise', biomes:{woodland:'strong',swamp:'strong',mountain:'familiar',desert:'familiar'}},
  demonkin: {label:'Umbral',        biomes:{swamp:'strong',mountain:'strong',snow:'familiar',forest:'familiar'}},
  slimefolk:{label:'Moisturebound', biomes:{swamp:'strong',river:'strong',coast:'strong',forest:'familiar'}}
});
const IR_V0764_AFFINITY_MODIFIERS = Object.freeze({
  strong:   Object.freeze({gatherChanceBonus:0.04,hazardEnergyReduction:1}),
  familiar: Object.freeze({gatherChanceBonus:0.015,hazardEnergyReduction:0}),
  adaptive: Object.freeze({gatherChanceBonus:0.01,hazardEnergyReduction:0}),
  neutral:  Object.freeze({gatherChanceBonus:0,hazardEnergyReduction:0})
});
function ir0764AffinityForSite(raceId, siteRecord) {
  const resolved=siteRecord && typeof irResolveBiomeProfile==='function' ? irResolveBiomeProfile(siteRecord) : null;
  if (!resolved || resolved.fallback || !IR_V0764_AFFINITY_BIOMES.includes(resolved.id)) {
    return {valid:false,raceId:IR_V0764_RACIAL_AFFINITIES[raceId]?raceId:'human',biomeId:null,level:'neutral',label:'Neutral',gatherChanceBonus:0,hazardEnergyReduction:0};
  }
  const validRace=Object.prototype.hasOwnProperty.call(IR_V0764_RACIAL_AFFINITIES,raceId);
  // Unknown/corrupt race IDs must not inherit Human's adaptive bonus.
  const race=validRace?raceId:'human';
  const level=validRace?(IR_V0764_RACIAL_AFFINITIES[race].biomes[resolved.id]||'neutral'):'neutral';
  const mods=IR_V0764_AFFINITY_MODIFIERS[level]||IR_V0764_AFFINITY_MODIFIERS.neutral;
  return {valid:true,raceId:race,biomeId:resolved.id,level,label:({strong:'Strong affinity',familiar:'Familiar terrain',adaptive:'Adaptive presence',neutral:'No special affinity'})[level],gatherChanceBonus:mods.gatherChanceBonus,hazardEnergyReduction:mods.hazardEnergyReduction};
}
function ir0764GatherChanceBonus(raceId,siteRecord,method) {
  const a=ir0764AffinityForSite(raceId,siteRecord);
  if (!a.valid) return 0;
  // Dwarf mining already receives the legacy +10 percentage-point racial chance modifier in ir04Gather.
  if (raceId==='dwarf' && method==='mining') return 0;
  return a.gatherChanceBonus;
}
function ir0764HazardEnergyReduction(siteRecord) {
  const a=ir0764AffinityForSite(state?.character?.race,siteRecord);
  return a.valid ? a.hazardEnergyReduction : 0;
}
function ir0764AffinityNotice(siteRecord) {
  const c=state?.character;
  if (!c || !siteRecord) return '';
  const a=ir0764AffinityForSite(c.race,siteRecord);
  if (!a.valid) return '';
  const biomeName=IR_BIOMES[a.biomeId]?.name||a.biomeId;
  let detail='This terrain is open to every race; no special affinity modifier applies.';
  if (a.level==='strong') detail=`Your ${IR_V0764_RACIAL_AFFINITIES[c.race]?.label||'racial'} affinity grants +4 percentage points to gathering success and reduces recurring environmental energy loss by 1 when a hazard applies.`;
  else if (a.level==='familiar') detail='Familiar terrain grants +1.5 percentage points to gathering success. It does not reduce environmental hazards.';
  else if (a.level==='adaptive') detail='Human adaptability grants a small +1 percentage-point gathering-success bonus here, without hazard immunity.';
  return `<div class="notice ir0764-affinity-notice"><strong>🌿 ${IR_V0764_RACIAL_AFFINITIES[c.race]?.label||'Racial'} affinity · ${biomeName}</strong><p>${detail}</p></div>`;
}
function irValidateRacialBiomeAffinities() {
  const errors=[],warnings=[];
  const races=Object.keys(IR_V0764_RACIAL_AFFINITIES), biomes=Object.keys(IR_BIOMES||{});
  if (races.length!==8) errors.push(`Expected 8 supported races; found ${races.length}.`);
  for (const raceId of Object.keys(RACES||{})) if (!IR_V0764_RACIAL_AFFINITIES[raceId]) errors.push(`Race ${raceId} has no affinity definition.`);
  for (const raceId of races) {
    const profile=IR_V0764_RACIAL_AFFINITIES[raceId];
    for (const biomeId of IR_V0764_AFFINITY_BIOMES) {
      const level=profile.biomes[biomeId]||'neutral';
      if (!IR_V0764_AFFINITY_MODIFIERS[level]) errors.push(`Invalid affinity level ${level} for ${raceId}/${biomeId}.`);
      if (!Object.prototype.hasOwnProperty.call(IR_BIOMES||{},biomeId)) errors.push(`Affinity biome ${biomeId} is missing from IR_BIOMES.`);
    }
  }
  for (const biomeId of biomes) if (!IR_V0764_AFFINITY_BIOMES.includes(biomeId)) warnings.push(`Biome ${biomeId} is not in the v0.7.6.4 affinity matrix.`);
  for (const [level,m] of Object.entries(IR_V0764_AFFINITY_MODIFIERS)) {
    if (m.gatherChanceBonus<0 || m.gatherChanceBonus>0.04 || m.hazardEnergyReduction<0 || m.hazardEnergyReduction>1) errors.push(`Affinity modifier ${level} exceeds documented bounds.`);
  }
  return {ok:errors.length===0,errors,warnings,raceCount:races.length,biomeCount:IR_V0764_AFFINITY_BIOMES.length,matrixCells:races.length*IR_V0764_AFFINITY_BIOMES.length};
}

// Apply feedback to existing World and Adventure screens; this adds no new navigation surface.
if (typeof renderAdventure==='function') {
  const ir0764RenderAdventureBase=renderAdventure;
  renderAdventure=function() {
    const html=ir0764RenderAdventureBase.apply(this,arguments);
    const notice=ir0764AffinityNotice(typeof ir0763CurrentSite==='function'?ir0763CurrentSite():null);
    return notice ? html.replace('<section class="hero ir-adventure-hero">',notice+'<section class="hero ir-adventure-hero">') : html;
  };
}
if (typeof renderWorld==='function') {
  const ir0764RenderWorldBase=renderWorld;
  renderWorld=function() {
    const html=ir0764RenderWorldBase.apply(this,arguments);
    const notice=ir0764AffinityNotice(typeof ir0763CurrentSite==='function'?ir0763CurrentSite():null);
    return notice ? html.replace('<div class="grid two" style="margin-top:15px">',notice+'<div class="grid two" style="margin-top:15px">') : html;
  };
}
if (typeof document!=='undefined') document.title='Infinite Realms — Version 0.7.6.4';
