'use strict';
// Infinite Realms v0.8.3.3 — persistent guild duty lifecycle and personal credit.

const IR_V0833_DUTY_SCHEMA = 1;
const IR_V0833_DUTY_DURATION_DAYS = 14;
const IR_V0833_DUTY_CATEGORIES = Object.freeze(['monster-defeat', 'resource-gathering', 'item-delivery']);
const IR_V0833_PROGRESSION_CONFIG = Object.freeze({
  creditPerCompletion: 1,
  dailyCreditCapByCategory: Object.freeze({ 'monster-defeat': 2, 'resource-gathering': 2, 'item-delivery': 2 }),
  dutyDurationDays: IR_V0833_DUTY_DURATION_DAYS,
  dailyResetCounter: 'character.daysLived'
});
const IR_V0833_DUTY_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'goblin-defeat-3', category: 'monster-defeat', title: 'Clear out goblin raiders', description: 'Defeat 3 Goblins.', targetId: 'goblin', targetName: 'Goblin', quantity: 3 }),
  Object.freeze({ id: 'bitterleaf-gather-5', category: 'resource-gathering', title: 'Gather Bitterleaf', description: 'Gather 5 Bitterleaf through herbalism.', targetId: 'herb', targetName: 'Bitterleaf', quantity: 5, method: 'herbalism' }),
  Object.freeze({ id: 'field-bandage-delivery-2', category: 'item-delivery', title: 'Deliver Field Bandages', description: 'Deliver 2 Field Bandages to this guild.', targetId: 'bandage', targetName: 'Field Bandage', quantity: 2 })
]);

function ir0833SourcesVerified() {
  return !!(
    IR_ENEMIES?.goblin?.id === 'goblin' &&
    ITEMS?.herb?.name === 'Bitterleaf' &&
    ITEMS?.bandage?.name === 'Field Bandage' &&
    Array.isArray(IR_V0762_GATHERING_METHODS) && IR_V0762_GATHERING_METHODS.includes('herbalism') &&
    typeof ir04Gather === 'function' && typeof irCombatEnd === 'function'
  );
}

function ir0833NewProgression(day = 0) {
  return {
    schema: IR_V0833_DUTY_SCHEMA,
    currentRank: 'F',
    dutyCredit: 0,
    activeDuties: [],
    dutyHistory: [],
    dailyCredit: { day: Math.max(0, Math.floor(Number(day) || 0)), byCategory: {} },
    processedEventIds: [],
    nextDutySequence: 1,
    nextEventSequence: 1,
    pendingGatherEvent: null
  };
}

