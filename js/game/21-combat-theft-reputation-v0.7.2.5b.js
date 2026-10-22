'use strict';
// ================= Infinite Realms v0.7.2.5: combat, theft, reputation, and criminal groups =================
// Additive patch: reuse the existing turn-based combat, item inventory, market stock, and reputation systems.

function ir0725Possessions(n){
 if(!n||!n.id)return {stock:{}};
 if(!n.ir0725Possessions||typeof n.ir0725Possessions!=='object'){
  const role=ir072Occupation(n);
  let stock={bread:1,herb:1};
  if(role==='blacksmith')stock={ore:2,scrap:2,dagger:1};
  else if(role==='innkeeper')stock={bread:3,bandage:1,herb:1};
  else if(role==='scholar')stock={journal:1,charm:1,herb:1};
  else if(role==='resident')stock={bread:1,herb:1,charm:1};
  n.ir0725Possessions={stock:Object.fromEntries(Object.entries(stock).filter(([id,q])=>ITEMS?.[id]&&Number(q)>0))};
  ir0724PersistNPC(n);
 }
 n.ir0725Possessions.stock=n.ir0725Possessions.stock&&typeof n.ir0725Possessions.stock==='object'?n.ir0725Possessions.stock:{};
 return n.ir0725Possessions;
}
function ir0725CanCarryItem(id){try{return !!ITEMS?.[id]&&ir04CanCarry(id,1)}catch(e){return !!ITEMS?.[id]}}
function ir0725StockTargets(stock,source,extra={}){
 if(!stock||typeof stock!=='object')return [];
 return Object.entries(stock).filter(([id,q])=>Number(q)>0&&ir0725CanCarryItem(id)).map(([item])=>({item,source,...extra}));
}
function ir0725TheftTargets(n){
 if(!n||n.dead||n.ir0724Dead)return [];
 const role=ir072Occupation(n),s=site();let out=[];
 if(role==='merchant'){
  if(ir072UsesCaravan(n)){
   const cm=ir072CaravanMarket(n);out=ir0725StockTargets(cm?.stock,'caravan',{ownerId:n.id});
  }else if(ir072CanShopHere()){
   try{const m=ir04MarketState(s?.id);out=ir0725StockTargets(m?.stock,'market',{siteId:s?.id})}catch(e){out=[]}
  }
 }else if(role==='guard'){
  if(!n.ir0725GuardWeaponStolen){
   const weapon=n.ir0725GuardWeaponId||n.equipment?.weapon||n.weapon||(ITEMS?.iron_sword?'iron_sword':'dagger');
   if(ITEMS?.[weapon]&&ir0725CanCarryItem(weapon))out=[{item:weapon,source:'guard-weapon',ownerId:n.id}];
   if(!n.ir0725GuardWeaponId)n.ir0725GuardWeaponId=weapon;
  }
 }else if(role==='farmer'){
  out=ir0725StockTargets(ir0724Stock(n,'farmer'),'occupation-stock',{ownerId:n.id,group:'farmer'});
 }else if(role==='hunter'){
  out=ir0725StockTargets(ir0724Stock(n,'hunter'),'occupation-stock',{ownerId:n.id,group:'hunter'});
 }else{
  out=ir0725StockTargets(ir0725Possessions(n).stock,'npc-stock',{ownerId:n.id});
 }
 // Stable target ordering makes the offered theft predictable enough to understand and test.
 out.sort((a,b)=>ir06Hash(`${n.id}|theft|${a.item}`)-ir06Hash(`${n.id}|theft|${b.item}`)||a.item.localeCompare(b.item));
 return out;
}
function ir0725CrimeCards(n){
 if(!ir072IsPresent(n)||n.dead||n.ir0724Dead)return '';
 const c=state.character,day=Number(c.daysLived)||0,blocked=ir072Blocked(),targets=ir0725TheftTargets(n),lastTheft=Number(n.ir0725LastTheftDay??-99),lastSpar=Number(n.ir0725LastSparDay??-99);
 const theftPreview=targets.slice(0,3).map(x=>ITEMS?.[x.item]?.name||x.item).join(', ');
 const stealReason=blocked?'Resolve the current combat or event first.':lastTheft===day?'You already attempted theft from this NPC today.':c.energy<5?'Need 5 energy to attempt theft.':c.hunger<8?'Eat something before attempting theft.':!targets.length?'This NPC has no eligible item available to steal right now.':'';
 const sparReason=blocked?'Resolve the current combat or event first.':lastSpar===day?'You already sparred with this NPC today.':c.energy<15?'Need 15 energy for a controlled spar.':'';
 // Crucial fix: only actual blockers disable Attack; the warning itself is descriptive, not a failure reason.
 const attackReason=blocked?'Resolve the current combat or event first.':c.energy<5?'Need at least 5 energy to start a fight.':'';
 return `<section class="ir072-section ir0724-crime-section"><div class="panel-heading"><div><h3>Conflict and crime</h3><p>Sparring is non-lethal. Theft targets a real item from this person’s stock or belongings. An assault uses turn-based combat and can permanently kill the NPC.</p></div><span class="tag red">HIGH RISK</span></div><div class="ir072-action-grid">${ir072Card('Challenge to a non-lethal spar','Costs 15 energy and can improve reputation, affinity, and trust on victory. One spar with this NPC per day.','ir0724-spar','Challenge · 15 energy',!sparReason,sparReason)}${ir072Card('Steal an item',targets.length?`Attempt to take one actual item from ${n.name}. Possible targets: ${theftPreview}. Success depends on Agility, Stealth/Survival, and how alert the target is; costs 5 energy.`:`No eligible stock or possession is available to steal from ${n.name} right now.`,'ir0724-steal','Attempt theft',!stealReason,stealReason)}${ir072Card('Attack this NPC',`Start turn-based combat with ${n.name}. The assault lowers reputation immediately; winning kills the NPC permanently and causes a further reputation penalty.${n.unique?' This is a key figure, so consequences may be significant.':''}`,'ir0724-attack','Attack · dangerous',!attackReason,attackReason)}</div></section>`;
}

