'use strict';
// Infinite Realms v0.8.3.5 — record-review examinations and rank promotion.
// SSS is governed by its approved numeric thresholds; global top-five is informational only.

const IR_V0835_RANK_RECORD_SCHEMA = 1;
const IR_V0835_RANK_RECORD_KEY = 'adventurerRankRecords';
const IR_V0835_AUTHORITY_SCHEMA = 1;

function ir0835Clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function ir0835NewId(prefix) {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') return `${prefix}:${randomUUID.call(globalThis.crypto)}`;
  const time = Date.now().toString(36), random = Math.random().toString(36).slice(2), sequence = (ir0835NewId.sequence = (ir0835NewId.sequence || 0) + 1).toString(36);
  return `${prefix}:${time}:${random}:${sequence}`;
}

function ir0835Quarantine(character, reason) {
  character.adventurerRankIntegrity = { status: 'quarantined', reason: String(reason || 'Adventurer rank records are invalid') };
  return { ok: false, reason: character.adventurerRankIntegrity.reason };
}

function ir0835RankRecordValid(value, adventurerId) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['Rank history is not an object'] };
  if (value.schema !== IR_V0835_RANK_RECORD_SCHEMA || !Array.isArray(value.examinations) || !Array.isArray(value.promotions)
    || !Number.isSafeInteger(value.nextExaminationSequence) || value.nextExaminationSequence < 1
    || !Number.isSafeInteger(value.nextPromotionSequence) || value.nextPromotionSequence < 1) return { ok: false, errors: ['Rank history schema or sequence counters are malformed'] };
  const attemptIds = new Set(), promotionIds = new Set(), promotedAttempts = new Set();
  for (const row of value.examinations) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || attemptIds.has(row.id)) { errors.push('Examination records contain a missing or duplicate ID'); continue; }
    attemptIds.add(row.id);
    if (row.characterId !== adventurerId || ir0832RankIndex(row.targetRank) <= 0 || typeof row.examinerNpcId !== 'string' || !row.examinerNpcId
      || !['PASS', 'FAIL'].includes(row.result) || typeof row.timestamp !== 'string' || !Number.isFinite(Date.parse(row.timestamp))
      || !Number.isSafeInteger(row.day) || row.day < 0) errors.push(`Examination ${row.id} has invalid identity, rank, examiner, result, or time`);
    if (row.result === 'PASS' && (typeof row.promotionId !== 'string' || !row.promotionId)) errors.push(`Passed examination ${row.id} has no promotion receipt`);
    if (row.result === 'FAIL' && row.promotionId != null) errors.push(`Failed examination ${row.id} has a promotion receipt`);
  }
  for (const row of value.promotions) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || promotionIds.has(row.id)) { errors.push('Promotion records contain a missing or duplicate ID'); continue; }
    promotionIds.add(row.id);
    const fromIndex = ir0832RankIndex(row.fromRank), toIndex = ir0832RankIndex(row.toRank);
    if (row.characterId !== adventurerId || fromIndex < 0 || toIndex !== fromIndex + 1 || typeof row.examinerNpcId !== 'string' || !row.examinerNpcId
      || typeof row.timestamp !== 'string' || !Number.isFinite(Date.parse(row.timestamp)) || typeof row.examinationId !== 'string' || !attemptIds.has(row.examinationId)) {
      errors.push(`Promotion ${row.id} has invalid identity, rank transition, examination, examiner, or time`);
    }
    const exam = value.examinations.find(item => item?.id === row.examinationId);
    if (exam && (exam.result !== 'PASS' || exam.promotionId !== row.id || exam.targetRank !== row.toRank || exam.examinerNpcId !== row.examinerNpcId)) errors.push(`Promotion ${row.id} conflicts with its examination`);
    if (promotedAttempts.has(row.examinationId)) errors.push(`Examination ${row.examinationId} promoted more than once`);
    promotedAttempts.add(row.examinationId);
  }
  const maxAttempt = value.examinations.reduce((max, row) => Math.max(max, Number(row?.id?.split(':').at(-1)) || 0), 0);
  const maxPromotion = value.promotions.reduce((max, row) => Math.max(max, Number(row?.id?.split(':').at(-1)) || 0), 0);
  if (value.nextExaminationSequence <= maxAttempt || value.nextPromotionSequence <= maxPromotion) errors.push('Rank history sequence counters would reuse an existing stable ID');
  for (let i = 1; i < value.promotions.length; i++) if (value.promotions[i - 1].toRank !== value.promotions[i].fromRank) errors.push('Promotion history has a discontinuous rank sequence');
  if (value.examinations.some(row => row?.result === 'PASS' && !promotionIds.has(row.promotionId))) errors.push('A passed examination has no corresponding promotion');
  if (value.promotions.some(row => !attemptIds.has(row?.examinationId))) errors.push('A promotion references an unknown examination');
  return { ok: errors.length === 0, errors };
}

