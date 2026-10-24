'use strict';
// Infinite Realms v0.8.6 — deterministic regional simulation.
// Settlement, market, faction, and event records remain the existing authorities.

const IR_V086_RESOURCE_IDS = Object.freeze(['bread', 'herb', 'wood', 'ore']);
const IR_V086_FACTIONS = Object.freeze([
  ['faction:adventurers', 'adventurers'],
  ['faction:merchants', 'merchants'],
  ['faction:royal', 'royal'],
  ['faction:arcanum', 'arcanum'],
  ['faction:shadow', 'shadow']
]);

let ir086ActionContext = null;

function ir086IsRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function ir086Bound(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function ir086Integer(value, min, max) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function ir086RegionIndex(world) {
  const collected = typeof irRegionalHierarchyCollect === 'function'
    ? irRegionalHierarchyCollect(world)
    : { entries: world?.region ? [{ region: world.region }] : [] };
  const counts = new Map();
  for (const entry of collected.entries || []) {
    const id = entry?.region?.id;
    if (typeof id === 'string' && id.trim()) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const byId = new Map();
  for (const entry of collected.entries || []) {
    const id = entry?.region?.id;
    if (typeof id === 'string' && counts.get(id) === 1) byId.set(id, entry.region);
  }
  return { byId, issues: collected.issues || [] };
}

function ir086ResolveSite(world, siteRef) {
  if (typeof irResolveLocationRegion === 'function') return irResolveLocationRegion(world, siteRef);
  return { ok: false, status: 'region-resolver-unavailable', site: null, region: null };
}

function ir086SiteIndex(world) {
  const source = Array.isArray(world?.region?.sites) ? world.region.sites : [];
  const counts = new Map();
  for (const siteRecord of source) {
    if (typeof siteRecord?.id === 'string') counts.set(siteRecord.id, (counts.get(siteRecord.id) || 0) + 1);
  }
  const byId = new Map();
  for (const siteRecord of source) if (typeof siteRecord?.id === 'string' && counts.get(siteRecord.id) === 1) byId.set(siteRecord.id, siteRecord);
  return { sites: [...byId.values()], byId };
}

function ir086ResourceAvailableAt(siteRecord, itemId) {
  const biome = IR_BIOMES?.[siteRecord?.biomeId];
  const methods = Array.isArray(biome?.gatheringAvailability) ? biome.gatheringAvailability : [];
  return methods.some(method => Array.isArray(biome?.gatheringPools?.[method]) && biome.gatheringPools[method].includes(itemId));
}

function ir086SettlementDefaults(siteRecord) {
  const services = Array.isArray(siteRecord?.services) ? siteRecord.services.length : 0;
  return {
    security: ir086Bound(74 - Math.round(Number(siteRecord?.risk) || 0), 18, 95),
    prosperity: ir086Bound(48 + services * 5, 25, 92),
    supplies: ir086Bound(58 + (siteRecord?.settlementType === 'city' ? 24 : siteRecord?.settlementType === 'town' ? 12 : 0), 15, 100)
  };
}

function ir086ResourceSiteCounts(model) {
  const counts = Object.fromEntries([...model.regions.keys()].map(id => [id, Object.fromEntries(IR_V086_RESOURCE_IDS.map(itemId => [itemId, 0]))]));
  for (const siteRecord of model.sites) {
    const resolved = ir086ResolveSite(model.world, siteRecord);
    if (!resolved.ok || !counts[resolved.regionId]) continue;
    for (const itemId of IR_V086_RESOURCE_IDS) if (ir086ResourceAvailableAt(siteRecord, itemId)) counts[resolved.regionId][itemId]++;
  }
  return counts;
}

function ir086Model(world, character) {
  const regionIndex = ir086RegionIndex(world), siteIndex = ir086SiteIndex(world);
  const regions = regionIndex.byId;
  const settlementRecords = siteIndex.sites.filter(siteRecord => siteRecord.type === 'settlement');
  const settlements = new Map(settlementRecords.map(siteRecord => [siteRecord.id, siteRecord]));
  return {
    world,
    character,
    regions,
    sites: siteIndex.sites,
    siteById: siteIndex.byId,
    settlements,
    settlementRecords,
    regionIssues: regionIndex.issues,
    resourceCounts: null
  };
}

function ir086InitialEventThreat(model) {
  const event = model.world?.v05?.activeEvent;
  if (!ir086IsRecord(event) || !['warning', 'escalation'].includes(event.stage)) return null;
  const days = Number.isInteger(event.daysInStage) && event.daysInStage >= 0 ? event.daysInStage : 0;
  const resolved = ir086ResolveSite(model.world, event.siteId);
  if (!resolved.ok) return null;
  const threat = event.stage === 'warning' ? Math.max(0, 15 - days) : Math.max(0, 33 - days);
  return { regionId: resolved.regionId, threat };
}

function ir086DefaultData(model) {
  const day = Math.max(0, Math.floor(Number(model.character?.daysLived) || 0));
  model.resourceCounts = ir086ResourceSiteCounts(model);
  const regions = {};
  for (const [regionId] of model.regions) {
    const resources = {};
    for (const itemId of IR_V086_RESOURCE_IDS) resources[itemId] = Math.min(100, 2 * (model.resourceCounts[regionId]?.[itemId] || 0));
    regions[regionId] = { threat: 0, resources };
  }
  const eventThreat = ir086InitialEventThreat(model);
  if (eventThreat && regions[eventThreat.regionId]) regions[eventThreat.regionId].threat = eventThreat.threat;

  const influence = {};
  const factions = model.world?.v05?.factions || {};
  for (const [siteId] of model.settlements) {
    influence[siteId] = {};
    for (const [factionId, legacyId] of IR_V086_FACTIONS) {
      const raw = Number(factions?.[legacyId]?.influence);
      influence[siteId][factionId] = Number.isFinite(raw) ? ir086Bound(Math.round(raw), 0, 100) : 0;
    }
  }
  return { schema: 1, lastTickDay: day, lastTickSummary: null, regions, influence };
}

function ir086SafeDelta(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0;
}

function ir086NormalizeSummary(raw, model, currentDay) {
  if (!ir086IsRecord(raw)
      || !ir086Integer(raw.startDay, 0, currentDay)
      || !ir086Integer(raw.endDay, raw.startDay, currentDay)
      || !ir086Integer(raw.days, 0, currentDay)) return null;
  const summary = {
    startDay: raw.startDay,
    endDay: raw.endDay,
    days: raw.days,
    regions: {},
    settlements: {},
    transfers: { count: 0, units: 0, bySite: {} }
  };
  for (const [regionId] of model.regions) {
    const source = raw.regions?.[regionId];
    if (!ir086IsRecord(source)) continue;
    const target = { threat: ir086SafeDelta(source.threat), resources: {} };
    for (const itemId of IR_V086_RESOURCE_IDS) target.resources[itemId] = ir086SafeDelta(source.resources?.[itemId]);
    summary.regions[regionId] = target;
  }
  for (const [siteId] of model.settlements) {
    const source = raw.settlements?.[siteId];
    if (!ir086IsRecord(source)) continue;
    const target = {
      security: ir086SafeDelta(source.security),
      prosperity: ir086SafeDelta(source.prosperity),
      supplies: ir086SafeDelta(source.supplies),
      influence: {}
    };
    for (const [factionId] of IR_V086_FACTIONS) target.influence[factionId] = ir086SafeDelta(source.influence?.[factionId]);
    summary.settlements[siteId] = target;
  }
  const transfers = raw.transfers;
  if (ir086IsRecord(transfers)) {
    summary.transfers.count = ir086Integer(transfers.count, 0, Number.MAX_SAFE_INTEGER) ? transfers.count : 0;
    summary.transfers.units = ir086Integer(transfers.units, 0, Number.MAX_SAFE_INTEGER) ? transfers.units : 0;
    for (const [siteId] of model.settlements) {
      const byItem = transfers.bySite?.[siteId];
      if (!ir086IsRecord(byItem)) continue;
      for (const itemId of IR_V086_RESOURCE_IDS) {
        const source = byItem[itemId];
        if (!ir086IsRecord(source)) continue;
        const inbound = ir086Integer(source.inbound, 0, Number.MAX_SAFE_INTEGER) ? source.inbound : 0;
        const outbound = ir086Integer(source.outbound, 0, Number.MAX_SAFE_INTEGER) ? source.outbound : 0;
        if (inbound || outbound) {
          summary.transfers.bySite[siteId] ||= {};
          summary.transfers.bySite[siteId][itemId] = { inbound, outbound };
        }
      }
    }
  }
  return summary;
}

function ir086NormalizeData(raw, model) {
  const defaults = ir086DefaultData(model);
  const source = ir086IsRecord(raw) && raw.schema === 1 ? raw : null;
  if (!source) return defaults;
  const currentDay = defaults.lastTickDay;
  const normalized = {
    schema: 1,
    lastTickDay: ir086Integer(source.lastTickDay, 0, currentDay) ? source.lastTickDay : currentDay,
    lastTickSummary: ir086NormalizeSummary(source.lastTickSummary, model, currentDay),
    regions: defaults.regions,
    influence: defaults.influence
  };
  for (const [regionId, target] of Object.entries(normalized.regions)) {
    const record = source.regions?.[regionId];
    if (!ir086IsRecord(record)) continue;
    if (ir086Integer(record.threat, 0, 100)) target.threat = record.threat;
    for (const itemId of IR_V086_RESOURCE_IDS) if (ir086Integer(record.resources?.[itemId], 0, 100)) target.resources[itemId] = record.resources[itemId];
  }
  for (const [siteId, target] of Object.entries(normalized.influence)) {
    const record = source.influence?.[siteId];
    if (!ir086IsRecord(record)) continue;
    for (const [factionId] of IR_V086_FACTIONS) if (ir086Integer(record[factionId], 0, 100)) target[factionId] = record[factionId];
  }
  return normalized;
}

function ir086EnsureState(gameState = state) {
  if (!gameState?.world?.region || !gameState?.character) return gameState;
  const model = ir086Model(gameState.world, gameState.character);
  gameState.world.v086 = ir086NormalizeData(gameState.world.v086, model);
  for (const [siteId, siteRecord] of model.settlements) {
    const values = gameState.world.v05?.settlements?.[siteId];
    if (!ir086IsRecord(values)) continue;
    const defaults = ir086SettlementDefaults(siteRecord);
    for (const key of ['security', 'prosperity', 'supplies']) {
      if (!ir086Integer(values[key], 0, 100)) values[key] = defaults[key];
    }
  }
  return gameState;
}

function ir086NewSummary() {
  const day = Math.max(0, Math.floor(Number(state?.character?.daysLived) || 0));
  return { startDay: ir086ActionContext?.startDay ?? day, endDay: day, days: 0, regions: {}, settlements: {}, transfers: { count: 0, units: 0, bySite: {} } };
}

function ir086WithAction(callback, startDay) {
  const ownsContext = !ir086ActionContext;
  if (ownsContext) {
    const current = Math.max(0, Math.floor(Number(state?.character?.daysLived) || 0));
    ir086ActionContext = { startDay: ir086Integer(startDay, 0, current) ? startDay : current, currentDay: null, summary: null };
  }
  try {
    return callback();
  } finally {
    if (ownsContext) {
      if (ir086ActionContext?.summary && state?.world?.v086) state.world.v086.lastTickSummary = ir086ActionContext.summary;
      ir086ActionContext = null;
    }
  }
}

function ir086SetSimulationDay(day) {
  if (ir086ActionContext && ir086Integer(day, 0, Number.MAX_SAFE_INTEGER)) ir086ActionContext.currentDay = day;
}

function ir086Summary(day) {
  if (!state?.world?.v086) return null;
  if (!ir086ActionContext) return null;
  if (!ir086ActionContext.summary) {
    ir086ActionContext.summary = ir086NewSummary();
    ir086ActionContext.summary.endDay = day;
    state.world.v086.lastTickSummary = ir086ActionContext.summary;
  }
  ir086ActionContext.summary.endDay = Math.max(ir086ActionContext.summary.endDay, day);
  return ir086ActionContext.summary;
}

function ir086RecordRegionDelta(regionId, field, amount, day) {
  if (!amount) return;
  const summary = ir086Summary(day);
  if (!summary || !state?.world?.v086?.regions?.[regionId]) return;
  summary.regions[regionId] ||= { threat: 0, resources: {} };
  if (field === 'threat') summary.regions[regionId].threat += amount;
  else summary.regions[regionId].resources[field] = (summary.regions[regionId].resources[field] || 0) + amount;
}

function ir086RecordSettlementDelta(siteId, field, amount, day) {
  if (!amount) return;
  const summary = ir086Summary(day);
  if (!summary || !state?.world?.v086?.influence?.[siteId]) return;
  summary.settlements[siteId] ||= { security: 0, prosperity: 0, supplies: 0, influence: {} };
  if (field.startsWith('influence:')) {
    const factionId = field.slice('influence:'.length);
    summary.settlements[siteId].influence[factionId] = (summary.settlements[siteId].influence[factionId] || 0) + amount;
  } else summary.settlements[siteId][field] += amount;
}

function ir086AdjustThreat(regionId, delta, day) {
  const record = state?.world?.v086?.regions?.[regionId];
  if (!record || !Number.isFinite(delta)) return 0;
  const before = record.threat;
  record.threat = ir086Bound(before + Math.trunc(delta), 0, 100);
  const applied = record.threat - before;
  ir086RecordRegionDelta(regionId, 'threat', applied, day);
  return applied;
}

function ir086AdjustSettlement(siteId, field, delta, day) {
  const record = state?.world?.v05?.settlements?.[siteId];
  if (!record || !['security', 'prosperity', 'supplies'].includes(field) || !Number.isFinite(delta)) return 0;
  const before = record[field];
  record[field] = ir086Bound(before + Math.trunc(delta), 0, 100);
  const applied = record[field] - before;
  if (applied) ir086RecordSettlementDelta(siteId, field, applied, day);
  return applied;
}

function ir086AdjustInfluence(siteId, factionId, delta, day) {
  const record = state?.world?.v086?.influence?.[siteId];
  if (!record || !Object.prototype.hasOwnProperty.call(record, factionId) || !Number.isFinite(delta)) return 0;
  const before = record[factionId];
  record[factionId] = ir086Bound(before + Math.trunc(delta), 0, 100);
  const applied = record[factionId] - before;
  if (applied) ir086RecordSettlementDelta(siteId, `influence:${factionId}`, applied, day);
  return applied;
}

function ir086EventTransition(kind, event) {
  if (!state?.world?.v086 || !ir086IsRecord(event)) return;
  const resolved = ir086ResolveSite(state.world, event.siteId);
  if (!resolved.ok) return;
  const day = ir086ActionContext?.currentDay ?? Number(state.character?.daysLived) ?? 0;
  const threatDelta = kind === 'warning' ? 15 : kind === 'escalation' ? 25 : kind === 'helped' ? -25 : kind === 'unresolved' ? 15 : 0;
  if (threatDelta) ir086AdjustThreat(resolved.regionId, threatDelta, day);
  if (kind !== 'helped' || resolved.site?.type !== 'settlement') return;
  const effects = event.effect === 'security'
    ? [['faction:adventurers', 2], ['faction:royal', 2]]
    : event.effect === 'trade'
      ? [['faction:merchants', 2]]
      : event.effect === 'magic'
        ? [['faction:arcanum', 2]]
        : [];
  for (const [factionId, amount] of effects) ir086AdjustInfluence(resolved.site.id, factionId, amount, day);
}

function ir086ShopAllowed(siteRecord, itemId) {
  const item = IR_V04_ITEM_DATA?.[itemId];
  const services = Array.isArray(siteRecord?.services) ? siteRecord.services : [];
  if (!item || siteRecord?.type !== 'settlement') return false;
  if (item.shop === 'general') return services.includes('market') || siteRecord.type === 'settlement';
  if (item.shop === 'alchemist') return services.some(service => ['library', 'alchemy', 'alchemist', 'lab'].includes(service));
  if (item.shop === 'smithy') return services.some(service => ['forge', 'workshop', 'smithy'].includes(service));
  return false;
}

function ir086RecordTransfer(siteId, itemId, direction, units, day) {
  const summary = ir086Summary(day);
  if (!summary) return;
  summary.transfers.count++;
  summary.transfers.units += units;
  summary.transfers.bySite[siteId] ||= {};
  summary.transfers.bySite[siteId][itemId] ||= { inbound: 0, outbound: 0 };
  summary.transfers.bySite[siteId][itemId][direction] += units;
}

function ir086DoTrade(model, siteRecord, regionId, day) {
  const market = state?.world?.economy?.markets?.[siteRecord.id];
  const region = state?.world?.v086?.regions?.[regionId];
  if (!ir086IsRecord(market) || market.siteId !== siteRecord.id || !ir086IsRecord(market.stock) || !ir086IsRecord(market.demand) || !ir086Integer(market.transactions, 0, 10000000)) return false;

  const candidates = [];
  for (const itemId of IR_V086_RESOURCE_IDS) {
    const item = IR_V04_ITEM_DATA?.[itemId];
    const stock = market.stock[itemId], normal = item?.stock, demand = market.demand[item?.category];
    if (!item || !ir086ShopAllowed(siteRecord, itemId) || !ir086Integer(normal, 0, 100000) || !ir086Integer(stock, 0, 1000000) || !Number.isFinite(demand) || demand < 0.7 || demand > 1.5) continue;
    const pool = region?.resources?.[itemId];
    if (!ir086Integer(pool, 0, 100)) continue;
    if (stock < normal && pool > 0) candidates.push({ itemId, direction: 'inbound', gap: normal - stock, pool });
  }
  let picked = candidates[0] || null;
  if (!picked) {
    for (const itemId of IR_V086_RESOURCE_IDS) {
      const item = IR_V04_ITEM_DATA?.[itemId];
      const stock = market.stock[itemId], normal = item?.stock, demand = market.demand[item?.category];
      const pool = region?.resources?.[itemId];
      if (!item || !ir086ShopAllowed(siteRecord, itemId) || !ir086Integer(normal, 0, 100000) || !ir086Integer(stock, 0, 1000000) || !Number.isFinite(demand) || demand < 0.7 || demand > 1.5 || !ir086Integer(pool, 0, 100)) continue;
      if (stock > normal && pool < 100) { picked = { itemId, direction: 'outbound', gap: stock - normal, pool }; break; }
    }
  }
  if (!picked) return false;

  const units = picked.direction === 'inbound'
    ? Math.min(5, picked.gap, picked.pool)
    : Math.min(5, picked.gap, 100 - picked.pool);
  if (!Number.isInteger(units) || units <= 0) return false;
  const item = IR_V04_ITEM_DATA[picked.itemId];
  const regionPool = region.resources[picked.itemId];
  if (picked.direction === 'inbound') {
    region.resources[picked.itemId] -= units;
    market.stock[picked.itemId] += units;
    market.demand[item.category] = ir086Bound(market.demand[item.category] * Math.pow(0.985, units), 0.7, 1.5);
  } else {
    region.resources[picked.itemId] += units;
    market.stock[picked.itemId] -= units;
    market.demand[item.category] = ir086Bound(market.demand[item.category] * Math.pow(1.015, units), 0.7, 1.5);
  }
  market.transactions = Math.min(10000000, market.transactions + 1);
  ir086RecordRegionDelta(regionId, picked.itemId, region.resources[picked.itemId] - regionPool, day);
  ir086RecordTransfer(siteRecord.id, picked.itemId, picked.direction, units, day);
  ir086AdjustSettlement(siteRecord.id, 'prosperity', 1, day);
  if (picked.itemId === 'bread') ir086AdjustSettlement(siteRecord.id, 'supplies', picked.direction === 'inbound' ? units : -units, day);
  ir086AdjustInfluence(siteRecord.id, 'faction:merchants', 1, day);
  return true;
}

function ir086DailyTick(day) {
  if (!state?.character || !state?.world?.v086 || !ir086Integer(day, 1, Number.MAX_SAFE_INTEGER)) return false;
  if (day <= state.world.v086.lastTickDay) return false;
  const ownsContext = !ir086ActionContext;
  if (ownsContext) ir086ActionContext = { startDay: Math.max(0, day - 1), currentDay: day, summary: null };
  const world = state.world;
  const beforeV086 = JSON.stringify(world.v086);
  const beforeSettlements = JSON.stringify(world.v05?.settlements || {});
  const beforeMarkets = JSON.stringify(world.economy?.markets || {});
  const priorSummary = ir086ActionContext.summary;
  try {
    ir086ActionContext.currentDay = day;
    const model = ir086Model(world, state.character);
    model.resourceCounts = ir086ResourceSiteCounts(model);
    const previousTickDay = world.v086.lastTickDay;
    const summary = ir086Summary(day);
    if (!summary) throw new Error('No action summary context is available for the regional tick.');

    for (const regionId of Object.keys(world.v086.regions)) ir086AdjustThreat(regionId, -1, day);
    for (const [regionId, record] of Object.entries(world.v086.regions)) {
      for (const itemId of IR_V086_RESOURCE_IDS) {
        if ((model.resourceCounts[regionId]?.[itemId] || 0) <= 0) continue;
        const before = record.resources[itemId];
        record.resources[itemId] = Math.min(100, before + 1);
        ir086RecordRegionDelta(regionId, itemId, record.resources[itemId] - before, day);
      }
    }

    const sortedSettlements = [...model.settlements.values()].sort((a, b) => a.id.localeCompare(b.id));
    for (const settlement of sortedSettlements) {
      const resolved = ir086ResolveSite(world, settlement);
      if (!resolved.ok) continue;
      const conditions = world.v05?.settlements?.[settlement.id];
      const threat = world.v086.regions?.[resolved.regionId]?.threat;
      if (!ir086IsRecord(conditions) || !ir086Integer(threat, 0, 100)) continue;
      if (threat >= 30) {
        ir086AdjustSettlement(settlement.id, 'security', -1, day);
        ir086AdjustSettlement(settlement.id, 'supplies', -1, day);
      } else if (threat <= 10 && conditions.security < 60) ir086AdjustSettlement(settlement.id, 'security', 1, day);

      const updated = world.v05.settlements[settlement.id];
      if (threat >= 30 || updated.security < 40 || updated.supplies < 25) ir086AdjustSettlement(settlement.id, 'prosperity', -1, day);
      else if (threat <= 10 && updated.security > 80 && updated.supplies > 75) ir086AdjustSettlement(settlement.id, 'prosperity', 1, day);
    }

    for (const settlement of sortedSettlements) {
      const resolved = ir086ResolveSite(world, settlement);
      if (resolved.ok) ir086DoTrade(model, settlement, resolved.regionId, day);
    }

    if (day % 7 === 0) for (const [siteId, values] of Object.entries(world.v086.influence)) {
      for (const [factionId] of IR_V086_FACTIONS) if (values[factionId] > 50) ir086AdjustInfluence(siteId, factionId, -1, day);
    }

    world.v086.lastTickDay = day;
    summary.days++;
    summary.endDay = day;
    if (previousTickDay >= day) throw new Error('Regional simulation day was already processed.');
    world.v086.lastTickSummary = summary;
    return true;
  } catch (error) {
    world.v086 = JSON.parse(beforeV086);
    world.v05.settlements = JSON.parse(beforeSettlements);
    if (world.economy) world.economy.markets = JSON.parse(beforeMarkets);
    ir086ActionContext.summary = priorSummary ? world.v086.lastTickSummary : null;
    if (typeof console !== 'undefined' && console.error) console.error('[Infinite Realms v0.8.6] Regional tick rolled back:', error);
    return false;
  } finally {
    if (ownsContext) {
      if (ir086ActionContext?.summary && state?.world?.v086) state.world.v086.lastTickSummary = ir086ActionContext.summary;
      ir086ActionContext = null;
    }
  }
}

function ir086ValidateState(gameState = state) {
  const errors = [];
  if (!gameState?.world?.region) errors.push('Missing primary world region.');
  else {
    const model = ir086Model(gameState.world, gameState.character);
    for (const issue of model.regionIssues) errors.push(issue);
    const source = Array.isArray(gameState.world.region.sites) ? gameState.world.region.sites : [];
    for (const siteRecord of source) {
      const resolved = ir086ResolveSite(gameState.world, siteRecord);
      if (!resolved.ok) errors.push(`Site ${String(siteRecord?.id || '(unknown)')} has unresolved regional assignment (${resolved.status}).`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function ir086SimulationPanel() {
  if (!state?.world?.v086 || !state?.character) return '';
  const model = ir086Model(state.world, state.character);
  const data = state.world.v086;
  const validation = ir086ValidateState(state);
  const regions = [...model.regions.entries()].map(([regionId, region]) => {
    const record = data.regions?.[regionId];
    if (!record) return '';
    const resources = IR_V086_RESOURCE_IDS.map(itemId => `<span>${esc(ITEMS[itemId]?.name || itemId)} <b>${record.resources[itemId]}</b></span>`).join('');
    return `<article class="ir086-region-row"><strong>${esc(region.name || regionId)}</strong><span>Threat <b>${record.threat}</b></span><div>${resources}</div></article>`;
  }).join('');
  const settlements = [...model.settlements.values()].sort((a, b) => a.id.localeCompare(b.id)).map(siteRecord => {
    const conditions = state.world.v05?.settlements?.[siteRecord.id], influence = data.influence?.[siteRecord.id];
    if (!conditions || !influence) return '';
    const scores = IR_V086_FACTIONS.map(([factionId]) => {
      const faction = IR_V08_FACTION_DEFINITIONS?.[factionId];
      return `<span>${esc(faction?.name || factionId)} <b>${influence[factionId]}</b></span>`;
    }).join('');
    return `<article class="ir086-settlement-row"><strong>${esc(siteRecord.name)}</strong><span>Security ${conditions.security} · Prosperity ${conditions.prosperity} · Supplies ${conditions.supplies}</span><div>${scores}</div></article>`;
  }).join('');
  const summary = data.lastTickSummary;
  const summaryMarkup = summary
    ? `<details class="ir086-summary"><summary>Last simulation action · ${summary.days} day${summary.days === 1 ? '' : 's'} · ${summary.transfers.count} trade${summary.transfers.count === 1 ? '' : 's'} / ${summary.transfers.units} units</summary><pre>${esc(JSON.stringify(summary, null, 2))}</pre></details>`
    : '<small>No regional simulation action has changed these values yet.</small>';
  const issueMarkup = validation.ok ? '' : `<div class="notice warning">Regional simulation paused for invalid geography: ${esc(validation.errors[0])}</div>`;
  return `<section class="panel panel-pad ir086-simulation"><div class="panel-heading"><div><div class="eyebrow">REGIONAL SIMULATION</div><h3>Regional conditions</h3><p>Threat and shared resources update each in-game day; trades and event changes appear in the last action summary.</p></div></div>${issueMarkup}<div class="ir086-region-grid">${regions}</div><div class="ir086-settlement-grid">${settlements}</div>${summaryMarkup}</section>`;
}

function ir086InstallStyle() {
  if (typeof document === 'undefined' || !document.head) return;
  const style = document.createElement('style');
  style.textContent = `.ir086-simulation{margin-top:14px}.ir086-region-grid,.ir086-settlement-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.ir086-region-row,.ir086-settlement-row{display:flex;flex-direction:column;gap:6px;padding:9px;border:1px solid var(--line);border-radius:9px;background:var(--panel2);font-size:11px}.ir086-region-row>div,.ir086-settlement-row>div{display:flex;flex-wrap:wrap;gap:5px 10px;color:var(--muted)}.ir086-region-row b,.ir086-settlement-row b{color:var(--text)}.ir086-summary{margin-top:10px;font-size:11px}.ir086-summary summary{cursor:pointer;color:var(--gold)}.ir086-summary pre{max-height:240px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:9px;border-radius:7px;background:var(--panel)}@media(max-width:760px){.ir086-region-grid,.ir086-settlement-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}

// Initialize and validate v0.8.6 state whenever the established v0.5 world ensure runs.
const ir086EnsureBase = ir05EnsureState;
ir05EnsureState = function (gameState = state) {
  const result = ir086EnsureBase.apply(this, arguments);
  return ir086EnsureState(result);
};

// New characters are created through makeInitial rather than the load/ensure path.
const ir086MakeInitialBase = makeInitial;
makeInitial = function () {
  const result = ir086MakeInitialBase.apply(this, arguments);
  return ir05EnsureState(result);
};

// Save migration preserves valid v0.8.6 leaves and gives old saves deterministic defaults.
const ir086NormalizeBase = normalizeSave;
normalizeSave = function (input) {
  const normalized = ir086NormalizeBase.apply(this, arguments);
  if (normalized?.world?.region && normalized?.character) {
    normalized.world.v086 = ir086NormalizeData(input?.world?.v086, ir086Model(normalized.world, normalized.character));
  }
  return normalized;
};

// The existing event loop supplies the daily insertion point. Catch up the remainder when a
// single existing event advancement exceeds its established 365-day transition limit.
const ir086AdvanceWorldBase = ir05AdvanceWorld;
ir05AdvanceWorld = function (days) {
  const endDay = Math.max(0, Math.floor(Number(state?.character?.daysLived) || 0));
  const elapsed = Math.max(0, Math.floor(Number(days) || 0));
  const startDay = Math.max(0, endDay - elapsed);
  return ir086WithAction(() => {
    const result = ir086AdvanceWorldBase.apply(this, arguments);
    const target = Math.max(0, Math.floor(Number(state?.character?.daysLived) || 0));
    let next = (Number(state?.world?.v086?.lastTickDay) || 0) + 1;
    while (next <= target) {
      ir086DailyTick(next);
      next++;
    }
    return result;
  }, startDay);
};

// Capture existing settlement changes caused by event and faction services in the action summary.
const ir086UpdateSettlementBase = ir05UpdateSettlement;
ir05UpdateSettlement = function (siteId, changes) {
  return ir086WithAction(() => {
    const before = { ...(state?.world?.v05?.settlements?.[siteId] || {}) };
    const result = ir086UpdateSettlementBase.apply(this, arguments);
    const after = state?.world?.v05?.settlements?.[siteId];
    const day = ir086ActionContext?.currentDay ?? Number(state?.character?.daysLived) ?? 0;
    for (const key of ['security', 'prosperity', 'supplies']) if (Number.isFinite(before[key]) && Number.isFinite(after?.[key])) {
      ir086RecordSettlementDelta(siteId, key, after[key] - before[key], day);
    }
    return result;
  });
};

// Existing event lifecycle points add the approved regional threat and local influence deltas.
const ir086CloseEventBase = ir05CloseWorldEvent;
ir05CloseWorldEvent = function (outcome, playerHelped = false) {
  return ir086WithAction(() => {
    const event = state?.world?.v05?.activeEvent ? { ...state.world.v05.activeEvent } : null;
    const result = ir086CloseEventBase.apply(this, arguments);
    if (event && !state?.world?.v05?.activeEvent) ir086EventTransition(outcome, event);
    return result;
  });
};

const ir086FactionContractBase = ir05FactionContract;
ir05FactionContract = function (legacyFactionId) {
  return ir086WithAction(() => {
    const location = typeof site === 'function' ? site() : null;
    const beforeDay = Number(state?.character?.daysLived) || 0;
    const result = ir086FactionContractBase.apply(this, arguments);
    const afterDay = Number(state?.character?.daysLived) || beforeDay;
    const factionId = `faction:${legacyFactionId}`;
    if (location?.type === 'settlement' && afterDay > beforeDay && IR_V08_FACTION_DEFINITIONS?.[factionId]) {
      ir086AdjustInfluence(location.id, factionId, 2, ir086ActionContext?.currentDay ?? afterDay);
    }
    return result;
  });
};

// Scope UI actions so multi-day journeys, repeat actions, event choices, and their nested dayPass
// calls accumulate into one summary. A direct regional/day advancement gets its own scope.
const ir086RunActionBase = runAction;
runAction = function () { return ir086WithAction(() => ir086RunActionBase.apply(this, arguments)); };
const ir086ChooseEventBase = chooseEvent;
chooseEvent = function () { return ir086WithAction(() => ir086ChooseEventBase.apply(this, arguments)); };

const ir086PanelBase = ir05LivingWorldPanel;
ir05LivingWorldPanel = function () {
  const html = ir086PanelBase.apply(this, arguments);
  const index = html.indexOf('</section>');
  return index < 0 ? `${html}${ir086SimulationPanel()}` : `${html.slice(0, index)}${ir086SimulationPanel()}${html.slice(index)}`;
};

if (typeof document !== 'undefined') {
  document.title = 'Infinite Realms — Version 0.8.6';
  ir086InstallStyle();
}
if (typeof globalThis !== 'undefined') {
  globalThis.ir086DailyTick = ir086DailyTick;
  globalThis.ir086SetSimulationDay = ir086SetSimulationDay;
  globalThis.ir086EventTransition = ir086EventTransition;
  globalThis.ir086ValidateState = ir086ValidateState;
  globalThis.ir086SimulationPanel = ir086SimulationPanel;
}
