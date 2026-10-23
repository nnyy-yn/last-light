// The active magazine lives on the player; stowed magazines hold only rounds
// that are physically in the other weapon. Switching never creates ammunition.
export const emptyMagazines=(weaponIds=['m4a1','m249'])=>Object.fromEntries(weaponIds.map(id=>[id,0]));
export function loadedRounds(activeMagazine,stowed){return activeMagazine+Object.values(stowed).reduce((sum,rounds)=>sum+rounds,0);}
export function selectMagazine(stowed,current,next,activeMagazine){
  if(current===next||!Object.hasOwn(stowed,next))return {weaponId:current,mag:activeMagazine};
  stowed[current]=activeMagazine;
  const mag=stowed[next];stowed[next]=0;
  return {weaponId:next,mag};
}
export function roundsToLoad(capacity,mag,reserve){return Math.max(0,Math.min(capacity-mag,reserve));}
export function nextWeapon(weaponIds,current,direction=1){
  if(!weaponIds.length)return current;
  const index=Math.max(0,weaponIds.indexOf(current));
  return weaponIds[(index+(direction<0?-1:1)+weaponIds.length)%weaponIds.length];
}
