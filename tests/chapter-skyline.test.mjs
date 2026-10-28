import test from 'node:test';import * as THREE from 'three';import assert from 'node:assert/strict';
import {storySceneFixture} from './helpers/story-scene.mjs';import {skylineBackgroundProfile} from '../src/chapter-skyline.js';import {getChapterLayout} from '../src/chapter-layouts.js';import {createNavigator} from '../src/actor-behavior.js';import {CHAPTERS} from '../src/story.js';import {placeCampaignTasks} from '../src/campaign-tasks.js';import {convoyClearanceBoxes,rectanglesOverlap} from '../src/chapter-boundary.js';

test('the reported dawn roadside void receives real building volumes without cutting task or convoy routes',()=>{
 const f=storySceneFixture(15);try{const s=f.built.state.skyline;assert.ok(s.streetInfill.length>=12,'large original core must no longer remain a vacant rectangle');assert.ok(s.streetInfill.some(b=>b.position[0]>-30&&b.position[0]<25&&b.position[2]>45&&b.position[2]<68),'the exact right-side shoulder has actual buildings');assert.ok(new Set(s.streetInfill.map(b=>b.h)).size>=4);assert.ok(s.roofLayers.length>=4,'intact supported roofs still retain several upper volumes');assert.ok(new Set(s.roofLayers.map(b=>b.totalHeight)).size>=3);assert.ok(s.extraTriangles<200000,'infill keeps a bounded procedural geometry budget');
 const nav=createNavigator({radius:.4});nav.setBounds(f.layout.bounds);nav.setColliders(f.colliders);const origin={x:f.layout.spawn[0],z:f.layout.spawn[1]},chapter=placeCampaignTasks(CHAPTERS[14],f.layout,f.colliders);for(const task of chapter.tasks)assert.ok(nav.findPath(origin,{x:task.pos[0],z:task.pos[1]},100000).length,task.id+' must stay reachable');for(const court of f.layout.expansion.checkpoints)assert.ok(nav.findPath(origin,{x:court.pos[0],z:court.pos[1]},100000).length);
 const sweep=convoyClearanceBoxes(f.layout);for(const b of f.colliders.filter(b=>b.streetInfill))assert.equal(sweep.some(s=>rectanglesOverlap(b,s)),false,b.infillId+' must avoid the complete moving column');
 for(const roof of s.roofLayers){const original=f.layout.buildings.find(b=>b.x===roof.parent[0]&&b.z===roof.parent[1]);assert.ok(original&&!original.interior);assert.ok(roof.position[0]-roof.w/2>=original.x-original.w/2);assert.ok(roof.position[0]+roof.w/2<=original.x+original.w/2);assert.ok(roof.position[2]-roof.d/2>=original.z-original.d/2);assert.ok(roof.position[2]+roof.d/2<=original.z+original.d/2);}
 }finally{f.dispose();}
});

test('far and middle skyline heights are deterministic and camps retain a lower service profile',()=>{
 const urban=getChapterLayout(15),camp=getChapterLayout(2),near=[],far=[],base=[];for(let i=0;i<28;i++){const n={x:150+i*17,z:140-i*11,edge:20},f={...n,edge:65};near.push(skylineBackgroundProfile(urban,n,i));far.push(skylineBackgroundProfile(urban,f,i));base.push(skylineBackgroundProfile(camp,n,i));assert.deepEqual(skylineBackgroundProfile(urban,n,i),near.at(-1));}
 assert.ok(new Set(near.map(p=>p.h)).size>8);assert.ok(new Set(far.map(p=>p.h)).size>8);assert.ok(Math.max(...far.map(p=>p.h))>Math.max(...near.map(p=>p.h))+3);assert.ok(base.every(p=>p.h<=7&&p.style==='camp'));assert.ok(near.some(p=>p.setbackFactor<.7));
});

test('restricted cockpit and medical interior add no new ground-level street lots',()=>{
 for(const id of[9,11]){const f=storySceneFixture(id);try{const s=f.built.state.skyline;assert.deepEqual(s.streetInfill,[]);assert.ok(s.roofLayers.every(r=>f.layout.buildings.find(b=>b.x===r.parent[0]&&b.z===r.parent[1])?.district),'roof variety stays outside the authored interior');assert.ok(f.colliders.filter(b=>b.skylineRoof).every(b=>b.ground===false));}finally{f.dispose();}}
});


test('roof rooms never bridge the destroyed insertion shop and rest on actual emitted roof triangles',()=>{
 for(const id of[4,15]){const f=storySceneFixture(id);try{
  const roofs=f.built.state.skyline.roofLayers;assert(roofs.length>3);
  if(id===4)assert(!roofs.some(r=>r.parent[0]===-17&&r.parent[1]===24),'The core builder upgrades this exact shop to a roofless ruin');
  f.group.updateMatrixWorld(true);const ray=new THREE.Raycaster(),meshes=[];f.group.traverse(o=>{if(o.isMesh)meshes.push(o);});
  for(const roof of roofs){const base=f.layout.buildings.find(b=>b.x===roof.parent[0]&&b.z===roof.parent[1]);assert(!base.ruin&&(base.damage||0)<=.30);const y=roof.support.height;
   for(const dx of[-.40,0,.40])for(const dz of[-.40,0,.40]){const x=roof.position[0]+roof.w*dx,z=roof.position[2]+roof.d*dz;
    // Begin underneath the new room's own footing (bottom y+.03), so the
    // addition cannot supply its own false supporting intersection.
    ray.set(new THREE.Vector3(x,y+.012,z),new THREE.Vector3(0,-1,0));ray.far=.06;const hit=ray.intersectObjects(meshes,false)[0];assert(hit&&Math.abs(hit.point.y-y)<.02,'Actual base roof must exist below every footprint probe '+id+'/'+roof.parent+'/'+dx+','+dz);
   }
  }
 }finally{f.dispose();}}
});
