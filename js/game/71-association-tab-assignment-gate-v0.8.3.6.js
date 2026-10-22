'use strict';
// Infinite Realms v0.8.3.6 — authoritative Association overview and shared assignment gate.

const IR_V0836_ASSOCIATION_NAME = 'Adventurers’ Association';
let ir0836AcceptanceInFlight = false;

function ir0836RawProgression(character = state?.character) {
  if (!character) return { ok: false, reason: 'Character records are unavailable.' };
  if (character.adventurerProgressionIntegrity?.status === 'quarantined') return { ok: false, reason: character.adventurerProgressionIntegrity.reason || 'Adventurer progression is quarantined.' };
  if (character.adventurerProgression == null) return { ok: true, progression: null };
  const result = ir0833ProgressionValidation(character.adventurerProgression, state?.world?.organizations);
  return result.ok ? { ok: true, progression: character.adventurerProgression } : { ok: false, reason: `Adventurer progression is invalid: ${result.errors.join('; ')}` };
}

function ir0836RawContracts(character = state?.character) {
  if (!character) return { ok: false, reason: 'Character records are unavailable.' };
  if (character.guildContractIntegrity?.status === 'quarantined') return { ok: false, reason: character.guildContractIntegrity.reason || 'Guild contract records are quarantined.' };
  if (character.guildContractState == null) return { ok: true, contractState: null };
  const result = ir0834ContractStateValid(character, state?.world?.organizations);
  return result.ok ? { ok: true, contractState: character.guildContractState } : { ok: false, reason: `Guild contract records are invalid: ${result.errors.join('; ')}` };
}

function ir0836AssignmentSnapshot({ finalizeDueDuties = false } = {}) {
  const character = state?.character;
  if (!character) return { ok: false, reason: 'Character records are unavailable.', assignments: [], conflict: false };
  const dutyCheck = ir0836RawProgression(character), contractCheck = ir0836RawContracts(character);
  if (!dutyCheck.ok || !contractCheck.ok) return { ok: false, reason: dutyCheck.reason || contractCheck.reason, assignments: [], conflict: false };
  let progression = dutyCheck.progression;
  if (finalizeDueDuties && progression) {
    const before = JSON.stringify(progression);
    const expired = ir0833ExpireDue(progression, character.daysLived);
    if (expired.length && !persist()) {
      character.adventurerProgression = JSON.parse(before);
      return { ok: false, reason: 'An expired duty could not be saved. Its assignment slot remains held.', assignments: [], conflict: false };
    }
  }
  const contracts = contractCheck.contractState?.accepted || [];
  const duties = progression?.activeDuties || [];
  const assignments = [
    ...contracts.filter(row => row?.status === 'active').map(row => ({ kind: 'contract', id: row.instanceId, guildId: row.guildId, templateId: row.templateId, status: row.status, record: row })),
    ...duties.filter(row => row?.status === 'active').map(row => ({ kind: 'duty', id: row.id, guildId: row.guildId, templateId: row.templateId, status: row.status, record: row }))
  ];
  return { ok: true, assignments, conflict: assignments.length > 1, reason: assignments.length > 1 ? 'Existing save contains multiple active Association assignments. Preserve and resolve these records before accepting another.' : null };
}

function ir0836AssignmentGateMessage() {
  if (ir0836AcceptanceInFlight) return 'An Association assignment request is already being processed.';
  const snapshot = ir0836AssignmentSnapshot({ finalizeDueDuties: true });
  if (!snapshot.ok) return `New assignments are unavailable: ${snapshot.reason}`;
  if (snapshot.conflict) return snapshot.reason;
  if (snapshot.assignments.length) {
    const current = snapshot.assignments[0];
    const title = current.kind === 'contract'
      ? IR_V0824_GUILD_OFFER_TEMPLATES.find(row => row.key === current.templateId)?.title
      : IR_V0833_DUTY_TEMPLATES.find(row => row.id === current.templateId)?.title;
    return `You already have an active Association ${current.kind}${title ? ` (“${title}”)` : ''}. Finalize or close it under its existing rules before accepting another.`;
  }
  return '';
}

function ir0836NpcById(id) {
  if (!id) return null;
  const all = typeof ir0835KnownNpcRecords === 'function' ? ir0835KnownNpcRecords() : new Map([
    ...(state?.character?.npcs || []).map(npc => [npc?.id, npc]),
    ...Object.entries(state?.world?.v06?.changes || {})
  ]);
  return all.get(id) || null;
}

