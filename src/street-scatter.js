import * as THREE from 'three';
import {convoyClearanceBoxes,footprint,rectanglesOverlap} from './chapter-boundary.js';
import {buildStreetPopulation} from './street-population.js';
import {lineBlocked} from './simulation.js';

const PI=Math.PI,MAX_TRIANGLES=39000;
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function indexBoxes(boxes){const cells=new Map(),size=12;for(const b of boxes){for(let x=Math.floor(b.minX/size);x<=Math.floor(b.maxX/size);x++)for(let z=Math.floor(b.minZ/size);z<=Math.floor(b.maxZ/size);z++){const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);}}return box=>{const found=new Set();for(let x=Math.floor(box.minX/size);x<=Math.floor(box.maxX/size);x++)for(let z=Math.floor(box.minZ/size);z<=Math.floor(box.maxZ/size);z++)for(const b of cells.get(x+':'+z)||[])found.add(b);return [...found];};}
const pointGap=(p,b)=>Math.hypot(Math.max(b.minX-p[0],0,p[0]-b.maxX),Math.max(b.minZ-p[1],0,p[1]-b.maxZ));
const nearSegment=(a,b,box,pad)=>lineBlocked({x:a[0],z:a[1]},{x:b[0],z:b[1]},[{minX:box.minX-pad,maxX:box.maxX+pad,minZ:box.minZ-pad,maxZ:box.maxZ+pad}]);

