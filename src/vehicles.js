import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const BASE=new URL('assets/',document.baseURI).href;
let prepared=null,rescueTemplate=null,burnedTemplate=null;
const resources={geometries:new Set(),materials:new Set(),textures:new Set()};

// Original detailed rescue utility. No downloads with uncertain ownership are
// required for the intact vehicle; geometry is batched by its PBR surfaces.
function authoredRescue(maxAnisotropy){
  const root=new THREE.Group(),parts=new Map();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const ctx=canvas.getContext('2d');ctx.fillStyle='#676b4e';ctx.fillRect(0,0,1024,1024);
  let seed=1917;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<18000;i++){ctx.fillStyle=i%3?'rgba(22,20,11,.055)':'rgba(206,192,143,.08)';ctx.fillRect(random()*1024,random()*1024,1+random()*8,1+random()*3);}
  for(let i=0;i<180;i++){ctx.strokeStyle='rgba(39,29,15,.16)';ctx.lineWidth=1+random()*2;ctx.beginPath();const x=random()*1024,y=random()*1024;ctx.moveTo(x,y);ctx.lineTo(x+random()*80,y+random()*4);ctx.stroke();}
  const paintMap=new THREE.CanvasTexture(canvas);paintMap.colorSpace=THREE.SRGBColorSpace;paintMap.anisotropy=maxAnisotropy;resources.textures.add(paintMap);
  const material=(name,options)=>{const m=new THREE.MeshStandardMaterial({name,roughness:.75,metalness:.35,...options});m.userData.sharedMaterial=true;resources.materials.add(m);return m;};
  const paint=material('weathered olive body',{map:paintMap,color:'#c7c6a6',roughness:.82,metalness:.28}),dark=material('chassis steel',{color:'#24251f',roughness:.78,metalness:.54}),rubber=material('dusty rubber tyres',{color:'#242724',roughness:.97,metalness:.01}),trim=material('worn trim',{color:'#4e503d',roughness:.64,metalness:.5}),chrome=material('exposed fasteners',{color:'#a0a09a',roughness:.46,metalness:.78}),fabric=material('canvas seats',{color:'#32372a',roughness:.99,metalness:0}),glass=material('smoked cabin glass',{color:'#7b9998',roughness:.15,metalness:.25,transparent:true,opacity:.35,depthWrite:false,side:THREE.DoubleSide}),lens=material('headlamp glass',{color:'#bfb99a',roughness:.14,metalness:.38,emissive:'#cfc6a0',emissiveIntensity:.22}),red=material('rear brake lens',{color:'#7b2720',roughness:.3,metalness:.12});
  function add(geometry,mat,position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]){const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.scale.set(...scale);mesh.updateMatrix();geometry.applyMatrix4(mesh.matrix);if(geometry.index){const old=geometry;geometry=old.toNonIndexed();old.dispose();}if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);if(!parts.has(mat))parts.set(mat,[]);parts.get(mat).push(geometry);}
  const box=(size,pos,mat=paint,rot=[0,0,0])=>add(new THREE.BoxGeometry(...size),mat,pos,rot);
  const cylinder=(r1,r2,len,pos,mat=dark,rot=[0,0,Math.PI/2],n=16)=>add(new THREE.CylinderGeometry(r1,r2,len,n),mat,pos,rot);
  function prism(profile,width,mat=paint){const vertices=[],uv=[],n=profile.length;const tri=(a,b,c)=>{for(const p of[a,b,c]){vertices.push(...p);uv.push(p[2]*.28,p[1]*.38);}};for(const side of[-1,1])for(let i=1;i<n-1;i++){const a=[side*width/2,profile[0][1],profile[0][0]],b=[side*width/2,profile[i][1],profile[i][0]],c=[side*width/2,profile[i+1][1],profile[i+1][0]];side>0?tri(a,b,c):tri(a,c,b);}for(let i=0;i<n;i++){const j=(i+1)%n,a=[-width/2,profile[i][1],profile[i][0]],b=[width/2,profile[i][1],profile[i][0]],c=[width/2,profile[j][1],profile[j][0]],d=[-width/2,profile[j][1],profile[j][0]];tri(a,c,b);tri(a,d,c);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();add(g,mat);}
  function pane(points,mat=glass){const g=new THREE.BufferGeometry(),v=[];for(const i of[0,1,2,0,2,3])v.push(...points[i]);g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2));g.computeVertexNormals();add(g,mat);}
  function beam(a,b,width,mat=trim){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),direction=vb.clone().sub(va),g=new THREE.CylinderGeometry(width,width,direction.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));add(g,mat,va.add(vb).multiplyScalar(.5).toArray());}
  // Exposed chassis, axle, differential and suspension under the body shell.
  box([1.63,.16,4.16],[0,.53,0],dark);for(const x of[-.59,.59])box([.16,.2,4.34],[x,.52,0],dark);
  for(const z of[-1.44,1.42]){cylinder(.09,.09,2.05,[0,.48,z],dark);add(new THREE.SphereGeometry(.19,12,8),dark,[0,.48,z],[0,0,0],[1.15,.85,1]);for(const x of[-.73,.73]){beam([x,.5,z-.2],[x,.9,z+.2],.045,chrome);box([.11,.05,.8],[x,.51,z],dark);}}
  prism([[-2.12,.68],[-2.12,1.18],[-1.5,1.25],[.68,1.25],[2.13,1.12],[2.22,.88],[2.08,.67]],1.84);
  box([1.78,.09,2.41],[0,.94,-.57],dark);box([1.84,.10,1.88],[0,2.03,-.65]);prism([[-1.67,1.17],[-1.65,1.96],[-1.47,2.03],[-1.45,1.18]],1.80);
  for(const side of[-1,1]){const x=side*.934;box([.07,.53,1.05],[x,1.24,-.20]);box([.07,.53,.82],[x,1.24,-1.20]);pane([[x,1.52,.37],[x,1.52,-.71],[x,1.96,-.71],[x,1.96,.12]]);pane([[x,1.52,-.79],[x,1.52,-1.56],[x,1.96,-1.48],[x,1.96,-.79]]);for(const z of[-1.58,-.75])box([.08,.80,.07],[x,1.62,z],trim);beam([x,1.24,.75],[x,2.03,.22],.052,paint);box([.08,.07,2.17],[x,1.51,-.61],trim);for(const z of[-.54,-1.37])box([.10,.05,.20],[x*1.03,1.42,z],dark);box([.22,.08,1.82],[side*1.0,.77,-.55],dark);beam([x,1.47,.52],[side*1.17,1.56,.65],.025,trim);box([.12,.26,.16],[side*1.17,1.66,.65],dark);box([.125,.20,.11],[side*1.17,1.67,.69],chrome);for(const z of[-.03,-1.04])for(const y of[1.13,1.43])box([.1,.04,.12],[x,y,z],trim);for(const z of[-1.48,-1.2,-.92,-.65,-.36,-.08,.2])cylinder(.018,.018,.018,[side*.98,1.06,z],chrome,[0,0,Math.PI/2],8);}
  pane([[-.88,1.28,.76],[.88,1.28,.76],[.86,1.97,.25],[-.86,1.97,.25]]);beam([0,1.29,.77],[0,2.0,.23],.035,trim);
  for(const x of[-.46,.46]){beam([x-.15,1.33,.76],[x+.14,1.59,.56],.014,dark);box([.55,.16,.49],[x,1.04,-.25],fabric);box([.55,.58,.13],[x,1.38,-.51],fabric,[.08,0,0]);box([.51,.14,.51],[x,1.04,-1.2],fabric);box([.51,.56,.13],[x,1.38,-1.46],fabric);}
  box([1.62,.25,.30],[0,1.25,.44],dark);add(new THREE.TorusGeometry(.18,.022,6,24),dark,[-.47,1.45,.15],[.62,0,0]);beam([-.47,1.45,.15],[-.47,1.20,.42],.035,dark);
  box([1.44,.024,1.19],[0,1.22,1.38],paint,[.087,0,0]);for(const x of[-.72,.72])box([.022,.025,1.22],[x,1.22,1.37],dark,[.087,0,0]);box([1.68,.35,.06],[0,.94,2.19],dark);for(let i=-4;i<=4;i++)box([.058,.29,.075],[i*.115,.96,2.24],paint);
  for(const x of[-.70,.70]){cylinder(.145,.145,.065,[x,.99,2.25],dark,[Math.PI/2,0,0],24);cylinder(.112,.112,.071,[x,.99,2.285],lens,[Math.PI/2,0,0],24);box([.13,.09,.04],[x,1.17,2.25],lens);}
  for(const z of[-2.31,2.34]){box([2.08,.19,.18],[0,.67,z],dark);for(const x of[-.56,.56])add(new THREE.TorusGeometry(.075,.019,6,12),chrome,[x,.64,z+.1]);}for(const x of[-.75,.75]){box([.17,.23,.05],[x,1.05,-2.17],red);box([.15,.08,.06],[x,.88,-2.17],lens);}
  for(const side of[-1,1])for(const z of[-1.44,1.42]){const x=side*1.00;cylinder(.448,.448,.29,[x,.48,z],rubber,[0,0,Math.PI/2],32);add(new THREE.TorusGeometry(.335,.125,10,32),rubber,[x+side*.08,.48,z],[0,Math.PI/2,0],[1,1,.82]);cylinder(.235,.235,.32,[x,.48,z],paint,[0,0,Math.PI/2],24);cylinder(.105,.105,.35,[x,.48,z],dark,[0,0,Math.PI/2],16);for(let i=0;i<8;i++){const a=i*Math.PI/4;cylinder(.025,.025,.365,[x,.48+Math.cos(a)*.163,z+Math.sin(a)*.163],chrome,[0,0,Math.PI/2],6);}for(let i=0;i<36;i++){const a=i*Math.PI/18;box([.32,.046,.09],[x,.48+Math.cos(a)*.452,z+Math.sin(a)*.452],rubber,[a,0,(i%2?.12:-.12)]);}add(new THREE.TorusGeometry(.52,.06,6,24,Math.PI),paint,[side*.99,.49,z],[0,side*Math.PI/2,0],[1,1,1.55]);box([.3,.08,.43],[side*.99,.76,z+.49],paint);box([.3,.08,.43],[side*.99,.76,z-.49],paint);}
  for(const x of[-.78,.78]){beam([x,2.13,-1.53],[x,2.13,.18],.035,dark);for(const z of[-1.5,.1])beam([x,2.03,z],[x,2.13,z],.025,dark);}for(const z of[-1.48,-.92,-.36,.15])beam([-.78,2.13,z],[.78,2.13,z],.026,dark);for(const x of[-.48,0,.48])box([.36,.23,.62],[x,2.20,-.96],fabric);cylinder(.38,.38,.24,[0,1.38,-2.20],rubber,[Math.PI/2,0,0],32);cylinder(.21,.21,.25,[0,1.38,-2.21],paint,[Math.PI/2,0,0],24);beam([-.76,1.28,-1.82],[-.83,3.02,-1.88],.009,dark);box([.33,.48,.17],[.65,1.43,-2.15],paint);
  for(const[mat,geometries]of parts){const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());resources.geometries.add(geometry);const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=!mat.transparent;mesh.receiveShadow=true;mesh.userData.sharedGeometry=mesh.userData.sharedMaterial=true;root.add(mesh);}
  root.userData.dimensions={width:2.46,height:3.03,length:4.89};root.userData.collisionBoxes=[{minX:-1.14,maxX:1.14,minZ:-2.40,maxZ:2.43}];root.userData.fireAnchor=[0,1.22,1.3];root.userData.vehicleType='rescue';return root;
}

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
    rescueTemplate=rescue?buildTemplate(rescue,{burned:false,length:4.85,maxAnisotropy}):authoredRescue(maxAnisotropy);
    burnedTemplate=buildTemplate(burned,{burned:true,length:4.8,maxAnisotropy});
    rescueMarking=medicalMarking();return{rescue:rescueTemplate.userData.dimensions,burned:burnedTemplate.userData.dimensions};
  })().catch(error=>{prepared=null;throw error;});return prepared;
}

