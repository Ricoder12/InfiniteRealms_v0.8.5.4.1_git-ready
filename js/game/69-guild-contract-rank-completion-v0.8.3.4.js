'use strict';
// Infinite Realms v0.8.3.4 — rank-gated guild contract tracking and exact-once completion.

const IR_V0834_CONTRACT_RULES = Object.freeze({ byTemplate: Object.freeze({
  'route-survey': Object.freeze({ status: 'configured', minimumRank: null, maximumRank: null }),
  'monster-signs': Object.freeze({ status: 'configured', minimumRank: 'E', maximumRank: 'SSS' }),
  'supply-ledger': Object.freeze({ status: 'configured', minimumRank: null, maximumRank: null })
}) });
const IR_V0834_CONTRACT_REWARDS = Object.freeze({ 'route-survey': 20, 'monster-signs': 35, 'supply-ledger': 15 });
const IR_V0834_OBJECTIVE_TEXT = Object.freeze({
  'route-survey': 'Traverse the selected canonical connection after acceptance, then report to the issuing receptionist.',
  'monster-signs': 'Win one qualifying outdoor wild, ambush, or hunt encounter against an approved creature at a site adjacent to a settlement.',
  'supply-ledger': 'Report a shortage shown in the saved local market snapshot captured for this contract.'
});
const IR_V0834_MONSTER_IDS = Object.freeze(['goblin','slime','wolf','spider','skeleton','wight','boar','direwolf','ogre','troll']);
const IR_V0834_TEMPLATE_IDS = Object.freeze(['route-survey','monster-signs','supply-ledger']);
const IR_V0834_CONTRACT_STATE_SCHEMA = 2;

function ir0834TemplateFromId(contractId) {
  if (typeof contractId !== 'string') return null;
  const templateId = contractId.slice(contractId.lastIndexOf(':') + 1);
  return IR_V0834_TEMPLATE_IDS.includes(templateId) ? templateId : null;
}
function ir0834ContractId(guildId, templateId) { return `guild-contract:${guildId}:${templateId}`; }
function ir0834Clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; } }
function ir0834NowDay(character = state?.character) { return Math.max(0, Math.floor(Number(character?.daysLived) || 0)); }
function ir0834IsObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function ir0834CurrentRank(character = state?.character) {
  if (character?.adventurerProgressionIntegrity?.status === 'quarantined') return null;
  const rank = character?.adventurerProgression?.currentRank;
  return typeof ir0832RankIndex === 'function' && ir0832RankIndex(rank) >= 0 ? rank : null;
}
function ir0834RankAccess(templateId, character = state?.character) {
  const rank = ir0834CurrentRank(character);
  if (!rank) return { eligible: false, status: 'unresolved', reason: character?.adventurerProgressionIntegrity?.reason || 'Personal rank is missing, invalid, or quarantined.' };
  const result = ir0832ContractRankEligibility(ir0834ContractId('eligibility', templateId), rank, IR_V0834_CONTRACT_RULES);
  if (!result.eligible) return { ...result, reason: result.status === 'ineligible' ? `Requires rank ${result.minimumRank}${result.maximumRank ? ` through ${result.maximumRank}` : ' or higher'}.` : 'Rank eligibility could not be resolved.' };
  return { ...result, reason: `Rank ${rank} meets this contract's requirement.` };
}
function ir0834RewardAmount(templateId) { return Number(IR_V0834_CONTRACT_REWARDS[templateId]) || 0; }

