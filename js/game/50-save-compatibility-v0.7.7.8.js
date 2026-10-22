/* Infinite Realms v0.7.7.8 — save compatibility and map UI state isolation.
 * This release adds no save fields and no migration. Existing save normalization from v0.7.5.5
 * remains authoritative for old geographic records. Map selection/scope is transient UI state;
 * when a complete state object is replaced by a new game or loaded save, reset that state to a
 * safe view of the newly active world before rendering. Never rewrite geographic IDs here.
 */
(function () {
  'use strict';

  // Keep the save schema unchanged. The wrapper only supplies defaults for optional fields
  // absent from an older/corrupted-but-otherwise-valid save, and never overwrites valid values.
  const ir0778NormalizeSaveBase = typeof normalizeSave === 'function' ? normalizeSave : null;
  if (ir0778NormalizeSaveBase) {
    normalizeSave = function (input) {
      let prepared;
      try {
        prepared = typeof clone === 'function' ? clone(input) : JSON.parse(JSON.stringify(input));
      } catch (_) {
        return ir0778NormalizeSaveBase(input);
      }
      const world = prepared?.world;
      if (world && typeof world === 'object') {
        const region = world.region && typeof world.region === 'object' ? world.region : null;
        const sites = Array.isArray(region?.sites) ? region.sites : [];
        const siteIds = new Set(sites.map(site => site?.id).filter(id => typeof id === 'string' && id));
        const validIds = values => Array.isArray(values) ? values.filter(id => typeof id === 'string' && siteIds.has(id)) : [];

        // Derive safe defaults only when the list is absent. Valid non-empty and empty arrays
        // are preserved exactly and continue through the existing normalizer unchanged.
        if (!Array.isArray(world.visited)) {
          const recoveredVisited = sites
            .filter(site => site?.discovered === true || Number(site?.visits) > 0)
            .map(site => site.id);
          if (typeof world.siteId === 'string' && siteIds.has(world.siteId)) recoveredVisited.unshift(world.siteId);
          world.visited = [...new Set(recoveredVisited)];
        }
        if (!Array.isArray(world.known)) {
          const recoveredKnown = [
            ...(typeof world.siteId === 'string' && siteIds.has(world.siteId) ? [world.siteId] : []),
            ...validIds(world.visited),
            ...sites.filter(site => site?.discovered === true || Number(site?.visits) > 0).map(site => site.id)
          ];
          const seeds = [...new Set(recoveredKnown)];
          // Preserve the existing graph and expose only neighbours explicitly connected in it.
          for (const site of sites) {
            if (!seeds.includes(site?.id)) continue;
            for (const route of Array.isArray(site?.routes) ? site.routes : []) {
              if (typeof route?.to === 'string' && siteIds.has(route.to)) recoveredKnown.push(route.to);
            }
          }
          world.known = [...new Set(recoveredKnown)];
        }

        if (!world.journal || typeof world.journal !== 'object' || Array.isArray(world.journal)) world.journal = {};
        const journal = world.journal;
        if (!Array.isArray(journal.knownLocations)) journal.knownLocations = [...world.known];
        if (!Array.isArray(journal.visitedLocations)) journal.visitedLocations = [...world.visited];
        if (!Array.isArray(journal.discoveries)) journal.discoveries = [];
        if (!Array.isArray(journal.rumors)) journal.rumors = [];
      }
      const character = prepared?.character;
      if (character && typeof character === 'object') {
        if (!character.attrs || typeof character.attrs !== 'object' || Array.isArray(character.attrs)) character.attrs = {};
        if (!character.skills || typeof character.skills !== 'object' || Array.isArray(character.skills)) character.skills = {};
        if (!character.inventory || typeof character.inventory !== 'object' || Array.isArray(character.inventory)) character.inventory = {};
        if (!character.equipment || typeof character.equipment !== 'object' || Array.isArray(character.equipment)) character.equipment = {};
        if (!character.relationships || typeof character.relationships !== 'object' || Array.isArray(character.relationships)) character.relationships = {};
        if (!Array.isArray(character.npcs)) character.npcs = [];
        if (!Array.isArray(character.discoveries)) character.discoveries = [];
      }
      const normalized = ir0778NormalizeSaveBase(prepared);
      if (normalized?.world && typeof normalized.world === 'object') {
        // The v0.7.2.3 lead store was historically initialized lazily from world-map rendering.
        // Prepare this optional subsystem before the first render so display-only map navigation
        // is read-only. Preserve existing valid leads/history instead of resetting them.
        const priorLeads = prepared?.world?.v0723;
        if (priorLeads && typeof priorLeads === 'object' && !Array.isArray(priorLeads)) {
          normalized.world.v0723 = priorLeads;
        } else if (!normalized.world.v0723 || typeof normalized.world.v0723 !== 'object' || Array.isArray(normalized.world.v0723)) {
          normalized.world.v0723 = { schema: 1, activeLeads: {}, history: [] };
        }
        const leadState = normalized.world.v0723;
        if (leadState.schema == null) leadState.schema = 1;
        if (!leadState.activeLeads || typeof leadState.activeLeads !== 'object' || Array.isArray(leadState.activeLeads)) leadState.activeLeads = {};
        if (!Array.isArray(leadState.history)) leadState.history = [];
      }
      return normalized;
    };
  }

  // New games should start with the same optional subsystem defaults as loaded saves, so a first
  // visit to a map cannot create save data merely by rendering it.
  const ir0778MakeInitialBase = typeof makeInitial === 'function' ? makeInitial : null;
  if (ir0778MakeInitialBase) {
    makeInitial = function () {
      const created = ir0778MakeInitialBase.apply(this, arguments);
      if (created?.world && typeof created.world === 'object') {
        if (!created.world.v0723 || typeof created.world.v0723 !== 'object' || Array.isArray(created.world.v0723)) {
          created.world.v0723 = { schema: 1, activeLeads: {}, history: [] };
        }
        const leadState = created.world.v0723;
        if (leadState.schema == null) leadState.schema = 1;
        if (!leadState.activeLeads || typeof leadState.activeLeads !== 'object' || Array.isArray(leadState.activeLeads)) leadState.activeLeads = {};
        if (!Array.isArray(leadState.history)) leadState.history = [];
      }
      return created;
    };
  }

  function ir0778ResetMapUiForState(nextState) {
    const world = nextState?.world;
    const sites = Array.isArray(world?.region?.sites) ? world.region.sites : [];
    const current = sites.find(site => site && site.id === world?.siteId) || null;

    // Map scope, current selection, and intelligence-origin flags are deliberately not saved.
    // Reset them when changing worlds so selection from another seed/save cannot leak across.
    if (typeof ir0772MapScope !== 'undefined') ir0772MapScope = 'atlas';
    if (typeof ir0772SelectedGeoId !== 'undefined') {
      ir0772SelectedGeoId = current ? (current.geoId || current.id || null) : null;
    }
    if (typeof ir0772SelectedFromIntel !== 'undefined') ir0772SelectedFromIntel = false;
  }

  function ir0778ResolveStateReplacement() {
    const currentState = typeof state !== 'undefined' ? state : null;
    if (currentState === ir0778ObservedState) return;
    ir0778ObservedState = currentState;
    if (currentState && typeof currentState === 'object') ir0778ResetMapUiForState(currentState);
  }

  let ir0778ObservedState = typeof state !== 'undefined' ? state : null;
  const ir0778RenderBase = typeof render === 'function' ? render : null;
  if (ir0778RenderBase) {
    render = function () {
      ir0778ResolveStateReplacement();
      return ir0778RenderBase.apply(this, arguments);
    };
  }

  // Export a read-only, non-mutating audit helper for diagnostics and compatibility tests.
  // It reports the live source of truth; it does not repair or normalize the supplied objects.
  function ir0778AuditSaveWorld(world, character) {
    const errors = [];
    const warnings = [];
    const sites = Array.isArray(world?.region?.sites) ? world.region.sites : [];
    const edges = Array.isArray(world?.region?.routes) ? world.region.routes : [];
    const siteIds = sites.map(site => site?.id).filter(value => typeof value === 'string' && value);
    const geoIds = sites.map(site => site?.geoId).filter(value => typeof value === 'string' && value);
    const edgeIds = edges.map(edge => edge?.geoId).filter(value => typeof value === 'string' && value);
    const byId = new Map();
    const byGeoId = new Map();
    for (const site of sites) {
      if (!site || typeof site !== 'object') continue;
      if (typeof site.id === 'string' && site.id) byId.set(site.id, (byId.get(site.id) || 0) + 1);
      if (typeof site.geoId === 'string' && site.geoId) byGeoId.set(site.geoId, (byGeoId.get(site.geoId) || 0) + 1);
    }
    for (const [id, count] of byId) if (count !== 1) errors.push(`Duplicate or ambiguous site ID: ${id}`);
    for (const [id, count] of byGeoId) if (count !== 1) errors.push(`Duplicate or ambiguous geographic ID: ${id}`);
    const edgeIdCounts = new Map();
    for (const edge of edges) {
      if (edge?.geoId) edgeIdCounts.set(edge.geoId, (edgeIdCounts.get(edge.geoId) || 0) + 1);
    }
    for (const [id, count] of edgeIdCounts) if (count !== 1) errors.push(`Duplicate route ID: ${id}`);
    if (!world || !world.region || !Array.isArray(world.region.sites) || !Array.isArray(world.region.routes)) {
      errors.push('Missing authoritative world/region site or route arrays');
    }
    if (typeof world?.siteId !== 'string' || byId.get(world.siteId) !== 1) errors.push('Current location does not resolve uniquely');
    for (const id of [...(Array.isArray(world?.known) ? world.known : []), ...(Array.isArray(world?.visited) ? world.visited : [])]) {
      if (byId.get(id) !== 1) errors.push(`Known/visited location does not resolve uniquely: ${id}`);
    }
    for (const site of sites) {
      if (!Array.isArray(site?.routes)) continue;
      for (const route of site.routes) {
        if (byId.get(route?.to) !== 1) errors.push(`Local route destination does not resolve uniquely: ${site?.id || '(unknown)'} -> ${route?.to}`);
        if (route?.toGeoId && byGeoId.get(route.toGeoId) !== 1) errors.push(`Local route geographic destination does not resolve uniquely: ${route.toGeoId}`);
      }
    }
    const current = sites.find(site => site?.id === world?.siteId);
    const requiredCharacter = ['attrs', 'skills', 'inventory', 'equipment', 'relationships', 'npcs'];
    if (!character || typeof character !== 'object') errors.push('Missing character object');
    else for (const field of requiredCharacter) if (!character[field] || typeof character[field] !== 'object') warnings.push(`Optional/legacy character field is absent: ${field}`);
    if (!Array.isArray(world?.known)) warnings.push('Known-location list is absent; existing normalizer may supply a safe default');
    if (!Array.isArray(world?.visited)) warnings.push('Visited-location list is absent; existing normalizer may supply a safe default');
    if (!world?.journal || typeof world.journal !== 'object') warnings.push('World journal is absent; existing normalizer may supply a safe default');
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      counts: { sites: sites.length, uniqueSiteIds: new Set(siteIds).size, uniqueGeoIds: new Set(geoIds).size, globalRoutes: edges.length, uniqueRouteIds: new Set(edgeIds).size },
      currentLocationId: current?.id || null,
      currentLocationGeoId: current?.geoId || null,
      references: {
        sitesAreCanonicalArray: !!world?.region?.sites && sites === world.region.sites,
        globalRoutesAreCanonicalArray: !!world?.region?.routes && edges === world.region.routes
      }
    };
  }

  // Make the non-mutating audit available to test/report tooling without creating persisted data.
  if (typeof globalThis !== 'undefined') {
    globalThis.ir0778AuditSaveWorld = ir0778AuditSaveWorld;
    globalThis.ir0778ResetMapUiForState = ir0778ResetMapUiForState;
  }

  // Branding only. This file does not change the saved version/schema fields.
  if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.7.8';
  const ir0778ShellBase = typeof shell === 'function' ? shell : null;
  if (ir0778ShellBase) {
    shell = function () {
      return ir0778ShellBase.apply(this, arguments).replace(/0\.7\.7\.7/g, '0.7.7.8');
    };
  }
  const ir0778RenderTitleBase = typeof renderTitle === 'function' ? renderTitle : null;
  if (ir0778RenderTitleBase) {
    renderTitle = function () {
      return ir0778RenderTitleBase.apply(this, arguments).replace(/0\.7\.7\.7/g, '0.7.7.8');
    };
  }
  const ir0778RenderCharacterBase = typeof renderCharacter === 'function' ? renderCharacter : null;
  if (ir0778RenderCharacterBase) {
    renderCharacter = function () {
      const html = ir0778RenderCharacterBase.apply(this, arguments);
      return typeof html === 'string' ? html.replace(/CHARACTER STATUS · v0\.7\.7\.7/g, 'CHARACTER STATUS · v0.7.7.8') : html;
    };
  }
})();
