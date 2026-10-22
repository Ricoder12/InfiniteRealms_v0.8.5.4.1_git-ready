'use strict';
// Infinite Realms v0.7.8.7 — political map and location information.
// Uses explicit political/geographic references only. It never invents boundary geometry,
// reveals undiscovered site details, changes travel state, or makes map labels actionable.

const IR0787_POLITY_TYPE_LABELS = Object.freeze({
  country: 'Country', kingdom: 'Kingdom', empire: 'Empire',
  'city-state': 'City-state', 'tribal-territory': 'Tribal territory'
});

function ir0787MapContext(worldOverride) {
  const activeState = typeof state !== 'undefined' && state && state.world ? state : null;
  const world = worldOverride || activeState?.world || null;
  const sites = Array.isArray(world?.region?.sites) ? world.region.sites : [];
  const regions = typeof irGetGeographicRegions === 'function'
    ? irGetGeographicRegions(world)
    : (world?.region ? [world.region] : []);
  const regionsById = new Map();
  for (const region of regions) {
    if (!region || typeof region.id !== 'string' || !region.id.trim()) continue;
    if (!regionsById.has(region.id)) regionsById.set(region.id, []);
    regionsById.get(region.id).push(region);
  }
  const politiesById = new Map();
  for (const polity of Array.isArray(world?.polities) ? world.polities : []) {
    if (!polity || typeof polity.id !== 'string' || !polity.id.trim()) continue;
    if (!politiesById.has(polity.id)) politiesById.set(polity.id, []);
    politiesById.get(polity.id).push(polity);
  }
  const knownIds = new Set(Array.isArray(world?.known) ? world.known : []);
  const visitedIds = new Set(Array.isArray(world?.visited) ? world.visited : []);
  const current = sites.find(site => site?.id === world?.siteId) || null;
  return { state: activeState?.world === world ? activeState : null, world, sites, regions, regionsById, politiesById, knownIds, visitedIds, current };
}

