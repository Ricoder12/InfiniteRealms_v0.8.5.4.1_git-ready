'use strict';
// ================= Infinite Realms v0.7.1: deterministic NPC schedules =================
// This patch deliberately keeps the v0.6 save schema. Schedule fields are additive,
// migrated lazily, and stored alongside existing NPC records without replacing relationships.
function ir071Sites(){return state?.world?.region?.sites||[]}
function ir071SiteById(id,sites=ir071Sites()){return sites.find(s=>s?.id===id)||null}
function ir071SiteName(id,sites=ir071Sites()){return ir071SiteById(id,sites)?.name||'an unknown location'}
function ir071IsSettlement(s){return !!s&&(s.type==='settlement'||!!s.settlementType)}
function ir071DistanceMap(originId,sites=ir071Sites()){
 const byId=new Map(sites.map(s=>[s.id,s])),dist=new Map();if(!byId.has(originId))return dist;
 const queue=[originId];dist.set(originId,0);
 for(let i=0;i<queue.length;i++){const id=queue[i],s=byId.get(id),next=(s?.routes||[]).map(r=>r?.to).filter(to=>byId.has(to));for(const to of next){if(!dist.has(to)){dist.set(to,dist.get(id)+1);queue.push(to)}}}
 return dist;
}
function ir071Nearest(originId,predicate,sites=ir071Sites()){
 const dist=ir071DistanceMap(originId,sites);return sites.filter(predicate).sort((a,b)=>(dist.get(a.id)??999)-(dist.get(b.id)??999)||(Number(a.index)||0)-(Number(b.index)||0)||String(a.id).localeCompare(String(b.id)))[0]||null;
}
function ir071ScheduleFields(n){return {homeSite:n.homeSite,workSite:n.workSite,restSite:n.restSite,socialSite:n.socialSite,ir071ScheduleVersion:n.ir071ScheduleVersion,ir071OriginSite:n.ir071OriginSite,ir071TravelRole:n.ir071TravelRole};}
function ir071IsTravelRole(n){return /merchant|trader|courier|messenger|traveler|mercenary|ranger|adventurer/i.test(`${n?.occupation||''} ${n?.role||''}`)}
function ir071MigrateNPC(n,world,sites){
 if(!n||!n.id)return n;
 if(Number(n.ir071ScheduleVersion)>=1){
  if(!ir071SiteById(n.homeSite,sites))n.homeSite=ir071SiteById(n.lastSeenSiteId,sites)?.id||ir071SiteById(world?.visited?.[0],sites)?.id||world?.siteId||sites[0]?.id;
  if(!ir071SiteById(n.workSite,sites))n.workSite=n.homeSite;
  if(!ir071SiteById(n.restSite,sites))n.restSite=n.homeSite;
  if(!ir071SiteById(n.socialSite,sites))n.socialSite=n.restSite||n.workSite;
  n.ir071TravelRole=ir071IsTravelRole(n);return n;
 }
 const id=String(n.id),generated=id.startsWith('ir06_');
 const originId=ir071SiteById(n.ir071OriginSite,sites)?.id||ir071SiteById(n.workSite,sites)?.id||ir071SiteById(n.lastSeenSiteId,sites)?.id||ir071SiteById(world?.visited?.[0],sites)?.id||ir071SiteById(world?.siteId,sites)?.id||sites[0]?.id;
 const origin=ir071SiteById(originId,sites);
 const firstSett=ir071Nearest(originId,ir071IsSettlement,sites);
 const home=ir071SiteById(n.homeSite,sites)&&ir071IsSettlement(ir071SiteById(n.homeSite,sites))?ir071SiteById(n.homeSite,sites):firstSett||origin;
 // Generated residents work where their role was originally encountered. Legacy contacts
 // retain a valid existing work site, falling back to their known/assigned home.
 const work=generated?(origin||home):ir071SiteById(n.workSite,sites)||origin||home;
 const homeHasInn=(home?.services||[]).includes('inn');
 const social=homeHasInn?home:(work||home);
 n.ir071OriginSite=origin?.id||home?.id||work?.id||null;
 n.homeSite=home?.id||origin?.id||null;
 n.workSite=work?.id||home?.id||null;
 n.restSite=home?.id||n.restSite||work?.id||null;
 n.socialSite=social?.id||work?.id||home?.id||null;
 n.ir071ScheduleVersion=1;n.ir071TravelRole=ir071IsTravelRole(n);
 return n;
}
function ir071PersistSchedule(n){
 const v=state?.world?.v06;if(!n||!v||!String(n.id||'').startsWith('ir06_'))return;
 const snapshot={...ir071ScheduleFields(n),id:n.id,name:n.name,role:n.role,occupation:n.occupation,icon:n.icon,tier:n.tier,generatedKey:n.generatedKey};
 v.changes=v.changes||{};v.changes[n.id]={...(v.changes[n.id]||{}),...snapshot};
 // v0.6.6.1 restores NPCs from registry before changes. Persist the schedule there too,
 // otherwise the registry can overwrite the new fields on the next visit/render.
 if(v.registry&&typeof v.registry==='object'){
  v.registry[n.id]={...(v.registry[n.id]||{}),...n,...snapshot};
 }
}
const ir071EnsureNPCsBase=ir06EnsureNPCs;
ir06EnsureNPCs=function(){
 const result=ir071EnsureNPCsBase();const c=state?.character,w=state?.world,sites=ir071Sites();if(!c||!w)return result;
 for(const n of (c.npcs||[])){ir071MigrateNPC(n,w,sites);ir071PersistSchedule(n)}
 return result;
};
// Pure schedule calculation: all world-dependent information is passed through ctx.
// It never mutates NPCs, consumes randomness, or writes save data.
function ir071Schedule(npc,day,ctx={}){
 const n=npc||{},d=Math.max(0,Math.floor(Number(day)||0)),sites=Array.isArray(ctx.sites)?ctx.sites:[],worldSeed=String(ctx.worldSeed||'world');
 const valid=id=>sites.find(s=>s?.id===id)||null;
 const home=valid(n.homeSite),work=valid(n.workSite),rest=valid(n.restSite)||home,social=valid(n.socialSite)||rest||work;
 const seedHash=ir06Hash(`${worldSeed}|${n.id||'npc'}|schedule`),offset=seedHash%7,phase=(d+offset)%7;
 const travelRole=n.ir071TravelRole===true||ir071IsTravelRole(n);
 if(travelRole&&work){
  const interval=21+(ir06Hash(`${worldSeed}|${n.id||'npc'}|travel-period`)%8),travelOffset=ir06Hash(`${worldSeed}|${n.id||'npc'}|travel-offset`)%interval,tripPhase=(d+travelOffset)%interval;
  if(tripPhase<2){
   const routes=(work.routes||[]).map(r=>valid(r?.to)).filter(Boolean).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
   if(routes.length){const trip=Math.floor((d+travelOffset)/interval),target=routes[ir06Hash(`${worldSeed}|${n.id||'npc'}|trip|${trip}`)%routes.length],until=d+(2-tripPhase);return {state:'traveling',siteId:null,label:`Traveling toward ${target.name}; back around day ${until}`,until,reason:`Scheduled trip toward ${target.name}`,destinationSiteId:target.id};}
  }
 }
 let stateName,siteObj,until,reason;
 if(phase<=4){stateName='working';siteObj=work||home;until=d+(5-phase);reason='Scheduled workday'}
 else if(phase===5){stateName='socializing';siteObj=social||work||home;until=d+1;reason='Weekly social day'}
 else{stateName='resting';siteObj=rest||home||work;until=d+1;reason='Weekly rest day'}
 const siteId=siteObj?.id||null,label=stateName==='working'&&siteObj?`Working at ${siteObj.name}`:stateName==='socializing'&&siteObj?`Socializing at ${siteObj.name}`:stateName==='resting'&&siteObj?`Resting at ${siteObj.name}`:(stateName==='working'?'Working':stateName==='socializing'?'Socializing':'Resting');
 return {state:stateName,siteId,label,until,reason};
}
function ir071ScheduleFor(n,day){const w=state?.world||{};return ir071Schedule(n,day,{worldSeed:w.seed||w.region?.name||'world',sites:w.region?.sites||[]})}
// Replace both older presence definitions with one compatible wrapper.
ir06Present=function(n,siteId,day){
 if(!n||!state?.character||!state?.world)return false;
 // Array.filter passes (npc, index, array). Do not mistake its numeric index for a site id.
 // Only accept an explicit site id when it matches a real world location.
 const sites=ir071Sites();
 const explicitSite=typeof siteId==='string'&&sites.some(loc=>loc?.id===siteId);
 const target=explicitSite?siteId:(site()?.id||state.world.siteId);
 // A filter callback also passes the array as its third argument; accept only a numeric day.
 const explicitDay=typeof day==='number'&&Number.isFinite(day);
 const d=explicitDay?day:(Number(state.character.daysLived)||0);
 const s=ir071ScheduleFor(n,d);return s.state!=='traveling'&&!!target&&s.siteId===target;
};
// Last-seen updates are recorded only for known NPCs whose deterministic schedule places
// them at the player's current site. No NPC is moved or generated by this recorder.
function ir071RecordPresentNPCs(){
 const c=state?.character,w=state?.world;if(!c||!w||!Array.isArray(c.npcs))return;
 const siteId=w.siteId,day=Number(c.daysLived)||0;let changed=false;
 for(const n of c.npcs){const s=ir071ScheduleFor(n,day);if(s.state==='traveling'||s.siteId!==siteId)continue;
  if(n.lastSeenSiteId!==siteId||Number(n.lastSeenDay)!==day){n.lastSeenSiteId=siteId;n.lastSeenDay=day;ir071PersistSchedule(n);if(String(n.id||'').startsWith('ir06_')){const v=w.v06;if(v?.changes?.[n.id]){v.changes[n.id].lastSeenSiteId=siteId;v.changes[n.id].lastSeenDay=day}}changed=true;}
 }
 if(changed&&typeof persist==='function')persist();
 return changed;
}
function ir071MigrateExistingNPCs(){
 const c=state?.character,w=state?.world,sites=ir071Sites();if(!c||!w)return false;let changed=false;
 for(const n of (c.npcs||[])){if(!n||!n.id)continue;const before=JSON.stringify(ir071ScheduleFields(n));ir071MigrateNPC(n,w,sites);if(before!==JSON.stringify(ir071ScheduleFields(n)))changed=true;ir071PersistSchedule(n)}
 if(changed&&typeof persist==='function')persist();return changed;
}
const ir071RenderBase=render;
render=function(){const result=ir071RenderBase.apply(this,arguments);try{ir071RecordPresentNPCs()}catch(e){}return result};
// Keep the existing relationship-location feature aligned with the actual daily schedule.
ir0681RelationshipLocation=function(n){
 const cur=site(),curId=cur?.id||state?.world?.siteId,day=Number(state?.character?.daysLived)||0;
 if(!n)return {id:'',name:'',status:'unknown',label:'Location unknown'};
 const schedule=ir071ScheduleFor(n,day);
 if(schedule.state!=='traveling'&&schedule.siteId===curId)return {id:curId,name:cur?.name||'Current location',status:'here',label:`Here now · ${schedule.label}`};
 if(schedule.state==='traveling')return {id:'',name:'',status:'elsewhere',label:schedule.label};
 const loc=ir071SiteById(schedule.siteId);if(loc)return {id:loc.id,name:loc.name,status:'elsewhere',label:`${schedule.label} · ${loc.name}`};
 const known=ir071SiteById(n.lastSeenSiteId)||ir071SiteById(n.homeSite);return known?{id:known.id,name:known.name,status:known.id===curId?'here':'elsewhere',label:`Last known: ${known.name}`}:{id:'',name:'',status:'unknown',label:'Location unknown'};
};
// ================= End v0.7.1 NPC schedule foundation =================