function ir0835RankState(character = state?.character, create = false) {
  if (!character || typeof character !== 'object' || Array.isArray(character)) return { ok: false, reason: 'Character record is unavailable' };
  if (character.adventurerRankIntegrity?.status === 'quarantined') return { ok: false, reason: character.adventurerRankIntegrity.reason || 'Rank records are quarantined' };
  const progression = typeof ir0833CurrentProgression === 'function' ? ir0833CurrentProgression(character) : null;
  if (!progression) return { ok: false, reason: character.adventurerProgressionIntegrity?.reason || 'Adventurer progression is unavailable' };
  if (Object.prototype.hasOwnProperty.call(progression, 'adventurerId')
    && (typeof progression.adventurerId !== 'string' || !progression.adventurerId.trim())) {
    return ir0835Quarantine(character, 'Saved adventurer ID is malformed; original progression data was preserved.');
  }
  if (!Object.prototype.hasOwnProperty.call(progression, 'adventurerId')) {
    if (!create) return { ok: true, progression, adventurerId: null, records: null, migrated: false };
    progression.adventurerId = ir0835NewId('adventurer');
  }
  if (character[IR_V0835_RANK_RECORD_KEY] == null) {
    if (!create) return { ok: true, progression, adventurerId: progression.adventurerId, records: null, migrated: false };
    character[IR_V0835_RANK_RECORD_KEY] = { schema: IR_V0835_RANK_RECORD_SCHEMA, examinations: [], promotions: [], nextExaminationSequence: 1, nextPromotionSequence: 1 };
  }
  const records = character[IR_V0835_RANK_RECORD_KEY];
  const validation = ir0835RankRecordValid(records, progression.adventurerId);
  if (!validation.ok) return ir0835Quarantine(character, `${validation.errors.join('; ')}. Original records were preserved.`);
  character.adventurerRankIntegrity = { status: 'ready', reason: null };
  return { ok: true, progression, adventurerId: progression.adventurerId, records, migrated: false };
}

function ir0835KnownNpcRecords() {
  const rows = [...(Array.isArray(state?.character?.npcs) ? state.character.npcs : []), ...Object.values(state?.world?.v06?.changes || {})];
  const byId = new Map();
  for (const npc of rows) if (npc && typeof npc.id === 'string' && npc.id) {
    const prior = byId.get(npc.id);
    if (prior && prior.associationRole !== npc.associationRole) byId.set(npc.id, { ...npc, ir0835Conflict: true });
    else if (!prior) byId.set(npc.id, npc);
  }
  return byId;
}

