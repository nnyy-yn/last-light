import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeaponRecoil,WEAPON_RECOIL_PROFILES as PROFILES,WEAPON_RECOIL_LIMITS as LIMITS} from '../src/weapon-recoil.js';
const axes=Object.keys(LIMITS),ids=['m16a2','m249','ak','mp5','m1911','m4a1'];
test('RPK and RPG have separate stable recoil and settle without an unknown-weapon failure',()=>{
 for(const weaponId of ['rpk','rpg7']){const r=createWeaponRecoil();assert.doesNotThrow(()=>r.fire({weaponId}));const p=r.update(1/60);assert.ok(p.cameraPitch>0&&p.weaponKick>0);for(let i=0;i<180;i++)r.update(1/60);assert.ok(r.inspect().settled);}
 const rpk=createWeaponRecoil(),rpg=createWeaponRecoil();rpk.fire({weaponId:'rpk'});rpg.fire({weaponId:'rpg7'});assert.ok(rpg.update(.04).cameraPitch<rpk.update(.04).cameraPitch);
});
const advance=(recoil,seconds,dt=1/240)=>{let pose;for(let t=0;t<seconds-1e-10;t+=dt)pose=recoil.update(Math.min(dt,seconds-t));return pose;};
function peak(id,options={}){const r=createWeaponRecoil();r.fire({weaponId:id,...options});const maximum=Object.fromEntries(axes.map(k=>[k,0]));let peakAt=0;for(let t=0;t<.5;t+=1/1000){const p=r.update(1/1000);if(p.weaponKick>maximum.weaponKick)peakAt=t+1/1000;for(const k of axes)maximum[k]=Math.max(maximum[k],Math.abs(p[k]));}return {maximum,peakAt};}

test('all six guns have a short distinct recoil impulse and settle without aim drift',()=>{
  assert.deepEqual(new Set(Object.keys(PROFILES)),new Set([...ids,'rpk','rpg7']));const signatures=new Set();
  for(const id of ids){
    const r=createWeaponRecoil();assert(r.inspect().settled);const shot=r.fire({weaponId:id});assert.equal(shot.shots,1);assert(!shot.settled);
    const first=r.update(.016),crest=r.update(.016),later=r.update(.20);assert(first.weaponKick>.004);assert(first.cameraPitch>0);assert(later.weaponKick<first.weaponKick*.12);
    const {maximum,peakAt}=peak(id);assert(peakAt<.035,'view recoil must arrive promptly instead of slowly pushing the gun');signatures.add(JSON.stringify(maximum));
    assert(crest.cameraPitch>0);assert(later.cameraPitch>=0);const rest=advance(r,2);assert(rest.settled);for(const k of axes)assert.equal(rest[k],0);
  }
  assert.equal(signatures.size,6);assert(peak('m1911').maximum.weaponPitch>peak('mp5').maximum.weaponPitch*2);assert(peak('ak').maximum.cameraPitch>peak('m4a1').maximum.cameraPitch);
});

test('aiming and crouching control recoil while movement has a modest penalty',()=>{
  for(const id of ids){const normal=peak(id).maximum,aimed=peak(id,{aimed:true}).maximum,crouch=peak(id,{crouched:true}).maximum,moving=peak(id,{moving:true}).maximum;
    for(const k of ['cameraPitch','weaponKick','weaponPitch']){assert(aimed[k]<normal[k]);assert(crouch[k]<normal[k]);assert(moving[k]>normal[k]&&moving[k]<normal[k]*1.2);}
  }
});

test('spring recovery is independent of frame partition and does not discard a slow frame',()=>{
  for(const id of ids){const one=createWeaponRecoil(),many=createWeaponRecoil();one.fire({weaponId:id});many.fire({weaponId:id});const a=one.update(.19),b=advance(many,.19,1/144);for(const k of axes)assert(Math.abs(a[k]-b[k])<1e-12,k);
    assert(one.update(3).settled,'one long active interval must settle rather than leave a frozen recoil tail');}
});

test('sustained and stacked shots remain finite and bounded then recover',()=>{
  for(const id of ids){const r=createWeaponRecoil();for(let i=0;i<500;i++){r.fire({weaponId:id,moving:true});const p=r.update(1/120);for(const [key,max]of Object.entries(LIMITS))assert(Number.isFinite(p[key])&&Math.abs(p[key])<=max,key);assert(p.intensity>=0&&p.intensity<=1);assert(p.spread>=0&&p.spread<=.009);}
    for(let i=0;i<10000;i++)r.fire({weaponId:id});const p=r.update(.016);for(const[key,max]of Object.entries(LIMITS))assert(Number.isFinite(p[key])&&Math.abs(p[key])<=max);assert(advance(r,3).settled);
  }
});

test('zero or invalid updates freeze and reset or changing weapons cannot leak a recoil tail',()=>{
  const r=createWeaponRecoil();r.fire({weaponId:'ak'});r.update(.02);const before=r.inspect();for(const value of[0,-1,NaN,Infinity,undefined])assert.deepEqual(r.update(value),before);
  const detached=r.inspect();detached.weaponKick=500;assert.notEqual(r.inspect().weaponKick,500);
  assert.throws(()=>r.fire({weaponId:'missing'}),RangeError);assert.deepEqual(r.inspect(),before);
  const changed=r.fire({weaponId:'mp5'});assert.equal(changed.shots,1);assert.equal(changed.weaponKick,0);assert.equal(changed.cameraYaw,0);
  const cleared=r.reset();assert(cleared.settled);assert.equal(cleared.weaponId,null);assert.equal(cleared.shots,0);assert.deepEqual(r.update(0),cleared);
});
