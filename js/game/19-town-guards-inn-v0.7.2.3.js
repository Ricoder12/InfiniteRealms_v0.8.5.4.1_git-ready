'use strict';
// ================= Infinite Realms v0.7.2.3: town guards, inn comfort, and criminal leads =================
// Additive save data only. Existing combat, scouting, relationships, and world-map systems are reused.
function ir0723Data(){
 const w=state?.world;if(!w)return {schema:1,activeLeads:{},history:[]};
 if(!w.v0723||typeof w.v0723!=='object')w.v0723={schema:1,activeLeads:{},history:[]};
 const v=w.v0723;v.schema=1;v.activeLeads=v.activeLeads&&typeof v.activeLeads==='object'?v.activeLeads:{};
 v.history=Array.isArray(v.history)?v.history:[];return v;
}
function ir0723PersistTownNpc(n){
 const w=state?.world,c=state?.character;if(!w||!c||!n)return;
 const v=w.v06||(w.v06={schema:2,changes:{},journal:[],socialQuests:[],registry:{}});v.changes=v.changes||{};v.registry=v.registry||{};
 v.registry[n.id]={...(v.registry[n.id]||{}),...n};v.changes[n.id]={...(v.changes[n.id]||{}),...n};
 c.relationships=c.relationships||{};if(!c.relationships[n.id])c.relationships[n.id]={affinity:Number(n.affinity)||0,trust:Number(n.trust)||0,status:n.status||'Acquaintance',milestones:Array.isArray(n.milestones)?n.milestones:[]};
 try{ir071PersistSchedule(n)}catch(e){}
}
// Town guards use the same persistent local-service NPC foundation as merchants and smiths.
const ir0723TownNpcBase=ir072TownNpc;
ir072TownNpc=function(siteObj,kind){
 const n=ir0723TownNpcBase(siteObj,kind);if(!n||kind!=='guard')return n;
 n.role='Town Guard';n.occupation='Guard';n.icon='🛡️';n.ir072TownService='guard';
 n.goal=`Keep ${siteObj.name} safe and warn travelers about local disturbances.`;
 n.traits=Array.isArray(n.traits)&&n.traits.length?n.traits:['cautious','patient'];
 ir0723PersistTownNpc(n);return n;
};
// Avoid generating extra generic guards on top of each town's guaranteed permanent guard.
const ir0723PoolBase=ir06PoolFor;
ir06PoolFor=function(s){
 const pool=ir0723PoolBase(s);if(!s||!ir071IsSettlement(s)||!Array.isArray(pool))return pool;
 return pool.filter(p=>!/(^|\s)(guard|town guard|watchman|watchwoman|sentinel|constable)(\s|$)/i.test(`${p?.[0]||''} ${p?.[1]||''}`));
};
const ir0723EnsureNPCsBase=ir06EnsureNPCs;
ir06EnsureNPCs=function(){
 const result=ir0723EnsureNPCsBase()||[],s=site(),c=state?.character,w=state?.world;
 if(!s||!c||!w||!ir071IsSettlement(s))return result;
 const guard=ir072TownNpc(s,'guard');if(!guard)return result;
 const byId=new Map((result||[]).filter(n=>n?.id).map(n=>[n.id,n]));byId.set(guard.id,guard);
 return [...byId.values()];
};

// Paid inn beds are deliberately much better than free field rest: 12 coins for full energy.
// The ordinary Rest action remains unchanged at +34 energy; a temporary camp is free but weaker.
ir072RoomCost=function(){const s=site();return s?.services?.includes('inn')?12:0};
const ir0723LocalRestBase=localRest;
localRest=function(){
 const c=state?.character,s=site();if(!c||!s)return;
 const atInn=(s.services||[]).includes('inn'),atCamp=!!s.changes?.temporaryCamp;
 if(!atInn&&!atCamp){toast('There is no inn or temporary camp here. Use the ordinary Rest action instead.');return}
 if(state.combat?.active||state.pendingEvent){toast('Resolve the current combat or event before resting.');return}
 const cost=atInn?12:0;if(c.coin<cost){toast(`You need ${coins(cost)} for an inn bed.`);return}
 c.coin-=cost;dayPass(1,atInn?'inn rest':'camp rest');
 c.energy=atInn?clamp(Number(c.maxEnergy)||100,0,Number(c.maxEnergy)||100):clamp(c.energy+25,0,c.maxEnergy||100);
 c.health=clamp(c.health+(atInn?10:5),1,c.maxHealth||100);c.mood=clamp(c.mood+(atInn?3:1),0,100);
 addFeed('🛏️',atInn?'A proper night at the inn':'A rough night at camp',atInn?`You paid ${coins(cost)} for a comfortable bed at ${s.name}. Your energy was fully restored and you recovered some health.`:`You rested at your temporary camp for free. You recovered a little energy and health, but not as much as at an inn.`);
 persist();render();toast(atInn?'A comfortable bed restored your energy.':'You recovered a little at camp.');
};

