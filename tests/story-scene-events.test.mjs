import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createStorySceneEvents,getStorySceneEventPlan} from '../src/story-scene-events.js';
import {CHAPTERS} from '../src/story.js';
import {campaignChapter} from '../src/campaign-tasks.js';
import {actorRig} from './helpers/actor-rig.mjs';

const tick=(events,seconds=2)=>{for(let t=0;t<seconds;t+=.05)events.update(.05);};
function fixture(id=1){
 const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
 const chapter=campaignChapter(CHAPTERS[id-1]),calls=[];
 const tasks=chapter.tasks.map(task=>{const obj=new THREE.Group();obj.name=task.speaker||task.id;obj.userData.kind=task.kind;obj.userData.virtual=task.interaction==='radio'||task.spawn===false||Boolean(task.actorFrom);obj.userData.animate=(speed,dt,pose)=>calls.push({id:task.id,speed,dt,pose});scene.add(obj);return {...task,obj,participantActors:[]};});
 for(let i=0;i<3;i++){const cue=new THREE.Group();cue.name='story-cue:'+id+'-'+i;cue.position.set(i*3,.5,0);cue.add(new THREE.Mesh(new THREE.BoxGeometry(.4,.3,.1),new THREE.MeshBasicMaterial()));cue.userData.storyCue={id:`ch${String(id).padStart(2,'0')}-core${i}`,chapterId:id,coreIndex:i,kind:['gate','curtain','stretcher'][i],axis:'y',angle:i===0?1:.1,travel:i===2?[0,0,.35]:[.05,0,0]};root.add(cue);}
 const events=[],controller=createStorySceneEvents({world:{getStoryCueRoot:()=>root},onEvent:e=>events.push(e)});controller.reset({chapter,tasks});
 return {scene,root,chapter,tasks,calls,events,controller};
}

test('all sixteen chapters show four distinct physical story changes with the original core IDs',()=>{
 for(let id=1;id<=16;id++){
  const f=fixture(id),plan=getStorySceneEventPlan(f.chapter),states=[];assert.equal(plan.phases.length,4);
  const before=structuredClone(f.controller.inspect().cues);let phases=0;
  for(const task of f.tasks){f.controller.taskStarted(task.id);tick(f.controller);if(f.controller.inspect().phaseIds.length>phases){states.push(f.controller.inspect().cues);phases=f.controller.inspect().phaseIds.length;}f.controller.taskCompleted(task.id);tick(f.controller);}
  assert.equal(f.controller.inspect().phaseIds.length,4);assert.equal(f.events.filter(e=>e.type==='phase').length,4);
  assert.notDeepEqual(states[0],before);for(let i=1;i<states.length;i++)assert.notDeepEqual(states[i],states[i-1],`chapter ${id} phase ${i} changes geometry transforms`);
  assert.equal(f.root.children.length,3,'Controller cannot add scene geometry or new NPCs');assert.equal(f.scene.children.length,f.tasks.length+1);
  assert(f.controller.inspect().cues.every(c=>c.amount===1));f.controller.dispose();
 }
});

test('transitions start from the actual transform, remain gradual, and freeze during pause',()=>{
 const f=fixture(),start=f.root.children[0].quaternion.clone();f.controller.taskStarted(f.tasks[0].id);
 assert.deepEqual(f.root.children[0].quaternion.toArray(),start.toArray(),'Starting a story event cannot snap its prop');f.controller.update(.05);
 const state=f.controller.inspect();assert(state.cues[0].amount>0&&state.cues[0].amount<.24);f.controller.update(0);f.controller.update(NaN);assert.deepEqual(f.controller.inspect(),state);
 f.controller.pause();const frozen=f.controller.inspect();for(let i=0;i<10;i++)f.controller.update(.1);assert.deepEqual(f.controller.inspect(),frozen);f.controller.resume();tick(f.controller);assert.equal(f.controller.inspect().cues[0].amount,.24);f.controller.dispose();
});

test('a real checkpoint prefix restores identical final prop state with no event/reward replay',()=>{
 const live=fixture(6),firstCore=getStorySceneEventPlan(live.chapter).coreTaskIds[1],end=live.tasks.findIndex(t=>t.id===firstCore)+1;
 for(const task of live.tasks.slice(0,end)){live.controller.taskStarted(task.id);live.controller.taskCompleted(task.id);}tick(live.controller,3);
 const before=live.controller.inspect(),restored=fixture(6),count=restored.events.length;
 assert(restored.controller.restoreCompleted(live.tasks.slice(0,end).map(t=>t.id)));assert.deepEqual(restored.controller.inspect().cues,before.cues);assert.deepEqual(restored.controller.inspect().phaseIds,before.phaseIds);
 assert.equal(restored.events.length,count,'Restore must not notify the runtime or replay a task');assert.deepEqual(restored.controller.inspect().activeGestures,[]);
 const at=restored.controller.inspect();assert.equal(restored.controller.taskCompleted(firstCore),false);assert.deepEqual(restored.controller.inspect(),at);assert.equal(restored.controller.restoreCompleted(['unknown']),false);assert.deepEqual(restored.controller.inspect(),at);
 live.controller.dispose();restored.controller.dispose();
});

