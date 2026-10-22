'use strict';
// ================= v0.7.2 polish: facilities are location services, not NPC actions =================
// Keep the existing save schema and reuse the current market, crafting, repair, and training systems.
function ir072EnsureLocationServices(){
 try{ir072AddTownServices(state?.world)}catch(e){console.warn('Town services deferred safely',e)}
}

// Initialize town facilities whenever a service is queried, not only when People is opened.
ir04CanShop = function(category){
 ir072EnsureLocationServices();
 const services=site()?.services||[];
 if(category==='general')return services.includes('market');
 if(category==='smithy')return services.some(x=>['forge','workshop','smithy'].includes(x));
 if(category==='alchemist')return services.some(x=>['library','alchemy','alchemist','lab'].includes(x));
 if(category==='hunter')return services.some(x=>['hunter','guild','work-board','market'].includes(x));
 return false;
};
const ir072CanShopHereBeforeFacilityPolish = ir072CanShopHere;
ir072CanShopHere = function(){ir072EnsureLocationServices();return !!(site()?.services||[]).includes('market')&&ir04CanShop('general')};
const ir072HasForgeBeforeFacilityPolish = ir072HasForge;
ir072HasForge = function(){ir072EnsureLocationServices();return (site()?.services||[]).some(x=>['forge','workshop','smithy'].includes(x))};
const ir072CraftBeforeFacilityPolish = ir04Craft;
ir04Craft = function(id){ir072EnsureLocationServices();return ir072CraftBeforeFacilityPolish(id)};
const ir072RepairBeforeFacilityPolish = ir04Repair;
ir04Repair = function(slot){ir072EnsureLocationServices();return ir072RepairBeforeFacilityPolish(slot)};
const ir072EconomyPanelBeforeFacilityPolish = ir04EconomyPanel;
ir04EconomyPanel = function(){
 ir072EnsureLocationServices();
 const choices=['general','smithy','alchemist','hunter'];
 if(!ir04CanShop(state?.world?.shopCategory||'general'))state.world.shopCategory=choices.find(x=>ir04CanShop(x))||'general';
 return ir072EconomyPanelBeforeFacilityPolish();
};

// Ordinary inventory selling requires a local market. Roadside trade has its own explicit
// carried-stock actions in the merchant's Interact panel and remains available off-market.
const ir072MarketSellBeforeFacilityPolish = ir051MarketSell;
ir051MarketSell = function(id,qty=1){
 ir072EnsureLocationServices();
 if(!ir072CanShopHere()){toast('There is no permanent market here. Sell directly to a Road Merchant through People → Interact instead.');return}
 return ir072MarketSellBeforeFacilityPolish(id,qty);
};
const ir072SellJunkBeforeFacilityPolish = ir051SellAllJunk;
ir051SellAllJunk = function(){
 ir072EnsureLocationServices();
 if(!ir072CanShopHere()){toast('There is no permanent market here. A Road Merchant may buy eligible goods through People → Interact.');return}
 return ir072SellJunkBeforeFacilityPolish();
};

function ir072FacilityStatusPanel(){
 const s=site();if(!s)return '';
 ir072EnsureLocationServices();
 const services=new Set(s.services||[]),market=services.has('market'),forge=['forge','workshop','smithy'].some(x=>services.has(x)),alchemy=['alchemy','alchemist','lab','library'].some(x=>services.has(x));
 const status=(ok,yes,no)=>`<span class="ir072-facility-status ${ok?'is-ready':'is-limited'}">${ok?yes:no}</span>`;
 return `<section class="panel panel-pad ir072-facility-panel"><div class="panel-heading"><div><div class="eyebrow">LOCATION SERVICES</div><h3>Facilities at ${esc(s.name||'this location')}</h3><p>Facilities belong to the location, not to an NPC. A merchant or blacksmith does not need to be standing beside you for a permanent service to work.</p></div><span class="tag">${esc(s.type==='settlement'?'SETTLEMENT':'FIELD LOCATION')}</span></div><div class="ir072-facility-grid"><article><div class="ir072-facility-title"><span>🛒</span><strong>Regional market</strong></div>${status(market,'Available here','No permanent market')}<p>${market?'Buy supplies, trade materials, and use local stock and prices in the market panel below.':'Regular market buying and selling are unavailable here. Road merchants can still trade from their own carried stock.'}</p></article><article><div class="ir072-facility-title"><span>⚒️</span><strong>Crafting & repairs</strong></div>${status(forge,'Forge / workshop available','No forge / workshop')}<p>${forge?'Forge recipes and equipment repairs work directly through Inventory, even if the blacksmith NPC is unavailable.':'Field recipes remain available. Forge recipes and equipment repairs require a location with a forge or workshop.'}</p></article><article><div class="ir072-facility-title"><span>⚗️</span><strong>Alchemy station</strong></div>${status(alchemy,'Alchemy facility available','No alchemy facility')}<p>${alchemy?'Alchemy recipes can use the available station, subject to recipe requirements.':'Alchemy recipes that require a lab are locked until you reach a suitable location.'}</p></article></div></section>`;
}

