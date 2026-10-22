'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function makeGame({ persistResult = true, authority = true } = {}) {
  const examiner = { id: 'fixture-grandmaster-1', name: 'Fixture Examiner', associationRole: 'grandmaster', workSite: 'site-a' };
  const character = {
    daysLived: 42,
    factionStanding: { adventurers: 0 },
    adventurerProgression: {
      schema: 1, currentRank: 'F', dutyCredit: 3,
      activeDuties: [], dutyHistory: [1, 2, 3].map(n => ({ id: `duty-${n}`, status: 'completed', credit: 1 })),
      dailyCredit: { day: 42, byCategory: {} }, processedEventIds: [], nextDutySequence: 1,
      nextEventSequence: 1, pendingGatherEvent: null
    },
    guildContractState: null,
    npcs: [examiner]
  };
  const world = { v06: { changes: { [examiner.id]: examiner } }, region: { sites: [{ id: 'site-a' }] }, siteId: 'site-a', organizations: [{ id: 'guild-a', organizationType: 'adventurers-guild' }] };
  if (authority) world.associationLeadership = {
    schema: 1, grandmasterNpcId: examiner.id, delegatedExaminerNpcIds: []
  };
  const context = vm.createContext({
    document: { title: '' },
    state: { character, world },
    modal: { npc: examiner.id },
    esc: value => String(value ?? ''),
    ir0833CurrentProgression: c => c.adventurerProgression,
    ir0833RankProgressionInput: c => ({
      currentRank: c.adventurerProgression.currentRank,
      completedDuties: c.adventurerProgression.dutyHistory.map(row => ({ id: row.id, status: row.status })),
      status: 'ready'
    }),
    ir0834ContractStateValid: c => c.guildContractState == null || Array.isArray(c.guildContractState?.accepted) ? { ok: true, errors: [] } : { ok: false, errors: ['fixture invalid'] },
    ir072NPC: id => character.npcs.find(row => row.id === id) || null,
    ir072IsPresent: npc => npc.workSite === 'site-a',
    ir072InteractionModal: () => '<div>base interaction</div>',
    ir072Action: () => false,
    renderModal: () => '<div>base modal</div>',
    render: () => {},
    toast: () => {},
    persist: () => persistResult
  });
  context.globalThis = context;
  for (const file of [
    'js/game/67-adventurer-rank-eligibility-v0.8.3.5.js',
    'js/game/70-adventurer-examination-promotion-v0.8.3.5.js'
  ]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return context;
}

const game = makeGame();
assert.equal(game.ir0835ExamAuthority('fixture-grandmaster-1').authorized, true);
assert.equal(game.ir0835Eligibility().status, 'ineligible');
assert.equal(game.ir0835Eligibility(game.state.character, true).eligible, true);
assert.match(game.ir0835RankReviewMarkup('fixture-grandmaster-1'), /Record PASS and promote/);
const promoted = game.ir0835RecordExamination('fixture-grandmaster-1', 'E', 'PASS', '2026-10-19T00:00:00.000Z');
assert.equal(promoted.ok, true);
assert.equal(promoted.rank, 'E');
assert.equal(game.state.character.adventurerProgression.currentRank, 'E');
assert.equal(game.state.character.adventurerRankRecords.examinations.length, 1);
assert.equal(game.state.character.adventurerRankRecords.promotions.length, 1);
assert.equal(game.ir0835RankRecordValid(game.state.character.adventurerRankRecords, game.state.character.adventurerProgression.adventurerId).ok, true);
assert.equal(game.ir0835RecordExamination('fixture-grandmaster-1', 'E', 'PASS').ok, false, 'A repeated click cannot promote the same rank twice');
const reloadedCharacter = JSON.parse(JSON.stringify(game.state.character));
assert.equal(game.ir0835RankRecordValid(reloadedCharacter.adventurerRankRecords, reloadedCharacter.adventurerProgression.adventurerId).ok, true, 'Exam and promotion history survives save/load serialization');
assert.equal(reloadedCharacter.adventurerProgression.currentRank, 'E');
assert.match(game.ir0835ExaminerModal('fixture-grandmaster-1'), /Global Grandmaster/);

const noAuthority = makeGame({ authority: false });
assert.equal(noAuthority.ir0835ExamAuthority('fixture-grandmaster-1').status, 'unconfigured');
assert.equal(noAuthority.ir0835RecordExamination('fixture-grandmaster-1', 'E', 'PASS').ok, false);
assert.match(noAuthority.ir0835GuildRankServiceCard({ id: 'fixture-branch-master', guildServiceRole: 'guildmaster' }, { name: 'Fixture Guild' }), /no authoritative Association Grandmaster is registered/i);
const brokenAuthorityCard = makeGame();
brokenAuthorityCard.state.character.npcs = [];
delete brokenAuthorityCard.state.world.v06.changes['fixture-grandmaster-1'];
assert.match(brokenAuthorityCard.ir0835GuildRankServiceCard({ id: 'fixture-branch-master', guildServiceRole: 'guildmaster' }, { name: 'Fixture Guild' }), /configured Grandmaster does not resolve/i);

