import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFieldInteractions} from '../src/field-interactions.js';
import {CHAPTERS} from '../src/story.js';
import {blocked,lineBlocked} from '../src/simulation.js';

function fixture(){
  const scene=new THREE.Scene(),boxes=[],rewards=[],field=createFieldInteractions(scene,{colliders:()=>boxes,onComplete:r=>rewards.push(r)});
  field.reset({chapter:CHAPTERS[5]});const camera=new THREE.PerspectiveCamera(),first=field.inspect()[0];
  const player={x:first.approach[0],z:first.approach[1]};camera.position.set(player.x,1.6,player.z);camera.lookAt(first.pos[0],.29,first.pos[1]);camera.updateMatrixWorld(true);
  const tick=(held=true,n=1,extra={})=>{let value;for(let i=0;i<n;i++)value=field.update(.1,{player,camera,held,...extra});return value;};
  return{scene,boxes,rewards,field,camera,player,first,tick};
}

test('only hostile armed chapters receive deterministic finite roadside cases',()=>{
  const{field}=fixture();
  for(const chapter of CHAPTERS){const a=field.reset({chapter}),b=field.reset({chapter});assert.deepEqual(a,b);assert.equal(a.length,chapter.armed&&chapter.hostiles.length?2:0);
    for(const item of a){assert.ok(Math.hypot(item.pos[0]-chapter.spawn[0],item.pos[1]-chapter.spawn[1])>1.8);for(const task of chapter.tasks)assert.ok(Math.hypot(item.pos[0]-task.pos[0],item.pos[1]-task.pos[1])>=2);}}
  field.dispose();
});
test('holding completes once, opens the hinged lid, and reset restores chapter state',()=>{
  const f=fixture(),bounds=f.field.getColliders();assert.equal(f.tick(true,15).progress<1,true);assert.equal(f.rewards.length,0);assert.equal(f.tick(true).progress,1);
  assert.deepEqual(f.rewards,[{kind:'medicine',amount:1,id:'field-6-medicine'}]);f.tick(true,50);assert.equal(f.rewards.length,1);assert.ok(f.field.inspect()[0].opened>.99);
  assert.deepEqual(f.field.getColliders(),bounds,'Used/open cases remain physical obstacles.');
  f.field.reset({chapter:CHAPTERS[5]});f.tick(true,16);assert.equal(f.rewards.length,2);f.field.dispose();
});
test('releasing E or owner blocking loses partial progress without awarding anything',()=>{
  const f=fixture();assert.ok(f.tick(true,8).progress>.4);assert.equal(f.tick(false).progress,0);f.tick(true,8);assert.equal(f.tick(true,1,{blocked:true}).near,false);assert.equal(f.field.inspect()[0].progress,0);f.tick(true,8);assert.equal(f.rewards.length,0);f.field.dispose();
});
test('pause cancel freezes progress and does not require resource edits',()=>{
  const f=fixture();f.tick(true,7);f.field.cancel();assert.equal(f.field.inspect()[0].progress,0);
  for(let i=0;i<60;i++)f.field.update(0,{player:f.player,camera:f.camera,held:true});assert.equal(f.field.inspect()[0].progress,0);assert.equal(f.rewards.length,0);f.field.dispose();
});
test('look direction and exact reach both gate collection',()=>{
  const f=fixture();f.tick(true,7);f.camera.lookAt(f.player.x,1.6,f.player.z+5);f.camera.updateMatrixWorld(true);assert.equal(f.tick().near,false);
  f.player.x=f.first.pos[0]-2.401;f.player.z=f.first.pos[1];f.camera.position.set(f.player.x,1.6,f.player.z);f.camera.lookAt(f.first.pos[0],.29,f.first.pos[1]);f.camera.updateMatrixWorld(true);assert.equal(f.tick().near,false);assert.equal(f.rewards.length,0);f.field.dispose();
});
test('new wall obstruction interrupts active hold and cannot be collected through',()=>{
  const f=fixture();f.tick(true,7);const mid={x:(f.player.x+f.first.pos[0])/2,z:(f.player.z+f.first.pos[1])/2};f.boxes.push({minX:mid.x-.15,maxX:mid.x+.15,minZ:mid.z-.15,maxZ:mid.z+.15});assert.equal(f.tick(true,50).near,false);assert.equal(f.rewards.length,0);assert.equal(f.field.inspect()[0].progress,0);f.field.dispose();
});
test('placement searches around obstacles and never mutates the collider list',()=>{
  const f=fixture(),old=f.first.pos;f.boxes.push({minX:old[0]-.9,maxX:old[0]+.9,minZ:old[1]-.9,maxZ:old[1]+.9});const copy=structuredClone(f.boxes),placed=f.field.reset({chapter:CHAPTERS[5]});assert.equal(placed.length,2);assert.deepEqual(f.boxes,copy);
  for(const i of placed){assert.equal(blocked(i.pos[0],i.pos[1],f.boxes,.62),false);assert.equal(lineBlocked({x:i.approach[0],z:i.approach[1]},{x:i.pos[0],z:i.pos[1]},f.boxes),false);}f.field.dispose();assert.equal(f.scene.children.length,0);
});
test('a completely obstructed chapter omits supplies instead of hiding them inside walls',()=>{
  const f=fixture();f.boxes.push({minX:-90,maxX:90,minZ:-90,maxZ:90});assert.deepEqual(f.field.reset({chapter:CHAPTERS[5]}),[]);f.field.dispose();
});
test('every chapter exposes rotated low case bounds without mutating owner colliders',()=>{
  const f=fixture();
  for(const chapter of CHAPTERS){
    const items=f.field.reset({chapter}),bounds=f.field.getColliders();assert.equal(bounds.length,items.length);assert.deepEqual(f.boxes,[]);
    const horizontal=Math.abs(chapter.spawn[0])>Math.abs(chapter.spawn[1]);
    for(let n=0;n<bounds.length;n++){
      const b=bounds[n],item=items[n];assert.equal(b.fieldId,item.id);assert.equal(b.minY,.02);assert.equal(b.maxY,.4);assert.equal(b.material,'metal');
      assert.ok(Math.abs((b.minX+b.maxX)/2-item.pos[0])<1e-8);assert.ok(Math.abs((b.minZ+b.maxZ)/2-item.pos[1])<1e-8);
      assert.ok(Math.abs(b.maxX-b.minX-(horizontal?.9:.6))<1e-8);assert.ok(Math.abs(b.maxZ-b.minZ-(horizontal?.6:.9))<1e-8);
      assert.equal(blocked(item.pos[0],item.pos[1],bounds),true);assert.equal(blocked(item.approach[0],item.approach[1],bounds),false);
    }
    if(bounds[0]){bounds[0].maxX=999;assert.notEqual(f.field.getColliders()[0].maxX,999,'Returned bounds must not expose mutable case state.');}
  }
  f.field.clear();assert.deepEqual(f.field.getColliders(),[]);f.field.dispose();
});
test('a case can still be opened when its own bounds join the movement collider list',()=>{
  const f=fixture();f.boxes.push(...f.field.getColliders());const original=structuredClone(f.boxes);
  assert.equal(f.tick(true,16).progress,1);assert.equal(f.rewards.length,1);f.tick(true,30);assert.equal(f.rewards.length,1);
  assert.deepEqual(f.boxes,original);assert.deepEqual(f.field.getColliders(),original);f.field.dispose();
});
