import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWeaponPickups} from '../src/weapon-pickups.js';
import {traceObstacles} from '../src/ballistics.js';

const value=(enemyIndex=2,weaponId='ak',extra={})=>({dropId:`enemy-${enemyIndex}`,source:'enemy',enemyIndex,weaponId,mag:17,reserve:61,taken:false,position:[0,0],elevation:0,...extra});
function fixture(options={}){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(74,1.6,.05,200),player={x:0,z:2},boxes=[],models=[],attempts=[],completed=[];
  const createModel=id=>{const model=new THREE.Group();model.userData.weaponId=id;const mesh=new THREE.Mesh(new THREE.BoxGeometry(.07,.16,id==='mp5'?.55:.84),new THREE.MeshBasicMaterial());mesh.position.set(.03,.08,-.14);model.add(mesh);models.push(model);return model;};
  const pickups=createWeaponPickups(scene,{createModel,groundHeight:options.groundHeight||(()=>0),traceObstacles:(from,to)=>traceObstacles(from,to,boxes),onCollect:drop=>{attempts.push(drop);return options.onCollect?options.onCollect(drop):true;},onCollected:snapshot=>completed.push(snapshot)});
  const pointCamera=(x=0,y=.114,z=0)=>{camera.position.set(player.x,1.6,player.z);camera.lookAt(x,y,z);camera.updateMatrixWorld(true);};pointCamera();
  const context=(extra={})=>({player,camera,held:true,...extra}),update=(dt,extra={})=>pickups.update(dt,context(extra));
  return {scene,camera,player,boxes,models,pickups,attempts,completed,pointCamera,context,update};
}

test('a defeated owner produces the requested firearm model once at the actual ground position',()=>{
  const f=fixture({groundHeight:()=>.37}),owner=new THREE.Object3D();owner.position.set(3,.37,-4);
  const spawn=value(8,'mp5');delete spawn.position;delete spawn.elevation;const record=f.pickups.spawn(spawn,owner.position);assert(record);assert.equal(f.models.length,1);assert.equal(f.models[0].userData.weaponId,'mp5');assert.equal(record.obj.children[0],f.models[0]);
  assert.equal(f.pickups.spawn(value(8,'ak'),owner.position),null);assert.equal(f.models.length,1,'Duplicate owner IDs cannot create another gun');
  f.update(.4,{held:false,blocked:true});f.scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(record.obj),center=bounds.getCenter(new THREE.Vector3());
  assert(Math.abs(center.x-owner.position.x)<1e-7);assert(Math.abs(center.z-owner.position.z)<1e-7);assert(Math.abs(bounds.min.y-(.37+.024))<1e-7);
  assert.deepEqual(f.pickups.snapshot(),[value(8,'mp5',{position:[3,-4],elevation:.37})]);assert.equal(f.attempts.length,0);
});

test('aim direction, the inclusive 2.65 metre boundary and owner blocking gate focus',()=>{
  const f=fixture();f.pickups.spawn(value(),{x:0,z:0});
  assert.equal(f.pickups.candidate(f.context()).enemyIndex,2);
  f.player.x=2.65;f.player.z=0;f.pointCamera();assert.equal(f.pickups.candidate(f.context()).enemyIndex,2);
  f.player.x=2.650001;f.pointCamera();assert.equal(f.pickups.candidate(f.context()),null);
  f.player.x=0;f.player.z=2;f.pointCamera(0,1.6,5);assert.equal(f.pickups.candidate(f.context()),null);
  f.pointCamera();assert.equal(f.pickups.candidate(f.context({blocked:true})),null);assert.equal(f.attempts.length,0);
});

test('actual finite-height wall raycasts prevent through-wall collection and clear when removed',()=>{
  const f=fixture();f.pickups.spawn(value(),{x:0,z:0});
  f.update(.3);assert(f.pickups.inspect()[0].progress>0);
  f.boxes.push({minX:-.4,maxX:.4,minY:0,maxY:3,minZ:.8,maxZ:1.2});
  assert.equal(f.update(.72),null);assert.equal(f.pickups.inspect()[0].progress,0);assert.equal(f.attempts.length,0);
  f.boxes[0].maxY=.15;assert(f.pickups.candidate(f.context()),'A low obstruction below the eye-to-gun ray does not become an infinite wall');
  f.boxes.length=0;f.update(.72);assert.equal(f.attempts.length,1);assert.equal(f.pickups.inspect()[0].taken,true);
});

test('holding E for 0.72 seconds consumes exactly one pickup and retains its original ammunition record',()=>{
  const f=fixture();f.pickups.spawn(value(),{x:0,z:0});
  assert.equal(f.update(.36).progress,.5);assert.equal(f.attempts.length,0);
  f.update(.36);assert.equal(f.attempts.length,1);assert.equal(f.completed.length,1);assert.equal(f.pickups.inspect()[0].visible,false);
  assert.deepEqual(f.pickups.snapshot(),[value(2,'ak',{taken:true})]);assert.equal(f.scene.getObjectByName('Dropped weapons').children.length,0);
  for(let n=0;n<20;n++)assert.equal(f.update(.1),null);
  assert.equal(f.attempts.length,1);assert.equal(f.completed.length,1);
});

