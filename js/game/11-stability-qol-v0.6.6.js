'use strict';
// ================= Infinite Realms v0.6.6.1: stability and quality-of-life pass =================
document.title=`Infinite Realms — Version ${IR0661_GAME_VERSION}`;

// Keep the established localStorage key for compatibility, while separating game and save-schema versions.
const ir0661NormalizeBase=normalizeSave;
normalizeSave=function(input){
 const s=ir0661NormalizeBase(input);
 if(!s||!s.character)return s;
 const c=s.character;
 s.gameVersion=IR0661_GAME_VERSION;
 s.saveSchemaVersion=IR0661_SAVE_SCHEMA;
 c.relationships=c.relationships&&typeof c.relationships==='object'?c.relationships:{};
 c.npcs=Array.isArray(c.npcs)?c.npcs:[];
 c.inventory=c.inventory&&typeof c.inventory==='object'?c.inventory:{};
 for(const [id,count] of Object.entries(c.inventory)){
   const n=Math.floor(Number(count)||0);
   c.inventory[id]=Math.max(0,Math.min(9999,n));
 }
 c.skills=c.skills&&typeof c.skills==='object'?c.skills:{};
 for(const [id,v] of Object.entries(c.skills)){
   if(!v||typeof v!=='object')c.skills[id]={level:1,xp:0};
   else {v.level=clamp(Math.floor(Number(v.level)||1),1,100);v.xp=clamp(Number(v.xp)||0,0,999999);}
 }
 c.itemCondition=c.itemCondition&&typeof c.itemCondition==='object'?c.itemCondition:{};
 for(const [id,v] of Object.entries(c.itemCondition))c.itemCondition[id]=clamp(Number(v)||0,0,100);
 // Remove invalid equipped references without deleting the underlying inventory item.
 c.equipment=c.equipment&&typeof c.equipment==='object'?c.equipment:{};
 for(const [slot,id] of Object.entries(c.equipment)){
   if(!id)continue;
   const item=ITEMS[id];
   const owns=Number(c.inventory[id])>0;
   const known=!!item||!!IR_WEAPON_DATA?.[id]||!!IR_V05_GEAR?.[id];
   if(!owns||!known)c.equipment[slot]=null;
 }
 const w=s.world||(s.world={});
 w.v06=w.v06&&typeof w.v06==='object'?w.v06:{};
 w.v06.schema=Math.max(2,Number(w.v06.schema)||2);
 w.v06.changes=w.v06.changes&&typeof w.v06.changes==='object'?w.v06.changes:{};
 w.v06.registry=w.v06.registry&&typeof w.v06.registry==='object'?w.v06.registry:{};
 w.v06.journal=Array.isArray(w.v06.journal)?w.v06.journal.slice(0,100):[];
 w.v06.socialQuests=Array.isArray(w.v06.socialQuests)?w.v06.socialQuests:[];
 return s;
};

// Stable NPC registry: preserve generated residents and their relationships across location changes.
const ir0661EnsureNPCsBase=ir06EnsureNPCs;
ir06EnsureNPCs=function(){
 const c=state?.character,w=state?.world;
 if(!c||!w)return [];
 const v=w.v06||(w.v06={schema:2,changes:{},journal:[],socialQuests:[],registry:{}});
 v.registry=v.registry&&typeof v.registry==='object'?v.registry:{};
 v.changes=v.changes&&typeof v.changes==='object'?v.changes:{};
 // Migrate older NPC snapshots into the persistent registry before rebuilding the current location.
 for(const [id,savedNpc] of Object.entries(v.changes)){if(String(id).startsWith('ir06_')&&savedNpc&&typeof savedNpc==='object'&&!v.registry[id])v.registry[id]={...savedNpc,id};}
 c.relationships=c.relationships&&typeof c.relationships==='object'?c.relationships:{};
 // Capture the active set before the legacy generator rebuilds the current-location residents.
 for(const n of (c.npcs||[])){
   if(!n?.id||!String(n.id).startsWith('ir06_'))continue;
   const prior=v.registry[n.id]||{};
   v.registry[n.id]={...prior,...n,memories:Array.isArray(n.memories)?n.memories:(prior.memories||[])};
   v.changes[n.id]={...(v.changes[n.id]||{}),...v.registry[n.id]};
 }
 const current=ir0661EnsureNPCsBase()||[];
 const activeIds=new Set();
 for(const n of current){
   const saved=v.registry[n.id]||v.changes[n.id]||{};
   Object.assign(n,saved,{id:n.id,name:saved.name||n.name});
   n.memories=Array.isArray(n.memories)?n.memories:[];
   const r=c.relationships[n.id];
   if(r){n.affinity=Number(r.affinity)||0;n.trust=Number(r.trust)||0;}
   else if(Number.isFinite(Number(n.affinity))||Number.isFinite(Number(n.trust))){c.relationships[n.id]={affinity:Number(n.affinity)||0,trust:Number(n.trust)||0,status:n.status||'Acquaintance',milestones:Array.isArray(n.milestones)?n.milestones:[]};}
   v.registry[n.id]={...(v.registry[n.id]||{}),...n};
   activeIds.add(n.id);
 }
 const legacy=(c.npcs||[]).filter(n=>!String(n.id||'').startsWith('ir06_'));
 // Keep all generated contacts known, while the local People list still uses the current-location return value.
 c.npcs=[...legacy,...Object.values(v.registry).filter(n=>n&&n.id&&String(n.id).startsWith('ir06_'))];
 c.npcsByLocation=c.npcsByLocation||{};
 return current;
};
const ir0661RememberBase=ir06Remember;
ir06Remember=function(n,text,kind='memory'){
 ir0661RememberBase(n,text,kind);
 const v=state?.world?.v06;
 if(v&&n?.id){v.registry=v.registry||{};v.registry[n.id]={...(v.registry[n.id]||{}),...n};v.changes[n.id]={...(v.changes[n.id]||{}),...n};}
};
const ir0661RelationshipBase=ir06Relationship;
ir06Relationship=function(n){
 const r=ir0661RelationshipBase(n);
 if(n&&r){r.affinity=Number(r.affinity)||0;r.trust=Number(r.trust)||0;n.affinity=r.affinity;n.trust=r.trust;}
 return r;
};

