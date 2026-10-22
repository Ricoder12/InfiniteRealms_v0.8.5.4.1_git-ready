'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/game/55-world-political-generation-v0.7.8.6.js'), 'utf8');
function harness(world) {
  const getRegions = w => { const out=[]; const seen=new Set(); function walk(r){if(!r||seen.has(r))return;seen.add(r);out.push(r);(r.subregions||[]).forEach(walk)} walk(w.region);return out; };
  const context = {
    console, document: { title: '' }, globalThis: null, worldRef: world,
    generateProceduralWorld() { return JSON.parse(JSON.stringify(this.worldRef)); },
    irGetGeographicRegions: getRegions,
    irGeoRegionId(w,k){return `region:${w}:sub:${k}`;}, irPoliticalEntityId(w,k){return `polity:${w}:${k}`;},
    irCreateGeographicRegionRecord(w,input){return {id:input.id,name:input.name,parentRegionId:input.parentRegionId,subregions:[],continentId:input.continentId??null,countryId:input.countryId??null,ownerPolityId:null,governingPolityId:null,description:input.description};},
    irCreatePoliticalEntityRecord(w,input){return {...input};},
    irEnsurePoliticalEntityRegistry(w){if(!Array.isArray(w.polities))w.polities=[];return w;},
    irEnsureRegionalHierarchy(w){
      if(!Array.isArray(w.region.subregions))w.region.subregions=[];
      const all=getRegions(w);
      for(const r of all){if(!Array.isArray(r.subregions))r.subregions=[];if(r!==w.region&&!r.parentRegionId)r.parentRegionId=w.region.id;if(r.countryId===undefined)r.countryId=null;if(r.continentId===undefined)r.continentId=null;if(r.ownerPolityId===undefined)r.ownerPolityId=null;if(r.governingPolityId===undefined)r.governingPolityId=null;}
      w.geography={...(w.geography||{}),regionIds:all.map(r=>r.id)};
      return w;
    },
    irValidatePoliticalEntities(w){
      const regs=getRegions(w), sites=w.region.sites, errors=[];
      const ids=new Set();
      for(const p of w.polities){
        if(!p?.id||ids.has(p.id))errors.push('duplicate/missing polity id'); ids.add(p?.id);
        if(!Array.isArray(p.regionIds)||!p.regionIds.length||p.regionIds.some(id=>!regs.some(r=>r.id===id)))errors.push('invalid region reference');
        if(p.capitalSiteGeoId){const matches=sites.filter(s=>s.geoId===p.capitalSiteGeoId);if(matches.length!==1||matches[0].type!=='settlement')errors.push('capital must resolve to unique settlement');else {const assigned=matches[0].regionId||w.region.id;if(!p.regionIds.includes(assigned))errors.push('capital outside polity region');}}
      }
      for(const r of regs) for(const f of ['ownerPolityId','governingPolityId']) if(r[f] && !w.polities.some(p=>p.id===r[f]))errors.push('unresolved region political ref');
      return {ok:errors.length===0,errors};
    },
    irValidateRegionalHierarchy(w){
      const regs=getRegions(w), ids=new Set(), errors=[];
      for(const r of regs){if(!r.id||ids.has(r.id))errors.push('duplicate region id');ids.add(r.id);if(r!==w.region&&r.parentRegionId!==w.region.id)errors.push('invalid parent');if(r!==w.region&&('sites'in r||'routes'in r))errors.push('duplicated physical records');}
      for(const s of w.region.sites) if(!ids.has(s.regionId||w.region.id))errors.push('unresolved site region');
      for(const r of regs) if(r.countryId && !(w.countries||[]).some(c=>c.id===r.countryId))errors.push('countryId not geographic');
      return {ok:errors.length===0,errors};
    }
  };
  context.globalThis=context; vm.createContext(context); vm.runInContext(source, context); return context;
}
function world(seed='seed-a') {
  const sites=Array.from({length:21},(_,i)=>({id:`loc-${i}`,geoId:`site-${i}`,row:Math.floor(i/3),col:i%3,x:i%3*20,y:Math.floor(i/3)*20,type:i%3===0?'settlement':'wilderness',biomeId:'woodland',regionId:'root-region',routes:[{to:`loc-${(i+1)%21}`}]}));
  return {id:'world-stable',seed,generationVersion:2,region:{id:'root-region',name:'Test Reach',sites,routes:[{id:'route-1',from:'site-0',to:'site-1'}],subregions:[],countryId:null,continentId:null},polities:[],countries:[],continents:[],known:['loc-0'],visited:['loc-0']};
}
function physical(w) { return JSON.stringify({sites:w.region.sites.map(s=>({id:s.id,geoId:s.geoId,x:s.x,y:s.y,row:s.row,col:s.col,type:s.type,biomeId:s.biomeId,routes:s.routes})),routes:w.region.routes}); }
const checks=[];function check(name,fn){fn();checks.push(name)}
let w1=world(); let originalPhysical=physical(w1); let c1=harness(w1); let a=c1.ir0786GeneratePoliticalData(w1);
check('generates coherent political records for populated regions',()=>{assert.equal(a.ok,true,JSON.stringify(a));assert.ok(a.generated>=1&&a.generated<=3);assert.equal(w1.polities.length,a.generated);});
check('political and region IDs are unique and valid',()=>{assert.equal(new Set(w1.polities.map(p=>p.id)).size,w1.polities.length);assert.equal(new Set(c1.irGetGeographicRegions(w1).map(r=>r.id)).size,c1.irGetGeographicRegions(w1).length);assert.equal(c1.irValidatePoliticalEntities(w1).ok,true);assert.equal(c1.irValidateRegionalHierarchy(w1).ok,true);});
check('capitals refer only to existing settlements in the owning region',()=>{for(const p of w1.polities){if(!p.capitalSiteGeoId)continue;const s=w1.region.sites.find(x=>x.geoId===p.capitalSiteGeoId);assert.equal(s.type,'settlement');assert.ok(p.regionIds.includes(s.regionId));}});
check('physical site IDs, coordinates, terrain, routes, and per-site routes remain identical',()=>assert.equal(physical(w1),originalPhysical));
check('political IDs are not written into geographic countryId fields',()=>{assert.ok(c1.irGetGeographicRegions(w1).every(r=>!w1.polities.some(p=>p.id===r.countryId)));assert.ok(w1.region.sites.every(s=>!Object.prototype.hasOwnProperty.call(s,'ownerPolityId')));});
let w2=world('seed-a'); let c2=harness(w2); let b=c2.ir0786GeneratePoliticalData(w2);
check('same seed produces identical political records and assignments',()=>{assert.equal(b.ok,true,JSON.stringify(b));assert.deepEqual(JSON.parse(JSON.stringify(w1.polities)),JSON.parse(JSON.stringify(w2.polities)));assert.deepEqual(w1.region.sites.map(s=>s.regionId),w2.region.sites.map(s=>s.regionId));});
const before=JSON.stringify(w1); const skipped=c1.ir0786GeneratePoliticalData(w1);
check('existing political records are retained on repeat invocation',()=>{assert.equal(skipped.skipped,true);assert.equal(JSON.stringify(w1),before);});
let w3=world('another-seed'); const c3=harness(w3); c3.ir0786GeneratePoliticalData(w3);
check('different seed remains valid without changing physical geography',()=>{assert.equal(c3.irValidatePoliticalEntities(w3).ok,true);assert.equal(c3.irValidateRegionalHierarchy(w3).ok,true);assert.equal(physical(w3),physical(world('another-seed')));});

