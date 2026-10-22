'use strict';
// Data only (no logic). Grouped from the original single-file build; each entry notes where it was originally defined.

// from core-v0.1 (orig. line 29)
const MONTHS=['Firstfrost','Deepwinter','Thawrise','Rainmoot','Bloomtide','Suncrest','Highsun','Emberfall','Harvestend','Mistwane','Duskleaf','Longnight'];

// from core-v0.1 (orig. line 57)
const REGIONS=[
{name:'Mosslight Vale',biome:'Woodland frontier',desc:'A green basin of old trees, low hills, and half-forgotten footpaths.',sites:[{id:'square',name:'Hearthside Square',icon:'🏘️',risk:5,kind:'safe',desc:'A few shops and an inn cluster around a communal well.'},{id:'market',name:'Market Road',icon:'🛒',risk:18,kind:'low',desc:'Carters and peddlers follow the well-worn road.'},{id:'forest',name:'Fernwood Edge',icon:'🌲',risk:43,kind:'moderate',desc:'The trees thicken and old tracks disappear under moss.'},{id:'shrine',name:'Moss-Covered Shrine',icon:'🪨',risk:32,kind:'moderate',desc:'A quiet stone shrine; faint marks remain beneath the lichen.'}]},
{name:'Copperbreak March',biome:'Mountain foothills',desc:'Cold streams cut through rocky foothills dotted with quarries and small keeps.',sites:[{id:'square',name:'Coppercross Yard',icon:'🏘️',risk:7,kind:'safe',desc:'A hard-working village built around a stone well.'},{id:'market',name:'Switchback Road',icon:'🛒',risk:22,kind:'low',desc:'A narrow trade route carrying ore and tools.'},{id:'forest',name:'Old Quarry Track',icon:'⛏️',risk:35,kind:'moderate',desc:'Abandoned workings lie beyond the active quarry.'},{id:'shrine',name:'The Split Cairn',icon:'🪨',risk:28,kind:'moderate',desc:'A lonely cairn overlooks a valley of grey stone.'}]},
{name:'Willowmere Reach',biome:'Marshland edge',desc:'Reed-choked waters and willow islands conceal both rare herbs and uncertain ground.',sites:[{id:'square',name:'Reedbank Landing',icon:'🏘️',risk:8,kind:'safe',desc:'Stilted homes and a little market line the water.'},{id:'market',name:'Causeway Market',icon:'🛒',risk:20,kind:'low',desc:'Raised planks connect traders crossing the mire.'},{id:'forest',name:'Willowfen Trail',icon:'🌿',risk:46,kind:'moderate',desc:'The trail sinks into wet earth and buzzing reeds.'},{id:'shrine',name:'Drowned Marker',icon:'🪨',risk:34,kind:'moderate',desc:'An old marker stone stands where the path vanishes into water.'}]},
{name:'Sunspoke Crossing',biome:'Dry grassland frontier',desc:'Wide skies, golden grasses, and a dusty road linking small trading posts.',sites:[{id:'square',name:'Sunspoke Post',icon:'🏘️',risk:6,kind:'safe',desc:'A tiny outpost survives on water, trade, and hospitality.'},{id:'market',name:'Caravan Track',icon:'🛒',risk:23,kind:'low',desc:'Wagons leave tracks across the open grass.'},{id:'forest',name:'Windcut Rise',icon:'🌾',risk:39,kind:'moderate',desc:'A low ridge offers a clear view—and little cover.'},{id:'shrine',name:'Wayfarer’s Pillar',icon:'🪨',risk:30,kind:'moderate',desc:'Carved names mark a pillar used by generations of travelers.'}]},
{name:'Ashwillow Border',biome:'Mixed woodland & farmland',desc:'Small farms give way to thickets, shallow streams, and a distant ruined watchpost.',sites:[{id:'square',name:'Ashford Green',icon:'🏘️',risk:6,kind:'safe',desc:'A quiet green where farmers trade produce and news.'},{id:'market',name:'North Cartway',icon:'🛒',risk:19,kind:'low',desc:'The main road is busy enough to feel safe, most days.'},{id:'forest',name:'Bramble Fringe',icon:'🌳',risk:41,kind:'moderate',desc:'Wild brambles crowd a narrow track beneath the trees.'},{id:'shrine',name:'Old Watchpost',icon:'🏚️',risk:37,kind:'moderate',desc:'A weather-beaten tower watches over the empty fields.'}]}
];