function ir0787Esc(value) { return typeof esc === 'function' ? esc(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function ir0787VisitedOrDiscovered(site, ctx) {
  return !!site && !!ctx && (ctx.visitedIds.has(site.id) || Number(site.visits) > 0 || site.discovered === true);
}
function ir0787KnownSite(site, ctx) {
  return !!site && !!ctx && (site === ctx.current || ctx.knownIds.has(site.id) || ctx.visitedIds.has(site.id) || Number(site.visits) > 0 || site.discovered === true);
}
function ir0787UniquePolity(ctx, id) {
  if (typeof id !== 'string' || !id) return { status: 'unassigned', polity: null };
  const matches = ctx?.politiesById.get(id) || [];
  if (matches.length === 1) return { status: 'resolved', polity: matches[0] };
  return { status: matches.length ? 'ambiguous' : 'unresolved', polity: null };
}
function ir0787UniqueRegion(ctx, id) {
  if (typeof id !== 'string' || !id) return null;
  const matches = ctx?.regionsById.get(id) || [];
  return matches.length === 1 ? matches[0] : null;
}
function ir0787ResolveSiteRegion(site, ctx) {
  if (!site || !ctx?.world) return { status: 'missing-site', region: null };
  if (typeof irResolveLocationRegion === 'function') {
    const resolved = irResolveLocationRegion(ctx.world, site);
    if (resolved?.ok && resolved.region) return { status: 'resolved', region: resolved.region };
    return { status: resolved?.status || 'unresolved', region: null };
  }
  const region = ir0787UniqueRegion(ctx, site.regionId || ctx.world.region?.id);
  return region ? { status: 'resolved', region } : { status: 'unresolved', region: null };
}
function ir0787ExplicitUnclaimed(region) {
  // Missing owner references mean UNKNOWN, never unclaimed. Only explicit territorial metadata
  // is allowed to produce the visually distinct unclaimed status.
  return !!region && (region.territorialStatus === 'unclaimed' || region.ownershipStatus === 'unclaimed' ||
    region.politicalStatus === 'unclaimed' || region.unclaimed === true);
}
function ir0787RegionPolitics(region, ctx) {
  if (!region || !ctx) return { status: 'unknown', owner: null, governor: null };
  const ownerId = typeof region.ownerPolityId === 'string' && region.ownerPolityId ? region.ownerPolityId : null;
  const governorId = typeof region.governingPolityId === 'string' && region.governingPolityId ? region.governingPolityId : null;
  const owner = ir0787UniquePolity(ctx, ownerId);
  const governor = ir0787UniquePolity(ctx, governorId);
  if (ownerId && !owner.polity) return { status: 'unresolved-owner', owner: null, governor: governor.polity };
  if (governorId && !governor.polity) return { status: owner.polity ? 'owned-governor-unresolved' : 'unresolved-governor', owner: owner.polity, governor: null };
  if (owner.polity) return { status: 'owned', owner: owner.polity, governor: governor.polity };
  if (governor.polity) return { status: 'governed', owner: null, governor: governor.polity };
  if (ir0787ExplicitUnclaimed(region)) return { status: 'unclaimed', owner: null, governor: null };
  return { status: 'unknown', owner: null, governor: null };
}
function ir0787RegionStatusRow(region, ctx) {
  const political = ir0787RegionPolitics(region, ctx);
  const name = ir0787Esc(region?.name || 'Unnamed region');
  let status = '';
  if (political.owner) status = `<span class="ir0787-status-pill owned">⚑ ${ir0787Esc(political.owner.name || 'Political entity')} · ${ir0787Esc(ir0787SafeType(political.owner))}</span>`;
  else if (political.governor) status = `<span class="ir0787-status-pill governed">⚑ Governed by ${ir0787Esc(political.governor.name || 'Political entity')}</span>`;
  else if (political.status === 'unclaimed') status = '<span class="ir0787-status-pill unclaimed">◇ Confirmed unclaimed</span>';
  else if (political.status.includes('unresolved')) status = '<span class="ir0787-status-pill unknown">! Political reference unresolved</span>';
  else status = '<span class="ir0787-status-pill unknown">? Ownership unknown</span>';
  return `<div class="ir0787-region-status-row"><strong>${name}</strong>${status}</div>`;
}

function ir0787SitePolitics(site, ctx) {
  if (!site || !ctx) return { status: 'unknown', region: null, owner: null, governor: null, detail: 'Political information is unavailable.' };
  const resolvedRegion = ir0787ResolveSiteRegion(site, ctx);
  if (resolvedRegion.status !== 'resolved') {
    return { status: 'unresolved-region', region: null, owner: null, governor: null, detail: 'The geographic region reference is unresolved.' };
  }
  const region = resolvedRegion.region;
  const siteOwnerId = typeof site.ownerPolityId === 'string' && site.ownerPolityId ? site.ownerPolityId : null;
  const regionOwnerId = typeof region.ownerPolityId === 'string' && region.ownerPolityId ? region.ownerPolityId : null;
  const regionGovernorId = typeof region.governingPolityId === 'string' && region.governingPolityId ? region.governingPolityId : null;
  const ownerRef = siteOwnerId || regionOwnerId;
  const ownerResult = ir0787UniquePolity(ctx, ownerRef);
  const governorResult = ir0787UniquePolity(ctx, regionGovernorId);
  const owner = ownerResult.polity;
  const governor = governorResult.polity;
  if (ownerRef && !owner) return { status: 'unresolved-owner', region, owner: null, governor, detail: 'An ownership reference is recorded but cannot be resolved.' };
  if (regionGovernorId && !governor) return { status: owner ? 'owned-governor-unresolved' : 'unresolved-governor', region, owner, governor: null, detail: 'A governing-entity reference is recorded but cannot be resolved.' };
  if (owner) return { status: 'owned', region, owner, governor, detail: 'Political ownership is recorded.' };
  if (governor) return { status: 'governed', region, owner: null, governor, detail: 'Governance is recorded; ownership is not specified.' };
  if (ir0787ExplicitUnclaimed(region)) return { status: 'unclaimed', region, owner: null, governor: null, detail: 'This region is explicitly recorded as unclaimed.' };
  return { status: 'unknown', region, owner: null, governor: null, detail: 'Political ownership is not recorded. This does not imply unclaimed territory.' };
}
function ir0787PolitySummary(polity, ctx) {
  if (!polity) return null;
  try {
    if (typeof irGetPoliticalEntitySummary === 'function') return irGetPoliticalEntitySummary(ctx?.state || ctx?.world, polity.id) || null;
  } catch (_) { /* Fall back to explicit fields below. */ }
  const capMatches = typeof polity.capitalSiteGeoId === 'string' ? ctx.sites.filter(site => site?.geoId === polity.capitalSiteGeoId) : [];
  const leader = null; // Without a complete state/person context, do not guess a ruler identity.
  return { id: polity.id, name: polity.name, type: polity.type, governmentType: polity.governmentType || null,
    governmentDescription: polity.governmentDescription || null,
    capital: capMatches.length === 1 ? { geoId: capMatches[0].geoId, name: capMatches[0].name, site: capMatches[0] } : null,
    leader, leaderTitle: polity.leaderTitle || null, controlledRegionCount: null, controlledRegionCountKnown: false };
}
function ir0787VisiblePoliticalFacts(ctx) {
  const polities = new Map(), regions = new Map(), unclaimed = new Map();
  for (const site of ctx.sites) {
    // Site-level names and political affiliation may be shown only for places already visited
    // or discovered. Knowing terrain alone must not reveal a hidden ruler/capital/owner.
    if (!ir0787VisitedOrDiscovered(site, ctx)) continue;
    const facts = ir0787SitePolitics(site, ctx);
    if (facts.region?.id) regions.set(facts.region.id, facts.region);
    if (facts.owner) polities.set(facts.owner.id, facts.owner);
    if (facts.governor) polities.set(facts.governor.id, facts.governor);
    if (facts.status === 'unclaimed' && facts.region) unclaimed.set(facts.region.id, facts.region);
    // A known capital can establish that this political entity is part of the player's known world.
    for (const polity of Array.isArray(ctx.world?.polities) ? ctx.world.polities : []) {
      if (polity?.capitalSiteGeoId && polity.capitalSiteGeoId === site.geoId && ir0787UniquePolity(ctx, polity.id).status === 'resolved') {
        polities.set(polity.id, polity);
      }
    }
  }
  return { polities: [...polities.values()], regions: [...regions.values()], unclaimed: [...unclaimed.values()] };
}
function ir0787SafeType(polity) { return IR0787_POLITY_TYPE_LABELS[polity?.type] || (typeof polity?.type === 'string' ? polity.type : 'Political entity'); }
function ir0787CapitalLabel(polity, ctx) {
  const id = polity?.capitalSiteGeoId;
  if (typeof id !== 'string' || !id) return 'No capital recorded';
  const matches = ctx.sites.filter(site => site?.geoId === id);
  if (matches.length !== 1) return 'Capital reference unresolved';
  const site = matches[0];
  return ir0787VisitedOrDiscovered(site, ctx) ? `♛ Capital · ${site.name || 'Known settlement'}` : '♛ Capital recorded · location not yet charted';
}
function ir0787PolityCard(polity, ctx) {
  const summary = ir0787PolitySummary(polity, ctx);
  const leaderName = summary?.leader?.name;
  const government = summary?.governmentLabel || (polity.governmentType ? ir0787SafeType({type: polity.governmentType}) : null);
  const descriptive = summary?.governmentDescription || (typeof polity.governmentDescription === 'string' ? polity.governmentDescription : null);
  const capital = ir0787CapitalLabel(polity, ctx);
  const controlled = summary?.controlledRegionCountKnown && Number.isFinite(Number(summary.controlledRegionCount))
    ? `<span class="ir0787-meta-pill">${Number(summary.controlledRegionCount)} controlled regions</span>` : '';
  return `<article class="ir0787-polity-card"><div class="ir0787-polity-sigil" aria-hidden="true">${polity.capitalSiteGeoId && capital.startsWith('♛ Capital ·') ? '♛' : '⚑'}</div><div class="ir0787-polity-copy"><div class="ir0787-polity-title"><strong>${ir0787Esc(polity.name || 'Unnamed political entity')}</strong><span class="ir0787-type-pill">${ir0787Esc(ir0787SafeType(polity))}</span></div>${government ? `<p><b>Government:</b> ${ir0787Esc(government)}</p>` : ''}${descriptive ? `<p>${ir0787Esc(descriptive)}</p>` : ''}${leaderName ? `<p><b>Leadership:</b> ${ir0787Esc(summary.leader.title ? summary.leader.title + ' ' : '')}${ir0787Esc(leaderName)}</p>` : ''}<p class="ir0787-capital-line">${ir0787Esc(capital)}</p>${controlled}</div></article>`;
}
function ir0787WorldPoliticalPanel(world) {
  const ctx = ir0787MapContext(world);
  if (!ctx.world) return '';
  const facts = ir0787VisiblePoliticalFacts(ctx);
  const cards = facts.polities.filter(polity => ir0787UniquePolity(ctx, polity.id).status === 'resolved')
    .sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')))
    .map(polity => ir0787PolityCard(polity, ctx)).join('');
  const unclaimed = facts.unclaimed.length
    ? `<div class="ir0787-unclaimed-list"><strong>Confirmed unclaimed areas</strong>${facts.unclaimed.map(region => `<span class="ir0787-status-pill unclaimed">◇ ${ir0787Esc(region.name || 'Unclaimed region')}</span>`).join('')}</div>` : '';
  const regionalStatus = facts.regions.length
    ? `<div class="ir0787-region-status-list"><div class="ir0787-subhead"><strong>Known regional status</strong><span>${facts.regions.length} regions</span></div>${facts.regions.slice().sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id))).map(region=>ir0787RegionStatusRow(region,ctx)).join('')}</div>` : '';
  const boundaryNote = 'Territorial borders are drawn only when explicit boundary geometry exists. This save’s region hierarchy records relationships, not map polygons; no political lines are inferred from roads, adjacency, or ownership alone.';
  const legend = `<div class="ir0787-political-legend"><span><b>♛</b> Known capital</span><span><b>⚑</b> Recorded political affiliation</span><span><b>◇</b> Confirmed unclaimed</span><span><b>?</b> Ownership unknown</span></div>`;
  const empty = !cards && !unclaimed
    ? '<p class="ir0787-muted">No political ownership or unclaimed status is confirmed for the locations charted so far. Missing ownership data is shown as unknown, not unclaimed.</p>' : '';
  return `<section class="panel panel-pad ir0787-political-panel" aria-label="Known political geography"><div class="panel-heading"><div><div class="eyebrow">POLITICAL GEOGRAPHY</div><h2>Known territories and capitals</h2><p>Political information is shown only for visited or explicitly discovered places. Selecting these summaries never starts travel.</p></div><span class="tag">${facts.polities.length} KNOWN ENTITIES</span></div>${cards ? `<div class="ir0787-polity-list">${cards}</div>` : ''}${regionalStatus}${unclaimed}${empty}${legend}<p class="ir0787-boundary-note"><strong>Boundary data:</strong> ${ir0787Esc(boundaryNote)}</p></section>`;
}
function ir0787StatusMarkup(facts, site, ctx) {
  if (!site) return '<p class="ir0787-muted">No location record is available for political inspection.</p>';
  const visited = ir0787VisitedOrDiscovered(site, ctx);
  if (!visited) return '<p class="ir0787-muted">Political ownership, capital, and leadership details remain hidden until this location is explored.</p>';
  const regionText = facts.region ? ir0787Esc(facts.region.name || 'Unnamed region') : 'Region unresolved';
  let body = '';
  if (facts.owner) {
    const summary = ir0787PolitySummary(facts.owner, ctx);
    body += ir0787PolityCard(facts.owner, ctx);
    if (facts.governor && facts.governor.id !== facts.owner.id) body += `<p class="ir0787-governance-note">Governed by ${ir0787Esc(facts.governor.name || 'Political entity')}</p>`;
    if (summary?.leaderStatus === 'unresolved-reference' || summary?.leaderStatus === 'ambiguous-reference') {
      body += '<p class="ir0787-muted">Leadership reference is not currently resolvable.</p>';
    }
  } else if (facts.governor) {
    body += `<article class="ir0787-polity-card"><div class="ir0787-polity-sigil" aria-hidden="true">⚑</div><div class="ir0787-polity-copy"><div class="ir0787-polity-title"><strong>${ir0787Esc(facts.governor.name || 'Political entity')}</strong><span class="ir0787-type-pill">${ir0787Esc(ir0787SafeType(facts.governor))}</span></div><p>Governance recorded; ownership is not specified.</p></div></article>`;
  } else if (facts.status === 'unclaimed') {
    body += '<span class="ir0787-status-pill unclaimed">◇ Confirmed unclaimed territory</span>';
  } else if (facts.status.includes('unresolved')) {
    body += `<span class="ir0787-status-pill unknown">! Political reference unresolved</span><p class="ir0787-muted">${ir0787Esc(facts.detail)}</p>`;
  } else {
    body += '<span class="ir0787-status-pill unknown">? Ownership not recorded</span><p class="ir0787-muted">Unknown ownership is different from confirmed unclaimed territory.</p>';
  }
  return `<div class="ir0787-location-political-grid"><div><span class="ir0787-field-label">Geographic region</span><strong>${regionText}</strong><small>Resolved from the location’s existing regionId.</small></div><div><span class="ir0787-field-label">Territorial status</span>${body}</div></div>`;
}
function ir0787RegionalPoliticalPanel(model) {
  const ctx = ir0787MapContext(model?.world);
  if (!ctx.world) return '';
  const selected = typeof ir0773SelectedRecord === 'function' ? ir0773SelectedRecord(model) :
    (typeof ir0772SelectedSite === 'function' ? ir0772SelectedSite(model) : model?.current);
  const facts = ir0787SitePolitics(selected, ctx);
  return `<section class="panel panel-pad ir0787-political-panel ir0787-location-political-panel" aria-label="Political information for selected location"><div class="panel-heading"><div><div class="eyebrow">REGIONAL POLITICAL STATUS</div><h3>${ir0787Esc(selected?.name && ir0787VisitedOrDiscovered(selected, ctx) ? selected.name : (selected === ctx.current ? 'Current location' : 'Selected location'))}</h3><p>Geographic region and political control are resolved separately.</p></div><span class="tag">INFORMATION ONLY</span></div>${ir0787StatusMarkup(facts, selected, ctx)}<div class="ir0787-political-legend"><span><b>♛</b> Known capital</span><span><b>⚑</b> Political affiliation</span><span><b>◇</b> Confirmed unclaimed</span><span><b>?</b> Ownership unknown</span></div><p class="ir0787-boundary-note">Political affiliation does not add a physical obstacle or alter available travel connections.</p></section>`;
}
function ir0787AnnotateRegionalNodes(html, model) {
  const ctx = ir0787MapContext(model?.world);
  if (!ctx.world) return html;
  return String(html).replace(/<button\b(?=[^>]*\bclass="[^"]*\bworld-node\b)[^>]*>[\s\S]*?<\/button>/g, button => {
    const siteId = button.match(/\bdata-site="([^"]*)"/i)?.[1] || '';
    const geoId = button.match(/\bdata-geo-id="([^"]*)"/i)?.[1] || '';
    const site = ctx.sites.find(item => (geoId && item.geoId === geoId) || (!geoId && item.id === siteId));
    if (!site || !ir0787VisitedOrDiscovered(site, ctx)) return button;
    const facts = ir0787SitePolitics(site, ctx);
    const capitalPolities = (Array.isArray(ctx.world.polities) ? ctx.world.polities : []).filter(polity =>
      polity?.capitalSiteGeoId && polity.capitalSiteGeoId === site.geoId && ir0787UniquePolity(ctx, polity.id).status === 'resolved');
    const ownerName = facts.owner?.name || facts.governor?.name || '';
    const badges = [];
    if (capitalPolities.length) badges.push(`<span class="ir0787-map-capital" title="Known political capital" aria-label="Known capital">♛</span>`);
    if (ownerName) badges.push(`<span class="ir0787-map-affiliation" title="${ir0787Esc('Political affiliation: ' + ownerName)}">⚑ ${ir0787Esc(ownerName)}</span>`);
    else if (facts.status === 'unclaimed') badges.push('<span class="ir0787-map-affiliation unclaimed" title="Explicitly recorded as unclaimed">◇ Unclaimed</span>');
    if (!badges.length) return button;
    const suffix = `<span class="ir0787-node-political" aria-hidden="true">${badges.join('')}</span>`;
    let out = button.replace(/<\/button>\s*$/, `${suffix}</button>`);
    const oldTitle = out.match(/\btitle="([^"]*)"/i)?.[1] || '';
    const extraTitle = [capitalPolities.length ? 'Known capital' : '', ownerName ? `Political affiliation: ${ownerName}` : facts.status === 'unclaimed' ? 'Explicitly unclaimed region' : ''].filter(Boolean).join('; ');
    if (extraTitle) out = out.replace(/\btitle="[^"]*"/i, `title="${ir0787Esc(oldTitle ? oldTitle + '; ' + extraTitle : extraTitle)}"`);
    return out;
  });
}

