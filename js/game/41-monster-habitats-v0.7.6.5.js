'use strict';
// Infinite Realms v0.7.6.5 — Monster habitats.
// Additive compatibility layer. Existing combat math, enemy templates, loot, and save schemas stay authoritative.

const IR_V0765_HABITAT_VERSION = 1;
const IR_V0765_HUNTABLE_IDS = new Set(['wolf','spider','boar','direwolf','slime','goblin']);
const IR_V0765_SETTLEMENT_ENCOUNTERS = new Set(['guard','thief','bandit','goblin']);

// Reconcile only clear disagreements between the legacy enemy metadata and its existing biome encounter table.
// Boar is retained as a desert-fringe scavenger; thieves operate along desert caravan routes; wolves/spiders can
// occur in river-bank terrain. Slime is removed from the desert table because its existing profile is swamp/cave/river/coast.
function ir0765AddEnemyBiomes(enemyId, biomeIds) {
  const enemy = IR_ENEMIES?.[enemyId];
  if (!enemy) return;
  enemy.biomes = [...new Set([...(Array.isArray(enemy.biomes) ? enemy.biomes : []), ...biomeIds])];
}
ir0765AddEnemyBiomes('thief', ['desert']);
ir0765AddEnemyBiomes('boar', ['desert']);
ir0765AddEnemyBiomes('wolf', ['river']);
ir0765AddEnemyBiomes('spider', ['river']);
if (Array.isArray(IR_BIOME_ENEMIES?.desert)) {
  IR_BIOME_ENEMIES.desert = IR_BIOME_ENEMIES.desert.filter(id => id !== 'slime');
}

// Canonical habitat profiles use the currently supported biome IDs. Legacy cave lore is documented separately,
// because v0.7.6.4 resolves the old "cave" label through its mountain compatibility path.
const IR_V0765_MONSTER_HABITATS = {
  goblin:   {name:'Goblin Scavenger', biomes:['forest','plains','mountain','woodland'], legacyBiomes:[], contexts:['settlement','road'], huntable:true, randomEligible:true, role:'Scavenger and small-omnivore threat'},
  slime:    {name:'Cave Slime', biomes:['swamp','river','coast'], legacyBiomes:['cave'], contexts:[], huntable:true, randomEligible:true, role:'Wetland and waterside creature'},
  wolf:     {name:'Grey Wolf', biomes:['forest','plains','snow','woodland','river'], legacyBiomes:[], contexts:[], huntable:true, randomEligible:true, role:'Pack predator'},
  spider:   {name:'Giant Spider', biomes:['forest','swamp','mountain','river'], legacyBiomes:['cave'], contexts:[], huntable:true, randomEligible:true, role:'Web-building ambusher'},
  bandit:   {name:'Road Bandit', biomes:['plains','desert','coast','woodland','mountain'], legacyBiomes:[], contexts:['road','settlement'], huntable:false, randomEligible:true, role:'Intelligent road and caravan threat'},
  thief:    {name:'Nervous Thief', biomes:['plains','desert','coast','river'], legacyBiomes:[], contexts:['settlement','road'], huntable:false, randomEligible:true, role:'Opportunistic settlement and route threat'},
  guard:    {name:'Corrupt Guard', biomes:[], legacyBiomes:[], contexts:['settlement'], huntable:false, randomEligible:false, role:'Settlement-only serious encounter'},
  skeleton: {name:'Restless Skeleton', biomes:['mountain','snow','swamp'], legacyBiomes:['cave'], contexts:['dungeon-guard'], huntable:false, randomEligible:true, role:'Undead remnant'},
  wight:    {name:'Barrow Wight', biomes:['swamp','snow','mountain'], legacyBiomes:['cave'], contexts:[], huntable:false, randomEligible:true, role:'Elite undead threat'},
  boar:     {name:'Wild Boar', biomes:['forest','plains','woodland','desert'], legacyBiomes:[], contexts:[], huntable:true, randomEligible:true, role:'Charging wildlife, including dryland fringes'},
  direwolf: {name:'Dire Wolf', biomes:['forest','snow','mountain'], legacyBiomes:[], contexts:[], huntable:true, randomEligible:true, role:'Apex predator; threat-gated for uncontrolled encounters'},
  ogre:     {name:'Ogre Bruiser', biomes:['mountain','swamp','woodland'], legacyBiomes:[], contexts:[], huntable:false, randomEligible:true, role:'Major brute; threat-gated for uncontrolled encounters'},
  troll:    {name:'Moss Troll', biomes:['swamp','mountain','forest'], legacyBiomes:[], contexts:[], huntable:false, randomEligible:true, role:'Regenerating territorial creature; threat-gated'},
  cultist:  {name:'Forbidden Cultist', biomes:['swamp','mountain'], legacyBiomes:['cave'], contexts:['settlement','dungeon-guard'], huntable:false, randomEligible:true, role:'Occult human threat'},
  guardian: {name:'Vault Guardian', biomes:[], legacyBiomes:['dungeon'], contexts:['dungeon-boss'], huntable:false, randomEligible:false, bossOnly:true, role:'Dungeon boss; explicit dungeon-stage encounter only'},
  dragon:   {name:'Ancient Dragon', biomes:['mountain'], legacyBiomes:['volcano'], contexts:['major-warning-chain'], huntable:false, randomEligible:false, bossOnly:true, role:'City/nation-level threat; mountain/volcano lore habitat, never a normal biome encounter'}
};

