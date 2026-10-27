import {CHAPTERS} from './story.js';
import {buildCinematicPlan} from './narrative-cinematics.js';
import {createConvoyMotion} from './convoy-motion.js';

const PI=Math.PI,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const rectanglesOverlap=(a,b,pad=0)=>a.minX<b.maxX+pad&&a.maxX>b.minX-pad&&a.minZ<b.maxZ+pad&&a.maxZ>b.minZ-pad;
export function footprint(spec){const c=Math.abs(Math.cos(spec.yaw||0)),s=Math.abs(Math.sin(spec.yaw||0)),hx=(spec.w*c+spec.d*s)/2,hz=(spec.w*s+spec.d*c)/2;return {minX:spec.x-hx,maxX:spec.x+hx,minZ:spec.z-hz,maxZ:spec.z+hz};}

const convoyCache=new Map();
// Use the production motion's entire mixed column, including extrapolated tail
// positions at t=0. Reserving only the leader's authored polyline missed these.
export function convoyClearanceBoxes(layout){
  const key=JSON.stringify([layout.chapter,layout.cinematic,layout.roads?.[0],layout.taskPositions,layout.facing,layout.spawn]);
  if(convoyCache.has(key))return convoyCache.get(key);
  const boxes=[],seen=new Set(),chapter=CHAPTERS[layout.chapter-1];
  for(const phase of ['opening','closing']){
    const plan=buildCinematicPlan({chapter,layout,phase});if(!plan.convoy)continue;
    const motion=createConvoyMotion(plan.convoy.config);
    for(let time=0;time<=plan.duration+.0001;time+=.25)for(let index=0;index<motion.formation.length;index++){
      const pose=motion.at(time,index),box=footprint({x:pose.position[0],z:pose.position[2],w:pose.type==='cargo-truck'?2.6:2.5,d:pose.length,yaw:pose.yaw});
      // Half a metre absorbs motion between samples and architectural overhang.
      for(const side of ['minX','minZ'])box[side]-=.55;for(const side of ['maxX','maxZ'])box[side]+=.55;
      const id=Object.values(box).map(v=>v.toFixed(2)).join(',');if(seen.has(id))continue;seen.add(id);boxes.push(box);
    }
  }
  convoyCache.set(key,boxes);return boxes;
}

function roadOverlaps(box,road,pad=1.1){
  const margin=road.width/2+pad,b={minX:box.minX-margin,maxX:box.maxX+margin,minZ:box.minZ-margin,maxZ:box.maxZ+margin};
  for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],end=road.points[i],delta=[end[0]-a[0],end[1]-a[1]];let lo=0,hi=1;
    for(const [p,d,min,max]of [[a[0],delta[0],b.minX,b.maxX],[a[1],delta[1],b.minZ,b.maxZ]]){
      if(Math.abs(d)<1e-8){if(p<min||p>max){lo=2;break;}}else{let u=(min-p)/d,v=(max-p)/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);}
    }if(lo<=hi)return true;
  }return false;
}

/** Plan visible, solid limits outside the walking ring, plus a few closed
 * service alleys and stepped rear wings. All interior additions avoid authored
 * roads, task/court access and the production convoy's complete swept bodies.
 */
