'use strict';
// ================= Infinite Realms v0.6.8.1: relationship-location QoL =================
function ir0681SiteName(id){
 if(!id)return '';
 const sites=state?.world?.region?.sites||state?.world?.known||[];
 return sites.find(x=>x?.id===id)?.name||'';
}
function ir0681KnownSite(n){
 const ids=[n?.workSite,n?.homeSite,n?.restSite,n?.lastSeenSiteId].filter(Boolean);
 for(const id of ids){const name=ir0681SiteName(id);if(name)return {id,name,source:id===n?.lastSeenSiteId?'Last seen':id===n?.workSite?'Usually works':'Usually found'};}
 return null;
}
function ir0681RelationshipLocation(n){
 const cur=site(),name=cur?.name||'Current location',curId=cur?.id||state?.world?.siteId;
 const belongsHere=!!n&&[n.workSite,n.homeSite,n.restSite].filter(Boolean).includes(curId);
 if(n&&belongsHere&&typeof ir06Present==='function'&&ir06Present(n))return {id:curId,name,status:'here',label:`Here now · ${name}`};
 const known=ir0681KnownSite(n);
 if(known)return {...known,status:known.id===(cur?.id||state?.world?.siteId)?'here':'elsewhere',label:`${known.source}: ${known.name}`};
 return {id:'',name:'',status:'unknown',label:'Location unknown'};
}
// Record a trustworthy last-seen location whenever a meaningful social memory is written.
// Preserve previously met generated residents across location changes, not just their journal entries.
const ir0681EnsureNPCsBase=ir06EnsureNPCs;
ir06EnsureNPCs=function(){
 const current=ir0681EnsureNPCsBase();
 const c=state?.character,v=state?.world?.v06;
 if(!c||!v)return current;
 const merged=new Map();
 for(const n of (c.npcs||[]))if(n?.id)merged.set(n.id,n);
 for(const n of Object.values(v.changes||{}))if(n?.id&&String(n.id).startsWith('ir06_'))merged.set(n.id,{...n,...merged.get(n.id),id:n.id});
 c.npcs=[...merged.values()];
 return current;
};
const ir0681RememberBase=ir06Remember;
ir06Remember=function(n,text,kind='memory'){
 if(n&&state?.world){n.lastSeenSiteId=state.world.siteId;n.lastSeenDay=Number(state.character?.daysLived)||0;}
 return ir0681RememberBase(n,text,kind);
};
// Add a compact search and location filter above the People directory.
const ir0681PeopleBase=ir06PeopleScreen;
ir06PeopleScreen=function(){
 let html=ir0681PeopleBase();
 const cur=site(),locName=cur?.name||'current location';
 const controls=`<section class="panel panel-pad ir0681-people-tools"><div class="panel-heading"><div><h3>Find someone</h3><p>Search the people you know and narrow close relationships by where they can be found.</p></div><span class="tag">DIRECTORY</span></div><div class="ir0681-filter-row"><input id="ir0681PeopleSearch" type="search" placeholder="Search name, role, location, or relationship…" aria-label="Search people"><select id="ir0681PeopleLocation" aria-label="Filter relationships by location"><option value="all">All known locations</option><option value="here">At ${esc(locName)}</option><option value="elsewhere">Other known locations</option><option value="unknown">Location unknown</option></select></div></section>`;
 html=html.replace(/(<div class="grid two">)/,controls+'$1');
 // Current directory rows are filtered to people actually present at this location.
 html=html.replace(/(<p>Affinity [\s\S]*?<\/p>)(<p class="ir06-memory">)/g,`$1<p class="ir0681-location"><span>📍</span> Here now · ${esc(locName)}</p>$2`);
 return html;
};
// Extend close-relationship cards with grounded location labels and a travel shortcut.
const ir0681CloseRelBase=ir064CloseRelationshipDashboard;
ir064CloseRelationshipDashboard=function(){
 const c=state.character,rels=c.relationships||{};
 const eligible=(c.npcs||[]).filter(n=>{const r=rels[n.id];return r&&(['Friend','Companion','Lover','Mentor'].includes(r.status)||((Number(r.affinity)||0)>=3&&(Number(r.trust)||0)>=2));});
 const groups=[['Friend','Friends','♧','People you trust and enjoy spending time with.'],['Companion','Companions','⚔','Reliable allies on your journey.'],['Lover','Lovers','♥','Close romantic relationships.'],['Mentor','Mentors','📘','People helping you develop your abilities.']];
 const groupHtml=groups.map(([status,label,icon,desc])=>{const list=eligible.filter(n=>rels[n.id]?.status===status);if(!list.length)return '';return `<div class="ir064-relgroup"><div class="ir064-relgroup-head"><span class="ir064-relgroup-icon">${icon}</span><div><h3>${label}</h3><p>${desc}</p></div><span class="tag">${list.length}</span></div><div class="ir064-relgroup-list">${list.map(n=>{const r=rels[n.id],l=ir0681RelationshipLocation(n),canTravel=!!l.id&&l.id!==(state.world?.siteId);return `<div class="ir064-rel-card" data-location-state="${l.status}"><div class="ir064-rel-avatar">${n.icon||'♙'}</div><div class="ir064-rel-info"><strong>${esc(n.name)}</strong><small>${esc(n.occupation||n.role||'Resident')}</small><small class="ir0681-rel-location">📍 ${esc(l.label)}</small><div class="ir063-pills"><span class="ir063-pill">Affinity ${Number(r.affinity)||0}</span><span class="ir063-pill">Trust ${Number(r.trust)||0}</span></div></div><div class="ir0681-rel-actions"><button class="button small subtle" data-action="ir063-focus" data-npc="${n.id}">Interactions</button>${canTravel?`<button class="button small" data-action="travel" data-site="${l.id}">Travel</button>`:''}</div></div>`}).join('')}</div></div>`}).join('');
 return `<section class="panel panel-pad ir063-dashboard ir064-relationships"><div class="panel-heading"><div><div class="eyebrow">YOUR SOCIAL CIRCLE</div><h2>Close Relationships</h2><p>Find close relationships by name or location. Current location is shown only when the NPC is actually present; otherwise this shows a usual or last-known location.</p></div><span class="tag blue">${eligible.length} CLOSE ${eligible.length===1?'BOND':'BONDS'}</span></div>${groupHtml||`<div class="ir064-empty-relationships"><span>♧</span><strong>Your social circle is still taking shape</strong><p>Build affinity and trust, then establish a friendship, companionship, or mentorship. Acquaintances stay out of this dashboard until the relationship becomes meaningful.</p></div>`}</section>`;
};
// Search/filter is delegated so it continues to work after normal tab renders.
function ir0681ApplyPeopleFilters(){const q=String(document.querySelector('#ir0681PeopleSearch')?.value||'').trim().toLowerCase(),v=document.querySelector('#ir0681PeopleLocation')?.value||'all';document.querySelectorAll('.npc-row,.ir064-rel-card').forEach(el=>{const matchText=!q||el.textContent.toLowerCase().includes(q),matchLoc=!el.classList.contains('ir064-rel-card')||v==='all'||el.dataset.locationState===v;el.style.display=matchText&&matchLoc?'':'none'});}
document.addEventListener('input',function(e){if(e.target?.id==='ir0681PeopleSearch')ir0681ApplyPeopleFilters()});
document.addEventListener('change',function(e){if(e.target?.id==='ir0681PeopleLocation')ir0681ApplyPeopleFilters()});
const ir0681Css=document.createElement('style');
ir0681Css.textContent=`.ir0681-people-tools{margin-bottom:14px}.ir0681-filter-row{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(180px,1fr);gap:9px}.ir0681-filter-row input,.ir0681-filter-row select{width:100%;min-width:0;border:1px solid var(--line);background:var(--surface-2,rgba(255,255,255,.04));color:var(--text);border-radius:9px;padding:10px 11px;font:inherit;font-size:12px}.ir0681-location,.ir0681-rel-location{font-size:10px!important;color:var(--muted)!important;margin-top:4px!important}.ir0681-rel-location{display:block;line-height:1.5}.ir0681-rel-actions{display:flex;flex-direction:column;gap:5px;align-items:stretch}.ir0681-rel-actions .button{white-space:nowrap}.ir064-rel-card{align-items:center}@media(max-width:700px){.ir0681-filter-row{grid-template-columns:1fr}.ir0681-rel-actions{flex-direction:row;flex-wrap:wrap}.ir064-rel-card{align-items:flex-start}}`;
document.head.appendChild(ir0681Css);
// Keep all release labels and backup metadata aligned with the active patch version.
// ================= End v0.6.8.1 =================
