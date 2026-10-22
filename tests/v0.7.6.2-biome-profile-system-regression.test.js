'use strict';
// v0.7.6.2 biome resource profile, consumer integration, generation equivalence, and save compatibility.
// These tests execute the app's real source modules in a Node VM; this is not a live browser test.
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
function loadBaseline(){
  const context=makeContext(), html=fs.readFileSync(path.join(root,'backups','InfiniteRealms_v0.7.5.5_backup.html'),'utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>x.trim());
  for(const [i,code] of scripts.slice(0,-1).entries())vm.runInContext(code,context,{filename:`v0.7.5.5-inline-${i}`});
  return context;
}
function run(ctx,expr){return vm.runInContext(expr,ctx)}
const results=[];
function irBiomeProfileNameForLegacySite(label,ctx){ ctx.labelArg=label; return run(ctx, 'irResolveBiomeProfile(labelArg).profile.name'); }
function test(name,fn){try{results.push({name,status:fn()?'PASS':'FAIL'});}catch(e){results.push({name,status:'FAIL',detail:e?.stack||e.message});}}
let current;
try{current=loadCurrent();}catch(e){console.error('Unable to load current app source sequence',e);process.exit(1);}
const expected=['forest','plains','mountain','swamp','desert','snow','coast','river','woodland'];

test('The authoritative registry retains all nine existing biome IDs, including river and woodland',()=>{
  const keys=run(current,'Object.keys(IR_BIOMES)'); return JSON.stringify(keys)===JSON.stringify(expected);
});

test('Biome source definition has no duplicated top-level registry keys',()=>{
  const source=fs.readFileSync(path.join(root,'js/data/world.js'),'utf8');
  const block=source.match(/const IR_BIOMES = \{([\s\S]*?)\n\};/)?.[1]; if(!block)return false;
  const keys=[...block.matchAll(/^\s{2}([a-z][a-z0-9_-]*):\{/gm)].map(m=>m[1]);
  return keys.length===9&&new Set(keys).size===keys.length&&expected.every(k=>keys.includes(k));
});

test('Every biome profile validates with name, description, terrain, conditions, habitats, resources, and safe modifier data',()=>{
  const report=run(current,'irValidateBiomeProfiles()'); return report.ok&&report.profileCount===9&&report.errors.length===0;
});

test('All profile resource references resolve to existing item definitions',()=>{
  return run(current,"Object.values(IR_BIOMES).every(p=>p.resources.every(r=>ITEMS[r.itemId]||IR_V04_ITEM_DATA[r.itemId]))");
});

test('Profile-driven forage and scout resource weights exactly preserve the former per-biome loot arrays',()=>{
  const prior={
    forest:{forage:['herb','herb','scrap'],scout:['herb','herb','spider_silk']},
    plains:{forage:['bread','herb','scrap'],scout:['bread','herb','wolf_fang']},
    mountain:{forage:['ore','ore','scrap'],scout:['ore','scrap','curse_shard']},
    swamp:{forage:['herb','herb','scrap'],scout:['herb','potion','spider_silk']},
    desert:{forage:['ore','scrap','charm'],scout:['ore','scrap','charm']},
    snow:{forage:['herb','bread','scrap'],scout:['herb','bread','wolf_fang']},
    coast:{forage:['scrap','herb','charm'],scout:['scrap','charm','bread']},
    river:{forage:['herb','bread','scrap'],scout:['herb','bread','potion']},
    woodland:{forage:['herb','scrap','bread'],scout:['herb','scrap','bread']}
  };
  current.priorLoot=prior;
  return run(current,'Object.keys(priorLoot).every(k=>JSON.stringify(irBiomeResourceItems(k,"forage"))===JSON.stringify(priorLoot[k].forage)&&JSON.stringify(irBiomeResourceItems(k,"scout"))===JSON.stringify(priorLoot[k].scout))');
});

test('Profile gathering pools provide biome-specific material weighting using existing item definitions',()=>{
  const old={
    forest:{mining:['stone','ore'],woodcutting:['wood','wood','wood','herb'],herbalism:['herb','herb','herb','spider_silk'],fishing:['herb']},
    plains:{mining:['stone','ore'],woodcutting:['wood','herb'],herbalism:['herb','herb','bread'],fishing:['fish']},
    mountain:{mining:['ore','ore','ore','stone','stone','coal'],woodcutting:['wood','wood','stone'],herbalism:['herb','herb','herb'],fishing:['fish']},
    swamp:{mining:['stone','ore'],woodcutting:['wood','herb','herb'],herbalism:['herb','herb','slime_gel'],fishing:['fish','herb']},
    desert:{mining:['stone','stone','ore','coal'],woodcutting:['wood'],herbalism:['herb','herb'],fishing:['fish']},
    snow:{mining:['ore','stone','stone'],woodcutting:['wood','wood','wood'],herbalism:['herb','herb'],fishing:['fish','fish','fish','herb']},
    coast:{mining:['stone','stone','ore'],woodcutting:['wood'],herbalism:['herb','herb'],fishing:['fish','fish','fish','scrap']},
    river:{mining:['stone','ore'],woodcutting:['wood','herb'],herbalism:['herb','herb','herb'],fishing:['fish','fish','fish','herb']},
    woodland:{mining:['stone','ore'],woodcutting:['wood','wood','wood','herb'],herbalism:['herb','herb','herb'],fishing:['fish','herb']}
  };  current.oldGathering=old;
  return run(current,"Object.keys(oldGathering).every(k=>Object.keys(oldGathering[k]).every(method=>JSON.stringify(irBiomeGatheringItems(k,method))===JSON.stringify(oldGathering[k][method])))");
});

test('Gathering availability metadata matches the existing biome/action eligibility rules',()=>{
  const available={forest:['woodcutting','herbalism'],plains:['herbalism'],mountain:['mining','woodcutting','herbalism'],swamp:['woodcutting','herbalism','fishing'],desert:['mining','herbalism'],snow:['mining','woodcutting','herbalism','fishing'],coast:['herbalism','fishing'],river:['herbalism','fishing'],woodland:['woodcutting','herbalism']};
  current.available=available;
  return run(current,"Object.keys(available).every(k=>JSON.stringify(IR_BIOMES[k].gatheringAvailability)===JSON.stringify(available[k]))&&irBiomeGatheringAvailable({biomeId:'forest',risk:30},'mining')&&irBiomeGatheringAvailable({biomeId:'cave',risk:1},'mining')&&!irBiomeGatheringAvailable({biomeId:'forest',risk:10},'mining')");
});

test('Gathering awards only from the current biome pool and rejects activities not available at the current site',()=>{
  for(const biomeId of expected) for(const methodArg of ['mining','woodcutting','herbalism','fishing']){
    current.biomeArg=biomeId;
    current.methodArg=methodArg;
    run(current,"(()=>{createSeed='GATHER-PROFILE-'+biomeArg+'-'+methodArg; createStart='settlement'; Math.random=()=>0; state=makeInitial('Gather Tester','human','village'); const candidate=state.world.region.sites.find(x=>x.biomeId===biomeArg); state.world.siteId=candidate.id; candidate.risk=45; state.character.energy=100; state.character.hunger=100; state.pendingEvent=null; state.combat=null;})();");
    const before=run(current,'({inventory:JSON.parse(JSON.stringify(state.character.inventory)),energy:state.character.energy,days:state.character.daysLived,available:irBiomeGatheringAvailable(site(),methodArg),pool:irBiomeGatheringItems(site(),methodArg)})');
    run(current,'ir04Gather(methodArg)');
    current.beforeGather=before;
    const check=run(current,"(()=>{const before=beforeGather, gained=before.pool.some(id=>(state.character.inventory[id]||0)>(before.inventory[id]||0)); if(before.available)return gained&&state.character.energy<before.energy&&state.character.daysLived>before.days;return state.character.energy===before.energy&&state.character.daysLived===before.days&&JSON.stringify(state.character.inventory)===JSON.stringify(before.inventory)})()");
    run(current,'Math.random=()=>0.5');
    if(!check)return false;
  }
  return true;
});

test('Existing forage-chance modifiers retain their previous values',()=>{
  const old={forest:.12,swamp:.14,river:.08,plains:.04,woodland:.08,coast:.07,mountain:.02,desert:-.04,snow:-.03};
  current.oldChance=old;
  return run(current,'Object.keys(oldChance).every(k=>irBiomeForageChanceModifier({biomeId:k})===oldChance[k])');
});

test('Each profile exposes habitat categories and the existing encounter pool without duplicating enemy definitions',()=>{
  return run(current,"Object.keys(IR_BIOMES).every(k=>irBiomeHabitatCategories(k).length>0&&JSON.stringify(irBiomeEncounterIds(k))===JSON.stringify(IR_BIOME_ENEMIES[k])&&IR_BIOME_ENEMIES[k].every(id=>IR_ENEMIES[id]))");
});

test('Twenty-four generated seed/start combinations contain only resolvable biome profiles and valid geography',()=>{
  const seeds=['ASHEN-COAST','FROST-ROAD','MISTWOOD','IRON-VALLEY','TIDAL-MARCHES','SUN-UNDER-RAIN'];
  const starts=['settlement','wilderness','remote','roadside']; let total=0;
  for(const seed of seeds)for(const start of starts){
    current.seedArg=seed;current.startArg=start;
    const w=run(current,'generateProceduralWorld(seedArg,startArg)');
    current.worldArg=w;
    if(w.region.sites.length!==49||!run(current,'irValidateBiomeProfiles(worldArg).ok'))return false;
    if(!run(current,'irValidateBiomeProfiles(worldArg).ok&&irValidateGeographicIds(worldArg).ok&&irValidateGeographicHierarchy(worldArg).ok'))return false;
    total++;
  }
  return total===24;
});

test('Political/regional generation preserves legacy physical geography for the same seeds and starts',()=>{
  const baseline=loadBaseline(), seeds=['BIOME-BASE-A','BIOME-BASE-B','BIOME-BASE-C'];
  const additive=new Set(['polities','regionalHierarchyVersion','parentRegionId','subregions','ownerPolityId','governingPolityId','regionIds','regionId','countryId','continentId','generationKey','territorialStatus','ownershipStatus','politicalStatus','unclaimed','geography','governmentType','governmentDescription','leaderNpcId','leaderTitle','capitalSiteGeoId','organizations','organizationRegistryVersion']);
  const physicalJson=value=>JSON.stringify((function strip(v){if(Array.isArray(v))return v.map(strip);if(!v||typeof v!=='object')return v;const out={};for(const [k,x] of Object.entries(v))if(!additive.has(k))out[k]=strip(x);return out;})(value));
  for(const seed of seeds)for(const start of ['settlement','wilderness','remote','roadside']){
    baseline.seedArg=seed;baseline.startArg=start;current.seedArg=seed;current.startArg=start;
    const old=run(baseline,'generateProceduralWorld(seedArg,startArg)'), now=run(current,'generateProceduralWorld(seedArg,startArg)');
    // Political entities and regional hierarchy are additive. Compare all remaining saved
    // data exactly so site IDs/names/biomes/coordinates and route records must stay stable.
    if(!Array.isArray(now.polities)||!Array.isArray(now.region.subregions))return false;
    if(physicalJson(old)!==physicalJson(now))return false;
  }
  return true;
});

test('Missing or invalid saved biomeId keeps safe display fallback but never supplies fallback loot',()=>{
  const w=run(current,"generateProceduralWorld('BAD-BIOME-REF','settlement')");
  const site=w.region.sites[0], before=JSON.stringify(site); site.biomeId='missing-biome'; site.biome='unrecognized environment';
  const invalid=JSON.stringify(site); current.siteArg=site; const profile=run(current,'irBiomeProfileForSite(siteArg)');
  const loot=run(current,"irBiomeResourceItems(siteArg,'forage')");
  return profile===run(current,'IR_BIOMES.woodland')&&JSON.stringify(site)===invalid&&before!==invalid&&JSON.stringify(loot)===JSON.stringify([])&&JSON.stringify(run(current,'irBiomeGatheringItems(siteArg,"herbalism")'))===JSON.stringify([])&&!run(current,'irBiomeGatheringAvailable(siteArg,"herbalism")')&&run(current,'irBiomeForageChanceModifier(siteArg)')===0;
});

test('Known canonical biome display name can recover a profile at runtime while preserving the invalid saved biomeId',()=>{
  current.siteArg={id:'old-site',biomeId:'stale-id',biome:'Deep Forest'};
  return run(current,"irResolveBiomeProfile(siteArg).id==='forest'&&irResolveBiomeProfile(siteArg).source==='profile-name'&&siteArg.biomeId==='stale-id'");
});

test('World validation reports a corrupted biome reference and does not rewrite it',()=>{
  current.worldArg=run(current,"generateProceduralWorld('VALIDATE-BIOME-REF','settlement')");
  current.worldArg.region.sites[2].biomeId='not-registered'; const before=current.worldArg.region.sites[2].biomeId;
  current.worldArg2=JSON.parse(JSON.stringify(current.worldArg));
  const report=run(current,'irValidateBiomeProfiles(worldArg)');
  return !report.ok&&report.errors.some(e=>e.includes('invalid biomeId'))&&current.worldArg.region.sites[2].biomeId===before&&run(current,'irBiomeProfileForSite(worldArg.region.sites[2]).name')===irBiomeProfileNameForLegacySite(current.worldArg.region.sites[2].biome,current);
});

test('Profile resolver does not attach copied profile objects or regenerate site identities',()=>{
  const w=run(current,"generateProceduralWorld('NO-COPIES','wilderness')"); current.worldArg=w;
  const ids=JSON.stringify(w.region.sites.map(s=>[s.id,s.geoId,s.biomeId]));
  run(current,'worldArg=JSON.parse(JSON.stringify(worldArg)); worldArg.region.sites.forEach(s=>{irBiomeProfileForSite(s);irBiomeResourceCategories(s);irBiomeHabitatCategories(s)})');
  return !run(current,'worldArg.region.sites.some(s=>Object.prototype.hasOwnProperty.call(s,"biomeProfile"))')&&ids===run(current,'JSON.stringify(worldArg.region.sites.map(s=>[s.id,s.geoId,s.biomeId]))');
});

test('Existing normalized v2 save preserves site identities, profile assignments, route data, discovery, and current location',()=>{
  run(current,"createSeed='BIOME-SAVE-ROUNDTRIP'; createStart='remote'; state=makeInitial('Biome Save Tester','human','village');");
  const before=run(current,'JSON.parse(JSON.stringify(state.world))');
  run(current,"state.world.region.name='Preserved Biome Region'; state.world.region.routes[0].savedBridgeCondition='intact'; const s=state.world.region.sites[4]; s.name='Saved Profile Glade'; s.discovered=true; s.visits=3; state.world.siteId=s.id; state.world.visited=[s.id]; state.world.known=[s.id]; state.world.journal.discoveries.unshift({id:'biome-save-note',title:'Biome save note',detail:'Kept',siteId:s.id,date:'SAVE TEST'});");
  current.saveArg=run(current,'JSON.parse(JSON.stringify(state))'); const output=run(current,'normalizeSave(saveArg)'), siteOut=output.world.region.sites.find(s=>s.id===output.world.siteId); current.worldArg=output.world;
  return output.world.region.name==='Preserved Biome Region'&&siteOut.name==='Saved Profile Glade'&&siteOut.discovered&&siteOut.visits===3&&siteOut.biomeId===before.region.sites.find(s=>s.id===siteOut.id).biomeId&&siteOut.geoId===before.region.sites.find(s=>s.id===siteOut.id).geoId&&output.world.region.routes[0].savedBridgeCondition==='intact'&&output.world.journal.discoveries.some(d=>d.id==='biome-save-note')&&run(current,'irValidateBiomeProfiles(worldArg).ok');
});

test('Actual forage action consumes profile resources for every existing biome',()=>{
  for(const biomeId of expected){
    current.biomeArg=biomeId;
    run(current,"createSeed='FORAGE-PROFILE-'+biomeArg; createStart='settlement'; Math.random=()=>.5; state=makeInitial('Forage Tester','human','village'); state.world.siteId=state.world.region.sites.find(s=>s.biomeId===biomeArg).id; state.character.energy=100; state.character.hunger=100; Math.random=()=>0;");
    const before=run(current,'JSON.parse(JSON.stringify(state.character.inventory))'); run(current,"explore('forage')");
    current.inventoryBefore=before;
    if(!run(current,'irBiomeResourceItems(biomeArg,"forage").some(id=>(inventoryBefore[id]||0)<(state.character.inventory[id]||0))'))return false;
    run(current,'Math.random=()=>.5');
  }
  return true;
});

test('Actual advanced scouting action consumes profile scout resources for every existing biome',()=>{
  for(const biomeId of expected){
    current.biomeArg=biomeId;
    run(current,"createSeed='SCOUT-PROFILE-'+biomeArg; createStart='settlement'; Math.random=()=>.5; state=makeInitial('Scout Tester','human','village'); state.world.siteId=state.world.region.sites.find(s=>s.biomeId===biomeArg).id; state.character.energy=100; state.character.hunger=100; state.pendingEvent=null; Math.random=()=>.999;");
    const before=run(current,'JSON.parse(JSON.stringify(state.character.inventory))'); run(current,"irExplore('scout')"); current.inventoryBefore=before;
    if(!run(current,'irBiomeResourceItems(biomeArg,"scout").some(id=>(state.character.inventory[id]||0)>(inventoryBefore[id]||0))'))return false;
    run(current,'Math.random=()=>.5');
  }
  return true;
});

test('Existing world map, natural terrain map, adventure panel, and gathering panel resolve canonical biome names',()=>{
  return run(current,"(()=>{createSeed='BIOME-RENDER-CHECK';createStart='settlement';state=makeInitial('Map Profile Tester','human','village');state.world.known=state.world.region.sites.map(x=>x.id);state.world.visited=[];const s=site(),name=IR_BIOMES[s.biomeId].name;const a=mapPanel(),b=ir05NaturalMapPanel(),c=renderAdventure(),d=ir04GatherPanel();return a.includes(name)&&b.includes(name)&&c.includes(name)&&d.includes(name)&&typeof a==='string'&&typeof b==='string'&&typeof c==='string'&&typeof d==='string'})()");
});

test('Travel context reads source and destination profiles without changing existing travel time or fare formulas',()=>{
  current.fromArg={biomeId:'forest'};current.toArg={biomeId:'coast'};current.routeArg={distanceKm:25,terrain:'Deep Forest'};
  return run(current,"(()=>{const c=irBiomeTravelContext(fromArg,toArg,routeArg);return c.fromId==='forest'&&c.toId==='coast'&&c.fromProfile.name==='Deep Forest'&&c.toProfile.name==='Windworn Coast'&&c.routeTerrain==='Deep Forest'&&irCurrentTransportDays(25,'foot')===2&&irCurrentTransportDays(42,'mount')===1&&irTransportCost('foot',routeArg)===0})()");
});

const failed=results.filter(r=>r.status==='FAIL');
console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length)process.exitCode=1;