// Innkeeper intelligence points to high-risk, connected locations whose existing biome encounter
// tables already support bandits or thieves. Following a lead reuses the normal scouting cost and
// presents a standard danger warning with the existing bandit/thief combat encounters.
function ir0723FindIntelTarget(type){
 const w=state?.world,sites=w?.region?.sites||[],current=site(),v=ir0723Data();
 const history=new Set(v.history.slice(-8).map(x=>x?.siteId).filter(Boolean));
 const candidates=[];
 for(const s of sites){
  if(!s||s.id===current?.id||ir071IsSettlement(s)||!(s.routes||[]).length)continue;
  const pool=irBiomeEncounterIds(s);
  let enemyId=null;
  if(type==='bandits'){if(pool.includes('bandit'))enemyId='bandit'}
  else if(type==='gangs'){if(pool.includes('thief'))enemyId='thief';else if(pool.includes('bandit'))enemyId='bandit'}
  if(!enemyId)continue;
  if(s.changes?.criminalIntel?.status==='active')continue;
  candidates.push({site:s,enemyId});
 }
 let eligible=candidates.filter(x=>Number(x.site.risk||0)>=14&&!history.has(x.site.id));
 if(!eligible.length)eligible=candidates.filter(x=>!history.has(x.site.id));
 if(!eligible.length)eligible=candidates;
 eligible.sort((a,b)=>ir06Hash(`${w?.seed||'world'}|inn-intel|${type}|${a.site.id}`)-ir06Hash(`${w?.seed||'world'}|inn-intel|${type}|${b.site.id}`)||String(a.site.id).localeCompare(String(b.site.id)));
 return eligible[0]||null;
}
function ir0723LeadStatus(type){
 const v=ir0723Data(),lead=v.activeLeads[type];if(!lead||lead.status!=='active')return null;
 const s=ir071SiteById(lead.siteId);if(!s){v.activeLeads[type]=null;return null}
 return {lead,site:s};
}
function ir0723IntelReason(type,n){
 const s=site(),c=state?.character,lead=ir0723LeadStatus(type);
 if(ir072Blocked()||state?.warning)return 'Resolve the current threat or event first.';
 if(!(s?.services||[]).includes('inn'))return 'Paid criminal intelligence is only available at a staffed inn.';
 if(lead)return `You already have an active lead near ${lead.site.name}. Follow it before buying another.`;
 if((Number(c?.coin)||0)<IR0723_INTEL_COST)return `The information costs ${IR0723_INTEL_COST} coins; you have ${Number(c?.coin)||0}.`;
 if(!ir0723FindIntelTarget(type))return 'The innkeeper has no reliable lead of this type available right now.';
 return '';
}
function ir0723InnkeeperCards(){
 const s=site(),c=state.character,rumors=state.world?.journal?.rumors||[],rumor=rumors.find(x=>!x.resolved),blocked=ir072Blocked()||!!state.warning;
 const inn=(s?.services||[]).includes('inn'),camp=!!s?.changes?.temporaryCamp,room=inn||camp,cost=inn?12:0;
 const rumorReason=blocked?'Resolve the current threat or event first.':!rumor?'There are no unmarked rumors recorded in your world journal yet.':'';
 const restReason=blocked?'Resolve the current threat or event first.':!room?'There is no inn or temporary camp at this location.':c.coin<cost?`An inn bed costs ${cost} coins; you have ${c.coin}.`:'';
 const serviceText=(s?.services||[]).length?s.services.map(x=>({'market':'market','inn':'inn and beds','healer':'healer','guild':'guild','work-board':'work board','forge':'forge/workshop','stable':'stable','library':'library'}[x]||String(x).replaceAll('-',' '))).join(', '):'no permanent services recorded';
 const bedTitle=inn?'Rent a comfortable bed':'Rest at the temporary camp';
 const bedDetail=inn?'A private bed costs 12 coins and one day, restores energy to maximum, and recovers some health and mood.': 'Camping is free, but restores only a little energy and health.';
 const bedLabel=inn?'Bed · 12 ◈':'Camp · free';
 const banditLead=ir0723LeadStatus('bandits'),gangLead=ir0723LeadStatus('gangs');
 const banditDetail=banditLead?`Active lead: ${banditLead.site.name}. Follow it from the World tab.`:'Pay for a lead to a connected wilderness location with reported bandit activity. Following it lets you investigate using the existing scouting and combat systems.';
 const gangDetail=gangLead?`Active lead: ${gangLead.site.name}. Follow it from the World tab.`:'Pay for a lead to a connected wilderness location with suspected gang activity, represented by existing thief or bandit encounters.';
 const banditReason=ir0723IntelReason('bandits'),gangReason=ir0723IntelReason('gangs');
 const intelHtml=`<div class="ir0723-intel-intro"><strong>Paid criminal intelligence</strong><p>The innkeeper’s contacts sometimes know where bandits or local gangs have been active. Each lead costs ${IR0723_INTEL_COST} coins and marks a location on your World map. It is a rumor, not a guarantee of a safe or easy fight.</p></div><div class="ir072-action-grid">${ir072Card('Bandit activity',banditDetail,'ir0723-intel','Buy lead · 15 ◈',!banditReason,banditReason,{'criminal-type':'bandits'})}${ir072Card('Gang activity',gangDetail,'ir0723-intel','Buy lead · 15 ◈',!gangReason,gangReason,{'criminal-type':'gangs'})}</div>`;
 return `<div class="ir072-occupation-note"><strong>Services in ${esc(s?.name||'this location')}</strong><p>${esc(serviceText)}.</p></div><div class="ir072-action-grid">${ir072Card('Share a local rumor',rumor?`${rumor.title}: ${rumor.text||'A local lead is ready to be marked on your map.'}`:'An innkeeper can only share a rumor that already exists in the world journal.','ir072-rumor','Mark rumor on map',!rumorReason,rumorReason)}${ir072Card(bedTitle,bedDetail,'ir072-rest',bedLabel,!restReason,restReason)}</div>${intelHtml}`;
}

