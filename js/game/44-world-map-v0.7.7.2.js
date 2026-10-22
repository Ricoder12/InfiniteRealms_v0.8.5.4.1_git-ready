'use strict';
// Infinite Realms v0.7.7.2 — world atlas + safe regional-map selection.
// This module never generates geographic entities or coordinates. The atlas only places the
// existing primary region as an unlocated chart entry until true world-scale geography exists.

let ir0772MapScope = 'atlas'; // session UI state only; never written to the save
let ir0772SelectedGeoId = null;
let ir0772SelectedFromIntel = false;

function ir0772WorldMapModel(world = (typeof state !== 'undefined' ? state?.world : null)) {
  if (!world || typeof world !== 'object') return null;
  const region = world.region && typeof world.region === 'object' ? world.region : null;
  const sites = Array.isArray(region?.sites) ? region.sites.filter(s => s && typeof s === 'object' && typeof s.id === 'string') : [];
  const routes = Array.isArray(region?.routes) ? region.routes.filter(r => r && typeof r === 'object') : [];
  const knownIds = new Set(Array.isArray(world.known) ? world.known.filter(x => typeof x === 'string') : []);
  const visitedIds = new Set(Array.isArray(world.visited) ? world.visited.filter(x => typeof x === 'string') : []);
  const current = sites.find(s => s.id === world.siteId) || sites[0] || null;
  if (current) knownIds.add(current.id);
  const byLegacyId = new Map(sites.map(s => [s.id, s]));
  const visibleSites = sites.filter(s => knownIds.has(s.id) || visitedIds.has(s.id) || s.discovered === true || s === current);
  const visibleBiomeCounts = {};
  for (const s of visibleSites) {
    if (typeof s.biomeId !== 'string' || !s.biomeId) continue;
    visibleBiomeCounts[s.biomeId] = (visibleBiomeCounts[s.biomeId] || 0) + 1;
  }
  const visitedPlaces = sites.filter(s => (visitedIds.has(s.id) || Number(s.visits) > 0 || s === current) && ['settlement', 'landmark'].includes(s.type));
  const continents = Array.isArray(world.continents) ? world.continents.filter(x => x && typeof x === 'object' && typeof x.id === 'string') : [];
  const countries = Array.isArray(world.countries) ? world.countries.filter(x => x && typeof x === 'object' && typeof x.id === 'string') : [];
  const biomes = typeof IR_BIOMES !== 'undefined' && IR_BIOMES && typeof IR_BIOMES === 'object' ? IR_BIOMES : {};
  return { world, region, sites, routes, knownIds, visitedIds, current, byLegacyId, visibleSites,
    visibleBiomeCounts, visitedPlaces, continents, countries, biomes,
    hasWorldScaleGeometry: !!(world.worldMap && Array.isArray(world.worldMap.features) && world.worldMap.features.length) };
}

function ir0772CanInspectSite(siteRecord, model, intelAllowed = false) {
  if (!siteRecord || !model) return false;
  return siteRecord === model.current || model.knownIds.has(siteRecord.id) || model.visitedIds.has(siteRecord.id) || siteRecord.discovered === true || intelAllowed;
}

function ir0772TypeLabel(s) {
  if (!s) return 'Unknown place';
  if (s.type === 'settlement') return typeof irSettlementTitle === 'function' ? irSettlementTitle(s.settlementType) : 'Settlement';
  if (s.type === 'landmark') return 'Landmark';
  return 'Wilderness';
}

function ir0772AtlasKnownPlaces(model) {
  const m = model;
  return m.visitedPlaces.filter(s => m.visitedIds.has(s.id) || Number(s.visits) > 0 || s === m.current)
    .sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
}