function ir0836FormatRank() {
  const rank = state?.character?.adventurerProgression?.currentRank;
  return IR_V0832_RANK_DEFINITIONS?.some(row => row.id === rank) ? rank : 'Unavailable';
}

function ir0836AssignmentTitle(assignment) {
  if (assignment.kind === 'contract') return IR_V0824_GUILD_OFFER_TEMPLATES.find(row => row.key === assignment.templateId)?.title || assignment.templateId;
  return IR_V0833_DUTY_TEMPLATES.find(row => row.id === assignment.templateId)?.title || assignment.templateId;
}

function ir0836AssignmentDescription(assignment) {
  const row = assignment.record;
  if (assignment.kind === 'duty') {
    const days = Math.max(0, Math.floor(Number(state?.character?.daysLived) || 0)) - row.acceptedDay;
    const expiry = days >= IR_V0833_PROGRESSION_CONFIG.dutyDurationDays
      ? 'Expiry boundary reached; the slot stays occupied until the existing expiry transition is saved.'
      : `${Math.max(0, IR_V0833_PROGRESSION_CONFIG.dutyDurationDays - days)} in-game day(s) remain.`;
    return `Objective progress: ${row.progress}/${row.required}. ${expiry} Duties retain the existing cancellation rule.`;
  }
  const objective = row.objective || {};
  let detail = objective.status ? `Objective status: ${objective.status}.` : 'Objective details are unavailable.';
  if (row.templateId === 'route-survey') detail += ` Route: ${objective.routeId || 'not selected'}; ${objective.traversed ? 'travel verified' : 'awaiting verified travel'}.`;
  if (row.templateId === 'monster-signs') detail += ` ${objective.enemyId ? `Target: ${IR_ENEMIES?.[objective.enemyId]?.name || objective.enemyId}.` : 'No qualifying target recorded yet.'}`;
  if (row.templateId === 'supply-ledger') detail += ` ${objective.reportedItemId ? `Reported item: ${ITEMS?.[objective.reportedItemId]?.name || objective.reportedItemId}.` : 'No shortage report submitted yet.'}`;
  detail += ` Reward ${row.rewardDelivered ? `recorded (${row.rewardAmount} coins)` : 'is issued only during verified completion and turn-in'}.`;
  return detail;
}

function ir0836Leadership() {
  const leadership = state?.world?.associationLeadership;
  if (!leadership) return { text: 'No Association Grandmaster is configured in this world.', npc: null };
  const npc = ir0836NpcById(leadership.grandmasterNpcId);
  if (!npc || typeof ir0835ExamAuthority !== 'function' || !ir0835ExamAuthority(npc.id).authorized) return { text: 'Grandmaster record is configured but its authority or NPC reference cannot be resolved.', npc: null };
  return { text: `Grandmaster: ${npc.name}`, npc };
}

function ir0836GuildStaff(organization, role, field) {
  const id = organization?.[field];
  if (!id) return { id: null, npc: null, text: `No ${role} is configured.` };
  const npc = ir0836NpcById(id);
  if (!npc || npc.organizationId !== organization.id || npc.guildServiceRole !== role) return { id, npc: null, text: `${role === 'guildmaster' ? 'Guildmaster' : 'Receptionist'} reference is unresolved.` };
  return { id, npc, text: `${role === 'guildmaster' ? 'Guildmaster' : 'Receptionist'}: ${npc.name}` };
}

function ir0836CanOpenHere(organization, npc) {
  const guildSite = ir0822GuildSite(state?.world, organization);
  return !!(guildSite && site()?.id === guildSite.id && npc && ir072IsPresent(npc));
}

function ir0836CurrentMembership(organizations) {
  const guild = organizations.find(row => ir0825GuildMembership(state?.character, row));
  return guild ? { guild, standing: ir0825GuildStanding(state.character, guild) } : null;
}