let wSaved=world('legacy-save-seed'); const csaved=harness(wSaved); const beforeSavedRegions=wSaved.region.sites.map(s=>s.regionId); const savedRoutes=JSON.stringify(wSaved.region.routes);
check('legacy-save initialization adds politics without repartitioning valid root assignments',()=>{const result=csaved.ir0786GeneratePoliticalData(wSaved,{allowRegionPartition:false});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.generated,1);assert.deepEqual(wSaved.region.sites.map(s=>s.regionId),beforeSavedRegions);assert.equal(JSON.stringify(wSaved.region.routes),savedRoutes);assert.ok(wSaved.polities[0].regionIds.includes(wSaved.region.id));assert.equal(csaved.irValidatePoliticalEntities(wSaved).ok,true);});

let tooSmall={id:'tiny',seed:'x',region:{id:'r',sites:[{id:'one',geoId:'only',type:'settlement',regionId:'r',routes:[]}],routes:[]},polities:[]};
check('undersized worlds safely skip political generation',()=>assert.equal(harness(tooSmall).ir0786GeneratePoliticalData(tooSmall).generated,0));
let bad=world('bad');bad.region.sites[0].regionId='missing-region';let badBefore=JSON.stringify(bad);const cbad=harness(bad);
check('invalid pre-existing regional assignment fails without partial generation',()=>{const result=cbad.ir0786GeneratePoliticalData(bad);assert.equal(result.ok,false);assert.equal(JSON.stringify(bad),badBefore);});
console.log(`v0.7.8.6 focused tests: ${checks.length}/${checks.length} passed`);
for (const name of checks) console.log(`PASS: ${name}`);
