import * as THREE from 'three';

/**
 * Fit the abbreviated source upper arms to the first-person camera.
 *
 * Call ONCE on a SkeletonUtils clone, after attaching it to weapon and before
 * createAnimatedHands records bone rest positions, shoulder positions or limb
 * lengths. The source view rig has a 14 cm upper arm: its cut shoulder therefore
 * enters the image when the independently controlled hand reaches a magazine.
 * Moving the shoulder root back/down and giving the upper segment a 28 cm rest
 * length lets the existing two-bone solver articulate the original sleeve.
 *
 * No geometry, UVs, bind matrices, skin weights, fingers or hand controllers
 * are replaced. Original cloth stays continuous; no caps or stretched strips.
 */
export function fitViewSleeves({skeletonRoot,weapon}) {
  if(!skeletonRoot || !weapon)throw new TypeError('fitViewSleeves requires skeletonRoot and weapon');
  if(skeletonRoot.userData.viewSleeveFit)return skeletonRoot.userData.viewSleeveFit;
  weapon.updateWorldMatrix(true,true);
  weapon.updateMatrixWorld(true);
  const changes=[],arms=[];
  for(const side of ['L','R']){
    const shoulderRoot=skeletonRoot.getObjectByName(`Arm_${side}`);
    const upper=skeletonRoot.getObjectByName(`UpArm_${side}`);
    const forearm=skeletonRoot.getObjectByName(`Forearm_${side}`);
    if(!shoulderRoot || !upper || !forearm)throw new Error(`Missing ${side} source upper-arm chain`);
    const before=upper.getWorldPosition(new THREE.Vector3()).distanceTo(forearm.getWorldPosition(new THREE.Vector3()));
    changes.push({bone:shoulderRoot,position:shoulderRoot.position.clone()},{bone:forearm,position:forearm.position.clone()});
    const offset=new THREE.Vector3(side==='L'?-.12:.08,-.24,.20);
    const shoulder=weapon.worldToLocal(shoulderRoot.getWorldPosition(new THREE.Vector3())).add(offset);
    shoulderRoot.position.copy(shoulderRoot.parent.worldToLocal(weapon.localToWorld(shoulder)));
    forearm.position.multiplyScalar(2);
    shoulderRoot.updateMatrixWorld(true);
    const after=upper.getWorldPosition(new THREE.Vector3()).distanceTo(forearm.getWorldPosition(new THREE.Vector3()));
    arms.push({side,upperArmBefore:before,upperArmAfter:after,shoulderOffset:offset.toArray()});
  }
  weapon.updateMatrixWorld(true);
  const report=[];
  skeletonRoot.traverse(object=>{if(object.isSkinnedMesh){object.skeleton.update();report.push({mesh:object.name,bones:object.skeleton.bones.length,vertices:object.geometry.attributes.position.count,geometryChanged:false,arms});}});
  let disposed=false;
  const result={report,
    // Kept for callers that already integrated the earlier dynamic prototype.
    // This final fit needs no per-frame CPU vertex processing.
    update(){},
    dispose(){if(disposed)return;disposed=true;for(const {bone,position}of changes)bone.position.copy(position);delete skeletonRoot.userData.viewSleeveFit;}
  };
  Object.defineProperty(skeletonRoot.userData,'viewSleeveFit',{value:result,configurable:true});
  return result;
}
