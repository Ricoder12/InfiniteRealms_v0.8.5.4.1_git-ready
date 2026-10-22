'use strict';
// v0.7.6.2 focused regression tests for biome resource profiles, action guards, item compatibility, and crafting.
// App logic is executed in a Node VM; this is not a live-browser test.
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const noop=()=>{};
function makeContext(){
  const element=()=>({textContent:'',innerHTML:'',title:'',style:{},className:'',dataset:{},appendChild:noop,remove:noop,click:noop,focus:noop,classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},matches:()=>false,closest:()=>null});
  const document={title:'',head:{appendChild:noop},body:element(),addEventListener:noop,querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,createElement:element};
  const stored=new Map();
  const localStorage={getItem:k=>stored.has(k)?stored.get(k):null,setItem:(k,v)=>stored.set(k,String(v)),removeItem:k=>stored.delete(k)};
  const context={console:{warn:noop,log:noop,error:console.error},Math:Object.create(Math),String,Array,Object,Map,Set,Number,JSON,RegExp,Date,Intl,parseInt,parseFloat,document,window:{scrollTo:noop,addEventListener:noop},localStorage,setTimeout:()=>0,clearTimeout:noop,requestAnimationFrame:noop,URL,Blob:global.Blob,FileReader:function(){},navigator:{userAgent:'Node test VM'}};
  vm.createContext(context); return context;
}
function loadCurrent(){
  const context=makeContext(), html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const scripts=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]).filter(f=>!f.endsWith('/27-boot.js'));
  for(const relative of scripts)vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
  vm.runInContext('render=()=>{}; persist=()=>true; toast=()=>{};',context);
  return context;
}
function loadAcceptedBaseline(){
  const context=makeContext(), html=fs.readFileSync(path.join(root,'backups','InfiniteRealms_v0.7.6.1_backup.html'),'utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>x.trim());
  for(const [i,code] of scripts.slice(0,-1).entries())vm.runInContext(code,context,{filename:`v0.7.6.1-inline-${i}`});
  return context;
}
function run(ctx,expr){return vm.runInContext(expr,ctx)}
const results=[];
function test(name,fn){try{results.push({name,status:fn()?'PASS':'FAIL'});}catch(e){results.push({name,status:'FAIL',detail:e?.stack||e.message});}}
let current;
try{current=loadCurrent();}catch(e){console.error('Unable to load application source',e);process.exit(1);}
const biomes=['forest','plains','mountain','swamp','desert','snow','coast','river','woodland'];

test('Resource integrity validator accepts every supported profile and generated site',()=>{
  run(current,"createSeed='RESOURCE-INTEGRITY'; createStart='settlement'; state=makeInitial('Resource Validator','human','village');");
  return run(current,'irValidateBiomeResourceIntegrity(state.world).ok && irValidateBiomeResourceIntegrity(state.world).biomeCount===9 && irValidateBiomeResourceIntegrity(state.world).errors.length===0');
});

test('No resource pool or profile reference points at a missing item definition',()=>run(current,"Object.values(IR_BIOMES).every(p=>p.resources.every(r=>ir0762KnownItem(r.itemId))&&Object.entries(p.gatheringPools).every(([method,pool])=>['mining','woodcutting','herbalism','fishing'].includes(method)&&pool.length>0&&pool.every(ir0762KnownItem)))"));

test('The profile pools are meaningfully differentiated instead of sharing one generic gathering table',()=>run(current,"new Set(Object.values(IR_BIOMES).map(p=>JSON.stringify(p.gatheringPools))).size>=8 && IR_BIOMES.forest.gatheringPools.woodcutting.filter(x=>x==='wood').length>IR_BIOMES.desert.gatheringPools.woodcutting.filter(x=>x==='wood').length && IR_BIOMES.mountain.gatheringPools.mining.filter(x=>x==='ore').length>IR_BIOMES.desert.gatheringPools.mining.filter(x=>x==='ore').length && IR_BIOMES.coast.gatheringPools.fishing.filter(x=>x==='fish').length>IR_BIOMES.forest.gatheringPools.fishing.filter(x=>x==='fish').length"));

test('Actual gathering resolves the selected site biome rather than a previously visited site',()=>{
  const resultsByBiome={};
  for(const biomeId of ['forest','mountain']){
    current.biomeArg=biomeId;
    run(current,"(()=>{createSeed='CURRENT-SITE-'+biomeArg;createStart='settlement';Math.random=()=>0;state=makeInitial('Current Site Tester','human','village');const s=state.world.region.sites.find(x=>x.biomeId===biomeArg);s.risk=45;state.world.siteId=s.id;state.character.energy=100;state.character.hunger=100;state.pendingEvent=null;state.combat=null;ir04Gather('mining')})()");
    current.biomeResult=run(current,"({biome:site().biomeId,ore:state.character.inventory.ore||0,stone:state.character.inventory.stone||0})");
    resultsByBiome[biomeId]=current.biomeResult;
  }
  return resultsByBiome.forest.biome==='forest'&&resultsByBiome.mountain.biome==='mountain'&&resultsByBiome.forest.stone>0&&resultsByBiome.mountain.ore>0;
});

test('A truly invalid biome reference cannot create gathering, forage, or scouting loot',()=>{
  run(current,"createSeed='INVALID-RESOURCE-SITE';createStart='settlement';Math.random=()=>0;state=makeInitial('Invalid Resource Site','human','village');state.pendingEvent=null;state.combat=null;state.character.energy=100;state.character.hunger=100;const s=site();s.biomeId='not-a-biome';s.biome='unrecognized place';");
  const before=run(current,'({inventory:JSON.stringify(state.character.inventory),days:state.character.daysLived,energy:state.character.energy,siteId:state.world.siteId,biomeId:site().biomeId})');
  run(current,"ir04Gather('herbalism');irExplore('scout');explore('forage')");
  current.beforeInvalid=before;
  return run(current,"state.character.daysLived===beforeInvalid.days&&state.character.energy===beforeInvalid.energy&&JSON.stringify(state.character.inventory)===beforeInvalid.inventory&&state.world.siteId===beforeInvalid.siteId&&site().biomeId===beforeInvalid.biomeId&&irBiomeGatheringItems(site(),'herbalism').length===0&&irBiomeResourceItems(site(),'forage').length===0");
});

test('A dangling current-location ID cannot fall back to the first site and award its materials',()=>{
  run(current,"createSeed='DANGLING-CURRENT-SITE';createStart='settlement';state=makeInitial('Dangling Location','human','village');state.character.energy=100;state.character.hunger=100;state.world.siteId='missing-site-id';");
  const before=run(current,'({inventory:JSON.stringify(state.character.inventory),days:state.character.daysLived,energy:state.character.energy,siteId:state.world.siteId})');
  run(current,"ir04Gather('woodcutting');irExplore('scout');explore('forage')");
  current.beforeDangling=before;
  return run(current,"state.character.daysLived===beforeDangling.days&&state.character.energy===beforeDangling.energy&&JSON.stringify(state.character.inventory)===beforeDangling.inventory&&state.world.siteId===beforeDangling.siteId");
});

test('An ambiguous duplicate current-location ID cannot choose one biome and gather from it',()=>{
  run(current,"createSeed='AMBIGUOUS-CURRENT-SITE';createStart='settlement';Math.random=()=>0;state=makeInitial('Ambiguous Location','human','village');const original=state.world.region.sites.find(x=>x.biomeId==='forest');original.risk=45;const duplicate={...original,biomeId:'plains',biome:IR_BIOMES.plains.name};state.world.region.sites.push(duplicate);state.world.siteId=original.id;state.character.energy=100;state.character.hunger=100;state.pendingEvent=null;state.combat=null;");
  const before=run(current,'({inventory:JSON.stringify(state.character.inventory),days:state.character.daysLived,energy:state.character.energy,siteId:state.world.siteId})');
  current.beforeAmbiguous=before;
  run(current,"ir04Gather('woodcutting')");
  return run(current,"ir0762CurrentSite()===null&&state.character.daysLived===beforeAmbiguous.days&&state.character.energy===beforeAmbiguous.energy&&JSON.stringify(state.character.inventory)===beforeAmbiguous.inventory&&state.world.siteId===beforeAmbiguous.siteId");
});

test('Unavailable gathering does not spend time or energy even when called directly',()=>{
  run(current,"(()=>{createSeed='UNAVAILABLE-ACTION';createStart='settlement';state=makeInitial('Unavailable Action','human','village');const target=state.world.region.sites.find(x=>x.biomeId==='plains');target.risk=10;state.world.siteId=target.id;state.character.energy=100;state.character.hunger=100;state.pendingEvent=null;})();");
  const before=run(current,'({inventory:JSON.stringify(state.character.inventory),days:state.character.daysLived,energy:state.character.energy})');
  run(current,"ir04Gather('woodcutting')"); current.beforeUnavailable=before;
  return run(current,"state.character.daysLived===beforeUnavailable.days&&state.character.energy===beforeUnavailable.energy&&JSON.stringify(state.character.inventory)===beforeUnavailable.inventory");
});

test('Gathering retains the current skill-scaled success check',()=>{
  function outcome(level){
    current.levelArg=level;
    run(current,"(()=>{createSeed='SKILL-CHANCE-'+levelArg;createStart='settlement';Math.random=()=>0.8;state=makeInitial('Skill Chance','human','village');const s=state.world.region.sites.find(x=>x.biomeId==='mountain');s.risk=30;state.world.siteId=s.id;state.character.energy=100;state.character.hunger=100;state.character.pendingEvent=null;state.character.skills.Mining.level=levelArg;ir04Gather('mining')})()");
    return run(current,'({ore:state.character.inventory.ore||0,stone:state.character.inventory.stone||0,days:state.character.daysLived,energy:state.character.energy})');
  }
  const low=outcome(1),high=outcome(10);
  return low.days>0&&low.energy<100&&low.ore===0&&low.stone===0&&high.days>0&&high.energy<100&&(high.ore>0||high.stone>0);
});

test('Failed gathering still spends its established time and stamina but awards no material',()=>{
  run(current,"(()=>{createSeed='FAILED-GATHER';createStart='settlement';Math.random=()=>0.999;state=makeInitial('Failed Gather','human','village');const target=state.world.region.sites.find(x=>x.biomeId==='mountain');target.risk=36;state.world.siteId=target.id;state.character.energy=100;state.character.hunger=100;state.pendingEvent=null;state.character.skills.Mining.level=1;})();");
  const before=run(current,'({inventory:JSON.stringify(state.character.inventory),days:state.character.daysLived,energy:state.character.energy})');
  run(current,"ir04Gather('mining')"); current.beforeFailure=before;
  return run(current,"state.character.daysLived===beforeFailure.days+2&&state.character.energy===beforeFailure.energy-11&&JSON.stringify(state.character.inventory)===beforeFailure.inventory");
});

test('Actual gathering succeeds in every supported biome for every activity declared available',()=>{
  const biomeConfig=JSON.parse(run(current,"JSON.stringify(Object.entries(IR_BIOMES).map(([id,p])=>({id,activities:p.gatheringAvailability.slice()})))"));
  let checked=0;
  for(const biome of biomeConfig){
    let seed=null,siteId=null;
    for(let i=0;i<40&&!siteId;i++){
      const trial=`GATHER-MATRIX-${biome.id}-${i}`;
      current.trialSeed=trial;
      run(current,"(()=>{createSeed=trialSeed;createStart='settlement';state=makeInitial('Gather Matrix','human','village');})();");
      const ids=JSON.parse(run(current,`JSON.stringify(state.world.region.sites.filter(s=>s.biomeId===${JSON.stringify(biome.id)}).map(s=>s.id))`));
      if(ids.length){seed=trial;siteId=ids[0];}
    }
    if(!siteId)return false;
    const poolByActivity=JSON.parse(run(current,`(()=>{const p=IR_BIOMES[${JSON.stringify(biome.id)}];return JSON.stringify(Object.fromEntries(p.gatheringAvailability.map(m=>[m,p.gatheringPools[m]])))})()`));
    for(const activity of biome.activities){
      current.trialSeed=seed; current.trialSiteId=siteId; current.trialActivity=activity;
      run(current,"(()=>{createSeed=trialSeed;createStart='settlement';state=makeInitial('Gather Matrix','human','village');state.world.siteId=trialSiteId;const target=state.world.region.sites.find(s=>s.id===trialSiteId);target.risk=trialActivity==='mining'?32:10;state.pendingEvent=null;state.combat=null;state.character.energy=100;state.character.hunger=100;Math.random=()=>0;})();");
      const before=JSON.parse(run(current,"JSON.stringify({inventory:state.character.inventory,days:state.character.daysLived,energy:state.character.energy})"));
      run(current,"ir04Gather(trialActivity)");
      const after=JSON.parse(run(current,"JSON.stringify({inventory:state.character.inventory,days:state.character.daysLived,energy:state.character.energy})"));
      const validItems=poolByActivity[activity];
      const delivered=validItems.some(id=>(after.inventory[id]||0)>(before.inventory[id]||0));
      const dayCost=activity==='mining'?2:1, energyCost=activity==='mining'?11:8;
      if(!delivered||after.days<before.days+dayCost||after.energy>before.energy-energyCost)return false;
      checked++;
    }
  }
  return checked===biomeConfig.reduce((n,b)=>n+b.activities.length,0)&&checked>=20;
});

test('Existing field crafting recipe still consumes gathered-compatible inputs and creates a registered output',()=>{
  run(current,"createSeed='CRAFT-COMPAT';createStart='settlement';state=makeInitial('Crafter','human','village');state.pendingEvent=null;state.combat=null;state.character.energy=100;state.character.hunger=100;state.character.coin=0;state.character.inventory.herb=2;state.character.inventory.cloth=1;state.character.inventory.bandage=0;state.character.skills.Leatherworking.level=2;");
  run(current,"ir04Craft('bandage')");
  return run(current,"state.character.inventory.bandage===1&&state.character.inventory.herb===1&&(state.character.inventory.cloth||0)===0&&ITEMS.bandage&&IR_V04_RECIPES.bandage.output.bandage===1");
});

test('No new inventory items, recipes, item weights, or equipment definitions were introduced',()=>{
  const baseline=loadAcceptedBaseline();
  current.baselineItemKeys=run(baseline,'Object.keys(ITEMS).sort()');
  current.baselineDataKeys=run(baseline,'Object.keys(IR_V04_ITEM_DATA).sort()');
  current.baselineRecipes=run(baseline,'JSON.stringify(IR_V04_RECIPES)');
  current.baselineWeights=run(baseline,'JSON.stringify(IR_V04_ITEM_WEIGHT)');
  current.baselineGear=run(baseline,'JSON.stringify(IR_V05_GEAR)');
  return run(current,"JSON.stringify(Object.keys(ITEMS).sort())===JSON.stringify(baselineItemKeys)&&JSON.stringify(Object.keys(IR_V04_ITEM_DATA).sort())===JSON.stringify(baselineDataKeys)&&JSON.stringify(IR_V04_RECIPES)===baselineRecipes&&JSON.stringify(IR_V04_ITEM_WEIGHT)===baselineWeights&&JSON.stringify(IR_V05_GEAR)===baselineGear");
});

test('Existing character inventories and crafted-item metadata survive save normalization',()=>{
  run(current,"createSeed='RESOURCE-SAVE-ROUNDTRIP';createStart='settlement';state=makeInitial('Resource Save','human','village');state.character.inventory.ore=7;state.character.inventory.fish=4;state.character.inventory.slime_gel=2;state.character.itemCondition.iron_sword=73;state.character.itemQuality.iron_sword='Fine';");
  current.saveBefore=run(current,'JSON.parse(JSON.stringify(state))');
  const out=run(current,'normalizeSave(saveBefore)'); current.saveOut=out;
  return run(current,"saveOut.character.inventory.ore===7&&saveOut.character.inventory.fish===4&&saveOut.character.inventory.slime_gel===2&&saveOut.character.itemCondition.iron_sword===73&&saveOut.character.itemQuality.iron_sword==='Fine'&&irValidateBiomeResourceIntegrity(saveOut.world).ok");
});

test('Legacy cave mining compatibility resolves to the existing mountain resource profile without rewriting the site ID',()=>{
  current.caveArg={id:'old-cave',biomeId:'cave',risk:10};
  return run(current,"irResolveBiomeProfile(caveArg).source==='legacy-cave'&&irBiomeGatheringAvailable(caveArg,'mining')&&irBiomeGatheringItems(caveArg,'mining').includes('ore')&&caveArg.biomeId==='cave'");
});

test('No biome profile introduces racial-affinity fields or changes existing racial and talent modifiers',()=>{
  const baseline=loadAcceptedBaseline();
  current.oldRaces=run(baseline,'JSON.stringify(RACES)');
  current.oldTalents=run(baseline,'JSON.stringify(IR_V04_RACIAL_TALENTS)');
  return run(current,"Object.values(IR_BIOMES).every(p=>!('racialAffinity' in p)&&!('raceBonuses' in p)&&!('racialModifiers' in p))&&JSON.stringify(RACES)===oldRaces&&JSON.stringify(IR_V04_RACIAL_TALENTS)===oldTalents");
});

const failed=results.filter(r=>r.status==='FAIL');
console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length)process.exitCode=1;
