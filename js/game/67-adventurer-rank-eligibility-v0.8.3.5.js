'use strict';
// Infinite Realms v0.8.3.5 — approved rank thresholds and read-only eligibility.
// Promotions and examinations are executed by the v0.8.3.5 promotion service.

const IR_V0832_RANK_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'F', order: 0, label: 'F' }),
  Object.freeze({ id: 'E', order: 1, label: 'E' }),
  Object.freeze({ id: 'D', order: 2, label: 'D' }),
  Object.freeze({ id: 'C', order: 3, label: 'C' }),
  Object.freeze({ id: 'B', order: 4, label: 'B' }),
  Object.freeze({ id: 'A', order: 5, label: 'A' }),
  Object.freeze({ id: 'S', order: 6, label: 'S' }),
  Object.freeze({ id: 'SS', order: 7, label: 'SS' }),
  Object.freeze({ id: 'SSS', order: 8, label: 'SSS' })
]);

const IR_V0832_RANK_REQUIREMENT_VALUES = Object.freeze({
  E: Object.freeze({ completedContracts: 0, completedDuties: 3, guildStanding: 0 }),
  D: Object.freeze({ completedContracts: 1, completedDuties: 5, guildStanding: 10 }),
  C: Object.freeze({ completedContracts: 2, completedDuties: 8, guildStanding: 20 }),
  B: Object.freeze({ completedContracts: 2, completedDuties: 12, guildStanding: 30 }),
  A: Object.freeze({ completedContracts: 3, completedDuties: 16, guildStanding: 40 }),
  S: Object.freeze({ completedContracts: 3, completedDuties: 20, guildStanding: 50 }),
  SS: Object.freeze({ completedContracts: 3, completedDuties: 25, guildStanding: 65 }),
  SSS: Object.freeze({ completedContracts: 3, completedDuties: 100, guildStanding: 90 })
});
const IR_V0832_QUALIFYING_CONTRACT_TEMPLATES = Object.freeze(['route-survey', 'monster-signs', 'supply-ledger']);
const IR_V0832_DEFAULT_REQUIREMENTS = Object.freeze(Object.fromEntries(
  Object.entries(IR_V0832_RANK_REQUIREMENT_VALUES).map(([rankId, values]) => [rankId, Object.freeze({
    completedContracts: Object.freeze({ status: 'configured', value: values.completedContracts }),
    completedDuties: Object.freeze({ status: 'configured', value: values.completedDuties }),
    guildStanding: Object.freeze({ status: 'configured', value: values.guildStanding }),
    passedExamination: Object.freeze({ status: 'configured', value: true })
  })])
));

const IR_V0832_CONTRACT_RANK_RULES = Object.freeze({
  byTemplate: Object.freeze({
    'route-survey': Object.freeze({ status: 'unresolved', minimumRank: null, maximumRank: null }),
    'monster-signs': Object.freeze({ status: 'unresolved', minimumRank: null, maximumRank: null }),
    'supply-ledger': Object.freeze({ status: 'unresolved', minimumRank: null, maximumRank: null })
  }),
  reason: 'Contract rank ranges and exceptions have not been approved.'
});

function ir0832RankIndex(rankId) {
  return IR_V0832_RANK_DEFINITIONS.findIndex(rank => rank.id === rankId);
}

function ir0832ValidateRankDefinitions(definitions = IR_V0832_RANK_DEFINITIONS) {
  const expected = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
  const errors = [];
  if (!Array.isArray(definitions) || definitions.length !== expected.length) {
    return { ok: false, errors: ['Rank ladder must contain exactly the nine approved ranks'] };
  }
  definitions.forEach((rank, index) => {
    if (!rank || typeof rank !== 'object' || rank.id !== expected[index] || rank.order !== index) {
      errors.push(`Invalid rank ID or ordering at position ${index + 1}`);
    }
  });
  return { ok: errors.length === 0, errors };
}

