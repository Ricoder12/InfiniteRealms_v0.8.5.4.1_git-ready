'use strict';
// ================= Infinite Realms v0.6.8: progression, balance & regression hardening =================
document.title=`Infinite Realms — Version ${IR068_GAME_VERSION}`;
function ir068ClampNum(value,min,max,fallback=min){const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
function ir068NormalizeRuntime(s){
 if(!s||!s.character)return s;
 const c=s.character;
 c.coin=Math.floor(ir068ClampNum(c.coin,0,999999999,0));
 c.daysLived=Math.floor(ir068ClampNum(c.daysLived,0,100000000,0));
 c.ageMonths=Math.floor(ir068ClampNum(c.ageMonths,0,24000,0));
 for(const k of ['energy','hunger','mood','health','maxHealth'])if(c[k]!=null)c[k]=ir068ClampNum(c[k],0,k==='maxHealth'?100000:100, k==='maxHealth'?100:50);
 c.attrs=c.attrs&&typeof c.attrs==='object'?c.attrs:{};
 for(const [key,value] of Object.entries(c.attrs))c.attrs[key]=Math.floor(ir068ClampNum(value,1,40,1));
 c.skills=c.skills&&typeof c.skills==='object'?c.skills:{};
 for(const [key,skill] of Object.entries(c.skills)){
  const sk=skill&&typeof skill==='object'?skill:{};
  sk.level=Math.floor(ir068ClampNum(sk.level,1,100,1));
  sk.xp=Math.floor(ir068ClampNum(sk.xp,0,99,0));
  c.skills[key]=sk;
 }
 c.inventory=c.inventory&&typeof c.inventory==='object'?c.inventory:{};
 for(const [key,value] of Object.entries(c.inventory))c.inventory[key]=Math.floor(ir068ClampNum(value,0,999999,0));
 c.itemCondition=c.itemCondition&&typeof c.itemCondition==='object'?c.itemCondition:{};
 for(const [key,value] of Object.entries(c.itemCondition))c.itemCondition[key]=Math.floor(ir068ClampNum(value,0,100,100));
 c.relationships=c.relationships&&typeof c.relationships==='object'?c.relationships:{};
 for(const [id,rel0] of Object.entries(c.relationships)){
  const rel=rel0&&typeof rel0==='object'?rel0:{};
  rel.affinity=ir068ClampNum(rel.affinity,-100,100,0);rel.trust=ir068ClampNum(rel.trust,-100,100,0);
  rel.status=String(rel.status||'Acquaintance').slice(0,40);
  rel.milestones=Array.isArray(rel.milestones)?rel.milestones.filter(x=>typeof x==='string').slice(0,100):[];
  c.relationships[id]=rel;
 }
 c.equipment=c.equipment&&typeof c.equipment==='object'?c.equipment:{};
 s.world=s.world&&typeof s.world==='object'?s.world:{};
 s.gameVersion=IR068_GAME_VERSION;s.saveSchemaVersion=IR068_SAVE_SCHEMA;
 return s;
}
const ir068NormalizeBase=normalizeSave;
normalizeSave=function(input){return ir068NormalizeRuntime(ir068NormalizeBase(input))};
function ir068ValidateLiveState(){
 if(!state?.character)return;
 ir068NormalizeRuntime(state);
 const c=state.character;
 // Ensure equipment references remain valid and owned after normalization/import.
 for(const [slot,id] of Object.entries(c.equipment||{})){
  if(!id)continue;
  const known=!!ITEMS[id]||!!IR_WEAPON_DATA?.[id]||!!IR_V05_GEAR?.[id];
  if(!known||Number(c.inventory[id])<=0)c.equipment[slot]=null;
 }
 const v=state.world?.v067;
 if(v&&Array.isArray(v.events)){
  const seen=new Set();v.events=v.events.filter(e=>{if(!e||typeof e!=='object')return false;const id=String(e.id||'');if(!id||seen.has(id))return false;seen.add(id);return true}).slice(0,1500);
 }
}
const ir068PersistBase=persist;
persist=function(){
 if(state?.character){ir068ValidateLiveState();state.gameVersion=IR068_GAME_VERSION;state.saveSchemaVersion=IR068_SAVE_SCHEMA;}
 const ok=ir068PersistBase();
 // Older layered wrappers set their own version before writing; restore and rewrite the active release metadata.
 if(state?.character){state.gameVersion=IR068_GAME_VERSION;state.saveSchemaVersion=IR068_SAVE_SCHEMA;try{localStorage.setItem(SAVE_KEY,JSON.stringify(state))}catch(e){}}
 const status=document.querySelector('#saveStatus');if(status&&state?.character)status.title=`Autosaved · Infinite Realms ${IR068_GAME_VERSION}`;
 return ok;
};
const ir068GainSkillBase=gainSkill;
gainSkill=function(name,amount){
 if(!state?.character||!state.character.skills?.[name])return;
 const n=Number(amount);if(!Number.isFinite(n)||n<=0)return;
 const sk=state.character.skills[name];sk.level=Math.floor(ir068ClampNum(sk.level,1,100,1));sk.xp=Math.floor(ir068ClampNum(sk.xp,0,99,0));
 ir068GainSkillBase(name,Math.min(10000,n));
 sk.level=Math.floor(ir068ClampNum(sk.level,1,100,1));sk.xp=Math.floor(ir068ClampNum(sk.xp,0,99,0));
};
const ir068ActionCostBase=actionCost;
actionCost=function(energy){
 if(!state?.character)return false;
 const need=Math.max(0,Number(energy)||0),c=state.character;
 if(Number(c.energy||0)<need){toast(`You need ${need} energy, but have ${Math.max(0,Number(c.energy)||0)}. Rest before trying again.`);return false}
 if(Number(c.hunger||0)<8){toast('You are too hungry to do this effectively. Eat before continuing.');return false}
 return ir068ActionCostBase(energy);
};
// Add a transparent progression/economy health panel to Skills without changing established formulas.
const ir068SkillsBase=ir064SkillScreen;
ir064SkillScreen=function(){
 let html=ir068SkillsBase();
 const c=state.character,skills=Object.values(c.skills||{}),highest=skills.reduce((m,s)=>Math.max(m,Number(s?.level)||1),1),lowEnergy=(Number(c.energy)||0)<20,lowFunds=(Number(c.coin)||0)<5;
 const text=lowEnergy?'Energy is low; resting before a long training session may help.':lowFunds?'Funds are low; consider work or low-cost activities before paying for study.':'You have room to plan your next training session. Costs and gains remain tied to each activity.';
 const panel=`<section class="panel panel-pad ir068-progress-audit"><div class="panel-heading"><div><h3>Progression & readiness</h3><p>A quick check before committing time and resources.</p></div><span class="tag gold">V0.7.2</span></div><div class="ir068-audit-grid"><div><span>Highest skill</span><strong>Lv. ${highest}</strong></div><div><span>Energy</span><strong>${Math.round(Number(c.energy)||0)} / 100</strong></div><div><span>Available coins</span><strong>${Math.floor(Number(c.coin)||0)} ◈</strong></div><div><span>Tracked skills</span><strong>${skills.length}</strong></div></div><p class="ir068-audit-note">${text}</p><p class="ir068-audit-note">Training, work, study, and mentorship retain their existing costs and formulas; this release focuses on consistent data, feedback, and regression safety rather than untested balance changes.</p></section>`;
 const marker='<div class="ir064-skill-overview">';
 return html.includes(marker)?html.replace(marker,panel+marker):html+panel;
};
// Use the active release version consistently in headers, title screen, and backups.
const ir068TopbarBase=topbar;
topbar=function(){return ir068TopbarBase().replace(/VERSION 0\.[0-9]+(?:\.[0-9]+)?(?:\.\d+)?/g,`VERSION ${IR068_GAME_VERSION}`).replace(/JOURNAL & WORLD HISTORY/g,'PROGRESSION & BALANCE')};
const ir068ShellBase=shell;
shell=function(inner){return ir068ShellBase(inner).replace(/VERSION 0\.[0-9]+(?:\.[0-9]+)?(?:\.\d+)?/g,`VERSION ${IR068_GAME_VERSION}`).replace(/JOURNAL & WORLD HISTORY/g,'PROGRESSION & BALANCE')};
const ir068TitleBase=renderTitle;
renderTitle=function(){return ir068TitleBase().replace(/VERSION 0\.[0-9]+(?:\.[0-9]+)?(?:\.\d+)?/g,`VERSION ${IR068_GAME_VERSION}`).replace(/JOURNAL & WORLD HISTORY/g,'PROGRESSION & BALANCE')};
exportSave=function(){
 try{
  if(!state?.character){toast('There is no active life to back up.');return}
  ir068ValidateLiveState();state.gameVersion=IR068_GAME_VERSION;state.saveSchemaVersion=IR068_SAVE_SCHEMA;
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  const name=(state.character.name||'save').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'save';
  a.href=url;a.download=`infinite-realms-${name}-v072-backup.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
  state.character.lastExportReminderDay=state.character.daysLived||0;persist();toast(`Backup exported for Infinite Realms ${IR068_GAME_VERSION}.`);
 }catch(e){toast('Backup export failed. Your current life remains open; try again or save a manual slot.')}
};
const ir068Css=document.createElement('style');
ir068Css.textContent=`.ir068-progress-audit{margin:0 0 14px}.ir068-audit-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.ir068-audit-grid>div{padding:11px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.02);min-width:0}.ir068-audit-grid span{display:block;color:var(--muted);font-size:10px}.ir068-audit-grid strong{display:block;margin-top:4px;font-size:15px;overflow-wrap:anywhere}.ir068-audit-note{font-size:11px;line-height:1.65;color:var(--muted);margin:11px 0 0}.ir068-audit-note:last-child{margin-top:5px}@media(max-width:700px){.ir068-audit-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
document.head.appendChild(ir068Css);
// Final version metadata must be set after earlier version wrappers have initialized.
// ================= End v0.6.8 =================
