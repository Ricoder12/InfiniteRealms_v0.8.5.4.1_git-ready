'use strict';
// Infinite Realms v0.7.7.5 — authoritative travel / map connection integration.
// The existing world.region.routes graph is authoritative. site.routes[] are retained
// for save compatibility but act only as corroborating endpoint records.

function ir0775WorldRegion(world = (typeof state !== 'undefined' ? state?.world : null)) {
  const region = world?.region;
  return region && Array.isArray(region.sites) && Array.isArray(region.routes) ? region : null;
}
function ir0775UniqueSiteById(id, region = ir0775WorldRegion()) {
  if (!region || typeof id !== 'string' || !id) return null;
  const matches = region.sites.filter(site => site && site.id === id);
  return matches.length === 1 ? matches[0] : null;
}
function ir0775ResolveEdge(edge, region = ir0775WorldRegion()) {
  if (!region || !edge || typeof edge !== 'object') return null;
  let from = null, to = null;
  if (typeof irGeoResolveGlobalRoute === 'function') {
    const resolved = irGeoResolveGlobalRoute(region, edge);
    if (!resolved?.resolved) return null;
    from = resolved.from; to = resolved.to;
  } else if (edge.fromGeoId || edge.toGeoId) {
    const fromMatches = region.sites.filter(site => site?.geoId === edge.fromGeoId);
    const toMatches = region.sites.filter(site => site?.geoId === edge.toGeoId);
    if (fromMatches.length !== 1 || toMatches.length !== 1) return null;
    [from, to] = [fromMatches[0], toMatches[0]];
  } else {
    // Legacy a/b indexes are accepted only when stable endpoint IDs are entirely absent.
    from = Number.isInteger(edge.a) ? region.sites[edge.a] : null;
    to = Number.isInteger(edge.b) ? region.sites[edge.b] : null;
  }
  if (!from || !to || from === to || !region.sites.includes(from) || !region.sites.includes(to)) return null;
  if (!ir0775UniqueSiteById(from.id, region) || !ir0775UniqueSiteById(to.id, region)) return null;
  if (from.geoId && region.sites.filter(s => s?.geoId === from.geoId).length !== 1) return null;
  if (to.geoId && region.sites.filter(s => s?.geoId === to.geoId).length !== 1) return null;
  return { from, to };
}
function ir0775LocalRouteRecords(from, to, edge) {
  const outgoing = Array.isArray(from?.routes) ? from.routes.filter(route => route && route.to === to?.id) : [];
  if (outgoing.length !== 1) return null;
  const route = outgoing[0];
  if (route.toGeoId && to?.geoId && route.toGeoId !== to.geoId) return null;
  if (route.geoId && edge?.geoId && route.geoId !== edge.geoId) return null;
  const edgeKm = Number(edge?.distanceKm), localKm = Number(route.distanceKm);
  if (!Number.isFinite(edgeKm) || edgeKm <= 0 || !Number.isFinite(localKm) || localKm <= 0 || edgeKm !== localKm) return null;
  for (const field of ['caravan', 'boat', 'shortcut']) {
    if (Boolean(edge[field]) !== Boolean(route[field])) return null;
  }
  const edgeTerrain = typeof edge.terrain === 'string' ? edge.terrain.trim() : '';
  const localTerrain = typeof route.terrain === 'string' ? route.terrain.trim() : '';
  if (edgeTerrain && localTerrain && edgeTerrain !== localTerrain) return null;
  if (!!edgeTerrain !== !!localTerrain) return null;
  return route;
}
function ir0775Connection(fromId, toId, world = (typeof state !== 'undefined' ? state?.world : null)) {
  if (!fromId || !toId || fromId === toId) return null;
  const region = ir0775WorldRegion(world);
  if (!region) return null;
  const from = ir0775UniqueSiteById(fromId, region), to = ir0775UniqueSiteById(toId, region);
  if (!from || !to) return null;
  const candidates = [];
  for (const edge of region.routes) {
    const endpoints = ir0775ResolveEdge(edge, region);
    if (!endpoints) continue;
    const matchesPair = (endpoints.from.id === fromId && endpoints.to.id === toId) ||
      (endpoints.from.id === toId && endpoints.to.id === fromId);
    if (matchesPair) candidates.push({ edge, endpoints });
  }
  // Duplicate global edges for one pair are ambiguous: do not pick whichever came first.
  if (candidates.length !== 1) return null;
  const { edge, endpoints } = candidates[0];
  if (edge.geoId && region.routes.filter(item => item?.geoId === edge.geoId).length !== 1) return null;
  if (edge.directed === true && !(endpoints.from.id === fromId && endpoints.to.id === toId)) return null;
  const forward = ir0775LocalRouteRecords(from, to, edge);
  if (!forward) return null;
  if (edge.directed !== true && !ir0775LocalRouteRecords(to, from, edge)) return null;
  // A small oriented view over the one canonical global edge; no route registry is added to save data.
  return {
    to: to.id, from: from.id, distanceKm: Number(edge.distanceKm),
    ...(typeof edge.terrain === 'string' ? { terrain: edge.terrain } : {}),
    caravan: edge.caravan === true, boat: edge.boat === true, shortcut: edge.shortcut === true,
    geoId: edge.geoId || forward.geoId || null, fromGeoId: from.geoId || null, toGeoId: to.geoId || null,
    directed: edge.directed === true
  };
}
function ir0775ConnectionsFrom(fromId, world = (typeof state !== 'undefined' ? state?.world : null)) {
  const region = ir0775WorldRegion(world), from = ir0775UniqueSiteById(fromId, region);
  if (!region || !from) return [];
  const targets = new Set();
  for (const edge of region.routes) {
    const endpoints = ir0775ResolveEdge(edge, region);
    if (!endpoints) continue;
    if (endpoints.from.id === fromId) targets.add(endpoints.to.id);
    if (edge.directed !== true && endpoints.to.id === fromId) targets.add(endpoints.from.id);
  }
  const routes = [];
  for (const toId of targets) {
    const route = ir0775Connection(fromId, toId, world);
    if (route) routes.push(route);
  }
  return routes.sort((a, b) => a.distanceKm - b.distanceKm || String(a.to).localeCompare(String(b.to)));
}
function ir0775DangerChance(from, to, transport = 'foot') {
  const multiplier = transport === 'caravan' ? .72 : transport === 'mount' ? .82 : transport === 'boat' ? .9 : 1;
  const fromRisk = Number.isFinite(Number(from?.risk)) ? Number(from.risk) : 0;
  const toRisk = Number.isFinite(Number(to?.risk)) ? Number(to.risk) : 0;
  const value = ((fromRisk + toRisk) / 2) / 100 * multiplier;
  return Math.max(.04, Math.min(.48, value));
}
function ir0775SiteSurveyed(location) {
  return !!location && !!state?.world && (
    (Array.isArray(state.world.visited) && state.world.visited.includes(location.id)) ||
    Number(location.visits) > 0 || location.discovered === true
  );
}
function ir0775KnownForDisplay(location) {
  // Discovery knowledge is not the same as surveying a place. Names and local details remain hidden until surveyed.
  return ir0775SiteSurveyed(location);
}
function ir0775SafeRouteLabel(location, fallback) {
  if (!location) return 'Unknown stop';
  if (ir0775KnownForDisplay(location)) return String(location.name || fallback || 'Known location');
  return fallback || 'Uncharted stop';
}

