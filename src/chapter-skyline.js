import * as THREE from 'three';
import {CHAPTERS} from './story.js';
import {placeCampaignTasks} from './campaign-tasks.js';
import {buildStreetPopulation} from './street-population.js';
import {createNavigator} from './actor-behavior.js';
import {convoyClearanceBoxes,footprint,rectanglesOverlap} from './chapter-boundary.js';
import {lineBlocked} from './simulation.js';

const clamp=THREE.MathUtils.clamp,PI=Math.PI;
const hash=(x,z,seed=0)=>{let n=(Math.imul(Math.round(x*11),73856093)^Math.imul(Math.round(z*13),19349663)^Math.imul(seed+1,83492791))>>>0;n=Math.imul(n^(n>>>13),1274126177)>>>0;return(n^(n>>>16))>>>0;};
const segmentDistance=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);};
const pathHits=(a,b,box,pad=0)=>lineBlocked({x:a[0],z:a[1]},{x:b[0],z:b[1]},[{minX:box.minX-pad,maxX:box.maxX+pad,minZ:box.minZ-pad,maxZ:box.maxZ+pad}]);
const pointGap=(p,b)=>Math.hypot(Math.max(b.minX-p[0],0,p[0]-b.maxX),Math.max(b.minZ-p[1],0,p[1]-b.maxZ));
const campChapter=layout=>['military-camp','hangar-apron','base-hospital'].includes(layout.type);

// Stable height variation is independent of the shared scenery RNG. A shorter
// foreground roof reveals taller, recessed middle and far volumes behind it.
export function skylineBackgroundProfile(layout,lot,index){
 const code=hash(lot.x,lot.z,layout.chapter),camp=campChapter(layout),near=lot.edge<38;
 const cityHeights=near?[4.5,7.2,10.8,14.5,8.7,16.4,5.8]:[9.4,15.8,20.6,12.4,17.9,7.3,22.2];
 const h=camp?[3.1,4.2,5.8,3.6,7.0][code%5]:cityHeights[code%cityHeights.length]+((code>>>4)%5)*.17;
 return{h,style:camp?'camp':h>10.5?'apartment':code%3?'shop-house':'workshop',detail:near?'mid':'far',damage:camp?0:layout.enemySpawns.length?(code%5===0?.68:code%3===0?.36:.12):.06,setbackFactor:camp?1:[.62,.72,.82,.9][(code>>>7)%4],roofProfile:true,index};
}