function ir0725Steal(n){
 if(!ir072RequireNPC(n.id))return;
 const c=state.character,day=Number(c.daysLived)||0;
 if(Number(n.ir0725LastTheftDay??-99)===day){toast('You already attempted theft from this NPC today.');return}
 if(c.energy<5){toast('You need 5 energy to attempt theft.');return}if(c.hunger<8){toast('Eat something before attempting theft.');return}
 const candidates=ir0725TheftTargets(n);if(!candidates.length){toast('There is no eligible item to steal from this NPC right now.');return}
 const target=candidates[Math.floor(Math.random()*candidates.length)];c.energy-=5;n.ir0725LastTheftDay=day;
 const role=ir072Occupation(n),stealth=Number(c.skills?.Stealth?.level)||1,survival=Number(c.skills?.Survival?.level)||1;
 const chance=clamp(38+((Number(c.attrs?.Agility)||10)-10)*2.1+(stealth-1)*3+(survival-1)*1.1-(ir06Trait(n,'suspicious')?12:0)-(role==='guard'?10:0)-(n.tier==='unique'?5:0),10,82);
 const success=Math.random()*100<chance;
 if(!success){const guardWitness=(c.npcs||[]).some(x=>x.id!==n.id&&ir072Occupation(x)==='guard'&&ir072IsPresent(x));const witnessed=guardWitness||Math.random()<(role==='merchant'?.45:role==='guard'?.65:.22);ir0724RecordCrime('failed-theft',n,`You tried to steal ${ITEMS?.[target.item]?.name||target.item} from ${n.name}, but the attempt failed.`,5,{witnessed});persist();modal=null;render();toast(witnessed?'You were caught trying to steal an item. Reputation and trust fell.':'The theft attempt failed. Reputation fell.');return}
 // Remove one unit from the correct owner/source before transferring it to the player.
 let removed=false;
 if(target.source==='market'){
  const m=ir04MarketState(site()?.id);if(Number(m?.stock?.[target.item])>0){m.stock[target.item]--;removed=true}
 }else if(target.source==='caravan'){
  const cm=ir072CaravanMarket(n);if(Number(cm?.stock?.[target.item])>0){cm.stock[target.item]--;cm.transactions=(Number(cm.transactions)||0)+1;removed=true}
 }else if(target.source==='occupation-stock'){
  const stock=ir0724Stock(n,target.group);if(Number(stock?.[target.item])>0){stock[target.item]--;removed=true}
 }else if(target.source==='npc-stock'){
  const stock=ir0725Possessions(n).stock;if(Number(stock?.[target.item])>0){stock[target.item]--;removed=true}
 }else if(target.source==='guard-weapon'){
  if(!n.ir0725GuardWeaponStolen){n.ir0725GuardWeaponStolen=true;if(n.equipment&&n.equipment.weapon===target.item)n.equipment.weapon=null;if(n.weapon===target.item)n.weapon=null;removed=true}
 }
 if(!removed){ir0724RecordCrime('failed-theft',n,`You tried to steal ${ITEMS?.[target.item]?.name||target.item} from ${n.name}, but the item was no longer available.`,5,{witnessed:false});persist();modal=null;render();toast('That item was no longer available; the attempt failed.');return}
 const item=target.item;c.inventory[item]=(Number(c.inventory[item])||0)+1;
 c.itemCondition=c.itemCondition||{};if(c.itemCondition[item]===undefined&&(IR_WEAPON_DATA?.[item]||IR_V04_ITEM_DATA?.[item]?.weaponDamage))c.itemCondition[item]=100;
 const witnessed=(c.npcs||[]).some(x=>x.id!==n.id&&ir072Occupation(x)==='guard'&&ir072IsPresent(x))||Math.random()<(role==='merchant'?.18:.1);
 const itemName=ITEMS?.[item]?.name||item,desc=`You stole ${itemName} from ${n.name}${target.source==='market'?' out of the local merchant’s market stock':target.source==='caravan'?' from the merchant’s carried stock':target.source==='guard-weapon'?' — the guard’s weapon':target.source==='occupation-stock'?` from the ${target.group}'s supplies`:' belongings'}.`;
 ir0724PersistNPC(n);ir0724RecordCrime('theft',n,desc,witnessed?7:3,{witnessed});addFeed('🗡️','Stolen item acquired',`${itemName} was added to your inventory. The owner’s stock was reduced${witnessed?'; someone noticed the theft':''}.`,'warning');persist();modal=null;render();toast(`Stole ${itemName}. Reputation decreased${witnessed?' further because it was noticed':''}.`);
}

