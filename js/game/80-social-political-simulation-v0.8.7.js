'use strict';
// Infinite Realms v0.8.7 — bounded NPC ambitions, event rumors, and settlement politics.
// This module extends the existing NPC, relationship, regional event, and influence records.

const IR_V087_AMBITIONS = Object.freeze({
  'ambition:wealth': 'Build wealth',
  'ambition:security': 'Protect people',
  'ambition:influence': 'Gain influence',
  'ambition:knowledge': 'Pursue knowledge',
  'ambition:stability': 'Maintain stability'
});
const IR_V087_FACTIONS = Object.freeze(Object.keys(IR_V08_FACTION_DEFINITIONS || {}).sort());
let ir087PositiveInfluence = new Map();
let ir087MultiUnitTrades = new Map();
let ir087ProcessedAmbitions = new Set();
let ir087AwardedAmbitions = new Set();
let ir087TrackedCharacter = null;

function ir087Record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function ir087IsInteger(value, min, max) { return Number.isSafeInteger(value) && value >= min && value <= max; }
function ir087FactionId(value) { return typeof value === 'string' && IR_V087_FACTIONS.includes(value); }
function ir087AmbitionFromGoal(goal) {
  const text = String(goal || '').toLowerCase();
  if (/wealth|coin/.test(text)) return 'ambition:wealth';
  if (/protect|guard|safe/.test(text)) return 'ambition:security';
  if (/magic|learn/.test(text)) return 'ambition:knowledge';
  if (/power|rule/.test(text)) return 'ambition:influence';
  return 'ambition:stability';
}
function ir087NpcCatalog(gameState = state) {
  const catalog = new Map();
  const worldRecords = [gameState?.world?.v06?.registry, gameState?.world?.v06?.changes];
  for (const source of worldRecords) if (ir087Record(source)) for (const [id, npc] of Object.entries(source)) {
    if (id && ir087Record(npc) && typeof npc.id === 'string' && npc.id === id) catalog.set(id, { ...(catalog.get(id) || {}), ...npc });
  }
  for (const npc of Array.isArray(gameState?.character?.npcs) ? gameState.character.npcs : []) {
    if (typeof npc?.id === 'string' && npc.id.trim()) catalog.set(npc.id, { ...(catalog.get(npc.id) || {}), ...npc });
  }
  return catalog;
}
function ir087SettlementCatalog(gameState = state) {
  const map = new Map();
  for (const siteRecord of Array.isArray(gameState?.world?.region?.sites) ? gameState.world.region.sites : []) {
    if (siteRecord?.type === 'settlement' && typeof siteRecord.id === 'string' && siteRecord.id.trim()) map.set(siteRecord.id, siteRecord);
  }
  return map;
}
function ir087DefaultData(gameState = state) {
  const npcs = {};
  for (const [npcId, npc] of ir087NpcCatalog(gameState)) npcs[npcId] = { ambition: ir087AmbitionFromGoal(npc.goal), ambitionProgress: 0, rumors: [] };
  const politics = {};
  for (const siteId of ir087SettlementCatalog(gameState).keys()) {
    politics[siteId] = {};
    for (const factionId of IR_V087_FACTIONS) politics[siteId][factionId] = { alliance: null, rivalry: null };
  }
  return { schema: 1, npcs, politics };
}
function ir087NormalizeNpc(source, fallback, day) {
  const validAmbition = Object.prototype.hasOwnProperty.call(IR_V087_AMBITIONS, source?.ambition);
  const ambition = validAmbition ? source.ambition : fallback.ambition;
  const ambitionProgress = ir087IsInteger(source?.ambitionProgress, 0, 100) ? source.ambitionProgress : fallback.ambitionProgress;
  let rumors = fallback.rumors;
  if (Array.isArray(source?.rumors) && source.rumors.length <= 5 && source.rumors.every(rumor =>
    ir087Record(rumor)
    && Object.keys(rumor).length === 2
    && Object.prototype.hasOwnProperty.call(rumor, 'eventId')
    && typeof rumor.eventId === 'string' && rumor.eventId.trim().length > 0
    && Object.prototype.hasOwnProperty.call(rumor, 'tickHeard')
    && ir087IsInteger(rumor.tickHeard, 0, day)
  ) && new Set(source.rumors.map(rumor => rumor.eventId)).size === source.rumors.length) {
    rumors = source.rumors.map(rumor => ({ eventId: rumor.eventId, tickHeard: rumor.tickHeard }));
  }
  return { ambition, ambitionProgress, rumors };
}
function ir087NormalizePolitics(rawPolitics, defaults) {
  const politics = defaults;
  for (const [siteId, factionRecords] of Object.entries(politics)) {
    const sourceSite = rawPolitics?.[siteId];
    if (!ir087Record(sourceSite)) continue;
    for (const factionId of IR_V087_FACTIONS) {
      const source = sourceSite[factionId];
      if (!ir087Record(source)) continue;
      for (const kind of ['alliance', 'rivalry']) {
        const value = source[kind];
        if (value === null || (ir087FactionId(value) && value !== factionId)) factionRecords[factionId][kind] = value;
      }
    }
    // A political link must be reciprocal. Invalid or conflicting legacy links are safely cleared.
    for (const kind of ['alliance', 'rivalry']) {
      for (const factionId of IR_V087_FACTIONS) {
        const other = factionRecords[factionId][kind];
        if (other && factionRecords[other]?.[kind] !== factionId) {
          factionRecords[factionId][kind] = null;
          if (factionRecords[other]) factionRecords[other][kind] = null;
        }
      }
    }
  }
  return politics;
}
function ir087NormalizeData(raw, gameState = state) {
  const defaults = ir087DefaultData(gameState);
  if (!ir087Record(raw) || raw.schema !== 1) return defaults;
  const day = Math.max(0, Math.floor(Number(gameState?.character?.daysLived) || 0));
  const npcs = {};
  for (const [npcId, fallback] of Object.entries(defaults.npcs)) npcs[npcId] = ir087NormalizeNpc(raw.npcs?.[npcId], fallback, day);
  return { schema: 1, npcs, politics: ir087NormalizePolitics(raw.politics, defaults.politics) };
}
function ir087EnsureState(gameState = state) {
  if (!gameState?.world?.region || !gameState?.character) return gameState;
  if (ir087TrackedCharacter !== gameState.character) {
    ir087TrackedCharacter = gameState.character;
    ir087PositiveInfluence.clear();
    ir087MultiUnitTrades.clear();
    ir087ProcessedAmbitions.clear();
    ir087AwardedAmbitions.clear();
  }
  gameState.world.v087 = ir087NormalizeData(gameState.world.v087, gameState);
  const currentDay = Math.max(0, Math.floor(Number(gameState.character.daysLived) || 0));
  if (currentDay > 0 && Number(gameState.world.v086?.lastTickDay) >= currentDay) {
    for (const npcId of Object.keys(gameState.world.v087.npcs)) {
      const key = `${currentDay}|${npcId}`;
      ir087ProcessedAmbitions.add(key);
      ir087AwardedAmbitions.add(key);
    }
  }
  return gameState;
}
function ir087ResolveHome(npc, gameState = state) {
  if (!npc || typeof npc.homeSite !== 'string') return null;
  const siteRecord = ir087SettlementCatalog(gameState).get(npc.homeSite);
  if (!siteRecord || typeof irResolveLocationRegion !== 'function') return null;
  const resolved = irResolveLocationRegion(gameState.world, siteRecord);
  return resolved?.ok ? { site: siteRecord, regionId: resolved.regionId } : null;
}
function ir087SeededRandom(seed) {
  let value = 2166136261;
  for (const character of String(seed)) { value ^= character.charCodeAt(0); value = Math.imul(value, 16777619); }
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function ir087SignalKey(day, siteId) { return `${day}|${siteId}`; }
function ir087NoteInfluence(day, siteId) {
  if (!ir087IsInteger(Number(day), 0, Number.MAX_SAFE_INTEGER) || typeof siteId !== 'string') return;
  const normalizedDay = Number(day);
  ir087PositiveInfluence.set(ir087SignalKey(normalizedDay, siteId), true);
  if (Number(state?.world?.v086?.lastTickDay) >= normalizedDay) ir087LateInfluenceAmbition(normalizedDay, siteId);
}
function ir087NoteTrade(day, siteId, units) {
  if (!ir087IsInteger(Number(day), 0, Number.MAX_SAFE_INTEGER) || typeof siteId !== 'string' || !ir087IsInteger(units, 2, 5)) return;
  ir087MultiUnitTrades.set(ir087SignalKey(Number(day), siteId), true);
}
function ir087CurrentEventForRegion(regionId, gameState = state) {
  const event = gameState?.world?.v05?.activeEvent;
  if (!ir087Record(event) || !['warning', 'escalation'].includes(event.stage) || typeof event.id !== 'string' || !event.id) return null;
  const resolved = irResolveLocationRegion?.(gameState.world, event.siteId);
  return resolved?.ok && resolved.regionId === regionId ? event : null;
}
function ir087CleanAndPropagateRumors(day, model) {
  const activeByRegion = new Map();
  const activeEvent = state.world?.v05?.activeEvent;
  const trackedEventId = ir087Record(activeEvent) && ['warning', 'escalation'].includes(activeEvent.stage) && typeof activeEvent.id === 'string'
    ? activeEvent.id
    : null;
  for (const [, siteRecord] of model.settlements) {
    const resolved = irResolveLocationRegion?.(state.world, siteRecord);
    if (resolved?.ok) {
      const event = ir087CurrentEventForRegion(resolved.regionId);
      if (event) activeByRegion.set(resolved.regionId, event);
    }
  }
  const bySettlement = new Map([...model.settlements.keys()].map(siteId => [siteId, []]));
  for (const npc of model.npcs.values()) {
    const record = state.world.v087.npcs[npc.id];
    if (!record) continue;
    record.rumors = record.rumors.filter(rumor => rumor.eventId === trackedEventId);
    const home = ir087ResolveHome(npc);
    if (!home) continue;
    bySettlement.get(home.site.id)?.push(npc);
    const active = activeByRegion.get(home.regionId);
    if (!active) continue;
  }
  for (const [siteId, npcs] of bySettlement) {
    const siteRecord = model.settlements.get(siteId);
    const resolved = siteRecord && irResolveLocationRegion?.(state.world, siteRecord);
    if (!resolved?.ok) continue;
    const event = activeByRegion.get(resolved.regionId);
    if (!event) continue;
    const candidates = [...new Map(npcs.filter(npc => typeof npc.id === 'string' && npc.id.trim()).map(npc => [npc.id, npc])).values()].sort((a, b) => a.id.localeCompare(b.id));
    const random = ir087SeededRandom(`${state.world.seed || 'world'}|v0.8.7-rumor|${day}|${siteId}|${event.id}`);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const npc of candidates.slice(0, 2)) {
      const record = state.world.v087.npcs[npc.id];
      if (!record || record.rumors.some(rumor => rumor.eventId === event.id)) continue;
      record.rumors.push({ eventId: event.id, tickHeard: day });
      if (record.rumors.length > 5) record.rumors.splice(0, record.rumors.length - 5);
    }
  }
}
function ir087AffinityReward(npc) {
  if (!npc?.id || !state?.character) return;
  const relationship = typeof ir06Relationship === 'function'
    ? ir06Relationship(npc)
    : (state.character.relationships[npc.id] ||= { affinity: Number(npc.affinity) || 0, trust: Number(npc.trust) || 0 });
  relationship.affinity = Math.max(-100, Math.min(100, (Number(relationship.affinity) || 0) + 2));
  npc.affinity = relationship.affinity;
  npc.trust = Number(relationship.trust) || 0;
  if (typeof ir0731StoreNPC === 'function') ir0731StoreNPC(npc);
  else if (state.world.v06) {
    state.world.v06.changes ||= {};
    state.world.v06.changes[npc.id] = { ...(state.world.v06.changes[npc.id] || {}), ...npc };
  }
}
function ir087AdvanceAmbition(npc, record, day) {
  if (!npc || !record) return;
  const awardKey = `${day}|${npc.id}`;
  if (ir087AwardedAmbitions.has(awardKey)) return;
  ir087AwardedAmbitions.add(awardKey);
  record.ambitionProgress = Math.min(100, record.ambitionProgress + 5);
  if (record.ambitionProgress >= 100) {
    record.ambitionProgress = 0;
    ir087AffinityReward(npc);
  }
}
function ir087LateInfluenceAmbition(day, siteId) {
  for (const npc of ir087NpcCatalog(state).values()) {
    const record = state.world?.v087?.npcs?.[npc.id];
    const key = `${day}|${npc.id}`;
    if (npc.homeSite === siteId && record?.ambition === 'ambition:influence'
        && ir087ProcessedAmbitions.has(key) && !ir087AwardedAmbitions.has(key)) ir087AdvanceAmbition(npc, record, day);
  }
}
function ir087ProcessAmbitions(day, model) {
  const positiveInfluence = new Set();
  for (const siteRecord of model.settlements.values()) if (ir087PositiveInfluence.get(ir087SignalKey(day, siteRecord.id))) positiveInfluence.add(siteRecord.id);
  const multiUnitTrade = new Set();
  for (const siteRecord of model.settlements.values()) if (ir087MultiUnitTrades.get(ir087SignalKey(day, siteRecord.id))) multiUnitTrade.add(siteRecord.id);
  for (const npc of model.npcs.values()) {
    ir087ProcessedAmbitions.add(`${day}|${npc.id}`);
    const home = ir087ResolveHome(npc);
    if (!home) continue;
    const record = state.world.v087.npcs[npc.id];
    const settlement = state.world.v05?.settlements?.[home.site.id];
    const region = state.world.v086?.regions?.[home.regionId];
    if (!record || !settlement || !region) continue;
    const activeEvent = ir087CurrentEventForRegion(home.regionId);
    let qualifies = false;
    switch (record.ambition) {
      case 'ambition:wealth': qualifies = multiUnitTrade.has(home.site.id); break;
      case 'ambition:security': qualifies = region.threat === 0 && settlement.security > 80; break;
      case 'ambition:influence': qualifies = positiveInfluence.has(home.site.id); break;
      case 'ambition:knowledge': qualifies = (state.world.v086.influence?.[home.site.id]?.['faction:arcanum'] || 0) > 50; break;
      case 'ambition:stability': qualifies = !activeEvent; break;
      default: break;
    }
    if (qualifies) ir087AdvanceAmbition(npc, record, day);
  }
  for (const key of [...ir087PositiveInfluence.keys()]) if (Number(key.split('|', 1)[0]) <= day) ir087PositiveInfluence.delete(key);
  for (const key of [...ir087MultiUnitTrades.keys()]) if (Number(key.split('|', 1)[0]) <= day) ir087MultiUnitTrades.delete(key);
}
function ir087PairPolitically(model, siteId, kind, candidates) {
  const current = state.world.v087.politics[siteId];
  const desired = Object.fromEntries(IR_V087_FACTIONS.map(id => [id, null]));
  const sorted = candidates.slice().sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  for (const [left, right] of sorted) {
    if (desired[left] || desired[right]) continue;
    desired[left] = right;
    desired[right] = left;
  }
  for (const factionId of IR_V087_FACTIONS) current[factionId][kind] = desired[factionId];
}
function ir087PoliticalShifts(day, model) {
  for (const siteId of model.settlements.keys()) {
    const scores = state.world.v086?.influence?.[siteId];
    const politics = state.world.v087.politics[siteId];
    if (!ir087Record(scores) || !ir087Record(politics)) continue;
    const alliancePairs = [], rivalryPairs = [];
    for (let i = 0; i < IR_V087_FACTIONS.length; i++) for (let j = i + 1; j < IR_V087_FACTIONS.length; j++) {
      const left = IR_V087_FACTIONS[i], right = IR_V087_FACTIONS[j];
      const a = scores[left], b = scores[right];
      if (!ir087IsInteger(a, 0, 100) || !ir087IsInteger(b, 0, 100)) continue;
      if (a >= 60 && b >= 60) alliancePairs.push([left, right]);
      if ((a >= 75 && b <= 25) || (b >= 75 && a <= 25)) rivalryPairs.push([left, right]);
    }
    ir087PairPolitically(model, siteId, 'alliance', alliancePairs);
    ir087PairPolitically(model, siteId, 'rivalry', rivalryPairs);
  }
}
function ir087ApplyConsequences(day, model) {
  if (day % 7 !== 0) return;
  for (const [siteId, politics] of Object.entries(state.world.v087.politics)) {
    for (const factionId of IR_V087_FACTIONS) {
      if (politics[factionId]?.rivalry) ir086AdjustInfluence(siteId, factionId, -2, day);
    }
  }
}
function ir087Tick(day, model) {
  ir087CleanAndPropagateRumors(day, model);
  ir087ProcessAmbitions(day, model);
  ir087PoliticalShifts(day, model);
  ir087ApplyConsequences(day, model);
}

