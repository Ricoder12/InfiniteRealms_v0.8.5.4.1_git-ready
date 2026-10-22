'use strict';
// Infinite Realms v0.7.3.1 — isolated NPC identity, relationship and memory reliability patch.
// This layer intentionally wraps existing APIs instead of replacing the save or NPC systems.
function ir0731Data(){
 const w=state?.world;
 if(!w)return null;
 const v=w.v06||(w.v06={schema:2,changes:{},journal:[],registry:{}});
 v.schema=Math.max(2,Number(v.schema)||1);
 v.changes=v.changes&&typeof v.changes==='object'?v.changes:{};
 v.registry=v.registry&&typeof v.registry==='object'?v.registry:{};
 v.journal=Array.isArray(v.journal)?v.journal:[];
 return v;
}
function ir0731MemoryKey(m){
 return [Number(m?.day)||0,String(m?.kind||'memory'),String(m?.text||'').trim()].join('|');
}
function ir0731MergeMemories(){
 const lists=[...arguments].filter(Array.isArray),seen=new Set(),out=[];
 for(const list of lists)for(const m of list){
  if(!m||typeof m!=='object'||!String(m.text||'').trim())continue;
  const key=ir0731MemoryKey(m);if(seen.has(key))continue;seen.add(key);out.push({...m});
 }
 return out.sort((a,b)=>(Number(b.day)||0)-(Number(a.day)||0)).slice(0,5);
}
function ir0731StoreNPC(n){
 if(!n?.id)return;
 const v=ir0731Data();if(!v)return;
 const prior=v.registry[n.id]||{},change=v.changes[n.id]||{};
 const merged={...prior,...change,...n};
 merged.memories=ir0731MergeMemories(prior.memories,change.memories,n.memories);
 const rel=state?.character?.relationships?.[n.id];
 if(rel&&typeof rel==='object'){
  merged.affinity=Number(rel.affinity)||0;merged.trust=Number(rel.trust)||0;
 }
 v.registry[n.id]={...merged};
 v.changes[n.id]={...merged};
 return merged;
}
function ir0731HydrateNPC(n){
 if(!n?.id)return n;
 const v=ir0731Data();if(!v)return n;
 const saved=v.registry[n.id]||{},change=v.changes[n.id]||{};
 const merged={...saved,...change,...n};
 // The durable registry is the fallback authority for memories; merge rather than discard.
 merged.memories=ir0731MergeMemories(saved.memories,change.memories,n.memories);
 const c=state?.character;c.relationships=c.relationships&&typeof c.relationships==='object'?c.relationships:{};
 const r=c.relationships[n.id];
 if(r&&typeof r==='object'){
  r.affinity=Number(r.affinity??merged.affinity)||0;r.trust=Number(r.trust??merged.trust)||0;
  merged.affinity=r.affinity;merged.trust=r.trust;
 }else c.relationships[n.id]={affinity:Number(merged.affinity)||0,trust:Number(merged.trust)||0};
 v.registry[n.id]={...merged};v.changes[n.id]={...merged};
 return merged;
}
const ir0731EnsureNPCsBase=ir06EnsureNPCs;
ir06EnsureNPCs=function(){
 const c=state?.character;
 if(c&&Array.isArray(c.npcs))for(const n of c.npcs)ir0731StoreNPC(n);
 const result=ir0731EnsureNPCsBase.apply(this,arguments);
 if(c&&Array.isArray(c.npcs)){
  const byId=new Map();
  for(const n of c.npcs){const restored=ir0731HydrateNPC(n);if(restored?.id&&!byId.has(restored.id))byId.set(restored.id,restored);}
  c.npcs=Array.from(byId.values());
  // Rebuild location index from unique NPC identities only.
  const key=typeof ir06LocKey==='function'?ir06LocKey():null;
  if(key&&c.npcsByLocation)c.npcsByLocation[key]=c.npcs.filter(n=>String(n.id||'').startsWith('ir06_')&&n.generatedKey===key).map(n=>n.id);
 }
 return result;
};
const ir0731RememberBase=ir06Remember;
ir06Remember=function(n,text,kind='memory'){
 if(!n?.id||!state?.character)return ir0731RememberBase.apply(this,arguments);
 n.memories=Array.isArray(n.memories)?n.memories:[];
 const day=Number(state.character.daysLived)||0,normalized=String(text||'').trim();
 const duplicate=n.memories.some(m=>Number(m?.day)===day&&String(m?.kind||'memory')===String(kind||'memory')&&String(m?.text||'').trim()===normalized);
 if(!duplicate)ir0731RememberBase.call(this,n,text,kind);
 else{
  const v=ir0731Data();
  if(v){v.journal=Array.isArray(v.journal)?v.journal:[];const entry=v.journal.find(m=>m?.npc===n.name&&Number(m?.day)===day&&String(m?.kind||'memory')===String(kind||'memory')&&String(m?.text||'').trim()===normalized);if(!entry)v.journal.unshift({date:dateLabel(),day,npc:n.name,text:normalized,kind:kind||'memory'});v.journal=v.journal.slice(0,60);}
 }
 ir0731StoreNPC(n);
};
const ir0731RelationshipBase=ir06Relationship;
ir06Relationship=function(n){
 const rel=ir0731RelationshipBase.apply(this,arguments);
 if(n&&rel){
  rel.affinity=Number(rel.affinity??n.affinity)||0;rel.trust=Number(rel.trust??n.trust)||0;
  n.affinity=rel.affinity;n.trust=rel.trust;
  ir0731StoreNPC(n);
 }
 return rel;
};
// Migrate old saves in-place without resetting IDs, relationships, memories, schedules or locations.
function ir0731MigrateNPCRecords(options={}){
 const c=state?.character;if(!c)return false;
 c.relationships=c.relationships&&typeof c.relationships==='object'?c.relationships:{};
 const v=ir0731Data();if(!v)return false;
 let changed=false;const unique=new Map();
 for(const n of (Array.isArray(c.npcs)?c.npcs:[])){
  if(!n?.id)continue;
  const restored=ir0731HydrateNPC(n);
  if(!unique.has(restored.id)){unique.set(restored.id,restored);}
  else{
   const prior=unique.get(restored.id);prior.memories=ir0731MergeMemories(prior.memories,restored.memories);
   const r=c.relationships[restored.id];if(r){prior.affinity=Number(r.affinity)||0;prior.trust=Number(r.trust)||0;}
   ir0731StoreNPC(prior);changed=true;
  }
 }
 if(Array.isArray(c.npcs))c.npcs=Array.from(unique.values());
 // Preserve legacy relationship entries even when their NPC is not currently in this location.
 for(const [id,r] of Object.entries(c.relationships)){
  if(!r||typeof r!=='object')continue;
  const n=v.registry[id]||v.changes[id];if(n){n.affinity=Number(r.affinity)||0;n.trust=Number(r.trust)||0;v.registry[id]={...n};v.changes[id]={...n};}
 }
 if(changed&&typeof persist==='function')persist();
 return changed;
}
const ir0731BootBase=boot;
boot=function(){
 const result=ir0731BootBase.apply(this,arguments);
 try{ir0731MigrateNPCRecords();}catch(e){console.warn('NPC memory migration deferred safely',e)}
 return result;
};
// Save/load entry points call normalizeSave; normalize legacy NPC records when a save is normalized too.
const ir0731NormalizeSaveBase=normalizeSave;
normalizeSave=function(){
 const result=ir0731NormalizeSaveBase.apply(this,arguments);
 try{
  if(result?.character&&result?.world){
   const live=state;state=result;
   ir0731MigrateNPCRecords();
   state=live;
  }
 }catch(e){console.warn('NPC save migration deferred safely',e)}
 return result;
};
