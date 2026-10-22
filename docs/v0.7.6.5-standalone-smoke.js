'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const file = path.resolve(__dirname, '../dist/infinite-realms.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const assert = (ok, text) => { if (!ok) throw new Error(text); console.log('PASS:', text); };
const noop=()=>{};
const element=()=>({textContent:'',innerHTML:'',title:'',style:{},className:'',dataset:{},appendChild:noop,remove:noop,click:noop,focus:noop,classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},matches:()=>false,closest:()=>null});
const document={title:'',head:element(),body:element(),addEventListener:noop,querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,createElement:element};
const values=new Map();
const context={console:{warn:noop,log:noop,error:console.error},Math:Object.create(Math),String,Array,Object,Map,Set,Number,JSON,RegExp,Date,Intl,parseInt,parseFloat,document,window:{scrollTo:noop,addEventListener:noop},localStorage:{getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},setTimeout:()=>0,clearTimeout:noop,requestAnimationFrame:noop};
vm.createContext(context);
for (const [i, script] of scripts.entries()) {
  // The final script contains the existing DOM-driven boot call; prior environment checks show the browser host is unavailable here.
  if (i === scripts.length - 1) continue;
  vm.runInContext(script, context, {filename:`standalone-inline-script-${i+1}`});
}
const run=code=>vm.runInContext(code,context);
run('render=()=>{};persist=()=>true;toast=()=>{};');
assert(scripts.length===53,`standalone contains expected 53 inline script blocks (found ${scripts.length})`);
assert(html.includes('<title>Infinite Realms — Version 0.7.6.5</title>'),'standalone title is v0.7.6.5');
assert(!/\b(?:src|href)="(?:js\/|css\/)/.test(html),'standalone has no external local JS/CSS path references');
assert(run('irValidateMonsterHabitats().ok && Object.keys(IR_V0765_MONSTER_HABITATS).length===16'),'habitat registry initializes with all 16 fixed enemies');
assert(run("Object.keys(IR_BIOMES).every(b=>IR_BIOME_ENEMIES[b]?.length && ir0765HabitatEncounterIds({biomeId:b,risk:15},'random').length && ir0765HabitatEncounterIds({biomeId:b,risk:15},'hunt').length)"),'all 9 biomes have normal encounter and hunt candidates');
assert(run("(()=>{createSeed='SMOKE-HABITAT';createStart='settlement';state=makeInitial('Smoke','human','village');const s=state.world.region.sites[0];s.biomeId='desert';s.biome=IR_BIOMES.desert.name;s.risk=32;s.type='wilderness';state.world.siteId=s.id;state.character.skills.Combat.level=1;Math.random=()=>0;irStartHunt();return state.hunt?.enemyId==='boar'&&IR_V0765_MONSTER_HABITATS[state.hunt.enemyId].biomes.includes('desert')})()"),'real hunting function selects the Desert habitat target');
console.log(`SUMMARY ${scripts.length} script blocks checked; boot UI deliberately not executed in Node stub.`);
