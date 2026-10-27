import test from 'node:test';
import assert from 'node:assert/strict';
import {AMMO_LIMIT,createAmmoReserves,validateAmmoReserves,ammoTotal,reserveRounds,takeReserveAmmo,reconcileAmmoReserves,collectWeaponDrop} from '../src/ammunition.js';
test('5.56 rifles share supply while an AK cannot consume their cartridges',()=>{
  const reserve={'556':120,'762':0,'9mm':30,'45':7};
  assert.equal(takeReserveAmmo(reserve,'ak',30).taken,0);
  const used=takeReserveAmmo(reserve,'m249',100);assert.equal(used.taken,100);assert.equal(reserveRounds(used.reserves,'m16a2'),20);assert.equal(used.reserves['9mm'],30);assert.equal(reserve['556'],120);
});
test('a real enemy pickup equips its remaining magazine, stows the old rifle and conserves every round',()=>{
  const inventory={weaponId:'m16a2',mag:17,stowedMagazines:{m16a2:0,m249:0,ak:9,mp5:0,m1911:0,m4a1:0},reserves:createAmmoReserves(120)},drop={weaponId:'ak',mag:24,reserve:63,taken:false};
  const picked=collectWeaponDrop(inventory,drop);assert.equal(picked.weaponId,'ak');assert.equal(picked.mag,30);assert.equal(picked.stowedMagazines.m16a2,17);assert.equal(picked.stowedMagazines.ak,0);
  assert.equal(ammoTotal(picked.reserves)+picked.mag+picked.stowedMagazines.m16a2,120+17+9+24+63);assert.equal(collectWeaponDrop(picked,{...drop,taken:true}),null);assert.equal(drop.taken,false);
});
test('full reserve leaves the pickup intact rather than deleting its rounds',()=>{
  const state={weaponId:'ak',mag:30,stowedMagazines:{m16a2:0,m249:0,ak:0,mp5:0,m1911:0,m4a1:0},reserves:{'556':AMMO_LIMIT,'762':0,'9mm':0,'45':0}},before=structuredClone(state);
  assert.deepEqual(collectWeaponDrop(state,{weaponId:'ak',mag:21,reserve:63}),{blocked:true,reason:'full'});assert.deepEqual(state,before);
});
test('legacy supply migration and narrative costs keep the typed reserve sum exact',()=>{
  for(const n of[0,1,90,240,360,720]){const p=createAmmoReserves(n);assert.equal(ammoTotal(p),n);assert.deepEqual(validateAmmoReserves(p,n),p);const reduced=reconcileAmmoReserves(p,Math.max(0,n-37),'ak');assert.equal(ammoTotal(reduced),Math.max(0,n-37));}
  assert.equal(validateAmmoReserves({'556':3,'762':-1,'9mm':0,'45':0}),null);assert.equal(validateAmmoReserves(createAmmoReserves(90),91),null);
});