// Replace the old local-first lookup with the canonical-graph-backed resolver used by maps and travel.
irRouteBetween = function(fromId, toId) { return ir0775Connection(fromId, toId); };

// Multi-leg journeys use the same canonical graph as direct travel and map reachability.
ir071FindPath = function(fromId, toId, sites = (state?.world?.region?.sites || [])) {
  if (!fromId || !toId || !Array.isArray(sites) || fromId === toId) return fromId === toId && fromId ? [fromId] : null;
  const region = ir0775WorldRegion();
  if (!region || !ir0775UniqueSiteById(fromId, region) || !ir0775UniqueSiteById(toId, region)) return null;
  const allowed = new Set(sites.filter(site => site && typeof site.id === 'string').map(site => site.id));
  if (!allowed.has(fromId) || !allowed.has(toId)) return null;
  const queue = [fromId], previous = new Map([[fromId, null]]);
  for (let i = 0; i < queue.length; i++) {
    const currentId = queue[i];
    for (const route of ir0775ConnectionsFrom(currentId)) {
      const nextId = route.to;
      if (!allowed.has(nextId) || previous.has(nextId)) continue;
      previous.set(nextId, currentId);
      if (nextId === toId) {
        const path = [toId]; let cursor = toId;
        while (previous.get(cursor) !== null) { cursor = previous.get(cursor); path.push(cursor); }
        return path.reverse();
      }
      queue.push(nextId);
    }
  }
  return null;
};
ir071RouteEdge = function(fromId, toId) { return ir0775Connection(fromId, toId); };
ir071RoutePlan = function(toId) {
  const startId = state?.world?.siteId;
  const path = ir071FindPath(startId, toId);
  if (!path || path.length < 2) return null;
  const legs = []; let totalDistance = 0, totalDays = 0, totalEnergy = 0, noEncounterChance = 1;
  for (let i = 0; i < path.length - 1; i++) {
    const from = ir0775UniqueSiteById(path[i]), to = ir0775UniqueSiteById(path[i + 1]);
    const route = ir0775Connection(path[i], path[i + 1]);
    if (!from || !to || !route || !Number.isFinite(route.distanceKm) || route.distanceKm <= 0) return null;
    const distance = route.distanceKm;
    const days = irCurrentTransportDays(distance, 'foot');
    const energy = Math.max(4, Math.ceil(days * 3 + 2));
    const risk = ir0775DangerChance(from, to, 'foot');
    legs.push({ from, to, route, distance, days, energy, risk });
    totalDistance += distance; totalDays += days; totalEnergy += energy; noEncounterChance *= 1 - risk;
  }
  return { path, legs, target: ir0775UniqueSiteById(toId), totalDistance, totalDays, totalEnergy, risk: Math.round((1 - noEncounterChance) * 100) };
};