const crossBranch = makeGame();
crossBranch.state.character.adventurerProgression.currentRank = 'E';
crossBranch.state.character.adventurerProgression.dutyHistory = Array.from({ length: 5 }, (_, index) => ({ id: `duty-${index}`, status: 'completed', credit: 1 }));
crossBranch.state.character.factionStanding.adventurers = 10;
crossBranch.state.character.guildContractState = { accepted: [
  { instanceId: 'a-route', templateId: 'route-survey', status: 'completed', rewardDelivered: true, rewardTransactionId: 'guild-contract-reward:a-route', rewardAmount: 20 },
  { instanceId: 'b-route', templateId: 'route-survey', status: 'completed', rewardDelivered: true, rewardTransactionId: 'guild-contract-reward:b-route', rewardAmount: 20 },
  { instanceId: 'a-monster-active', templateId: 'monster-signs', status: 'active', rewardDelivered: false },
  { instanceId: 'a-supply-no-receipt', templateId: 'supply-ledger', status: 'completed', rewardDelivered: false }
] };
const crossBranchEvidence = crossBranch.ir0835CompletedContractEvidence(crossBranch.state.character);
assert.equal(crossBranchEvidence.rows.length, 2, 'Only finalized qualifying templates across branches enter the evidence list');
assert.equal(crossBranch.ir0835Eligibility(crossBranch.state.character, true).eligible, true, 'Two copies of one template count once toward the next-rank threshold');

const delegated = makeGame();
const branchMaster = { id: 'fixture-branch-master', name: 'Fixture Branch Master', guildServiceRole: 'guildmaster', organizationId: 'guild-a', workSite: 'site-a' };
delegated.state.character.npcs.push(branchMaster);
delegated.state.world.associationLeadership.delegatedExaminerNpcIds = [branchMaster.id];
assert.equal(delegated.ir0835ExamAuthority(branchMaster.id).authorized, true);
assert.equal(delegated.ir0835ExamAuthority('fixture-grandmaster-1').authorized, true);

const notGuildmaster = makeGame();
notGuildmaster.state.character.npcs.push({ id: 'fixture-other', occupation: 'Scholar', workSite: 'site-a' });
notGuildmaster.state.world.associationLeadership.delegatedExaminerNpcIds = ['fixture-other'];
assert.equal(notGuildmaster.ir0835ExamAuthority('fixture-other').status, 'invalid');

const duplicateGrandmaster = makeGame();
duplicateGrandmaster.state.world.v06.changes['fixture-grandmaster-2'] = { id: 'fixture-grandmaster-2', associationRole: 'grandmaster' };
assert.equal(duplicateGrandmaster.ir0835ExamAuthority('fixture-grandmaster-1').status, 'invalid');

const failedExam = makeGame();
const failure = failedExam.ir0835RecordExamination('fixture-grandmaster-1', 'E', 'FAIL', '2026-10-19T00:00:00.000Z');
assert.equal(failure.ok, true);
assert.equal(failure.promotion, null);
assert.equal(failedExam.state.character.adventurerProgression.currentRank, 'F');
assert.equal(failedExam.state.character.adventurerRankRecords.examinations[0].result, 'FAIL');
assert.equal(failedExam.state.character.adventurerRankRecords.promotions.length, 0);

const noStanding = makeGame();
delete noStanding.state.character.factionStanding.adventurers;
assert.equal(noStanding.ir0835Eligibility(noStanding.state.character, true).status, 'ineligible', 'Missing standing is not inferred as zero');

const duplicateDuties = makeGame();
duplicateDuties.state.character.adventurerProgression.dutyHistory.push({ id: 'duty-1', status: 'completed', credit: 1 });
assert.equal(duplicateDuties.ir0835Eligibility(duplicateDuties.state.character, true).eligible, true, 'Duplicate duty IDs do not inflate the threshold count');

const invalidDelegation = makeGame();
invalidDelegation.state.world.associationLeadership.delegatedExaminerNpcIds = ['missing-npc'];
assert.equal(invalidDelegation.ir0835ExamAuthority('fixture-grandmaster-1').status, 'invalid');

const saveFailure = makeGame({ persistResult: false });
const notSaved = saveFailure.ir0835RecordExamination('fixture-grandmaster-1', 'E', 'PASS', '2026-10-19T00:00:00.000Z');
assert.equal(notSaved.ok, false);
assert.equal(saveFailure.state.character.adventurerProgression.currentRank, 'F');
assert.equal(saveFailure.state.character.adventurerRankRecords, undefined);

const malformedIdentity = makeGame();
malformedIdentity.state.character.adventurerProgression.adventurerId = 17;
const preservedId = malformedIdentity.state.character.adventurerProgression.adventurerId;
assert.equal(malformedIdentity.ir0835RankState(malformedIdentity.state.character, true).ok, false);
assert.equal(malformedIdentity.state.character.adventurerProgression.adventurerId, preservedId, 'Malformed saved IDs are quarantined, never replaced');

console.log('v0.8.3.5 adventurer examination/promotion tests: PASS');