function ir0835ExamAuthority(npcId, world = state?.world) {
  const leadership = world?.associationLeadership;
  if (!leadership || leadership.schema !== IR_V0835_AUTHORITY_SCHEMA || typeof leadership.grandmasterNpcId !== 'string'
    || !leadership.grandmasterNpcId || !Array.isArray(leadership.delegatedExaminerNpcIds)) {
    return { authorized: false, status: 'unconfigured', reason: 'No authoritative Association Grandmaster is registered.' };
  }
  if (new Set(leadership.delegatedExaminerNpcIds).size !== leadership.delegatedExaminerNpcIds.length
    || leadership.delegatedExaminerNpcIds.some(id => typeof id !== 'string' || !id)) {
    return { authorized: false, status: 'invalid', reason: 'Association examiner authority records are malformed.' };
  }
  const knownNpcs = ir0835KnownNpcRecords();
  const npc = knownNpcs.get(npcId);
  const grandmaster = knownNpcs.get(leadership.grandmasterNpcId);
  const grandmasters = [...knownNpcs.values()].filter(row => row.associationRole === 'grandmaster');
  if (!grandmaster || grandmaster.ir0835Conflict || grandmaster.associationRole !== 'grandmaster' || grandmasters.length !== 1 || grandmasters[0].id !== leadership.grandmasterNpcId) {
    return { authorized: false, status: 'invalid', reason: 'The configured Grandmaster does not resolve to one valid NPC with the Grandmaster role.' };
  }
  for (const delegatedId of leadership.delegatedExaminerNpcIds) {
    const delegated = ir0835KnownNpcRecords().get(delegatedId);
    const guild = delegated && world?.organizations?.find(row => row?.id === delegated.organizationId && row?.organizationType === 'adventurers-guild');
    if (!delegated || delegated.ir0835Conflict || delegated.guildServiceRole !== 'guildmaster' || !guild) return { authorized: false, status: 'invalid', reason: `Delegated examiner ${delegatedId} does not resolve to one unambiguous Adventurers’ Guild Guildmaster.` };
  }
  if (!npc || npc.ir0835Conflict) return { authorized: false, status: 'invalid', reason: 'Examiner identity does not resolve unambiguously.' };
  const isGrandmaster = npc.id === leadership.grandmasterNpcId && npc.associationRole === 'grandmaster';
  const isDelegated = leadership.delegatedExaminerNpcIds.includes(npc.id) && npc.guildServiceRole === 'guildmaster';
  if (!isGrandmaster && !isDelegated) return { authorized: false, status: 'unauthorized', reason: 'This NPC is not authorized to examine adventurers.' };
  return { authorized: true, status: 'authorized', examiner: npc, role: isGrandmaster ? 'grandmaster' : 'delegate' };
}

function ir0835CompletedContractEvidence(character) {
  if (character?.guildContractIntegrity?.status === 'quarantined') return { error: character.guildContractIntegrity.reason || 'Contract history is quarantined.', rows: null };
  const contractState = character?.guildContractState;
  if (contractState == null) return { error: null, rows: null };
  if (typeof ir0834ContractStateValid !== 'function' || !ir0834ContractStateValid(character).ok || !Array.isArray(contractState.accepted)) return { error: 'Saved contract history is malformed or unavailable.', rows: null };
  return { error: null, rows: contractState.accepted.filter(row => row?.status === 'completed' && row.rewardDelivered === true
    && row.rewardTransactionId === `guild-contract-reward:${row.instanceId}`
    && Number.isSafeInteger(row.rewardAmount) && row.rewardAmount > 0
    && IR_V0832_QUALIFYING_CONTRACT_TEMPLATES.includes(row.templateId))
    .map(row => ({ id: row.instanceId, templateId: row.templateId, status: 'completed', rewardDelivered: true })) };
}

function ir0835Eligibility(character = state?.character, assumeExamPass = false) {
  const rankState = ir0835RankState(character, false);
  if (!rankState.ok) return { eligible: false, status: 'invalid', reason: rankState.reason, integrity: rankState };
  const dutyInput = typeof ir0833RankProgressionInput === 'function' ? ir0833RankProgressionInput(character) : null;
  if (!dutyInput || dutyInput.status !== 'ready') return { eligible: false, status: 'invalid', reason: 'Duty progression is unavailable or quarantined.' };
  const contractEvidence = ir0835CompletedContractEvidence(character);
  const rankRecords = rankState.records;
  if (character[IR_V0835_RANK_RECORD_KEY] != null && !rankRecords) {
    return { eligible: false, status: 'invalid', reason: 'Saved examination history is unavailable or quarantined.' };
  }
  const standing = character?.factionStanding;
  const hasStanding = !!(standing && typeof standing === 'object' && !Array.isArray(standing)
    && Object.prototype.hasOwnProperty.call(standing, 'adventurers') && Number.isFinite(Number(standing.adventurers)));
  const passes = rankRecords?.examinations?.filter(row => row.result === 'PASS').map(row => row.targetRank) || [];
  const input = {
    currentRank: dutyInput.currentRank,
    completedContracts: contractEvidence.error ? null : contractEvidence.rows,
    completedDuties: dutyInput.completedDuties,
    guildStanding: hasStanding ? Number(standing.adventurers) : undefined,
    passedExaminations: assumeExamPass && dutyInput.currentRank !== 'SSS' ? [...passes, IR_V0832_RANK_DEFINITIONS[ir0832RankIndex(dutyInput.currentRank) + 1]?.id] : passes
  };
  const evaluation = ir0832EvaluateRankEligibility(input);
  return { ...evaluation, input, rankState, hasStanding };
}