function ir0836QuestSection(snapshot, organizations) {
  if (!snapshot.ok) return `<div class="notice">Assignment records are unavailable; saved data was preserved. ${esc(snapshot.reason)}</div>`;
  const active = snapshot.assignments;
  const activeBlock = snapshot.conflict
    ? `<div class="notice warning"><strong>Assignment conflict.</strong> ${esc(snapshot.reason)} Existing assignments were not changed. No additional assignment can be accepted.</div>${active.map(row => `<article class="ir0836-assignment"><strong>${esc(ir0836AssignmentTitle(row))} · ${esc(row.kind)}</strong><p>${esc(ir0836AssignmentDescription(row))}</p></article>`).join('')}`
    : active.length
      ? `<div class="notice"><strong>One active assignment.</strong> ${esc(ir0836AssignmentTitle(active[0]))} (${esc(active[0].kind)}). Additional Association contracts and duties are blocked until this record reaches a saved terminal state.</div><article class="ir0836-assignment"><h4>${esc(ir0836AssignmentTitle(active[0]))}</h4><p>${esc(ir0836AssignmentDescription(active[0]))}</p><small>Issuing branch: ${esc(organizations.find(row => row.id === active[0].guildId)?.name || 'Unknown branch')}</small></article>`
      : '<div class="empty">No active Association assignment.</div>';
  const contracts = state.character.guildContractState?.accepted || [];
  const duties = state.character.adventurerProgression?.dutyHistory || [];
  const history = [
    ...contracts.filter(row => row.status === 'completed').map(row => ({ ...row, kind: 'contract', title: ir0836AssignmentTitle({ kind: 'contract', templateId: row.templateId }) })),
    ...duties.filter(row => ['completed', 'cancelled', 'expired'].includes(row.status)).map(row => ({ ...row, kind: 'duty', title: ir0836AssignmentTitle({ kind: 'duty', templateId: row.templateId }) }))
  ].sort((a, b) => (Number(b.completedDay ?? b.closedDay ?? b.acceptedDay) || 0) - (Number(a.completedDay ?? a.closedDay ?? a.acceptedDay) || 0)).slice(0, 8);
  const historyBlock = history.length ? `<ul class="ir0836-history">${history.map(row => `<li><strong>${esc(row.title)}</strong> · ${esc(row.kind)} · ${esc(row.status)}${row.kind === 'contract' && row.rewardDelivered ? ` · ${row.rewardAmount} coins recorded` : row.kind === 'duty' && row.status === 'completed' ? ` · ${row.credit || 0} credit` : ''}</li>`).join('')}</ul>` : '<div class="empty">No completed Association assignment history is recorded.</div>';
  const memberGuildId = organizations.find(org => ir0825GuildMembership(state.character, org))?.id || null;
  const currentSiteId = site()?.id || null;
  const selectedGuildId = memberGuildId || organizations.find(org => ir0822GuildSite(state?.world, org)?.id === currentSiteId)?.id || null;
  const serviceRows = organizations.map(org => {
    const receptionist = ir0836GuildStaff(org, 'receptionist', 'receptionistNpcId');
    const master = ir0836GuildStaff(org, 'guildmaster', 'guildmasterNpcId');
    const guildSite = ir0822GuildSite(state?.world, org);
    const here = ir0836CanOpenHere(org, receptionist.npc);
    const service = here ? `<div class="ir0836-service-actions"><button class="button small" data-action="ir0836-open-contracts" data-guild="${esc(org.id)}" data-npc="${esc(receptionist.id)}">Contract board</button><button class="button small" data-action="ir0836-open-duties" data-guild="${esc(org.id)}" data-npc="${esc(receptionist.id)}">Duty board</button><button class="button small subtle" data-action="ir0836-open-npc" data-npc="${esc(receptionist.id)}">Receptionist</button>${master.npc && ir0836CanOpenHere(org, master.npc) ? `<button class="button small subtle" data-action="ir0836-open-npc" data-npc="${esc(master.id)}">Guildmaster</button>` : ''}</div>` : `<div class="ir0836-service-actions"><button class="button small subtle" data-tab="World">View branch on world map</button><small>Services require being at ${esc(guildSite?.name || 'the configured branch')}.</small></div>`;
    const selected = org.id === selectedGuildId;
    const locationText = guildSite?.name || 'Location unavailable';
    return `<article id="ir0837-branch-${esc(org.id)}" class="ir0836-branch ir0837-branch ${selected ? 'is-selected' : ''}" data-branch-id="${esc(org.id)}"><div class="ir0836-branch-head"><div class="ir0837-branch-info"><div class="ir0837-branch-title"><strong>${esc(org.name || 'Unnamed Adventurers’ Guild')}</strong><span class="tag ${selected ? 'gold' : ''}">${selected ? (memberGuildId === org.id ? 'YOUR BRANCH' : 'HERE') : 'BRANCH'}</span></div><p>${esc(org.description || 'No branch description is configured.')}</p><dl class="ir0837-branch-facts"><div><dt>Location</dt><dd>${esc(locationText)}</dd></div><div><dt>Reception</dt><dd>${esc(receptionist.text)}</dd></div><div><dt>Leadership</dt><dd>${esc(master.text)}</dd></div></dl></div>${service}</div></article>`;
  }).join('');
  const locked = active.length || snapshot.conflict;
  return `<section class="panel panel-pad ir0836-section"><div class="panel-heading"><div><div class="eyebrow">QUEST MANAGEMENT</div><h2>Assignments</h2><p>Contracts and duties share one active-assignment slot across all branches.</p></div><span class="tag ${locked ? 'gold' : ''}">${snapshot.conflict ? 'CONFLICT' : active.length ? 'ACTIVE' : 'AVAILABLE'}</span></div>${activeBlock}<nav class="ir0837-branch-nav" aria-label="Association branches">${organizations.map(org => `<a class="button small ${org.id === selectedGuildId ? 'primary' : ''}" href="#ir0837-branch-${encodeURIComponent(org.id)}">${esc(org.name || 'Unnamed branch')} · ${esc(ir0822GuildSite(state?.world, org)?.name || 'location unavailable')}</a>`).join('') || '<span class="empty">No branches to navigate.</span>'}</nav><h3>Branches and boards</h3>${serviceRows || '<div class="empty">No Adventurers’ Guild branches are registered in this world.</div>'}<h3>Recent history</h3>${historyBlock}</section>`;
}

