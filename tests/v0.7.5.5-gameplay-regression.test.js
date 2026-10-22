'use strict';
// v0.7.5.5 regression coverage for gameplay areas that consume geographic IDs.
// Executed against the real app source sequence under Node VM; this is not a real browser test.
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const noop=()=>{};
const element=()=>({textContent:'',innerHTML:'',title:'',style:{},className:'',dataset:{},appendChild:noop,remove:noop,click:noop,focus:noop,classList:{add:noop,remove:noop,toggle:noop,contains:()=>false}});
const document={title:'',head:{appendChild:noop},body:element(),addEventListener:noop,querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,createElement:element};
const stored=new Map();
const localStorage={getItem:k=>stored.has(k)?stored.get(k):null,setItem:(k,v)=>stored.set(k,String(v)),removeItem:k=>stored.delete(k)};
const context={console:{warn:noop,log:noop,error:console.error},Math:Object.create(Math),String,Array,Object,Map,Set,Number,JSON,RegExp,Date,Intl,parseInt,parseFloat,document,window:{scrollTo:noop,addEventListener:noop},localStorage,setTimeout:()=>0,clearTimeout:noop,requestAnimationFrame:noop,URL,Blob:global.Blob,FileReader:function(){},navigator:{userAgent:'Node test VM'}};
vm.createContext(context);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]).filter(f=>!f.endsWith('/27-boot.js'));
for(const relative of scripts) vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
vm.runInContext('render=()=>{}; persist=()=>true; toast=()=>{};',context);
const evalIn=expr=>vm.runInContext(expr,context);
const results=[];
function test(name,fn){try{const value=fn();results.push({name,status:value?'PASS':'FAIL'});}catch(e){results.push({name,status:'FAIL',detail:e?.stack||e.message});}}

test('Eight seed/start combinations keep generated sites unique, routes resolvable, and the travel graph connected',()=>{
  const pairs=[['S755-A','settlement'],['S755-B','wilderness'],['S755-C','roadside'],['S755-D','remote'],['S755-E','settlement'],['S755-F','wilderness'],['S755-G','roadside'],['S755-H','remote']];
  for(const [seed,start] of pairs){
    context.seedArg=seed;context.startArg=start;
    evalIn("createSeed=seedArg; createStart=startArg; state=makeInitial('Generation Checker','human','village');");
    if(!evalIn('ir0755ValidateGeographicIntegrity(state.world,state.character).ok')) return false;
    const connected=evalIn(`(()=>{const sites=state.world.region.sites,by=new Map(sites.map(s=>[s.id,s])),seen=new Set([state.world.siteId]),q=[state.world.siteId];for(let i=0;i<q.length;i++){const s=by.get(q[i]);for(const r of (s?.routes||[])){if(by.has(r.to)&&!seen.has(r.to)){seen.add(r.to);q.push(r.to)}}}return sites.length===49&&seen.size===sites.length&&new Set(sites.map(s=>s.id)).size===sites.length&&new Set(sites.map(s=>s.geoId)).size===sites.length})()`);
    if(!connected) return false;
  }
  return true;
});

test('Both existing map renderers still use the same authoritative sites and route IDs after geography integration',()=>{
  evalIn("createSeed='MAP-RENDER-0755'; createStart='settlement'; state=makeInitial('Map Viewer','human','village'); state.view='World';");
  const data=evalIn('({legacy:mapPanel(),natural:ir05NaturalMapPanel(),site:site().id,name:site().name})');
  return typeof data.legacy==='string'&&data.legacy.includes('ir05-map-panel')&&typeof data.natural==='string'&&data.natural.includes('ir05-map-canvas')&&data.legacy.includes(data.name)&&evalIn('ir0755ValidateGeographicIntegrity(state.world,state.character).ok');
});

