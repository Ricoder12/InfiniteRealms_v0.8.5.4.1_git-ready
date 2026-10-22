'use strict';
// ================= Infinite Realms v0.7.3: reputation consequences and remembered relationships =================
function ir073Data(){
 const w=state?.world;if(!w)return {schema:1,events:[],refusals:{},giftCooldowns:{}};
 if(!w.v073||typeof w.v073!=='object')w.v073={schema:1,events:[],refusals:{},giftCooldowns:{}};
 const v=w.v073;v.schema=1;v.events=Array.isArray(v.events)?v.events:[];v.refusals=v.refusals&&typeof v.refusals==='object'?v.refusals:{};v.giftCooldowns=v.giftCooldowns&&typeof v.giftCooldowns==='object'?v.giftCooldowns:{};return v;
}
function ir073Rep(){return Math.max(-100,Math.min(100,Math.trunc(Number(state?.character?.reputation)||0)))}
function ir073RepTier(rep=ir073Rep()){
 if(rep<=-50)return 'Outlawed';if(rep<=-25)return 'Distrusted';if(rep<=-10)return 'Unwelcome';if(rep>=60)return 'Celebrated';if(rep>=25)return 'Respected';if(rep>=5)return 'Known';return 'Unknown';
}
function ir073ShouldRefuse(n){return !!(n&&ir073Rep()<=-10&&ir072Occupation(n)!=='guard'&&!n.dead&&!n.ir0724Dead)}
function ir073ChangeReputation(delta,reason,detail='',options={}){
 const c=state?.character;if(!c)return {before:0,after:0,delta:0};
 const before=ir073Rep(),after=Math.max(-100,Math.min(100,before+Math.trunc(Number(delta)||0)));c.reputation=after;
 const applied=after-before;if(applied){const v=ir073Data(),entry={day:Number(c.daysLived)||0,delta:applied,before,after,reason:String(reason||'conduct').slice(0,60),detail:String(detail||'').slice(0,240),public:true};v.events.unshift(entry);v.events=v.events.slice(0,80);v.lastObservedReputation=after;}
 return {before,after,delta:applied};
}
function ir073RecordRefusal(n){
 const c=state?.character;if(!n||!c)return;const v=ir073Data(),day=Number(c.daysLived)||0;
 if(Number(n.ir073LastRefusalDay??-999)===day)return;
 n.ir073LastRefusalDay=day;v.refusals[n.id]={day,rep:ir073Rep(),siteId:site()?.id||'',name:n.name};
}
function ir073LatestMeaningfulMemory(n){
 const entries=Array.isArray(n?.memories)?n.memories:[];
 return entries.find(m=>{const k=String(m?.kind||'').toLowerCase(),t=String(m?.text||'').toLowerCase();return /crime|death|theft|assault|promise|help|work|favor|gift|reconcil|spar|guard-assistance|bargain/.test(k+' '+t)})||entries[0]||null;
}
function ir073MemoryStanding(n){
 const m=ir073LatestMeaningfulMemory(n);if(!m)return 0;const k=String(m.kind||'').toLowerCase(),t=String(m.text||'').toLowerCase(),all=k+' '+t;
 if(/broken.?promise|promise.?broken|betray|crime|theft|assault|murder|killed|stole|threaten/.test(all))return -3;
 if(/reconcil|make amends|apolog|promise.?kept|kept.*promise|help|farm work|guard-assistance|favor|gift|sparring|bargain accepted|protected/.test(all))return 2;
 return 0;
}
function ir073ContextLine(n){
 const m=ir073LatestMeaningfulMemory(n),all=m?`${m.kind||''} ${m.text||''}`.toLowerCase():'';
 const r=ir06Relationship(n),rep=ir073Rep();
 if(/broken.?promise|promise.?broken|betray/.test(all))return `${n.name} remembers that a promise was broken and is cautious about trusting you again.`;
 if(/crime|theft|assault|murder|killed|stole/.test(all))return n.tier==='unique'?`${n.name} remembers the harm recorded in their personal history. As a key local figure, they will not treat the incident as a passing misunderstanding, even if the wider public never learned about it.`:`${n.name} remembers the harm recorded in their personal history. Their response reflects that incident, even if the wider public never learned about it.`;
 if(/reconcil|make amends|apolog/.test(all))return `${n.name} remembers your attempt to make amends; the relationship can improve, but it has not erased the past.`;
 if(/help|farm work|guard-assistance|favor|protected|promise.?kept/.test(all))return n.tier==='unique'?`${n.name} remembers your earlier help. As a key local figure, they are more willing to hear you out and may be readier to put in a good word.`:`${n.name} remembers your earlier help and is more willing to hear you out.`;
 if(/gift/.test(all))return `${n.name} remembers your gift, though repeated gifts alone will not create unlimited trust.`;
 if(/bargain accepted/.test(all))return `${n.name} remembers the previous bargain and will consider your reputation and relationship before making another offer.`;
 if(rep>=25)return `${n.name} has heard good things about you and is more open to a respectful conversation.`;
 if(rep<=-10)return `${n.name} is wary because of your public reputation, even without a personal grievance.`;
 if(r.affinity>=5&&r.trust>=3)return `${n.name} knows you well enough for a warmer, more personal response.`;
 return `${n.name} has no major recorded grievance or favor to bring up yet.`;
}
function ir073HasWitnesses(victim){
 const c=state?.character,s=site(),siteId=s?.id,day=Number(c?.daysLived)||0;if(!c||!siteId)return false;
 return (c.npcs||[]).some(n=>{
  if(!n||n.id===victim?.id||n.dead||n.ir0724Dead||!ir072IsPresent(n))return false;
  // Legacy background NPCs can be globally known/present in the directory. Only a person
  // anchored to this site, last recorded here, or scheduled here counts as a local witness.
  const anchored=[n.homeSite,n.workSite,n.restSite,n.socialSite,n.ir071OriginSite,n.lastSeenSiteId,n.currentSiteId].some(id=>id===siteId);
  let scheduledHere=false;try{scheduledHere=ir071ScheduleFor(n,day)?.siteId===siteId}catch(e){}
  return anchored||scheduledHere;
 });
}

