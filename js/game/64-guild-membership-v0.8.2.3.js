'use strict';
// Infinite Realms v0.8.2.3 — guild services use the established shared faction membership.

function ir0823GuildMembershipModal() {
  const npc = ir072NPC(modal?.npc);
  if (!npc?.guildServiceRole || !IR_V0822_GUILD_SERVICE_ROLES.includes(npc.guildServiceRole)) return null;
  const organization = state?.world?.organizations?.find(record => record?.id === npc.organizationId && record?.organizationType === 'adventurers-guild');
  const guildSite = ir0822GuildSite(state?.world, organization);
  const present = !!(organization && guildSite && site()?.id === guildSite.id && ir072IsPresent(npc));
  const isMaster = npc.guildServiceRole === 'guildmaster';
  const roleName = isMaster ? 'Guildmaster' : 'Guild receptionist';
  const member = ir0825GuildMembership(state?.character, organization);
  const membership = state?.character?.factionMembership || null;
  const standing = ir0825GuildStanding(state?.character, organization) ?? 0;
  const eligibility = typeof ir051FactionEligibility === 'function'
    ? ir051FactionEligibility('adventurers') : { ok: false, reason: 'Membership requirements are unavailable.' };
  const desc = organization?.description ? `<p>${esc(organization.description)}</p>` : '';
  const staff = [organization?.receptionistNpcId, organization?.guildmasterNpcId]
    .filter(Boolean).map(id => ir072NPC(id)).filter(Boolean)
    .map(record => `${record.guildServiceRole === 'guildmaster' ? 'Guildmaster' : 'Receptionist'}: ${record.name}`);
  const information = organization
    ? `<section class="notice"><strong>${esc(organization.name)}</strong>${desc}<p>Location: ${esc(guildSite?.name || 'Unknown location')} · ${staff.length ? esc(staff.join(' · ')) : 'No service personnel recorded.'}</p><p>Membership requirement: ${esc(IR_V05_FACTION_DEFS.adventurers?.req || 'See the People faction panel for current eligibility.')}</p></section>` : '';
  const unavailable = !organization || !guildSite
    ? '<section class="notice">This guild service is unavailable because its organization or location reference cannot be resolved.</section>'
    : !present
      ? `<section class="notice">${esc(roleName)} ${esc(npc.name)} is assigned to ${esc(guildSite.name)} and is not available at the current location.</section>` : '';
  const memberText = member
    ? `You are a member of the Adventurers’ Guild. Shared faction standing: ${standing >= 0 ? '+' : ''}${standing}.`
    : membership
      ? `You are not a member of this guild. The existing foundation allows one active faction membership; leave ${esc(IR_V05_FACTION_DEFS[membership]?.name || membership)} before joining.`
      : `You are not currently a member. ${eligibility.ok ? 'You currently meet the existing requirements.' : esc(eligibility.reason)}`;
  const memberActions = member
    ? `<button class="button small" data-action="ir0823-guild-membership" data-npc="${esc(npc.id)}">Inspect membership</button><button class="button small danger" data-action="ir0823-guild-leave" data-npc="${esc(npc.id)}">Leave guild</button>`
    : `<button class="button small primary" data-action="ir0823-guild-join" data-npc="${esc(npc.id)}" ${eligibility.ok ? '' : 'disabled'} title="${esc(eligibility.reason)}">Join guild</button>${!eligibility.ok ? `<small class="ir051-reason">${esc(eligibility.reason)}</small>` : ''}`;
  const actions = present ? `<div class="ir072-action-grid">
    <article class="ir072-action-card"><div class="ir072-action-copy"><strong>${isMaster ? 'Guild expectations' : 'Membership information'}</strong><p>${isMaster ? 'The guildmaster can explain guild expectations and your current standing. Rank advancement is not part of this service.' : 'Ask about eligibility and the existing membership process.'}</p></div><button class="button small" data-action="ir0823-guild-inquiry" data-npc="${esc(npc.id)}">Ask</button></article>
    <article class="ir072-action-card"><div class="ir072-action-copy"><strong>Membership status</strong><p>${memberText}</p><small>${esc(ir0825GuildStandingLabel(state?.character, organization))}</small></div>${memberActions}</article>
    <article class="ir072-action-card"><div class="ir072-action-copy"><strong>Guild contracts</strong><p>Review this guild’s offers and accept one if your membership is active.</p></div><button class="button small" data-action="ir0824-open-contract-board" data-npc="${esc(npc.id)}">View board</button></article></div>` : '';
  return `<div class="overlay" data-dismiss="modal"><section class="modal ir072-modal" role="dialog" aria-modal="true" aria-label="${esc(roleName)} ${esc(npc.name)}"><div class="modal-header"><div><div class="eyebrow">GUILD SERVICES · V0.8.2.5</div><h2>${esc(npc.icon || '⚔️')} ${esc(npc.name)}</h2><p>${esc(roleName)} · ${esc(organization?.name || 'Unknown guild')}</p></div><button class="close-btn" data-action="ir072-close" aria-label="Close interactions">×</button></div>${information}${unavailable}${actions}<div class="modal-actions"><button class="button" data-action="ir072-close">Close</button></div></section></div>`;
}

const ir0823InteractionModalBase = ir072InteractionModal;
ir072InteractionModal = function () { return ir0823GuildMembershipModal() || ir0823InteractionModalBase.apply(this, arguments); };

const ir0823ActionBase = ir072Action;
ir072Action = function (target) {
  const action = target?.dataset?.action;
  if (!['ir0823-guild-inquiry', 'ir0823-guild-membership', 'ir0823-guild-join', 'ir0823-guild-leave'].includes(action)) return ir0823ActionBase.apply(this, arguments);
  const npc = ir072RequireNPC(target.dataset.npc);
  if (!npc?.guildServiceRole || !IR_V0822_GUILD_SERVICE_ROLES.includes(npc.guildServiceRole)) return true;
  const organization = state?.world?.organizations?.find(record => record?.id === npc.organizationId && record?.organizationType === 'adventurers-guild');
  const guildSite = ir0822GuildSite(state?.world, organization);
  if (!organization || !guildSite || site()?.id !== guildSite.id) { toast('This guild service is unavailable at the current location.'); return true; }
  const character = state.character;
  const member = ir0825GuildMembership(character, organization);
  const standing = ir0825GuildStanding(character, organization) ?? 0;
  if (action === 'ir0823-guild-join') {
    if (member) { toast('You already belong to the Adventurers’ Guild.'); return true; }
    const eligibility = ir051FactionEligibility('adventurers');
    if (!eligibility.ok) { toast(eligibility.reason); render(); return true; }
    ir05JoinFaction('adventurers');
    return true;
  }
  if (action === 'ir0823-guild-leave') {
    if (!member) { toast('You are not a member of the Adventurers’ Guild.'); return true; }
    modal = { kind: 'confirm-faction-leave', faction: 'adventurers' };
    render();
    return true;
  }
  const text = action === 'ir0823-guild-membership'
    ? `${member ? 'You are a member' : 'You are not a member'} of the Adventurers’ Guild. Shared faction standing is ${standing >= 0 ? '+' : ''}${standing}.`
    : `${npc.name} explained ${organization.name} membership. ${member ? 'Your membership is active.' : `Eligibility: ${ir051FactionEligibility('adventurers').reason}`}`;
  toast(text);
  return true;
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.2.3';