ir072InnkeeperCards=ir0723InnkeeperCards;
function ir0723PurchaseIntel(npcId,type){
 const n=ir072RequireNPC(npcId);if(!n)return true;
 if(ir072Occupation(n)!=='innkeeper'){toast('Only an innkeeper can sell this information.');return true}
 const s=site(),c=state.character,v=ir0723Data();
 if(!(s?.services||[]).includes('inn')){toast('Paid criminal intelligence is only available at a staffed inn.');return true}
 if(ir072Blocked()||state.warning){toast('Resolve the current threat or event first.');return true}
 if(!['bandits','gangs'].includes(type)){toast('That kind of intelligence is unavailable.');return true}
 const existing=ir0723LeadStatus(type);if(existing){toast(`You already have an active lead near ${existing.site.name}. Follow it before buying another.`);return true}
 if(c.coin<IR0723_INTEL_COST){toast(`You need ${IR0723_INTEL_COST} coins for this information.`);return true}
 const target=ir0723FindIntelTarget(type);if(!target){toast('The innkeeper has no reliable lead of that type available right now.');return true}
 const day=Number(c.daysLived)||0,kind=type==='bandits'?'bandit activity':'gang activity';
 c.coin-=IR0723_INTEL_COST;target.site.changes=target.site.changes||{};
 const lead={id:`ir-lead-${type}-${target.site.id}-${day}-${v.history.length+1}`,type,siteId:target.site.id,enemyId:target.enemyId,status:'active',issuedDay:day,issuedByNpcId:n.id,issuedBy:n.name};
 target.site.changes.criminalIntel=lead;v.activeLeads[type]=lead;v.history.push({type,siteId:target.site.id,issuedDay:day,status:'active'});v.history=v.history.slice(-40);
 irAddKnownLocation(target.site.id);
 const text=`For ${IR0723_INTEL_COST} coins, ${n.name} shared a lead about ${kind} near ${target.site.name} (${irBiomeProfileForSite(target.site).name}, local risk ${Number(target.site.risk)||0}%). The lead is marked on your World map. Travel there and scout to investigate.`;
 ir072RememberAction(n,'Criminal intelligence purchased',text,'criminal-intel');return true;
}
const ir0723ActionBase=ir072Action;
ir072Action=function(target){
 const a=target?.dataset?.action;
 if(a==='ir0723-intel')return ir0723PurchaseIntel(target.dataset.npc||modal?.npc,target.dataset.criminalType);
 return ir0723ActionBase.apply(this,arguments);
};
function ir0723WorldIntelPanel(){
 const v=ir0723Data(),active=['bandits','gangs'].map(type=>{const found=ir0723LeadStatus(type);return found?{type,...found}:null}).filter(Boolean);
 if(!active.length)return '';
 return `<section class="panel panel-pad ir0723-intel-world"><div class="panel-heading"><div><div class="eyebrow">PAID LEADS</div><h3>Criminal intelligence</h3><p>Follow these rumors to investigate suspected activity. A lead may result in an encounter.</p></div><span class="tag gold">${active.length} ACTIVE</span></div>${active.map(({type,lead,site:s})=>`<article class="ir0723-lead-row"><div class="ir0723-lead-icon">${type==='bandits'?'🗡️':'🕵️'}</div><div class="ir0723-lead-copy"><strong>${type==='bandits'?'Bandit activity':'Gang activity'} · ${esc(s.name)}</strong><p>${esc(irBiomeProfileForSite(s).name)} · local risk ${Number(s.risk)||0}% · reported by ${esc(lead.issuedBy||'an innkeeper')}.</p><p>Travel to the marked site and use Scout to follow the lead. It uses your usual scouting cost and the existing danger-warning/combat system.</p></div><button class="button small primary" data-action="travel" data-site="${esc(s.id)}" data-transport="foot" ${s.id===state.world.siteId?'disabled':''}>${s.id===state.world.siteId?'At location':'Travel toward lead'}</button></article>`).join('')}</section>`;
}
const ir0723RenderWorldBase=renderWorld;
renderWorld=function(){
 const html=ir0723RenderWorldBase.apply(this,arguments),panel=ir0723WorldIntelPanel();
 if(!panel)return html;
 const anchor='<div class="grid two" style="margin-top:15px">';
 return html.includes(anchor)?html.replace(anchor,`${panel}${anchor}`):html+panel;
};
const ir0723InteractionModalBase=ir072InteractionModal;
ir072InteractionModal=function(){return ir0723InteractionModalBase.apply(this,arguments).replace('NPC INTERACTIONS · V0.7.2','NPC INTERACTIONS · V0.7.2.4')};

