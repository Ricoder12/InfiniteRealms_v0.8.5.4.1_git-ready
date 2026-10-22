'use strict';
// Infinite Realms v0.7.6.3 — modest, action-time environmental hazards.
// Effects are applied only by simulated day progression, never by rendering or tab navigation.
const IR_V0763_HAZARD_VERSION = 1;
const IR_V0763_BIOME_HAZARDS = Object.freeze({
  snow: {
    id:'cold-exposure', name:'Cold exposure', icon:'❄️', intervalDays:7,
    energyLoss:1, healthLoss:1, survivalThreshold:5, armorMitigates:true,
    riskMin:20, wildernessOnly:true,
    warning:'Extended time in the cold can sap energy and, without preparation, cause minor health loss. Equipped armor or Survival skill 5+ protects against exposure.'
  },
  desert: {
    id:'heat-exertion', name:'Heat exertion', icon:'☀️', intervalDays:7,
    energyLoss:2, healthLoss:0, survivalThreshold:5, armorMitigates:false,
    riskMin:20, wildernessOnly:true,
    warning:'Long stretches in exposed desert terrain are tiring. Survival skill 5+ helps you pace yourself; rest at a settlement to recover.'
  },
  mountain: {
    id:'rough-terrain', name:'Rough mountain terrain', icon:'⛰️', intervalDays:4,
    energyLoss:1, healthLoss:0, survivalThreshold:4, armorMitigates:false,
    riskMin:25, wildernessOnly:true,
    warning:'Broken ground makes prolonged travel tiring. Survival skill 4+ reduces the extra exertion.'
  },
  swamp: {
    id:'boggy-ground', name:'Boggy ground', icon:'🐸', intervalDays:4,
    energyLoss:1, healthLoss:0, survivalThreshold:4, armorMitigates:false,
    riskMin:25, wildernessOnly:true,
    warning:'Soft ground and hidden pools make extended activity tiring. Survival skill 4+ helps you choose firmer paths.'
  },
  forest: {
    id:'dense-understory', name:'Dense undergrowth', icon:'🌲', intervalDays:5,
    energyLoss:1, healthLoss:0, survivalThreshold:3, armorMitigates:false,
    riskMin:35, wildernessOnly:true,
    warning:'Dense undergrowth slows progress in this risky forest. Survival skill 3+ helps you keep to clearer tracks.'
  },
  coast: {
    id:'exposed-shore', name:'Exposed shoreline', icon:'🌊', intervalDays:5,
    energyLoss:1, healthLoss:0, survivalThreshold:4, armorMitigates:false,
    riskMin:30, wildernessOnly:true,
    warning:'Rough shoreline terrain can tire you during prolonged activity. Survival skill 4+ helps you choose a safer line.'
  }
});

