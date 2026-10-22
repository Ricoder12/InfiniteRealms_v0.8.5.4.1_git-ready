'use strict';
// ================= Infinite Realms v0.7.2.7: quieter notifications and reliable boss reward =================
// One toast at a time. Repeated equivalent warnings collapse into a single counter (e.g. "You need to rest x4").
let ir0727ToastState={node:null,key:'',label:'',count:0,timer:null,lastAt:0};
toast=function(message){
 const raw=String(message??'Notice').trim()||'Notice';
 let label=raw;
 if(/too tired|need to rest|rest first|not enough energy|insufficient energy|energy is too low|need (?:at least )?\d+ energy/i.test(raw))label='You need to rest';
 else if(/too hungry|need to eat|eat something first|hunger is too low/i.test(raw))label='You need to eat first';
 const key=label.toLocaleLowerCase();
 const now=Date.now();
 const host=typeof document!=='undefined'?document.getElementById('toastStack'):null;
 if(!host)return;
 const same=ir0727ToastState.node&&ir0727ToastState.key===key&&(now-ir0727ToastState.lastAt)<=4500&&ir0727ToastState.node.isConnected;
 if(same){
  ir0727ToastState.count+=1;
  ir0727ToastState.lastAt=now;
  ir0727ToastState.node.textContent=`${ir0727ToastState.label} x${ir0727ToastState.count}`;
 }else{
  if(ir0727ToastState.timer)clearTimeout(ir0727ToastState.timer);
  host.replaceChildren();
  const node=document.createElement('div');node.className='toast';node.setAttribute('role','status');node.setAttribute('aria-live','polite');
  node.textContent=label;host.appendChild(node);
  ir0727ToastState={node,key,label,count:1,timer:null,lastAt:now};
 }
 if(ir0727ToastState.timer)clearTimeout(ir0727ToastState.timer);
 const activeNode=ir0727ToastState.node;
 ir0727ToastState.timer=setTimeout(()=>{
  if(ir0727ToastState.node===activeNode){activeNode.remove();ir0727ToastState.node=null;ir0727ToastState.key='';ir0727ToastState.label='';ir0727ToastState.count=0;ir0727ToastState.timer=null;}
 },4200);
};

// v0.7.2.9 replaces the unreliable insignia reward with a guaranteed Iron Sword.
// Keep this wrapper as pass-through; the v0.7.2.9 wrapper below owns boss rewards.
const ir0727CombatEndBase=irCombatEnd;
irCombatEnd=function(kind,detail=''){return ir0727CombatEndBase.apply(this,arguments)};

const ir0727ModalBase=ir072InteractionModal;
ir072InteractionModal=function(){return ir0727ModalBase.apply(this,arguments).replaceAll('V0.7.2.4','V0.7.2.7').replaceAll('V0.7.2.5','V0.7.2.7').replaceAll('V0.7.2.6','V0.7.2.7')};
if(typeof document!=='undefined')document.title='Infinite Realms v0.7.2.7';
// ================= End Infinite Realms v0.7.2.7 patch =================
