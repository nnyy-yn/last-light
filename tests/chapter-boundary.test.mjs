import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {getChapterLayout} from '../src/chapter-layouts.js';
import {planChapterBoundary,buildChapterBoundary,convoyClearanceBoxes,footprint,rectanglesOverlap} from '../src/chapter-boundary.js';
import {createDistrictBuildings} from '../src/district-buildings.js';
import {blocked} from '../src/simulation.js';

test('all four playable edges are covered by physical frontages without blocking the outer ring',()=>{
  for(let id=1;id<=16;id++){
    const layout=getChapterLayout(id),plan=planChapterBoundary(layout),b=layout.bounds,solids=[...plan.buildings,...plan.walls].map(footprint);
    assert.equal(layout.expansion.checkpoints.length,2,'convoy clearance must retain both public courts');
    for(let x=b.minX+.1;x<b.maxX;x+=.5){assert.ok(blocked(x,b.minZ,solids,0));assert.ok(blocked(x,b.maxZ,solids,0));}
    for(let z=b.minZ+.1;z<b.maxZ;z+=.5){assert.ok(blocked(b.minX,z,solids,0));assert.ok(blocked(b.maxX,z,solids,0));}
    for(const r of layout.roads.filter(r=>r.expansion))for(let i=1;i<r.points.length;i++){
      const a=r.points[i-1],c=r.points[i],steps=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1]));for(let k=0;k<=steps;k++){const t=k/steps,x=a[0]+(c[0]-a[0])*t,z=a[1]+(c[1]-a[1])*t;assert.equal(blocked(x,z,solids,.5),false,`chapter ${id} expansion road blocked at ${x}/${z}`);}
    }
  }
});

test('new boundary, closed yards and additions all clear the entire production convoy sweep',()=>{
  for(let id=1;id<=16;id++){
    const layout=getChapterLayout(id),plan=planChapterBoundary(layout),sweeps=convoyClearanceBoxes(layout);
    for(const b of [...layout.buildings.filter(b=>b.district),...plan.buildings,...plan.walls])assert.ok(!sweeps.some(s=>rectanglesOverlap(footprint(b),s)),`chapter ${id} new building/closure enters a convoy body: ${b.id||b.x+'/'+b.z}`);
  }
});

test('the pictured chapter seven alley closes with a visible rear gate and stepped upper building',()=>{
  const layout=getChapterLayout(7),plan=planChapterBoundary(layout),shop=layout.buildings.find(b=>b.district&&b.style==='shop-house');
  const rear=plan.buildings.find(b=>b.edge==='interior'&&Math.abs(b.x-shop.x)<1&&b.z<shop.z);
  assert.ok(rear&&rear.h>shop.h+5,'a real taller rear volume fills the exposed shop roofline');
  assert.ok(plan.walls.some(w=>w.edge==='interior'&&Math.abs(w.x+45.65)<1&&Math.abs(w.z+97.64)<1),'the narrow service lane ends at a physical closed yard');
});

test('perimeter collision is backed by actual visible geometry at player body height',()=>{
  const layout=getChapterLayout(7),plan=planChapterBoundary(layout),parts=new Map(),colliders=[],stats={};let current='walls';
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),materials={plaster:[material],concrete:material,exposed:material,wood:material,rusty:material,metal:material,brickEdge:material,blue:material,green:material,cloth:material,burned:material,awning:material,dark:material,rubber:material};
  const add=(geometry,mat,p=[0,0,0],r=[0,0,0])=>{if(geometry.index){const old=geometry;geometry=geometry.toNonIndexed();old.dispose();}geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p),new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),new THREE.Vector3(1,1,1)));if(!parts.has(current))parts.set(current,[]);parts.get(current).push(geometry);};
  const box=(w,h,d,m,x,y,z,ry=0,rx=0,rz=0)=>add(new THREE.BoxGeometry(w,h,d),m,[x,y,z],[rx,ry,rz]);
  const builder=createDistrictBuildings({add,box,materials,stats}),district={inspect:builder.inspect,building(spec){current=spec.id;return builder.building(spec);}};
  buildChapterBoundary({layout,plan,district,box,line:()=>{},materials,colliders,stats});
  const meshes=[...parts.values()].map(list=>{const geometry=mergeGeometries(list);for(const g of list)g.dispose();const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();return mesh;});
  const ray=new THREE.Raycaster(),b=layout.bounds;let samples=0;
  for(const axis of ['x','z'])for(const side of[-1,1])for(let along=-118;along<119;along+=3){
    const boundary=side<0?b[axis==='x'?'minX':'minZ']:b[axis==='x'?'maxX':'maxZ'],origin=axis==='x'?new THREE.Vector3(boundary-side*1.5,.24,along):new THREE.Vector3(along,.24,boundary-side*1.5),direction=axis==='x'?new THREE.Vector3(side,0,0):new THREE.Vector3(0,0,side);
    ray.set(origin,direction);ray.far=2.1;const hit=ray.intersectObjects(meshes,false)[0];assert.ok(hit,`visible closure missing on ${axis}/${side}/${along}`);assert.ok(hit.distance<1.6);samples++;
  }
  assert.ok(samples>300);assert.ok(stats.visibleBoundary.triangles<425000);
  for(const mesh of meshes)mesh.geometry.dispose();material.dispose();
});