function ir0763CurrentSite() {
  const world=state?.world, sites=world?.region?.sites;
  if (!world || !Array.isArray(sites) || typeof world.siteId!=='string') return null;
  const matches=sites.filter(s=>s && s.id===world.siteId);
  return matches.length===1 ? matches[0] : null;
}
function ir0763SurvivalLevel() { return Math.max(1,Number(state?.character?.skills?.Survival?.level)||1); }
function ir0763IsShelteredSite(siteRecord) {
  return !siteRecord || siteRecord.type==='settlement' || !!siteRecord.settlementType ||
    (Array.isArray(siteRecord.services) && siteRecord.services.some(x=>['inn','rest','lodging','healer'].includes(x)));
}
function ir0763HazardForSite(siteRecord) {
  if (!siteRecord || !Number.isFinite(Number(siteRecord.risk))) return null;
  const resolved=typeof irResolveBiomeProfile==='function' ? irResolveBiomeProfile(siteRecord) : null;
  if (!resolved || resolved.fallback || !Object.prototype.hasOwnProperty.call(IR_V0763_BIOME_HAZARDS,resolved.id)) return null;
  const hazard=IR_V0763_BIOME_HAZARDS[resolved.id];
  if (Number(siteRecord.risk)<hazard.riskMin) return null;
  if (hazard.wildernessOnly && ir0763IsShelteredSite(siteRecord)) return null;
  return {...hazard,biomeId:resolved.id,siteId:siteRecord.id,siteName:siteRecord.name,
    mitigated:ir0763SurvivalLevel()>=hazard.survivalThreshold || (hazard.armorMitigates && !!state?.character?.equipment?.armor)};
}
function ir0763HazardWarning(siteRecord,includeMitigation=true) {
  const h=ir0763HazardForSite(siteRecord);
  if (!h) return '';
  const message=h.mitigated ? `${h.warning} Your current preparation is sufficient to avoid its extra effects.` : h.warning;
  return `<div class="notice ${h.mitigated?'':'warning'} ir0763-hazard-notice"><strong>${h.icon} Environmental hazard: ${h.name}</strong><p>${includeMitigation?message:h.warning}</p></div>`;
}
function ir0763EnsureLedger(world=state?.world,daysLived=state?.character?.daysLived) {
  if (!world || typeof world!=='object') return null;
  let ledger=world.v0763Hazards;
  if (!ledger || typeof ledger!=='object' || Array.isArray(ledger)) {
    ledger={schema:IR_V0763_HAZARD_VERSION,appliedThroughDay:Math.max(0,Math.floor(Number(daysLived)||0)),exposureBySite:{}};
    world.v0763Hazards=ledger;
  }
  ledger.schema=IR_V0763_HAZARD_VERSION;
  if (!Number.isFinite(Number(ledger.appliedThroughDay)) || Number(ledger.appliedThroughDay)<0) ledger.appliedThroughDay=Math.max(0,Math.floor(Number(daysLived)||0));
  if (!ledger.exposureBySite || typeof ledger.exposureBySite!=='object' || Array.isArray(ledger.exposureBySite)) ledger.exposureBySite={};
  return ledger;
}
function ir0763ApplyHazardDay(siteRecord,ledger) {
  const h=ir0763HazardForSite(siteRecord);
  if (!h || h.mitigated) return null;
  const key=String(siteRecord.geoId||siteRecord.id||'');
  if (!key) return null;
  const exposure=Math.max(0,Math.floor(Number(ledger.exposureBySite[key])||0))+1;
  ledger.exposureBySite[key]=exposure;
  if (exposure % h.intervalDays!==0) return null;
  const c=state.character;
  const oldEnergy=Math.max(0,Number(c.energy)||0), oldHealth=Math.max(1,Number(c.health)||1);
  const affinityReduction=typeof ir0764HazardEnergyReduction==='function'?ir0764HazardEnergyReduction(siteRecord):0;
  const effectiveEnergyLoss=Math.max(0,h.energyLoss-affinityReduction);
  c.energy=Math.max(0,oldEnergy-effectiveEnergyLoss);
  c.health=Math.max(1,oldHealth-h.healthLoss);
  const energyLost=oldEnergy-c.energy, healthLost=oldHealth-c.health;
  if (!energyLost && !healthLost) return null;
  return {hazard:h,energyLost,healthLost,siteName:siteRecord.name};
}
function irValidateEnvironmentalHazards(world=null) {
  const errors=[],warnings=[];
  for (const [biomeId,h] of Object.entries(IR_V0763_BIOME_HAZARDS)) {
    if (!IR_BIOMES[biomeId]) errors.push(`Hazard ${h.id} references unknown biome ${biomeId}`);
    if (!h.id || !Number.isInteger(h.intervalDays) || h.intervalDays<2 || h.intervalDays>30) errors.push(`Hazard ${biomeId} has invalid cadence`);
    if (!Number.isInteger(h.energyLoss) || h.energyLoss<0 || h.energyLoss>3 || !Number.isInteger(h.healthLoss) || h.healthLoss<0 || h.healthLoss>1) errors.push(`Hazard ${biomeId} exceeds the modest impact bounds`);
    if (!Number.isInteger(h.survivalThreshold) || h.survivalThreshold<1 || h.survivalThreshold>10) errors.push(`Hazard ${biomeId} has an invalid Survival threshold`);
  }
  if (world) {
    const ledger=world.v0763Hazards;
    if (ledger && (!Number.isFinite(Number(ledger.appliedThroughDay)) || !ledger.exposureBySite || typeof ledger.exposureBySite!=='object')) errors.push('Hazard ledger is malformed');
    for (const siteRecord of world.region?.sites||[]) if (siteRecord?.biomeId && !IR_BIOMES[siteRecord.biomeId]) warnings.push(`Site ${siteRecord.id||'(unknown)'} has unresolved biome ${siteRecord.biomeId}; no hazard will be applied`);
  }
  return {ok:errors.length===0,errors,warnings,hazardCount:Object.keys(IR_V0763_BIOME_HAZARDS).length};
}

