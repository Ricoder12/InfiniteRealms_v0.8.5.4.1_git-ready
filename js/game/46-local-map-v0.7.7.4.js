'use strict';
// Infinite Realms v0.7.7.4 — illustrated, service-backed local map.
// Local geometry is a deterministic presentation layer only: no location, service, NPC,
// route, terrain rule, save field, or movement rule is created or modified here.

const IR0774_SERVICE_PRESENTATION = {
  market:    { key:'market', label:'Market stall', short:'Market', icon:'🪙', shape:'stall', action:'tab', target:'Inventory', verb:'Browse market & trade' },
  inn:       { key:'inn', label:'Inn & tavern', short:'Inn', icon:'🍲', shape:'inn', action:'action', target:'local-rest', verb:'Use the existing rest service' },
  'work-board': { key:'work-board', label:'Work board', short:'Work board', icon:'📜', shape:'notice', action:'action', target:'jobs-modal', verb:'Open existing job listings' },
  healer:    { key:'healer', label:'Healer', short:'Healer', icon:'✚', shape:'clinic', action:'action', target:'local-healer', verb:'Use the existing healer interaction' },
  stable:    { key:'stable', label:'Stables', short:'Stables', icon:'🐴', shape:'stable', action:'tab', target:'World', verb:'Open recorded travel options' },
  caravan:   { key:'caravan', label:'Caravan yard', short:'Caravan', icon:'🛒', shape:'yard', action:'tab', target:'World', verb:'Open recorded travel options' },
  guild:     { key:'guild', label:'Guild hall', short:'Guild', icon:'⚔️', shape:'hall', action:'action', target:'ask-rumor', verb:'Use the existing guild information action' },
  library:   { key:'library', label:'Library', short:'Library', icon:'📚', shape:'hall', action:'tab', target:'Inventory', verb:'Open the existing study / supply destination' },
  forge:     { key:'forge', label:'Blacksmith & forge', short:'Forge', icon:'⚒️', shape:'forge', action:'tab', target:'Inventory', verb:'Open inventory and blacksmith options' },
  smithy:    { key:'smithy', label:'Blacksmith & smithy', short:'Smithy', icon:'⚒️', shape:'forge', action:'tab', target:'Inventory', verb:'Open inventory and blacksmith options' },
  workshop:  { key:'workshop', label:'Workshop', short:'Workshop', icon:'🔨', shape:'forge', action:'tab', target:'Inventory', verb:'Open inventory and workshop options' },
  hunter:    { key:'hunter', label:'Hunter & tanner', short:'Hunter', icon:'🏹', shape:'lean-to', action:'tab', target:'Inventory', verb:'Open existing inventory options' },
  alchemy:   { key:'alchemy', label:'Alchemist', short:'Alchemist', icon:'⚗️', shape:'lean-to', action:'tab', target:'Inventory', verb:'Open existing alchemy options' },
  alchemist: { key:'alchemist', label:'Alchemist', short:'Alchemist', icon:'⚗️', shape:'lean-to', action:'tab', target:'Inventory', verb:'Open existing alchemy options' }
};

