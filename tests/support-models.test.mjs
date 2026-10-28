import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {geometryAsset,actorRig} from './helpers/actor-rig.mjs';import {installSupportModelTemplates,createTechnicalModel,attachBlackHawkDoorGuns} from '../src/support-models.js';
globalThis.document={baseURI:new URL('../public/',import.meta.url).href};const {installActorPoses}=await import('../src/world.js');
async function ready(){const assets={};for(const id of['dshk-support','m134-door-support','technical-pickup-support'])assets[id]=(await geometryAsset(id+'.glb')).scene;installSupportModelTemplates(assets);}

test('DShK technical is an open-bed vehicle with real articulated sockets and bounded body collision',async()=>{
 await ready();const car=createTechnicalModel({occupied:false});car.position.set(7,.4,-2);car.rotation.y=.3;car.updateMatrixWorld(true);assert.equal(car.userData.vehicleType,'technical');assert(car.userData.gunnerSocket.isObject3D);assert.equal(car.userData.turret.crew.visible,false);
 for(const name of['MountedCoverLatch','MountedBeltSegment','MountedChargingGrip','MountedSpadeGripLeft','MountedSpadeGripRight']){const part=car.getObjectByName(name);assert(part);assert(part.children.some(c=>c.isMesh),'operation contact must belong to visible geometry');}
 const muzzle=car.userData.turretPoint('muzzle'),right=car.userData.turretPoint('rightGrip'),left=car.userData.turretPoint('leftGrip');assert(right.distanceTo(left)>.25&&right.distanceTo(left)<.35);assert(muzzle.distanceTo(right)>1.4);car.userData.aimTurret(1.0,.2);assert(muzzle.distanceTo(car.userData.turretPoint('muzzle'))>.3);const box=car.userData.getCollisionBounds()[0];assert(Number.isFinite(box.maxY)&&box.maxY-box.minY<2);assert(Math.abs(car.userData.gunnerSocket.getWorldPosition(new THREE.Vector3()).y-.4-.96)<1e-5);
});

test('Black Hawk has two outward M134 door guns whose real muzzle follows the aiming pivots',async()=>{
 await ready();const aircraft=new THREE.Group();aircraft.position.set(0,18,0);const sockets=attachBlackHawkDoorGuns(aircraft);assert.equal(sockets.length,2);assert(sockets.every(s=>s.weaponId==='m134'&&s.muzzle.isObject3D));for(const s of sockets){const before=aircraft.userData.gunPoint(s.id);const after=aircraft.userData.aimDoorGun(s.id,new THREE.Vector3(s.side*25,0,6));assert(before.distanceTo(after)>.1);assert(Math.sign(after.x)===s.side);aircraft.userData.animateDoorGun(s.id,.1,{firing:true});assert(s.barrels.rotation.z>0);}
});

test('actual elevated soldiers keep their feet on the roof and use technical grip targets without changing root',async()=>{
 await ready();const a=await actorRig('enemy'),rifle=new THREE.Group();rifle.userData.grips={right:[0,-.055,.005],left:[0,-.036,-.2725]};a.root.add(rifle);a.root.position.set(5,9,-3);a.root.userData.supportElevation=9;installActorPoses(a.root,a.model,a.bones,rifle,'enemy',()=>{},()=>0);for(let i=0;i<50;i++)a.root.userData.animate(0,.02,{stance:'stand'});let pose=a.root.userData.getPoseState();assert(pose.limbs.every(l=>l.ankleWorld[1]>9&&l.ankleWorld[1]<9.3));assert(pose.footError<.01);
 const car=createTechnicalModel({occupied:false});car.updateMatrixWorld(true);const ground=car.userData.gunnerSocket.getWorldPosition(new THREE.Vector3());a.root.position.copy(ground);a.root.rotation.y=0;a.root.userData.setMountedGun(car);for(let i=0;i<60;i++)a.root.userData.animate(0,.02,{stance:'stand'});pose=a.root.userData.getPoseState();assert.deepEqual(a.root.position.toArray(),ground.toArray());assert.equal(rifle.visible,false);assert(pose.limbs.every(l=>l.ankleWorld[1]>.96&&l.ankleWorld[1]<1.25));assert(pose.footError<.015);
});

test('the same real soldier grips the rope, clamps both boots, lands with bent legs and remains alive when guarding an injury',async()=>{
 const a=await actorRig('soldier'),rifle=new THREE.Group();rifle.userData.grips={right:[0,-.055,.005],left:[0,-.036,-.2725]};a.root.add(rifle);a.root.position.set(2,8,-4);a.root.userData.supportElevation=8;installActorPoses(a.root,a.model,a.bones,rifle,'soldier',()=>{},()=>0);let descent;
 for(let i=0;i<90;i++){a.root.position.y=8-i*.04;a.root.userData.supportElevation=a.root.position.y;a.root.userData.animate(0,.02,{stance:'stand',gesture:'fast-rope',ropePhase:'descend',ropeGrip:1,ropeTarget:{x:2,z:-3.70}});descent=a.root.userData.getPoseState();assert.equal(descent.locomotion,'idle');assert.ok(descent.footError<.02);assert.ok(descent.gripError<.04);}
 assert.equal(rifle.visible,false);assert.ok(Math.abs(descent.limbs[0].ankle[0]-descent.limbs[1].ankle[0])<.15,'boots close around the same rope');assert.ok(descent.limbs.every(l=>Math.abs(l.ankle[2]-.30)<.06));const standingHeight=descent.headHeight;
 a.root.position.y=0;a.root.userData.supportElevation=0;for(let i=0;i<30;i++)a.root.userData.animate(0,.02,{stance:'stand',ropeGrip:0,ropePhase:'land',landing:.5});const landed=a.root.userData.getPoseState();assert.ok(landed.lowering>.27);assert.ok(landed.headHeight<standingHeight-.1);
 for(let i=0;i<60;i++)a.root.userData.animate(0,.02,{stance:'stand',injured:1,injuryPhase:'ground'});const injured=a.root.userData.getPoseState();assert.equal(injured.dead,0);assert.equal(injured.injured,1);assert.equal(rifle.visible,false);assert.ok(injured.headHeight<1.1);assert.ok(injured.limbs.every(l=>l.hand[1]<1&&l.hand[2]>.2));assert.ok(injured.footError<.03);assert.equal(a.root.rotation.x,0,'bone injury pose never rotates the entire actor 90 degrees');
});