const ir087EnsureBase = ir05EnsureState;
ir05EnsureState = function (gameState = state) {
  const result = ir087EnsureBase.apply(this, arguments);
  return ir087EnsureState(result);
};
const ir087MakeInitialBase = makeInitial;
makeInitial = function () { return ir05EnsureState(ir087MakeInitialBase.apply(this, arguments)); };
const ir087NormalizeBase = normalizeSave;
normalizeSave = function (input) {
  const result = ir087NormalizeBase.apply(this, arguments);
  if (result?.world?.region && result?.character) result.world.v087 = ir087NormalizeData(input?.world?.v087, result);
  return result;
};
const ir087EnsureNPCsBase = ir06EnsureNPCs;
ir06EnsureNPCs = function () {
  const result = ir087EnsureNPCsBase.apply(this, arguments);
  ir087EnsureState(state);
  return result;
};

// Capture actual v0.8.6 changes, not accumulated action summaries, for same-day ambition tests.
const ir087AdjustInfluenceBase = ir086AdjustInfluence;
ir086AdjustInfluence = function (siteId, factionId, delta, day) {
  const applied = ir087AdjustInfluenceBase.apply(this, arguments);
  if (applied > 0) ir087NoteInfluence(day ?? state?.character?.daysLived ?? 0, siteId);
  return applied;
};
const ir087DoTradeBase = ir086DoTrade;
ir086DoTrade = function (model, settlement, regionId, day) {
  if (state?.world?.v087?.politics?.[settlement?.id]?.['faction:merchants']?.rivalry) return false;
  const before = { ...(state?.world?.economy?.markets?.[settlement?.id]?.stock || {}) };
  const completed = ir087DoTradeBase.apply(this, arguments);
  if (completed) {
    const market = state?.world?.economy?.markets?.[settlement.id];
    const units = IR_V086_RESOURCE_IDS.reduce((sum, itemId) => sum + Math.abs((Number(market?.stock?.[itemId]) || 0) - (Number(before[itemId]) || 0)), 0);
    ir087NoteTrade(day, settlement.id, units);
  }
  return completed;
};
const ir087EventTransitionBase = ir086EventTransition;
ir086EventTransition = function (kind, event) {
  const resolved = event && irResolveLocationRegion?.(state?.world, event.siteId);
  const siteId = resolved?.ok && resolved.site?.type === 'settlement' ? resolved.site.id : null;
  const before = siteId ? { ...(state.world.v086?.influence?.[siteId] || {}) } : null;
  const result = ir087EventTransitionBase.apply(this, arguments);
  if (kind === 'helped' && siteId && before) {
    const links = state.world.v087?.politics?.[siteId] || {};
    for (const factionId of IR_V087_FACTIONS) {
      const after = state.world.v086?.influence?.[siteId]?.[factionId];
      if (Number.isFinite(after) && after > (Number(before[factionId]) || 0)) {
        const ally = links[factionId]?.alliance;
        if (ally && ir087FactionId(ally)) {
          const bonus = ir087AdjustInfluenceBase.call(this, siteId, ally, 1, ir086ActionContext?.currentDay ?? state.character.daysLived);
          if (bonus > 0) ir087NoteInfluence(ir086ActionContext?.currentDay ?? state.character.daysLived, siteId);
        }
      }
    }
  }
  return result;
};
const ir087DailyTickBase = ir086DailyTick;
ir086DailyTick = function (day) {
  if (!state?.world?.v087) return ir087DailyTickBase.apply(this, arguments);
  const before = {
    v086: JSON.stringify(state.world.v086),
    v087: JSON.stringify(state.world.v087),
    settlements: JSON.stringify(state.world.v05?.settlements || {}),
    markets: JSON.stringify(state.world.economy?.markets || {}),
    relationships: JSON.stringify(state.character.relationships || {}),
    npcs: JSON.stringify(state.character.npcs || []),
    v06: JSON.stringify(state.world.v06 || {}),
    summary: JSON.stringify(state.world.v086?.lastTickSummary ?? null),
    positiveInfluence: new Map(ir087PositiveInfluence),
    multiUnitTrades: new Map(ir087MultiUnitTrades),
    processedAmbitions: new Set(ir087ProcessedAmbitions),
    awardedAmbitions: new Set(ir087AwardedAmbitions)
  };
  try {
    const result = ir087DailyTickBase.apply(this, arguments);
    if (!result) return result;
    const model = { npcs: ir087NpcCatalog(state), settlements: ir087SettlementCatalog(state) };
    ir087Tick(day, model);
    return result;
  } catch (error) {
    state.world.v086 = JSON.parse(before.v086);
    state.world.v087 = JSON.parse(before.v087);
    state.world.v05.settlements = JSON.parse(before.settlements);
    if (state.world.economy) state.world.economy.markets = JSON.parse(before.markets);
    state.character.relationships = JSON.parse(before.relationships);
    state.character.npcs = JSON.parse(before.npcs);
    state.world.v06 = JSON.parse(before.v06);
    const priorSummary = JSON.parse(before.summary);
    state.world.v086.lastTickSummary = priorSummary;
    if (typeof ir086ActionContext !== 'undefined' && ir086ActionContext) ir086ActionContext.summary = priorSummary;
    ir087PositiveInfluence = before.positiveInfluence;
    ir087MultiUnitTrades = before.multiUnitTrades;
    ir087ProcessedAmbitions = before.processedAmbitions;
    ir087AwardedAmbitions = before.awardedAmbitions;
    if (typeof console !== 'undefined' && console.error) console.error('[Infinite Realms v0.8.7] Social/political tick rolled back:', error);
    return false;
  }
};