function ir0835RankReviewMarkup(npcId = null) {
  const eligibility = ir0835Eligibility();
  if (!eligibility.input) return `<div class="overlay"><section class="modal" role="dialog" aria-modal="true"><h2>Rank review unavailable</h2><p>${esc(eligibility.reason || 'Progression data could not be validated.')}</p><button class="button" data-action="ir072-close">Close</button></section></div>`;
  const { currentRank, nextRank, unmetRequirements = [], status } = eligibility;
  const assumePass = ir0835Eligibility(state?.character, true);
  const counts = eligibility.input;
  const templateCount = Array.isArray(counts.completedContracts) ? new Set(counts.completedContracts.filter(row => row.status === 'completed' && row.rewardDelivered).map(row => row.templateId)).size : null;
  const dutyCount = new Set(counts.completedDuties.filter(row => row.status === 'completed').map(row => row.id)).size;
  const requirements = nextRank ? IR_V0832_DEFAULT_REQUIREMENTS[nextRank] : null;
  const thresholdRows = requirements ? `<ul><li>Completed contract templates: ${requirements.completedContracts.value === 0 ? 'not required' : `${templateCount ?? 'unknown'}/${requirements.completedContracts.value} lifetime unique templates`}</li><li>Completed duties: ${dutyCount}/${requirements.completedDuties.value} unique instances</li><li>Association standing: ${Number.isFinite(counts.guildStanding) ? `${counts.guildStanding}/${requirements.guildStanding.value}` : `unknown; ${requirements.guildStanding.value} required`}</li><li>Record-review examination: required</li></ul>` : '<p>You are already at the highest rank.</p>';
  const examiner = npcId ? ir0835ExamAuthority(npcId) : { authorized: false, reason: 'Open this review with an authorized Association examiner to record an examination.' };
  const canReview = !!(assumePass.eligible && examiner.authorized && ir0835IsPresentExaminer(npcId));
  const examinerNote = examiner.authorized
    ? (canReview ? 'This examiner is authorized and present. Record the result after reviewing the authoritative records.' : `${esc(examiner.reason || (assumePass.eligible ? 'The examiner is not present.' : 'The rank requirements are not yet met.'))}`)
    : esc(examiner.reason || 'No authorized examiner is available.');
  const actions = nextRank && canReview ? `<div class="modal-actions"><button class="button danger" data-action="ir0835-record-exam" data-npc="${esc(npcId)}" data-rank="${esc(nextRank)}" data-result="FAIL">Record FAIL</button><button class="button primary" data-action="ir0835-record-exam" data-npc="${esc(npcId)}" data-rank="${esc(nextRank)}" data-result="PASS">Record PASS and promote</button></div>` : '';
  return `<div class="overlay"><section class="modal ir072-modal" role="dialog" aria-modal="true" aria-label="Adventurer rank review"><div class="modal-header"><div><div class="eyebrow">ADVENTURER PROGRESSION · V0.8.3.5</div><h2>${esc(currentRank)}${nextRank ? ` → ${esc(nextRank)}` : ''}</h2><p>Rank progression uses completed lifetime records and the shared Adventurers’ Association standing.</p></div><button class="close-btn" data-action="ir072-close">×</button></div>${thresholdRows}<div class="notice">${status === 'eligible' ? 'Requirements and a recorded pass are satisfied.' : assumePass.eligible ? 'Requirements are met; an authorized examiner must review and record the result.' : 'The examination cannot be recorded until all non-examination requirements are met.'}</div><div class="notice">${examinerNote}</div>${actions}<div class="modal-actions"><button class="button" data-action="ir072-close">Close</button></div></section></div>`;
}

function ir0835IsPresentExaminer(npcId) {
  const local = typeof ir072NPC === 'function' ? ir072NPC(npcId) : null;
  if (!local || local.id !== npcId) return false;
  if (typeof ir072IsPresent === 'function') return !!ir072IsPresent(local);
  return typeof ir06Present === 'function' ? !!ir06Present(local) : false;
}

