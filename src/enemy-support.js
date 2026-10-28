import {blocked,lineBlocked} from './simulation.js';
import {traceObstacles} from './ballistics.js';

export const ENEMY_SUPPORT_CHAPTERS=Object.freeze([4,5,6,7,8,10,12,13,14,15]);
export const SUPPORT_WEAPON_RULES=Object.freeze({
 rpg7:Object.freeze({capacity:1,reserve:2,prepare:3.2,interval:.1,burst:1,pause:3.5,reload:5.2,minRange:14,maxRange:88,projectile:'rocket',accuracy:.38}),
 rpk:Object.freeze({capacity:75,reserve:150,prepare:1.35,interval:.115,burst:5,pause:3.0,reload:4.1,minRange:3,maxRange:65,projectile:'bullet',accuracy:.31}),
 ak:Object.freeze({capacity:30,reserve:60,prepare:1.1,interval:.19,burst:2,pause:3.5,reload:2.8,minRange:3,maxRange:48,projectile:'bullet',accuracy:.25}),
});
const PHASES=new Set(['waiting','watching','aiming','burst','cooldown','reloading','withdrawing','withdrawn','dead','observer']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),point=p=>Array.isArray(p)?{x:p[0],z:p.length===3?p[2]:p[1]}:{x:p.x,z:p.z};
const number=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b,integer=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),validId=v=>typeof v==='string'&&v.length>0&&v.length<160;
export function createSupportWeaponState(spec){
 const rules=SUPPORT_WEAPON_RULES[spec.weaponId];if(!rules||!validId(spec.supportId||spec.id))throw new TypeError('A support weapon needs a stable identity and supported firearm');
 const mag=spec.mag??rules.capacity,reserve=spec.reserve??rules.reserve;if(!integer(mag,0,rules.capacity)||!integer(reserve,0,rules.reserve))throw new TypeError('Invalid finite support ammunition');
 return {version:1,supportId:spec.supportId||spec.id,weaponId:spec.weaponId,capacity:rules.capacity,budget:mag+reserve,mag,reserve,shotsFired:0,phase:spec.fireControlledBy==='vehicle'?'observer':'waiting',cooldown:Math.max(0,spec.activationDelay??4),aimElapsed:0,reloadRemaining:0,shotCooldown:0,burstRemaining:0,targetId:null,withdrawn:false,dead:false,fireControlledBy:spec.fireControlledBy==='vehicle'?'vehicle':'director'};
}
export const snapshotSupportWeapon=state=>({...state});
export function validateSupportWeaponState(value,spec){
 const expected=createSupportWeaponState(spec),r=SUPPORT_WEAPON_RULES[expected.weaponId];if(!value||value.version!==1||value.supportId!==expected.supportId||value.weaponId!==expected.weaponId||value.capacity!==expected.capacity||value.budget!==expected.budget||value.fireControlledBy!==expected.fireControlledBy)return null;
 if(!integer(value.mag,0,r.capacity)||!integer(value.reserve,0,r.reserve)||!integer(value.shotsFired,0,expected.budget)||value.mag+value.reserve+value.shotsFired!==expected.budget||!PHASES.has(value.phase)||typeof value.dead!=='boolean'||typeof value.withdrawn!=='boolean')return null;
 if(!number(value.cooldown,0,120)||!number(value.aimElapsed,0,r.prepare)||!number(value.reloadRemaining,0,r.reload)||!number(value.shotCooldown,0,r.interval)||!integer(value.burstRemaining,0,r.burst)||(value.targetId!==null&&!validId(value.targetId)))return null;
 if(value.dead!==(value.phase==='dead')||value.phase==='observer'&&value.fireControlledBy!=='vehicle'||value.fireControlledBy==='vehicle'&&!['observer','dead'].includes(value.phase))return null;
 if(value.phase==='reloading'&&(!(value.reloadRemaining>0)||value.mag!==0||value.reserve===0)||value.phase!=='reloading'&&value.reloadRemaining!==0)return null;
 if(['withdrawing','withdrawn'].includes(value.phase)&&(value.mag!==0||value.reserve!==0)||value.withdrawn!==(value.phase==='withdrawn'))return null;
 return Object.fromEntries(Object.keys(expected).map(k=>[k,value[k]]));
}
/** The actor director owns the only clock. This pure step emits intent once;
 * the caller resolves a real projectile/raycast and never calls a second AI. */
