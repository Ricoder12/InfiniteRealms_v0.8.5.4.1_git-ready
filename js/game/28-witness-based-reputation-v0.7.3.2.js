'use strict';
// Infinite Realms v0.7.3.2 — witness-based public reputation reliability.
// Kept as a separate final patch layer so it can be removed independently.

function ir0732Rep(){
 return Math.max(-100, Math.min(100, Math.trunc(Number(state?.character?.reputation) || 0)));
}
function ir0732CrimeLog(){
 if(typeof ir0724Data!=='function')return [];
 const v=ir0724Data();v.crimeLog=Array.isArray(v.crimeLog)?v.crimeLog:[];return v.crimeLog;
}
function ir0732FindCrime(id){
 if(!id)return null;return ir0732CrimeLog().find(r=>String(r?.id)===String(id))||null;
}
function ir0732KnownPublicly(rec){return !!(rec&&(rec.witnessed||rec.reported||rec.publicKnowledge));}
function ir0732BasePenaltyFor(rec){
 if(Number.isFinite(Number(rec?.ir0732BasePenalty)))return Math.max(0,Math.trunc(Number(rec.ir0732BasePenalty)));
 // Legacy v0.7.3.1 crime records did not persist their input penalty. Use only the
 // established per-action values needed for a later eligible report; do not guess others.
 const type=String(rec?.type||'').toLowerCase();
 if(type==='assault'||type==='murder')return 12;
 if(type==='failed-theft')return 5;
 if(type==='theft')return rec?.witnessed?7:3;
 return 0;
}
function ir0732WitnessIds(victim){
 const c=state?.character,s=site(),siteId=s?.id,day=Number(c?.daysLived)||0;if(!c||!siteId)return [];
 return Array.from(new Set((c.npcs||[]).filter(n=>{
  if(!n||n.id===victim?.id||n.dead||n.ir0724Dead||!ir072IsPresent(n))return false;
  const anchored=[n.homeSite,n.workSite,n.restSite,n.socialSite,n.ir071OriginSite,n.lastSeenSiteId,n.currentSiteId].some(id=>id===siteId);
  let scheduledHere=false;try{scheduledHere=ir071ScheduleFor(n,day)?.siteId===siteId}catch(e){}
  return anchored||scheduledHere;
 }).map(n=>String(n.id))));
}

