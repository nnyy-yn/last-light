// Shared rules for the player and vehicle gunners. Rendering never grants ammo.
export const MOUNTED_M2 = Object.freeze({name:'M2 车载重机枪',capacity:100,reserve:300,interval:.12,reloadTime:5.4,heatPerShot:.047,cooling:.17,damage:74,range:95});
export function createMountedGun(){return {ammo:MOUNTED_M2.capacity,reserve:MOUNTED_M2.reserve,heat:0,cooldown:0,reload:0,overheated:false,shots:0};}
export function stepMountedGun(gun,dt){
  if(!(dt>0))return;
  gun.cooldown=Math.max(0,gun.cooldown-dt);gun.heat=Math.max(0,gun.heat-MOUNTED_M2.cooling*dt);
  if(gun.overheated&&gun.heat<.38)gun.overheated=false;
  if(gun.reload>0){gun.reload=Math.max(0,gun.reload-dt);if(!gun.reload){const count=Math.min(MOUNTED_M2.capacity-gun.ammo,gun.reserve);gun.ammo+=count;gun.reserve-=count;}}
}
export function reloadMountedGun(gun){if(gun.reload||gun.ammo===MOUNTED_M2.capacity||!gun.reserve)return false;gun.reload=MOUNTED_M2.reloadTime;return true;}
export function fireMountedGun(gun){
  if(gun.cooldown>0||gun.reload>0||gun.overheated||gun.ammo<=0)return false;
  gun.ammo--;gun.shots++;gun.cooldown=MOUNTED_M2.interval;gun.heat=Math.min(1,gun.heat+MOUNTED_M2.heatPerShot);if(gun.heat>=1)gun.overheated=true;return true;
}
export function clearDismount(point,boxes,bounds,radius=.38){
  if(bounds&&(point.x<bounds.minX+radius||point.x>bounds.maxX-radius||point.z<bounds.minZ+radius||point.z>bounds.maxZ-radius))return false;
  return !boxes.some(b=>point.x>b.minX-radius&&point.x<b.maxX+radius&&point.z>b.minZ-radius&&point.z<b.maxZ+radius);
}
