'use strict';
// Infinite Realms v0.8.4.1 — persistent temporary squad foundation.
function ir0841SquadId(character) {
  const ids = new Set((Array.isArray(character.temporarySquads) ? character.temporarySquads : []).map(squad => squad?.id));
  let sequence = Math.max(0, Math.floor(Number(character.temporarySquadSequence) || 0));
  let id;
  do { sequence += 1; id = `temporary-squad-${sequence}`; } while (ids.has(id));
  character.temporarySquadSequence = sequence;
  return id;
}
function ir0841Squads(character = state?.character) { return Array.isArray(character?.temporarySquads) ? character.temporarySquads : []; }
function ir0841ResolveMember(npcId) {
  if (typeof npcId !== 'string' || !npcId.trim() || typeof ir072NPC !== 'function') return null;
  return ir072NPC(npcId) || null;
}
function ir0841CreateTemporarySquad(name = 'Temporary Squad') {
  const character = state?.character;
  if (!character) return { ok: false, reason: 'No active character.' };
  const cleanName = String(name ?? '').trim().slice(0, 60);
  if (!cleanName) return { ok: false, reason: 'Squad name is required.' };
  if (!Array.isArray(character.temporarySquads)) character.temporarySquads = [];
  const squad = { id: ir0841SquadId(character), name: cleanName, memberNpcIds: [] };
  character.temporarySquads.push(squad);
  if (typeof persist === 'function') persist();
  return { ok: true, squad };
}
function ir0841AddTemporarySquadMember(squadId, npcId) {
  const squad = ir0841Squads().find(record => record?.id === squadId);
  if (!squad || !Array.isArray(squad.memberNpcIds)) return { ok: false, reason: 'Temporary squad not found.' };
  if (!ir0841ResolveMember(npcId)) return { ok: false, reason: 'NPC reference is invalid.' };
  if (squad.memberNpcIds.includes(npcId)) return { ok: false, reason: 'NPC is already in this squad.' };
  squad.memberNpcIds.push(npcId);
  if (typeof persist === 'function') persist();
  return { ok: true, squad };
}
function ir0841RemoveTemporarySquadMember(squadId, npcId) {
  const squad = ir0841Squads().find(record => record?.id === squadId);
  if (!squad || !Array.isArray(squad.memberNpcIds)) return { ok: false, reason: 'Temporary squad not found.' };
  const index = squad.memberNpcIds.indexOf(npcId);
  if (index < 0) return { ok: false, reason: 'NPC is not in this squad.' };
  squad.memberNpcIds.splice(index, 1);
  if (typeof persist === 'function') persist();
  return { ok: true, squad };
}
function ir0841DisbandTemporarySquad(squadId) {
  const squads = ir0841Squads();
  const index = squads.findIndex(record => record?.id === squadId);
  if (index < 0) return { ok: false, reason: 'Temporary squad not found.' };
  const [squad] = squads.splice(index, 1);
  if (typeof persist === 'function') persist();
  return { ok: true, squad };
}
const ir0841NormalizeSaveBase = typeof normalizeSave === 'function' ? normalizeSave : null;
if (ir0841NormalizeSaveBase) normalizeSave = function (input) {
  let prepared;
  try { prepared = typeof clone === 'function' ? clone(input) : JSON.parse(JSON.stringify(input)); }
  catch (_) { return ir0841NormalizeSaveBase.apply(this, arguments); }
  const squads = prepared?.character?.temporarySquads;
  const sequence = prepared?.character?.temporarySquadSequence;
  const normalized = ir0841NormalizeSaveBase.call(this, prepared);
  if (normalized?.character) {
    normalized.character.temporarySquads = Array.isArray(squads) ? squads : [];
    normalized.character.temporarySquadSequence = Math.max(0, Math.floor(Number(sequence) || 0));
  }
  return normalized;
};
if (typeof globalThis !== 'undefined') {
  globalThis.ir0841Squads = ir0841Squads;
  globalThis.ir0841CreateTemporarySquad = ir0841CreateTemporarySquad;
  globalThis.ir0841AddTemporarySquadMember = ir0841AddTemporarySquadMember;
  globalThis.ir0841RemoveTemporarySquadMember = ir0841RemoveTemporarySquadMember;
  globalThis.ir0841DisbandTemporarySquad = ir0841DisbandTemporarySquad;
}
