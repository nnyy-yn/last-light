// Preserve meshes, weights and UVs; transcode only embedded images to local 2K WebP.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import{createRequire}from'node:module';
const require=createRequire(import.meta.url),sharp=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(import.meta.dirname,'../..'),source=path.join(root,'character-sources/makehuman');
const report=[];
for(const kind of process.argv.slice(2).length?process.argv.slice(2):['civilian','combatant']){
  const input=path.join(source,kind+'-generated.glb'),output=path.join(root,'public/assets/makehuman-'+kind+'.glb');
  const file=fs.readFileSync(input),jsonLength=file.readUInt32LE(12),gltf=JSON.parse(file.subarray(20,20+jsonLength));
  const binary=file.subarray(28+jsonLength),replacement=new Map(),images=[];
  const eyeImages=new Set((gltf.materials||[]).filter(m=>/low-poly/i.test(m.name||'')).map(m=>{const t=gltf.textures[m.pbrMetallicRoughness.baseColorTexture.index];return t.source??t.extensions?.EXT_texture_webp?.source;}));
  for(let i=0;i<(gltf.images||[]).length;i++){
    const image=gltf.images[i],view=gltf.bufferViews[image.bufferView],data=binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
    const inputPixels=eyeImages.has(i)?fs.readFileSync(path.join(source,'textures/eyes-brownlight-source.png')):data;
    let pipeline=sharp(inputPixels).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true});
    if(eyeImages.has(i))pipeline=pipeline.modulate({saturation:.45,brightness:.88});
    const result=await pipeline.webp({quality:92,alphaQuality:100,effort:6}).toBuffer();
    replacement.set(image.bufferView,result);image.mimeType='image/webp';images.push({name:image.name||i,originalBytes:data.length,bytes:result.length});
  }
  const chunks=[];let offset=0;
  for(let i=0;i<gltf.bufferViews.length;i++){
    const view=gltf.bufferViews[i],data=replacement.get(i)||binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
    view.buffer=0;view.byteOffset=offset;view.byteLength=data.length;chunks.push(data);offset+=data.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
  }
  for(const texture of gltf.textures||[]){if(texture.source!==undefined){texture.extensions={...texture.extensions,EXT_texture_webp:{source:texture.source}};delete texture.source;}}
  gltf.extensionsUsed=[...new Set([...(gltf.extensionsUsed||[]),'EXT_texture_webp'])];gltf.extensionsRequired=[...new Set([...(gltf.extensionsRequired||[]),'EXT_texture_webp'])];
  gltf.asset.copyright='MakeHuman Community CC0 assets; generated with MPFB2 2.0.18 / Blender 4.5.9.'+(kind==='soldier'?' Military tactical suit by DanlyVostok / 1799danly, CC BY 4.0.':'')+' See ASSET-SOURCES.md.';
  gltf.asset.extras={...gltf.asset.extras,characterProfile:kind,source:'character-sources/makehuman/'+kind+'.human.json'};
  gltf.buffers=[{byteLength:offset}];const body=Buffer.concat(chunks),raw=Buffer.from(JSON.stringify(gltf)),j=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+body.length,8);jh.writeUInt32LE(j.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(body.length);bh.writeUInt32LE(0x004e4942,4);
  const result=Buffer.concat([header,jh,j,bh,body]);fs.writeFileSync(output,result);
  report.push({kind,input:path.relative(root,input),output:path.relative(root,output),bytes:result.length,sha256:crypto.createHash('sha256').update(result).digest('hex'),images});
}
fs.writeFileSync(path.join(source,'runtime-export-manifest.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(({kind,bytes,sha256})=>({kind,bytes,sha256})),null,2));
