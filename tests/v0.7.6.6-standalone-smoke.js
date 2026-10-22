'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const historicalPath=path.join(__dirname,'..','backups','InfiniteRealms_v0.7.6.6_accepted_baseline.html');
const htmlPath=fs.existsSync(historicalPath)?historicalPath:path.join(__dirname,'..','dist','infinite-realms.html');
const html=fs.readFileSync(htmlPath,'utf8');
const noop=()=>{};
function el(){return{textContent:'',innerHTML:'',title:'',style:{},className:'',dataset:{},appendChild:noop,remove:noop,click:noop,focus:noop,classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},matches:()=>false,closest:()=>null}}
const document={title:'',head:el(),body:el(),addEventListener:noop,querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,createElement:el};
const stored=new Map();const context={console:{warn:noop,log:noop,error:console.error},Math:Object.create(Math),String,Array,Object,Map,Set,Number,JSON,RegExp,Date,Intl,parseInt,parseFloat,document,window:{scrollTo:noop,addEventListener:noop},localStorage:{getItem:k=>stored.has(k)?stored.get(k):null,setItem:(k,v)=>stored.set(k,String(v)),removeItem:k=>stored.delete(k)},setTimeout:()=>0,clearTimeout:noop,requestAnimationFrame:noop};vm.createContext(context);
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(let i=0;i<scripts.length;i++){if(i===scripts.length-1)continue;vm.runInContext(scripts[i],context,{filename:`standalone-script-${i+1}`});}
vm.runInContext("render=()=>{};persist=()=>true;toast=(m)=>{globalThis.__toast=m};",context);
function check(name,expr){const ok=!!vm.runInContext(expr,context);console.log(`${ok?'PASS':'FAIL'}\t${name}`);if(!ok)process.exitCode=1;}
check('Standalone contains no external script or stylesheet dependencies',!/<script\s+src=|<link\s+rel=["']stylesheet/i.test(html));
check('Standalone title resolves to v0.7.6.6',"document.title==='Infinite Realms — Version 0.7.6.6'");
check('Integrated biome ecology registry validates',"irValidateBiomeEcology().ok");
check('All 72 racial affinity cells resolve',"irValidateRacialBiomeAffinities().ok&&irValidateRacialBiomeAffinities().matrixCells===72");
check('All monster habitat profiles validate',"irValidateMonsterHabitats().ok&&irValidateMonsterHabitats().profileCount===16");
check('Standalone world generation creates a valid 49-site world',"(()=>{createSeed='STANDALONE-0766';createStart='settlement';state=makeInitial('Standalone Smoke','elf','village');return state.world.region.sites.length===49&&irValidateBiomeEcology(state.world).ok})()");
check('Invalid biome blocks random encounter without rewriting the saved biome',"(()=>{const s=site();s.type='wilderness';s.biomeId='corrupt-biome';s.biome='Corrupt';const ok=startCombat(null,{type:'wild'});return ok===false&&!state.combat&&s.biomeId==='corrupt-biome'&&/unresolved biome/.test(globalThis.__toast||'')})()");
console.log(`SCRIPT_BLOCKS=${scripts.length}`);