export function planStreetScatter(layout,{colliders=[],storySets=null}={}){
  const random=rng(layout.chapter*43891+19931003),rand=(a,b)=>a+(b-a)*random(),war=layout.enemySpawns.length>0,camp=[2,3,16].includes(layout.chapter),clinic=[1,11].includes(layout.chapter),cockpit=layout.chapter===9;
  const obstacles=colliders.filter(b=>(b.minY||0)<1.3),query=indexBoxes(obstacles),sweeps=convoyClearanceBoxes(layout),queryConvoy=indexBoxes(sweeps),population=buildStreetPopulation(layout,colliders);
  const points=[layout.spawn,...layout.taskPositions,...layout.enemySpawns.map(e=>e.pos),...(layout.expansion?.checkpoints||[]).flatMap(c=>[c.pos,c.entrance,c.road])];
  const corridors=[...layout.route.slice(1).map((b,i)=>({a:layout.route[i],b,pad:1.55})),...layout.roads.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,pad:r.walkway?1.5:2.15}))),...(layout.expansion?.checkpoints||[]).flatMap(c=>[{a:c.road,b:c.entrance,pad:1.05},{a:c.entrance,b:c.pos,pad:1.05}]),...population.residents.map(r=>({a:r.pos,b:r.shelter,pad:1.0}))];
  const protectedBoxes=(storySets?.landmarks||[]).map(l=>l.bounds).filter(Boolean);
  if(layout.chapter===4)protectedBoxes.push({minX:-4.6,maxX:4.6,minZ:26.2,maxZ:37.8});
  if(layout.chapter===10)protectedBoxes.push({minX:-27.4,maxX:-18.6,minZ:24.6,maxZ:33.4});
  if(layout.chapter===6)protectedBoxes.push({minX:-13,maxX:-3,minZ:-8,maxZ:2},{minX:5.9,maxX:11,minZ:3.9,maxZ:9.1});
  if(cockpit)protectedBoxes.push({minX:-8,maxX:8,minZ:-8,maxZ:10});
  const candidates=[],sites=[],bounds=layout.bounds;
  const allowed=(box,{small=false}={})=>box.minX>bounds.minX+1.2&&box.maxX<bounds.maxX-1.2&&box.minZ>bounds.minZ+1.2&&box.maxZ<bounds.maxZ-1.2&&!query(box).some(b=>rectanglesOverlap(box,b,.13))&&!queryConvoy(box).some(b=>rectanglesOverlap(box,b,.20))&&!protectedBoxes.some(b=>rectanglesOverlap(box,b,.55))&&!points.some(p=>pointGap(p,box)<(small?1.5:2.2))&&!corridors.some(c=>nearSegment(c.a,c.b,box,small?Math.min(c.pad,.95):c.pad));
  const add=(x,z,yaw,kind,source,priority)=>candidates.push({x,z,yaw,kind,source,priority,w:kind==='drain'?1.0:2.3,d:kind==='drain'?1.5:2.1});
  // The large pieces belong to a building, stall or repair yard. No uniform
  // world-grid confetti and no debris placed in the middle of a clear apron.
  for(const [i,b]of layout.buildings.entries()){
    if(b.style==='courtyard')continue;
    for(const [nx,nz,length,depth]of[[0,1,b.w,b.d],[0,-1,b.w,b.d],[1,0,b.d,b.w],[-1,0,b.d,b.w]])for(const t of[-.30,.28]){
      const x=b.x+nx*(depth/2+1.25)+nz*length*t,z=b.z+nz*(depth/2+1.25)-nx*length*t;
      const region=layout.expansion?.regions?.[b.region],kind=camp?'supply':clinic?'domestic':b.ruin||b.damage>.32?'masonry':region?.style==='workshop'?'workshop':region?.style==='market'||layout.chapter===7?'market':i%3===0?'market':'masonry';
      add(x,z,Math.atan2(nx,nz),kind,'facade',b.district?2:0);
    }
  }
  for(const p of layout.props){if(!['stall','burned','cargo','fuel','rubble'].includes(p.kind))continue;for(const side of[-1,1])add(p.pos[0]+side*2.2,p.pos[1]+.6,p.rotation||0,camp?'supply':clinic?'domestic':p.kind==='stall'?'market':p.kind==='burned'||p.kind==='fuel'?'workshop':'masonry','existing-prop',0);}
  for(const road of layout.roads)for(let s=1;s<road.points.length;s++){
    const a=road.points[s-1],b=road.points[s],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<5||road.walkway)continue;const ux=(b[0]-a[0])/len,uz=(b[1]-a[1])/len;
    for(const side of[-1,1])for(let d=rand(2.5,5.5);d<len-2;d+=road.expansion?rand(9,14):rand(4.5,7.5)){
      const off=side*(road.width*.5+rand(.25,1.05));add(a[0]+ux*d+uz*off,a[1]+uz*d-ux*off,Math.atan2(ux,uz),'drain','road-shoulder',road.expansion?3:1);
    }
  }
  // Empty side lots get a few accumulated piles where pedestrians have pushed
  // material out of the street. Candidate cells are jittered, sparsely accepted,
  // and kept separate from the documented paths and actual convoy envelope.
  const core=layout.coreBounds||bounds;for(let x=core.minX+4;x<core.maxX-3;x+=7)for(let z=core.minZ+4;z<core.maxZ-3;z+=7){const px=x+rand(-2,2),pz=z+rand(-2,2);if(random()<.55)continue;add(px,pz,rand(0,PI*2),camp?'supply':clinic?'domestic':random()<.22?'workshop':'masonry','side-lot',1);}
  for(const c of candidates)c.distance=Math.hypot(c.x-layout.spawn[0],c.z-layout.spawn[1]);
  candidates.sort((a,b)=>a.priority-b.priority||a.distance-b.distance);
  const maximum=war?102:camp?38:clinic?45:48;
  for(const c of candidates){if(sites.length>=maximum)break;const box=footprint(c);if(!allowed(box,{small:c.kind==='drain'})||sites.some(s=>rectanglesOverlap(box,s.bounds,.9)))continue;sites.push({...c,id:'scatter-'+layout.chapter+'-'+sites.length,bounds:box,seed:Math.floor(random()*0xffffffff),solid:c.kind!=='drain'});}
  return {chapter:layout.chapter,theme:camp?'camp':clinic?'clinic':cockpit?'exterior-cockpit':'war-street',sites,protectedBoxes,protectedPoints:points,corridors,convoy:sweeps,allowSmall:(x,z,r=.10)=>allowed({minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r},{small:true})};
}