function ir0772RenderWorldAtlas(world = (typeof state !== 'undefined' ? state?.world : null)) {
  const m = ir0772WorldMapModel(world);
  if (!m || !m.region || !m.current) {
    return `${typeof pageHead === 'function' ? pageHead('World Atlas unavailable', 'The saved world does not contain a usable primary region.') : '<h1>World Atlas unavailable</h1>'}<section class="panel panel-pad"><p class="ir0772-muted">No geographic records can be displayed safely. Your save has not been changed.</p><button class="button" data-tab="Life">Return to life</button></section>`;
  }
  const current = m.current;
  // Keep existing current-site safety and racial-affinity feedback visible in the atlas layer.
  const hazardNotice = typeof ir0763HazardWarning === 'function' ? ir0763HazardWarning(current) : '';
  const affinityNotice = typeof ir0764AffinityNotice === 'function' ? ir0764AffinityNotice(current) : '';
  const knownCount = m.visibleSites.filter(s => m.knownIds.has(s.id) || m.visitedIds.has(s.id) || s.discovered === true || s === current).length;
  const visitedCount = m.sites.filter(s => m.visitedIds.has(s.id) || Number(s.visits) > 0 || s === current).length;
  const observed = Object.entries(m.visibleBiomeCounts).filter(([id]) => m.biomes[id]).sort((a,b) => m.biomes[a[0]].name.localeCompare(m.biomes[b[0]].name));
  const places = ir0772AtlasKnownPlaces(m);
  const hierarchyText = (m.continents.length || m.countries.length)
    ? `<div class="ir0772-hierarchy"><strong>Recorded geographic hierarchy</strong><p>${m.continents.length ? `${m.continents.length} continent record${m.continents.length===1?'':'s'}` : 'No continent records'} · ${m.countries.length ? `${m.countries.length} country record${m.countries.length===1?'':'s'}` : 'No country records'}. Borders are drawn only when actual boundary geometry is available.</p>${[...m.continents.map(x=>({kind:'Continent',item:x})),...m.countries.map(x=>({kind:'Country',item:x}))].map(x=>`<span class="ir0772-hierarchy-chip">${esc(x.kind)} · ${esc(x.item.name||x.item.id)}</span>`).join('')}</div>`
    : `<div class="ir0772-no-borders"><span class="ir0772-seal-small">⌖</span><div><strong>No political boundary geometry recorded</strong><p>Political entities and regional ownership can exist without country polygons. This save has no explicit political boundary geometry, so the atlas will not infer borders from ownership, roads, adjacency, or location positions.</p></div></div>`;
  const placeList = places.length ? `<div class="ir0772-place-list">${places.map(s=>`<div class="ir0772-place-row"><span class="ir0772-place-icon">${esc(irSafeIcon(s.icon||'⌖'))}</span><div class="ir0772-place-copy"><strong>${esc(s.name||'Known place')}</strong><p>${esc(ir0772TypeLabel(s))} · ${esc((m.biomes[s.biomeId]||{}).name||s.biome||'Terrain recorded')}</p></div><button class="button small subtle" data-action="ir0772-inspect-location" data-site="${esc(s.id)}" data-geo-id="${esc(s.geoId||'')}" title="Inspect on the regional map">Locate</button></div>`).join('')}</div>`
    : `<div class="empty">No visited settlements or landmarks have been recorded yet. Open the regional map to examine the known routes and nearby terrain.</div>`;
  return `${pageHead('Atlas of Known Lands', 'A world-scale index of geography that exists in this save. Open the charted region to inspect terrain, known places, and connected routes.')}${hazardNotice}${affinityNotice}
    <section class="ir0772-atlas-frame" aria-label="Interactive world atlas">
      <div class="ir0772-atlas-topline"><span>✧ FIELD ATLAS · WORLD LAYER</span><span>SEED ${esc(m.world.seed||'LEGACY')}</span></div>
      <div class="ir0772-atlas-canvas">
        <svg class="ir0772-atlas-ornament" viewBox="0 0 1000 420" preserveAspectRatio="none" role="img" aria-label="Decorative compass and cartographic grid; no world coastline or borders are implied">
          <defs><pattern id="ir0772-parch-grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#755d3b" stroke-width="1" opacity=".15"/></pattern><radialGradient id="ir0772-parch-glow"><stop offset="0" stop-color="#fff8d9" stop-opacity=".5"/><stop offset="1" stop-color="#c5a66c" stop-opacity="0"/></radialGradient></defs>
          <rect width="1000" height="420" fill="url(#ir0772-parch-grid)"/><ellipse cx="500" cy="205" rx="390" ry="205" fill="url(#ir0772-parch-glow)"/>
          <g transform="translate(122 210)" fill="none" stroke="#7b6748" stroke-width="2" opacity=".55"><circle r="76"/><circle r="59"/><circle r="35" stroke-dasharray="4 8"/><path d="M0 -92V92M-92 0H92M-65 -65L65 65M65 -65L-65 65"/><path d="M0 -62L12 0L0 62L-12 0Z" fill="#a17f48" fill-opacity=".16"/><circle r="6" fill="#a17f48"/></g>
          <g fill="#725c3e" opacity=".6"><circle cx="298" cy="69" r="2"/><circle cx="740" cy="86" r="2"/><circle cx="836" cy="302" r="2"/><circle cx="301" cy="348" r="2"/><path d="M274 108l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><path d="M816 120l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></g>
        </svg>
        <div class="ir0772-map-edge-note"><span>THE UNCHARTED WORLD</span><small>Beyond the current map data</small></div>
        <div class="ir0772-region-card">
          <div class="ir0772-region-sigil">✧</div><div class="ir0772-region-eyebrow">ONLY POPULATED REGION RECORD</div>
          <h2>${esc(m.region.name||'Unnamed region')}</h2><p>${esc(m.region.desc||'A region is present in the saved world, but its description is unavailable.')}</p>
          <div class="ir0772-region-statline"><span><b>${knownCount}</b> known areas</span><span><b>${visitedCount}</b> visited</span><span><b>${observed.length}</b> observed biomes</span></div>
          <div class="ir0772-placement-note"><span>⊙</span> World position not defined · not to scale</div>
          <button class="button primary" data-action="ir0772-open-region">Open regional map <span aria-hidden="true">↗</span></button>
        </div>
        <div class="ir0772-atlas-caption">This is an interactive atlas index, not a fabricated continental map. Spatial placement becomes available when the world model contains real world-scale coordinates.</div>
      </div>
    </section>
    <div class="grid two ir0772-atlas-lower">
      <section class="panel panel-pad ir0772-current-card"><div class="panel-heading"><div><div class="eyebrow">✦ YOUR POSITION</div><h2>${esc(irSafeIcon(current.icon||'⌖'))} ${esc((m.visitedIds.has(current.id)||current.discovered===true)?current.name:'Current location')}</h2><p>${esc((m.biomes[current.biomeId]||{}).name||current.biome||'Terrain profile unavailable')} · ${esc(current===m.current?'Current location':ir0772TypeLabel(current))}</p></div><span class="tag gold">CURRENT</span></div><p class="ir0772-current-desc">${esc((m.visitedIds.has(current.id)||current.discovered===true)?(current.desc||'No local description recorded.'):'Your exact site details remain undisclosed until you explore it.')}</p><div class="ir0772-current-meta"><span>${visitedCount} visited</span><span>${knownCount} known / charted</span><span>${Number(m.world.travelCount)||0} journeys</span></div><button class="button block" data-action="ir0772-inspect-location" data-site="${esc(current.id)}" data-geo-id="${esc(current.geoId||'')}">Inspect current location on regional map</button></section>
      <section class="panel panel-pad"><div class="panel-heading"><div><div class="eyebrow">KNOWN TERRAIN</div><h2>Biomes in the chart</h2><p>Only known, visited, or discovered sites contribute to this list.</p></div></div>
        ${observed.length ? `<div class="ir0772-biome-list">${observed.map(([id,count])=>`<span class="ir0772-biome-chip"><i>${esc(irSafeIcon(m.biomes[id].icon||'✧'))}</i><b>${esc(m.biomes[id].name)}</b><small>${count} known area${count===1?'':'s'}</small></span>`).join('')}</div>` : `<div class="empty">No biome profiles can be shown for the currently known locations.</div>`}
        ${hierarchyText}
      </section>
    </div>
    <section class="panel panel-pad ir0772-known-place-panel"><div class="panel-heading"><div><div class="eyebrow">VISITED SETTLEMENTS & LANDMARKS</div><h2>Places in your journal</h2><p>Only places whose names and type are already known are listed here. Selecting a place opens it on the regional chart; it never starts travel.</p></div><span class="tag">${places.length} RECORDED</span></div>${placeList}</section>`;
}