// The World layer is an atlas/index without real continental coordinates. Append a labelled
// political index instead of placing labels/borders at fabricated coordinates.
const ir0787RenderWorldAtlasBase = typeof ir0772RenderWorldAtlas === 'function' ? ir0772RenderWorldAtlas : null;
if (ir0787RenderWorldAtlasBase) {
  ir0772RenderWorldAtlas = function (world) {
    const actualWorld = world || (typeof state !== 'undefined' ? state?.world : null);
    return ir0787RenderWorldAtlasBase.apply(this, arguments) + ir0787WorldPoliticalPanel(actualWorld);
  };
}

const ir0787RenderRegionalBase = typeof ir0772RenderRegionalMap === 'function' ? ir0772RenderRegionalMap : null;
if (ir0787RenderRegionalBase) {
  ir0772RenderRegionalMap = function (model) {
    const m = model || (typeof ir0772WorldMapModel === 'function' ? ir0772WorldMapModel() : null);
    const html = ir0787RenderRegionalBase.apply(this, arguments);
    return ir0787AnnotateRegionalNodes(html, m) + ir0787RegionalPoliticalPanel(m);
  };
}

const ir0787RenderLocalBase = typeof ir0773RenderLocalView === 'function' ? ir0773RenderLocalView : null;
if (ir0787RenderLocalBase) {
  ir0773RenderLocalView = function (model) {
    const m = model || (typeof ir0772WorldMapModel === 'function' ? ir0772WorldMapModel() : null);
    return ir0787RenderLocalBase.apply(this, arguments) + ir0787RegionalPoliticalPanel(m);
  };
}

