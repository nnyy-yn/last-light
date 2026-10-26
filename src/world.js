import * as THREE from 'three';
import { createSunShadows } from './sun-shadows.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRifle, PLAYER_WEAPON_IDS } from './weapon.js';
import { getChapterLayout } from './chapter-layouts.js';
import { buildChapterScene } from './chapter-world.js';
import { prepareVehicles, createVehicle as makeVehicleAsset, disposeVehicles } from './vehicles.js';
import { createFire } from './fire.js';
import { tuneCharacterMaterial } from './character-surface.js';

// Metres, Y up. Static city geometry is merged by material; actors remain separate.
const BASE = new URL('assets/', document.baseURI).href;
const PI = Math.PI;
const materials = new Set();
const textures = new Set();
let seed = 67041993;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function rand(a, b) { return a + random() * (b - a); }
function material(options) { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; }
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; textures.add(t); return t;
}
function wornTexture(color, type = 'metal') {
  const texture=canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3800; i++) {
      ctx.fillStyle = random() > .5 ? `rgba(245,223,180,${rand(.02,.16)})` : `rgba(16,12,8,${rand(.02,.19)})`;
      ctx.fillRect(rand(0,w),rand(0,h),rand(1,4),rand(1,3));
    }
    for (let i=0;i<70;i++) {
      const y=rand(0,h); ctx.strokeStyle = 'rgba(30,20,10,.14)'; ctx.lineWidth=rand(.2,1.2);
      ctx.beginPath();ctx.moveTo(rand(0,w),y);ctx.lineTo(rand(0,w),y+rand(-2,2));ctx.stroke();
    }
    if(type==='metal') for(let y=0;y<h;y+=25){ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(0,y,w,1);}
  });
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
}
function mesh(geo, mat, pos=[0,0,0], scale=null) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if(scale)m.scale.set(...scale);
  m.castShadow = true; m.receiveShadow = true; return m;
}
function box(w,h,d,mat,x=0,y=0,z=0) {return mesh(new THREE.BoxGeometry(w,h,d),mat,[x,y,z]);}
function cylinder(a,b,l,mat,x=0,y=0,z=0,n=12){return mesh(new THREE.CylinderGeometry(a,b,l,n),mat,[x,y,z]);}
function connect(a,b,r,mat,segments=8){
  const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b); const d=bv.clone().sub(av);
  const m=cylinder(r,r,d.length(),mat,...av.clone().add(bv).multiplyScalar(.5).toArray(),segments);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;
}

