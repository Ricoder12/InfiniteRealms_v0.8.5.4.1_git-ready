'use strict';
// Infinite Realms v0.8.4.3 — active party foundation. Roles are administrative labels only.
const IR_V0843_PARTY_ROLES = Object.freeze(['leader', 'member', 'tank', 'damage dealer', 'healer', 'support']);
const IR_V0843_COMBAT_ROLES = Object.freeze(['tank', 'damage dealer', 'healer', 'support']);

function ir0843PartyNPC(character, npcId, world = state?.world) {
  if (typeof npcId !== 'string' || !npcId.trim()) return null;
  return character?.npcs?.find(npc => npc?.id === npcId)
    || world?.v06?.changes?.[npcId]
    || null;
}

function ir0843PartySquad(character, squadId) {
  const matches = (Array.isArray(character?.temporarySquads) ? character.temporarySquads : [])
    .filter(squad => squad?.id === squadId);
  return matches.length === 1 ? matches[0] : null;
}

function ir0843PartyMemberEligible(character, squad, npcId, world = state?.world) {
  if (!squad || !Array.isArray(squad.memberNpcIds) || !squad.memberNpcIds.includes(npcId)) return false;
  return ir0843PartyNPC(character, npcId, world)?.companionRecruitment?.status === 'recruited';
}

function ir0843PruneParty(character = state?.character, world = state?.world) {
  if (!character || !character.activeParty || typeof character.activeParty !== 'object') return null;
  const party = character.activeParty;
  const squad = ir0843PartySquad(character, party.squadId);
  if (!squad || !Array.isArray(party.members)) { character.activeParty = null; return null; }
  const seen = new Set();
  const members = [];
  for (const entry of party.members) {
    const npcId = entry?.npcId;
    if (typeof npcId !== 'string' || seen.has(npcId) || !ir0843PartyMemberEligible(character, squad, npcId, world)) continue;
    seen.add(npcId);
    const legacyCombatRole = IR_V0843_COMBAT_ROLES.includes(entry.role) ? entry.role : null;
    members.push({
      npcId,
      role: entry.role === 'leader' ? 'leader' : 'member',
      combatRole: IR_V0843_COMBAT_ROLES.includes(entry.combatRole) ? entry.combatRole : legacyCombatRole
    });
  }
  if (!members.length) { character.activeParty = null; return null; }
  let leaderAssigned = false;
  for (const member of members) {
    if (member.role === 'leader' && !leaderAssigned) leaderAssigned = true;
    else if (member.role === 'leader') member.role = 'member';
  }
  if (!leaderAssigned) members[0].role = 'leader';
  party.schema = 1;
  party.members = members;
  return party;
}

function ir0843ActiveParty() {
  const character = state?.character;
  const before = character?.activeParty ? JSON.stringify(character.activeParty) : null;
  const party = ir0843PruneParty(character);
  const after = character?.activeParty ? JSON.stringify(character.activeParty) : null;
  if (before !== after && typeof persist === 'function') persist();
  return party;
}

function ir0843FormParty(squadId, npcIds = null) {
  const character = state?.character;
  if (!character) return { ok: false, reason: 'No active character.' };
  const squad = ir0843PartySquad(character, squadId);
  if (!squad || !Array.isArray(squad.memberNpcIds)) return { ok: false, reason: 'Temporary squad not found or ambiguous.' };
  const requested = npcIds == null
    ? squad.memberNpcIds.filter(id => ir0843PartyMemberEligible(character, squad, id))
    : npcIds;
  if (!Array.isArray(requested) || !requested.length) return { ok: false, reason: 'Select at least one recruited squad member.' };
  if (new Set(requested).size !== requested.length) return { ok: false, reason: 'Party members must be unique.' };
  for (const npcId of requested) {
    if (!ir0843PartyMemberEligible(character, squad, npcId)) return { ok: false, reason: 'Every party member must be a recruited companion in the selected squad.' };
  }
  character.activeParty = {
    schema: 1,
    squadId: squad.id,
    createdAtDay: Math.max(0, Math.floor(Number(character.daysLived) || 0)),
    members: requested.map((npcId, index) => ({ npcId, role: index === 0 ? 'leader' : 'member' }))
  };
  if (typeof persist === 'function') persist();
  return { ok: true, party: character.activeParty };
}