// Keep direct travel's accepted transaction/event implementation but guard it with a fresh quote,
// route revalidation, and a state snapshot. A thrown failure restores the pre-trip save.
function ir0775CloneStateSafely(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
}
function ir0775CommitTravel(id, transport = 'foot') {
  if (!['foot', 'mount', 'caravan', 'boat'].includes(transport)) transport = 'foot';
  const quote = ir051TravelQuote(id, transport);
  if (!quote?.ok) { toast(quote?.reason || 'That trip is no longer available.'); if (typeof render === 'function') render(); return false; }
  const current = site(), target = ir0775UniqueSiteById(id);
  const route = current && target ? ir0775Connection(current.id, target.id) : null;
  if (!route || route.geoId !== quote.route?.geoId || route.distanceKm !== Number(quote.route?.distanceKm)) {
    toast('The recorded route changed or could not be verified. No travel was started.'); if (typeof render === 'function') render(); return false;
  }
  const before = ir0775CloneStateSafely(state);
  if (!before) { toast('Travel could not start safely because the current save could not be snapshotted.'); return false; }
  const originalSiteId = state.world.siteId;
  try {
    // This is the already-tested v0.7.7.4 direct travel implementation. It consumes the same
    // quote formulas and, through irRouteBetween, can only execute the verified canonical edge.
    ir051TravelBase(id, transport);
    if (state?.world?.siteId !== id) {
      state = before;
      if (typeof persist === 'function') persist();
      if (typeof render === 'function') render();
      if (originalSiteId !== id) toast('Travel did not complete because the route became unavailable. No costs were kept.');
      return false;
    }
    return true;
  } catch (error) {
    state = before;
    try { if (typeof persist === 'function') persist(); } catch (_) { /* keep restored in-memory state */ }
    try { if (typeof render === 'function') render(); } catch (_) { /* UI refresh may be unavailable */ }
    if (typeof console !== 'undefined' && console.error) console.error('[Infinite Realms v0.7.7.5] Direct travel rolled back:', error);
    toast('Travel failed before completion. Your previous location and resources were restored.');
    return false;
  }
}

// Use exactly the same location-risk estimate in the preview and in direct-travel risk resolution.
const ir0775TravelQuoteBaseline = ir051TravelQuote;
ir051TravelQuote = function(id, transport = 'foot') {
  if (!['foot', 'mount', 'caravan', 'boat'].includes(transport)) transport = 'foot';
  const quote = ir0775TravelQuoteBaseline(id, transport);
  if (quote?.from && quote?.target && quote?.route) { quote.risk = Math.round(ir0775DangerChance(quote.from, quote.target, transport) * 100); quote.riskKnown = ir0775SiteSurveyed(quote.from) && ir0775SiteSurveyed(quote.target); }
  return quote;
};

