import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
// CPU fixture loads the shipped geometry/skin without any image decoding or GL.
const cache=new Map();
export async function geometryAsset(file){
 if(!cache.has(file))cache.set(file,(async()=>{const input=await fs.readFile(new URL('../../public/assets/'+file,import.meta.url));const length=input.readUInt32LE(12),json=JSON.parse(input.subarray(20,20+length).toString());
  json.materials=(json.materials||[]).map(m=>({name:m.name}));delete json.images;delete json.textures;delete json.samplers;
  const encoded=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(encoded.length/4)*4,32);encoded.copy(padded);const binary=input.subarray(20+length),out=Buffer.alloc(20+padded.length+binary.length);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);binary.copy(out,20+padded.length);
  return new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');})());
 return cache.get(file);
}
export async function actorRig(kind='soldier'){
 const source=await geometryAsset('makehuman-'+(kind==='enemy'?'combatant':kind)+'.glb'),root=new THREE.Group(),model=clone(source.scene),bones={};
 model.traverse(o=>{if(o.isBone)bones[o.name.replace(/:/g,'').replace(/_\d+$/,'')]=o;});model.updateMatrixWorld(true);
 const point=(a,b,d)=>{const delta=new THREE.Quaternion().setFromUnitVectors(b.getWorldPosition(new THREE.Vector3()).sub(a.getWorldPosition(new THREE.Vector3())).normalize(),new THREE.Vector3(...d).normalize());a.quaternion.copy(a.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(a.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta)));model.updateMatrixWorld(true);};
 for(const side of ['Left','Right']){const sign=side==='Left'?1:-1;point(bones['mixamorig'+side+'Arm'],bones['mixamorig'+side+'ForeArm'],kind==='civilian'?[sign*.16,-1,.06]:[sign*.12,-1,.25]);point(bones['mixamorig'+side+'ForeArm'],bones['mixamorig'+side+'Hand'],kind==='civilian'?[sign*.035,-1,.14]:[-sign*.3,.1,1]);}
 const bounds=new THREE.Box3().setFromObject(model),factor=1.78/(bounds.max.y-bounds.min.y),anchor=bones.mixamorigHips.getWorldPosition(new THREE.Vector3());model.scale.multiplyScalar(factor);model.position.y=-bounds.min.y*factor;model.position.x-=anchor.x*factor;model.position.z-=anchor.z*factor;root.add(model);root.updateMatrixWorld(true);
 return {root,model,bones,kind};
}