/** Batches original low-poly geometry into the caller's six existing materials.
 * Material and geometry ownership remains with the chapter builder. */
export function buildStreetScatter(layout,{add,palette,sampleHeight=()=>0,colliders=[],storySets=null,stats={}}){
  const plan=planStreetScatter(layout,{colliders,storySets}),result={version:1,theme:plan.theme,clusters:0,solidProps:0,smallFragments:0,triangles:0,materialBatches:0,sites:[]};
  const mats={masonry:palette.exposed||palette.concrete,brick:palette.brickEdge||palette.brick,wood:palette.wood,metal:palette.rusty||palette.metal,rubber:palette.rubber,cloth:palette.cloth},used=new Set();
  function geometry(g,m,p,r=[0,0,0]){const n=(g.index?.count||g.attributes.position.count)/3;if(result.triangles+n>MAX_TRIANGLES){g.dispose();return false;}result.triangles+=n;used.add(m);add(g,m,p,r);return true;}
  for(const site of plan.sites){if(result.triangles>MAX_TRIANGLES-600)break;const random=rng(site.seed),rand=(a,b)=>a+(b-a)*random(),c=Math.cos(site.yaw),s=Math.sin(site.yaw),at=(x,z)=>[site.x+x*c+z*s,site.z-x*s+z*c],ground=(x,z)=>sampleHeight(x,z);
    let mainParts=true,solidMinY=Infinity,solidMaxY=-Infinity;
    const part=(g,m,x,y,z,rot=[0,0,0])=>{const p=at(x,z),h=ground(...p);g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot,'YXZ')));g.computeBoundingBox();const minY=h+y+g.boundingBox.min.y,maxY=h+y+g.boundingBox.max.y,accepted=geometry(g,m,[p[0],h+y,p[1]],[0,site.yaw,0]);if(accepted&&mainParts){solidMinY=Math.min(solidMinY,minY);solidMaxY=Math.max(solidMaxY,maxY);}return accepted;};
    const block=(w,h,d,m,x,y,z,yaw=0,rx=0,rz=0)=>part(new THREE.BoxGeometry(w,h,d),m,x,y,z,[rx,yaw,rz]);
    let solidHeight=0;
    function crate(x,z,broken=false){const w=.56,d=.47,h=broken?.25:.46;block(w,.045,d,mats.wood,x,.03,z);for(const side of[-1,1]){for(let k=0;k<(broken?2:3);k++){block(w,.075,.035,mats.wood,x,.12+k*.14,z+side*d*.5);block(.035,.075,d,mats.wood,x+side*w*.5,.12+k*.14,z);}for(const end of[-1,1])block(.045,h,.045,mats.wood,x+side*w*.46,h/2,z+end*d*.45);}solidHeight=Math.max(solidHeight,h);}
    if(site.kind==='market'||site.kind==='supply'||site.kind==='domestic'){
      crate(-.42,-.12,site.kind==='market');if(site.kind!=='domestic')crate(.29,.04,false);
      if(site.kind==='market'){// A collapsed stall leg still joined to a broken top, and a real woven-basket rim.
        block(1.35,.06,.10,mats.wood,.02,.11,.60,.12,0,.08);for(const x of[-.52,.52])block(.065,.065,.52,mats.wood,x,.09,.58,.12);
        part(new THREE.CylinderGeometry(.21,.16,.30,10,1,true),mats.cloth,.56,.16,-.45,[.12,0,.06]);part(new THREE.TorusGeometry(.21,.022,4,12),mats.wood,.56,.31,-.45,[PI/2+.12,0,0]);
      }else{for(let j=0;j<2;j++){const g=new THREE.IcosahedronGeometry(1,1);g.scale(.26,.11,.18);part(g,mats.cloth,-.46+j*.52,.12,.55,[0,rand(-.3,.3),0]);}solidHeight=Math.max(solidHeight,.46);}
    }else if(site.kind==='workshop'){
      for(let n=0;n<2;n++)part(new THREE.TorusGeometry(.265,.09,5,12),mats.rubber,-.35+n*.58,.105+n*.025,.05,[PI/2+.08,rand(-.3,.3),0]);
      // Thin dented panels and exposed connected rods, not opaque vehicle boxes.
      const panel=new THREE.PlaneGeometry(.85,.57,3,2),pv=panel.attributes.position;for(let i=0;i<pv.count;i++)pv.setZ(i,.035*Math.sin(i*2.1));panel.computeVertexNormals();part(panel,mats.metal,.1,.12,.55,[-PI/2,.18,0]);
      for(let n=0;n<3;n++)block(.90,.035,.045,mats.metal,-.12+n*.12,.06+n*.025,-.50,rand(-.25,.25));solidHeight=.34;
    }else if(site.kind==='masonry'){
      // Large fractured plaster/brick chunks give each falloff pile a readable
      // source; smaller chips taper away from it below walking-step height.
      for(let k=0;k<7;k++){const g=new THREE.IcosahedronGeometry(1,0),w=rand(.22,.48),h=rand(.11,.25);g.scale(w,h,rand(.16,.32));part(g,k%3?mats.masonry:mats.brick,rand(-.54,.54),h*.65+((k===2||k===3)?.12:0),rand(-.42,.42),[rand(-.2,.2),rand(0,PI),rand(-.2,.2)]);}block(.85,.075,.38,mats.masonry,.12,.18,.32,.35,.10,.08);solidHeight=.62;
    }else{
      // A drain-edge accumulation follows the street, with repeated chipped
      // curb fragments interrupted by real gaps rather than a solid curb wall.
      for(let k=0;k<3;k++)block(.17,.10,.29,mats.masonry,rand(-.12,.12),.055,-.45+k*.37,rand(-.18,.18));
      if(random()<.6)block(.73,.03,.08,mats.wood,.15,.025,.05,.22);solidHeight=0;
    }
    mainParts=false;
    const count=site.kind==='drain'?10:site.kind==='supply'||site.kind==='domestic'?7:18;
    for(let k=0;k<count;k++){const angle=rand(0,PI*2),radius=site.kind==='drain'?rand(.15,.95):rand(.40,2.1),localX=Math.cos(angle)*radius,localZ=Math.sin(angle)*radius*.7,p=at(localX,localZ);if(!plan.allowSmall(...p,.13))continue;
      let accepted=false;if(k%6===0){const g=new THREE.BoxGeometry(rand(.30,.72),.026,rand(.05,.11));accepted=part(g,site.kind==='workshop'?mats.metal:mats.wood,localX,.021,localZ,[0,rand(0,PI),rand(-.06,.06)]);}
      else if(k%7===0){const g=new THREE.PlaneGeometry(rand(.22,.40),rand(.18,.32),2,2),v=g.attributes.position;for(let i=0;i<v.count;i++)v.setZ(i,.018+.035*Math.sin(i*1.9));g.computeVertexNormals();accepted=part(g,mats.cloth,localX,.025,localZ,[-PI/2,rand(0,PI),0]);}
      else {const g=new THREE.IcosahedronGeometry(1,0),h=rand(.025,.065);g.scale(rand(.055,.18),h,rand(.045,.14));accepted=part(g,k%3?mats.masonry:mats.brick,localX,h*.72,localZ,[rand(-.18,.18),rand(0,PI),rand(-.18,.18)]);}if(accepted)result.smallFragments++;
    }
    if(solidHeight){const values=[site.x,site.z],y=ground(...values);colliders.push({...site.bounds,minY:Math.min(y-.08,solidMinY-.015),maxY:Math.max(y+solidHeight+.08,solidMaxY+.015),material:site.kind==='workshop'?'metal':site.kind==='masonry'?'masonry':'wood',streetScatter:true,scatterId:site.id});result.solidProps++;}
    result.clusters++;result.sites.push({id:site.id,kind:site.kind,source:site.source,position:[site.x,ground(site.x,site.z),site.z],bounds:{...site.bounds},solidHeight});
  }
  result.materialBatches=used.size;stats.streetScatter=result;return result;
}
