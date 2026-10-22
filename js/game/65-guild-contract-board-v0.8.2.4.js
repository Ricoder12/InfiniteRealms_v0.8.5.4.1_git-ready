'use strict';
// Infinite Realms v0.8.2.4 — minimal guild offers and persistent acceptance only.

const IR_V0824_GUILD_OFFER_TEMPLATES = Object.freeze([
  Object.freeze({ key: 'route-survey', title: 'Survey a Guild Route', category: 'Reconnaissance', description: 'Record the condition of a nearby route and note hazards travelers should know about.', objective: 'Visit and survey the route. Objective progress is not tracked in this release.' }),
  Object.freeze({ key: 'monster-signs', title: 'Report Monster Signs', category: 'Investigation', description: 'Investigate credible signs of dangerous creatures near settled roads and report what you find.', objective: 'Investigate the reported signs. Objective progress is not tracked in this release.' }),
  Object.freeze({ key: 'supply-ledger', title: 'Check a Supply Ledger', category: 'Guild Support', description: 'Review a guild supply record and identify shortages that could affect local travelers.', objective: 'Review the supply record. Objective progress is not tracked in this release.' })
]);

function ir0824GuildOffers(organization) {
  if (!organization || organization.organizationType !== 'adventurers-guild' || typeof organization.id !== 'string') return [];
  const accepted = state?.character?.guildContractState?.accepted;
  const acceptedById = new Map((Array.isArray(accepted) ? accepted : []).filter(row => row && typeof row.contractId === 'string').map(row => [row.contractId, row]));
  return IR_V0824_GUILD_OFFER_TEMPLATES.map(template => {
    const id = `guild-contract:${organization.id}:${template.key}`;
    const record = acceptedById.get(id);
    return {
      id,
      guildId: organization.id,
      title: template.title,
      description: template.description,
      category: template.category,
      requirements: ['Adventurers’ Guild membership'],
      objective: template.objective,
      availability: record ? 'accepted' : 'available',
      acceptance: record || null
    };
  });
}

function ir0824ContractStateValid(character, organizations = state?.world?.organizations) {
  const value = character?.guildContractState;
  if (value == null) return { ok: true, errors: [] };
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 1 || !Array.isArray(value.accepted)) return { ok: false, errors: ['Malformed guild contract state'] };
  const guildIds = new Set((Array.isArray(organizations) ? organizations : []).filter(row => row?.organizationType === 'adventurers-guild').map(row => row.id));
  const contractIds = new Set();
  for (const record of value.accepted) {
    if (!record || typeof record !== 'object' || typeof record.contractId !== 'string' || typeof record.guildId !== 'string') { errors.push('Malformed accepted contract record'); continue; }
    if (contractIds.has(record.contractId)) errors.push(`Duplicate accepted contract ${record.contractId}`);
    contractIds.add(record.contractId);
    if (!guildIds.has(record.guildId)) errors.push(`Contract ${record.contractId} references an unknown guild`);
    const offer = (Array.isArray(organizations) ? organizations : []).filter(row => row?.id === record.guildId).flatMap(ir0824GuildOffers).find(row => row.id === record.contractId);
    if (!offer) errors.push(`Unknown guild offer ${record.contractId}`);
    if (record.status !== 'accepted') errors.push(`Invalid acceptance status for ${record.contractId}`);
  }
  return { ok: errors.length === 0, errors };
}

function ir0824GetAcceptedContractState(character) {
  if (!character || !ir0824ContractStateValid(character).ok) return null;
  if (!character.guildContractState) character.guildContractState = { schema: 1, accepted: [] };
  return character.guildContractState;
}

