import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sharp=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root='artifacts/model-upgrade-v0.6',views=['rear-quarter','side-right','hip','reload-out'];
for(const id of ['ak','m249']){
 const tiles=[];let labels='';
 for(let row=0;row<2;row++)for(let col=0;col<4;col++){
  const mode=row?'after':'before',v=views[col];
  const img=await sharp(path.join(root,mode,`${id}-${v}.png`)).extract({left:220,top:220,width:1220,height:780}).resize(610,390).png().toBuffer();
  tiles.push({input:img,left:col*610,top:60+row*430});
  labels+=`<text x="${col*610+16}" y="${row*430+86}" fill="#e7e7df" font-size="19">${row?'v0.6':'v0.5'} · ${v}</text>`;
 }
 const svg=Buffer.from(`<svg width="2440" height="920"><text x="20" y="36" font-family="Arial" font-size="28" fill="white">${id==='ak'?'AKM':'M249'} — same camera / lighting · authored pose comparison</text><g font-family="Arial">${labels}</g></svg>`);
 await sharp({create:{width:2440,height:920,channels:4,background:'#292f2c'}}).composite([...tiles,{input:svg}]).png().toFile(path.join(root,`${id}-comparison.png`));
}
const before=JSON.parse(fs.readFileSync(path.join(root,'before/report.json'))),after=JSON.parse(fs.readFileSync(path.join(root,'after/report.json')));
const keys=['grips','muzzle','sight','sightPitch','hipPosition','adsDepth'];let checks=[];
for(const id of ['ak','m249'])for(const key of keys){const a=before.frames.find(f=>f.weapon===id).metadata[key],b=after.frames.find(f=>f.weapon===id).metadata[key];if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`Changed ${id} ${key}`);checks.push(`${id}.${key}`);}
fs.writeFileSync(path.join(root,'weapon-contract-checks.json'),JSON.stringify({anchorMetadataUnchanged:checks,errors:[...before.errors,...after.errors],frames:before.frames.length+after.frames.length},null,2));
console.log('Comparison sheets and unchanged-anchor check written.');
