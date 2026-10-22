'use strict';
// Infinite Realms v0.8.5.4 — companion equipment and existing skill synergy.
// NPC identity stays in the existing NPC registry; item ownership remains in character.inventory.

const IR0854_COMPANION_SLOTS = ['weapon', 'head', 'hands', 'armor', 'legs', 'feet', 'offhand', 'accessory'];

function ir0854CompanionEquipmentMap(character = state?.character) {
  if (!character) return null;
  if (!character.companionEquipment || typeof character.companionEquipment !== 'object' || Array.isArray(character.companionEquipment)) character.companionEquipment = {};
  return character.companionEquipment;
}

function ir0854NpcExists(npcId, character = state?.character, world = state?.world) {
  return !!(typeof npcId === 'string' && npcId.trim() && typeof ir0851NPC === 'function' && ir0851NPC(npcId, character, world));
}

function ir0854ItemSlot(itemId) {
  if (typeof itemId !== 'string' || !ITEMS[itemId]) return null;
  if (IR_WEAPON_DATA[itemId]) return 'weapon';
  const item = ITEMS[itemId];
  if (item.slot && IR0854_COMPANION_SLOTS.includes(item.slot)) return item.slot;
  if (itemId === 'shield') return 'offhand';
  if (itemId === 'leather_armor' || Number(item.armor) > 0) return 'armor';
  return null;
}

function ir0854Equipment(character = state?.character, npcId) {
  const raw = ir0854CompanionEquipmentMap(character)?.[npcId];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const equipment = {};
  for (const slot of IR0854_COMPANION_SLOTS) {
    const itemId = raw[slot];
    if (typeof itemId === 'string' && ir0854ItemSlot(itemId) === slot && Number(character.inventory?.[itemId]) > 0) equipment[slot] = itemId;
  }
  return equipment;
}

function ir0854EquippedItemCount(character, itemId) {
  let count = Object.values(character?.equipment || {}).filter(value => value === itemId).length;
  const equipmentMap = character?.companionEquipment;
  if (equipmentMap && typeof equipmentMap === 'object' && !Array.isArray(equipmentMap)) {
    for (const entries of Object.values(equipmentMap)) if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
      count += Object.values(entries).filter(value => value === itemId).length;
    }
  }
  return count;
}

function ir0854AvailableItemCopies(character, itemId, { releasing = false } = {}) {
  const owned = Math.max(0, Math.floor(Number(character?.inventory?.[itemId]) || 0));
  return Math.max(0, owned - ir0854EquippedItemCount(character, itemId) + (releasing ? 1 : 0));
}

function ir0854EquipCompanion(npcId, itemId, slot = ir0854ItemSlot(itemId)) {
  const character = state?.character;
  if (!character || !ir0854NpcExists(npcId) || !ir0851PartyMember(npcId)) return { ok: false, reason: 'Select a valid recruited member of the active party.' };
  if (state?.combat?.active || state?.pendingEvent) return { ok: false, reason: 'Resolve combat or the current event before changing equipment.' };
  if (!IR0854_COMPANION_SLOTS.includes(slot) || ir0854ItemSlot(itemId) !== slot) return { ok: false, reason: 'That item is not compatible with this equipment slot.' };
  if (!(Number(character.inventory?.[itemId]) > 0)) return { ok: false, reason: 'That item is not in your inventory.' };
  const equipmentMap = ir0854CompanionEquipmentMap(character), current = ir0854Equipment(character, npcId), oldItem = current[slot];
  if (oldItem === itemId) {
    delete current[slot];
    equipmentMap[npcId] = current;
    persist();
    return { ok: true, equipped: false, equipment: current };
  }
  if (ir0854AvailableItemCopies(character, itemId) < 1) return { ok: false, reason: 'Every owned copy of that item is already equipped.' };
  current[slot] = itemId;
  equipmentMap[npcId] = current;
  character.itemCondition = character.itemCondition && typeof character.itemCondition === 'object' ? character.itemCondition : {};
  if (!Number.isFinite(Number(character.itemCondition[itemId]))) character.itemCondition[itemId] = 100;
  persist();
  return { ok: true, equipped: true, equipment: current };
}