export function stepSupportWeapon(state,dt,context={}){
 const r=SUPPORT_WEAPON_RULES[state.weaponId],events=[];
 if(context.alive===false||state.dead){state.dead=true;state.phase='dead';state.aimElapsed=state.reloadRemaining=state.shotCooldown=state.burstRemaining=0;state.targetId=null;state.withdrawn=false;return events;}
 if(state.fireControlledBy==='vehicle'){state.phase='observer';return events;}
 if(!Number.isFinite(dt)||dt<=0||context.paused||context.combatAllowed===false)return events;
 dt=Math.min(dt,.25);state.cooldown=Math.max(0,state.cooldown-dt);state.shotCooldown=Math.max(0,state.shotCooldown-dt);
 if(state.phase==='reloading'){
   state.reloadRemaining=Math.max(0,state.reloadRemaining-dt);
   if(state.reloadRemaining===0){const loaded=Math.min(r.capacity-state.mag,state.reserve);state.mag+=loaded;state.reserve-=loaded;state.phase='cooldown';state.cooldown=.65;events.push({type:'reloaded',supportId:state.supportId,weaponId:state.weaponId,loaded});}
   return events;
 }
 if(state.mag===0){state.aimElapsed=0;state.burstRemaining=0;
   if(state.reserve>0){state.phase='reloading';state.reloadRemaining=r.reload;events.push({type:'reload-start',supportId:state.supportId,weaponId:state.weaponId,duration:r.reload});}
   else if(!state.withdrawn){state.phase='withdrawing';if(context.atRetreat){state.withdrawn=true;state.phase='withdrawn';}events.push({type:'withdraw',supportId:state.supportId});}
   return events;
 }
 const hasTarget=context.visible===true&&context.targetId!=null&&number(context.distance,r.minRange,r.maxRange);
 if(context.suppressed||!hasTarget){state.phase='watching';state.aimElapsed=0;state.burstRemaining=0;state.targetId=null;if(context.suppressed)state.cooldown=Math.max(state.cooldown,1.2);return events;}
 if(state.targetId!==context.targetId){state.targetId=context.targetId;state.aimElapsed=0;state.burstRemaining=0;state.phase='watching';}
 if(state.cooldown>0){state.phase='cooldown';return events;}
 if(state.phase!=='burst'){
   if(state.phase!=='aiming'){state.phase='aiming';state.aimElapsed=0;events.push({type:'aim-start',supportId:state.supportId,weaponId:state.weaponId,duration:r.prepare,targetId:state.targetId});}
   if(!context.aligned)return events;
   state.aimElapsed=Math.min(r.prepare,state.aimElapsed+dt);if(state.aimElapsed<r.prepare)return events;
   state.phase='burst';state.burstRemaining=Math.min(r.burst,state.mag);
 }
 if(!context.aligned){state.phase='watching';state.aimElapsed=0;state.burstRemaining=0;return events;}
 if(state.shotCooldown>0)return events;
 state.mag--;state.shotsFired++;state.burstRemaining--;state.shotCooldown=r.interval;
 events.push({type:'fire',supportId:state.supportId,weaponId:state.weaponId,projectile:r.projectile,sequence:state.shotsFired,accuracy:r.accuracy,targetId:state.targetId,remaining:state.mag+state.reserve});
 if(state.burstRemaining===0||state.mag===0){state.phase='cooldown';state.cooldown=r.pause;state.aimElapsed=0;}
 return events;
}

