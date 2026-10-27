import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createMountedGunnerPose,prepareMountedHands} from '../src/mounted-gunner-pose.js';
import {buildMilitaryVehicle,bindVehicleMotion} from '../src/vehicle-models.js';

// Keep the shipped geometry, hierarchy, skin weights and inverse bind matrices.
// Image decoding is unnecessary for a CPU-only bone/triangle audit.
const bytes=await fs.readFile('public/assets/makehuman-soldier.glb'),jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength));
gltf.materials=(gltf.materials||[]).map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:[.7,.7,.7,1]}}));
delete gltf.images;delete gltf.textures;delete gltf.samplers;
gltf.extensionsUsed=(gltf.extensionsUsed||[]).filter(e=>!e.includes('texture')&&!e.includes('materials'));
gltf.extensionsRequired=(gltf.extensionsRequired||[]).filter(e=>!e.includes('texture')&&!e.includes('materials'));
const encoded=Buffer.from(JSON.stringify(gltf)),json=Buffer.alloc(Math.ceil(encoded.length/4)*4,32);encoded.copy(json);
const binary=bytes.subarray(20+jsonLength),head=Buffer.alloc(20);head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(head.length+json.length+binary.length,8);head.writeUInt32LE(json.length,12);head.writeUInt32LE(0x4e4f534a,16);
const packed=Buffer.concat([head,json,binary]);
const asset=await new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.length),'');
const worldSource=await fs.readFile('src/world.js','utf8'),functionSource=worldSource.slice(worldSource.indexOf('function installActorPoses('),worldSource.indexOf('export async function createWorld'));
const installActorPoses=new Function('THREE',functionSource+'\nreturn installActorPoses;')(THREE);
const scene=new THREE.Group(),dynamic=new THREE.Group();scene.add(dynamic);let actor,destroyed=0;
const sourceGeometry=new Map();asset.scene.traverse(o=>{if(o.isMesh)sourceGeometry.set(o.geometry,o.geometry.index?.array.slice());});
const world={createActor(){
  const root=new THREE.Group(),model=clone(asset.scene),bones={};
  const hair=[];model.traverse(o=>{if(o.isMesh&&/short01/i.test(o.material?.name||''))hair.push(o);if(o.isBone)bones[o.name.replace(/:/g,'').replace(/_\d+$/,'')]=o;});hair.forEach(o=>o.removeFromParent());
  model.updateMatrixWorld(true);
  const point=(b,c,d)=>{const from=b.getWorldPosition(new THREE.Vector3()),delta=c.getWorldPosition(new THREE.Vector3()).sub(from).normalize(),q=new THREE.Quaternion().setFromUnitVectors(delta,new THREE.Vector3(...d).normalize());const w=b.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(w));model.updateMatrixWorld(true);};
  for(const side of ['Left','Right']){const sign=side==='Left'?1:-1;point(bones['mixamorig'+side+'Arm'],bones['mixamorig'+side+'ForeArm'],[sign*.12,-1,.25]);point(bones['mixamorig'+side+'ForeArm'],bones['mixamorig'+side+'Hand'],[-sign*.3,.1,1]);}
  const bounds=new THREE.Box3().setFromObject(model),factor=1.78/(bounds.max.y-bounds.min.y),anchor=bones.mixamorigHips.getWorldPosition(new THREE.Vector3());
  model.scale.multiplyScalar(factor);model.position.y=-bounds.min.y*factor;model.position.x-=anchor.x*factor;model.position.z-=anchor.z*factor;
  root.add(model);model.traverse(o=>{if(o.isMesh)o.userData.sharedGeometry=true;});
  const rifle=new THREE.Group();rifle.userData.grips={right:[0,-.055,.005],left:[0,-.025,-.33]};root.add(rifle);
  root.userData.model=model;root.userData.animate=()=>{};dynamic.add(root);installActorPoses(root,model,bones,rifle,'soldier',root.userData.animate);
  actor=root;return root;
},destroyActor(a){destroyed++;a.userData.disposed=true;a.traverse(o=>{if(o.isMesh&&!o.userData.sharedGeometry)o.geometry.dispose();});a.removeFromParent();}};
const resources={geometries:new Set(),materials:new Set(),textures:new Set()};
const palette=Object.fromEntries(['olive','sand','burned','edge','steel','rubber','fastener','seat','canvas','sandCanvas','glass','lens','red','dust','skin','uniform'].map(name=>[name,new THREE.MeshStandardMaterial({name})]));
const vehicleTemplate=buildMilitaryVehicle('humvee','olive',resources,palette);
const vehicle=bindVehicleMotion(vehicleTemplate.clone(true));scene.add(vehicle);
const {yaw,pitch,crew}=vehicle.userData.turret,cover=vehicle.getObjectByName('MountedFeedCover'),charging=vehicle.getObjectByName('MountedChargingHandle');
yaw.rotation.y=1.6;vehicle.rotation.y=.47;scene.updateMatrixWorld(true); // Mount an already-aimed AI turret.
const handBytes=await fs.readFile('public/assets/mounted-makehuman-hands.glb');
await prepareMountedHands(handBytes.buffer.slice(handBytes.byteOffset,handBytes.byteOffset+handBytes.length));
const pose=createMountedGunnerPose({world,vehicle}),report={passed:false,method:'CPU actual shipped MakeHuman geometry/rig, production installActorPoses and production military vehicle meshes. Contact audited against rendered component triangles; no renderer or image approval.',samples:[]};
function meshDistance(component,point){
  let distance=Infinity;const triangle=new THREE.Triangle(),closest=new THREE.Vector3(),v=new THREE.Vector3(...point);
  component.traverseVisible(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,index=mesh.geometry.index,n=index?.count||p.count;
    for(let i=0;i<n;i+=3){for(const [j,key]of [[0,'a'],[1,'b'],[2,'c']])triangle[key].fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);
      triangle.closestPointToPoint(v,closest);distance=Math.min(distance,closest.distanceTo(v));}
  });return distance;
}
const untouched=new Map();actor.traverse(o=>{if(o.isBone&&!/Arm|Hand/.test(o.name))untouched.set(o,o.quaternion.clone());});
const handVertices={Left:[],Right:[]};
actor.traverseVisible(mesh=>{
  if(!mesh.isSkinnedMesh)return;const g=mesh.geometry,j=g.attributes.skinIndex,w=g.attributes.skinWeight;
  const visible=new Set(g.index?g.index.array:Array.from({length:g.attributes.position.count},(_,i)=>i));
  for(const side of ['Left','Right']){const ids=new Set(mesh.skeleton.bones.flatMap((b,i)=>b.name.includes(side+'Hand')?[i]:[]));
    for(const index of visible){let weight=0;for(let k=0;k<4;k++)if(ids.has(j.getComponent(index,k)))weight+=w.getComponent(index,k);if(weight>.5)handVertices[side].push({mesh,index});}
  }
});
const solidParts=['MountedReceiver','MountedAmmoBox'].map(name=>{
  const component=vehicle.getObjectByName(name),box=new THREE.Box3();component.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();box.union(o.geometry.boundingBox);}});
  return {name,component,box:box.expandByScalar(-.003)}; // Permit surface contact, reject hand vertices inside the actual solid.
});
try{
  report.visibleArmTriangles=0;
  actor.traverseVisible(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const g=mesh.geometry,j=g.attributes.skinIndex,w=g.attributes.skinWeight,armIds=new Set(mesh.skeleton.bones.flatMap((b,i)=>/(Left|Right)(Arm|ForeArm|Hand)/.test(b.name)?[i]:[]));
    const n=g.index?.count||g.attributes.position.count;
    for(let i=0;i<n;i+=3){let weight=0;for(let corner=0;corner<3;corner++){const v=g.index?g.index.getX(i+corner):i+corner;for(let k=0;k<4;k++)if(armIds.has(j.getComponent(v,k)))weight+=w.getComponent(v,k);}
      if(i<(g.userData.mountedSleeveCapStart??n))assert.ok(weight/3>=.40,'Visible original first-person triangles must belong to the existing arms, not the torso/backpack');
      else assert.ok(weight/3>.1,'A closing shoulder cap must remain influenced by the existing arm bones');report.visibleArmTriangles++;
    }
  });
  assert.ok(report.visibleArmTriangles>1000,'The shipped hands and sleeves remain visible');
  for(const vehicleYaw of [0,.47,-1.7])for(const turretYaw of [-2.3,0,2.1])for(const elevation of [-.30,0,.4,.65])for(const reloadProgress of [0,.0725,.12,.20,.22,.28,.38,.50,.64,.67,.75,.81,.87,.90,.96,1]){
    vehicle.position.set(18,.12,-32);vehicle.rotation.y=vehicleYaw;yaw.rotation.y=turretYaw;pitch.rotation.x=-elevation;
    cover.rotation.x=reloadProgress>0?Math.min(1,Math.max(0,(reloadProgress-.1)/.12))*Math.min(1,Math.max(0,(.83-reloadProgress)/.13))*1.22:0;
    charging.position.z=-.01-(reloadProgress>.82?Math.sin((reloadProgress-.82)/.18*Math.PI)*.13:0);
    pose.update(.016,reloadProgress);
    const s=pose.inspect(),visible=[];actor.traverseVisible(o=>{if(o.isMesh)visible.push(o);});
    report.lastAttempt={vehicleYaw,turretYaw,elevation,...s};
    for(const limb of s.limbs){
      if(limb.role==='reach'){
        assert.ok(limb.grasp<1,'Travelling fingers release the previous object');
        limb.solidPenetratingVertices=[];
        for(const solid of solidParts)for(const {mesh,index}of handVertices[limb.side]){
          const p=mesh.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,index));mesh.localToWorld(p);solid.component.worldToLocal(p);
          if(solid.box.containsPoint(p))limb.solidPenetratingVertices.push({part:solid.name,index});
        }
        assert.equal(limb.solidPenetratingVertices.length,0,`${limb.side} travelling hand skin penetrates receiver/ammo box`);continue;
      }
      const component=vehicle.getObjectByName(limb.component);assert.ok(component?.children.some(c=>c.isMesh),'Contact component has production geometry');
      limb.meshContactDistance=meshDistance(component,limb.palm);
      limb.fingerMeshDistances=limb.fingerErrors.map(f=>({name:f.name,distance:meshDistance(component,f.tip)}));
      assert.ok(limb.meshContactDistance<.009,`${limb.side} ${limb.role} palm separated from rendered part by ${limb.meshContactDistance}`);
      assert.ok(limb.fingerMeshDistances.every(f=>f.distance<.012),`${limb.side} ${limb.role} fingers must wrap the rendered part`);
    }
    const direction=new THREE.Vector3(0,0,1).applyQuaternion(pitch.getWorldQuaternion(new THREE.Quaternion()));
    const viewHits=new THREE.Raycaster(new THREE.Vector3(...s.camera),direction,.025,1.2).intersectObjects(visible,false);
    report.samples.push({vehicleYaw,turretYaw,elevation,...s,viewBlocked:viewHits.map(hit=>({distance:hit.distance,name:hit.object.name}))});
    assert.ok(s.gripError<.006,`Grip contact ${s.gripError}`);
    assert.ok(s.removedTriangles>0,'First-person head triangles removed');assert.equal(crew.visible,false);
    assert.ok(s.limbs.every(l=>l.error<.006&&l.reachError<.006),'Both arms reachable');
    for(const [b,q]of untouched)assert.deepEqual(b.quaternion.toArray(),q.toArray(),`Non-arm bone ${b.name} untouched`);
  }
  for(const [g,indices]of sourceGeometry)if(indices)assert.deepEqual(g.index.array,indices,'Shared original skin index unchanged');
  report.maxGripError=Math.max(...report.samples.map(s=>s.gripError));
  report.maxMeshContactDistance=Math.max(...report.samples.flatMap(s=>s.limbs.map(l=>l.meshContactDistance||0)));
  report.maxContactFingerMeshDistance=Math.max(...report.samples.flatMap(s=>s.limbs.flatMap(l=>(l.fingerMeshDistances||[]).map(f=>f.distance))));
  assert.deepEqual([...new Set(report.samples.flatMap(s=>s.limbs.map(l=>l.role)))].sort(),['belt','charging','cover','reach','spade'],'Exercise all physical actions');
  assert.ok(report.samples.some(s=>s.limbs.some(l=>l.role==='reach'&&l.grasp<.12)),'Travelling hands visibly relax');
  report.maxContactFingerTargetError=Math.max(...report.samples.flatMap(s=>s.limbs.filter(l=>l.role!=='reach').flatMap(l=>l.fingerErrors.map(f=>f.error))));
  report.maxFingerTargetErrorDuringReach=Math.max(...report.samples.flatMap(s=>s.limbs.filter(l=>l.role==='reach').flatMap(l=>l.fingerErrors.map(f=>f.error))));
  report.blockedViews=report.samples.filter(s=>(s.reloadProgress===0||s.reloadProgress===1)&&s.viewBlocked.length).map(s=>({vehicleYaw:s.vehicleYaw,turretYaw:s.turretYaw,elevation:s.elevation,viewBlocked:s.viewBlocked}));
  assert.equal(report.blockedViews.length,0,'Actor must not block the gun centreline from its authored camera');
  pose.dispose();pose.dispose();assert.equal(destroyed,1);assert.equal(crew.visible,true);assert.equal(dynamic.children.length,0);
  assert.equal(vehicle.getObjectByName('MountedBeltSegment').visible,true);
  report.passed=true;
}catch(error){report.errors=[error.stack||String(error)];process.exitCode=1;pose.dispose();}
await fs.mkdir('artifacts/district-rebuild',{recursive:true});
await fs.writeFile('artifacts/district-rebuild/mounted-reload-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,samples:report.samples.length,maxGripError:report.maxGripError,maxMeshContactDistance:report.maxMeshContactDistance,maxContactFingerMeshDistance:report.maxContactFingerMeshDistance,errors:report.errors},null,2));