export function createVehicle({burned=false,medical=true}={}){
  const template=burned?burnedTemplate:rescueTemplate;
  if(!template)throw new Error('Call await prepareVehicles(renderer) before createVehicle().');
  const root=template.clone(true);root.name=burned?'burned roadside car':'rescue utility vehicle';
  root.userData={...template.userData,collisionBoxes:template.userData.collisionBoxes.map(box=>({...box})),fireAnchor:[...template.userData.fireAnchor],burned};
  if(!burned&&medical){
    const width=root.userData.dimensions.width,height=root.userData.dimensions.height;
    for(const side of[-1,1]){
      const geometry=new THREE.PlaneGeometry(.88,.33);resources.geometries.add(geometry);
      const marking=new THREE.Mesh(geometry,rescueMarking);marking.position.set(side*.981,1.25,-.30);marking.rotation.y=side*Math.PI/2;
      marking.userData.sharedGeometry=true;marking.userData.sharedMaterial=true;root.add(marking);
    }
  }
  root.userData.getCollisionBounds=(position=root.position)=>root.userData.collisionBoxes.map(box=>({minX:box.minX+position.x,maxX:box.maxX+position.x,minZ:box.minZ+position.z,maxZ:box.maxZ+position.z}));
  return root;
}

export function disposeVehicles(){
  for(const geometry of resources.geometries)geometry.dispose();for(const material of resources.materials)material.dispose();for(const texture of resources.textures)texture.dispose();
  resources.geometries.clear();resources.materials.clear();resources.textures.clear();prepared=null;rescueTemplate=burnedTemplate=rescueMarking=null;
}