// from worldgen-v0.2 (orig. line 177)
const IR_BIOMES = {
  forest:{name:'Deep Forest',icon:'🌲',risk:31,desc:'Tall old-growth trees dim the light, and narrow animal tracks wind between mossy roots.',opportunities:['Bitterleaf and medicinal herbs','Rare mushrooms','Animal tracks'],terrain:'woodland',conditions:['humid','dense-canopy','variable-light'],habitats:['woodland-predators','web-building-ambushers','small-omnivores'],foragingChanceModifier:.12,resources:[{category:'medicinal-plants',itemId:'herb',forageWeight:2,scoutWeight:2},{category:'salvage',itemId:'scrap',forageWeight:1,scoutWeight:0},{category:'biological-fiber',itemId:'spider_silk',forageWeight:0,scoutWeight:1}],gatheringPools:{"mining":["stone","ore"],"woodcutting":["wood","wood","wood","herb"],"herbalism":["herb","herb","herb","spider_silk"],"fishing":["herb"]},gatheringAvailability:["woodcutting","herbalism"]},
  plains:{name:'Open Plains',icon:'🌾',risk:17,desc:'Wide grasslands offer long views, grazing herds, and little cover from changing weather.',opportunities:['Wild grain','Caravan signs','Grazing animals'],terrain:'open',conditions:['open-sky','seasonal-grass','long-sightlines'],habitats:['grazing-wildlife','open-country-predators','roadside-humanoids'],foragingChanceModifier:.04,resources:[{category:'wild-food',itemId:'bread',forageWeight:1,scoutWeight:1},{category:'medicinal-plants',itemId:'herb',forageWeight:1,scoutWeight:1},{category:'salvage',itemId:'scrap',forageWeight:1,scoutWeight:0},{category:'wildlife-remains',itemId:'wolf_fang',forageWeight:0,scoutWeight:1}],gatheringPools:{"mining":["stone","ore"],"woodcutting":["wood","herb"],"herbalism":["herb","herb","bread"],"fishing":["fish"]},gatheringAvailability:["herbalism"]},
  mountain:{name:'Mountain Foothills',icon:'⛰️',risk:36,desc:'Rocky ridges, cold streams, and broken passes make travel slower but potentially rewarding.',opportunities:['Raw ore','Mineral seams','Hidden passes'],terrain:'rocky',conditions:['rocky-ground','exposed-ridges','cool-air'],habitats:['mountain-scavengers','cave-dwellers','large-territorial-creatures'],foragingChanceModifier:.02,resources:[{category:'ore-and-minerals',itemId:'ore',forageWeight:2,scoutWeight:1},{category:'salvage',itemId:'scrap',forageWeight:1,scoutWeight:1},{category:'arcane-fragments',itemId:'curse_shard',forageWeight:0,scoutWeight:1}],gatheringPools:{"mining":["ore","ore","ore","stone","stone","coal"],"woodcutting":["wood","wood","stone"],"herbalism":["herb","herb","herb"],"fishing":["fish"]},gatheringAvailability:["mining","woodcutting","herbalism"]},
  swamp:{name:'Misty Swamp',icon:'🐸',risk:40,desc:'Reeds and black water hide firm ground, rare plants, and the occasional dangerous movement.',opportunities:['Medicinal reeds','Rare herbs','Old causeways'],terrain:'wetland',conditions:['waterlogged-ground','high-humidity','low-visibility'],habitats:['wetland-ambushers','slime-like-life','marsh-predators'],foragingChanceModifier:.14,resources:[{category:'medicinal-plants',itemId:'herb',forageWeight:2,scoutWeight:1},{category:'salvage',itemId:'scrap',forageWeight:1,scoutWeight:0},{category:'alchemical-supplies',itemId:'potion',forageWeight:0,scoutWeight:1},{category:'biological-fiber',itemId:'spider_silk',forageWeight:0,scoutWeight:1}],gatheringPools:{"mining":["stone","ore"],"woodcutting":["wood","herb","herb"],"herbalism":["herb","herb","slime_gel"],"fishing":["fish","herb"]},gatheringAvailability:["woodcutting","herbalism","fishing"]},
  desert:{name:'Sunscorched Desert',icon:'🏜️',risk:32,desc:'Dry winds cross the dunes and stony flats. Water and shade are more valuable than coin.',opportunities:['Buried salvage','Trade routes','Desert herbs'],terrain:'arid',conditions:['arid-ground','sparse-shade','high-temperature-variation'],habitats:['scavengers','opportunistic-predators','heat-adapted-wildlife'],foragingChanceModifier:-.04,resources:[{category:'ore-and-minerals',itemId:'ore',forageWeight:1,scoutWeight:1},{category:'salvage',itemId:'scrap',forageWeight:1,scoutWeight:1},{category:'small-relics',itemId:'charm',forageWeight:1,scoutWeight:1}],gatheringPools:{"mining":["stone","stone","ore","coal"],"woodcutting":["wood"],"herbalism":["herb","herb"],"fishing":["fish"]},gatheringAvailability:["mining","herbalism"]},
  snow:{name:'Snowbound Reach',icon:'❄️',risk:38,desc:'Snowy slopes and frost-hardened pines test supplies, warmth, and a traveler’s endurance.',opportunities:['Winter herbs','Sheltered caves','Tracks in snow'],terrain:'cold',conditions:['cold-ground','snow-cover','limited-winter-growth'],habitats:['cold-country-predators','cold-adapted-undead','winter-scavengers'],foragingChanceModifier:-.03,resources:[{category:'cold-region-plants',itemId:'herb',forageWeight:1,scoutWeight:1},{category:'wild-food',itemId:'bread',forageWeight:1,scoutWeight:1},{category:'salvage',itemId:'scrap',forageWeight:1,scoutWeight:0},{category:'wildlife-remains',itemId:'wolf_fang',forageWeight:0,scoutWeight:1}],gatheringPools:{"mining":["ore","stone","stone"],"woodcutting":["wood","wood","wood"],"herbalism":["herb","herb"],"fishing":["fish","fish","fish","herb"]},gatheringAvailability:["mining","woodcutting","herbalism","fishing"]},
  coast:{name:'Windworn Coast',icon:'🌊',risk:21,desc:'A rugged coastline connects fishing coves, salt grass, and busy routes for small boats.',opportunities:['Shellfish','Shipwreck salvage','Fishing coves'],terrain:'coastal',conditions:['salt-air','tidal-edge','wind-exposure'],habitats:['shoreline-scavengers','coastal-ambushers','nearshore-life'],foragingChanceModifier:.07,resources:[{category:'salvage',itemId:'scrap',forageWeight:1,scoutWeight:1},{category:'medicinal-plants',itemId:'herb',forageWeight:1,scoutWeight:0},{category:'small-relics',itemId:'charm',forageWeight:1,scoutWeight:1},{category:'wild-food',itemId:'bread',forageWeight:0,scoutWeight:1}],gatheringPools:{"mining":["stone","stone","ore"],"woodcutting":["wood"],"herbalism":["herb","herb"],"fishing":["fish","fish","fish","scrap"]},gatheringAvailability:["herbalism","fishing"]},
  river:{name:'Riverlands',icon:'🏞️',risk:18,desc:'Streams and broad river bends support farms, ferries, and paths used by traders.',opportunities:['Fresh water','Reeds and herbs','Ferry crossings'],terrain:'river',conditions:['freshwater-access','damp-ground','moving-water'],habitats:['riverbank-predators','opportunistic-scavengers','water-associated-life'],foragingChanceModifier:.08,resources:[{category:'medicinal-plants',itemId:'herb',forageWeight:1,scoutWeight:1},{category:'wild-food',itemId:'bread',forageWeight:1,scoutWeight:1},{category:'salvage',itemId:'scrap',forageWeight:1,scoutWeight:0},{category:'alchemical-supplies',itemId:'potion',forageWeight:0,scoutWeight:1}],gatheringPools:{"mining":["stone","ore"],"woodcutting":["wood","herb"],"herbalism":["herb","herb","herb"],"fishing":["fish","fish","fish","herb"]},gatheringAvailability:["herbalism","fishing"]},
  woodland:{name:'Rolling Woodlands',icon:'🌳',risk:25,desc:'Open groves, meadows, and shallow valleys make this a varied region for travel and gathering.',opportunities:['Useful timber','Wild berries','Old tracks'],terrain:'mixed',conditions:['mixed-canopy','open-groves','shallow-valleys'],habitats:['woodland-predators','grazing-wildlife','generalist-omnivores'],foragingChanceModifier:.08,resources:[{category:'medicinal-plants',itemId:'herb',forageWeight:1,scoutWeight:1},{category:'salvage',itemId:'scrap',forageWeight:1,scoutWeight:1},{category:'wild-food',itemId:'bread',forageWeight:1,scoutWeight:1}],gatheringPools:{"mining":["stone","ore"],"woodcutting":["wood","wood","wood","herb"],"herbalism":["herb","herb","herb"],"fishing":["fish","herb"]},gatheringAvailability:["woodcutting","herbalism"]}
};