function ir0854UnequipCompanion(npcId, slot) {
  const character = state?.character;
  if (!character || !ir0851PartyMember(npcId)) return { ok: false, reason: 'Select a valid member of the active party.' };
  if (state?.combat?.active || state?.pendingEvent) return { ok: false, reason: 'Resolve combat or the current event before changing equipment.' };
  if (!IR0854_COMPANION_SLOTS.includes(slot)) return { ok: false, reason: 'Unsupported equipment slot.' };
  const equipmentMap = ir0854CompanionEquipmentMap(character), equipment = ir0854Equipment(character, npcId);
  if (!equipment[slot]) return { ok: false, reason: 'That slot is already empty.' };
  delete equipment[slot];
  equipmentMap[npcId] = equipment;
  persist();
  return { ok: true, equipment };
}

function ir0854CompanionSkillEntries(npcId) {
  const npc = ir0851NPC(npcId);
  if (!npc || !npc.skills || typeof npc.skills !== 'object' || Array.isArray(npc.skills)) return [];
  return Object.entries(IR_V04_WEAPON_SKILL || {}).flatMap(([itemId, skill]) => {
    const value = npc.skills[skill];
    const level = Number(typeof value === 'object' ? value?.level : value);
    return Number.isFinite(level) && level >= 1 && ITEMS[itemId] ? [{ itemId, skill, level: Math.floor(level) }] : [];
  }).filter((entry, index, entries) => entries.findIndex(other => other.skill === entry.skill) === index);
}

function ir0854CompanionWeaponBonus(npcId) {
  const character = state?.character, equipment = ir0854Equipment(character, npcId), itemId = equipment.weapon;
  if (!itemId || !IR_WEAPON_DATA[itemId]) return 0;
  const base = Number(IR_WEAPON_DATA[itemId].damage);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const skill = IR_V04_WEAPON_SKILL[itemId], configured = ir0854CompanionSkillEntries(npcId).find(entry => entry.skill === skill);
  let damage = base + (configured ? Math.floor((configured.level - 1) * .7) : 0);
  const condition = Number(character.itemCondition?.[itemId] ?? 100);
  damage = Math.max(1, Math.round(damage * (condition < 25 ? .55 : condition < 50 ? .75 : 1)));
  const quality = character.itemQuality?.[itemId] || 'Standard';
  return Math.round(damage * ({ Rough: .9, Standard: 1, Fine: 1.12, Masterwork: 1.25 }[quality] || 1));
}

function ir0854CompanionArmorBonus(npcId) {
  const character = state?.character, equipment = ir0854Equipment(character, npcId);
  let defense = 0;
  if (equipment.armor === 'leather_armor') defense += 3;
  else if (equipment.armor) defense += Math.max(0, Number(ITEMS[equipment.armor]?.armor) || 0);
  if (equipment.offhand === 'shield') defense += 2;
  else if (equipment.offhand) defense += Math.max(0, Number(ITEMS[equipment.offhand]?.armor) || 0);
  for (const slot of ['head', 'hands', 'legs', 'feet']) if (equipment[slot]) defense += Math.max(0, Number(ITEMS[equipment[slot]]?.armor) || 0);
  if (equipment.armor && Number(character.itemCondition?.[equipment.armor] ?? 100) < 25) defense = Math.max(0, defense - 2);
  if (equipment.offhand && Number(character.itemCondition?.[equipment.offhand] ?? 100) < 25) defense = Math.max(0, defense - 1);
  return defense;
}

function ir0854WearWeapon(npcId) {
  const character = state?.character, itemId = ir0854Equipment(character, npcId).weapon;
  if (!character || !itemId || !Number.isFinite(Number(character.itemCondition?.[itemId]))) return;
  character.itemCondition[itemId] = Math.max(0, Number(character.itemCondition[itemId]) - 2);
}