// Expose the facility/service distinction in Inventory and keep the actual panels below as
// the source of truth for stock, recipe requirements, costs, and action availability.
const ir072InventoryBeforeFacilityPolish = renderInventory;
renderInventory = function(){
 ir072EnsureLocationServices();
 let html=ir072InventoryBeforeFacilityPolish();
 const panel=ir072FacilityStatusPanel();
 const packMarker='<section class="panel panel-pad ir0661-pack-status';
 if(html.includes(packMarker))html=html.replace(packMarker,panel+packMarker);
 else if(html.includes('<div class="grid two">'))html=html.replace('<div class="grid two">',panel+'<div class="grid two">');
 const hasMarket=ir072CanShopHere();
 if(!hasMarket){
  html=html.replace(/<button\b([^>]*data-action="market-sell"[^>]*)>([\s\S]*?)<\/button>/g,(whole,attrs,label)=>`<button ${attrs.replace(/\sdisabled(?:="[^"]*")?/g,'')} disabled title="A permanent market is required for inventory sales.">${label}</button>`);
  html=html.replace(/<button\b([^>]*data-action="sell-junk"[^>]*)>([\s\S]*?)<\/button>/g,(whole,attrs,label)=>`<button ${attrs.replace(/\sdisabled(?:="[^"]*")?/g,'')} disabled title="A permanent market is required for inventory sales.">${label}</button>`);
 }
 return html;
};

// The World page reinforces that market/workbench are facilities; road merchants remain a
// separate mobile-trade option. Avoid relying on the presence/availability of an NPC.
const ir072WorldBeforeFacilityPolish = renderWorld;
renderWorld = function(){
 ir072EnsureLocationServices();
 let html=ir072WorldBeforeFacilityPolish();
 html=html.replace('Settlement economy','Location-based facilities')
  .replace('Market stock and demand are recorded per location.','Markets and crafting stations are location services, separate from NPC availability.')
  .replace('This location supports local trade. Open Inventory to buy supplies, sell materials, repair gear, and check demand.','The permanent market is accessed from Inventory and does not require the merchant NPC to be present. Forge recipes and equipment repairs likewise use this location’s forge/workshop service, not the blacksmith’s presence.')
  .replace('No market is available here. Use gathering, hunting, and exploration until you reach a settlement.','There is no permanent market here. Road merchants can still buy and sell eligible goods directly from their carried stock when present.')
  .replaceAll('Open market & crafting','Open Inventory services');
 return html;
};

// Merchants offer merchandise knowledge and negotiation; the market itself remains directly
// accessible from Inventory. Traveling merchants keep their distinct buy/sell carried-stock UI.
const ir072ShopCardBeforeFacilityPolish = ir072ShopCard;
ir072ShopCard = function(n){
 const caravan=ir072UsesCaravan(n);
 if(caravan)return ir072ShopCardBeforeFacilityPolish(n);
 const v=ir072Data(),s=site(),can=ir072CanShopHere(),blocked=ir072Blocked(),today=Number(state.character.daysLived)||0,coupon=v.activeBargain;
 const used=Number(v.bargainAttempts?.[n?.id]??-999)===today;
 const couponHere=!!coupon&&!coupon.caravanId&&coupon.siteId===s?.id;
 const activeConflict=!!coupon&&!couponHere;
 const success=Math.round(clamp(38+Math.max(0,(state.character.skills?.Trade?.level||1)-1)*4+((state.character.attrs?.Charisma||10)-10)*2+(ir06Trait(n||{},'generous')?5:0)-(ir06Trait(n||{},'cautious')?5:0),20,80));
 const reason=blocked?'Resolve the current combat or event first.':!can?'No permanent market service is available here.':used?'You already tried bargaining with this merchant today.':couponHere?'A negotiated offer is already waiting to be used.':activeConflict?'Use your existing negotiated offer before asking for another.':state.character.energy<4?'Need 4 energy to negotiate.':state.character.hunger<8?'Eat something before negotiating.':'';
 const bargain=`Try for 8% off one eligible single-item market purchase. Trade and Charisma affect an estimated ${success}% success chance. A failed attempt costs 4 energy but no coins.`;
 const access=can?'The market is a location service: open Inventory → Regional Market to buy or sell, whether or not this merchant is present. This NPC adds local merchandise knowledge and a personal bargaining offer.':'No permanent market is available here. A road merchant uses their carried stock instead.';
 const goods=`<div class="ir072-occupation-note"><strong>Merchandise knowledge · ${esc(s?.name||'Current location')}</strong><p>${esc(access)}</p>${ir072MarketStockHtml()}${couponHere?'<p class="ir072-inline-note">Your 8% discount is ready for one eligible single-item purchase at this market.</p>':''}</div>`;
 return `${goods}<div class="ir072-action-grid">${ir072Card('Bargain',bargain,'ir072-bargain','Negotiate · 4 energy',!reason,reason)}</div>`;
};

