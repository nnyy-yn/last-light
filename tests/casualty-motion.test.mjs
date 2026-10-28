import * as THREE from 'three';
import test from 'node:test';import assert from 'node:assert/strict';import {casualtyPose} from '../src/casualty-motion.js';
test('casualties lose balance in the impact direction with a supported side roll and a settled contact phase',()=>{
 const front=casualtyPose(1,{direction:{x:0,z:1}}),back=casualtyPose(1,{direction:{x:0,z:-1}}),side=casualtyPose(1,{direction:{x:1,z:0}});
 assert.equal(front.axis.x,1);assert.equal(back.axis.x,-1);assert.equal(side.axis.z,-1);for(const p of[front,back,side]){assert(p.angle<Math.PI/2);const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(p.axis.x,0,p.axis.z),p.angle).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.roll));assert(Math.abs(new THREE.Vector3(0,0,1).applyQuaternion(q).y)<1e-8,'The chest faces sideways for the actual impact azimuth');assert.equal(p.contact,1);assert(p.settled);}
 assert.equal(casualtyPose(.05).phase,'hit');assert.equal(casualtyPose(.3).phase,'balance-lost');assert.equal(casualtyPose(.7).phase,'ground-contact');assert.equal(casualtyPose(1).phase,'settled');
});
test('animation phase is a continuous function of progress with no per-frame accumulated spin',()=>{
 let previous=casualtyPose(0);for(let n=1;n<=1000;n++){const p=casualtyPose(n/1000);assert(Math.abs(p.angle-previous.angle)<.004);assert(p.angle>=previous.angle);assert(p.collapse>=previous.collapse);previous=p;}
 assert.deepEqual(casualtyPose(1),casualtyPose(1));assert.deepEqual(casualtyPose(NaN),casualtyPose(0));
});
