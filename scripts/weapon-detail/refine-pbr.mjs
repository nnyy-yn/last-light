// Texture-space material pass. Retain authored wear and metal masks instead of
// forcing one runtime roughness floor over wood, polymer and exposed metal.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(import.meta.dirname,'../..');
const configs={m16a2:{metal:[.26,.50],other:[.53,.33]},m249:{metal:[.30,.60],other:[.56,.35]},akm:{metal:[.30,.60],other:[.36,.44]},mp5:{metal:[.28,.62],other:[.51,.36]},m1911:{metal:[.22,.70],other:[.40,.36]},m4a1:{metal:[.27,.63],other:[.49,.36]}};
const load=file=>{const bytes=fs.readFileSync(path.join(root,file)),n=bytes.readUInt32LE(12);return{g:JSON.parse(bytes.subarray(20,20+n)),bin:bytes.subarray(28+n),bytes};};
const sourceOf=texture=>texture.source??texture.extensions?.EXT_texture_webp?.source;
const imageBytes=(asset,index)=>{const v=asset.g.bufferViews[asset.g.images[index].bufferView];return asset.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);};
const reports=[];
for(const[id,cfg]of Object.entries(configs)){
  const file=`${id}-real.glb`,source=id==='m249'?'weapon-sources/v0.5/m249-detail-packed.glb':`weapon-sources/v0.4/${file}`;
  const asset=load(source),g=asset.g,replacements=new Map(),edits=[];
  let originalM16;
  if(id==='m16a2'){
    const original=load('weapon-sources/v0.4/m16a2-original-authored.glb');
    const material=original.g.materials.find(m=>m.pbrMetallicRoughness?.metallicRoughnessTexture);
    const image=sourceOf(original.g.textures[material.pbrMetallicRoughness.metallicRoughnessTexture.index]);
    originalM16=await sharp(imageBytes(original,image)).removeAlpha().raw().toBuffer({resolveWithObject:true});
  }
  for(const material of g.materials){
    if(material.name==='arms'||!material.pbrMetallicRoughness?.metallicRoughnessTexture)continue;
    // Newly authored canvas, brass, copper and links have deliberate independent
    // factors; only the original firearm atlas receives this corrective pass.
    if(id==='m249'&&!/original steel|polymer grip/.test(material.name))continue;
    const image=sourceOf(g.textures[material.pbrMetallicRoughness.metallicRoughnessTexture.index]);
    const view=g.images[image].bufferView;if(replacements.has(view))continue;
    const{data,info}=await sharp(imageBytes(asset,image)).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const before={roughness:0,metalness:0},after={roughness:0};
    for(let p=0;p<data.length;p+=info.channels){
      const rough=(originalM16?originalM16.data[p+1]:data[p+1])/255,metal=data[p+2]/255;
      before.roughness+=rough;before.metalness+=metal;
      // Smooth interpolation by the painted metal mask, preserving local
      // scratches, bare edge wear and non-metal grain variation.
      const value=metal*(cfg.metal[0]+cfg.metal[1]*rough)+(1-metal)*(cfg.other[0]+cfg.other[1]*rough);
      data[p+1]=Math.round(Math.max(0,Math.min(1,value))*255);after.roughness+=data[p+1]/255;
    }
    const count=info.width*info.height;
    replacements.set(view,await sharp(data,{raw:{width:info.width,height:info.height,channels:info.channels}}).webp({lossless:true,effort:6}).toBuffer());
    edits.push({material:material.name,image,resolution:[info.width,info.height],before:{meanRoughness:before.roughness/count,meanMetalness:before.metalness/count},after:{meanRoughness:after.roughness/count},restoredOriginalUnclampedRoughness:id==='m16a2'});
  }
  // Repack physical buffer slices, including Meshopt payloads. Virtual fallback
  // buffer offsets stay untouched. Never decode/re-encode authored geometry.
  const chunks=[],allocations=new Map();let length=0;
  const allocate=(offset,size,replacement)=>{
    const key=`${offset}:${size}:${replacement?'edited':'source'}`;if(allocations.has(key))return allocations.get(key);
    const b=replacement||asset.bin.subarray(offset,offset+size),result={offset:length,length:b.length};
    chunks.push(b);length+=b.length;const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}
    allocations.set(key,result);return result;
  };
  for(let i=0;i<g.bufferViews.length;i++){
    const view=g.bufferViews[i];
    if(view.buffer===0){const a=allocate(view.byteOffset||0,view.byteLength,replacements.get(i));view.byteOffset=a.offset;view.byteLength=a.length;}
    const compressed=view.extensions?.EXT_meshopt_compression;
    if(compressed?.buffer===0){const a=allocate(compressed.byteOffset||0,compressed.byteLength);compressed.byteOffset=a.offset;compressed.byteLength=a.length;}
  }
  g.buffers[0].byteLength=length;
  g.asset.extras={...g.asset.extras,v05MaterialPass:'Metal-mask-aware roughness mapping preserves original UV, albedo, normal, metallic and AO detail. No global roughness clamp.',v05MaterialParameters:cfg};
  const raw=Buffer.from(JSON.stringify(g)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),body=Buffer.concat(chunks);
  const h=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+body.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(body.length);bh.writeUInt32LE(0x004e4942,4);
  const result=Buffer.concat([h,jh,json,bh,body]);fs.writeFileSync(path.join(root,'public/assets',file),result);
  reports.push({id,file,source,bytes:result.length,sha256:crypto.createHash('sha256').update(result).digest('hex'),edits});
}
fs.writeFileSync(path.join(root,'weapon-sources/v0.5/material-pass.json'),JSON.stringify(reports,null,2));
console.log(reports.map(({id,bytes,edits})=>({id,bytes,atlasEdits:edits.length})));

