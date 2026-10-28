const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
/** Authored loss of balance, not a rigid spin. Direction is expressed in the
 * actor's original frame. The world adapter keeps actual skin above its floor. */
export function casualtyPose(progress,{direction={x:0,z:-1},side=1}={}){
 const t=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0)),length=Math.hypot(direction.x,direction.z),dx=length>.001?direction.x/length:0,dz=length>.001?direction.z/length:-1;
 const weight=smooth((t-.10)/.72),contact=smooth((t-.68)/.32),release=smooth(t/.22);
 // Compensate the actual fall azimuth: a fixed quarter-turn is only side-on
 // for a pure fore/aft impact and rolls lateral falls onto their backs.
 const rawRoll=Math.atan2(-dz,dx)+(side<0?Math.PI:0),sideRoll=Math.atan2(Math.sin(rawRoll),Math.cos(rawRoll));
 return{phase:t<.16?'hit':t<.46?'balance-lost':t<.82?'ground-contact':'settled',axis:{x:dz,y:0,z:-dx},angle:weight*1.43,roll:sideRoll*smooth((t-.55)/.45),collapse:smooth((t-.12)/.64),release,contact,kneel:1-smooth((t-.28)/.36),settled:t===1};
}
