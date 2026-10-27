import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {actorRig} from './helpers/actor-rig.mjs';
globalThis.document={baseURI:new URL('../',import.meta.url).href};
const {installActorPoses}=await import('../src/world.js');
const dt=1/60;
async function rig(kind='soldier',{armed=false,ground=()=>0,position=[0,0]}={}){
 const r=await actorRig(kind),rifle=armed?new THREE.Group():null;r.root.position.set(position[0],ground(...position),position[1]);if(rifle)r.root.add(rifle);
 installActorPoses(r.root,r.model,r.bones,rifle,kind,()=>{},ground);return {...r,rifle};
}
function frame(r,speed,stance='stand',ground=()=>0){r.root.position.z+=speed*dt;r.root.position.y=ground(r.root.position.x,r.root.position.z);r.root.userData.animate(speed,dt,{stance});return r.root.userData.getPoseState();}
const separation=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

test('all three shipped MakeHuman rigs keep a support sole planted through real walking',async()=>{
 for(const kind of ['soldier','civilian','enemy'])for(const speed of [1.1,1.8]){
  const r=await rig(kind);let previous=null,contacts=0,swings=0,maxSlip=0;
  for(let n=0;n<180;n++){const p=frame(r,speed);assert.ok(p.footError<.008,kind+' leg endpoint must reach the physical ankle');assert.ok(p.supportError<.008,kind+' sole pivot must agree with the solved skeleton');
   for(let side=0;side<2;side++){const foot=p.limbs[side];if(foot.swinging)swings++;else contacts++;if(previous&&!foot.swinging&&!previous.limbs[side].swinging&&!foot.settling&&!previous.limbs[side].settling)maxSlip=Math.max(maxSlip,separation(foot.plant,previous.limbs[side].plant));}
   previous=p;
  }
  assert.ok(contacts>swings,'walking includes a longer support phase');assert.ok(swings>50);assert.ok(maxSlip<.00001,'support locations cannot be dragged with root motion');assert.ok(Math.abs(previous.distanceTravelled-speed*3)<1e-8);
 }
});

test('cycle progress follows travelled metres rather than frame rate or a requested speed while blocked',async()=>{
 const outcomes=[];for(const step of [1/30,1/60]){const r=await rig('civilian');for(let n=0;n<Math.round(2/step);n++){r.root.position.z+=1.1*step;r.root.userData.animate(1.1,step,{stance:'stand'});}outcomes.push(r.root.userData.getPoseState());}
 assert.ok(Math.abs(outcomes[0].gaitCycles-outcomes[1].gaitCycles)<1e-9);assert.ok(Math.abs(outcomes[0].distanceTravelled-2.2)<1e-9);
 const r=await rig(),before=r.root.userData.getPoseState();for(let n=0;n<120;n++)r.root.userData.animate(3,dt,{stance:'stand'});const stopped=r.root.userData.getPoseState();assert.equal(stopped.gaitCycles,before.gaitCycles);assert.equal(stopped.locomotion,'idle');assert.equal(stopped.actualSpeed,0);
});

test('walk, run and crouch have distinct support times, stride lengths and body heights',async()=>{
 const cases=[];for(const [speed,stance]of [[1.1,'stand'],[3.2,'stand'],[1.1,'crouch']]){const r=await rig('civilian');let maxLift=0;const base=r.root.userData.getPoseState().limbs[0].ankleWorld[1];for(let n=0;n<150;n++){const p=frame(r,speed,stance);maxLift=Math.max(maxLift,...p.limbs.map(l=>l.ankleWorld[1]-base));assert.ok(p.footError<.012);}cases.push({...r.root.userData.getPoseState(),maxLift});}
 const [walk,run,crouch]=cases;assert.equal(walk.locomotion,'walk');assert.equal(run.locomotion,'run');assert.equal(crouch.locomotion,'crouch');assert.ok(run.contactFraction<.5&&walk.contactFraction>.6&&crouch.contactFraction>walk.contactFraction);assert.ok(run.strideLength>walk.strideLength*1.4);assert.ok(crouch.strideLength<walk.strideLength);assert.ok(run.maxLift>walk.maxLift+.025);assert.ok(crouch.headHeight<walk.headHeight-.2);
});

test('stopping finishes one airborne foot at a time without moving the actor root',async()=>{
 for(const count of [31,47,69]){const r=await rig('civilian');for(let n=0;n<count;n++)frame(r,1.4);const position=r.root.position.clone();let settled;
  for(let n=0;n<90;n++){r.root.userData.animate(0,dt,{stance:'stand'});settled=r.root.userData.getPoseState();assert.ok(settled.limbs.filter(l=>l.settling).length<=1,'one foot must remain in support during a stop');assert.ok(settled.footError<.012);assert.deepEqual(r.root.position.toArray(),position.toArray());}
  assert.ok(settled.limbs.every(l=>!l.swinging&&!l.settling));assert.equal(settled.actualSpeed,0);
 }
});

test('in-place half turns replant feet, while a shallow slope keeps support at sampled ground height',async()=>{
 const turning=await rig();const first=turning.root.userData.getPoseState();for(let n=0;n<120;n++){turning.root.rotation.y+=Math.PI/120;turning.root.userData.animate(0,dt,{stance:'stand'});const p=turning.root.userData.getPoseState();assert.ok(p.footError<.015);assert.ok(p.limbs.every(l=>l.ankleWorld.every(Number.isFinite)));}const turned=turning.root.userData.getPoseState();assert.ok(turned.gaitCycles-first.gaitCycles>1.4,'a half turn requires several planted steps');assert.equal(turned.distanceTravelled,0);
 const ground=(x,z)=>.025*z+.015*x,r=await rig('enemy',{ground});for(let n=0;n<180;n++){const p=frame(r,1.8,'stand',ground);assert.ok(p.supportError<.015);assert.ok(p.footError<.015);for(const f of p.limbs)if(!f.swinging&&!f.settling)assert.ok(f.ankleWorld[1]>ground(f.ankleWorld[0],f.ankleWorld[2])+.06,'ankles stay above the slope');}
});

