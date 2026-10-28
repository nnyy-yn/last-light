import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const templates=new Map(),ownedGeometry=new Set(),ownedMaterials=new Set();let prepared;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),clamp=THREE.MathUtils.clamp;
function shared(root){root.traverse(o=>{if(o.isMesh){o.userData.sharedGeometry=true;o.userData.sharedMaterial=true;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=true;}});return root;}
export async function prepareSupportModels({loader=new GLTFLoader(),base=new URL('assets/',document.baseURI).href}={}){
 if(!prepared)prepared=Promise.all(['dshk-support','m134-door-support','technical-pickup-support'].map(async id=>{const asset=await loader.loadAsync(new URL(id+'.glb',base).href);asset.scene.updateMatrixWorld(true);asset.scene.traverse(o=>{if(o.isMesh){ownedGeometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])ownedMaterials.add(m);}});templates.set(id,shared(asset.scene));return id;}));return prepared;
}
// CPU tests can supply the same decoded GLB scenes without a browser loader.
export function installSupportModelTemplates(assets){for(const[id,scene]of Object.entries(assets))templates.set(id,shared(scene));}
function clone(id){const t=templates.get(id);if(!t)throw new Error('Support model not prepared: '+id);const result=t.clone(true);result.userData={...result.userData};return shared(result);}
function recenter(root,name,at){const node=root.getObjectByName(name);if(!node)throw new Error('Missing support component '+name);root.updateMatrixWorld(true);const desired=node.parent.worldToLocal(root.localToWorld(V(...at))),delta=desired.clone().sub(node.position);node.position.copy(desired);for(const c of node.children)c.position.sub(delta);root.updateMatrixWorld(true);return node;}
function point(root,name){const o=root.getObjectByName(name);if(!o)throw new Error('Missing socket '+name);root.updateMatrixWorld(true);return o.getWorldPosition(V());}
function boundsAt(root,boxes,position=root.position){const c=Math.cos(root.rotation.y),s=Math.sin(root.rotation.y);return boxes.map(b=>{const pts=[[b.minX,b.minZ],[b.minX,b.maxZ],[b.maxX,b.minZ],[b.maxX,b.maxZ]].map(([x,z])=>[position.x+x*c+z*s,position.z-x*s+z*c]);return{minX:Math.min(...pts.map(p=>p[0])),maxX:Math.max(...pts.map(p=>p[0])),minZ:Math.min(...pts.map(p=>p[1])),maxZ:Math.max(...pts.map(p=>p[1])),minY:(position.y||0)+(b.minY||0),maxY:(position.y||0)+b.maxY,material:'metal'};});}

export function createTechnicalModel({occupied=true}={}){
 const root=clone('technical-pickup-support');root.name='Open-bed pickup with DShK';const mount=root.getObjectByName('TurretMount'),gunner=root.getObjectByName('GunnerSocket');root.updateMatrixWorld(true);
 const yaw=new THREE.Group();yaw.name='MountedTurret';yaw.position.copy(root.worldToLocal(mount.getWorldPosition(V())));root.add(yaw);
 const pitch=new THREE.Group();pitch.name='MountedGun';yaw.add(pitch);const model=clone('dshk-support');model.rotation.y=Math.PI;pitch.add(model);
 recenter(model,'MountedFeedCover',[0,.14,.23]);recenter(model,'MountedCoverLatch',[0,.18,.17]);recenter(model,'MountedSpadeGripLeft',[-.15,-.015,.35]);recenter(model,'MountedSpadeGripRight',[.15,-.015,.35]);recenter(model,'MountedChargingHandle',[.18,.01,.07]);recenter(model,'MountedChargingGrip',[.18,.01,.07]);recenter(model,'MountedBeltSegment',[-.165,.14,.015]);
 const gunnerPosition=root.worldToLocal(gunner.getWorldPosition(V())).toArray(),crew=new THREE.Group();crew.name='GunnerCrew';crew.visible=occupied;root.add(crew);
 root.userData={...root.userData,vehicleType:'technical',weaponId:'dshk',mountedPoseProfile:{kind:'dshk',hipInYaw:[0,-.30,-.55],reloadLean:[0,.07,.20],camera:[0,.26,-.78]},faction:'enemy',authored:true,occupied,dimensions:{width:2.05,length:4.92,height:2.45},turret:{yaw,pitch,crew,gunnerAnchor:gunnerPosition},gunnerSocket:gunner,crewAnchors:[{role:'gunner',position:[0,1.75,-1.85],rotation:[0,0,0],feet:{left:[-.15,.96,-1.93],right:[.15,.96,-1.93]}}],collisionBoxes:[{minX:-1.025,maxX:1.025,minZ:-2.42,maxZ:2.50,minY:0,maxY:1.94}],exits:[[-1.75,0,-1.55],[1.75,0,-1.55],[0,0,-3]],fireAnchor:[0,1,-1]};
 root.userData.aimTurret=(worldYaw,elevation=0)=>{yaw.rotation.y=worldYaw-root.rotation.y;pitch.rotation.x=-clamp(elevation,-.27,.68);root.updateMatrixWorld(true);};
 root.userData.turretPoint=(kind='muzzle')=>kind==='camera'?pitch.localToWorld(V(...root.userData.mountedPoseProfile.camera)):point(model,({muzzle:'Muzzle',camera:'Camera',leftGrip:'GripLeft',rightGrip:'GripRight'})[kind]||'Muzzle');
 root.userData.getCollisionBounds=(position=root.position)=>boundsAt(root,root.userData.collisionBoxes,position);
 root.userData.setModelDistance=distance=>root.traverse(o=>{if(o.isMesh)o.castShadow=distance<50;});
 return root;
}

