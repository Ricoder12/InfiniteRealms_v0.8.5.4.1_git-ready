'use strict';
// Infinite Realms v0.8.5.1 — basic attacks for explicitly configured party companions.
// Companion data is keyed by the existing NPC ID; missing profiles never receive defaults.

function ir0851ValidProfile(profile) {
  if (!profile || typeof profile !== 'object' || profile.schema !== 1) return false;
  return Number.isInteger(profile.maxHealth) && profile.maxHealth > 0
    && Number.isInteger(profile.currentHealth) && profile.currentHealth >= 0 && profile.currentHealth <= profile.maxHealth
    && Number.isInteger(profile.attack) && profile.attack > 0
    && Number.isInteger(profile.defense) && profile.defense >= 0;
}

function ir0851ProfileMap(character = state?.character) {
  if (!character) return null;
  if (!character.companionCombatProfiles || typeof character.companionCombatProfiles !== 'object' || Array.isArray(character.companionCombatProfiles)) {
    character.companionCombatProfiles = {};
  }
  return character.companionCombatProfiles;
}

function ir0851Profile(npcId, character = state?.character) {
  const profile = ir0851ProfileMap(character)?.[npcId];
  return ir0851ValidProfile(profile) ? profile : null;
}

function ir0851NPC(npcId, character = state?.character, world = state?.world) {
  if (typeof npcId !== 'string' || !npcId.trim()) return null;
  if (typeof ir0843PartyNPC === 'function') return ir0843PartyNPC(character, npcId, world);
  return character?.npcs?.find(npc => npc?.id === npcId) || world?.v06?.changes?.[npcId] || null;
}

function ir0851Party(character = state?.character) {
  if (character && character !== state?.character) return character.activeParty || null;
  return typeof ir0843ActiveParty === 'function' ? ir0843ActiveParty() : character?.activeParty || null;
}

function ir0851PartyMember(npcId, character = state?.character, world = state?.world) {
  const party = ir0851Party(character);
  if (!party?.members?.some(member => member?.npcId === npcId)) return false;
  const squad = typeof ir0843PartySquad === 'function' ? ir0843PartySquad(character, party.squadId) : null;
  if (typeof ir0843PartyMemberEligible === 'function') return ir0843PartyMemberEligible(character, squad, npcId, world);
  return !!(squad?.memberNpcIds?.includes(npcId) && ir0851NPC(npcId, character, world)?.companionRecruitment?.status === 'recruited');
}

function ir0851ConfigureCompanionCombatProfile(npcId, values) {
  const character = state?.character, npc = ir0851NPC(npcId);
  if (!character || !npc) return { ok: false, reason: 'NPC reference is invalid.' };
  const previous = ir0851Profile(npcId, character);
  const next = {
    schema: 1,
    maxHealth: values?.maxHealth,
    currentHealth: values?.currentHealth,
    attack: values?.attack,
    defense: values?.defense
  };
  // Reconfiguration may change profile values, but omitted health preserves valid saved health.
  if (values && !Object.prototype.hasOwnProperty.call(values, 'currentHealth') && previous) {
    next.currentHealth = Math.min(previous.currentHealth, Number(next.maxHealth));
  }
  if (!ir0851ValidProfile(next)) return { ok: false, reason: 'Profile requires positive integer maxHealth and attack, integer defense of zero or more, and currentHealth from zero through maxHealth.' };
  ir0851ProfileMap(character)[npcId] = next;
  if (typeof persist === 'function') persist();
  return { ok: true, profile: next };
}

function ir0851ProfileForParty(npcId, { allowDefeated = false } = {}) {
  const npc = ir0851NPC(npcId), profile = ir0851Profile(npcId);
  if (!npc || npc.companionRecruitment?.status !== 'recruited' || !ir0851PartyMember(npcId) || !profile) return null;
  if (!allowDefeated && profile.currentHealth <= 0) return null;
  return { npc, profile };
}