function ir0843AddPartyMember(npcId) {
  const character = state?.character;
  const party = ir0843PruneParty(character);
  if (!party) return { ok: false, reason: 'Form an active party first.' };
  if (party.members.some(member => member.npcId === npcId)) return { ok: false, reason: 'NPC is already in the active party.' };
  const squad = ir0843PartySquad(character, party.squadId);
  if (!ir0843PartyMemberEligible(character, squad, npcId)) return { ok: false, reason: 'NPC must be a recruited companion in the active party squad.' };
  party.members.push({ npcId, role: 'member' });
  if (typeof persist === 'function') persist();
  return { ok: true, party };
}

function ir0843RemovePartyMember(npcId) {
  const character = state?.character;
  const party = ir0843PruneParty(character);
  if (!party) return { ok: false, reason: 'No active party.' };
  const index = party.members.findIndex(member => member.npcId === npcId);
  if (index < 0) return { ok: false, reason: 'NPC is not in the active party.' };
  const [removed] = party.members.splice(index, 1);
  if (!party.members.length) character.activeParty = null;
  else if (removed.role === 'leader') party.members[0].role = 'leader';
  if (typeof persist === 'function') persist();
  return { ok: true, party: character.activeParty };
}

function ir0843AssignPartyRole(npcId, role) {
  const character = state?.character;
  const party = ir0843PruneParty(character);
  if (!party) return { ok: false, reason: 'No active party.' };
  if (!IR_V0843_PARTY_ROLES.includes(role)) return { ok: false, reason: 'Unsupported party role.' };
  const member = party.members.find(entry => entry.npcId === npcId);
  if (!member) return { ok: false, reason: 'NPC is not in the active party.' };
  if (IR_V0843_COMBAT_ROLES.includes(role)) {
    member.combatRole = role;
    if (typeof persist === 'function') persist();
    return { ok: true, party };
  }
  member.combatRole = null;
  if (role === 'leader') {
    for (const entry of party.members) entry.role = entry === member ? 'leader' : 'member';
  } else {
    if (member.role === 'leader' && party.members.length < 2) return { ok: false, reason: 'The only party member must remain leader.' };
    member.role = 'member';
    if (!party.members.some(entry => entry.role === 'leader')) party.members.find(entry => entry !== member).role = 'leader';
  }
  if (typeof persist === 'function') persist();
  return { ok: true, party };
}

function ir0843DisbandParty() {
  const character = state?.character;
  if (!character?.activeParty) return { ok: false, reason: 'No active party.' };
  const party = character.activeParty;
  character.activeParty = null;
  if (typeof persist === 'function') persist();
  return { ok: true, party };
}

function ir0843SyncAfterMembershipChange() {
  const character = state?.character;
  if (!character?.activeParty) return;
  ir0843PruneParty(character);
  if (typeof persist === 'function') persist();
}

if (typeof ir0841RemoveTemporarySquadMember === 'function') {
  const ir0843RemoveSquadMemberBase = ir0841RemoveTemporarySquadMember;
  ir0841RemoveTemporarySquadMember = function () {
    const result = ir0843RemoveSquadMemberBase.apply(this, arguments);
    if (result?.ok) ir0843SyncAfterMembershipChange();
    return result;
  };
}
if (typeof ir0841DisbandTemporarySquad === 'function') {
  const ir0843DisbandSquadBase = ir0841DisbandTemporarySquad;
  ir0841DisbandTemporarySquad = function () {
    const result = ir0843DisbandSquadBase.apply(this, arguments);
    if (result?.ok) ir0843SyncAfterMembershipChange();
    return result;
  };
}
if (typeof ir0842DismissCompanion === 'function') {
  const ir0843DismissCompanionBase = ir0842DismissCompanion;
  ir0842DismissCompanion = function () {
    const result = ir0843DismissCompanionBase.apply(this, arguments);
    if (result?.ok) ir0843SyncAfterMembershipChange();
    return result;
  };
}

