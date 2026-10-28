import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {storySceneFixture} from './helpers/story-scene.mjs';import {createNavigator} from '../src/actor-behavior.js';import {blocked} from '../src/simulation.js';
import {getChapterStoryDirection} from '../src/chapter-story-direction.js';import {CHAPTERS} from '../src/story.js';import {placeCampaignTasks,campaignChapter} from '../src/campaign-tasks.js';import {convoyClearanceBoxes,rectanglesOverlap} from '../src/chapter-boundary.js';import {createStorySceneEvents} from '../src/story-scene-events.js';

test('representative story places are real, distinct sets and preserve all concentrated task approaches',()=>{
 for(const id of[1,6,7,15]){const f=storySceneFixture(id);try{const sets=f.built.state.storySets,direction=getChapterStoryDirection(id);assert.equal(sets.landmarks.length,3);assert.equal(sets.cues.length,3);assert.equal(new Set(sets.landmarks.map(l=>l.kind)).size,3);assert.ok(sets.architecture.length>=2);assert.ok(sets.architecture.every(a=>a.width>=5.6&&a.width<=9&&a.clearCentralPassage));assert.ok(sets.staticTriangles>5000&&sets.staticTriangles<18000);assert.ok(sets.solidCount>10);
  const nav=createNavigator({radius:.4});nav.setBounds(f.layout.bounds);nav.setColliders(f.colliders);const start={x:f.layout.spawn[0],z:f.layout.spawn[1]};
  for(const [index,landmark]of sets.landmarks.entries()){assert.equal(landmark.id,`ch${String(id).padStart(2,'0')}-core${index}`);assert.equal(landmark.label,direction.landmarks['core'+index].name);assert.deepEqual(landmark.taskPosition,f.layout.taskPositions[index]);}
  const chapter=placeCampaignTasks(CHAPTERS[id-1],f.layout,f.colliders);for(const task of chapter.tasks){assert.equal(blocked(...task.pos,f.colliders,.4),false);assert.ok(nav.findPath(start,{x:task.pos[0],z:task.pos[1]},100000).length,task.id+' remains reachable');}
  for(const c of f.layout.expansion.checkpoints)assert.ok(nav.findPath(start,{x:c.pos[0],z:c.pos[1]},100000).length,'court remains reachable');
  const sweeps=convoyClearanceBoxes(f.layout);for(const solid of f.colliders.filter(b=>b.storySet))assert.ok(!sweeps.some(b=>rectanglesOverlap(solid,b)),'a story set must not cross any full convoy body');
 }finally{f.dispose();}}
});

test('actual moving story props have geometry and restore without introducing a false doorway collider',()=>{
 const f=storySceneFixture(7),chapter=campaignChapter(CHAPTERS[6]),controller=createStorySceneEvents({world:{getStoryCueRoot:()=>f.group}});try{
 const cues=[];f.group.traverse(o=>{if(o.userData.storyCue)cues.push(o);});assert.equal(cues.length,3);assert.ok(cues.every(c=>c.children.some(m=>m.isMesh)));const before=cues.map(c=>c.matrix.toArray()),collisionBefore=JSON.stringify(f.colliders);controller.reset({chapter,tasks:chapter.tasks});controller.restoreCompleted(chapter.tasks.map(t=>t.id));f.group.updateMatrixWorld(true);
 assert.ok(cues.every((c,i)=>c.matrix.toArray().some((v,j)=>Math.abs(v-before[i][j])>1e-6)),'every physical cue changes transform');assert.equal(JSON.stringify(f.colliders),collisionBefore,'confirmation props do not invent open/closed movement gates');
 for(const cue of cues.filter(c=>c.userData.storyCue.kind==='gate')){assert.equal(cue.userData.storyCue.gateRole,'rack-confirmation-panel');assert.equal(cue.userData.storyCue.affectsPassage,false);const b=new THREE.Box3().setFromObject(cue);assert.ok(b.max.y-b.min.y<1,'this is a small rack panel, not a walk-through gate');}
 }finally{controller.dispose();f.dispose();}
});

test('cockpit story clues do not add colliders or move the injured player anchors',()=>{
 const f=storySceneFixture(9);try{assert.equal(f.built.state.storySets.solidCount,0);assert.equal(f.built.state.storySets.cues.length,3);assert.equal(f.built.state.storySets.architecture.length,0);assert.deepEqual(f.built.state.taskPositions,[[-.55,-.55],[.55,-.5],[1.95,.9]]);const cues=[];f.group.traverse(o=>{if(o.userData.storyCue)cues.push(o);});assert.equal(cues.length,3);for(const cue of cues){const size=new THREE.Box3().setFromObject(cue).getSize(new THREE.Vector3());assert.ok(Math.max(...size.toArray())<.5);}}
 finally{f.dispose();}
});
