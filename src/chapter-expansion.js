import {convoyClearanceBoxes,footprint,rectanglesOverlap} from './chapter-boundary.js';

// Deterministic, walkable districts around the authored story footprint.
// The story route, task positions, convoy route and spawn are never relocated.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const themes={
  1:['诊所外居民巷','水井生活院','沿街杂货铺'],2:['车辆维修区','营房后勤院','机场外围巡检路'],
  3:['机库运输环道','器材整理院','机场维修工棚'],4:['索降街区侧巷','受损居民院','市场背街'],
  5:['目标街区外围','货运装卸院','居民绕行巷'],6:['坠机点东侧街区','救援集结院','受损商铺街'],
  7:['市场支巷','摊贩储货院','居民避险巷'],8:['车队绕行环路','维修院支路','失联街区'],
  9:['第二坠机点外街','救援接近院','机舱外居民巷'],10:['残骸外围路口','临街居民院','防守后巷'],
  11:['救治所外围街区','医疗后勤院','夜间避难巷'],12:['夜防街区支路','居民避难院','断电商铺街'],
  13:['援军侧翼街道','伤员集结院','运输维修街'],14:['转运外围街道','空置居民院','断墙商铺巷'],
  15:['撤离路线外环','断楼居民院','黎明绕行街'],16:['基地外围道路','医护后勤院','营地补给区']
};
function segmentDistance(p,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);}
function boxNearRoad(b,road,pad=1.5){
  for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],c=road.points[i],d=Math.hypot(c[0]-a[0],c[1]-a[1]),steps=Math.max(1,Math.ceil(d/2));
    for(let j=0;j<=steps;j++){const x=a[0]+(c[0]-a[0])*j/steps,z=a[1]+(c[1]-a[1])*j/steps;
      if(x>b.x-b.w/2-road.width/2-pad&&x<b.x+b.w/2+road.width/2+pad&&z>b.z-b.d/2-road.width/2-pad&&z<b.z+b.d/2+road.width/2+pad)return true;
    }
  }return false;
}
const overlap=(a,b,pad=2)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+pad&&Math.abs(a.z-b.z)<(a.d+b.d)/2+pad;

