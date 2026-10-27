import * as THREE from 'three';
import {createGroundSurface} from '../../src/ground-surface.js';
import {getChapterLayout} from '../../src/chapter-layouts.js';
const cache=new Map();
// The production triangle-height sampler with production road extensions.
// Geometry is constructed then disposed on CPU; no image or WebGL work occurs.
export function chapterGround(id){
 if(cache.has(id))return cache.get(id);
 const layout=getChapterLayout(id),bounds=layout.bounds,camp=['military-camp','hangar-apron','base-hospital'].includes(layout.type),extensions=[];
 const roads=layout.roads.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,width:r.width,surface:r.surface,expansion:!!r.expansion})));
 for(const r of layout.roads){if(r.points.length<2||Math.hypot(r.points[0][0]-r.points.at(-1)[0],r.points[0][1]-r.points.at(-1)[1])<.1)continue;for(const start of[true,false]){
  const p=start?r.points[0]:r.points.at(-1),q=start?r.points[1]:r.points.at(-2),dx=p[0]-q[0],dz=p[1]-q[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length,boundary=ux>0?bounds.maxX-p[0]:ux<0?p[0]-bounds.minX:uz>0?bounds.maxZ-p[1]:p[1]-bounds.minZ;if(boundary>19)continue;
  const end=[p[0]+ux*(boundary+22),p[1]+uz*(boundary+22)],side=extensions.length%2?1:-1,turn=[end[0]+uz*side*43,end[1]-ux*side*43],last=[turn[0]+ux*37,turn[1]+uz*37];for(const[a,b,width]of[[p,end,r.width],[end,turn,Math.max(7,r.width*.75)],[turn,last,8]])extensions.push({a,b,width,surface:camp?'sand':'road',background:true});
 }}roads.push(...extensions);
 const routeDistance=(x,z)=>{let distance=Infinity;for(let i=1;i<layout.route.length;i++){const a=layout.route[i-1],b=layout.route[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}return distance;};
 const allocated=[],material=options=>{const m=new THREE.MeshStandardMaterial(options);allocated.push(m);return m;},palette=Object.fromEntries(['road','concrete','sand','exposed','metal'].map(k=>[k,material({})])),stats={};
 const surface=createGroundSurface({layout,roads,routeDistance,palette,material,stats,add:g=>g.dispose(),box:()=>{}});for(const m of allocated)m.dispose();cache.set(id,surface.sampleHeight);return surface.sampleHeight;
}
