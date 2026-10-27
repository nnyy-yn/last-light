import test from 'node:test';
import assert from 'node:assert/strict';
import {expandChapterLayout} from '../src/chapter-expansion.js';
import {CHAPTER_LAYOUTS} from '../src/chapter-layouts.js';
import {createNavigator} from '../src/actor-behavior.js';
import {blocked,lineBlocked} from '../src/simulation.js';

// Independent collider oracle for the documented L-shaped district model.
function districtBoxes(layout){return layout.buildings.filter(b=>b.district).flatMap(b=>{
 const box=(x,z,w,d)=>({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2});
 if(b.style!=='courtyard')return[box(b.x,b.z,b.w,b.d)];
 const rear=b.d*.47,wing=b.w*.39;
 return [box(b.x,b.z-b.d/2+rear/2,b.w,rear),box(b.x-b.w/2+wing/2,b.z+rear/2,wing,b.d-rear),box(b.x+b.w*.33,b.z+b.d/2-.12,b.w*.26,.24),...[-1,1].map(s=>box(b.x+b.w*.02+s*.73,b.z+b.d/2-.12,.28,.31))];
});}

test('expansion preserves the authored story and convoy coordinates and is idempotent',()=>{
 const l={chapter:4,bounds:{minX:-25,maxX:25,minZ:-28,maxZ:28},bound:30,type:'narrow-t-street',spawn:[0,20],facing:0,taskPositions:[[0,9],[0,-3],[12,-16]],route:[[0,20],[0,-16],[12,-16]],roads:[{points:[[0,25],[0,-24]],width:9,surface:'road'}],buildings:[{x:15,z:5,w:12,d:12,h:6}],props:[{kind:'vehicle',pos:[0,-14],rotation:0}],enemySpawns:[{pos:[0,-21]}],landmarks:[],cinematic:{vehicleRoute:[[0,0,24],[0,0,-24]]}};
 const original=structuredClone(l);expandChapterLayout(l);
 for(const k of ['spawn','facing','taskPositions','route','cinematic','enemySpawns'])assert.deepEqual(l[k],original[k]);
 assert.deepEqual(l.roads.slice(0,original.roads.length),original.roads);assert.deepEqual(l.buildings.slice(0,original.buildings.length),original.buildings);assert.deepEqual(l.props.slice(0,1),original.props);
 const once=structuredClone(l);expandChapterLayout(l);assert.deepEqual(l,once);const again=structuredClone(original);expandChapterLayout(again);assert.deepEqual(again,once);
});

test('all scenes gain occupied 240–280m districts with connected rings and named usable courts',()=>{
 for(const l of CHAPTER_LAYOUTS){
  assert(l.bounds.maxX-l.bounds.minX>=240);assert(l.bounds.maxZ-l.bounds.minZ>=240);
  assert(l.expansion.buildings>=16,`chapter ${l.chapter} needs real occupied street blocks`);assert.equal(l.expansion.regions.length,3);assert.equal(l.expansion.checkpoints.length,2);
  const roads=l.roads.filter(r=>r.expansion),loops=roads.slice(0,2);for(const r of loops)assert.deepEqual(r.points[0],r.points.at(-1));assert(l.expansion.entrances.length>=1);
  assert(l.expansion.frontageBuildings>=20,'large lots need smaller connecting shopfronts');
  for(const b of l.buildings.filter(b=>b.district)){assert.equal(b.yaw,0);assert(b.w>=6&&b.d>=6);assert(b.h>=3);assert(b.x-b.w/2>l.bounds.minX&&b.x+b.w/2<l.bounds.maxX);assert(b.z-b.d/2>l.bounds.minZ&&b.z+b.d/2<l.bounds.maxZ);}
  const boxes=districtBoxes(l),nav=createNavigator({bound:l.bound});nav.setBounds(l.bounds);nav.setColliders(boxes);
  const entry=l.expansion.entrances[0].pos,start={x:entry[0],z:entry[1]};
  for(const court of l.expansion.checkpoints){const inside={x:court.pos[0],z:court.pos[1]},door={x:court.entrance[0],z:court.entrance[1]};assert(!blocked(inside.x,inside.z,boxes,.4));assert(!lineBlocked(inside,door,boxes),'a courtyard is entered through its actual front gate');assert(nav.findPath(start,inside,45000).length,`chapter ${l.chapter} ${court.name} disconnected`);}
  for(const road of roads)for(let i=1;i<road.points.length;i++){const a={x:road.points[i-1][0],z:road.points[i-1][1]},b={x:road.points[i][0],z:road.points[i][1]};assert(!lineBlocked(a,b,boxes),`chapter ${l.chapter} a new street crosses an occupied lot`);}
 }
});

test('all 48 core task points and routes remain clear of added district structures',()=>{
 let count=0;for(const l of CHAPTER_LAYOUTS){const boxes=districtBoxes(l),nav=createNavigator({bound:l.bound});nav.setBounds(l.bounds);nav.setColliders(boxes);
  for(const p of l.taskPositions){assert(!blocked(p[0],p[1],boxes,.5));assert(nav.findPath({x:l.spawn[0],z:l.spawn[1]},{x:p[0],z:p[1]},45000).length);count++;}
  for(let i=1;i<l.route.length;i++)assert(!lineBlocked({x:l.route[i-1][0],z:l.route[i-1][1]},{x:l.route[i][0],z:l.route[i][1]},boxes));
 }assert.equal(count,48);
});

test('combat sectors span four approaches while peaceful districts and the injured pilot remain noncombat',()=>{
 for(const l of CHAPTER_LAYOUTS){if(l.enemySpawns.length){assert.equal(l.expansion.patrolGroups.length,4);assert.deepEqual(l.expansion.patrolGroups.map(g=>g.id),['west','north','east','south']);}else assert.equal(l.expansion.patrolGroups.length,0);}
 const cockpit=CHAPTER_LAYOUTS[8];assert.equal(cockpit.type,'restricted-cockpit');assert.equal(cockpit.expansion.externalOnly,true);assert.deepEqual(cockpit.coreBounds,{minX:-1.12,maxX:1.12,minZ:-1.8,maxZ:1.6});
});