const ir087PeopleScreenBase = ir06PeopleScreen;
ir06PeopleScreen = function () {
  const html = ir087PeopleScreenBase.apply(this, arguments);
  const model = ir087NpcCatalog(state);
  const currentSite = site?.();
  if (!currentSite || !state?.world?.v087) return html;
  const currentNpcs = [...model.values()].filter(npc => npc.homeSite === currentSite.id && (typeof ir06Present !== 'function' || ir06Present(npc))).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  const cards = currentNpcs.map(npc => {
    const record = state.world.v087.npcs[npc.id];
    if (!record) return '';
    const rumors = record.rumors.map(rumor => {
      const active = state.world.v05?.activeEvent;
      return active?.id === rumor.eventId && ['warning', 'escalation'].includes(active.stage)
        ? `<li>${esc(active.title)} · heard day ${rumor.tickHeard}</li>`
        : '';
    }).filter(Boolean).join('');
    return `<article class="ir087-npc-card"><strong>${esc(npc.name || npc.id)}</strong><span>${esc(IR_V087_AMBITIONS[record.ambition] || record.ambition)} · ${record.ambitionProgress}/100</span>${rumors ? `<small>Current rumors</small><ul>${rumors}</ul>` : '<small>No current event rumors</small>'}</article>`;
  }).join('');
  const panel = `<section class="panel panel-pad ir087-people-panel"><div class="panel-heading"><div><div class="eyebrow">SOCIAL & POLITICAL SIMULATION</div><h2>Local ambitions and rumors</h2><p>Residents pursue their personal ambitions and pass along active regional event rumors.</p></div></div><div class="ir087-people-grid">${cards || '<div class="empty">No local residents have a recorded ambition yet.</div>'}</div></section>`;
  const position = html.indexOf('<div class="grid two">');
  return position >= 0 ? `${html.slice(0, position)}${panel}${html.slice(position)}` : `${html}${panel}`;
};