// The existing v0.7.3 recorder already applies a single base penalty when witnessed/reported.
// This wrapper records that outcome and supports an existing incident being reported later by
// an eligible in-game callback. Reusing an incident ID never repeats personal consequences.
const ir0732RecordCrimeBase=ir0724RecordCrime;
ir0724RecordCrime=function(type,n,detail,penalty,options={}){
 const opts=options&&typeof options==='object'?options:{};
 const incidentId=opts.incidentId||opts.crimeId||null;
 const existing=incidentId?ir0732FindCrime(incidentId):null;
 if(existing){
  const wasSettled=typeof existing.ir0732ActionPenaltySettled==='boolean'
   ? existing.ir0732ActionPenaltySettled
   : (typeof existing.publicPenaltyApplied==='boolean'?existing.publicPenaltyApplied:ir0732KnownPublicly(existing));
  if(!Number.isFinite(Number(existing.ir0732BasePenalty))||Number(existing.ir0732BasePenalty)<0)existing.ir0732BasePenalty=ir0732BasePenaltyFor(existing)||Math.max(0,Math.trunc(Number(penalty)||0));
  if(opts.witnessed===true)existing.witnessed=true;
  if(opts.reported===true)existing.reported=true;
  if(Array.isArray(opts.witnessNpcIds))existing.witnessNpcIds=Array.from(new Set([...(existing.witnessNpcIds||[]),...opts.witnessNpcIds.map(String)]));
  existing.publicKnowledge=ir0732KnownPublicly(existing);
  if(!wasSettled&&existing.publicKnowledge){
   const basePenalty=Math.max(0,Math.trunc(Number(existing.ir0732BasePenalty??penalty)||0));
   const amount=basePenalty+(existing.witnessed?5:0),before=ir0732Rep();
   const change=ir073ChangeReputation(-amount,`${existing.reported&&!existing.witnessed?'reported':'witnessed'}-${existing.type||type}`,existing.detail||detail||'');
   existing.ir0732ActionPenaltySettled=true;
   existing.ir0732ActionPenaltyAmount=Math.max(0,before-change.after);
   existing.publicPenaltyApplied=true;
   existing.publicReputationBefore=Number.isFinite(Number(existing.publicReputationBefore))?Number(existing.publicReputationBefore):before;
   existing.publicReputationAfter=change.after;
   addFeed('⚖️','Crime report recorded',`${existing.detail||detail||'A harmful action'} became publicly known. The public reputation consequence was applied once; current reputation: ${change.after}.`,'warning');
   persist();
  }else if(!existing.ir0732ActionPenaltySettled){
   existing.ir0732ActionPenaltySettled=false;
  }
  existing.publicKnowledge=ir0732KnownPublicly(existing);
  return existing;
 }
 const before=ir0732Rep();
 const rec=ir0732RecordCrimeBase.apply(this,arguments);
 if(rec){
  rec.ir0732BasePenalty=Math.max(0,Math.trunc(Number(penalty)||0));
  rec.ir0732ActionPenaltySettled=ir0732KnownPublicly(rec);
  rec.ir0732ActionPenaltyAmount=Math.max(0,before-ir0732Rep());
  rec.ir0732MurderPenaltyApplied=false;
  rec.ir0732DeathProcessed=false;
  rec.publicKnowledge=ir0732KnownPublicly(rec);
  if(Array.isArray(opts.witnessNpcIds))rec.witnessNpcIds=Array.from(new Set(opts.witnessNpcIds.map(String)));
  else if(opts.witnessed===true)rec.witnessNpcIds=ir0732WitnessIds(n);
  else rec.witnessNpcIds=Array.isArray(rec.witnessNpcIds)?rec.witnessNpcIds:[];
 }
 return rec;
};

// Credible reporting hook for existing/future witness or surviving-victim callbacks.
// Only a living victim or an NPC recorded as physically present for the event can report it.
// This hook does not grant omniscient knowledge and does not add a new UI or reputation source.
function ir0732ReportCrimeRecord(crimeId,reporterId){
 const rec=ir0732FindCrime(crimeId),c=state?.character;if(!rec||!c||!reporterId)return {ok:false,reason:'missing-record-or-reporter'};
 const reporter=(c.npcs||[]).find(n=>String(n?.id)===String(reporterId))||ir072NPC(reporterId);
 if(!reporter||reporter.dead||reporter.ir0724Dead)return {ok:false,reason:'reporter-unavailable'};
 const harm=reporter.ir073LastHarm;
 const memoryList=Array.isArray(reporter.memories)?reporter.memories:[];
 const hasVictimMemory=!!(harm&&(String(harm.type||'')===String(rec.type||'')||String(harm.detail||'')===String(rec.detail||'')))||memoryList.some(m=>{
  const kind=String(m?.kind||'').toLowerCase(),text=String(m?.text||'').toLowerCase(),detail=String(rec.detail||'').toLowerCase();
  return /crime|assault|theft|murder|death/.test(kind)&&!!detail&&text.includes(detail.slice(0,Math.min(40,detail.length)));
 });
 const victimCanReport=String(reporter.id)===String(rec.npcId)&&!rec.killed&&hasVictimMemory;
 const witnessed=Array.isArray(rec.witnessNpcIds)&&rec.witnessNpcIds.includes(String(reporter.id));
 if(!victimCanReport&&!witnessed)return {ok:false,reason:'no-credible-knowledge'};
 const before=ir0732Rep();
 const updated=ir0724RecordCrime(rec.type,reporter,rec.detail,ir0732BasePenaltyFor(rec),{
  incidentId:rec.id,reported:true,witnessed:!!rec.witnessed,witnessNpcIds:rec.witnessNpcIds
 });
 if(updated){updated.reported=true;updated.publicKnowledge=true;updated.ir0732ReportedBy=String(reporter.id);updated.ir0732ReportedDay=Number(c.daysLived)||0;persist();}
 return {ok:!!updated,record:updated,penaltyApplied:ir0732Rep()<before,alreadyPublic:before===ir0732Rep()};
}

