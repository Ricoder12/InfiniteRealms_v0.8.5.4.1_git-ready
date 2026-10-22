'use strict';
// ================= v0.7.2 follow-up: consolidated relationships, town services, and road trading =================
// Additive data only. Existing save schema remains unchanged.

// Every settlement receives a dependable general market and smithy service. The NPCs
// below are persistent location-specific business owners, not replacements for residents.
function ir072AddTownServices(world=state?.world){
 const sites=world?.region?.sites||[];
 for(const s of sites){
  if(!s||!ir071IsSettlement(s))continue;
  s.services=Array.isArray(s.services)?s.services:[];
  for(const service of ['market','forge'])if(!s.services.includes(service))s.services.push(service);
 }
}
// A mixed settlement resident pool avoids making every local NPC a smith/customer merely
// because the guaranteed town forge now exists. The dedicated merchant and blacksmith
// are created separately below, so these local residents stay socially varied.
const ir072PoolBeforeTownServices=ir06PoolFor;
ir06PoolFor=function(s){return s&&ir071IsSettlement(s)?IR072_TOWN_RESIDENT_POOL:ir072PoolBeforeTownServices(s)};
function ir072TownNpc(siteObj,kind){
 const c=state?.character,w=state?.world;if(!c||!w||!siteObj)return null;
 const v=w.v06||(w.v06={schema:2,changes:{},journal:[],socialQuests:[],registry:{}});
 v.registry=v.registry&&typeof v.registry==='object'?v.registry:{};
 v.changes=v.changes&&typeof v.changes==='object'?v.changes:{};
 const id=`ir06_town_${kind}_${ir06Hash(String(siteObj.id)).toString(36)}`;
 const hash=ir06Hash(`${w.seed||'world'}|${siteObj.id}|${kind}|town-service`);
 const existing=v.registry[id]||v.changes[id]||(c.npcs||[]).find(x=>x.id===id)||{};
 const first=IR06_NAMES[hash%IR06_NAMES.length]||'Mira';
 const last=IR06_SURNAMES[Math.floor(hash/97)%IR06_SURNAMES.length]||'Copper';
 const isSmith=kind==='blacksmith';
 const base={
  id,name:`${first} ${last}`,role:isSmith?'Blacksmith':'Merchant',occupation:isSmith?'Blacksmith':'Merchant',icon:isSmith?'🔨':'🪙',
  tier:'unique',homeSite:siteObj.id,workSite:siteObj.id,restSite:siteObj.id,socialSite:siteObj.id,
  ir071OriginSite:siteObj.id,ir071ScheduleVersion:1,ir071TravelRole:false,ir072TownService:kind,
  generatedKey:`ir072-town-${kind}-${siteObj.id}`,traits:[isSmith?'patient':'generous',isSmith?'ambitious':'cautious'],
  affinity:0,trust:0,memories:[],goal:isSmith?'Keep the town equipped and repairable':'Keep everyday goods moving through the town',lastSeenSiteId:siteObj.id
 };
 const n={...base,...existing,id,name:existing.name||base.name,role:base.role,occupation:base.occupation,icon:base.icon,
  tier:'unique',homeSite:siteObj.id,workSite:siteObj.id,restSite:siteObj.id,socialSite:siteObj.id,
  ir071OriginSite:siteObj.id,ir071ScheduleVersion:1,ir071TravelRole:false,ir072TownService:kind,
  traits:Array.isArray(existing.traits)&&existing.traits.length?existing.traits:base.traits,
  memories:Array.isArray(existing.memories)?existing.memories:[],lastSeenSiteId:existing.lastSeenSiteId||siteObj.id};
 v.registry[id]={...(v.registry[id]||{}),...n};
 v.changes[id]={...(v.changes[id]||{}),...v.registry[id]};
 c.relationships=c.relationships||{};
 if(!c.relationships[id])c.relationships[id]={affinity:Number(n.affinity)||0,trust:Number(n.trust)||0,status:n.status||'Acquaintance',milestones:Array.isArray(n.milestones)?n.milestones:[]};
 const all=new Map((c.npcs||[]).filter(x=>x?.id).map(x=>[x.id,x]));all.set(id,n);c.npcs=[...all.values()];
 try{ir071PersistSchedule(n)}catch(e){}
 return n;
}
const ir072EnsureNPCsBeforeTownServices=ir06EnsureNPCs;
ir06EnsureNPCs=function(){
 // Add services before the deterministic resident pool is selected, preventing town NPCs
 // from being reshuffled on the next visit/render when the new market/forge is added.
 ir072AddTownServices();
 const current=ir072EnsureNPCsBeforeTownServices()||[];
 const w=state?.world,s=site(),c=state?.character;
 if(!w||!s||!c||!ir071IsSettlement(s))return current;
 const services=[ir072TownNpc(s,'merchant'),ir072TownNpc(s,'blacksmith')].filter(Boolean);
 const byId=new Map((current||[]).filter(x=>x?.id).map(x=>[x.id,x]));
 for(const n of services)byId.set(n.id,n);
 return [...byId.values()];
};
// Town merchants and smiths are always on duty at their assigned business. Other NPCs
// continue using the original deterministic v0.7.1 schedule.
const ir072ScheduleBeforeTownServices=ir071Schedule;
ir071Schedule=function(npc,day,ctx={}){
 if(npc?.ir072TownService&&npc.workSite){
  const sites=Array.isArray(ctx.sites)?ctx.sites:(state?.world?.region?.sites||[]);
  const loc=sites.find(x=>x?.id===npc.workSite);
  if(loc)return {state:'working',siteId:loc.id,label:`Open for business at ${loc.name}`,until:Math.max(0,Math.floor(Number(day)||0))+1,reason:'Permanent town service'};
 }
 return ir072ScheduleBeforeTownServices(npc,day,ctx);
};

