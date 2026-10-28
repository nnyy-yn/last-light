import test from 'node:test';import assert from 'node:assert/strict';
import {createCarriedLoadout,carriedWeaponIds,validateCarriedInventory,switchCarriedWeapon,replaceCarriedWeapon,weaponSlot} from '../src/carried-loadout.js';
import {ammoTotal,AMMO_LIMIT} from '../src/ammunition.js';
const make=()=>({carriedLoadout:createCarriedLoadout(),weaponId:'m16a2',mag:17,stowedMagazines:{m16a2:0,m1911:5},reserves:{'556':120,'762':20,'9mm':30,'45':7,rocket:0}});
const total=i=>ammoTotal(i.reserves)+i.mag+Object.values(i.stowedMagazines).reduce((a,b)=>a+b,0);

test('default carried equipment is one actual M16A2 and M1911, not the full weapon catalog',()=>{
 const loadout=createCarriedLoadout();assert.deepEqual(loadout,{primary:'m16a2',sidearm:'m1911'});assert.deepEqual(carriedWeaponIds(loadout),['m16a2','m1911']);assert.equal(weaponSlot('mp5'),'primary');assert.equal(weaponSlot('m1911'),'sidearm');assert.equal(weaponSlot('unknown'),null);
 for(const options of[{primary:'m1911'},{sidearm:'ak'},{sidearm:'m9'}])assert.throws(()=>createCarriedLoadout(options),TypeError);
});

test('switching only between carried slots preserves magazine counts and never summons another primary',()=>{
 let inventory=make(),rounds=total(inventory);for(let n=0;n<20;n++){inventory=switchCarriedWeapon(inventory,n%2?'primary':'sidearm');assert.equal(total(inventory),rounds);assert.equal(inventory.stowedMagazines[inventory.weaponId],0);assert.equal(Object.keys(inventory.stowedMagazines).length,2);}
 for(const id of['ak','mp5','m249','m4a1','m9','missing'])assert.equal(switchCarriedWeapon(inventory,id),null);
 const pistol=switchCarriedWeapon(inventory,'m1911');assert.equal(pistol.mag,5);assert.equal(pistol.stowedMagazines.m16a2,17);assert.equal(inventory.weaponId,'m16a2');
});

test('primary replacement while holding either slot drops precisely the old primary magazine',()=>{
 for(const active of['primary','sidearm']){
  const original=switchCarriedWeapon(make(),active),before=structuredClone(original),drop={weaponId:'ak',mag:24,reserve:61,taken:false};
  const next=replaceCarriedWeapon(original,drop);assert.deepEqual(next.carriedLoadout,{primary:'ak',sidearm:'m1911'});assert.equal(next.weaponId,'ak');assert.equal(next.mag,24);assert.deepEqual(next.stowedMagazines,{m1911:5,ak:0});assert.deepEqual(next.replaced,{weaponId:'m16a2',mag:17,reserve:0});
  assert.equal(total(next)+next.replaced.mag,total(original)+drop.mag+drop.reserve);assert.deepEqual(original,before);assert.equal(drop.taken,false);assert(!Object.hasOwn(next.stowedMagazines,'m16a2'));
 }
});

test('same-model firearm and pistol replacements exchange physical magazines instead of combining them',()=>{
 for(const [weaponId,mag]of[['m16a2',3],['m1911',2]]){
  const inventory=make(),next=replaceCarriedWeapon(inventory,{weaponId,mag,reserve:0,taken:false});assert.equal(next.weaponId,weaponId);assert.equal(next.mag,mag);assert.equal(next.replaced.mag,weaponId==='m16a2'?17:5);assert.equal(total(next)+next.replaced.mag,total(inventory)+mag);assert.equal(Object.keys(next.stowedMagazines).length,2);
 }
});

test('unavailable capacity and corrupt inventory refuse the entire transaction without deleting ammo',()=>{
 const original=make();original.reserves={'556':AMMO_LIMIT,'762':0,'9mm':0,'45':0,rocket:0};const before=structuredClone(original);
 assert.deepEqual(replaceCarriedWeapon(original,{weaponId:'ak',mag:30,reserve:1,taken:false}),{blocked:true,reason:'full'});assert.deepEqual(original,before);
 assert(replaceCarriedWeapon(original,{weaponId:'ak',mag:30,reserve:0,taken:false}),'A loaded magazine can swap at a full reserve without spilling cartridges');
 for(const mutate of[i=>i.stowedMagazines.ak=0,i=>delete i.stowedMagazines.m1911,i=>i.stowedMagazines.m16a2=5,i=>i.mag=31,i=>i.carriedLoadout.primary='mp5',i=>i.weaponId='ak']){const invalid=make();mutate(invalid);assert.equal(validateCarriedInventory(invalid),null);assert.equal(replaceCarriedWeapon(invalid,{weaponId:'ak',mag:5,reserve:0}),null);}
 for(const drop of[{weaponId:'ak',mag:31,reserve:0},{weaponId:'m1911',mag:8,reserve:0},{weaponId:'ak',mag:5,reserve:301},{weaponId:'ak',mag:5,reserve:0,taken:true}])assert.equal(replaceCarriedWeapon(make(),drop),null);
});

test('twenty swaps and reclaims conserve carried plus ground rounds across both slots',()=>{
 let inventory=make(),onGround=[{weaponId:'ak',mag:23,reserve:40,taken:false}];const originalTotal=total(inventory)+63;
 for(let n=0;n<20;n++){const drop=onGround.find(d=>!d.taken),next=replaceCarriedWeapon(inventory,drop);assert(next&&!next.blocked);drop.taken=true;onGround.push({...next.replaced,taken:false});inventory=next;
  assert.equal(total(inventory)+onGround.filter(d=>!d.taken).reduce((a,d)=>a+d.mag+d.reserve,0),originalTotal);assert.equal(carriedWeaponIds(inventory.carriedLoadout).length,2);assert.equal(replaceCarriedWeapon(inventory,drop),null);
 }
});

test('RPK and RPG replace the one primary slot while DShK remains fixed and unavailable to inventory',async()=>{
 const {totalCarriedRounds}=await import('../src/ammunition.js');let inventory=make();const rpk=replaceCarriedWeapon(inventory,{weaponId:'rpk',mag:75,reserve:100,taken:false});assert.equal(rpk.carriedLoadout.primary,'rpk');assert.equal(Object.keys(rpk.stowedMagazines).length,2);assert.equal(rpk.mag,75);
 const rockets=replaceCarriedWeapon(rpk,{weaponId:'rpg7',mag:1,reserve:3,taken:false});assert.equal(rockets.carriedLoadout.primary,'rpg7');assert.equal(rockets.mag,1);assert.equal(rockets.reserves.rocket,3);assert.equal(rockets.replaced.weaponId,'rpk');assert.equal(rockets.replaced.mag,75);assert.equal(totalCarriedRounds(rockets)+75,totalCarriedRounds(rpk)+4);
 assert.equal(replaceCarriedWeapon(rockets,{weaponId:'rpg7',mag:1,reserve:1,taken:false}).blocked,true,'Excess rockets must leave the whole pickup intact');assert.equal(replaceCarriedWeapon(inventory,{weaponId:'dshk',mag:100,reserve:100,taken:false}),null);
 const back=replaceCarriedWeapon(rockets,{weaponId:'ak',mag:20,reserve:0,taken:false});assert.deepEqual(back.replaced,{weaponId:'rpg7',mag:1,reserve:0});assert.equal(back.reserves.rocket,3,'Replacing launcher cannot turn reserve rockets into bullets');
});