// Direct travel preview shares the quoted route but masks unvisited destination names and danger.
ir051TravelModal = function() {
  const id = modal?.site, target = ir0775UniqueSiteById(id), currentLocation = site(), transportSelected = modal?.transport || 'foot';
  if (!target || !currentLocation) return `<div class="overlay"><section class="modal"><h2>Route unavailable</h2><p>The selected location or current location could not be resolved.</p><button class="button" data-action="cancel-travel">Close</button></section></div>`;
  const targetLabel = ir0775SafeRouteLabel(target, 'Uncharted location');
  const currentLabel = ir0775SafeRouteLabel(currentLocation, 'Current location');
  const currentHazardWarning = typeof ir0763HazardWarning === 'function' ? ir0763HazardWarning(currentLocation) : '';
  const options = ['foot', 'mount', 'caravan', 'boat'];
  const optionMarkup = options.map(transport => {
    const q = ir051TravelQuote(id, transport), picked = transport === transportSelected;
    const available = (!q.reason || q.reason.startsWith('Need ') || q.reason.startsWith('Too hungry') || q.reason.startsWith('Finish combat') || q.reason.startsWith('Resolve the pending'))
      ? transport === 'foot' || irCanTransport(q.from || {}, q.target || {}, q.route || {}, transport) : false;
    const enabled = !!q.route && (transport === 'foot' || irCanTransport(q.from || {}, q.target || {}, q.route || {}, transport));
    const riskText = q.riskKnown ? `${q.risk}% estimated risk` : 'Encounter risk unknown';
    return `<button class="ir051-transport-option ${picked ? 'selected' : ''}" data-action="travel-preview-select" data-site="${esc(id)}" data-transport="${transport}" ${!enabled ? 'disabled' : ''}><strong>${esc(irTransportName(transport))}</strong><span>${q.days || '—'} day(s) · ${q.energy || '—'} energy</span><span>${q.fare ? `${q.fare} ◈ fare` : 'No fare'} · ${riskText}</span><small>${esc(q.reason || (available ? 'Route available' : 'Transport unavailable'))}</small></button>`;
  }).join('');
  const selectedQuote = ir051TravelQuote(id, transportSelected);
  const riskSummary = selectedQuote.riskKnown ? `${selectedQuote.risk}%` : 'Unknown until surveyed';
  return `<div class="overlay" data-dismiss="modal"><section class="modal ir051-modal" role="dialog" aria-modal="true" aria-label="Travel preview"><div class="modal-header"><div><div class="eyebrow">TRAVEL PREVIEW</div><h2>Travel to ${esc(targetLabel)}</h2><p>Review time, energy, fare, and known risk before leaving ${esc(currentLabel)}. Energy is the base travel cost; existing environmental hazards can add strain as days pass. Unknown destinations may hold unexpected danger.</p></div><button class="close-btn" data-action="cancel-travel" aria-label="Cancel travel">×</button></div>${currentHazardWarning}${optionMarkup}<div class="ir051-trip-summary"><div><span>Distance</span><strong>${selectedQuote.route ? `${selectedQuote.route.distanceKm} km` : '—'}</strong></div><div><span>Trip length</span><strong>${selectedQuote.days || '—'} days</strong></div><div><span>Energy</span><strong>${selectedQuote.energy || '—'}</strong></div><div><span>Encounter pressure</span><strong>${riskSummary}</strong></div></div>${state.character.hunger < 25 || state.character.energy < 25 ? `<div class="notice warning">You are low on ${state.character.hunger < 25 ? 'hunger' : 'energy'}${state.character.hunger < 25 && state.character.energy < 25 ? ' and ' : ''}${state.character.energy < 25 ? 'energy' : ''}. The trip may leave you vulnerable.</div>` : ''}${selectedQuote.reason ? `<div class="ir051-reason">${esc(selectedQuote.reason)}</div>` : ''}<div class="modal-actions"><button class="button" data-action="cancel-travel">Cancel</button><button class="button primary" data-action="travel-confirm" data-site="${esc(id)}" data-transport="${esc(transportSelected)}" ${!selectedQuote.ok ? 'disabled' : ''}>Confirm journey</button></div></section></div>`;
};

