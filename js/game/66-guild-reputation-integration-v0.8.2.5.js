'use strict';
// Infinite Realms v0.8.2.5 — connect guild services to the shared v0.8.0 faction state.
// Guilds point at the shared faction definition; standing remains character.factionStanding.

function ir0825GuildFaction(organization) {
  if (!organization || organization.organizationType !== 'adventurers-guild' || typeof organization.factionId !== 'string') return null;
  const faction = typeof irV08FactionById === 'function' ? irV08FactionById(organization.factionId) : null;
  return faction?.organizationType === 'adventurers-guild' ? faction : null;
}

function ir0825GuildStanding(character, organization) {
  const faction = ir0825GuildFaction(organization);
  if (!faction || typeof irV08FactionStanding !== 'function') return null;
  return irV08FactionStanding(character, faction.id);
}

function ir0825GuildMembership(character, organization) {
  const faction = ir0825GuildFaction(organization);
  return !!(faction && character?.factionMembership === faction.legacyId);
}

function ir0825ValidateGuildReputation(world, character = null) {
  const errors = [];
  const organizations = Array.isArray(world?.organizations) ? world.organizations : [];
  for (const organization of organizations.filter(row => row?.organizationType === 'adventurers-guild')) {
    if (!ir0825GuildFaction(organization)) errors.push(`${organization.id || 'Guild'} has no valid shared Adventurers’ Guild faction reference`);
  }
  if (character && typeof irV08ValidateFactionState === 'function') {
    errors.push(...irV08ValidateFactionState(character).errors);
  }
  return { ok: errors.length === 0, errors };
}

function ir0825GuildStandingLabel(character, organization) {
  const standing = ir0825GuildStanding(character, organization);
  return standing == null ? 'Standing unavailable' : `Shared Adventurers’ Guild standing: ${standing >= 0 ? '+' : ''}${standing}`;
}

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.2.5';
if (typeof globalThis !== 'undefined') {
  globalThis.ir0825GuildFaction = ir0825GuildFaction;
  globalThis.ir0825GuildStanding = ir0825GuildStanding;
  globalThis.ir0825GuildMembership = ir0825GuildMembership;
  globalThis.ir0825ValidateGuildReputation = ir0825ValidateGuildReputation;
  globalThis.ir0825GuildStandingLabel = ir0825GuildStandingLabel;
}
