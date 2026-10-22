'use strict';
// ================= Infinite Realms v0.7.2.5: occupation depth, criminal leads, and NPC crime =================
function ir0724Data(){
 const w=state?.world;if(!w)return {schema:1,crimeLog:[],guardSupport:null};
 if(!w.v0724||typeof w.v0724!=='object')w.v0724={schema:1,crimeLog:[],guardSupport:null};
 const v=w.v0724;v.schema=1;v.crimeLog=Array.isArray(v.crimeLog)?v.crimeLog:[];v.bounties=Array.isArray(v.bounties)?v.bounties:[];
 if(v.guardSupport&&typeof v.guardSupport!=='object')v.guardSupport=null;return v;
}
const ir0724OccupationBase=ir072Occupation;
ir072Occupation=function(n){
 const o=String(n?.occupation||n?.role||'').toLowerCase();
 if(/farmer|farmhand|rancher|shepherd|herdsman/.test(o))return 'farmer';
 return ir0724OccupationBase(n);
};
function ir0724PersistNPC(n){
 if(!n||!n.id)return;const w=state?.world;if(!w)return;
 const v=w.v06||(w.v06={schema:2,changes:{},journal:[],socialQuests:[],registry:{}});v.changes=v.changes||{};v.registry=v.registry||{};
 v.registry[n.id]={...(v.registry[n.id]||{}),...n};v.changes[n.id]={...(v.changes[n.id]||{}),...n};
 try{ir071PersistSchedule(n)}catch(e){}
}
function ir0724Stock(n,group){
 n.ir0724Stocks=n.ir0724Stocks&&typeof n.ir0724Stocks==='object'?n.ir0724Stocks:{};
 const defaults=group==='farmer'?{bread:3,fish:3,herb:2}:{wolf_pelt:1,wolf_fang:1,bone:2,spider_silk:1,bandage:2,bread:2};
 const caps=group==='farmer'?{bread:5,fish:5,herb:4}:{wolf_pelt:3,wolf_fang:3,bone:4,spider_silk:2,bandage:4,bread:4};
 let book=n.ir0724Stocks[group];
 if(!book||typeof book!=='object')book=n.ir0724Stocks[group]={...defaults,lastRestockDay:Number(state?.character?.daysLived)||0};
 const day=Number(state?.character?.daysLived)||0,last=Number(book.lastRestockDay??day);
 if(day>last){const ticks=Math.min(7,day-last);for(const id of Object.keys(defaults))book[id]=Math.min(caps[id],Math.max(0,Number(book[id])||0)+ticks);book.lastRestockDay=day;}
 for(const id of Object.keys(defaults))if(!Number.isFinite(Number(book[id])))book[id]=defaults[id];
 return book;
}
function ir0724TradeCard(group,n,item,price){
 const stock=ir0724Stock(n,group),available=(Number(stock[item])||0)>0,blocked=ir072Blocked(),c=state.character;
 const why=blocked?'Resolve the current combat or event first.':!available?'Currently out of stock; supplies gradually restock.':!ITEMS[item]?'This item is not supported by the current inventory.':!ir04CanCarry(item,1)?'Your pack is at capacity.':c.coin<price?`Costs ${price} coins; you have ${c.coin}.`:'';
 return ir072Card(`Buy ${ITEMS[item]?.name||item}`,`Stock ${Number(stock[item])||0} · ${price} coins. Direct trade with ${n.name}; no market service required.`,`ir0724-buy-stock`,`Buy · ${price} ◈`,!why,why,{'stock-group':group,item,price});
}
function ir0724FarmerCards(n){
 const c=state.character,s=site(),blocked=ir072Blocked(),stock=ir0724Stock(n,'farmer');
 const listings=[['bread',5],['fish',7],['herb',4]].filter(([id])=>ITEMS[id]);
 const market=listings.map(([id,price])=>ir0724TradeCard('farmer',n,id,price)).join('');
 const day=Number(c.daysLived)||0,workDay=Number(n.ir0724LastFarmDay??-1),workReason=blocked?'Resolve the current combat or event first.':workDay===day?'You already helped this farmer today.':c.energy<10?'Need 10 energy for farm work.':c.hunger<8?'Eat something before farm work.':'';
 const biome=String(s?irBiomeProfileForSite(s).name:'local');
 const detail=/river|coast|marsh|swamp/i.test(biome)?'The nearby farms focus on fish, reeds, and crops that tolerate wet soil. Livestock is kept on higher ground.':/mountain|snow|cold/i.test(biome)?'Farmers favor hardy roots, small plots, and sturdy livestock that can handle colder weather.':/forest|woodland/i.test(biome)?'Small crop fields border woodland grazing; herbs and wild forage help carry families through lean seasons.':'Local farms focus on grain, vegetables, grazing animals, and seasonal food stores.';
 return `<div class="ir0724-subsection"><strong>Produce and farm work</strong><p>${esc(n.name)} has a small personal stock of fresh goods.</p><div class="ir072-action-grid">${market}${ir072Card('Work on the farm','Help with a day of routine farm labor. Earn 14 coins and Survival experience; costs 10 energy and one day.','ir0724-farm-work','Work · 1 day',!workReason,workReason)}${ir072Card('Crop and livestock knowledge',detail,'ir0724-farm-info','Ask about farming',!blocked,blocked?'Resolve the current combat or event first.':'')}</div><small class="ir0724-stock-note">Produce stock replenishes gradually as days pass.</small></div>`;
}
function ir0724GuardExtras(n){
 const s=site(),c=state.character,v=ir0724Data(),lead=s?.changes?.criminalIntel,ev=state.world?.v05?.activeEvent;
 const localLead=!!lead&&(lead.status==='active'||lead.status==='confirmed');
 const localEvent=!!ev&&(ev.siteId===s?.id||/bandit|thief|gang|crime|disturb/i.test(`${ev.title||''} ${ev.detail||''}`));
 const reportReason=ir072Blocked()?'Resolve the current combat or event first.':!localLead&&!localEvent?'No specific local crime or disturbance is recorded for the guard to report.':(!!lead?.reported||!!(localEvent&&ev?.reported))?'This incident has already been reported to the guard.':'';
 const attempts=Number(n.ir0724LastAssistDay??-99),assistReason=ir072Blocked()?'Resolve the current combat or event first.':Number(c.daysLived)-attempts<3?'The guard needs time before arranging another escort.':c.coin<8?'An escort costs 8 coins for supplies and arrangements.':c.energy<5?'Need 5 energy to arrange an escort.':'';
 const leads=['bandits','gangs'].map(t=>ir0723LeadStatus(t)).filter(Boolean),vBounties=v.bounties.filter(x=>x.status==='active'),canAccept=leads.some(x=>!v.bounties.some(b=>b.siteId===x.site.id&&b.status==='active')),bountyReason=canAccept?`Accept a local bounty for ${leads.filter(x=>!v.bounties.some(b=>b.siteId===x.site.id&&b.status==='active')).map(x=>x.site.name).join(', ')}. Each cleared target pays 25 coins and improves reputation.`:vBounties.length?'You already have an active bounty. Follow its marked lead.':'No active criminal leads are known. Ask an innkeeper for intelligence first.';
 const routes=(s?.routes||[]).map(r=>ir071SiteById(r.to)).filter(Boolean).sort((a,b)=>(Number(b.risk)||0)-(Number(a.risk)||0)).slice(0,3);
 const routeText=routes.length?routes.map(r=>`${r.name} (${Number(r.risk)||0}% local risk)`).join('; '):'No connected routes are recorded for this location.';
 return `<div class="ir0724-subsection"><strong>Town protection</strong><div class="ir072-action-grid">${ir072Card('Report local crime',localLead?`Report the ${lead.type==='bandits'?'bandit':'gang'} lead near ${s.name}. The guard records your report.`:localEvent?`Report the recorded disturbance: ${ev.title||'local incident'}.`:'Only recorded local criminal activity or a disturbance can be reported.','ir0724-report-crime','Report crime',!reportReason,reportReason)}${ir072Card('Request guard assistance','Pay 8 coins and spend 5 energy to arrange help. Your next real combat gains +2 defense; expires after 3 days if unused.','ir0724-guard-assist','Request assistance',!assistReason,assistReason)}${ir072Card('Review and accept bounties',bountyReason,'ir0724-bounties','Accept bounty',canAccept,bountyReason)}${ir072Card('Warnings about dangerous routes',`Connected routes from here: ${routeText}`,'ir0724-route-warning','Review route warnings',!ir072Blocked(),ir072Blocked()?'Resolve the current combat or event first.':'')}</div></div>`;
}
function ir0724HunterExtras(n){
 const c=state.character,blocked=ir072Blocked(),s=site(),eligible=(irBiomeEncounterIds(s)).filter(id=>['wolf','spider','boar','direwolf','slime','goblin'].includes(id));
 const materialOffers=[['wolf_pelt',18],['wolf_fang',16],['bone',8],['spider_silk',20]].filter(([id])=>ITEMS[id]);
 const buy=materialOffers.map(([id,price])=>ir0724TradeCard('hunter',n,id,price)).join('');
 const sellable=Object.keys(c.inventory||{}).filter(id=>['wolf_pelt','wolf_fang','bone','spider_silk','slime_gel'].includes(id)&&(c.inventory[id]||0)>0&&!['weapon','armor','offhand'].some(slot=>c.equipment?.[slot]===id));
 const sellReason=blocked?'Resolve the current combat or event first.':!sellable.length?'Carry an eligible animal material to trade it.':'';
 const target=eligible.find(id=>IR_ENEMIES?.[id])||'wolf';
 const huntReason=blocked?'Resolve the current combat or event first.':state.hunt?'You already have an active trail.':c.energy<10?'Need 10 energy to begin tracking.':c.hunger<8?'Eat something before tracking.':'';
 return `<div class="ir0724-subsection"><strong>Hunting services</strong><p>Commission usable animal materials or trade eligible trophies; all items use the existing inventory.</p><div class="ir072-action-grid">${buy}${ir072Card('Exchange hunting supplies',sellable.length?`Trade one ${ITEMS[sellable[0]]?.name||sellable[0]} for coins; the offer is based on its existing item value.`:'The hunter will buy eligible pelts, fangs, bones, silk, and slime gel.', 'ir0724-hunter-sell','Sell material',!sellReason,sellReason,{item:sellable[0]||''})}${ir072Card(`Track a ${IR_ENEMIES?.[target]?.name||target}`,`Ask ${n.name} to identify a specific trail, then continue through the normal prepare/pursue/abandon hunting sequence. Costs 10 energy and one day.`,'ir0724-track-target','Track target',!huntReason,huntReason,{enemy:target})}</div></div>`;
}
function ir0724HiddenMagicSite(){
 const w=state?.world,known=new Set([...(w?.known||[]),...(w?.visited||[])]),sites=ir071Sites();
 return sites.filter(x=>!known.has(x.id)&&/(shrine|ruin|vault|reliquary|arcane|magic|library|ancient|watchpost|sanctum)/i.test(`${x.name||''} ${x.desc||''} ${x.kind||''}`)).sort((a,b)=>(Number(a.risk)||0)-(Number(b.risk)||0))[0]||null;
}
function ir0724ScholarExtras(n){
 const c=state.character,w=state.world,s=site(),blocked=ir072Blocked(),dungeon=w?.dungeon,records=w?.journal?.discoveries||[],ancient=records.find(x=>/(rune|ruin|ancient|relic|sigil|shrine|arcane|magical)/i.test(`${x.title||''} ${x.detail||''}`)),magic=ir0724HiddenMagicSite();
 const ruinReason=blocked?'Resolve the current combat or event first.':!dungeon?.discovered?'No discovered ruin or dungeon has been recorded yet.':c.coin<8?'Research requires 8 coins for materials.':c.energy<8?'Need 8 energy for research.':'';
 const translateReason=blocked?'Resolve the current combat or event first.':!ancient?'No ancient or magical record is available to translate yet.':c.coin<5?'Translation requires 5 coins.':c.energy<8?'Need 8 energy for translation.':'';
 const magicReason=blocked?'Resolve the current combat or event first.':!magic?'No additional hidden magical landmark is recorded in this region.':(c.skills?.Lore?.level||1)<2?'Requires Lore level 2.':c.coin<12?'A location study requires 12 coins.':c.energy<8?'Need 8 energy for location research.':'';
 return `<div class="ir0724-subsection"><strong>Research services</strong><div class="ir072-action-grid">${ir072Card('Research discovered ruins',dungeon?.discovered?`Study ${dungeon.name||'the discovered ruin'} using existing world records. Costs 8 coins, 8 energy, and one day; grants Lore experience.`:'Research becomes available after you discover a dungeon or ruin.','ir0724-research-ruins','Research ruins',!ruinReason,ruinReason)}${ir072Card('Translate ancient records',ancient?`Work on “${ancient.title}” using the existing discovery record. Costs 5 coins, 8 energy, and one day.`:'Requires a recorded ancient, rune, relic, or magical discovery.','ir0724-translate-record','Translate records',!translateReason,translateReason)}${ir072Card('Identify a magical location',magic?`Study clues pointing toward ${magic.name}. Reveals its map marker. Costs 12 coins, 8 energy, and one day.`:'Requires Lore 2 and an undiscovered magical landmark.','ir0724-magic-location','Reveal location',!magicReason,magicReason)}</div></div>`;
}
function ir0724InnkeeperExtras(n){
 const c=state.character,s=site(),blocked=ir072Blocked(),room=!!(s?.services||[]).includes('inn'),cost=22,day=Number(c.daysLived)||0;
 const last=Number(c.ir0724LastInnUpgradeDay??-99),upReason=blocked?'Resolve the current combat or event first.':!room?'A paid lodging upgrade requires a permanent inn.':last===day?'You already purchased a room upgrade today.':c.coin<cost?`A comfort upgrade costs ${cost} coins.`:'';
 const travelers=(c.npcs||[]).filter(x=>x.id!==n.id&&!x.dead&&!x.ir0724Dead&&ir072IsPresent(x)&&/merchant|trader|courier|messenger|adventurer|hunter|ranger|mercenary|traveler|traveller/i.test(`${x.occupation||''} ${x.role||''}`));
 const travelerReason=blocked?'Resolve the current combat or event first.':!travelers.length?'No traveler is available to introduce at this location right now.':'';
 return `<div class="ir0724-subsection"><strong>Inn services</strong><div class="ir072-action-grid">${ir072Card('Upgrade to a comfort room','Pay 22 coins and spend one day. Restores energy to maximum and recovers 25 health and 12 mood—better health and comfort than the standard bed.','ir0724-inn-upgrade',`Upgrade · ${cost} ◈`,!upReason,upReason)}${ir072Card('Ask about local jobs','Open the existing work board to review available jobs and their real requirements.','ir0724-jobs','View jobs',!blocked,blocked?'Resolve the current combat or event first.':'')}${ir072Card('Meet a traveler',travelers.length?`The innkeeper can introduce you to ${travelers.slice(0,3).map(x=>x.name).join(', ')}.`:'The innkeeper has no available traveler to introduce right now.','ir0724-traveler','Meet traveler',!travelerReason,travelerReason,{'traveler-id':travelers[0]?.id||''})}</div><small class="ir0724-stock-note">Criminal intelligence leads are marked with 🗡️ on the World map until investigated.</small></div>`;
}
function ir0724CrimeCards(n){
 if(!ir072IsPresent(n)||n.dead||n.ir0724Dead)return '';
 const c=state.character,blocked=ir072Blocked(),r=ir06Relationship(n),stealReason=blocked?'Resolve the current combat or event first.':c.energy<5?'Need 5 energy to attempt theft.':c.hunger<8?'Eat something before attempting theft.':'',sparReason=blocked?'Resolve the current combat or event first.':c.energy<15?'Need 15 energy for a controlled spar.':'',attackReason=blocked?'Resolve the current combat or event first.':c.energy<5?'Need at least 5 energy to start a fight.':n.unique?'This person is a key figure; attacking them can have major consequences.':'Violent assault costs 5 energy, lowers reputation, and can permanently kill the NPC if you win.';
 return `<section class="ir072-section ir0724-crime-section"><div class="panel-heading"><div><h3>Conflict and crime</h3><p>These actions have lasting consequences. Theft lowers reputation even if unnoticed; an assault uses the existing turn-based combat system and can permanently kill the NPC.</p></div><span class="tag red">HIGH RISK</span></div><div class="ir072-action-grid">${ir072Card('Challenge to a non-lethal spar','A controlled fight with this NPC. Uses the existing sparring combat and awards practice rather than loot.','ir0724-spar','Challenge · 15 energy',!sparReason,sparReason)}${ir072Card('Steal from this NPC',`Attempt to steal from ${n.name}. Success depends on Agility and Survival; the attempt costs 5 energy and reduces reputation. A witnessed attempt can also damage trust.`,`ir0724-steal`,'Attempt theft',!stealReason,stealReason)}${ir072Card('Attack this NPC',`Start a real combat with ${n.name}. Winning permanently marks them deceased. Starting an assault reduces reputation; killing them costs more and may be witnessed.`,`ir0724-attack`,'Attack · dangerous',!attackReason,attackReason)}</div></section>`;
}
function ir0724CrimeSummary(n){
 const c=state.character,v=ir0724Data(),day=Number(c.daysLived)||0;
 n.ir0724Purse=Number.isFinite(Number(n.ir0724Purse))?Math.max(0,Number(n.ir0724Purse)):4+(ir06Hash(`${state.world?.seed||'world'}|purse|${n.id}`)%15);
 return n.ir0724Purse;
}
function ir0724RecordCrime(type,n,detail,penalty,{witnessed=false}={}){
 const c=state.character,v=ir0724Data(),s=site();c.reputation=clamp((Number(c.reputation)||0)-penalty,-100,100);
 const rec={id:`crime-${Date.now()}-${v.crimeLog.length}`,type,npcId:n?.id||'',npcName:n?.name||'Unknown person',siteId:s?.id||'',siteName:s?.name||'',day:Number(c.daysLived)||0,detail,witnessed:!!witnessed,reported:false};v.crimeLog.unshift(rec);v.crimeLog=v.crimeLog.slice(0,80);
 if(n){const r=ir06Relationship(n);r.trust=clamp((Number(r.trust)||0)-(witnessed?8:4),-100,100);r.affinity=clamp((Number(r.affinity)||0)-2,-100,100);n.ir0724LastCrimeDay=Number(c.daysLived)||0;ir06Remember(n,detail,'crime');ir0724PersistNPC(n)}
 if(witnessed)c.reputation=clamp(c.reputation-5,-100,100);
 addFeed('⚖️','Criminal act recorded',`${detail} Reputation ${witnessed?'fell further because the act was witnessed':'decreased'}; current reputation ${c.reputation}.`,'warning');persist();return rec;
}
function ir0724BuyStock(n,group,item,price){
 if(!ir072RequireNPC(n.id))return;const c=state.character,stock=ir0724Stock(n,group);
 if(!ITEMS[item]||!(Number(stock[item])>0)){toast('That item is not available from this NPC right now.');return}
 if(!ir04CanCarry(item,1)){toast('Your pack is at capacity.');return}if(c.coin<price){toast(`You need ${price} coins for ${ITEMS[item].name}.`);return}
 c.coin-=price;c.inventory[item]=(Number(c.inventory[item])||0)+1;c.itemCondition=c.itemCondition||{};if(c.itemCondition[item]===undefined&&IR_WEAPON_DATA[item])c.itemCondition[item]=100;stock[item]--;ir0724PersistNPC(n);addFeed('🪙',`Bought ${ITEMS[item].name}`,`You bought one ${ITEMS[item].name} from ${n.name} for ${price} coins. Their carried stock was updated.`,'trade');persist();render();toast(`${ITEMS[item].name} purchased.`);
}
function ir0724FarmWork(n){
 if(!ir072RequireNPC(n.id))return;const c=state.character,day=Number(c.daysLived)||0;
 if(Number(n.ir0724LastFarmDay??-1)===day){toast('You already helped this farmer today.');return}if(c.energy<10){toast('You need 10 energy to help on the farm.');return}if(c.hunger<8){toast('Eat something before farm work.');return}
 c.energy-=10;n.ir0724LastFarmDay=day;dayPass(1,'farm work');const pay=14+(c.skills?.Survival?.level>=3?3:0);c.coin+=pay;gainSkill('Survival',10);c.reputation=clamp((Number(c.reputation)||0)+1,-100,100);ir0724PersistNPC(n);ir06Relationship(n).trust=clamp((Number(ir06Relationship(n).trust)||0)+1,-100,100);
 ir06Remember(n,`You helped ${n.name} with farm work near ${site().name} and earned ${pay} coins.`,'work');addFeed('🌾','Farm work completed',`You earned ${pay} coins and gained Survival experience. Reputation increased slightly for honest work.`,'milestone');persist();modal=null;render();toast(`Farm work complete: +${pay} coins.`);
}
function ir0724FarmInfo(n){if(!ir072RequireNPC(n.id))return;const s=site(),o=String(s?irBiomeProfileForSite(s).name:'');const topics=/river|coast|marsh|swamp/i.test(o)?'wet-ground crops, fishing, reeds, and grazing on higher ground':/mountain|snow|cold/i.test(o)?'hardy roots, sheltered plots, and cold-resistant livestock':/forest|woodland/i.test(o)?'small crop fields, woodland forage, and grazing around the tree line':'grain, vegetables, seasonal soil care, and common livestock';ir072RememberAction(n,'Farming knowledge shared',`${n.name} explained local practices around ${s.name}, focusing on ${topics}.`,'local-information');}
function ir0724AcceptBounties(n){
 if(!ir072RequireNPC(n.id))return;const v=ir0724Data(),c=state.character,leads=['bandits','gangs'].map(t=>ir0723LeadStatus(t)).filter(Boolean);let count=0;
 for(const x of leads){if(v.bounties.some(b=>b.siteId===x.site.id&&b.status==='active'))continue;v.bounties.push({id:`bounty-${x.site.id}-${x.type}`,siteId:x.site.id,type:x.type,enemyId:x.lead.enemyId,acceptedDay:Number(c.daysLived)||0,reward:25,status:'active'});x.lead.bountyAccepted=true;count++;}
 v.bounties=v.bounties.slice(-30);if(!count){toast('There are no new criminal leads to turn into a bounty. Ask an innkeeper for new intelligence.');return}ir0724PersistNPC(n);addFeed('📜','Bounty accepted',`The guard recorded ${count} criminal bounty contract${count===1?'':'s'}. Each cleared target pays 25 coins and improves reputation.`,'milestone');persist();modal=null;setTab('World');toast(`${count} bounty contract${count===1?'':'s'} accepted.`);
}
function ir0724GuardReport(n){
 if(!ir072RequireNPC(n.id))return;const s=site(),v=ir0724Data(),lead=s?.changes?.criminalIntel,ev=state.world?.v05?.activeEvent;
 const localLead=!!lead&&(lead.status==='active'||lead.status==='confirmed'),localEvent=!!ev&&(ev.siteId===s?.id||/bandit|thief|gang|crime|disturb/i.test(`${ev.title||''} ${ev.detail||''}`));
 if(!localLead&&!localEvent){toast('There is no recorded local crime or disturbance to report.');return}if(lead?.reported){toast('This lead has already been reported.');return}
 if(localLead)lead.reported=true;if(localEvent)ev.reported=true;const caseId=`report-${s.id}-${Number(state.character.daysLived)||0}`;v.crimeLog.unshift({id:caseId,type:'reported-criminal-activity',siteId:s.id,siteName:s.name,day:Number(state.character.daysLived)||0,reported:true,source:'player'});v.crimeLog=v.crimeLog.slice(0,80);
 const c=state.character;c.coin+=5;c.reputation=clamp((Number(c.reputation)||0)+3,-100,100);const r=ir06Relationship(n);r.trust=clamp((Number(r.trust)||0)+2,-100,100);
 ir072RememberAction(n,'Crime report recorded',`You reported ${localLead?`${lead.type==='bandits'?'bandit':'gang'} activity near ${s.name}`:`the disturbance “${ev.title||'local incident'}”`} to ${n.name}. The guard recorded the report and paid a 5-coin informer’s reward.`,'crime-report');return;
}
function ir0724GuardAssist(n){
 if(!ir072RequireNPC(n.id))return;const c=state.character,v=ir0724Data(),day=Number(c.daysLived)||0;
 if(day-Number(n.ir0724LastAssistDay??-99)<3){toast('The guard needs time before arranging another escort.');return}if(c.coin<8){toast('You need 8 coins for the escort arrangements.');return}if(c.energy<5){toast('You need 5 energy to request assistance.');return}
 c.coin-=8;c.energy-=5;n.ir0724LastAssistDay=day;v.guardSupport={npcId:n.id,siteId:site()?.id,expiresDay:day+3,used:false};ir0724PersistNPC(n);ir072RememberAction(n,'Guard assistance arranged',`${n.name} arranged local support. Your next real combat within three days gains +2 defense.`,'guard-assistance');
}
function ir0724RouteWarnings(n){
 if(!ir072RequireNPC(n.id))return;const s=site(),routes=(s?.routes||[]).map(x=>ir071SiteById(x.to)).filter(Boolean).sort((a,b)=>(Number(b.risk)||0)-(Number(a.risk)||0));
 const text=routes.length?`The guard advises care on routes from ${s.name}: ${routes.map(x=>`${x.name} (${Number(x.risk)||0}% local risk)`).join('; ')}.`:`The guard has no connected route data for ${s.name}.`;
 ir072RememberAction(n,'Route warning recorded',text,'route-warning');
}
function ir0724HunterSell(n,item){
 if(!ir072RequireNPC(n.id))return;const c=state.character;
 if(ir072Occupation(n)!=='hunter'){toast('Only a hunter can buy hunting materials.');return}
 if(!item||!(Number(c.inventory?.[item])>0)){toast('You no longer carry that material.');return}
 if(!['wolf_pelt','wolf_fang','bone','spider_silk','slime_gel'].includes(item)){toast('The hunter only buys eligible animal materials.');return}
 if(['weapon','armor','offhand'].some(slot=>c.equipment?.[slot]===item)){toast('Unequip that item before selling it.');return}
 const value=Number(IR_V04_ITEM_DATA?.[item]?.value||ITEMS?.[item]?.sell||2),price=Math.max(1,Math.floor(value*.65));c.inventory[item]--;if(c.inventory[item]<=0)delete c.inventory[item];c.coin+=price;
 addFeed('🪙',`Hunting material sold`,`You sold one ${ITEMS[item]?.name||item} to ${n.name} for ${price} coins. The hunter will use it for local supplies.`,'trade');gainSkill('Trade',2);ir0724PersistNPC(n);ir06Remember(n,`You sold a ${ITEMS[item]?.name||item} to ${n.name} for ${price} coins.`,'trade');persist();render();toast(`Sold material for ${price} coins.`);
}
function ir0724TrackTarget(n,enemyId){
 if(!ir072RequireNPC(n.id))return;const c=state.character,s=site(),pool=(irBiomeEncounterIds(s)).filter(id=>['wolf','spider','boar','direwolf','slime','goblin'].includes(id));
 if(state.hunt){toast('You already have an active trail.');return}if(!pool.includes(enemyId)){toast('That creature is not known in this biome.');return}
 modal=null;irStartHunt();if(state.hunt){state.hunt.enemyId=enemyId;state.hunt.quality+=2;state.hunt.trackerNpcId=n.id;state.hunt.targeted=true;addFeed('🐾','Hunter tracked a target',`${n.name} identified a clear ${IR_ENEMIES[enemyId]?.name||enemyId} trail. Continue through the usual hunt choices.`,'discovery');ir06Remember(n,`${n.name} tracked a ${IR_ENEMIES[enemyId]?.name||enemyId} trail for you near ${s.name}.`,'hunting');persist();render();toast(`Tracked target: ${IR_ENEMIES[enemyId]?.name||enemyId}.`)}
}
function ir0724Research(n,kind){
 if(!ir072RequireNPC(n.id))return;const c=state.character,w=state.world,s=site();if(c.energy<8){toast('You need 8 energy for research.');return}
 if(kind==='ruins'){
  const d=w?.dungeon;if(!d?.discovered){toast('Discover a ruin or dungeon before commissioning research.');return}if(c.coin<8){toast('Research requires 8 coins.');return}c.coin-=8;c.energy-=8;dayPass(1,'ruin research');gainSkill('Lore',18);if(d.siteId)irAddKnownLocation(d.siteId);const text=`${n.name} helped research ${d.name||'the discovered ruin'}. Lore improved, and the existing dungeon record is now easier to follow.`;ir06Remember(n,text,'research');addFeed('📚','Ruin research complete',text,'discovery');persist();modal=null;render();toast('Research complete. Lore improved.');return;
 }
 if(kind==='translate'){
  const r=(w?.journal?.discoveries||[]).find(x=>/(rune|ruin|ancient|relic|sigil|shrine|arcane|magical)/i.test(`${x.title||''} ${x.detail||''}`));if(!r){toast('No ancient or magical record is available to translate.');return}if(c.coin<5){toast('Translation requires 5 coins.');return}c.coin-=5;c.energy-=8;dayPass(1,'translation');gainSkill('Lore',14);const target=ir0724HiddenMagicSite();if(target)irAddKnownLocation(target.id);const text=`${n.name} translated notes associated with “${r.title}”.${target?` The work revealed a possible magical landmark: ${target.name}.`:''}`;ir06Remember(n,text,'translation');addFeed('📜','Ancient record translated',text,'discovery');persist();modal=null;render();toast('Translation completed.');return;
 }
 if(kind==='magic'){
  const target=ir0724HiddenMagicSite();if(!target){toast('No additional hidden magical landmark is recorded in this region.');return}if((c.skills?.Lore?.level||1)<2){toast('You need Lore level 2 to interpret these clues.');return}if(c.coin<12){toast('Location research costs 12 coins.');return}c.coin-=12;c.energy-=8;dayPass(1,'magical location research');gainSkill('Lore',12);irAddKnownLocation(target.id);const text=`${n.name} connected the clues to ${target.name}, revealing it on your World map.`;ir06Remember(n,text,'research');addFeed('🗺️','Magical location identified',text,'discovery');persist();modal=null;render();toast(`${target.name} revealed on the map.`);return;
 }
}
function ir0724InnUpgrade(n){
 if(!ir072RequireNPC(n.id))return;const c=state.character,s=site(),day=Number(c.daysLived)||0,cost=22;
 if(!(s?.services||[]).includes('inn')){toast('A comfort-room upgrade requires a permanent inn.');return}if(Number(c.ir0724LastInnUpgradeDay??-99)===day){toast('You already bought a room upgrade today.');return}if(c.coin<cost){toast(`You need ${cost} coins for the comfort room.`);return}
 c.coin-=cost;c.ir0724LastInnUpgradeDay=day;dayPass(1,'comfort room');c.energy=clamp(Number(c.maxEnergy)||100,0,Number(c.maxEnergy)||100);c.health=clamp(c.health+25,1,c.maxHealth||100);c.mood=clamp(c.mood+12,0,100);ir0724PersistNPC(n);ir072RememberAction(n,'Comfort room booked',`You paid 22 coins for a comfort-room upgrade at ${s.name}. Energy was restored to maximum; health and mood recovered more than with a standard bed.`,'inn');
}
function ir0724IntroduceTraveler(n,id){
 if(!ir072RequireNPC(n.id))return;const traveler=ir072NPC(id);if(!traveler||traveler.id===n.id||!ir072IsPresent(traveler)){toast('That traveler is no longer available here.');return}const txt=`${n.name} introduced you to ${traveler.name}, a ${traveler.occupation||traveler.role||'traveler'} currently at ${site().name}.`;ir072RememberAction(n,'Traveler introduction',txt,'introduction');modal={kind:'ir072-interactions',npc:traveler.id};render();
}
function ir0724CrimeAction(n,action){
 if(!ir072RequireNPC(n.id))return;const c=state.character,day=Number(c.daysLived)||0;
 if(action==='steal'){
  if(c.energy<5){toast('You need 5 energy to attempt theft.');return}if(c.hunger<8){toast('Eat something before attempting theft.');return}c.energy-=5;
  const purse=ir0724CrimeSummary(n),chance=clamp(35+((Number(c.attrs?.Agility)||10)-10)*2.3+((Number(c.skills?.Survival?.level)||1)-1)*3,12,82),success=Math.random()*100<chance;
  if(success&&purse>0){const amount=Math.min(purse,rand(3,Math.min(10,Math.max(3,purse))));n.ir0724Purse=purse-amount;c.coin+=amount;ir0724PersistNPC(n);ir0724RecordCrime('theft',n,`You stole ${amount} coins from ${n.name} at ${site().name}.`,3,{witnessed:false});addFeed('🪙','Theft succeeded',`You took ${amount} coins. The act still reduced reputation; the victim may notice later.`,'warning');persist();modal=null;render();toast(`Stole ${amount} coins. Reputation decreased.`);return}
  const witnessed=Math.random()<.48||(state.character.npcs||[]).some(x=>x.id!==n.id&&ir072Occupation(x)==='guard'&&ir072IsPresent(x));ir0724RecordCrime('failed-theft',n,`You tried to steal from ${n.name}, but the attempt failed.`,5,{witnessed});persist();modal=null;render();toast(witnessed?'You were caught attempting theft. Reputation and trust fell.':'The attempt failed. Reputation fell.');return;
 }
 if(action==='spar'){
  if(c.energy<15){toast('You need 15 energy for a controlled spar.');return}modal=null;const ok=startCombat(null,{type:'spar',npcId:n.id,npcName:n.name});if(ok&&state.combat){state.combat.enemyName=n.name;state.combat.enemyIcon=n.icon||'♙';state.combat.enemyDesc=`A controlled, non-lethal spar with ${n.name}. No NPC death, loot, or bounty is involved.`;state.combat.source.npcId=n.id;state.combat.source.npcName=n.name;state.combat.source.playerHealthBefore=c.health;persist();render()}return;
 }
 if(action==='attack'){
  if(c.energy<5){toast('You need at least 5 energy to start a fight.');return}const id=`ir0724_npc_${String(n.id).replace(/[^a-z0-9_-]/gi,'_')}`;
  const force=14+Math.max(0,Number(n.tier==='unique'?7:0))+((n.traits||[]).includes('brave')?7:0),hp=32+force*2;
  IR_ENEMIES[id]={id,name:n.name,icon:n.icon||'♙',desc:`A person defending themselves against an attack by the player.`,hp,attack:Math.max(3,Math.round(force/5)),defense:Math.max(0,Math.floor(force/12)),xp:0,coins:[0,0],threatRank:1,threatLabel:'NPC assault',style:'balanced',loot:[]};
  const witnesses=(c.npcs||[]).some(x=>x.id!==n.id&&ir072Occupation(x)==='guard'&&ir072IsPresent(x));const crime=ir0724RecordCrime('assault',n,`You attacked ${n.name} at ${site().name}. The assault is now part of the local crime record.`,12,{witnessed:witnesses});
  if(witnesses)crime.witnessed=true;modal=null;const ok=startCombat(id,{type:'npc-assault',npcId:n.id,npcName:n.name,crimeId:crime.id});if(ok&&state.combat){state.combat.enemyName=n.name;state.combat.enemyIcon=n.icon||'♙';state.combat.enemyDesc=`${n.name} is fighting back. Victory will permanently remove this NPC from the living world and cause severe reputation loss.`;state.combat.source.npcId=n.id;state.combat.source.npcName=n.name;persist();render()}return;
 }
}
// Make paid criminal intelligence unmistakable on the actual procedural map as well as in the lead list.
const ir0724MapPanelBase=mapPanel;
mapPanel=function(){
 let html=ir0724MapPanelBase.apply(this,arguments);const active=['bandits','gangs'].map(t=>ir0723LeadStatus(t)).filter(Boolean);
 for(const item of active){const id=String(item.site.id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),name=esc(item.site.name),label=item.type==='bandits'?'Bandit activity':'Gang activity';
  const rx=new RegExp('(<button class="[^" ]*world-node[^\"]*"[^>]*data-site="'+id+'"[^>]*>)([\\s\\S]*?)(<\\/button>)');
  html=html.replace(rx,(all,tag,body,close)=>{tag=tag.replace(/class="([^"]*)"/,'class="$1 intel-target"').replace(/title="[^"]*"/,`title="🗡️ ${label}: ${name}"`).replace(/aria-label="[^"]*"/,`aria-label="Criminal lead: ${name}"`);body=body.replace(/<span class="node-icon">[\s\S]*?<\/span>/,`<span class="node-icon">🗡️</span>`).replace(/<span class="node-label">[\s\S]*?<\/span>/,`<span class="node-label">🗡️ ${name}</span>`);return tag+body+close;});
 }
 if(active.length)html=html.replace(/<div class="map-legend">/,`<div class="map-legend"><span>🗡️ Criminal intelligence target</span>`);return html;
};
// Add specific services without replacing the stable occupation handlers.
const ir0724GuardCardBase=ir072GuardCard;
ir072GuardCard=function(){return ir0724GuardCardBase.apply(this,arguments)+ir0724GuardExtras(ir072NPC(modal?.npc));};
const ir0724HunterCardsBase=ir072HunterCards;
ir072HunterCards=function(){return ir0724HunterCardsBase.apply(this,arguments)+ir0724HunterExtras(ir072NPC(modal?.npc));};
const ir0724ScholarCardsBase=ir072ScholarCards;
ir072ScholarCards=function(n){return ir0724ScholarCardsBase.apply(this,arguments)+ir0724ScholarExtras(n||ir072NPC(modal?.npc));};
const ir0724InnkeeperCardsBase=ir072InnkeeperCards;
ir072InnkeeperCards=function(){return ir0724InnkeeperCardsBase.apply(this,arguments)+ir0724InnkeeperExtras(ir072NPC(modal?.npc));};
const ir0724ModalBase=ir072InteractionModal;
ir072InteractionModal=function(){
 const n=ir072NPC(modal?.npc);let html=ir0724ModalBase.apply(this,arguments);if(!n)return html;
 const kind=ir072Occupation(n);
 if(n.dead||n.ir0724Dead)return `<div class="overlay"><section class="modal ir072-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><div class="eyebrow">RELATIONSHIP RECORD</div><h2>${esc(n.icon||'♙')} ${esc(n.name)}</h2><p>${esc(n.occupation||n.role||'Resident')} · Deceased</p></div><button class="close-btn" data-action="ir072-close" aria-label="Close">×</button></div><div class="notice warning">${esc(n.name)} was killed in a previous encounter and is permanently removed from normal NPC interactions. Their history and relationship record are retained.</div><div class="modal-actions"><button class="button primary" data-action="ir072-close">Close</button></div></section></div>`;
 if(kind==='farmer'){html=html.replace(ir072ResidentCards(),ir0724FarmerCards(n)).replace(/ · undefined · /g,' · Farmer · ').replace(/ ·  · /g,' · Farmer · ').replaceAll('undefined','Farmer').replace('<span class="tag gold">FARMER</span>','<span class="tag gold">FARMER</span>')}
 if(ir072IsPresent(n))html=html.replace('<div class="modal-actions">',ir0724CrimeCards(n)+'<div class="modal-actions">');
 html=html.replace('NPC INTERACTIONS · V0.7.2.4','NPC INTERACTIONS · V0.7.2.4');return html;
};
const ir0724ActionBase=ir072Action;
ir072Action=function(target){
 const a=target?.dataset?.action,id=target?.dataset?.npc||modal?.npc;
 if(['ir0724-buy-stock','ir0724-hunter-sell','ir0724-farm-work','ir0724-farm-info','ir0724-report-crime','ir0724-guard-assist','ir0724-bounties','ir0724-route-warning','ir0724-track-target','ir0724-research-ruins','ir0724-translate-record','ir0724-magic-location','ir0724-inn-upgrade','ir0724-jobs','ir0724-traveler','ir0724-steal','ir0724-spar','ir0724-attack','ir0724-confirm-attack','ir0724-confirm-attack-now','ir0724-cancel-attack'].includes(a)){
  if(a==='ir0724-buy-stock'){const n=ir072RequireNPC(id);if(n)ir0724BuyStock(n,target.dataset.stockGroup,target.dataset.item,Number(target.dataset.price)||0);return true}
  if(a==='ir0724-hunter-sell'){const n=ir072RequireNPC(id);if(n)ir0724HunterSell(n,target.dataset.item);return true}
  if(a==='ir0724-farm-work'){const n=ir072NPC(id);if(n)ir0724FarmWork(n);return true}
  if(a==='ir0724-farm-info'){const n=ir072NPC(id);if(n)ir0724FarmInfo(n);return true}
  if(a==='ir0724-report-crime'){const n=ir072NPC(id);if(n)ir0724GuardReport(n);return true}
  if(a==='ir0724-guard-assist'){const n=ir072NPC(id);if(n)ir0724GuardAssist(n);return true}
  if(a==='ir0724-bounties'){const n=ir072RequireNPC(id);if(n)ir0724AcceptBounties(n);return true}
  if(a==='ir0724-route-warning'){const n=ir072NPC(id);if(n)ir0724RouteWarnings(n);return true}
  if(a==='ir0724-track-target'){const n=ir072NPC(id);if(n)ir0724TrackTarget(n,target.dataset.enemy);return true}
  if(a==='ir0724-research-ruins'||a==='ir0724-translate-record'||a==='ir0724-magic-location'){const n=ir072NPC(id);if(n)ir0724Research(n,a==='ir0724-research-ruins'?'ruins':a==='ir0724-translate-record'?'translate':'magic');return true}
  if(a==='ir0724-inn-upgrade'){const n=ir072NPC(id);if(n)ir0724InnUpgrade(n);return true}
  if(a==='ir0724-jobs'){const n=ir072RequireNPC(id);if(n){modal={kind:'jobs'};render()}return true}
  if(a==='ir0724-traveler'){const n=ir072NPC(id);if(n)ir0724IntroduceTraveler(n,target.dataset.travelerId);return true}
  if(a==='ir0724-steal'||a==='ir0724-spar'){const n=ir072NPC(id);if(n)ir0724CrimeAction(n,a==='ir0724-steal'?'steal':'spar');return true}
  if(a==='ir0724-attack'){const n=ir072RequireNPC(id);if(n){modal={kind:'ir0724-confirm-attack',npc:n.id};render()}return true}
  if(a==='ir0724-cancel-attack'){modal={kind:'ir072-interactions',npc:id};render();return true}
  if(a==='ir0724-confirm-attack'){const n=ir072NPC(id);if(n){modal={kind:'ir0724-confirm-attack',npc:n.id};render()}return true}
  if(a==='ir0724-confirm-attack-now'){const n=ir072NPC(id);if(n){modal=null;ir0724CrimeAction(n,'attack')}return true}
 }
 return ir0724ActionBase.apply(this,arguments);
};
const ir0724RenderModalBase=renderModal;
renderModal=function(){
 if(modal?.kind==='ir0724-confirm-attack'){
  const n=ir072NPC(modal.npc);if(!n)return `<div class="overlay"><section class="modal"><h2>NPC unavailable</h2><button class="button" data-action="ir0724-cancel-attack">Close</button></section></div>`;
  const witness=(state.character.npcs||[]).some(x=>x.id!==n.id&&ir072Occupation(x)==='guard'&&ir072IsPresent(x));
  return `<div class="overlay" data-dismiss="modal"><section class="modal ir072-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><div class="eyebrow">CRIMINAL ACTION · PERMANENT CONSEQUENCES</div><h2>Attack ${esc(n.name)}?</h2><p>This starts a real combat using the existing battle system. If you win, ${esc(n.name)} will be permanently marked deceased and removed from normal NPC interactions.</p></div><button class="close-btn" data-action="ir0724-cancel-attack" aria-label="Cancel">×</button></div><div class="notice warning">Reputation will fall immediately${witness?' because a guard may witness the assault':''}. Killing this person causes a further reputation loss. Town facilities themselves remain independent of NPC lives.</div><div class="modal-actions"><button class="button" data-action="ir0724-cancel-attack" data-npc="${esc(n.id)}">Cancel</button><button class="button danger" data-action="ir0724-confirm-attack-now" data-npc="${esc(n.id)}">Proceed to combat</button></div></section></div>`;
 }
 return ir0724RenderModalBase.apply(this,arguments);
};
const ir0724PresentBase=ir06Present;
ir06Present=function(n,siteId,day){if(n?.dead||n?.ir0724Dead)return false;return ir0724PresentBase.apply(this,arguments)};
const ir0724DefenseBase=irCurrentDefense;
irCurrentDefense=function(){const base=ir0724DefenseBase.apply(this,arguments),b=state?.combat;return base+(b?.guardAssist?2:0)};
const ir0724StartCombatBase=startCombat;
startCombat=function(enemyId=null,source={type:'wild'}){
 const src=typeof source==='string'?{type:source}:(source||{type:'wild'}),v=ir0724Data(),support=v.guardSupport,c=state?.character;
 const eligible=support&&!support.used&&Number(support.expiresDay)>=Number(c?.daysLived||0)&&src.type!=='spar'&&src.type!=='npc-assault';
 const ok=ir0724StartCombatBase.apply(this,arguments);if(!ok||!state?.combat?.active)return ok;
 if(eligible){state.combat.guardAssist=true;support.used=true;addFeed('🛡️','Guard assistance arrived','The guard’s support gives you +2 defense for this combat.','milestone')}
 if(src.type==='spar'&&src.npcId){const n=ir072NPC(src.npcId);if(n){state.combat.enemyName=n.name;state.combat.enemyIcon=n.icon||'♙';state.combat.enemyDesc=`A controlled, non-lethal spar with ${n.name}.`;state.combat.source.npcId=n.id;state.combat.source.npcName=n.name;state.combat.source.playerHealthBefore=c?.health||1}}
 if(src.type==='npc-assault'&&src.npcId){const n=ir072NPC(src.npcId);if(n){state.combat.enemyName=n.name;state.combat.enemyIcon=n.icon||'♙';state.combat.enemyDesc=`${n.name} is defending themselves. Victory will permanently mark this NPC deceased.`}}
 if(src.type==='ambush'){const s=site(),lead=s?.changes?.criminalIntel;if(lead?.status==='confirmed'&&state.combat?.enemyId===lead.enemyId){const contract=v.bounties.find(x=>x.siteId===s.id&&x.status==='active');if(contract){state.combat.source.bountySiteId=s.id;state.combat.source.bountyType=contract.type;}}}
 persist();return ok;
};
const ir0724CombatEndBase=irCombatEnd;
irCombatEnd=function(kind,detail=''){
 const b=state?.combat,src=b?.source||{},c=state?.character;
 if(src.type==='npc-assault'&&kind==='victory'&&b&&c){
  const n=ir072NPC(src.npcId);if(n){n.dead=true;n.ir0724Dead=true;n.ir0724DeathDay=Number(c.daysLived)||0;n.ir0724LastKnownSiteId=site()?.id||'';const rel=c.relationships?.[n.id];if(rel){rel.previousStatus=rel.status;rel.status='Deceased'}const publicMurder=ir0724Data().crimeLog.some(x=>x.id===src.crimeId&&(x.witnessed||x.reported));const text=`You killed ${n.name} in combat at ${site()?.name||'an unknown location'}. They are permanently removed from normal interactions. ${publicMurder?'A witness knows what happened, so public reputation also suffers.':'No witness saw the killing; the harm is recorded in their personal memory, but public reputation does not change.'}`;ir06Remember(n,text,'death');ir0724PersistNPC(n);if(publicMurder)c.reputation=clamp((Number(c.reputation)||0)-25,-100,100);c.combatStats=c.combatStats||{wins:0,defeats:0,escapes:0,monstersDefeated:0,totalExperience:0};c.combatStats.wins=(c.combatStats.wins||0)+1;gainSkill('Combat',12);const v=ir0724Data();const rec=v.crimeLog.find(x=>x.id===src.crimeId);if(rec){rec.type='murder';rec.detail=text;rec.killed=true;rec.witnessed=!!rec.witnessed;rec.publicPenaltyApplied=publicMurder}addFeed('⚖️','NPC killed',`${text} Reputation is now ${c.reputation}.`,'warning');state.combat=null;persist();render();toast(`${n.name} has died. Reputation: ${c.reputation}.`);return;}
 }
 const sparNpc=src.type==='spar'&&src.npcId?ir072NPC(src.npcId):null,healthBefore=Number(src.playerHealthBefore)||0;
 const out=ir0724CombatEndBase.apply(this,arguments);
 if(kind==='victory'&&src.bountySiteId&&c){const v=ir0724Data(),contract=v.bounties.find(x=>x.siteId===src.bountySiteId&&x.status==='active'),s=ir071SiteById(src.bountySiteId);if(contract){contract.status='completed';contract.completedDay=Number(c.daysLived)||0;const reward=Number(contract.reward)||25;c.coin+=reward;c.reputation=clamp((Number(c.reputation)||0)+5,-100,100);if(s?.changes?.criminalIntel)s.changes.criminalIntel.status='cleared';addFeed('🏆','Bounty completed',`You cleared the ${contract.type==='bandits'?'bandit':'gang'} threat near ${s?.name||'the target site'} and earned ${reward} coins. Reputation improved.`,'milestone');persist();render();toast(`Bounty complete: +${reward} coins and reputation increased.`)}}
 if(sparNpc&&c){c.health=clamp(healthBefore||c.health,1,c.maxHealth||100);if(kind==='victory'){const r=ir06Relationship(sparNpc);r.affinity=clamp((Number(r.affinity)||0)+1,-100,100);r.trust=clamp((Number(r.trust)||0)+1,-100,100);ir06Remember(sparNpc,`You completed a controlled spar with ${sparNpc.name}. Respect and trust improved.`, 'sparring');addFeed('🥊','Sparring relationship improved',`Your controlled spar with ${sparNpc.name} improved mutual respect.`,'social')}persist();render()}
 return out;
};
// Mark a bounty-target encounter as known to the World panel; crime consequences feed the existing reputation-based settlement threat rules.
const ir0724Style=document.createElement('style');
ir0724Style.textContent=`.world-node.intel-target{border-color:#efc06b;background:#59361f;color:#ffe7ad;box-shadow:0 0 0 7px #e7a64930,0 0 22px #c98a3980}.world-node.intel-target .node-icon{font-size:20px}.world-node.intel-target .node-label{color:#ffe3a3;font-weight:900}.ir0724-subsection{margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2,rgba(255,255,255,.02))}.ir0724-subsection>strong{font-size:12px}.ir0724-subsection>p,.ir0724-stock-note{display:block;font-size:10px;line-height:1.6;color:var(--muted);margin:5px 0 10px}.ir0724-crime-section{border-color:rgba(203,94,80,.5)}.ir0724-crime-section .panel-heading{align-items:flex-start}.ir0724-crime-section .tag.red{border-color:rgba(203,94,80,.7);color:#f0a49a}@media(max-width:650px){.ir0724-subsection{padding:9px}.ir0724-crime-section .panel-heading{flex-direction:column}}`;
document.head.appendChild(ir0724Style);
// On save reload, dead NPCs stay in history but are never considered present again.
// ================= End Infinite Realms v0.7.2.5 patch =================