const ir0843NormalizeSaveBase = typeof normalizeSave === 'function' ? normalizeSave : null;
if (ir0843NormalizeSaveBase) normalizeSave = function (input) {
  let prepared;
  try { prepared = typeof clone === 'function' ? clone(input) : JSON.parse(JSON.stringify(input)); }
  catch (_) { return ir0843NormalizeSaveBase.apply(this, arguments); }
  const activeParty = prepared?.character?.activeParty;
  const normalized = ir0843NormalizeSaveBase.call(this, prepared);
  if (normalized?.character) {
    normalized.character.activeParty = activeParty && typeof activeParty === 'object' ? activeParty : null;
    ir0843PruneParty(normalized.character, normalized.world);
  }
  return normalized;
};

function ir0843PartyPanel() {
  const character = state?.character;
  if (!character) return '';
  const party = ir0843ActiveParty();
  const squads = typeof ir0841Squads === 'function' ? ir0841Squads(character) : [];
  const formOptions = squads.map(squad => {
    const eligible = [...new Set(Array.isArray(squad?.memberNpcIds) ? squad.memberNpcIds : [])]
      .filter(id => ir0843PartyMemberEligible(character, squad, id));
    return `<article class="ir0843-squad-option"><div><strong>${esc(squad.name || 'Temporary Squad')}</strong><p>${eligible.length} eligible recruited companion${eligible.length === 1 ? '' : 's'}</p></div><button class="button small primary" data-action="ir0843-form-party" data-squad="${esc(squad.id)}" ${eligible.length ? '' : 'disabled'}>Form party</button></article>`;
  }).join('');
  const partyHtml = party ? `<section class="ir0843-active-party"><div class="panel-heading"><div><h3>Active party</h3><p>Leader/member labels organize the roster. Combat roles use supported encounter actions where available.</p></div><button class="button small danger" data-action="ir0843-disband-party">Disband party</button></div>${party.members.map(member => {
    const npc = ir0843PartyNPC(character, member.npcId);
    const combatRole = IR_V0843_COMBAT_ROLES.includes(member.combatRole) ? member.combatRole : null;
    const baseRoleActions = combatRole
      ? `<button class="button small" data-action="ir0843-assign-party-role" data-npc="${esc(member.npcId)}" data-role="${member.role}">Clear combat role</button>`
      : `${member.role !== 'leader' ? `<button class="button small" data-action="ir0843-assign-party-role" data-npc="${esc(member.npcId)}" data-role="leader">Make leader</button>` : ''}${member.role !== 'member' ? `<button class="button small" data-action="ir0843-assign-party-role" data-npc="${esc(member.npcId)}" data-role="member">Set member</button>` : ''}`;
    return `<article class="ir0843-party-member"><div><strong>${esc(npc?.name || member.npcId)}</strong><p>${esc(npc?.role || 'Companion')} · ${member.role === 'leader' ? 'Party leader' : 'Party member'} · Combat: ${combatRole ? esc(combatRole) : 'unmodified'}</p></div><div class="ir0843-party-actions">${baseRoleActions}${combatRole !== 'tank' ? `<button class="button small" data-action="ir0843-assign-party-role" data-npc="${esc(member.npcId)}" data-role="tank">Tank</button>` : ''}${combatRole !== 'damage dealer' ? `<button class="button small" data-action="ir0843-assign-party-role" data-npc="${esc(member.npcId)}" data-role="damage dealer">Damage dealer</button>` : ''}${combatRole !== 'healer' ? `<button class="button small" data-action="ir0843-assign-party-role" data-npc="${esc(member.npcId)}" data-role="healer">Healer</button>` : ''}${combatRole !== 'support' ? `<button class="button small" data-action="ir0843-assign-party-role" data-npc="${esc(member.npcId)}" data-role="support">Support</button>` : ''}<button class="button small subtle" data-action="ir0843-remove-party-member" data-npc="${esc(member.npcId)}">Remove</button></div></article>`;
  }).join('')}${(() => {
    const squad = ir0843PartySquad(character, party.squadId);
    const candidates = [...new Set(squad?.memberNpcIds || [])].filter(id => !party.members.some(member => member.npcId === id) && ir0843PartyMemberEligible(character, squad, id));
    return candidates.map(id => { const npc = ir0843PartyNPC(character, id); return `<article class="ir0843-party-member"><div><strong>${esc(npc?.name || id)}</strong><p>Eligible squad companion</p></div><button class="button small" data-action="ir0843-add-party-member" data-npc="${esc(id)}">Add to party</button></article>`; }).join('');
  })()}</section>` : '<p class="notice">No active party. Form one from a squad with recruited companions.</p>';
  return `<section class="panel panel-pad ir0843-party-panel"><div class="panel-heading"><div><div class="eyebrow">PARTY FORMATION</div><h2>Traveling party</h2><p>Tank and damage dealer affect companion combat calculations. Support can guard the player; healer recovery uses existing rest and healer services.</p></div><span class="tag">PARTY FOUNDATION</span></div>${partyHtml}<div class="ir0843-squad-options"><h3>Temporary squads</h3>${formOptions || '<p class="empty">No temporary squads are available yet. Recruit a companion or create a squad first.</p>'}</div></section>`;
}

