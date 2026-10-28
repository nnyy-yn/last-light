import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {posedActorBounds,placeActorOnSurface} from '../src/actor-bounds.js';import {casualtyPose} from '../src/casualty-motion.js';import {actorRig} from './helpers/actor-rig.mjs';
globalThis.document={baseURI:new URL('../',import.meta.url).href};const {installActorPoses}=await import('../src/world.js');

test('actual posed MakeHuman casualties settle on their real roof or ground without using bind-pose bounds',async()=>{
 const r=await actorRig('soldier');installActorPoses(r.root,r.model,r.bones,null,'soldier',()=>{},()=>0);
 for(const floor of [0,8.7])for(const direction of [{x:0,z:-1},{x:1,z:0}]){
  r.root.position.set(2,floor,-3);
  for(let frame=0;frame<=24;frame++){
   const progress=frame/24,p=casualtyPose(progress,{direction});r.root.quaternion.setFromAxisAngle(new THREE.Vector3(p.axis.x,0,p.axis.z),p.angle);
   r.root.userData.animate(0,.05,{dead:p.collapse,handRelease:p.release,alert:0});placeActorOnSurface(r.root,floor);
   const bounds=posedActorBounds(r.root);if(r.root.userData.poseState.groundContact&&p.collapse>=.999){const c=r.root.userData.poseState.groundContact;assert(Math.abs(c.hip)<.025&&Math.abs(c.shoulder)<.025);assert(c.feet.every(g=>Math.abs(g)<.025));assert(bounds.min.y>floor-.04);}else if(p.collapse<=.72)assert(Math.abs(bounds.min.y-floor-.006)<1e-6);assert(bounds.max.y>bounds.min.y+.15);
  }
 }
});

test('only drawn skin contributes to contact and a changed draw range invalidates cached references',()=>{
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,-99,0],3));geometry.setIndex([0,1,2,0,3,1]);
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(16),4));const weights=new Float32Array(16);for(let i=0;i<4;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
 const root=new THREE.Group(),skin=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial()),bone=new THREE.Bone();skin.add(bone);skin.bind(new THREE.Skeleton([bone]));root.add(skin);geometry.setDrawRange(0,3);
 assert.equal(posedActorBounds(root).min.y,0);geometry.setDrawRange(0,6);assert.equal(posedActorBounds(root).min.y,-99);skin.visible=false;assert(posedActorBounds(root).isEmpty());
 geometry.dispose();skin.material.dispose();
});
