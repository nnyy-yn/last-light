import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createActorContactShadows} from '../src/actor-contact-shadows.js';

function actorAt(x, z, floor, offset=0, gap=.006) {
  const actor=new THREE.Group();actor.position.set(x,0,z);
  const at=(dx,dz)=>[x+dx,floor(x+dx,z+dz)+offset+gap,z+dz];
  actor.userData.poseState={groundContact:{weight:1,hip:gap,shoulder:gap,feet:[gap,gap],points:{hip:at(0,0),shoulder:at(.10,.35),feet:[at(-.12,-.68),at(.13,-.72)]}}};
  return actor;
}

test('one contact batch conforms to sloped ground and preserves measured rooftop support height',()=>{
  const floor=(x,z)=>.08*x-.06*z, parent=new THREE.Group();parent.position.set(3,1,-4);parent.rotation.y=.4;parent.scale.setScalar(1.3);parent.updateMatrixWorld(true);
  const actor=actorAt(5,7,floor,8.2),before=actor.position.clone(),system=createActorContactShadows(parent,{sampleHeight:floor});
  system.update([actor]);const info=system.inspect(),mesh=parent.children[0];
  assert.equal(info.count,5);assert.equal(info.drawCalls,1);assert.equal(parent.children.length,1);assert(mesh.isInstancedMesh);assert.equal(mesh.material.forceSinglePass,true);assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.material.depthTest,true);
  assert(actor.position.equals(before),'contact shading must never reposition a character');
  const m=new THREE.Matrix4(),v=new THREE.Vector3();mesh.updateMatrixWorld(true);
  info.patches.forEach((p,instance)=>{assert(Math.abs(p.supportOffset-8.2)<1e-7);mesh.getMatrixAt(instance,m);
    for(let i=0;i<9;i++){v.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(m).applyMatrix4(mesh.matrixWorld);assert(Math.abs(p.heights[i]-(floor(v.x,v.z)+8.2+info.lift))<1e-6,'all nine rendered grid heights follow the supporting slope');}
    assert(p.opacity>0&&p.opacity<=.35);
  });system.dispose();
});

test('unsupported, missing, hidden or distant contacts cannot fabricate a ground shadow',()=>{
  const parent=new THREE.Group(),camera=new THREE.PerspectiveCamera(),system=createActorContactShadows(parent,{sampleHeight:()=>0}),grounded=actorAt(0,0,()=>0),airborne=actorAt(0,0,()=>0,0,.35),hidden=actorAt(0,0,()=>0),missing=new THREE.Group(),far=actorAt(80,0,()=>0),off=new THREE.Group();off.visible=false;off.add(hidden);
  const invalid=actorAt(0,0,()=>0);invalid.userData.poseState.groundContact.weight=0;
  system.update([grounded,airborne,hidden,missing,far,invalid],camera);assert.equal(system.inspect().count,5);assert(system.inspect().patches.every(p=>p.actorId===grounded.uuid));
  grounded.userData.poseState.groundContact.hip=.08;system.update([grounded],camera);const reduced=system.inspect().patches.find(p=>p.kind==='hip');assert(reduced.opacity>0&&reduced.opacity<.28,'only a near-supported contact has a fading edge');
  system.update([airborne,hidden,missing,far,invalid],camera);assert.equal(system.inspect().count,0);assert.equal(parent.children[0].visible,false);system.dispose();
});

test('a crowded scene stays within the fixed patch budget, refreshes count and disposes once',()=>{
  const parent=new THREE.Group(),system=createActorContactShadows(parent,{sampleHeight:()=>0}),actors=Array.from({length:70},(_,i)=>actorAt(i*.1,0,()=>0));
  system.update(actors,new THREE.PerspectiveCamera());const full=system.inspect(),mesh=parent.children[0];assert.equal(full.count,160);assert.equal(full.capacity,160);assert.equal(full.drawCalls,1);assert.equal(full.sampleCount,1600);assert.equal(mesh.instanceMatrix.count,160);
  assert(full.patches.some(p=>p.actorId===actors[0].uuid));assert(!full.patches.some(p=>p.actorId===actors[69].uuid),'nearest complete actors consume the bounded budget first');
  let geometryDisposals=0,materialDisposals=0;mesh.geometry.addEventListener('dispose',()=>geometryDisposals++);mesh.material.addEventListener('dispose',()=>materialDisposals++);
  system.update([actors[0]]);assert.equal(mesh.count,5);system.update([]);assert.equal(mesh.count,0);system.dispose();system.dispose();system.update(actors);assert.equal(parent.children.length,0);assert.equal(geometryDisposals,1);assert.equal(materialDisposals,1);assert.equal(system.inspect().disposed,true);
});