export function attachBlackHawkDoorGuns(aircraft){
 if(aircraft.userData.gunSockets?.length)return aircraft.userData.gunSockets;
 const sockets=[];
 for(const side of[-1,1]){
  const yaw=new THREE.Group();yaw.name=side<0?'LeftDoorGunYaw':'RightDoorGunYaw';yaw.position.set(side*1.35,1.66,.82);yaw.rotation.y=-side*Math.PI/2;aircraft.add(yaw);
  const pivot=new THREE.Group();pivot.name='DoorGunElevation';yaw.add(pivot);const gun=clone('m134-door-support');pivot.add(gun);
  const pintle=new THREE.Mesh(new THREE.CylinderGeometry(.04,.055,.45,10),gun.getObjectByName('MinigunBody')?.children.find(c=>c.isMesh)?.material||[...ownedMaterials][0]);pintle.position.y=-.28;pintle.userData.sharedMaterial=true;pintle.castShadow=true;yaw.add(pintle);
  const socket={id:side<0?'door-left':'door-right',weaponId:'m134',side,yaw,pivot,muzzle:gun.getObjectByName('Muzzle'),barrels:gun.getObjectByName('RotatingBarrels'),forward:[0,0,-1],yawLimits:[-side*Math.PI/2-.65,-side*Math.PI/2+.65],pitchLimits:[-.12,.70],firing:false,angle:0};sockets.push(socket);
 }
 aircraft.userData.gunSockets=sockets;
 aircraft.userData.aimDoorGun=(id,target)=>{const s=sockets.find(s=>s.id===id);if(!s)return null;aircraft.updateMatrixWorld(true);const q=target.isVector3?target.clone():Array.isArray(target)?V(...target):V(target.x,target.y,target.z),p=aircraft.worldToLocal(q).sub(s.yaw.position),angle=Math.atan2(-p.x,-p.z);let diff=Math.atan2(Math.sin(angle+ s.side*Math.PI/2),Math.cos(angle+s.side*Math.PI/2));s.yaw.rotation.y=-s.side*Math.PI/2+clamp(diff,-.65,.65);s.pivot.rotation.x=clamp(Math.atan2(p.y,Math.hypot(p.x,p.z)),-.70,.12);aircraft.updateMatrixWorld(true);return s.muzzle.getWorldPosition(V());};
 aircraft.userData.gunPoint=id=>{const s=sockets.find(s=>s.id===id);if(!s)return null;aircraft.updateMatrixWorld(true);return s.muzzle.getWorldPosition(V());};
 aircraft.userData.animateDoorGun=(id,dt,{firing=false}={})=>{const s=sockets.find(s=>s.id===id);if(!s)return;s.firing=firing;if(firing&&dt>0){s.angle=(s.angle+dt*120)%(Math.PI*2);s.barrels.rotation.z=s.angle;}};
 return sockets;
}

const gearGeo=new Map(),gearMats=new Map();
function gearBox(w,h,d,mat){const key=[w,h,d].join('/');if(!gearGeo.has(key))gearGeo.set(key,new THREE.BoxGeometry(w,h,d));if(!gearMats.has(mat))gearMats.set(mat,new THREE.MeshStandardMaterial({color:mat,roughness:.94}));const mesh=new THREE.Mesh(gearGeo.get(key),gearMats.get(mat));mesh.userData.sharedGeometry=mesh.userData.sharedMaterial=true;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;}
export function attachSupportGear(actor,weaponId,gear){
 if(!['rpk','rpg7'].includes(weaponId)&&!gear)return null;const set=new THREE.Group();set.name='Support role equipment';
 const pack=gearBox(.34,.42,.16,'#515642');pack.position.set(0,1.16,-.20);set.add(pack);
 if(weaponId==='rpg7'){for(const side of[-1,1]){const tube=gearBox(.075,.63,.075,'#596443');tube.position.set(side*.15,1.20,-.30);tube.rotation.z=side*.10;set.add(tube);}}
 else{for(const side of[-1,1]){const pouch=gearBox(.16,.17,.11,'#5d5a43');pouch.position.set(side*.20,.96,.12);set.add(pouch);}}
 const straps=[];for(const side of[-1,1]){const strap=gearBox(.035,.43,.035,'#4a4c38');strap.position.set(side*.13,1.20,.14);set.add(strap);straps.push(strap);}
 actor.add(set);actor.updateMatrixWorld(true);const spine=actor.getObjectByName('mixamorigSpine')||actor.getObjectByName('mixamorig:Spine');spine?.attach(set);return set;
}
export function disposeSupportModels(){for(const g of ownedGeometry)g.dispose();for(const m of ownedMaterials)m.dispose();for(const g of gearGeo.values())g.dispose();for(const m of gearMats.values())m.dispose();templates.clear();ownedGeometry.clear();ownedMaterials.clear();gearGeo.clear();gearMats.clear();prepared=null;}