function ir0836AssociationView() {
  const organizations = (Array.isArray(state?.world?.organizations) ? state.world.organizations : []).filter(row => row?.organizationType === 'adventurers-guild');
  const member = ir0836CurrentMembership(organizations), character = state.character;
  const progression = character.adventurerProgression;
  const standing = member && Number.isFinite(member.standing) ? `${member.standing >= 0 ? '+' : ''}${member.standing}` : member ? 'Unavailable' : 'Not a member';
  const publicRep = Number.isFinite(character.reputation) ? `${character.reputation >= 0 ? '+' : ''}${character.reputation}` : 'Unavailable';
  const leadership = ir0836Leadership();
  const snapshot = ir0836AssignmentSnapshot();
  const rankReason = progression?.currentRank ? `Current personal adventurer rank: ${esc(ir0836FormatRank())}.` : 'Personal adventurer rank is unavailable; no value was inferred.';
  const rankService = organizations.map(org => {
    const master = ir0836GuildStaff(org, 'guildmaster', 'guildmasterNpcId');
    return master.npc && ir0836CanOpenHere(org, master.npc)
      ? `<button class="button small" data-action="ir0836-open-npc" data-npc="${esc(master.id)}">Rank review with ${esc(master.npc.name)}</button>` : '';
  }).filter(Boolean).join('');
  const leader = leadership.npc
    ? `<article class="ir0836-branch"><strong>${esc(leadership.text)}</strong><p>Association-wide leadership record.</p></article>`
    : `<div class="empty">${esc(leadership.text)}</div>`;
  const memberStatus = member ? `Member of ${esc(member.guild.name)}.` : 'No active Adventurers’ Association membership is recorded.';
  const standingText = member ? `Association standing: ${esc(standing)}.` : 'Association standing: not available without an active membership record.';
  const roster = member ? `<div class="ir0836-member-row"><strong>${esc(character.name || 'Player character')}</strong><span>Registered player record</span><span>Rank ${esc(ir0836FormatRank())}</span><span>${esc(member.guild.name)} · member</span><span>Standing ${esc(standing)}</span></div><div class="notice">This is the player record only. The current source has no authoritative global member registry; this roster is not a complete membership list or leaderboard.</div>` : '<div class="empty">No authoritative member roster is registered in this world. Your saved personal rank remains separate from membership.</div>';
  const configuredServices = [
    'Branch reception and membership inquiries',
    'Guild contract board and verified turn-in',
    'Guild duty board, cancellation, delivery, and existing expiry',
    'Guildmaster rank review; examinations require configured Association examiner authority'
  ];
  return `${pageHead('Adventurers’ Association','Membership, personal rank, branch staff, and persistent assignments.')}
    <div class="ir0836-overview-grid">
      <section class="panel panel-pad ir0836-section"><div class="panel-heading"><div><div class="eyebrow">ASSOCIATION OVERVIEW</div><h2>${IR_V0836_ASSOCIATION_NAME}</h2><p>Organization type: Adventurers’ Guild association · ${organizations.length} registered branch(es).</p></div><span class="tag gold">WORLD RECORDS</span></div><div class="ir0836-facts"><div><small>Membership</small><strong>${memberStatus}</strong></div><div><small>Personal rank</small><strong>${rankReason}</strong></div><div><small>Association standing</small><strong>${standingText}</strong></div><div><small>Public reputation</small><strong>${esc(publicRep)} · independent character reputation</strong></div><div><small>Branch affiliation</small><strong>${member ? esc(member.guild.name) : 'No current branch affiliation recorded'}</strong></div></div><h3>Existing services</h3><ul class="ir0836-service-list">${configuredServices.map(text => `<li>${esc(text)}</li>`).join('')}</ul>${rankService}</section>
      <section class="panel panel-pad ir0836-section"><div class="panel-heading"><div><div class="eyebrow">ASSOCIATION LEADERSHIP</div><h2>Known leadership</h2><p>Branch receptionists and guildmasters are listed with their branch details below.</p></div></div>${leader}</section>
      <section class="panel panel-pad ir0836-section ir0836-wide"><div class="panel-heading"><div><div class="eyebrow">MEMBERS & RANKS</div><h2>Available member records</h2><p>Personal rank is distinct from membership, standing, and reputation.</p></div></div>${roster}</section>
    </div>${ir0836QuestSection(snapshot, organizations)}`;
}

