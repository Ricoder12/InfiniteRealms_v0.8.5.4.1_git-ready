'use strict';
// ================= Infinite Realms v0.6.7: unified Journal & World History =================
document.title=`Infinite Realms — Version ${IR067_GAME_VERSION}`;
NAV.push(['Journal','📖']);
let ir067Filter='all',ir067Search='';
function ir067World(){
 const w=state?.world||(state.world={});
 const v=w.v067||(w.v067={schema:1,events:[],milestones:[],nextId:1});
 v.schema=1;v.events=Array.isArray(v.events)?v.events:[];v.milestones=Array.isArray(v.milestones)?v.milestones:[];
 v.nextId=Math.max(1,Number(v.nextId)||1);
 return v;
}
function ir067Date(){
 const cal=state?.calendar||{};
 return `Day ${Math.max(1,Number(cal.day)||1)} · Month ${Math.max(1,Number(cal.month)||1)} · Year ${Math.max(1,Number(cal.year)||1)}`;
}
function ir067Category(title,detail,type){
 const text=`${title||''} ${detail||''}`.toLowerCase();
 if(/relationship|friend|companion|lover|mentor|talked with|friendship|romance|gift|favor|trust|affinity|social/.test(text))return 'relationship';
 if(/travel|arriv|journey|visited|location|settlement|region|discover|explor|scout|forag|dungeon|hunt|ruin|biome/.test(text)||type==='travel'||type==='discovery')return 'exploration';
 if(/skill|training|trained|practice|level up|mastery|attribute|talent|spell|magic/.test(text))return 'skill';
 if(/combat|defeat|victor|monster|enemy|ambush|damage|battle|hunt/.test(text))return 'combat';
 if(/inventory|equip|gear|item|craft|repair|weapon|armor|potion|bought|sold/.test(text))return 'inventory';
 if(/job|work|career|shift|wage|promotion|quit/.test(text))return 'career';
 if(/milestone|achievement|reached age|birthday|years old/.test(text)||type==='milestone')return 'milestone';
 if(/warning|failed|unable|declined|injur|danger|broken/.test(text)||type==='warning')return 'notice';
 return 'life';
}
function ir067Importance(title,detail,type){
 const text=`${title||''} ${detail||''}`.toLowerCase();
 if(type==='milestone'||type==='discovery'||type==='warning'||type==='travel'||/first time|new skill|reached level|major|rare|completed|promoted|relationship became|became friends|dungeon/.test(text))return 'major';
 if(type==='activity'&& !/relationship|friend|mentor|companion|lover|discovery|travel|combat|skill|career|craft|equip|milestone|warning/.test(text))return 'routine';
 return 'notable';
}
function ir067AddEvent(data){
 if(!state?.character)return null;
 const v=ir067World(),title=String(data?.title||'Journal entry').slice(0,140),description=String(data?.description||'').slice(0,700);
 const category=data?.category||ir067Category(title,description,data?.type);
 const day=Math.max(0,Number(state.character.daysLived)||0);
 const duplicate=v.events.find(e=>e.day===day&&e.title===title&&e.description===description&&e.category===category);
 if(duplicate)return duplicate;
 const id=`ir067-${v.nextId++}`;
 const event={id,day,date:String(data?.date||ir067Date()),category,importance:data?.importance||ir067Importance(title,description,data?.type),title,description,icon:String(data?.icon||'📖').slice(0,8),locationId:data?.locationId||state.world?.siteId||null,relatedNpcId:data?.relatedNpcId||null,metadata:data?.metadata&&typeof data.metadata==='object'?data.metadata:{}};
 v.events.unshift(event);
 // Retain a generous history while keeping local saves bounded.
 if(v.events.length>1500)v.events.length=1500;
 return event;
}
const ir067AddFeedBase=addFeed;
addFeed=function(icon,title,detail,type='activity'){
 const result=ir067AddFeedBase(icon,title,detail,type);
 if(state?.character){
  const category=ir067Category(title,detail,type),importance=ir067Importance(title,detail,type);
  const text=`${title||''} ${detail||''}`.toLowerCase();
  const worthKeeping=type!=='activity'||importance!=='routine'||/relationship|friend|mentor|companion|lover|travel|arriv|discover|skill|training|combat|monster|dungeon|career|promotion|craft|equipment|milestone|achievement/.test(text);
  if(worthKeeping)ir067AddEvent({icon,title,description:detail,type,category,importance});
 }
 return result;
};
// Add social memories to the unified timeline while preserving the original People Journal.
const ir067RememberBase=ir06Remember;
ir06Remember=function(n,text,kind='memory'){
 ir067RememberBase(n,text,kind);
 if(n?.id)ir067AddEvent({icon:n.icon||'♧',title:`${kind==='conversation'?'Conversation':kind==='gift'?'Gift':kind==='favor'?'Favor':kind==='training'?'Mentor training':'Relationship memory'} · ${n.name}`,description:text,category:'relationship',importance:['training','favor'].includes(kind)?'notable':'major',relatedNpcId:n.id,metadata:{kind}});
};
// Normalize old saves without replacing the existing v0.6 NPC/social journal.
const ir067NormalizeBase=normalizeSave;
normalizeSave=function(input){
 const s=ir067NormalizeBase(input);
 if(!s||!s.character)return s;
 s.gameVersion=IR067_GAME_VERSION;s.saveSchemaVersion=IR067_SAVE_SCHEMA;
 const v=s.world||(s.world={});
 v.v067=v.v067&&typeof v.v067==='object'?v.v067:{schema:1,events:[],milestones:[],nextId:1};
 v.v067.schema=1;
 v.v067.events=Array.isArray(v.v067.events)?v.v067.events.filter(e=>e&&typeof e==='object').slice(0,1500).map((e,i)=>({id:String(e.id||`legacy-${i}`),day:Math.max(0,Number(e.day)||0),date:String(e.date||''),category:['life','relationship','exploration','skill','combat','inventory','career','milestone','notice'].includes(e.category)?e.category:'life',importance:['major','notable','routine'].includes(e.importance)?e.importance:'notable',title:String(e.title||'Journal entry').slice(0,140),description:String(e.description||'').slice(0,700),icon:String(e.icon||'📖').slice(0,8),locationId:e.locationId||null,relatedNpcId:e.relatedNpcId||null,metadata:e.metadata&&typeof e.metadata==='object'?e.metadata:{}})): [];
 v.v067.milestones=Array.isArray(v.v067.milestones)?v.v067.milestones.filter(x=>x&&typeof x==='object'&&x.id).slice(0,100):[];
 v.v067.nextId=Math.max(1,Number(v.v067.nextId)||v.v067.events.length+1);
 return s;
};
function ir067SeedLegacyHistory(){
 if(!state?.character)return;
 const v=ir067World();if(v.legacyImported)return;
 const existingIds=new Set(v.events.map(e=>e.id));
 const oldFeed=Array.isArray(state.feed)?state.feed.slice(0,150):[];
 oldFeed.slice().reverse().forEach((e,i)=>{
  const title=String(e.title||'Journal entry'),description=String(e.detail||'');
  const id=`legacy-feed-${i}-${String(e.date||'').replace(/[^a-z0-9]/gi,'').slice(0,16)}`;
  if(existingIds.has(id))return;
  v.events.push({id,day:0,date:String(e.date||'Earlier in this life'),category:ir067Category(title,description,e.type),importance:ir067Importance(title,description,e.type),title,description,icon:String(e.icon||'📖'),locationId:null,relatedNpcId:null,metadata:{migratedFrom:'feed'}});
  existingIds.add(id);
 });
 const oldSocial=Array.isArray(state.world?.v06?.journal)?state.world.v06.journal.slice(0,100):[];
 oldSocial.slice().reverse().forEach((e,i)=>{
  const title=`${e.kind==='conversation'?'Conversation':e.kind==='gift'?'Gift':e.kind==='favor'?'Favor':e.kind==='training'?'Mentor training':'Relationship memory'} · ${e.npc||'Known person'}`;
  const description=String(e.text||'');
  const id=`legacy-social-${i}-${String(e.date||'').replace(/[^a-z0-9]/gi,'').slice(0,16)}-${String(e.npc||'').replace(/[^a-z0-9]/gi,'').slice(0,10)}`;
  if(existingIds.has(id))return;
  v.events.push({id,day:Math.max(0,Number(e.day)||0),date:String(e.date||'Earlier in this life'),category:'relationship',importance:'notable',title,description,icon:'♧',locationId:null,relatedNpcId:null,metadata:{migratedFrom:'people-journal'}});
  existingIds.add(id);
 });
 v.events.sort((a,b)=>(Number(b.day)||0)-(Number(a.day)||0));v.events=v.events.slice(0,1500);
 v.legacyImported=true;
}
function ir067MilestoneDefinitions(){
 const c=state.character,w=state.world||{},skills=c.skills||{},rels=c.relationships||{},visited=new Set([...(w.visited||[]),w.siteId].filter(Boolean));
 const levels=Object.values(skills).map(x=>Number(x?.level)||1),maxSkill=Math.max(1,...levels);
 const close=Object.values(rels).filter(r=>['Friend','Companion','Lover','Mentor'].includes(r?.status)).length;
 const inventory=Object.values(c.inventory||{}).reduce((a,n)=>a+Math.max(0,Number(n)||0),0);
 const discoveries=Array.isArray(c.discoveries)?c.discoveries.length:0;
 const ageMonths=Number(c.ageMonths)||0,days=Number(c.daysLived)||0,shifts=Number(c.jobShifts)||0;
 return [
  ['first_steps','First Steps','Begin a new life in the realm.','✦',true],
  ['one_week','A Week in the Making','Live for at least seven in-game days.','📅',days>=7],
  ['one_month','A Month Goes By','Live for at least thirty in-game days.','🌙',days>=30],
  ['seasoned_life','Seasoned Life','Live for at least one hundred in-game days.','⌛',days>=100],
  ['world_wanderer','World Wanderer','Visit at least three distinct locations.','🧭',visited.size>=3],
  ['far_roads','Far Roads','Visit at least eight distinct locations.','🗺️',visited.size>=8],
  ['first_discovery','Curious Mind','Record your first discovery.','🔎',discoveries>=1],
  ['collector','Collector','Carry at least ten items in total.','🎒',inventory>=10],
  ['working_life','Working Life','Complete five job shifts.','🛠️',shifts>=5],
  ['steady_worker','Reliable Hand','Complete twenty job shifts.','⚒️',shifts>=20],
  ['first_friend','A Familiar Face','Establish your first close relationship.','🤝',close>=1],
  ['social_circle','A Growing Circle','Establish three close relationships.','👥',close>=3],
  ['skill_five','Practiced Talent','Reach level 5 in any skill.','📘',maxSkill>=5],
  ['skill_ten','Dedicated Student','Reach level 10 in any skill.','🎓',maxSkill>=10],
  ['many_skills','Versatile','Develop at least five skills to level 3 or higher.','✦',levels.filter(n=>n>=3).length>=5],
  ['first_hundred_coins','A Small Fortune','Carry at least 100 coins.','◈',(Number(c.coin)||0)>=100],
  ['five_hundred_coins','Comfortable Means','Carry at least 500 coins.','💰',(Number(c.coin)||0)>=500],
  ['well_equipped','Ready for the Road','Equip a weapon and at least one other gear slot.','🛡️',!!c.equipment?.weapon&&Object.entries(c.equipment||{}).some(([slot,id])=>slot!=='weapon'&&!!id)],
  ['regional_memory','Regional Memory','Have visited a location and recorded an event there.','📜',visited.size>=2&&ir067World().events.length>=5],
  ['long_chronicle','A Life Remembered','Record twenty journal events.','📖',ir067World().events.length>=20]
 ].map(([id,title,description,icon,unlocked])=>({id,title,description,icon,unlocked:!!unlocked}));
}
function ir067EvaluateMilestones(){
 if(!state?.character)return;
 const v=ir067World(),known=new Set(v.milestones.map(m=>m.id));
 for(const m of ir067MilestoneDefinitions()){
  if(m.unlocked&&!known.has(m.id)){
   const award={id:m.id,title:m.title,description:m.description,icon:m.icon,day:Number(state.character.daysLived)||0,date:ir067Date()};
   v.milestones.unshift(award);
   ir067AddEvent({icon:m.icon,title:`Milestone earned: ${m.title}`,description:m.description,category:'milestone',importance:'major',metadata:{milestoneId:m.id}});
   known.add(m.id);
  }
 }
 v.milestones=v.milestones.slice(0,100);
}
function ir067Esc(s){return esc(String(s??''));}
function ir067JournalScreen(){
 ir067SeedLegacyHistory();
 ir067EvaluateMilestones();
 const v=ir067World(),c=state.character,w=state.world||{};
 const all=v.events.slice().sort((a,b)=>(b.day-a.day)||(String(b.id).localeCompare(String(a.id))));
 const categories=[['all','All entries'],['life','Life'],['relationship','Relationships'],['exploration','Exploration'],['skill','Skills'],['combat','Combat'],['inventory','Inventory'],['career','Career'],['milestone','Milestones'],['notice','Notices']];
 const filtered=all.filter(e=>(ir067Filter==='all'||e.category===ir067Filter)&&(ir067Search===''||`${e.title} ${e.description} ${e.date} ${e.category}`.toLowerCase().includes(ir067Search.toLowerCase())));
 const visits=new Set([...(w.visited||[]),w.siteId].filter(Boolean)).size;
 const close=Object.values(c.relationships||{}).filter(r=>['Friend','Companion','Lover','Mentor'].includes(r?.status)).length;
 const topMilestones=v.milestones.slice(0,4);
 const filterHtml=categories.map(([id,label])=>`<button class="button small ${ir067Filter===id?'primary':'subtle'}" data-ir067-action="filter" data-filter="${id}">${label}</button>`).join('');
 const eventHtml=filtered.slice(0,150).map(e=>`<article class="ir067-event ${e.importance==='major'?'is-major':''}"><div class="ir067-event-icon">${ir067Esc(e.icon||'📖')}</div><div class="ir067-event-body"><div class="ir067-event-top"><strong>${ir067Esc(e.title)}</strong><span class="tag ${e.importance==='major'?'gold':''}">${ir067Esc(e.importance)}</span></div><p>${ir067Esc(e.description)}</p><div class="ir067-event-meta"><span>${ir067Esc(e.date||`Day ${e.day||0}`)}</span><span>${ir067Esc(categories.find(x=>x[0]===e.category)?.[1]||'Life')}</span>${e.relatedNpcId?`<span>NPC record</span>`:''}</div></div></article>`).join('');
 return `${pageHead('Journal & World History','A persistent chronicle of your life, relationships, discoveries, and milestones.')}<section class="hero ir067-hero"><div class="hero-content"><div class="avatar">📖</div><div><div class="eyebrow">THE CHRONICLE OF YOUR LIFE</div><h2>${ir067Esc(c.name||'Wayfarer')}</h2><p>${ir067Esc(RACES[c.race]?.name||c.race||'Adventurer')} · Age ${ir067Esc(ageLabel(c.ageMonths||0))} · ${ir067Esc(site()?.name||'Unknown location')}</p><div class="hero-meta"><span class="tag gold">${v.events.length} RECORDED EVENTS</span><span class="tag">${v.milestones.length} MILESTONES</span><span class="tag">${visits} PLACES KNOWN</span></div></div></div></section><div class="ir067-overview"><div class="panel panel-pad"><span>Days lived</span><strong>${Number(c.daysLived)||0}</strong></div><div class="panel panel-pad"><span>Close relationships</span><strong>${close}</strong></div><div class="panel panel-pad"><span>Locations visited</span><strong>${visits}</strong></div><div class="panel panel-pad"><span>Discoveries</span><strong>${Array.isArray(c.discoveries)?c.discoveries.length:0}</strong></div></div><div class="grid two ir067-main-grid"><section class="panel panel-pad"><div class="panel-heading"><div><h2>Life Timeline</h2><p>Search and filter the events that shaped this life.</p></div><span class="tag">${filtered.length} MATCHES</span></div><div class="ir067-search"><input id="ir067-search" value="${ir067Esc(ir067Search)}" placeholder="Search people, places, skills, events…" maxlength="100"/><button class="button small" data-ir067-action="search-apply">Search</button><button class="button small subtle" data-ir067-action="search-clear">Clear</button></div><div class="ir067-filters">${filterHtml}</div><div class="ir067-event-list">${eventHtml||'<div class="empty">No events match this view yet. Keep living, exploring, training, and meeting people; meaningful events will be recorded here.</div>'}</div>${filtered.length>150?`<p class="ir067-muted">Showing the newest 150 matching events. Refine your search to find older entries.</p>`:''}</section><aside class="ir067-side"><section class="panel panel-pad"><div class="panel-heading"><div><h2>Recent Milestones</h2><p>Achievements earned through actual progress.</p></div><span class="tag gold">${v.milestones.length}</span></div>${topMilestones.map(m=>`<div class="ir067-milestone"><span>${ir067Esc(m.icon||'✦')}</span><div><strong>${ir067Esc(m.title)}</strong><p>${ir067Esc(m.description)}</p><small>${ir067Esc(m.date||`Day ${m.day||0}`)}</small></div></div>`).join('')||'<div class="empty">Your first milestones will appear as you make progress.</div>'}<div class="ir067-actions"><button class="button small subtle" data-ir067-action="filter" data-filter="milestone">View milestones</button><button class="button small subtle" data-ir067-action="filter" data-filter="relationship">Relationship history</button></div></section><section class="panel panel-pad"><div class="panel-heading"><div><h2>World Memory</h2><p>Places and people recorded along the way.</p></div></div><div class="ir067-memory-stat"><span>Known residents</span><strong>${(c.npcs||[]).length}</strong></div><div class="ir067-memory-stat"><span>People journal notes</span><strong>${(w.v06?.journal||[]).length}</strong></div><div class="ir067-memory-stat"><span>Current region</span><strong>${ir067Esc(w.region?.name||'Unknown')}</strong></div><p class="ir067-muted">This chronicle adds to the existing People Journal; it does not replace NPC memories or relationship data.</p><div class="ir067-actions"><button class="button small" data-tab="People">Open People</button><button class="button small subtle" data-tab="Skills">Open Skills</button><button class="button small subtle" data-tab="World">Explore World</button></div></section></aside></div>`;
}
const ir067RenderBase=render;
render=function(){
 if(state?.character&&state.view==='Journal'){
  ir067EvaluateMilestones();
  const app=$('#app');app.innerHTML=shell(ir067JournalScreen());persist();
  if(typeof ir051AfterRender==='function')ir051AfterRender();
  return;
 }
 return ir067RenderBase();
};
const ir067PersistBase=persist;
persist=function(){
 if(state?.character){
  state.gameVersion=IR067_GAME_VERSION;state.saveSchemaVersion=IR067_SAVE_SCHEMA;
  ir067EvaluateMilestones();
 }
 return ir067PersistBase();
};
const ir067ExportBase=exportSave;
exportSave=function(){
 const prior=IR0661_GAME_VERSION;
 try{
  state.gameVersion=IR067_GAME_VERSION;state.saveSchemaVersion=IR067_SAVE_SCHEMA;
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  const name=(state.character?.name||'save').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'save';
  a.href=url;a.download=`infinite-realms-${name}-v067-backup.json`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
  if(state.character)state.character.lastExportReminderDay=state.character.daysLived||0;
  persist();toast(`Backup exported for Infinite Realms ${IR067_GAME_VERSION}.`);
 }catch(e){toast('Backup export failed. Your current life remains open; try another browser or export location.');}
};
const ir067TopbarBase=topbar;
topbar=function(){return ir067TopbarBase().replace(/VERSION 0\.[0-9]+(?:\.[0-9]+)?(?:\.\d+)?/g,`VERSION ${IR067_GAME_VERSION}`).replace(/STABILITY & QUALITY OF LIFE/g,'JOURNAL & WORLD HISTORY')};
const ir067ShellBase=shell;
shell=function(inner){return ir067ShellBase(inner).replace(/VERSION 0\.[0-9]+(?:\.[0-9]+)?(?:\.\d+)?/g,`VERSION ${IR067_GAME_VERSION}`).replace(/STABILITY & QUALITY OF LIFE/g,'JOURNAL & WORLD HISTORY')};
const ir067TitleBase=renderTitle;
renderTitle=function(){return ir067TitleBase().replace(/VERSION 0\.[0-9]+(?:\.[0-9]+)?(?:\.\d+)?/g,`VERSION ${IR067_GAME_VERSION}`)};
const ir067Css=document.createElement('style');
ir067Css.textContent=`
.ir067-hero{margin-bottom:14px}.ir067-hero .hero-content{display:flex;align-items:center;gap:14px}.ir067-hero h2{margin:2px 0 6px}.ir067-hero p{margin:0;color:var(--muted,#aaa);font-size:12px;line-height:1.6}.ir067-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.ir067-overview .panel{display:flex;flex-direction:column;gap:5px}.ir067-overview span{font-size:10px;color:var(--muted,#aaa)}.ir067-overview strong{font-size:20px}.ir067-main-grid{align-items:start}.ir067-main-grid>section.panel{height:min(76vh,900px);min-height:420px;display:flex;flex-direction:column;overflow:hidden}.ir067-main-grid>section.panel>.panel-heading{flex:0 0 auto}.ir067-main-grid>section.panel>.ir067-search,.ir067-main-grid>section.panel>.ir067-filters{flex:0 0 auto}.ir067-event-list{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-right:5px;scrollbar-gutter:stable}.ir067-event-list::-webkit-scrollbar{width:8px}.ir067-event-list::-webkit-scrollbar-thumb{background:var(--line,rgba(255,255,255,.16));border-radius:8px}.ir067-side{display:flex;flex-direction:column;gap:14px;min-width:0}.ir067-search{display:flex;gap:7px;align-items:center;margin:12px 0;flex-wrap:wrap}.ir067-search input{flex:1;min-width:150px}.ir067-filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.ir067-event-list{display:flex;flex-direction:column;gap:8px}.ir067-event{display:flex;gap:10px;padding:11px;border:1px solid var(--line,rgba(255,255,255,.09));border-radius:10px;min-width:0}.ir067-event.is-major{border-color:rgba(205,172,105,.4);background:rgba(205,172,105,.035)}.ir067-event-icon{display:grid;place-items:center;flex:0 0 34px;height:34px;border-radius:9px;background:rgba(255,255,255,.045);font-size:17px}.ir067-event-body{min-width:0;flex:1}.ir067-event-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.ir067-event-top strong{font-size:12px;line-height:1.5;overflow-wrap:anywhere}.ir067-event-top .tag{font-size:9px;white-space:nowrap}.ir067-event p{font-size:11px;line-height:1.65;color:var(--muted,#aaa);margin:5px 0 8px;overflow-wrap:anywhere}.ir067-event-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:9px;color:var(--muted,#888)}.ir067-milestone{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--line,rgba(255,255,255,.07))}.ir067-milestone>span{font-size:20px}.ir067-milestone>div{min-width:0}.ir067-milestone strong{font-size:12px}.ir067-milestone p{font-size:11px;line-height:1.6;color:var(--muted,#aaa);margin:4px 0}.ir067-milestone small{font-size:9px;color:var(--muted,#888)}.ir067-memory-stat{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line,rgba(255,255,255,.07));font-size:11px}.ir067-memory-stat span{color:var(--muted,#aaa)}.ir067-memory-stat strong{font-size:11px;text-align:right;overflow-wrap:anywhere}.ir067-muted{font-size:10px;color:var(--muted,#888);line-height:1.7}.ir067-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}@media(max-width:760px){.ir067-main-grid>section.panel{height:70vh;min-height:360px}.ir067-overview{grid-template-columns:repeat(2,minmax(0,1fr))}.ir067-hero .hero-content{align-items:flex-start}.ir067-main-grid{grid-template-columns:1fr}.ir067-search input{flex-basis:100%}}`;
document.head.appendChild(ir067Css);
document.addEventListener('click',function(e){
 const b=e.target.closest('[data-ir067-action]');if(!b)return;
 e.preventDefault();e.stopPropagation();
 const a=b.dataset.ir067Action;
 if(a==='filter'){ir067Filter=b.dataset.filter||'all';render();return}
 if(a==='search-apply'){ir067Search=String(document.querySelector('#ir067-search')?.value||'').trim().slice(0,100);render();return}
 if(a==='search-clear'){ir067Search='';ir067Filter='all';render();return}
});
document.addEventListener('input',function(e){
 if(e.target?.id!=='ir067-search')return;
 ir067Search=String(e.target.value||'').trim().slice(0,100);
 const list=e.target.closest('.panel')?.querySelector('.ir067-event-list');
 if(!list)return;
 const v=ir067World(),categories=[['all','All entries'],['life','Life'],['relationship','Relationships'],['exploration','Exploration'],['skill','Skills'],['combat','Combat'],['inventory','Inventory'],['career','Career'],['milestone','Milestones'],['notice','Notices']];
 const filtered=v.events.slice().sort((a,b)=>(b.day-a.day)||(String(b.id).localeCompare(String(a.id)))).filter(ev=>(ir067Filter==='all'||ev.category===ir067Filter)&&(ir067Search===''||`${ev.title} ${ev.description} ${ev.date} ${ev.category}`.toLowerCase().includes(ir067Search.toLowerCase())));
 list.innerHTML=filtered.slice(0,150).map(ev=>`<article class="ir067-event ${ev.importance==='major'?'is-major':''}"><div class="ir067-event-icon">${ir067Esc(ev.icon||'📖')}</div><div class="ir067-event-body"><div class="ir067-event-top"><strong>${ir067Esc(ev.title)}</strong><span class="tag ${ev.importance==='major'?'gold':''}">${ir067Esc(ev.importance)}</span></div><p>${ir067Esc(ev.description)}</p><div class="ir067-event-meta"><span>${ir067Esc(ev.date||`Day ${ev.day||0}`)}</span><span>${ir067Esc(categories.find(x=>x[0]===ev.category)?.[1]||'Life')}</span>${ev.relatedNpcId?'<span>NPC record</span>':''}</div></div></article>`).join('')||'<div class="empty">No events match this view yet.</div>';
 const count=e.target.closest('.panel')?.querySelector('.panel-heading .tag');if(count)count.textContent=`${filtered.length} MATCHES`;
});
document.addEventListener('keydown',function(e){
 if(e.defaultPrevented||modal||!state?.character)return;
 const t=e.target;if(t&&(t.matches('input,textarea,select,[contenteditable="true"]')))return;
 if(e.altKey||e.ctrlKey||e.metaKey)return;
 if(e.key==='8'){e.preventDefault();setTab('Journal')}
});