function ir0835RecordExamination(npcId, targetRank, result, timestamp = new Date().toISOString()) {
  const authorization = ir0835ExamAuthority(npcId);
  if (!authorization.authorized || !ir0835IsPresentExaminer(npcId)) return { ok: false, reason: authorization.reason || 'The authorized examiner is not present.' };
  if (!['PASS', 'FAIL'].includes(result)) return { ok: false, reason: 'Examination result must be PASS or FAIL.' };
  const eligibility = ir0835Eligibility(state?.character, result === 'PASS');
  if (!eligibility.input || eligibility.nextRank !== targetRank) return { ok: false, reason: eligibility.reason || 'Target rank is not the next rank.' };
  const preExam = ir0832EvaluateRankEligibility({ ...eligibility.input, passedExaminations: eligibility.input.passedExaminations.filter(rank => rank !== targetRank) });
  if (preExam.unmetRequirements.some(row => row.requirement !== 'passedExamination')) return { ok: false, reason: 'The adventurer does not meet all non-examination rank requirements.' };
  const character = state.character, progression = eligibility.rankState.progression;
  const beforeProgression = ir0835Clone(progression), beforeRecords = ir0835Clone(character[IR_V0835_RANK_RECORD_KEY]), beforeIntegrity = ir0835Clone(character.adventurerRankIntegrity);
  const rankState = ir0835RankState(character, true);
  if (!rankState.ok) return rankState;
  const day = Math.max(0, Math.floor(Number(character.daysLived) || 0));
  const examinationId = `adventurer-exam:${rankState.adventurerId}:${rankState.records.nextExaminationSequence++}`;
  const attempt = { id: examinationId, characterId: rankState.adventurerId, targetRank, examinerNpcId: authorization.examiner.id, result, timestamp, day };
  rankState.records.examinations.push(attempt);
  if (result === 'PASS') {
    const fromRank = progression.currentRank;
    if (ir0832RankIndex(targetRank) !== ir0832RankIndex(fromRank) + 1) {
      character[IR_V0835_RANK_RECORD_KEY] = beforeRecords;
      progression.adventurerId = beforeProgression?.adventurerId;
      return { ok: false, reason: 'Rank changed while the examination was being recorded.' };
    }
    const promotionId = `adventurer-promotion:${rankState.adventurerId}:${rankState.records.nextPromotionSequence++}`;
    attempt.promotionId = promotionId;
    rankState.records.promotions.push({ id: promotionId, characterId: rankState.adventurerId, fromRank, toRank: targetRank, examinationId, examinerNpcId: authorization.examiner.id, timestamp, day });
    progression.currentRank = targetRank;
  }
  const validation = ir0835RankRecordValid(rankState.records, rankState.adventurerId);
  if (!validation.ok) {
    character.adventurerProgression = beforeProgression; character[IR_V0835_RANK_RECORD_KEY] = beforeRecords;
    return { ok: false, reason: validation.errors.join('; ') };
  }
  character.adventurerRankIntegrity = { status: 'ready', reason: null };
  if (typeof persist === 'function' && !persist()) {
    character.adventurerProgression = beforeProgression; character[IR_V0835_RANK_RECORD_KEY] = beforeRecords;
    if (beforeIntegrity == null) delete character.adventurerRankIntegrity; else character.adventurerRankIntegrity = beforeIntegrity;
    return { ok: false, reason: 'The examination could not be saved; no result or promotion was retained.' };
  }
  return { ok: true, result, examinationId, promotion: result === 'PASS' ? rankState.records.promotions.at(-1) : null, rank: progression.currentRank };
}

function ir0835ExaminerModal(npcId) {
  const authority = ir0835ExamAuthority(npcId);
  if (!authority.authorized || !ir0835IsPresentExaminer(npcId)) return null;
  const npc = authority.examiner;
  return `<div class="overlay" data-dismiss="modal"><section class="modal ir072-modal" role="dialog" aria-modal="true" aria-label="Association examination"><div class="modal-header"><div><div class="eyebrow">ASSOCIATION EXAMINATION</div><h2>${esc(npc.name || 'Association Examiner')}</h2><p>${authority.role === 'grandmaster' ? 'Global Grandmaster' : 'Delegated examiner'}</p></div><button class="close-btn" data-action="ir072-close">×</button></div><div class="notice">Review the adventurer’s authoritative completed contracts, duties, and standing. No fee or cooldown applies. An ineligible attempt is not recorded as a failure.</div><button class="button primary" data-action="ir0835-open-rank-review" data-npc="${esc(npc.id)}">Review progression and record an examination</button><div class="modal-actions"><button class="button" data-action="ir072-close">Close</button></div></section></div>`;
}