// Normalize relationship records for dashboard consistency and persist relationship values alongside NPC records.
function ir0661PersistRelationship(id){
 const c=state?.character,n=(c?.npcs||[]).find(x=>x.id===id),r=c?.relationships?.[id],v=state?.world?.v06;
 if(!n||!r||!v)return;
 v.registry=v.registry||{};v.changes=v.changes||{};
 v.registry[id]={...(v.registry[id]||{}),...n,affinity:Number(r.affinity)||0,trust:Number(r.trust)||0,status:r.status||'Acquaintance',memories:n.memories||[]};
 v.changes[id]={...(v.changes[id]||{}),...v.registry[id]};
}
const ir0661PersistBase=persist;
persist=function(){
 if(state?.character){
   state.gameVersion=IR0661_GAME_VERSION;
   state.saveSchemaVersion=IR0661_SAVE_SCHEMA;
   const c=state.character;
   for(const id of Object.keys(c.relationships||{}))ir0661PersistRelationship(id);
 }
 const ok=ir0661PersistBase();
 const el=document.querySelector('#saveStatus');
 if(el&&state?.character){
   if(ok){el.innerHTML='<span class="status-dot"></span> Saved locally';el.title=`Autosaved · Infinite Realms ${IR0661_GAME_VERSION}`;}
   else {el.textContent='Save failed · Export backup';el.title='Browser storage could not save this life. Export a backup before continuing.';}
 }
 return ok;
};

// Give backups an accurate versioned filename and a self-contained save payload.
exportSave=function(){
 try{
   if(!state?.character){toast('There is no active life to back up.');return;}
   state.gameVersion=IR0661_GAME_VERSION;state.saveSchemaVersion=IR0661_SAVE_SCHEMA;
   const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   const name=(state.character.name||'save').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'save';
   a.href=url;a.download=`infinite-realms-${name}-v0661-backup.json`;document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),500);
   state.character.lastExportReminderDay=state.character.daysLived||0;
   persist();toast(`Backup exported for Infinite Realms ${IR0661_GAME_VERSION}.`);
 }catch(e){toast('Backup export failed. Your current life remains open; try another browser or export location.');}
};

// Central safety guard for high-impact actions during combat, including newer social/training actions.
const ir0661RunActionBase=runAction;
runAction=function(target){
 const a=target?.dataset?.action;
 const blockedDuringCombat=new Set([
  'advance-month','work','apply-job','quit-job','study','train','train-discipline','train-instructor','rest','eat','meal','talk','scout','forage','defense','travel','local-rest','local-healer','reveal-rumor','ask-rumor','gather-resource','craft-item','faction-join','faction-contract','faction-leave','world-investigate','world-help','discover-dungeon','enter-dungeon','hunt-choice','dungeon-choice','repair-gear','sell-junk','confirm-sell-junk','market-buy','market-sell','buy-item','spend-attribute','unlock-racial-talent','learn-spell','equip-item','ir06-talk','ir06-gift','ir06-favor','ir06-train','ir06-hire','ir061-spend','ir061-advice','ir061-train','ir061-work','ir062-set-status','ir062-amends','ir062-meal','ir062-personal-task','ir062-report-task'
 ]);
 if(state?.combat?.active&&blockedDuringCombat.has(a)){
   toast('This action is unavailable during combat. Finish the encounter first.');return;
 }
 return ir0661RunActionBase(target);
};