function ir0851AvailableCombatCompanions(battle = state?.combat) {
  if (!battle?.active || !Array.isArray(battle.partyNpcIds)) return [];
  const seen = new Set();
  return battle.partyNpcIds.flatMap(npcId => {
    if (typeof npcId !== 'string' || seen.has(npcId)) return [];
    seen.add(npcId);
    const entry = ir0851ProfileForParty(npcId);
    return entry ? [{ npcId, ...entry }] : [];
  });
}

function ir0851CombatParticipantIds() {
  const party = ir0851Party();
  const ids = Array.isArray(party?.members) ? party.members.map(member => member?.npcId) : [];
  return [...new Set(ids)].filter(npcId => !!ir0851ProfileForParty(npcId));
}

function ir0852CompanionCombatRole(npcId) {
  const member = ir0851Party()?.members?.find(entry => entry?.npcId === npcId);
  return Array.isArray(IR_V0843_COMBAT_ROLES) && IR_V0843_COMBAT_ROLES.includes(member?.combatRole) ? member.combatRole : null;
}

function ir0852EffectiveCompanionAttack(npcId, profile) {
  const multiplier = ir0852CompanionCombatRole(npcId) === 'damage dealer' ? 1.5 : 1;
  return profile.attack * multiplier;
}

function ir0852EffectiveCompanionDefense(npcId, profile) {
  const multiplier = ir0852CompanionCombatRole(npcId) === 'tank' ? 1.5 : 1;
  return profile.defense * multiplier;
}

function ir0851PersistCompanionHealth(npcId) {
  const character = state?.character, profile = ir0851Profile(npcId, character);
  if (!character || !profile) return false;
  ir0851ProfileMap(character)[npcId] = profile;
  if (typeof persist === 'function') persist();
  return true;
}

function ir0851CombatCompanionPanel(battle = state?.combat) {
  if (!battle?.active) return '';
  const ids = Array.isArray(battle.partyNpcIds) ? battle.partyNpcIds : [];
  const party = ir0851Party();
  const visibleIds = [...new Set([...ids, ...(party?.members || []).map(member => member?.npcId)])].filter(id => typeof id === 'string');
  if (!visibleIds.length && !battle.playerOut) return '';
  const entries = visibleIds.map(npcId => {
    const npc = ir0851NPC(npcId), profile = ir0851Profile(npcId);
    const activeParty = ir0851PartyMember(npcId);
    const listedAtStart = ids.includes(npcId);
    const status = !npc ? 'Unavailable · NPC missing'
      : npc.companionRecruitment?.status !== 'recruited' ? 'Unavailable · not recruited'
      : !activeParty ? 'Unavailable · no longer in party'
      : !profile ? 'Unavailable · profile not configured'
      : profile.currentHealth <= 0 ? 'Defeated'
      : !listedAtStart ? 'Unavailable · not in this encounter'
      : 'Ready';
    const health = profile ? `${profile.currentHealth}/${profile.maxHealth} HP` : 'Health unavailable';
    return `<div class="ir0851-combatant"><strong>${esc(npc?.name || npcId)}</strong><span>${health} · ${status}</span></div>`;
  }).join('');
  const down = battle.playerOut
    ? '<div class="notice warning">You are down with a recoverable injury. Your companions can continue the encounter.</div><div class="ir-battle-actions"><button class="button primary" data-action="battle-move" data-move="companion-turn">Companions continue</button></div>'
    : '';
  return `<section class="ir0851-companion-status"><div class="tiny-label">PARTY COMBATANTS</div>${entries || '<p>No companion can continue this encounter.</p>'}${down}</section>`;
}