// A crime hurts the victim's own relationship and memory even when unseen.
// Public reputation only changes if another NPC witnesses it or it is reported.
ir0724RecordCrime=function(type,n,detail,penalty,{witnessed=false,reported=false}={}){
 const c=state.character,v=ir0724Data(),s=site(),basePenalty=Math.max(0,Math.trunc(Number(penalty)||0));
 const publicKnowledge=!!(witnessed||reported),before=ir073Rep();
 if(publicKnowledge)ir073ChangeReputation(-(basePenalty+(witnessed?5:0)),`witnessed-${type}`,detail);
 const rec={id:`crime-${Date.now()}-${v.crimeLog.length}`,type,npcId:n?.id||'',npcName:n?.name||'Unknown person',siteId:s?.id||'',siteName:s?.name||'',day:Number(c.daysLived)||0,detail,witnessed:!!witnessed,reported:!!reported,publicKnowledge,publicReputationBefore:before,publicReputationAfter:ir073Rep(),publicPenaltyApplied:publicKnowledge};
 v.crimeLog.unshift(rec);v.crimeLog=v.crimeLog.slice(0,80);
 if(n){const r=ir06Relationship(n);r.trust=clamp((Number(r.trust)||0)-(witnessed?8:4),-100,100);r.affinity=clamp((Number(r.affinity)||0)-2,-100,100);n.ir0724LastCrimeDay=Number(c.daysLived)||0;n.ir073LastHarm={day:Number(c.daysLived)||0,type,detail:String(detail||''),witnessed:!!witnessed};ir06Remember(n,`${detail} ${publicKnowledge?'This became known publicly.':'No witness saw this; it remains in the victim’s personal memory and relationship.'}`,'crime');ir0724PersistNPC(n)}
 addFeed('⚖️',publicKnowledge?'Crime witnessed or reported':'Unseen crime recorded',`${detail} ${publicKnowledge?`Public reputation fell by ${before-ir073Rep()} because the act became known. Current reputation: ${ir073Rep()}.`:'No public reputation was lost because no witness or report exists. The affected NPC still remembers the harm.'}`,'warning');persist();return rec;
};