// Blacksmith NPC actions are deliberately not duplicate buttons for repair or crafting.
// Those remain on the Inventory page as location services. The blacksmith offers appraisal
// and expert Smithing instruction using the existing equipment and training mechanics.
function ir072BlacksmithCards(){
 const s=site(),c=state.character,forge=ir072HasForge(),blocked=ir072Blocked();
 const slots=[['weapon','Weapon'],['armor','Armor'],['offhand','Off-hand']];
 const equipped=slots.map(([slot,label])=>{const id=c.equipment?.[slot];if(!id)return '';const cond=Number(c.itemCondition?.[id]??100),quality=c.itemQuality?.[id]||'Standard';return `<div><strong>${esc(label)} · ${esc(ITEMS[id]?.name||id)}</strong><p>Condition ${cond}% · ${esc(quality)} quality${cond<70?' · Repair recommended':''}</p></div>`}).filter(Boolean).join('');
 const gearNote=equipped?`<div class="ir072-record-list">${equipped}</div>`:'<p class="ir072-inline-note">You have no equipped weapon, armor, or off-hand gear for the smith to assess.</p>';
 const appraisalReason=blocked?'Resolve the current combat or event first.':Number(ir072Data().smithAppraisalDays?.[modal?.npc]??-999)===Number(c.daysLived||0)?'This blacksmith has already appraised your equipment today.':'';
 const trainingEnergy=Math.max(7,(ir04HasTalent('human_quickstudy')?10:13)-(ir04HasTalent('human_adaptable')?2:0));
 let tutorReason=blocked?'Resolve the current combat or event first.':!forge?'A forge or workshop is required for Smithing instruction.':c.coin<8?'Instruction costs 8 coins.':c.energy<trainingEnergy?`Need ${trainingEnergy} energy for the session.`:'';
 return `<div class="ir072-occupation-note"><strong>Smith’s assessment</strong><p>The smith can inspect your equipped gear and offer focused instruction. Crafting and repairs themselves remain available through Inventory whenever this location has the required facility.</p>${gearNote}</div><div class="ir072-action-grid">${ir072Card('Appraise equipment','Get a free assessment of your equipped gear and repair priorities. One appraisal per blacksmith per game day.','ir072-appraise','Appraise gear',!appraisalReason,appraisalReason)}${ir072Card('Expert Smithing instruction',`Use the existing instructor-training system for a focused Smithing session. Costs 8 coins, ${trainingEnergy} energy, and one simulated day.`,`ir072-smith-tutor`,'Train Smithing',!tutorReason,tutorReason)}</div>`;
}

