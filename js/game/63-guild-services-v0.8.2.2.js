'use strict';
// Infinite Realms v0.8.2.2 — organization-linked guild service NPCs.
// This layer reuses the established NPC records, schedule checks, memories, and UI router.

const IR_V0822_GUILD_SERVICE_ROLES = Object.freeze(['receptionist', 'guildmaster']);

function ir0822GuildSite(world, organization) {
  if (!world || !organization || organization.organizationType !== 'adventurers-guild' || !organization.locationGeoId) return null;
  const matches = (world.region?.sites || []).filter(site => site?.geoId === organization.locationGeoId);
  return matches.length === 1 ? matches[0] : null;
}

function ir0822ServiceNpcId(organizationId, role) {
  if (!organizationId || !IR_V0822_GUILD_SERVICE_ROLES.includes(role)) return null;
  return `guild-service:${organizationId}:${role}`;
}

function ir0822MakeServiceNpc(organization, site, role, previous = null) {
  const id = ir0822ServiceNpcId(organization.id, role);
  const seed = typeof ir06Hash === 'function' ? ir06Hash(id) : Array.from(id).reduce((sum, ch) => (Math.imul(sum ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261);
  const first = Array.isArray(IR06_NAMES) && IR06_NAMES.length ? IR06_NAMES[seed % IR06_NAMES.length] : 'Guild';
  const last = Array.isArray(IR06_SURNAMES) && IR06_SURNAMES.length ? IR06_SURNAMES[Math.floor(seed / 31) % IR06_SURNAMES.length] : 'Staff';
  const title = role === 'receptionist' ? 'Guild Receptionist' : 'Guildmaster';
  return {
    ...(previous && typeof previous === 'object' ? previous : {}),
    id,
    name: previous?.name || `${first} ${last}`,
    role: title,
    occupation: title,
    guildServiceRole: role,
    organizationId: organization.id,
    icon: role === 'receptionist' ? '📜' : '⚔️',
    tier: 'unique',
    homeSite: site.id,
    workSite: site.id,
    restSite: site.id,
    socialSite: site.id,
    ir071OriginSite: site.id,
    ir071ScheduleVersion: 1,
    ir071TravelRole: false,
    generatedKey: `guild-service|${organization.id}|${role}`,
    traits: Array.isArray(previous?.traits) ? previous.traits : [],
    memories: Array.isArray(previous?.memories) ? previous.memories : [],
    affinity: Number(previous?.affinity) || 0,
    trust: Number(previous?.trust) || 0
  };
}

function ir0822FindSavedServiceNpc(input, npcId) {
  const direct = input?.character?.npcs?.find(npc => npc?.id === npcId);
  if (direct) return direct;
  return input?.world?.v06?.changes?.[npcId] || input?.world?.v06?.registry?.[npcId] || null;
}

function ir0822NormalizeGuildServiceState(input, normalized) {
  const oldWorld = input?.world;
  const world = normalized?.world;
  const character = normalized?.character;
  if (!world || !character || !Array.isArray(world.organizations)) return normalized;

  const oldOrganizations = new Map((Array.isArray(oldWorld?.organizations) ? oldWorld.organizations : [])
    .filter(record => record?.organizationType === 'adventurers-guild' && typeof record.id === 'string')
    .map(record => [record.id, record]));
  const sites = Array.isArray(world.region?.sites) ? world.region.sites : [];
  const changes = world.v06?.changes && typeof world.v06.changes === 'object' ? world.v06.changes : {};
  const restoredNpcs = [];

  for (const organization of world.organizations) {
    if (organization?.organizationType !== 'adventurers-guild') continue;
    const old = oldOrganizations.get(organization.id);
    const site = ir0822GuildSite(world, organization);
    if (!old || !site) continue;
    for (const role of IR_V0822_GUILD_SERVICE_ROLES) {
      const field = role === 'receptionist' ? 'receptionistNpcId' : 'guildmasterNpcId';
      const npcId = old[field];
      if (npcId === null) { organization[field] = null; continue; }
      if (npcId !== ir0822ServiceNpcId(organization.id, role)) continue;
      organization[field] = npcId;
      const saved = ir0822FindSavedServiceNpc(input, npcId);
      const npc = ir0822MakeServiceNpc(organization, site, role, saved);
      restoredNpcs.push(npc);
      changes[npcId] = { ...(changes[npcId] || {}), ...npc };
    }
  }

  world.v06 = world.v06 && typeof world.v06 === 'object' ? world.v06 : { schema: 2, changes: {}, journal: [], socialQuests: [] };
  world.v06.changes = changes;
  character.npcs = Array.isArray(character.npcs) ? character.npcs : [];
  const ids = new Set(character.npcs.map(npc => npc?.id));
  for (const npc of restoredNpcs) {
    if (!ids.has(npc.id)) { character.npcs.push(npc); ids.add(npc.id); }
  }
  return normalized;
}

function ir0822ValidateGuildServices(world, character = null) {
  const errors = [];
  if (!world || !Array.isArray(world.organizations)) return { ok: false, errors: ['Missing organization registry'] };
  const knownNpcs = new Map();
  for (const npc of (character?.npcs || [])) if (npc?.id) knownNpcs.set(npc.id, npc);
  for (const [id, npc] of Object.entries(world.v06?.changes || {})) if (npc?.id) knownNpcs.set(id, npc);
  const seen = new Set();
  for (const organization of world.organizations.filter(record => record?.organizationType === 'adventurers-guild')) {
    const site = ir0822GuildSite(world, organization);
    if (!site) errors.push(`${organization.id} has no unique valid location`);
    for (const role of IR_V0822_GUILD_SERVICE_ROLES) {
      const field = role === 'receptionist' ? 'receptionistNpcId' : 'guildmasterNpcId';
      const npcId = organization[field];
      if (npcId == null) continue;
      if (npcId !== ir0822ServiceNpcId(organization.id, role)) { errors.push(`${organization.id} has an invalid ${role} reference`); continue; }
      if (seen.has(npcId)) errors.push(`Duplicate guild service NPC reference ${npcId}`);
      seen.add(npcId);
      const npc = knownNpcs.get(npcId);
      if (!npc) { errors.push(`${organization.id} ${role} record is missing`); continue; }
      if (npc.organizationId !== organization.id || npc.guildServiceRole !== role) errors.push(`${npcId} is linked to the wrong guild or service role`);
      if (site && (npc.homeSite !== site.id || npc.workSite !== site.id)) errors.push(`${npcId} is assigned to the wrong location`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function ir0822EnsureGuildServiceNPCs() {
  const world = state?.world;
  const character = state?.character;
  if (!world || !character || !Array.isArray(world.organizations)) return [];
  const sites = Array.isArray(world.region?.sites) ? world.region.sites : [];
  const v06 = world.v06 && typeof world.v06 === 'object' ? world.v06 : (world.v06 = { schema: 2, changes: {}, journal: [], socialQuests: [] });
  v06.changes = v06.changes && typeof v06.changes === 'object' ? v06.changes : {};
  character.npcs = Array.isArray(character.npcs) ? character.npcs : [];
  let changed = false;
  const currentSite = site();
  const currentGeoId = currentSite?.geoId;
  const currentServices = [];

  for (const organization of world.organizations) {
    if (organization?.organizationType !== 'adventurers-guild') continue;
    const guildSite = ir0822GuildSite(world, organization);
    if (!guildSite) continue;
    for (const role of IR_V0822_GUILD_SERVICE_ROLES) {
      const field = role === 'receptionist' ? 'receptionistNpcId' : 'guildmasterNpcId';
      if (!Object.prototype.hasOwnProperty.call(organization, field)) {
        organization[field] = ir0822ServiceNpcId(organization.id, role);
        changed = true;
      }
      const npcId = organization[field];
      if (npcId == null) continue;
      if (npcId !== ir0822ServiceNpcId(organization.id, role)) continue;
      let npc = character.npcs.find(record => record?.id === npcId) || v06.changes[npcId] || null;
      npc = ir0822MakeServiceNpc(organization, guildSite, role, npc);
      if (typeof ir071MigrateNPC === 'function') ir071MigrateNPC(npc, world, sites);
      npc.ir071TravelRole = false;
      v06.changes[npcId] = { ...(v06.changes[npcId] || {}), ...npc };
      const index = character.npcs.findIndex(record => record?.id === npcId);
      if (index < 0) character.npcs.push(npc);
      else character.npcs[index] = npc;
      if (currentGeoId === organization.locationGeoId) currentServices.push(npc);
    }
  }
  if (changed && typeof persist === 'function') persist();
  return currentServices;
}

const ir0822EnsureNPCsBase = typeof ir06EnsureNPCs === 'function' ? ir06EnsureNPCs : null;
if (ir0822EnsureNPCsBase) {
  ir06EnsureNPCs = function () {
    const base = ir0822EnsureNPCsBase.apply(this, arguments);
    const services = ir0822EnsureGuildServiceNPCs();
    if (Array.isArray(base)) {
      const ids = new Set(base.map(npc => npc?.id));
      for (const npc of services) if (!ids.has(npc.id)) { base.push(npc); ids.add(npc.id); }
      return base;
    }
    return base;
  };
}

const ir0822NormalizeBase = typeof normalizeSave === 'function' ? normalizeSave : null;
if (ir0822NormalizeBase) {
  normalizeSave = function (input) {
    return ir0822NormalizeGuildServiceState(input, ir0822NormalizeBase.apply(this, arguments));
  };
}

const ir0822InteractionModalBase = typeof ir072InteractionModal === 'function' ? ir072InteractionModal : null;
function ir0822GuildInteractionModal() {
  const npc = ir072NPC(modal?.npc);
  if (!npc?.guildServiceRole || !IR_V0822_GUILD_SERVICE_ROLES.includes(npc.guildServiceRole)) return null;
  const organization = state?.world?.organizations?.find(record => record?.id === npc.organizationId && record?.organizationType === 'adventurers-guild');
  const guildSite = ir0822GuildSite(state?.world, organization);
  const present = !!(organization && guildSite && site()?.id === guildSite.id && ir072IsPresent(npc));
  const roleName = npc.guildServiceRole === 'receptionist' ? 'Guild receptionist' : 'Guildmaster';
  const membership = typeof ir0825GuildMembership === 'function'
    ? ir0825GuildMembership(state?.character, organization) : state?.character?.factionMembership === 'adventurers';
  const standing = typeof ir0825GuildStanding === 'function'
    ? ir0825GuildStanding(state?.character, organization) ?? 0 : Number(state?.character?.factionStanding?.adventurers) || 0;
  const details = npc.guildServiceRole === 'receptionist'
    ? `Welcome to ${organization?.name || 'the Adventurers’ Guild'}. I can explain membership and point you to the services currently supported here.`
    : `I oversee ${organization?.name || 'this Adventurers’ Guild'}. Membership is currently ${membership ? 'active' : 'not active'}; guild standing is ${standing >= 0 ? '+' : ''}${standing}. Rank review is available here; examinations require an authorized Association examiner.`;
  const unavailable = !organization || !guildSite
    ? '<section class="notice">This guild service is unavailable because its organization or location reference cannot be resolved.</section>'
    : !present
      ? `<section class="notice">${esc(roleName)} ${esc(npc.name)} is assigned to ${esc(guildSite.name)} and is not available at the current location.</section>`
      : '';
  const rankCard = present && npc.guildServiceRole === 'guildmaster' && typeof ir0835GuildRankServiceCard === 'function' ? ir0835GuildRankServiceCard(npc, organization) : '';
  const actions = present ? `<div class="ir072-action-grid"><article class="ir072-action-card"><div class="ir072-action-copy"><strong>${npc.guildServiceRole === 'receptionist' ? 'Guild information' : 'Guild expectations'}</strong><p>${esc(details)}</p></div><button class="button small primary" data-action="ir0822-guild-details" data-npc="${esc(npc.id)}">Ask</button></article><article class="ir072-action-card"><div class="ir072-action-copy"><strong>Membership and standing</strong><p>${membership ? `Member · standing ${standing >= 0 ? '+' : ''}${standing}` : 'Not a member · membership services are handled through the existing faction system.'}</p></div><button class="button small" data-action="ir0822-guild-membership" data-npc="${esc(npc.id)}">Ask</button></article><article class="ir072-action-card"><div class="ir072-action-copy"><strong>Guild contracts</strong><p>The existing faction assignment resolves immediately. A persistent guild contract board is not available yet.</p></div><button class="button small" disabled title="Guild contract acceptance is not available in this release.">Unavailable</button></article>${rankCard}</div>` : '';
  return `<div class="overlay" data-dismiss="modal"><section class="modal ir072-modal" role="dialog" aria-modal="true" aria-label="${esc(roleName)} ${esc(npc.name)}"><div class="modal-header"><div><div class="eyebrow">GUILD SERVICES · V0.8.2.2</div><h2>${esc(npc.icon || '⚔️')} ${esc(npc.name)}</h2><p>${esc(roleName)} · ${esc(organization?.name || 'Unknown guild')}</p></div><button class="close-btn" data-action="ir072-close" aria-label="Close interactions">×</button></div>${unavailable}${actions}<div class="modal-actions"><button class="button" data-action="ir072-close">Close</button></div></section></div>`;
}

if (ir0822InteractionModalBase) {
  ir072InteractionModal = function () { return ir0822GuildInteractionModal() || ir0822InteractionModalBase.apply(this, arguments); };
}

const ir0822ActionBase = typeof ir072Action === 'function' ? ir072Action : null;
if (ir0822ActionBase) {
  ir072Action = function (target) {
    const action = target?.dataset?.action;
    if (action === 'ir0822-guild-details' || action === 'ir0822-guild-membership') {
      const npc = ir072RequireNPC(target.dataset.npc);
      if (!npc || !npc.guildServiceRole || !IR_V0822_GUILD_SERVICE_ROLES.includes(npc.guildServiceRole)) return true;
      const organization = state?.world?.organizations?.find(record => record?.id === npc.organizationId && record?.organizationType === 'adventurers-guild');
      const guildSite = ir0822GuildSite(state?.world, organization);
      if (!organization || !guildSite || site()?.id !== guildSite.id) { toast('This guild service is unavailable at the current location.'); return true; }
      const isMaster = npc.guildServiceRole === 'guildmaster';
      const member = typeof ir0825GuildMembership === 'function'
        ? ir0825GuildMembership(state.character, organization) : state.character.factionMembership === 'adventurers';
      const standing = typeof ir0825GuildStanding === 'function'
        ? ir0825GuildStanding(state.character, organization) ?? 0 : Number(state.character.factionStanding?.adventurers) || 0;
      const detail = action === 'ir0822-guild-membership'
        ? `${member ? 'You are a member' : 'You are not a member'} of the Adventurers’ Guild. Guild standing is ${standing >= 0 ? '+' : ''}${standing}. Membership remains in the existing shared faction record.`
        : isMaster
          ? `${npc.name} explained ${organization.name}’s expectations: members should report dangers honestly, respect accepted work, and avoid endangering other members. Rank examinations require an authorized Association examiner.`
          : `${npc.name} welcomed you to ${organization.name} and explained that guild membership is currently represented by the shared Adventurers’ Guild faction record. Persistent contract acceptance is not available yet.`;
      if (typeof ir072RememberAction === 'function') ir072RememberAction(npc, isMaster ? 'Guildmaster shared guild guidance' : 'Guild receptionist shared guild information', detail, 'guild-service');
      else { toast(detail); }
      return true;
    }
    return ir0822ActionBase.apply(this, arguments);
  };
}

const ir0822NormalizeValidateBase = normalizeSave;
normalizeSave = function (input) {
  const result = ir0822NormalizeValidateBase.apply(this, arguments);
  if (result?.world && Array.isArray(result.world.organizations)) {
    const report = ir0822ValidateGuildServices(result.world, result.character);
    if (!report.ok && typeof console !== 'undefined' && console.warn) console.warn('[Infinite Realms] Guild service records need attention:', report.errors);
  }
  return result;
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.2.2';
if (typeof globalThis !== 'undefined') {
  globalThis.IR_V0822_GUILD_SERVICE_ROLES = IR_V0822_GUILD_SERVICE_ROLES;
  globalThis.ir0822GuildSite = ir0822GuildSite;
  globalThis.ir0822ServiceNpcId = ir0822ServiceNpcId;
  globalThis.ir0822EnsureGuildServiceNPCs = ir0822EnsureGuildServiceNPCs;
  globalThis.ir0822ValidateGuildServices = ir0822ValidateGuildServices;
}
