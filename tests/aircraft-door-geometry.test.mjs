import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {geometryAsset} from './helpers/actor-rig.mjs';import {cutBlackHawkCabinDoors,BLACKHAWK_ROPE_SOCKETS} from '../src/aircraft-door-geometry.js';

test('actual Black Hawk side panels open around the rope sockets without removing cockpit, floor or roof',async()=>{
 const asset=await geometryAsset('uh60-blackhawk.glb'),basis=new THREE.Matrix4().set(0,1,0,-8.123,0,0,1,0,-1,0,0,8.112,0,0,0,1),meshes=[],report=[];
 asset.scene.traverse(o=>{if(!o.isMesh||!['Object_42','Object_43','Object_50'].includes(o.name))return;const original=o.geometry.clone().applyMatrix4(basis),cut=cutBlackHawkCabinDoors(original);original.dispose();assert.equal(cut.sourceTriangles,cut.body.attributes.position.count/3+cut.removedTriangles.reduce((a,b)=>a+b,0));assert(cut.removedTriangles.reduce((a,b)=>a+b,0)<cut.sourceTriangles*.20,'only the small door region can be removed');
  for(const door of cut.doors){const p=door.attributes.position;for(let i=0;i<p.count;i+=3){const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;assert(Math.abs(x)>1.06&&Math.abs(x)<1.40);assert(y>.76&&y<2.22&&z>-.70&&z<1.08);}door.dispose();}
  const mesh=new THREE.Mesh(cut.body,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();meshes.push(mesh);report.push({name:o.name,source:cut.sourceTriangles,removed:cut.removedTriangles});
 });assert.equal(report.length,3);assert.ok(report.every(r=>r.removed.every(n=>n>0)));
 const ray=new THREE.Raycaster();for(const s of BLACKHAWK_ROPE_SOCKETS){ray.set(new THREE.Vector3(s.side*2,1.66,.30),new THREE.Vector3(-s.side,0,0));const hit=ray.intersectObjects(meshes)[0];assert.ok(!hit||Math.abs(hit.point.x)<1.04,'the rope entry must no longer meet the exterior closed door');}
 for(const m of meshes){m.geometry.dispose();m.material.dispose();}
});
