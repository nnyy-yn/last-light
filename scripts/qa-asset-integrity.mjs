import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

// Validate the exported assets through the same Three.js decoder as the game.
// This runs in a hidden browser and never uses desktop input or pointer lock.
const root=path.resolve(import.meta.dirname,'..');
const args=process.argv.slice(2),flag=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const assetDirectory=path.resolve(root,flag('--assets')||'public/assets');
const output=path.resolve(root,flag('--output')||'artifacts/model-upgrade-v0.6/asset-integrity.json');
const files=['m16a2-real.glb','m249-real.glb','akm-real.glb','mp5-real.glb','m1911-real.glb','m4a1-real.glb',...['soldier','civilian','combatant'].map(k=>`makehuman-${k}.glb`),'pasgt-field-helmet.glb'];
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:640,height:640}});
const report={passed:false,startedAt:new Date().toISOString(),assets:[],errors:[],input:'No input; hidden asset decoding/rendering only',assetDirectory};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
await page.route('http://asset-audit.test/**',async route=>{
 const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
 if(pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script></head><body><script type="module">
 import * as T from 'three';
 import {GLTFLoader} from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
 import {MeshoptDecoder} from '/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js';
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(640,640);document.body.appendChild(renderer.domElement);
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 window.audit=async function(file){
   const gltf=await loader.loadAsync('/assets/'+file),root=gltf.scene;
   root.updateMatrixWorld(true);
   const result={file,meshes:0,triangles:0,vertices:0,materials:0,bones:0,skinnedMeshes:0,invalidValues:0,invalidIndices:0,invalidWeights:0,invalidJoints:0,animations:gltf.animations.map(a=>a.name),textures:[],materialNames:[]};
   const mats=new Set(),textures=new Set(),bones=new Set();
   root.traverse(o=>{
     if(o.isBone)bones.add(o);
     if(!o.isMesh)return;
     result.meshes++;const g=o.geometry,p=g.attributes.position;
     result.vertices+=p.count;result.triangles+=(g.index?.count||p.count)/3;
     for(const a of Object.values(g.attributes))for(const n of a.array)if(!Number.isFinite(n))result.invalidValues++;
     if(g.index)for(const n of g.index.array)if(n>=p.count||n<0)result.invalidIndices++;
     if(o.isSkinnedMesh){result.skinnedMeshes++;const w=g.attributes.skinWeight,j=g.attributes.skinIndex;
       for(let i=0;i<w.count;i++){let sum=0;for(let k=0;k<4;k++){const weight=w.getComponent(i,k);sum+=weight;if(weight<0||weight>1.001)result.invalidWeights++;if(weight>0&&j.getComponent(i,k)>=o.skeleton.bones.length)result.invalidJoints++;}if(Math.abs(sum-1)>.025)result.invalidWeights++;}
     }
     for(const m of Array.isArray(o.material)?o.material:[o.material]){mats.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}
   });
   result.bones=bones.size;result.materials=mats.size;result.materialNames=[...mats].map(m=>m.name);
   result.textures=[...textures].map(t=>({name:t.name,width:t.image?.width||t.image?.videoWidth,height:t.image?.height||t.image?.videoHeight,colorSpace:t.colorSpace}));
   const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());result.size=size.toArray();
   const scene=new T.Scene();scene.background=new T.Color('#30383a');scene.add(root,new T.HemisphereLight(0xffffff,0x555555,2));
   const key=new T.DirectionalLight(0xffeee0,3);key.position.set(3,5,4);scene.add(key);
   const camera=new T.PerspectiveCamera(40,1,.001,10000),extent=Math.max(...size.toArray());camera.position.copy(center).add(new T.Vector3(extent*.7,extent*.3,extent*1.8));camera.lookAt(center);
   renderer.render(scene,camera);result.drawCalls=renderer.info.render.calls;
   const released=new Set();root.traverse(o=>{if(o.geometry&&!released.has(o.geometry)){released.add(o.geometry);o.geometry.dispose();}if(o.skeleton&&!released.has(o.skeleton)){released.add(o.skeleton);o.skeleton.dispose();}});
   for(const m of mats)m.dispose();for(const t of textures)t.dispose();scene.clear();
   return result;
 };
 window.ready=true;
 </script></body></html>`});
 const target=pathname.startsWith('/assets/')?path.resolve(assetDirectory,pathname.slice(8)):path.resolve(root,'.'+pathname);
 const allowed=pathname.startsWith('/assets/')?assetDirectory:path.join(root,'node_modules');
 if(!target.startsWith(allowed+path.sep))return route.fulfill({status:403,body:'outside audit scope'});
 try{return route.fulfill({body:await fs.readFile(target),contentType:target.endsWith('.js')?'text/javascript':target.endsWith('.glb')?'model/gltf-binary':'application/octet-stream'});}catch{return route.fulfill({status:404,body:'missing local asset'});}
});
try{
 await page.goto('http://asset-audit.test/');await page.waitForFunction(()=>window.ready);
 for(const file of files){
   const bytes=await fs.readFile(path.join(assetDirectory,file));
   assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
   const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
   assert.ok((gltf.buffers||[]).every(b=>!b.uri),'GLB buffers must be embedded');
   assert.ok((gltf.images||[]).every(i=>i.bufferView!==undefined),'GLB textures must be embedded');
   const result=await page.evaluate(file=>window.audit(file),file);
   result.bytes=bytes.length;result.sha256=createHash('sha256').update(bytes).digest('hex');report.assets.push(result);
   for(const key of ['invalidValues','invalidIndices','invalidWeights','invalidJoints'])assert.equal(result[key],0,`${file}: ${key}`);
   assert.ok(result.size.every(v=>Number.isFinite(v)&&v>0),`${file}: finite nonempty bounds`);
   assert.ok(result.textures.every(t=>t.width>0&&t.height>0&&t.width<=4096&&t.height<=4096),`${file}: valid texture budget`);
   assert.ok(result.triangles>500&&result.triangles<200000,`${file}: sensible model geometry budget`);
   if(file.startsWith('makehuman-')){assert.ok(result.bones>=50);assert.ok(result.skinnedMeshes>=2);assert.ok(result.size[1]>1.5&&result.size[1]<2.1);}
   console.log(`${file}: ${result.triangles} triangles, ${result.drawCalls} draws, ${result.textures.length} textures`);
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;console.error(error);}
finally{report.finishedAt=new Date().toISOString();await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));await browser.close();}