function ir0833ProgressionValidation(value, organizations = null) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['Progression record is not an object'] };
  if (value.schema !== IR_V0833_DUTY_SCHEMA) errors.push('Unsupported progression schema');
  if (!IR_V0832_RANK_DEFINITIONS?.some(rank => rank.id === value.currentRank)) errors.push('Rank is missing or invalid');
  if (!Number.isSafeInteger(value.dutyCredit) || value.dutyCredit < 0) errors.push('Duty credit is invalid');
  if (!Array.isArray(value.activeDuties) || !Array.isArray(value.dutyHistory) || !Array.isArray(value.processedEventIds)) errors.push('Duty or event history is malformed');
  if (!Number.isSafeInteger(value.nextDutySequence) || value.nextDutySequence < 1 || !Number.isSafeInteger(value.nextEventSequence) || value.nextEventSequence < 1) errors.push('Sequence counters are invalid');
  const daily = value.dailyCredit;
  if (!daily || typeof daily !== 'object' || Array.isArray(daily) || !Number.isSafeInteger(daily.day) || daily.day < 0 || !daily.byCategory || typeof daily.byCategory !== 'object' || Array.isArray(daily.byCategory)) errors.push('Daily credit ledger is malformed');
  else for (const [category, count] of Object.entries(daily.byCategory)) {
    const policy = ir0833CreditPolicy(category);
    if (!policy || !Number.isSafeInteger(count) || count < 0 || count > policy.cap) errors.push(`Daily credit ledger has an invalid value for ${category}`);
  }
  const guildIds = Array.isArray(organizations) ? new Set(organizations.filter(row => row?.organizationType === 'adventurers-guild').map(row => row.id)) : null;
  const ids = new Set();
  const activeRows = Array.isArray(value.activeDuties) ? value.activeDuties : [];
  const historyRows = Array.isArray(value.dutyHistory) ? value.dutyHistory : [];
  for (const record of [...activeRows, ...historyRows]) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id || ids.has(record.id)) { errors.push('Duty records contain a missing or duplicate ID'); continue; }
    ids.add(record.id);
    const template = IR_V0833_DUTY_TEMPLATES.find(row => row.id === record.templateId);
    if (!template || !IR_V0833_DUTY_CATEGORIES.includes(record.category) || template?.category !== record.category) errors.push(`Duty ${record.id} has an unknown template or category`);
    if (!Number.isSafeInteger(record.progress) || record.progress < 0 || !Number.isSafeInteger(record.required) || record.required < 1 || record.progress > record.required) errors.push(`Duty ${record.id} has invalid objective progress`);
    if (typeof record.guildId !== 'string' || !record.guildId || !Number.isSafeInteger(record.acceptedDay) || record.acceptedDay < 0 || (guildIds && !guildIds.has(record.guildId))) errors.push(`Duty ${record.id} has an invalid issuing guild or acceptance day`);
    if (template && record.required !== template.quantity) errors.push(`Duty ${record.id} does not match its configured objective quantity`);
    if (record.status !== 'active' && record.status !== 'completed' && record.status !== 'cancelled' && record.status !== 'expired') errors.push(`Duty ${record.id} has an invalid status`);
    if (record.creditAwarded !== undefined && typeof record.creditAwarded !== 'boolean') errors.push(`Duty ${record.id} has invalid credit status`);
    if (record.credit !== undefined && (!Number.isSafeInteger(record.credit) || record.credit < 0)) errors.push(`Duty ${record.id} has invalid credit data`);
    if (record.status === 'active' && (record.progress >= record.required || !activeRows.includes(record))) errors.push(`Active duty ${record.id} has inconsistent lifecycle status`);
    if (record.status !== 'active' && !historyRows.includes(record)) errors.push(`Closed duty ${record.id} is missing from history`);
    if (record.status === 'completed' && (record.progress !== record.required || !Number.isSafeInteger(record.completedDay) || record.completedDay < record.acceptedDay || typeof record.completionEventId !== 'string' || (record.creditAwarded && (!record.credit || !record.creditAwardEventId)) || (!record.creditAwarded && record.credit !== 0))) errors.push(`Completed duty ${record.id} has inconsistent completion data`);
    if ((record.status === 'cancelled' || record.status === 'expired') && (record.creditAwarded || (record.credit || 0) !== 0)) errors.push(`Unsuccessful duty ${record.id} incorrectly has progression credit`);
  }
  if (historyRows.reduce((sum, row) => sum + (Number.isSafeInteger(row?.credit) ? row.credit : 0), 0) !== value.dutyCredit) errors.push('Total duty credit does not match completed-duty credit records');
  if (!Array.isArray(value.processedEventIds) || value.processedEventIds.some(id => typeof id !== 'string' || !id) || new Set(value.processedEventIds).size !== value.processedEventIds.length) errors.push('Processed event IDs are malformed or duplicated');
  if (value.pendingGatherEvent != null && (!value.pendingGatherEvent || typeof value.pendingGatherEvent.id !== 'string' || typeof value.pendingGatherEvent.resourceId !== 'string' || !Number.isSafeInteger(value.pendingGatherEvent.beforeQuantity) || value.pendingGatherEvent.beforeQuantity < 0)) errors.push('Pending gathering event is malformed');
  return { ok: errors.length === 0, errors };
}

function ir0833Quarantine(character, reason) {
  character.adventurerProgressionIntegrity = { status: 'quarantined', reason: String(reason || 'Invalid adventurer progression data') };
  return { ok: false, reason: character.adventurerProgressionIntegrity.reason };
}