// Root-space two-bone IK keeps boot soles planted while the pelvis lowers.
// No actor scaling is used for stance changes, and the director owns root motion.
function installActorPoses(root, model, rawBones, rifle, kind, nativeAnimate) {
  const civilian = kind === 'civilian', bones = {};
  model.traverse(b => { if (b.isBone) bones[b.name.replace(/:/g, '')] = b; });
  const get = (mixamo, human) => rawBones['mixamorig' + mixamo] || bones[human];
  const rig = { hips:get('Hips','pelvis'), spine:get('Spine','spine_01'), chest:get('Spine2','spine_03'), neck:get('Neck','neck_01'), head:get('Head','head') };
  const limbs = ['Right','Left'].map((side,index) => {
    const suffix=index?'l':'r';
    return {side, sign:index?1:-1, thigh:get(side+'UpLeg','thigh_'+suffix), knee:get(side+'Leg','calf_'+suffix), foot:get(side+'Foot','foot_'+suffix), toe:get(side+'ToeBase','ball_'+suffix),
      arm:get(side+'Arm','upperarm_'+suffix), elbow:get(side+'ForeArm','lowerarm_'+suffix), hand:get(side+'Hand','hand_'+suffix), knuckle:get(side+'HandMiddle1','middle_01_'+suffix)};
  });
  if (!rig.hips || !rig.head || limbs.some(l => !l.thigh || !l.knee || !l.foot || !l.arm || !l.elbow || !l.hand)) return;
  root.updateMatrixWorld(true);
  const localPoint = bone => root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
  const localRotation = bone => root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const rest = new Map();
  for (const bone of new Set([...Object.values(rig),...limbs.flatMap(l=>[l.thigh,l.knee,l.foot,l.toe,l.arm,l.elbow,l.hand])].filter(Boolean))) rest.set(bone,{q:bone.quaternion.clone(),position:bone.position.clone(),rootQ:localRotation(bone)});
  const modelBase=model.position.clone();
  for(const l of limbs){
    l.ankle=localPoint(l.foot);l.handQ=localRotation(l.hand);l.footQ=localRotation(l.foot);l.toeDirection=l.toe?localPoint(l.toe).sub(l.ankle).normalize():new THREE.Vector3(0,-.3,1).normalize();
    l.palmFactor=civilian?.6:l.side==='Left'?.72:.80;
    l.palm=localPoint(l.hand);if(l.knuckle)l.palm.lerp(localPoint(l.knuckle),l.palmFactor);
    l.palmOffset=l.palm.clone().sub(localPoint(l.hand));
    l.upperLeg=localPoint(l.thigh).distanceTo(localPoint(l.knee));l.lowerLeg=localPoint(l.knee).distanceTo(l.ankle);
    l.upperArm=localPoint(l.arm).distanceTo(localPoint(l.elbow));l.lowerArm=localPoint(l.elbow).distanceTo(localPoint(l.hand));
    // MPFB exports foot bones under the armature, outside the thigh/calf chain.
    // A hidden endpoint rotates the calf while the exported foot is positioned
    // independently; native animation tracks retain their original hierarchy.
    if(civilian && l.foot.parent!==l.knee){l.legEnd=new THREE.Object3D();l.legEnd.name='stance-ankle-target';root.add(l.legEnd);l.legEnd.position.copy(l.ankle);root.updateMatrixWorld(true);l.knee.attach(l.legEnd);}
    if(!civilian){
      const middle=rawBones['mixamorig'+l.side+'HandMiddle1'],index=rawBones['mixamorig'+l.side+'HandIndex1'],pinky=rawBones['mixamorig'+l.side+'HandPinky1'];
      if(middle&&index&&pinky){
        const fingerAxis=localPoint(middle).sub(localPoint(l.hand)).normalize();
        const across=localPoint(index).sub(localPoint(pinky));across.addScaledVector(fingerAxis,-across.dot(fingerAxis)).normalize();
        const normal=fingerAxis.clone().cross(across).normalize();
        const source=new THREE.Matrix4().makeBasis(fingerAxis,across,normal);
        const direction=new THREE.Vector3(l.side==='Right'?0:-.70,l.side==='Right'?-1:.70,l.side==='Right'?.12:0).normalize();
        const width=new THREE.Vector3(0,0,l.side==='Right'?1:-1);width.addScaledVector(direction,-width.dot(direction)).normalize();
        const target=new THREE.Matrix4().makeBasis(direction,width,direction.clone().cross(width).normalize());
        l.gripHandQ=new THREE.Quaternion().setFromRotationMatrix(target.multiply(source.invert())).multiply(l.handQ);
        // Curl all phalanges around each finger's anatomical bend axis. The
        // generated MPFB hand starts open, unlike the previous authored mesh.
        const fingerBend=normal.clone().negate(), curls=[];
        // Capture axes before changing any parent phalanx. Measuring the next
        // axis after bending its parent twisted the support-hand fingertips.
        for(const finger of ['Index','Middle','Ring','Pinky'])for(let jointIndex=1;jointIndex<=3;jointIndex++){
          const joint=rawBones['mixamorig'+l.side+'Hand'+finger+jointIndex];if(!joint)continue;
          const child=rawBones['mixamorig'+l.side+'Hand'+finger+(jointIndex+1)];
          const direction=child?localPoint(child).sub(localPoint(joint)).normalize():fingerAxis;
          const axis=direction.clone().cross(fingerBend).normalize().applyQuaternion(localRotation(joint).invert());
          const angles=l.side==='Left'?[0,1.48,1.02,.57]:[0,1.48,1.02,.57];
          curls.push({joint,axis,angle:angles[jointIndex],open:joint.quaternion.clone(),finger,jointIndex});
        }
        l.fingerCurls=curls;
        const thumb=['1','2','3'].map(n=>rawBones['mixamorig'+l.side+'HandThumb'+n]);
        if(thumb.every(Boolean))l.thumb={bones:thumb,rest:thumb.map(b=>b.quaternion.clone()),lengthA:localPoint(thumb[0]).distanceTo(localPoint(thumb[1])),lengthB:localPoint(thumb[1]).distanceTo(localPoint(thumb[2]))};
        for(const {joint,axis,angle} of curls)joint.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis,angle));
        root.updateMatrixWorld(true);
      }
    }
  }
  const baseHead=localPoint(rig.head);
  const phase=(Math.abs(root.position.x*1.73+root.position.z*.71)%6.283), state={stance:'stand',motion:0,lowering:0,aimYaw:0,aimPitch:0,recoil:0,headHeight:baseHead.y,hipHeight:localPoint(rig.hips).y,gripError:0,footError:0};
  let time=phase,gait=Math.PI*.53,motion=0,drop=0,kneel=0,treat=0,low=0,alert=.25,yaw=0,pitch=-.12,recoil=0,talk=0,lean=0,hit=0,wasStepping=false;
  const lastPosition=root.position.clone(),travel=new THREE.Vector3(0,0,1);let lastYaw=root.rotation.y;
  for(const l of limbs){l.plant=root.localToWorld(l.ankle.clone());l.liftStart=l.plant.clone();l.swinging=false;l.plantQ=root.getWorldQuaternion(new THREE.Quaternion()).multiply(l.footQ);}
  const damp=(a,b,dt,rate=10)=>THREE.MathUtils.lerp(a,b,1-Math.exp(-dt*rate));
  const clamp=THREE.MathUtils.clamp;
  function orient(bone,q){const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert(),world=root.getWorldQuaternion(new THREE.Quaternion()).multiply(q);bone.quaternion.copy(parent.multiply(world));bone.updateWorldMatrix(false,true);}
  function rotate(bone,x,y=0,z=0){if(!bone)return;const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'YXZ'));orient(bone,q.multiply(localRotation(bone)));}
  function point(bone,child,target){
    const current=child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
    const desired=root.localToWorld(target.clone()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
    const delta=new THREE.Quaternion().setFromUnitVectors(current,desired),world=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));bone.updateWorldMatrix(false,true);
  }
  function solve(a,b,c,target,pole,lengthA,lengthB){
    const origin=localPoint(a),axis=target.clone().sub(origin),distance=clamp(axis.length(),Math.abs(lengthA-lengthB)+.001,(lengthA+lengthB)*.998);axis.normalize();
    const bend=pole.clone().sub(origin);bend.addScaledVector(axis,-bend.dot(axis));if(bend.lengthSq()<.00001)bend.set(0,0,1);bend.normalize();
    const along=(lengthA*lengthA+distance*distance-lengthB*lengthB)/(2*distance),height=Math.sqrt(Math.max(0,lengthA*lengthA-along*along));
    const middle=origin.clone().addScaledVector(axis,along).addScaledVector(bend,height),end=origin.clone().addScaledVector(axis,distance);
    point(a,b,middle);point(b,c,end);
  }
  if(rifle)root.userData.getMuzzlePosition=()=>{rifle.updateWorldMatrix(true,false);return rifle.localToWorld(new THREE.Vector3(...(rifle.userData.muzzle||[0,-.006,-.5625])));};
  const authoredGrips=rifle?.userData.grips||{right:[0,-.055,.005],left:[0,-.036,-.2725]};
  const grips={right:[...authoredGrips.right],left:[...authoredGrips.left]};
  grips.left[2]+=.025; // Support hand uses the rear half of the long handguard.
  const gripSpan=new THREE.Vector3(...grips.left).distanceTo(new THREE.Vector3(...grips.right));
  const reloadPart=rifle?.getObjectByName('Magazine')||rifle?.getObjectByName('AmmoContainer');
  const reloadBelt=rifle?.getObjectByName('FeedBelt'),reloadBeltVisible=reloadBelt?.visible;
  let reloadRest,magazineGrip;
  if(reloadPart){
    root.updateMatrixWorld(true);
    const box=new THREE.Box3();
    reloadPart.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])box.expandByPoint(rifle.worldToLocal(o.localToWorld(new THREE.Vector3(x,y,z))));}});
    magazineGrip=box.getCenter(new THREE.Vector3());magazineGrip.y-=box.getSize(new THREE.Vector3()).y*.28;
    reloadRest={position:reloadPart.position.clone(),quaternion:reloadPart.quaternion.clone()};
  }

  const referenceAim=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI,0,'YXZ'));
  const handAim=limbs.map(l=>referenceAim.clone().invert().multiply(l.gripHandQ||l.handQ));
  root.userData.poseState=state;
  root.userData.getPoseState=()=>({...state,head:localPoint(rig.head).toArray(),hips:localPoint(rig.hips).toArray(),limbs:limbs.map(l=>({side:l.side,knee:localPoint(l.knee).toArray(),ankle:localPoint(l.foot).toArray(),hand:localPoint(l.hand).toArray()}))});
  root.userData.animate=(speed=0,dt=0,pose={})=>{
    if(root.userData.disposed)return;
    dt=clamp(Number.isFinite(dt)?dt:0,0,.1);time+=dt;
    const stance=['stand','crouch','kneel','treat','low'].includes(pose.stance)?pose.stance:'stand',amount=Math.abs(Number.isFinite(speed)?speed:0);
    const dead=clamp(Number(pose.dead||0),0,1),collapse=THREE.MathUtils.smoothstep(dead,.05,.9),aliveWeight=1-collapse,deadSide=pose.deadSide===-1?-1:1;
    const delta=root.position.clone().sub(lastPosition),distanceMoved=Math.hypot(delta.x,delta.z),yawDelta=Math.atan2(Math.sin(root.rotation.y-lastYaw),Math.cos(root.rotation.y-lastYaw));
    const turnSpeed=dt>0?Math.min(4,Math.abs(yawDelta)/dt):0;
    const realTravel=distanceMoved>.00001&&distanceMoved<Math.max(.5,amount*dt*3);
    if(realTravel){const c=Math.cos(root.rotation.y),s=Math.sin(root.rotation.y);const direction=new THREE.Vector3(delta.x*c-delta.z*s,0,delta.x*s+delta.z*c).normalize();if(!wasStepping||travel.dot(direction)<-.9)travel.copy(direction);else{const angle=Math.atan2(travel.x,travel.z),target=Math.atan2(direction.x,direction.z),difference=Math.atan2(Math.sin(target-angle),Math.cos(target-angle)),next=angle+difference*(1-Math.exp(-dt*16));travel.set(Math.sin(next),0,Math.cos(next));}}
    lastPosition.copy(root.position);lastYaw=root.rotation.y;
    motion=damp(motion,Math.min(amount/2.6,1.35)*aliveWeight,dt,8);
    const turnStep=('stance' in pose)&&turnSpeed>.35,stepping=dead<.05&&(amount>.08||turnStep);
    const stepRate=1.12+Math.min(amount,3.5)*.43+(turnStep?.25:0);
    if(stepping&&!wasStepping)gait=Math.PI*.53;
    if(stepping)gait+=dt*stepRate*Math.PI*2;
    wasStepping=stepping;
    lean=damp(lean,clamp(Number(pose.peek||0),-1,1),dt,7);
    const reloadPhase=clamp(Number(pose.reload||0),0,1)*aliveWeight,reloadWeight=reloadPhase>0?THREE.MathUtils.smoothstep(reloadPhase,0,.14)*(1-THREE.MathUtils.smoothstep(reloadPhase,.85,1)):0;
    const targetDrop=({stand:0,crouch:.37,low:.51,kneel:.48,treat:.54})[stance]*aliveWeight;
    drop=damp(drop,targetDrop,dt,9);kneel=damp(kneel,(stance==='kneel'||stance==='treat'?1:0)*aliveWeight,dt);treat=damp(treat,(stance==='treat'?1:0)*aliveWeight,dt);low=damp(low,(stance==='low'?1:0)*aliveWeight,dt);
    alert=damp(alert,clamp(Number(pose.alert??.3),0,1),dt,4);talk=damp(talk,clamp(Number(pose.talk||0),0,1),dt,5);
    let targetYaw=Number(pose.aimYaw||0),targetPitch=Number(pose.aimPitch??(-.12+.08*alert));
    if(pose.aimTarget){const p=pose.aimTarget,worldTarget=new THREE.Vector3(p.x??p[0],p.y??p[1]??1.4,p.z??p[2]);root.worldToLocal(worldTarget);const chest=localPoint(rig.chest),dx=worldTarget.x-chest.x,dz=worldTarget.z-chest.z;targetYaw=Math.atan2(dx,dz);targetPitch=Math.atan2(worldTarget.y-chest.y,Math.hypot(dx,dz));}
    yaw=damp(yaw,clamp(targetYaw,-.9,.9),dt,8);pitch=damp(pitch,clamp(targetPitch,-.55,.5),dt,8);
    const impulse=clamp(Number(pose.recoil||0),0,1);recoil=Math.max(impulse,recoil*Math.exp(-dt*13));
    hit=Math.max(clamp(Number(pose.hit||0),0,1),hit*Math.exp(-dt*9));
    if(civilian && root.userData.nativeLocomotion && drop<.006 && stance==='stand'&&dead===0){
      model.position.copy(modelBase);nativeAnimate?.(speed,dt);root.updateMatrixWorld(true);
      Object.assign(state,{stance,motion,lowering:drop,headHeight:localPoint(rig.head).y,hipHeight:localPoint(rig.hips).y,aimYaw:yaw,aimPitch:pitch,recoil,gripError:0,footError:0});return;
    }
    for(const[bone,r]of rest){bone.quaternion.copy(r.q);bone.position.copy(r.position);}
    const crouch=clamp(drop/.37,0,1),breath=Math.sin(time*1.85)*.004*aliveWeight;
    model.position.copy(modelBase);model.position.y-=drop+.11*motion+Math.abs(Math.sin(gait*2))*.014*motion;model.position.z-=crouch*.105+low*.025;model.position.x+=Math.sin(gait)*.017*motion+Math.sin(time*.71)*.007*Math.max(0,1-motion)*aliveWeight+lean*.055*aliveWeight;
    root.updateMatrixWorld(true);
    rotate(rig.spine,.10*crouch+.08*low+.16*treat+.075*motion+breath-.085*hit-.035*collapse, yaw*.26,Math.sin(gait)*.015*motion-lean*.10+.045*hit-deadSide*.22*collapse);
    rotate(rig.chest,.045*alert+.07*crouch+.12*treat+.035*motion-recoil*.025-.10*hit-.02*collapse,yaw*.32+.04*hit,-lean*.06+deadSide*.10*collapse);
    rotate(rig.neck,-.035*crouch-.02*treat,0,deadSide*.70*collapse);
    const scan=Math.sin(time*.62)*(.06+.075*alert)*(1-treat)*(pose.aimTarget?0:1)*aliveWeight;
    rotate(rig.head,(-pitch*.45-.04*crouch+.02*treat+Math.sin(time*7)*.015*talk-.055*hit)*aliveWeight-.10*collapse,yaw*.30*aliveWeight+scan-deadSide*.30*collapse,Math.sin(time*3)*.012*talk*aliveWeight+.035*hit);
    let footError=0;
    const rootQ=root.getWorldQuaternion(new THREE.Quaternion());
    for(let i=0;i<limbs.length;i++){
      const l=limbs[i],cycle=((gait/(Math.PI*2)+i*.5)%1+1)%1,contact=.53;
      const target=l.ankle.clone();target.x+=l.sign*.055*crouch;target.z+=kneel*(i?.27:-.38);target.y+=kneel*(i?0:.08);
      // As the root falls, release the planted stance into a loose, asymmetric
      // extension instead of retaining a bent knee behind the torso.
      if(collapse>0){const bottom=l.sign===-deadSide,relaxed=new THREE.Vector3(-deadSide*(bottom?.14:.10),bottom?.125:.22,bottom?-.04:.26);target.lerp(relaxed,collapse);}
      const stanceQ=rootQ.clone().multiply(l.footQ);let footQ=stanceQ.clone();
      if(stepping&&kneel<.15){
        const swing=cycle>=contact,progress=clamp((cycle-contact)/(1-contact),0,1);
        const reach=Math.min(.37,amount/stepRate*.29)*(1-crouch*.12);
        const landing=target.clone().addScaledVector(travel,reach);
        if(turnStep)landing.x+=l.sign*.035;
        const landingWorld=root.localToWorld(landing);
        if(swing){
          if(!l.swinging){l.liftStart.copy(l.plant);l.startQ=l.plantQ.clone();}
          const t=THREE.MathUtils.smoothstep(progress,0,1);
          const worldFoot=l.liftStart.clone().lerp(landingWorld,t);
          worldFoot.y+=Math.sin(progress*Math.PI)*(.07+.055*Math.min(motion,1))*(1-crouch*.18);
          target.copy(root.worldToLocal(worldFoot));
          footQ.copy(l.startQ||l.plantQ).slerp(stanceQ,t);
          l.plant.copy(landingWorld);l.plantQ.copy(stanceQ);
        }else{
          target.copy(root.worldToLocal(l.plant.clone()));footQ.copy(l.plantQ);
          // Pose previews have no director root motion; keep a readable in-place gait.
          if(!realTravel&&amount>.08){target.copy(l.ankle).addScaledVector(travel,(.5-cycle/contact)*reach*2);target.x+=l.sign*.055*crouch;}
        }
        l.swinging=swing;
      }else{
        l.plant.copy(root.localToWorld(target.clone()));l.plantQ.copy(stanceQ);l.swinging=false;
      }
      const pole=new THREE.Vector3(l.sign*(.15+crouch*.06),.45,1.0);
      solve(l.thigh,l.knee,l.legEnd||l.foot,target,pole,l.upperLeg,l.lowerLeg);
      if(l.legEnd){l.foot.position.copy(l.foot.parent.worldToLocal(root.localToWorld(target.clone())));l.foot.updateWorldMatrix(false,true);}
      if(kneel>.01)footQ.copy(rootQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-kneel*(i?0:.75))).multiply(l.footQ);
      if(collapse>0){const direction=new THREE.Vector3(0,-.45,1).normalize(),relaxed=new THREE.Quaternion().setFromUnitVectors(l.toeDirection,direction).multiply(l.footQ);footQ.slerp(rootQ.clone().multiply(relaxed),collapse);}
      orient(l.foot,rootQ.clone().invert().multiply(footQ));
      footError=Math.max(footError,localPoint(l.foot).distanceTo(target));
    }
    const chest=localPoint(rig.chest),aimQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch+recoil*.035-.11*motion-.20*reloadWeight,Math.PI+yaw,.22*reloadWeight,'YXZ'));
    if(collapse>0)aimQ.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.32,Math.PI+.15,-.12,'YXZ')),collapse);
    let gripError=0;
    if(rifle){
      const carryWeight=clamp(Number(pose.carry??(['carry','handover'].includes(pose.gesture)?1:0)),0,1)*aliveWeight,ropeGrip=pose.gesture==='fast-rope'?aliveWeight:0;
      rifle.visible=treat<.55&&carryWeight<.4&&ropeGrip<.4;
      const right=chest.clone().add(new THREE.Vector3(-.10,.025+alert*.025,.20-recoil*.04-hit*.035).applyAxisAngle(new THREE.Vector3(0,1,0),yaw));
      right.lerp(chest.clone().add(new THREE.Vector3(deadSide===1?-.10:-.05,deadSide===1?.06:-.23,deadSide===1?.20:.25)),collapse);
      const left=new THREE.Vector3(...grips.left).sub(new THREE.Vector3(...grips.right)).applyQuaternion(aimQ).add(right);
      left.lerp(chest.clone().add(new THREE.Vector3(deadSide===-1?-.02:.05,deadSide===-1?.12:-.23,deadSide===-1?.23:.25)),collapse);
      const palms=[right.clone().add(new THREE.Vector3(.022,0,0).applyQuaternion(aimQ)),left];
      rifle.quaternion.copy(aimQ);rifle.position.copy(right).sub(new THREE.Vector3(...grips.right).applyQuaternion(aimQ));
      if(reloadPhase>0&&reloadPhase<1){
        const localMagazine=magazineGrip?.clone()||new THREE.Vector3(-.025,-.15,-.105);
        const magazine=localMagazine.clone().applyQuaternion(aimQ).add(rifle.position);
        const extracted=localMagazine.clone().add(new THREE.Vector3(-.01,-.13,.015)).applyQuaternion(aimQ).add(rifle.position);
        const pouch=chest.clone().add(new THREE.Vector3(.17,-.31,.29));
        const keys=[[0,left],[.17,magazine],[.34,extracted],[.50,pouch],[.69,extracted],[.84,magazine],[1,left]];
        for(let k=1;k<keys.length;k++)if(reloadPhase<=keys[k][0]){const t=THREE.MathUtils.smoothstep(reloadPhase,keys[k-1][0],keys[k][0]);palms[1]=keys[k-1][1].clone().lerp(keys[k][1],t);break;}
      }
      if(reloadBelt)reloadBelt.visible=reloadBeltVisible&&!(reloadPhase>.17&&reloadPhase<.84);
      if(reloadPart&&reloadRest){
        reloadPart.position.copy(reloadRest.position);reloadPart.quaternion.copy(reloadRest.quaternion);
        if(reloadPhase>.17&&reloadPhase<.84&&magazineGrip){
          root.updateMatrixWorld(true);
          const seated=magazineGrip.clone().applyQuaternion(aimQ).add(rifle.position);
          const delta=palms[1].clone().sub(seated);
          const a=reloadPart.parent.worldToLocal(root.localToWorld(new THREE.Vector3()));
          const b=reloadPart.parent.worldToLocal(root.localToWorld(delta));
          reloadPart.position.add(b.sub(a));
        }
      }
      for(let i=0;i<limbs.length;i++){
        const l=limbs[i],palm=palms[i];
        if(treat>.001)palm.lerp(chest.clone().add(new THREE.Vector3(l.sign*.15,-.33,.37+Math.sin(time*3+i)*.025)),treat);
        if(carryWeight>.001)palm.lerp(chest.clone().add(new THREE.Vector3(l.sign*.21,-.42,.34)),carryWeight);
        if(ropeGrip>.001)palm.lerp(chest.clone().add(new THREE.Vector3(l.sign*.055,i?.13:-.06,.30)),ropeGrip);
        const handQ=aimQ.clone().multiply(handAim[i]);
        if(i&&reloadWeight>0){
          const magazineTurn=new THREE.Quaternion().setFromEuler(new THREE.Euler(.22,0,-.48));
          const reloadHand=aimQ.clone().multiply(handAim[i]).multiply(magazineTurn);
          handQ.slerp(reloadHand,reloadWeight);
        }
        if(i&&collapse>0)handQ.slerp(l.handQ,collapse);
        if(l.thumb)l.thumb.bones.forEach((b,k)=>b.quaternion.copy(l.thumb.rest[k]));
        if(l.fingerCurls){
          // Open on departure and insertion, curl while carrying a magazine.
          const release=Math.max(0,1-Math.abs(reloadPhase-.08)/.10);
          const insert=Math.max(0,1-Math.abs(reloadPhase-.85)/.13);
          const carry=reloadPhase>.18&&reloadPhase<.76?1:0;
          const grasp=i&&reloadPhase>0?Math.max(.20,1-.68*Math.max(release,insert)-.20*carry):1;
          for(const f of l.fingerCurls)f.joint.quaternion.copy(f.open).multiply(new THREE.Quaternion().setFromAxisAngle(f.axis,f.angle*grasp));
        }
        const deltaQ=handQ.clone().multiply(l.handQ.clone().invert()),offset=l.palmOffset.clone().applyQuaternion(deltaQ),target=palm.clone().sub(offset);
        const armPole=new THREE.Vector3(l.sign*.43,chest.y-.32,chest.z+.03);armPole.lerp(new THREE.Vector3(0,chest.y-.15,chest.z+.8),collapse);
        solve(l.arm,l.elbow,l.hand,target,armPole,l.upperArm,l.lowerArm);
        orient(l.hand,handQ);
        if(l.thumb&&(!i||reloadWeight<.02)&&treat<.02&&collapse<.02){
          const [a,b,c]=l.thumb.bones;
          const grip=i?grips.left:grips.right;
          const touch=new THREE.Vector3(grip[0]+(i?-.027:-.022),grip[1]+(i?.025:.018),grip[2]+(i?.025:-.012)).applyQuaternion(aimQ).add(rifle.position);
          const pole=new THREE.Vector3(grip[0]+(i?-.075:.060),grip[1]+(i?-.010:.040),grip[2]+(i?.04:-.020)).applyQuaternion(aimQ).add(rifle.position);
          solve(a,b,c,touch,pole,l.thumb.lengthA,l.thumb.lengthB);
        }
        const actual=localPoint(l.hand);if(l.knuckle)actual.lerp(localPoint(l.knuckle),l.palmFactor);gripError=Math.max(gripError,actual.distanceTo(palm));
      }
    }else{
      const head=localPoint(rig.head);
      for(let i=0;i<limbs.length;i++){
        const l=limbs[i],swing=Math.sin(gait+i*Math.PI)*.16*Math.min(motion,1);
        const relaxed=chest.clone().add(new THREE.Vector3(l.sign*.23,-.49,.035+swing));
        const protective=head.clone().add(new THREE.Vector3(l.sign*.135,.08,.025));
        const target=relaxed.lerp(protective,crouch*aliveWeight);
        solve(l.arm,l.elbow,l.hand,target,new THREE.Vector3(l.sign*.44,chest.y-.28,.20),l.upperArm,l.lowerArm);orient(l.hand,l.handQ);
        if(crouch>.5&&l.knuckle)point(l.hand,l.knuckle,head.clone().add(new THREE.Vector3(l.sign*.02,.13,.025)));
      }
    }
    root.updateMatrixWorld(true);
    Object.assign(state,{stance,motion,lowering:drop,headHeight:localPoint(rig.head).y,hipHeight:localPoint(rig.hips).y,aimYaw:yaw,aimPitch:pitch,recoil,hit,dead,reload:reloadPhase,lean,moveDirection:travel.toArray(),gripError:rifle?.visible?gripError:0,footError,gripSpan});
  };
  root.userData.animate(0,0,{});
}