test('authored decision reactions are idempotent presentation and never change caller resources/options',()=>{
 const f=fixture(1),task=f.tasks.find(t=>t.decision);assert(task);const before=JSON.stringify(task.decision),resources={ammo:23,medicine:2};
 assert(f.controller.decision(task.id,task.decision.options[0].id));assert.equal(f.controller.decision(task.id,task.decision.options[1].id),false);assert.equal(f.controller.decision(task.id,'fake'),false);
 assert.equal(JSON.stringify(task.decision),before);assert.deepEqual(resources,{ammo:23,medicine:2});assert.equal(f.events.filter(e=>e.type==='decision').length,1);f.controller.dispose();
});

test('existing NPC animation is called once, preserves movement and skips wounded/hidden/dead actors',()=>{
 const f=fixture(2),task=f.tasks.find(t=>!t.obj.userData.virtual&&t.kind==='soldier');assert(task);const original=task.obj.userData.animate,position=task.obj.position.toArray();
 f.controller.taskStarted(task.id);f.controller.update(.1);f.controller.update(.1);task.obj.userData.animate(0,.05,{stance:'stand'});
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].dt,.05);assert(f.calls[0].pose.talk>0);assert.deepEqual(task.obj.position.toArray(),position);
 task.obj.userData.animate(2.5,.05,{stance:'stand'});assert.equal(f.calls.at(-1).pose.talk,undefined);assert.equal(task.obj.userData.storyGesture,undefined);
 for(const pose of[{stance:'treat'},{dead:1},{reload:.5}]){task.obj.userData.animate(0,.05,pose);assert.deepEqual(f.calls.at(-1).pose,pose);}
 task.obj.visible=false;task.obj.userData.animate(0,.05,{stance:'stand'});assert.equal(f.calls.at(-1).pose.talk,undefined);task.obj.visible=true;
 f.controller.dispose();assert.notEqual(task.obj.userData.animate,original,'The local variable captured an installed wrapper');const count=f.calls.length;task.obj.userData.animate(0,.05,{});assert.equal(f.calls.length,count+1);assert.equal(task.obj.userData.storyGesture,undefined);
});

test('reset and dispose restore chapter-owned cue transforms and actor function identities',()=>{
 const f=fixture(4),home=f.root.children.map(c=>({p:c.position.toArray(),q:c.quaternion.toArray(),s:c.scale.toArray()})),wrapper=f.tasks.find(t=>!t.obj.userData.virtual&&t.kind==='soldier').obj.userData.animate;
 for(const task of f.tasks){f.controller.taskStarted(task.id);f.controller.taskCompleted(task.id);}tick(f.controller);assert.equal(f.controller.inspect().phaseIds.length,4);
 f.controller.reset({chapter:f.chapter,tasks:f.tasks});assert.deepEqual(f.root.children.map(c=>({p:c.position.toArray(),q:c.quaternion.toArray(),s:c.scale.toArray()})),home);assert.equal(f.controller.inspect().phaseIds.length,0);assert.notEqual(f.tasks.find(t=>!t.obj.userData.virtual&&t.kind==='soldier').obj.userData.animate,wrapper);
 f.controller.dispose();f.controller.dispose();assert.equal(f.controller.inspect().cueCount,0);assert.equal(f.controller.inspect().actorCount,0);assert.equal(f.controller.taskStarted(f.tasks[0].id),false);assert.equal(f.root.children.length,3);
});

test('chapter nine stays in cockpit prop state and never creates a second injured protagonist',()=>{
 const f=fixture(9),before=f.tasks.map(t=>t.obj.position.toArray());for(const task of f.tasks){f.controller.taskStarted(task.id);f.controller.taskCompleted(task.id);}tick(f.controller);
 assert.equal(f.controller.inspect().phaseIds.length,4);assert.deepEqual(f.controller.inspect().activeGestures,[]);assert.deepEqual(f.tasks.map(t=>t.obj.position.toArray()),before);assert.equal(f.scene.children.length,f.tasks.length+1);f.controller.dispose();
});