// NPC death is a separate escalation from the initiating assault in the existing design.
// Preserve that escalation when known publicly, but make its reputation penalty and the full
// death-resolution callback idempotent by crime ID. The older handler still grants combat XP,
// records death, and performs its existing combat/loot flow on the first resolution.
const ir0732CombatEndBase=irCombatEnd;
irCombatEnd=function(kind,detail=''){
 const battle=state?.combat,source=battle?.source||{};
 const isNpcKill=kind==='victory'&&source.type==='npc-assault'&&!!source.npcId;
 if(!isNpcKill)return ir0732CombatEndBase.apply(this,arguments);
 const rec=ir0732FindCrime(source.crimeId);
 if(rec&&(rec.ir0732DeathProcessed===true||rec.ir0732DeathProcessed==='processing'||rec.killed===true))return;
 // A bystander who arrives after the assault began can still witness the fatal act.
 // Re-check only when the NPC dies; this does not make the earlier private assault public.
 const victim=ir072NPC(source.npcId);
 if(rec&&victim){
  const deathWitnesses=ir0732WitnessIds(victim);
  if(deathWitnesses.length){
   rec.witnessNpcIds=Array.from(new Set([...(rec.witnessNpcIds||[]),...deathWitnesses]));
   rec.witnessed=true;rec.publicKnowledge=true;
   // If the assault itself was private, settle that stage at zero. The existing murder
   // escalation below applies once; a later report must not retroactively stack assault cost.
   if(!rec.ir0732ActionPenaltySettled){rec.ir0732ActionPenaltySettled=true;rec.ir0732ActionPenaltyAmount=0;rec.ir0732PublicKnowledgeStage='death';}
  }
 }
 if(rec)rec.ir0732DeathProcessed='processing';
 const before=ir0732Rep();
 try{
  const result=ir0732CombatEndBase.apply(this,arguments);
  if(rec){
   const after=ir0732Rep(),publicMurder=!!(rec.witnessed||rec.reported);
   rec.ir0732DeathProcessed=true;
   rec.ir0732MurderPenaltyApplied=publicMurder;
   rec.ir0732MurderPenaltyAmount=publicMurder?Math.max(0,before-after):0;
   rec.ir0732MurderPenaltyBefore=before;
   rec.ir0732MurderPenaltyAfter=after;
   rec.publicKnowledge=publicMurder;
   rec.publicPenaltyApplied=!!(rec.publicPenaltyApplied||publicMurder);
   rec.publicReputationAfter=after;
   persist();
  }
  return result;
 }catch(error){if(rec&&rec.ir0732DeathProcessed==='processing')rec.ir0732DeathProcessed=false;throw error;}
};

// Display/save metadata only; save schema and the established storage format remain unchanged.
const ir0732ShellBase=shell;
shell=function(){return ir0732ShellBase.apply(this,arguments).replace(/VERSION 0\.[0-9]+(?:\.[0-9]+){1,2}/g,'VERSION 0.7.3.2').replace(/V0\.7\.3(?!\.\d)/g,'V0.7.3.2')};
const ir0732TopbarBase=topbar;
topbar=function(){return ir0732TopbarBase.apply(this,arguments).replace(/VERSION 0\.[0-9]+(?:\.[0-9]+){1,2}/g,'VERSION 0.7.3.2')};
const ir0732PersistBase=persist;
persist=function(){const result=ir0732PersistBase.apply(this,arguments);if(state?.character){state.gameVersion='0.7.3.2';state.saveSchemaVersion=IR073_SAVE_SCHEMA;try{localStorage.setItem(SAVE_KEY,JSON.stringify(state))}catch(e){}}return result};
const ir0732NormalizeBase=normalizeSave;
normalizeSave=function(){const result=ir0732NormalizeBase.apply(this,arguments);if(result?.character){result.gameVersion='0.7.3.2';result.saveSchemaVersion=IR073_SAVE_SCHEMA}return result};
if(typeof document!=='undefined')document.title='Infinite Realms — Version 0.7.3.2';
// ================= End Infinite Realms v0.7.3.2 patch =================
