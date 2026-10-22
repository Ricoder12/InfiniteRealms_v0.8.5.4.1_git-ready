'use strict';
// ================= Infinite Realms v0.7.2.8: guaranteed town innkeepers =================
// Every settlement gets an inn facility and a persistent, location-bound innkeeper.
// This is deliberately additive: existing residents, relationships, and save fields are retained.
// The innkeeper is a dedicated service NPC, not one of the four randomly seeded residents.
const ir0728PoolBase=ir06PoolFor;
ir06PoolFor=function(s){
 const pool=ir0728PoolBase.apply(this,arguments);
 if(!s||!ir071IsSettlement(s)||!Array.isArray(pool))return pool;
 return pool.filter(p=>!/(^|\s)(innkeeper|tavern keeper|publican|barkeep)(\s|$)/i.test(`${p?.[0]||''} ${p?.[1]||''}`));
};
const ir0728AddTownServicesBase=ir072AddTownServices;
ir072AddTownServices=function(world=state?.world){
 ir0728AddTownServicesBase.apply(this,arguments);
 const sites=world?.region?.sites||[];
 for(const s of sites){
  if(!s||!ir071IsSettlement(s))continue;
  s.services=Array.isArray(s.services)?s.services:[];
  if(!s.services.includes('inn'))s.services.push('inn');
 }
};

const ir0728TownNpcBase=ir072TownNpc;
ir072TownNpc=function(siteObj,kind){
 const n=ir0728TownNpcBase.apply(this,arguments);
 if(!n||kind!=='innkeeper')return n;
 n.role='Innkeeper';n.occupation='Innkeeper';n.icon='🍲';n.ir072TownService='innkeeper';
 n.goal=`Welcome travelers, provide a comfortable bed, and share useful local knowledge in ${siteObj.name}.`;
 n.traits=Array.isArray(n.traits)&&n.traits.length?n.traits:['welcoming','observant'];
 n.homeSite=siteObj.id;n.workSite=siteObj.id;n.restSite=siteObj.id;n.socialSite=siteObj.id;
 n.ir071OriginSite=siteObj.id;n.ir071TravelRole=false;n.lastSeenSiteId=n.lastSeenSiteId||siteObj.id;
 const w=state?.world,c=state?.character;
 if(w&&c){
  const v=w.v06||(w.v06={schema:2,changes:{},journal:[],socialQuests:[],registry:{}});
  v.registry=v.registry||{};v.changes=v.changes||{};
  v.registry[n.id]={...(v.registry[n.id]||{}),...n};v.changes[n.id]={...(v.changes[n.id]||{}),...n};
  c.relationships=c.relationships||{};
  if(!c.relationships[n.id])c.relationships[n.id]={affinity:Number(n.affinity)||0,trust:Number(n.trust)||0,status:n.status||'Acquaintance',milestones:Array.isArray(n.milestones)?n.milestones:[]};
  try{ir071PersistSchedule(n)}catch(e){}
 }
 return n;
};

const ir0728EnsureNPCsBase=ir06EnsureNPCs;
ir06EnsureNPCs=function(){
 const result=ir0728EnsureNPCsBase.apply(this,arguments)||[];
 const s=site(),c=state?.character,w=state?.world;
 if(!s||!c||!w||!ir071IsSettlement(s))return result;
 ir072AddTownServices(w);
 const innkeeper=ir072TownNpc(s,'innkeeper');if(!innkeeper)return result;
 const byId=new Map(result.filter(n=>n?.id).map(n=>[n.id,n]));byId.set(innkeeper.id,innkeeper);
 return [...byId.values()];
};

// Permanent town-service workers stay available in their assigned settlement all day.
// Keep the earlier service schedule behavior and explicitly include the innkeeper role.
const ir0728ScheduleBase=ir071Schedule;
ir071Schedule=function(npc,day,ctx={}){
 if(npc?.ir072TownService==='innkeeper'&&npc.workSite){
  const sites=Array.isArray(ctx.sites)?ctx.sites:(state?.world?.region?.sites||[]);
  const loc=sites.find(x=>x?.id===npc.workSite);
  if(loc)return {state:'working',siteId:loc.id,label:`On duty at the inn in ${loc.name}`,until:Math.max(0,Math.floor(Number(day)||0))+1,reason:'Permanent town innkeeper'};
 }
 return ir0728ScheduleBase.apply(this,arguments);
};

// A small migration pass makes the current settlement's innkeeper visible immediately
// after loading an older save, without creating residents for every unvisited location.
try{ir072AddTownServices(state?.world);if(state?.character&&site()&&ir071IsSettlement(site()))ir06EnsureNPCs()}catch(e){console.warn('Town innkeeper migration deferred safely',e)}
const ir0728ModalBase=ir072InteractionModal;
ir072InteractionModal=function(){return ir0728ModalBase.apply(this,arguments).replaceAll('V0.7.2.7','V0.7.2.8').replaceAll('V0.7.2.6','V0.7.2.8')};
if(typeof document!=='undefined')document.title='Infinite Realms v0.7.2.8';
// ================= End Infinite Realms v0.7.2.8 patch =================
