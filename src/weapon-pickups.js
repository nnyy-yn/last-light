import * as THREE from 'three';
import {validateWeaponDrop} from './carried-loadout.js';

// Carried models and their ammunition keep one stable record after collection.
// Enemy drops and discarded player weapons share presentation, not ownership.
export function createWeaponPickups(scene,{createModel,groundHeight=()=>0,traceObstacles=()=>null,onCollect=()=>false,onCollected=()=>{}}={}){
  const group=new THREE.Group();group.name='Dropped weapons';scene.add(group);
  const records=[],direction=new THREE.Vector3(),target=new THREE.Vector3(),eye=new THREE.Vector3();
  let focus=null,nextPlayerId=1,awaitRelease=false;
  const data=r=>({dropId:r.dropId,source:r.source,...(r.source==='enemy'?{enemyIndex:r.enemyIndex}:{}),weaponId:r.weaponId,mag:r.mag,reserve:r.reserve,taken:r.taken,position:[...r.position],elevation:r.elevation});
  function clear(){group.clear();records.length=0;focus=null;nextPlayerId=1;awaitRelease=false;}
  function spawn(value,position){
    const source=value.source||'enemy',dropId=value.dropId||(source==='enemy'?`enemy-${value.enemyIndex}`:`player-${nextPlayerId}`);
    const coordinates=value.position||[position?.x,position?.z];
    const clean=validateWeaponDrop({...value,source,dropId,position:coordinates,elevation:value.elevation??groundHeight(...coordinates)});if(!clean)return null;
    if(records.some(r=>r.dropId===clean.dropId||clean.source==='enemy'&&r.source==='enemy'&&r.enemyIndex===clean.enemyIndex))return null;
    const [x,z]=clean.position,record={...clean,x,z,y:clean.elevation+.024,progress:0,obj:null,fall:0};
    if(!clean.taken){
      const obj=createModel(clean.weaponId);obj.name=`Dropped ${clean.weaponId} (${clean.dropId})`;
      const ordinal=source==='enemy'?clean.enemyIndex:Number(clean.dropId.slice(7));
      obj.rotation.set(0,(ordinal*2.39996)%(Math.PI*2),Math.PI/2);
      obj.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(obj),center=bounds.getCenter(new THREE.Vector3());
      const model=new THREE.Group();model.add(obj);obj.position.x-=center.x;obj.position.z-=center.z;obj.position.y-=bounds.min.y;
      model.position.set(x,record.y+.42,z);record.obj=model;group.add(model);
    }
    records.push(record);if(source==='player')nextPlayerId=Math.max(nextPlayerId,Number(clean.dropId.slice(7))+1);return record;
  }
  function spawnPlayer(value,position){
    const {enemyIndex:ignored,dropId:ignoredId,...weapon}=value;
    return spawn({...weapon,source:'player',dropId:`player-${nextPlayerId}`,taken:false,position:[position.x,position.z],elevation:position.elevation??groundHeight(position.x,position.z)},position);
  }
  function candidate({player,camera,blocked=false}){
    if(blocked)return null;camera.getWorldPosition(eye);camera.getWorldDirection(direction);
    let best=null,score=Infinity;
    for(const r of records){
      if(r.taken||r.collecting||!r.obj)continue;
      const distance=Math.hypot(player.x-r.x,player.z-r.z);if(distance>2.65||eye.y<r.y-.3||eye.y>r.y+2.5)continue;
      target.set(r.x,r.y+.09,r.z);const delta=target.clone().sub(eye),dot=delta.clone().normalize().dot(direction);
      if(dot<.95||traceObstacles(eye,target))continue;
      const cost=distance+(1-dot)*3;if(cost<score){best=r;score=cost;}
    }
    return best;
  }
  function update(dt,context){
    dt=Number.isFinite(dt)&&dt>0?dt:0;
    if(!context.held)awaitRelease=false;
    for(const r of records)if(r.obj&&r.fall<1){r.fall=Math.min(1,r.fall+dt*3);r.obj.position.y=r.y+.42*(1-r.fall)**2;}
    focus=candidate(context);
    for(const r of records){
      r.progress=r===focus&&context.held&&!awaitRelease?Math.min(1,r.progress+dt/.72):0;
      if(r.progress>=1&&!r.collecting){
        r.collecting=true;let accepted;
        try{accepted=onCollect(data(r));}finally{r.collecting=false;}
        if(accepted===false){r.progress=0;continue;}
        r.taken=true;group.remove(r.obj);r.obj=null;r.progress=0;focus=null;awaitRelease=true;onCollected(snapshot());break;
      }
    }
    return focus?{key:'E',id:focus.dropId,dropId:focus.dropId,source:focus.source,weaponId:focus.weaponId,mag:focus.mag,reserve:focus.reserve,progress:focus.progress,near:true}:null;
  }
  function snapshot(){return records.map(data);}
  function restore(values,enemies=[]){
    if(!Array.isArray(values))throw new TypeError('Dropped weapon records must be an array');
    const clean=values.map(v=>validateWeaponDrop(v)),ids=new Set();
    for(const value of clean){if(!value||ids.has(value.dropId))throw new Error('Invalid or duplicate dropped weapon');ids.add(value.dropId);if(value.source==='enemy'&&!enemies[value.enemyIndex]?.obj)throw new Error('Missing dropped weapon owner');}
    clear();for(const value of clean)spawn(value,{x:value.position[0],z:value.position[1]});
  }
  function inspect(){return records.map(r=>({...data(r),worldPosition:[r.x,r.y,r.z],visible:Boolean(r.obj),progress:r.progress}));}
  return {spawn,spawnPlayer,clear,candidate,update,snapshot,restore,inspect};
}
