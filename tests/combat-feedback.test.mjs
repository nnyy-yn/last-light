import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCombatFeedback} from '../src/combat-feedback.js';

test('automatic fire keeps sparse fast short tracers instead of a continuous muzzle stream',()=>{
  const scene=new THREE.Scene(),feedback=createCombatFeedback(scene);
  for(let i=0;i<3;i++)feedback.shot({from:[0,1,0],to:[0,1,-100],weaponId:'m16a2'});
  assert.equal(feedback.inspect().tracers.length,0);
  feedback.shot({from:[0,1,0],to:[0,1,-100],weaponId:'m16a2'});
  feedback.update(1/60);
  const state=feedback.inspect();assert.equal(state.tracers.length,1);
  assert.ok(state.tracers[0].position[2]<-8,'a bullet segment must travel many metres per frame');
  assert.ok(state.tracers[0].segmentLength<=.4,'never draw a whole muzzle-to-target beam');
  assert.equal(state.casings,4,'each shot still ejects brass');
  feedback.dispose();
});

test('surface responses have distinct material behavior and leave the outward wall face',()=>{
  const scene=new THREE.Scene(),feedback=createCombatFeedback(scene);
  feedback.hit({point:[0,2,0],normal:[1,0,0],material:'concrete'});feedback.update(.03);
  let state=feedback.inspect();assert.equal(state.lastImpact.sparks,0);assert.equal(state.active.debris,7);
  const debris=scene.getObjectByName('small material-specific fragments'),matrix=new THREE.Matrix4();
  for(let i=0;i<state.active.debris;i++){debris.getMatrixAt(i,matrix);assert.ok(matrix.elements[12]>.025,'fragments must move out of solid concrete');}
  assert.deepEqual(state.decals[0].normal,[1,0,0]);
  feedback.reset();feedback.hit({point:[0,2,0],normal:[1,0,0],material:'vehicle-steel'});
  state=feedback.inspect();assert.equal(state.active.debris,0);assert.equal(state.lastImpact.sparks,9);assert.equal(state.active.streaks,9);
  feedback.reset();feedback.hit({point:[0,0,0],normal:[0,1,0],material:'sand'});
  state=feedback.inspect();assert.equal(state.active.decals,0);assert.equal(state.active.debris,0);assert.equal(state.active.streaks,0);assert.equal(state.active.dust,4);
  feedback.dispose();
});

test('mounted M2 has heavier bounded surface response and independently cadenced tracers',()=>{
  const scene=new THREE.Scene(),feedback=createCombatFeedback(scene);
  feedback.hit({point:[0,1,0],normal:[0,0,1],material:'concrete',gunType:'mounted-m2'});
  let state=feedback.inspect();assert.ok(state.lastImpact.fragments>7);assert.ok(state.lastImpact.power>1);
  for(let i=0;i<2;i++)feedback.shot({from:[0,2,0],to:[0,2,-60],gunType:'mounted-m2'});
  state=feedback.inspect();assert.equal(state.events.heavyShots,2);assert.equal(state.tracers.length,1);
  feedback.hit({point:[0,1,0],normal:[0,0,1],material:'metal',power:1e9,gunType:'mounted-m2'});
  assert.equal(feedback.inspect().lastImpact.power,2.5);assert.ok(feedback.inspect().lastImpact.sparks<=14);
  feedback.dispose();
});

test('actor impacts are brief local feedback and never leave permanent world decals',()=>{
  const scene=new THREE.Scene(),feedback=createCombatFeedback(scene);
  feedback.actorHit({point:[0,1.3,0],direction:[0,0,-1],killed:true});
  let state=feedback.inspect();assert.equal(state.actorHits,1);assert.equal(state.active.decals,0);assert.equal(state.active.streaks,0);
  assert.ok(state.active.dust>0);assert.ok(new THREE.Vector3(...state.lastActorHit.direction).distanceTo(new THREE.Vector3(0,0,1))<1e-8);
  for(let i=0;i<8;i++)feedback.update(.05);
  state=feedback.inspect();assert.equal(state.activeParticles,0,'a hit must clear before the next sustained exchange');
  feedback.dispose();
});

test('sustained mixed gunfire reuses six batches, respects every pool and clears on reset',()=>{
  const scene=new THREE.Scene(),feedback=createCombatFeedback(scene,{groundHeight:()=>-.14});
  const group=scene.children[0],initialChildren=group.children.length;
  for(let i=0;i<250;i++){
    feedback.shot({from:[0,1,0],to:[0,1,-60],gunType:i%2?'m16a2':'mounted-m2'});
    feedback.hit({point:[0,1,0],normal:[0,0,1],material:i%2?'metal':'masonry'});
    feedback.actorHit({point:[0,1,0],direction:[0,0,-1]});feedback.update(.01);
  }
  const state=feedback.inspect();assert.equal(initialChildren,6);assert.equal(group.children.length,6);
  for(const[key,count]of Object.entries(state.active))assert.ok(count<=state.poolCapacity[key]);
  feedback.reset();assert.ok(Object.values(feedback.inspect().active).every(value=>value===0));
  feedback.dispose();assert.equal(scene.children.length,0);feedback.shot({from:[0,1,0],to:[0,1,-5]});assert.equal(feedback.inspect().shots,0);
});