function ir087PoliticalPanel() {
  const model = ir087SettlementCatalog(state);
  const rows = [...model.values()].sort((a, b) => a.id.localeCompare(b.id)).map(siteRecord => {
    const politics = state.world?.v087?.politics?.[siteRecord.id];
    if (!politics) return '';
    const links = IR_V087_FACTIONS.map(factionId => {
      const record = politics[factionId];
      const alliance = record?.alliance ? (IR_V08_FACTION_DEFINITIONS[record.alliance]?.name || record.alliance) : 'None';
      const rivalry = record?.rivalry ? (IR_V08_FACTION_DEFINITIONS[record.rivalry]?.name || record.rivalry) : 'None';
      return `<span>${esc(IR_V08_FACTION_DEFINITIONS[factionId]?.name || factionId)} · Alliance: <b>${esc(alliance)}</b> · Rivalry: <b>${esc(rivalry)}</b></span>`;
    }).join('');
    return `<article class="ir087-politics-row"><strong>${esc(siteRecord.name || siteRecord.id)}</strong><div>${links}</div></article>`;
  }).join('');
  return `<section class="ir087-politics"><div class="section-label"><div><h3>Faction ties</h3><p>Local alliances and rivalries follow settlement influence.</p></div></div><div class="ir087-politics-grid">${rows}</div></section>`;
}
const ir087SimulationPanelBase = ir086SimulationPanel;
ir086SimulationPanel = function () {
  const html = ir087SimulationPanelBase.apply(this, arguments);
  const marker = '</section>';
  const position = html.lastIndexOf(marker);
  return position >= 0 ? `${html.slice(0, position)}${ir087PoliticalPanel()}${html.slice(position)}` : `${html}${ir087PoliticalPanel()}`;
};
if (typeof document !== 'undefined' && document.head) {
  const style = document.createElement('style');
  style.textContent = `.ir087-people-panel,.ir087-politics{margin:14px 0}.ir087-people-grid,.ir087-politics-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ir087-npc-card,.ir087-politics-row{display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--panel2);font-size:12px}.ir087-npc-card>span,.ir087-npc-card small,.ir087-politics-row>div{color:var(--muted)}.ir087-npc-card ul{margin:0;padding-left:18px}.ir087-politics-row>div{display:flex;flex-direction:column;gap:5px}@media(max-width:760px){.ir087-people-grid,.ir087-politics-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  document.title = 'Infinite Realms — Version 0.8.7';
}
if (typeof globalThis !== 'undefined') {
  globalThis.ir087EnsureState = ir087EnsureState;
  globalThis.ir087ValidateState = function (gameState = state) {
    const errors = [];
    if (!gameState?.world?.v087 || gameState.world.v087.schema !== 1) errors.push('Missing or unsupported v0.8.7 state.');
    else {
      for (const [npcId, record] of Object.entries(gameState.world.v087.npcs || {})) {
        if (!IR_V087_AMBITIONS[record?.ambition]) errors.push(`NPC ${npcId} has an invalid ambition.`);
        if (!ir087IsInteger(record?.ambitionProgress, 0, 100)) errors.push(`NPC ${npcId} has invalid ambition progress.`);
        if (!Array.isArray(record?.rumors) || record.rumors.length > 5 || !record.rumors.every(rumor => ir087Record(rumor) && Object.keys(rumor).length === 2 && typeof rumor.eventId === 'string' && rumor.eventId.trim().length > 0 && ir087IsInteger(rumor.tickHeard, 0, Math.max(0, Number(gameState.character?.daysLived) || 0)))) errors.push(`NPC ${npcId} has invalid rumor data.`);
      }
      for (const siteId of ir087SettlementCatalog(gameState).keys()) {
        const politics = gameState.world.v087.politics?.[siteId];
        for (const factionId of IR_V087_FACTIONS) {
          const record = politics?.[factionId];
          if (!ir087Record(record)) { errors.push(`Settlement ${siteId} is missing politics for ${factionId}.`); continue; }
          for (const kind of ['alliance', 'rivalry']) {
            const other = record[kind];
            if (other !== null && (!ir087FactionId(other) || other === factionId || politics?.[other]?.[kind] !== factionId)) errors.push(`Settlement ${siteId} has a nonreciprocal ${kind} link for ${factionId}.`);
          }
        }
      }
    }
    return { ok: errors.length === 0, errors };
  };
}