function ir0765SupportedBiomeIds() { return Object.keys(IR_BIOMES || {}); }
function ir0765ResolveHabitatBiome(siteOrId) {
  if (typeof irResolveBiomeProfile === 'function') return irResolveBiomeProfile(siteOrId);
  return {id:null, profile:null, fallback:true};
}
function ir0765ThreatLevelAllows(id, siteOrId, purpose='random') {
  if (!['random','scout'].includes(purpose)) return true;
  const enemy = IR_ENEMIES?.[id];
  if (!enemy) return false;
  const rank = Math.max(1, Number(enemy.threatRank) || 1);
  const risk = Math.max(0, Number(siteOrId && typeof siteOrId === 'object' ? siteOrId.risk : 0) || 0);
  const combatLevel = Math.max(1, Number(state?.character?.skills?.Combat?.level) || 1);
  const requiredLevel = Math.max(1, Number(enemy.level) || rank || 1);
  // These gates affect only uncontrolled/random appearances. Intentional hunts and explicit scripted fights keep their current rules.
  if (rank >= 4 && (risk < 38 || combatLevel < Math.max(8, requiredLevel - 5))) return false;
  if (rank === 3 && (risk < 28 || combatLevel < Math.max(3, requiredLevel - 5))) return false;
  return true;
}
function ir0765IsHabitatEligible(id, siteOrId, purpose='random') {
  const profile = IR_V0765_MONSTER_HABITATS[id];
  if (!profile || !IR_ENEMIES?.[id]) return false;
  const resolved = ir0765ResolveHabitatBiome(siteOrId);
  const biomeId = resolved?.id || 'woodland';
  if (purpose === 'settlement') {
    // Preserve the old settlement-specific pool: guard is intentional only for a character already in bad standing;
    // bandit/goblin/thief remain valid roadside/settlement trouble without being made biome-wide.
    return IR_V0765_SETTLEMENT_ENCOUNTERS.has(id) && (profile.randomEligible || id === 'guard');
  }
  if (purpose === 'dungeon') return profile.contexts.includes('dungeon-guard') || profile.contexts.includes('dungeon-boss');
  if (purpose === 'hunt') return profile.huntable && profile.biomes.includes(biomeId) && ir0765ThreatLevelAllows(id, siteOrId, purpose);
  if (!profile.randomEligible || profile.bossOnly) return false;
  if (!profile.biomes.includes(biomeId)) return false;
  return ir0765ThreatLevelAllows(id, siteOrId, purpose);
}
function ir0765HabitatEncounterIds(siteOrId, purpose='random', candidates=null) {
  const resolved = ir0765ResolveHabitatBiome(siteOrId);
  const biomeId = resolved?.id || 'woodland';
  const base = Array.isArray(candidates) ? candidates : (IR_BIOME_ENEMIES?.[biomeId] || IR_BIOME_ENEMIES?.woodland || []);
  // Keep the original candidate ordering and weights (including any deliberate duplicate weighting).
  return base.filter(id => ir0765IsHabitatEligible(id, siteOrId, purpose));
}
function irValidateMonsterHabitats() {
  const errors = [], warnings = [];
  const biomeIds = ir0765SupportedBiomeIds();
  for (const [id, profile] of Object.entries(IR_V0765_MONSTER_HABITATS)) {
    if (!IR_ENEMIES?.[id]) errors.push(`Habitat ${id} has no existing enemy definition`);
    if (!Array.isArray(profile.biomes) || !Array.isArray(profile.contexts) || typeof profile.randomEligible !== 'boolean') errors.push(`Habitat ${id} has invalid profile structure`);
    for (const biome of profile.biomes || []) if (!biomeIds.includes(biome)) errors.push(`Habitat ${id} uses unsupported biome ${biome}`);
    if (profile.bossOnly && profile.randomEligible) errors.push(`Boss ${id} must not be randomly eligible`);
  }
  for (const id of Object.keys(IR_ENEMIES || {})) {
    // Ignore runtime-generated NPC opposition; only the established base roster needs explicit ecological profiles.
    if (!Object.prototype.hasOwnProperty.call(IR_V0765_MONSTER_HABITATS, id) && !/^npc[-_]/i.test(id)) warnings.push(`Existing runtime enemy ${id} has no fixed habitat profile`);
  }
  for (const biome of biomeIds) {
    const base = IR_BIOME_ENEMIES?.[biome];
    if (!Array.isArray(base) || !base.length) { errors.push(`Biome ${biome} has no encounter pool`); continue; }
    for (const id of base) {
      const profile = IR_V0765_MONSTER_HABITATS[id];
      if (!profile) errors.push(`Biome ${biome} points to unprofiled enemy ${id}`);
      else if (!profile.biomes.includes(biome)) errors.push(`Biome ${biome} contains ${id}, but its profile does not include that habitat`);
    }
    if (!ir0765HabitatEncounterIds(biome, 'random').length) errors.push(`Biome ${biome} has no eligible normal encounter`);
    if (!ir0765HabitatEncounterIds(biome, 'hunt').length) errors.push(`Biome ${biome} has no eligible hunt target`);
  }
  if (!IR_V0765_MONSTER_HABITATS.guardian.contexts.includes('dungeon-boss')) errors.push('Guardian lost its dungeon-boss context');
  if (!IR_V0765_MONSTER_HABITATS.dragon.bossOnly || IR_V0765_MONSTER_HABITATS.dragon.randomEligible) errors.push('Dragon is not protected from normal random encounters');
  return {ok:errors.length===0, errors, warnings, profileCount:Object.keys(IR_V0765_MONSTER_HABITATS).length, biomeCount:biomeIds.length};
}