// Keep local bystanders, not only guards, relevant to assault and killing witnesses.
function ir0726AttackNPC(n){
 const checked=ir072RequireNPC(n?.id);if(!checked)return;const c=state.character;
 if(state.combat?.active||state.pendingEvent){toast('Resolve the current combat or event first.');return}
 if(Number(c.energy)<5){toast('You need at least 5 energy to start a fight.');return}
 const safeId=String(n.id).replace(/[^a-z0-9_-]/gi,'_'),id=`ir073_npc_assault_${safeId}`;
 const force=14+(n.tier==='unique'?7:n.tier==='routine'?3:0)+((n.traits||[]).includes('brave')?5:0);
 IR_ENEMIES[id]={id,name:n.name,icon:n.icon||'♙',desc:`${n.name} is defending themselves after an assault.`,hp:34+force*2,attack:Math.max(3,Math.round(force/5)),defense:Math.max(0,Math.floor(force/12)),xp:0,coins:[0,0],threatRank:1,threatLabel:'NPC assault',style:'balanced',loot:[],bribe:0};
 const oldEnergy=Number(c.energy)||0;c.energy=oldEnergy-5;
 const witnesses=ir073HasWitnesses(n),ok=startCombat(id,{type:'npc-assault',npcId:n.id,npcName:n.name});
 if(!ok||!state.combat?.active){c.energy=oldEnergy;persist();render();toast('The assault could not begin. No energy or reputation was lost.');return}
 const crime=ir0724RecordCrime('assault',n,`You attacked ${n.name} at ${site()?.name||'this location'}.`,12,{witnessed:witnesses});
 if(state.combat.source){state.combat.source.npcId=n.id;state.combat.source.npcName=n.name;state.combat.source.crimeId=crime.id;state.combat.source.assaultWitnessed=witnesses}
 state.combat.enemyName=n.name;state.combat.enemyIcon=n.icon||'♙';state.combat.enemyDesc=`${n.name} is fighting back. Defeating them permanently removes them from normal NPC interactions.${witnesses?' Bystanders know about the assault.':'No other NPC is present to witness the assault.'}`;
 persist();render();toast(`Assault started. ${witnesses?'Witnesses are present; public reputation will suffer.':'No witnesses are present; public reputation will not fall unless the crime is later reported.'}`);
}

// Low public standing blocks ordinary conversation and services, but guards remain a path back.
const ir073RequireNPCBase=ir072RequireNPC;
ir072RequireNPC=function(id){
 const n=ir072NPC(id);
 if(n&&ir073ShouldRefuse(n)&&ir072IsPresent(n)&&!ir072Blocked()){
  ir073RecordRefusal(n);toast(`${n.name} refuses to deal with you because your public reputation is ${ir073Rep()} (${ir073RepTier()}).`);return null;
 }
 return ir073RequireNPCBase.apply(this,arguments);
};

// Context-aware interaction screen; refusals explain themselves rather than silently disabling buttons.
const ir073InteractionModalBase=ir072InteractionModal;
ir072InteractionModal=function(){
 const n=ir072NPC(modal?.npc),present=ir072IsPresent(n);
 if(n&&present&&ir073ShouldRefuse(n)){
  ir073RecordRefusal(n);const rel=ir06Relationship(n),context=ir073ContextLine(n),rep=ir073Rep();
  return `<div class="overlay" data-dismiss="modal"><section class="modal ir072-modal ir073-refusal-modal" role="dialog" aria-modal="true" aria-label="${esc(n.name)} refuses to interact"><div class="modal-header"><div><div class="eyebrow">RELATIONSHIP CONSEQUENCES · V0.7.3</div><h2>${esc(n.icon||'♙')} ${esc(n.name)}</h2><p>${esc(n.occupation||n.role||'Resident')} · ${esc(ir073RepTier())} public standing</p></div><button class="close-btn" data-action="ir072-close" aria-label="Close interactions">×</button></div>${ir072ContextInfo(site())}<section class="notice warning ir073-refusal"><strong>${esc(n.name)} refuses to deal with you.</strong><p>Your public reputation is ${rep}. At ${rep<=-50?'this level, people fear the trouble your presence may bring.':'this level, people are unwilling to offer ordinary conversation, trade, or favors.'}</p><p>${esc(context)}</p></section><section class="ir072-section"><div class="panel-heading"><div><h3>Relationship record</h3><p>Private memories persist even when a crime was not witnessed.</p></div><span class="tag red">AFFINITY ${Number(rel.affinity)||0} · TRUST ${Number(rel.trust)||0}</span></div>${n.memories?.[0]?`<p class="ir073-memory-quote">“${esc(String(n.memories[0].text||'').slice(0,240))}”</p>`:'<p class="ir072-inline-note">No personal memory is recorded yet; the refusal comes from public reputation.</p>'}</section><div class="modal-actions"><button class="button" data-action="ir072-close">Close</button></div></section></div>`;
 }
 let html=ir073InteractionModalBase.apply(this,arguments);
 if(n&&present){const context=ir073ContextLine(n),memory=`<section class="ir073-social-context"><strong>They remember</strong><p>${esc(context)}</p></section>`;html=html.replace(/(<section class="ir072-location-context">[\s\S]*?<\/section>)/,`$1${memory}`)}
 return html.replace(/NPC INTERACTIONS · V0\.7\.2(?:\.\d+)?/g,'NPC INTERACTIONS · V0.7.3');
};

