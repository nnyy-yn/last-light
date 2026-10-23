import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {fitViewSleeves} from './view-sleeve-fit.js';

// The imported hands keep their actual skin weights and articulated fingers.
// All paths below are presentation animation in the weapon's local frame;
// ammunition, firing and reload completion remain owned by the game simulation.
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const smooth=t=>THREE.MathUtils.smoothstep(t,0,1);
function sample(keys,t){
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
    const a=keys[i-1],b=keys[i],w=smooth((t-a[0])/(b[0]-a[0]));
    return a[1].clone().lerp(b[1],w);
  }
  return keys.at(-1)[1].clone();
}
function worldRotation(bone,rotation){
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  bone.updateMatrixWorld(true);
}

export function createAnimatedHands({source,offset,weapon,rifle,id}){
  const root=new THREE.Group();root.name=`${id} articulated view arms`;
  const skeletonRoot=cloneSkeleton(source);
  const remove=[];
  skeletonRoot.traverse(o=>{if(o.name.startsWith('Gun_'))remove.push(o);});
  for(const o of remove)o.removeFromParent();
  skeletonRoot.scale.multiplyScalar(.5);skeletonRoot.position.multiplyScalar(.5).add(offset);
  root.add(skeletonRoot);weapon.add(root);weapon.updateWorldMatrix(true,true);
  let skin;
  skeletonRoot.traverse(o=>{if(o.isSkinnedMesh)skin=o;if(o.isMesh){o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;o.renderOrder=5;o.userData.sharedGeometry=true;o.userData.sharedMaterial=true;}});
  if(!skin)throw new Error(`Missing articulated hands for ${id}`);
  const sleeveFit=fitViewSleeves({skeletonRoot,weapon});
  const toLocal=o=>weapon.worldToLocal(o.getWorldPosition(V()));
  const quatLocal=o=>weapon.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
  const rest=[];skeletonRoot.traverse(o=>{if(o.isBone)rest.push({o,p:o.position.clone(),q:o.quaternion.clone()});});
  const arms={};
  for(const side of ['L','R']){
    const find=name=>skeletonRoot.getObjectByName(name)||skeletonRoot.getObjectByName(name.replaceAll('.','')),up=find(`UpArm_${side}`),fore=find(`Forearm_${side}`),end=find(`BoneTwist_01.${side}_end`),control=find(`IK_Hand_Cntrl_${side}`),hand=find(`Hand_${side}`);
    if(!up||!fore||!end||!control||!hand)throw new Error(`Incomplete ${side} arm chain for ${id}`);
    const finger=n=>find(`Bone_${side}.${String(n).padStart(3,'0')}`);
    const palm=toLocal(hand).lerp(toLocal(finger(9)),.65),controlP=toLocal(control),controlQ=quatLocal(control);
    const along=toLocal(finger(9)).sub(toLocal(hand)).normalize(),across=toLocal(finger(5)).sub(toLocal(finger(17))).normalize();across.addScaledVector(along,-across.dot(along)).normalize();
    const basis=new THREE.Matrix4().makeBasis(along,across,along.clone().cross(across));
    const chains=[5,9,13,17,20].map(first=>{
      const bones=[first,first+1,first+2].map(finger),points=bones.map(toLocal);
      const axis=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[1])).normalize();
      if(axis.lengthSq()<.1)axis.copy(across);
      return{first,bones,lengths:[points[0].distanceTo(points[1]),points[1].distanceTo(points[2])],axis};
    });
    arms[side]={up,fore,end,control,hand,controlP,controlQ,palm,palmOffset:palm.clone().sub(controlP),basis,chains,shoulder:toLocal(up),fingers:[5,6,7,9,10,11,13,14,15,17,18,19,20,21,22].map(n=>{
      const bone=finger(n),chain=chains.find(c=>n>=c.first&&n<=c.first+2);
      return{n,bone,q:bone?.quaternion.clone(),axis:chain.axis.clone().applyQuaternion(quatLocal(bone).invert())};
    }).filter(f=>f.bone)};
  }
  const staticRifle=['m16a2','m249','ak'].includes(id);
  const leftHome=arms.L.controlP.clone();
  if(staticRifle)leftHome.add(V(...weapon.userData.grips.left).sub(V(0,-.03635111,-.2725)));
  // The support palm stays beneath the handguard. Thicker guards need open
  // knuckles, not a stretched copy of the source rifle's finger mesh.
  const holdOpening=id==='m16a2'?.13:id==='m249'?.17:id==='ak'?.09:0;
  const leftHomeQ=arms.L.controlQ.clone();
  const parts={};
  function movable(name,key){
    const object=rifle.getObjectByName(name);if(!object)return;
    weapon.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3();object.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])bounds.expandByPoint(weapon.worldToLocal(o.localToWorld(V(x,y,z))));}});
    const center=bounds.getCenter(V());
    const pivot=new THREE.Group();pivot.name=`${key} animation pivot`;pivot.position.copy(center);weapon.add(pivot);pivot.attach(object);
    parts[key]={pivot,home:center.clone(),q:pivot.quaternion.clone(),size:bounds.getSize(V()),bounds};
  }
  movable('Magazine','magazine');if(!parts.magazine)movable('AmmoContainer','magazine');
  movable('ChargingHandle','bolt');if(!parts.bolt)movable('BoltCarrier','bolt');
  movable('FeedBelt','belt');
  const magHome=parts.magazine?.home.clone()||V(0,-.10,-.12);
  const magBounds=parts.magazine?.bounds||new THREE.Box3(magHome.clone().sub(V(.015,.07,.035)),magHome.clone().add(V(.015,.07,.035)));
  const magSide=magBounds.min.x-magHome.x-(id==='m249'?.035:id==='m1911'?.018:.020);
  const magGrip=magHome.clone().add(V(magSide,id==='m249'?-.025:id==='m1911'?-.055:-.012,.006));
  const targetAlong=V(0,0,-1),targetAcross=V(0,1,0);
  const magBasis=new THREE.Matrix4().makeBasis(targetAlong,targetAcross,targetAlong.clone().cross(targetAcross));
  const gripDelta=new THREE.Quaternion().setFromRotationMatrix(magBasis.multiply(arms.L.basis.clone().invert()));
  const grabQ=gripDelta.clone().multiply(arms.L.controlQ);
  const grabOffset=arms.L.palmOffset.clone().applyQuaternion(gripDelta);
  const grabControl=magGrip.clone().sub(grabOffset);
  const magPull=V(id==='m249'?-.07:-.018,-.15,.035),pouch=V(-.27,-.48,.14);
  let last={reload:0,stage:'hold'},shotPulse=0;

  function solveArm(arm,p,q,side){
    // Move the shoulder opening outside the frame, then solve the elbow using
    // the two segment lengths. The independent hand control also needs posing.
    weapon.updateWorldMatrix(true,true);
    const shoulder=arm.shoulder.clone().add(V(side==='L'?-.025:.02,-.06,.02));
    arm.up.position.copy(arm.up.parent.worldToLocal(weapon.localToWorld(shoulder)));
    arm.up.updateMatrixWorld(true);
    let start=arm.up.getWorldPosition(V()),oldElbow=arm.fore.getWorldPosition(V()),oldEnd=arm.end.getWorldPosition(V());
    const upper=oldElbow.distanceTo(start),lower=oldEnd.distanceTo(oldElbow);
    const target=weapon.localToWorld(p.clone()),targetQ=weapon.getWorldQuaternion(new THREE.Quaternion()).multiply(q);
    arm.control.position.copy(arm.control.parent.worldToLocal(target));worldRotation(arm.control,targetQ);
    const wrist=arm.hand.getWorldPosition(V());
    const reach=wrist.clone().sub(start),limit=(upper+lower)*.985;
    if(reach.length()>limit){
      // A pouch reach also moves the shoulder. Clamping only the elbow would
      // detach the independent wrist from the sleeve when the arm is extended.
      start=wrist.clone().addScaledVector(reach.normalize(),-limit);
      arm.up.position.copy(arm.up.parent.worldToLocal(start.clone()));arm.up.updateMatrixWorld(true);
      oldElbow=arm.fore.getWorldPosition(V());oldEnd=arm.end.getWorldPosition(V());
    }
    const axis=wrist.clone().sub(start),distance=THREE.MathUtils.clamp(axis.length(),Math.abs(upper-lower)+.0001,upper+lower-.0001);axis.normalize();
    const pole=weapon.localToWorld(V(side==='L'?-.55:.55,-.55,.25)).sub(start);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(upper*upper+distance*distance-lower*lower)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
    const elbow=start.clone().addScaledVector(axis,along).addScaledVector(pole,height);
    const upperTurn=new THREE.Quaternion().setFromUnitVectors(oldElbow.clone().sub(start).normalize(),elbow.clone().sub(start).normalize());
    worldRotation(arm.up,upperTurn.multiply(arm.up.getWorldQuaternion(new THREE.Quaternion())));
    const nowElbow=arm.fore.getWorldPosition(V()),nowEnd=arm.end.getWorldPosition(V());
    const foreTurn=new THREE.Quaternion().setFromUnitVectors(nowEnd.sub(nowElbow).normalize(),wrist.clone().sub(nowElbow).normalize());
    worldRotation(arm.fore,foreTurn.multiply(arm.fore.getWorldQuaternion(new THREE.Quaternion())));
  }
  function fingers(arm,opening,indexLift=0){
    for(const f of arm.fingers){
      const thumb=f.n>=20,index=f.n>=5&&f.n<=7;
      const angle=thumb?opening*.35:opening*(f.n%4===1?.65:1)+(index?indexLift:0);
      const tighten=(arm===arms.R&&!thumb&&!index&&staticRifle) ? .08 : 0;
      f.bone.quaternion.copy(f.q).multiply(new THREE.Quaternion().setFromAxisAngle(f.axis,-angle+tighten));
    }
  }
  function aimFinger(chain,target,pole,weight){
    const[a,b,c]=chain.bones,origin=toLocal(a),axis=target.clone().sub(origin);
    const[A,B]=chain.lengths,d=THREE.MathUtils.clamp(axis.length(),Math.abs(A-B)+.001,(A+B)*.985);axis.normalize();
    const bend=pole.clone().sub(origin);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
    const along=(A*A+d*d-B*B)/(2*d),height=Math.sqrt(Math.max(0,A*A-along*along));
    const middle=origin.clone().addScaledVector(axis,along).addScaledVector(bend,height);
    for(const[bone,child,point]of[[a,b,middle],[b,c,origin.clone().addScaledVector(axis,d)]]){
      const current=child.getWorldPosition(V()).sub(bone.getWorldPosition(V())).normalize();
      const desired=weapon.localToWorld(point.clone()).sub(bone.getWorldPosition(V())).normalize();
      const q=bone.getWorldQuaternion(new THREE.Quaternion()),targetQ=new THREE.Quaternion().setFromUnitVectors(current,desired).multiply(q);
      worldRotation(bone,q.slerp(targetQ,weight));
    }
  }
  function graspMagazine(weight){
    if(!parts.magazine||weight<=0)return;
    const offset=parts.magazine.pivot.position.clone().sub(magHome),wide=id==='m249',pistol=id==='m1911';
    const box=magBounds.clone().translate(offset),center=magHome.clone().add(offset);
    for(const chain of arms.L.chains){
      const knuckle=toLocal(chain.bones[0]),thumb=chain.first===20;
      let target,pole;
      if(thumb){
        // Thumb pads stay on the near face; they cannot traverse a 17cm box
        // or reach behind the magazine into the firing hand.
        target=V(wide||pistol?box.min.x-.009:box.max.x+.009,pistol?box.min.y+.006:center.y-.010,wide?center.z+.055:center.z+.014);
        pole=V(box.min.x-.045,target.y+.025,center.z+.065);
      }else{
        const ordinal=(chain.first-5)/4;
        const y=pistol?box.min.y+.045-ordinal*.018:THREE.MathUtils.clamp(knuckle.y-.007,box.min.y+.009,box.max.y-.012);
        target=V(wide?box.min.x-.010:box.max.x+.007,y,box.min.z-.009);
        pole=V(box.min.x-.023,target.y-.012,box.min.z-.024);
      }
      aimFinger(chain,target,pole,weight);
    }
  }
  function graspPistolGrip(){
    if(!staticRifle&&id!=='m1911')return;
    const pistol=id==='m1911';
    for(const chain of arms.R.chains){
      if(chain.first===5)continue; // Trigger finger retains its lift/recoil pose.
      const p=toLocal(chain.bones[0]);
      if(chain.first===20){
        aimFinger(chain,V(-.024,p.y+.010,pistol?.014:.001),V(-.045,p.y+.030,p.z-.020),.8);
      }else{
        const ordinal=(chain.first-9)/4;
        const target=V(ordinal===2?-.002:-.010,p.y+.002,p.z-(.031-ordinal*.007));
        aimFinger(chain,target,V(.014,p.y-.003,p.z-.060),.85);
      }
    }
  }
  function update({reload=0,dt=0,shot=false}={}){
    const phase=THREE.MathUtils.clamp(reload,0,1),active=phase>0&&phase<1;
    for(const r of rest){r.o.position.copy(r.p);r.o.quaternion.copy(r.q);}
    for(const part of Object.values(parts)){part.pivot.position.copy(part.home);part.pivot.quaternion.copy(part.q);part.pivot.visible=true;}
    if(shot)shotPulse=1;else shotPulse=Math.max(0,shotPulse-dt*13);
    let left=leftHome.clone(),leftQ=leftHomeQ.clone(),opening=holdOpening;
    const envelope=active?smooth(phase/.12)*(1-smooth((phase-.87)/.13)):0;
    weapon.rotation.z=(id==='m1911'?-.48:-.34)*envelope;
    weapon.rotation.y=(id==='m1911'?.48:.32)*envelope;
    weapon.position.set(-.08*envelope,(id==='m1911'?.08:.12)*envelope,(id==='m1911'?-.04:-.22)*envelope);
    let stage='hold';
    if(active){
      const off=sample([[0,V()],[.19,V()],[.34,magPull],[.43,pouch],[.54,pouch],[.72,magPull],[.83,V()],[1,V()]],phase);
      if(parts.magazine)parts.magazine.pivot.position.add(off);
      if(parts.belt){parts.belt.pivot.position.addScaledVector(off,.8);parts.belt.pivot.visible=phase<.35||phase>.73;}
      const boltTouch=parts.bolt?parts.bolt.home.clone().add(V(-.035,.015,.025)).sub(grabOffset):grabControl.clone().add(V(-.025,.08,-.04));
      left=sample([[0,leftHome],[.19,grabControl],[.34,grabControl.clone().add(magPull)],[.43,grabControl.clone().add(pouch)],[.54,grabControl.clone().add(pouch)],[.72,grabControl.clone().add(magPull)],[.83,grabControl],[.90,boltTouch],[1,leftHome]],phase);
      const grabBlend=smooth(phase/.18)*(1-smooth((phase-.90)/.10));leftQ.slerp(grabQ,grabBlend);
      const grasp=smooth((phase-.11)/.08)*(1-smooth((phase-.81)/.07));
      opening=THREE.MathUtils.lerp(holdOpening,.30,smooth(phase/.10));
      opening=THREE.MathUtils.lerp(opening,-.06,grasp);
      opening=THREE.MathUtils.lerp(opening,holdOpening,smooth((phase-.92)/.08));
      const boltCycle=phase>.84&&phase<.95?Math.sin((phase-.84)/.11*Math.PI):0;
      if(parts.bolt)parts.bolt.pivot.position.z+=.035*boltCycle;
      stage=phase<.19?'reach':phase<.43?'remove':phase<.54?'retrieve':phase<.83?'insert':phase<.95?'settle':'return';
    }
    fingers(arms.L,opening);fingers(arms.R,0,(active?.20:.07)-shotPulse*.14);
    const right=arms.R.controlP.clone();if(staticRifle||id==='m1911')right.x-=.009;
    solveArm(arms.R,right,arms.R.controlQ,'R');solveArm(arms.L,left,leftQ,'L');
    graspPistolGrip();
    const contact=active?smooth((phase-.10)/.09)*(1-smooth((phase-.81)/.07)):0;
    graspMagazine(contact);
    weapon.updateWorldMatrix(true,true);skin.skeleton.update();
    sleeveFit.update();
    last={reload:phase,stage,leftWrist:toLocal(arms.L.hand).toArray(),rightWrist:toLocal(arms.R.hand).toArray(),magazine:parts.magazine?.pivot.position.toArray(),opening,shotPulse,bones:skin.skeleton.bones.length};
  }
  update();
  return{root,update,inspect:()=>({...last,weaponId:id,
    arms:Object.fromEntries(Object.entries(arms).map(([side,a])=>[side,{
      shoulder:toLocal(a.up).toArray(),elbow:toLocal(a.fore).toArray(),wrist:toLocal(a.hand).toArray(),
      forearmEnd:toLocal(a.end).toArray(),wristGap:a.end.getWorldPosition(V()).distanceTo(a.hand.getWorldPosition(V())),
      fingers:a.fingers.map(f=>({joint:f.n,position:toLocal(f.bone).toArray()}))
    }]))
  }),dispose(){sleeveFit.dispose();skin.skeleton.dispose();root.removeFromParent();}};
}