if (!NAV.some(([name]) => name === 'Association')) NAV.push(['Association', '⚑']);

const ir0836RenderBase = render;
render = function () {
  if (state?.character && state.view === 'Association') {
    const app = typeof document !== 'undefined' ? document.querySelector('#app') : null;
    if (app) app.innerHTML = shell(ir0836AssociationView());
    return;
  }
  return ir0836RenderBase.apply(this, arguments);
};

const ir0836AcceptContractBase = ir0834AcceptContract;
ir0834AcceptContract = function () {
  const message = ir0836AssignmentGateMessage();
  if (message) { toast(message); render(); return true; }
  ir0836AcceptanceInFlight = true;
  try { return ir0836AcceptContractBase.apply(this, arguments); }
  finally { ir0836AcceptanceInFlight = false; }
};

const ir0836GuildActionBase = ir0833GuildAction;
ir0833GuildAction = function (action) {
  if (action !== 'ir0833-accept-duty') return ir0836GuildActionBase.apply(this, arguments);
  const message = ir0836AssignmentGateMessage();
  if (message) { toast(message); render(); return true; }
  ir0836AcceptanceInFlight = true;
  try { return ir0836GuildActionBase.apply(this, arguments); }
  finally { ir0836AcceptanceInFlight = false; }
};

const ir0836RenderModalBase = renderModal;
renderModal = function () { return ir0836RenderModalBase.apply(this, arguments); };

const ir0836GuildActionDispatcherBase = ir072Action;
ir072Action = function (target) {
  const action = target?.dataset?.action;
  if (action === 'ir0836-open-npc') {
    const npc = ir0836NpcById(target.dataset.npc);
    if (!npc || !ir072IsPresent(npc)) { toast('That Association staff member is unavailable at the current location.'); return true; }
    modal = { kind: 'ir072-interactions', npc: npc.id }; render(); return true;
  }
  if (action === 'ir0836-open-contracts' || action === 'ir0836-open-duties') {
    const organization = state?.world?.organizations?.find(row => row?.id === target.dataset.guild && row.organizationType === 'adventurers-guild');
    const npc = ir0836NpcById(target.dataset.npc);
    if (!organization || npc?.organizationId !== organization.id || npc.guildServiceRole !== 'receptionist' || !ir0836CanOpenHere(organization, npc)) { toast('That branch service is unavailable here. Visit its configured location and speak with the recorded receptionist.'); return true; }
    if (action === 'ir0836-open-contracts') modal = { kind: 'ir0824-guild-contract-board', guildId: organization.id, npcId: npc.id };
    else modal = { kind: 'ir0833-guild-duty-board', guildId: organization.id, npcId: npc.id };
    render(); return true;
  }
  return ir0836GuildActionDispatcherBase.apply(this, arguments);
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.3.6';
if (typeof globalThis !== 'undefined') {
  globalThis.ir0836AssignmentSnapshot = ir0836AssignmentSnapshot;
  globalThis.ir0836AssignmentGateMessage = ir0836AssignmentGateMessage;
  globalThis.ir0836AssociationView = ir0836AssociationView;
}