// Temporary synchronous scope adapts legacy selection functions without changing their public pool API.
// irBiomeEncounterIds still returns the raw table outside this scope, preserving existing biome-data contracts.
function ir0765WithEncounterPurpose(purpose, callback) {
  const previous = irBiomeEncounterIds;
  irBiomeEncounterIds = function(siteOrId) { return ir0765HabitatEncounterIds(siteOrId, purpose); };
  try { return callback(); }
  finally { irBiomeEncounterIds = previous; }
}

// Wild fallback selection: retain the old settlement rules and risk-based additions, then remove habitat mismatches.
irEnemyForSite = function(forceId=null) {
  if (forceId && IR_ENEMIES?.[forceId]) return IR_ENEMIES[forceId];
  const s = typeof site === 'function' ? site() : null;
  const c = state?.character;
  if (!s || !c) return IR_ENEMIES?.goblin || null;
  let pool;
  if (s.type === 'settlement') {
    pool = c.reputation <= -5 ? ['guard','thief','bandit'] : ['thief','bandit','goblin'];
    pool = ir0765HabitatEncounterIds(s, 'settlement', pool);
  } else {
    pool = typeof irBiomeEncounterIds === 'function' ? irBiomeEncounterIds(s) : [];
    const danger = Number(s.risk) || 10;
    if (danger > 38) pool = pool.concat(['direwolf','ogre','troll','wight']);
    else if (danger > 27) pool = pool.concat(['direwolf','ogre','cultist']);
    pool = ir0765HabitatEncounterIds(s, 'random', pool);
  }
  if (!pool.length) {
    const biome = ir0765ResolveHabitatBiome(s).id || 'woodland';
    pool = ir0765HabitatEncounterIds(s, 'random', IR_BIOME_ENEMIES?.[biome] || IR_BIOME_ENEMIES?.woodland || []);
  }
  if (!pool.length) pool = ['goblin'];
  const id = pool[Math.floor(Math.random() * pool.length)];
  return IR_ENEMIES[id] || IR_ENEMIES.goblin;
};

const ir0765ExploreBase = irExplore;
irExplore = function(mode='scout') {
  if (mode === 'forage') return ir0765ExploreBase.apply(this, arguments);
  return ir0765WithEncounterPurpose('random', () => ir0765ExploreBase.apply(this, arguments));
};
const ir0765StartHuntBase = irStartHunt;
irStartHunt = function() {
  return ir0765WithEncounterPurpose('hunt', () => ir0765StartHuntBase.apply(this, arguments));
};
const ir0765FinishPathEventBase = irFinishPathEvent;
irFinishPathEvent = function(id, choice) {
  if (id === 'path_tracks' && choice === 'pursue') {
    return ir0765WithEncounterPurpose('hunt', () => ir0765FinishPathEventBase.apply(this, arguments));
  }
  return ir0765FinishPathEventBase.apply(this, arguments);
};

if (typeof document !== 'undefined') document.title = 'Infinite Realms — Version 0.7.6.5';