// Mask names of route intermediates which the player has not yet learned; route mechanics remain intact.
ir071RoutePreviewHtml = function() {
  const plan = ir071RoutePlan(modal?.site), c = state?.character;
  if (!plan) return `<div class="overlay"><section class="modal"><div class="modal-header"><div><div class="eyebrow">ROUTE UNAVAILABLE</div><h2>No connected path</h2><p>A connected route to that location could not be found from here.</p></div><button class="close-btn" data-action="cancel-travel-route">×</button></div><div class="modal-actions"><button class="button primary" data-action="cancel-travel-route">Close</button></div></section></div>`;
  const first = plan.legs[0], canStart = !!c && c.energy >= first.energy && c.hunger >= 8 && !state.combat?.active && !state.pendingEvent;
  const routeText = plan.path.map((id, i) => {
    const loc = ir0775UniqueSiteById(id);
    if (i === 0) return `You · ${ir0775SafeRouteLabel(loc, 'Current location')}`;
    if (i === plan.path.length - 1) return ir0775SafeRouteLabel(loc, 'Destination');
    return ir0775SafeRouteLabel(loc, `Uncharted stop ${i}`);
  }).join(' → ');
  const legRows = plan.legs.map((leg, i) => {
    const fromName = ir0775SafeRouteLabel(leg.from, i === 0 ? 'Current location' : `Uncharted stop ${i}`);
    const toName = ir0775SafeRouteLabel(leg.to, i === plan.legs.length - 1 ? 'Destination' : `Uncharted stop ${i + 1}`);
    const terrain = ir0775KnownForDisplay(leg.from) && ir0775KnownForDisplay(leg.to) && leg.route.terrain ? esc(leg.route.terrain) : 'Terrain not surveyed';
    return `<div class="ir0775-leg"><span>${i + 1}</span><div><strong>${esc(fromName)} → ${esc(toName)}</strong><small>${leg.distance} km · ${leg.days} day${leg.days === 1 ? '' : 's'} · ${esc(terrain)}</small></div></div>`;
  }).join('');
  const shownTarget = ir0775SafeRouteLabel(plan.target, 'Destination');
  return `<div class="overlay" data-dismiss="modal"><section class="modal ir071-route-modal ir0775-route-modal" role="dialog" aria-modal="true" aria-label="Travel route preview"><div class="modal-header"><div><div class="eyebrow">CONNECTED JOURNEY</div><h2>Travel toward ${esc(shownTarget)}</h2><p>This journey follows recorded connections one leg at a time. The energy estimate covers base travel exertion; existing environmental hazards can add strain. Events, hunger, or low energy can pause travel between legs, and unsurveyed terrain or risk remains unknown.</p></div><button class="close-btn" data-action="cancel-travel-route" aria-label="Cancel travel">×</button></div><div class="ir071-route-path"><strong>Route</strong><p>${esc(routeText)}</p></div><div class="ir0775-leg-list" aria-label="Verified route legs">${legRows}</div><div class="ir051-trip-summary"><div><span>Distance</span><strong>${plan.totalDistance} km</strong></div><div><span>Travel time</span><strong>${plan.totalDays} days</strong></div><div><span>Energy estimate</span><strong>${plan.totalEnergy}</strong></div><div><span>Encounter estimate</span><strong>${plan.path.every(id => ir0775SiteSurveyed(ir0775UniqueSiteById(id))) ? `up to ${plan.risk}%` : 'Unknown until surveyed'}</strong></div></div><div class="ir071-route-note">First leg: ${esc(ir0775SafeRouteLabel(first.from, 'Current location'))} → ${esc(ir0775SafeRouteLabel(first.to, 'Uncharted stop'))} · ${first.distance} km · ${first.days} day${first.days === 1 ? '' : 's'} · ${first.energy} energy. Remaining legs start only after the preceding leg succeeds.</div>${state.combat?.active ? '<div class="ir051-reason">Finish combat before travelling.</div>' : ''}${state.pendingEvent ? '<div class="ir051-reason">Resolve your pending event before travelling.</div>' : ''}${c?.hunger < 8 ? '<div class="ir051-reason">You are too hungry to travel safely. Eat first.</div>' : ''}${c && c.energy < first.energy ? `<div class="ir051-reason">Need ${first.energy} energy for the first leg; you have ${c.energy}. Rest first.</div>` : ''}${c && (c.energy < 25 || c.hunger < 25) ? `<div class="notice warning">Low supplies warning: ${c.energy < 25 ? 'energy is low' : ''}${c.energy < 25 && c.hunger < 25 ? ' and ' : ''}${c.hunger < 25 ? 'hunger is low' : ''}. Completed route segments are kept if travel pauses.</div>` : ''}<div class="modal-actions"><button class="button" data-action="cancel-travel-route">Cancel</button><button class="button primary" data-action="travel-route-confirm" data-site="${esc(plan.target.id)}" ${!canStart ? 'disabled' : ''}>Begin journey</button></div></section></div>`;
};