test('scene acknowledgement articulates the existing MakeHuman arm without moving roots or legs',async()=>{
 const previous=globalThis.document;globalThis.document={baseURI:new URL('../',import.meta.url).href};
 try{
  const {installActorPoses}=await import('../src/world.js'),rig=await actorRig('civilian');installActorPoses(rig.root,rig.model,rig.bones,null,'civilian',()=>{});
  const f=fixture(1),task=f.tasks.find(t=>!t.obj.userData.virtual&&t.kind==='civilian');f.controller.dispose();task.obj=rig.root;f.scene.add(rig.root);const original=rig.root.userData.animate;
  const control=createStorySceneEvents({world:{getStoryCueRoot:()=>f.root}});control.reset({chapter:f.chapter,tasks:f.tasks});rig.root.userData.animate(0,.05,{stance:'stand'});
  const hand=rig.bones.mixamorigRightHand,ankle=rig.bones.mixamorigRightFoot,beforeHand=hand.getWorldPosition(new THREE.Vector3()),beforeAnkle=ankle.getWorldPosition(new THREE.Vector3()),root=rig.root.position.clone();
  control.taskStarted(task.id);for(let i=0;i<14;i++){control.update(.05);rig.root.userData.animate(0,.05,{stance:'stand'});}
  assert.ok(hand.getWorldPosition(new THREE.Vector3()).distanceTo(beforeHand)>.10,'Acknowledge gesture visibly moves the original hand');assert.deepEqual(rig.root.position,root);assert.ok(ankle.getWorldPosition(new THREE.Vector3()).distanceTo(beforeAnkle)<.025,'Gesture cannot steer the walking rig or feet');
  control.dispose();assert.equal(rig.root.userData.animate,original);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});


test('handover phase changes the site before the final task ends and local cue travel respects site orientation',()=>{
 const f=fixture(6),plan=getStorySceneEventPlan(f.chapter),lastAct=f.tasks.findIndex(t=>t.id===plan.phases[3].trigger.taskId);assert.ok(lastAct>=0);
 for(const task of f.tasks.slice(0,lastAct)){f.controller.taskStarted(task.id);f.controller.taskCompleted(task.id);}tick(f.controller);
 f.controller.taskStarted(f.tasks[lastAct].id);tick(f.controller);assert.ok(f.controller.inspect().phaseIds.includes(plan.phases[3].id));assert.ok(!f.controller.inspect().completedTaskIds.includes(f.tasks[lastAct].id),'Last dramatic change must be visible before the final action/choice overlay');
 f.controller.dispose();const cue=f.root.children[2];cue.rotation.y=Math.PI/2;const home=cue.position.clone();f.controller=createStorySceneEvents({world:{getStoryCueRoot:()=>f.root}});f.controller.reset({chapter:f.chapter,tasks:f.tasks});
 for(const task of f.tasks){f.controller.taskStarted(task.id);f.controller.taskCompleted(task.id);}tick(f.controller);assert.ok(cue.position.x>home.x+.3);assert.ok(Math.abs(cue.position.z-home.z)<.01);f.controller.dispose();
});

test('all 48 production story-set cues contain real meshes and are animated without owning their geometry',async()=>{
 const {buildChapterStorySets}=await import('../src/chapter-story-sets.js'),{getChapterLayout}=await import('../src/chapter-layouts.js');
 for(let id=1;id<=16;id++){
  const f=fixture(id);f.controller.dispose();f.root.clear();const shared=new THREE.MeshStandardMaterial(),owned=[],texture=new THREE.Texture(),palette=new Proxy({},{get:()=>shared});
  const sets=buildChapterStorySets(getChapterLayout(id),{group:f.root,colliders:[],palette,material:opts=>{const m=new THREE.MeshStandardMaterial(opts);owned.push(m);return m;},canvasTexture:()=>texture,add:g=>g.dispose(),box:()=>{},line:()=>{},stats:{}});
  assert.equal(sets.cues.length,3);assert.ok(new Set(sets.cues.map(c=>c.kind)).size>=2);let triangles=0;f.root.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});assert.ok(triangles>30,'The runtime cannot pass with empty metadata nodes');
  const control=createStorySceneEvents({world:{getStoryCueRoot:()=>f.root}});control.reset({chapter:f.chapter,tasks:f.tasks});assert.equal(control.inspect().cueCount,3);
  for(const task of f.tasks){control.taskStarted(task.id);control.taskCompleted(task.id);}tick(control);assert.equal(control.inspect().phaseIds.length,4);assert.ok(control.inspect().cues.every(c=>c.amount===1));
  control.dispose();assert.equal(f.root.children.filter(c=>c.userData.storyCue).length,3);f.root.traverse(o=>o.geometry?.dispose());for(const material of owned)material.dispose();shared.dispose();texture.dispose();
 }
});
