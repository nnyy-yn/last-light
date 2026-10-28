import {blocked,lineBlocked} from './simulation.js';
import {planEnemySupport} from './enemy-support.js';

// Population is placed after scenery: shelter, cover edges and reserve approach
// paths are checked against the same colliders used by walking and shooting.
export function buildStreetPopulation(layout,colliders=[],{sceneState,groundHeight}={}){
  const inhabited=['civilian-courtyard','narrow-t-street','walled-compound','crash-plaza','market-dogleg','convoy-switchback','crash-perimeter','night-courtyard','relief-avenue','recovery-lane','dawn-switchbacks'].includes(layout.type);
  const war=layout.enemySpawns.length>0;
  if(!inhabited&&!war&&!layout.expansion)return {residents:[],contacts:[],reserves:[]};
  const bounds=layout.bounds,spawn={x:layout.spawn[0],z:layout.spawn[1]},used=layout.taskPositions.concat(layout.enemySpawns.map(e=>e.pos)).map(p=>({x:p[0],z:p[1]}));
  // A clear ray can still pass too close to a wall for a walking person.
  // Reserve the same shoulder clearance along the entire short movement.
  const walkingBoxes=colliders.map(b=>({minX:b.minX-.55,maxX:b.maxX+.55,minZ:b.minZ-.55,maxZ:b.maxZ+.55}));
  const walkClear=(a,b)=>!lineBlocked(a,b,walkingBoxes);
  const valid=(x,z,r=.55)=>x>bounds.minX+1&&x<bounds.maxX-1&&z>bounds.minZ+1&&z<bounds.maxZ-1&&!blocked(x,z,colliders,r)&&used.every(p=>Math.hypot(p.x-x,p.z-z)>2.4);
  const nearRoad=(p,extra=1.4)=>layout.roads.some(road=>road.points.slice(1).some((b,j)=>{
    const a=road.points[j],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(p.x-a[0]-dx*t,p.z-a[1]-dz*t)<road.width/2+extra;
  }));
  const candidates=[];
  for(const road of layout.roads)for(let j=1;j<road.points.length;j++){
    const a=road.points[j-1],b=road.points[j],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1)continue;
    for(let t=3;t<length-2;t+=4)for(const side of[-1,1]){
      const edge=side*(road.width*.5-.75),x=a[0]+dx/length*t+dz/length*edge,z=a[1]+dz/length*t-dx/length*edge;
      if(valid(x,z))candidates.push({x,z,dx:dx/length,dz:dz/length,distance:Math.hypot(x-spawn.x,z-spawn.z)});
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  const residents=[];
  for(const p of (inhabited||war?candidates:[])){
    if(p.distance<5||p.distance>56||!valid(p.x,p.z))continue;
    let shelter=null;
    shelterSearch:for(const direction of[1,-1])for(const distance of[8,6,4]){
      const x=p.x+p.dx*distance*direction,z=p.z+p.dz*distance*direction;
      if(valid(x,z)&&walkClear(p,{x,z})){shelter=[x,z];break shelterSearch;}
    }
    if(!shelter)continue;
    residents.push({pos:[p.x,p.z],shelter,variant:residents.length%4,wait:.7+residents.length*.9});used.push(p,{x:shelter[0],z:shelter[1]});
    if(residents.length>=(war?6:5))break;
  }
  const contacts=[],coverOptions=[];
  if(war)for(const box of colliders){
    const width=box.maxX-box.minX,depth=box.maxZ-box.minZ;
    if(Math.max(width,depth)<1.4||Math.min(width,depth)<.22||(Number.isFinite(box.maxY)&&box.maxY-(box.minY||0)<.8))continue;
    // Each station is on the shielded face of a real wall/vehicle. Its exposed
    // corner is a short, body-clear movement, not a target planted in the road.
    for(const sx of[-1,1])for(const sz of[-1,1]){
      const edgeX=sx<0?box.minX:box.maxX,edgeZ=sz<0?box.minZ:box.maxZ;
      const peek={x:edgeX+sx*.95,z:edgeZ+sz*.95};
      for(const anchor of[
        {x:edgeX+sx*.80,z:edgeZ-sz*Math.min(1.8,(box.maxZ-box.minZ)*.5)},
        {x:edgeX-sx*Math.min(1.8,(box.maxX-box.minX)*.5),z:edgeZ+sz*.80}
      ]){
        const d=Math.hypot(anchor.x-spawn.x,anchor.z-spawn.z);
        if(d<18||d>43||!valid(anchor.x,anchor.z)||!valid(peek.x,peek.z)||!nearRoad(anchor)||!nearRoad(peek))continue;
        if(!lineBlocked(spawn,anchor,colliders)||lineBlocked(spawn,peek,colliders)||!walkClear(anchor,peek))continue;
        coverOptions.push({anchor,peek,distance:d});
      }
    }
  }
  coverOptions.sort((a,b)=>a.distance-b.distance);
  for(const {anchor,peek} of coverOptions){
    if(!valid(anchor.x,anchor.z)||!valid(peek.x,peek.z)||contacts.some(c=>Math.hypot(c.pos[0]-anchor.x,c.pos[1]-anchor.z)<7))continue;
    contacts.push({pos:[anchor.x,anchor.z],coverAnchor:[anchor.x,anchor.z],safePeek:[peek.x,peek.z],lookAt:[spawn.x,spawn.z],fireDelay:4.8+contacts.length*.8,opening:false,tacticalRole:'support',patrol:[[anchor.x,anchor.z]]});
    used.push(anchor,peek);if(contacts.length===2)break;
  }
  const reserves=[],reserveCount=war?(layout.encounter?.reserveCount??3):0;
  // Reserves exist from chapter load at roadside assembly points. Sound or an
  // approaching opponent activates them; they never materialise near a player.
  const reserveCandidates=[...candidates].sort((a,b)=>{
    const score=p=>Math.abs(p.distance-52)+(lineBlocked(spawn,p,colliders)?0:12);
    return score(a)-score(b);
  });
  for(const p of reserveCandidates){
    if(reserves.length>=reserveCount)break;
    if(p.distance<35||p.distance>88||!valid(p.x,p.z)||reserves.some(r=>Math.hypot(r.pos[0]-p.x,r.pos[1]-p.z)<9))continue;
    const toward=(spawn.x-p.x)*p.dx+(spawn.z-p.z)*p.dz>=0?1:-1;
    const rally=[6,4].map(d=>({x:p.x+p.dx*d*toward,z:p.z+p.dz*d*toward})).find(q=>valid(q.x,q.z)&&walkClear(p,q));
    if(!rally)continue;
    const index=reserves.length;
    reserves.push({pos:[p.x,p.z],reserve:true,activationDelay:(layout.encounter?.reserveDelay??10)+index*3.5,rally:[rally.x,rally.z],lookAt:[rally.x,rally.z],patrol:[[rally.x,rally.z],[p.x,p.z]],fireDelay:3.2,tacticalRole:['flank-left','flank-right','support','flank-left'][index]});
    used.push(p,rally);
  }
  // Peripheral civilians belong to particular courts rather than being copied
  // around the spawn. Each keeps an independently verified escape segment.
  if(layout.expansion&&!layout.expansion.externalOnly)for(const [district,place] of layout.expansion.checkpoints.entries()){
    const center={x:place.pos[0],z:place.pos[1]},entry={x:place.entrance[0],z:place.entrance[1]};
    for(const index of[0,1]){
      const p={x:entry.x,z:entry.z+1.4+index*3.5},shelter={x:entry.x,z:center.z+index*3};
      if(!valid(p.x,p.z)||!valid(shelter.x,shelter.z)||!walkClear(p,shelter))continue;
      residents.push({pos:[p.x,p.z],shelter:[shelter.x,shelter.z],variant:(district+residents.length)%4,wait:1+district*.8,region:place.name,localThreatOnly:true});used.push(p,shelter);
    }
  }
  // Four occupied outer sectors are present from load. Their cover stations
  // activate locally through sight/sound; distant groups do not all rush spawn.
  if(war&&layout.expansion?.patrolGroups?.length){
    const core=layout.coreBounds,groups=layout.expansion.patrolGroups;
    const outside=p=>p.x<core.minX-7||p.x>core.maxX+7||p.z<core.minZ-7||p.z>core.maxZ+7;
    const wanted=Math.min(12,Math.max(8,24-layout.enemySpawns.length-contacts.length-reserves.length));
    const selected=[];
    for(const group of groups){
      const center={x:group.pos[0],z:group.pos[1]},options=[];
      for(const box of colliders){
        const w=box.maxX-box.minX,d=box.maxZ-box.minZ;if(Math.max(w,d)<1.4||Math.min(w,d)<.22||(Number.isFinite(box.maxY)&&box.maxY-(box.minY||0)<.8))continue;
        const cx=(box.minX+box.maxX)/2,cz=(box.minZ+box.maxZ)/2;if(Math.hypot(cx-center.x,cz-center.z)>80)continue;
        const sector=groups.reduce((best,g)=>Math.hypot(cx-g.pos[0],cz-g.pos[1])<Math.hypot(cx-best.pos[0],cz-best.pos[1])?g:best,groups[0]);if(sector.id!==group.id)continue;
        const vantages=[];
        for(const road of layout.roads.filter(r=>r.expansion&&!r.walkway))for(let j=1;j<road.points.length;j++){
          const a=road.points[j-1],b=road.points[j],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((cx-a[0])*dx+(cz-a[1])*dz)/(dx*dx+dz*dz||1)));
          const p={x:a[0]+dx*t,z:a[1]+dz*t};if(!blocked(p.x,p.z,colliders,.4))vantages.push({p,d:Math.hypot(cx-p.x,cz-p.z)});
        }
        vantages.sort((a,b)=>a.d-b.d);const approach=vantages[0]?.p;if(!approach)continue;
        for(const sx of[-1,1])for(const sz of[-1,1]){
          const x=sx<0?box.minX:box.maxX,z=sz<0?box.minZ:box.maxZ,peek={x:x+sx*.95,z:z+sz*.95};
          for(const anchor of[{x:x+sx*.8,z:z-sz*Math.min(d*.5,1.8)},{x:x-sx*Math.min(w*.5,1.8),z:z+sz*.8}]){
            if(!outside(anchor)||Math.hypot(anchor.x-spawn.x,anchor.z-spawn.z)<40||!valid(anchor.x,anchor.z)||!valid(peek.x,peek.z)||!nearRoad(peek,8)||!walkClear(anchor,peek))continue;
            if(!lineBlocked(approach,anchor,colliders)||lineBlocked(approach,peek,colliders))continue;
            options.push({anchor,peek,approach,score:Math.hypot(anchor.x-center.x,anchor.z-center.z)});
          }
        }
      }
      options.sort((a,b)=>a.score-b.score);selected.push({group,options,count:0});
    }
    let added=0;
    for(let round=0;round<3&&added<wanted;round++)for(const sector of selected){
      if(added>=wanted)break;
      const found=sector.options.find(o=>valid(o.anchor.x,o.anchor.z)&&valid(o.peek.x,o.peek.z)&&reserves.every(r=>Math.hypot(r.pos[0]-o.anchor.x,r.pos[1]-o.anchor.z)>4.4));if(!found)continue;
      const {anchor,peek,approach}=found,index=sector.count++;
      reserves.push({pos:[anchor.x,anchor.z],coverAnchor:[anchor.x,anchor.z],safePeek:[peek.x,peek.z],lookAt:[approach.x,approach.z],patrol:[[anchor.x,anchor.z]],reserve:true,peripheral:true,sector:sector.group.id,activationDelay:8+index*3,fireDelay:3.8+index*.7,tacticalRole:['support','flank-left','flank-right'][index]});used.push(anchor,peek);added++;
    }
  }
  return{residents,contacts,reserves,...(sceneState?{support:planEnemySupport({layout,sceneState,colliders,groundHeight})}:{})};
}
