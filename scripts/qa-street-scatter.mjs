import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {storySceneFixture} from '../tests/helpers/story-scene.mjs';
import {createNavigator} from '../src/actor-behavior.js';
import {CHAPTERS} from '../src/story.js';
import {placeCampaignTasks} from '../src/campaign-tasks.js';
import {buildStreetPopulation} from '../src/street-population.js';
import {buildStreetScatter,planStreetScatter} from '../src/street-scatter.js';
import {blocked} from '../src/simulation.js';
import {convoyClearanceBoxes,rectanglesOverlap} from '../src/chapter-boundary.js';
const args=process.argv.slice(2),arg=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
const ids=(arg('--chapters')||Array.from({length:16},(_,i)=>i+1).join(',')).split(',').map(Number);assert(ids.length&&ids.every(i=>i>=1&&i<=16&&Number.isInteger(i)));
const out=path.resolve(arg('--out')||'artifacts/street-scatter-v0.10/cpu-'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(out,{recursive:true});
const report={passed:false,method:'CPU only. Actual procedural chapter meshes/colliders and production task placement, navigation and population; vehicle/aircraft render meshes are fixture stubs. Actual animated convoy swept footprints use authored vehicle lengths and routes. Every emitted scatter geometry is measured after its real transform; no visual approval or normal-play duration claim.',chapters:[],sourceHashes:{},counts:{chapters:0,tasks:0,walkingTasks:0,lockedTasks:0,coreRoutes:0,courtRoutes:0,escorts:0,residentRoutes:0,preservedResidentRoutes:0,convoyEnvelopes:0,protectedParts:0},errors:[]};
for(const file of['src/street-scatter.js','src/chapter-world.js','src/campaign-tasks.js','src/chapter-layouts.js','src/chapter-boundary.js','src/narrative-cinematics.js'])report.sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
const protectedAreas=id=>id===4?[{label:'rope landing 8x8m',minX:-4,maxX:4,minZ:29,maxZ:37}]:id===10?[{label:'first casualty 3m radius box',minX:-27,maxX:-21,minZ:27,maxZ:33},{label:'second casualty 3m radius box',minX:-25,maxX:-19,minZ:25,maxZ:31}]:id===9?[{label:'restricted cockpit',minX:-7,maxX:7,minZ:-7,maxZ:9}]:[];
const contains=(b,g,e=.025)=>g.min.x>=b.minX-e&&g.max.x<=b.maxX+e&&g.min.z>=b.minZ-e&&g.max.z<=b.maxZ+e&&g.min.y>=b.minY-e&&g.max.y<=b.maxY+e;
const point=p=>({x:p[0],z:p[1]});
for(const id of ids){let fixture;const row={chapter:id,passed:false,issues:[],counts:{tasks:0,walkingTasks:0,lockedTasks:0,coreRoutes:0,courtRoutes:0,escorts:0,residentRoutes:0,preservedResidentRoutes:0,convoyEnvelopes:0,protectedParts:0},taskApproaches:[],geometry:{parts:0,triangles:0,materialBatches:0,mediumParts:0},scatter:null};report.chapters.push(row);const started=performance.now();
 try{
  fixture=storySceneFixture(id);const{layout,colliders,built}=fixture,base=colliders.filter(c=>!c.streetScatter),scatter=colliders.filter(c=>c.streetScatter),state=built.state.streetScatter;assert(state,'Scatter installed in real chapter builder');row.scatter=state;assert(state.triangles<=40000);assert(state.materialBatches<=6);assert(state.clusters>=20,'Meaningful cluster density');assert.equal(scatter.length,state.solidProps);
  const plan=planStreetScatter(layout,{colliders:base,storySets:built.state.storySets}),envelopes=convoyClearanceBoxes(layout);row.counts.convoyEnvelopes=envelopes.length;
  for(const box of scatter){assert(Number.isFinite(box.minY)&&Number.isFinite(box.maxY)&&box.maxY>box.minY,'Finite height actual solids');assert(!envelopes.some(c=>rectanglesOverlap(c,box)),'New solid blocks animated vehicle sweep '+box.scatterId);}
  if([2,3,16].includes(id))assert(state.sites.every(s=>['supply','drain'].includes(s.kind)),'Camp theme');if([1,11].includes(id))assert(state.sites.every(s=>['domestic','drain'].includes(s.kind)),'Care area theme');
  const mats=Object.fromEntries(['exposed','brickEdge','wood','rusty','rubber','cloth'].map(k=>[k,new THREE.MeshStandardMaterial()])),materials=new Set(),actual=[],trans=new THREE.Object3D(),regions=protectedAreas(id),replayColliders=base.map(c=>({...c}));
  const replay=buildStreetScatter(layout,{palette:mats,colliders:replayColliders,storySets:built.state.storySets,sampleHeight:built.surface.sampleHeight,add(g,m,p,r){
   trans.position.fromArray(p);trans.rotation.set(...r);trans.updateMatrix();g.applyMatrix4(trans.matrix);g.computeBoundingBox();const bounds=g.boundingBox.clone(),n=(g.index?.count||g.attributes.position.count)/3;row.geometry.parts++;row.geometry.triangles+=n;materials.add(m);
   let height=0,visibleMinY=Infinity;const v=g.attributes.position;for(let k=0;k<v.count;k++){const floor=built.surface.sampleHeight(v.getX(k),v.getZ(k));height=Math.max(height,v.getY(k)-floor);visibleMinY=Math.min(visibleMinY,Math.max(v.getY(k),floor));}
   actual.push({bounds,height,visibleMinY,nominalHeight:bounds.max.y-built.surface.sampleHeight(p[0],p[2]),center:[p[0],p[2]],type:g.type});for(const region of regions)assert(!rectanglesOverlap({minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z},region),'Actual scatter mesh enters '+region.label);if(regions.length)row.counts.protectedParts++;g.dispose();
  }});row.geometry.materialBatches=materials.size;Object.values(mats).forEach(m=>m.dispose());assert.deepEqual(replay.sites,state.sites,'Direct geometry replay must match installed scatter');assert.equal(row.geometry.triangles,state.triangles);assert.equal(materials.size,state.materialBatches);
  for(const part of actual)if(part.nominalHeight>.185){row.geometry.mediumParts++;const site=state.sites.reduce((best,s)=>Math.hypot(s.position[0]-part.center[0],s.position[2]-part.center[1])<Math.hypot(best.position[0]-part.center[0],best.position[2]-part.center[1])?s:best,state.sites[0]),body=scatter.find(b=>b.scatterId===site.id);assert(body&&contains(body,{min:new THREE.Vector3(part.bounds.min.x,part.visibleMinY,part.bounds.min.z),max:part.bounds.max}),'Real medium geometry exceeds its finite collision box: '+site.id+' '+part.type+' '+JSON.stringify({height:part.nominalHeight,bounds:{min:part.bounds.min.toArray(),max:part.bounds.max.toArray()},collider:body}));}
  const nav=createNavigator({radius:.4});nav.setBounds(layout.bounds);nav.setColliders(colliders);const spawn=point(layout.spawn);assert(!blocked(spawn.x,spawn.z,colliders,.4),'Player spawn blocked');const chapter=placeCampaignTasks(CHAPTERS[id-1],layout,colliders);row.counts.tasks=chapter.tasks.length;
  function route(a,b,label){assert(!blocked(a.x,a.z,colliders,.4),label+' start blocked');assert(!blocked(b.x,b.z,colliders,.4),label+' end blocked');const route=nav.findPath(a,b,120000);assert(route.length,label+' unreachable');let previous=a;for(const p of route){assert(nav.clear(previous,p),label+' unsafe path segment');previous=p;}return route;}
  if(id===9)row.counts.lockedTasks=chapter.tasks.length;
  else{
   for(const target of layout.taskPositions){route(spawn,point(target),'core');row.counts.coreRoutes++;}
   for(const court of layout.expansion?.checkpoints||[]){route(spawn,point(court.pos),'courtyard');row.counts.courtRoutes++;}
   for(const task of chapter.tasks){route(spawn,point(task.pos),task.id);let approach=null;for(const radius of[1.25,1.65,2.1])for(let n=0;n<16&&!approach;n++){const a=n*Math.PI/8,p={x:task.pos[0]+Math.cos(a)*radius,z:task.pos[1]+Math.sin(a)*radius};if(nav.valid(p)&&nav.clear(point(task.pos),p))approach=p;}assert(approach,task.id+' has no clear interaction approach');row.taskApproaches.push({id:task.id,pos:task.pos,approach});row.counts.walkingTasks++;
    if(task.interaction==='escort'){const source=chapter.tasks.find(t=>t.id===task.escortFrom);assert(source,task.id+' missing escort source');route(point(source.pos),point(task.pos),'escort '+task.id);row.counts.escorts++;}
   }
   const population=buildStreetPopulation({...layout,taskPositions:chapter.tasks.map(t=>t.pos)},colliders);for(const resident of population.residents){route(point(resident.pos),point(resident.shelter),'resident shelter');row.counts.residentRoutes++;}
   const before=buildStreetPopulation(layout,base);for(const resident of before.residents){route(point(resident.pos),point(resident.shelter),'existing resident preserved');row.counts.preservedResidentRoutes++;}
  }
  for(const enemy of layout.enemySpawns)if(!blocked(...enemy.pos,base,.38))assert(!blocked(...enemy.pos,colliders,.38),'Scatter newly blocks an authored enemy spawn');
  row.passed=true;
 }catch(error){row.issues.push(String(error.stack||error));report.errors.push({chapter:id,message:String(error.message||error)});}finally{fixture?.dispose();row.elapsedMs=performance.now()-started;}
 for(const[k,v]of Object.entries(row.counts))report.counts[k]+=v;report.counts.chapters++;console.log(JSON.stringify({chapter:id,passed:row.passed,clusters:row.scatter?.clusters,triangles:row.scatter?.triangles,geometry:row.geometry,counts:row.counts,issues:row.issues.map(s=>s.split('\n')[0])}));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
}
report.passed=report.chapters.every(r=>r.passed);report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),counts:report.counts,errors:report.errors}));if(!report.passed)process.exitCode=1;