export function planStreetInfill(layout,colliders,storySets){
 if(['restricted-cockpit','interior-triage'].includes(layout.type))return{buildings:[],reservedPaths:[],protectedTasks:[],why:'interior or restricted scene'};
 const camp=campChapter(layout),convoy=convoyClearanceBoxes(layout),chapter=placeCampaignTasks(CHAPTERS[layout.chapter-1],layout,colliders),nav=createNavigator({radius:.48});nav.setBounds(layout.bounds);nav.setColliders(colliders);
 const tasks=chapter.tasks.map(t=>({id:t.id,pos:[...t.pos]})),protectedPoints=[layout.spawn,...tasks.map(t=>t.pos),...layout.enemySpawns.map(e=>e.pos)],reservedPaths=[];
 const route=(start,end)=>{const path=nav.findPath({x:start[0],z:start[1]},{x:end[0],z:end[1]},100000);let previous=start;for(const p of path){const next=[p.x,p.z];reservedPaths.push([previous,next]);previous=next;}};
 let previous=layout.spawn;for(const task of tasks){route(previous,task.pos);previous=task.pos;}
 for(const c of layout.expansion?.checkpoints||[]){route(layout.spawn,c.pos);reservedPaths.push([c.road,c.entrance],[c.entrance,c.pos]);}
 const population=buildStreetPopulation({...layout,taskPositions:tasks.map(t=>t.pos)},colliders);for(const r of population.residents){protectedPoints.push(r.pos,r.shelter);reservedPaths.push([r.pos,r.shelter]);}
 for(const b of layout.route.slice(1).map((end,i)=>[layout.route[i],end]))reservedPaths.push(b);
 const originalBounds=(layout.buildings||[]).map(footprint),occupied=[...colliders],storyBounds=(storySets?.architecture||[]).map(a=>({minX:a.position[0]-Math.max(a.width,a.depth)/2-1,maxX:a.position[0]+Math.max(a.width,a.depth)/2+1,minZ:a.position[2]-Math.max(a.width,a.depth)/2-1,maxZ:a.position[2]+Math.max(a.width,a.depth)/2+1}));
 const roads=layout.roads.filter(r=>!r.expansion),candidates=[];
 for(const [ri,r]of roads.entries())for(let i=1;i<r.points.length;i++){
  const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<7)continue;const ux=dx/length,uz=dz/length;
  for(let t=4;t<length-3;t+=8)for(const side of[-1,1])for(const depth of[7.4,10.5,6.0]){
   const width=camp?9.4:10.5+((ri+i+Math.floor(t))%3)*1.4,offset=r.width/2+depth/2+3.1;
   const x=a[0]+ux*t+uz*side*offset,z=a[1]+uz*t-ux*side*offset,yaw=Math.atan2(-uz*side,ux*side),code=hash(x,z,layout.chapter),h=camp?3.2+(code%4)*.6:[3.4,6.7,9.8,13.2,5.2,8.3][code%6];
   const roadDistance=Math.min(...roads.flatMap(s=>s.points.slice(1).map((v,j)=>segmentDistance([x,z],s.points[j],v))));
   candidates.push({id:`infill-${ri}-${i}-${Math.round(t)}-${side}-${depth}`,x,z,w:width,d:depth,h,yaw,style:camp?'camp':h>9?'apartment':code%2?'shop-house':'workshop',detail:'mid',damage:camp?0:layout.enemySpawns.length?(code%4===0?.65:.22):.06,playable:true,setbackFactor:.66+(code%4)*.07,score:roadDistance+Math.hypot(x-layout.spawn[0],z-layout.spawn[1])*.12+(depth<7?2:0),code});
  }
 }
 // Inside large original cores, secondary empty lots behind the first frontage
 // must be occupied too; the authored core rectangle is not a vacant plaza.
 const core=layout.coreBounds||layout.bounds;
 for(let x=core.minX+8;x<core.maxX-7;x+=8)for(let z=core.minZ+8;z<core.maxZ-7;z+=8){
  const distance=Math.min(...roads.flatMap(r=>r.points.slice(1).map((b,i)=>segmentDistance([x,z],r.points[i],b))));if(distance<11||distance>(layout.chapter===15?52:34))continue;
  const code=hash(x,z,layout.chapter),h=camp?3.4+(code%3)*.7:[4.8,7.5,11.5,14.1,6.1][code%5];
  candidates.push({id:`infill-core-${x}-${z}`,x,z,w:camp?9.5:11.4,d:camp?7.0:9.3,h,yaw:code%2?0:PI/2,style:camp?'camp':h>9?'apartment':'shop-house',detail:'mid',damage:camp?0:layout.enemySpawns.length?(code%4===0?.55:.16):.05,playable:true,setbackFactor:.68+(code%4)*.06,score:distance+Math.hypot(x-layout.spawn[0],z-layout.spawn[1])*.07,code});
 }
 const limit=camp?6:layout.chapter===15?18:12,buildings=[];candidates.sort((a,b)=>a.score-b.score);
 for(const candidate of candidates){if(buildings.length>=limit)break;const body=footprint(candidate),margin=1.85,bounds={minX:body.minX-margin,maxX:body.maxX+margin,minZ:body.minZ-margin,maxZ:body.maxZ+margin};
  if(bounds.minX<layout.bounds.minX+3||bounds.maxX>layout.bounds.maxX-3||bounds.minZ<layout.bounds.minZ+3||bounds.maxZ>layout.bounds.maxZ-3)continue;
  if([...occupied,...originalBounds,...storyBounds].some(b=>rectanglesOverlap(bounds,b,.35))||convoy.some(b=>rectanglesOverlap(bounds,b,.35)))continue;
  if(protectedPoints.some(p=>pointGap(p,bounds)<2.0)||reservedPaths.some(([a,b])=>pathHits(a,b,bounds,1.1)))continue;
  if(layout.roads.some(r=>r.points.slice(1).some((b,i)=>pathHits(r.points[i],b,bounds,r.width/2+.35))))continue;
  buildings.push(candidate);occupied.push(bounds);
 }
 return{buildings,reservedPaths,protectedTasks:tasks,protectedResidents:population.residents.length,convoySamples:convoy.length};
}