function ir0833EnsureProgression(character, organizations = state?.world?.organizations) {
  if (!character || typeof character !== 'object' || Array.isArray(character)) return { ok: false, reason: 'Character record is unavailable' };
  if (!Object.prototype.hasOwnProperty.call(character, 'adventurerProgression')) {
    character.adventurerProgression = ir0833NewProgression(character.daysLived);
    character.adventurerProgressionIntegrity = { status: 'ready', reason: null };
    return { ok: true, progression: character.adventurerProgression, migrated: true };
  }
  const value = character.adventurerProgression;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ir0833Quarantine(character, 'Adventurer progression data is not an object; the original value was preserved.');
  if (Object.prototype.hasOwnProperty.call(value, 'currentRank') && !IR_V0832_RANK_DEFINITIONS?.some(rank => rank.id === value.currentRank)) return ir0833Quarantine(character, 'Adventurer rank is invalid; original progression data was preserved.');
  if (value.schema != null && value.schema !== IR_V0833_DUTY_SCHEMA) return ir0833Quarantine(character, 'Adventurer progression schema is unsupported; original data was preserved.');
  const next = { ...value };
  if (next.schema == null) next.schema = IR_V0833_DUTY_SCHEMA;
  if (!Object.prototype.hasOwnProperty.call(next, 'currentRank')) next.currentRank = 'F';
  if (!Object.prototype.hasOwnProperty.call(next, 'dutyCredit')) next.dutyCredit = 0;
  if (!Object.prototype.hasOwnProperty.call(next, 'activeDuties')) next.activeDuties = [];
  if (!Object.prototype.hasOwnProperty.call(next, 'dutyHistory')) next.dutyHistory = [];
  if (!Object.prototype.hasOwnProperty.call(next, 'dailyCredit')) next.dailyCredit = { day: Math.max(0, Math.floor(Number(character.daysLived) || 0)), byCategory: {} };
  else if (next.dailyCredit && typeof next.dailyCredit === 'object' && !Array.isArray(next.dailyCredit) && !Object.prototype.hasOwnProperty.call(next.dailyCredit, 'byCategory')) next.dailyCredit = { ...next.dailyCredit, byCategory: {} };
  if (!Object.prototype.hasOwnProperty.call(next, 'processedEventIds')) next.processedEventIds = [];
  if (!Object.prototype.hasOwnProperty.call(next, 'nextDutySequence')) next.nextDutySequence = 1;
  if (!Object.prototype.hasOwnProperty.call(next, 'nextEventSequence')) next.nextEventSequence = 1;
  if (!Object.prototype.hasOwnProperty.call(next, 'pendingGatherEvent')) next.pendingGatherEvent = null;
  const validation = ir0833ProgressionValidation(next, organizations);
  if (!validation.ok) return ir0833Quarantine(character, `${validation.errors.join('; ')}. Original progression data was preserved.`);
  const migrated = JSON.stringify(next) !== JSON.stringify(value);
  if (migrated) character.adventurerProgression = next;
  character.adventurerProgressionIntegrity = { status: 'ready', reason: null };
  return { ok: true, progression: migrated ? next : value, migrated };
}

function ir0833CurrentProgression(character = state?.character, organizations = state?.world?.organizations) {
  if (character?.adventurerProgressionIntegrity?.status === 'quarantined') return null;
  const ensured = ir0833EnsureProgression(character, organizations);
  return ensured.ok ? ensured.progression : null;
}

function ir0833NextEventId(progression, prefix) {
  const sequence = progression.nextEventSequence++;
  return `duty-event:${String(prefix)}:${sequence}`;
}

function ir0833ExpireDue(progression = ir0833CurrentProgression(), day = state?.character?.daysLived) {
  if (!progression || !Number.isSafeInteger(Number(day))) return [];
  const now = Math.max(0, Math.floor(Number(day)));
  const expired = [];
  progression.activeDuties = progression.activeDuties.filter(duty => {
    if (now - duty.acceptedDay < IR_V0833_PROGRESSION_CONFIG.dutyDurationDays) return true;
    duty.status = 'expired'; duty.closedDay = now; duty.creditAwarded = false;
    expired.push(duty); progression.dutyHistory.push(duty); return false;
  });
  return expired;
}