// Version metadata only; the underlying game shell and action dispatcher remain authoritative.
if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.8.8';
const ir0787ShellBase = typeof shell === 'function' ? shell : null;
if (ir0787ShellBase) shell = function () {
  return ir0787ShellBase.apply(this, arguments)
    .replace(/0\.7\.7\.9/g, '0.7.8.8')
    .replace(/0\.7\.8\.\d+/g, '0.7.8.8');
};
const ir0787RenderTitleBase = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0787RenderTitleBase) renderTitle = function () {
  return ir0787RenderTitleBase.apply(this, arguments)
    .replace(/0\.7\.7\.9/g, '0.7.8.8')
    .replace(/0\.7\.8\.\d+/g, '0.7.8.8');
};
const ir0787RenderCharacterBase = typeof renderCharacter === 'function' ? renderCharacter : null;
if (ir0787RenderCharacterBase) renderCharacter = function () {
  const html = ir0787RenderCharacterBase.apply(this, arguments);
  return typeof html === 'string' ? html.replace(/CHARACTER STATUS · v0\.7\.8\.\d+/g, 'CHARACTER STATUS · v0.7.8.8') : html;
};
if (typeof globalThis !== 'undefined') {
  globalThis.ir0787MapContext = ir0787MapContext;
  globalThis.ir0787SitePolitics = ir0787SitePolitics;
  globalThis.ir0787WorldPoliticalPanel = ir0787WorldPoliticalPanel;
  globalThis.ir0787RegionalPoliticalPanel = ir0787RegionalPoliticalPanel;
}