function ir0851RecoverCompanion(npcId, method) {
  const character = state?.character, location = typeof site === 'function' ? site() : null;
  if (!character || state?.combat?.active || state?.pendingEvent) return { ok: false, reason: 'Resolve the current combat or event first.' };
  const npc = ir0851NPC(npcId), profile = ir0851Profile(npcId);
  if (!npc || npc.companionRecruitment?.status !== 'recruited' || !ir0851PartyMember(npcId) || !profile) return { ok: false, reason: 'Select a recruited party companion with a valid combat profile.' };
  if (profile.currentHealth >= profile.maxHealth) return { ok: false, reason: 'This companion does not need recovery.' };
  if (method === 'rest') {
    const atInn = !!location?.services?.includes('inn'), atCamp = !!location?.changes?.temporaryCamp;
    if (!atInn && !atCamp) return { ok: false, reason: 'Rest requires an inn or temporary camp.' };
    if (state?.combat?.active || state?.pendingEvent) return { ok: false, reason: 'Resolve the current combat or event before resting.' };
    const cost = atInn ? 12 : 0;
    if (character.coin < cost) return { ok: false, reason: `You need ${cost} coins for an inn bed.` };
    character.coin -= cost;
    dayPass(1, atInn ? 'inn rest' : 'camp rest');
    profile.currentHealth = Math.max(1, Math.min(profile.maxHealth, profile.currentHealth + (atInn ? 10 : 5)));
  } else if (method === 'healer') {
    if (!location?.services?.includes('healer')) return { ok: false, reason: 'No healer is available here.' };
    if (character.coin < 8) return { ok: false, reason: 'A healer needs 8 coins for supplies.' };
    character.coin -= 8;
    dayPass(1, 'healing');
    profile.currentHealth = Math.max(1, Math.min(profile.maxHealth, profile.currentHealth + 35));
  } else return { ok: false, reason: 'Unsupported recovery method.' };
  ir0851PersistCompanionHealth(npcId);
  return { ok: true, npc, profile };
}

function ir0851PartyRecoveryMarkup(npcId) {
  const profile = ir0851Profile(npcId), location = typeof site === 'function' ? site() : null;
  if (!profile || profile.currentHealth >= profile.maxHealth) return '';
  const buttons = [];
  if (location?.services?.includes('inn') || location?.changes?.temporaryCamp) {
    const cost = location.services?.includes('inn') ? 12 : 0;
    buttons.push(`<button class="button small" data-action="ir0851-recover-companion" data-npc="${esc(npcId)}" data-method="rest">Rest companion · ${cost ? `${cost} ◈` : 'free'}</button>`);
  }
  if (location?.services?.includes('healer')) buttons.push(`<button class="button small" data-action="ir0851-recover-companion" data-npc="${esc(npcId)}" data-method="healer">Healer · 8 ◈</button>`);
  return buttons.length ? `<div class="ir0851-recovery-actions">${buttons.join('')}</div>` : '<small>Recovery unavailable here; no companion health was restored.</small>';
}

const ir0851CombatCSS = document.createElement('style');
ir0851CombatCSS.textContent = `.ir0851-companion-status{margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2)}.ir0851-combatant{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line);font-size:11px}.ir0851-combatant:last-of-type{border-bottom:0}.ir0851-combatant span{color:var(--muted);text-align:right}.ir0851-recovery-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}`;
document.head?.appendChild(ir0851CombatCSS);

const ir0851StartCombatBase = startCombat;
startCombat = function (enemyId = null, source = { type: 'wild' }) {
  const started = ir0851StartCombatBase.apply(this, arguments);
  if (!started || !state?.combat?.active) return started;
  const participants = ir0851CombatParticipantIds();
  if (participants.length) {
    state.combat.partyNpcIds = participants;
    persist();
    render();
  }
  return started;
};

const ir0851CombatEndBase = irCombatEnd;
irCombatEnd = function (kind, detail = '') {
  const battle = state?.combat;
  if (kind === 'defeat' && battle?.active && !battle.playerOut && ir0851AvailableCombatCompanions(battle).length) {
    const character = state.character;
    character.health = 1;
    character.energy = clamp(character.energy - 12, 0, character.maxEnergy);
    character.injuries = Array.isArray(character.injuries) ? character.injuries : [];
    character.injuries.push({ id: 'wounded', name: 'Wounded', days: 4, detail: 'A recoverable injury from being overwhelmed in combat.' });
    battle.playerOut = true;
    battle.playerStatuses = [];
    irBattleLog(`${character.name} is down with a recoverable injury. The companions continue the fight.`);
    persist(); render(); toast('You are down. Your companions can continue.');
    return;
  }
  return ir0851CombatEndBase.apply(this, arguments);
};