function ir0833CreditPolicy(category, configuration = IR_V0833_PROGRESSION_CONFIG) {
  const amount = configuration?.creditPerCompletion;
  const cap = configuration?.dailyCreditCapByCategory?.[category];
  return Number.isSafeInteger(amount) && amount > 0 && Number.isSafeInteger(cap) && cap > 0 ? { amount, cap } : null;
}

function ir0833AwardCompletion(progression, duty, eventId, day, configuration = IR_V0833_PROGRESSION_CONFIG) {
  if (duty.creditAwarded) return false;
  duty.creditAwarded = false;
  if (progression.dailyCredit.day !== day) progression.dailyCredit = { day, byCategory: {} };
  const used = progression.dailyCredit.byCategory[duty.category] || 0;
  const policy = ir0833CreditPolicy(duty.category, configuration);
  duty.credit = 0;
  if (!policy || used + policy.amount > policy.cap) return false;
  progression.dailyCredit.byCategory[duty.category] = used + policy.amount;
  progression.dutyCredit += policy.amount;
  duty.credit = policy.amount;
  duty.creditAwarded = true;
  duty.creditAwardEventId = eventId;
  return true;
}

function ir0833ProgressEvent(event, character = state?.character, organizations = state?.world?.organizations) {
  const progression = ir0833CurrentProgression(character, organizations);
  if (!progression || !event || typeof event.id !== 'string' || !event.id || !IR_V0833_DUTY_CATEGORIES.includes(event.category) || typeof event.targetId !== 'string' || !Number.isSafeInteger(event.quantity) || event.quantity < 1) return { ok: false, reason: 'Invalid or quarantined progression event' };
  ir0833ExpireDue(progression, character?.daysLived);
  if (progression.processedEventIds.includes(event.id)) return { ok: true, duplicate: true, progressed: 0, completed: [] };
  const matchesDuty = progression.activeDuties.some(duty => {
    const template = IR_V0833_DUTY_TEMPLATES.find(row => row.id === duty.templateId);
    return template && duty.category === event.category && template.targetId === event.targetId && (!template.method || template.method === event.method);
  });
  if (!matchesDuty) return { ok: true, duplicate: false, progressed: 0, completed: [] };
  progression.processedEventIds.push(event.id);
  const completed = [];
  let progressed = 0;
  for (const duty of progression.activeDuties) {
    const template = IR_V0833_DUTY_TEMPLATES.find(row => row.id === duty.templateId);
    if (!template || duty.category !== event.category || template.targetId !== event.targetId || (template.method && template.method !== event.method)) continue;
    const amount = Math.min(template.quantity - duty.progress, event.quantity);
    if (amount <= 0) continue;
    duty.progress += amount; duty.lastProgressDay = Math.max(0, Math.floor(Number(character?.daysLived) || 0)); duty.lastProgressEventId = event.id;
    progressed += amount;
    if (duty.progress >= duty.required) {
      duty.status = 'completed'; duty.completedDay = duty.lastProgressDay; duty.completionEventId = event.id;
      ir0833AwardCompletion(progression, duty, event.id, duty.completedDay);
      completed.push(duty);
    }
  }
  for (const duty of completed) {
    progression.activeDuties = progression.activeDuties.filter(row => row.id !== duty.id);
    progression.dutyHistory.push(duty);
  }
  return { ok: true, duplicate: false, progressed, completed };
}

function ir0833ReconcilePendingGather(character = state?.character, organizations = state?.world?.organizations) {
  const progression = ir0833CurrentProgression(character, organizations);
  const pending = progression?.pendingGatherEvent;
  if (!pending) return { ok: true, recovered: false };
  const current = Math.max(0, Math.floor(Number(character.inventory?.[pending.resourceId]) || 0));
  const produced = Math.max(0, current - pending.beforeQuantity);
  const outcome = produced > 0
    ? ir0833ProgressEvent({ id: pending.id, category: 'resource-gathering', targetId: pending.resourceId, quantity: produced, method: pending.method }, character, organizations)
    : { ok: true, progressed: 0, completed: [] };
  progression.pendingGatherEvent = null;
  return { ...outcome, recovered: true, produced };
}