function ir0834MarketSnapshot(siteId, market = state?.world?.economy?.markets?.[siteId]) {
  if (!siteId || !ir0834IsObject(market) || !ir0834IsObject(market.stock) || (market.siteId && market.siteId !== siteId)) return { ok: false, reason: 'No saved market stock record exists at this guild location. Visit the local market first; no stock record will be generated for this contract.' };
  const entries = [];
  for (const [itemId, data] of Object.entries(IR_V04_ITEM_DATA || {})) {
    const normalStock = Number(data?.stock);
    if (!ITEMS?.[itemId] || !Number.isSafeInteger(normalStock) || normalStock <= 0 || !Object.prototype.hasOwnProperty.call(market.stock, itemId)) continue;
    const actualStock = Number(market.stock[itemId]);
    if (!Number.isSafeInteger(actualStock) || actualStock < 0) continue;
    entries.push({ itemId, actualStock, normalStock });
  }
  if (!entries.length) return { ok: false, reason: 'The saved market record has no valid catalog stock to review.' };
  const shortages = entries.filter(entry => entry.actualStock < entry.normalStock);
  if (!shortages.length) return { ok: false, reason: 'No eligible stock shortage exists in the current market record.' };
  return { ok: true, siteId, snapshot: entries, capturedDay: ir0834NowDay(), capturedAt: typeof dateLabel === 'function' ? dateLabel() : 'Unknown date' };
}
function ir0834RouteOptions(siteId) {
  const source = irSiteById(siteId);
  if (!source || typeof ir0775ConnectionsFrom !== 'function' || typeof ir0775Connection !== 'function') return [];
  const options = [];
  for (const edge of ir0775ConnectionsFrom(siteId) || []) {
    const target = irSiteById(edge.to);
    const canonical = target && ir0775Connection(source.id, target.id);
    if (!canonical || typeof canonical.geoId !== 'string' || !canonical.geoId || !Number.isFinite(Number(canonical.distanceKm)) || Number(canonical.distanceKm) <= 0) continue;
    options.push({ routeId: canonical.geoId, fromSiteId: source.id, toSiteId: target.id, target, distanceKm: Number(canonical.distanceKm) });
  }
  return options;
}
function ir0834ValidShortageSnapshot(objective) {
  if (!Array.isArray(objective?.snapshot) || !objective.snapshot.length) return [];
  return objective.snapshot.filter(row => row && ITEMS?.[row.itemId] && IR_V04_ITEM_DATA?.[row.itemId]
    && Number.isSafeInteger(row.actualStock) && row.actualStock >= 0
    && Number.isSafeInteger(row.normalStock) && row.normalStock > 0
    && Number(IR_V04_ITEM_DATA[row.itemId].stock) === row.normalStock
    && row.actualStock < row.normalStock);
}
function ir0834MakeObjective(templateId, options = {}) {
  if (templateId === 'route-survey') return {
    type: templateId, status: options.route ? 'tracking' : 'awaiting-route-selection',
    routeId: options.route?.routeId || null, fromSiteId: options.route?.fromSiteId || null,
    toSiteId: options.route?.toSiteId || null, traversed: false, travelEventIds: []
  };
  if (templateId === 'monster-signs') return { type: templateId, status: 'tracking', qualifyingEventId: null, enemyId: null, siteId: null };
  if (templateId === 'supply-ledger') return {
    type: templateId, status: options.market?.ok ? 'tracking' : 'awaiting-market-snapshot',
    siteId: options.market?.siteId || options.siteId || null,
    snapshot: options.market?.snapshot || null, capturedDay: options.market?.capturedDay ?? null,
    capturedAt: options.market?.capturedAt || null, reportedItemId: null
  };
  return null;
}
function ir0834ContractStateValid(character, organizations = state?.world?.organizations) {
  const value = character?.guildContractState;
  if (value == null) return { ok: true, errors: [] };
  const errors = [];
  if (!ir0834IsObject(value) || value.schema !== IR_V0834_CONTRACT_STATE_SCHEMA || !Array.isArray(value.accepted)
    || !Number.isSafeInteger(value.nextInstanceSequence) || value.nextInstanceSequence < 1
    || !Number.isSafeInteger(value.nextEventSequence) || value.nextEventSequence < 1) return { ok: false, errors: ['Malformed guild contract state'] };
  const guildIds = new Set((Array.isArray(organizations) ? organizations : []).filter(row => row?.organizationType === 'adventurers-guild').map(row => row.id));
  if (value.accepted.length && !Array.isArray(organizations)) errors.push('Guild registry is unavailable for saved contract references');
  const seenContractIds = new Set(), seenInstanceIds = new Set();
  for (const record of value.accepted) {
    if (!ir0834IsObject(record) || typeof record.guildId !== 'string' || typeof record.contractId !== 'string'
      || typeof record.instanceId !== 'string' || !record.instanceId || typeof record.templateId !== 'string') { errors.push('Malformed guild contract instance'); continue; }
    const template = ir0834TemplateFromId(record.contractId);
    if (!IR_V0834_TEMPLATE_IDS.includes(record.templateId) || template !== record.templateId || record.contractId !== ir0834ContractId(record.guildId, record.templateId)) errors.push(`Invalid contract identifier ${record.contractId}`);
    if (seenContractIds.has(record.contractId)) errors.push(`Duplicate contract ${record.contractId}`);
    if (seenInstanceIds.has(record.instanceId)) errors.push(`Duplicate contract instance ${record.instanceId}`);
    seenContractIds.add(record.contractId); seenInstanceIds.add(record.instanceId);
    if (!guildIds.has(record.guildId)) errors.push(`Contract ${record.contractId} references an unknown guild`);
    if (!['active', 'completed'].includes(record.status)) errors.push(`Invalid lifecycle status for ${record.contractId}`);
    if (!ir0834IsObject(record.objective) || record.objective.type !== record.templateId) errors.push(`Invalid objective for ${record.contractId}`);
    if (record.status === 'active' && (record.rewardTransactionId != null || record.rewardAmount != null)) errors.push(`Active contract ${record.contractId} has a reward transaction`);
    if (record.status === 'completed' && (record.rewardTransactionId !== `guild-contract-reward:${record.instanceId}` || record.rewardAmount !== ir0834RewardAmount(record.templateId) || record.rewardDelivered !== true)) errors.push(`Completed contract ${record.contractId} has an invalid reward receipt`);
    if (record.templateId === 'route-survey' && record.objective) {
      const objective = record.objective;
      if (!['tracking', 'awaiting-route-selection', 'verified'].includes(objective.status)) errors.push(`Invalid route objective status for ${record.contractId}`);
      if (objective.status !== 'awaiting-route-selection' && (!objective.routeId || !objective.fromSiteId || !objective.toSiteId)) errors.push(`Incomplete selected route for ${record.contractId}`);
      if (objective.traversed !== (objective.status === 'verified')) errors.push(`Contradictory route progress for ${record.contractId}`);
      if (!Array.isArray(objective.travelEventIds)) errors.push(`Invalid route event ledger for ${record.contractId}`);
    }
    if (record.templateId === 'monster-signs' && record.objective) {
      const objective = record.objective;
      if (!['tracking', 'verified'].includes(objective.status)) errors.push(`Invalid monster objective status for ${record.contractId}`);
      if (objective.status === 'verified' && (!objective.qualifyingEventId || !IR_V0834_MONSTER_IDS.includes(objective.enemyId) || !objective.siteId)) errors.push(`Incomplete monster evidence for ${record.contractId}`);
    }
    if (record.templateId === 'supply-ledger' && record.objective) {
      const objective = record.objective;
      if (!['tracking', 'awaiting-market-snapshot', 'verified'].includes(objective.status)) errors.push(`Invalid ledger objective status for ${record.contractId}`);
      if (objective.status !== 'awaiting-market-snapshot' && (!objective.siteId || !Array.isArray(objective.snapshot))) errors.push(`Missing market snapshot for ${record.contractId}`);
      if (objective.status === 'verified' && !ir0834ValidShortageSnapshot(objective).some(row => row.itemId === objective.reportedItemId)) errors.push(`Invalid ledger report for ${record.contractId}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
function ir0834Quarantine(character, reason) {
  character.guildContractIntegrity = { status: 'quarantined', reason: String(reason || 'Invalid guild contract state') };
  return null;
}
function ir0834CreateState() {
  return { schema: IR_V0834_CONTRACT_STATE_SCHEMA, accepted: [], nextInstanceSequence: 1, nextEventSequence: 1 };
}
function ir0834GetState(character = state?.character, create = false) {
  if (!character || character.guildContractIntegrity?.status === 'quarantined') return null;
  if (character.guildContractState == null) {
    if (!create) return null;
    character.guildContractState = ir0834CreateState();
  }
  const report = ir0834ContractStateValid(character);
  if (!report.ok) return ir0834Quarantine(character, report.errors.join('; '));
  return character.guildContractState;
}
function ir0834LegacyRecordValid(record, guildIds) {
  if (!ir0834IsObject(record) || typeof record.guildId !== 'string' || typeof record.contractId !== 'string' || record.status !== 'accepted') return false;
  const templateId = ir0834TemplateFromId(record.contractId);
  return !!templateId && record.contractId === ir0834ContractId(record.guildId, templateId) && guildIds.has(record.guildId);
}
function ir0834MigrateContractState(saved) {
  const character = saved?.character, old = character?.guildContractState;
  if (!character || old == null || character.guildContractIntegrity?.status === 'quarantined') return saved;
  const organizations = saved.world?.organizations || [];
  const guildIds = new Set(organizations.filter(row => row?.organizationType === 'adventurers-guild').map(row => row.id));
  if (old.schema === IR_V0834_CONTRACT_STATE_SCHEMA) {
    const report = ir0834ContractStateValid(character, organizations);
    if (!report.ok) ir0834Quarantine(character, report.errors.join('; '));
    else character.guildContractIntegrity = { status: 'ready', reason: null };
    return saved;
  }
  if (old.schema !== 1 || !Array.isArray(old.accepted) || (old.accepted.length && !Array.isArray(organizations)) || old.accepted.some(record => !ir0834LegacyRecordValid(record, guildIds))
    || new Set(old.accepted.map(record => record.contractId)).size !== old.accepted.length) {
    ir0834Quarantine(character, 'Legacy guild contract state is malformed or references an unknown contract or guild. Original data was preserved.');
    return saved;
  }
  let sequence = 1;
  const accepted = old.accepted.map(record => {
    const templateId = ir0834TemplateFromId(record.contractId);
    const issuer = ir0822GuildSite(saved.world, organizations.find(row => row?.id === record.guildId));
    const market = templateId === 'supply-ledger' && issuer ? ir0834MarketSnapshot(issuer.id) : null;
    const objective = ir0834MakeObjective(templateId, { siteId: issuer?.id, market: market?.ok ? market : null });
    return { ...record, templateId, instanceId: `guild-contract-instance:${record.contractId}:legacy-${sequence++}`,
      status: 'active', acceptedDay: ir0834NowDay(character), trackingStartedDay: ir0834NowDay(character),
      objective, rewardTransactionId: null, rewardAmount: null };
  });
  character.guildContractState = { ...old, schema: IR_V0834_CONTRACT_STATE_SCHEMA, accepted,
    nextInstanceSequence: sequence, nextEventSequence: 1 };
  character.guildContractIntegrity = { status: 'ready', reason: null };
  const report = ir0834ContractStateValid(character, organizations);
  if (!report.ok) ir0834Quarantine(character, report.errors.join('; '));
  return saved;
}

const ir0834ContractValidatorBase = ir0824ContractStateValid;
ir0824ContractStateValid = ir0834ContractStateValid;
ir0824GetAcceptedContractState = function (character) { return ir0834GetState(character, true); };
ir0824GuildOffers = function (organization) {
  if (!organization || organization.organizationType !== 'adventurers-guild' || typeof organization.id !== 'string') return [];
  const records = state?.character?.guildContractState?.accepted;
  const byId = new Map((Array.isArray(records) ? records : []).filter(row => row?.contractId).map(row => [row.contractId, row]));
  return IR_V0824_GUILD_OFFER_TEMPLATES.map(template => {
    const id = ir0834ContractId(organization.id, template.key), record = byId.get(id);
    return { id, guildId: organization.id, templateId: template.key, title: template.title, description: template.description,
      category: template.category, requirements: ['Active Adventurers’ Guild membership', 'Configured personal rank'], objective: template.objective,
      availability: record ? (record.status === 'completed' ? 'completed' : 'accepted') : 'available', acceptance: record || null };
  });
};

const ir0834NormalizeSaveBase = normalizeSave;
normalizeSave = function (input) { return ir0834MigrateContractState(ir0834NormalizeSaveBase.apply(this, arguments)); };

function ir0834ContractService(npcId) {
  const npc = ir072RequireNPC(npcId);
  if (!npc || npc.guildServiceRole !== 'receptionist' || !IR_V0822_GUILD_SERVICE_ROLES.includes(npc.guildServiceRole)) return { error: 'Guild contracts are available through the issuing guild receptionist.' };
  const organization = state?.world?.organizations?.find(row => row?.id === npc.organizationId && row?.organizationType === 'adventurers-guild');
  const guildSite = ir0822GuildSite(state?.world, organization);
  if (!organization || !guildSite || guildSite.id !== site()?.id || !ir072IsPresent(npc)) return { error: 'The issuing guild receptionist is unavailable at this location.' };
  return { npc, organization, guildSite };
}
function ir0834MonsterSiteQualifies(siteId) {
  const location = irSiteById(siteId);
  if (!location || location.type === 'settlement' || typeof ir0775ConnectionsFrom !== 'function') return false;
  return (ir0775ConnectionsFrom(location.id) || []).some(edge => irSiteById(edge.to)?.type === 'settlement' && ir0775Connection(location.id, edge.to));
}
function ir0834CurrentInstanceId(stateRecord, contractId) {
  return stateRecord.accepted.find(record => record.contractId === contractId) || null;
}
function ir0834AcceptReason(templateId, service, selectedRouteId = null) {
  if (!ir0825GuildMembership(state?.character, service.organization)) return 'Active Adventurers’ Guild membership is required.';
  const rank = ir0834RankAccess(templateId);
  if (!rank.eligible) return rank.reason;
  if (state.combat?.active) return 'Finish combat before accepting a contract.';
  if (state.pendingEvent) return 'Resolve the pending event before accepting a contract.';
  if (templateId === 'route-survey' && !ir0834RouteOptions(service.guildSite.id).some(option => option.routeId === selectedRouteId)) return 'Select a currently valid route directly connected to this guild.';
  if (templateId === 'monster-signs' && IR_V0834_MONSTER_IDS.some(id => !IR_ENEMIES?.[id])) return 'The approved creature list cannot be resolved in this game build.';
  if (templateId === 'supply-ledger') {
    if (!service.guildSite.services?.includes('market') && service.guildSite.type !== 'settlement') return 'This guild location has no local market service.';
    const market = ir0834MarketSnapshot(service.guildSite.id);
    if (!market.ok) return market.reason;
  }
  return '';
}
function ir0834AtomicSave(mutator) {
  const before = ir0834Clone(state);
  if (!before) return { ok: false, reason: 'The current save could not be snapshotted.' };
  try { mutator(); } catch (error) { state = before; return { ok: false, reason: error?.message || 'The contract operation failed.' }; }
  if (persist()) return { ok: true };
  state = before;
  return { ok: false, reason: 'The change could not be saved. No contract or reward change was kept.' };
}
function ir0834AcceptContract(target) {
  const service = ir0834ContractService(target?.dataset?.npc);
  if (service.error) { toast(service.error); return true; }
  if (target.dataset.guild !== service.organization.id) { toast('That offer belongs to a different guild.'); return true; }
  const templateId = target.dataset.template;
  const offer = IR_V0824_GUILD_OFFER_TEMPLATES.find(row => row.key === templateId);
  if (!offer || target.dataset.contract !== ir0834ContractId(service.organization.id, templateId)) { toast('That contract offer is not available from this guild.'); return true; }
  const reason = ir0834AcceptReason(templateId, service, target.dataset.route);
  if (reason) { toast(reason); render(); return true; }
  const contractState = ir0834GetState(state.character, true);
  if (!contractState) { toast(state.character.guildContractIntegrity?.reason || 'Saved contract data is unavailable and was preserved.'); return true; }
  if (ir0834CurrentInstanceId(contractState, offer.id && ir0834ContractId(service.organization.id, templateId))) { toast('This guild contract has already been accepted or completed.'); return true; }
  const options = templateId === 'route-survey' ? ir0834RouteOptions(service.guildSite.id) : [];
  const route = templateId === 'route-survey' ? options.find(row => row.routeId === target.dataset.route) : null;
  const market = templateId === 'supply-ledger' ? ir0834MarketSnapshot(service.guildSite.id) : null;
  if (templateId === 'supply-ledger' && !market?.ok) { toast(market?.reason || 'The market snapshot could not be verified.'); return true; }
  const id = ir0834ContractId(service.organization.id, templateId);
  const instanceId = `guild-contract-instance:${service.organization.id}:${templateId}:${contractState.nextInstanceSequence}`;
  const objective = ir0834MakeObjective(templateId, { route, market });
  const acceptedAt = typeof dateLabel === 'function' ? dateLabel() : 'Unknown date';
  const save = ir0834AtomicSave(() => {
    contractState.nextInstanceSequence++;
    contractState.accepted.push({ contractId: id, guildId: service.organization.id, templateId, instanceId, status: 'active', acceptedAt,
      acceptedDay: ir0834NowDay(), trackingStartedDay: ir0834NowDay(), objective, rewardTransactionId: null, rewardAmount: null });
    if (!ir0834ContractStateValid(state.character)) throw new Error('The accepted contract record did not pass validation.');
  });
  if (!save.ok) { toast(save.reason); return true; }
  modal = { kind: 'ir0824-guild-contract-board', guildId: service.organization.id, npcId: service.npc.id };
  render(); toast(`Accepted: ${offer.title}. Objective tracking begins now.`); return true;
}
function ir0834FinishContract(record, reportData = {}) {
  const service = ir0834ContractService(reportData.npcId);
  if (service.error) { toast(service.error); return true; }
  if (service.organization.id !== record.guildId || site()?.id !== service.guildSite.id) { toast('Return to the issuing guild receptionist to submit this report.'); return true; }
  if (!ir0825GuildMembership(state.character, service.organization)) { toast('Active Adventurers’ Guild membership is required to submit this contract.'); return true; }
  if (record.status !== 'active') { toast('This contract is already complete or unavailable.'); return true; }
  if (record.templateId === 'supply-ledger') {
    const shortage = ir0834ValidShortageSnapshot(record.objective).find(row => row.itemId === reportData.itemId);
    if (!shortage || record.objective.siteId !== service.guildSite.id) { toast('The selected item is not a verified shortage in this contract snapshot.'); return true; }
  } else if (record.objective.status !== 'verified') { toast('The required objective has not been verified yet.'); return true; }
  const amount = ir0834RewardAmount(record.templateId), rewardTransactionId = `guild-contract-reward:${record.instanceId}`;
  if (record.rewardTransactionId || state.character.guildContractState.accepted.some(item => item.rewardTransactionId === rewardTransactionId)) { toast('This contract reward has already been recorded.'); return true; }
  const save = ir0834AtomicSave(() => {
    if (record.templateId === 'supply-ledger') { record.objective.reportedItemId = reportData.itemId; record.objective.status = 'verified'; }
    record.status = 'completed'; record.completedAt = typeof dateLabel === 'function' ? dateLabel() : 'Unknown date'; record.completedDay = ir0834NowDay();
    record.rewardTransactionId = rewardTransactionId; record.rewardAmount = amount; record.rewardDelivered = true;
    state.character.coin = Math.max(0, Math.floor(Number(state.character.coin) || 0)) + amount;
    addFeed('📜', `${IR_V0824_GUILD_OFFER_TEMPLATES.find(row => row.key === record.templateId)?.title || 'Guild contract'} completed`, `The issuing guild paid ${coins(amount)}. This reward was recorded with the completed contract.`, 'milestone');
    if (!ir0834ContractStateValid(state.character)) throw new Error('The completion record did not pass validation.');
  });
  if (!save.ok) { toast(save.reason); return true; }
  modal = { kind: 'ir0824-guild-contract-board', guildId: service.organization.id, npcId: service.npc.id };
  render(); toast(`Contract complete. You received ${coins(amount)}.`); return true;
}
function ir0834ReportMonster(target) {
  const service = ir0834ContractService(target?.dataset?.npc); if (service.error) { toast(service.error); return true; }
  const contractState = ir0834GetState(state.character); const record = contractState?.accepted.find(row => row.instanceId === target.dataset.instance);
  if (!record || record.guildId !== service.organization.id || record.templateId !== 'monster-signs') { toast('That contract report could not be resolved.'); return true; }
  return ir0834FinishContract(record, { npcId: service.npc.id });
}
function ir0834ReportRoute(target) {
  const service = ir0834ContractService(target?.dataset?.npc); if (service.error) { toast(service.error); return true; }
  const contractState = ir0834GetState(state.character); const record = contractState?.accepted.find(row => row.instanceId === target.dataset.instance);
  if (!record || record.guildId !== service.organization.id || record.templateId !== 'route-survey') { toast('That contract report could not be resolved.'); return true; }
  return ir0834FinishContract(record, { npcId: service.npc.id });
}
function ir0834ReportShortage(target) {
  const service = ir0834ContractService(target?.dataset?.npc); if (service.error) { toast(service.error); return true; }
  const contractState = ir0834GetState(state.character); const record = contractState?.accepted.find(row => row.instanceId === target.dataset.instance);
  if (!record || record.guildId !== service.organization.id || record.templateId !== 'supply-ledger') { toast('That contract report could not be resolved.'); return true; }
  const itemId = target.dataset.item;
  const shortage = ir0834ValidShortageSnapshot(record.objective).find(row => row.itemId === itemId);
  if (!shortage || record.objective.siteId !== service.guildSite.id) { toast('The selected item is not a verified shortage in this contract snapshot.'); return true; }
  return ir0834FinishContract(record, { npcId: service.npc.id, itemId });
}
function ir0834SetupLegacyRoute(target) {
  const service = ir0834ContractService(target?.dataset?.npc); if (service.error) { toast(service.error); return true; }
  const contractState = ir0834GetState(state.character); const record = contractState?.accepted.find(row => row.instanceId === target.dataset.instance);
  if (!record || record.guildId !== service.organization.id || record.templateId !== 'route-survey' || record.objective.status !== 'awaiting-route-selection') { toast('That contract cannot accept a route selection.'); return true; }
  const route = ir0834RouteOptions(service.guildSite.id).find(option => option.routeId === target.dataset.route);
  if (!route) { toast('That route is no longer a valid connection from the issuing guild.'); return true; }
  const before = ir0834Clone(state);
  record.objective = ir0834MakeObjective('route-survey', { route });
  if (!persist()) { state = before; toast('Route selection could not be saved.'); return true; }
  render(); toast('Survey route recorded. Only travel completed from now on will count.'); return true;
}
function ir0834SetupLegacyMarket(target) {
  const service = ir0834ContractService(target?.dataset?.npc); if (service.error) { toast(service.error); return true; }
  const contractState = ir0834GetState(state.character); const record = contractState?.accepted.find(row => row.instanceId === target.dataset.instance);
  if (!record || record.guildId !== service.organization.id || record.templateId !== 'supply-ledger' || record.objective.status !== 'awaiting-market-snapshot') { toast('That contract cannot capture a market snapshot.'); return true; }
  const market = ir0834MarketSnapshot(service.guildSite.id); if (!market.ok) { toast(market.reason); return true; }
  const before = ir0834Clone(state); record.objective = ir0834MakeObjective('supply-ledger', { siteId: service.guildSite.id, market });
  if (!persist()) { state = before; toast('Market snapshot could not be saved.'); return true; }
  render(); toast('Saved market snapshot recorded. Review a shortage to complete the ledger.'); return true;
}

function ir0834OfferMarkup(organization, npc, template, record, joined, rankResult, servicePresent) {
  const title = esc(template.title), description = esc(template.description), objectiveText = esc(IR_V0834_OBJECTIVE_TEXT[template.key] || template.objective), id = ir0834ContractId(organization.id, template.key);
  if (record?.status === 'completed') return `<article class="ir072-action-card"><div class="ir072-action-copy"><strong>${title} <span class="tag">COMPLETED</span></strong><p>${description}</p><p>Reward paid once: ${record.rewardAmount} coins · ${esc(record.completedAt || 'date unavailable')}</p></div></article>`;
  if (record) {
    const objective = record.objective; let detail = '', actions = '';
    if (template.key === 'route-survey') {
      if (objective.status === 'awaiting-route-selection') {
        const options = ir0834RouteOptions(ir0822GuildSite(state.world, organization)?.id);
        detail = 'This accepted legacy contract has no recorded survey route. Select a valid route at the issuing guild; no earlier travel will count.';
        actions = options.map(route => `<button class="button small" data-action="ir0834-setup-route" data-npc="${esc(npc.id)}" data-instance="${esc(record.instanceId)}" data-route="${esc(route.routeId)}">Select · ${esc(typeof ir0775SafeRouteLabel === 'function' ? ir0775SafeRouteLabel(route.target, 'Uncharted location') : 'Connected route')} (${esc(route.routeId)})</button>`).join('') || '<small>No valid connected route is available.</small>';
      } else {
        const target = irSiteById(objective.toSiteId); detail = `Selected route ${esc(objective.routeId)} · ${esc(typeof ir0775SafeRouteLabel === 'function' ? ir0775SafeRouteLabel(target, 'Uncharted location') : target?.name || 'Uncharted location')} · ${objective.traversed ? 'traversed; report ready' : 'awaiting actual travel'}.`;
        if (objective.traversed) actions = `<button class="button small primary" data-action="ir0834-report-route" data-npc="${esc(npc.id)}" data-instance="${esc(record.instanceId)}">Submit survey report</button>`;
      }
    } else if (template.key === 'monster-signs') {
      detail = objective.status === 'verified' ? `Verified ${esc(IR_ENEMIES[objective.enemyId]?.name || objective.enemyId)} threat at ${esc(irSiteById(objective.siteId)?.name || 'recorded site')}. Report this finding at the issuing guild.` : 'No qualifying post-acceptance outdoor creature victory is recorded yet.';
      if (objective.status === 'verified') actions = `<button class="button small primary" data-action="ir0834-report-monster" data-npc="${esc(npc.id)}" data-instance="${esc(record.instanceId)}">Report threat</button>`;
    } else {
      if (objective.status === 'awaiting-market-snapshot') {
        detail = 'This legacy contract has no saved acceptance-time stock snapshot. A current saved market snapshot can be captured at the issuing guild only when a real shortage exists.';
        const market = ir0834MarketSnapshot(ir0822GuildSite(state.world, organization)?.id);
        if (market.ok) actions = `<button class="button small" data-action="ir0834-setup-market" data-npc="${esc(npc.id)}" data-instance="${esc(record.instanceId)}">Capture current ledger snapshot</button>`;
        else detail += ` ${esc(market.reason)}`;
      } else {
        const shortages = ir0834ValidShortageSnapshot(objective);
        detail = shortages.length ? shortages.map(row => `${esc(ITEMS[row.itemId].name)}: stock ${row.actualStock}, normal ${row.normalStock}`).join(' · ') : 'The saved snapshot contains no reportable shortage.';
        actions = shortages.map(row => `<button class="button small primary" data-action="ir0834-report-shortage" data-npc="${esc(npc.id)}" data-instance="${esc(record.instanceId)}" data-item="${esc(row.itemId)}">Report ${esc(ITEMS[row.itemId].name)}</button>`).join('');
      }
    }
    return `<article class="ir072-action-card"><div class="ir072-action-copy"><strong>${title} <span class="tag gold">ACTIVE</span></strong><p>${description}</p><p>${detail}</p></div><div class="ir072-action-grid">${actions}</div></article>`;
  }
  const reason = !servicePresent ? 'Receptionist is not available.' : !joined ? 'Active Adventurers’ Guild membership is required.' : !rankResult.eligible ? rankResult.reason : '';
  let options = '';
  if (!reason && template.key === 'route-survey') {
    const routes = ir0834RouteOptions(ir0822GuildSite(state.world, organization)?.id);
    options = routes.map(route => `<button class="button small primary" data-action="ir0834-accept-contract" data-npc="${esc(npc.id)}" data-guild="${esc(organization.id)}" data-contract="${esc(id)}" data-template="${esc(template.key)}" data-route="${esc(route.routeId)}">Accept · ${esc(typeof ir0775SafeRouteLabel === 'function' ? ir0775SafeRouteLabel(route.target, 'Uncharted location') : 'Connected route')}</button>`).join('') || '<small>No valid connected route is available.</small>';
  } else if (!reason && template.key === 'supply-ledger') {
    const market = ir0834MarketSnapshot(ir0822GuildSite(state.world, organization)?.id);
    options = market.ok ? `<button class="button small primary" data-action="ir0834-accept-contract" data-npc="${esc(npc.id)}" data-guild="${esc(organization.id)}" data-contract="${esc(id)}" data-template="${esc(template.key)}">Accept · snapshot current market stock</button>` : `<small>${esc(market.reason)}</small>`;
  } else if (!reason) options = `<button class="button small primary" data-action="ir0834-accept-contract" data-npc="${esc(npc.id)}" data-guild="${esc(organization.id)}" data-contract="${esc(id)}" data-template="${esc(template.key)}">Accept contract</button>`;
  return `<article class="ir072-action-card"><div class="ir072-action-copy"><strong>${title} <span class="tag blue">AVAILABLE</span></strong><p>${description}</p><p><strong>Rank:</strong> ${esc(rankResult.reason)} · <strong>Reward on verified report:</strong> ${ir0834RewardAmount(template.key)} coins</p><p><strong>Objective:</strong> ${objectiveText}</p>${reason ? `<small>${esc(reason)}</small>` : ''}</div><div class="ir072-action-grid">${options}</div></article>`;
}
ir0824GuildContractBoardModal = function () {
  if (modal?.kind !== 'ir0824-guild-contract-board') return null;
  const service = ir0834ContractService(modal.npcId);
  const organization = state?.world?.organizations?.find(row => row?.id === modal.guildId && row?.organizationType === 'adventurers-guild');
  const guildSite = ir0822GuildSite(state?.world, organization);
  if (service.error || !organization || !guildSite || service.organization.id !== organization.id) return `<div class="overlay"><section class="modal" role="dialog" aria-modal="true"><h2>Board unavailable</h2><p>${esc(service.error || 'The issuing guild cannot be resolved.')}</p><button class="button" data-action="ir072-close">Close</button></section></div>`;
  const valid = ir0834GetState(state.character, false);
  if (state.character.guildContractState != null && !valid) return `<div class="overlay"><section class="modal" role="dialog" aria-modal="true"><h2>Contract records unavailable</h2><p>${esc(state.character.guildContractIntegrity?.reason || 'Saved contract data was preserved and is quarantined.')}</p><button class="button" data-action="ir072-close">Close</button></section></div>`;
  const stateRecord = valid || { accepted: [] }, joined = ir0825GuildMembership(state.character, organization);
  const rankSummary = ir0834CurrentRank() || 'Unavailable';
  const content = IR_V0824_GUILD_OFFER_TEMPLATES.map(template => {
    const rank = ir0834RankAccess(template.key), record = ir0834CurrentInstanceId(stateRecord, ir0834ContractId(organization.id, template.key));
    return ir0834OfferMarkup(organization, service.npc, template, record, joined, rank, true);
  }).join('');
  const noAvailable = stateRecord.accepted.filter(row => row.guildId === organization.id).length >= IR_V0824_GUILD_OFFER_TEMPLATES.length;
  const standingText = ir0825GuildStandingLabel(state.character, organization);
  return `<div class="overlay"><section class="modal ir072-modal" role="dialog" aria-modal="true" aria-label="${esc(organization.name)} guild contract board"><div class="modal-header"><div><div class="eyebrow">GUILD CONTRACT BOARD · V0.8.3.4</div><h2>${esc(organization.name)}</h2><p>${esc(guildSite.name)} · Personal rank ${esc(rankSummary)} · Issued by this guild only</p></div><button class="close-btn" data-action="ir072-close">×</button></div><div class="notice">${esc(standingText)}. Guild standing is shown from the shared faction record; this release has no standing threshold beyond the existing membership requirement. Active Adventurers’ Guild membership and the character’s saved personal rank are checked when accepting offers. Rank access is evaluated by the shared rank eligibility service. Contract rewards are paid only after verified objectives are reported here.</div>${!joined ? '<div class="notice">Join the Adventurers’ Guild to accept and submit contracts.</div>' : ''}<div class="ir072-action-grid">${content}</div>${noAvailable ? '<div class="empty">No new contracts remain for this guild. Completed contracts stay in your history.</div>' : ''}<div class="modal-actions"><button class="button" data-action="ir0824-return-guild" data-npc="${esc(service.npc.id)}">Back to guild services</button><button class="button subtle" data-action="ir072-close">Close</button></div></section></div>`;
};

const ir0834ContractActionBase = ir072Action;
ir072Action = function (target) {
  const action = target?.dataset?.action;
  if (action === 'ir0834-accept-contract' || action === 'ir0824-accept-contract') return ir0834AcceptContract(target);
  if (action === 'ir0834-report-monster') return ir0834ReportMonster(target);
  if (action === 'ir0834-report-route') return ir0834ReportRoute(target);
  if (action === 'ir0834-report-shortage') return ir0834ReportShortage(target);
  if (action === 'ir0834-setup-route') return ir0834SetupLegacyRoute(target);
  if (action === 'ir0834-setup-market') return ir0834SetupLegacyMarket(target);
  if (action === 'ir0824-open-contract-board') {
    const service = ir0834ContractService(target?.dataset?.npc);
    if (service.error) { toast(service.error); return true; }
    modal = { kind: 'ir0824-guild-contract-board', guildId: service.organization.id, npcId: service.npc.id }; render(); return true;
  }
  return ir0834ContractActionBase.apply(this, arguments);
};

function ir0834RecordRouteOnPersist(context) {
  if (!context || !state?.world) return null;
  const siteId = state.world.siteId, travelCount = Number(state.world.travelCount) || 0;
  if (travelCount !== context.lastTravelCount + 1 || context.path[context.pathIndex + 1] !== siteId) return null;
  const fromId = context.path[context.pathIndex], route = ir0775Connection(fromId, siteId);
  if (!route || typeof route.geoId !== 'string' || !route.geoId) return null;
  const character = state.character, contractState = ir0834GetState(character, false);
  const before = contractState ? ir0834Clone(contractState) : null;
  if (contractState) {
    for (const record of contractState.accepted) {
      const objective = record.objective;
      if (record.status !== 'active' || record.templateId !== 'route-survey' || objective.status !== 'tracking' || objective.traversed) continue;
      const exactEdge = objective.routeId === route.geoId
        && ((objective.fromSiteId === fromId && objective.toSiteId === siteId) || (objective.fromSiteId === siteId && objective.toSiteId === fromId));
      if (!exactEdge) continue;
      const eventId = `contract-travel:${record.instanceId}:${route.geoId}:${fromId}:${siteId}`;
      if (objective.travelEventIds.includes(eventId)) continue;
      objective.travelEventIds.push(eventId); objective.traversed = true; objective.status = 'verified';
    }
  }
  return { context, siteId, travelCount, before };
}
const ir0834PersistBase = persist;
persist = function () {
  const change = ir0834RecordRouteOnPersist(ir0834TravelContext);
  const result = ir0834PersistBase.apply(this, arguments);
  if (change) {
    if (result) { change.context.lastTravelCount = change.travelCount; change.context.pathIndex++; }
    else if (change.before) state.character.guildContractState = change.before;
  }
  return result;
};
let ir0834TravelContext = null;
function ir0834WithTravelContext(path, callback) {
  if (!Array.isArray(path) || path.length < 2) return callback();
  const previous = ir0834TravelContext;
  ir0834TravelContext = { path, pathIndex: 0, lastTravelCount: Number(state?.world?.travelCount) || 0 };
  try { return callback(); } finally { ir0834TravelContext = previous; }
}
const ir0834CommitTravelBase = ir0775CommitTravel;
ir0775CommitTravel = function (targetId, transport = 'foot') {
  const origin = site()?.id, route = origin && ir0775Connection(origin, targetId), before = ir0834Clone(state?.character?.guildContractState);
  const result = ir0834WithTravelContext(route?.geoId ? [origin, targetId] : [], () => ir0834CommitTravelBase.apply(this, arguments));
  if (!result && before) { state.character.guildContractState = before; persist(); }
  return result;
};
const ir0834TravelRouteBase = ir071TravelRouteConfirm;
ir071TravelRouteConfirm = function (targetId) {
  const plan = ir071RoutePlan(targetId);
  return ir0834WithTravelContext(plan?.path, () => ir0834TravelRouteBase.apply(this, arguments));
};

function ir0834MonsterEventQualifies(battle, kind, eventId) {
  if (kind !== 'victory' || !battle || !eventId || !IR_V0834_MONSTER_IDS.includes(battle.enemyId)) return false;
  const source = battle.source || {};
  if (!['wild', 'ambush', 'hunt'].includes(source.type) || source.type === 'spar' || source.room || source.npcId || source.targetType === 'npc') return false;
  const locationId = battle.ir0834StartedSiteId;
  return typeof locationId === 'string' && locationId === site()?.id && ir0834MonsterSiteQualifies(locationId);
}
const ir0834StartCombatBase = startCombat;
startCombat = function () {
  const result = ir0834StartCombatBase.apply(this, arguments);
  const active = state?.character?.guildContractState?.accepted?.some(row => row?.status === 'active' && row.templateId === 'monster-signs');
  const contractState = active ? ir0834GetState(state.character, false) : null;
  if (result && state?.combat?.active && contractState && !state.combat.ir0834ContractEventId) {
    state.combat.ir0834ContractEventId = `guild-combat-event:${contractState.nextEventSequence++}`;
    state.combat.ir0834StartedSiteId = state.world.siteId;
    persist();
  }
  return result;
};
const ir0834CombatEndBase = irCombatEnd;
irCombatEnd = function (kind) {
  const battle = state?.combat, eventId = battle?.ir0834ContractEventId;
  const qualifying = ir0834MonsterEventQualifies(battle, kind, eventId);
  const result = ir0834CombatEndBase.apply(this, arguments);
  if (!qualifying || state?.combat === battle || state?.combat?.active) return result;
  const contractState = ir0834GetState(state?.character, false);
  if (!contractState) return result;
  let changed = false;
  for (const record of contractState.accepted) {
    const objective = record.objective;
    if (record.status !== 'active' || record.templateId !== 'monster-signs' || objective.status !== 'tracking' || objective.qualifyingEventId) continue;
    objective.status = 'verified'; objective.qualifyingEventId = eventId; objective.enemyId = battle.enemyId; objective.siteId = site()?.id; changed = true;
  }
  if (changed && !persist()) toast('The victory was recorded, but the contract save could not be written. Retry saving before reporting it.');
  return result;
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.3.4';
if (typeof globalThis !== 'undefined') {
  globalThis.IR_V0834_CONTRACT_RULES = IR_V0834_CONTRACT_RULES;
  globalThis.IR_V0834_CONTRACT_REWARDS = IR_V0834_CONTRACT_REWARDS;
  globalThis.ir0834ContractStateValid = ir0834ContractStateValid;
  globalThis.ir0834MarketSnapshot = ir0834MarketSnapshot;
  globalThis.ir0834RouteOptions = ir0834RouteOptions;
  globalThis.ir0834MonsterSiteQualifies = ir0834MonsterSiteQualifies;
  globalThis.ir0834MonsterEventQualifies = ir0834MonsterEventQualifies;
  globalThis.ir0834RankAccess = ir0834RankAccess;
}