// The roadside merchant uses a small carried inventory independent of any settlement market.
function ir072IsRoadMerchant(n){return /road merchant|caravan trader|traveling merchant|travelling merchant|caravan merchant/i.test(`${n?.occupation||''} ${n?.role||''}`)||!!n?.ir072CaravanTrader}
function ir072UsesCaravan(n){return !!n&&(ir072IsRoadMerchant(n)||!ir072CanShopHere())}
function ir072CaravanMarket(n){
 const v=ir072Data(),id=n?.id;if(!id)return null;
 v.caravanMarkets=v.caravanMarkets&&typeof v.caravanMarkets==='object'?v.caravanMarkets:{};
 const day=Number(state?.character?.daysLived)||0;
 let cm=v.caravanMarkets[id];
 const all=[...new Set(Object.values(IR_V04_SHOPS||{}).flat())].filter(item=>IR_V04_ITEM_DATA?.[item]&&ITEMS?.[item]);
 if(!cm||typeof cm!=='object'){
  const ordered=all.slice().sort((a,b)=>ir06Hash(`${id}|stock|${a}`)-ir06Hash(`${id}|stock|${b}`));
  const chosen=[...new Set(['bread','bandage',...ordered])].filter(item=>all.includes(item)).slice(0,7);
  const stock={};for(const item of chosen)stock[item]=1+(ir06Hash(`${id}|qty|${item}`)%3);
  cm={npcId:id,stock,createdDay:day,lastRestockDay:day,transactions:0};v.caravanMarkets[id]=cm;
 }
 cm.stock=cm.stock&&typeof cm.stock==='object'?cm.stock:{};
 if(day-(Number(cm.lastRestockDay)||0)>=7){
  const periods=Math.min(4,Math.floor((day-(Number(cm.lastRestockDay)||0))/7));
  for(const item of Object.keys(cm.stock)){
   const cap=1+(ir06Hash(`${id}|qty|${item}`)%3);
   cm.stock[item]=Math.min(cap,Math.max(0,Number(cm.stock[item])||0)+periods);
  }
  cm.lastRestockDay=day;
 }
 return cm;
}
function ir072CaravanPrice(n,item,mode='buy'){
 const loc=site()?.id,base=Math.max(1,Number(ir04ItemPrice(item,mode,loc))||1);
 if(mode==='sell')return Math.max(1,Math.round(base*.92));
 let price=Math.max(1,Math.round(base*1.08));
 const offer=ir072Data().activeBargain;
 if(offer?.caravanId===n?.id&&offer?.siteId===loc)price=Math.max(1,Math.round(price*(1-(Number(offer.percent)||8)/100)));
 return price;
}
function ir072CaravanTradeHtml(n){
 const cm=ir072CaravanMarket(n),c=state.character,loc=site(),offer=ir072Data().activeBargain;
 if(!cm)return '<p class="ir072-inline-note">This trader has no recorded carried stock.</p>';
 const blocked=ir072Blocked();
 const buys=Object.entries(cm.stock).filter(([id,q])=>IR_V04_ITEM_DATA?.[id]&&ITEMS?.[id]&&Number(q)>0).slice(0,12);
 const buyHtml=buys.length?buys.map(([id,q])=>{
  const price=ir072CaravanPrice(n,id,'buy'),canCarry=ir04CanCarry(id,1),reason=blocked?'Resolve the current combat or event first.':!canCarry?'Your pack is at capacity.':c.coin<price?`Need ${price} coins; you have ${c.coin}.`:'';
  return `<div class="ir072-caravan-row"><div class="ir072-caravan-item"><strong>${esc(ITEMS[id]?.icon||'📦')} ${esc(ITEMS[id]?.name||id)}</strong><small>Carried stock ${Number(q)||0}</small></div><b>${price} ◈</b><button class="button small" data-action="ir072-caravan-buy" data-npc="${esc(n.id)}" data-item="${esc(id)}" ${reason?'disabled title="'+esc(reason)+'"':''}>Buy</button>${reason?`<small class="ir072-caravan-reason">${esc(reason)}</small>`:''}</div>`;
 }).join(''):'<p class="ir072-inline-note">The carried stock is currently sold out. It restocks gradually as the merchant travels.</p>';
 const equipped=new Set([c.equipment?.weapon,c.equipment?.armor,c.equipment?.offhand].filter(Boolean));
 const sellable=Object.entries(c.inventory||{}).filter(([id,q])=>Number(q)>0&&IR_V04_ITEM_DATA?.[id]&&ITEMS?.[id]&&!equipped.has(id)).sort((a,b)=>String(ITEMS[a[0]]?.name||a[0]).localeCompare(String(ITEMS[b[0]]?.name||b[0]))).slice(0,12);
 const sellHtml=sellable.length?sellable.map(([id,q])=>{const price=ir072CaravanPrice(n,id,'sell'),full=Object.keys(cm.stock).includes(id),hasRoom=full||Object.keys(cm.stock).length<10,reason=blocked?'Resolve the current combat or event first.':!hasRoom?'The trader has no room for another type of good.':'';return `<div class="ir072-caravan-row"><div class="ir072-caravan-item"><strong>${esc(ITEMS[id]?.icon||'📦')} ${esc(ITEMS[id]?.name||id)}</strong><small>You carry ${Number(q)||0} · sells one unit</small></div><b>${price} ◈</b><button class="button small" data-action="ir072-caravan-sell" data-npc="${esc(n.id)}" data-item="${esc(id)}" ${reason?'disabled title="'+esc(reason)+'"':''}>Sell 1</button>${reason?`<small class="ir072-caravan-reason">${esc(reason)}</small>`:''}</div>`}).join(''):'<p class="ir072-inline-note">You have no unequipped items this trader currently accepts.</p>';
 return `<div class="ir072-occupation-note"><strong>Carried goods · ${esc(loc?.name||'Roadside')}</strong><p>This merchant trades directly from their own pack; no town market is required. Prices include a small roadside convenience margin, and the trader buys eligible goods you carry.</p>${offer?.caravanId===n.id&&offer.siteId===loc?.id?'<p class="ir072-inline-note">Your negotiated 8% discount is ready for one item from this trader.</p>':''}</div><div class="ir072-caravan-list"><h4>Buy from the trader</h4>${buyHtml}<h4>Sell to the trader</h4>${sellHtml}</div>`;
}
function ir072ShopCard(n){
 const v=ir072Data(),s=site(),can=ir072CanShopHere(),blocked=ir072Blocked(),today=Number(state.character.daysLived)||0,coupon=v.activeBargain;
 const caravan=ir072UsesCaravan(n),cm=caravan?ir072CaravanMarket(n):null,used=Number(v.bargainAttempts?.[n?.id]??-999)===today;
 const couponHere=caravan?(coupon?.caravanId===n?.id&&coupon?.siteId===s?.id):(!coupon?.caravanId&&coupon?.siteId===s?.id);
 const tradeReason=blocked?'Resolve the current combat or event first.':(!caravan&&!can)?'No usable market service exists at this location.':'';
 const success=Math.round(clamp(38+Math.max(0,(state.character.skills?.Trade?.level||1)-1)*4+((state.character.attrs?.Charisma||10)-10)*2+(ir06Trait(n||{},'generous')?5:0)-(ir06Trait(n||{},'cautious')?5:0),20,80));
 const activeConflict=!!coupon&&!couponHere;
 let bargainReason=tradeReason||(used?'You already tried bargaining with this NPC today.':couponHere?'You already have a negotiated discount waiting for one purchase here.':activeConflict?'Another negotiated offer is still waiting to be used.':state.character.energy<4?'Need 4 energy to negotiate.':state.character.hunger<8?'Eat something before negotiating.':'');
 const bargainDescription=`Try for 8% off one ${caravan?'item from this trader’s carried stock':'eligible market purchase'}. Trade and Charisma influence an estimated ${success}% success chance. A failed attempt costs 4 energy but no coins.`;
 const goods=caravan?ir072CaravanTradeHtml(n):`<div class="ir072-occupation-note"><strong>Merchandise information · ${esc(s?.name||'Current location')}</strong>${ir072MarketStockHtml()}${couponHere?'<p class="ir072-inline-note">A negotiated 8% discount is waiting for one purchase at this market.</p>':''}</div><div class="ir072-action-grid">${ir072Card('Trade','Open the existing market interface. Settlement stock, carrying capacity, and dynamic prices remain authoritative.','ir072-market','Browse market',can&&!blocked,tradeReason)}</div>`;
 return `${goods}<div class="ir072-action-grid">${ir072Card('Bargain',bargainDescription,'ir072-bargain','Negotiate · 4 energy',!bargainReason,bargainReason)}</div>`;
}
// Bargaining explicitly distinguishes town-market offers from roadside carried-stock offers.
ir072Bargain=function(id){
 const n=ir072RequireNPC(id);if(!n)return;const c=state.character,s=site(),v=ir072Data(),day=Number(c.daysLived)||0;
 if(ir072Occupation(n)!=='merchant'){toast('Only a merchant or trader can negotiate a market offer.');return}
 const caravan=ir072UsesCaravan(n);
 if(!caravan&&!ir072CanShopHere()){toast('There is no usable market service at this location.');return}
 if(Number(v.bargainAttempts?.[n.id]??-999)===day){toast('You already tried bargaining with this merchant today.');return}
 if(v.activeBargain){toast('Use the existing negotiated offer before asking for another.');return}
 if(c.energy<4){toast('You need at least 4 energy to negotiate.');return}if(c.hunger<8){toast('Eat something before negotiating.');return}
 const chance=clamp(38+Math.max(0,(c.skills?.Trade?.level||1)-1)*4+((c.attrs?.Charisma||10)-10)*2+(ir06Trait(n,'generous')?5:0)-(ir06Trait(n,'cautious')?5:0),20,80);
 v.bargainAttempts[n.id]=day;c.energy-=4;
 if(Math.random()*100<chance){v.activeBargain={npcId:n.id,npcName:n.name,siteId:s.id,caravanId:caravan?n.id:null,percent:8,createdDay:day};const text=caravan?`${n.name} agreed to an 8% discount on one item from their carried stock near ${s.name}.`:`${n.name} agreed to an 8% discount on one eligible purchase at ${s.name}.`;ir06Remember(n,text,'bargain');addFeed('🤝','Bargain accepted',text,'social');persist();modal=null;render();toast('Bargain accepted: 8% off one item.');}
 else{const text=`You tried to bargain with ${n.name} at ${s.name}, but they held to the listed prices. No coins were charged; you spent 4 energy.`;ir06Remember(n,text,'bargain');addFeed('🤝','Bargain declined',text,'social');persist();modal=null;render();toast('The merchant declined. No coins were charged; 4 energy was spent.');}
};
function ir072CaravanBuy(id,item){
 const n=ir072RequireNPC(id);if(!n)return;if(ir072Occupation(n)!=='merchant'||!ir072UsesCaravan(n)){toast('This merchant is not trading from a roadside stock.');return}
 const c=state.character,cm=ir072CaravanMarket(n);if(!IR_V04_ITEM_DATA?.[item]||!ITEMS?.[item]||!cm||Number(cm.stock?.[item])<1){toast('That item is no longer in the trader’s carried stock.');return}
 if(!ir04CanCarry(item,1)){toast('Your pack is at capacity. Sell, store, or use materials before buying more.');return}
 const price=ir072CaravanPrice(n,item,'buy');if(c.coin<price){toast(`You need ${price} coins for ${ITEMS[item]?.name||item}.`);return}
 c.coin-=price;c.inventory[item]=(Number(c.inventory[item])||0)+1;if(c.itemCondition[item]===undefined)c.itemCondition[item]=100;cm.stock[item]=Math.max(0,Number(cm.stock[item])-1);cm.transactions=(Number(cm.transactions)||0)+1;
 if(c.professionStats){c.professionStats.itemsBought=(Number(c.professionStats.itemsBought)||0)+1}
 const offer=ir072Data().activeBargain,used=offer?.caravanId===n.id&&offer?.siteId===site()?.id;if(used)ir072Data().activeBargain=null;
 ir04AwardXP(2,'trading');gainSkill('Trade',3);const text=`You bought ${ITEMS[item]?.name||item} from ${n.name} for ${price} coins while away from a permanent market.`;ir06Remember(n,text,'caravan-trade');addFeed('🛒','Roadside purchase',text,'trade');persist();render();toast(`${ITEMS[item]?.name||item} purchased for ${price} coins${used?' using your negotiated discount':''}.`);
}
function ir072CaravanSell(id,item){
 const n=ir072RequireNPC(id);if(!n)return;if(ir072Occupation(n)!=='merchant'||!ir072UsesCaravan(n)){toast('This merchant is not trading from a roadside stock.');return}
 const c=state.character,cm=ir072CaravanMarket(n),qty=Number(c.inventory?.[item])||0;
 if(!IR_V04_ITEM_DATA?.[item]||qty<1){toast('You no longer carry that eligible item.');return}
 if([c.equipment?.weapon,c.equipment?.armor,c.equipment?.offhand].includes(item)){toast('Unequip this item before selling it.');return}
 if(!cm){toast('This trader’s inventory is unavailable.');return}
 if(!Object.prototype.hasOwnProperty.call(cm.stock,item)&&Object.keys(cm.stock).length>=10){toast('The trader has no room for another type of good.');return}
 const price=ir072CaravanPrice(n,item,'sell');c.inventory[item]--;if(c.inventory[item]<=0)delete c.inventory[item];c.coin+=price;cm.stock[item]=Math.min(8,(Number(cm.stock[item])||0)+1);cm.transactions=(Number(cm.transactions)||0)+1;
 if(c.professionStats){c.professionStats.itemsSold=(Number(c.professionStats.itemsSold)||0)+1;c.professionStats.coinsEarned=(Number(c.professionStats.coinsEarned)||0)+price}
 ir04AwardXP(2,'trading');gainSkill('Trade',4);const text=`You sold one ${ITEMS[item]?.name||item} to ${n.name} for ${price} coins; the item was added to the trader’s carried goods.`;ir06Remember(n,text,'caravan-trade');addFeed('🛒','Roadside sale',text,'trade');persist();render();toast(`Sold ${ITEMS[item]?.name||item} for ${price} coins.`);
}
// Keep roadside discounts tied to the trader and do not let a town-market purchase consume one.
ir04ItemPrice=function(id,mode='buy',siteId=site()?.id){
 let price=ir072PriceBase(id,mode,siteId);const v=state?.world?.v072,coupon=v?.activeBargain,currentId=siteId||site()?.id;
 if(mode==='buy'&&coupon&&!coupon.caravanId&&coupon.siteId===currentId&&currentId===site()?.id)price=Math.max(1,Math.round(price*(1-(Number(coupon.percent)||8)/100)));
 return price;
};
const ir072MarketBuyBeforeCaravanCoupon=ir072MarketBuyBase;
ir051MarketBuy=function(id,qty=1){
 const v=state?.world?.v072,coupon=v?.activeBargain,loc=site()?.id,requested=Math.max(1,Math.floor(Number(qty)||1));
 // A coupon from a travelling merchant is not valid at a separate settlement market.
 if(coupon?.caravanId)return ir072MarketBuyBeforeCaravanCoupon(id,requested);
 if(coupon&&coupon.siteId===loc&&requested>1){toast('The negotiated offer covers one item. Set market quantity to 1 to use the discount.');return}
 const c=state?.character,beforeCoins=Number(c?.coin)||0,beforeQty=Number(c?.inventory?.[id])||0,m=state?.character&&ir04MarketState(loc),beforeStock=Number(m?.stock?.[id])||0;
 ir072MarketBuyBeforeCaravanCoupon(id,requested);
 const live=state?.character,afterQty=Number(live?.inventory?.[id])||0,afterCoins=Number(live?.coin)||0,liveCoupon=state?.world?.v072?.activeBargain;
 if(coupon&&liveCoupon&&!liveCoupon.caravanId&&liveCoupon.siteId===loc&&afterQty>beforeQty&&afterCoins<beforeCoins&&Number(ir04MarketState(loc)?.stock?.[id]||0)<beforeStock){
  state.world.v072.activeBargain=null;const savedNpc=ir072NPC(coupon.npcId);if(savedNpc)ir06Remember(savedNpc,`The negotiated ${coupon.percent||8}% discount was used for ${ITEMS[id]?.name||id} at ${site()?.name||'the local market'}.`,'bargain-used');
  addFeed('🤝','Bargain discount used',`Your negotiated discount reduced this purchase by ${Number(coupon.percent)||8}%.`,'social');persist();render();toast(`Negotiated discount used: ${Number(coupon.percent)||8}% off.`);
 }
};