function ir0833RankProgressionInput(character = state?.character) {
  const progression = ir0833CurrentProgression(character);
  if (!progression) return { currentRank: null, completedDuties: [], status: 'quarantined' };
  return {
    currentRank: progression.currentRank,
    completedDuties: progression.dutyHistory.filter(duty => duty.status === 'completed').map(duty => ({ id: duty.id, status: 'completed', category: duty.category, credit: duty.credit || 0 })),
    status: 'ready'
  };
}

function ir0833ResolveGuild(npcId, requireMembership = false) {
  const npc = typeof ir072NPC === 'function' ? ir072NPC(npcId) : null;
  if (!npc || npc.guildServiceRole !== 'receptionist') return { error: 'Only the issuing guild receptionist can manage guild duties.' };
  const organization = state?.world?.organizations?.find(row => row?.id === npc.organizationId && row?.organizationType === 'adventurers-guild');
  const guildSite = typeof ir0822GuildSite === 'function' ? ir0822GuildSite(state?.world, organization) : null;
  if (!organization || !guildSite || site()?.id !== guildSite.id || (typeof ir072IsPresent === 'function' && !ir072IsPresent(npc))) return { error: 'This guild duty service is unavailable at the current location.' };
  if (requireMembership && (typeof ir0825GuildMembership !== 'function' || !ir0825GuildMembership(state?.character, organization))) return { error: 'Join the Adventurers’ Guild before accepting a guild duty.' };
  return { npc, organization, guildSite };
}