// Public reputation makes positive ties develop faster. Existing two-day talk cooldown remains.
ir06Talk=function(id){
 const c=state.character,n=ir072NPC(id);if(!n)return;
 if(!ir072IsPresent(n)){toast(`${n.name} is not currently available here.`);return}
 if(ir073ShouldRefuse(n)){toast(`${n.name} refuses to talk because your public reputation is ${ir073Rep()}.`);return}
 if(ir072Blocked()){toast('Resolve the current combat or event first.');return}
 const rel=ir06Relationship(n),last=Number(n.lastTalkDay??-2),day=Number(c.daysLived)||0;
 if(day-last<2){toast('You have recently spoken with them. Wait before talking again.');return}
 if(!actionCost(5))return;
 const context=ir073ContextLine(n),standing=ir073MemoryStanding(n),rep=ir073Rep();c.energy-=5;dayPass(1,'social');
 let affinityGain=ir06Trait(n,'suspicious')?0:1,trustGain=ir06Trait(n,'loyal')?2:1;
 if(rep>=25){affinityGain+=1;trustGain+=1}if(rep>=60)affinityGain+=1;
 if(standing<0){affinityGain=Math.max(0,affinityGain-1);trustGain=Math.max(0,trustGain-1)}else if(standing>0&&rep>=5)trustGain+=1;
 rel.affinity=clamp(rel.affinity+affinityGain,-100,100);rel.trust=clamp(rel.trust+trustGain,-100,100);n.affinity=rel.affinity;n.trust=rel.trust;n.lastTalkDay=c.daysLived;
 ir06Remember(n,`You talked with ${n.name}. ${context} Affinity ${affinityGain>=0?'+':''}${affinityGain}, trust +${trustGain}. Totals: affinity ${rel.affinity}, trust ${rel.trust}.`,'conversation');
 addFeed('♧',`Talked with ${n.name}`,`${context} Relationship changes: affinity ${affinityGain>=0?'+':''}${affinityGain}, trust +${trustGain}.`,'social');persist();render();toast(`Conversation with ${n.name}: affinity ${affinityGain>=0?'+':''}${affinityGain}, trust +${trustGain}.`);
};