// Biome keys are the stable identifiers. Properties live in IR_BIOMES rather than on generated sites.
// Legacy display labels can resolve for runtime fallback, but saved site records are never rewritten here.
const IR_BIOME_LEGACY_LABELS = {
  'woodland frontier':'woodland', 'mountain foothills':'mountain', 'marshland edge':'swamp',
  'dry grassland frontier':'plains', 'mixed woodland & farmland':'woodland'
};
function irResolveBiomeProfile(value) {
  if (typeof value === 'string') {
    if (value.trim().toLowerCase()==='cave') return {id:'mountain', profile:IR_BIOMES.mountain, source:'legacy-cave', fallback:false};
    if (Object.prototype.hasOwnProperty.call(IR_BIOMES, value)) return {id:value, profile:IR_BIOMES[value], source:'biome-id', fallback:false};
    const label=value.trim().toLowerCase();
    const alias=IR_BIOME_LEGACY_LABELS[label];
    if (alias && Object.prototype.hasOwnProperty.call(IR_BIOMES, alias)) return {id:alias, profile:IR_BIOMES[alias], source:'legacy-label', fallback:false};
    const named=Object.keys(IR_BIOMES).find(k=>IR_BIOMES[k].name.toLowerCase()===label);
    if (named) return {id:named, profile:IR_BIOMES[named], source:'profile-name', fallback:false};
  } else if (value && typeof value === 'object') {
    const rawId=typeof value.biomeId==='string' ? value.biomeId : '';
    if (rawId.trim().toLowerCase()==='cave') return {id:'mountain', profile:IR_BIOMES.mountain, source:'legacy-cave', fallback:false};
    if (rawId && Object.prototype.hasOwnProperty.call(IR_BIOMES, rawId)) return {id:rawId, profile:IR_BIOMES[rawId], source:'biome-id', fallback:false};
    const label=String(value.biome||'').trim().toLowerCase();
    const alias=IR_BIOME_LEGACY_LABELS[label];
    if (alias && Object.prototype.hasOwnProperty.call(IR_BIOMES, alias)) return {id:alias, profile:IR_BIOMES[alias], source:'legacy-label', fallback:false};
    const named=Object.keys(IR_BIOMES).find(k=>IR_BIOMES[k].name.toLowerCase()===label);
    if (named) return {id:named, profile:IR_BIOMES[named], source:'profile-name', fallback:false};
  }
  return {id:'woodland', profile:IR_BIOMES.woodland, source:'safe-fallback', fallback:true};
}
function irBiomeProfileForSite(siteOrId) { return irResolveBiomeProfile(siteOrId).profile; }
function irBiomeIdForSite(siteOrId) { const r=irResolveBiomeProfile(siteOrId); return r.fallback ? null : r.id; }
function irBiomeResourceCategories(siteOrId) { return [...new Set((irBiomeProfileForSite(siteOrId).resources||[]).map(r=>r.category).filter(x=>typeof x==='string'&&x))]; }
function irBiomeResourceItemExists(itemId) {
  return typeof itemId === 'string' && !!itemId &&
    ((typeof ITEMS !== 'undefined' && Object.prototype.hasOwnProperty.call(ITEMS, itemId)) ||
     (typeof IR_V04_ITEM_DATA !== 'undefined' && Object.prototype.hasOwnProperty.call(IR_V04_ITEM_DATA, itemId)));
}
function irBiomeGatheringItems(siteOrId, activity) {
  const resolved=irResolveBiomeProfile(siteOrId);
  if (resolved.fallback) return [];
  const pool=resolved.profile.gatheringPools?.[activity];
  if (!Array.isArray(pool) || !pool.length) return [];
  return pool.filter(irBiomeResourceItemExists);
}
function irBiomeGatheringAvailable(siteOrId, activity) {
  const resolved=irResolveBiomeProfile(siteOrId), profile=resolved.profile;
  if (resolved.fallback) return false;
  const risk=Number(siteOrId && typeof siteOrId==='object' ? siteOrId.risk : 0) || 0;
  // Preserve the existing high-risk mining exception and legacy cave sites.
  if (activity==='mining' && ((siteOrId && typeof siteOrId==='object' && String(siteOrId.biomeId||'').toLowerCase()==='cave') || risk>=28)) return true;
  return Array.isArray(profile.gatheringAvailability) && profile.gatheringAvailability.includes(activity);
}
function irBiomeResourceItems(siteOrId, activity='forage') {
  const resolved=irResolveBiomeProfile(siteOrId);
  if (resolved.fallback) return [];
  const weightKey=activity==='scout'?'scoutWeight':'forageWeight', items=[];
  for (const resource of resolved.profile.resources||[]) {
    if (!irBiomeResourceItemExists(resource?.itemId)) continue;
    const weight=Math.max(0,Math.min(20,Math.floor(Number(resource[weightKey])||0)));
    for (let i=0;i<weight;i++) items.push(resource.itemId);
  }
  return items;
}
function irBiomeForageChanceModifier(siteOrId) {
  const resolved=irResolveBiomeProfile(siteOrId);
  return resolved.fallback ? 0 : (Number(resolved.profile.foragingChanceModifier)||0);
}
function irBiomeHabitatCategories(siteOrId) { return (irBiomeProfileForSite(siteOrId).habitats||[]).slice(); }
function irBiomeEncounterIds(siteOrId) {
  const resolved=irResolveBiomeProfile(siteOrId), key=resolved.id||'woodland';
  return (typeof IR_BIOME_ENEMIES!=='undefined' && (IR_BIOME_ENEMIES[key]||IR_BIOME_ENEMIES.woodland)) ? (IR_BIOME_ENEMIES[key]||IR_BIOME_ENEMIES.woodland).slice() : [];
}
function irBiomeTravelContext(fromSite,toSite,route=null) {
  const from=irResolveBiomeProfile(fromSite), to=irResolveBiomeProfile(toSite);
  return {fromId:from.id,toId:to.id,fromProfile:from.profile,toProfile:to.profile,routeTerrain:route?.terrain||null,usesFallback:from.fallback||to.fallback};
}