const ir0723ExploreBase=irExplore;
irExplore=function(mode='scout'){
 const s=site(),c=state?.character,lead=s?.changes?.criminalIntel;
 if(mode!=='forage'&&lead?.status==='active'&&c&&s&&!state?.combat?.active){
  if(state.pendingEvent||state.warning){toast('Resolve the current event or spotted threat before following this lead.');return}
  if(!actionCost(15))return;
  c.energy=clamp(c.energy-15,0,c.maxEnergy||100);dayPass(2,'following criminal intelligence');
  s.changes.searches=(Number(s.changes.searches)||0)+1;s.changes.scouted=true;
  for(const route of (s.routes||[]))irAddKnownLocation(route.to);
  if(state.pendingEvent){persist();render();toast('Another event interrupted your search. The criminal lead remains active; investigate again after resolving it.');return}
  const v=ir0723Data(),type=lead.type,leadState=v.activeLeads[type];
  lead.status='confirmed';lead.confirmedDay=Number(c.daysLived)||0;
  if(leadState?.siteId===s.id)v.activeLeads[type]=null;
  const enemyId=IR_ENEMIES?.[lead.enemyId]?lead.enemyId:(type==='bandits'?'bandit':'thief');
  const enemyName=IR_ENEMIES?.[enemyId]?.name||'hostile criminals';
  state.warning={enemyId,enemyName,siteId:s.id,message:`The paid lead was accurate. Your search found signs of ${type==='bandits'?'road bandits':'a local criminal gang'} around ${s.name}. Choose whether to confront the threat or try to avoid it.`};
  const note=`You followed an innkeeper’s lead and confirmed signs of ${type==='bandits'?'bandits':'a local gang'} near ${s.name}. The encounter uses the existing ${enemyName} threat and warning system.`;
  addFeed('🕵️','Criminal lead confirmed',note,'discovery');
  v.history.push({type,siteId:s.id,issuedDay:lead.issuedDay,confirmedDay:Number(c.daysLived)||0,status:'confirmed'});v.history=v.history.slice(-40);
  s.changes.notes=Array.isArray(s.changes.notes)?s.changes.notes:[];s.changes.notes.unshift({date:dateLabel(),activity:'criminal-lead-confirmed',type});s.changes.notes=s.changes.notes.slice(0,20);
  persist();render();toast(`Lead confirmed: ${enemyName} nearby. Choose whether to face or avoid the threat.`);return;
 }
 return ir0723ExploreBase.apply(this,arguments);
};

const ir0723Css=document.createElement('style');
ir0723Css.textContent=`.ir0723-intel-intro{margin-top:12px;padding:12px;border:1px solid var(--gold);border-radius:10px;background:var(--surface-2,rgba(255,255,255,.025))}.ir0723-intel-intro strong{font-size:12px}.ir0723-intel-intro p{font-size:11px;line-height:1.6;color:var(--muted);margin:5px 0 0}.ir0723-intel-world{margin:0 0 14px}.ir0723-lead-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line)}.ir0723-lead-icon{font-size:22px;flex-shrink:0}.ir0723-lead-copy{flex:1;min-width:0}.ir0723-lead-copy strong{font-size:12px}.ir0723-lead-copy p{font-size:11px;line-height:1.55;color:var(--muted);margin:4px 0 0}.ir0723-lead-row>.button{flex-shrink:0}@media(max-width:650px){.ir0723-lead-row{align-items:flex-start;flex-wrap:wrap}.ir0723-lead-row>.button{margin-left:34px}}`;
document.head.appendChild(ir0723Css);
// ================= End Infinite Realms v0.7.2.3 =================