function ir0774Hash(value) {
  let hash = 2166136261;
  for (const ch of String(value ?? '')) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function ir0774Shuffle(values, seed) {
  const result = values.slice(); let n = ir0774Hash(seed) || 1;
  for (let i = result.length - 1; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = n % (i + 1); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function ir0774ServiceKey(raw) {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[ _]+/g, '-');
  // Recorded aliases map to one canonical visual so they cannot create duplicate buildings.
  if (key === 'smithy' || key === 'workshop' || key === 'blacksmith') return 'forge';
  if (key === 'alchemist' || key === 'alchemy-lab') return 'alchemy';
  if (key === 'inn-tavern' || key === 'tavern') return 'inn';
  if (key === 'trading-post' || key === 'market-stall') return 'market';
  return Object.prototype.hasOwnProperty.call(IR0774_SERVICE_PRESENTATION, key) ? key : '';
}
function ir0774RecordedServices(site) {
  if (!Array.isArray(site?.services)) return [];
  const seen = new Set();
  return site.services.map(raw => ({raw:String(raw ?? ''), key:ir0774ServiceKey(raw)}))
    .filter(row => row.key && !seen.has(row.key) && seen.add(row.key))
    .map(row => ({...IR0774_SERVICE_PRESENTATION[row.key], raw:row.raw}));
}
function ir0774TerrainPresentation(site, profile) {
  const raw = String(site?.biomeId || '').toLowerCase();
  const label = String(profile?.name || site?.biome || '').toLowerCase();
  if (raw === 'snow' || /snow|frost|ice/.test(label)) return {key:'snow', objects:['🌲','❄️','🪨','🌲','❄️','🌲','🪨','❄️','🌲'], ground:'Snow & frost', water: false};
  if (raw === 'desert' || /desert|arid|dune|sunscorch/.test(label)) return {key:'desert', objects:['🌵','🪨','☀️','🌵','🪨','🌵','🪨','🌾'], ground:'Dry sand & stone', water:false};
  if (raw === 'swamp' || /swamp|marsh|fen|wetland|bog/.test(label)) return {key:'swamp', objects:['🌾','💧','🌿','🪷','🌾','🪨','🌿','💧','🌾'], ground:'Wet ground & reeds', water:true};
  if (raw === 'mountain' || /mountain|rock|ridge|crag/.test(label)) return {key:'mountain', objects:['🪨','⛰️','🌿','🪨','⛰️','🪨','🌿','🪨','⛰️'], ground:'Rocky ground', water:false};
  if (raw === 'coast' || /coast|shore|coastal|beach/.test(label)) return {key:'coast', objects:['🐚','🌊','🪨','🌾','🐚','🌊','🪨','🌾'], ground:'Coastal sand & grass', water:true};
  if (raw === 'river' || /river|waterway|riverlands/.test(label)) return {key:'river', objects:['🌊','🪨','🌿','💧','🌾','🌊','🪨','🌿'], ground:'Riverland ground', water:true};
  if (raw === 'plains' || /plain|grassland|meadow/.test(label)) return {key:'plains', objects:['🌾','🌱','🌼','🌿','🌾','🌱','🌼','🌿','🌾'], ground:'Open grass & fields', water:false};
  return {key:'woodland', objects:['🌳','🌿','🌲','🍃','🌳','🌿','🌲','🍃','🌳','🌿'], ground:'Grass & woodland', water:false};
}
function ir0774LocalWorkers(site) {
  if (!site?.id || !Array.isArray(state?.character?.npcs)) return [];
  const allowed = state.character.npcs.filter(n => n && (n.workSite === site.id || n.ir072OriginSite === site.id || (n.homeSite === site.id && n.tier === 'unique')));
  const seen = new Set();
  return allowed.filter(n => {
    if (!n.id || seen.has(n.id)) return false;
    seen.add(n.id); return true;
  }).map(n => {
    let occupation = String(n.occupation || n.role || '').toLowerCase();
    let service = '';
    if (/merchant|trader|shopkeeper|peddler|market seller/.test(occupation)) service = 'market';
    else if (/blacksmith|smith|armorer|armourer|forge|weaponsmith/.test(occupation)) service = 'forge';
    else if (/innkeeper|tavern keeper|publican|barkeep/.test(occupation)) service = 'inn';
    else if (/librarian|scholar|scribe|historian|sage|wizard|mage|arcanist/.test(occupation)) service = 'library';
    else if (/hunter|tracker|ranger|trapper/.test(occupation)) service = 'hunter';
    else if (/guard|watch|sentinel|warden|knight|constable/.test(occupation)) service = 'guard';
    return {id:String(n.id), name:String(n.name || n.occupation || n.role || 'Local resident'), occupation:String(n.occupation || n.role || 'Resident'), icon:String(n.icon || '♙'), service, siteId:site.id};
  });
}
function ir0774WorkerForService(workers, service) {
  if (!Array.isArray(workers)) return null;
  const aliases = service.key === 'smithy' || service.key === 'workshop' ? ['forge'] : [service.key];
  return workers.find(worker => aliases.includes(worker.service)) || null;
}
function ir0774SettlementSlots(kind) {
  // Keep service buildings around the map edges/plaza; reserve the lower center for the player marker.
  // Layout density scales with settlement type and has enough positions for all current city services.
  const slots = {
    city:    [[13,21],[37,21],[63,21],[87,21],[13,49],[37,49],[63,49],[87,49],[13,75],[37,75],[63,75],[87,75]],
    town:    [[18,25],[50,23],[82,25],[18,68],[82,68],[33,76],[67,76],[50,43]],
    village: [[23,27],[77,27],[23,68],[77,68],[50,47],[38,78]],
    hamlet:  [[28,29],[72,29],[28,68],[72,68],[50,48],[38,78]],
    remote:  [[28,27],[72,27],[28,68],[72,68],[50,47],[38,78]]
  };
  return (slots[kind] || slots.village).map(([x,y]) => ({x,y}));
}
function ir0774TerrainObjects(terrain, seed, excluded, count=8) {
  const candidates = [
    {x:5,y:15},{x:93,y:15},{x:7,y:40},{x:92,y:42},{x:8,y:82},{x:92,y:82},
    {x:22,y:12},{x:76,y:12},{x:18,y:88},{x:80,y:89},{x:4,y:60},{x:96,y:60},
    {x:36,y:14},{x:65,y:13},{x:34,y:88},{x:66,y:89},{x:12,y:24},{x:88,y:25},
    {x:11,y:70},{x:89,y:70},{x:42,y:8},{x:58,y:8},{x:42,y:91},{x:58,y:91}
  ];
  const shuffled = ir0774Shuffle(candidates, `${seed}|terrain-positions`);
  const available = shuffled.filter(p => !excluded.some(q => Math.hypot((p.x-q.x)*.82, p.y-q.y) < 13));
  const icons = terrain.objects;
  return available.slice(0, count).map((p,i)=>({ ...p, icon:icons[(ir0774Hash(`${seed}|${i}|${p.x}|${p.y}`)%icons.length)] }));
}
function ir0774DecorationMarkup(terrain, seed, excluded, settlementKind='') {
  if (!Array.isArray(terrain?.objects) || !terrain.objects.length) return '';
  const objects = ir0774TerrainObjects(terrain, seed, excluded, settlementKind ? 7 : 13);
  const natural = objects.map((o,i)=>`<span class="ir0774-scenery-object ir0774-scenery-${terrain.key}" style="left:${o.x}%;top:${o.y}%" aria-hidden="true">${esc(o.icon)}</span>`).join('');
  if (!settlementKind) return natural;
  const houseSlots = ir0774Shuffle([
    {x:12,y:28},{x:87,y:30},{x:12,y:72},{x:88,y:72},{x:32,y:14},{x:68,y:14},
    {x:32,y:85},{x:68,y:85},{x:7,y:50},{x:93,y:50},{x:39,y:80},{x:61,y:80}
  ], `${seed}|houses`);
  const wanted = ({hamlet:2,remote:2,village:3,town:4,city:5})[settlementKind] || 3;
  let houses = 0;
  const houseMarkup = houseSlots.filter(p => !excluded.some(q=>Math.hypot((p.x-q.x)*.82,p.y-q.y)<14) && !objects.some(q=>Math.hypot((p.x-q.x)*.82,p.y-q.y)<10))
    .slice(0,wanted).map((p,i)=>{
      houses++;
      return `<span class="ir0774-decor-house house-style-${ir0774Hash(`${seed}|house|${i}`)%3}" style="left:${p.x}%;top:${p.y}%" aria-hidden="true"><i class="roof"></i><i class="walls"><b></b><b></b><em></em></i></span>`;
    }).join('');
  return natural + houseMarkup;
}
function ir0774ServiceBuildingMarkup(service, point, worker, index) {
  const actionAttrs = service.action === 'tab'
    ? `data-tab="${esc(service.target)}"`
    : `data-action="${esc(service.target)}"`;
  const workerHtml = worker ? `<span class="ir0774-worker-tag" title="Recorded worker: ${esc(worker.name)}">${esc(worker.icon)} ${esc(worker.name)}</span>` : '';
  const label = `${service.label}${worker ? ` · ${worker.name}, ${worker.occupation}` : ''}. ${service.verb}. This is an existing service, not a movement tile.`;
  return `<button class="ir0774-service-building service-${esc(service.shape)}" style="left:${point.x}%;top:${point.y}%" ${actionAttrs} title="${esc(label)}" aria-label="${esc(label)}"><span class="ir0774-building-art" aria-hidden="true"><i class="ir0774-building-roof"></i><i class="ir0774-building-wall"><b class="win win-a"></b><b class="win win-b"></b><b class="ir0774-building-door"></b></i><i class="ir0774-building-sign">${esc(service.icon)}</i></span><span class="ir0774-building-name">${esc(service.short)}</span>${workerHtml}</button>`;
}
function ir0774LocalScene(model) {
  const current = model?.current;
  if (!current || !model?.region) return '';
  const profile = model.biomes?.[current.biomeId] || (typeof irBiomeProfileForSite === 'function' ? irBiomeProfileForSite(current) : null);
  const visited = ir0773SiteWasVisited(current, model);
  const knownScene = visited && (ir0773ActualKnowledge(current, model) || current.discovered === true);
  const seed = `${model.world?.seed || model.region?.name || 'realm'}|${current.geoId || current.id || 'current'}`;
  const terrain = knownScene ? ir0774TerrainPresentation(current, profile) : {key:'unknown', objects:[], ground:'Unsurveyed terrain', water:false};
  const isSettlement = knownScene && current.type === 'settlement';
  const settlementKind = isSettlement ? (['hamlet','remote','village','town','city'].includes(current.settlementType) ? current.settlementType : 'village') : '';
  const services = isSettlement ? ir0774RecordedServices(current) : [];
  const workers = knownScene ? ir0774LocalWorkers(current) : [];
  const slots = ir0774Shuffle(ir0774SettlementSlots(settlementKind || 'village'), `${seed}|service-slots`);
  const usedPoints = [];
  const buildings = services.map((service,index)=>{
    const point = slots[index] || {x:12 + (index%4)*25, y:25 + Math.floor(index/4)*35};
    usedPoints.push(point);
    return ir0774ServiceBuildingMarkup(service, point, ir0774WorkerForService(workers,service), index);
  }).join('');
  const staffCards = workers.filter(worker=>worker.service==='guard' || (worker.service && !services.some(service=>service.key===worker.service))).slice(0,4);
  const staffMarkup = staffCards.length ? `<div class="ir0774-local-people" aria-label="Recorded local workers"><span class="ir0774-local-people-title">Known local workers</span>${staffCards.map(n=>`<button class="ir0774-worker-link" data-tab="People" title="Open the existing People directory for ${esc(n.name)}"><span>${esc(n.icon)}</span><span><b>${esc(n.name)}</b><small>${esc(n.occupation)}</small></span></button>`).join('')}</div>` : '';
  const decorations = ir0774DecorationMarkup(terrain, seed, usedPoints, settlementKind);
  const pathMarkup = isSettlement ? `<svg class="ir0774-settlement-paths" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><path d="M500 615 C495 520 520 455 500 340 S495 130 500 -15"/><path d="M-10 330 C200 330 315 305 500 340 S805 332 1010 310"/><path d="M130 590 C245 485 320 450 500 340 S760 210 875 25"/></svg><div class="ir0774-central-green" aria-hidden="true"><span>Gathering green</span></div>` : '';
  const camp = knownScene && !!current.changes?.temporaryCamp && !isSettlement
    ? `<button class="ir0774-camp-site" data-action="local-rest" title="Use the existing temporary-camp rest interaction" aria-label="Rest at the existing temporary camp"><span>🔥</span><b>Camp</b></button>` : '';
  const landmark = knownScene && current.type === 'landmark' && current.pointOfInterestId
    ? `<button class="ir0774-landmark-site" data-tab="Adventure" title="Open the existing local exploration screen for this recorded point of interest" aria-label="Explore the recorded landmark ${esc(current.name || 'Landmark')}"><span>${esc(irSafeIcon(current.icon || profile?.icon || '🪨'))}</span><b>${esc(current.name || 'Recorded landmark')}</b><small>Open exploration</small></button>` : '';
  const openWild = knownScene && !isSettlement && current.type !== 'landmark'
    ? `<button class="ir0774-explore-site" data-tab="Adventure"><span>🧭</span><span><b>Explore this area</b><small>Open existing scouting, foraging, and local activities</small></span><span>↗</span></button>` : '';
  const serviceEmpty = isSettlement && !services.length
    ? `<div class="ir0774-no-service-note">${Array.isArray(current.services) && current.services.length ? 'This site has recorded service entries without a registered local-map interaction. No unsupported building is shown.' : 'No interactive services are recorded here. Decorative homes and gathering space do not open interactions.'}</div>` : '';
  const headerKind = !knownScene ? 'Unsurveyed surroundings' : isSettlement ? `${String(current.settlementType || 'settlement').replace(/\b\w/g,c=>c.toUpperCase())} layout` : current.type === 'landmark' ? 'Recorded point of interest' : 'Wilderness terrain';
  const currentName = knownScene ? (current.name || 'Current location') : 'Current location';
  const playerLabel = knownScene ? 'YOU ARE HERE' : 'CURRENT POSITION';
  const features = knownScene ? `${esc(profile?.name || current.biome || 'Unclassified terrain')} · ${isSettlement ? 'recorded services shown as interactive buildings' : current.type === 'landmark' ? 'one recorded point of interest' : 'no settlement businesses at this site'}` : 'Local details and services are hidden until the location is explored';
  return `<section class="ir0774-local-scene-section" aria-label="Illustrated local map"><div class="ir0774-local-scene-heading"><div><span class="eyebrow">LOCAL MAP</span><h3>${esc(headerKind)}</h3><p>${features}</p></div><span class="ir0774-local-scene-scale">SCHEMATIC · NOT WALKABLE GRID</span></div><div class="ir0774-local-scene terrain-${terrain.key} ${isSettlement ? `settlement-${settlementKind}` : 'wilderness-scene'} ${!knownScene ? 'scene-unsurveyed' : ''}" role="group" aria-label="Illustrative ${esc(headerKind.toLowerCase())} using the current site's existing data"><div class="ir0774-ground-texture" aria-hidden="true"></div>${terrain.water && knownScene ? '<div class="ir0774-terrain-water-patch" aria-hidden="true"></div>' : ''}${decorations}${pathMarkup}${buildings}${camp}${landmark}${openWild}<div class="ir0774-player-position" aria-label="Player is at this current location; exact position within the site is not recorded"><span>♙</span><b>${playerLabel}</b><small>${knownScene ? 'Exact local position not tracked' : 'Site details not surveyed'}</small></div><div class="ir0774-scene-compass" aria-hidden="true">N<br>✦</div><div class="ir0774-local-scene-footnote">${isSettlement ? 'Clickable buildings use only services already recorded for this settlement. Homes, paths, and scenery are decorative.' : 'Terrain features are illustrative. Only the current location and existing actions are authoritative.'}</div></div><div class="ir0774-local-map-legend"><span><i class="ir0774-legend-button">⌂</i> Existing service / destination — interactive</span><span><i class="ir0774-legend-decor">🌿</i> Terrain & decorative scenery — not interactive</span><span><i class="ir0774-legend-player">♙</i> Player at the current site; no tile movement</span></div>${staffMarkup}${serviceEmpty}</section>`;
}

// Reuse the accepted v0.7.7.3 local detail panel for route rows, current-site metadata,
// and its existing travel handlers. Insert the illustrative scene without changing those rules.
const ir0774RenderLocalViewBase = ir0773RenderLocalView;
ir0773RenderLocalView = function(model) {
  const html = ir0774RenderLocalViewBase.apply(this, arguments);
  // Match the panel class anywhere in the class list; the accepted markup prepends layout classes.
  if (!html || !html.includes('ir0773-local-panel')) return html;
  const scene = ir0774LocalScene(model);
  let result = html.replace('A focused view of your actual current site. Inspect local services and known exits; no street or building layout is invented.', 'An illustrated local scene built from the current site’s recorded biome, service list, and known points of interest. Exact building positions are not saved.');
  result = result.replace('</div><div class="ir0773-local-stats">', `</div>${scene}<div class="ir0773-local-stats">`);
  result = result.replace(/<strong>Local geometry is not recorded:<\/strong>[\s\S]*?<\/p>/, '<strong>Illustration limits:</strong> service buildings correspond only to this location’s saved services; named workers come only from existing NPC records. Ordinary homes, footpaths, and terrain props are decorative. Building placement is not saved geography, and roads, crossings, interiors, and exact local coordinates are not recorded.</p>');
  if (!ir0773SiteWasVisited(model?.current, model)) {
    // The legacy local detail header also shows the current site's biome/icon. Keep those
    // details concealed until surveyed, matching the regional map's visibility policy.
    result = result.replace(/(<p>Unsurveyed location · )[^<]*(<\/p>)/, '$1Terrain not surveyed$2');
    result = result.replace(/<div class="ir0773-local-seal">[\s\S]*?<\/div>/, '<div class="ir0773-local-seal">⌖</div>');
  }
  return result;
};

// Keep inherited shell metadata coherent with the accepted local-map subversion.
if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.7.4';
const ir0774ShellBaseline = typeof shell === 'function' ? shell : null;
if (ir0774ShellBaseline) shell = function() {
  return ir0774ShellBaseline.apply(this, arguments)
    .replace(/v0\.7\.7\.3/gi, 'v0.7.7.4')
    .replace(/Infinite Realms 0\.7\.7\.3/g, 'Infinite Realms 0.7.7.4')
    .replace(/VERSION 0\.7\.7\.3/g, 'VERSION 0.7.7.4');
};
const ir0774RenderTitleBaseline = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0774RenderTitleBaseline) renderTitle = function() {
  return ir0774RenderTitleBaseline.apply(this, arguments)
    .replace(/VERSION 0\.7\.7\.3/g, 'VERSION 0.7.7.4')
    .replace(/Version 0\.7\.7\.3/g, 'Version 0.7.7.4');
};
