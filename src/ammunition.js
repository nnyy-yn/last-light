export const AMMO_LIMIT=720;
export const ROCKET_RESERVE_LIMIT=3;
export const BULLET_AMMO_TYPES=Object.freeze(['556','762','9mm','45']);
export const AMMO_TYPES=Object.freeze([...BULLET_AMMO_TYPES,'rocket']);
export const WEAPON_AMMO=Object.freeze({m16a2:'556',m4a1:'556',m249:'556',ak:'762',mp5:'9mm',m1911:'45',rpk:'762',rpg7:'rocket'});
export const WEAPON_MAGAZINES=Object.freeze({m16a2:30,m4a1:30,m249:100,ak:30,mp5:30,m1911:7,rpk:75,rpg7:1});
export const AMMO_LABELS=Object.freeze({'556':'5.56毫米','762':'7.62毫米','9mm':'9毫米','45':'.45 ACP',rocket:'RPG火箭'});
const count=n=>Number.isInteger(n)&&n>=0;
export const ammoType=id=>WEAPON_AMMO[id]||'556';
export const ammoLabel=id=>AMMO_LABELS[ammoType(id)];
export const ammoTotal=value=>BULLET_AMMO_TYPES.reduce((n,k)=>n+(value?.[k]||0),0);
export const reserveRounds=(value,id)=>value?.[ammoType(id)]||0;
export function createAmmoReserves(total=0){
  total=Math.max(0,Math.min(AMMO_LIMIT,Math.floor(total)||0));
  const a=Math.floor(total*.75),b=Math.floor(total*.125),c=Math.floor(total*.097);
  return {'556':a,'762':b,'9mm':c,'45':total-a-b-c,rocket:0};
}
export function validateAmmoReserves(value,total){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const keys=Object.keys(value);if(keys.some(k=>!AMMO_TYPES.includes(k))||!BULLET_AMMO_TYPES.every(k=>count(value[k]))||(Object.hasOwn(value,'rocket')&&!count(value.rocket)))return null;
  const sum=ammoTotal(value),rocket=value.rocket??0;if(sum>AMMO_LIMIT||rocket>ROCKET_RESERVE_LIMIT||(total!==undefined&&sum!==total))return null;
  return {...Object.fromEntries(BULLET_AMMO_TYPES.map(k=>[k,value[k]])),rocket};
}
export const ordnanceTotal=value=>ammoTotal(value)+(value?.rocket||0);
export function carriedAmmunitionTotals({weaponId,mag=0,stowedMagazines={},reserves={}}={}){
  let bullets=ammoTotal(reserves),rockets=reserves.rocket||0;
  for(const[id,rounds]of Object.entries({...stowedMagazines,[weaponId]:mag})){if(WEAPON_AMMO[id]==='rocket')rockets+=rounds;else bullets+=rounds;}
  return {bullets,rockets,total:bullets+rockets};
}
export const totalCarriedRounds=value=>carriedAmmunitionTotals(value).total;
export const weaponReserveLimit=id=>WEAPON_AMMO[id]==='rocket'?ROCKET_RESERVE_LIMIT:300;
// Narrative supply costs remain a total, while actual reloads use one caliber.
export function reconcileAmmoReserves(value,total,id='m16a2'){
  total=Math.max(0,Math.min(AMMO_LIMIT,Math.floor(total)||0));
  const out=validateAmmoReserves(value);if(!out)return createAmmoReserves(total);
  let delta=total-ammoTotal(out);const preferred=ammoType(id)==='rocket'?'556':ammoType(id);
  if(delta>=0)out[preferred]+=delta;
  else for(const key of[preferred,...BULLET_AMMO_TYPES.filter(k=>k!==preferred)]){const used=Math.min(out[key],-delta);out[key]-=used;delta+=used;if(!delta)break;}
  return out;
}
export function addReserveAmmo(value,id,rounds){
  const reserves=validateAmmoReserves(value);if(!reserves||!count(rounds))throw new TypeError('Invalid ammunition');
  const type=ammoType(id),accepted=Math.min(rounds,type==='rocket'?ROCKET_RESERVE_LIMIT-reserves.rocket:AMMO_LIMIT-ammoTotal(reserves));reserves[type]+=accepted;return {reserves,accepted};
}
export function takeReserveAmmo(value,id,rounds){
  const reserves=validateAmmoReserves(value);if(!reserves||!count(rounds))throw new TypeError('Invalid ammunition');
  const taken=Math.min(rounds,reserves[ammoType(id)]);reserves[ammoType(id)]-=taken;return {reserves,taken};
}
export function collectWeaponDrop(inventory,drop){
  if(!drop||drop.taken||!Object.hasOwn(WEAPON_AMMO,drop.weaponId)||!count(drop.mag)||drop.mag>WEAPON_MAGAZINES[drop.weaponId]||!count(drop.reserve)||drop.reserve>weaponReserveLimit(drop.weaponId))return null;
  const reserves=validateAmmoReserves(inventory.reserves);if(!reserves)return null;
  const stowed={...inventory.stowedMagazines},oldId=inventory.weaponId,id=drop.weaponId;
  if(!Object.hasOwn(WEAPON_AMMO,oldId)||!count(inventory.mag)||inventory.mag>WEAPON_MAGAZINES[oldId]||!Object.hasOwn(stowed,id)||![6,8].includes(Object.keys(stowed).length)||!Object.keys(stowed).every(key=>count(stowed[key])&&stowed[key]<=WEAPON_MAGAZINES[key])||stowed[oldId]!==0)return null;
  stowed[oldId]=inventory.mag;
  const available=(stowed[id]||0)+drop.mag,mag=Math.min(WEAPON_MAGAZINES[id],available),extra=available-mag+drop.reserve;
  // Leave the complete physical pickup available if its remaining rounds do
  // not fit. Never erase ammunition or award it a second time.
  if(extra>(ammoType(id)==='rocket'?ROCKET_RESERVE_LIMIT-reserves.rocket:AMMO_LIMIT-ammoTotal(reserves)))return {blocked:true,reason:'full'};
  reserves[ammoType(id)]+=extra;stowed[id]=0;
  return {weaponId:id,mag,stowedMagazines:stowed,reserves,acceptedRounds:drop.mag+drop.reserve,taken:true};
}
