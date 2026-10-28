import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {actorRig} from './helpers/actor-rig.mjs';
import {CHAPTERS} from '../src/story.js';
import {getChapterLayout} from '../src/chapter-layouts.js';
import {buildCinematicPlan,sampleCinematicTrack} from '../src/narrative-cinematics.js';
globalThis.document={baseURI:new URL('../public/',import.meta.url).href};
const {installActorPoses}=await import('../src/world.js');
test('the real medic skeleton can reach the seated shoulder with relaxed hands and no rifle',async()=>{
 const ground=.17,plan=buildCinematicPlan({chapter:CHAPTERS[3],layout:getChapterLayout(4),phase:'opening',groundHeight:()=>ground}),track=plan.actors.find(a=>a.id==='responding-medic'),pose=sampleCinematicTrack(track.keys,14),r=await actorRig('soldier'),rifle=new THREE.Group();
 r.root.add(rifle);installActorPoses(r.root,r.model,r.bones,rifle,'soldier',()=>{},()=>ground);r.root.position.fromArray(pose.position);r.root.position.y+=ground;r.root.rotation.y=pose.yaw;
 for(let n=0;n<80;n++)r.root.userData.animate(0,.05,{stance:pose.stance,treatmentTarget:pose.treatmentTarget,aimTarget:pose.aimTarget});
 const state=r.root.userData.getPoseState();assert.equal(rifle.visible,false);assert.equal(state.dead,0);assert(Number.isFinite(state.treatmentError));assert(state.treatmentError<.025,`Actual palms miss the authored shoulder target by ${state.treatmentError}m`);
 for(const l of state.limbs)assert(l.hand.every(Number.isFinite));
});
