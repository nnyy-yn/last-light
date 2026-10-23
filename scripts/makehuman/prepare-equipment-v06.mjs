// Publish only the three edited garment meshes into the original v0.5 GLB.
// Skeleton nodes, inverse binds, skin/eye maps, boots, hands and animation data
// remain byte-identical. The independent Blender helmet embeds its own maps.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sharp=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'character-sources/makehuman/v0.6');
function read(file){const b=fs.readFileSync(file),n=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+n)),bin=b.subarray(28+n);return{g,views:g.bufferViews.map(v=>Buffer.from(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)))};}
function save(file,{g,views}){
  let offset=0;const chunks=[];for(let i=0;i<views.length;i++){const v=views[i];g.bufferViews[i]={...g.bufferViews[i],buffer:0,byteOffset:offset,byteLength:v.length};chunks.push(v);offset+=v.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}}
  g.buffers=[{byteLength:offset}];const bin=Buffer.concat(chunks),raw=Buffer.from(JSON.stringify(g)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),b=Buffer.alloc(28+json.length+bin.length);
  b.writeUInt32LE(0x46546c67);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(json.length,12);b.writeUInt32LE(0x4e4f534a,16);json.copy(b,20);b.writeUInt32LE(bin.length,20+json.length);b.writeUInt32LE(0x004e4942,24+json.length);bin.copy(b,28+json.length);fs.writeFileSync(file,b);return{bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};
}
function compact(d){
  const g=d.g,used=new Set();for(const m of g.meshes||[])for(const p of m.primitives){Object.values(p.attributes).forEach(i=>used.add(i));if(p.indices!==undefined)used.add(p.indices);for(const t of p.targets||[])Object.values(t).forEach(i=>used.add(i));}for(const s of g.skins||[])if(s.inverseBindMatrices!==undefined)used.add(s.inverseBindMatrices);for(const a of g.animations||[])for(const s of a.samplers){used.add(s.input);used.add(s.output);}
  const remap=new Map([...used].sort((a,b)=>a-b).map((x,i)=>[x,i]));g.accessors=[...remap.keys()].map(i=>g.accessors[i]);
  for(const m of g.meshes||[])for(const p of m.primitives){for(const k of Object.keys(p.attributes))p.attributes[k]=remap.get(p.attributes[k]);if(p.indices!==undefined)p.indices=remap.get(p.indices);for(const t of p.targets||[])for(const k of Object.keys(t))t[k]=remap.get(t[k]);}for(const s of g.skins||[])if(s.inverseBindMatrices!==undefined)s.inverseBindMatrices=remap.get(s.inverseBindMatrices);for(const a of g.animations||[])for(const s of a.samplers){s.input=remap.get(s.input);s.output=remap.get(s.output);}
  const vu=new Set(g.accessors.map(a=>a.bufferView));for(const im of g.images||[])vu.add(im.bufferView);const vm=new Map([...vu].sort((a,b)=>a-b).map((x,i)=>[x,i]));g.bufferViews=[...vm.keys()].map(i=>g.bufferViews[i]);d.views=[...vm.keys()].map(i=>d.views[i]);for(const a of g.accessors)a.bufferView=vm.get(a.bufferView);for(const im of g.images||[])im.bufferView=vm.get(im.bufferView);return d;
}
const base=read(path.join(root,'artifacts/model-upgrade-v0.6/before/makehuman-soldier.glb')),edited=read(path.join(out,'soldier-equipment.glb'));
const joints=g=>g.skins[0].joints.map(i=>g.nodes[i].name);assert.deepEqual(joints(base.g),joints(edited.g));assert.equal(joints(base.g).length,52);
const report={editedMeshes:[],rigPreservation:'Original node graph, joints and inverse-bind buffer retained; only selected garment primitive accessors replaced.'};
for(const id of [103,105,107]){
  const name=`MakeHuman_soldier_military_Object_${id}`,bn=base.g.nodes.find(n=>n.name===name),en=edited.g.nodes.find(n=>n.name===name);assert.ok(bn&&en);for(const k of ['matrix','translation','rotation','scale'])assert.deepEqual(bn[k],en[k],`${name} ${k} changed`);
  const m=structuredClone(edited.g.meshes[en.mesh]);let tri=0;
  for(const p of m.primitives){
    const materialName=edited.g.materials[p.material].name;p.material=base.g.materials.findIndex(x=>x.name===materialName);assert.ok(p.material>=0);
    for(const key of [...Object.keys(p.attributes),'INDICES']){
      const index=key==='INDICES'?p.indices:p.attributes[key];if(index===undefined)continue;const a=structuredClone(edited.g.accessors[index]),view=structuredClone(edited.g.bufferViews[a.bufferView]);
      assert.ok(!view.byteStride,'Expected tightly packed Blender export');base.views.push(edited.views[a.bufferView]);a.bufferView=base.g.bufferViews.length;base.g.bufferViews.push(view);const n=base.g.accessors.length;base.g.accessors.push(a);if(key==='INDICES'){p.indices=n;tri+=a.count/3;}else p.attributes[key]=n;
    }
  }
  base.g.meshes[bn.mesh]=m;report.editedMeshes.push({node:name,triangles:tri});
}
base.g.asset.extras={...base.g.asset.extras,equipmentRevision:'v0.6 original rig; locally refined collar, vest neckline and pouch flaps'};
const soldierFile=path.join(root,'public/assets/makehuman-soldier.glb');report.soldier=save(soldierFile,compact(base));
const h=read(path.join(out,'pasgt-field-helmet.glb'));
for(const im of h.g.images||[]){const normal=/normal/i.test(im.name||'');h.views[im.bufferView]=await sharp(h.views[im.bufferView]).webp(normal?{lossless:true,effort:6}:{quality:94,effort:6}).toBuffer();im.mimeType='image/webp';}
for(const t of h.g.textures||[]){if(t.source!==undefined){t.extensions={...t.extensions,EXT_texture_webp:{source:t.source}};delete t.source;}}
h.g.extensionsUsed=[...new Set([...(h.g.extensionsUsed||[]),'EXT_texture_webp'])];h.g.extensionsRequired=[...new Set([...(h.g.extensionsRequired||[]),'EXT_texture_webp'])];
h.g.asset.copyright='Original PASGT-style accessory geometry and procedural textures authored for Last Light; historical style study, not a measured museum replica.';
const helmetFile=path.join(root,'public/assets/pasgt-field-helmet.glb');report.helmet={...save(helmetFile,h),triangles:h.g.meshes.reduce((n,m)=>n+m.primitives.reduce((n,p)=>n+h.g.accessors[p.indices].count/3,0),0),materials:h.g.materials.length,primitives:h.g.meshes.reduce((n,m)=>n+m.primitives.length,0),images:h.g.images.length};
fs.writeFileSync(path.join(out,'runtime-equipment-manifest.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