// Blacksmith-only interaction actions; all outcomes still use the current NPC memory, feed,
// Smithing training, coin, energy, time, and progression handlers.
const ir072ActionBeforeFacilityPolish = ir072Action;
ir072Action = function(target){
 const a=target?.dataset?.action,id=target?.dataset?.npc||modal?.npc;
 if(a==='ir072-appraise'){
  const n=ir072RequireNPC(id);if(!n)return true;
  if(ir072Occupation(n)!=='blacksmith'){toast('Only a blacksmith can appraise equipment.');return true}
  const v=ir072Data(),day=Number(state.character.daysLived)||0;v.smithAppraisalDays=v.smithAppraisalDays&&typeof v.smithAppraisalDays==='object'?v.smithAppraisalDays:{};
  if(Number(v.smithAppraisalDays[n.id]??-999)===day){toast('This blacksmith has already appraised your equipment today.');return true}
  v.smithAppraisalDays[n.id]=day;
  const c=state.character,slots=[['weapon','weapon'],['armor','armor'],['offhand','off-hand']];
  const gear=slots.map(([slot,label])=>{const item=c.equipment?.[slot];if(!item)return null;return `${ITEMS[item]?.name||item}: ${Number(c.itemCondition?.[item]??100)}% condition (${c.itemQuality?.[item]||'Standard'} quality)`}).filter(Boolean);
  const worn=slots.filter(([slot])=>{const item=c.equipment?.[slot];return item&&Number(c.itemCondition?.[item]??100)<70}).map(([slot])=>ITEMS[c.equipment[slot]]?.name||c.equipment[slot]);
  const text=gear.length?`${n.name} assessed your equipped gear: ${gear.join('; ')}. ${worn.length?`Repair recommended for ${worn.join(', ')}.`:'No equipped item is currently below the smith’s 70% repair-advice threshold.'}`:`${n.name} checked your loadout. You have no equipped weapon, armor, or off-hand item to assess.`;
  ir072RememberAction(n,'Smith appraised equipment',text,'equipment-appraisal');return true;
 }
 if(a==='ir072-smith-tutor'){
  const n=ir072RequireNPC(id);if(!n)return true;
  if(ir072Occupation(n)!=='blacksmith'){toast('Only a blacksmith provides this focused Smithing instruction.');return true}
  ir072EnsureLocationServices();
  if(!ir072HasForge()){toast('Smithing instruction requires a local forge or workshop.');return true}
  const c=state.character,energy=Math.max(7,(ir04HasTalent('human_quickstudy')?10:13)-(ir04HasTalent('human_adaptable')?2:0));
  if(c.coin<8){toast('Smithing instruction costs 8 coins.');return true}if(c.energy<energy){toast(`Need ${energy} energy for Smithing instruction.`);return true}
  const beforeDay=Number(c.daysLived)||0,beforeXP=Number(c.skills?.Smithing?.xp)||0,beforeLevel=Number(c.skills?.Smithing?.level)||1;
  modal=null;ir04TrainDiscipline('Smithing',true);
  const after=state?.character;
  if(after&&((Number(after.daysLived)||0)>beforeDay||(Number(after.skills?.Smithing?.xp)||0)!==beforeXP||(Number(after.skills?.Smithing?.level)||1)>beforeLevel)){
   const liveNpc=ir072NPC(id);if(liveNpc)ir06Remember(liveNpc,`I received expert Smithing instruction from ${liveNpc.name}. The standard instructor-training costs, energy, time, and progression applied.`,'smithing-instruction');
   addFeed('⚒️','Blacksmith instruction recorded',`${n.name} helped you practice Smithing using the existing instructor-training system.`,'skill');persist();render();
  }
  return true;
 }
 return ir072ActionBeforeFacilityPolish(target);
};

const ir072FacilityPolishCss=document.createElement('style');
ir072FacilityPolishCss.textContent=`.ir072-facility-panel{margin:0 0 14px}.ir072-facility-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:12px}.ir072-facility-grid article{min-width:0;border:1px solid var(--line);border-radius:10px;padding:11px;background:var(--surface-2,rgba(255,255,255,.025))}.ir072-facility-title{display:flex;align-items:center;gap:8px;margin-bottom:8px}.ir072-facility-title span{font-size:18px}.ir072-facility-title strong{font-size:12px}.ir072-facility-grid article p{font-size:10px;line-height:1.6;color:var(--muted);margin:8px 0 0}.ir072-facility-status{display:inline-block;border:1px solid var(--line);border-radius:20px;padding:4px 7px;font-size:9px;font-weight:700}.ir072-facility-status.is-ready{border-color:rgba(116,180,134,.42);color:#9bcba5}.ir072-facility-status.is-limited{color:var(--muted)}.ir072-facility-panel .panel-heading p{font-size:11px;line-height:1.6;color:var(--muted);margin:5px 0 0}.ir072-facility-panel .ir072-facility-grid article .ir072-facility-status+p{margin-top:8px}@media(max-width:760px){.ir072-facility-grid{grid-template-columns:1fr}.ir072-facility-grid article{padding:12px}}`;
document.head.appendChild(ir072FacilityPolishCss);
// ================= End v0.7.2 facility-first polish =================
