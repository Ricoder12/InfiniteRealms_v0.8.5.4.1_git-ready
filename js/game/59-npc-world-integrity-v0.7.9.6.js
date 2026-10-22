'use strict';
// Infinite Realms v0.7.9.6 — fail closed on stale or ambiguous NPC location references.
// Valid schedules and legacy records without explicit stale references retain v0.7.1 behavior.
function ir0796UniqueSite(id, sites = ir071Sites()) {
  if (typeof id !== 'string' || !id) return null;
  const matches = sites.filter(site => site && site.id === id);
  return matches.length === 1 ? matches[0] : null;
}

function ir0796HasStaleScheduleReference(npc, sites = ir071Sites()) {
  if (!npc || typeof npc !== 'object') return false;
  return ['homeSite', 'workSite', 'restSite', 'socialSite', 'ir071OriginSite']
    .some(field => typeof npc[field] === 'string' && npc[field] && !ir0796UniqueSite(npc[field], sites));
}

const ir0796MigrateNPCBase = ir071MigrateNPC;
ir071MigrateNPC = function (npc, world, sites) {
  const availableSites = Array.isArray(sites) ? sites : ir071Sites();
  // Preserve an explicit saved location reference for diagnosis/recovery. Do not replace it
  // with the player's current location or the first generated site.
  if (ir0796HasStaleScheduleReference(npc, availableSites)) return npc;
  return ir0796MigrateNPCBase.apply(this, arguments);
};

const ir0796ScheduleBase = ir071Schedule;
ir071Schedule = function (npc, day, ctx = {}) {
  const sites = Array.isArray(ctx.sites) ? ctx.sites : [];
  if (ir0796HasStaleScheduleReference(npc, sites)) {
    return { state: 'unknown', siteId: null, label: 'Location unknown', until: null,
      reason: 'Saved NPC location reference is missing or ambiguous' };
  }
  // Legacy schedule code falls back between home/work/rest when a field is absent. Keep that
  // compatibility, but require every supplied reference to identify exactly one real site.
  const result = ir0796ScheduleBase.apply(this, arguments);
  if (result?.state === 'traveling' && typeof ir0775Connection === 'function') {
    const origin = ir0796UniqueSite(npc?.workSite, sites);
    const edge = origin && result.destinationSiteId
      ? ir0775Connection(origin.id, result.destinationSiteId)
      : null;
    if (!edge) {
      return { state: 'unknown', siteId: null, label: 'Location unknown', until: null,
        reason: 'Scheduled trip is not supported by the authoritative route graph' };
    }
  }
  if (result?.siteId && !ir0796UniqueSite(result.siteId, sites)) {
    return { state: 'unknown', siteId: null, label: 'Location unknown', until: null,
      reason: 'Scheduled location is missing or ambiguous' };
  }
  if (result?.destinationSiteId && !ir0796UniqueSite(result.destinationSiteId, sites)) {
    return { state: 'unknown', siteId: null, label: 'Location unknown', until: null,
      reason: 'Scheduled destination is missing or ambiguous' };
  }
  return result;
};

// Schedule descriptions must never resolve duplicate IDs by choosing the first match.
ir071SiteById = function (id, sites = ir071Sites()) { return ir0796UniqueSite(id, sites); };

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.9.6';
const ir0796ShellBase = typeof shell === 'function' ? shell : null;
if (ir0796ShellBase) shell = function () { return ir0796ShellBase.apply(this, arguments).replace(/0\.7\.8\.5/g, '0.7.9.6'); };
const ir0796RenderTitleBase = typeof renderTitle === 'function' ? renderTitle : null;
if (ir0796RenderTitleBase) renderTitle = function () { return ir0796RenderTitleBase.apply(this, arguments).replace(/0\.7\.8\.5/g, '0.7.9.6'); };
const ir0796RenderCharacterBase = typeof renderCharacter === 'function' ? renderCharacter : null;
if (ir0796RenderCharacterBase) renderCharacter = function () {
  const html = ir0796RenderCharacterBase.apply(this, arguments);
  return typeof html === 'string' ? html.replace(/CHARACTER STATUS · v0\.7\.8\.5/g, 'CHARACTER STATUS · v0.7.9.6') : html;
};