export function planChapterBoundary(layout){
  const b=layout.bounds,camp=['military-camp','hangar-apron','base-hospital'].includes(layout.type),war=layout.enemySpawns.length>0,buildings=[],walls=[],occupied=[];
  const swept=convoyClearanceBoxes(layout),withinCore=box=>{const c=layout.coreBounds||layout.bounds;return rectanglesOverlap(box,{...c},3);};
  const addBuilding=spec=>{const result={...spec,boundary:true,style:spec.style||(camp?'camp':'apartment'),damage:spec.damage??(war?.25:.05),detail:spec.detail||'far',playable:true};buildings.push(result);occupied.push({...footprint(result),id:result.id});return result;};
  const addWall=spec=>{walls.push({...spec,boundary:true});occupied.push({...footprint(spec),id:spec.id});};
  const edges=[{name:'north',start:b.minX,end:b.maxX,fixed:b.minZ,yaw:0,axis:'x',sign:-1},{name:'south',start:b.minX,end:b.maxX,fixed:b.maxZ,yaw:PI,axis:'x',sign:1},{name:'west',start:b.minZ,end:b.maxZ,fixed:b.minX,yaw:PI/2,axis:'z',sign:-1},{name:'east',start:b.minZ,end:b.maxZ,fixed:b.maxX,yaw:-PI/2,axis:'z',sign:1}];
  for(const [edgeIndex,edge]of edges.entries()){
    const length=edge.end-edge.start,count=Math.ceil(length/20),weights=Array.from({length:count},(_,i)=>.86+((i*7+edgeIndex*3+layout.chapter)%9)*.035),sum=weights.reduce((a,c)=>a+c,0);let cursor=edge.start;
    for(let i=0;i<count;i++){
      const w=length*weights[i]/sum,at=cursor+w/2;cursor+=w;
      const wall=i>0&&i<count-1&&i%(camp?4:7)===(camp?1:4),depth=wall?.62:10.8+((i+edgeIndex)%3)*1.2;
      const outward=-.25+depth/2,fixed=edge.fixed+edge.sign*outward;
      const x=edge.axis==='x'?at:fixed,z=edge.axis==='x'?fixed:at,id=`boundary-${edge.name}-${i}`;
      if(wall){
        addWall({id,edge:edge.name,x,z,w:w+.10,d:depth,h:camp?2.8:3.0+(i%2)*.35,yaw:edge.yaw,kind:'closed-compound'});
        const behind=edge.fixed+edge.sign*(15.5+depth/2);
        addBuilding({id:id+'-rear',edge:edge.name,x:edge.axis==='x'?at:behind,z:edge.axis==='x'?behind:at,w:w+1.2,d:11.5,h:camp?5.3:10.0+((i+layout.chapter)%3)*2.7,yaw:edge.yaw,index:1100+edgeIndex*30+i});
      }else addBuilding({id,edge:edge.name,x,z,w:w+.10,d:depth,h:camp?4.0+(i%3)*.8:7.2+((i*2+edgeIndex+layout.chapter)%3)*3.1,yaw:edge.yaw,index:1000+edgeIndex*30+i,detail:i%5===2?'mid':'far'});
    }
  }
  const original=layout.buildings.map(o=>({...footprint(o),source:o})),protectedPoints=[layout.spawn,...layout.taskPositions,...(layout.expansion?.checkpoints||[]).flatMap(c=>[c.pos,c.entrance,c.road])];
  const clear=(box,ignore=[])=>!withinCore(box)&&!layout.roads.some(r=>roadOverlaps(box,r))&&!swept.some(s=>rectanglesOverlap(box,s,.3))&&!original.some(o=>!ignore.includes(o.source)&&rectanglesOverlap(box,o,.2))&&!occupied.some(o=>rectanglesOverlap(box,o,.2))&&!protectedPoints.some(p=>p[0]>box.minX-2&&p[0]<box.maxX+2&&p[1]>box.minZ-2&&p[1]<box.maxZ+2);
  // Behind low shops, a narrower upper volume fills the exposed skyline while
  // leaving all streets open. It attaches to the existing rear wall, not to a
  // floating roof or an arbitrary mid-street obstacle.
  let rearCount=0;
  for(const lot of layout.buildings.filter(o=>o.district&&o.style!=='courtyard'&&o.h<4.9).sort((a,c)=>c.w*c.d-a.w*a.d)){
    if(rearCount>=(camp?3:9))break;
    const spec={id:`inset-rear-${rearCount}`,edge:'interior',x:lot.x,z:lot.z-lot.d/2-3.05,w:clamp(lot.w*.82,6,14),d:6.5,h:camp?5.2:9.0+(rearCount%3)*2.4,yaw:0,index:1400+rearCount,detail:'mid'};
    const box=footprint(spec);if(box.minX<b.minX+3||box.maxX>b.maxX-3||box.minZ<b.minZ+3||box.maxZ>b.maxZ-3||!clear(box,[lot]))continue;
    addBuilding(spec);rearCount++;
  }
  // Close non-route service gaps at the back of paired buildings. These are
  // visibly shut yards; no invisible blocker is left across an open alley.
  const lots=layout.buildings.filter(o=>o.district&&o.style!=='courtyard'),used=new Set();let gates=0;
  for(let i=0;i<lots.length&&gates<(camp?4:12);i++)for(let j=i+1;j<lots.length&&gates<(camp?4:12);j++){
    const left=lots[i].x<lots[j].x?lots[i]:lots[j],right=left===lots[i]?lots[j]:lots[i],a=footprint(left),c=footprint(right),gap=c.minX-a.maxX,back=Math.max(a.minZ,c.minZ),front=Math.min(a.maxZ,c.maxZ);
    if(gap<1.4||gap>7.5||front-back<5||used.has(left)||used.has(right))continue;
    const spec={id:`closed-service-yard-${gates}`,edge:'interior',kind:'closed-yard',x:(a.maxX+c.minX)/2,z:back+.35,w:gap+.14,d:.36,h:2.6,yaw:0},box=footprint(spec);
    if(!clear(box,[left,right]))continue;addWall(spec);used.add(left);used.add(right);gates++;
  }
  return {buildings,walls,occupied,convoySweeps:swept.length,innerRearBuildings:rearCount,closedServiceYards:gates,edges:edges.map(e=>e.name)};
}

