import fs from 'node:fs';import path from'node:path';import crypto from'node:crypto';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),sharp=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=process.cwd(),base=path.join(root,'weapon-sources/v0.6');
const parse=file=>{const b=fs.readFileSync(file),n=b.readUInt32LE(12);return{g:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)}};
const imageOf=t=>t.source??t.extensions?.EXT_texture_webp?.source;
const reports=[];
for(const id of ['akm','m249']){
 const {g,bin}=parse(path.join(base,id+'-export.glb')),baseline=parse(path.join(base,'baseline',id+'-real.glb'));
 const images=new Map((g.images||[]).map((image,index)=>[image.bufferView,index]));
 const lossless=new Set(g.materials.flatMap(m=>[m.normalTexture?.index,m.pbrMetallicRoughness?.metallicRoughnessTexture?.index,m.occlusionTexture?.index].filter(i=>i!==undefined).map(i=>imageOf(g.textures[i]))));
 const chunks=[];let length=0;const imageInfo=[];
 for(let i=0;i<g.bufferViews.length;i++){
  const view=g.bufferViews[i];let bytes=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
  if(images.has(i)){const index=images.get(i),meta=await sharp(bytes).metadata();bytes=await sharp(bytes).webp({lossless:lossless.has(index),quality:94,effort:6}).toBuffer();g.images[index].mimeType='image/webp';imageInfo.push({name:g.images[index].name,width:meta.width,height:meta.height,lossless:lossless.has(index)});}
  view.byteOffset=length;view.byteLength=bytes.length;chunks.push(bytes);length+=bytes.length;const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}
 }
 for(const t of g.textures||[]){t.extensions={...t.extensions,EXT_texture_webp:{source:imageOf(t)}};delete t.source;}
 g.extensionsUsed=[...new Set([...(g.extensionsUsed||[]),'EXT_texture_webp'])];g.extensionsRequired=[...new Set([...(g.extensionsRequired||[]),'EXT_texture_webp'])];
 g.asset.extras={...baseline.g.asset.extras,modificationV06:id==='akm'?'Selective wooden component bevels and buttstock cheek reshaping; receiver edge radii and weighted normals. UVs and Magazine/ChargingHandle preserved.':'Rebuilt non-functional molded stock with recessed triangular webs and curved rubber pad; sculpted fabric pouch with actual folds and straps. AmmoContainer origin and FeedBelt preserved.',sourceAuthor:id==='akm'?'LonesomeDucky':'AK / skaf13',sourceLicense:id==='akm'?'CC0 1.0':'CC BY 4.0',sourceUrl:id==='akm'?'https://opengameart.org/content/akm':'https://sketchfab.com/3d-models/m249-light-machine-gun-75cacc16a52640c7adb100d7294da244'};
 const beforeNodes=new Map(baseline.g.nodes.map(n=>[n.name,n]));for(const name of id==='akm'?['Magazine','ChargingHandle']:['AmmoContainer','FeedBelt']){
  const old=beforeNodes.get(name),n=g.nodes.find(n=>n.name===name);if(!old||!n)throw new Error('Lost animated assembly '+name);
  for(const key of ['translation','rotation','scale','matrix']){const a=old[key]||({translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],matrix:null}[key]),b=n[key]||({translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],matrix:null}[key]);if(a&&b&&a.some((v,k)=>Math.abs(v-b[k])>1e-5))throw new Error(name+' transform changed '+key);}
 }
 g.buffers=[{byteLength:length}];const raw=Buffer.from(JSON.stringify(g)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),body=Buffer.concat(chunks),head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+body.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(body.length);bh.writeUInt32LE(0x004e4942,4);const bytes=Buffer.concat([head,jh,json,bh,body]);
 fs.writeFileSync(path.join(base,id+'-ready.glb'),bytes);fs.writeFileSync(path.join(root,'public/assets',id+'-real.glb'),bytes);
 const tris=asset=>asset.meshes.reduce((n,m)=>n+m.primitives.reduce((sum,p)=>sum+asset.accessors[p.indices??p.attributes.POSITION].count/3,0),0);
 reports.push({id,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),triangles:tris(g),beforeTriangles:tris(baseline.g),draws:g.meshes.reduce((n,m)=>n+m.primitives.length,0),beforeDraws:baseline.g.meshes.reduce((n,m)=>n+m.primitives.length,0),images:imageInfo,externalURIs:g.images.filter(i=>i.uri).length,movingNodes:g.nodes.filter(n=>['Magazine','ChargingHandle','AmmoContainer','FeedBelt'].includes(n.name))});
}
fs.writeFileSync(path.join(base,'runtime-statistics.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.map(({images,movingNodes,...r})=>r),null,2));

