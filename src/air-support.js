export const AIR_SUPPORT_RULES=Object.freeze({budget:180,burst:12,interval:.085,pause:12,prepare:1.6,minRange:15,maxRange:115,safeRadius:10});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),clone=v=>JSON.parse(JSON.stringify(v));
const id=s=>typeof s==='string'&&s.length>0&&s.length<160;
export function createAirSupport({enabled=false}={}){
 let state={version:1,enabled:Boolean(enabled),ammo:AIR_SUPPORT_RULES.budget,shots:0,burstRemaining:0,cooldown:8,prepare:0,targetId:null,socketId:null};
 function reset(value=false){state={version:1,enabled:Boolean(value),ammo:AIR_SUPPORT_RULES.budget,shots:0,burstRemaining:0,cooldown:8,prepare:0,targetId:null,socketId:null};}
 function update(dt,{sockets=[],targets=[],friendlies=[],clear=()=>false,aim=()=>false,combatAllowed=true}={}){
  const events=[];if(!Number.isFinite(dt)||dt<=0||!combatAllowed||!state.enabled||!state.ammo)return events;
  dt=Math.min(dt,.25);state.cooldown=Math.max(0,state.cooldown-dt);
  const safe=target=>friendlies.every(f=>dist(f.position,target.position)>=AIR_SUPPORT_RULES.safeRadius);
  const options=[];for(const socket of sockets)for(const target of targets){
   if(target.alive===false||target.hostile!==true||!safe(target))continue;
   const d=dist(socket.position,target.position);if(d<AIR_SUPPORT_RULES.minRange||d>AIR_SUPPORT_RULES.maxRange||!clear(socket,target))continue;
   options.push({socket,target,d});
  }
  options.sort((a,b)=>(a.target.id===state.targetId?-200:0)-(b.target.id===state.targetId?-200:0)+a.d-b.d);
  const choice=options[0];
  if(!choice){state.prepare=state.burstRemaining=0;state.targetId=state.socketId=null;return events;}
  const {socket,target}=choice;
  if(state.targetId!==target.id||state.socketId!==socket.id){state.targetId=target.id;state.socketId=socket.id;state.prepare=0;state.burstRemaining=0;}
  if(!aim(socket,target)){state.prepare=0;state.burstRemaining=0;return events;}
  if(state.cooldown>0)return events;
  state.prepare=Math.min(AIR_SUPPORT_RULES.prepare,state.prepare+dt);if(state.prepare<AIR_SUPPORT_RULES.prepare)return events;
  if(!state.burstRemaining){state.burstRemaining=Math.min(AIR_SUPPORT_RULES.burst,state.ammo);events.push({type:'cover-start',targetId:target.id,socketId:socket.id});}
  state.ammo--;state.shots++;state.burstRemaining--;state.cooldown=state.burstRemaining?AIR_SUPPORT_RULES.interval:AIR_SUPPORT_RULES.pause;
  events.push({type:'fire',targetId:target.id,socketId:socket.id,sequence:state.shots,from:{...socket.position},to:{...target.position}});
  if(!state.burstRemaining)state.prepare=0;
  return events;
 }
 return{update,reset,snapshot:()=>clone(state),inspect:()=>clone(state),restore(value){const clean=validateAirSupport(value);if(!clean)return false;state=clean;return true;}};
}
export function validateAirSupport(v){
 if(!v||v.version!==1||typeof v.enabled!=='boolean'||!['ammo','shots','burstRemaining'].every(k=>Number.isInteger(v[k])&&v[k]>=0)||v.ammo+v.shots!==AIR_SUPPORT_RULES.budget||v.burstRemaining>AIR_SUPPORT_RULES.burst||v.burstRemaining>v.ammo||!Number.isFinite(v.cooldown)||v.cooldown<0||v.cooldown>AIR_SUPPORT_RULES.pause||!Number.isFinite(v.prepare)||v.prepare<0||v.prepare>AIR_SUPPORT_RULES.prepare+1||(v.targetId!==null&&!id(v.targetId))||(v.socketId!==null&&!id(v.socketId)))return null;
 return Object.fromEntries(['version','enabled','ammo','shots','burstRemaining','cooldown','prepare','targetId','socketId'].map(k=>[k,v[k]]));
}