test('armed walking retains grip closure and a dropped weapon stays hidden during later poses',async()=>{
 const r=await rig('soldier',{armed:true});for(let n=0;n<150;n++){const p=frame(r,1.8);assert.ok(p.gripError<.055,'moving torso and hands must keep holding the gun');}
 r.root.userData.weaponDropped=true;for(let n=0;n<30;n++){r.root.userData.animate(0,dt,{dead:n/30});assert.equal(r.rifle.visible,false);}
});

test('20Hz civilian walk-stop-turn keeps recovery transactional and every support plant fixed',async()=>{
 for(const pauseFrames of [1,2,4])for(const initial of [[-15.25,16],[0,0],[51,-37]]){
  const r=await rig('civilian',{position:initial});
  let travelled=0,rate=0,stoppedFrames=0,previous=null;
  for(let n=0;n<90;n++){const step=.05,moving=travelled<1.255-.00001;if(moving){const distance=Math.min(1.1*step,1.255-travelled);r.root.position.x+=-.6207868868/1.1*distance;r.root.position.z+=.9080879039/1.1*distance;travelled+=distance;}else stoppedFrames++;
   const target=moving||stoppedFrames<=pauseFrames?-.599641:-1.27,diff=Math.atan2(Math.sin(target-r.root.rotation.y),Math.cos(target-r.root.rotation.y)),wanted=Math.max(-2.15,Math.min(2.15,diff*5));rate+=Math.max(-11*step,Math.min(11*step,wanted-rate));r.root.rotation.y+=rate*step;r.root.userData.animate(moving?1.1:0,step,{stance:'stand'});const p=r.root.userData.getPoseState();
   assert.ok(p.footError<.015,`stop ${pauseFrames} frame ${n}: foot error ${p.footError}`);assert.ok(p.supportError<.015);assert.ok(p.pelvisLower<=.190001);
   if(previous)for(let i=0;i<2;i++){const a=previous.limbs[i],b=p.limbs[i];if(!a.swinging&&!a.settling&&!b.swinging&&!b.settling)assert.ok(separation(a.plant,b.plant)<1e-8,'a support anchor cannot slide during turn recovery');}previous=p;
  }
 }
});

test('running reversal at several step phases stays within real leg reach without moving planted feet',async()=>{
 for(const reverseAt of [1,1.2,1.8])for(const step of [1/60,.05]){
  const r=await rig('soldier',{armed:true});let rate=0,previous=null;
  for(let time=0;time<3.5;time+=step){const reverse=time>=reverseAt;r.root.position.z+=(reverse?-1:1)*2.5*step;const diff=Math.atan2(Math.sin((reverse?Math.PI:0)-r.root.rotation.y),Math.cos((reverse?Math.PI:0)-r.root.rotation.y)),wanted=Math.max(-2.7,Math.min(2.7,diff*5));rate+=Math.max(-11*step,Math.min(11*step,wanted-rate));r.root.rotation.y+=rate*step;r.root.userData.animate(2.5,step,{stance:'stand'});const p=r.root.userData.getPoseState();
   assert.ok(p.footError<.015,`reverse ${reverseAt}/${step} at ${time}: ${p.footError}`);assert.ok(p.supportError<.015);assert.ok(p.pelvisLower<=.190001);
   if(previous)for(let i=0;i<2;i++){const a=previous.limbs[i],b=p.limbs[i];if(!a.swinging&&!a.settling&&!b.swinging&&!b.settling)assert.ok(separation(a.plant,b.plant)<1e-8,'a support anchor cannot be projected along with a reversing root');}previous=p;
  }
 }
});

test('the reported resident stop-turn remains planted on the actual chapter-one triangle height field',async()=>{
 const {chapterGround}=await import('./helpers/actor-ground.mjs'),ground=chapterGround(1),r=await rig('civilian',{position:[-15.25,16],ground});
 let travelled=0,rate=0,stopped=0,previous=null,recoveryFrames=0;
 for(let n=0;n<100;n++){const step=.05,moving=travelled<1.255-.00001;if(moving){const distance=Math.min(1.1*step,1.255-travelled);r.root.position.x+=-.6207868868/1.1*distance;r.root.position.z+=.9080879039/1.1*distance;travelled+=distance;}else stopped++;
  const target=moving||stopped<=1?-.599641:-1.27,diff=Math.atan2(Math.sin(target-r.root.rotation.y),Math.cos(target-r.root.rotation.y)),wanted=Math.max(-2.15,Math.min(2.15,diff*5));rate+=Math.max(-11*step,Math.min(11*step,wanted-rate));r.root.rotation.y+=rate*step;r.root.userData.animate(moving?1.1:0,step,{stance:'stand'});r.root.position.y=ground(r.root.position.x,r.root.position.z);
  const p=r.root.userData.getPoseState();assert.ok(p.footError<.015);assert.ok(p.supportError<.015);recoveryFrames+=p.limbs.filter(l=>l.settling).length;
  if(previous)for(let i=0;i<2;i++){const a=previous.limbs[i],b=p.limbs[i];if(!a.swinging&&!a.settling&&!b.swinging&&!b.settling)assert.ok(separation(a.plant,b.plant)<1e-8);}
  previous=p;
 }assert.ok(recoveryFrames>0,'the overextended foot must perform a visible recovery, not silently move its planted anchor');
});
