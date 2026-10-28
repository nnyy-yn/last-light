import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {actorRig} from './helpers/actor-rig.mjs';
import {chapterGround} from './helpers/actor-ground.mjs';
import {casualtyPose} from '../src/casualty-motion.js';
import {posedActorBounds,placeActorOnSurface} from '../src/actor-bounds.js';
globalThis.document={baseURI:new URL('../public/',import.meta.url).href};
const {installActorPoses}=await import('../src/world.js');
async function armedRig(ground){const r=await actorRig('soldier'),rifle=new THREE.Group(),hair=[];r.model.traverse(o=>{if(o.isMesh&&/short01/i.test(o.material?.name||''))hair.push(o);});hair.forEach(o=>o.removeFromParent());r.root.add(rifle);installActorPoses(r.root,r.model,r.bones,rifle,'soldier',()=>{},ground);return{...r,rifle};}

test('two cinematic death poses rest their knees beside the body instead of holding a raised bridge',async()=>{
 const ground=chapterGround(10);
 for(const side of[-1,1]){
  const r=await armedRig(ground),direction={x:side===-1?.35:-.3,z:-1};r.root.position.set(-24,ground(-24,30),30);
  for(let n=0;n<=60;n++){
   const p=n/60,fall=casualtyPose(p,{direction,side});r.root.position.y=ground(-24,30);r.root.quaternion.identity();
   r.root.userData.animate(0,.05,{stance:'low',dead:p});
   r.root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(fall.axis.x,0,fall.axis.z),fall.angle)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),fall.roll));
   r.root.userData.animate(0,0,{stance:fall.kneel>.5?'kneel':'stand',dead:fall.collapse,deadSide:side,handRelease:fall.release});placeActorOnSurface(r.root,ground(-24,30));
  }
  assert.equal(r.root.position.x,-24,'Ground contact must preserve the authored fall origin X');assert.equal(r.root.position.z,30,'Ground contact must preserve the authored fall origin Z');
  assert.equal(r.rifle.visible,false);
  const kneeClearances=[];for(const side of['Right','Left']){const knee=r.bones['mixamorig'+side+'Leg'].getWorldPosition(new THREE.Vector3()),ankle=r.bones['mixamorig'+side+'Foot'].getWorldPosition(new THREE.Vector3());kneeClearances.push(knee.y-ground(knee.x,knee.z));assert(knee.y-ground(knee.x,knee.z)<.33,'The upper resting knee must not hold the old raised bridge');assert(ankle.y-ground(ankle.x,ankle.z)<.18,'The heel remains near its supporting surface');}
  assert(Math.min(...kneeClearances)<.22,'The lower knee supports the side-lying pose');const contact=r.root.userData.poseState.groundContact;assert(contact&&Math.abs(contact.hip)<.025&&Math.abs(contact.shoulder)<.025,'Both shoulder and hip regions support the body');assert(contact.feet.every(g=>Math.abs(g)<.025),'Each heel solves to the surface independently');assert(posedActorBounds(r.root).min.y>ground(-24,30)-.03);
 }
});

test('the living rope casualty sits on the ground with both feet extended and does not reuse a standing foot anchor',async()=>{
 const r=await armedRig(()=>0);for(let n=0;n<60;n++)r.root.userData.animate(0,.05,{stance:'stand'});
 for(let n=0;n<90;n++)r.root.userData.animate(0,.05,{stance:'low',injured:1,injuryPhase:'ground'});
 const p=r.root.userData.getPoseState();assert.equal(p.dead,0);assert.equal(r.rifle.visible,false);assert(p.hips[1]>.18&&p.hips[1]<.30,'A sitting pelvis rests near the surface, not at the old crouching height');
 for(const side of['Right','Left']){const foot=r.bones['mixamorig'+side+'Foot'].getWorldPosition(new THREE.Vector3());assert(foot.z>.5,'Both feet leave their old upright support anchors');assert(foot.y<.16);}
 assert(posedActorBounds(r.root).min.y>-.025,'Clothing must not sink into the ground during seated support');
});