function ir0824GuildContractBoardModal() {
  if (modal?.kind !== 'ir0824-guild-contract-board') return null;
  const organization = state?.world?.organizations?.find(row => row?.id === modal.guildId && row?.organizationType === 'adventurers-guild');
  const npc = ir072NPC(modal.npcId);
  const siteRecord = ir0822GuildSite(state?.world, organization);
  if (!organization || !siteRecord || !npc?.guildServiceRole || npc.organizationId !== organization.id) {
    return `<div class="overlay"><section class="modal" role="dialog" aria-modal="true"><div class="modal-header"><div><div class="eyebrow">GUILD CONTRACT BOARD</div><h2>Board unavailable</h2><p>The guild, location, or service reference could not be resolved.</p></div><button class="close-btn" data-action="ir072-close">×</button></div><div class="modal-actions"><button class="button" data-action="ir072-close">Close</button></div></section></div>`;
  }
  const present = site()?.id === siteRecord.id && ir072IsPresent(npc);
  const joined = ir0825GuildMembership(state?.character, organization);
  const standingText = ir0825GuildStandingLabel(state?.character, organization);
  const validState = ir0824ContractStateValid(state?.character);
  const offers = ir0824GuildOffers(organization);
  const content = !present
    ? `<div class="notice">This service is available at ${esc(siteRecord.name)} when ${esc(npc.name)} is present.</div>`
    : !validState.ok
      ? `<div class="notice">Saved guild contract records need attention. This board is read-only so existing data is preserved.</div>`
      : !offers.length
        ? '<div class="empty">This guild has no available offers.</div>'
        : offers.map(offer => {
          const accepted = offer.availability === 'accepted';
          const eligible = joined && !accepted && !state.combat?.active && !state.pendingEvent;
          const reason = accepted ? 'Already accepted.' : !joined ? 'Join the Adventurers’ Guild first.' : state.combat?.active ? 'Unavailable during combat.' : state.pendingEvent ? 'Resolve the pending event first.' : 'Ready to accept.';
          return `<article class="ir072-action-card"><div class="ir072-action-copy"><strong>${esc(offer.title)} <span class="tag ${accepted ? 'gold' : 'blue'}">${accepted ? 'ACCEPTED · ACTIVE' : 'AVAILABLE'}</span></strong><p>${esc(offer.description)}</p><p><strong>Category:</strong> ${esc(offer.category)} · <strong>Requirement:</strong> Adventurers’ Guild membership</p><p><strong>Objective:</strong> ${esc(offer.objective)}</p>${accepted ? `<p>Accepted ${esc(offer.acceptance.acceptedAt || 'date unavailable')}. Completion and rewards are not available in this release.</p>` : `<small>${esc(reason)}</small>`}</div><button class="button small primary" data-action="ir0824-accept-contract" data-npc="${esc(npc.id)}" data-guild="${esc(organization.id)}" data-contract="${esc(offer.id)}" ${eligible ? '' : 'disabled'}>${accepted ? 'Accepted' : 'Accept contract'}</button></article>`;
        }).join('');
  const noAvailable = present && validState.ok && offers.length > 0 && offers.every(offer => offer.availability !== 'available');
  return `<div class="overlay"><section class="modal ir072-modal" role="dialog" aria-modal="true" aria-label="${esc(organization.name)} contract board"><div class="modal-header"><div><div class="eyebrow">GUILD CONTRACT BOARD · V0.8.2.5</div><h2>${esc(organization.name)}</h2><p>${esc(siteRecord.name)} · Issued by this guild only</p></div><button class="close-btn" data-action="ir072-close">×</button></div><div class="notice">${esc(standingText)}. Guild standing is shown from the shared faction record; this release has no standing threshold beyond the existing membership requirement.</div>${!joined ? '<div class="notice">You must be an Adventurers’ Guild member to accept these offers. Current offers are shown for inspection.</div>' : ''}${content}${noAvailable ? '<div class="empty">No available offers remain for this guild. Accepted contracts stay listed here.</div>' : ''}<div class="notice">Acceptance records an active contract only. No time, items, money, standing, completion, or rewards are granted here.</div><div class="modal-actions"><button class="button" data-action="ir0824-return-guild" data-npc="${esc(npc.id)}">Back to guild services</button><button class="button subtle" data-action="ir072-close">Close</button></div></section></div>`;
}

const ir0824RenderModalBase = renderModal;
renderModal = function () { return ir0824GuildContractBoardModal() || ir0824RenderModalBase.apply(this, arguments); };

const ir0824ActionBase = ir072Action;
ir072Action = function (target) {
  const action = target?.dataset?.action;
  if (action === 'ir0824-open-contract-board' || action === 'ir0824-accept-contract' || action === 'ir0824-return-guild') {
    const npc = ir072RequireNPC(target.dataset.npc);
    if (!npc) return true;
    if (!npc.guildServiceRole || !IR_V0822_GUILD_SERVICE_ROLES.includes(npc.guildServiceRole)) { toast('This guild service is unavailable.'); return true; }
    const organization = state?.world?.organizations?.find(row => row?.id === npc.organizationId && row?.organizationType === 'adventurers-guild');
    const siteRecord = ir0822GuildSite(state?.world, organization);
    if (!organization || !siteRecord || site()?.id !== siteRecord.id || !ir072IsPresent(npc)) { toast('This guild service is unavailable at the current location.'); return true; }
    if (action === 'ir0824-open-contract-board') {
      modal = { kind: 'ir0824-guild-contract-board', guildId: organization.id, npcId: npc.id };
      render();
      return true;
    }
    if (action === 'ir0824-return-guild') {
      modal = { kind: 'ir072-interactions', npc: npc.id };
      render();
      return true;
    }
    if (target.dataset.guild !== organization.id) { toast('That offer belongs to a different guild.'); return true; }
    const offer = ir0824GuildOffers(organization).find(row => row.id === target.dataset.contract);
    if (!offer) { toast('This contract offer is not available from this guild.'); return true; }
    if (!ir0825GuildMembership(state.character, organization)) { toast('Join the Adventurers’ Guild before accepting a contract.'); return true; }
    if (state.combat?.active) { toast('Contracts are unavailable during combat.'); return true; }
    if (state.pendingEvent) { toast('Resolve the pending event before accepting a contract.'); return true; }
    const contractState = ir0824GetAcceptedContractState(state.character);
    if (!contractState) { toast('Saved guild contract records need attention; no data was changed.'); return true; }
    if (contractState.accepted.some(record => record.contractId === offer.id)) { toast('This contract has already been accepted.'); return true; }
    contractState.accepted.push({ contractId: offer.id, guildId: organization.id, status: 'accepted', acceptedAt: typeof dateLabel === 'function' ? dateLabel() : 'Unknown date' });
    if (!ir0824ContractStateValid(state.character)) {
      contractState.accepted.pop();
      toast('The contract record could not be validated; no data was changed.');
      return true;
    }
    modal = { kind: 'ir0824-guild-contract-board', guildId: organization.id, npcId: npc.id };
    persist();
    render();
    toast(`Accepted: ${offer.title}. Objective tracking and rewards are not available yet.`);
    return true;
  }
  return ir0824ActionBase.apply(this, arguments);
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.2.5';
if (typeof globalThis !== 'undefined') {
  globalThis.IR_V0824_GUILD_OFFER_TEMPLATES = IR_V0824_GUILD_OFFER_TEMPLATES;
  globalThis.ir0824GuildOffers = ir0824GuildOffers;
  globalThis.ir0824ContractStateValid = ir0824ContractStateValid;
}