// Keep the main navigation and page metadata consistent across older layered templates.
const ir0661TopbarBase=topbar;
topbar=function(){return ir0661TopbarBase().replace(/VERSION 0\.[0-9]+(?:\.[0-9]+)?(?:\.\d+)?/g,`VERSION ${IR0661_GAME_VERSION}`).replace(/QUALITY OF LIFE UPDATE/g,'STABILITY & QUALITY OF LIFE').replace(/LIVING WORLD · CHARACTER IDENTITY · MAGIC/g,'STABILITY & QUALITY OF LIFE')};
const ir0661ShellBase=shell;
shell=function(inner){return ir0661ShellBase(inner).replace(/VERSION 0\.[0-9]+(?:\.[0-9]+)?(?:\.\d+)?/g,`VERSION ${IR0661_GAME_VERSION}`).replace(/INFINITE REALMS · EARLY PLAYABLE FOUNDATION · YOUR CHOICES SHAPE THIS LIFE/g,`INFINITE REALMS · VERSION ${IR0661_GAME_VERSION} · YOUR CHOICES SHAPE THIS LIFE`).replace(/AUTOSAVE ENABLED/g,'AUTOSAVE ENABLED · BACK UP REGULARLY')};
const ir0661TitleBase=renderTitle;
renderTitle=function(){return ir0661TitleBase().replace(/VERSION 0\.[0-9]+(?:\.[0-9]+)?(?:\.\d+)?/g,`VERSION ${IR0661_GAME_VERSION}`)};

// Keyboard navigation now includes People and Skills (6 and 7); preserve existing shortcuts.
document.addEventListener('keydown',function(e){
 if(e.defaultPrevented||modal||!state?.character)return;
 const t=e.target;if(t&&(t.matches('input,textarea,select,[contenteditable="true"]')))return;
 if(e.altKey||e.ctrlKey||e.metaKey)return;
 if(e.key==='6'||e.key==='7'){
   const tab=NAV[Number(e.key)-1]?.[0];
   if(tab){e.preventDefault();setTab(tab);}
 }
});

// Add clear pack-load and gear-condition feedback without changing existing item actions.
const ir0661InventoryBase=renderInventory;
renderInventory=function(){
 let html=ir0661InventoryBase();
 const weight=ir04CarryWeight(),capacity=ir04CarryCapacity(),over=weight>capacity;
 const c=state.character,eq=c.equipment||{};
 const worn=Object.entries(eq).filter(([,id])=>id&&c.itemCondition?.[id]!=null&&Number(c.itemCondition[id])<=25);
 const status=`<section class="panel panel-pad ir0661-pack-status ${over?'is-overloaded':''}"><div class="ir0661-pack-top"><div><strong>${over?'Pack over capacity':'Pack capacity'}</strong><p>${weight} / ${capacity} weight · ${over?'Reduce carried items before gathering more.':'You have room to carry more supplies.'}</p></div><span class="tag ${over?'danger':'gold'}">${over?'OVERLOADED':`${Math.max(0,capacity-weight).toFixed(1)} FREE`}</span></div>${worn.length?`<div class="ir0661-gear-warning"><strong>Equipment needs attention</strong><p>${worn.map(([slot,id])=>`${esc(ITEMS[id]?.name||id)} (${Number(c.itemCondition[id])}%)`).join(' · ')}. Repair worn gear when a repair service is available.</p></div>`:''}<div class="actions-row"><button class="button small subtle" data-tab="Skills">Training & proficiency</button><button class="button small subtle" data-tab="Character">Character stats</button></div></section>`;
 if(html.includes('<section class="panel panel-pad ir065-inventory-bridge">'))html=html.replace('<section class="panel panel-pad ir065-inventory-bridge">',status+'<section class="panel panel-pad ir065-inventory-bridge">');
 else if(html.includes('<div class="ir051-inventory-toolbar">'))html=html.replace('<div class="ir051-inventory-toolbar">',status+'<div class="ir051-inventory-toolbar">');
 else html=html.replace('<div class="grid two">',status+'<div class="grid two">');
 return html;
};
const ir0661Css=document.createElement('style');
ir0661Css.textContent=`.ir0661-pack-status{margin-bottom:12px}.ir0661-pack-top{display:flex;justify-content:space-between;align-items:center;gap:12px}.ir0661-pack-top strong,.ir0661-gear-warning strong{font-size:13px}.ir0661-pack-top p,.ir0661-gear-warning p{font-size:11px;color:var(--muted,#aaa);line-height:1.65;margin:4px 0 0}.ir0661-pack-status.is-overloaded{border-color:rgba(204,115,91,.65);background:rgba(204,115,91,.06)}.ir0661-gear-warning{margin-top:10px;padding:10px;border-radius:8px;border:1px solid rgba(204,164,86,.28);background:rgba(204,164,86,.05)}.ir0661-pack-status .actions-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ir0661-pack-top .tag.danger{color:#e59a85;border-color:rgba(204,115,91,.55)}@media(max-width:600px){.ir0661-pack-top{align-items:flex-start;flex-direction:column}}`;
document.head.appendChild(ir0661Css);

// Correct visible version metadata in the page after all legacy wrappers are installed.