test('NPC schedule location assignments and repeat initialization remain stable and resolvable',()=>{
  const settlement=evalIn("state.world.region.sites.find(s=>s.type==='settlement')");
  context.siteArg=settlement.id;
  evalIn('state.world.siteId=siteArg; ir06EnsureNPCs();');
  const first=evalIn('state.character.npcs.filter(n=>String(n.id).startsWith("ir06_")).map(n=>n.id).sort()');
  evalIn('ir06EnsureNPCs();');
  const second=evalIn('state.character.npcs.filter(n=>String(n.id).startsWith("ir06_")).map(n=>n.id).sort()');
  const scheduleStatus=evalIn('state.character.npcs.filter(n=>String(n.id).startsWith("ir06_")).every(n=>{const s=ir071ScheduleFor(n,14);return (s.state==="traveling"?!!state.world.region.sites.find(x=>x.id===s.destinationSiteId):!!state.world.region.sites.find(x=>x.id===s.siteId))})');
  return first.length>=4&&new Set(first).size===first.length&&JSON.stringify(first)===JSON.stringify(second)&&scheduleStatus&&evalIn('ir0755ValidateGeographicIntegrity(state.world,state.character).ok');
});

test('Travel with a companion keeps current location, discovery state, route references, and companion support behavior',()=>{
  evalIn("createSeed='COMPANION-TRAVEL-0755'; createStart='settlement'; state=makeInitial('Travel Pair','human','village'); state.pendingEvent=null; state.character.energy=100; state.character.hunger=100; Math.random=()=>0.999; state.character.relationships.testCompanion={status:'Companion',affinity:15,trust:12}; state.world.v06={schema:2,changes:{},journal:[],lastCompanionBlessingDay:0};");
  const target=evalIn('site().routes[0].to'); context.targetArg=target;
  const start=evalIn('state.world.siteId');
  evalIn('ir051TravelBase(targetArg,\'foot\')');
  const arrived=evalIn('state.world.siteId===targetArg&&state.world.visited.includes(targetArg)&&state.world.journal.discoveries.some(d=>d.siteId===targetArg)&&state.character.relationships.testCompanion.status===\'Companion\'');
  evalIn('state.character.energy=30; dayPass(7,\'travel\')');
  return arrived&&evalIn("state.world.v06.lastCompanionBlessingDay>=7 && state.feed.some(f=>f.title==='Companion encouragement') && ir0755ValidateGeographicIntegrity(state.world,state.character).ok")&&start!==target;
});

test('Combat victory rewards update the existing character and site state without changing geographic identities',()=>{
  evalIn("createSeed='COMBAT-REWARD-0755'; createStart='settlement'; state=makeInitial('Combat Tester','human','village'); state.pendingEvent=null; state.character.health=state.character.maxHealth; state.character.energy=100; state.character.attrs.Strength=90; state.character.skills.Combat={level:50,xp:0}; state.character.inventory.sword=1; state.character.equipment.weapon='sword'; state.character.coin=10; Math.random=()=>0.999;");
  const before=evalIn('({ids:state.world.region.sites.map(s=>[s.id,s.geoId]),coins:state.character.coin,wins:state.character.combatStats?.wins||0,site:state.world.siteId})');
  evalIn("startCombat('goblin',{type:'wild'}); irBattleMove('attack')");
  return evalIn(`!state.combat && state.character.combatStats.wins===${before.wins+1} && state.character.coin>${before.coins} && site().changes.clearedThreats.length>0 && JSON.stringify(state.world.region.sites.map(s=>[s.id,s.geoId]))===${JSON.stringify(JSON.stringify(before.ids))} && ir0755ValidateGeographicIntegrity(state.world,state.character).ok`);
});

test('A work shift and gathering still change progression, inventory, and time while retaining valid geographic references',()=>{
  evalIn("createSeed='WORK-GATHER-0755'; createStart='settlement'; state=makeInitial('Worker','human','village'); state.pendingEvent=null; state.character.job='laborer'; state.character.jobShifts=0; state.character.energy=100; state.character.hunger=100; state.character.coin=0; Math.random=()=>0.999;");
  evalIn('doWork()');
  const workOk=evalIn('state.character.jobShifts===1&&state.character.coin>0&&state.character.daysLived===5');
  evalIn("const gatheringSite=state.world.region.sites.find(s=>s.biomeId==='forest'); state.world.siteId=gatheringSite.id; gatheringSite.risk=45; state.character.energy=100; state.character.hunger=100; Math.random=()=>0; ir04Gather('woodcutting')");
  return workOk&&evalIn('state.character.professionStats.gathered>0 && Object.values(state.character.inventory).some(n=>Number(n)>0) && ir0755ValidateGeographicIntegrity(state.world,state.character).ok');
});

const failed=results.filter(r=>r.status==='FAIL');
console.log(JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,tests:results},null,2));
if(failed.length) process.exitCode=1;
