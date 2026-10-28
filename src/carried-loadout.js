import {AMMO_LIMIT,WEAPON_MAGAZINES,WEAPON_AMMO,validateAmmoReserves,ammoTotal,weaponReserveLimit,ROCKET_RESERVE_LIMIT} from './ammunition.js';

// Availability in the game is separate from what this person physically holds.
// The active magazine remains on player.mag; the two-key stowed map contains
// only the other carried firearm's magazine (the active entry is always zero).
export const CARRIED_SLOTS=Object.freeze(['primary','sidearm']);
export const PRIMARY_WEAPON_IDS=Object.freeze(['m16a2','m249','ak','mp5','m4a1','rpk','rpg7']);
export const SIDEARM_WEAPON_IDS=Object.freeze(['m1911']);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const count=value=>Number.isInteger(value)&&value>=0;
export const weaponSlot=id=>PRIMARY_WEAPON_IDS.includes(id)?'primary':SIDEARM_WEAPON_IDS.includes(id)?'sidearm':null;
export function validateCarriedLoadout(value){
  if(!record(value)||Object.keys(value).length!==2||weaponSlot(value.primary)!=='primary'||weaponSlot(value.sidearm)!=='sidearm')return null;
  return {primary:value.primary,sidearm:value.sidearm};
}
export function createCarriedLoadout({primary='m16a2',sidearm='m1911'}={}){
  const value=validateCarriedLoadout({primary,sidearm});if(!value)throw new TypeError('A carried loadout needs one primary and one sidearm.');return value;
}
export function carriedWeaponIds(value){const loadout=validateCarriedLoadout(value);return loadout?CARRIED_SLOTS.map(slot=>loadout[slot]):[];}
export function validateCarriedInventory(value){
  if(!record(value))return null;
  const carriedLoadout=validateCarriedLoadout(value.carriedLoadout),reserves=validateAmmoReserves(value.reserves),ids=carriedWeaponIds(carriedLoadout);
  if(!carriedLoadout||!reserves||!ids.includes(value.weaponId)||!count(value.mag)||value.mag>WEAPON_MAGAZINES[value.weaponId]||!record(value.stowedMagazines)||Object.keys(value.stowedMagazines).length!==2)return null;
  for(const id of ids)if(!count(value.stowedMagazines[id])||value.stowedMagazines[id]>WEAPON_MAGAZINES[id])return null;
  if(value.stowedMagazines[value.weaponId]!==0)return null;
  return {carriedLoadout,weaponId:value.weaponId,mag:value.mag,stowedMagazines:Object.fromEntries(ids.map(id=>[id,value.stowedMagazines[id]])),reserves};
}
export function switchCarriedWeapon(value,slotOrId){
  const inventory=validateCarriedInventory(value);if(!inventory)return null;
  const next=CARRIED_SLOTS.includes(slotOrId)?inventory.carriedLoadout[slotOrId]:slotOrId;
  if(!carriedWeaponIds(inventory.carriedLoadout).includes(next))return null;
  if(next===inventory.weaponId)return inventory;
  inventory.stowedMagazines[inventory.weaponId]=inventory.mag;
  inventory.mag=inventory.stowedMagazines[next];inventory.stowedMagazines[next]=0;inventory.weaponId=next;
  return inventory;
}
export function replaceCarriedWeapon(value,drop){
  const inventory=validateCarriedInventory(value),slot=weaponSlot(drop?.weaponId);
  if(!inventory||!slot||drop.taken||!count(drop.mag)||drop.mag>WEAPON_MAGAZINES[drop.weaponId]||!count(drop.reserve)||drop.reserve>weaponReserveLimit(drop.weaponId))return null;
  if(WEAPON_AMMO[drop.weaponId]==='rocket'?inventory.reserves.rocket+drop.reserve>ROCKET_RESERVE_LIMIT:ammoTotal(inventory.reserves)+drop.reserve>AMMO_LIMIT)return {blocked:true,reason:'full'};
  const previousId=inventory.carriedLoadout[slot],oldMagazine=inventory.weaponId===previousId?inventory.mag:inventory.stowedMagazines[previousId];
  // Stow the other carried firearm if it was active. Replacing a primary while
  // holding the pistol never drops the pistol or merges the two rifle magazines.
  if(inventory.weaponId!==previousId)inventory.stowedMagazines[inventory.weaponId]=inventory.mag;
  delete inventory.stowedMagazines[previousId];inventory.carriedLoadout[slot]=drop.weaponId;
  inventory.weaponId=drop.weaponId;inventory.mag=drop.mag;inventory.stowedMagazines[drop.weaponId]=0;
  inventory.reserves[WEAPON_AMMO[drop.weaponId]]+=drop.reserve;
  return {...inventory,slot,replaced:{weaponId:previousId,mag:oldMagazine,reserve:0},acceptedRounds:drop.mag+drop.reserve,taken:true};
}

// Stable identity belongs to the dropped object, not the weapon model or an
// enemy array position. Player replacements explicitly have no enemyIndex.
export function validateWeaponDrop(value,{bounds,enemyCount=512}={}){
  if(!record(value)||!weaponSlot(value.weaponId)||!count(value.mag)||value.mag>WEAPON_MAGAZINES[value.weaponId]||!count(value.reserve)||value.reserve>weaponReserveLimit(value.weaponId)||typeof value.taken!=='boolean')return null;
  if(!['enemy','player'].includes(value.source)||typeof value.dropId!=='string')return null;
  if(value.source==='enemy'){
    if(!Number.isInteger(value.enemyIndex)||value.enemyIndex<0||value.enemyIndex>=enemyCount||value.dropId!==`enemy-${value.enemyIndex}`)return null;
  }else if(Object.hasOwn(value,'enemyIndex')||value.reserve!==0||!/^player-[1-9]\d*$/.test(value.dropId)||!Number.isSafeInteger(Number(value.dropId.slice(7))))return null;
  if(!Array.isArray(value.position)||value.position.length!==2||!value.position.every(Number.isFinite))return null;
  const [x,z]=value.position;
  if(Object.hasOwn(value,'elevation')&&(!Number.isFinite(value.elevation)||value.elevation<-.5||value.elevation>80))return null;
  if(x<(bounds?.minX??-5000)||x>(bounds?.maxX??5000)||z<(bounds?.minZ??-5000)||z>(bounds?.maxZ??5000))return null;
  return {dropId:value.dropId,source:value.source,...(value.source==='enemy'?{enemyIndex:value.enemyIndex}:{}),weaponId:value.weaponId,mag:value.mag,reserve:value.reserve,taken:value.taken,position:[x,z],...(Object.hasOwn(value,'elevation')?{elevation:value.elevation}:{})};
}