const ir0851EnemyTurnBase = irEnemyTurn;
irEnemyTurn = function () {
  const battle = state?.combat;
  if (!battle?.active) return ir0851EnemyTurnBase.apply(this, arguments);
  const companions = ir0851AvailableCombatCompanions(battle);
  if (!companions.length) {
    if (battle.playerOut) return irCombatEnd('defeat', 'No eligible combatants remain.');
    return ir0851EnemyTurnBase.apply(this, arguments);
  }

  // Companion basic attacks reuse the existing base attack scaling, minimum damage,
  // enemy defense subtraction, turn timing, and victory handling. Attack replaces Strength;
  // companions have no skill or equipment contribution in this subversion.
  for (const companion of companions) {
    if (!state?.combat?.active) return;
    const profile = ir0851Profile(companion.npcId);
    if (!profile || profile.currentHealth <= 0) continue;
    if (typeof ir08541CompanionTurnSpell === 'function' && ir08541CompanionTurnSpell(companion, battle)) {
      if (!state?.combat?.active) return;
      continue;
    }
    const role = ir0852CompanionCombatRole(companion.npcId);
    if (role === 'support' && !battle.playerOut && state.character.health > 0 && !battle.guarding) {
      battle.guarding = true;
      irBattleLog(`${companion.npc.name} braces to guard ${state.character.name} against the next blow.`);
      continue;
    }
    const attack = ir0852EffectiveCompanionAttack(companion.npcId, profile);
    let damage = Math.max(2, Math.floor(attack * .42 + Math.random() * 5 - battle.enemyDefense));
    if (battle.enemyId === 'slime') damage = Math.max(1, Math.floor(damage * .75));
    battle.enemyHP = Math.max(0, battle.enemyHP - damage);
    if (typeof ir0854WearWeapon === 'function') ir0854WearWeapon(companion.npcId);
    irBattleLog(`${companion.npc.name} strikes ${battle.enemyName} for ${damage} damage.`);
    if (battle.enemyHP <= 0) {
      irCombatEnd('victory', `${battle.enemyName} was defeated by the party.`);
      return;
    }
  }

  if (!battle.playerOut) return ir0851EnemyTurnBase.apply(this, arguments);

  const target = ir0851AvailableCombatCompanions(battle)[0];
  if (!target) return irCombatEnd('defeat', 'No eligible combatants remain.');
  const statuses = battle.companionStatuses && typeof battle.companionStatuses === 'object' ? battle.companionStatuses : (battle.companionStatuses = {});
  const targetStatuses = Array.isArray(statuses[target.npcId]) ? statuses[target.npcId] : (statuses[target.npcId] = []);
  let statusDamage = 0;
  for (const status of targetStatuses) {
    const amount = status.id === 'poison' ? 3 : status.id === 'bleed' ? 2 : 0;
    if (amount) { target.profile.currentHealth = Math.max(0, target.profile.currentHealth - amount); statusDamage += amount; }
    status.turns--;
  }
  statuses[target.npcId] = targetStatuses.filter(status => status.turns > 0);
  if (statusDamage) {
    irBattleLog(`${target.npc.name} takes ${statusDamage} damage from an ongoing effect.`);
    ir0851PersistCompanionHealth(target.npcId);
    if (target.profile.currentHealth <= 0) {
      irBattleLog(`${target.npc.name} is defeated and cannot continue.`);
      if (!ir0851AvailableCombatCompanions(battle).length) irCombatEnd('defeat', 'No eligible companions remain.');
      else { battle.round++; persist(); render(); }
      return;
    }
  }

  if (battle.enemyStyle === 'regenerate') battle.enemyHP = Math.min(battle.enemyMaxHP, battle.enemyHP + 3);
  let raw = battle.enemyAttack + Math.floor(Math.random() * 4), effect = '';
  if ((battle.enemyStyle === 'heavy' || battle.enemyStyle === 'boss') && Math.random() < .24) { raw += 4; effect = 'A crushing heavy blow lands. '; }
  if (battle.enemyStyle === 'trickster') effect = 'The enemy throws dust at ' + target.npc.name + '. ';
  const effectiveDefense = ir0852EffectiveCompanionDefense(target.npcId, target.profile);
  const damage = Math.max(1, Math.floor(raw - effectiveDefense));
  target.profile.currentHealth = Math.max(0, target.profile.currentHealth - damage);
  if (typeof ir0854WearArmor === 'function') ir0854WearArmor(target.npcId);
  ir0851PersistCompanionHealth(target.npcId);
  irBattleLog(`${effect}${battle.enemyName} deals ${damage} damage to ${target.npc.name}.`);
  if ((battle.enemyStyle === 'poison' || battle.enemyStyle === 'acid') && Math.random() < .24 && !statuses[target.npcId].some(status => status.id === 'poison')) {
    statuses[target.npcId].push({ id: 'poison', name: 'Poison', turns: 3 });
    irBattleLog(`${target.npc.name} is poisoned.`);
  }
  if ((battle.enemyStyle === 'bleed' || battle.enemyStyle === 'charge') && Math.random() < .18 && !statuses[target.npcId].some(status => status.id === 'bleed')) {
    statuses[target.npcId].push({ id: 'bleed', name: 'Bleeding', turns: 2 });
    irBattleLog(`${target.npc.name} is bleeding.`);
  }
  if (target.profile.currentHealth <= 0) irBattleLog(`${target.npc.name} is defeated and cannot continue.`);
  if (!ir0851AvailableCombatCompanions(battle).length) return irCombatEnd('defeat', 'No eligible companions remain.');
  battle.round++;
  persist(); render();
};

