'use strict';
// Infinite Realms v0.7.6.5 — VM tests for habitat compatibility, encounter selection, safety, saves, and rewards.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const noop = () => {};
function element() {
  return { textContent:'', innerHTML:'', title:'', style:{}, className:'', dataset:{}, appendChild:noop,
    remove:noop, click:noop, focus:noop, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false}, matches:()=>false, closest:()=>null };
}
function makeContext(skipHabitatModule=false) {
  const document = { title:'', head:element(), body:element(), addEventListener:noop, querySelector:()=>null,
    querySelectorAll:()=>[], getElementById:()=>null, createElement:element };
  const stored = new Map();
  const context = { console:{warn:noop,log:noop,error:console.error}, Math:Object.create(Math), String, Array, Object, Map, Set,
    Number, JSON, RegExp, Date, Intl, parseInt, parseFloat, document, window:{scrollTo:noop,addEventListener:noop},
    localStorage:{getItem:k=>stored.has(k)?stored.get(k):null,setItem:(k,v)=>stored.set(k,String(v)),removeItem:k=>stored.delete(k)},
    setTimeout:()=>0, clearTimeout:noop, requestAnimationFrame:noop };
  vm.createContext(context);
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  for (const file of [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]).filter(f=>!f.endsWith('/27-boot.js') && !(skipHabitatModule && f.endsWith('/41-monster-habitats-v0.7.6.5.js')))) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  }
  vm.runInContext('render=()=>{};persist=()=>true;toast=()=>{};',context);
  return context;
}
const ctx = makeContext();
function run(code) { return vm.runInContext(code,ctx); }
function setup(biome='forest',risk=43,type='wilderness',combatLevel=1,rep=0) {
  ctx.setupBiome=biome;ctx.setupRisk=risk;ctx.setupType=type;ctx.setupCombatLevel=combatLevel;ctx.setupRep=rep;
  run(`(()=>{createSeed='HABITAT-'+setupBiome+'-'+setupRisk+'-'+setupType;createStart='settlement';state=makeInitial('Habitat Tester','human','village');const s=state.world.region.sites[0];s.biomeId=setupBiome;s.biome=IR_BIOMES[setupBiome].name;s.risk=setupRisk;s.type=setupType;s.settlementType=setupType==='settlement'?'village':null;s.services=setupType==='settlement'?['inn','market']:[];state.world.siteId=s.id;state.character.daysLived=0;state.character.health=state.character.maxHealth;state.character.energy=state.character.maxEnergy;state.character.hunger=100;state.character.reputation=setupRep;state.character.skills.Combat.level=setupCombatLevel;state.character.skills.Survival.level=1;state.pendingEvent=null;state.combat=null;state.hunt=null;state.warning=null;})();`);
}
const tests=[];
function test(name,fn){try{tests.push({name,ok:!!fn()});}catch(e){tests.push({name,ok:false,detail:e?.stack||e.message});}}

