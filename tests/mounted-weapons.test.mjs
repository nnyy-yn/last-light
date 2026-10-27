import test from 'node:test';
import assert from 'node:assert/strict';
import {MOUNTED_M2,createMountedGun,stepMountedGun,fireMountedGun,reloadMountedGun,clearDismount} from '../src/mounted-weapons.js';
test('mounted fire has finite ammunition, a real cadence, heat lockout and recovery',()=>{
  const g=createMountedGun();assert.ok(fireMountedGun(g));assert.equal(fireMountedGun(g),false);
  let attempts=0;while(!g.overheated&&attempts++<100){stepMountedGun(g,.12);fireMountedGun(g);}
  assert.ok(g.overheated);assert.equal(g.ammo+g.shots,MOUNTED_M2.capacity);assert.equal(fireMountedGun(g),false);
  const paused=structuredClone(g);stepMountedGun(g,0);assert.deepEqual(g,paused);
  stepMountedGun(g,4);assert.equal(g.overheated,false);assert.ok(fireMountedGun(g));
});
test('belt reload cannot duplicate rounds and paused reload cannot transfer ammunition',()=>{
  const g=createMountedGun();g.ammo=7;g.reserve=38;assert.ok(reloadMountedGun(g));assert.equal(reloadMountedGun(g),false);
  stepMountedGun(g,0);assert.equal(g.ammo,7);assert.equal(fireMountedGun(g),false);
  stepMountedGun(g,5.4);assert.equal(g.ammo,45);assert.equal(g.reserve,0);stepMountedGun(g,10);assert.equal(g.ammo,45);
});
test('dismount rejects vehicle edges, walls and positions outside playable bounds',()=>{
  const boxes=[{minX:-1,maxX:1,minZ:-2,maxZ:2}],bounds={minX:-4,maxX:4,minZ:-6,maxZ:6};
  assert.equal(clearDismount({x:1.2,z:0},boxes,bounds),false);assert.equal(clearDismount({x:2,z:0},boxes,bounds),true);assert.equal(clearDismount({x:4,z:0},boxes,bounds),false);
});