const ir0851BattleMoveBase = irBattleMove;
irBattleMove = function (move, itemId) {
  const battle = state?.combat;
  if (!battle?.playerOut) return ir0851BattleMoveBase.apply(this, arguments);
  if (move !== 'companion-turn') { toast('You are down. Advance the encounter with your companions.'); return; }
  if (!ir0851AvailableCombatCompanions(battle).length) return irCombatEnd('defeat', 'No eligible companions remain.');
  irEnemyTurn();
};

const ir0851CombatPanelBase = irCombatPanel;
irCombatPanel = function () {
  let html = ir0851CombatPanelBase.apply(this, arguments);
  if (!state?.combat?.active) return html;
  const section = ir0851CombatCompanionPanel();
  if (!section) return html;
  if (state.combat.playerOut) html = html.replace(/<div class="ir-battle-actions">[\s\S]*?<\/div>/, '');
  html = html.replace('<div class="ir-battle-log">', `${section}<div class="ir-battle-log">`);
  return html;
};

const ir0851PartyPanelBase = ir0843PartyPanel;
ir0843PartyPanel = function () {
  let html = ir0851PartyPanelBase.apply(this, arguments);
  return html.replace(/<article class="ir0843-party-member">([\s\S]*?)<\/article>/g, (whole, content) => {
    const match = content.match(/data-npc="([^"]+)"/);
    const npcId = match?.[1];
    if (!npcId || !ir0851PartyMember(npcId)) return whole;
    const profile = ir0851Profile(npcId);
    const status = !profile ? 'Combat profile not configured; excluded from combat.'
      : profile.currentHealth <= 0 ? `Defeated · ${profile.currentHealth}/${profile.maxHealth} HP`
      : `Combat health · ${profile.currentHealth}/${profile.maxHealth} HP`;
    const roleNotice = ir0852CompanionCombatRole(npcId) === 'healer'
      ? '<small class="ir0851-profile-status">Combat healing unavailable: this NPC has no configured spell, mana, or healing-skill data.</small>'
      : '';
    return `<article class="ir0843-party-member">${content}<small class="ir0851-profile-status">${status}</small>${roleNotice}${ir0851PartyRecoveryMarkup(npcId)}</article>`;
  });
};