const ir0843PeopleScreenBase = typeof ir06PeopleScreen === 'function' ? ir06PeopleScreen : null;
if (ir0843PeopleScreenBase) ir06PeopleScreen = function () { return `${ir0843PeopleScreenBase.apply(this, arguments)}${ir0843PartyPanel()}`; };

const ir0843ActionBase = typeof ir072Action === 'function' ? ir072Action : null;
if (ir0843ActionBase) ir072Action = function (target) {
  const action = target?.dataset?.action;
  const handlers = {
    'ir0843-form-party': () => ir0843FormParty(target.dataset.squad),
    'ir0843-add-party-member': () => ir0843AddPartyMember(target.dataset.npc),
    'ir0843-remove-party-member': () => ir0843RemovePartyMember(target.dataset.npc),
    'ir0843-assign-party-role': () => ir0843AssignPartyRole(target.dataset.npc, target.dataset.role),
    'ir0843-disband-party': () => ir0843DisbandParty()
  };
  if (!handlers[action]) return ir0843ActionBase.apply(this, arguments);
  if (typeof ir072Blocked === 'function' && ir072Blocked()) { toast('Resolve the current combat or event first.'); return true; }
  const result = handlers[action]();
  if (result.ok) toast(action === 'ir0843-form-party' ? 'Active party formed.' : 'Party updated.');
  else toast(result.reason);
  render();
  return true;
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.4.4';
if (typeof globalThis !== 'undefined') {
  globalThis.IR_V0843_PARTY_ROLES = IR_V0843_PARTY_ROLES;
  globalThis.ir0843ActiveParty = ir0843ActiveParty;
  globalThis.ir0843FormParty = ir0843FormParty;
  globalThis.ir0843AddPartyMember = ir0843AddPartyMember;
  globalThis.ir0843RemovePartyMember = ir0843RemovePartyMember;
  globalThis.ir0843AssignPartyRole = ir0843AssignPartyRole;
  globalThis.ir0843DisbandParty = ir0843DisbandParty;
}