test('turning away, releasing E, leaving range and an interaction block each cancel partial progress',()=>{
  for(const interrupt of['look','release','range','blocked']){
    const f=fixture();f.pickups.spawn(value(),{x:0,z:0});f.update(.4);assert(f.pickups.inspect()[0].progress>.5);
    if(interrupt==='look')f.pointCamera(0,1.6,5);
    if(interrupt==='range'){f.player.z=3;f.pointCamera();}
    f.update(.02,{held:interrupt!=='release',blocked:interrupt==='blocked'});assert.equal(f.pickups.inspect()[0].progress,0,interrupt);
    f.player.z=2;f.pointCamera();f.update(.36);assert.equal(f.attempts.length,0,'A new hold starts from zero');f.update(.36);assert.equal(f.attempts.length,1);
  }
});

test('zero-delta pause cannot advance a partial hold or the falling firearm',()=>{
  const f=fixture();f.pickups.spawn(value(),{x:0,z:0});f.update(.2);const before=f.pickups.inspect(),model=f.scene.getObjectByName('Dropped weapons').children[0],height=model.position.y;
  for(let n=0;n<100;n++)f.update(0);
  assert.deepEqual(f.pickups.inspect(),before);assert.equal(model.position.y,height);assert.equal(f.attempts.length,0);
  f.update(.52);assert.equal(f.attempts.length,1);
});

test('a rejected collection leaves the same model, magazine and reserve available for a later hold',()=>{
  let accepted=false;const f=fixture({onCollect:()=>accepted});const record=f.pickups.spawn(value(),{x:0,z:0}),model=record.obj;
  f.update(.72);assert.equal(f.attempts.length,1);assert.equal(f.completed.length,0);assert.equal(record.obj,model);assert.equal(record.taken,false);assert.equal(record.progress,0);assert.deepEqual(f.pickups.snapshot(),[value()]);
  accepted=true;f.update(.36);assert.equal(f.attempts.length,1);f.update(.36);assert.equal(f.attempts.length,2);assert.equal(f.completed.length,1);assert.deepEqual(f.pickups.snapshot(),[value(2,'ak',{taken:true})]);
});

test('restoring taken weapons creates no model or reward and untaken records use their exact owner',()=>{
  const f=fixture(),enemies=Array.from({length:4},(_,i)=>({alive:false,obj:new THREE.Object3D()}));enemies.forEach((e,i)=>e.obj.position.set(i,0,-i));
  const saved=[value(1,'mp5',{taken:true,position:[20,25]}),value(3,'ak',{mag:0,reserve:0,position:[7,-9]})];
  f.pickups.restore(saved,enemies);assert.equal(f.models.length,1);assert.equal(f.models[0].userData.weaponId,'ak');assert.deepEqual(f.pickups.snapshot(),saved);assert.equal(f.pickups.inspect()[0].visible,false);assert.deepEqual(f.pickups.inspect()[1].worldPosition,[7,.024,-9],'Restored loot stays where the moving enemy actually fell, not at its spawn');
  f.pickups.restore([value(1,'mp5',{taken:true})],enemies);assert.equal(f.models.length,1);assert.equal(f.scene.getObjectByName('Dropped weapons').children.length,0);f.update(2);assert.equal(f.attempts.length,0);assert.equal(f.completed.length,0);
});

test('repeated chapter clears do not accumulate scene nodes and snapshots contain detached data only',()=>{
  const f=fixture(),root=f.scene.getObjectByName('Dropped weapons');
  for(let chapter=0;chapter<25;chapter++){
    f.pickups.spawn(value(0),{x:0,z:0});f.pickups.spawn(value(1,'mp5'),{x:1,z:0});assert.equal(root.children.length,2);
    const saved=f.pickups.snapshot();assert.deepEqual(Object.keys(saved[0]).sort(),['dropId','source','enemyIndex','weaponId','mag','reserve','taken','position','elevation'].sort());assert.doesNotThrow(()=>JSON.stringify(saved));saved[0].mag=999;saved[0].position[0]=999;assert.equal(f.pickups.snapshot()[0].mag,17);assert.equal(f.pickups.snapshot()[0].position[0],0);
    f.pickups.clear();assert.equal(root.children.length,0);assert.equal(f.scene.children.length,1);assert.deepEqual(f.pickups.snapshot(),[]);assert.deepEqual(f.pickups.inspect(),[]);assert.equal(f.pickups.candidate(f.context()),null);
  }
});

