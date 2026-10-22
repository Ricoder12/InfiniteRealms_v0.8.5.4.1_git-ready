'use strict';
// Infinite Realms v0.8.4.2 — recruit existing NPCs as persistent companions.
function ir0842NPC(npcId) {
  if (typeof npcId !== 'string' || !npcId.trim() || typeof ir072NPC !== 'function') return null;
  return ir072NPC(npcId) || null;
}
function ir0842Eligibility(npcId) {
  const npc = ir0842NPC(npcId);
  if (!npc) return { ok: false, reason: 'NPC reference is invalid.' };
  if (state?.character?.relationships?.[npc.id]?.status !== 'Companion') return { ok: false, reason: 'Build a Companion relationship before recruiting this NPC.' };
  if (npc.companionRecruitment?.status === 'recruited') return { ok: false, reason: 'This NPC is already recruited.' };
  return { ok: true, npc };
}
function ir0842PersistNpc(npc) {
  const changes = state?.world?.v06?.changes;
  if (npc && changes && typeof changes === 'object') changes[npc.id] = { ...(changes[npc.id] || {}), companionRecruitment: { ...npc.companionRecruitment } };
}
function ir0842RecruitCompanion(npcId) {
  const eligible = ir0842Eligibility(npcId);
  if (!eligible.ok) return eligible;
  const npc = eligible.npc, character = state.character;
  const previous = npc.companionRecruitment && typeof npc.companionRecruitment === 'object' ? npc.companionRecruitment : {};
  npc.companionRecruitment = { ...previous, status: 'recruited', recruitedAtDay: previous.recruitedAtDay ?? (Number(character.daysLived) || 0), dismissedAtDay: null };
  ir0842PersistNpc(npc);
  let squads = typeof ir0841Squads === 'function' ? ir0841Squads(character) : [];
  if (!squads.length && typeof ir0841CreateTemporarySquad === 'function') {
    const created = ir0841CreateTemporarySquad('Traveling Companions');
    if (created.ok) squads = ir0841Squads(character);
  }
  const squad = squads.find(record => Array.isArray(record?.memberNpcIds));
  if (squad && !squad.memberNpcIds.includes(npc.id)) squad.memberNpcIds.push(npc.id);
  if (typeof persist === 'function') persist();
  return { ok: true, npc, squad: squad || null };
}
function ir0842DismissCompanion(npcId) {
  const npc = ir0842NPC(npcId);
  if (!npc) return { ok: false, reason: 'NPC reference is invalid.' };
  if (npc.companionRecruitment?.status !== 'recruited') return { ok: false, reason: 'NPC is not currently recruited.' };
  npc.companionRecruitment = { ...npc.companionRecruitment, status: 'dismissed', dismissedAtDay: Number(state?.character?.daysLived) || 0 };
  ir0842PersistNpc(npc);
  for (const squad of (typeof ir0841Squads === 'function' ? ir0841Squads() : [])) {
    if (Array.isArray(squad?.memberNpcIds)) squad.memberNpcIds = squad.memberNpcIds.filter(id => id !== npc.id);
  }
  if (typeof persist === 'function') persist();
  return { ok: true, npc };
}
const ir0842DashboardBase = typeof ir064CloseRelationshipDashboard === 'function' ? ir064CloseRelationshipDashboard : null;
if (ir0842DashboardBase) ir064CloseRelationshipDashboard = function () {
  const html = ir0842DashboardBase.apply(this, arguments);
  return html.replace(/<button class="button small subtle" data-action="ir063-focus" data-npc="([^"]+)">Interactions<\/button>/g, (button, npcId) => {
    if (state?.character?.relationships?.[npcId]?.status !== 'Companion') return button;
    const recruited = ir0842NPC(npcId)?.companionRecruitment?.status === 'recruited';
    return `${button}<button class="button small" data-action="ir0842-${recruited ? 'dismiss' : 'recruit'}-companion" data-npc="${esc(npcId)}">${recruited ? 'Dismiss companion' : 'Recruit companion'}</button>`;
  });
};
const ir0842ActionBase = typeof ir072Action === 'function' ? ir072Action : null;
if (ir0842ActionBase) ir072Action = function (target) {
  const action = target?.dataset?.action;
  if (action !== 'ir0842-recruit-companion' && action !== 'ir0842-dismiss-companion') return ir0842ActionBase.apply(this, arguments);
  if (typeof ir072Blocked === 'function' && ir072Blocked()) { toast('Resolve the current combat or event first.'); return true; }
  const result = action === 'ir0842-recruit-companion' ? ir0842RecruitCompanion(target.dataset.npc) : ir0842DismissCompanion(target.dataset.npc);
  toast(result.ok ? (action === 'ir0842-recruit-companion' ? `${result.npc.name} joined your traveling companions.` : `${result.npc.name} left your traveling companions.`) : result.reason);
  render();
  return true;
};
const ir0842NormalizeBase = typeof normalizeSave === 'function' ? normalizeSave : null;
if (ir0842NormalizeBase) normalizeSave = function (input) {
  let prepared;
  try { prepared = typeof clone === 'function' ? clone(input) : JSON.parse(JSON.stringify(input)); }
  catch (_) { return ir0842NormalizeBase.apply(this, arguments); }
  const states = new Map((Array.isArray(prepared?.character?.npcs) ? prepared.character.npcs : []).filter(n => typeof n?.id === 'string' && n.companionRecruitment && typeof n.companionRecruitment === 'object').map(n => [n.id, n.companionRecruitment]));
  const normalized = ir0842NormalizeBase.call(this, prepared);
  for (const npc of normalized?.character?.npcs || []) if (states.has(npc.id)) npc.companionRecruitment = states.get(npc.id);
  return normalized;
};
if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.4.2';
if (typeof globalThis !== 'undefined') {
  globalThis.ir0842Eligibility = ir0842Eligibility;
  globalThis.ir0842RecruitCompanion = ir0842RecruitCompanion;
  globalThis.ir0842DismissCompanion = ir0842DismissCompanion;
}