// Apply exposure after the established time/needs/injury logic. Rendering never calls this function.
const ir0763DayPassBase=dayPass;
dayPass=function(days,activity='Time passes') {
  const c=state?.character, world=state?.world;
  const before=Math.max(0,Math.floor(Number(c?.daysLived)||0));
  const ledger=c&&world ? ir0763EnsureLedger(world,before) : null;
  const result=ir0763DayPassBase(days,activity);
  const after=Math.max(before,Math.floor(Number(state?.character?.daysLived)||before));
  if (!ledger || after<=before || !state?.character) return result;
  const siteRecord=ir0763CurrentSite();
  const firstDay=Math.max(before+1,Math.floor(Number(ledger.appliedThroughDay)||0)+1);
  const effects=[];
  for (let day=firstDay;day<=after;day++) {
    const effect=ir0763ApplyHazardDay(siteRecord,ledger);
    if (effect) effects.push(effect);
  }
  ledger.appliedThroughDay=Math.max(Math.floor(Number(ledger.appliedThroughDay)||0),after);
  if (effects.length && typeof addFeed==='function') {
    const energy=effects.reduce((n,x)=>n+x.energyLost,0), health=effects.reduce((n,x)=>n+x.healthLost,0);
    const names=[...new Set(effects.map(x=>x.hazard.name))].join(', ');
    addFeed('⚠️','Environmental strain',`${names} at ${siteRecord?.name||'the current location'} cost ${energy} energy${health?` and ${health} health`:''}. Rest in a settlement and improve Survival or use appropriate equipment to reduce future effects.`,'warning');
  }
  return result;
};

// Old saves receive only the small hazard ledger defaults; no world regeneration or retroactive ticks.
const ir0763NormalizeSaveBase=normalizeSave;
normalizeSave=function(input) {
  const normalized=ir0763NormalizeSaveBase(input);
  if (normalized?.world) ir0763EnsureLedger(normalized.world,normalized.character?.daysLived);
  return normalized;
};

// Show current-site information on existing views; no new map or navigation surface is introduced.
if (typeof renderAdventure==='function') {
  const ir0763RenderAdventureBase=renderAdventure;
  renderAdventure=function() {
    const html=ir0763RenderAdventureBase.apply(this,arguments), s=ir0763CurrentSite();
    const warning=ir0763HazardWarning(s);
    return warning ? html.replace('<section class="hero ir-adventure-hero">',warning+'<section class="hero ir-adventure-hero">') : html;
  };
}
if (typeof renderWorld==='function') {
  const ir0763RenderWorldBase=renderWorld;
  renderWorld=function() {
    const html=ir0763RenderWorldBase.apply(this,arguments), s=ir0763CurrentSite();
    const warning=ir0763HazardWarning(s);
    return warning ? html.replace('<div class="grid two" style="margin-top:15px">',warning+'<div class="grid two" style="margin-top:15px">') : html;
  };
}
if (typeof renderModal==='function') {
  const ir0763RenderModalBase=renderModal;
  renderModal=function() {
    const html=ir0763RenderModalBase.apply(this,arguments);
    if (modal?.kind!=='travel-route-preview' || !html.includes('ir071-route-path')) return html;
    const plan=typeof ir071RoutePlan==='function' ? ir071RoutePlan(modal.site) : null;
    const leg=plan?.legs?.[0];
    if (!leg) return html;
    const warnings=[ir0763HazardWarning(leg.from),ir0763HazardWarning(leg.to)].filter(Boolean);
    if (!warnings.length) return html;
    return html.replace('</div><div class="ir051-trip-summary">',`</div>${warnings.join('')}<div class="ir051-trip-summary">`);
  };
}

if (typeof document!=='undefined') document.title='Infinite Realms — Version 0.7.6.3';
