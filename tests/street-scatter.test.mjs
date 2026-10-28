import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {planStreetScatter,buildStreetScatter} from '../src/street-scatter.js';import {getChapterLayout} from '../src/chapter-layouts.js';import {footprint,rectanglesOverlap} from '../src/chapter-boundary.js';
const obstacles=layout=>layout.buildings.map(b=>({...footprint(b),minY:0,maxY:b.h}));

test('street groups are deterministic, context-specific and avoid actual protected corridor and convoy footprints',()=>{
 for(const id of[1,2,3,4,6,7,9,10,11,15,16]){const layout=getChapterLayout(id),colliders=obstacles(layout),a=planStreetScatter(layout,{colliders}),b=planStreetScatter(layout,{colliders});assert.deepEqual(a.sites,b.sites);assert(a.sites.length>=20,'meaningful ground density in chapter '+id);
  for(const site of a.sites){assert(!a.convoy.some(p=>rectanglesOverlap(site.bounds,p,.19)));assert(!a.protectedBoxes.some(p=>rectanglesOverlap(site.bounds,p,.54)));assert(!colliders.some(p=>rectanglesOverlap(site.bounds,p,.12)));}
  if([2,3,16].includes(id))assert(a.sites.every(s=>['supply','drain'].includes(s.kind)),'camp has supplies and maintained edges rather than war rubble');
  if([1,11].includes(id))assert(a.sites.every(s=>['domestic','drain'].includes(s.kind)),'care areas retain domestic/supply objects');
  if(id===7)assert(a.sites.some(s=>s.kind==='market'));
 }
});

test('real 3D street clusters use at most six shared material batches and a fixed triangle budget',()=>{
 const layout=getChapterLayout(15),colliders=obstacles(layout),palette=Object.fromEntries(['exposed','brickEdge','wood','rusty','rubber','cloth'].map(k=>[k,new THREE.MeshStandardMaterial()])),geometries=[];
 const sampleHeight=(x,z)=>x*.012+z*.008,stats={},baseCount=colliders.length;
 const result=buildStreetScatter(layout,{palette,colliders,sampleHeight,stats,add(g,m,p,r){geometries.push({g,m,p,r});}});
 assert.equal(result,stats.streetScatter);assert(result.clusters>35);assert(result.smallFragments>300);assert(result.triangles>10000&&result.triangles<=39000);assert(result.materialBatches<=6);assert.equal(new Set(geometries.map(v=>v.m)).size,result.materialBatches);assert.equal(geometries.reduce((n,{g})=>n+(g.index?.count||g.attributes.position.count)/3,0),result.triangles);
 assert.equal(colliders.length-baseCount,result.solidProps);for(const s of result.sites){assert.equal(s.position[1],sampleHeight(s.position[0],s.position[2]));const body=colliders.find(b=>b.scatterId===s.id);if(s.solidHeight){assert(body?.streetScatter);assert(body.maxY>s.position[1]+s.solidHeight);}else assert(!body);}
 const flat=geometries.filter(({g})=>g.type==='PlaneGeometry');assert(flat.length>4);assert(new Set(flat.map(({r})=>r[1].toFixed(2))).size>2);for(const {g,p,r}of flat){const transformed=g.clone();transformed.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)));transformed.translate(...p);transformed.computeBoundingBox();assert(transformed.boundingBox.max.y-transformed.boundingBox.min.y<.12,'cloth and bent sheet metal remain horizontal after local tilt and world yaw');transformed.dispose();}
 assert(geometries.some(({g})=>g.type==='TorusGeometry'),'actual tyres or basket rims retain holes');assert(geometries.some(({g})=>g.type==='BoxGeometry'));assert(geometries.some(({g})=>g.type==='IcosahedronGeometry'));
 for(const {g}of geometries)g.dispose();Object.values(palette).forEach(m=>m.dispose());
});

test('cinematic landing, casualty floor and cockpit interior remain physically empty',()=>{
 for(const [id,regions]of[[4,[{minX:-4,maxX:4,minZ:29,maxZ:37}]],[10,[{minX:-27,maxX:-21,minZ:27,maxZ:33},{minX:-25,maxX:-19,minZ:25,maxZ:31}]],[9,[{minX:-7,maxX:7,minZ:-7,maxZ:9}]]]){
  const l=getChapterLayout(id),plan=planStreetScatter(l,{colliders:obstacles(l)});for(const region of regions){assert(plan.sites.every(s=>!rectanglesOverlap(s.bounds,region)));for(let x=region.minX;x<=region.maxX;x++)for(let z=region.minZ;z<=region.maxZ;z++)assert.equal(plan.allowSmall(x,z),false,'even small chips must not invade protected actor landings');}
 }
});
