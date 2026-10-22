'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceDir = path.resolve(__dirname, '..');
let gameContext;
const context = gameContext = vm.createContext({
  console,
  Math: Object.create(Math),
  document: { title: '' },
  IR_V0832_RANK_DEFINITIONS: ['F','E','D','C','B','A','S','SS','SSS'].map((id, order) => ({ id, order })),
  IR_ENEMIES: { goblin: { id: 'goblin' } },
  ITEMS: { herb: { name: 'Bitterleaf' }, bandage: { name: 'Field Bandage' } },
  IR_V0762_GATHERING_METHODS: ['mining','woodcutting','herbalism','fishing'],
  IR_V0822_GUILD_SERVICE_ROLES: ['receptionist','guildmaster'],
  state: null,
  modal: null,
  toasts: [],
  saved: 0,
  persistResult: true,
  toast(message) { gameContext.toasts.push(String(message)); },
  render() {},
  esc(value) { return String(value ?? ''); },
  site() { return gameContext.state?.world?.region?.sites?.[0] || null; },
  ir072NPC(id) { return gameContext.state?.character?.npcs?.find(row => row.id === id) || null; },
  ir072IsPresent() { return true; },
  ir0822GuildSite(_world, organization) { return organization ? gameContext.site() : null; },
  ir0825GuildMembership(character, organization) { return character?.factionMembership === 'adventurers' && organization?.factionId === 'adventurers'; },
  ir0825GuildStanding() { return 0; },
  ir072Action() { return 'delegated'; },
  ir0823GuildMembershipModal() { return '<div><button data-action="ir0824-open-contract-board">Guild contracts</button></div><div class="modal-actions">Close</div>'; },
  renderModal() { return 'base modal'; },
  normalizeSave(input) { return JSON.parse(JSON.stringify(input)); },
  persist() { gameContext.saved++; return gameContext.persistResult; },
  dayPass(days) { gameContext.state.character.daysLived += days; },
  startCombat(enemyId) { gameContext.state.combat = { active: true, enemyId, source: { type: 'wild' } }; gameContext.persist(); return true; },
  ir04Gather(method) { if (method === 'herbalism' && gameContext.Math.random() < 0.5) gameContext.state.character.inventory.herb += 1; gameContext.persist(); return true; },
  irCombatEnd(kind) { gameContext.state.combat = null; gameContext.persist(); return kind; }
});
context.Math.random = () => 0;
context.globalThis = context;
vm.runInContext(fs.readFileSync(path.join(sourceDir, 'js/game/67-adventurer-rank-eligibility-v0.8.3.5.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(sourceDir, 'js/game/68-guild-duty-progression-v0.8.3.3.js'), 'utf8'), context);

const run = code => vm.runInContext(code, context);
const makeChar = extra => ({ name: 'Test', daysLived: 0, inventory: { herb: 0, bandage: 0 }, factionMembership: 'adventurers', ...extra });
const guild = { id: 'guild:test', organizationType: 'adventurers-guild', factionId: 'adventurers' };
const receptionist = { id: 'npc:receptionist', name: 'Mara', guildServiceRole: 'receptionist', organizationId: guild.id };
const makeState = character => ({ character: { npcs: [receptionist], ...character }, world: { organizations: [guild], region: { sites: [{ id: 'site:test', name: 'Guild Hall' }] } }, calendar: {}, combat: null });
const accept = template => run(`ir072Action({dataset:{action:'ir0833-accept-duty',npc:${JSON.stringify(receptionist.id)},template:${JSON.stringify(template)}}})`);
const action = (name, attributes = {}) => run(`ir072Action({dataset:${JSON.stringify({ action: name, npc: receptionist.id, ...attributes })}})`);
const progression = () => context.state.character.adventurerProgression;

assert.equal(context.ir0833SourcesVerified(), true);
assert.deepEqual(Array.from(context.IR_V0833_DUTY_TEMPLATES, row => row.targetId), ['goblin','herb','bandage']);
assert.deepEqual(JSON.parse(JSON.stringify(context.ir0833CreditPolicy('monster-defeat'))), { amount: 1, cap: 2 });
assert.equal(context.ir0833CreditPolicy('monster-defeat', {}), null);
const unconfiguredDuty = { category: 'monster-defeat', creditAwarded: false };
const unconfiguredProgression = context.ir0833EnsureProgression(makeChar()).progression;
assert.equal(context.ir0833AwardCompletion(unconfiguredProgression, unconfiguredDuty, 'unconfigured', 0, {}), false);
assert.equal(unconfiguredProgression.dutyCredit, 0);
assert.equal(unconfiguredDuty.credit, 0);
context.IR_ENEMIES.goblin.id = 'mismatched-goblin';
assert.equal(context.ir0833SourcesVerified(), false);
context.IR_ENEMIES.goblin.id = 'goblin';

// Missing personal progression initializes to F; existing rank and unknown fields are preserved.
const migrated = context.ir0833EnsureProgression(makeChar({ customField: { keep: true } }));
assert.equal(migrated.progression.currentRank, 'F');
assert.equal(migrated.progression.dutyCredit, 0);
const existing = makeChar({ adventurerProgression: { schema: 1, currentRank: 'B', custom: 'preserved' } });
const existingResult = context.ir0833EnsureProgression(existing);
assert.equal(existingResult.progression.currentRank, 'B');
assert.equal(existing.adventurerProgression.custom, 'preserved');
const corruptValue = { schema: 1, currentRank: 'A+', custom: 'do not replace' };
const corrupt = makeChar({ adventurerProgression: corruptValue });
assert.equal(context.ir0833EnsureProgression(corrupt).ok, false);
assert.deepEqual(corrupt.adventurerProgression, corruptValue);
assert.equal(corrupt.adventurerProgressionIntegrity.status, 'quarantined');
const badGuildRef = makeChar({ adventurerProgression: {
  schema: 1, currentRank: 'F', dutyCredit: 0,
  activeDuties: [{ id: 'guild-duty:missing:goblin-defeat-3:1', templateId: 'goblin-defeat-3', category: 'monster-defeat', guildId: 'guild:missing', progress: 0, required: 3, acceptedDay: 0, status: 'active', creditAwarded: false, credit: 0 }],
  dutyHistory: [], dailyCredit: { day: 0, byCategory: {} }, processedEventIds: [], nextDutySequence: 2, nextEventSequence: 1, pendingGatherEvent: null
} });
const badGuildRaw = JSON.stringify(badGuildRef.adventurerProgression);
assert.equal(context.ir0833EnsureProgression(badGuildRef, [guild]).ok, false);
assert.equal(JSON.stringify(badGuildRef.adventurerProgression), badGuildRaw);

// Migration through the actual normalizeSave wrapper is repeatable and preserves unrelated data.
const oldSave = { character: makeChar({ coin: 42, inventory: { herb: 3, bandage: 2 }, relationships: { npc1: { trust: 7 } } }) };
const once = context.normalizeSave(oldSave);
const twice = context.normalizeSave(once);
assert.equal(once.character.adventurerProgression.currentRank, 'F');
assert.equal(twice.character.adventurerProgression.currentRank, 'F');
assert.equal(twice.character.coin, 42);
assert.equal(twice.character.inventory.herb, 3);
assert.equal(twice.character.relationships.npc1.trust, 7);

// Combat progress only comes from confirmed goblin victories, and duplicate event IDs are idempotent.
context.state = makeState(makeChar());
accept('goblin-defeat-3');
context.startCombat('goblin');
const combatEventId = context.state.combat.ir0833DutyEventId;
assert.ok(combatEventId);
context.irCombatEnd('victory');
assert.equal(progression().activeDuties[0].progress, 1);
assert.equal(context.ir0833ProgressEvent({ id: combatEventId, category: 'monster-defeat', targetId: 'goblin', quantity: 1 }).duplicate, true);
assert.equal(progression().activeDuties[0].progress, 1);
context.state = makeState(JSON.parse(JSON.stringify(context.state.character)));
assert.equal(context.ir0833ProgressEvent({ id: combatEventId, category: 'monster-defeat', targetId: 'goblin', quantity: 1 }).duplicate, true);
assert.equal(progression().activeDuties[0].progress, 1);
context.startCombat('wolf'); context.irCombatEnd('victory');
assert.equal(progression().activeDuties[0].progress, 1);
for (let i = 0; i < 2; i++) { context.startCombat('goblin'); context.irCombatEnd('victory'); }
assert.equal(progression().dutyHistory[0].status, 'completed');
assert.equal(progression().dutyCredit, 1);

// Completed duties beyond the approved category cap remain complete and receive no credit.
for (let instance = 0; instance < 2; instance++) {
  accept('goblin-defeat-3');
  for (let i = 0; i < 3; i++) { context.startCombat('goblin'); context.irCombatEnd('victory'); }
}
assert.equal(progression().dutyCredit, 2);
assert.equal(progression().dutyHistory.filter(row => row.status === 'completed' && row.category === 'monster-defeat').length, 3);
assert.equal(progression().dutyHistory.at(-1).credit, 0);
context.state.character.daysLived = 1;
accept('goblin-defeat-3');
for (let i = 0; i < 3; i++) { context.startCombat('goblin'); context.irCombatEnd('victory'); }
assert.equal(progression().dutyCredit, 3);
assert.equal(progression().dailyCredit.day, 1);
assert.equal(progression().dailyCredit.byCategory['monster-defeat'], 1);

// Successful herbalism outputs actual Bitterleaf quantity; unrelated methods and events do not count.
context.state = makeState(makeChar());
accept('bitterleaf-gather-5');
context.ir04Gather('woodcutting');
assert.equal(progression().activeDuties[0].progress, 0);
context.Math.random = () => 0.999;
context.ir04Gather('herbalism');
assert.equal(progression().activeDuties[0].progress, 0);
context.Math.random = () => 0;
for (let i = 0; i < 5; i++) context.ir04Gather('herbalism');
assert.equal(progression().dutyHistory[0].progress, 5);
assert.equal(progression().dutyHistory[0].credit, 1);

const quarantinedCharacter = makeChar({ adventurerProgression: { schema: 1, currentRank: 'A+' } });
context.ir0833EnsureProgression(quarantinedCharacter);
context.state = makeState(quarantinedCharacter);
context.ir04Gather('herbalism');
assert.equal(context.state.character.inventory.herb, 1, 'quarantining progression does not block ordinary gathering');
assert.equal(context.state.character.adventurerProgression.currentRank, 'A+', 'ordinary gameplay preserves corrupt progression data');

// A gathering saved between item output and callback completion is reconciled exactly once on load.
const pendingSave = { character: makeChar({ inventory: { herb: 2, bandage: 0 }, adventurerProgression: {
  schema: 1, currentRank: 'F', dutyCredit: 0, activeDuties: [{ id: 'guild-duty:guild:test:bitterleaf-gather-5:1', templateId: 'bitterleaf-gather-5', category: 'resource-gathering', guildId: guild.id, progress: 0, required: 5, acceptedDay: 0, status: 'active', creditAwarded: false, credit: 0 }], dutyHistory: [], dailyCredit: { day: 0, byCategory: {} }, processedEventIds: [], nextDutySequence: 2, nextEventSequence: 2, pendingGatherEvent: { id: 'duty-event:gather-herbalism:1', method: 'herbalism', resourceId: 'herb', beforeQuantity: 1 }
} }) };
const recovered = context.normalizeSave(pendingSave);
assert.equal(recovered.character.adventurerProgression.activeDuties[0].progress, 1);
assert.equal(recovered.character.adventurerProgression.pendingGatherEvent, null);
const recoveredAgain = context.normalizeSave(recovered);
assert.equal(recoveredAgain.character.adventurerProgression.activeDuties[0].progress, 1);

// Item delivery is performed only at the issuing receptionist, removes accepted inventory atomically,
// supports partial delivery, and awards credit only when the full objective completes.
context.state = makeState(makeChar({ inventory: { herb: 0, bandage: 1 } }));
accept('field-bandage-delivery-2');
let deliveryDuty = progression().activeDuties[0];
const token1 = `${deliveryDuty.id}:deliver:${deliveryDuty.progress}:0:1`;
action('ir0833-deliver-duty', { duty: deliveryDuty.id, operation: token1 });
assert.equal(context.state.character.inventory.bandage, 0);
assert.equal(deliveryDuty.progress, 1);
assert.equal(progression().dutyCredit, 0);
context.state.character.inventory.bandage = 1;
const token2 = `${deliveryDuty.id}:deliver:1:0:1`;
action('ir0833-deliver-duty', { duty: deliveryDuty.id, operation: token2 });
assert.equal(progression().dutyHistory[0].status, 'completed');
assert.equal(progression().dutyCredit, 1);
assert.equal(context.state.character.inventory.bandage, 0);

// Cancelling is available without active membership and awards no credit; expiry is before the boundary event.
context.state = makeState(makeChar());
accept('goblin-defeat-3');
const cancelId = progression().activeDuties[0].id;
context.state.character.factionMembership = null;
action('ir0833-cancel-duty', { duty: cancelId });
assert.equal(progression().dutyHistory[0].status, 'cancelled');
assert.equal(progression().dutyCredit, 0);
context.state.character.factionMembership = 'adventurers';
accept('goblin-defeat-3');
context.state.character.daysLived = 14;
context.ir0833ProgressEvent({ id: 'boundary-event', category: 'monster-defeat', targetId: 'goblin', quantity: 1 });
assert.equal(progression().activeDuties.length, 0);
assert.equal(progression().dutyHistory.at(-1).status, 'expired');
assert.equal(progression().dutyCredit, 0);

// Failed persistence rolls back acceptance and cancellation state.
context.state = makeState(makeChar());
context.persistResult = false;
accept('goblin-defeat-3');
assert.equal(progression().activeDuties.length, 0);
assert.equal(progression().nextDutySequence, 1);
context.persistResult = true;
accept('goblin-defeat-3');
const retryId = progression().activeDuties[0].id;
context.persistResult = false;
action('ir0833-cancel-duty', { duty: retryId });
assert.equal(progression().activeDuties.length, 1);
assert.equal(progression().activeDuties[0].status, 'active');
context.persistResult = true;

// UI integration is contextual and does not replace the contract board.
context.state = makeState(makeChar());
context.modal = { npc: receptionist.id };
assert.match(context.ir0823GuildMembershipModal(), /Open duties/);
context.modal = { kind: 'ir0833-guild-duty-board', npcId: receptionist.id, guildId: guild.id };
assert.match(context.renderModal(), /Clear out goblin raiders/);
context.modal = { kind: 'ir0824-guild-contract-board', guildId: guild.id };
assert.equal(context.renderModal(), 'base modal');

console.log('v0.8.3.3 guild duty progression tests: PASS');

