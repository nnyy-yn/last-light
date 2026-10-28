import * as THREE from 'three';

const referenced=new WeakMap(),vertex=new THREE.Vector3(),surfaceBox=new THREE.Box3();
/** Bounds of the currently posed, drawn skin. Cached glTF bind-pose boxes and
 * hidden body vertices are unsuitable for placing a fallen actor on a floor. */
export function posedActorBounds(actor,target=new THREE.Box3()){
 target.makeEmpty();actor.updateMatrixWorld(true);
 actor.traverseVisible(mesh=>{
  if(!mesh.isSkinnedMesh||mesh.material?.visible===false||mesh.material?.opacity===0)return;
  const geometry=mesh.geometry,index=geometry.index,count=index?index.count:geometry.attributes.position.count;
  const start=geometry.drawRange.start||0,end=Math.min(count,start+geometry.drawRange.count);
  let cached=referenced.get(geometry);
  if(!cached||cached.start!==start||cached.end!==end||cached.index!==index||cached.version!==index?.version){
   cached={start,end,index,version:index?.version,indices:[...new Set(Array.from({length:Math.max(0,end-start)},(_,i)=>index?index.getX(i+start):i+start))]};referenced.set(geometry,cached);
  }
  for(const i of cached.indices){mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld);target.expandByPoint(vertex);}
 });return target;
}

export function placeActorOnSurface(actor,floor,clearance=.006){
 if(!Number.isFinite(floor)||!Number.isFinite(clearance))return 0;
 const bounds=posedActorBounds(actor,surfaceBox);if(bounds.isEmpty())return 0;
 const delta=floor+clearance-bounds.min.y,position=actor.getWorldPosition(new THREE.Vector3());position.y+=delta;
 actor.position.copy(actor.parent?actor.parent.worldToLocal(position):position);actor.updateMatrixWorld(true);actor.userData.finalizeGroundContact?.(floor,clearance);return delta;
}