function ir0854WearArmor(npcId) {
  const character = state?.character, equipment = ir0854Equipment(character, npcId);
  if (!character) return;
  for (const slot of ['armor', 'offhand']) {
    const itemId = equipment[slot];
    if (itemId && Number.isFinite(Number(character.itemCondition?.[itemId]))) character.itemCondition[itemId] = Math.max(0, Number(character.itemCondition[itemId]) - 1);
  }
}

function ir0854CompanionLoadoutMarkup(npcId) {
  const character = state?.character, equipment = ir0854Equipment(character, npcId);
  const npc = ir0851NPC(npcId);
  const rows = IR0854_COMPANION_SLOTS.map(slot => {
    const current = equipment[slot], currentName = current ? ITEMS[current]?.name || current : 'Empty';
    const options = Object.keys(character.inventory || {}).filter(id => id !== current && ir0854ItemSlot(id) === slot && (Number(character.inventory[id]) > 0) && (ir0854AvailableItemCopies(character, id) > 0));
    const buttons = options.map(id => `<button class="button small" data-action="ir0854-equip-companion" data-npc="${esc(npcId)}" data-slot="${slot}" data-item="${esc(id)}">Equip ${esc(ITEMS[id]?.name || id)}</button>`).join('');
    const clear = current ? `<button class="button small subtle" data-action="ir0854-unequip-companion" data-npc="${esc(npcId)}" data-slot="${slot}">Unequip</button>` : '';
    const contribution = current === equipment.weapon ? (current ? ` · +${ir0854CompanionWeaponBonus(npcId)} weapon base${IR_V04_WEAPON_SKILL[current] ? ` · ${IR_V04_WEAPON_SKILL[current]} ${ir0854CompanionSkillEntries(npcId).find(entry => entry.skill === IR_V04_WEAPON_SKILL[current]) ? 'synergy active' : 'not configured'}` : ''}` : '') : '';
    return `<div class="ir0854-loadout-slot"><span>${esc(slot)}</span><strong>${esc(currentName)}${contribution}</strong><div>${buttons}${clear}</div></div>`;
  }).join('');
  const skills = ir0854CompanionSkillEntries(npcId);
  const skillText = skills.length ? skills.map(entry => `${esc(entry.skill)} Lv. ${entry.level}`).join(' · ') : 'No combat skills are configured for this NPC.';
  const noProfile = !ir0851Profile(npcId) ? '<small>Combat profile not configured; equipment is saved, but this companion cannot enter combat.</small>' : '';
  return `<div class="ir0854-companion-loadout"><div><strong>Equipment · ${esc(npc?.name || npcId)}</strong><small>${skillText}</small>${noProfile}</div>${rows}</div>`;
}

function ir0854NormalizeEquipment(input, normalized) {
  const character = normalized?.character;
  if (!character) return normalized;
  const raw = input?.character?.companionEquipment;
  const valid = {};
  const remaining = { ...(character.inventory || {}) };
  for (const id of Object.values(character.equipment || {})) if (typeof id === 'string' && remaining[id] > 0) remaining[id]--;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [npcId, entries] of Object.entries(raw)) {
      if (!ir0854NpcExists(npcId, character, normalized.world) || !entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
      const equipment = {};
      for (const slot of IR0854_COMPANION_SLOTS) {
        const itemId = entries[slot];
        if (ir0854ItemSlot(itemId) !== slot || Number(remaining[itemId]) <= 0) continue;
        equipment[slot] = itemId;
        remaining[itemId]--;
      }
      if (Object.keys(equipment).length) valid[npcId] = equipment;
    }
  }
  character.companionEquipment = valid;
  return normalized;
}

const ir0854NormalizeBase = normalizeSave;
normalizeSave = function (input) { return ir0854NormalizeEquipment(input, ir0854NormalizeBase.apply(this, arguments)); };

