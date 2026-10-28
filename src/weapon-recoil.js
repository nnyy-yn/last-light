// Presentation-only recoil. Values are offsets, never player aim, ammunition,
// hit tests or model transforms. Angles are radians; weaponKick is metres in
// the view rig's +Z direction (back toward the player). Positive pitch raises
// the muzzle. Main applies these offsets once to its interpolated base pose.
const AXES=['cameraPitch','cameraYaw','cameraRoll','weaponKick','weaponPitch','weaponRoll'];
export const WEAPON_RECOIL_LIMITS=Object.freeze({cameraPitch:.075,cameraYaw:.016,cameraRoll:.008,weaponKick:.055,weaponPitch:.115,weaponRoll:.022});
const profile=(cameraPitch,cameraYaw,cameraRoll,weaponKick,weaponPitch,weaponRoll,cameraSpeed,weaponSpeed)=>Object.freeze({cameraPitch,cameraYaw,cameraRoll,weaponKick,weaponPitch,weaponRoll,cameraSpeed,weaponSpeed});
// Authored feel, not a claim to reproduce measured firearm recoil. These are
// single-shot peaks before stance scaling, using critically damped springs.
export const WEAPON_RECOIL_PROFILES=Object.freeze({
  m16a2:profile(.014,.0024,.0009,.026,.032,.0040,29,48),
  m4a1:profile(.012,.0020,.0008,.023,.029,.0038,31,51),
  m249:profile(.009,.0028,.0011,.018,.021,.0046,34,56),
  ak:profile(.021,.0036,.0016,.032,.045,.0063,25,43),
  mp5:profile(.0075,.0015,.0006,.014,.019,.0030,36,59),
  m1911:profile(.030,.0027,.0012,.035,.065,.0068,24,40),
  rpk:profile(.016,.0030,.0012,.028,.036,.0052,27,46),
  rpg7:profile(.006,.0012,.0004,.016,.019,.0020,20,32),
});
const YAW_PATTERN=Object.freeze([.45,-.65,.25,.60,-.40,-.25]);
const ROLL_PATTERN=Object.freeze([-.55,.35,-.25,.65,-.45,.25]);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function createWeaponRecoil(){
  const axes=Object.fromEntries(AXES.map(key=>[key,{position:0,velocity:0,speed:30}]));
  let weaponId=null,shots=0,timeSinceShot=0;
  function inspect(){
    const pose=Object.fromEntries(AXES.map(key=>[key,axes[key].position]));
    const intensity=clamp(Math.max(...AXES.map(key=>Math.abs(pose[key])/WEAPON_RECOIL_LIMITS[key])),0,1);
    return {...pose,intensity,spread:Math.min(.009,Math.abs(pose.cameraPitch)*.055+Math.abs(pose.cameraYaw)*.10+Math.abs(pose.weaponRoll)*.025),weaponId,shots,timeSinceShot,
      settled:AXES.every(key=>axes[key].position===0&&axes[key].velocity===0)};
  }
  function reset(){for(const axis of Object.values(axes)){axis.position=axis.velocity=0;axis.speed=30;}weaponId=null;shots=0;timeSinceShot=0;return inspect();}
  function fire({weaponId:nextId,aimed=false,crouched=false,moving=false}={}){
    const settings=WEAPON_RECOIL_PROFILES[nextId];if(!settings)throw new RangeError(`Unknown recoil weapon: ${nextId}`);
    if(weaponId!==nextId){reset();weaponId=nextId;}
    const stance=(crouched?.84:1)*(moving?1.12:1),shotIndex=shots++%YAW_PATTERN.length;timeSinceShot=0;
    for(const key of AXES){
      const axis=axes[key],camera=key.startsWith('camera'),signed=key.endsWith('Yaw')||key.endsWith('Roll');
      axis.speed=camera?settings.cameraSpeed:settings.weaponSpeed;
      const direction=signed?(key.endsWith('Yaw')?YAW_PATTERN[shotIndex]:ROLL_PATTERN[shotIndex]):1;
      const amount=settings[key]*stance*(aimed?(camera?.76:.68):1)*direction;
      // For x(0)=0 and v(0)=v, a critical spring peaks at t=1/omega:
      // x_peak=v/(e*omega). Impulses add without changing the resting pose.
      const maximumVelocity=WEAPON_RECOIL_LIMITS[key]*axis.speed*Math.E*2;
      axis.velocity=clamp(axis.velocity+amount*axis.speed*Math.E,-maximumVelocity,maximumVelocity);
    }
    return inspect();
  }
  function update(dt){
    if(!Number.isFinite(dt)||dt<=0)return inspect();
    if(weaponId)timeSinceShot+=dt;
    for(const key of AXES){
      const axis=axes[key],omega=axis.speed,b=axis.velocity+omega*axis.position,decay=Math.exp(-omega*dt);
      // Analytic critical damping stays stable at any frame rate and cannot
      // oscillate below the pitch/kick resting point after a positive impulse.
      const position=(axis.position+b*dt)*decay,velocity=(axis.velocity-omega*b*dt)*decay;
      const limit=WEAPON_RECOIL_LIMITS[key],unsigned=key==='cameraPitch'||key==='weaponKick'||key==='weaponPitch';
      axis.position=clamp(position,unsigned?0:-limit,limit);axis.velocity=velocity;
      if(axis.position!==position&&Math.sign(axis.velocity)===Math.sign(position-axis.position))axis.velocity=0;
      if(Math.abs(axis.position)<1e-7&&Math.abs(axis.velocity)<1e-6){axis.position=0;axis.velocity=0;}
    }
    return inspect();
  }
  return {fire,update,reset,inspect};
}