test('a collection callback cannot re-enter the same hold and award its ammunition twice',()=>{
  let f,reentered=false;f=fixture({onCollect:()=>{if(!reentered){reentered=true;f.update(.72);}return true;}});f.pickups.spawn(value(),{x:0,z:0});
  f.update(.72);assert.equal(f.attempts.length,1,'Collection needs an in-flight guard before invoking the owner callback');assert.equal(f.completed.length,1);assert.equal(f.pickups.snapshot()[0].taken,true);
});

test('looking at a nearby standing speaker does not steal E for a gun on the floor',()=>{
  const f=fixture();f.pickups.spawn(value(),{x:0,z:0});f.player.x=0;f.player.z=2.5;f.camera.position.set(0,1.68,2.5);f.camera.lookAt(0,1.2,0);f.camera.updateMatrixWorld(true);
  assert.equal(f.pickups.candidate(f.context()),null);f.update(2);assert.equal(f.attempts.length,0);
  f.camera.lookAt(0,.11,0);f.camera.updateMatrixWorld(true);assert.ok(f.pickups.candidate(f.context()));f.update(.72);assert.equal(f.completed.length,1);
});

test('a roof weapon stays on its real surface through Continue and cannot be collected from the street',()=>{
 const f=fixture();f.pickups.spawn(value(1,'rpg7',{mag:1,reserve:2,elevation:6.2}),{x:0,z:0});f.update(.5,{held:false});
 assert.deepEqual(f.pickups.inspect()[0].worldPosition,[0,6.224,0]);f.pointCamera(0,6.3,0);assert.equal(f.pickups.candidate(f.context()),null);
 const saved=f.pickups.snapshot();f.pickups.restore(saved,[null,{obj:new THREE.Object3D()}]);f.update(.5,{held:false});assert.deepEqual(f.pickups.snapshot(),saved);assert.equal(f.pickups.inspect()[0].worldPosition[1],6.224);
 f.camera.position.set(0,7.8,2);f.camera.lookAt(0,6.314,0);f.camera.updateMatrixWorld(true);assert.ok(f.pickups.candidate(f.context()));f.update(.72);assert.equal(f.attempts[0].weaponId,'rpg7');assert.equal(f.attempts[0].reserve,2);
});

test('player replacements have independent IDs, preserve loaded rounds and resume the next ID after restore',()=>{
  const f=fixture();f.pickups.spawn(value(2),{x:0,z:0});
  const first=f.pickups.spawnPlayer({weaponId:'m16a2',mag:11,reserve:0},{x:1,z:2}),second=f.pickups.spawnPlayer({weaponId:'m1911',mag:3,reserve:0},{x:-1,z:2});
  assert.equal(first.dropId,'player-1');assert.equal(second.dropId,'player-2');assert.equal(Object.hasOwn(first,'enemyIndex'),false);
  first.taken=true;const saved=f.pickups.snapshot(),enemies=[null,null,{obj:new THREE.Object3D()}];f.pickups.restore(saved,enemies);assert.deepEqual(f.pickups.snapshot(),saved);assert.equal(f.pickups.inspect().find(d=>d.dropId==='player-1').visible,false);
  const third=f.pickups.spawnPlayer({weaponId:'ak',mag:24,reserve:0},{x:2,z:2});assert.equal(third.dropId,'player-3');assert.equal(third.mag,24);assert.equal(f.pickups.snapshot().filter(d=>d.source==='enemy').length,1);assert.equal(f.pickups.snapshot().filter(d=>d.source==='player').length,3);
});

test('the firearm dropped during an accepted swap requires a new E press before it can be reclaimed',()=>{
  let f;f=fixture({onCollect:drop=>{if(drop.source==='enemy')f.pickups.spawnPlayer({weaponId:'m16a2',mag:11,reserve:0},{x:0,z:0});return true;}});f.pickups.spawn(value(0),{x:0,z:0});f.update(.72);
  assert.equal(f.attempts.length,1);for(let n=0;n<20;n++)f.update(.1);assert.equal(f.attempts.length,1,'The held key must not swap straight back into the discarded rifle');
  f.update(0,{held:false});f.update(.72);assert.equal(f.attempts.length,2);assert.equal(f.attempts[1].dropId,'player-1');assert.equal(f.attempts[1].mag,11);assert(f.pickups.snapshot().every(d=>d.taken));
});

test('invalid restored player ownership is rejected before clearing the existing ground state',()=>{
  const f=fixture();f.pickups.spawn(value(0),{x:0,z:0});const before=f.pickups.snapshot();
  for(const bad of[{dropId:'player-1',source:'player',enemyIndex:0,weaponId:'ak',mag:5,reserve:0,taken:false,position:[0,0]},{dropId:'player-1',source:'player',weaponId:'ak',mag:5,reserve:1,taken:false,position:[0,0]}]){assert.throws(()=>f.pickups.restore([bad],[]));assert.deepEqual(f.pickups.snapshot(),before);}
});