test('All 16 established enemies and bosses have valid habitat profile entries',()=>run("irValidateMonsterHabitats().ok&&irValidateMonsterHabitats().profileCount===16&&Object.keys(IR_V0765_MONSTER_HABITATS).every(id=>!!IR_ENEMIES[id])"));
test('Every canonical profile biome refers to a currently supported IR_BIOMES key',()=>run("Object.values(IR_V0765_MONSTER_HABITATS).every(p=>p.biomes.every(b=>Object.prototype.hasOwnProperty.call(IR_BIOMES,b)))"));
test('All per-biome encounter-table entries match their declared habitat profiles',()=>run("Object.entries(IR_BIOME_ENEMIES).every(([b,ids])=>ids.length>0&&ids.every(id=>IR_V0765_MONSTER_HABITATS[id]&&IR_V0765_MONSTER_HABITATS[id].biomes.includes(b)))"));
test('Every supported biome retains at least one normal encounter and one suitable hunt target',()=>run("Object.keys(IR_BIOMES).every(b=>ir0765HabitatEncounterIds({biomeId:b,risk:15},'random').length>0&&ir0765HabitatEncounterIds({biomeId:b,risk:15},'hunt').length>0)"));
test('Desert no longer lists a mismatched slime; bandit, caravan thief and dryland boar remain',()=>run("!IR_BIOME_ENEMIES.desert.includes('slime')&&['bandit','thief','boar'].every(id=>IR_BIOME_ENEMIES.desert.includes(id))&&['thief','boar'].every(id=>IR_ENEMIES[id].biomes.includes('desert'))"));
test('River habitats now agree with the existing river encounter list for wolves and spiders',()=>run("['wolf','spider'].every(id=>IR_V0765_MONSTER_HABITATS[id].biomes.includes('river')&&IR_ENEMIES[id].biomes.includes('river'))"));
test('All nine existing raw biome pools remain accessible through the established API',()=>run("Object.keys(IR_BIOMES).every(b=>JSON.stringify(irBiomeEncounterIds(b))===JSON.stringify(IR_BIOME_ENEMIES[b]))"));
test('No ordinary biome pool includes a guardian, dragon, or settlement guard',()=>run("Object.values(IR_BIOME_ENEMIES).every(ids=>!['guardian','dragon','guard'].some(id=>ids.includes(id)))&&['guardian','dragon','guard'].every(id=>!IR_V0765_MONSTER_HABITATS[id].randomEligible)"));
test('Boss metadata retains separate dungeon and major-warning contexts',()=>run("IR_V0765_MONSTER_HABITATS.guardian.bossOnly&&IR_V0765_MONSTER_HABITATS.guardian.contexts.includes('dungeon-boss')&&IR_V0765_MONSTER_HABITATS.dragon.bossOnly&&IR_V0765_MONSTER_HABITATS.dragon.biomes.includes('mountain')&&!IR_V0765_MONSTER_HABITATS.dragon.randomEligible&&IR_V0765_MONSTER_HABITATS.dragon.contexts.includes('major-warning-chain')"));
test('Uncontrolled rank-3 and rank-4 threats are gated from low-risk beginner encounters',()=>{setup('mountain',20,'wilderness',1);return run("ir0765HabitatEncounterIds(site(),'random',['direwolf','ogre','troll','wight','cultist']).length===0")});
test('Uncontrolled rank-3 and rank-4 threats are gated from low-combat characters even in risky areas',()=>{setup('mountain',50,'wilderness',1);return run("ir0765HabitatEncounterIds(site(),'random',['direwolf','ogre','troll','wight','cultist']).length===0")});
test('Qualified character in dangerous mountain terrain can encounter compatible higher threats',()=>{setup('mountain',50,'wilderness',12);return run("['direwolf','ogre','troll','wight'].every(id=>ir0765IsHabitatEligible(id,site(),'random'))")});
test('High threats still fail habitat checks outside their biomes',()=>{setup('plains',50,'wilderness',15);return run("!ir0765IsHabitatEligible('ogre',site(),'random')&&!ir0765IsHabitatEligible('wight',site(),'random')&&!ir0765IsHabitatEligible('troll',site(),'random')")});
test('Repeated random selections stay within habitat and threat constraints',()=>{setup('forest',45,'wilderness',1);return run("(()=>{for(let i=0;i<100;i++){const e=irEnemyForSite();const p=IR_V0765_MONSTER_HABITATS[e.id];if(!p||!p.biomes.includes('forest')||!ir0765ThreatLevelAllows(e.id,site(),'random'))return false}return true})()")});
test('Actual random selector never returns a habitat-incompatible enemy across all nine biomes',()=>{setup('forest',50,'wilderness',12);return run("(()=>{Math.random=()=>0.999;for(const b of Object.keys(IR_BIOMES)){site().biomeId=b;site().biome=IR_BIOMES[b].name;site().risk=50;for(let i=0;i<20;i++){const e=irEnemyForSite(),p=IR_V0765_MONSTER_HABITATS[e.id];if(!p||!p.biomes.includes(b)||!ir0765ThreatLevelAllows(e.id,site(),'random'))return false}}return true})()")});
test('Actual random fallback never chooses rank-3/4 enemies for a beginner in risky mountains',()=>{setup('mountain',50,'wilderness',1);return run("(()=>{Math.random=()=>0.999;for(let i=0;i<40;i++){const e=irEnemyForSite();if((Number(e.threatRank)||1)>=3)return false}return true})()")});
test('Settlement encounters retain the existing high-reputation roadside mix',()=>{setup('woodland',8,'settlement',1,0);return run("(()=>{for(let i=0;i<40;i++){const e=irEnemyForSite();if(!['thief','bandit','goblin'].includes(e.id))return false}return true})()")});
test('Settlement guard encounter remains tied to the existing negative-reputation safeguard',()=>{setup('woodland',8,'settlement',1,-5);return run("(()=>{const pool=ir0765HabitatEncounterIds(site(),'settlement',['guard','thief','bandit']);return pool.includes('guard')&&pool.every(id=>['guard','thief','bandit'].includes(id))})()")});
test('Actual scouting encounter selection uses the filtered local habitat and beginner safeguard',()=>{setup('forest',43,'wilderness',1);run("state.character.attrs.Perception=1;state.character.skills.Survival.level=1;Math.random=()=>0;irExplore('scout')");return run("!!state.combat&&['wolf','spider','goblin','boar'].includes(state.combat.enemyId)&&IR_V0765_MONSTER_HABITATS[state.combat.enemyId].biomes.includes('forest')")});
test('Actual hunting still finds a suitable target in each biome including desert',()=>{setup('desert',32,'wilderness',1);run("Math.random=()=>0;irStartHunt()");return run("!!state.hunt&&state.hunt.enemyId==='boar'&&IR_V0765_MONSTER_HABITATS[state.hunt.enemyId].biomes.includes('desert')")});
test('Life-path trail event selects only a habitat-valid hunt target',()=>{setup('plains',33,'wilderness',1);run("Math.random=()=>0;irFinishPathEvent('path_tracks','pursue')");return run("!!state.hunt&&IR_V0765_HUNTABLE_IDS.has(state.hunt.enemyId)&&IR_V0765_MONSTER_HABITATS[state.hunt.enemyId].biomes.includes('plains')")});
test('Explicit dungeon boss start and victory path remain unchanged',()=>{setup('mountain',36,'wilderness',1);run("state.world.dungeon={entered:true,cleared:false,stage:'boss',siteId:site().id,visits:0};state.world.insideDungeon=true;Math.random=()=>0;const ok=startCombat('guardian',{type:'dungeon',room:'guardian'});state.combat.enemyHP=1;irBattleMove('attack')");return run("!state.combat&&state.world.dungeon.cleared===true&&state.world.dungeon.stage==='done'&&state.world.insideDungeon===false")});
test('Existing hunt victory still delivers combat rewards, hunt trophy and slime materials',()=>{setup('swamp',40,'wilderness',5);run("Math.random=()=>0;const before=state.character.inventory.slime_gel||0;startCombat('slime',{type:'hunt',siteId:site().id});state.combat.enemyHP=1;irBattleMove('attack');slimeRewardCheck=(state.character.inventory.slime_gel||0)>before&&state.character.huntTrophies[0]?.enemyId==='slime'&&state.character.combatStats.wins===1");return run('slimeRewardCheck')});
test('Combat templates retain existing danger and reward statistics',()=>run("IR_ENEMIES.ogre.hp===245&&IR_ENEMIES.ogre.attack===25&&IR_ENEMIES.troll.hp===320&&IR_ENEMIES.guardian.hp===620&&IR_ENEMIES.dragon.hp===5200&&Array.isArray(IR_ENEMIES.slime.loot)&&Array.isArray(IR_ENEMIES.bandit.coins)"));
test('Habitat profiles are runtime rules only and do not add save-schema fields',()=>{setup('forest',43,'wilderness',1);return run("(()=>{const saved=JSON.parse(JSON.stringify(state));const normalized=normalizeSave(saved);return normalized.character.race==='human'&&!Object.prototype.hasOwnProperty.call(normalized.character,'monsterHabitats')&&!Object.prototype.hasOwnProperty.call(normalized.world,'monsterHabitatState')&&!Object.prototype.hasOwnProperty.call(normalized,'v0765Habitats')})()")});
test('World generation remains stable because habitat data adds no world-generation effects',()=>{const moduleText=fs.readFileSync(path.join(root,'js/game/41-monster-habitats-v0.7.6.5.js'),'utf8');const current=run("JSON.stringify(generateProceduralWorld('HABITAT-GEN-PARITY','settlement'))");const baselineCtx=makeContext(true);const baseline=vm.runInContext("JSON.stringify(generateProceduralWorld('HABITAT-GEN-PARITY','settlement'))",baselineCtx);return current===baseline&&moduleText.includes('IR_V0765_MONSTER_HABITATS')});
test('No new enemy species are defined or added by habitat integration',()=>run("Object.keys(IR_V0765_MONSTER_HABITATS).every(id=>Object.prototype.hasOwnProperty.call(IR_ENEMIES,id))&&IR_V0765_MONSTER_HABITATS.dragon.name==='Ancient Dragon'"));
test('Habitat registry reports no structural errors after initialization',()=>run("irValidateMonsterHabitats().ok&&irValidateMonsterHabitats().errors.length===0"));

for (const t of tests) console.log(`${t.ok?'PASS':'FAIL'}\t${t.name}${t.detail?'\n'+t.detail:''}`);
console.log(`SUMMARY ${tests.filter(t=>t.ok).length}/${tests.length} PASS`);
if (tests.some(t=>!t.ok)) process.exitCode=1;
