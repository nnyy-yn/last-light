import * as THREE from 'three';

// A pickup is the actual carried weapon and the rounds left in it. Its record
// survives collection so restoring a checkpoint cannot award it again.
export function createWeaponPickups(scene,{createModel,groundHeight=()=>0,traceObstacles=()=>null,onCollect=()=>false,onCollected=()=>{}}={}){
  const group=new THREE.Group();group.name='Dropped enemy weapons';scene.add(group);
  const records=[],direction=new THREE.Vector3(),target=new THREE.Vector3(),eye=new THREE.Vector3();
  let focus=null;
  function clear(){group.clear();records.length=0;focus=null;}
  function spawn(value,position){
    if(records.some(r=>r.enemyIndex===value.enemyIndex))return null;
    const x=value.position?.[0]??position.x,z=value.position?.[1]??position.z;
    const record={...value,position:[x,z],x,z,y:groundHeight(x,z)+.024,progress:0,obj:null,fall:0};records.push(record);
    if(value.taken)return record;
    const obj=createModel(value.weaponId);obj.name=`Dropped ${value.weaponId} from enemy ${value.enemyIndex}`;
    obj.rotation.set(0,(value.enemyIndex*2.39996)%(Math.PI*2),Math.PI/2);
    obj.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(obj),center=bounds.getCenter(new THREE.Vector3());
    // Centre the original shipping model, rather than substitute a pickup icon.
    const model=new THREE.Group();model.add(obj);obj.position.x-=center.x;obj.position.z-=center.z;obj.position.y-=bounds.min.y;
    model.position.set(record.x,record.y+.42,record.z);record.obj=model;group.add(model);return record;
  }
  function candidate({player,camera,blocked=false}){
    if(blocked)return null;
    camera.getWorldPosition(eye);camera.getWorldDirection(direction);
    let best=null,score=Infinity;
    for(const r of records){
      if(r.taken||r.collecting||!r.obj)continue;
      const distance=Math.hypot(player.x-r.x,player.z-r.z);if(distance>2.65)continue;
      target.set(r.x,r.y+.09,r.z);const delta=target.clone().sub(eye),dot=delta.clone().normalize().dot(direction);
      if(dot<.95||traceObstacles(eye,target))continue;
      const cost=distance+(1-dot)*3;if(cost<score){best=r;score=cost;}
    }
    return best;
  }
  function update(dt,context){
    for(const r of records)if(r.obj&&r.fall<1){r.fall=Math.min(1,r.fall+dt*3);r.obj.position.y=r.y+.42*(1-r.fall)**2;}
    focus=candidate(context);
    for(const r of records){
      r.progress=r===focus&&context.held?Math.min(1,r.progress+dt/.72):0;
      if(r.progress>=1&&!r.collecting){
        r.collecting=true;let accepted;
        try{accepted=onCollect({...r,position:[...r.position],obj:undefined});}finally{r.collecting=false;}
        if(accepted===false){r.progress=0;continue;}
        r.taken=true;group.remove(r.obj);r.obj=null;r.progress=0;focus=null;onCollected(snapshot());break;
      }
    }
    return focus?{key:'E',id:`enemy-weapon-${focus.enemyIndex}`,weaponId:focus.weaponId,mag:focus.mag,reserve:focus.reserve,progress:focus.progress,near:true}:null;
  }
  function snapshot(){return records.map(({enemyIndex,weaponId,mag,reserve,taken,position})=>({enemyIndex,weaponId,mag,reserve,taken,position:[...position]}));}
  function restore(values,enemies){clear();for(const value of values){const actor=enemies[value.enemyIndex]?.obj;if(!actor)throw new Error('Missing dropped weapon owner');spawn(value,actor.position);}}
  function inspect(){return records.map(r=>({...snapshot().find(v=>v.enemyIndex===r.enemyIndex),worldPosition:[r.x,r.y,r.z],visible:Boolean(r.obj),progress:r.progress}));}
  return {spawn,clear,candidate,update,snapshot,restore,inspect};
}