const ir0854EffectiveAttackBase = ir0852EffectiveCompanionAttack;
ir0852EffectiveCompanionAttack = function (npcId, profile) {
  const roleMultiplier = ir0852CompanionCombatRole(npcId) === 'damage dealer' ? 1.5 : 1;
  return ir0854EffectiveAttackBase(npcId, profile) + ir0854CompanionWeaponBonus(npcId) * roleMultiplier;
};

const ir0854EffectiveDefenseBase = ir0852EffectiveCompanionDefense;
ir0852EffectiveCompanionDefense = function (npcId, profile) {
  const roleMultiplier = ir0852CompanionCombatRole(npcId) === 'tank' ? 1.5 : 1;
  return ir0854EffectiveDefenseBase(npcId, profile) + ir0854CompanionArmorBonus(npcId) * roleMultiplier;
};

const ir0854PartyPanelBase = ir0843PartyPanel;
ir0843PartyPanel = function () {
  const html = ir0854PartyPanelBase.apply(this, arguments);
  return html.replace(/<article class="ir0843-party-member">([\s\S]*?)<\/article>/g, (whole, content) => {
    const npcId = content.match(/data-npc="([^"]+)"/)?.[1];
    return npcId && ir0851PartyMember(npcId) ? `<article class="ir0843-party-member">${content}${ir0854CompanionLoadoutMarkup(npcId)}</article>` : whole;
  });
};

const ir0854ActionBase = ir072Action;
ir072Action = function (target) {
  const action = target?.dataset?.action;
  if (action === 'ir0854-equip-companion') {
    const result = ir0854EquipCompanion(target.dataset.npc, target.dataset.item, target.dataset.slot);
    toast(result.ok ? `${ITEMS[target.dataset.item]?.name || target.dataset.item} loadout updated.` : result.reason);
    render();
    return true;
  }
  if (action === 'ir0854-unequip-companion') {
    const result = ir0854UnequipCompanion(target.dataset.npc, target.dataset.slot);
    toast(result.ok ? 'Companion equipment removed.' : result.reason);
    render();
    return true;
  }
  return ir0854ActionBase.apply(this, arguments);
};

const ir0854PlayerEquipBase = ir04Equip;
ir04Equip = function (itemId) {
  const character = state?.character, slot = ir0854ItemSlot(itemId);
  if (slot && !Object.values(character?.equipment || {}).includes(itemId) && ir0854AvailableItemCopies(character, itemId) < 1) { toast('Every owned copy of that item is already equipped.'); return; }
  return ir0854PlayerEquipBase.apply(this, arguments);
};

const ir0854MarketSellBase = ir04MarketSell;
ir04MarketSell = function (itemId) {
  if (Object.values(state?.character?.companionEquipment || {}).some(entries => entries && Object.values(entries).includes(itemId))) { toast('Unequip this item from its companion before selling it.'); return; }
  return ir0854MarketSellBase.apply(this, arguments);
};

if (typeof document !== 'undefined') {
  document.title = 'Infinite Realms — Version 0.8.5.4';
  const css = document.createElement('style');
  css.textContent = `.ir0854-companion-loadout{flex-basis:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--panel2)}.ir0854-companion-loadout>div:first-child{grid-column:1/-1;display:flex;flex-direction:column;gap:4px}.ir0854-companion-loadout small{font-size:10px;color:var(--muted)}.ir0854-loadout-slot{min-width:0;display:flex;flex-direction:column;gap:4px;padding:7px;border:1px solid var(--line);border-radius:8px}.ir0854-loadout-slot>span{font-size:10px;text-transform:capitalize;color:var(--muted)}.ir0854-loadout-slot strong{font-size:11px}.ir0854-loadout-slot>div{display:flex;gap:4px;flex-wrap:wrap}@media(max-width:760px){.ir0854-companion-loadout{grid-template-columns:1fr}}`;
  document.head?.appendChild(css);
}

if (typeof globalThis !== 'undefined') {
  globalThis.ir0854EquipCompanion = ir0854EquipCompanion;
  globalThis.ir0854UnequipCompanion = ir0854UnequipCompanion;
  globalThis.ir0854CompanionSkillEntries = ir0854CompanionSkillEntries;
}