function walkClear(a,b,colliders,radius=.65){return !lineBlocked(a,b,colliders.map(b=>({minX:b.minX-radius,maxX:b.maxX+radius,minZ:b.minZ-radius,maxZ:b.maxZ+radius})));}
const eligible=layout=>ENEMY_SUPPORT_CHAPTERS.includes(layout.chapter)&&layout.enemySpawns?.length>0&&!['interior-triage','restricted-cockpit','military-camp','hangar-apron','base-hospital'].includes(layout.type);
export function elevatedSupportObstacles(colliders,roof){return colliders.map(box=>{
 // Only an explicit source footprint may give a formerly 2-D wall its actual
 // roof top. Other obstacles remain opaque rather than guessing their height.
 if(Number.isFinite(box.maxY))return box;
 const b=roof.bounds;if(box.minX>=b.minX-.4&&box.maxX<=b.maxX+.4&&box.minZ>=b.minZ-.4&&box.maxZ<=b.maxZ+.4)return {...box,minY:roof.baseY??0,maxY:roof.height};
 return box;
});}
export function planEnemySupport({layout,sceneState={},colliders=[],groundHeight=()=>0}={}){
 const result={chapterId:layout?.chapter,actors:[],technicals:[],omitted:[],roofIds:[]};if(!layout||!eligible(layout))return result;
 const spawn=point(layout.spawn),targets=[...layout.taskPositions,...(layout.route||[])].map(point),used=[];
 const actor=(id,weaponId,p,elevation,supportType,extra={})=>({pos:[p.x,p.z],elevation,worldY:elevation,weaponId,supportId:id,supportType,fixed:true,lookAt:extra.lookAt||[spawn.x,spawn.z],opening:false,...extra,support:{id,supportId:id,weaponId,worldY:elevation,elevation,supportType,fixed:true,activationDelay:weaponId==='rpg7'?7:5,...extra}});
 const roofs=(sceneState.roofSurfaces||[]).filter(r=>r.flat===true&&r.solid===true&&r.accessible===false&&r.kind!=='canopy'&&r.kind!=='courtyard'&&number(r.height,3,30)&&r.bounds&&Object.values(r.bounds).every(Number.isFinite)).map(r=>({...r,distance:dist(spawn,{x:(r.bounds.minX+r.bounds.maxX)/2,z:(r.bounds.minZ+r.bounds.maxZ)/2})})).filter(r=>r.distance>=24&&r.distance<=100).sort((a,b)=>a.distance-b.distance||String(a.id).localeCompare(String(b.id)));
 for(const roof of roofs){if(result.roofIds.length===2)break;const b=roof.bounds;if(b.maxX-b.minX<5||b.maxZ-b.minZ<5||result.actors.some(a=>a.supportType==='rooftop-rpg'&&dist(point(a.pos),{x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2})<18))continue;
   const center={x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2},options=[];
   for(const target of targets){const dx=target.x-center.x,dz=target.z-center.z,length=Math.hypot(dx,dz);if(length<18||length>88)continue;const ux=dx/length,uz=dz/length;
     const reach=Math.min((b.maxX-b.minX)/2-1.15,(b.maxZ-b.minZ)/2-1.15),p={x:center.x+ux*reach,z:center.z+uz*reach},mate={x:p.x-uz*1.6-ux*.5,z:p.z+ux*1.6-uz*.5},retreat={x:center.x,z:center.z},mateRetreat={x:center.x-uz*.9,z:center.z+ux*.9};
     const inside=q=>q.x>b.minX+.7&&q.x<b.maxX-.7&&q.z>b.minZ+.7&&q.z<b.maxZ-.7&&!blocked(q.x,q.z,roof.obstacles||[],.55);
     if(![p,mate,retreat,mateRetreat].every(inside)||!walkClear(p,retreat,roof.obstacles||[])||!walkClear(mate,mateRetreat,roof.obstacles||[]))continue;
     const blockers=elevatedSupportObstacles(colliders,roof);if(traceObstacles({x:p.x,y:roof.height+1.35,z:p.z},{x:target.x,y:groundHeight(target.x,target.z)+1.3,z:target.z},blockers))continue;
     options.push({p,mate,retreat,mateRetreat,target,score:dist(spawn,p)});
   }
   options.sort((a,b)=>a.score-b.score);if(!options.length)continue;const {p,mate,retreat,mateRetreat,target}=options[0],team=result.roofIds.length+1,common={roofId:roof.id,roofBounds:{...b},retreat:[retreat.x,retreat.z],roofObstacles:structuredClone(roof.obstacles||[]),lookAt:[target.x,target.z]};
   result.actors.push(actor(`ch${layout.chapter}-rpg-${team}`,'rpg7',p,roof.height,'rooftop-rpg',common),actor(`ch${layout.chapter}-spotter-${team}`,'ak',mate,roof.height,'rooftop-spotter',{...common,retreat:[mateRetreat.x,mateRetreat.z]}));result.roofIds.push(roof.id);used.push(p,mate);
 }
 if(result.roofIds.length<2)result.omitted.push({type:'rooftop-rpg',wanted:2,placed:result.roofIds.length,reason:'Need actual flat roof surfaces with safe feet, retreat and line of sight.'});
 const safe=p=>p.x>layout.bounds.minX+2&&p.x<layout.bounds.maxX-2&&p.z>layout.bounds.minZ+2&&p.z<layout.bounds.maxZ-2&&!blocked(p.x,p.z,colliders,.6)&&layout.taskPositions.every(t=>dist(p,point(t))>6)&&used.every(t=>dist(p,t)>3);
 const cover=[];for(const box of colliders){const w=box.maxX-box.minX,d=box.maxZ-box.minZ;if(Math.max(w,d)<2||Math.min(w,d)<.22||(Number.isFinite(box.maxY)&&box.maxY-(box.minY||0)<.8))continue;
   for(const sx of[-1,1])for(const sz of[-1,1]){const edgeX=sx<0?box.minX:box.maxX,edgeZ=sz<0?box.minZ:box.maxZ,peek={x:edgeX+sx*.95,z:edgeZ+sz*.95};
     for(const p of[{x:edgeX+sx*.80,z:edgeZ-sz*Math.min(d*.5,1.8)},{x:edgeX-sx*Math.min(w*.5,1.8),z:edgeZ+sz*.80}]){
       const range=dist(p,spawn);if(range<18||range>70||!safe(p)||!safe(peek)||!lineBlocked(spawn,p,colliders)||lineBlocked(spawn,peek,colliders)||!walkClear(p,peek,colliders))continue;
       cover.push({p,peek,score:range});
     }
   }
 }cover.sort((a,b)=>a.score-b.score);
 const teamCandidates=cover.map(c=>{
   const {p,peek}=c,options=[];
   for(const radius of[1.8,2.6,3.4])for(let i=0;i<12;i++){const angle=i*Math.PI/6,q={x:p.x+Math.cos(angle)*radius,z:p.z+Math.sin(angle)*radius};
     if(safe(q)&&dist(q,peek)>1.4&&walkClear(p,q,colliders))options.push(q);
   }
   return {...c,mate:options[0]};
 }).filter(c=>c.mate);
 if(teamCandidates.length){const {p,peek,mate}=teamCandidates[0];
   result.actors.push(actor(`ch${layout.chapter}-rpk-1`,'rpk',peek,groundHeight(peek.x,peek.z),'support-machinegun',{retreat:[p.x,p.z],coverAnchor:[p.x,p.z]}));
   result.actors.push(actor(`ch${layout.chapter}-rpk-assistant`,'ak',mate,groundHeight(mate.x,mate.z),'support-assistant',{retreat:[mate.x,mate.z]}));used.push(peek,mate,p);
 }else result.omitted.push({type:'support-machinegun',reason:'No safe roadside cover/peek pair with a separate assistant station.'});
 // Only the convoy chapters have a reachable ground launcher. Roof teams stay
 // on their actual roofs; the new station must retain real cover and distance.
 if([8,13].includes(layout.chapter)){
   const groundRpg=cover.find(c=>safe(c.p)&&safe(c.peek)&&used.every(p=>dist(p,c.p)>=5&&dist(p,c.peek)>=5)&&targets.some(t=>dist(t,c.peek)>=14&&dist(t,c.peek)<=70&&!lineBlocked(t,c.peek,colliders)));
   if(groundRpg){const {p,peek}=groundRpg;
     result.actors.push(actor(`ch${layout.chapter}-ground-rpg-1`,'rpg7',peek,groundHeight(peek.x,peek.z),'ground-rpg',{retreat:[p.x,p.z],coverAnchor:[p.x,p.z]}));used.push(peek,p);
   }else result.omitted.push({type:'ground-rpg',reason:'No second clear covered convoy station separated from the machinegun team.'});
 }
 const vehicleCandidates=[];for(const road of layout.roads||[])for(let i=1;i<road.points.length;i++){
   const a=point(road.points[i-1]),b=point(road.points[i]),length=dist(a,b);if(length<12||road.width<7)continue;const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length;
   for(const t of[.25,.5,.75])for(const side of[-1,1]){const p={x:a.x+(b.x-a.x)*t+uz*side*(road.width/2-1.6),z:a.z+(b.z-a.z)*t-ux*side*(road.width/2-1.6)},range=dist(p,spawn);if(range<32||range>82||!safe(p))continue;
     const hx=Math.abs(ux)*2.8+Math.abs(uz)*1.4,hz=Math.abs(uz)*2.8+Math.abs(ux)*1.4,box={minX:p.x-hx,maxX:p.x+hx,minZ:p.z-hz,maxZ:p.z+hz};if(colliders.some(c=>box.minX<c.maxX+.3&&box.maxX>c.minX-.3&&box.minZ<c.maxZ+.3&&box.maxZ>c.minZ-.3)||layout.taskPositions.some(q=>q[0]>box.minX-4&&q[0]<box.maxX+4&&q[1]>box.minZ-4&&q[1]<box.maxZ+4))continue;
     vehicleCandidates.push({p,rotation:Math.atan2(ux,uz),box,score:range});
   }
 }vehicleCandidates.sort((a,b)=>a.score-b.score);
 if(vehicleCandidates.length){const v=vehicleCandidates[0],elevation=groundHeight(v.p.x,v.p.z),id=`ch${layout.chapter}-technical-1`;result.technicals.push({id,weaponId:'dshk',pos:[v.p.x,v.p.z],elevation,rotation:v.rotation,bounds:v.box,crew:actor(id+'-crew','ak',v.p,elevation+1.05,'vehicle-gunner',{fireControlledBy:'vehicle',retreat:[v.p.x,v.p.z],vehicleId:id})});}else result.omitted.push({type:'technical',reason:'No vehicle-sized clear roadside station.'});
 return result;
}
