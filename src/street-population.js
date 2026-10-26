import {blocked,lineBlocked} from './simulation.js';

// Residents occupy the usable roadside and move to shelter; first contacts
// are selected from real unobstructed street positions after scenery loads.
export function buildStreetPopulation(layout,colliders=[]){
  const inhabited=['civilian-courtyard','narrow-t-street','walled-compound','crash-plaza','market-dogleg','convoy-switchback','crash-perimeter','night-courtyard','relief-avenue','recovery-lane','dawn-switchbacks'].includes(layout.type);
  const war=layout.enemySpawns.length>0;
  if(!inhabited&&!war)return {residents:[],contacts:[]};
  const bounds=layout.bounds,spawn={x:layout.spawn[0],z:layout.spawn[1]},used=layout.taskPositions.concat(layout.enemySpawns.map(e=>e.pos)).map(p=>({x:p[0],z:p[1]}));
  // A clear ray can still pass too close to a wall for a walking person.
  // Reserve the same shoulder clearance along the entire short movement.
  const walkingBoxes=colliders.map(b=>({minX:b.minX-.55,maxX:b.maxX+.55,minZ:b.minZ-.55,maxZ:b.maxZ+.55}));
  const walkClear=(a,b)=>!lineBlocked(a,b,walkingBoxes);
  const facing=layout.facing||0,forward={x:-Math.sin(facing),z:-Math.cos(facing)},viewDot=Math.cos(42*Math.PI/180);
  const valid=(x,z,r=.55)=>x>bounds.minX+1&&x<bounds.maxX-1&&z>bounds.minZ+1&&z<bounds.maxZ-1&&!blocked(x,z,colliders,r)&&used.every(p=>Math.hypot(p.x-x,p.z-z)>2.4);
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
  for(const p of candidates){
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
  const contacts=[];
  if(war)for(let i=1;i<layout.route.length&&contacts.length<2;i++){
    const a=layout.route[i-1],b=layout.route[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1)continue;
    for(let t=3;t<length&&contacts.length<2;t+=3)for(const side of[-1,1]){
      const x=a[0]+dx/length*t+dz/length*side*1.8,z=a[1]+dz/length*t-dx/length*side*1.8,d=Math.hypot(x-spawn.x,z-spawn.z);
      if(d<18||d>35||!valid(x,z)||((x-spawn.x)*forward.x+(z-spawn.z)*forward.z)/d<=viewDot||!walkClear(spawn,{x,z}))continue;
      const crossing=[-1,1].map(direction=>({x:x+dx/length*2*direction,z:z+dz/length*2*direction})).find(p=>valid(p.x,p.z)&&walkClear({x,z},p)&&!lineBlocked(spawn,p,colliders));
      // The director reads patrol[0] for its opening movement. It must be a
      // reachable point away from the spawn, rather than the spawn itself.
      if(!crossing)continue;
      contacts.push({pos:[x,z],lookAt:[spawn.x,spawn.z],fireDelay:5.5+contacts.length,opening:true,patrol:[[crossing.x,crossing.z],[x,z]]});used.push({x,z},crossing);
      if(contacts.length===2)break;
    }
  }
  return{residents,contacts};
}