// Gifts have a three-day per-NPC cooldown; reputation helps, but gift repetition cannot farm affinity.
ir06Gift=function(id){
 const c=state.character,n=ir072NPC(id);if(!n)return;
 if(!ir072IsPresent(n)){toast(`${n.name} is not currently available here.`);return}
 if(ir073ShouldRefuse(n)){toast(`${n.name} refuses your gift because of your public reputation.`);return}
 if(ir072Blocked()){toast('Resolve the current combat or event first.');return}
 const day=Number(c.daysLived)||0;if(day-Number(n.ir073LastGiftDay??-999)<3){toast(`${n.name} recently received a gift. Wait ${3-(day-Number(n.ir073LastGiftDay??-999))} day(s) before giving another.`);return}
 const item=['charm','herb','bread','scrap'].find(k=>(c.inventory?.[k]||0)>0);if(!item){toast('You need a gift item such as bread, a charm, an herb, or scrap.');return}
 c.inventory[item]--;n.ir073LastGiftDay=day;const rel=ir06Relationship(n),rep=ir073Rep(),standing=ir073MemoryStanding(n);
 let affinityGain=ir06Trait(n,'generous')?3:2,trustGain=1;if(rep>=25){affinityGain+=1;trustGain+=1}if(rep>=60)affinityGain+=1;if(standing<0)affinityGain=Math.max(1,affinityGain-1);
 rel.affinity=clamp(rel.affinity+affinityGain,-100,100);rel.trust=clamp(rel.trust+trustGain,-100,100);n.affinity=rel.affinity;n.trust=rel.trust;
 const text=`You gave ${n.name} ${ITEMS[item]?.name||item}. Public reputation ${rep} influenced how warmly they received it; affinity +${affinityGain}, trust +${trustGain}.`;ir06Remember(n,text,'gift');ir0724PersistNPC(n);addFeed('🎁','A thoughtful gift',text,'social');persist();render();toast(`${n.name} received the gift: affinity +${affinityGain}, trust +${trustGain}.`);
};

// Favors respond to public reputation, remembered help/harm, and a per-NPC cooldown.
ir06Favor=function(id){
 const c=state.character,n=ir072NPC(id);if(!n)return;
 if(!ir072IsPresent(n)){toast(`${n.name} is not currently available here.`);return}
 if(ir073ShouldRefuse(n)){toast(`${n.name} refuses to help because of your public reputation.`);return}
 if(ir072Blocked()){toast('Resolve the current combat or event first.');return}
 const r=ir06Relationship(n),day=Number(c.daysLived)||0;if(r.affinity<2||r.trust<1){toast('Build affinity and trust first; this person does not know you well enough yet.');return}
 if(day-Number(n.ir073LastFavorDay??-999)<3){toast(`${n.name} has recently helped you. Wait before asking for another favor.`);return}
 if(c.energy<8){toast('You need at least 8 energy to ask for help.');return}
 n.ir073LastFavorDay=day;c.energy-=8;dayPass(1,'social');const rep=ir073Rep(),standing=ir073MemoryStanding(n);
 const score=r.affinity+r.trust+(ir06Trait(n,'cautious')?-2:0)+(ir06Trait(n,'generous')?2:0)+(rep>=25?2:0)+(rep>=60?2:0)+standing;
 if(score>=5){const reward=/merchant|trader/i.test(n.occupation||n.role||'')?5:2;c.coin+=reward;r.trust=clamp(r.trust+1,-100,100);n.trust=r.trust;const text=`${n.name} helped you with a small favor worth ${reward} coins. Public reputation ${rep} and remembered history influenced their decision.`;ir06Remember(n,text,'favor');addFeed('🤝',`${n.name} helped you`,text,'social');toast('The favor worked out.')}else{const text=`You asked ${n.name} for help, but they were unable to assist. Their decision reflected your relationship, reputation, and shared history.`;ir06Remember(n,text,'favor');addFeed('🤝','A favor declined',text,'social');toast('They could not help this time.')}
 ir0724PersistNPC(n);persist();render();
};