function ir0832RankConfigurationValid(configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return false;
  const categories = ['completedContracts', 'completedDuties', 'guildStanding', 'passedExamination'];
  return Object.entries(configuration).every(([rankId, requirements]) => {
    if (ir0832RankIndex(rankId) <= 0 || !requirements || typeof requirements !== 'object' || Array.isArray(requirements)) return false;
    if (Object.keys(requirements).length !== categories.length || categories.some(key => !Object.prototype.hasOwnProperty.call(requirements, key))) return false;
    return categories.every(key => {
      const entry = requirements[key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      if (entry.status === 'unresolved') return entry.value === null;
      if (entry.status !== 'configured') return false;
      if (key === 'passedExamination') return typeof entry.value === 'boolean';
      return Number.isSafeInteger(entry.value) && (key === 'guildStanding' || entry.value >= 0);
    });
  });
}

function ir0832RequirementValue(configuration, rankId, key, unmet) {
  const entry = configuration?.[rankId]?.[key];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || entry.status !== 'configured') {
    unmet.push({ code: 'unresolved_requirement', requirement: key, targetRank: rankId, status: 'unresolved' });
    return null;
  }
  if (key === 'passedExamination') {
    if (typeof entry.value !== 'boolean') {
      unmet.push({ code: 'invalid_requirement', requirement: key, targetRank: rankId });
      return null;
    }
    return entry.value;
  }
  if (!Number.isSafeInteger(entry.value) || (key !== 'guildStanding' && entry.value < 0)) {
    unmet.push({ code: 'invalid_requirement', requirement: key, targetRank: rankId });
    return null;
  }
  return entry.value;
}

function ir0832EvaluateRankEligibility(progressionState, targetRankId = null, configuration = IR_V0832_DEFAULT_REQUIREMENTS) {
  const result = (fields = {}) => ({
    eligible: false,
    status: 'blocked',
    currentRank: null,
    nextRank: null,
    targetRank: targetRankId,
    unmetRequirements: [],
    errors: [],
    ...fields
  });
  if (!progressionState || typeof progressionState !== 'object' || Array.isArray(progressionState)) {
    return result({ status: 'invalid', errors: ['Missing or invalid progression record'] });
  }
  if (!ir0832RankConfigurationValid(configuration)) {
    return result({ status: 'invalid', errors: ['Malformed rank requirement configuration'] });
  }

  const currentRankId = progressionState.currentRank;
  const currentIndex = ir0832RankIndex(currentRankId);
  if (currentIndex < 0) {
    return result({ status: 'invalid', currentRank: currentRankId ?? null, errors: ['Missing or unknown current rank'] });
  }
  if (currentIndex === IR_V0832_RANK_DEFINITIONS.length - 1) {
    return result({
      status: 'maximum_rank', currentRank: currentRankId, nextRank: null, targetRank: null,
      unmetRequirements: [], errors: []
    });
  }

  const nextRank = IR_V0832_RANK_DEFINITIONS[currentIndex + 1].id;
  if (targetRankId != null && ir0832RankIndex(targetRankId) < 0) {
    return result({ currentRank: currentRankId, nextRank, errors: ['Unknown target rank'] });
  }
  if (targetRankId != null && targetRankId !== nextRank) {
    return result({ currentRank: currentRankId, nextRank, errors: ['Target rank must be the next rank in the approved ladder'] });
  }

  const target = nextRank;
  const unmetRequirements = [];
  const requiredContracts = ir0832RequirementValue(configuration, target, 'completedContracts', unmetRequirements);
  const requiredDuties = ir0832RequirementValue(configuration, target, 'completedDuties', unmetRequirements);
  const requiredStanding = ir0832RequirementValue(configuration, target, 'guildStanding', unmetRequirements);
  const examinationRequired = ir0832RequirementValue(configuration, target, 'passedExamination', unmetRequirements);

  const countUniqueIds = (rows, requiredStatus) => {
    if (!Array.isArray(rows)) return null;
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id.trim() || row.status !== requiredStatus) continue;
      ids.add(row.id);
    }
    return ids.size;
  };
  const countUniqueContractTemplates = rows => {
    if (!Array.isArray(rows)) return null;
    const templates = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || row.status !== 'completed' || row.rewardDelivered !== true) continue;
      if (!IR_V0832_QUALIFYING_CONTRACT_TEMPLATES.includes(row.templateId)) continue;
      templates.add(row.templateId);
    }
    return templates.size;
  };
  const actualContracts = countUniqueContractTemplates(progressionState.completedContracts);
  const actualDuties = countUniqueIds(progressionState.completedDuties, 'completed');
  if (requiredContracts > 0 && (actualContracts == null || actualContracts < requiredContracts)) {
    unmetRequirements.push({ code: actualContracts == null ? 'missing_statistic' : 'threshold_not_met', requirement: 'completedContracts', required: requiredContracts, actual: actualContracts });
  }
  if (requiredDuties != null && (actualDuties == null || actualDuties < requiredDuties)) {
    unmetRequirements.push({ code: actualDuties == null ? 'missing_statistic' : 'threshold_not_met', requirement: 'completedDuties', required: requiredDuties, actual: actualDuties });
  }
  if (requiredStanding != null && (!Number.isFinite(progressionState.guildStanding) || progressionState.guildStanding < requiredStanding)) {
    unmetRequirements.push({ code: Number.isFinite(progressionState.guildStanding) ? 'threshold_not_met' : 'missing_statistic', requirement: 'guildStanding', required: requiredStanding, actual: Number.isFinite(progressionState.guildStanding) ? progressionState.guildStanding : null });
  }
  if (examinationRequired === true && (!Array.isArray(progressionState.passedExaminations) || !progressionState.passedExaminations.includes(target))) {
    unmetRequirements.push({ code: 'examination_not_passed', requirement: 'passedExamination', targetRank: target });
  }

  const hasUnresolved = unmetRequirements.some(item => item.status === 'unresolved');
  const eligible = unmetRequirements.length === 0;
  return {
    eligible,
    status: eligible ? 'eligible' : hasUnresolved ? 'unresolved' : 'ineligible',
    currentRank: currentRankId,
    nextRank,
    targetRank: target,
    unmetRequirements,
    errors: []
  };
}