function ir0833DutyBoardModal() {
  if (modal?.kind !== 'ir0833-guild-duty-board') return null;
  const service = ir0833ResolveGuild(modal.npcId);
  if (service.error) return `<div class="overlay"><section class="modal ir072-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><div class="eyebrow">GUILD DUTIES · V0.8.3.3</div><h2>Service unavailable</h2></div><button class="close-btn" data-action="ir072-close">×</button></div><div class="notice">${esc(service.error)}</div><div class="modal-actions"><button class="button" data-action="ir072-close">Close</button></div></section></div>`;
  const progression = ir0833CurrentProgression();
  if (!progression) return `<div class="overlay"><section class="modal ir072-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><div class="eyebrow">GUILD DUTIES · V0.8.3.3</div><h2>Progression unavailable</h2></div><button class="close-btn" data-action="ir072-close">×</button></div><div class="notice">${esc(state.character.adventurerProgressionIntegrity?.reason || 'Personal progression is quarantined; the saved data was preserved and duties are disabled.')}</div></section></div>`;
  const expired = ir0833ExpireDue(progression);
  if (expired.length) persist();
  const verified = ir0833SourcesVerified();
  const active = progression.activeDuties.filter(row => row.guildId === service.organization.id);
  const history = progression.dutyHistory.filter(row => row.guildId === service.organization.id).slice(-8).reverse();
  const offers = IR_V0833_DUTY_TEMPLATES.map(template => {
    const running = active.find(row => row.templateId === template.id);
    const unavailable = !verified || !IR_V0833_DUTY_CATEGORIES.includes(template.category);
    const text = unavailable ? 'Required game target or gameplay hook is unavailable.' : running ? `Active · ${running.progress}/${running.required}` : `Accept this ${IR_V0833_PROGRESSION_CONFIG.dutyDurationDays} in-game day duty.`;
    const member = typeof ir0825GuildMembership === 'function' && ir0825GuildMembership(state?.character, service.organization);
    return `<article class="ir072-action-card"><div class="ir072-action-copy"><strong>${esc(template.title)}</strong><p>${esc(template.description)}</p><small>${esc(unavailable ? text : running ? text : member ? text : 'Join the Adventurers’ Guild to accept this duty.')}</small></div><button class="button small primary" data-action="ir0833-accept-duty" data-npc="${esc(service.npc.id)}" data-template="${esc(template.id)}" ${unavailable || running || !member ? 'disabled' : ''}>${running ? 'Active' : 'Accept duty'}</button></article>`;
  }).join('');
  const activeHtml = active.length ? active.map(duty => {
    const template = IR_V0833_DUTY_TEMPLATES.find(row => row.id === duty.templateId);
    const deliver = duty.category === 'item-delivery' ? `<button class="button small primary" data-action="ir0833-deliver-duty" data-npc="${esc(service.npc.id)}" data-duty="${esc(duty.id)}" data-operation="${esc(`${duty.id}:deliver:${duty.progress}:${state.character.daysLived}:${Math.min(duty.required - duty.progress, state.character.inventory?.[template.targetId] || 0)}`)}">Deliver ${Math.min(duty.required - duty.progress, state.character.inventory?.[template.targetId] || 0)} item(s)</button>` : '';
    const expires = Math.max(0, IR_V0833_PROGRESSION_CONFIG.dutyDurationDays - (state.character.daysLived - duty.acceptedDay));
    return `<article class="ir072-action-card"><div class="ir072-action-copy"><strong>${esc(template?.title || duty.templateId)}</strong><p>Progress ${duty.progress}/${duty.required} · ${expires} in-game day(s) remain.</p></div>${deliver}<button class="button small danger" data-action="ir0833-cancel-duty" data-npc="${esc(service.npc.id)}" data-duty="${esc(duty.id)}">Cancel</button></article>`;
  }).join('') : '<div class="empty">No active duties for this guild.</div>';
  const historyHtml = history.length ? history.map(row => `<li>${esc(IR_V0833_DUTY_TEMPLATES.find(template => template.id === row.templateId)?.title || row.templateId)} — ${esc(row.status)}${row.status === 'completed' ? ` · ${row.credit || 0} credit` : ''}</li>`).join('') : '<li>No duty history recorded.</li>';
  const capText = IR_V0833_DUTY_CATEGORIES.map(category => `${category}: ${progression.dailyCredit.day === state.character.daysLived ? progression.dailyCredit.byCategory[category] || 0 : 0}/${IR_V0833_PROGRESSION_CONFIG.dailyCreditCapByCategory[category]}`).join(' · ');
  return `<div class="overlay"><section class="modal ir072-modal" role="dialog" aria-modal="true" aria-label="${esc(service.organization.name)} guild duties"><div class="modal-header"><div><div class="eyebrow">GUILD DUTIES · V0.8.3.3</div><h2>${esc(service.organization.name)}</h2><p>Personal rank ${esc(progression.currentRank)} · Duty credit ${progression.dutyCredit}</p></div><button class="close-btn" data-action="ir072-close">×</button></div><div class="notice">A completed duty grants ${IR_V0833_PROGRESSION_CONFIG.creditPerCompletion} personal credit, within the shared daily category caps shown below. Credit does not promote your rank. Daily credit: ${esc(capText)}.</div><h3>Available duties</h3><div class="ir072-action-grid">${offers}</div><h3>Active duties</h3><div class="ir072-action-grid">${activeHtml}</div><h3>Recent history</h3><ul>${historyHtml}</ul><div class="modal-actions"><button class="button" data-action="ir072-close">Close</button></div></section></div>`;
}

function ir0833AddServiceEntry(html) {
  if (typeof html !== 'string' || !html.includes('ir0824-open-contract-board')) return html;
  return html.replace(/(<\/div>\s*<div class="modal-actions">)/, `<article class="ir072-action-card"><div class="ir072-action-copy"><strong>Guild duties</strong><p>Accept or review personal guild duties. Duties are tracked separately from contracts.</p></div><button class="button small primary" data-action="ir0833-open-duty-board" data-npc="${esc(modal?.npc)}">Open duties</button></article>$1`);
}

const ir0833InteractionModalBase = ir0823GuildMembershipModal;
ir0823GuildMembershipModal = function () { return ir0833AddServiceEntry(ir0833InteractionModalBase.apply(this, arguments)); };
const ir0833RenderModalBase = renderModal;
renderModal = function () { return ir0833DutyBoardModal() || ir0833RenderModalBase.apply(this, arguments); };