// Complete each multi-leg segment transactionally. Previous valid segments remain committed if a
// later segment cannot start; the failing segment consumes nothing. Each arrival is persisted.
ir071TravelRouteConfirm = function(targetId) {
  const plan = ir071RoutePlan(targetId), c = state?.character;
  if (!plan || !c) { modal = null; render(); toast('That route is no longer available.'); return false; }
  if (state.combat?.active) { toast('Finish combat before travelling.'); return false; }
  if (state.pendingEvent) { toast('Resolve your pending event before travelling.'); return false; }
  if (c.hunger < 8) { toast('You are too hungry to travel safely. Eat first.'); return false; }
  if (c.energy < plan.legs[0].energy) { toast(`Need ${plan.legs[0].energy} energy for the first leg; you have ${c.energy}. Rest first.`); return false; }
  if ((c.energy < 25 || c.hunger < 25) && !modal?.lowResourceConfirmed) { modal = { ...(modal || {}), kind: 'travel-route-preview', site: targetId, path: plan.path, lowResourceConfirmed: true }; render(); toast('Review the low-supplies warning, then begin again.'); return false; }

  let completed = 0, pausedForEvent = false, failure = false, pausedForResources = false;
  for (const quotedLeg of plan.legs) {
    if (state.pendingEvent || state.combat?.active) { pausedForEvent = true; break; }
    const current = site();
    if (!current || current.id !== quotedLeg.from.id) { failure = true; break; }
    const from = ir0775UniqueSiteById(quotedLeg.from.id), to = ir0775UniqueSiteById(quotedLeg.to.id);
    const route = from && to ? ir0775Connection(from.id, to.id) : null;
    if (!route || route.geoId !== quotedLeg.route.geoId || route.distanceKm !== quotedLeg.distance) { failure = true; break; }
    const days = irCurrentTransportDays(route.distanceKm, 'foot');
    const energy = Math.max(4, Math.ceil(days * 3 + 2));
    if (c.hunger < 8 || c.energy < energy) { pausedForResources = true; break; }
    const before = ir0775CloneStateSafely(state);
    if (!before) { failure = true; break; }
    try {
      c.energy = clamp(c.energy - energy, 0, c.maxEnergy);
      dayPass(days, 'travel');
      state.world.siteId = to.id;
      state.world.travelCount = (state.world.travelCount || 0) + 1;
      const firstVisit = irVisitLocation(to);
      for (const next of ir0775ConnectionsFrom(to.id)) irAddKnownLocation(next.to);
      addFeed('🧭', `Reached ${to.name}`, `You travelled ${route.distanceKm} km on foot over ${days} day${days === 1 ? '' : 's'} from ${from.name}.${firstVisit ? ' You discovered a new location.' : ''}`, 'travel');
      const danger = ir0775DangerChance(from, to, 'foot');
      if (Math.random() < danger) {
        triggerEvent(Number(to.risk) >= 30 ? pick(['tracks', 'goblin', 'find', 'squall']) : pick(['purse', 'courier', 'trader']));
      }
      if (typeof persist === 'function' && !persist()) {
        // Persistence failure does not pretend the segment was durably committed; keep active state
        // for play but mark it clearly. Normal existing save behavior remains unchanged.
        toast('This route segment completed, but the local save could not be written. Export a backup when possible.');
      }
      if (typeof render === 'function') render();
      completed++;
      if (state.pendingEvent || state.combat?.active) { pausedForEvent = true; break; }
    } catch (error) {
      state = before;
      try { if (typeof persist === 'function') persist(); } catch (_) { /* retain restored state */ }
      try { if (typeof render === 'function') render(); } catch (_) { /* rendering can be retried */ }
      if (typeof console !== 'undefined' && console.error) console.error('[Infinite Realms v0.7.7.5] Route segment rolled back:', error);
      failure = true;
      break;
    }
  }
  const finished = state?.world?.siteId === targetId;
  modal = null;
  if (typeof persist === 'function') persist();
  if (typeof render === 'function') render();
  if (finished) toast(`Arrived at ${ir0775UniqueSiteById(targetId)?.name || 'your destination'} after ${completed} route segment${completed === 1 ? '' : 's'}.`);
  else if (pausedForEvent) toast(`Travel paused at ${site()?.name || 'a route stop'} because an event or encounter needs your attention.`);
  else if (pausedForResources) toast(`You stopped safely at ${site()?.name || 'a route stop'}. Prepare before continuing.`);
  else if (failure) toast(completed ? `Travel paused safely at ${site()?.name || 'a route stop'} because the next connection could not be verified.` : 'No valid route segment could be completed. No travel costs were consumed.');
  else toast(`You reached ${site()?.name || 'a route stop'}. Continue the journey when ready.`);
  return finished;
};