test('DShK mounted arms contact its real opposite-side feed and charging controls at every reload stage',async()=>{
 const fs=await import('node:fs');const {prepareMountedHands,createMountedGunnerPose}=await import('../src/mounted-gunner-pose.js');await ready();const raw=fs.readFileSync(new URL('../public/assets/mounted-makehuman-hands.glb',import.meta.url));await prepareMountedHands(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
 const a=await actorRig('soldier'),rifle=new THREE.Group();rifle.userData.grips={right:[0,-.055,.005],left:[0,-.036,-.2725]};a.root.add(rifle);installActorPoses(a.root,a.model,a.bones,rifle,'soldier',()=>{},()=>0);const vehicle=createTechnicalModel({occupied:false}),mounted=createMountedGunnerPose({world:{createActor:()=>a.root,destroyActor:o=>o.removeFromParent()},vehicle});
 try{for(const pitch of[-.27,0,.4,.68])for(const reload of[0,.1,.2,.4,.6,.8,.9,1]){vehicle.userData.aimTurret(.3,pitch);mounted.update(.016,reload);const p=mounted.inspect();assert.ok(p.gripError<.001);assert.ok(p.limbs.every(l=>l.reachError<.001));if(reload===.4)assert.equal(p.limbs.find(l=>l.side==='Left').role,'belt');if(reload===.9)assert.equal(p.limbs.find(l=>l.side==='Right').role,'charging');}}
 finally{mounted.dispose();}
});

test('rope landing separates lingering hand contact from grounded boots',async()=>{
 const a=await actorRig('soldier'),rifle=new THREE.Group();rifle.userData.grips={right:[0,-.055,.005],left:[0,-.036,-.2725]};a.root.add(rifle);a.root.userData.supportElevation=2;a.root.position.y=2;installActorPoses(a.root,a.model,a.bones,rifle,'soldier',()=>{},()=>0);
 for(let i=0;i<30;i++)a.root.userData.animate(0,.02,{gesture:'fast-rope',ropePhase:'descend',ropeGrip:1});
 a.root.userData.supportElevation=0;a.root.position.y=0;for(let i=0;i<30;i++)a.root.userData.animate(0,.02,{stance:'stand',ropePhase:'land',ropeGrip:.75,landing:.5});const p=a.root.userData.getPoseState();assert.ok(p.limbs.every(l=>l.ankleWorld[1]>.05&&l.ankleWorld[1]<.20));assert.ok(p.lowering>.27);assert.ok(p.footError<.015);
});

test('settled casualties relax both legs and hands with several actual skin support regions',async()=>{
 const {casualtyPose}=await import('../src/casualty-motion.js'),{placeActorOnSurface}=await import('../src/actor-bounds.js');
 for(const direction of[{x:0,z:-1},{x:.3,z:-1},{x:1,z:0}])for(const side of[-1,1]){
  const a=await actorRig('soldier'),rifle=new THREE.Group();rifle.userData.grips={right:[0,-.055,.005],left:[0,-.036,-.2725]};a.root.add(rifle);installActorPoses(a.root,a.model,a.bones,rifle,'soldier',()=>{},()=>0);
  for(let i=0;i<=60;i++){const fall=casualtyPose(i/60,{direction,side});a.root.quaternion.setFromAxisAngle(new THREE.Vector3(fall.axis.x,0,fall.axis.z),fall.angle).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),fall.roll));a.root.userData.animate(0,.02,{stance:fall.kneel>.5?'kneel':'stand',dead:fall.collapse,deadSide:side,handRelease:fall.release});placeActorOnSurface(a.root,0);}
  const regions={hips:Infinity,shoulders:Infinity,heel:Infinity};a.root.updateMatrixWorld(true);a.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){const v=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),local=a.root.worldToLocal(v.clone());if(local.y>.88&&local.y<1.1)regions.hips=Math.min(regions.hips,v.y);if(local.y>1.28&&local.y<1.5)regions.shoulders=Math.min(regions.shoulders,v.y);if(local.y<.32)regions.heel=Math.min(regions.heel,v.y);}});
  assert.equal(rifle.visible,false);assert.ok(regions.hips<.08&&regions.shoulders<.08&&regions.heel<.10,'hips, shoulder region and at least one heel support the body');const pose=a.root.userData.getPoseState();assert.ok(pose.limbs.every(l=>l.ankleWorld[1]<.24));for(const side of['Right','Left'])assert.ok(a.bones['mixamorig'+side+'Hand'].getWorldPosition(new THREE.Vector3()).y<.31,'released hands rest beside the body rather than holding an absent rifle');
 }
});