// Better public standing improves both the odds and the size of a merchant bargain.
ir072Bargain=function(id){
 const n=ir072RequireNPC(id);if(!n)return;const c=state.character,s=site(),v=ir072Data(),day=Number(c.daysLived)||0;
 if(ir072Occupation(n)!=='merchant'){toast('Only a merchant or trader can negotiate a market offer.');return}
 if(!ir072CanShopHere()){toast('There is no usable market service at this location.');return}
 if(Number(v.bargainAttempts?.[n.id]??-999)===day){toast('You already tried bargaining with this merchant today.');return}
 if(v.activeBargain?.siteId===s.id){toast('You already have a negotiated discount waiting for one purchase here.');return}
 if(c.energy<4){toast('You need 4 energy to negotiate.');return}if(c.hunger<8){toast('Eat something before negotiating.');return}
 const rep=ir073Rep(),discount=rep>=60?15:rep>=25?12:8;
 const chance=clamp(38+Math.max(0,(c.skills?.Trade?.level||1)-1)*4+((c.attrs?.Charisma||10)-10)*2+(ir06Trait(n,'generous')?5:0)-(ir06Trait(n,'cautious')?5:0)+Math.max(0,Math.floor(rep/10)),20,85);
 v.bargainAttempts=v.bargainAttempts||{};v.bargainAttempts[n.id]=day;c.energy-=4;
 if(Math.random()*100<chance){v.activeBargain={npcId:n.id,npcName:n.name,siteId:s.id,percent:discount,createdDay:day};const r=ir06Relationship(n);if(rep>=25){r.trust=clamp((Number(r.trust)||0)+1,-100,100);n.trust=r.trust}const text=`${n.name} agreed to a ${discount}% discount on one eligible purchase at ${s.name}. Your ${ir073RepTier(rep).toLowerCase()} public standing and trade skill helped secure the offer.`;ir06Remember(n,text,'bargain');addFeed('🤝','Bargain accepted',text,'social');persist();modal=null;render();toast(`Bargain accepted: ${discount}% off one item here.`)}
 else{const text=`You tried to bargain with ${n.name} at ${s.name}, but they held to the listed prices. Your ${ir073RepTier(rep).toLowerCase()} public standing and trade skill influenced the negotiation; no coins were charged.`;ir06Remember(n,text,'bargain');addFeed('🤝','Bargain declined',text,'social');persist();modal=null;render();toast('The merchant declined. No coins were charged; 4 energy was spent.')}
};

// Clarify reputation rules in the existing conflict cards.
const ir073CrimeCardsBase=ir0724CrimeCards;
ir0724CrimeCards=function(n){
 let html=ir073CrimeCardsBase.apply(this,arguments);
 return html.replace('Theft lowers reputation even if unnoticed; an assault uses the existing turn-based combat system and can permanently kill the NPC.','Unwitnessed crimes harm the victim’s trust and memory but do not lower public reputation. Witnessed or reported crimes reduce public standing. An assault can permanently kill the NPC.')
 .replace('The assault lowers reputation immediately; winning kills the NPC permanently and causes a further reputation penalty.','Public reputation falls only if the assault or killing is witnessed or reported; the victim remembers the harm either way.')
 .replace('The assault lowers reputation immediately; winning kills the NPC permanently and causes a further reputation penalty.','Public reputation falls only if the assault or killing is witnessed or reported; the victim remembers the harm either way.')
 .replace('Success depends on Agility, Stealth/Survival, and how alert the target is; costs 5 energy.','Success depends on Agility, Stealth/Survival, and how alert the target is; costs 5 energy. The victim remembers the harm; public reputation falls only if the act is witnessed or reported.');
};

// Reputation-aware copy and a clear record when guards reward a report.
const ir073ShopCardBase=ir072ShopCard;
ir072ShopCard=function(){return ir073ShopCardBase.apply(this,arguments).replace('Try for 8% off one eligible market purchase.','Try for an 8–15% discount on one eligible purchase. High public reputation improves both your odds and the size of the offer.').replace('Try for 8% off one eligible market purchase','Try for an 8–15% reputation-influenced discount')};
const ir073GuardReportBase=ir0724GuardReport;
ir0724GuardReport=function(n){const before=ir073Rep();const result=ir073GuardReportBase.apply(this,arguments);const delta=ir073Rep()-before;if(delta>0){addFeed('⚖️','Public reputation improved',`You reported local criminal activity responsibly. Public reputation increased by ${delta} (${before} → ${ir073Rep()}).`,'milestone');persist()}return result};
const ir073CharacterBase=renderCharacter;
renderCharacter=function(){let html=ir073CharacterBase.apply(this,arguments);const c=state?.character;if(!c)return html;const rep=ir073Rep(),label=ir073RepTier(rep);return html.replace(/<span class="tag gold">(?:Respected|Distrusted|Unknown Reputation) · -?\d+<\/span>/,`<span class="tag gold">${label} · ${rep}</span>`)};