const ir0835InteractionModalBase = typeof ir072InteractionModal === 'function' ? ir072InteractionModal : null;
if (ir0835InteractionModalBase) ir072InteractionModal = function () {
  const npcId = modal?.npc;
  const examModal = typeof npcId === 'string' ? ir0835ExaminerModal(npcId) : null;
  return examModal || ir0835InteractionModalBase.apply(this, arguments);
};

const ir0835RenderModalBase = typeof renderModal === 'function' ? renderModal : null;
if (ir0835RenderModalBase) renderModal = function () {
  if (modal?.kind === 'ir0835-rank-review') return ir0835RankReviewMarkup(modal.npcId);
  return ir0835RenderModalBase.apply(this, arguments);
};

const ir0835ActionBase = typeof ir072Action === 'function' ? ir072Action : null;
if (ir0835ActionBase) ir072Action = function (target) {
  const action = target?.dataset?.action;
  if (action === 'ir0835-open-rank-review') {
    const npcId = target.dataset.npc, authority = ir0835ExamAuthority(npcId);
    if (!authority.authorized || !ir0835IsPresentExaminer(npcId)) { toast(authority.reason || 'The examiner is not present.'); return true; }
    modal = { kind: 'ir0835-rank-review', npcId }; render(); return true;
  }
  if (action === 'ir0835-open-rank-review-from-guild') {
    const npcId = target.dataset.npc;
    modal = { kind: 'ir0835-rank-review', npcId }; render(); return true;
  }
  if (action === 'ir0835-record-exam') {
    const outcome = ir0835RecordExamination(target.dataset.npc, target.dataset.rank, target.dataset.result);
    if (!outcome.ok) toast(outcome.reason);
    else toast(outcome.result === 'PASS' ? `Examination passed. Adventurer promoted to ${outcome.rank}.` : 'Examination recorded as failed. Rank unchanged.');
    modal = { kind: 'ir0835-rank-review', npcId: target.dataset.npc }; render(); return true;
  }
  return ir0835ActionBase.apply(this, arguments);
};

function ir0835GuildRankServiceCard(npc, organization) {
  if (npc?.guildServiceRole !== 'guildmaster') return '';
  const currentRank = state?.character?.adventurerProgression?.currentRank || 'F';
  const leadership = state?.world?.associationLeadership;
  const configuredExaminer = leadership?.schema === IR_V0835_AUTHORITY_SCHEMA && typeof leadership.grandmasterNpcId === 'string'
    ? ir0835ExamAuthority(leadership.grandmasterNpcId) : { authorized: false, reason: 'No authoritative Association Grandmaster is registered.' };
  const message = configuredExaminer.authorized
    ? `Current rank: ${esc(currentRank)}. Review approved rank requirements or visit an authorized examiner.`
    : `Current rank: ${esc(currentRank)}. Rank requirements are available, but examinations are unavailable: ${esc(configuredExaminer.reason || 'examiner authority is unresolved')}`;
  return `<article class="ir072-action-card"><div class="ir072-action-copy"><strong>Adventurer rank progression</strong><p>${esc(organization?.name || 'Guildmaster service')} · ${message}</p></div><button class="button small" data-action="ir0835-open-rank-review-from-guild" data-npc="${esc(npc.id)}">Review rank</button></article>`;
}

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.3.5';
if (typeof globalThis !== 'undefined') {
  globalThis.IR_V0835_RANK_RECORD_SCHEMA = IR_V0835_RANK_RECORD_SCHEMA;
  globalThis.ir0835RankRecordValid = ir0835RankRecordValid;
  globalThis.ir0835RankState = ir0835RankState;
  globalThis.ir0835ExamAuthority = ir0835ExamAuthority;
  globalThis.ir0835Eligibility = ir0835Eligibility;
  globalThis.ir0835RecordExamination = ir0835RecordExamination;
  globalThis.ir0835ExaminerModal = ir0835ExaminerModal;
  globalThis.ir0835GuildRankServiceCard = ir0835GuildRankServiceCard;
}