// from worldgen-v0.2 (orig. line 189)
const IR_SETTLEMENTS = {
  0:{kind:'hamlet',name:'hamlet',risk:8},
  6:{kind:'village',name:'village',risk:10},
  24:{kind:'town',name:'town',risk:5},
  42:{kind:'remote',name:'remote settlement',risk:14},
  48:{kind:'city',name:'city',risk:7}
};

// from worldgen-v0.2 (orig. line 196)
const IR_TOWN_NAMES=['Brackenford','Stonecross','Mosswell','Eastmere','Cinderfield','Willowgate','Frostbridge','Sunhollow','Greyhaven','Oakrest','Dunridge','Rillstone','Ashcombe','Windmere','Thornfield','Clearbrook','Highbarrow','Silverfen','Redwater','Hearthglen'];

// from worldgen-v0.2 (orig. line 197)
const IR_ADJECTIVES=['Mossy','Broken','Amber','Quiet','Old','Winding','Silver','Thorn','Cinder','Whispering','High','Gloam','Bright','Forgotten','Windcut','Foxglove','Moonlit','Raven'];

// from worldgen-v0.2 (orig. line 198)
const IR_NOUNS={forest:['Grove','Wood','Thicket','Hollow','Glade'],plains:['Meadow','Downs','Grasslands','Rise','Reach'],mountain:['Ridge','Crag','Pass','Crown','Heights'],swamp:['Fen','Mire','Bog','Marsh','Pools'],desert:['Dunes','Waste','Flats','Basin','Expanse'],snow:['Frostwood','Snowfield','Glacier Edge','White Pass','Cold Reach'],coast:['Cove','Headland','Shore','Salt Cliffs','Tidebreak'],river:['Ford','Riverbend','Waters','Ferry Reach','Reedbank'],woodland:['Vale','Green','Fields','Copse','Hearthlands']};

// from facility-polish-v0.7.2 (orig. line 2776)
const IR072_FACILITY_POLISH = 'location-services-1';