function ir0772SelectedSite(model) {
  return model?.sites.find(s => s.geoId === ir0772SelectedGeoId || (!s.geoId && s.id === ir0772SelectedGeoId)) || model?.current || null;
}

function ir0772RenderRegionalMap(model) {
  const m = model;
  if (!m?.region || !m.current) return `<section class="panel panel-pad"><strong>Regional map unavailable</strong><p class="ir0772-muted">This save is missing required region data. No geography has been generated or altered.</p></section>`;
  const selected = ir0772SelectedSite(m);
  const isSelectedIntel = !!(ir0772SelectedFromIntel && selected?.geoId === ir0772SelectedGeoId);
  const isSelectedVisited = !!selected && (m.visitedIds.has(selected.id) || Number(selected.visits) > 0 || selected === m.current);
  const isSelectedKnown = !!selected && (m.knownIds.has(selected.id) || m.visitedIds.has(selected.id) || selected.discovered === true || selected === m.current);
  const profile = selected ? (m.biomes[selected.biomeId] || null) : null;
  const selectedBiome = profile?.name || selected?.biome || 'Unclassified terrain';
  const selectedName = !selected ? 'Unknown place' : (isSelectedVisited || isSelectedIntel) ? (selected.name || 'Reported location') : `${selectedBiome} area`;
  const selectedDetails = !selected ? '<p>No location record is currently available.</p>' : isSelectedVisited
    ? `<p>${esc(ir0772TypeLabel(selected))} · ${esc(selectedBiome)} · Local risk ${Number.isFinite(Number(selected.risk)) ? `${Number(selected.risk)}%` : 'not recorded'}</p><p>${esc(selected.desc || 'No description recorded for this site.')}</p>`
    : isSelectedIntel
      ? `<p>Reported by purchased intelligence. ${esc(selectedBiome)} terrain is recorded; local features, risk, and visitation remain unconfirmed.</p>`
      : `<p>Known terrain: ${esc(selectedBiome)}. The local name, settlement status, landmark details, and danger remain unconfirmed until you visit.</p>`;
  const route = selected && selected !== m.current && typeof irRouteBetween === 'function' ? irRouteBetween(m.current.id, selected.id) : null;
  const tripAction = !selected || selected === m.current
    ? `<span class="ir0772-selection-status">✦ You are here now</span>`
    : route
      ? `<button class="button primary" data-action="travel" data-site="${esc(selected.id)}" data-transport="foot">Travel here · ${irCurrentTransportDays(route.distanceKm, 'foot')} day${irCurrentTransportDays(route.distanceKm, 'foot') === 1 ? '' : 's'}</button>`
      : `<span class="ir0772-selection-status">No direct route from your current location. Travel rules are unchanged.</span>`;
  const inspectCard = `<div class="ir0772-inspect-card" aria-live="polite"><div class="ir0772-inspect-mark">${esc(irSafeIcon(!selected ? '⌖' : (isSelectedVisited || isSelectedIntel) ? (selected.icon || '⌖') : (profile?.icon || '⌖')))}</div><div class="ir0772-inspect-copy"><div class="eyebrow">${isSelectedVisited ? 'VISITED LOCATION' : isSelectedIntel ? 'REPORTED LOCATION' : 'LOCATION INSPECTION'}</div><h3>${esc(selectedName)}</h3>${selectedDetails}<div class="ir0772-inspect-actions">${tripAction}<button class="button small subtle" data-action="ir0772-clear-selection">Focus current location</button></div></div></div>`;

  // Paid intelligence is already an explicit discovery channel in the accepted game. Read its
  // actual target ids only; never create a marker or disclose a place based on a guessed name.
  let intelIds = new Set();
  try {
    const priorMapMarkup = typeof mapPanel === 'function' ? mapPanel() : '';
    for (const match of priorMapMarkup.matchAll(/class="[^"]*world-node[^"]*intel-target[^"]*"[^>]*data-site="([^"]+)"/g)) intelIds.add(match[1]);
  } catch (_) { /* Optional intelligence hooks may be absent in older saves. */ }

  const knownIds = new Set([...m.knownIds, ...m.visitedIds]);
  if (m.current) knownIds.add(m.current.id);
  const visibleSites = m.sites.filter(s => knownIds.has(s.id) || s.discovered === true || intelIds.has(s.id));
  const terrainColors = {
    forest: ['#284d3b','#3f6744'], plains: ['#687a46','#8a994d'], mountain: ['#535d58','#7b8177'],
    swamp: ['#354d45','#4a6860'], desert: ['#806744','#ad915a'], snow: ['#77898a','#becbc2'],
    coast: ['#3d7379','#70a6a6'], river: ['#356c65','#58958a'], woodland: ['#3d5c40','#7b8f4b']
  };
  const knownTerrainBlobs = visibleSites.map((siteRecord, i) => {
    const color = terrainColors[siteRecord.biomeId] || terrainColors.woodland;
    const decoration = ['forest','woodland'].includes(siteRecord.biomeId) ? '<span>🌲</span><span>🌳</span><span>🌲</span>'
      : ['mountain','snow'].includes(siteRecord.biomeId) ? '<span>⛰️</span><span>🏔️</span>'
      : ['coast','river','swamp'].includes(siteRecord.biomeId) ? '<span>〰️</span><span>〰️</span>'
      : siteRecord.biomeId === 'desert' ? '<span>〰️</span><span>🌾</span>' : '<span>🌾</span><span>🌳</span>';
    return `<div aria-hidden="true" class="ir05-terrain-blob terrain-${esc(siteRecord.biomeId || 'woodland')}" style="left:${Number(siteRecord.x)||0}%;top:${Number(siteRecord.y)||0}%;--terrain-a:${color[0]};--terrain-b:${color[1]};--patch:${68+(i%3)*11}px">${decoration}</div>`;
  });
  // Unknown fog is ambient terrain texture, deliberately independent of hidden site records.
  // Never place fog at an undiscovered site's coordinates; even an unlabeled dot can leak a lead.
  const fogPatches = [[17.3,28.1,83],[37.7,14.3,92],[55.1,35.7,104],[76.3,25.1,88],
    [24.7,54.3,97],[65.7,64.1,110],[84.3,46.7,84],[44.9,81.3,103],[72.1,87.7,89]]
    .map(([x,y,size]) => `<div aria-hidden="true" class="ir05-terrain-blob fog ir0772-uncharted-terrain" style="left:${x}%;top:${y}%;--terrain-a:#35413a;--terrain-b:#46534a;--patch:${size}px"></div>`);
  const blobs = [...knownTerrainBlobs, ...fogPatches].join('');

  const routes = m.routes.map(edge => {
    const resolved = typeof irGeoResolveGlobalRoute === 'function' ? irGeoResolveGlobalRoute(m.region, edge) : {from: m.sites[edge.a], to: m.sites[edge.b], resolved: !!m.sites[edge.a] && !!m.sites[edge.b]};
    const a = resolved?.from, b = resolved?.to;
    if (!resolved?.resolved || !a || !b) return '';
    // Route strokes must match a connection accepted by the existing travel helper.
    if (typeof irRouteBetween === 'function' && !irRouteBetween(a.id, b.id) && !irRouteBetween(b.id, a.id)) return '';
    const allowed = (knownIds.has(a.id) || a.discovered === true || intelIds.has(a.id)) && (knownIds.has(b.id) || b.discovered === true || intelIds.has(b.id));
    if (!allowed) return '';
    const x1 = (Number(a.x)||0)*10, y1 = (Number(a.y)||0)*6.3, x2 = (Number(b.x)||0)*10, y2 = (Number(b.y)||0)*6.3;
    const curve = (((Number(a.index) || 0) + (Number(b.index) || 0)) % 2 ? 1 : -1) * 18;
    const isActive = a.id === m.current.id || b.id === m.current.id;
    return `<path d="M ${x1} ${y1} Q ${(x1+x2)/2+curve} ${(y1+y2)/2-curve} ${x2} ${y2}" class="ir05-road ${isActive?'active':''}" ${edge.shortcut ? 'stroke-dasharray="6 8"' : ''}/>`;
  }).join('');

  const nodes = visibleSites.map(siteRecord => {
    const isCurrent = siteRecord === m.current;
    const isVisited = m.visitedIds.has(siteRecord.id) || Number(siteRecord.visits) > 0 || isCurrent;
    const isKnown = m.knownIds.has(siteRecord.id) || m.visitedIds.has(siteRecord.id) || siteRecord.discovered === true || isCurrent;
    const isIntel = intelIds.has(siteRecord.id) && !isKnown;
    const biome = m.biomes[siteRecord.biomeId] || null;
    const label = isIntel ? 'Reported lead' : isVisited ? (siteRecord.name || 'Visited location') : `${biome?.name || 'Known terrain'} area`;
    const icon = isCurrent ? '✦' : isIntel ? '🗡️' : isVisited ? (siteRecord.icon || '⌖') : (biome?.icon || '⌖');
    const selectedClass = (siteRecord.geoId && siteRecord.geoId === ir0772SelectedGeoId) || (!siteRecord.geoId && siteRecord.id === ir0772SelectedGeoId) ? 'selected' : '';
    const x = Number(siteRecord.x) || 0;
    const y = Number(siteRecord.y) || 0;
    const edgeClasses = [x < 16 ? 'edge-west' : x > 84 ? 'edge-east' : '', y > 82 ? 'edge-south' : ''].filter(Boolean).join(' ');
    const classes = `world-node ir0772-regional-node ${edgeClasses} ${isCurrent?'current':''} ${isVisited?'visited':''} ${isKnown?'known':''} ${isIntel?'intel-target':''} ${selectedClass}`;
    const nodeTitle = isIntel ? 'Inspect reported intelligence' : `Inspect ${label}`;
    return `<button class="${classes}" style="left:${Number(siteRecord.x)||0}%;top:${Number(siteRecord.y)||0}%" data-action="ir0772-inspect-location" data-site="${esc(siteRecord.id)}" data-geo-id="${esc(siteRecord.geoId||'')}" title="${esc(nodeTitle)}" aria-label="${esc(nodeTitle)}"><span class="node-icon">${esc(icon)}</span><span class="node-label">${esc(label)}</span></button>`;
  }).join('');
  const found = visibleSites.length;
  return `<section class="panel panel-pad world-map-panel ir0772-regional-panel"><div class="panel-heading"><div><div class="eyebrow">REGIONAL TERRAIN CHART</div><h2>${esc(m.region.name || 'Current region')}</h2><p>${esc(m.region.desc || 'The saved region has no description.')} Markers show known places; fogged terrain does not expose unvisited site details.</p></div><span class="tag gold">${found} VISIBLE MARKERS</span></div><div class="ir05-map-canvas ir0772-regional-canvas" aria-label="Interactive regional terrain map"> <div class="ir05-map-water" aria-hidden="true"></div><div class="ir05-map-ridges" aria-hidden="true">⛰️　　⛰️ ⛰️</div>${blobs}<svg class="ir05-map-road-svg" viewBox="0 0 1000 630" preserveAspectRatio="none" aria-label="Recorded routes between known locations"><path d="M0 90 C120 140 115 230 270 250 S430 150 560 260 S800 360 1000 270" class="ir05-river"/>${routes}</svg>${nodes}<div class="ir05-map-compass" aria-hidden="true">N<br>✦</div></div><div class="map-legend"><span><i class="legend-dot current"></i> Current location</span><span><i class="legend-dot visited"></i> Visited</span><span>Terrain symbols appear only for known areas</span><span>Routes show only when both endpoints are known</span></div>${inspectCard}</section>`;
}

const ir0772RenderWorldBaseline = renderWorld;
renderWorld = function() {
  if (ir0772MapScope !== 'regional') return ir0772RenderWorldAtlas();
  const m = ir0772WorldMapModel();
  if (m?.current?.geoId && (!ir0772SelectedGeoId || !m.sites.some(s => s.geoId === ir0772SelectedGeoId || s.id === ir0772SelectedGeoId))) ir0772SelectedGeoId = m.current.geoId;
  else if (!ir0772SelectedGeoId && m?.current) ir0772SelectedGeoId = m.current.geoId || m.current.id;
  let html = ir0772RenderWorldBaseline.apply(this, arguments);
  html = html.replace('A world generated for this life.', 'Regional chart');
  html = html.replace('Travel a connected map, learn its biomes, and make discoveries that remain in your journal.', 'Inspect known locations, compare local terrain, and choose travel as a separate action.');
  const viewbar = `<div class="ir0772-map-viewbar"><div><span class="eyebrow">REGIONAL LAYER</span><strong>${esc(m?.region?.name||'Current region')}</strong><p>Detailed locations and routes inside the charted region.</p></div><button class="button subtle" data-action="ir0772-return-atlas">← World atlas</button></div>`;
  // The accepted renderer replaces mapPanel() with ir05NaturalMapPanel(); replace the actual
  // rendered section and put the atlas return control next to it.
  const regional = ir0772RenderRegionalMap(m);
  html = html.replace(/<section class="panel panel-pad ir05-map-panel">[\s\S]*?<\/section>/, viewbar + regional);
  return html;
};

const ir0772RunActionBaseline = runAction;
runAction = function(target) {
  const action = target?.dataset?.action;
  if (state?.combat?.active && ['ir0772-open-region','ir0772-return-atlas','ir0772-inspect-location','ir0772-clear-selection'].includes(action)) {
    toast('Finish the current encounter before browsing the atlas.');
    return;
  }
  if (action === 'ir0772-open-region') {
    const m = ir0772WorldMapModel(); if (!m?.region) { toast('No regional chart is available in this save.'); return; }
    ir0772MapScope = 'regional'; ir0772SelectedGeoId = m.current?.geoId || null; ir0772SelectedFromIntel = false; render(); return;
  }
  if (action === 'ir0772-return-atlas') { ir0772MapScope = 'atlas'; ir0772SelectedFromIntel = false; render(); return; }
  if (action === 'ir0772-inspect-location') {
    const m = ir0772WorldMapModel();
    const loc = m?.sites.find(s => (target.dataset.geoId && s.geoId === target.dataset.geoId) || (!target.dataset.geoId && s.id === target.dataset.site));
    const intel = !!target.classList?.contains('intel-target');
    if (!ir0772CanInspectSite(loc, m, intel)) { toast('That location is not currently known. Explore or uncover a lead before inspecting it.'); return; }
    ir0772SelectedGeoId = loc.geoId || loc.id || null; ir0772SelectedFromIntel = intel; ir0772MapScope = 'regional'; render(); return;
  }
  if (action === 'ir0772-clear-selection') { const m=ir0772WorldMapModel();ir0772SelectedGeoId=m?.current?.geoId||m?.current?.id||null;ir0772SelectedFromIntel=false;render();return; }
  if (action === 'travel') {
    // Keep the selection in sync with the travel target before the existing travel function renders.
    const m = ir0772WorldMapModel(); const targetSite = m?.byLegacyId.get(target.dataset.site);
    if (targetSite && (m.knownIds.has(targetSite.id) || m.visitedIds.has(targetSite.id) || targetSite.discovered === true || targetSite === m.current)) {
      ir0772SelectedGeoId = targetSite.geoId || null; ir0772SelectedFromIntel = false;
    }
  }
  return ir0772RunActionBaseline.apply(this, arguments);
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.7.2';

const ir0772ShellBaseline = typeof shell === 'function' ? shell : null;
if (ir0772ShellBaseline) shell = function() { return ir0772ShellBaseline.apply(this, arguments).replace(/VERSION 0\.7\.3(?:\.\d+)?/g, 'VERSION 0.7.7.2').replace(/Infinite Realms 0\.7\.3(?:\.\d+)?/g, 'Infinite Realms 0.7.7.2').replace(/v0\.7\.3(?:\.\d+)?/gi, 'v0.7.7.2'); };

const ir0772RenderTitleBaseline = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0772RenderTitleBaseline) renderTitle = function() { return ir0772RenderTitleBaseline.apply(this, arguments).replace(/VERSION 0\.[0-9]+(?:\.[0-9]+){0,2}/g, 'VERSION 0.7.7.2').replace(/Version 0\.[0-9]+(?:\.[0-9]+){0,2}/g, 'Version 0.7.7.2'); };