// All social and relationship actions now live inside the Interact panel. The People list
// retains only Interact, while the social-circle Travel shortcut remains outside.
ir072GeneralCards=function(n){
 const c=state.character,r=ir062Rel(n.id),day=Number(c.daysLived)||0,blocked=ir072Blocked(),relStatus=r.status||'Acquaintance';
 const talkDelta=day-Number(n.lastTalkDay??-2),gift=['charm','herb','bread','scrap'].find(k=>(c.inventory?.[k]||0)>0);
 const activeTask=(state.world?.v06?.socialQuests||[]).find(q=>q.npcId===n.id&&q.status==='active');
 const talkReason=blocked?'Resolve the current combat or event first.':talkDelta<2?`You spoke recently; wait ${2-talkDelta} simulated day(s).`:c.energy<5?'Need 5 energy to talk.':c.hunger<8?'Eat something before socializing.':'';
 const giftReason=blocked?'Resolve the current combat or event first.':!gift?'You need a gift item: charm, herb, bread, or scrap.':'';
 const favorReason=blocked?'Resolve the current combat or event first.':r.affinity<2||r.trust<1?'Requires at least 2 affinity and 1 trust.':c.energy<8?'Need 8 energy to ask for help.':'';
 const adviceReason=blocked?'Resolve the current combat or event first.':c.energy<2?'Need 2 energy to focus on their advice.':'';
 const spendReason=blocked?'Resolve the current combat or event first.':c.energy<7?'Need 7 energy to spend meaningful time together.':'';
 const trainReason=blocked?'Resolve the current combat or event first.':r.affinity<1||r.trust<1?'Requires at least 1 affinity and 1 trust.':c.energy<12?'Need 12 energy to train together.':'';
 const workReason=blocked?'Resolve the current combat or event first.':r.trust<1?'Build at least 1 trust before working together.':c.energy<10?'Need 10 energy to work together.':'';
 const mealReason=blocked?'Resolve the current combat or event first.':c.coin<3?'A shared meal costs 3 coins.':c.energy<4?'Need 4 energy for a shared meal.':'';
 const taskReason=blocked?'Resolve the current combat or event first.':r.trust<2?'Requires at least 2 trust.':activeTask?'You already have an active task for this person.':'';
 const reportReason=blocked?'Resolve the current combat or event first.':!activeTask?'There is no active personal task for this person.':activeTask.progress<activeTask.goal?`Task progress is ${activeTask.progress}/${activeTask.goal}. Work together more first.`:'';
 const card=(title,detail,action,label,reason='',data={})=>ir072Card(title,detail,action,label,!reason,reason,data);
 const cards=[];
 cards.push(card('Talk','Build affinity and trust through conversation; the existing cooldown, energy and time rules apply.','ir072-talk','Talk · 1 day',talkReason));
 cards.push(card('Give a gift',gift?`Give them ${ITEMS[gift]?.name||gift} from your inventory.`:'Give a charm, herb, bread, or scrap if you have one.','ir072-gift','Give gift',giftReason));
 cards.push(card('Ask a favor','Request practical help. Success depends on your existing affinity, trust, and their traits.','ir072-favor','Ask favor',favorReason));
 cards.push(card('Ask for advice','Get occupation-relevant advice and skill experience. Costs 2 energy.','ir072-advice','Ask advice',adviceReason));
 cards.push(card('Spend time together','Improve affinity and trust through a dedicated day together.','ir061-spend','Spend time · 7 energy',spendReason));
 cards.push(card('Train together',`Practice ${ir061SkillForNPC(n)} with this person; costs 12 energy and one day. The existing relationship and training rules apply.`,'ir061-train','Train · 1 day',trainReason));
 cards.push(card('Work together','Earn a small payment, practice a relevant skill, and build trust. Costs 10 energy and one day.','ir061-work','Work · 1 day',workReason));
 cards.push(card('Share a meal','Spend 3 coins and 4 energy to build affinity and trust over one day.','ir062-meal','Meal · 3 ◈',mealReason));
 cards.push(card('Ask for a personal task','Request a small personal quest. Requires trust; complete two work-together actions and report back for the reward.','ir062-task','Ask task',taskReason));
 cards.push(card('Report personal task',activeTask?`Current task: ${activeTask.progress}/${activeTask.goal}; completion reward ${activeTask.reward} coins.`:'Report a task only after one has been accepted.','ir062-report','Report back',reportReason));
 if(/trainer|apprentice/i.test(String(n.occupation||n.role||''))){const reason=blocked?'Resolve the current combat or event first.':r.trust<2?'This instructor needs at least 2 trust.':'';cards.push(card('Receive instruction','Open the existing study action associated with this person’s profession.','ir06-train','Receive instruction',reason));}
 if(/merchant|trader|recruiter/i.test(String(n.occupation||n.role||''))){cards.push(card('Ask about work','Ask this contact to open the existing job listings; this does not create a separate job system.','ir06-hire','View work',blocked?'Resolve the current combat or event first.':''));}
 const friendReason=blocked?'Resolve the current combat or event first.':relStatus==='Enemy'?'Make amends before trying to become friends.':r.affinity<5||r.trust<3?'Requires at least 5 affinity and 3 trust.':'';
 const companionReason=blocked?'Resolve the current combat or event first.':relStatus==='Enemy'?'Make amends before trying to become companions.':r.affinity<12||r.trust<10?'Requires at least 12 affinity and 10 trust.':'';
 const loverReason=blocked?'Resolve the current combat or event first.':relStatus==='Enemy'?'Make amends before pursuing a relationship.':r.affinity<20||r.trust<15?'Requires at least 20 affinity and 15 trust.':'';
 if(relStatus!=='Friend')cards.push(card('Become friends','Establish friendship when affinity and trust are high enough.','ir062-friend','Become friends',friendReason));
 if(relStatus!=='Companion')cards.push(card('Invite as companion','Establish a companion bond. Only one companion status can be active at a time.','ir062-companion','Invite companion',companionReason));
 if(relStatus!=='Lover')cards.push(card('Pursue romance','Establish this relationship status once the required trust and affinity are earned.','ir062-lover','Pursue romance',loverReason));
 if(relStatus!=='Enemy')cards.push(card('Declare an enemy','Mark a hostile relationship. This is a meaningful relationship-status change.','ir062-enemy','Declare enemy',blocked?'Resolve the current combat or event first.':''));
 const hostile=relStatus==='Enemy'||r.affinity<=-10||r.trust<=-5;
 cards.push(card('Make amends','Spend 6 energy to apologize and improve affinity and trust if hostility exists.','ir062-amends','Make amends',blocked?'Resolve the current combat or event first.':!hostile?'There is no serious hostility to repair.':c.energy<6?'Need 6 energy to make a sincere apology.':''));
 if(ir063CanMentor(n)&&relStatus!=='Mentor'){
  const mentorReason=blocked?'Resolve the current combat or event first.':relStatus==='Enemy'||relStatus==='Lover'?'This relationship status is not suitable for starting mentorship.':r.affinity<3||r.trust<5?'Requires at least 3 affinity and 5 trust.':'';
  cards.push(card('Ask for mentorship','Set this qualified NPC as your mentor using the existing mentorship requirements.','ir063-ask-mentor','Ask mentor',mentorReason));
 }
 if(relStatus==='Friend')cards.push(card('Go out together','A simple tavern outing costs 5 coins and 6 energy, and advances one day.','ir063-bar','Go out · 5 ◈',blocked?'Resolve the current combat or event first.':c.coin<5?'A night out costs 5 coins.':c.energy<6?'Need 6 energy for a night out.':''));
 if(relStatus==='Companion')cards.push(card('Share campfire stories','Spend 5 energy and a day sharing stories; the existing companion activity improves the bond.','ir063-campfire','Campfire · 5 energy',blocked?'Resolve the current combat or event first.':c.energy<5?'Need 5 energy to share campfire stories.':''));
 if(relStatus==='Lover')cards.push(card('Plan a special evening','Spend 7 energy and a day together to strengthen this established relationship.','ir063-romance','Evening · 7 energy',blocked?'Resolve the current combat or event first.':c.energy<7?'Need 7 energy for a special evening.':''));
 if(relStatus==='Mentor'){
  for(const stat of ir063MentorStats(n)){
   const pair={Strength:'Combat',Perception:'Survival',Intelligence:'Crafting',Wisdom:'Lore',Charisma:'Social'}[stat];
   const last=Number(r.lastMentorTrainingDay??-99),cooldown=(Number(c.daysLived)||0)-last<7;
   const reason=blocked?'Resolve the current combat or event first.':cooldown?'Your mentor recommends 7 simulated days between focused sessions.':c.energy<15?'Need 15 energy for focused training.':'';
   cards.push(card(`Mentor training · ${stat}`,`Increase ${stat} and gain ${pair} practice using the existing mentorship activity. One focused session per 7 simulated days.`, 'ir063-mentor',`Train ${stat} · 15 energy`,reason,{stat}));
  }
 }
 return cards.join('');
};
// Route menu actions through the existing handlers but close the Interact panel first.
const ir072ActionBeforeSocialMenu=ir072Action;
ir072Action=function(target){
 const a=target?.dataset?.action;
 if(a==='ir072-caravan-buy'){ir072CaravanBuy(target.dataset.npc,target.dataset.item);return true}
 if(a==='ir072-caravan-sell'){ir072CaravanSell(target.dataset.npc,target.dataset.item);return true}
 const social=new Set(['ir061-spend','ir061-advice','ir061-train','ir061-work','ir062-meal','ir062-task','ir062-report','ir062-friend','ir062-companion','ir062-lover','ir062-enemy','ir062-amends','ir063-ask-mentor','ir063-bar','ir063-campfire','ir063-romance','ir063-mentor','ir06-train','ir06-hire']);
 if(social.has(a)){modal=null;return false}
 return ir072ActionBeforeSocialMenu(target);
};
// The local People directory now offers a single compact action entry. Relationship
// dashboard cards continue to expose Interact and the critical Travel shortcut.
const ir072PeopleBeforeConsolidation=ir06PeopleScreen;
ir06PeopleScreen=function(){
 let html=ir072PeopleBeforeConsolidation();
 html=html.replace(/<div class="ir06-actions">([\s\S]*?)<\/div>/g,(whole,inside)=>{
  const match=inside.match(/data-npc="([^"]+)"/);if(!match)return whole;
  const id=match[1];return `<div class="ir06-actions"><button class="button small primary" data-action="ir072-open" data-npc="${esc(id)}">Interact</button></div>`;
 });
 return html;
};
const ir072TradeConsolidationCss=document.createElement('style');
ir072TradeConsolidationCss.textContent=`.ir072-caravan-list{margin-top:10px}.ir072-caravan-list h4{margin:12px 0 5px;font-size:12px}.ir072-caravan-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}.ir072-caravan-item{display:flex;min-width:0;flex-direction:column;gap:3px}.ir072-caravan-item strong{font-size:11px}.ir072-caravan-item small,.ir072-caravan-reason{font-size:10px;color:var(--muted);line-height:1.45}.ir072-caravan-reason{grid-column:1/-1}.ir072-caravan-row>b{white-space:nowrap;font-size:11px}.ir072-caravan-row>.button{min-width:54px}.ir072-modal .ir072-action-card button{max-width:155px}@media(max-width:650px){.ir072-caravan-row{grid-template-columns:minmax(0,1fr) auto}.ir072-caravan-row>.button{grid-column:2;grid-row:1}.ir072-caravan-row>b{grid-column:2;grid-row:2;text-align:right}.ir072-caravan-reason{grid-column:1/-1}}
`;
document.head.appendChild(ir072TradeConsolidationCss);
// ================= End v0.7.2 follow-up =================