// Reputation badge labels now match the actual social consequences.
const ir073ShellBase=shell;
shell=function(inner){return ir073ShellBase.apply(this,arguments).replace(/VERSION 0\.[0-9]+(?:\.[0-9]+){1,2}/g,'VERSION 0.7.3').replace(/V0\.7\.2(?:\.\d+)?/g,'V0.7.3')};
const ir073TopbarBase=topbar;
topbar=function(){
 let html=ir073TopbarBase.apply(this,arguments).replace(/VERSION 0\.[0-9]+(?:\.[0-9]+){1,2}/g,'VERSION 0.7.3');
 if(state?.character){const rep=ir073Rep(),label=ir073RepTier(rep);html=html.replace(/(<span class="ir0726-rep-status">)[\s\S]*?(<\/span>)/,`$1${label}$2`)}return html;
};
const ir073PersistBase=persist;
persist=function(){if(state?.character){state.gameVersion=IR073_VERSION;state.saveSchemaVersion=IR073_SAVE_SCHEMA;const v=ir073Data(),current=ir073Rep(),prior=Number(v.lastObservedReputation);if(Number.isFinite(prior)&&prior!==current){v.events.unshift({day:Number(state.character.daysLived)||0,delta:current-prior,before:prior,after:current,reason:'gameplay consequence',detail:'Public reputation changed through an existing world or relationship action.',public:true});v.events=v.events.slice(0,80)}v.lastObservedReputation=current}const result=ir073PersistBase.apply(this,arguments);if(state?.character){state.gameVersion=IR073_VERSION;state.saveSchemaVersion=IR073_SAVE_SCHEMA;try{localStorage.setItem(SAVE_KEY,JSON.stringify(state))}catch(e){}const saveStatus=document.querySelector('#saveStatus');if(saveStatus)saveStatus.title=`Autosaved · Infinite Realms ${IR073_VERSION}`}return result};
exportSave=function(){
 try{
  if(!state?.character){toast('There is no active life to back up.');return}
  if(typeof ir068ValidateLiveState==='function')ir068ValidateLiveState();
  state.gameVersion=IR073_VERSION;state.saveSchemaVersion=IR073_SAVE_SCHEMA;
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  const name=(state.character.name||'save').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'save';
  a.href=url;a.download=`infinite-realms-${name}-v073-backup.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
  state.character.lastExportReminderDay=state.character.daysLived||0;persist();toast(`Backup exported for Infinite Realms ${IR073_VERSION}.`);
 }catch(e){toast('Backup export failed. Your current life remains open; try again or save a manual slot.')}
};
const ir073NormalizeBase=normalizeSave;
normalizeSave=function(input){const out=ir073NormalizeBase.apply(this,arguments);if(out?.world){out.world.v073=out.world.v073&&typeof out.world.v073==='object'?out.world.v073:{schema:1,events:[],refusals:{},giftCooldowns:{}};out.world.v073.schema=1;out.world.v073.events=Array.isArray(out.world.v073.events)?out.world.v073.events:[];out.world.v073.refusals=out.world.v073.refusals||{};out.world.v073.giftCooldowns=out.world.v073.giftCooldowns||{}}if(out?.character){out.gameVersion=IR073_VERSION;out.saveSchemaVersion=IR073_SAVE_SCHEMA}return out};
const ir073ModalBase=ir072InteractionModal;
// The wrapper above already preserves the old modal for normal NPCs. Retitle any nested modal headings.
if(typeof document!=='undefined'){document.title='Infinite Realms — Version 0.7.3';const css=document.createElement('style');css.textContent=`.ir073-social-context{margin:10px 0;padding:10px 12px;border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:9px;background:var(--surface-2,rgba(255,255,255,.025))}.ir073-social-context strong{font-size:11px}.ir073-social-context p,.ir073-refusal p{font-size:11px;line-height:1.6;color:var(--muted);margin:4px 0 0}.ir073-refusal{margin:12px 0}.ir073-refusal strong{font-size:13px}.ir073-memory-quote{font-size:11px;line-height:1.6;color:var(--muted);border-left:2px solid var(--line);padding-left:10px}.ir073-refusal-modal .tag.red{border-color:#774441;color:#f2aaa1}`;document.head.appendChild(css)}
// ================= End Infinite Realms v0.7.3 =================