const ir0833NormalizeSaveBase = normalizeSave;
normalizeSave = function (input) {
  const saved = ir0833NormalizeSaveBase.apply(this, arguments);
  const ensured = ir0833EnsureProgression(saved.character, saved.world?.organizations);
  if (ensured.ok) ir0833ReconcilePendingGather(saved.character, saved.world?.organizations);
  return saved;
};

const ir0833PersistBase = persist;
persist = function () {
  const progression = ir0833CurrentProgression();
  if (progression && state?.combat?.active && !state.combat.ir0833DutyEventId) state.combat.ir0833DutyEventId = ir0833NextEventId(progression, 'combat');
  return ir0833PersistBase.apply(this, arguments);
};

const ir0833DayPassBase = dayPass;
dayPass = function () {
  const result = ir0833DayPassBase.apply(this, arguments);
  const progression = ir0833CurrentProgression();
  if (progression) ir0833ExpireDue(progression);
  return result;
};

const ir0833StartCombatBase = startCombat;
startCombat = function () {
  const result = ir0833StartCombatBase.apply(this, arguments);
  if (result && state?.combat?.active) persist();
  return result;
};

const ir0833GatherBase = ir04Gather;
ir04Gather = function (method) {
  const progression = ir0833CurrentProgression();
  if (!progression) return ir0833GatherBase.apply(this, arguments);
  const id = ir0833NextEventId(progression, `gather-${String(method)}`);
  progression.pendingGatherEvent = { id, method: String(method), resourceId: method === 'herbalism' ? 'herb' : '', beforeQuantity: Math.max(0, Math.floor(Number(state?.character?.inventory?.herb) || 0)) };
  persist();
  const result = ir0833GatherBase.apply(this, arguments);
  ir0833ReconcilePendingGather();
  persist();
  return result;
};

const ir0833CombatEndBase = irCombatEnd;
irCombatEnd = function (kind) {
  const battle = state?.combat;
  if (kind === 'victory' && battle && battle.source?.type !== 'spar' && battle.enemyId === 'goblin' && battle.ir0833DutyEventId) {
    ir0833ProgressEvent({ id: battle.ir0833DutyEventId, category: 'monster-defeat', targetId: battle.enemyId, quantity: 1 });
    persist();
  }
  return ir0833CombatEndBase.apply(this, arguments);
};

