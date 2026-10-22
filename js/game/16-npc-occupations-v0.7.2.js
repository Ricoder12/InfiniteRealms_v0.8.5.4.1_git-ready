'use strict';
// ================= Infinite Realms v0.7.2: occupation-based NPC interactions =================
// Additive save data only: v0.7.2 reuses the existing market, crafting, repair, hunting,
// study, rumor, rest, and relationship mechanics. The save schema remains unchanged.
function ir072Data(){
 const w=state?.world;if(!w)return {schema:1,bargainAttempts:{},activeBargain:null};
 if(!w.v072||typeof w.v072!=='object')w.v072={schema:1,bargainAttempts:{},activeBargain:null};
 w.v072.schema=1;w.v072.bargainAttempts=w.v072.bargainAttempts&&typeof w.v072.bargainAttempts==='object'?w.v072.bargainAttempts:{};
 if(w.v072.activeBargain&&typeof w.v072.activeBargain!=='object')w.v072.activeBargain=null;
 return w.v072;
}
function ir072Occupation(n){
 const o=String(n?.occupation||n?.role||'').toLowerCase();
 if(/merchant|trader|shopkeeper|peddler|market seller/.test(o))return 'merchant';
 if(/blacksmith|smith|armorer|armourer|forge|weaponsmith|apprentice/.test(o))return 'blacksmith';
 if(/guard|watch|sentinel|warden|knight|constable/.test(o))return 'guard';
 if(/hunter|tracker|ranger|trapper/.test(o))return 'hunter';
 if(/scholar|researcher|scribe|librarian|wizard|mage|arcanist|historian|sage/.test(o))return 'scholar';
 if(/innkeeper|tavern keeper|publican|host|barkeep/.test(o))return 'innkeeper';
 return 'resident';
}
function ir072NPC(id){return state?.character?.npcs?.find(n=>String(n.id)===String(id))||null}
function ir072IsPresent(n){const s=site(),day=Number(state?.character?.daysLived)||0;return !!(n&&s&&ir06Present(n,s.id,day))}
function ir072Blocked(){return !!(state?.combat?.active||state?.pendingEvent)}
function ir072KnownLocation(n){try{return ir0681RelationshipLocation(n)}catch(e){return {id:n?.lastSeenSiteId||n?.homeSite||'',name:'',status:'unknown',label:'Location unknown'}}}
function ir072CanShopHere(){try{return !!ir04CanShop('general')}catch(e){return !!(site()?.services||[]).includes('market')}}
function ir072HasForge(){return (site()?.services||[]).some(x=>['forge','workshop','smithy'].includes(x))}
function ir072RoomCost(){const s=site();return s?.changes?.temporaryCamp&&!s.services?.includes('inn')?0:5}
function ir072Card(title,detail,action,label,enabled,reason='',data={}){
 const attrs=Object.entries(data).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ');
 const lock=enabled?'':`disabled title="${esc(reason||'Unavailable in the current situation.')}"`;
 return `<article class="ir072-action-card"><div class="ir072-action-copy"><strong>${esc(title)}</strong><p>${esc(detail)}</p>${reason?`<small class="ir072-action-reason">${esc(reason)}</small>`:''}</div><button class="button small ${enabled?'primary':''}" data-action="${esc(action)}" data-npc="${esc(modal?.npc||'')}" ${attrs?attrs:''} ${lock}>${esc(label)}</button></article>`;
}
function ir072GeneralCards(n){
 const c=state.character,r=ir06Relationship(n),day=Number(c.daysLived)||0,blocked=ir072Blocked();
 const talkDelta=day-Number(n.lastTalkDay??-2),gift=['charm','herb','bread','scrap'].find(k=>(c.inventory?.[k]||0)>0);
 const talkReason=blocked?'Resolve the current combat or event first.':talkDelta<2?`You spoke recently; wait ${2-talkDelta} simulated day(s).`:c.energy<5?'Need 5 energy to talk.':c.hunger<8?'Eat something before socializing.':'';
 const giftReason=blocked?'Resolve the current combat or event first.':!gift?'You need a gift item: charm, herb, bread, or scrap.':'';
 const favorReason=blocked?'Resolve the current combat or event first.':r.affinity<2||r.trust<1?'Requires at least 2 affinity and 1 trust.':c.energy<8?'Need 8 energy to ask for help.':'';
 const adviceReason=blocked?'Resolve the current combat or event first.':c.energy<2?'Need 2 energy to focus on their advice.':'';
 return [
  ir072Card('Talk','Build affinity and trust through a conversation. Existing cooldown and energy rules apply.','ir072-talk','Talk · 1 day',!talkReason,talkReason),
  ir072Card('Give a gift',gift?`Give them ${ITEMS[gift]?.name||gift} from your inventory.`:'Give a charm, herb, bread, or scrap if you have one.','ir072-gift','Give gift',!giftReason,giftReason),
  ir072Card('Ask a favor','Ask for practical help; success depends on your relationship and their traits.','ir072-favor','Ask favor',!favorReason,favorReason),
  ir072Card('Ask for advice','Get profession-related advice and a small amount of relevant skill experience. Costs 2 energy.','ir072-advice','Ask advice',!adviceReason,adviceReason)
 ].join('');
}
function ir072MarketStockHtml(){
 if(!ir072CanShopHere())return '<p class="ir072-inline-note">No local market is available here, so the merchant cannot quote usable stock or open trade.</p>';
 let m=null;try{m=ir04MarketState(site()?.id)}catch(e){}
 const ids=(IR_V04_SHOPS?.general||[]).filter(id=>IR_V04_ITEM_DATA?.[id]&&ITEMS?.[id]&&(m?.stock?.[id]||0)>0).slice(0,6);
 if(!ids.length)return '<p class="ir072-inline-note">The local general-stock list is empty or has not been stocked yet.</p>';
 return `<div class="ir072-stock-list">${ids.map(id=>`<div><span>${esc(ITEMS[id]?.icon||'📦')} ${esc(ITEMS[id]?.name||id)}</span><small>Stock ${Number(m?.stock?.[id])||0}</small><b>${ir04ItemPrice(id,'buy')} ◈</b></div>`).join('')}</div>`;
}
function ir072SafetySummary(){
 const s=site(),v=state.world?.v05||{},e=v.activeEvent,disturbance=e?(e.siteId===s?.id?`${e.title} — ${e.stage==='warning'?'warning': 'escalating situation'}. ${e.stage==='warning'?e.warning:e.escalation}`:`Regional report: ${e.title} near ${ir071SiteName(e.siteId)}.`):'No active regional disturbance is recorded.';
 const security=(v.settlements?.[s?.id]?.security);
 return `Current risk: ${Number(s?.risk)||0}/100. Terrain: ${s?irBiomeProfileForSite(s).name:'unknown'}. ${security!==undefined?`Recorded settlement security: ${security}/100. `:''}${disturbance}`;
}
function ir072GuardCard(){
 const blocked=ir072Blocked(),e=state.world?.v05?.activeEvent,s=site();
 const detail=ir072SafetySummary();
 const history=(state.world?.v05?.history||[]).slice(0,2).map(x=>x.title).filter(Boolean);
 const historyText=history.length?`Recent regional records: ${history.join('; ')}.`:'No recent disturbance records are available.';
 return `<div class="ir072-occupation-note"><strong>Safety report</strong><p>${esc(detail)}</p><p>${esc(historyText)}</p></div><div class="ir072-action-grid">${ir072Card('Ask about local disturbances','Record the guard’s current warning in this NPC’s memory and the chronicle. No new patrol or crime simulation is created.','ir072-guard-info','Ask guard',!blocked,blocked?'Resolve the current combat or event first.':'')}</div>`;
}
function ir072HunterCards(){
 const s=site(),c=state.character,blocked=ir072Blocked(),eligible=['wolf','spider','boar','direwolf','slime','goblin'];
 const wildlife=(irBiomeEncounterIds(s)).filter(id=>eligible.includes(id)).map(id=>IR_ENEMIES?.[id]?.name||id);
 const active=!!state.hunt,canStart=!blocked&&!active&&c.energy>=10&&c.hunger>=8;
 const reason=blocked?'Resolve the current combat or event first.':active?'You already have an active trail to investigate.':c.energy<10?'Need 10 energy to begin tracking.':c.hunger<8?'Eat something before tracking.':'';
 return `<div class="ir072-occupation-note"><strong>Wildlife and trails · ${esc(s?irBiomeProfileForSite(s).name:'local terrain')}</strong><p>${esc(wildlife.length?`Common huntable signs in this biome: ${[...new Set(wildlife)].join(', ')}.`:'The hunter has no specific wildlife record for this biome yet. The existing hunt system will use its fallback pool if you begin tracking.')}</p></div><div class="ir072-action-grid">${ir072Card('Ask about trails','Hear the hunter’s practical notes and record them in your shared memories.','ir072-hunter-info','Discuss trails',!blocked,blocked?'Resolve the current combat or event first.':'')}${ir072Card('Get a hunting lead','Start the existing tracking sequence; it costs 10 energy and one simulated day, then presents the normal prepare/pursue/abandon choices.','ir072-hunt','Start a hunt',canStart,reason)}</div>`;
}
function ir072ScholarCards(n){
 const c=state.character,s=site(),blocked=ir072Blocked(),records=[];
 for(const d of (state.world?.journal?.discoveries||[]))if(!d.siteId||d.siteId===s?.id)records.push({title:d.title,detail:d.detail||''});
 const recent=(state.world?.v05?.history||[]).slice(0,2).map(x=>({title:x.title,detail:x.detail||''}));
 const combined=[...records,...recent].slice(0,3);
 const history=combined.length?`<div class="ir072-record-list">${combined.map(x=>`<div><strong>${esc(x.title||'World record')}</strong><p>${esc(x.detail)}</p></div>`).join('')}</div>`:'<p class="ir072-inline-note">No recorded discovery or regional-history entry is associated with this area yet. The scholar can still help you study existing Lore or Magic skills.</p>';
 const loreReason=blocked?'Resolve the current combat or event first.':c.energy<12?'Need 12 energy for a study session.':c.coin<2?'Lore study requires 2 coins for notes and materials.':'';
 const magicReason=blocked?'Resolve the current combat or event first.':c.energy<12?'Need 12 energy for a study session.':c.coin<3?'Magic study requires 3 coins for materials.':'';
 return `<div class="ir072-occupation-note"><strong>Historical records and lore</strong>${history}</div><div class="ir072-action-grid">${ir072Card('Study Lore','Use the existing study action: 2 simulated days, 12 energy, and 2 coins.','ir072-study','Study Lore',!loreReason,loreReason,{skill:'Lore'})}${ir072Card('Study Magic','Use the existing study action: 2 simulated days, 12 energy, and 3 coins.','ir072-study','Study Magic',!magicReason,magicReason,{skill:'Magic'})}${ir072Card('Discuss local records','Add a short shared memory about the available history without inventing new lore or consuming time.','ir072-scholar-info','Discuss findings',!blocked,blocked?'Resolve the current combat or event first.':'')}</div>`;
}
function ir072InnkeeperCards(){
 const s=site(),c=state.character,rumors=state.world?.journal?.rumors||[],rumor=rumors.find(x=>!x.resolved),blocked=ir072Blocked(),room=(s?.services||[]).includes('inn')||!!s?.changes?.temporaryCamp,cost=ir072RoomCost();
 const rumorReason=blocked?'Resolve the current combat or event first.':!rumor?'There are no unmarked rumors recorded in your world journal yet.':'';
 const restReason=blocked?'Resolve the current combat or event first.':!room?'There is no inn or temporary camp at this location.':c.coin<cost?`Rest costs ${cost} coins; you have ${c.coin}.`:'';
 const serviceText=(s?.services||[]).length?(s.services.map(x=>({'market':'market','inn':'inn and beds','healer':'healer','guild':'guild','work-board':'work board','forge':'forge/workshop','stable':'stable','library':'library'}[x]||String(x).replaceAll('-',' '))).join(', ')):'no permanent services recorded';
 return `<div class="ir072-occupation-note"><strong>Services in ${esc(s?.name||'this location')}</strong><p>${esc(serviceText)}.</p></div><div class="ir072-action-grid">${ir072Card('Share a local rumor',rumor?`${rumor.title}: ${rumor.text||'A local lead is ready to be marked on your map.'}`:'An innkeeper can only share a rumor that already exists in the world journal.','ir072-rumor','Mark rumor on map',!rumorReason,rumorReason)}${ir072Card('Rent a bed','Use the existing safe-rest service: one day, 5 coins at an inn (free at a temporary camp), restoring energy and some health.','ir072-rest',cost?`Rest · ${cost} ◈`:'Rest · free',!restReason,restReason)}</div>`;
}
function ir072ResidentCards(){
 const blocked=ir072Blocked();
 return `<div class="ir072-action-grid">${ir072Card('Ask about the area','Record the resident’s local perspective in your shared memories. Site details and local services are shown above.','ir072-local-info','Ask local questions',!blocked,blocked?'Resolve the current combat or event first.':'')}${ir072Card('Review the world map','Open the existing World tab for connected routes, local services, rumors, and discoveries.','ir072-world','Open World',!blocked,blocked?'Resolve the current combat or event first.':'')}</div>`;
}
function ir072ContextInfo(s){
 const services=(s?.services||[]).length?(s.services.map(x=>String(x).replaceAll('-',' ')).join(', ')):'none recorded';
 return `<section class="ir072-location-context"><div class="ir072-context-top"><strong>Current situation · ${esc(s?.name||'Unknown location')}</strong><span class="tag ${Number(s?.risk||0)>=30?'red':'blue'}">RISK ${Number(s?.risk)||0}</span></div><p>${esc(s?.desc||'No local description is recorded.')}</p><small>${esc(s?irBiomeProfileForSite(s).name:'Unknown terrain')} · Services: ${esc(services)}</small></section>`;
}
function ir072InteractionModal(){
 const n=ir072NPC(modal?.npc);if(!n)return `<div class="overlay"><section class="modal"><div class="modal-header"><div><h2>NPC unavailable</h2><p>This person is no longer in the current character record.</p></div><button class="close-btn" data-action="ir072-close">×</button></div></section></div>`;
 const s=site(),present=ir072IsPresent(n),schedule=ir071ScheduleFor(n,Number(state.character.daysLived)||0),loc=ir072KnownLocation(n),kind=ir072Occupation(n),labels={merchant:'Merchant',blacksmith:'Blacksmith',guard:'Guard',hunter:'Hunter',scholar:'Scholar',innkeeper:'Innkeeper',resident:'Ordinary resident'};
 const r=ir06Relationship(n),serviceHtml=kind==='merchant'?ir072ShopCard(n):kind==='blacksmith'?ir072BlacksmithCards():kind==='guard'?ir072GuardCard():kind==='hunter'?ir072HunterCards():kind==='scholar'?ir072ScholarCards(n):kind==='innkeeper'?ir072InnkeeperCards():ir072ResidentCards();
 let away='';
 if(!present){const travelId=loc?.id&&loc.id!==s?.id?loc.id:'';away=`<section class="ir072-away"><strong>Not available here right now</strong><p>${esc(schedule?.label||'This NPC is away from the current location.')}. Occupation-specific services require the NPC to be physically present.</p><p>Known location: ${esc(loc?.name||'Unknown location')}${loc?.label?` · ${esc(loc.label)}`:''}</p>${travelId?`<button class="button primary" data-action="ir072-travel-npc" data-npc="${esc(n.id)}" data-site="${esc(travelId)}">Travel toward ${esc(loc.name)}</button>`:''}</section>`}
 const common=present?`<section class="ir072-section"><div class="panel-heading"><div><h3>Conversation & relationship</h3><p>These use the existing social mechanics and retain their normal costs and conditions.</p></div><span class="tag">AFFINITY ${Number(r.affinity)||0} · TRUST ${Number(r.trust)||0}</span></div><div class="ir072-action-grid">${ir072GeneralCards(n)}</div></section>`:'';
 return `<div class="overlay" data-dismiss="modal"><section class="modal ir072-modal" role="dialog" aria-modal="true" aria-label="Interactions with ${esc(n.name)}"><div class="modal-header"><div><div class="eyebrow">NPC INTERACTIONS · V0.7.2</div><h2>${esc(n.icon||'♙')} ${esc(n.name)}</h2><p>${esc(n.occupation||n.role||'Resident')} · ${esc(labels[kind])} · ${present?esc(schedule.label||'Present here'):'Currently away'}</p></div><button class="close-btn" data-action="ir072-close" aria-label="Close interactions">×</button></div>${ir072ContextInfo(s)}${away}${common}${present?`<section class="ir072-section"><div class="panel-heading"><div><h3>${esc(labels[kind])} services</h3><p>Options are checked against the current location, schedule, skills, stock, materials, and resources.</p></div><span class="tag gold">${esc(kind.toUpperCase())}</span></div>${serviceHtml}</section>`:''}<div class="modal-actions"><button class="button" data-action="ir072-close">Close</button></div></section></div>`;
}
function ir072RequireNPC(id){
 const n=ir072NPC(id);if(!n){toast('That NPC is no longer available in this save.');return null}
 if(!ir072IsPresent(n)){toast(`${n.name} is not currently at ${site()?.name||'this location'}. Check their location or schedule.`);return null}
 if(ir072Blocked()){toast('Resolve the current combat or event first.');return null}
 return n;
}
function ir072RememberAction(n,title,detail,kind='conversation'){
 ir06Remember(n,detail,kind);addFeed('♧',title,detail,'social');persist();render();toast(title);
}
function ir072Bargain(id){
 const n=ir072RequireNPC(id);if(!n)return;const c=state.character,s=site(),v=ir072Data(),day=Number(c.daysLived)||0;
 if(ir072Occupation(n)!=='merchant'){toast('Only a merchant or trader can negotiate a market offer.');return}
 if(!ir072CanShopHere()){toast('There is no usable market service at this location.');return}
 if(Number(v.bargainAttempts?.[n.id]??-999)===day){toast('You already tried bargaining with this merchant today.');return}
 if(v.activeBargain?.siteId===s.id){toast('You already have a negotiated discount waiting for one purchase here.');return}
 if(c.energy<4){toast('You need 4 energy to negotiate.');return}if(c.hunger<8){toast('Eat something before negotiating.');return}
 const chance=clamp(38+Math.max(0,(c.skills?.Trade?.level||1)-1)*4+((c.attrs?.Charisma||10)-10)*2+(ir06Trait(n,'generous')?5:0)-(ir06Trait(n,'cautious')?5:0),20,80);
 v.bargainAttempts[n.id]=day;c.energy-=4;
 if(Math.random()*100<chance){v.activeBargain={npcId:n.id,npcName:n.name,siteId:s.id,percent:8,createdDay:day};const text=`${n.name} agreed to an 8% discount on one eligible purchase at ${s.name}. The offer remains tied to this market and is consumed by one single-item purchase.`;ir06Remember(n,text,'bargain');addFeed('🤝','Bargain accepted',text,'social');persist();modal=null;render();toast('Bargain accepted: 8% off one item here.');}
 else{const text=`You tried to bargain with ${n.name} at ${s.name}, but they held to the listed prices. No coins were charged; you spent 4 energy.`;ir06Remember(n,text,'bargain');addFeed('🤝','Bargain declined',text,'social');persist();modal=null;render();toast('The merchant declined. No coins were charged; 4 energy was spent.');}
}
function ir072Action(target){
 const a=target?.dataset?.action,id=target?.dataset?.npc||modal?.npc;
 if(a==='ir072-open'){const n=ir072NPC(id);if(!n){toast('That NPC is no longer available.');return}modal={kind:'ir072-interactions',npc:n.id};render();return true}
 if(a==='ir072-close'){modal=null;render();return true}
 if(a==='ir063-focus'){const n=ir072NPC(id);if(!n){toast('That NPC is no longer available.');return true}modal={kind:'ir072-interactions',npc:n.id};render();return true}
 if(a==='ir072-travel-npc'){const siteId=target.dataset.site;modal=null;render();if(siteId&&siteId!==state?.world?.siteId)travel(siteId,'foot');return true}
 if(!String(a||'').startsWith('ir072-'))return false;
 if(a==='ir072-world'){if(!ir072RequireNPC(id))return true;setTab('World');return true}
 if(a==='ir072-market'){const n=ir072RequireNPC(id);if(!n)return true;if(ir072Occupation(n)!=='merchant'){toast('This NPC does not provide merchant trade.');return true}if(!ir072CanShopHere()){toast('No market is available here.');return true}setTab('Inventory');return true}
 if(a==='ir072-bargain'){ir072Bargain(id);return true}
 const n=ir072RequireNPC(id);if(!n)return true;
 if(a==='ir072-talk'){modal=null;ir06Talk(id);return true}
 if(a==='ir072-gift'){modal=null;ir06Gift(id);return true}
 if(a==='ir072-favor'){modal=null;ir06Favor(id);return true}
 if(a==='ir072-advice'){modal=null;ir061Advice(id);return true}
 if(a==='ir072-repair'){if(ir072Occupation(n)!=='blacksmith'){toast('Only a blacksmith can provide this repair service.');return true}if(!ir072HasForge()){toast('Travel to a location with a forge, smithy, or workshop for repairs.');return true}modal=null;ir04Repair(target.dataset.slot);return true}
 if(a==='ir072-workbench'){if(ir072Occupation(n)!=='blacksmith'){toast('This crafting service belongs to a blacksmith.');return true}if(!ir072HasForge()){toast('A forge or workshop is required for the supported smithing recipes.');return true}setTab('Inventory');return true}
 if(a==='ir072-guard-info'){if(ir072Occupation(n)!=='guard'){toast('This information interaction is intended for guards.');return true}const e=state.world?.v05?.activeEvent,s=site(),eventText=e?(e.siteId===s.id?`${e.title}: ${e.stage==='warning'?e.warning:e.escalation}`:`Regional concern: ${e.title} near ${ir071SiteName(e.siteId)}.`):'No active regional disturbance is recorded.';const text=`The guard briefed you on ${s.name}: risk ${Number(s.risk)||0}/100, terrain ${irBiomeProfileForSite(s).name}. ${eventText}`;ir072RememberAction(n,'Guard briefing recorded',text,'local-information');return true}
 if(a==='ir072-hunter-info'){if(ir072Occupation(n)!=='hunter'){toast('This interaction is intended for hunters.');return true}const s=site(),ids=(irBiomeEncounterIds(s)).filter(id=>['wolf','spider','boar','direwolf','slime','goblin'].includes(id)),names=[...new Set(ids.map(id=>IR_ENEMIES?.[id]?.name||id))],text=`${n.name} discussed trails around ${s.name}. Huntable signs associated with this biome include ${names.join(', ')||'no specifically listed creatures'}.`;ir072RememberAction(n,'Hunter shared trail knowledge',text,'local-information');return true}
 if(a==='ir072-hunt'){if(ir072Occupation(n)!=='hunter'){toast('This hunting lead belongs to a hunter.');return true}modal=null;irStartHunt();return true}
 if(a==='ir072-study'){if(ir072Occupation(n)!=='scholar'){toast('This study option belongs to a scholar.');return true}modal=null;study(target.dataset.skill||'Lore');return true}
 if(a==='ir072-scholar-info'){if(ir072Occupation(n)!=='scholar'){toast('This history discussion belongs to a scholar.');return true}const s=site(),records=[...(state.world?.journal?.discoveries||[]).filter(d=>!d.siteId||d.siteId===s.id).map(d=>d.title),...(state.world?.v05?.history||[]).slice(0,2).map(e=>e.title)].filter(Boolean).slice(0,4);const text=records.length?`${n.name} discussed existing records about ${s.name}: ${records.join('; ')}.`:`${n.name} explained that no significant local records have been collected about ${s.name} yet.`;ir072RememberAction(n,'Scholar discussion recorded',text,'lore');return true}
 if(a==='ir072-rumor'){if(ir072Occupation(n)!=='innkeeper'){toast('This rumor service belongs to an innkeeper.');return true}const rum=(state.world?.journal?.rumors||[]).find(x=>!x.resolved);if(!rum){toast('There are no unmarked rumors available to share.');return true}ir06Remember(n,`${n.name} shared a local rumor: ${rum.title}.`,'rumor');modal=null;revealRumor(rum.id);return true}
 if(a==='ir072-rest'){if(ir072Occupation(n)!=='innkeeper'){toast('This shelter service belongs to an innkeeper.');return true}if(!((site()?.services||[]).includes('inn')||site()?.changes?.temporaryCamp)){toast('There is no inn or temporary camp here.');return true}modal=null;localRest();return true}
 if(a==='ir072-local-info'){const s=site(),text=`You asked ${n.name} about ${s.name}. Local terrain: ${irBiomeProfileForSite(s).name}. Local risk: ${Number(s.risk)||0}/100. Services: ${(s.services||[]).join(', ')||'none recorded'}. ${s.desc||''}`;ir072RememberAction(n,'Local information recorded',text,'local-information');return true}
 return false;
}
const ir072PeopleBase=ir06PeopleScreen;
ir06PeopleScreen=function(){
 let html=ir072PeopleBase();
 html=html.replace(/<div class="ir06-actions">([\s\S]*?)<\/div>/g,(whole,inside)=>{
  const m=inside.match(/data-npc="([^"]+)"/);if(!m||inside.includes('data-action="ir072-open"'))return whole;
  const id=m[1];return `<div class="ir06-actions"><button class="button small primary" data-action="ir072-open" data-npc="${esc(id)}">Interact</button>${inside}</div>`;
 });
 return html;
};
const ir072ModalBase=renderModal;
renderModal=function(){if(modal?.kind==='ir072-interactions')return ir072InteractionModal();return ir072ModalBase.apply(this,arguments)};
const ir072RunBase=runAction;
runAction=function(target){if(ir072Action(target))return;return ir072RunBase.apply(this,arguments)};
// A successful bargaining attempt affects one single-item market purchase. Market prices,
// stock, carrying capacity, and transaction accounting still come from the established systems.
const ir072PriceBase=ir04ItemPrice;
ir04ItemPrice=function(id,mode='buy',siteId=site()?.id){
 let price=ir072PriceBase(id,mode,siteId);const v=state?.world?.v072,coupon=v?.activeBargain,currentId=siteId||site()?.id;
 if(mode==='buy'&&coupon&&coupon.siteId===currentId&&currentId===site()?.id)price=Math.max(1,Math.round(price*(1-(Number(coupon.percent)||8)/100)));
 return price;
};
const ir072MarketBuyBase=ir051MarketBuy;
ir051MarketBuy=function(id,qty=1){
 const v=state?.world?.v072,coupon=v?.activeBargain,loc=site()?.id,requested=Math.max(1,Math.floor(Number(qty)||1));
 if(coupon&&coupon.siteId===loc&&requested>1){toast('The negotiated offer covers one item. Set market quantity to 1 to use the discount.');return}
 const c=state?.character,beforeCoins=Number(c?.coin)||0,beforeQty=Number(c?.inventory?.[id])||0,m=state?.character&&ir04MarketState(loc),beforeStock=Number(m?.stock?.[id])||0;
 ir072MarketBuyBase(id,requested);
 const live=state?.character,afterQty=Number(live?.inventory?.[id])||0,afterCoins=Number(live?.coin)||0,liveCoupon=state?.world?.v072?.activeBargain;
 if(coupon&&liveCoupon&&liveCoupon.siteId===loc&&afterQty>beforeQty&&afterCoins<beforeCoins&&Number(ir04MarketState(loc)?.stock?.[id]||0)<beforeStock){
  state.world.v072.activeBargain=null;const savedNpc=ir072NPC(coupon.npcId);if(savedNpc)ir06Remember(savedNpc,`The negotiated ${coupon.percent||8}% discount was used for ${ITEMS[id]?.name||id} at ${site()?.name||'the local market'}.`,'bargain-used');
  addFeed('🤝','Bargain discount used',`Your negotiated discount reduced this purchase by ${Number(coupon.percent)||8}%.`,'social');persist();render();toast(`Negotiated discount used: ${Number(coupon.percent)||8}% off.`);
 }
};
const ir072Css=document.createElement('style');
ir072Css.textContent=`.ir072-modal{width:min(860px,96vw);max-height:90vh;overflow:auto}.ir072-section{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.ir072-section>.panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.ir072-section .panel-heading h3{margin:0 0 5px}.ir072-section .panel-heading p{margin:0;color:var(--muted);font-size:11px;line-height:1.6}.ir072-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}.ir072-action-card{min-width:0;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2,rgba(255,255,255,.025))}.ir072-action-copy{flex:1;min-width:0}.ir072-action-copy strong{font-size:12px}.ir072-action-copy p,.ir072-occupation-note p,.ir072-location-context p,.ir072-away p{font-size:11px;line-height:1.6;color:var(--muted);margin:5px 0 0}.ir072-action-card button{flex-shrink:0;max-width:145px;white-space:normal}.ir072-action-reason{display:block;margin-top:7px;font-size:10px;line-height:1.45;color:var(--muted)}.ir072-location-context,.ir072-occupation-note,.ir072-away{padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2,rgba(255,255,255,.025));margin-top:10px}.ir072-context-top{display:flex;align-items:center;justify-content:space-between;gap:9px}.ir072-location-context p{margin-top:7px}.ir072-location-context small{display:block;color:var(--muted);font-size:10px;margin-top:7px}.ir072-inline-note{font-size:11px;line-height:1.55;color:var(--muted);margin:7px 0 0}.ir072-stock-list{display:grid;gap:5px;margin-top:8px}.ir072-stock-list>div{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid var(--line);font-size:11px}.ir072-stock-list small{color:var(--muted)}.ir072-stock-list b{white-space:nowrap}.ir072-record-list{display:grid;gap:7px;margin-top:8px}.ir072-record-list>div{padding-top:7px;border-top:1px solid var(--line)}.ir072-record-list strong{font-size:11px}.ir072-record-list p{margin-top:3px}.ir072-away{border-color:var(--gold)}.ir072-away>strong{font-size:12px}.ir072-away .button{margin-top:10px}.ir072-modal .modal-actions{position:sticky;bottom:0;background:var(--surface);padding-top:10px;margin-top:14px}@media(max-width:650px){.ir072-action-grid{grid-template-columns:1fr}.ir072-action-card{align-items:center}.ir072-section>.panel-heading{flex-direction:column}.ir072-action-card button{max-width:115px}.ir072-stock-list>div{grid-template-columns:minmax(0,1fr) auto}.ir072-stock-list>div b{grid-column:1/-1}}`;
document.head.appendChild(ir072Css);
// v0.7.2 uses additive world interaction state and intentionally retains save schema 7.
// ================= End Infinite Realms v0.7.2 =================