export async function createWorld(renderer) {
  seed = 67041993;
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#b4b4a6');
  scene.fog=new THREE.FogExp2('#b4b4a6',.008);
  const staticGroup=new THREE.Group(),dynamic=new THREE.Group(); scene.add(staticGroup,dynamic);
  const colliders=[],dynamicActors=[],smokeSystems=[],rotors=[],nightLights=[],fireSystems=[],dynamicVehicles=new Set();
  const loader=new THREE.TextureLoader();
  const maxAnisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  async function texture(name, color=true) {
    try {const t=await loader.loadAsync(BASE+name); t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAnisotropy;
      if(color)t.colorSpace=THREE.SRGBColorSpace;textures.add(t);return t;
    } catch {return null;}
  }
  async function pbr(id){ const [map,normalMap,roughnessMap]=await Promise.all([texture(id+'_Diffuse.jpg'),texture(id+'_nor_gl.jpg',false),texture(id+'_rough.jpg',false)]);return{map,normalMap,roughnessMap}; }
  const [wallMaps,roadMaps,dirtMaps,brokenMaps,brickMaps,rubbleMaps,soldierAsset,civilianAsset,combatantAsset,helicopterAsset,facadeAsset,helmetAsset]=await Promise.all([
    pbr('plastered_wall_02'),pbr('aerial_asphalt_01'),pbr('dry_riverbed_rock'),pbr('broken_wall'),pbr('red_brick_03'),pbr('rubble'),
    new GLTFLoader().loadAsync(BASE+'makehuman-soldier.glb'),
    new GLTFLoader().loadAsync(BASE+'makehuman-civilian.glb'),
    new GLTFLoader().loadAsync(BASE+'makehuman-combatant.glb'),
    new GLTFLoader().loadAsync(BASE+'uh60-blackhawk.glb'),
    new GLTFLoader().loadAsync(BASE+'urban-facade.glb'),
    new GLTFLoader().loadAsync(BASE+'pasgt-field-helmet.glb'),
    prepareVehicles(renderer)
  ]);
  const wallColors=['#d2c6aa','#c5c5b5','#d7c9ad','#b6b6a1','#c6b7a4','#c0c0ab'];
  const walls=wallColors.map((color,i)=>material({...((i===0||i===3)?brokenMaps:wallMaps),color,roughness:1,normalScale:new THREE.Vector2(1.15,1.15)}));
  const brick=material({...brickMaps,color:'#ac9b87',roughness:1,normalScale:new THREE.Vector2(.9,.9)});
  const sand=material({...dirtMaps,color:'#b8a085',roughness:1,normalScale:new THREE.Vector2(.55,.55)});
  const road=material({...roadMaps,color:'#9d907d',roughness:1,normalScale:new THREE.Vector2(.38,.38)});
  const concrete=material({map:wornTexture('#8c8370','concrete'),roughness:.98});
  const dark=material({color:'#161d1d',roughness:.8});
  const recess=material({color:'#17201f',roughness:1});
  const rusty=material({map:wornTexture('#655844'),roughness:.88,metalness:.3});
  const trim=material({map:wornTexture('#c0b295','concrete'),roughness:.95});
  const blue=material({map:wornTexture('#426268'),roughness:.88,metalness:.18});
  const green=material({map:wornTexture('#616357'),roughness:.92});
  const wood=material({map:wornTexture('#6c563b','wood'),roughness:.93});
  const rubber=material({color:'#232523',roughness:.95});
  const metal=material({map:wornTexture('#4a4e44'),metalness:.65,roughness:.5});
  const olive=material({map:wornTexture('#555c48'),metalness:.32,roughness:.72});
  const glass=material({color:'#45636c',metalness:.55,roughness:.15});
  const cloth=material({map:wornTexture('#7f8068','cloth'),roughness:1});
  const skin=material({map:wornTexture('#79513b','skin'),roughness:.94});
  const dust=material({color:'#a19378',roughness:1});
  const white=material({map:wornTexture('#c7c4ac','cloth'),roughness:1});
  const glow=material({color:'#e7bd77',emissive:'#e1a454',emissiveIntensity:1.4,roughness:.6});
  const redGlow=material({color:'#d74722',emissive:'#fd5120',emissiveIntensity:2});
  const wovenMap=canvasTexture(512,512,(ctx,w,h)=>{
    ctx.fillStyle='#bab5a7';ctx.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=3){ctx.strokeStyle=y%2?'rgba(37,31,18,.12)':'rgba(255,255,240,.12)';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    for(let x=0;x<w;x+=3){ctx.strokeStyle=x%2?'rgba(20,18,13,.10)':'rgba(250,245,230,.13)';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let i=0;i<85;i++){ctx.strokeStyle=`rgba(35,30,20,${rand(.035,.12)})`;ctx.lineWidth=rand(1,5);const x=rand(0,w),y=rand(0,h);ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+25,y+15,x+45,y-8,x+rand(50,130),y+rand(-20,20));ctx.stroke();}
  });
  const helmetMap=canvasTexture(512,512,(ctx,w,h)=>{ctx.fillStyle='#515845';ctx.fillRect(0,0,w,h);for(let i=0;i<140;i++){ctx.fillStyle=i%2?'rgba(25,32,19,.09)':'rgba(125,128,97,.10)';const x=rand(0,w),y=rand(0,h);ctx.beginPath();ctx.ellipse(x,y,rand(10,36),rand(9,27),rand(0,PI),0,PI*2);ctx.fill();}for(let i=0;i<24000;i++){ctx.fillStyle=i%2?'rgba(19,26,17,.12)':'rgba(160,161,128,.10)';ctx.fillRect(rand(0,w),rand(0,h),1,1);}});
  const helmetMat=material({map:helmetMap,bumpMap:wovenMap,bumpScale:.0007,roughness:.97,side:THREE.DoubleSide});
  const helmetEdge=material({color:'#323b2c',map:wovenMap,roughness:.96});
  const helmetStrap=material({color:'#484d39',map:wovenMap,bumpMap:wovenMap,bumpScale:.0005,roughness:1});
  const grimeMap=canvasTexture(1024,1024,(ctx,w,h)=>{
    const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(34,28,17,0)');g.addColorStop(.52,'rgba(34,28,17,0)');g.addColorStop(1,'rgba(34,28,17,.45)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    for(let i=0;i<180;i++){const x=rand(0,w),y=rand(0,h),r=rand(12,80);const stain=ctx.createRadialGradient(x,y,0,x,y,r);stain.addColorStop(0,`rgba(29,27,17,${rand(.07,.3)})`);stain.addColorStop(1,'rgba(29,27,17,0)');ctx.fillStyle=stain;ctx.fillRect(x-r,y-r,r*2,r*2);}
    for(let i=0;i<80;i++){const x=rand(0,w),y=rand(0,h*.75),height=rand(40,350),width=rand(1,10);const drip=ctx.createLinearGradient(0,y,0,y+height);drip.addColorStop(0,'rgba(30,26,20,.4)');drip.addColorStop(1,'rgba(30,26,20,0)');ctx.fillStyle=drip;ctx.fillRect(x,y,width,height);}
    for(let i=0;i<20;i++){let x=rand(0,w),y=rand(0,h);ctx.strokeStyle='rgba(37,30,22,.56)';ctx.lineWidth=rand(.6,1.8);ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<8;j++){x+=rand(-13,13);y+=rand(7,22);ctx.lineTo(x,y);}ctx.stroke();}
  });
  const grime=material({map:grimeMap,transparent:true,roughness:1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});

  facadeAsset.scene.traverse(object=>{if(!object.isMesh)return;for(const m of Array.isArray(object.material)?object.material:[object.material]){materials.add(m);for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])if(m[key]){m[key].anisotropy=maxAnisotropy;textures.add(m[key]);}}});
  let chapterScene=null,activeLayout=null,ambientAircraftEnabled=false;
  const chapterPalette={walls,brick,sand,road,concrete,dark,rusty,trim,blue,green,wood,metal,cloth,rubber,white,wallMaps,brokenMaps,brickMaps,roadMaps,dirtMaps};

  // Lighting and a sky dome provide a consistent atmospheric scale.
  const hemi=new THREE.HemisphereLight('#c8d8e3','#736452',2.3);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe4be',3.1);sun.position.set(-34,58,26);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);scene.add(sun,sun.target);
  const sunShadows=createSunShadows(sun);
  const pmrem=new THREE.PMREMGenerator(renderer);const environment=pmrem.fromScene(new RoomEnvironment(),.04);scene.environment=environment.texture;scene.environmentIntensity=.38;pmrem.dispose();
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#7795a4')},bottom:{value:new THREE.Color('#d9c9a8')},sunColor:{value:new THREE.Color('#fff0cc')},sunPos:{value:new THREE.Vector3(-.45,.48,.3).normalize()},sunPower:{value:.72}},vertexShader:`varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`varying vec3 vWorld;uniform vec3 top;uniform vec3 bottom;uniform vec3 sunColor;uniform vec3 sunPos;uniform float sunPower;void main(){vec3 d=normalize(vWorld);float h=pow(max(d.y,0.),.55);vec3 c=mix(bottom,top,h);float s=max(dot(d,sunPos),0.);c+=sunColor*(pow(s,260.)*.65+pow(s,12.)*.13)*sunPower;gl_FragColor=vec4(c,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(420,24,16),skyMaterial);sky.frustumCulled=false;scene.add(sky);

  // Density is texture data, not a pale coloured sprite: black smoke cannot grow white fringes.
  const cloudDensity=canvasTexture(256,256,(ctx,w,h)=>{
    const hash=(x,y)=>{const f=Math.sin(x*127.1+y*311.7+83.43)*43758.5453;return f-Math.floor(f);};
    const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),u),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),u),v);};
    const data=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=x/w*2-1,v=y/h*2-1;
      const n=noise(u*3.2+7,v*3.2+11)*.58+noise(u*7.5+8,v*7.5+1)*.27+noise(u*17+3,v*17+5)*.15;
      const warp=noise(u*2.8+13,v*2.8+9)-.5;
      const radius=Math.hypot(u+warp*.17,v+warp*.22);
      const edge=1-THREE.MathUtils.smoothstep(radius,.36+n*.22,.78+n*.20);
      const density=Math.max(0,edge*(.24+n*.83));const i=(y*w+x)*4;
      data.data[i]=data.data[i+1]=data.data[i+2]=Math.round(n*255);data.data[i+3]=Math.round(density*255);
    }
    ctx.putImageData(data,0,0);
  });
  cloudDensity.colorSpace=THREE.NoColorSpace;
  const smokeVertex=`attribute vec3 cloudOffset;attribute vec4 cloudData;varying vec2 vUv;varying float vOpacity;varying float vHeight;varying float vDepth;
    void main(){vUv=uv;vOpacity=cloudData.z;vHeight=cloudOffset.y;float c=cos(cloudData.y),s=sin(cloudData.y);vec2 q=mat2(c,-s,s,c)*position.xy*cloudData.x;
    vec4 center=modelViewMatrix*vec4(cloudOffset,1.);center.xy+=q;vDepth=-center.z;gl_Position=projectionMatrix*center;}`;
  const smokeFragment=`uniform sampler2D densityMap;uniform vec3 darkColor;uniform vec3 lightColor;uniform vec3 fogColor;uniform float fogDensity;uniform float ember;
    varying vec2 vUv;varying float vOpacity;varying float vHeight;varying float vDepth;
    void main(){vec4 d=texture2D(densityMap,vUv);float a=(1.-exp(-d.a*vOpacity*2.4));if(a<.005)discard;
    float light=clamp(d.r*.62+max(vHeight,0.)*.006,0.,1.);vec3 color=mix(darkColor,lightColor,light);
    color+=vec3(.24,.061,.014)*ember*exp(-max(vHeight,0.)*.75)*d.a;
    float haze=1.-exp(-fogDensity*fogDensity*vDepth*vDepth);color=mix(color,fogColor,haze);
    gl_FragColor=vec4(color,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`;
  function cloudBatch(parent,count,type){
    const base=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();
    geometry.index=base.index.clone();for(const [key,value] of Object.entries(base.attributes))geometry.setAttribute(key,value.clone());base.dispose();
    const offset=new THREE.InstancedBufferAttribute(new Float32Array(count*3),3),data=new THREE.InstancedBufferAttribute(new Float32Array(count*4),4);
    offset.setUsage(THREE.DynamicDrawUsage);data.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('cloudOffset',offset);geometry.setAttribute('cloudData',data);geometry.instanceCount=count;
    const material=new THREE.ShaderMaterial({uniforms:{densityMap:{value:cloudDensity},darkColor:{value:new THREE.Color(type==='dust'?'#655344':'#25282a')},lightColor:{value:new THREE.Color(type==='dust'?'#b39d7c':'#696b69')},fogColor:{value:scene.fog.color},fogDensity:{value:scene.fog.density},ember:{value:type==='dust'?0:1}},
      vertexShader:smokeVertex,fragmentShader:smokeFragment,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,forceSinglePass:true});
    const object=new THREE.Mesh(geometry,material);object.frustumCulled=false;object.userData.cloud=true;parent.add(object);
    const particles=Array.from({length:count},(_,i)=>({phase:(i+.1)/count,seed:rand(0,PI*2),spread:rand(.45,1.3),spin:rand(-.45,.45),position:new THREE.Vector3(),world:new THREE.Vector3(),size:0,opacity:0,rotation:0,distance:0}));
    return{object,geometry,material,offset,data,particles,type};
  }
  function addSmoke(parent,x,z,count=16,options={}){
    const system={parent,x,z,height:options.height||38,spread:options.spread||1,intensity:options.intensity??1,persistent:options.persistent||false,dustOnly:options.dustOnly||false,position:new THREE.Vector3(),distance:0,batches:[]};
    if(!system.dustOnly)system.batches.push(cloudBatch(parent,Math.max(40,count*4),'smoke'));
    system.batches.push(cloudBatch(parent,system.dustOnly?44:28,'dust'));smokeSystems.push(system);return system;
  }
  const rotorWash=new THREE.Group();rotorWash.name='rotor-wash';scene.add(rotorWash);
  const rotorDust=addSmoke(rotorWash,0,0,12,{height:5,spread:1.2,dustOnly:true,persistent:true,intensity:0});
  const cloudCameraPosition=new THREE.Vector3();
  function updateClouds(time,camera){
    if(camera)camera.getWorldPosition(cloudCameraPosition);
    for(const system of smokeSystems){
      system.parent.updateMatrixWorld();system.position.set(system.x,system.height*.25,system.z).applyMatrix4(system.parent.matrixWorld);system.distance=system.position.distanceToSquared(cloudCameraPosition);
      for(const batch of system.batches){
        batch.object.visible=system.intensity>.005;batch.material.uniforms.fogDensity.value=scene.fog.density;
        if(batch.mood!==currentMood){const night=currentMood==='night',dust=batch.type==='dust';batch.material.uniforms.darkColor.value.set(night?(dust?'#10141a':'#05070a'):(dust?'#655344':'#25282a'));batch.material.uniforms.lightColor.value.set(night?(dust?'#252d35':'#151a20'):(dust?'#b39d7c':'#696b69'));batch.mood=currentMood;}
        for(const p of batch.particles){
          const dustLayer=batch.type==='dust',age=(p.phase+time*(dustLayer?.09:.036))%1;
          const fade=THREE.MathUtils.smoothstep(age,0,.055)*(1-THREE.MathUtils.smoothstep(age,.67,1));
          if(dustLayer){const radius=(1.5+age*12)*system.spread;p.position.set(system.x+Math.sin(p.seed)*radius+age*6,.12+Math.sin(age*PI)*1.6*p.spread,system.z+Math.cos(p.seed)*radius*.65+age*2);p.size=(2.5+age*8)*system.spread;p.opacity=fade*.15*system.intensity;}
          else {const lift=age*system.height,spread=(.4+age*5)*system.spread;p.position.set(system.x+lift*.25+Math.sin(p.seed+age*6)*spread,1.2+lift,system.z+lift*.08+Math.cos(p.seed+age*4)*spread*.7);p.size=(3.2+Math.pow(age,.68)*11)*system.spread*p.spread;p.opacity=fade*(.51-age*.14)*system.intensity;}
          p.rotation=p.seed+time*p.spin*.08;p.world.copy(p.position).applyMatrix4(system.parent.matrixWorld);p.distance=p.world.distanceToSquared(cloudCameraPosition);
        }
        if(camera)batch.particles.sort((a,b)=>b.distance-a.distance);
        batch.particles.forEach((p,i)=>{batch.offset.setXYZ(i,p.position.x,p.position.y,p.position.z);batch.data.setXYZW(i,p.size,p.rotation,p.opacity,0);});
        batch.offset.needsUpdate=true;batch.data.needsUpdate=true;
      }
    }
    const sorted=[...smokeSystems].sort((a,b)=>b.distance-a.distance);sorted.forEach((s,i)=>s.batches.forEach((batch,j)=>batch.object.renderOrder=10+i*2+j));
  }

  function humvee(options={}){return makeVehicleAsset({burned:false,medical:false,...options});}
  function attachFire(parent,options,persistent=false){const fire=createFire(parent,options);fire.persistent=persistent;fireSystems.push(fire);return fire;}

  // Authored UH-60 by helijah, CC BY 4.0; source and licence ship in ASSET-SOURCES.
  // Source coordinates are already metres (longitudinal X, lateral Y, up Z).
  // Remove the presentation-only Sketchfab root scale rather than enlarging the world.
  const helicopterTemplate=new THREE.Group(),airframeBatches=new Map();
  const aircraftBasis=new THREE.Matrix4().set(0,1,0,-8.123, 0,0,1,0, -1,0,0,8.112, 0,0,0,1);
  let mainBladeGeometry=null,tailBladeGeometry=null;const mainRotorParts=[];
  const aircraftMaterials=new Map();
  const cockpitInterior=material({color:'#242b28',roughness:.92,metalness:.1});
  const rotorMaterial=material({color:'#202723',roughness:.65,metalness:.35,side:THREE.DoubleSide});
  const tailPivot=new THREE.Vector3(.36,3.85,-9.79);
  helicopterAsset.scene.traverse(object=>{
    if(!object.isMesh)return;
    let geometry=object.geometry.clone();geometry.applyMatrix4(aircraftBasis);
    const name=object.material.name||'';
    if(['Object_31','Object_32','Object_33'].includes(object.name)){mainRotorParts.push(geometry);return;}
    if(object.name==='Object_13'){tailBladeGeometry=geometry;return;}
    let mat;
    // Interior panel dial textures are subpixel outside the cockpit; one material keeps
    // the real seats and dashboard geometry without twenty unnecessary draw calls.
    if(/instr|tape|indicator|_ai\.|_alt\.|_asi\.|_hsi\.|_mfd\.|_pfd\.|_panel\.|_pedestal\.|_pitchscale\.|_torque\./.test(name))mat=cockpitInterior;
    else {
      if(!aircraftMaterials.has(name)){
        mat=object.material.clone();mat.roughness=.76;mat.metalness=.22;mat.envMapIntensity=.7;
        if(/texture\.png/.test(name))mat.color.multiply(new THREE.Color('#b6b8ac'));
        if(/transparentExt/.test(name)){mat.color.set('#5a7274');mat.transparent=true;mat.opacity=.42;mat.roughness=.14;mat.metalness=.35;mat.depthWrite=false;}
        else if(/transparent/.test(name)){mat.opacity=Math.min(mat.opacity,.5);mat.depthWrite=false;}
        materials.add(mat);for(const key of ['map','normalMap','roughnessMap','metalnessMap'])if(mat[key]){textures.add(mat[key]);mat[key].anisotropy=maxAnisotropy;}
        aircraftMaterials.set(name,mat);
      }
      mat=aircraftMaterials.get(name);
    }
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
    if(geometry.index)geometry=geometry.toNonIndexed();
    if(!airframeBatches.has(mat))airframeBatches.set(mat,[]);airframeBatches.get(mat).push(geometry);
  });
  mainBladeGeometry=mergeGeometries(mainRotorParts,false);mainRotorParts.forEach(g=>g.dispose());
  for(const [mat,parts]of airframeBatches){const geometry=mergeGeometries(parts,false);if(!geometry)continue;const object=mesh(geometry,mat);object.userData.sharedGeometry=true;helicopterTemplate.add(object);parts.forEach(g=>g.dispose());}
  airframeBatches.clear();
  const rotorBlurMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{opacity:{value:.13}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;uniform float opacity;void main(){vec2 p=vUv*2.-1.;float r=length(p);float edge=smoothstep(.15,.55,r)*(1.-smoothstep(.92,1.,r));float streak=.35+.65*pow(abs(sin(atan(p.y,p.x)*4.)),5.);gl_FragColor=vec4(.09,.11,.10,edge*streak*opacity);}`});
  function helicopter(crashed=false,{managed=true}={}){
    const group=new THREE.Group();group.name=crashed?'UH-60 crash site':'UH-60 Black Hawk';
    group.userData.instanceMaterials=new Set();
    const body=helicopterTemplate.clone(true);group.add(body);
    if(crashed)body.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color?.multiplyScalar(.56);o.material.roughness=.98;materials.add(o.material);group.userData.instanceMaterials.add(o.material);}});
    const rotor=new THREE.Group();rotor.position.set(0,3.68,0);
    if(mainBladeGeometry){const geometry=mainBladeGeometry.clone();geometry.translate(0,-3.68,0);
      if(crashed){const pos=geometry.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),r=Math.hypot(x,z);pos.setY(i,pos.getY(i)-Math.max(0,r-3.2)*.18*(x>0?1:.55));}geometry.computeVertexNormals();}
      rotor.add(mesh(geometry,rotorMaterial));}
    const tailRotor=new THREE.Group();tailRotor.position.copy(tailPivot);
    if(tailBladeGeometry){const geometry=tailBladeGeometry.clone();geometry.translate(-tailPivot.x,-tailPivot.y,-tailPivot.z);tailRotor.add(mesh(geometry,rotorMaterial));}
    group.add(rotor,tailRotor);group.userData.rotor=rotor;group.userData.tailRotor=tailRotor;
    if(!crashed){
      const blur=new THREE.Mesh(new THREE.PlaneGeometry(16.36,16.36),rotorBlurMaterial);blur.rotation.x=-PI/2;blur.position.y=.04;rotor.add(blur);
      const tailBlur=new THREE.Mesh(new THREE.PlaneGeometry(3.35,3.35),rotorBlurMaterial);tailBlur.rotation.y=PI/2;tailRotor.add(tailBlur);
      if(managed)rotors.push(group);
    } else {group.rotation.set(.045,.18,-.23);group.position.y=-.17;rotor.rotation.y=.4;}
    group.userData.dimensions={length:15.28,width:2.96,height:5.25,rotorDiameter:16.36};
    group.userData.collisionBoxes=[{minX:-1.7,maxX:1.7,minZ:-3.2,maxZ:4.7},{minX:-.55,maxX:.55,minZ:-10.7,maxZ:-3.2}];
    return group;
  }
  const flying=helicopter(false);flying.position.set(-12,16,42);scene.add(flying);
  const wingman=helicopter(false);wingman.position.set(-37,29,8);scene.add(wingman);
  let aircraftPreview=null;
  function setAircraftPreview(position=null,rotation=[0,0,0]){aircraftPreview=position?{position,rotation}:null;}
  function getAircraftState(){return{position:flying.position.toArray(),rotorDiameter:16.36,visible:flying.visible,altitude:flying.position.y};}


  function proceduralPerson(kind){
    const g=new THREE.Group(),isCivilian=kind==='civilian',outfit=isCivilian?white:cloth;
    const torso=mesh(new THREE.SphereGeometry(1,12,10),outfit,[0,1.2,0],[.25,.34,.15]);g.add(torso);
    const head=mesh(new THREE.SphereGeometry(.13,12,10),skin,[0,1.67,0],[.86,1.18,1]);g.add(head);
    // Face planes and clothing seams retain legibility at conversation distance.
    const hair=mesh(new THREE.SphereGeometry(.132,14,9,0,PI*2,0,PI*.48),dark,[0,1.704,-.008],[.87,.95,.95]);g.add(hair);
    for(const side of [-1,1]){
      g.add(mesh(new THREE.SphereGeometry(.023,8,6),skin,[side*.111,1.67,-.003],[.6,1.7,.8]));
      g.add(mesh(new THREE.SphereGeometry(.014,8,6),dark,[side*.047,1.698,.114],[1,.45,.5]));
      g.add(box(.037,.007,.009,dark,side*.047,1.72,.111));
    }
    g.add(mesh(new THREE.SphereGeometry(.022,8,6),skin,[0,1.663,.13],[.65,1.2,1.0]));
    g.add(box(.043,.006,.009,dark,0,1.621,.118));
    g.add(cylinder(.07,.08,.1,skin,0,1.5,0,8));
    if(!isCivilian){g.add(mesh(new THREE.SphereGeometry(.155,14,8,0,PI*2,0,PI*.6),olive,[0,1.72,0]));g.add(box(.42,.42,.12,olive,0,1.22,.13));}
    for(const side of [-1,1]){
      g.add(connect([side*.13,.99,0],[side*.14,.54,.035],.083,outfit,10),connect([side*.14,.54,.035],[side*.14,.12,0],.068,outfit,10));
      g.add(mesh(new THREE.SphereGeometry(.1,10,8),rubber,[side*.14,.09,.07],[.85,.65,1.5]));
      g.add(connect([side*.25,1.4,0],[side*.34,1.1,.12],.07,outfit,10),connect([side*.34,1.1,.12],[side*.24,.96,.25],.055,outfit,10));
      g.add(mesh(new THREE.SphereGeometry(.06,8,6),skin,[side*.24,.95,.26],[.8,1.2,1]));
      if(isCivilian){g.add(box(.09,.11,.012,cloth,side*.12,1.31,.141));g.add(connect([side*.13,.92,.075],[side*.14,.2,.06],.007,cloth));}
    }
    if(isCivilian){g.add(box(.018,.49,.015,cloth,0,1.2,.154));for(let k=0;k<5;k++)g.add(mesh(new THREE.SphereGeometry(.008,6,4),wood,[0,1.38-k*.08,.168]));}
    if(!isCivilian)g.add(box(.07,.12,.66,dark,.13,1.0,.32));
    return g;
  }
  const rifleTemplates=new Map();
  function carriedRifle(id=PLAYER_WEAPON_IDS[0]){
    if(!rifleTemplates.has(id)){
      const rifleTemplate=createRifle(id);
      rifleTemplate.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;part.renderOrder=0;part.userData.sharedGeometry=true;}});
      rifleTemplates.set(id,rifleTemplate);
    }
    return rifleTemplates.get(id).clone(true);
  }
  function fittedHelmet(){
    const helmet=helmetAsset.scene.clone(true);helmet.name='PASGT shaped field helmet';
    helmet.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;part.frustumCulled=false;part.userData.sharedGeometry=true;part.userData.sharedMaterial=true;}});
    return helmet;
  }
  function createActor(kind,position,name=''){
    const root=new THREE.Group();root.name=name||kind;root.position.set(position[0],0,position[1]);
    root.userData.instanceMaterials=new Set();
    let model,civilianMixer,civilianActions,actorBones,actorRifle;
    const humanAsset=kind==='civilian'?civilianAsset:kind==='enemy'?combatantAsset:soldierAsset;
    if(humanAsset){
      model=cloneSkeleton(humanAsset.scene);
      if(kind==='soldier'||kind==='wounded'){
        // The soldier's generated scalp is under the close-fitting helmet;
        // remove the uncovered civilian hair cards instead of letting them
        // intersect the front rim.
        const hair=[];model.traverse(o=>{if(o.isMesh&&/short01/i.test(o.material?.name||''))hair.push(o);});hair.forEach(o=>o.removeFromParent());
      }
      model.traverse(o=>{if(o.isMesh){const m=o.material.clone();materials.add(m);root.userData.instanceMaterials.add(m);o.material=m;
        tuneCharacterMaterial(m,kind);
      }});
      if(kind==='civilian'&&humanAsset.animations.length){
        civilianMixer=new THREE.AnimationMixer(model);civilianActions={};
        for(const clip of humanAsset.animations)civilianActions[clip.name]=civilianMixer.clipAction(clip);
        civilianActions.Idle_Standing?.play();civilianMixer.update(0);root.userData.mixer=civilianMixer;root.userData.nativeLocomotion=!!civilianActions.Walk_Brisk;
      }
      const bones={};model.traverse(o=>{if(o.isBone)bones[o.name.replace(/:/g,'').replace(/_\d+$/,'')]=o;});
      actorBones=bones;
      model.updateMatrixWorld(true);
      function pointLimb(bone,child,direction){
        if(!bone||!child)return;
        const from=bone.getWorldPosition(new THREE.Vector3()),to=child.getWorldPosition(new THREE.Vector3());
        const q=new THREE.Quaternion().setFromUnitVectors(to.sub(from).normalize(),new THREE.Vector3(...direction).normalize());
        const worldQ=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(q),parentQ=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        bone.quaternion.copy(parentQ.multiply(worldQ));model.updateMatrixWorld(true);
      }
      // The regenerated MPFB rigs share one articulated stance and locomotion solver.
      for(const side of ['Left','Right']){
        const sign=side==='Left'?1:-1;
        pointLimb(bones['mixamorig'+side+'Arm'],bones['mixamorig'+side+'ForeArm'],kind==='civilian'||kind==='wounded'?[sign*.16,-1,.06]:[sign*.12,-1,.25]);
        pointLimb(bones['mixamorig'+side+'ForeArm'],bones['mixamorig'+side+'Hand'],kind==='civilian'||kind==='wounded'?[sign*.035,-1,.14]:[-sign*.3,.1,1]);
      }
      model.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(model);const height=bounds.max.y-bounds.min.y,factor=1.78/height;
      const bodyAnchor=bones.mixamorigHips?.getWorldPosition(new THREE.Vector3())||bounds.getCenter(new THREE.Vector3());
      // Preserve the glTF's centimetre-to-metre root scale when normalising height.
      model.scale.multiplyScalar(factor);model.position.y=-bounds.min.y*factor;
      // Anchor the pelvis, not the posed arm bounds, so helmet and body share
      // an origin even when the forearms extend forward into a rifle hold.
      model.position.x-=bodyAnchor.x*factor;model.position.z-=bodyAnchor.z*factor;
      model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;o.userData.sharedGeometry=!o.userData.actorGeometry;}});
      root.userData.animate=()=>{};
      if(civilianMixer){
        let moving=false;
        root.userData.animate=(speed,dt)=>{
          const next=Math.abs(speed)>.08;
          if(next!==moving){const fadeIn=next?civilianActions.Walk_Brisk:civilianActions.Idle_Standing,fadeOut=next?civilianActions.Idle_Standing:civilianActions.Walk_Brisk;fadeIn?.reset().fadeIn(.22).play();fadeOut?.fadeOut(.22);moving=next;}
          if(civilianActions.Walk_Brisk)civilianActions.Walk_Brisk.timeScale=Math.max(.5,Math.min(1.7,Math.abs(speed)/1.7));
          civilianMixer.update(dt);
        };
      }
    }else model=proceduralPerson(kind);
    root.add(model);
    if(kind==='soldier'||kind==='enemy'){
      const weaponId=kind==='enemy'?'ak':name==='掩护队员'?'m249':PLAYER_WEAPON_IDS[0];
      const rifle=carriedRifle(weaponId);root.userData.weaponId=weaponId;actorRifle=rifle;rifle.scale.setScalar(1);root.add(rifle);
    }
    if(kind==='soldier'||kind==='wounded'){
      const helmet=fittedHelmet();
      if(kind!=='wounded'){root.add(helmet);root.updateMatrixWorld(true);actorBones?.mixamorigHead?.attach(helmet);}
    }
    if(kind==='wounded'){
      model.rotation.x=-PI/2;model.position.set(0,.31,.89);
      root.add(box(.9,.045,2.0,cloth,0,.12,0));
    }
    if(kind!=='wounded'&&humanAsset)installActorPoses(root,model,actorBones,actorRifle,kind,root.userData.animate);
    root.userData.kind=kind;root.userData.model=model;dynamic.add(root);dynamicActors.push(root);return root;
  }
  function createProp(kind,position,options={}){
    let g;
    if(kind==='vehicle')g=humvee(options);
    else if(kind==='wreck'){
      g=new THREE.Group();g.add(helicopter(true));
      const scorch=mesh(new THREE.CircleGeometry(8.2,48),new THREE.MeshBasicMaterial({color:'#1a1b17',transparent:true,opacity:.65,depthWrite:false}),[0,.018,-1]);scorch.rotation.x=-PI/2;scorch.scale.set(.85,1.2,1);g.add(scorch);g.userData.instanceMaterials=new Set([scorch.material]);
      const fragments=[];for(let i=0;i<30;i++){const debris=box(rand(.1,.85),rand(.04,.2),rand(.2,1.6),metal,rand(-4.5,4.5),rand(.06,.2),rand(-10,5));debris.rotation.set(rand(-.3,.3),rand(0,PI),rand(-.2,.2));debris.updateMatrix();const geo=debris.geometry.clone().applyMatrix4(debris.matrix);fragments.push(geo);debris.geometry.dispose();}
      const debrisGeometry=mergeGeometries(fragments);g.add(mesh(debrisGeometry,metal));fragments.forEach(p=>p.dispose());
      attachFire(g,{position:[-.45,.35,-1.4],scale:2.2,intensity:1.2});
      attachFire(g,{position:[.7,.25,-3.3],scale:.9,intensity:.75});
      addSmoke(g,-.2,-1.4,24,{height:42,spread:.95});
      g.userData.collisionBoxes=[{minX:-2.2,maxX:2.2,minZ:-4,maxZ:5},{minX:-1.2,maxX:1.1,minZ:-10.8,maxZ:-4}];
      g.userData.interactionAnchor=new THREE.Vector3(0,1.2,2.8);
    } else if(kind==='radio'){
      g=new THREE.Group();g.add(box(.55,.13,.38,wood,0,.9,0),box(.34,.25,.2,olive,0,1.1,0),box(.26,.09,.015,dark,0,1.15,.107));
      for(const x of [-.22,.22])for(const z of [-.14,.14])g.add(box(.05,.9,.05,wood,x,.45,z));
      g.add(connect([.12,1.22,0],[.12,1.92,0],.007,metal));g.add(box(.04,.025,.015,glow,.1,1.15,.12));
    } else if(kind==='supplies'){
      g=new THREE.Group();g.add(box(.8,.5,.55,wood,0,.25,0),box(.64,.38,.45,olive,.08,.68,0));
      for(const x of [-.23,.23])g.add(box(.05,.4,.47,metal,x,.68,0));
      g.add(box(.25,.35,.16,cloth,-.4,.18,.38));
    } else if(kind==='memorial'){
      g=new THREE.Group();g.add(box(1.15,.1,2.1,cloth,0,.36,0));
      for(const x of [-.48,.48])for(const z of [-.8,.8])g.add(box(.05,.38,.05,metal,x,.19,z));
      g.add(mesh(new THREE.SphereGeometry(.15,14,10,0,PI*2,0,PI*.55),olive,[0,.58,-.6]));
      g.add(box(.18,.018,.25,white,.3,.43,.5));
    }else{
      g=new THREE.Group();g.add(cylinder(.04,.07,2.5,metal,0,1.25,0),box(.65,.3,.17,metal,0,2.5,0),box(.5,.2,.03,glow,0,2.5,.1));
      const l=new THREE.PointLight('#ffd7a4',12,18,2);l.position.set(0,2.4,.3);g.add(l);
    }
    g.position.x=position[0];g.position.z=position[1];g.position.y=sampleHeight(position[0],position[1]);g.userData.kind=kind;
    if(kind==='vehicle'&&!g.userData.collisionBoxes)g.userData.collisionBoxes=[{minX:-1.18,maxX:1.18,minZ:-2.45,maxZ:2.45}];
    if(g.userData.collisionBoxes)g.userData.collisionBounds=g.userData.collisionBoxes.map(b=>({minX:b.minX+position[0],maxX:b.maxX+position[0],minZ:b.minZ+position[1],maxZ:b.maxZ+position[1],material:kind==='vehicle'||kind==='wreck'?'metal':'masonry'}));
    dynamic.add(g);if(kind==='vehicle')dynamicVehicles.add(g);return g;
  }
  function createVehicle(position,rotation=0,burned=false){
    const vehicle=makeVehicleAsset({burned,medical:false});
    vehicle.position.set(position[0],position.length>2?position[1]:sampleHeight(position[0],position[1]),position.length>2?position[2]:position[1]);
    vehicle.rotation.y=typeof rotation==='number'?rotation:rotation[1]||0;
    vehicle.userData.kind='vehicle';dynamic.add(vehicle);dynamicVehicles.add(vehicle);return vehicle;
  }
  let currentMood='day';
  function setMood(mood){
    currentMood=mood;
    const settings={
      day:{fog:'#c4b69b',top:'#6d9cae',bottom:'#d4c4a3',hemi:.78,sun:4.0,sunColor:'#fff0ce',position:[-36,54,32],density:.0048,exposure:1.06},
      dusk:{fog:'#b6a58b',top:'#718c98',bottom:'#cbb28e',hemi:.72,sun:3.6,sunColor:'#ffdda9',position:[-65,21,-35],density:.0063,exposure:1.02},
      night:{fog:'#070d12',top:'#010306',bottom:'#06101a',hemi:.12,sun:.16,sunColor:'#8ba5c2',position:[-34,57,26],density:.016,exposure:.82},
      dawn:{fog:'#c3b8a1',top:'#7da1b2',bottom:'#d4c2a3',hemi:.9,sun:3.2,sunColor:'#ffe3b6',position:[48,20,-65],density:.006,exposure:1.04}
    }[mood]||null;
    if(!settings)return;
    scene.fog.color.set(settings.fog);scene.fog.density=settings.density;scene.background.set(settings.fog);
    hemi.intensity=settings.hemi;hemi.color.set(mood==='night'?'#99b3cf':'#c8d8df');hemi.groundColor.set(mood==='night'?'#252c30':'#786d57');
    sun.intensity=settings.sun;sun.color.set(settings.sunColor);sun.position.set(...settings.position);sunShadows.setDirection(settings.position);
    skyMaterial.uniforms.top.value.set(settings.top);skyMaterial.uniforms.bottom.value.set(settings.bottom);skyMaterial.uniforms.sunColor.value.set(settings.sunColor);skyMaterial.uniforms.sunPos.value.copy(sun.position).normalize();skyMaterial.uniforms.sunPower.value=mood==='night'?.006:.8;
    scene.environmentIntensity=mood==='night'?.025:.2;renderer.toneMappingExposure=settings.exposure;
    for(let i=0;i<nightLights.length;i++)nightLights[i].intensity=nightLights[i].userData.interior?(nightLights[i].userData.fixtureIntensity??23)*(mood==='night'?1:.52):mood==='night'?(i%2===0?18:10):mood==='dusk'?8:0;
    flying.visible=ambientAircraftEnabled&&(mood==='day'||mood==='dusk'||mood==='dawn');wingman.visible=flying.visible;
  }
  setMood('day');
  function setAmbientAircraftEnabled(enabled){
    const previous=ambientAircraftEnabled;ambientAircraftEnabled=!!enabled;
    flying.visible=ambientAircraftEnabled&&currentMood!=='night';wingman.visible=flying.visible&&!aircraftPreview;
    rotorWash.visible=ambientAircraftEnabled;rotorDust.intensity=0;return previous;
  }
  function belongsTo(object,root){for(let p=object;p;p=p.parent)if(p===root)return true;return false;}
  function removeSmokeAt(index){const system=smokeSystems[index];for(const batch of system.batches){batch.object.removeFromParent();batch.material.dispose();batch.geometry.dispose();}smokeSystems.splice(index,1);}
  function destroyActor(actor){
    if(!actor||actor.userData.disposed)return;
    dynamicVehicles.delete(actor);
    actor.userData.disposed=true;
    for(let i=fireSystems.length-1;i>=0;i--)if(belongsTo(fireSystems[i].root,actor)){fireSystems[i].dispose();fireSystems.splice(i,1);}
    for(let i=smokeSystems.length-1;i>=0;i--)if(belongsTo(smokeSystems[i].parent,actor))removeSmokeAt(i);
    for(let i=rotors.length-1;i>=0;i--)if(belongsTo(rotors[i],actor))rotors.splice(i,1);
    actor.userData.mixer?.stopAllAction();actor.userData.mixer?.uncacheRoot(actor.userData.model);
    const skeletons=new Set(),geometries=new Set(),ownedMaterials=new Set();
    actor.traverse(object=>{
      if(object.skeleton)skeletons.add(object.skeleton);
      if(object.isMesh&&!object.userData.sharedGeometry&&object.geometry)geometries.add(object.geometry);
      for(const owned of object.userData.instanceMaterials||[])ownedMaterials.add(owned);
      object.userData.instanceMaterials?.clear();
    });
    for(const skeleton of skeletons)skeleton.dispose();
    for(const geometry of geometries)geometry.dispose();
    for(const owned of ownedMaterials){owned.dispose();materials.delete(owned);}
    const index=dynamicActors.indexOf(actor);if(index!==-1)dynamicActors.splice(index,1);
    actor.removeFromParent();actor.clear();
  }
  function clearDynamic(){
    for(let i=fireSystems.length-1;i>=0;i--)if(!fireSystems[i].persistent){fireSystems[i].dispose();fireSystems.splice(i,1);}
    for(const actor of [...dynamicActors])destroyActor(actor);
    for(let i=smokeSystems.length-1;i>=0;i--)if(!smokeSystems[i].persistent)removeSmokeAt(i);
    for(const object of [...dynamic.children])destroyActor(object);dynamic.clear();
  }
  function loadChapterScene(id){
    const layout=getChapterLayout(id);clearDynamic();setAmbientAircraftEnabled(false);aircraftPreview=null;
    chapterScene?.dispose();chapterScene=null;
    // Persistent describes lifetime within one chapter, never across chapters.
    for(let i=fireSystems.length-1;i>=0;i--){fireSystems[i].dispose();fireSystems.splice(i,1);}
    for(let i=smokeSystems.length-1;i>=0;i--)if(smokeSystems[i]!==rotorDust)removeSmokeAt(i);
    staticGroup.clear();colliders.splice(0,colliders.length);activeLayout=layout;
    chapterScene=buildChapterScene(layout,{group:staticGroup,colliders,palette:chapterPalette,rubbleMaps,facadeAsset,
      makeVehicle:makeVehicleAsset,makeAircraft:helicopter,addFire:(parent,options)=>attachFire(parent,options,true),addSmoke,nightLights,destroyObject:destroyActor});
    setAmbientAircraftEnabled(layout.ambientAircraft);setMood(currentMood);return getSceneState();
  }
  function sampleHeight(x,z){const y=chapterScene?.surface?.sampleHeight(x,z);return Number.isFinite(y)?y:0;}
  function getVehicleSources(){return [...dynamicVehicles,...(chapterScene?.objects||[])].filter(object=>{
    if(!object.userData.vehicleType||object.userData.burned||object.userData.vehicleType==='burned-sedan')return false;
    for(let p=object;p;p=p.parent)if(!p.visible)return false;return true;
  });}
  function getSceneState(){return chapterScene?structuredClone(chapterScene.state):null;}
  function getCinematicOcclusions(){return(chapterScene?.objects||[]).filter(o=>o.userData.chapterPropKind);}
  function setCinematicPropsVisible(visible,kinds=['wreck']){const changed=[];for(const object of getCinematicOcclusions())if(kinds.includes(object.userData.chapterPropKind)){changed.push({object,visible:object.visible});object.visible=!!visible;}return changed;}
  function update(dt,time,camera=null){
    sunShadows.update(camera);
    for(const h of rotors){h.userData.rotor.rotation.y+=dt*27;h.userData.tailRotor.rotation.x+=dt*81;}
    const t=time*.105;
    if(aircraftPreview){flying.position.set(...aircraftPreview.position);flying.rotation.set(...aircraftPreview.rotation);wingman.visible=false;}
    else {flying.position.set(Math.sin(t)*39,17+Math.cos(t)*2.5,Math.cos(t)*87);flying.rotation.set(.035,Math.atan2(Math.cos(t)*39,-Math.sin(t)*87),-.08*Math.sin(t));
      const w=t-.34;wingman.position.set(Math.sin(w)*59,28+Math.cos(w)*3,Math.cos(w)*104-14);wingman.rotation.set(.025,Math.atan2(Math.cos(w)*59,-Math.sin(w)*104),-.05*Math.sin(w));}
    if(!ambientAircraftEnabled){flying.visible=false;wingman.visible=false;}
    rotorWash.visible=ambientAircraftEnabled;rotorWash.position.set(flying.position.x,0,flying.position.z);rotorDust.intensity=flying.visible?Math.max(0,(23-flying.position.y)/9)*.9:0;
    updateClouds(time,camera);
    for(const fire of fireSystems)fire.update(dt,time,camera);
  }
  function dispose(){clearDynamic();chapterScene?.dispose();chapterScene=null;for(const fire of fireSystems)fire.dispose();fireSystems.length=0;disposeVehicles();for(const system of smokeSystems)for(const batch of system.batches){batch.material.dispose();batch.geometry.dispose();}smokeSystems.length=0;scene.traverse(o=>{if(o.isInstancedMesh&&!o.userData.instanceBuffersDisposed){o.dispose();o.userData.instanceBuffersDisposed=true;}o.geometry?.dispose();});helicopterTemplate.traverse(o=>o.geometry?.dispose());mainBladeGeometry?.dispose();tailBladeGeometry?.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();materials.clear();textures.clear();environment.dispose();skyMaterial.dispose();rotorBlurMaterial.dispose();}
  loadChapterScene(1);
  return{scene,colliders,update,sampleHeight,getVehicleSources,updateShadows:camera=>sunShadows.update(camera),getLightingState:()=>sunShadows.inspect(),setMood,createActor,destroyActor,createProp,createVehicle,clearDynamic,dispose,loadChapterScene,getSceneState,setAmbientAircraftEnabled,getCinematicOcclusions,setCinematicPropsVisible,aircraft:flying,getUrbanState:getSceneState,getResourceState:()=>({materials:materials.size,actors:dynamicActors.length,fires:fireSystems.length,smokeSystems:smokeSystems.length,staticObjects:staticGroup.children.length,chapter:activeLayout?.id}),getFireSources:()=>fireSystems.map(system=>system.root.getWorldPosition(new THREE.Vector3()).toArray()),getAircraftState,setAircraftPreview,createAircraft:helicopter};
}