// Preserve the existing map/local services, but feed them only verified edges and canonical distances.
const ir0775RenderWorldBaseline = renderWorld;
renderWorld = function() {
  if (ir0772MapScope === 'local' && typeof ir0773RenderLocalView === 'function') return ir0773RenderLocalView(ir0772WorldMapModel());
  if (typeof ir0775RenderWorldBaseline !== 'function' || !state?.world?.region) return '';
  // The existing World panel reads routeList from current.routes; canonical accessors are checked
  // by the action/preview and map layers below. Its older location details remain unchanged.
  return ir0775RenderWorldBaseline.apply(this, arguments);
};

const ir0775RouteCss = document.createElement('style');
ir0775RouteCss.textContent = `.ir0775-leg-list{display:grid;gap:6px;margin:10px 0}.ir0775-leg{display:flex;align-items:flex-start;gap:9px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2,rgba(255,255,255,.025))}.ir0775-leg>span{display:grid;place-items:center;flex:0 0 23px;height:23px;border-radius:50%;background:var(--surface-3,rgba(255,255,255,.08));font-size:11px}.ir0775-leg>div{min-width:0;display:grid;gap:3px}.ir0775-leg strong{font-size:12px;overflow-wrap:anywhere}.ir0775-leg small{font-size:11px;color:var(--muted)}`;
document.head.appendChild(ir0775RouteCss);


// Prevent inherited geography/terrain notices from exposing an unsurveyed waypoint's biome.
// The established environmental system remains active for surveyed sites and is not reimplemented here.
const ir0775RenderModalBaseline = renderModal;
renderModal = function() {
  if (modal?.kind !== 'travel-route-preview' || typeof ir071RoutePreviewHtml !== 'function') {
    return ir0775RenderModalBaseline.apply(this, arguments);
  }
  let html = ir071RoutePreviewHtml();
  const plan = typeof ir071RoutePlan === 'function' ? ir071RoutePlan(modal.site) : null;
  const firstLeg = plan?.legs?.[0];
  if (firstLeg && typeof ir0763HazardWarning === 'function') {
    const warnings = [firstLeg.from, firstLeg.to]
      // The current site is physically occupied by the player, so its established warning remains visible.
      // Future endpoints only qualify after survey; otherwise their biome would leak through this notice.
      .filter(location => location?.id === state?.world?.siteId || ir0775SiteSurveyed(location))
      .map(location => ir0763HazardWarning(location))
      .filter(Boolean);
    if (warnings.length) html = html.replace('</div><div class="ir051-trip-summary">', `</div>${warnings.join('')}<div class="ir051-trip-summary">`);
  }
  return html;
};

// Keep release metadata coherent with this subversion despite prior modules setting older titles.
if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.7.5';
const ir0775ShellBaseline = typeof shell === 'function' ? shell : null;
if (ir0775ShellBaseline) shell = function() {
  return ir0775ShellBaseline.apply(this, arguments)
    .replace(/v0\.7\.7\.4/gi, 'v0.7.7.5')
    .replace(/Infinite Realms 0\.7\.7\.4/g, 'Infinite Realms 0.7.7.5')
    .replace(/VERSION 0\.7\.7\.4/g, 'VERSION 0.7.7.5')
    .replace(/VERSION 0\.7\.7\.5 · REPUTATION & NPC COMBAT/g, 'VERSION 0.7.7.5 · MAPS & TRAVEL');
};
const ir0775RenderTitleBaseline = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0775RenderTitleBaseline) renderTitle = function() {
  return ir0775RenderTitleBaseline.apply(this, arguments)
    .replace(/VERSION 0\.7\.7\.4/g, 'VERSION 0.7.7.5')
    .replace(/Version 0\.7\.7\.4/g, 'Version 0.7.7.5');
};

// ================= End v0.7.7.5 Travel and Route Integration =================