function ir0725StartSpar(n){
 if(!ir072RequireNPC(n.id))return;
 const c=state.character,day=Number(c.daysLived)||0;
 if(Number(n.ir0725LastSparDay??-99)===day){toast('You already sparred with this NPC today.');return}
 if(c.energy<15){toast('You need 15 energy for a controlled spar.');return}
 const id=`ir0725_spar_${String(n.id).replace(/[^a-z0-9_-]/gi,'_')}`;
 const combatLevel=Number(c.skills?.Combat?.level)||1,tier=n.tier==='unique'?7:n.tier==='routine'?3:0;
 IR_ENEMIES[id]={id,name:n.name,icon:n.icon||'♙',desc:`A controlled, non-lethal spar with ${n.name}.`,hp:Math.max(26,28+combatLevel*4+tier),attack:Math.max(4,5+Math.floor(combatLevel*1.05)+Math.floor(tier/4)),defense:Math.max(0,Math.floor(combatLevel/3)+Math.floor(tier/5)),xp:18,coins:[0,0],threatRank:1,threatLabel:'Sparring partner',style:'balanced',loot:[],bribe:0};
 const beforeHealth=Number(c.health)||1,beforeInjuries=(c.injuries||[]).length;
 c.energy-=15;n.ir0725LastSparDay=day;ir0724PersistNPC(n);
 const ok=startCombat(id,{type:'spar',npcId:n.id,npcName:n.name,playerHealthBefore:beforeHealth,playerInjuriesBefore:beforeInjuries});
 if(!ok||!state.combat?.active){c.energy=clamp(c.energy+15,0,c.maxEnergy||100);persist();render();toast('The spar could not begin; your energy was refunded.');return}
 state.combat.enemyName=n.name;state.combat.enemyIcon=n.icon||'♙';state.combat.enemyDesc=`A controlled, non-lethal spar with ${n.name}. Victory improves reputation and your relationship. No NPC death, loot, or bounty is involved.`;state.combat.source.npcId=n.id;state.combat.source.npcName=n.name;state.combat.source.playerHealthBefore=beforeHealth;state.combat.source.playerInjuriesBefore=beforeInjuries;persist();render();toast(`Sparring with ${n.name} began.`);
}
function ir0725AttackNPC(n){
 if(!ir072RequireNPC(n.id))return;
 const c=state.character;if(c.energy<5){toast('You need at least 5 energy to start a fight.');return}
 const id=`ir0725_npc_${String(n.id).replace(/[^a-z0-9_-]/gi,'_')}`;
 const force=14+(n.tier==='unique'?7:n.tier==='routine'?3:0)+((n.traits||[]).includes('brave')?5:0),hp=32+force*2;
 IR_ENEMIES[id]={id,name:n.name,icon:n.icon||'♙',desc:`${n.name} is defending themselves after an assault.`,hp,attack:Math.max(3,Math.round(force/5)),defense:Math.max(0,Math.floor(force/12)),xp:0,coins:[0,0],threatRank:1,threatLabel:'NPC assault',style:'balanced',loot:[],bribe:0};
 c.energy-=5;const witnesses=(c.npcs||[]).some(x=>x.id!==n.id&&ir072Occupation(x)==='guard'&&ir072IsPresent(x));
 const crime=ir0724RecordCrime('assault',n,`You attacked ${n.name} at ${site().name}. The assault is now part of the local crime record.`,12,{witnessed:witnesses});if(witnesses)crime.witnessed=true;
 modal=null;const ok=startCombat(id,{type:'npc-assault',npcId:n.id,npcName:n.name,crimeId:crime.id});
 if(ok&&state.combat?.active){state.combat.enemyName=n.name;state.combat.enemyIcon=n.icon||'♙';state.combat.enemyDesc=`${n.name} is fighting back. Victory will permanently remove this NPC from the living world and cause severe reputation loss.`;state.combat.source.npcId=n.id;state.combat.source.npcName=n.name;persist();render()}
 else{toast('The assault could not start. The crime is recorded; resolve any pending choice before trying again.')}
}
const ir0725CrimeActionBase=ir0724CrimeAction;
ir0724CrimeAction=function(n,action){
 if(action==='steal')return ir0725Steal(n);
 if(action==='spar')return ir0725StartSpar(n);
 if(action==='attack')return ir0725AttackNPC(n);
 return ir0725CrimeActionBase.apply(this,arguments);
};

