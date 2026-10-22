'use strict';
// Infinite Realms v0.7.7.3 — regional-map accuracy and inspection.
// View-only layer: geographic records and route rules remain owned by the accepted systems.

function ir0773Coordinates(site) {
  if (!site || site.x === null || site.x === undefined || site.y === null || site.y === undefined || site.x === '' || site.y === '') return null;
  const x = Number(site.x), y = Number(site.y);
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x, y } : null;
}

function ir0773VisibleSite(site, model, intelIds, includeIntel = true) {
  if (!site || !model) return false;
  const actual = site === model.current || model.knownIds.has(site.id) || model.visitedIds.has(site.id) || site.discovered === true;
  return actual || (includeIntel && intelIds instanceof Set && intelIds.has(site.id));
}

function ir0773ActualKnowledge(site, model) {
  return !!site && !!model && (site === model.current || model.knownIds.has(site.id) || model.visitedIds.has(site.id) || Number(site.visits) > 0 || site.discovered === true);
}

function ir0773IntelIds(model) {
  const ids = new Set();
  try {
    const legacyMarkup = typeof mapPanel === 'function' ? mapPanel() : '';
    for (const match of String(legacyMarkup || '').matchAll(/class="[^"]*world-node[^"]*intel-target[^"]*"[^>]*data-site="([^"]+)"/g)) ids.add(match[1]);
  } catch (_) { /* Older saves or optional intelligence UI may not expose this hook. */ }
  return ids;
}

function ir0773LocalRoute(from, to) {
  if (!from || !to || from === to) return null;
  if (typeof irRouteBetween === 'function') return irRouteBetween(from.id, to.id) || null;
  return Array.isArray(from.routes) ? (from.routes.find(route => route && route.to === to.id) || null) : null;
}

function ir0773ResolveEdge(edge, model) {
  if (!edge || !model?.region || !Array.isArray(model.sites)) return null;
  let from = null, to = null;
  if (typeof irGeoResolveGlobalRoute === 'function') {
    const resolved = irGeoResolveGlobalRoute(model.region, edge);
    if (resolved?.resolved) { from = resolved.from; to = resolved.to; }
  } else if (edge.fromGeoId || edge.toGeoId) {
    const fromMatches = model.sites.filter(site => site?.geoId === edge.fromGeoId);
    const toMatches = model.sites.filter(site => site?.geoId === edge.toGeoId);
    if (fromMatches.length === 1 && toMatches.length === 1) { from = fromMatches[0]; to = toMatches[0]; }
  } else if (Number.isInteger(edge.a) && Number.isInteger(edge.b)) {
    from = model.sites[edge.a] || null; to = model.sites[edge.b] || null;
  }
  if (!from || !to || from === to || !model.sites.includes(from) || !model.sites.includes(to)) return null;
  const forward = ir0773LocalRoute(from, to);
  const reverse = edge.directed === true ? null : ir0773LocalRoute(to, from);
  // Existing geography declares ordinary edges undirected; require reciprocal route records.
  // Explicitly directed edges are shown only when their recorded forward traversal exists.
  if (edge.directed === true ? !forward : (!forward || !reverse)) return null;
  return { edge, from, to, route: forward, oneWay: edge.directed === true, isForward: true };
}

function ir0773VisibleEdge(edgeRecord, model, intelIds) {
  if (!edgeRecord) return false;
  const { from, to } = edgeRecord;
  const fromKnown = ir0773ActualKnowledge(from, model);
  const toKnown = ir0773ActualKnowledge(to, model);
  if (fromKnown && toKnown) return true;
  // An intelligence-only marker does not reveal its neighborhood. Permit only a real,
  // existing route from the player's current site to that explicitly reported destination.
  const current = model.current;
  if (!current) return false;
  const fromIntel = intelIds.has(from.id) && !fromKnown;
  const toIntel = intelIds.has(to.id) && !toKnown;
  return (from === current && toIntel && !!ir0773LocalRoute(current, to)) ||
    (to === current && fromIntel && edgeRecord.oneWay !== true && !!ir0773LocalRoute(current, from));
}

function ir0773ResolvedVisibleEdges(model, intelIds) {
  if (!model || !Array.isArray(model.routes)) return [];
  const result = [];
  for (const edge of model.routes) {
    const record = ir0773ResolveEdge(edge, model);
    if (!record || !ir0773VisibleEdge(record, model, intelIds)) continue;
    result.push(record);
  }
  return result;
}

function ir0773HasRenderedDirectEdge(from, to, visibleEdges) {
  if (!from || !to || !Array.isArray(visibleEdges)) return false;
  return visibleEdges.some(record => {
    if (record.from === from && record.to === to) return true;
    return record.oneWay !== true && record.from === to && record.to === from;
  });
}

function ir0773SiteWasVisited(site, model) {
  return !!site && !!model && (model.visitedIds.has(site.id) || Number(site.visits) > 0 || site.discovered === true);
}

function ir0773SafeLocationLabel(site, model, intelIds) {
  if (!site) return 'Unknown place';
  if (intelIds.has(site.id) && !ir0773ActualKnowledge(site, model)) return 'Reported lead';
  if (site === model.current && !ir0773SiteWasVisited(site, model)) return 'Current location';
  if (ir0773SiteWasVisited(site, model)) return site.name || 'Visited location';
  const profile = model.biomes?.[site.biomeId];
  return `${profile?.name || site.biome || 'Known terrain'} area`;
}

function ir0773ConnectionRows(site, model, intelIds) {
  if (!site || !model || !ir0773ActualKnowledge(site, model)) return [];
  const knownIds = new Set(model.sites.filter(candidate => ir0773ActualKnowledge(candidate, model)).map(candidate => candidate.id));
  // Do not infer neighbors from an intelligence-only site. The sole exception is an actual
  // current-location route to that specific reported lead, which the travel system already knows.
  if (!knownIds.has(site.id)) return [];
  const edges = ir0773ResolvedVisibleEdges(model, intelIds);
  const rows = [];
  for (const record of edges) {
    let neighbor = null, travelFromSite = null, route = record.route, relation = 'two-way';
    if (record.from === site) { neighbor = record.to; travelFromSite = record.from; relation = record.oneWay ? 'outgoing' : 'two-way'; }
    else if (record.to === site) { neighbor = record.from; travelFromSite = record.oneWay ? null : record.to; relation = record.oneWay ? 'incoming' : 'two-way'; }
    else continue;
    if (!neighbor || !(knownIds.has(neighbor.id) || (neighbor === model.current && ir0773ActualKnowledge(neighbor, model)))) continue;
    let travelRoute = travelFromSite ? ir0773LocalRoute(travelFromSite, neighbor) : null;
    if (!travelRoute && record.oneWay === false) travelRoute = ir0773LocalRoute(neighbor, site) || ir0773LocalRoute(site, neighbor);
    if (!travelRoute) travelRoute = route;
    rows.push({ neighbor, record, route: travelRoute, relation });
  }
  const seen = new Set();
  return rows.filter(row => {
    const id = row.neighbor.geoId || row.neighbor.id;
    if (!id || seen.has(id)) return false;
    seen.add(id); return true;
  }).sort((a,b) => String(ir0773SafeLocationLabel(a.neighbor,model,intelIds)).localeCompare(String(ir0773SafeLocationLabel(b.neighbor,model,intelIds))));
}

function ir0773RenderRegionalMap(model) {
  const m = model;
  if (!m?.region || !m.current || !Array.isArray(m.sites)) {
    return `<section class="panel panel-pad"><strong>Regional map unavailable</strong><p class="ir0772-muted">This save is missing required region or current-location data. No geography has been generated or altered.</p><button class="button subtle" data-action="ir0772-return-atlas">← World atlas</button></section>`;
  }
  const intelIds = ir0773IntelIds(m);
  const visibleEdges = ir0773ResolvedVisibleEdges(m, intelIds);
  const selected = ir0772SelectedSite(m);
  const selectedIsIntel = !!selected && intelIds.has(selected.id) && !ir0773ActualKnowledge(selected, m) && ir0772SelectedFromIntel;
  const selectedVisited = ir0773SiteWasVisited(selected, m);
  const selectedKnown = ir0773ActualKnowledge(selected, m);
  const profile = selected ? (m.biomes?.[selected.biomeId] || null) : null;
  const selectedBiome = profile?.name || selected?.biome || 'Unclassified terrain';
  const selectedName = !selected ? 'Unknown place' : selectedIsIntel ? 'Reported lead' : selected === m.current && !selectedVisited ? 'Current location' : selectedVisited ? (selected.name || 'Visited location') : `${selectedBiome} area`;
  const directRoute = selected && selected !== m.current ? ir0773LocalRoute(m.current, selected) : null;
  const canShowTrip = !!selected && selected !== m.current && !!directRoute && (selectedKnown || selectedIsIntel) && ir0773HasRenderedDirectEdge(m.current, selected, visibleEdges);
  const discoveryStatus = !selected ? 'No selection' : selected === m.current ? 'Current location' : selectedVisited ? 'Visited' : selectedKnown ? 'Known, not yet visited' : selectedIsIntel ? 'Reported by purchased intelligence' : 'Unavailable';
  const selectedDetails = !selected
    ? '<p>No location record is currently available.</p>'
    : selectedVisited
      ? `<p>${esc(ir0772TypeLabel(selected))} · ${esc(selectedBiome)} · Local risk ${Number.isFinite(Number(selected.risk)) ? `${Number(selected.risk)}%` : 'not recorded'}</p><p>${esc(selected.desc || 'No description recorded for this site.')}</p>`
      : selectedIsIntel
        ? `<p>Discovery status: reported lead. ${esc(selectedBiome)} is the recorded terrain profile; its neighboring connections, local features, and danger are not confirmed by this marker.</p>`
        : selectedKnown
          ? `<p>Discovery status: known, not yet visited. Recorded terrain: ${esc(selectedBiome)}. The local name, settlement status, landmark details, description, and danger remain unconfirmed.</p>`
          : '<p>This location is not currently available for inspection.</p>';
  const tripAction = !selected || selected === m.current
    ? `<span class="ir0772-selection-status">✦ You are here now</span>`
    : canShowTrip
      ? `<button class="button primary" data-action="travel" data-site="${esc(selected.id)}" data-transport="foot">Travel here · ${typeof irCurrentTransportDays === 'function' && Number.isFinite(Number(directRoute.distanceKm)) ? `${irCurrentTransportDays(directRoute.distanceKm, 'foot')} day${irCurrentTransportDays(directRoute.distanceKm, 'foot') === 1 ? '' : 's'}` : 'duration per existing travel rules'}</button>`
      : `<span class="ir0772-selection-status">No direct route from your current location. Travel is unavailable here; no alternate path or new travel rule is inferred.</span>`;

  const connectionRows = selected && selectedKnown ? ir0773ConnectionRows(selected, m, intelIds) : [];
  const connectionsMarkup = connectionRows.length
    ? `<div class="ir0773-connections"><div class="ir0773-subhead"><strong>Recorded connections</strong><span>${connectionRows.length} known</span></div>${connectionRows.map(({neighbor,route,relation}) => {
        const direct = neighbor !== m.current && !!ir0773LocalRoute(m.current, neighbor);
        const dist = Number.isFinite(Number(route?.distanceKm)) ? `${Number(route.distanceKm)} km` : 'distance not recorded';
        const mode = route?.shortcut ? 'Recorded shortcut' : 'Recorded route';
        const way = relation === 'incoming' ? ' · incoming only' : relation === 'outgoing' ? ' · outgoing' : '';
        const status = neighbor === m.current ? 'Current location' : direct ? 'Connected to the selected location' : 'Connected from this location; no direct route from the player';
        return `<div class="ir0773-connection-row"><span class="ir0773-connection-glyph" aria-hidden="true">${esc(irSafeIcon(m.biomes?.[neighbor.biomeId]?.icon || '⌖'))}</span><div class="ir0773-connection-copy"><strong>${esc(ir0773SafeLocationLabel(neighbor,m,intelIds))}</strong><p>${esc(status)} · ${esc(mode)}${way}</p></div><span class="ir0773-distance">${esc(dist)}</span></div>`;
      }).join('')}</div>`
    : `<div class="ir0773-connections"><div class="ir0773-subhead"><strong>Recorded connections</strong><span>None available to show</span></div><p class="ir0773-empty-note">${selectedIsIntel ? 'The reported lead does not reveal neighboring routes.' : selectedKnown ? 'No other known locations have a verifiable connection from this place in the current map data.' : 'Connection details are hidden until this location is known.'}</p></div>`;
  const visitTag = selected === m.current ? 'CURRENT' : selectedVisited ? 'VISITED' : selectedKnown ? 'KNOWN' : selectedIsIntel ? 'REPORTED' : 'UNKNOWN';
  const inspectCard = `<div class="ir0772-inspect-card ir0773-inspect-card" aria-live="polite"><div class="ir0772-inspect-mark">${esc(irSafeIcon(!selected ? '⌖' : selectedIsIntel ? '⚑' : selectedVisited ? (selected.icon || '⌖') : (profile?.icon || '⌖')))}</div><div class="ir0772-inspect-copy"><div class="ir0773-inspect-head"><div><div class="eyebrow">LOCATION INSPECTION</div><h3>${esc(selectedName)}</h3></div><span class="ir0773-state-chip ${selected === m.current ? 'current' : selectedVisited ? 'visited' : selectedKnown ? 'known' : selectedIsIntel ? 'reported' : ''}">${esc(visitTag)}</span></div>${selectedDetails}<p class="ir0773-discovery-line"><strong>Discovery:</strong> ${esc(discoveryStatus)}</p><div class="ir0773-trip-details">${selected === m.current ? '<span>Current position · no travel required</span>' : canShowTrip ? `<span>${esc(Number.isFinite(Number(directRoute.distanceKm)) ? `${Number(directRoute.distanceKm)} km` : 'Distance not recorded')} · ${esc(directRoute.shortcut ? 'recorded shortcut' : (directRoute.terrain ? `${directRoute.terrain} route` : 'recorded route'))}</span>` : '<span>No verified direct route from current position</span>'}</div>${connectionsMarkup}<div class="ir0772-inspect-actions">${tripAction}<button class="button small subtle" data-action="ir0772-clear-selection">Focus current location</button>${selected === m.current ? '<button class="button small primary" data-action="ir0773-open-local">Open local view</button>' : '<span class="ir0773-local-after-arrival">Local view is available after arrival.</span>'}</div></div></div>`;

  const actualVisibleSites = m.sites.filter(site => ir0773ActualKnowledge(site, m));
  const intelOnlySites = m.sites.filter(site => intelIds.has(site.id) && !ir0773ActualKnowledge(site, m));
  const visibleSites = [...actualVisibleSites, ...intelOnlySites.filter(site => !actualVisibleSites.includes(site))];
  const plottableSites = visibleSites.filter(site => ir0773Coordinates(site));
  const unplacedSites = visibleSites.filter(site => !ir0773Coordinates(site));
  const colors = {
    forest: ['#284d3b','#3f6744'], woodland: ['#3d5c40','#7b8f4b'], plains: ['#687a46','#8a994d'],
    mountain: ['#535d58','#7b8177'], swamp: ['#354d45','#4a6860'], desert: ['#806744','#ad915a'],
    snow: ['#77898a','#becbc2'], coast: ['#3d7379','#70a6a6'], river: ['#356c65','#58958a']
  };
  const terrainDecor = site => {
    if (['forest','woodland'].includes(site.biomeId)) return '<span>🌲</span><span>🌳</span><span>🌲</span>';
    if (['mountain','snow'].includes(site.biomeId)) return '<span>⛰️</span><span>🏔️</span>';
    if (['coast','river','swamp'].includes(site.biomeId)) return '<span>〰️</span><span>〰️</span>';
    if (site.biomeId === 'desert') return '<span>〰️</span><span>🌾</span>';
    return '<span>🌾</span><span>🌳</span>';
  };
  const blobs = plottableSites.map((site,i) => {
    const color = colors[site.biomeId] || colors.woodland;
    return `<div aria-hidden="true" class="ir05-terrain-blob ir0773-terrain-zone terrain-${esc(site.biomeId || 'woodland')}" style="left:${ir0773Coordinates(site).x}%;top:${ir0773Coordinates(site).y}%;--terrain-a:${color[0]};--terrain-b:${color[1]};--patch:${68+(i%3)*11}px">${terrainDecor(site)}</div>`;
  }).join('');
  // Generic fog texture is independent of hidden site records, so it cannot leak their positions.
  const fogPatches = [[17.3,28.1,83],[37.7,14.3,92],[55.1,35.7,104],[76.3,25.1,88],[24.7,54.3,97],[65.7,64.1,110],[84.3,46.7,84],[44.9,81.3,103],[72.1,87.7,89]]
    .map(([x,y,size]) => `<div aria-hidden="true" class="ir05-terrain-blob fog ir0772-uncharted-terrain" style="left:${x}%;top:${y}%;--terrain-a:#35413a;--terrain-b:#46534a;--patch:${size}px"></div>`).join('');
  const blobsAndFog = `${blobs}${fogPatches}`;
  const routes = visibleEdges.map(({edge,from,to,route,oneWay}) => {
    const aPos = ir0773Coordinates(from), bPos = ir0773Coordinates(to);
    if (!aPos || !bPos) return '';
    const active = from === m.current || to === m.current;
    const selectedEdge = !!selected && (from === selected || to === selected);
    const classNames = ['ir05-road','ir0773-route-line',active?'active':'',selectedEdge?'selected-edge':'',edge.shortcut || route?.shortcut ? 'shortcut':''].filter(Boolean).join(' ');
    const title = `${ir0773SafeLocationLabel(from,m,intelIds)} ↔ ${ir0773SafeLocationLabel(to,m,intelIds)} · ${Number.isFinite(Number(route?.distanceKm)) ? `${Number(route.distanceKm)} km` : 'distance not recorded'}${oneWay ? ' · one-way' : ''}`;
    return `<path class="${classNames}" d="M ${aPos.x*10} ${aPos.y*6.3} L ${bPos.x*10} ${bPos.y*6.3}" ${oneWay ? 'marker-end="url(#ir0773-route-arrow)"' : ''} data-route="${esc(edge.geoId || '')}"><title>${esc(title)}</title></path>`;
  }).join('');
  const nodes = plottableSites.map(site => {
    const isCurrent = site === m.current;
    const isVisited = ir0773SiteWasVisited(site,m);
    const isKnown = ir0773ActualKnowledge(site,m);
    const isIntel = intelIds.has(site.id) && !isKnown;
    const directRoute = site !== m.current ? ir0773LocalRoute(m.current,site) : null;
    const label = isCurrent && !isVisited ? 'Current location' : ir0773SafeLocationLabel(site,m,intelIds);
    const icon = isCurrent ? '✦' : isIntel ? '⚑' : isVisited ? (site.icon || '⌖') : (m.biomes?.[site.biomeId]?.icon || '⌖');
    const selectedClass = (site.geoId && site.geoId === ir0772SelectedGeoId) || (!site.geoId && site.id === ir0772SelectedGeoId) ? 'selected' : '';
    const coord = ir0773Coordinates(site);
    const edgeClasses = [coord.x < 16 ? 'edge-west' : coord.x > 84 ? 'edge-east' : '',coord.y > 82 ? 'edge-south' : ''].filter(Boolean).join(' ');
    const statusClass = isCurrent ? 'current' : isIntel ? 'intel-target' : isVisited ? 'visited' : 'known';
    const directRouteValid = !!directRoute && ir0773HasRenderedDirectEdge(m.current, site, visibleEdges);
    const directClass = directRouteValid ? 'direct-reachable' : (isCurrent ? '' : 'not-direct');
    const nodeTitle = `${isCurrent ? 'Current location' : isIntel ? 'Reported lead; inspect details' : isVisited ? `Inspect ${site.name || 'visited location'}` : `Inspect ${label}`}${directRouteValid ? '; verified direct travel route exists' : isCurrent ? '' : '; no verified direct travel route from current location'}`;
    return `<button class="world-node ir0772-regional-node ir0773-map-node ${edgeClasses} ${statusClass} ${directClass} ${selectedClass}" style="left:${coord.x}%;top:${coord.y}%" data-action="ir0772-inspect-location" data-site="${esc(site.id)}" data-geo-id="${esc(site.geoId||'')}" title="${esc(nodeTitle)}" aria-label="${esc(nodeTitle)}"><span class="node-icon">${esc(icon)}</span><span class="node-label">${esc(isCurrent ? (isVisited ? (site.name || 'Current location') : 'Current location') : label)}</span></button>`;
  }).join('');
  const noGeometryNote = `<p class="ir0773-data-limit"><strong>Map-data limit:</strong> this save records biome types and location coordinates, plus route connections. It does not contain traced river courses, coastline shapes, mountain-range polygons, crossings, or boundary geometry; those features are not drawn or inferred.</p>`;
  const unplacedMarkup = unplacedSites.length ? `<div class="ir0773-unplaced"><strong>Known places without usable map coordinates</strong><div>${unplacedSites.map(site => { const intelOnly = intelIds.has(site.id) && !ir0773ActualKnowledge(site,m); return `<button class="button small subtle ${site.geoId===ir0772SelectedGeoId?'selected':''} ${intelOnly?'intel-target':''}" data-action="ir0772-inspect-location" data-site="${esc(site.id)}" data-geo-id="${esc(site.geoId||'')}" title="Inspect ${esc(ir0773SafeLocationLabel(site,m,intelIds))}">${esc(ir0773SafeLocationLabel(site,m,intelIds))}</button>`; }).join('')}</div></div>` : '';
  const routeLegend = `<div class="map-legend ir0773-map-legend"><span><i class="legend-dot current"></i> Current location</span><span><i class="legend-dot visited"></i> Visited</span><span><i class="ir0773-legend-line"></i> Recorded connection (schematic)</span><span><i class="ir0773-legend-line shortcut"></i> Recorded shortcut</span><span><i class="ir0773-legend-ring"></i> Directly reachable</span><span>Markers without the ring are not directly reachable from the current location.</span></div>`;
  return `<section class="panel panel-pad world-map-panel ir0772-regional-panel ir0773-regional-panel"><div class="panel-heading"><div><div class="eyebrow">REGIONAL TERRAIN CHART</div><h2>${esc(m.region.name || 'Current region')}</h2><p>${esc(m.region.desc || 'The saved region has no description.')} Biome patches are illustrative classifications, not surveyed boundaries. Connection lines show graph links, not traced roads or paths. Select a marker to inspect it; travel remains a separate action.</p></div><span class="tag gold">${visibleSites.length} VISIBLE PLACES</span></div><div class="ir05-map-canvas ir0772-regional-canvas ir0773-regional-canvas" aria-label="Interactive regional map using known site coordinates and recorded route connections"><div class="ir0773-map-graticule" aria-hidden="true"></div>${blobsAndFog}<svg class="ir05-map-road-svg ir0773-route-svg" viewBox="0 0 1000 630" preserveAspectRatio="none" aria-label="Recorded connections only"><defs><marker id="ir0773-route-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#e9c97f"/></marker></defs>${routes}</svg>${nodes}<div class="ir05-map-compass" aria-hidden="true">N<br>✦</div><div class="ir0773-map-scale-note">Regional chart coordinates · connection links are schematic, not surveyed roads or paths</div></div>${routeLegend}${unplacedMarkup}${noGeometryNote}${inspectCard}</section>`;
}

function ir0773SelectedRecord(model) {
  if (!model || typeof ir0772SelectedGeoId !== 'string' || !ir0772SelectedGeoId) return null;
  return model.sites.find(site => site?.geoId === ir0772SelectedGeoId || (!site?.geoId && site?.id === ir0772SelectedGeoId)) || null;
}

function ir0773RenderLocalView(model) {
  if (!model?.region || !model.current) return `<section class="panel panel-pad"><strong>Local view unavailable</strong><p>The current site record is missing. No location has been generated or altered.</p><button class="button" data-action="ir0772-return-atlas">World atlas</button></section>`;
  const current = model.current;
  const profile = model.biomes?.[current.biomeId] || null;
  const currentVisited = ir0773SiteWasVisited(current, model);
  const name = currentVisited ? (current.name || 'Current location') : 'Current location';
  const localType = currentVisited ? ir0772TypeLabel(current) : 'Unsurveyed location';
  const localDescription = currentVisited ? (current.desc || 'No local description recorded for this location.') : 'The exact site name, local details, danger, and services remain undisclosed until you explore it.';
  const localIntelIds = ir0773IntelIds(model);
  const connections = (typeof ir0775ConnectionsFrom === 'function' ? ir0775ConnectionsFrom(current.id).map(route => ({route, target: model.sites.find(site => site?.id === route?.to)})) : (Array.isArray(current.routes) ? current.routes.map(route => ({route, target: model.sites.find(site => site?.id === route?.to)})) : [])).filter(entry => entry.route && entry.target && entry.target !== current && (typeof ir0775ConnectionsFrom !== 'function' ? !!ir0773LocalRoute(current, entry.target) : true) && (ir0773ActualKnowledge(entry.target, model) || localIntelIds.has(entry.target.id))).sort((a,b) => Number(a.route.distanceKm||0)-Number(b.route.distanceKm||0));
  const connectionRows = connections.map(({route,target}) => {
    const known = ir0773ActualKnowledge(target, model);
    const visited = ir0773SiteWasVisited(target, model);
    const targetProfile = model.biomes?.[target.biomeId] || null;
    const safeName = visited ? (target.name || 'Visited location') : known ? 'Known destination' : 'Reported lead';
    const km = Number.isFinite(Number(route.distanceKm)) ? `${Number(route.distanceKm)} km` : 'Distance not recorded';
    const days = typeof irCurrentTransportDays === 'function' && Number.isFinite(Number(route.distanceKm)) ? `${irCurrentTransportDays(route.distanceKm,'foot')} day${irCurrentTransportDays(route.distanceKm,'foot')===1?'':'s'}` : 'duration per existing travel rules';
    const routeLabel = route.shortcut ? 'Recorded shortcut' : (currentVisited && visited && route.terrain ? `${route.terrain} route` : 'Recorded connection');
    return `<article class="ir0773-local-route"><span class="ir0773-local-route-icon">${esc(irSafeIcon(visited ? (targetProfile?.icon || '⌖') : '⌖'))}</span><div class="ir0773-local-route-copy"><strong>${esc(safeName)}</strong><p>${esc(km)} · ${esc(routeLabel)} · ${esc(days)}</p></div><button class="button small primary" data-action="travel" data-site="${esc(target.id)}" data-transport="foot">Travel</button></article>`;
  }).join('');
  const selected = ir0773SelectedRecord(model);
  const selectedNote = selected && selected !== current && ir0772CanInspectSite(selected,model,false)
    ? `<div class="ir0773-local-selection"><span class="eyebrow">RETAINED REGIONAL SELECTION</span><strong>${esc(ir0773SafeLocationLabel(selected,model,new Set()))}</strong><p>Returning to the regional chart will keep this selection highlighted.</p><button class="button small subtle" data-action="ir0773-return-regional">Return to selected location</button></div>` : '';
  const services = !currentVisited ? '<p class="ir0773-local-undiscovered">Explore this location to reveal its recorded local services.</p>' : typeof irServicesMarkup === 'function' ? irServicesMarkup(current) : '<span class="tiny-label">Local service data is unavailable.</span>';
  return `${pageHead('Local view', 'A focused view of your actual current site. Inspect local services and known exits; no street or building layout is invented.')}<div class="ir0773-local-nav"><button class="button subtle" data-action="ir0772-return-atlas">← World atlas</button><button class="button subtle" data-action="ir0773-return-regional">Regional chart</button><span>LOCAL LAYER · CURRENT SITE</span></div><section class="panel panel-pad ir0773-local-panel"><div class="ir0773-local-hero"><div class="ir0773-local-seal">${esc(irSafeIcon(current.icon || profile?.icon || '⌖'))}</div><div><div class="eyebrow">CURRENT LOCATION · LOCAL DETAIL</div><h2>${esc(name)}</h2><p>${esc(localType)} · ${esc(profile?.name || current.biome || 'Terrain profile unavailable')}</p><p>${esc(localDescription)}</p></div><span class="tag gold">CURRENT</span></div><div class="ir0773-local-stats"><div><span>Local risk</span><strong>${currentVisited && Number.isFinite(Number(current.risk)) ? `${Number(current.risk)}%` : 'Not surveyed'}</strong></div><div><span>Known routes</span><strong>${connections.length}</strong></div><div><span>Visited</span><strong>${currentVisited ? 'Yes' : 'No'}</strong></div></div><div class="ir0773-local-section"><div><h3>Local services</h3><p>Only services recorded on this exact location are available.</p></div><div class="ir0773-local-services">${services}</div></div><div class="ir0773-local-section"><div><h3>Routes out of this location</h3><p>These exits come from the current site's existing travel records. Unknown destinations remain unnamed.</p></div>${connectionRows ? `<div class="ir0773-local-routes">${connectionRows}</div>` : ''}</div>${selectedNote}<p class="ir0773-data-limit"><strong>Local geometry is not recorded:</strong> this view is a location detail sheet, not a street map. No houses, roads within settlements, river crossings, or nearby buildings have been added.</p></section>`;
}

// The v0.7.7.2 world-view dispatcher calls this established renderer name; route it to the
// v0.7.7.3 implementation rather than leaving the legacy regional markup active.
ir0772RenderRegionalMap = ir0773RenderRegionalMap;

// Keep view scope transient; current-site detail acts as a local information view, not invented geometry.
const ir0773WorldRenderBaseline = renderWorld;
renderWorld = function() {
  if (ir0772MapScope === 'local') return ir0773RenderLocalView(ir0772WorldMapModel());
  const html = ir0773WorldRenderBaseline.apply(this, arguments);
  if (ir0772MapScope === 'atlas') {
    return html.replace(/(<button class="button block" data-action="ir0772-inspect-location" data-site="[^"]*" data-geo-id="[^"]*">Inspect current location on regional map<\/button>)/,
      '$1<button class="button block" data-action="ir0773-open-local">Open local view</button>');
  }
  return html;
};

// Preserve selection across view transitions and leave movement/duration/danger to the accepted travel handler.
const ir0773RunActionBaseline = runAction;
runAction = function(target) {
  const action = target?.dataset?.action;
  if (['ir0772-open-region','ir0773-open-local','ir0773-return-regional'].includes(action) && state?.combat?.active) {
    toast('Finish the current encounter before browsing map views.'); return;
  }
  if (action === 'ir0772-open-region') {
    const model = ir0772WorldMapModel();
    if (!model?.region) { toast('No regional chart is available in this save.'); return; }
    const remembered = ir0773SelectedRecord(model);
    if (!remembered || !ir0772CanInspectSite(remembered, model, false)) ir0772SelectedGeoId = model.current?.geoId || model.current?.id || null;
    ir0772SelectedFromIntel = false;
    ir0772MapScope = 'regional'; render(); return;
  }
  if (action === 'ir0773-open-local') {
    const model = ir0772WorldMapModel();
    if (!model?.current) { toast('No current location is available for local view.'); return; }
    ir0772MapScope = 'local'; render(); return;
  }
  if (action === 'ir0773-return-regional') {
    const model = ir0772WorldMapModel();
    if (!model?.region) { toast('No regional chart is available in this save.'); return; }
    const remembered = ir0773SelectedRecord(model);
    if (!remembered || !ir0772CanInspectSite(remembered, model, false)) ir0772SelectedGeoId = model.current?.geoId || model.current?.id || null;
    ir0772SelectedFromIntel = false;
    ir0772MapScope = 'regional'; render(); return;
  }
  if (action === 'travel') {
    const model = ir0772WorldMapModel();
    const destination = model?.byLegacyId.get(target.dataset.site);
    if (destination && model.current && ir0773LocalRoute(model.current,destination)) {
      ir0772SelectedGeoId = destination.geoId || destination.id || null;
      ir0772SelectedFromIntel = false;
    }
  }
  return ir0773RunActionBaseline.apply(this, arguments);
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.7.3';
const ir0773ShellBaseline = typeof shell === 'function' ? shell : null;
if (ir0773ShellBaseline) shell = function() { return ir0773ShellBaseline.apply(this, arguments).replace(/v0\.7\.7\.2/gi,'v0.7.7.3').replace(/Infinite Realms 0\.7\.7\.2/g,'Infinite Realms 0.7.7.3').replace(/VERSION 0\.7\.7\.2/g,'VERSION 0.7.7.3'); };
const ir0773RenderTitleBaseline = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0773RenderTitleBaseline) renderTitle = function() { return ir0773RenderTitleBaseline.apply(this, arguments).replace(/VERSION 0\.7\.7\.2/g,'VERSION 0.7.7.3').replace(/Version 0\.7\.7\.2/g,'Version 0.7.7.3'); };
