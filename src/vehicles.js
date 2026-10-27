import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createVehiclePalette,buildMilitaryVehicle,bindVehicleMotion} from './vehicle-models.js';

const BASE=new URL('assets/',document.baseURI).href;
let prepared=null,rescueTemplate=null,burnedTemplate=null;
const militaryTemplates=new Map();
let palette=null,markingGeometry=null;
const resources={geometries:new Set(),materials:new Set(),textures:new Set()};

function createSurface(source,burned,maxAnisotropy){
  const name=(source?.name||'').toLowerCase(),glass=/glass|window|windscreen|windshield/.test(name),rubber=/tire|tyre|rubber/.test(name);
  const material=new THREE.MeshStandardMaterial({
    name:source?.name||'vehicle surface',map:source?.map||null,normalMap:source?.normalMap||null,
    roughnessMap:source?.roughnessMap||null,metalnessMap:source?.metalnessMap||null,
    color:source?.color?.clone()||new THREE.Color('#808071'),
    roughness:burned?.94:glass?.17:rubber?.96:.71,
    metalness:burned?.12:glass?.28:rubber?.02:.36,
    transparent:glass||Boolean(source?.transparent),opacity:glass?.46:(source?.opacity??1),
    side:source?.side??THREE.FrontSide,depthWrite:!glass,
    alphaTest:source?.alphaTest||0,envMapIntensity:glass?1:.65,
  });
  if(glass)material.color.set('#607278');
  if(burned)material.color.multiply(new THREE.Color('#b7afa3'));
  material.userData.sharedMaterial=true;
  for(const key of['map','normalMap','roughnessMap','metalnessMap'])if(material[key]){material[key].anisotropy=maxAnisotropy;resources.textures.add(material[key]);}
  resources.materials.add(material);return material;
}

function buildTemplate(asset,{burned,length=4.85,maxAnisotropy=4}){
  const root=new THREE.Group();root.name=burned?'scanned burned sedan':'authored rescue vehicle';
  asset.scene.updateMatrixWorld(true);const surfaces=new Map(),parts=new Map();
  asset.scene.traverse(object=>{
    if(!object.isMesh)return;
    // The glTF node transforms contain presentation scaling; bake them first and
    // normalize the actual vehicle once. Preserve tyres, suspension and cabin.
    const source=Array.isArray(object.material)?object.material[0]:object.material;
    const key=source.uuid;
    if(!surfaces.has(key))surfaces.set(key,createSurface(source,burned,maxAnisotropy));
    let geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
    if(geometry.index)geometry=geometry.toNonIndexed();
    const material=surfaces.get(key);if(!parts.has(material))parts.set(material,[]);parts.get(material).push(geometry);
  });
  for(const[material,geometries]of parts){
    const geometry=mergeGeometries(geometries,false);geometries.forEach(part=>part.dispose());
    if(!geometry)continue;resources.geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=!material.transparent;mesh.receiveShadow=true;
    mesh.userData.sharedGeometry=true;mesh.userData.sharedMaterial=true;root.add(mesh);
  }
  let bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
  // Rescue models are authored along either X or Z; all shipped factories face +Z.
  if(size.x>size.z*1.15){root.rotation.y=Math.PI/2;root.updateMatrixWorld(true);bounds.setFromObject(root);size=bounds.getSize(new THREE.Vector3());}
  const scale=length/size.z;root.scale.setScalar(scale);root.updateMatrixWorld(true);
  bounds.setFromObject(root);const center=bounds.getCenter(new THREE.Vector3());root.position.set(-center.x,-bounds.min.y,-center.z);root.updateMatrixWorld(true);
  const wrapper=new THREE.Group();wrapper.add(root);bounds.setFromObject(wrapper);size=bounds.getSize(new THREE.Vector3());
  wrapper.userData.dimensions={width:size.x,height:size.y,length:size.z};
  wrapper.userData.collisionBoxes=[{minX:-Math.min(size.x/2,1.18),maxX:Math.min(size.x/2,1.18),minZ:-length/2,maxZ:length/2}];
  wrapper.userData.fireAnchor=[0,Math.min(.6,size.y*.38),length*.23];wrapper.userData.vehicleType=burned?'burned-sedan':'rescue';
  return wrapper;
}

