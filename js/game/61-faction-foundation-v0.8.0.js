'use strict';
// Infinite Realms v0.8.0 — shared faction definitions and compatibility accessors.
// Membership and faction-specific standing remain in their existing saved character fields.

const IR_V08_FACTION_TYPE_IDS = Object.freeze([
  'adventurers-guild', 'merchant-company', 'criminal-organization',
  'magical-order', 'monster-clan', 'civic-organization'
]);

const IR_V08_FACTION_SOURCE = Object.freeze([
  { legacyId: 'adventurers', type: 'adventurers-guild' },
  { legacyId: 'merchants', type: 'merchant-company' },
  { legacyId: 'shadow', type: 'criminal-organization' },
  { legacyId: 'arcanum', type: 'magical-order' },
  { legacyId: 'royal', type: 'civic-organization' }
]);

const IR_V08_FACTION_DEFINITIONS = Object.freeze(IR_V08_FACTION_SOURCE.reduce((records, source) => {
  const legacy = typeof IR_V05_FACTION_DEFS === 'object' ? IR_V05_FACTION_DEFS[source.legacyId] : null;
  if (!legacy) return records;
  const id = `faction:${source.legacyId}`;
  records[id] = Object.freeze({
    id,
    legacyId: source.legacyId,
    organizationType: source.type,
    name: legacy.name,
    description: legacy.desc,
    accessHint: legacy.req
  });
  return records;
}, {}));

function irV08FactionId(legacyId) {
  return Object.prototype.hasOwnProperty.call(IR_V08_FACTION_DEFINITIONS, `faction:${legacyId}`)
    ? `faction:${legacyId}`
    : null;
}

function irV08FactionById(id) {
  const record = typeof id === 'string' ? IR_V08_FACTION_DEFINITIONS[id] : null;
  return record ? { ...record } : null;
}

function irV08FactionByLegacyId(legacyId) {
  const id = irV08FactionId(legacyId);
  return id ? irV08FactionById(id) : null;
}

function irV08FactionStanding(character, factionIdOrLegacyId) {
  const record = IR_V08_FACTION_DEFINITIONS[factionIdOrLegacyId] || irV08FactionByLegacyId(factionIdOrLegacyId);
  if (!record) return null;
  const value = Number(character?.factionStanding?.[record.legacyId]);
  return Number.isFinite(value) ? Math.max(-100, Math.min(100, value)) : 0;
}

function irV08ValidateFactionState(character) {
  const errors = [];
  const legacyIds = new Set(IR_V08_FACTION_SOURCE.map(record => record.legacyId));
  if (character?.factionMembership != null && !legacyIds.has(character.factionMembership)) {
    errors.push(`Unknown legacy faction membership ${String(character.factionMembership)}`);
  }
  if (character?.factionStanding != null && (typeof character.factionStanding !== 'object' || Array.isArray(character.factionStanding))) {
    errors.push('Faction standing must be a keyed object');
  } else {
    for (const [id, value] of Object.entries(character?.factionStanding || {})) {
      if (!legacyIds.has(id)) errors.push(`Unknown faction standing key ${id}`);
      if (!Number.isFinite(Number(value)) || Number(value) < -100 || Number(value) > 100) {
        errors.push(`Invalid faction standing value for ${id}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.0';
if (typeof globalThis !== 'undefined') {
  globalThis.IR_V08_FACTION_TYPE_IDS = IR_V08_FACTION_TYPE_IDS;
  globalThis.IR_V08_FACTION_DEFINITIONS = IR_V08_FACTION_DEFINITIONS;
  globalThis.irV08FactionId = irV08FactionId;
  globalThis.irV08FactionById = irV08FactionById;
  globalThis.irV08FactionByLegacyId = irV08FactionByLegacyId;
  globalThis.irV08FactionStanding = irV08FactionStanding;
  globalThis.irV08ValidateFactionState = irV08ValidateFactionState;
}