function ir0725EnsureCriminalGroup(lead,s){
 if(!lead)return {ids:[],count:0};
 if(lead.type==='bandits'){
  lead.groupEnemyIds=['bandit'];lead.groupCount=1;lead.groupDefeated=Math.max(0,Math.min(1,Number(lead.groupDefeated)||0));return {ids:lead.groupEnemyIds,count:1};
 }
 if(lead.type==='gangs'){
  if(!Array.isArray(lead.groupEnemyIds)||lead.groupEnemyIds.length<2){
   const count=2+(ir06Hash(`${state.world?.seed||'world'}|gang-size|${s?.id||lead.siteId}`)%2);
   const first=['thief','bandit'].includes(lead.enemyId)?lead.enemyId:'thief',other=first==='thief'?'bandit':'thief';
   lead.groupEnemyIds=Array.from({length:count},(_,i)=>i===0?first:(i%2===1?other:first));lead.groupCount=count;lead.groupDefeated=Math.max(0,Number(lead.groupDefeated)||0);
  }
  lead.groupCount=lead.groupEnemyIds.length;lead.groupDefeated=Math.max(0,Math.min(lead.groupCount,Number(lead.groupDefeated)||0));
  return {ids:lead.groupEnemyIds,count:lead.groupCount};
 }
 return {ids:[],count:0};
}
const ir0725StartCombatBase=startCombat;
startCombat=function(enemyId=null,source={type:'wild'}){
 const src=typeof source==='string'?{type:source}:{...(source||{type:'wild'})};
 const ok=ir0725StartCombatBase.call(this,enemyId,src);if(!ok||!state?.combat?.active)return ok;
 if(src.criminalIntel){
  const s=site(),lead=s?.changes?.criminalIntel;
  if(lead&&lead.status==='confirmed'&&['bandits','gangs'].includes(lead.type)&&(!src.criminalSiteId||src.criminalSiteId===s.id)){
   const group=ir0725EnsureCriminalGroup(lead,s),index=Math.max(1,Math.min(group.count,Number(src.groupIndex)||((Number(lead.groupDefeated)||0)+1)));
   const combatSource=state.combat.source||(state.combat.source={});Object.assign(combatSource,{criminalIntel:true,criminalEncounter:true,criminalType:lead.type,criminalSiteId:s.id,groupEnemyIds:group.ids.slice(),groupIndex:index,groupCount:group.count});
   const bounty=ir0724Data().bounties.find(x=>x.siteId===s.id&&x.status==='active');
   if(index<group.count)delete combatSource.bountySiteId;else if(bounty)combatSource.bountySiteId=s.id;
   if(lead.type==='gangs'){state.combat.enemyName=`Gang member ${index}/${group.count} · ${IR_ENEMIES[state.combat.enemyId]?.name||state.combat.enemyName}`;state.combat.enemyDesc=`Member ${index} of ${group.count} in the criminal gang near ${s.name}. Each member uses the normal combat system; the group reward is paid when the final member is defeated.`}
   persist();
  }
 }
 return ok;
};
const ir0725BattleStartWarningBase=irBattleStartFromWarning;
irBattleStartFromWarning=function(){
 const w=state?.warning,s=site(),lead=s?.changes?.criminalIntel;
 if(w&&lead?.status==='confirmed'&&['bandits','gangs'].includes(lead.type)&&w.siteId===s?.id){
  const group=ir0725EnsureCriminalGroup(lead,s),index=Math.max(1,Math.min(group.count,(Number(lead.groupDefeated)||0)+1)),enemyId=group.ids[index-1]||w.enemyId;
  state.warning=null;startCombat(enemyId,{type:'ambush',criminalIntel:true,criminalSiteId:s.id,groupIndex:index});return;
 }
 return ir0725BattleStartWarningBase.apply(this,arguments);
};
const ir0725CombatEndBase=irCombatEnd;
irCombatEnd=function(kind,detail=''){
 const b=state?.combat,src=b?.source?{...b.source}: {},c=state?.character;
 if(src.criminalEncounter&&kind==='victory'&&b&&c&&Number(src.groupIndex)<Number(src.groupCount)){
  const s=ir071SiteById(src.criminalSiteId)||site(),lead=s?.changes?.criminalIntel;
  if(lead){lead.groupDefeated=Math.max(Number(lead.groupDefeated)||0,Number(src.groupIndex)||1);lead.status='confirmed';}
  if(b.source)delete b.source.bountySiteId;delete src.bountySiteId;persist();
  ir0725CombatEndBase.apply(this,arguments);
  const nextIndex=(Number(src.groupIndex)||1)+1,groupIds=Array.isArray(src.groupEnemyIds)?src.groupEnemyIds:(lead?.groupEnemyIds||[]),nextId=groupIds[nextIndex-1]||'thief';
  const started=startCombat(nextId,{type:'ambush',criminalIntel:true,criminalSiteId:src.criminalSiteId,groupIndex:nextIndex});
  if(started&&state.combat?.active){state.combat.enemyName=`Gang member ${nextIndex}/${src.groupCount} · ${IR_ENEMIES[nextId]?.name||nextId}`;state.combat.enemyDesc=`Member ${nextIndex} of ${src.groupCount} in the criminal gang near ${s?.name||'the target location'}. Defeat the remaining members to claim the group reward and any accepted bounty.`;addFeed('⚔️','Gang encounter continues',`One criminal has been defeated. ${Number(src.groupCount)-nextIndex+1} gang member(s) remain.`,'warning');persist();render();toast(`Gang member defeated · ${Number(src.groupCount)-nextIndex+1} remain.`)}
  else{if(lead){lead.status='active';ir0724Data().activeLeads[lead.type]=lead}persist();render();toast('The next gang member could not engage yet. The lead remains active on the map.')}
  return;
 }
 const leadSite=src.criminalEncounter?(ir071SiteById(src.criminalSiteId)||site()):null,lead=leadSite?.changes?.criminalIntel;
 // If the player retreats or is defeated, preserve the same lead and defeated-member progress.
 const out=ir0725CombatEndBase.apply(this,arguments);
 if(src.criminalEncounter&&kind!=='victory'&&lead){lead.status='active';ir0724Data().activeLeads[lead.type]=lead;persist();render();toast('The criminal group remains active. Recover, then scout the dagger-marked location to resume the encounter.')}
 if(src.criminalEncounter&&kind==='victory'&&c){
  const s=leadSite||site(),criminal=lead||s?.changes?.criminalIntel;
  if(criminal&&!criminal.rewardsClaimed){
   criminal.rewardsClaimed=true;criminal.status='cleared';criminal.clearedDay=Number(c.daysLived)||0;
   const type=src.criminalType||criminal.type,reward=type==='gangs'?25:15,rep=type==='gangs'?4:3;c.coin+=reward;c.reputation=clamp((Number(c.reputation)||0)+rep,-100,100);
   const active=ir0724Data().activeLeads[type];if(active?.siteId===s?.id)ir0724Data().activeLeads[type]=null;
   addFeed('🏆',type==='gangs'?'Criminal gang defeated':'Bandits defeated',`You cleared ${type==='gangs'?'the criminal gang':'the bandit threat'} near ${s?.name||'the target location'} and received ${reward} coins. Reputation improved by ${rep}.${ir0724Data().bounties.some(x=>x.siteId===s?.id&&x.status==='completed')?' The guard’s bounty was also completed.':''}`,'milestone');persist();render();toast(`Threat cleared: +${reward} coins and +${rep} reputation.`);
  }
 }else if(kind==='victory'&&src.type==='ambush'&&b?.enemyId==='bandit'&&!src.criminalIntel){
  const s=site();s.changes=s.changes||{};const day=Number(c?.daysLived)||0;
  if(Number(s.changes.banditRewardDay??-1)!==day){s.changes.banditRewardDay=day;c.coin+=10;c.reputation=clamp((Number(c.reputation)||0)+2,-100,100);addFeed('🏆','Bandit threat cleared','You defeated a road bandit, recovered 10 additional coins, and earned 2 reputation for protecting the road.','milestone');persist();render();toast('Bandit defeated: +10 coins and +2 reputation.')}
 }
 const spar=src.type==='spar'&&src.npcId?ir072NPC(src.npcId):null;
 if(spar&&c){
  if(kind==='victory'){
   const day=Number(c.daysLived)||0;
   if(Number(spar.ir0725LastSparReputationDay??-99)!==day){spar.ir0725LastSparReputationDay=day;c.reputation=clamp((Number(c.reputation)||0)+2,-100,100);ir0724PersistNPC(spar);addFeed('🏅','Sparring reputation gained',`You won a controlled spar against ${spar.name}. Your public standing improved by 2 reputation.`,'milestone');persist();render();toast(`Spar won: +2 reputation (${c.reputation}).`)}
  }else{
   c.health=clamp(Number(src.playerHealthBefore)||c.health,1,c.maxHealth||100);
   if(Array.isArray(c.injuries)&&Number.isFinite(Number(src.playerInjuriesBefore)))c.injuries=c.injuries.slice(0,Number(src.playerInjuriesBefore));persist();render();
  }
 }
 return out;
};
const ir0725ModalBase=ir072InteractionModal;
ir072InteractionModal=function(){return ir0725ModalBase.apply(this,arguments).replaceAll('V0.7.2.4','V0.7.2.5')};
if(typeof document!=='undefined')document.title='Infinite Realms v0.7.2.5';
// ================= End Infinite Realms v0.7.2.5 patch =================
