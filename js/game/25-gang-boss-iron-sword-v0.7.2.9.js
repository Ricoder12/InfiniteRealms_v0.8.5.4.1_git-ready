'use strict';
// ================= Infinite Realms v0.7.2.9: guaranteed Gang Boss Iron Sword =================
// The previous reward check depended on a display-name/group-metadata combination that can
// vary across saved encounters. The generated boss has a stable enemy-ID prefix, so recognize it
// before the older combat-end wrappers clear state.combat, then grant a real, equippable item.
const ir0729CombatEndBase=irCombatEnd;
irCombatEnd=function(kind,detail=''){
 const b=state?.combat,src=b?.source?{...b.source}:{},c=state?.character;
 const rawName=String(b?.enemyName||'').trim().toLowerCase();
 const enemyId=String(b?.enemyId||'');
 const enemyDef=IR_ENEMIES?.[enemyId]||{};
 const sourceSiteId=src.criminalSiteId||site()?.id||'';
 const sourceSite=ir071SiteById(sourceSiteId)||site();
 const lead=sourceSite?.changes?.criminalIntel;
 const bossByStableId=enemyId.startsWith('ir0726_gang_boss_');
 const bossByName=rawName==='gang boss'||rawName.startsWith('gang boss ·')||String(enemyDef.name||'').toLowerCase()==='gang boss';
 const bossByFinalGroup=!!src.criminalEncounter&&
   (src.criminalType==='gangs'||lead?.type==='gangs')&&
   Number(src.groupIndex)>0&&Number(src.groupCount)>0&&Number(src.groupIndex)>=Number(src.groupCount);
 const isGangBoss=kind==='victory'&&!!b&&!!c&&(bossByStableId||bossByName||bossByFinalGroup);
 let awarded=false,claimKey='';
 let priorSwordCount=0;
 if(isGangBoss){
  const w=state.world||(state.world={});
  w.v0729BossSwordClaims=Array.isArray(w.v0729BossSwordClaims)?w.v0729BossSwordClaims:[];
  claimKey=[sourceSiteId,lead?.id||'',lead?.issuedDay??'',lead?.issuedByNpcId||'',enemyId,src.groupIndex??'',src.groupCount??'',Number(c.daysLived)||0].join('|');
  if(!w.v0729BossSwordClaims.includes(claimKey)){
   priorSwordCount=Number(c.inventory?.iron_sword)||0;
   c.inventory=c.inventory||{};
   c.inventory.iron_sword=priorSwordCount+1;
   c.itemCondition=c.itemCondition||{};
   if(c.itemCondition.iron_sword===undefined)c.itemCondition.iron_sword=100;
   c.itemQuality=c.itemQuality||{};
   if(!c.itemQuality.iron_sword)c.itemQuality.iron_sword='Standard';
   w.v0729BossSwordClaims.push(claimKey);
   w.v0729BossSwordClaims=w.v0729BossSwordClaims.slice(-150);
   // Mark the migration guard as handled too: otherwise reloading after this new-style
   // victory could mistake its now-cleared lead for a pre-patch missing reward.
   w.v0729BossSwordCompensationApplied=true;
   if(lead)lead.bossSwordClaimed=true;
   awarded=true;
  }
 }
 const callArgs=Array.from(arguments);
 if(awarded)callArgs[1]=[String(detail||'').trim(),'Guaranteed reward: Iron Sword added to your inventory.'].filter(Boolean).join(' ');
 const result=ir0729CombatEndBase.apply(this,callArgs);
 if(awarded&&state?.character){
  // Reassert the minimum expected quantity after older handlers persist/render the outcome.
  const live=state.character;
  live.inventory=live.inventory||{};
  live.inventory.iron_sword=Math.max(Number(live.inventory.iron_sword)||0,priorSwordCount+1);
  live.itemCondition=live.itemCondition||{};
  if(live.itemCondition.iron_sword===undefined)live.itemCondition.iron_sword=100;
  live.itemQuality=live.itemQuality||{};
  if(!live.itemQuality.iron_sword)live.itemQuality.iron_sword='Standard';
  addFeed('⚔️','Gang Boss reward: Iron Sword','You defeated the Gang Boss and received an Iron Sword. It is in your inventory and can be equipped.','milestone');
  persist();render();toast('Gang Boss defeated — Iron Sword added to your inventory.');
 }
 return result;
};

// One-time compensation for saves in which earlier versions recorded a cleared gang / boss reward
// but failed to leave a visible item in inventory. This runs after boot has restored the save.
function ir0729CompensateLegacyBossReward(){
 const c=state?.character,w=state?.world;
 if(!c||!w||w.v0729BossSwordCompensationApplied)return false;
 const oldClaims=Array.isArray(w.v0727BossLootClaims)&&w.v0727BossLootClaims.length>0;
 const sites=w.region?.sites||[];
 const clearedGang=sites.some(s=>{
  const l=s?.changes?.criminalIntel;
  return l?.type==='gangs'&&(l.status==='cleared'||l.rewardsClaimed===true||l.bossLootClaimed===true||l.bossSwordClaimed===true);
 });
 if(!oldClaims&&!clearedGang)return false;
 c.inventory=c.inventory||{};
 c.inventory.iron_sword=(Number(c.inventory.iron_sword)||0)+1;
 c.itemCondition=c.itemCondition||{};if(c.itemCondition.iron_sword===undefined)c.itemCondition.iron_sword=100;
 c.itemQuality=c.itemQuality||{};if(!c.itemQuality.iron_sword)c.itemQuality.iron_sword='Standard';
 w.v0729BossSwordCompensationApplied=true;
 addFeed('⚔️','Missing Gang Boss reward restored','A previous save showed that you had cleared a gang, but the promised item reward was missing. One Iron Sword has been added to your inventory.','milestone');
 persist();render();toast('Previously missing Gang Boss reward restored: Iron Sword.');
 return true;
}

const ir0729ModalBase=ir072InteractionModal;
ir072InteractionModal=function(){return ir0729ModalBase.apply(this,arguments).replaceAll('V0.7.2.8','V0.7.2.9').replaceAll('V0.7.2.7','V0.7.2.9').replaceAll('V0.7.2.6','V0.7.2.9')};
const ir0729TopbarBase=topbar;
topbar=function(){return ir0729TopbarBase.apply(this,arguments).replace(/VERSION 0\.[0-9]+(?:\.[0-9]+){1,2}/g,'VERSION 0.7.2.9')};
if(typeof document!=='undefined')document.title='Infinite Realms v0.7.2.9';
// ================= End Infinite Realms v0.7.2.9 patch =================