// Only already emitted roof slabs can support a rooftop room. Core roofs
// have their own metadata so combat rooftop IDs and selection stay unchanged.
export function supportedSkylineRoofs(layout,roofSurfaces=[],coreRoofSupports=[]){
 return layout.buildings.flatMap(b=>{
  if(b.ruin||(b.damage??(b.damaged?.7:0))>.30||b.interior||b.style==='courtyard'||b.style==='hangar'||b.style==='barracks'||b.w<8||b.d<8)return[];
  const candidates=b.district?roofSurfaces:coreRoofSupports,roof=candidates.find(r=>r.solid&&r.flat&&r.source?.x===b.x&&r.source?.z===b.z&&Math.abs(r.height-((b.y||0)+b.h+(b.district?.175:.18)))<.03);
  return roof?[{building:b,height:roof.height,bounds:{...roof.bounds},source:b.district?'emitted-district-slab':'emitted-core-slab'}]:[];
 });
}

export function buildChapterSkyline(layout,{district,colliders,box,line,add,palette,sampleHeight=()=>0,storySets,stats}){
 const camp=campChapter(layout),indoor=['restricted-cockpit','interior-triage'].includes(layout.type),p=palette,plan=planStreetInfill(layout,colliders,storySets),infill=[],roofLayers=[];
 const before=district.inspect();let fixtures=0;
 for(const [i,spec]of plan.buildings.entries()){
  const y=sampleHeight(spec.x,spec.z),made=district.building({...spec,y,index:1800+layout.chapter*37+i,zone:spec.style==='workshop'?'workshop':spec.style==='shop-house'?'market':undefined});
  for(const b of made.collisionBoxes)colliders.push({...b,streetInfill:true,infillId:spec.id});
  // A footing sinks into the sampled terrain. New half-metre shoulder relief
  // cannot leave an unsealed ground-level gap under the street frontage.
  box(spec.w,.65,spec.d,p.exposed,spec.x,y-.18,spec.z,spec.yaw);
  const c=Math.cos(spec.yaw),s=Math.sin(spec.yaw),at=(u,yy,v)=>[spec.x+u*c+v*s,y+yy,spec.z-u*s+v*c];
  if(!camp&&spec.h<8){
   const height=2.85,span=Math.min(7.5,spec.w*.72);for(const side of[-1,1])line(at(side*span/2,height,.5+spec.d/2),at(side*span/2,height,-.2+spec.d/2),.045,p.metal);
   // Built-out shop fascia, varied shutters and deep awning generate a real
   // wall of street activity, not a carpet of tiny loose props in open sand.
   box(span,.25,.16,p.wood,...at(0,height,spec.d/2+.75),spec.yaw);fixtures++;
  }
  infill.push({id:spec.id,position:[spec.x,y,spec.z],w:spec.w,d:spec.d,h:spec.h,yaw:spec.yaw,style:spec.style,bounds:footprint(spec),triangles:made.triangles});
 }
 // Recessed roof wings are placed only on already solid, non-enterable lots.
 // Their ground projection stays wholly inside existing collision footprints.
 const roofs=supportedSkylineRoofs(layout,stats?.roofSurfaces||[],stats?.coreRoofSupports||[]).sort((a,b)=>Math.hypot(a.building.x-layout.spawn[0],a.building.z-layout.spawn[1])-Math.hypot(b.building.x-layout.spawn[0],b.building.z-layout.spawn[1]));
 for(const [index,support]of roofs.entries()){
  const b=support.building;
  const code=hash(b.x,b.z,layout.chapter),isCore=!b.district;if(indoor&&!b.district)continue;if(camp&&index%3!==1)continue;if(!isCore&&code%4!==0)continue;
  if(roofLayers.length>=(camp?5:18))break;
  const width=clamp(b.w*(.43+(code%3)*.06),5,12.5),depth=clamp(b.d*(.40+((code>>>3)%3)*.07),5,13.5),dx=(code%2?1:-1)*Math.min((b.w-width)/2-.4,b.w*.12),dz=-Math.min((b.d-depth)/2-.4,b.d*.13),x=b.x+dx,z=b.z+dz;
  if(width>b.w-1||depth>b.d-1)continue;
  const footprint={minX:x-width/2,maxX:x+width/2,minZ:z-depth/2,maxZ:z+depth/2};
  if(footprint.minX<support.bounds.minX+.12||footprint.maxX>support.bounds.maxX-.12||footprint.minZ<support.bounds.minZ+.12||footprint.maxZ>support.bounds.maxZ-.12)continue;
  const h=camp?2.8:code%5===0?8.0:code%3===0?5.8:3.15,y=support.height;
  const spec={x,z,w:width,d:depth,h,y,index:2200+layout.chapter*31+index,style:camp?'camp':'apartment',detail:'far',damage:!camp&&layout.enemySpawns.length&&code%5===0?.55:.03,setbackFactor:.66+(code%3)*.08,roofProfile:true};
  const made=district.building(spec);for(const bound of made.collisionBoxes)colliders.push({...bound,skylineRoof:true,ground:false});
  // Compact roof functions diversify silhouettes without implausible towers.
  if(code%3===0){const r=.48,tx=x-width*.25,tz=z-depth*.2;add(new THREE.CylinderGeometry(r,r,.9,10),p.rusty,[tx,y+h+.65,tz]);box(1.2,.15,1.2,p.concrete,tx,y+h+.17,tz);line([tx+.46,y+h+.65,tz],[tx+.73,y+h+.65,tz],.035,p.metal);line([tx+.73,y+h+.65,tz],[tx+.73,b.h+.2,tz],.035,p.metal);}
  else if(code%3===1){for(const side of[-1,1])line([x+side*width*.35,y+h+.2,z],[x+side*width*.35,y+h+1.45,z],.035,p.wood);line([x-width*.35,y+h+1.45,z],[x+width*.35,y+h+1.45,z],.016,p.rusty);for(let n=0;n<3;n++)box(.55,.75,.04,p.cloth,x-width*.22+n*width*.22,y+h+.95,z,0,0,.04*(n-1));}
  roofLayers.push({parent:[b.x,b.z],support:{source:support.source,height:support.height,bounds:{...support.bounds}},position:[x,y,z],w:width,d:depth,height:h,totalHeight:y+h,originalHeight:b.h,kind:camp?'camp-service-roof':h>5?'stepped-upper-storeys':'recessed-roof-room'});
 }
 const result={version:1,streetInfill:infill,roofLayers,protectedTaskIds:plan.protectedTasks.map(t=>t.id),protectedResidentPaths:plan.protectedResidents||0,convoySweepSamples:plan.convoySamples||0,extraTriangles:district.inspect().triangles-before.triangles,frontageFixtures:fixtures,indoor,camp};
 if(stats)stats.skyline=result;return result;
}
