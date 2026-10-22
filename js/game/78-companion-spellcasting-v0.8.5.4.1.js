'use strict';
// Infinite Realms v0.8.5.4.1 — optional, explicitly configured companion spellcasting.
// No spell list, statistics, talent, or mana values are generated for NPCs.

function ir08541SpellConfig(npcId, character = state?.character) {
  const profile = ir0851Profile(npcId, character);
  const value = profile?.spellcasting;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function ir08541SkillLevel(config, name) {
  const raw = config?.skills?.[name];
  const value = Number(typeof raw === 'object' ? raw?.level : raw);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
}

function ir08541Talents(config) {
  if (!Array.isArray(config?.naturalTalents)) return null;
  const valid = new Set((IR_V05_TALENTS || []).map(talent => talent.id));
  if (config.naturalTalents.some(id => typeof id !== 'string' || !valid.has(id))) return null;
  return config.naturalTalents;
}

function ir08541SpellRequirements(spellId, npcId) {
  const config = ir08541SpellConfig(npcId), spell = IR_V05_SPELLS?.[spellId];
  const missing = [];
  if (!config || config.schema !== 1) return { ok: false, missing: ['spellcasting configuration (schema 1)'], reason: 'Companion spellcasting is not configured.' };
  if (!Array.isArray(config.permittedSpellIds)) missing.push('permittedSpellIds');
  else if (!config.permittedSpellIds.includes(spellId)) return { ok: false, missing: [], reason: 'This spell is not permitted for the companion.' };
  if (!spell) return { ok: false, missing: [], reason: 'Unknown spell ID.' };
  if (!spell.combat) return { ok: false, missing: [], reason: 'Utility spells cannot be used in combat.' };
  if (['root', 'burn'].includes(spell.kind)) return { ok: false, missing: [], reason: spell.kind === 'root' ? 'The current combat resolver does not consume the existing enemyStunned flag.' : 'The existing burn tick uses player skill data and cannot safely resolve companion damage.' };
  const mana = config.mana;
  if (!mana || !Number.isInteger(mana.current) || !Number.isInteger(mana.max) || mana.max <= 0 || mana.max > 180 || mana.current < 0 || mana.current > mana.max) missing.push('mana.current and mana.max');
  const talents = ir08541Talents(config);
  if (!talents) missing.push('naturalTalents (explicit array; [] is valid)');
  const rankData = config.talentRanks;
  if (talents?.includes('spell_precision') && (!rankData || !Number.isInteger(rankData.spell_precision) || rankData.spell_precision < 0 || rankData.spell_precision > 2)) missing.push('talentRanks.spell_precision');
  const skills = config.skills && typeof config.skills === 'object' && !Array.isArray(config.skills) ? config.skills : null;
  if (!skills) missing.push('skills');
  const requiredSkills = new Set([spell.skill]);
  if (['damage', 'burn', 'slow'].includes(spell.kind)) requiredSkills.add('Magic');
  if (spell.school === 'Elemental' && ['damage', 'burn', 'slow'].includes(spell.kind)) requiredSkills.add('Elemental Magic');
  if (spell.kind === 'heal') requiredSkills.add('Healing Magic');
  for (const name of requiredSkills) if (ir08541SkillLevel(config, name) === null) missing.push(`skills.${name}.level`);
  if (spellId === 'earth_wall' && ir08541SkillLevel(config, 'Shield Handling') === null && ir08541SkillLevel(config, 'Elemental Magic') === null) missing.push('skills.Shield Handling.level or skills.Elemental Magic.level');
  if (spellId === 'entangling_roots' && ir08541SkillLevel(config, 'Survival') === null && ir08541SkillLevel(config, 'Elemental Magic') === null) missing.push('skills.Survival.level or skills.Elemental Magic.level');
  if (['damage', 'burn', 'slow'].includes(spell.kind)) {
    const wisdom = Number(config.attributes?.Wisdom);
    if (!Number.isInteger(wisdom) || wisdom < 1 || wisdom > 40) missing.push('attributes.Wisdom');
  }
  const casterView = { skills: skills || {}, naturalTalents: talents || [] };
  if (!missing.length && !ir05SpellRequirements({ ...spell, id: spellId }, casterView)) missing.push('existing spell skill requirement');
  if (missing.length) return { ok: false, missing: [...new Set(missing)], reason: `Missing or invalid configuration: ${[...new Set(missing)].join(', ')}.` };
  const talentRanks = rankData && typeof rankData === 'object' ? rankData : {};
  const cost = talents.includes('mana_efficiency') ? Math.max(1, Math.floor(spell.cost * .82)) : spell.cost;
  if (mana.current < cost) return { ok: false, missing: [], reason: `Insufficient mana (${mana.current}/${cost}).`, cost };
  return { ok: true, missing: [], config, spell, cost, talents, talentRanks };
}

function ir08541EligibleTargets(npcId, battle = state?.combat) {
  if (!battle?.active) return [];
  const character = state?.character, targets = [];
  if (!battle.playerOut && Number(character?.health) > 0 && Number(character?.maxHealth) > Number(character?.health)) {
    targets.push({ id: 'player', name: character.name, current: character.health, max: character.maxHealth, kind: 'player' });
  }
  for (const id of Array.isArray(battle.partyNpcIds) ? battle.partyNpcIds : []) {
    const entry = ir0851ProfileForParty(id);
    if (!entry || entry.profile.currentHealth >= entry.profile.maxHealth || !ir0851PartyMember(id)) continue;
    targets.push({ id, name: entry.npc.name || id, current: entry.profile.currentHealth, max: entry.profile.maxHealth, kind: 'companion' });
  }
  return targets;
}

function ir08541SpellAction(npcId, battle = state?.combat) {
  if (!battle?.active || !ir0851AvailableCombatCompanions(battle).some(entry => entry.npcId === npcId)) return null;
  const config = ir08541SpellConfig(npcId);
  if (!Array.isArray(config?.permittedSpellIds)) return null;
  for (const spellId of config.permittedSpellIds) {
    const check = ir08541SpellRequirements(spellId, npcId);
    if (!check.ok) continue;
    if (check.spell.kind === 'heal') {
      const target = ir08541EligibleTargets(npcId, battle)[0];
      if (target) return { npcId, spellId, targetId: target.id, target };
    } else if (['shield', 'wall'].includes(check.spell.kind)) {
      if (!battle.playerOut && state.character.health > 0 && !battle.guarding) return { npcId, spellId, targetId: 'player', target: { id: 'player', name: state.character.name, kind: 'player' } };
    } else if (['damage', 'burn', 'slow'].includes(check.spell.kind) && Number.isFinite(Number(battle.enemyHP)) && battle.enemyHP > 0) {
      return { npcId, spellId, targetId: 'enemy', target: { id: 'enemy', name: battle.enemyName, kind: 'enemy' } };
    }
  }
  return null;
}

function ir08541CastCompanionSpell(npcId, spellId, targetId, battle = state?.combat) {
  const check = ir08541SpellRequirements(spellId, npcId);
  if (!check.ok) return { ok: false, reason: check.reason, missing: check.missing };
  if (!battle?.active || !ir0851AvailableCombatCompanions(battle).some(entry => entry.npcId === npcId)) return { ok: false, reason: 'Caster is unavailable in this encounter.' };
  const { config, spell, cost, talents, talentRanks } = check;
  let target;
  if (spell.kind === 'heal') target = ir08541EligibleTargets(npcId, battle).find(entry => entry.id === targetId);
  else if (['shield', 'wall'].includes(spell.kind) && targetId === 'player' && !battle.playerOut && state.character.health > 0 && !battle.guarding) target = { id: 'player', name: state.character.name, kind: 'player' };
  else if (['damage', 'slow'].includes(spell.kind) && targetId === 'enemy' && battle.enemyHP > 0) target = { id: 'enemy', name: battle.enemyName, kind: 'enemy' };
  if (!target) return { ok: false, reason: 'Target is invalid, defeated, unavailable, or ineligible.' };
  // Recheck mana after target validation so rejected actions never spend resources.
  if (config.mana.current < cost) return { ok: false, reason: `Insufficient mana (${config.mana.current}/${cost}).` };
  const skillLevel = name => ir08541SkillLevel(config, name);
  let amount = 0, message = '';
  if (['damage', 'slow'].includes(spell.kind)) {
    const wisdom = Number(config.attributes.Wisdom), magic = skillLevel('Magic');
    const elemental = skillLevel('Elemental Magic') || 1;
    amount = Math.max(1, Math.round(spell.base + wisdom * .48 + magic * 1.7 + (spell.school === 'Elemental' ? elemental * 2 : 0) - battle.enemyDefense * .45));
    if (talents.includes('arcane_affinity')) amount = Math.round(amount * 1.12);
    if (talents.includes('spell_precision')) amount = Math.round(amount * (1.12 + (talentRanks.spell_precision || 0) * .02));
    if (talents.includes('mana_well')) amount = Math.round(amount * 1.04);
  }
  config.mana.current -= cost;
  if (spell.kind === 'damage' || spell.kind === 'slow') {
    battle.enemyHP = Math.max(0, battle.enemyHP - amount);
    if (spell.kind === 'slow') battle.enemyAttack = Math.max(1, battle.enemyAttack - 3);
    message = `${spell.name} deals ${amount} magical damage${spell.kind === 'slow' ? '; the enemy’s attacks weaken' : ''}.`;
  } else if (spell.kind === 'heal') {
    const healing = Math.min(target.max - target.current, Math.round(spell.base + skillLevel('Healing Magic') * 2 + (talents.includes('healing_aptitude') ? spell.base * .2 : 0)));
    if (healing <= 0) { config.mana.current += cost; return { ok: false, reason: 'Target is already at full health.' }; }
    if (target.kind === 'player') state.character.health += healing;
    else { ir0851Profile(target.id).currentHealth += healing; ir0851PersistCompanionHealth(target.id); }
    message = `${spell.name} restores ${healing} health to ${target.name}.`;
  } else if (spell.kind === 'shield' || spell.kind === 'wall') {
    battle.guarding = true;
    message = `${spell.name} forms a barrier for ${target.name}. The next incoming hit will be reduced.`;
  }
  irBattleLog(`${ir0851NPC(npcId)?.name || npcId} casts ${spell.name}. ${message}`);
  if (typeof persist === 'function') persist();
  if (battle.enemyHP <= 0) { irCombatEnd('victory', `${battle.enemyName} was defeated with ${spell.name}.`); return { ok: true, message, victory: true }; }
  return { ok: true, message, target };
}

function ir08541CompanionTurnSpell(companion, battle = state?.combat) {
  const action = ir08541SpellAction(companion?.npcId, battle);
  if (!action) return false;
  const result = ir08541CastCompanionSpell(action.npcId, action.spellId, action.targetId, battle);
  return !!result.ok;
}

function ir08541SpellcastingMarkup(npcId, battle = null) {
  const config = ir08541SpellConfig(npcId), npc = ir0851NPC(npcId), profile = ir0851Profile(npcId);
  if (!profile) return '<small>Spellcasting unavailable: combat profile is not configured.</small>';
  if (!config) return '<small>Spellcasting unavailable: no explicit spell permissions, formula data, or mana configuration.</small>';
  const permissions = Array.isArray(config.permittedSpellIds) ? config.permittedSpellIds : [];
  const mana = config.mana && Number.isInteger(config.mana.current) && Number.isInteger(config.mana.max) ? `${config.mana.current}/${config.mana.max} mana` : 'mana configuration missing or invalid';
  const rows = permissions.map(spellId => {
    const spell = IR_V05_SPELLS?.[spellId];
    const check = ir08541SpellRequirements(spellId, npcId);
    const action = battle ? ir08541SpellAction(npcId, battle) : null;
    const isAction = action?.spellId === spellId;
    const target = isAction ? ` · next target: ${esc(action.target.name)}` : '';
    const status = check.ok ? (isAction ? `Ready${target}` : battle ? 'No valid target right now' : `Available in combat · cost ${check.cost} mana`) : check.reason;
    return `<li>${esc(spell?.name || `Unknown spell: ${spellId}`)} · ${esc(status)}</li>`;
  }).join('');
  const skills = config.skills && typeof config.skills === 'object' ? Object.entries(config.skills).map(([name, value]) => `${esc(name)} ${esc(value?.level ?? value)}`).join(' · ') : 'Skills missing';
  const wisdom = config.attributes?.Wisdom ?? 'missing';
  const talents = Array.isArray(config.naturalTalents) ? (config.naturalTalents.length ? config.naturalTalents.map(esc).join(', ') : 'None configured') : 'missing';
  return `<div class="ir08541-spell-info"><strong>Spellcasting · ${esc(npc?.name || npcId)} · ${esc(mana)}</strong><small>Wisdom ${esc(wisdom)} · ${skills} · Talents: ${talents}</small><small>Permitted spells act automatically when their existing requirements, target, and mana cost are valid.</small><ul>${rows || '<li>No spells explicitly permitted.</li>'}</ul></div>`;
}

function ir08541NormalizeSpellcasting(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = { schema: 1 };
  if (Array.isArray(raw.permittedSpellIds)) out.permittedSpellIds = raw.permittedSpellIds.filter(id => typeof id === 'string' && /^[a-z0-9_]{1,48}$/.test(id)).slice(0, 24);
  if (raw.attributes && typeof raw.attributes === 'object' && !Array.isArray(raw.attributes)) {
    const wisdom = Number(raw.attributes.Wisdom);
    if (Number.isInteger(wisdom) && wisdom >= 1 && wisdom <= 40) out.attributes = { Wisdom: wisdom };
  }
  if (raw.skills && typeof raw.skills === 'object' && !Array.isArray(raw.skills)) {
    out.skills = {};
    for (const [name, value] of Object.entries(raw.skills)) {
      const level = Number(typeof value === 'object' ? value?.level : value);
      if (Number.isInteger(level) && level >= 1 && level <= 100 && (IR_V04_DISCIPLINES || []).includes(name)) out.skills[name] = { level };
    }
  }
  if (Array.isArray(raw.naturalTalents)) {
    const talents = raw.naturalTalents.filter(id => (IR_V05_TALENTS || []).some(talent => talent.id === id));
    if (talents.length === raw.naturalTalents.length && talents.length <= 8) out.naturalTalents = talents;
  }
  if (raw.talentRanks && typeof raw.talentRanks === 'object' && !Array.isArray(raw.talentRanks)) {
    out.talentRanks = {};
    for (const [id, rank] of Object.entries(raw.talentRanks)) if ((IR_V05_TALENTS || []).some(talent => talent.id === id) && Number.isInteger(Number(rank)) && Number(rank) >= 0 && Number(rank) <= 2) out.talentRanks[id] = Number(rank);
  }
  const current = Number(raw.mana?.current), max = Number(raw.mana?.max);
  if (Number.isInteger(current) && Number.isInteger(max) && max > 0 && max <= 180 && current >= 0 && current <= max) out.mana = { current, max };
  return out;
}

const ir08541NormalizeBase = normalizeSave;
normalizeSave = function (input) {
  const normalized = ir08541NormalizeBase.apply(this, arguments);
  const rawProfiles = input?.character?.companionCombatProfiles;
  if (!normalized?.character || !rawProfiles || typeof rawProfiles !== 'object' || Array.isArray(rawProfiles)) return normalized;
  for (const [npcId, rawProfile] of Object.entries(rawProfiles)) {
    const profile = normalized.character.companionCombatProfiles?.[npcId];
    if (!profile || !ir0851NPC(npcId, normalized.character, normalized.world)) continue;
    const config = ir08541NormalizeSpellcasting(rawProfile?.spellcasting);
    if (config) profile.spellcasting = config;
  }
  if (normalized.combat?.enemyBurnCasterNpcId) {
    const id = normalized.combat.enemyBurnCasterNpcId, config = normalized.character.companionCombatProfiles?.[id]?.spellcasting;
    const validSource = typeof id === 'string' && normalized.combat.partyNpcIds?.includes(id) && config?.permittedSpellIds?.includes('fire_bolt') && ir0851PartyMember(id, normalized.character, normalized.world);
    if (!validSource) { normalized.combat.enemyBurn = 0; delete normalized.combat.enemyBurnCasterNpcId; }
  }
  return normalized;
};

// Add spell configuration details inside each active party member's existing loadout panel.
const ir08541LoadoutBase = ir0854CompanionLoadoutMarkup;
ir0854CompanionLoadoutMarkup = function (npcId) {
  return `${ir08541LoadoutBase.apply(this, arguments)}${ir08541SpellcastingMarkup(npcId)}`;
};

const ir08541CombatPanelBase = irCombatPanel;
irCombatPanel = function () {
  let html = ir08541CombatPanelBase.apply(this, arguments);
  const battle = state?.combat;
  if (!battle?.active) return html;
  const list = ir0851AvailableCombatCompanions(battle).map(entry => ir08541SpellcastingMarkup(entry.npcId, battle)).join('');
  if (list) html = html.replace('<section class="ir0851-companion-status">', `<section class="ir08541-spell-status"><div class="tiny-label">COMPANION SPELLS & RESOURCES</div>${list}</section><section class="ir0851-companion-status">`);
  return html;
};

const ir08541DayPassBase = dayPass;
dayPass = function (days, activity) {
  const before = Number(state?.character?.daysLived) || 0;
  const result = ir08541DayPassBase.apply(this, arguments);
  const elapsed = Math.max(0, (Number(state?.character?.daysLived) || before) - before);
  if (elapsed > 0) for (const profile of Object.values(state?.character?.companionCombatProfiles || {})) {
    const config = profile?.spellcasting, mana = config?.mana;
    if (!mana || !Number.isInteger(mana.current) || !Number.isInteger(mana.max) || mana.max <= 0 || mana.max > 180 || mana.current < 0 || mana.current > mana.max) continue;
    const regen = config.naturalTalents?.includes('mana_well') ? 3 : 1;
    mana.current = Math.min(mana.max, mana.current + elapsed * regen);
  }
  return result;
};

const ir08541RestBase = rest;
rest = function () {
  const result = ir08541RestBase.apply(this, arguments);
  for (const profile of Object.values(state?.character?.companionCombatProfiles || {})) {
    const mana = profile?.spellcasting?.mana;
    if (!mana || !Number.isInteger(mana.current) || !Number.isInteger(mana.max) || mana.max <= 0 || mana.max > 180 || mana.current < 0 || mana.current > mana.max) continue;
    mana.current = Math.min(mana.max, mana.current + Math.ceil(mana.max * .30));
  }
  if (typeof persist === 'function') persist();
  return result;
};

const ir08541ConfigureProfileBase = ir0851ConfigureCompanionCombatProfile;
ir0851ConfigureCompanionCombatProfile = function (npcId, values) {
  const existing = ir08541SpellConfig(npcId);
  const result = ir08541ConfigureProfileBase.apply(this, arguments);
  if (result?.ok && existing) { ir0851Profile(npcId).spellcasting = existing; if (typeof persist === 'function') persist(); }
  return result;
};

const ir08541EnemyTurnBase = irEnemyTurn;
irEnemyTurn = function () {
  const battle = state?.combat, id = battle?.enemyBurnCasterNpcId;
  if (id) {
    const config = ir08541SpellConfig(id);
    if (!battle.partyNpcIds?.includes(id) || !ir0851PartyMember(id) || !config?.permittedSpellIds?.includes('fire_bolt') || ir08541SkillLevel(config, 'Elemental Magic') === null) {
      battle.enemyBurn = 0;
      delete battle.enemyBurnCasterNpcId;
    }
  }
  return ir08541EnemyTurnBase.apply(this, arguments);
};

if (typeof document !== 'undefined') {
  document.title = 'Infinite Realms — Version 0.8.5.4.1';
  const css = document.createElement('style');
  css.textContent = `.ir08541-spell-info{flex-basis:100%;display:flex;flex-direction:column;gap:5px;margin-top:8px;padding:9px;border:1px solid var(--line);border-radius:8px;background:var(--panel2)}.ir08541-spell-info small,.ir08541-spell-info li{font-size:10px;color:var(--muted);line-height:1.5}.ir08541-spell-info ul{margin:0;padding-left:17px}.ir08541-spell-status{margin:12px 0;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--panel2)}.ir08541-spell-status .ir08541-spell-info{margin:6px 0 0}.ir08541-spell-status .ir08541-spell-info li{list-style:disc}`;
  document.head?.appendChild(css);
}

if (typeof globalThis !== 'undefined') {
  globalThis.ir08541SpellRequirements = ir08541SpellRequirements;
  globalThis.ir08541SpellAction = ir08541SpellAction;
  globalThis.ir08541CastCompanionSpell = ir08541CastCompanionSpell;
  globalThis.ir08541SpellcastingMarkup = ir08541SpellcastingMarkup;
}
