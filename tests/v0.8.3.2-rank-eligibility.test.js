'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ document: { title: '' }, globalThis: null });
context.globalThis = context;
vm.runInContext(fs.readFileSync(path.join(root, 'js/game/67-adventurer-rank-eligibility-v0.8.3.2.js'), 'utf8'), context);
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
assert.equal(defaults.status, 'unresolved');
assert.equal(defaults.eligible, false);
assert.equal(defaults.unmetRequirements.filter(row => row.status === 'unresolved').length, 4);
assert.equal(JSON.stringify(baselineInput), original);

const approvedTestConfig = {
  E: {
    completedContracts: { status: 'configured', value: 1 },
    completedDuties: { status: 'configured', value: 0 },
    guildStanding: { status: 'configured', value: 0 },
    passedExamination: { status: 'configured', value: true }
  }
};
const passingInput = {
  currentRank: 'F',
  completedContracts: [{ id: 'contract:one', status: 'completed' }],
  completedDuties: [],
  guildStanding: 0,
  passedExaminations: ['E']
};
assert.equal(evaluate(passingInput, 'E', approvedTestConfig).status, 'eligible');
const examNotRequiredConfig = { E: { ...approvedTestConfig.E, passedExamination: { status: 'configured', value: false } } };
assert.equal(evaluate({ ...passingInput, passedExaminations: [] }, 'E', examNotRequiredConfig).status, 'eligible');
assert.equal(evaluate(passingInput, 'E', { E: { ...approvedTestConfig.E, completedDuties: { status: 'configured', value: -1 } } }).status, 'invalid');
assert.equal(evaluate({ ...passingInput, completedContracts: [] }, 'E', approvedTestConfig).status, 'ineligible');
assert.equal(evaluate({ ...passingInput, guildStanding: undefined }, 'E', approvedTestConfig).unmetRequirements.some(row => row.code === 'missing_statistic'), true);
assert.equal(evaluate(passingInput, 'E', approvedTestConfig).status, 'eligible');
assert.equal(evaluate(passingInput, 'E', { ...approvedTestConfig, E: { ...approvedTestConfig.E, completedContracts: { status: 'configured', value: 2 } } }).status, 'ineligible');

const contractUnknown = context.ir0832ContractRankEligibility('guild-contract:guild-x:route-survey', 'F');
assert.equal(contractUnknown.status, 'unresolved');
assert.equal(contractUnknown.eligible, false);
const contractTestRules = { 'guild-contract:guild-x:route-survey': { status: 'configured', minimumRank: 'D', maximumRank: 'SSS' } };
assert.equal(context.ir0832ContractRankEligibility('guild-contract:guild-x:route-survey', 'F', contractTestRules).status, 'ineligible');
assert.equal(context.ir0832ContractRankEligibility('guild-contract:guild-x:route-survey', 'D', contractTestRules).status, 'eligible');
assert.equal(context.ir0832ContractRankEligibility('contract:bad', 'SSS', { 'contract:bad': { status: 'configured', minimumRank: 'SSS', maximumRank: 'F' } }).status, 'invalid');

console.log('v0.8.3.2 rank eligibility tests: PASS');