function medicalMarking(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#c9c7b7';ctx.fillRect(0,0,512,192);ctx.fillStyle='#623c31';ctx.fillRect(39,35,34,112);ctx.fillRect(0,74,112,34);
  ctx.fillStyle='#363b34';ctx.font='bold 64px Arial';ctx.fillText('RESCUE',140,89);ctx.font='29px Arial';ctx.fillText('MEDICAL SUPPORT',142,138);
  for(let i=0;i<100;i++){const x=(Math.sin(i*37.1)*.5+.5)*512,y=(Math.sin(i*13.7)*.5+.5)*192;ctx.fillStyle='rgba(49,42,29,.13)';ctx.fillRect(x,y,4+(i%11),1+(i%4));}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;resources.textures.add(map);
  const material=new THREE.MeshStandardMaterial({map,roughness:.94,metalness:.03,polygonOffset:true,polygonOffsetFactor:-1});
  material.userData.sharedMaterial=true;resources.materials.add(material);return material;
}
let rescueMarking=null;

export async function prepareVehicles(renderer,{rescueAsset=null,burnedAsset='burnt-car.glb'}={}){
  if(prepared)return prepared;
  prepared=(async()=>{
    const loader=new GLTFLoader();const[rescue,burned]=await Promise.all([rescueAsset?loader.loadAsync(BASE+rescueAsset):null,loader.loadAsync(BASE+burnedAsset)]);
    const maxAnisotropy=Math.min(8,renderer?.capabilities?.getMaxAnisotropy?.()||4);
    palette=createVehiclePalette(resources,maxAnisotropy);
    for(const type of['humvee','cargo-truck'])for(const variant of['olive','sand']){
      militaryTemplates.set(type+':'+variant,buildMilitaryVehicle(type,variant,resources,palette));
    }
    rescueTemplate=rescue?buildTemplate(rescue,{burned:false,length:4.84,maxAnisotropy}):militaryTemplates.get('humvee:olive');
    burnedTemplate=buildTemplate(burned,{burned:true,length:4.8,maxAnisotropy});
    rescueMarking=medicalMarking();markingGeometry=new THREE.PlaneGeometry(.58,.22);resources.geometries.add(markingGeometry);
    return{rescue:rescueTemplate.userData.dimensions,humvee:militaryTemplates.get('humvee:olive').userData.dimensions,truck:militaryTemplates.get('cargo-truck:olive').userData.dimensions,burned:burnedTemplate.userData.dimensions};
  })().catch(error=>{disposeVehicles();throw error;});return prepared;
}

export function createVehicle(options={}){
  const {burned=false,medical=false,variant='olive',occupied=true}=options;
  const type=options.type==='cargo-truck'?'cargo-truck':'humvee';
  let template;
  if(burned&&!options.type)template=burnedTemplate;
  else if(burned){
    const key=type+':burned';if(!militaryTemplates.has(key)&&palette)militaryTemplates.set(key,buildMilitaryVehicle(type,'olive',resources,palette,{burned:true}));
    template=militaryTemplates.get(key);
  }else template=militaryTemplates.get(type+':'+(variant==='sand'?'sand':'olive'))||rescueTemplate;
  if(!template)throw new Error('Call await prepareVehicles(renderer) before createVehicle().');
  const root=template.clone(true);root.name=burned?'burned '+template.name:template.name;
  root.userData={...structuredClone(template.userData),burned,medical};
  if(root.userData.authored)bindVehicleMotion(root,{occupied:occupied&&!burned});
  if(!burned&&medical){
    const truck=type==='cargo-truck';
    for(const side of[-1,1]){
      const marking=new THREE.Mesh(markingGeometry,rescueMarking);marking.position.set(side*(truck?.908:1.011),truck?1.43:1.05,truck?1.14:-.77);marking.rotation.y=side*Math.PI/2;
      marking.userData.sharedGeometry=marking.userData.sharedMaterial=true;root.add(marking);
    }
  }
  // Transform all four corners: rotated convoy vehicles keep accurate world AABBs.
  root.userData.getCollisionBounds=(position=root.position)=>root.userData.collisionBoxes.map(box=>{
    const c=Math.cos(root.rotation.y),s=Math.sin(root.rotation.y),points=[[box.minX,box.minZ],[box.minX,box.maxZ],[box.maxX,box.minZ],[box.maxX,box.maxZ]].map(([x,z])=>[position.x+x*c+z*s,position.z-x*s+z*c]);
    return{minX:Math.min(...points.map(v=>v[0])),maxX:Math.max(...points.map(v=>v[0])),minZ:Math.min(...points.map(v=>v[1])),maxZ:Math.max(...points.map(v=>v[1])),minY:position.y||0,maxY:(position.y||0)+(type==='cargo-truck'?2.95:1.86),material:'metal'};
  });return root;
}

export function disposeVehicles(){
  for(const geometry of resources.geometries)geometry.dispose();for(const material of resources.materials)material.dispose();for(const texture of resources.textures)texture.dispose();
  resources.geometries.clear();resources.materials.clear();resources.textures.clear();militaryTemplates.clear();prepared=null;palette=null;rescueTemplate=burnedTemplate=rescueMarking=markingGeometry=null;
}
