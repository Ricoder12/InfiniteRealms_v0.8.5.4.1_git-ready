'use strict';
// ================= Infinite Realms v0.7.2.6: visible reputation, reliable NPC assault, gang boss =================
// Legacy inventory item retained so older saves that already contain it remain compatible.
ITEMS.gang_insignia = ITEMS.gang_insignia || {name:'Gang Boss Insignia',icon:'🏴',desc:'A marked insignia taken from a defeated gang leader. Guards and collectors recognize it as proof of the victory.',use:'Sell',sell:14};

// Fix the original blocker: the v0.7.2.5 interaction modal still called the earlier card renderer,
// which treated the attack warning text as a disable reason. Use the corrected situation-aware renderer.
ir0724CrimeCards = ir0725CrimeCards;

// Reputation is always visible in the top bar, not only on the Character page.
const ir0726TopbarBase=topbar;
topbar=function(){
 let html=ir0726TopbarBase();
 html=html.replace(/VERSION 0\.[0-9]+(?:\.[0-9]+)?(?:\.\d+)?/g,`VERSION ${IR0726_VERSION}`)
          .replace(/PROGRESSION & BALANCE|NPC INTERACTIONS|REPUTATION & NPC COMBAT/g,'REPUTATION & NPC COMBAT');
 if(!state?.character)return html;
 const rep=Math.max(-100,Math.min(100,Math.trunc(Number(state.character.reputation)||0)));
 const label=rep<=-25?'Outlaw':rep<=-5?'Distrusted':rep>=25?'Renowned':rep>=5?'Respected':'Unknown';
 const tone=rep<=-5?'bad':rep>=5?'good':'neutral';
 const badge=`<span class="ir0726-reputation ${tone}" title="Public reputation ranges from -100 to +100"><span class="ir0726-rep-label">REP</span><strong>${rep>0?'+':''}${rep}</strong><span class="ir0726-rep-status">${label}</span></span>`;
 return html.replace('<div class="top-actions">',`<div class="top-actions">${badge}`);
};
const ir0726Css=document.createElement('style');
ir0726Css.textContent=`
.ir0726-reputation{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border:1px solid var(--line);border-radius:999px;padding:6px 9px;background:rgba(255,255,255,.035);font-size:10px;line-height:1.2;font-variant-numeric:tabular-nums}
.ir0726-reputation strong{font-size:12px;font-weight:900}
.ir0726-rep-label{font-size:9px;letter-spacing:.12em;font-weight:850;opacity:.8}
.ir0726-rep-status{font-size:9px;opacity:.9}
.ir0726-reputation.good{border-color:#3b694c;background:#1c3427;color:#b4e4bc}
.ir0726-reputation.bad{border-color:#774441;background:#382425;color:#f2aaa1}
.ir0726-reputation.neutral{border-color:#45585b;color:#c3d0cd}
@media(max-width:880px){.ir0726-rep-status{display:none}.ir0726-reputation{padding:6px 8px}}
@media(max-width:620px){.ir0726-reputation{gap:4px;padding:5px 6px}.ir0726-rep-label{display:none}}
`;
document.head.appendChild(ir0726Css);

// Make the assault transactional: only spend energy and record a crime after combat really starts.
const ir0726CrimeActionBase=ir0724CrimeAction;
ir0724CrimeAction=function(n,action){
 if(action==='attack')return ir0726AttackNPC(n);
 return ir0726CrimeActionBase.apply(this,arguments);
};

// Final gang member becomes a distinct, tougher gang boss. This also upgrades active older leads in-place.
function ir0726GangBossId(s){
 const key=String(s?.id||'site').replace(/[^a-z0-9_-]/gi,'_');
 const id=`ir0726_gang_boss_${key}`;
 IR_ENEMIES[id]={id,name:'Gang Boss',icon:'👑',desc:'The gang leader is tougher, better equipped, and guarding the group’s valuables.',hp:74,attack:14,defense:4,xp:62,coins:[18,30],threatRank:4,threatLabel:'Gang boss · severe',threatDesc:'A seasoned criminal leader with heavier attacks and better protection.',level:5,style:'boss',loot:[],bribe:0};
 return id;
}
const ir0726EnsureGangBase=ir0725EnsureCriminalGroup;
ir0725EnsureCriminalGroup=function(lead,s){
 const result=ir0726EnsureGangBase.apply(this,arguments);
 if(!lead||lead.type!=='gangs'||!Array.isArray(lead.groupEnemyIds)||!lead.groupEnemyIds.length)return result;
 const ids=lead.groupEnemyIds.slice(),bossId=ir0726GangBossId(s);
 ids[ids.length-1]=bossId;
 lead.groupEnemyIds=ids;lead.groupCount=ids.length;lead.bossEnemyId=bossId;
 return {ids,count:ids.length};
};
// Give the final enemy a clear boss identity in the live combat UI.
const ir0726StartCombatBase=startCombat;
startCombat=function(enemyId=null,source={type:'wild'}){
 const ok=ir0726StartCombatBase.apply(this,arguments);
 if(!ok||!state?.combat?.active)return ok;
 const b=state.combat,src=b.source||{},lead=site()?.changes?.criminalIntel;
 if(src.criminalEncounter&&src.criminalType==='gangs'&&Number(src.groupIndex)===Number(src.groupCount)){
  b.enemyName='Gang Boss';b.enemyIcon='👑';b.enemyDesc=`The gang boss leads the final stand at ${site()?.name||'the target location'}. This opponent has higher health and attack than ordinary gang members and carries valuable loot.`;
  // Make sure the source contains the final group's metadata, even for a lead loaded from an older save.
  src.criminalType='gangs';src.groupIndex=Number(src.groupCount);src.groupCount=Number(src.groupCount)||lead?.groupCount||1;
  persist();render();
 }
 return ok;
};

// Boss loot is handled by the v0.7.2.7 wrapper below, after the core combat resolution.
const ir0726CombatEndBase=irCombatEnd;
irCombatEnd=function(kind,detail=''){return ir0726CombatEndBase.apply(this,arguments)};

const ir0726ModalBase=ir072InteractionModal;
ir072InteractionModal=function(){return ir0726ModalBase.apply(this,arguments).replaceAll('V0.7.2.4','V0.7.2.6').replaceAll('V0.7.2.5','V0.7.2.6')};
if(typeof document!=='undefined')document.title='Infinite Realms v0.7.2.6';
// ================= End Infinite Realms v0.7.2.6 patch =================
