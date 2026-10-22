'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ document: { title: '' }, globalThis: null });
context.globalThis = context;
vm.runInContext(fs.readFileSync(path.join(root, 'js/game/67-adventurer-rank-eligibility-v0.8.3.5.js'), 'utf8'), context);
const evaluate = context.ir0832EvaluateRankEligibility;
const definitions = context.IR_V0832_RANK_DEFINITIONS;
assert.deepEqual(Array.from(definitions, row => row.id), ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS']);
assert.equal(context.ir0832ValidateRankDefinitions().ok, true);
assert.equal(context.ir0832ValidateRankDefinitions([{ id: 'E', order: 0 }]).ok, false);
assert.equal(definitions.at(-1).id, 'SSS');
assert.equal(context.ir0832RankIndex('SSSS'), -1);

const missingRank = evaluate({}, 'E');
assert.equal(missingRank.status, 'invalid');
assert.match(missingRank.errors[0], /current rank/i);
const unknownRank = evaluate({ currentRank: 'A+' });
assert.equal(unknownRank.status, 'invalid');
const skipRank = evaluate({ currentRank: 'F' }, 'D');
assert.equal(skipRank.status, 'blocked');
assert.match(skipRank.errors[0], /next rank/i);
const maxRank = evaluate({ currentRank: 'SSS' }, 'SSS');
assert.equal(maxRank.status, 'maximum_rank');
assert.equal(maxRank.nextRank, null);
assert.equal(maxRank.targetRank, null);

const baselineInput = {
  currentRank: 'F',
  completedContracts: [{ id: 'x', status: 'completed' }, { id: 'x', status: 'completed' }],
  completedDuties: [],
  guildStanding: -1,
  passedExaminations: []
};
const original = JSON.stringify(baselineInput);
const defaults = evaluate(baselineInput, 'E');
assert.equal(defaults.status, 'ineligible');
assert.equal(defaults.eligible, false);
assert.equal(defaults.unmetRequirements.some(row => row.requirement === 'completedDuties' && row.required === 3), true);
assert.equal(defaults.unmetRequirements.some(row => row.requirement === 'passedExamination'), true);
assert.equal(JSON.stringify(baselineInput), original);

const approvedRequirements = context.IR_V0832_DEFAULT_REQUIREMENTS;
assert.deepEqual(Object.fromEntries(Object.entries(approvedRequirements).map(([rank, req]) => [rank, [req.completedContracts.value, req.completedDuties.value, req.guildStanding.value, req.passedExamination.value]])), {
  E: [0, 3, 0, true], D: [1, 5, 10, true], C: [2, 8, 20, true], B: [2, 12, 30, true],
  A: [3, 16, 40, true], S: [3, 20, 50, true], SS: [3, 25, 65, true], SSS: [3, 100, 90, true]
});
assert.deepEqual(Array.from(context.IR_V0832_QUALIFYING_CONTRACT_TEMPLATES), ['route-survey', 'monster-signs', 'supply-ledger']);

const approvedTestConfig = {
  E: {
    completedContracts: { status: 'configured', value: 0 },
    completedDuties: { status: 'configured', value: 0 },
    guildStanding: { status: 'configured', value: 0 },
    passedExamination: { status: 'configured', value: true }
  }
};
const passingInput = {
  currentRank: 'F',
  completedContracts: [],
  completedDuties: [{ id: 'duty:1', status: 'completed' }, { id: 'duty:2', status: 'completed' }, { id: 'duty:3', status: 'completed' }],
  guildStanding: 0,
  passedExaminations: ['E']
};
const defaultEEligible = { ...passingInput, completedDuties: passingInput.completedDuties, completedContracts: [] };
assert.equal(evaluate(defaultEEligible, 'E').status, 'eligible');
const missingHistoryInput = { ...passingInput, completedContracts: undefined };
assert.equal(evaluate(missingHistoryInput, 'E').status, 'eligible', 'E has zero contract templates required, so absent contract history does not block that rank');
const customContractConfig = { D: {
  completedContracts: { status: 'configured', value: 1 }, completedDuties: { status: 'configured', value: 0 },
  guildStanding: { status: 'configured', value: 0 }, passedExamination: { status: 'configured', value: false }
} };
const duplicateTemplateEvidence = [
  { id: 'guild-a:route-survey', templateId: 'route-survey', status: 'completed', rewardDelivered: true },
  { id: 'guild-b:route-survey', templateId: 'route-survey', status: 'completed', rewardDelivered: true },
  { id: 'guild-a:monster-signs', templateId: 'monster-signs', status: 'active', rewardDelivered: false }
];
const templateCount = evaluate({ currentRank: 'E', completedContracts: duplicateTemplateEvidence, completedDuties: [], guildStanding: 0, passedExaminations: [] }, 'D', customContractConfig);
assert.equal(templateCount.status, 'eligible');
const unfinalizedTemplate = evaluate({ currentRank: 'E', completedContracts: [{ id: 'x', templateId: 'route-survey', status: 'completed', rewardDelivered: false }], completedDuties: [], guildStanding: 0, passedExaminations: [] }, 'D', customContractConfig);
assert.equal(unfinalizedTemplate.status, 'ineligible');
const examNotRequiredConfig = { E: { ...approvedTestConfig.E, passedExamination: { status: 'configured', value: false } } };
assert.equal(evaluate({ ...passingInput, passedExaminations: [] }, 'E', examNotRequiredConfig).status, 'eligible');
assert.equal(evaluate(passingInput, 'E', { E: { ...approvedTestConfig.E, completedDuties: { status: 'configured', value: -1 } } }).status, 'invalid');
assert.equal(evaluate({ ...passingInput, guildStanding: -1 }, 'E', approvedTestConfig).status, 'ineligible');
assert.equal(evaluate({ ...passingInput, guildStanding: undefined }, 'E', approvedTestConfig).unmetRequirements.some(row => row.code === 'missing_statistic'), true);
assert.equal(evaluate(passingInput, 'E', approvedTestConfig).status, 'eligible');
assert.equal(evaluate(passingInput, 'E', { ...approvedTestConfig, E: { ...approvedTestConfig.E, completedContracts: { status: 'configured', value: 2 } } }).status, 'ineligible');
const missingContractCount = evaluate({ currentRank: 'E', completedContracts: undefined, completedDuties: [], guildStanding: 10, passedExaminations: ['D'] }, 'D');
assert.equal(missingContractCount.unmetRequirements.some(row => row.code === 'missing_statistic' && row.requirement === 'completedContracts'), true, 'Missing required contract history remains unknown instead of becoming zero');
const sssInput = {
  currentRank: 'SS',
  completedContracts: ['route-survey', 'monster-signs', 'supply-ledger'].map((templateId, index) => ({ id: `contract-${index}`, templateId, status: 'completed', rewardDelivered: true })),
  completedDuties: Array.from({ length: 100 }, (_, index) => ({ id: `duty-${index}`, status: 'completed' })),
  guildStanding: 90,
  passedExaminations: ['SSS']
};
assert.equal(evaluate(sssInput, 'SSS').eligible, true, 'SSS depends on approved requirements and does not require top-five placement');

const contractUnknown = context.ir0832ContractRankEligibility('guild-contract:guild-x:route-survey', 'F');
assert.equal(contractUnknown.status, 'unresolved');
assert.equal(contractUnknown.eligible, false);
const contractTestRules = { 'guild-contract:guild-x:route-survey': { status: 'configured', minimumRank: 'D', maximumRank: 'SSS' } };
assert.equal(context.ir0832ContractRankEligibility('guild-contract:guild-x:route-survey', 'F', contractTestRules).status, 'ineligible');
assert.equal(context.ir0832ContractRankEligibility('guild-contract:guild-x:route-survey', 'D', contractTestRules).status, 'eligible');
assert.equal(context.ir0832ContractRankEligibility('contract:bad', 'SSS', { 'contract:bad': { status: 'configured', minimumRank: 'SSS', maximumRank: 'F' } }).status, 'invalid');

console.log('v0.8.3.5 rank eligibility tests: PASS');