export function expandChapterLayout(layout){
  if(layout.expansion)return layout;
  const chapter=layout.chapter,war=layout.enemySpawns.length>0,camp=[2,3,16].includes(chapter),core={...layout.bounds};
  const convoySweeps=convoyClearanceBoxes(layout),blocksConvoy=b=>convoySweeps.some(s=>rectanglesOverlap(footprint(b),s,.35));
  const half=chapter===15?140:120,outer=half-8;
  const ix=Math.max(48,Math.max(Math.abs(core.minX),Math.abs(core.maxX))+14),iz=Math.max(48,Math.max(Math.abs(core.minZ),Math.abs(core.maxZ))+14);
  const names=themes[chapter],originalRoads=structuredClone(layout.roads),originalBuildings=structuredClone(layout.buildings);
  const roads=[],buildings=[],props=[],checkpoints=[],entrances=[];
  let seed=(chapter*2654435761)>>>0;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const road=(points,width=9,surface=camp?'concrete':'road',extra={})=>{const r={points,width,surface,expansion:true,...extra};roads.push(r);return r;};
  // Offset corners and a bent outer frontage break up the appearance of a
  // uniform grid while preserving two continuous, connected bypass loops.
  road([[-ix,-iz],[ix,-iz],[ix,iz-8],[ix-8,iz],[-ix,iz],[-ix,-iz]],10);
  road([[-outer,-outer],[outer-12,-outer],[outer,-outer+12],[outer,outer],[-outer+9,outer],[-outer,outer-9],[-outer,-outer]],11);
  const jog=chapter%2?9:-9;
  road([[0,iz],[0,iz+8],[jog,iz+8],[jog,outer]],8);
  road([[0,-iz],[0,-iz-8],[-jog,-iz-8],[-jog,-outer]],9);
  road([[-ix,0],[-ix-8,0],[-ix-8,jog],[-outer,jog]],9);
  road([[ix,0],[ix+8,0],[ix+8,-jog],[outer,-jog]],8);
  // Connect outward from real road ends, not through the middle of buildings.
  const extensions=[];
  for(const r of originalRoads)for(const end of[0,r.points.length-1]){
    const p=r.points[end],near=r.points[end===0?1:end-1];if(!near)continue;
    const dx=p[0]-near[0],dz=p[1]-near[1],horizontal=Math.abs(dx)>Math.abs(dz);
    const q=horizontal?[Math.sign(dx||1)*ix,p[1]]:[p[0],Math.sign(dz||1)*iz];
    if(Math.hypot(q[0]-p[0],q[1]-p[1])<2)continue;
    const candidate={points:[[...p],q],width:Math.min(r.width,10),surface:r.surface,expansion:true,connector:true};
    if(originalBuildings.some(b=>boxNearRoad(b,candidate,.35)))continue;
    if(extensions.some(e=>segmentDistance(p,...e.points)<2))continue;
    roads.push(candidate);extensions.push(candidate);entrances.push({pos:[...p],to:q});
  }
  if(chapter===9){road([[0,10],[0,iz]],9,'sand',{connector:true});entrances.push({pos:[0,10],to:[0,iz],externalOnly:true});}
  // Explicit courts have an open +Z entry and an approach strip to the road.
  const courtX=[-Math.min(36,ix*.48),Math.min(37,ix*.5),-(ix+outer)/2];
  const courtZ=[(iz+outer)/2,-iz+20,21];
  for(let i=0;i<3;i++){
    let x=courtX[i],z=courtZ[i],w=20,d=18;
    if(i===1)z=-iz-18;
    if(i===2){w=Math.max(14,outer-ix-17);d=20;}
    let b={x,z,w,d,h:camp?3.8:6.1+(chapter%3)*.45,yaw:0,district:true,style:'courtyard',detail:'near',damage:war?(i===1?.55:.22):0,region:i};
    // Keep both public courts when a column's extrapolated tail occupies the
    // first lot. Relocate the court to a neighbouring street block, preserving
    // its actual gate, approach road and checkpoint as one specification.
    b=[0,-22,22,-40,40].map(offset=>({...b,x:x+offset})).find(candidate=>candidate.x-candidate.w/2>-half+4&&candidate.x+candidate.w/2<half-4&&!blocksConvoy(candidate)&&![...originalBuildings,...buildings].some(o=>overlap(candidate,o,3))&&![...originalRoads,...roads].some(r=>boxNearRoad(candidate,r,1)));
    if(!b)continue;x=b.x;
    const entry=[x+w*.02,z+d/2+2],inside=[x+w*.05,z+d*.20];
    // Choose an existing horizontal street in front, with no intervening lot.
    const front=[];for(const r of roads)for(let j=1;j<r.points.length;j++){
      const a=r.points[j-1],c=r.points[j];if(Math.abs(a[1]-c[1])>.01||entry[0]<Math.min(a[0],c[0])+2||entry[0]>Math.max(a[0],c[0])-2||a[1]<entry[1])continue;
      front.push({p:[entry[0],a[1]],distance:a[1]-entry[1]});
    }
    front.sort((a,b)=>a.distance-b.distance);const connection=front[0];if(!connection||connection.distance>55)continue;
    buildings.push(b);road([entry,connection.p],3.2,'sand',{walkway:true});
    checkpoints.push({name:names[i],kind:'courtyard',pos:inside,entrance:entry,road:connection.p,building:{x,z,w,d}});
    props.push({kind:i===1?'washing':'supplies',pos:[x+w*.29,z+d*.17],rotation:0,expansion:true});
  }
  // Lots are selected inside the playable boundary, outside the story core.
  // Rejected lots stay as pedestrian openings, never invisible colliders.
  const stride=19,offset=(chapter%3-1)*2;
  for(let row=0,z=-outer+18;z<outer-12;z+=stride,row++)for(let col=0,x=-outer+18;x<outer-12;x+=stride,col++){
    const px=x+(rnd()-.5)*3,pz=z+((row+chapter)%2?3:-2)+offset;
    const b={x:px,z:pz,w:12+rnd()*3,d:12+rnd()*4,h:camp?3.4+rnd()*1.2:3.2*(1+((row+col+chapter)%3)),yaw:0,district:true,style:camp?'camp':['shop-house','apartment','workshop'][(row*2+col+chapter)%3],detail:'mid',damage:war?([.12,.38,.7][(row+col)%3]):0,region:px<-ix/3?0:px>ix/3?2:1};
    if(b.x+b.w/2>half-5||b.x-b.w/2<-half+5||b.z+b.d/2>half-5||b.z-b.d/2<-half+5)continue;
    if(b.x+b.w/2>core.minX-7&&b.x-b.w/2<core.maxX+7&&b.z+b.d/2>core.minZ-7&&b.z-b.d/2<core.maxZ+7)continue;
    if(blocksConvoy(b)||[...originalBuildings,...buildings].some(o=>overlap(b,o,3))||[...originalRoads,...roads].some(r=>boxNearRoad(b,r,2)))continue;
    buildings.push(b);
    if(buildings.length%4===0)props.push({kind:camp?'supplies':b.style==='workshop'?'fuel':'washing',pos:[b.x,b.z+b.d/2+2],rotation:0,expansion:true});
  }
  // Smaller adjoining shop fronts occupy the gaps between large lots. They
  // follow the street edge and face an actual lane, instead of scattered cubes
  // in a sand apron. Consider all streets before picking lots so no one side
  // absorbs the whole geometry budget.
  const frontage=[];
  for(const r of roads.filter(r=>!r.walkway))for(let j=1;j<r.points.length;j++){
    const a=r.points[j-1],b=r.points[j],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<12)continue;
    for(let t=7;t<length-6;t+=11+rnd()*4)for(const side of[-1,1]){
      const along=6+rnd()*3.8,depth=6+rnd()*3.2,horizontal=Math.abs(dx)>Math.abs(dz),edge=r.width/2+depth/2+2.3;
      const lot={x:a[0]+dx/length*t+dz/length*edge*side,z:a[1]+dz/length*t-dx/length*edge*side,w:horizontal?along:depth,d:horizontal?depth:along,h:camp?3.1+rnd()*.6:3.1*(rnd()<.24?2:1),yaw:0,district:true,style:camp?'camp':rnd()<.3?'workshop':'shop-house',detail:'mid',damage:war?.1+rnd()*.55:0,frontage:true,region:0};
      frontage.push({lot,priority:rnd()});
    }
  }
  frontage.sort((a,b)=>a.priority-b.priority);let infill=0;
  for(const {lot:b} of frontage){
    if(infill>=52)break;
    if(b.x+b.w/2>half-3||b.x-b.w/2<-half+3||b.z+b.d/2>half-3||b.z-b.d/2<-half+3)continue;
    if(b.x+b.w/2>core.minX-7&&b.x-b.w/2<core.maxX+7&&b.z+b.d/2>core.minZ-7&&b.z-b.d/2<core.maxZ+7)continue;
    if(blocksConvoy(b)||[...originalBuildings,...buildings].some(o=>overlap(b,o,1.5))||[...originalRoads,...roads].some(r=>boxNearRoad(b,r,1.5)))continue;
    buildings.push(b);infill++;
  }
  const regions=names.map((name,i)=>({name,style:camp?'camp':i===0?'market':i===1?'residential':'workshop',pos:checkpoints[i]?.pos||[i===0?-ix:i===1?0:ix,i===1?iz:0]}));
  layout.coreBounds=core;layout.bounds={minX:-half,maxX:half,minZ:-half,maxZ:half};layout.bound=half;
  layout.roads.push(...roads);layout.buildings.push(...buildings);layout.props.push(...props);
  layout.landmarks.push(...regions.map(r=>({name:r.name,pos:r.pos,expansion:true})));
  layout.expansion={version:1,coreBounds:core,regions,checkpoints,entrances,roads:roads.length,buildings:buildings.length,frontageBuildings:infill,playableSize:[half*2,half*2],externalOnly:chapter===9,
    patrolGroups:war?[
      {id:'west',name:names[0],pos:[-(ix+outer)/2,0],approach:[-ix,0]},
      {id:'north',name:names[1],pos:[0,(iz+outer)/2],approach:[0,iz]},
      {id:'east',name:names[2],pos:[(ix+outer)/2,0],approach:[ix,0]},
      {id:'south',name:names[0],pos:[0,-(iz+outer)/2],approach:[0,-iz]}
    ]:[]};
  return layout;
}