function ir0832ContractRankEligibility(contractId, currentRankId, contractRules = IR_V0832_CONTRACT_RANK_RULES) {
  if (typeof contractId !== 'string' || !contractId.trim() || ir0832RankIndex(currentRankId) < 0) {
    return { eligible: false, status: 'invalid', errors: ['A stable contract ID and valid rank are required'] };
  }
  const templateKey = contractId.startsWith('guild-contract:') ? contractId.slice(contractId.lastIndexOf(':') + 1) : null;
  const rule = contractRules && typeof contractRules === 'object'
    ? contractRules.byId?.[contractId] || contractRules[contractId] || (templateKey ? contractRules.byTemplate?.[templateKey] : null)
    : null;
  if (!rule || rule.status !== 'configured') {
    return { eligible: false, status: 'unresolved', contractId, currentRank: currentRankId, errors: ['Contract rank range is unresolved'] };
  }
  const minIndex = rule.minimumRank == null ? 0 : ir0832RankIndex(rule.minimumRank);
  const maxIndex = rule.maximumRank == null ? IR_V0832_RANK_DEFINITIONS.length - 1 : ir0832RankIndex(rule.maximumRank);
  if (minIndex < 0 || maxIndex < 0 || minIndex > maxIndex) {
    return { eligible: false, status: 'invalid', contractId, currentRank: currentRankId, errors: ['Malformed contract rank range'] };
  }
  const rankIndex = ir0832RankIndex(currentRankId);
  const eligible = rankIndex >= minIndex && rankIndex <= maxIndex;
  return { eligible, status: eligible ? 'eligible' : 'ineligible', contractId, currentRank: currentRankId, minimumRank: rule.minimumRank ?? null, maximumRank: rule.maximumRank ?? null, errors: [] };
}

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.3.5';
if (typeof globalThis !== 'undefined') {
  globalThis.IR_V0832_RANK_DEFINITIONS = IR_V0832_RANK_DEFINITIONS;
  globalThis.IR_V0832_DEFAULT_REQUIREMENTS = IR_V0832_DEFAULT_REQUIREMENTS;
  globalThis.IR_V0832_QUALIFYING_CONTRACT_TEMPLATES = IR_V0832_QUALIFYING_CONTRACT_TEMPLATES;
  globalThis.IR_V0832_CONTRACT_RANK_RULES = IR_V0832_CONTRACT_RANK_RULES;
  globalThis.ir0832RankIndex = ir0832RankIndex;
  globalThis.ir0832ValidateRankDefinitions = ir0832ValidateRankDefinitions;
  globalThis.ir0832EvaluateRankEligibility = ir0832EvaluateRankEligibility;
  globalThis.ir0832ContractRankEligibility = ir0832ContractRankEligibility;
}