function ir0833GuildAction(action, target) {
  const service = ir0833ResolveGuild(target?.dataset?.npc, action === 'ir0833-accept-duty');
  if (service.error) { toast(service.error); return true; }
  const progression = ir0833CurrentProgression();
  if (!progression) { toast(state.character.adventurerProgressionIntegrity?.reason || 'Adventurer progression is quarantined.'); return true; }
  ir0833ExpireDue(progression);
  const day = Math.max(0, Math.floor(Number(state.character.daysLived) || 0));
  if (action === 'ir0833-accept-duty') {
    if (state.combat?.active || state.pendingEvent) { toast('Resolve the active encounter or pending choice before accepting a guild duty.'); return true; }
    const template = IR_V0833_DUTY_TEMPLATES.find(row => row.id === target.dataset.template);
    if (!template || !ir0833SourcesVerified()) { toast('This duty template is unavailable because its target or gameplay hook could not be verified.'); return true; }
    if (progression.activeDuties.some(row => row.guildId === service.organization.id && row.templateId === template.id)) { toast('This duty is already active for this guild.'); return true; }
    const before = JSON.stringify(progression);
    const id = `guild-duty:${service.organization.id}:${template.id}:${progression.nextDutySequence++}`;
    progression.activeDuties.push({ id, templateId: template.id, category: template.category, guildId: service.organization.id, progress: 0, required: template.quantity, acceptedDay: day, status: 'active', creditAwarded: false, credit: 0 });
    if (!persist()) {
      state.character.adventurerProgression = JSON.parse(before);
      toast('The duty could not be saved. No duty was accepted.'); return true;
    }
    render(); toast(`Accepted guild duty: ${template.title}.`); return true;
  }
  const duty = progression.activeDuties.find(row => row.id === target.dataset.duty && row.guildId === service.organization.id);
  if (!duty) { toast('That active guild duty could not be found.'); return true; }
  if (action === 'ir0833-cancel-duty') {
    const before = JSON.stringify(progression);
    duty.status = 'cancelled'; duty.closedDay = day; duty.creditAwarded = false;
    progression.activeDuties = progression.activeDuties.filter(row => row.id !== duty.id); progression.dutyHistory.push(duty);
    if (!persist()) {
      state.character.adventurerProgression = JSON.parse(before);
      toast('The cancellation could not be saved. The duty remains active.'); return true;
    }
    render(); toast('Duty cancelled. No progression credit was awarded.'); return true;
  }
  if (action === 'ir0833-deliver-duty') {
    const template = IR_V0833_DUTY_TEMPLATES.find(row => row.id === duty.templateId);
    const token = String(target.dataset.operation || '');
    const expectedToken = `${duty.id}:deliver:${duty.progress}:${day}:${Math.min(duty.required - duty.progress, state.character.inventory?.[template?.targetId] || 0)}`;
    if (duty.category !== 'item-delivery' || token !== expectedToken || progression.processedEventIds.includes(token)) { toast('This delivery is no longer valid; review the active duty.'); return true; }
    const quantity = Math.min(duty.required - duty.progress, Math.max(0, Math.floor(Number(state.character.inventory?.[template.targetId]) || 0)));
    if (quantity < 1) { toast(`You need ${template.targetName} to make a delivery.`); return true; }
    const oldInventory = state.character.inventory[template.targetId];
    const before = JSON.stringify(progression);
    progression.processedEventIds.push(token);
    state.character.inventory[template.targetId] = oldInventory - quantity;
    duty.progress += quantity; duty.lastProgressDay = day; duty.lastProgressEventId = token;
    if (duty.progress >= duty.required) {
      duty.status = 'completed'; duty.completedDay = day; duty.completionEventId = token;
      ir0833AwardCompletion(progression, duty, token, day);
      progression.activeDuties = progression.activeDuties.filter(row => row.id !== duty.id); progression.dutyHistory.push(duty);
    }
    if (!persist()) {
      state.character.inventory[template.targetId] = oldInventory;
      state.character.adventurerProgression = JSON.parse(before);
      toast('The delivery could not be saved. No items were consumed.'); return true;
    }
    render(); toast(duty.status === 'completed' ? `Duty complete. ${duty.credit || 0} progression credit awarded.` : `Delivered ${quantity} ${template.targetName}; progress ${duty.progress}/${duty.required}.`); return true;
  }
  return false;
}

const ir0833ActionBase = ir072Action;
ir072Action = function (target) {
  const action = target?.dataset?.action;
  if (action === 'ir0833-open-duty-board') {
    const service = ir0833ResolveGuild(target.dataset.npc);
    if (service.error) { toast(service.error); return true; }
    modal = { kind: 'ir0833-guild-duty-board', npcId: service.npc.id, guildId: service.organization.id };
    render(); return true;
  }
  if (['ir0833-accept-duty', 'ir0833-cancel-duty', 'ir0833-deliver-duty'].includes(action)) return ir0833GuildAction(action, target);
  return ir0833ActionBase.apply(this, arguments);
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.3.3';
if (typeof globalThis !== 'undefined') {
  globalThis.IR_V0833_DUTY_TEMPLATES = IR_V0833_DUTY_TEMPLATES;
  globalThis.IR_V0833_PROGRESSION_CONFIG = IR_V0833_PROGRESSION_CONFIG;
  globalThis.ir0833SourcesVerified = ir0833SourcesVerified;
  globalThis.ir0833EnsureProgression = ir0833EnsureProgression;
  globalThis.ir0833ProgressionValidation = ir0833ProgressionValidation;
  globalThis.ir0833ProgressEvent = ir0833ProgressEvent;
  globalThis.ir0833ReconcilePendingGather = ir0833ReconcilePendingGather;
  globalThis.ir0833RankProgressionInput = ir0833RankProgressionInput;
  globalThis.ir0833ExpireDue = ir0833ExpireDue;
  globalThis.ir0833CreditPolicy = ir0833CreditPolicy;
  globalThis.ir0833AwardCompletion = ir0833AwardCompletion;
}