const ir0851ActionBase = ir072Action;
ir072Action = function (target) {
  if (target?.dataset?.action === 'ir0851-recover-companion') {
    const result = ir0851RecoverCompanion(target.dataset.npc, target.dataset.method);
    toast(result.ok ? `${result.npc.name} recovered through ${target.dataset.method === 'rest' ? 'rest' : 'healer'} care.` : result.reason);
    render();
    return true;
  }
  return ir0851ActionBase.apply(this, arguments);
};

const ir0851NormalizeBase = normalizeSave;
normalizeSave = function (input) {
  const normalized = ir0851NormalizeBase.apply(this, arguments);
  if (!normalized?.character) return normalized;
  const rawProfiles = input?.character?.companionCombatProfiles;
  const profiles = {};
  if (rawProfiles && typeof rawProfiles === 'object' && !Array.isArray(rawProfiles)) {
    for (const [npcId, profile] of Object.entries(rawProfiles)) {
      if (typeof npcId !== 'string' || !npcId.trim() || !ir0851ValidProfile(profile)) continue;
      if (!ir0851NPC(npcId, normalized.character, normalized.world)) continue;
      profiles[npcId] = { schema: 1, maxHealth: profile.maxHealth, currentHealth: profile.currentHealth, attack: profile.attack, defense: profile.defense };
    }
  }
  normalized.character.companionCombatProfiles = profiles;
  const battle = normalized.combat;
  if (battle?.active) {
    const seen = new Set();
    battle.partyNpcIds = (Array.isArray(battle.partyNpcIds) ? battle.partyNpcIds : []).filter(npcId => {
      if (typeof npcId !== 'string' || seen.has(npcId) || !profiles[npcId] || !ir0851NPC(npcId, normalized.character, normalized.world)
        || !ir0851PartyMember(npcId, normalized.character, normalized.world)) return false;
      seen.add(npcId);
      return true;
    });
    battle.playerOut = battle.playerOut === true;
    battle.companionStatuses = battle.companionStatuses && typeof battle.companionStatuses === 'object' && !Array.isArray(battle.companionStatuses) ? battle.companionStatuses : {};
    for (const npcId of Object.keys(battle.companionStatuses)) {
      if (!battle.partyNpcIds.includes(npcId)) { delete battle.companionStatuses[npcId]; continue; }
      battle.companionStatuses[npcId] = (Array.isArray(battle.companionStatuses[npcId]) ? battle.companionStatuses[npcId] : [])
        .filter(status => status && ['poison', 'bleed'].includes(status.id) && Number(status.turns) > 0)
        .slice(0, 6).map(status => ({ id: status.id, name: status.id === 'poison' ? 'Poison' : 'Bleeding', turns: Math.min(3, Math.floor(Number(status.turns))) }));
    }
    const hasCompanion = battle.partyNpcIds.some(npcId => profiles[npcId].currentHealth > 0 && ir0851PartyMember(npcId, normalized.character, normalized.world));
    if (battle.playerOut && !hasCompanion) normalized.combat = null;
  }
  return normalized;
};

const ir0851RunActionBase = runAction;
runAction = function (target) {
  if (target?.dataset?.action === 'battle-move' && target.dataset.move === 'companion-turn') return irBattleMove('companion-turn');
  return ir0851RunActionBase.apply(this, arguments);
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.8.5.1';
if (typeof globalThis !== 'undefined') {
  globalThis.ir0851ValidProfile = ir0851ValidProfile;
  globalThis.ir0851ConfigureCompanionCombatProfile = ir0851ConfigureCompanionCombatProfile;
  globalThis.ir0851RecoverCompanion = ir0851RecoverCompanion;
  globalThis.ir0851CombatParticipantIds = ir0851CombatParticipantIds;
}
