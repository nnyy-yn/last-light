import {nearestOnSegment,traceObstacles} from './ballistics.js';

export const ROCKET_LIMITS=Object.freeze({capacity:12,life:2.5,range:420,initialSpeed:85,acceleration:200,motorTime:.45,gravity:3.2,blastRadius:6.5});
const copy=p=>({x:p.x,y:p.y,z:p.z});
const finite=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<10000);
const validId=s=>typeof s==='string'&&s.length>0&&s.length<160;
const factions=new Set(['player','ally','enemy']);
const clone=v=>JSON.parse(JSON.stringify(v));
function pointAt(r,age){
 const t=Math.min(age,ROCKET_LIMITS.motorTime),travel=ROCKET_LIMITS.initialSpeed*age+ROCKET_LIMITS.acceleration*(t*t/2+t*(age-t));
 return{x:r.origin.x+r.direction.x*travel,y:r.origin.y+r.direction.y*travel-.5*ROCKET_LIMITS.gravity*age*age,z:r.origin.z+r.direction.z*travel};
}
/** Pure, swept world/actor collision. The view never decides damage. A rocket
 * owns one launch and at most one impact, including across pause and Continue. */
export function createRocketProjectiles({trace=()=>null,targets=()=>[],onImpact=()=>{}}={}){
 let records=[],nextId=1,launched=0,impacts=0;
 function launch({origin,direction,ownerId,faction,weaponId='rpg7'}={}){
  if(!finite(origin)||!finite(direction)||!validId(ownerId)||!factions.has(faction)||weaponId!=='rpg7'||records.length>=ROCKET_LIMITS.capacity)return null;
  const length=Math.hypot(direction.x,direction.y,direction.z);if(length<.001)return null;
  const r={id:'rocket-'+nextId++,ownerId,faction,weaponId,origin:copy(origin),direction:{x:direction.x/length,y:direction.y/length,z:direction.z/length},age:0,position:copy(origin)};
  records.push(r);launched++;return clone(r);
 }
 function update(dt){
  if(!Number.isFinite(dt)||dt<=0)return;
  // Sweep small segments, so a low frame rate cannot tunnel through a wall or
  // a roof. Analytic flight keeps the same path at 30, 60 and 144 Hz.
  let remaining=Math.min(dt,1);
  while(remaining>1e-8){const step=Math.min(1/90,remaining);remaining-=step;
   for(const r of [...records]){
    const from=r.position,end=pointAt(r,Math.min(ROCKET_LIMITS.life,r.age+step));let hit=trace(from,end),fraction=hit?.fraction??Infinity;
    for(const actor of targets(r)){
     if(actor.id===r.ownerId||actor.alive===false||!finite(actor.position))continue;
     const near=nearestOnSegment(actor.position,from,end);
     if(near.fraction<fraction&&near.distance<(actor.radius??.46)){fraction=near.fraction;hit={fraction,point:{x:near.x,y:near.y,z:near.z},normal:{x:-r.direction.x,y:-r.direction.y,z:-r.direction.z},kind:'actor',targetId:actor.id};}
    }
    r.age=Math.min(ROCKET_LIMITS.life,r.age+step);r.position=copy(hit?.point||end);
    if(hit)impact(r.id,hit);
    else if(r.age>=ROCKET_LIMITS.life)records=records.filter(v=>v!==r);
   }
  }
 }
 function impact(id,hit){
  const r=records.find(v=>v.id===id);if(!r||!finite(hit?.point)||!finite(hit?.normal))return false;
  r.position=copy(hit.point);records=records.filter(v=>v!==r);impacts++;onImpact({...clone(r),hit:clone(hit)});return true;
 }
 function snapshot(){return{version:1,nextId,launched,impacts,records:clone(records)};}
 function restore(value){const clean=validateRocketSnapshot(value);if(!clean)return false;({nextId,launched,impacts}=clean);records=clean.records;return true;}
 function reset(){records=[];nextId=1;launched=impacts=0;}
 return{launch,impact,update,reset,snapshot,restore,inspect:()=>snapshot()};
}
export function validateRocketSnapshot(value){
 if(!value||value.version!==1||!['nextId','launched','impacts'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0)||value.nextId!==value.launched+1||value.impacts>value.launched||!Array.isArray(value.records)||value.records.length>ROCKET_LIMITS.capacity||value.records.length+value.impacts>value.launched)return null;
 const ids=new Set();for(const r of value.records){
  const n=Number(/^rocket-(\d+)$/.exec(r.id)?.[1]);
  if(!Number.isSafeInteger(n)||n<1||n>=value.nextId||ids.has(r.id)||!validId(r.ownerId)||!factions.has(r.faction)||r.weaponId!=='rpg7'||!finite(r.origin)||!finite(r.position)||!finite(r.direction)||Math.abs(Math.hypot(r.direction.x,r.direction.y,r.direction.z)-1)>.00001||!Number.isFinite(r.age)||r.age<0||r.age>=ROCKET_LIMITS.life)return null;
  const expected=pointAt(r,r.age);if(Math.hypot(expected.x-r.position.x,expected.y-r.position.y,expected.z-r.position.z)>.001)return null;ids.add(r.id);
 }
 return{version:1,nextId:value.nextId,launched:value.launched,impacts:value.impacts,records:value.records.map(r=>({id:r.id,ownerId:r.ownerId,faction:r.faction,weaponId:r.weaponId,origin:copy(r.origin),direction:copy(r.direction),age:r.age,position:copy(r.position)}))};
}
/** Solid cover blocks blast pressure too. Samples are lifted toward the
 * surface normal so an explosion on a wall does not start inside its collider. */
export function rocketBlastExposure(hit,target,boxes=[],sampleHeight){
 const normal=hit.normal||{x:0,y:1,z:0},start={x:hit.point.x+normal.x*.08,y:hit.point.y+normal.y*.08,z:hit.point.z+normal.z*.08};
 const distance=Math.hypot(target.x-start.x,target.y-start.y,target.z-start.z);
 if(distance>ROCKET_LIMITS.blastRadius)return 0;
 if(traceObstacles(start,target,boxes,sampleHeight))return 0;
 return Math.max(0,1-distance/ROCKET_LIMITS.blastRadius);
}
