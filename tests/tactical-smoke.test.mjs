import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTacticalSmoke} from '../src/tactical-smoke.js';

test('a smoke canister accepts a depressed road surface and emits above that actual floor',()=>{
  const scene=new THREE.Scene(),smoke=createTacticalSmoke(scene);
  smoke.deploy({x:1,y:-.18,z:2});smoke.update(1,new THREE.PerspectiveCamera());
  assert.equal(smoke.inspect().clouds[0].position.y,-.18);
  const transform=new THREE.Matrix4();scene.getObjectByName('deployed smoke canisters').getMatrixAt(0,transform);
  assert.ok(Math.abs(transform.elements[13]+.07)<1e-7);smoke.dispose();
});

test('smoke matures into local visibility obstruction, not an infinite ray wall',()=>{
  const smoke=createTacticalSmoke(new THREE.Scene());
  smoke.deploy([0,0]);
  assert.equal(smoke.inspect().clouds[0].position.y,0);
  assert.equal(smoke.obscures([-10,1.4,0],[10,1.4,0]),false);
  smoke.update(3.3);
  assert.equal(smoke.obscures([-10,1.4,0],[10,1.4,0]),true);
  const beforeMood=smoke.inspect().clouds;smoke.setMood('night');assert.equal(smoke.inspect().mood,'night');assert.deepEqual(smoke.inspect().clouds,beforeMood);assert.equal(smoke.obscures([-10,1.4,0],[10,1.4,0]),true);
  assert.equal(smoke.obscures([-10,1.4,5],[10,1.4,5]),false);
  assert.equal(smoke.obscures([-10,5,0],[10,5,0]),false);
  assert.equal(smoke.obscures([-10,1.4,0],[-6,1.4,0]),false);
  assert.equal(smoke.obscures([0,1.4,0],[.3,1.4,0]),false);
  assert.equal(smoke.obscures([-10,1.4,4.02],[10,1.4,4.02]),false);
  assert.equal(smoke.obscures([0,1.4,0],[8,1.4,0]),true);
  smoke.update(14);
  assert.equal(smoke.obscures([-10,1.4,0],[10,1.4,0]),false,'fading smoke returns visibility before retirement');
  smoke.dispose();
});

test('smoke respects two-cloud capacity, pause, lifetime, reset, and ownership cleanup',()=>{
  const scene=new THREE.Scene(),smoke=createTacticalSmoke(scene),camera=new THREE.PerspectiveCamera();
  assert.equal(smoke.deploy({x:NaN,z:0}),false);
  assert.ok(smoke.deploy({x:0,z:0}));assert.ok(smoke.deploy({x:8,z:0}));assert.equal(smoke.deploy({x:20,z:0}),false);
  smoke.update(4,camera);const paused=smoke.inspect();
  assert.equal(paused.active,2);assert.equal(paused.particles,136);assert.equal(paused.drawCalls,2);
  smoke.update(0,camera);smoke.update(-4,camera);smoke.update(NaN,camera);
  assert.deepEqual(smoke.inspect(),paused);
  smoke.update(14,camera);assert.equal(smoke.inspect().active,0);assert.equal(smoke.inspect().particles,0);
  assert.ok(smoke.deploy([1,.08,2]));smoke.update(1,camera);smoke.reset();
  assert.equal(smoke.inspect().time,0);assert.equal(smoke.inspect().active,0);assert.equal(smoke.obscures([-10,1,2],[10,1,2]),false);
  smoke.dispose();smoke.dispose();assert.equal(scene.children.length,0);assert.equal(smoke.deploy([0,0]),false);
});