export function buildChapterBoundary({layout,plan=planChapterBoundary(layout),district,box,line,materials,colliders,stats}){
  const {plaster,concrete,exposed,wood,rusty,metal}=materials,before=district.inspect();
  for(const spec of plan.buildings){
    const made=district.building(spec);
    // Footings cover small terrain ruts at the sealed base. Windows and roof
    // details still come from the shared recessed-volume building builder.
    box(spec.w,.52,spec.d,exposed,spec.x,.18,spec.z,spec.yaw);
    for(const solid of made.collisionBoxes)colliders.push({...solid,boundary:true,boundaryId:spec.id});
  }
  for(const [i,spec]of plan.walls.entries()){
    const c=Math.cos(spec.yaw),s=Math.sin(spec.yaw),at=(u,y,v=0)=>[spec.x+u*c+v*s,y,spec.z-u*s+v*c],mat=plaster[i%plaster.length];
    box(spec.w,spec.h,spec.d,mat,spec.x,spec.h/2,spec.z,spec.yaw);box(spec.w+.12,.14,spec.d+.14,exposed,...at(0,spec.h+.04),spec.yaw);
    const gate=Math.min(spec.w-.6,4.5);box(gate,2.35,.10,wood,...at(0,1.175,spec.d/2+.055),spec.yaw);
    for(const side of[-1,1])box(.34,spec.h+.3,spec.d+.2,concrete,...at(side*(gate/2+.15),(spec.h+.3)/2),spec.yaw);
    for(const y of[.5,1.8])box(gate,.09,.14,rusty,...at(0,y,spec.d/2+.12),spec.yaw);
    line(at(-gate*.42,.5,spec.d/2+.17),at(gate*.42,1.8,spec.d/2+.17),.035,metal);
    colliders.push({...footprint(spec),minY:0,maxY:spec.h+.14,material:'masonry',boundary:true,boundaryId:spec.id});
  }
  stats.visibleBoundary={buildings:plan.buildings.length,walls:plan.walls.length,closedServiceYards:plan.closedServiceYards,innerRearBuildings:plan.innerRearBuildings,triangles:district.inspect().triangles-before.triangles+plan.walls.length*112+plan.buildings.length*12,edges:plan.edges,convoySweepBoxes:plan.convoySweeps};
  return plan;
}