// ================= v0.7.1 hotfix: restore travel-to-relationship routes =================
// NPCs on a scheduled trip still have a useful destination for the relationship shortcut.
const ir071RelationshipLocationBase=ir0681RelationshipLocation;
ir0681RelationshipLocation=function(n){
 const cur=site(),curId=cur?.id||state?.world?.siteId,day=Number(state?.character?.daysLived)||0;
 if(!n)return {id:'',name:'',status:'unknown',label:'Location unknown'};
 const schedule=ir071ScheduleFor(n,day);
 if(schedule.state==='traveling'){
  const destination=ir071SiteById(schedule.destinationSiteId);
  if(destination)return {id:destination.id,name:destination.name,status:'elsewhere',label:schedule.label};
  return {id:'',name:'',status:'elsewhere',label:schedule.label};
 }
 if(schedule.state!=='traveling'&&schedule.siteId===curId)return {id:curId,name:cur?.name||'Current location',status:'here',label:`Here now · ${schedule.label}`};
 const loc=ir071SiteById(schedule.siteId);
 if(loc)return {id:loc.id,name:loc.name,status:'elsewhere',label:`${schedule.label} · ${loc.name}`};
 return ir071RelationshipLocationBase(n);
};

// Find a shortest connected route to a destination. The actual journey still follows
// one valid road edge at a time and can stop safely for danger, hunger, or low energy.
function ir071FindPath(fromId,toId,sites=ir071Sites()){
 if(!fromId||!toId)return null;
 if(fromId===toId)return [fromId];
 const byId=new Map(sites.map(s=>[s.id,s]));
 if(!byId.has(fromId)||!byId.has(toId))return null;
 const queue=[fromId],prev=new Map([[fromId,null]]);
 for(let i=0;i<queue.length;i++){
  const id=queue[i],loc=byId.get(id);
  const neighbors=(loc?.routes||[]).map(r=>r?.to).filter(to=>byId.has(to));
  // Route data is normally bidirectional; accept a reverse edge if a legacy save is not.
  for(const other of sites){if((other?.routes||[]).some(r=>r?.to===id)&&!neighbors.includes(other.id))neighbors.push(other.id)}
  for(const next of neighbors){if(prev.has(next))continue;prev.set(next,id);if(next===toId){const path=[toId];let at=toId;while(prev.get(at)!==null){at=prev.get(at);path.push(at)}return path.reverse()}queue.push(next)}
 }
 return null;
}
function ir071RouteEdge(fromId,toId){
 const direct=irRouteBetween(fromId,toId);if(direct)return direct;
 const reverse=irRouteBetween(toId,fromId);return reverse?{...reverse,from:fromId,to:toId}:null;
}
function ir071RoutePlan(toId){
 const start=state?.world?.siteId,path=ir071FindPath(start,toId);
 if(!path||path.length<2)return null;
 const legs=[];let totalDistance=0,totalDays=0,totalEnergy=0,noEncounterChance=1;
 for(let i=0;i<path.length-1;i++){
  const from=ir071SiteById(path[i]),to=ir071SiteById(path[i+1]),route=ir071RouteEdge(path[i],path[i+1]);
  if(!from||!to||!route)return null;
  const distance=Math.max(1,Number(route.distanceKm)||1),days=irCurrentTransportDays(distance,'foot'),energy=Math.max(4,Math.ceil(days*3+2));
  const risk=clamp(((from.risk+to.risk)/2)/100,.04,.48);
  legs.push({from,to,route,distance,days,energy,risk});totalDistance+=distance;totalDays+=days;totalEnergy+=energy;noEncounterChance*=1-risk;
 }
 return {path,legs,target:ir071SiteById(toId),totalDistance,totalDays,totalEnergy,risk:Math.round((1-noEncounterChance)*100)};
}
const ir071TravelBeforeRoutePatch=travel;
travel=function(id,transport='foot'){
 const target=irSiteById(id),from=site();
 if(target&&from&&target.id!==from.id&&!irRouteBetween(from.id,target.id)){
  const plan=ir071RoutePlan(target.id);
  if(!plan){toast('No connected route to that location could be found.');return}
  modal={kind:'travel-route-preview',site:target.id,path:plan.path,transport:'foot',lowResourceConfirmed:false};render();return;
 }
 return ir071TravelBeforeRoutePatch(id,transport);
};
function ir071RoutePreviewHtml(){
 const plan=ir071RoutePlan(modal?.site),c=state?.character;
 if(!plan)return `<div class="overlay"><section class="modal"><div class="modal-header"><div><div class="eyebrow">ROUTE UNAVAILABLE</div><h2>No connected path</h2><p>A connected route to that location could not be found from here.</p></div><button class="close-btn" data-action="cancel-travel-route">×</button></div><div class="modal-actions"><button class="button primary" data-action="cancel-travel-route">Close</button></div></section></div>`;
 const first=plan.legs[0],canStart=!!c&&c.energy>=first.energy&&c.hunger>=8&&!state.combat?.active&&!state.pendingEvent;
 const routeText=plan.path.map((id,i)=>{const loc=ir071SiteById(id);if(i===0)return `You · ${loc?.name||'Current location'}`;if(i===plan.path.length-1)return loc?.name||'Destination';return `Stop ${i} · ${loc?.name||'Unknown place'}`}).join(' → ');
 return `<div class="overlay" data-dismiss="modal"><section class="modal ir071-route-modal" role="dialog" aria-modal="true" aria-label="Travel route preview"><div class="modal-header"><div><div class="eyebrow">CONNECTED JOURNEY</div><h2>Travel toward ${esc(plan.target?.name||'your destination')}</h2><p>This shortcut follows connected routes. It stops at a location if you run low on energy, hunger, or encounter trouble.</p></div><button class="close-btn" data-action="cancel-travel-route" aria-label="Cancel travel">×</button></div><div class="ir071-route-path"><strong>Route</strong><p>${esc(routeText)}</p></div><div class="ir051-trip-summary"><div><span>Distance</span><strong>${plan.totalDistance} km</strong></div><div><span>Travel time</span><strong>${plan.totalDays} days</strong></div><div><span>Energy estimate</span><strong>${plan.totalEnergy}</strong></div><div><span>Encounter chance</span><strong>up to ${plan.risk}%</strong></div></div><div class="ir071-route-note">First leg: ${esc(first.from.name)} → ${esc(first.to.name)} · ${first.distance} km · ${first.days} day${first.days===1?'':'s'} · ${first.energy} energy. Remaining legs are attempted only while it is safe to continue.</div>${state.combat?.active?'<div class="ir051-reason">Finish combat before travelling.</div>':''}${state.pendingEvent?'<div class="ir051-reason">Resolve your pending event before travelling.</div>':''}${c?.hunger<8?'<div class="ir051-reason">You are too hungry to travel safely. Eat first.</div>':''}${c&&c.energy<first.energy?`<div class="ir051-reason">Need ${first.energy} energy for the first leg; you have ${c.energy}. Rest first or use the World map for a shorter trip.</div>`:''}${c&&(c.energy<25||c.hunger<25)?`<div class="notice warning">Low supplies warning: ${c.energy<25?'energy is low':''}${c.energy<25&&c.hunger<25?' and ':''}${c.hunger<25?'hunger is low':''}. The trip may stop early.</div>`:''}<div class="modal-actions"><button class="button" data-action="cancel-travel-route">Cancel</button><button class="button primary" data-action="travel-route-confirm" data-site="${esc(plan.target.id)}" ${!canStart?'disabled':''}>Begin journey</button></div></section></div>`;
}
function ir071TravelRouteConfirm(targetId){
 let plan=ir071RoutePlan(targetId),c=state?.character;
 if(!plan||!c){modal=null;render();toast('That route is no longer available.');return}
 if(state.combat?.active){toast('Finish combat before travelling.');return}
 if(state.pendingEvent){toast('Resolve your pending event before travelling.');return}
 if(c.hunger<8){toast('You are too hungry to travel safely. Eat first.');return}
 if(c.energy<plan.legs[0].energy){toast(`Need ${plan.legs[0].energy} energy for the first leg; you have ${c.energy}. Rest first.`);return}
 if((c.energy<25||c.hunger<25)&&!modal.lowResourceConfirmed){modal={...modal,lowResourceConfirmed:true};render();toast('Review the low-supplies warning, then begin again.');return}
 let completed=0,lastEvent=false;
 for(const leg of plan.legs){
  if(state.pendingEvent||state.combat?.active)break;
  if(c.hunger<8||c.energy<leg.energy)break;
  const current=site();if(!current||current.id!==leg.from.id)break;
  c.energy=clamp(c.energy-leg.energy,0,c.maxEnergy);dayPass(leg.days,'travel');state.world.siteId=leg.to.id;
  state.world.travelCount=(state.world.travelCount||0)+1;
  const firstVisit=irVisitLocation(leg.to);for(const rt of (typeof ir0775ConnectionsFrom==='function'?ir0775ConnectionsFrom(leg.to.id):[]))irAddKnownLocation(rt.to);
  addFeed('🧭',`Reached ${leg.to.name}`,`You travelled ${leg.distance} km on foot over ${leg.days} day${leg.days===1?'':'s'} from ${leg.from.name}.${firstVisit?' You discovered a new location.':''}`,'travel');
  completed++;
  const danger=clamp(((leg.from.risk+leg.to.risk)/2)/100,.04,.48);
  if(Math.random()<danger){triggerEvent(leg.to.risk>=30?pick(['tracks','goblin','find','squall']):pick(['purse','courier','trader']));lastEvent=true;break}
 }
 const finished=state.world.siteId===targetId;modal=null;persist();render();
 if(finished)toast(`Arrived at ${irSiteById(targetId)?.name||'your destination'} after ${completed} route segment${completed===1?'':'s'}.`);
 else if(lastEvent)toast(`Travel paused at ${site()?.name||'a safe stop'} because an encounter needs your attention.`);
 else if(c.energy<(ir071RoutePlan(targetId)?.legs?.[0]?.energy||0)||c.hunger<8)toast(`You stopped safely at ${site()?.name||'a route stop'}. Prepare before continuing toward your destination.`);
 else toast(`You reached ${site()?.name||'a route stop'}. Continue the journey when ready.`);
}
const ir071RenderModalBeforeRoutePatch=renderModal;
renderModal=function(){if(modal?.kind==='travel-route-preview')return ir071RoutePreviewHtml();return ir071RenderModalBeforeRoutePatch.apply(this,arguments)};
const ir071RunActionBeforeRoutePatch=runAction;
runAction=function(target){const a=target?.dataset?.action;if(a==='cancel-travel-route'){modal=null;render();return}if(a==='travel-route-confirm'){return ir071TravelRouteConfirm(target.dataset.site)}return ir071RunActionBeforeRoutePatch.apply(this,arguments)};
const ir071RouteCss=document.createElement('style');
ir071RouteCss.textContent=`.ir071-route-path{padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2,rgba(255,255,255,.03));margin:8px 0 12px}.ir071-route-path strong{font-size:12px}.ir071-route-path p{font-size:12px;line-height:1.7;color:var(--muted);margin:5px 0 0;overflow-wrap:anywhere}.ir071-route-note{font-size:11px;line-height:1.65;color:var(--muted);margin:12px 0}.ir071-route-modal .ir051-trip-summary{margin-top:10px}`;
document.head.appendChild(ir071RouteCss);
// ================= End v0.7.1 relationship-travel hotfix =================
