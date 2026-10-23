import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
const base=path.resolve('tools/models/makehuman'),target=path.join(base,'system-assets');
const entries=JSON.parse(fs.readFileSync(path.join(base,'asset-zip-index.json'),'utf8'));
const url='https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip';
const pattern=new RegExp(process.argv[2]||'^(skins/(young_caucasian_male|middleage_african_male)/|eyes/|eyebrows/eyebrow001/|hair/short03/|clothes/male_casualsuit01/)');
const selected=entries.filter(e=>e.compressed>0&&pattern.test(e.name));
let index=0;const manifest=[];
async function worker(){while(index<selected.length){const entry=selected[index++],file=path.resolve(target,entry.name);if(!file.startsWith(target+path.sep))throw Error('Archive path outside target');
  let data;if(fs.existsSync(file)&&fs.statSync(file).size===entry.bytes)data=fs.readFileSync(file);else{const end=Math.min(280737769,entry.offset+entry.compressed+4096),response=await fetch(url,{headers:{Range:`bytes=${entry.offset}-${end}`}});if(response.status!==206)throw Error(`Range status ${response.status}`);const chunk=Buffer.from(await response.arrayBuffer());if(chunk.readUInt32LE(0)!==0x04034b50)throw Error('Bad ZIP header: '+entry.name);const start=30+chunk.readUInt16LE(26)+chunk.readUInt16LE(28),packed=chunk.subarray(start,start+entry.compressed);data=entry.method===8?zlib.inflateRawSync(packed):packed;if(data.length!==entry.bytes)throw Error('Bad unpacked size: '+entry.name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);}
  manifest.push({...entry,sha256:crypto.createHash('sha256').update(data).digest('hex')});console.log(entry.name+' '+data.length);
}}
await Promise.all(Array.from({length:8},worker));
fs.writeFileSync(path.join(base,'download-manifest-'+Date.now()+'.json'),JSON.stringify({source:url,sourcePage:'https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html',license:'https://creativecommons.org/publicdomain/zero/1.0/',files:manifest},null,2));
