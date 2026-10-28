import * as THREE from 'three';
import {convoyClearanceBoxes,footprint,rectanglesOverlap} from './chapter-boundary.js';
import {buildStreetPopulation} from './street-population.js';
import {lineBlocked} from './simulation.js';
import {getChapterStoryDirection} from './chapter-story-direction.js';

// Three readable pieces of physical storytelling per chapter. Labels describe
// original game staging, not a claim to reconstruct the historical address.
export const CHAPTER_STORY_SET_DEFINITIONS=Object.freeze({
  1:[['蓝门诊所','clinic-porch','curtain'],['水井诊所门','water-triage','signal'],['背街门廊','family-porch','gate']],
  2:[['军需棚','kit-canopy','curtain'],['米勒营房','barracks-rack','signal'],['集合车列','muster-line','gate']],
  3:[['地图简报墙','briefing-wall','signal'],['携行整理台','loadout-bench','curtain'],['登机机库门','boarding-frame','gate']],
  4:[['索降街口','rope-landing','signal'],['担架门洞','stretcher-porch','stretcher'],['撤送车辆接应口','casualty-transfer','gate']],
  5:[['抓捕庭院','compound-check','gate'],['后车救护位','vehicle-aid','stretcher'],['车队出口','convoy-exit','signal']],
  6:[['黑烟广场','wreck-screen','signal'],['破屋顶集结处','broken-roof','curtain'],['第一残骸入口','rescue-entry','stretcher']],
  7:[['低门廊','market-porch','curtain'],['哈里斯藏身墙','shelter-wall','stretcher'],['接应门廊','market-rally','gate']],
  8:[['封堵S弯','roadblock-tableau','gate'],['后车车厢','rear-cargo','curtain'],['返程路口','return-turn','signal']],
  9:[['受损座椅','cockpit-seat','signal'],['破窗仪表','cockpit-console','signal'],['座舱门','cockpit-door','curtain']],
  10:[['第二残骸外沿','wreck-perimeter','gate'],['机长救护侧','pilot-shelter','stretcher'],['最后联络位','radio-last','signal']],
  11:[['救治灯下','surgical-tray','signal'],['史密斯病床','treatment-bed','curtain'],['米勒隔间','medical-screen','stretcher']],
  12:[['夜间门廊','blackout-porch','curtain'],['共用补给院','shared-supply','signal'],['轮换哨位','watch-post','gate']],
  13:[['联合接应入口','relief-marker','signal'],['担架交接线','stretcher-handover','stretcher'],['救援车装载口','loading-ramp','gate']],
  14:[['残骸回收口','recovery-mark','signal'],['遗物桌','personal-effects','curtain'],['最后撤离车','last-stretcher','stretcher']],
  15:[['首个转角','escape-turn','gate'],['哈里斯休息墙','rest-wall','curtain'],['救护接应口','aid-arrival','stretcher']],
  16:[['归建登记处','return-register','signal'],['幸存者病房','recovery-screen','curtain'],['姓名纪念桌','memorial-table','gate']],
});
const ENGLISH={
 'clinic-porch':'CLINIC / OPEN','water-triage':'DRINKING / WASH','family-porch':'FAMILIES / WAIT',
 'kit-canopy':'PERSONAL KIT','barracks-rack':'TEAM / CHECK','muster-line':'ASSEMBLY / KEEP CLEAR',
 'briefing-wall':'SECTOR SKETCH','loadout-bench':'CHECK / LOAD','boarding-frame':'AIR CREW / READY',
 'rope-landing':'LANDING / CLEAR','stretcher-porch':'CASUALTY / IN','casualty-transfer':'TRANSFER / OUT',
 'compound-check':'COURTYARD / HOLD','vehicle-aid':'REAR / FIRST AID','convoy-exit':'COLUMN / EXIT',
 'wreck-screen':'CRASH / REPORT','broken-roof':'RALLY / HERE','rescue-entry':'RESCUE / ACCESS',
 'market-porch':'SUUQA / DUKAAN','shelter-wall':'SHELTER / QUIET','market-rally':'RALLY / PASSAGE',
 'roadblock-tableau':'ROAD / CLOSED','rear-cargo':'REAR / SUPPLIES','return-turn':'RETURN / LEFT',
 'cockpit-seat':'RESTRAINT','cockpit-console':'RADIO','cockpit-door':'DOOR',
 'wreck-perimeter':'PERIMETER','pilot-shelter':'PILOT / AID','radio-last':'RADIO / CHECK',
 'surgical-tray':'DRESSINGS / LIGHT','treatment-bed':'CARE / QUIET','medical-screen':'CLEAN / USED',
 'blackout-porch':'NIGHT / KEEP LOW','shared-supply':'SHARED / STOCK','watch-post':'WATCH / RELIEF',
 'relief-marker':'RELIEF / ENTRY','stretcher-handover':'STRETCHERS / IN','loading-ramp':'LOAD / COUNT',
 'recovery-mark':'RECOVERY / ACCESS','personal-effects':'PERSONAL EFFECTS','last-stretcher':'FINAL / TRANSFER',
 'escape-turn':'AID / THIS WAY','rest-wall':'REST / REGROUP','aid-arrival':'AID / RECEPTION',
 'return-register':'RETURNED / CHECK IN','recovery-screen':'RECOVERY / REST','memorial-table':'NAMES / REMEMBER',
};
const PI=Math.PI,clamp=THREE.MathUtils.clamp;
const pointGap=(p,b)=>Math.hypot(Math.max(b.minX-p[0],0,p[0]-b.maxX),Math.max(b.minZ-p[1],0,p[1]-b.maxZ));
function segmentHitsBox(a,b,box,pad){return lineBlocked({x:a[0],z:a[1]},{x:b[0],z:b[1]},[{minX:box.minX-pad,maxX:box.maxX+pad,minZ:box.minZ-pad,maxZ:box.maxZ+pad}]);}

export function planChapterStorySets(layout,colliders=[]){
  const chapterId=layout.chapter,source=CHAPTER_STORY_SET_DEFINITIONS[chapterId];if(!source)throw new RangeError('Missing chapter story set '+chapterId);
  const direction=getChapterStoryDirection(chapterId),definitions=source.map(([fallback,kind,cueKind],index)=>[direction.landmarks['core'+index]?.name||fallback,kind,cueKind]);
  if(chapterId===9)return definitions.map(([label,kind,cueKind],coreIndex)=>({id:`ch09-core${coreIndex}`,label,kind,cueKind,chapterId,coreIndex,taskPosition:[...layout.taskPositions[coreIndex]],x:[-.60,.63,1.25][coreIndex],z:[-.47,-.62,.56][coreIndex],yaw:0,w:.40,d:.30,compact:true,cockpit:true}));
  const occupied=[...colliders],convoy=convoyClearanceBoxes(layout),population=buildStreetPopulation(layout,colliders);
  const escapeSegments=population.residents.map(r=>[r.pos,r.shelter]),courtSegments=(layout.expansion?.checkpoints||[]).flatMap(p=>[[p.road,p.entrance],[p.entrance,p.pos]]);
  const protectedPoints=[layout.spawn,...layout.taskPositions,...layout.enemySpawns.map(e=>e.pos)];
  const sites=[];
  for(const [coreIndex,[label,kind,cueKind]]of definitions.entries()){
    const target=layout.taskPositions[coreIndex],candidates=[];
    for(const [w,d,compact]of [[3.8,2.1,false],[2.8,1.7,true]])for(const radius of[3.8,4.8,6.1,7.7,9.4,11.4,13.4])for(let angle=0;angle<32;angle++){
      const a=angle*PI/16,x=target[0]+Math.cos(a)*radius,z=target[1]+Math.sin(a)*radius,yaw=Math.round(Math.atan2(target[0]-x,target[1]-z)/(PI/2))*PI/2;
      const spec={id:`ch${String(chapterId).padStart(2,'0')}-core${coreIndex}`,label,kind,cueKind,chapterId,coreIndex,taskPosition:[...target],x,z,yaw,w,d,compact},bounds=footprint(spec);
      if(bounds.minX<layout.bounds.minX+2||bounds.maxX>layout.bounds.maxX-2||bounds.minZ<layout.bounds.minZ+2||bounds.maxZ>layout.bounds.maxZ-2)continue;
      if(occupied.some(b=>rectanglesOverlap(bounds,b,.50))||convoy.some(b=>rectanglesOverlap(bounds,b,.22)))continue;
      if(protectedPoints.some(p=>pointGap(p,bounds)<(layout.taskPositions.includes(p)?2.0:1.4)))continue;
      if(layout.route.slice(1).some((b,i)=>segmentHitsBox(layout.route[i],b,bounds,1.20)))continue;
      if([...escapeSegments,...courtSegments].some(([a,b])=>segmentHitsBox(a,b,bounds,.70)))continue;
      // Preserve a view from the authored interaction area to the physical
      // landmark rather than hiding it behind the building it should explain.
      const front={x:x+Math.sin(yaw)*(d/2+.3),z:z+Math.cos(yaw)*(d/2+.3)};
      if(lineBlocked({x:target[0],z:target[1]},front,colliders))continue;
      candidates.push({...spec,bounds,front,score:radius+(compact?3.2:0)+Math.abs(Math.sin(a*2))*.15});
    }
    candidates.sort((a,b)=>a.score-b.score);const chosen=candidates[0];
    if(!chosen)throw new Error(`No safe visible storytelling site for chapter ${chapterId} core ${coreIndex}`);
    sites.push(chosen);occupied.push(chosen.bounds);
  }
  return sites;
}

export function buildChapterStorySets(layout,{group,colliders,add,box,line,material,canvasTexture,palette,sampleHeight=()=>0,stats}){
  const sites=planChapterStorySets(layout,colliders),p=palette,landmarks=[],cues=[];
  let triangles=0,solidCount=0,detailCount=0;
  const linen=material({map:p.cloth.map,color:'#b7b3a0',roughness:1,side:THREE.DoubleSide}),olive=material({map:p.cloth.map,color:'#69705b',roughness:1,side:THREE.DoubleSide}),blue=material({map:p.wood.map,color:'#526e77',roughness:1}),rust=material({map:p.rusty.map,color:'#80664f',roughness:1}),paper=material({color:'#c1b89c',roughness:1}),mark=material({color:'#baad87',roughness:1}),red=material({color:'#7c473c',roughness:1}),enamel=material({color:'#a7ae9b',roughness:.65,metalness:.1});
  const atlas=canvasTexture(1536,1024,(ctx,w,h)=>{ctx.fillStyle='#c3b99b';ctx.fillRect(0,0,w,h);for(let i=0;i<3;i++){const y=i*256;ctx.fillStyle=i===2?'#646b57':'#a6a690';ctx.fillRect(0,y,w,238);ctx.strokeStyle='#343e35';ctx.lineWidth=9;ctx.strokeRect(15,y+15,w-30,208);ctx.fillStyle=i===2?'#ded7bb':'#343e35';ctx.textAlign='center';ctx.font='bold 74px sans-serif';ctx.fillText(layout.chapter===7?'SUUQA / DUKAAN':layout.enemySpawns.length?(i===0?'↗  '+String(layout.chapter).padStart(2,'0'):i===1?'AID / CHECK':'→  EXIT'):ENGLISH[sites[i].kind],w/2,y+103);ctx.font='bold 56px "Microsoft YaHei", sans-serif';ctx.fillText(sites[i].label,w/2,y+185);for(let n=0;n<18;n++){ctx.fillStyle='rgba(52,45,32,.13)';ctx.fillRect((n*137+i*61)%w,y+(n*71)%225,35+(n%4)*22,3);}}});
  const lettering=material({map:atlas,roughness:1,side:THREE.DoubleSide});
  function register(spec,w,h,d,u,y,v,yaw=0){
    const a=spec.yaw+yaw,c=Math.cos(spec.yaw),s=Math.sin(spec.yaw),x=spec.x+u*c+v*s,z=spec.z-u*s+v*c,b=footprint({x,z,w,d,yaw:a});
    colliders.push({...b,minY:spec.ground+y-h/2,maxY:spec.ground+y+h/2,material:'masonry',storySet:spec.id});solidCount++;
  }
  function station(spec){
    const c=Math.cos(spec.yaw),s=Math.sin(spec.yaw),scale=spec.compact?.72:1;spec.ground=sampleHeight(spec.x,spec.z)||0;
    const at=(x,y,z)=>[spec.x+x*c+z*s,spec.ground+y,spec.z-x*s+z*c];
    const geo=(g,m,x,y,z,rx=0,ry=0,rz=0)=>{triangles+=(g.index?.count||g.attributes.position.count)/3;const rot=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx,ry,rz));g.applyMatrix4(rot);add(g,m,at(x,y,z),[0,spec.yaw,0]);detailCount++;};
    const b=(w,h,d,m,x,y,z,solid=false,angle=0)=>{box(w,h,d,m,...at(x,y,z),spec.yaw+angle);triangles+=12;detailCount++;if(solid)register(spec,w,h,d,x,y,z,angle);};
    const rod=(a,end,r=.025,m=p.metal)=>{line(at(...a),at(...end),r,m,6);triangles+=24;detailCount++;};
    const label=(index,x=0,y=2.25,z=.12,w=2.6,h=.42)=>{if(layout.enemySpawns.length&&index!==0)return;const g=new THREE.PlaneGeometry(w,h),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(15+uv.getX(i)*1506)/1536,1-(index*256+238-uv.getY(i)*238)/1024);geo(g,lettering,x,y,z);};
    const cloth=(w,h,m,x,y,z,tilt=0)=>{const g=new THREE.PlaneGeometry(w,h,18,8),v=g.attributes.position;for(let i=0;i<v.count;i++)v.setZ(i,Math.sin(v.getX(i)*17)*.038+Math.sin(v.getY(i)*7+v.getX(i)*3)*.015);g.computeVertexNormals();geo(g,m,x,y,z,tilt);};
    function crate(x,y,z,w=.7,d=.55,h=.46){b(w,h,d,p.wood,x,y+h/2,z,true);for(const side of[-1,1])b(.055,h+.04,d+.02,olive,x+side*w*.32,y+h/2,z);for(let j=0;j<4;j++)b(w,.018,.022,rust,x,y+h*.2+j*h*.2,z+d/2+.006);}
    function parcel(x,y,z,w=.43){b(w,.12,w*.7,linen,x,y+.06,z);b(w+.01,.022,.05,olive,x,y+.13,z);b(.05,.025,w*.72,olive,x,y+.14,z);}
    function bench(x=0,z=.1,w=2.55){b(w,.09,.49,p.wood,x,.46,z,true);b(w,.25,.06,p.wood,x,.80,z-.22);for(const u of[-w*.39,w*.39]){b(.07,.44,.41,p.metal,x+u,.22,z,true);rod([x+u,.45,z-.22],[x+u,.94,z-.22],.025);}}
    function table(x=0,z=0,w=2.5){b(w,.09,.76,p.wood,x,.83,z,true);for(const u of[-w*.40,w*.40])for(const v of[-.27,.27])b(.065,.80,.065,p.metal,x+u,.4,z+v,true);b(w-.3,.05,.56,olive,x,.24,z);}
    function bottle(x,y,z,h=.22){geo(new THREE.CylinderGeometry(.045,.05,h,8),blue,x,y+h/2,z);geo(new THREE.CylinderGeometry(.03,.03,.035,8),paper,x,y+h+.015,z);b(.09,h*.35,.006,paper,x,y+h*.48,z+.051);}
    function jug(x,z){geo(new THREE.CylinderGeometry(.23,.20,.58,12),enamel,x,.30,z);geo(new THREE.TorusGeometry(.19,.025,5,12),p.metal,x,.57,z,PI/2);rod([x-.13,.58,z],[x-.13,.72,z],.018);rod([x-.13,.72,z],[x+.13,.72,z],.018);rod([x+.13,.72,z],[x+.13,.58,z],.018);register(spec,.48,.62,.48,x,.31,z);}
    function cot(x=0,z=0){b(.82,.11,1.78,olive,x,.51,z,true);b(.65,.12,.34,linen,x,.62,z-.58);b(.78,.035,.95,linen,x,.59,z+.25);for(const u of[-.45,.45]){rod([x+u,.45,z-1],[x+u,.45,z+1],.028);rod([x+u,.02,z-.72],[x+u,.48,z+.72],.026);rod([x+u,.02,z+.72],[x+u,.48,z-.72],.026);}register(spec,.96,.6,2.0,x,.30,z);}
    function awning({torn=false,shade=olive,height=2.75,width=3.5}={}){const w=width*scale;for(const x of[-w/2,w/2]){b(.12,height,.12,p.wood,x,height/2,.56,true);rod([x,height,.56],[x,height+.26,-.7],.035,p.rusty);}b(w+.12,.13,.12,p.wood,0,height,.56);b(w+.15,.1,.15,p.wood,0,height+.26,-.7);const g=new THREE.PlaneGeometry(w+.28,1.48,18,5),v=g.attributes.position;for(let i=0;i<v.count;i++){const xx=v.getX(i),zz=v.getY(i);v.setXYZ(i,xx,height+.13-.17*Math.cos(xx*1.8)-zz*.16,zz-.12);}g.computeVertexNormals();geo(g,shade,0,0,0);if(torn)for(let k=0;k<3;k++)cloth(.36,.40+k*.12,shade,-w*.27+k*.42,height-.25,.61,.13);}
    function backWall({damaged=false,color=p.concrete,height=2.4,width=3.5}={}){const w=width*scale;if(!damaged)b(w,height,.22,color,0,height/2,-.78,true);else{b(w,height*.33,.26,color,0,height*.165,-.78,true);for(const [x,h]of[[-w*.40,height],[-w*.10,height*.69],[w*.29,height*.48]]){b(w*.27,h,.27,color,x,h/2,-.78,true);for(let i=0;i<2;i++)rod([x+i*.14,h,-.78],[x+i*.14+.06,h+.29,-.74],.01,p.rusty);}}}
    function doorway(color=blue){const w=3.5*scale;for(const side of[-1,1]){b(.34,2.7,.38,p.concrete,side*(w/2-.16),1.35,-.62,true);b(.54,2.35,.11,color,side*(w/2-.51),1.175,-.67,false,side*.14);}b(w,.24,.43,p.concrete,0,2.68,-.62);}
    function rolls(x=0,z=.1){for(let k=0;k<3;k++){geo(new THREE.CylinderGeometry(.10,.10,.58,9),linen,x+(k-1)*.25,.14,z,0,0,PI/2);b(.05,.22,.22,olive,x+(k-1)*.25,.14,z);}}
    function rubble(){for(let k=0;k<15;k++){const x=(Math.sin(k*2.4)*.85+Math.cos(k)*.25)*scale,z=-.6+Math.cos(k*1.7)*.22;const g=new THREE.DodecahedronGeometry(.1+(k%4)*.035,0);g.scale(1,.55,.8);geo(g,k%3?p.exposed:p.brickEdge,x,.08,z,.2*k,.8*k,.11*k);}}
    function mapBoard(){b(2.9*scale,1.4,.07,p.wood,0,1.65,-.64,true);for(const x of[-1.1,1.1])b(.055,2.35,.055,p.metal,x*scale,1.175,-.64,true);b(2.65*scale,1.18,.012,paper,0,1.65,-.596);for(let n=0;n<5;n++)b(2.4*scale,.018,.012,olive,0,1.2+n*.22,-.585);for(let n=0;n<5;n++)b(.018,1.04,.014,olive,(-1+n*.5)*scale,1.64,-.578);for(let n=0;n<4;n++)b(.20,.15,.02,red,(-.7+n*.41)*scale,1.3+n*.18,-.56);label(spec.coreIndex,0,2.6,-.59,2.6*scale,.37);}
    return{spec,at,geo,b,rod,label,cloth,crate,parcel,bench,table,bottle,jug,cot,awning,backWall,doorway,rolls,rubble,mapBoard,scale};
  }
  function cue(l,kind){
    const {spec}=l,pivot=new THREE.Group();pivot.name='story-cue:'+spec.id;
    const component=(g,m,pos=[0,0,0],rotation=[0,0,0])=>{const mesh=new THREE.Mesh(g,m);mesh.position.set(...pos);mesh.rotation.set(...rotation);mesh.castShadow=true;mesh.receiveShadow=true;pivot.add(mesh);triangles+=(g.index?.count||g.attributes.position.count)/3;detailCount++;return mesh;};
    const b=(w,h,d,m,x=0,y=0,z=0)=>component(new THREE.BoxGeometry(w,h,d),m,[x,y,z]);
    const metadata={id:spec.id,kind,chapterId:layout.chapter,coreIndex:spec.coreIndex,label:spec.label,successText:spec.label+'已交接',...(kind==='gate'?{gateRole:'rack-confirmation-panel',affectsPassage:false}:{})};
    if(kind==='signal'){
      pivot.position.fromArray(l.at(1.12*l.scale,1.62,.24));pivot.rotation.y=spec.yaw;metadata.axis='z';metadata.angle=-.58;metadata.travel=[0,.22,0];
      b(.06,.70,.06,p.wood,0,.23,0);b(.42,.25,.028,layout.chapter<4?paper:mark,.22,.52,0);b(.30,.025,.035,red,.21,.52,.021);
    }else if(kind==='curtain'){
      pivot.position.fromArray(l.at(-1.10*l.scale,2.36,-.50));pivot.rotation.y=spec.yaw;metadata.axis='z';metadata.angle=-.12;metadata.travel=[0,.36,0];
      const g=new THREE.PlaneGeometry(.67,1.35,10,10),v=g.attributes.position;for(let i=0;i<v.count;i++)v.setZ(i,Math.sin(v.getX(i)*25)*.045);g.computeVertexNormals();component(g,linen,[.29,-.68,0]);b(.71,.06,.07,p.wood,.29,.02,0);
    }else if(kind==='stretcher'){
      pivot.position.fromArray(l.at(.13,.64,.0));pivot.rotation.y=spec.yaw;metadata.axis='z';metadata.angle=.025;metadata.travel=[0,0,-.18];
      b(.74,.055,1.38,linen);for(const side of[-1,1])b(.034,.034,1.66,p.metal,side*.40,-.045,0);for(let k=0;k<3;k++)b(.78,.025,.055,olive,0,.042,-.42+k*.42);
    }else{
      pivot.position.fromArray(l.at(-1.23*l.scale,.86,-.23));pivot.rotation.y=spec.yaw;metadata.axis='y';metadata.angle=-.72;metadata.travel=[0,0,0];
      // A short confirmation panel hinged against a fixed rack; its complete
      // swing remains inside the station footprint, never across a route.
      b(.67,.48,.07,blue,.32,0,0);for(const y of[-.16,.16])b(.70,.045,.09,p.wood,.32,y,.015);b(.045,.16,.10,p.metal,.58,0,.07);
    }
    pivot.userData.storyCue=metadata;group.add(pivot);cues.push({id:spec.id,kind,chapterId:layout.chapter,coreIndex:spec.coreIndex,position:pivot.position.toArray(),axis:metadata.axis,angle:metadata.angle,travel:[...metadata.travel]});return pivot;
  }
  const baselinePopulation=buildStreetPopulation(layout,colliders),convoySweeps=convoyClearanceBoxes(layout);
  const reservedWalks=[...layout.route.slice(1).map((b,i)=>[layout.route[i],b]),...(layout.expansion?.checkpoints||[]).flatMap(c=>[[c.road,c.entrance],[c.entrance,c.pos]]),...baselinePopulation.residents.map(r=>[r.pos,r.shelter])];
  const architecture=[];
  function clearStoryPart(spec,u,v,w,d,pad=.15){
    const c=Math.cos(spec.yaw),s=Math.sin(spec.yaw),x=spec.x+u*c+v*s,z=spec.z-u*s+v*c,bounds=footprint({x,z,w,d,yaw:spec.yaw});
    if(bounds.minX<layout.bounds.minX+1||bounds.maxX>layout.bounds.maxX-1||bounds.minZ<layout.bounds.minZ+1||bounds.maxZ>layout.bounds.maxZ-1)return false;
    if(colliders.some(b=>rectanglesOverlap(bounds,b,pad))||convoySweeps.some(b=>rectanglesOverlap(bounds,b,.15)))return false;
    if([layout.spawn,...layout.taskPositions].some(p=>pointGap(p,bounds)<1.7))return false;
    if(reservedWalks.some(([a,b])=>segmentHitsBox(a,b,bounds,.9)))return false;
    return true;
  }
  function architecturalFrame(l){
    const {spec,b,rod,geo}=l;if(spec.cockpit)return;
    const interior=[3,11,16].includes(layout.chapter),medical=[1,11,16].includes(layout.chapter),market=layout.chapter===7,war=layout.enemySpawns.length>0;
    let selected=null;
    findFrame:for(const width of[9.0,7.2,5.6])for(const depth of[2.8,2.2]){
      const support=[-width/2,width/2].map(u=>({u,v:depth*.30}));
      if(support.every(p=>clearStoryPart(spec,p.u,p.v,.24,.24,.2))){selected={width,depth,support};break findFrame;}
      if(selected)break;
    }
    if(!selected)return;
    const {width,depth,support}=selected,height=layout.chapter===3?3.65:layout.chapter===11?2.75:market?3.15:war?3.35:3.10;
    const frameMat=war?p.exposed:p.wood,roofMat=medical?linen:market?(spec.coreIndex%2?rust:blue):olive;
    for(const {u,v}of support){b(.22,height,.25,frameMat,u,height/2,v,true);b(.43,.22,.47,p.concrete,u,.11,v,true);rod([u,height-.85,v],[u+(u<0?.65:-.65),height+.03,v],.045,p.wood);rod([u,height,v-depth*.65],[u,height,v+depth*.55],.06,p.wood);}
    b(width+.25,.20,.22,frameMat,0,height,depth*.30);b(width+.35,.15,.17,p.wood,0,height+.15,-depth*.39);
    for(let n=0;n<=Math.ceil(width/1.3);n++){const u=-width/2+n*width/Math.ceil(width/1.3);rod([u,height+.12,-depth*.43],[u,height-.05,depth*.69],.035,p.wood);}
    if(layout.chapter===3){
      for(const u of[-width*.42,0,width*.42]){rod([u,height,-depth*.45],[u,height+.75,0],.045);rod([u,height+.75,0],[u,height,depth*.62],.045);}b(width+.3,.12,depth*.54,p.rusty,0,height+.4,-depth*.18,false);b(width+.3,.12,depth*.54,p.rusty,0,height+.4,depth*.35,false);
    }else if([6,10,14].includes(layout.chapter)){
      const cut=width*.23;for(const [u,w]of[[-width*.29,width*.41],[width*.25,width*.22]]){b(w,.16,depth*.92,p.concrete,u,height+.2,.12);for(let j=0;j<3;j++)rod([u+w*.4,height+.22,-.35+j*.25],[u+w*.4+.33,height+.05,-.25+j*.25],.011,p.rusty);}
      rod([-cut,height+.1,-.4],[cut*.8,height-.24,.2],.07,p.rusty);l.cloth(width*.23,.56,olive,-width*.2,height-.26,depth*.7,.16);
    }else if(layout.chapter===11){
      // Ceiling rails continue the existing treatment room, leaving its aisle
      // and bed approaches open rather than inserting a new room-scale box.
      for(const side of[-1,1])l.cloth(.85,1.7,linen,side*width*.41,height-.88,.1);rod([-width/2,height+.04,0],[width/2,height+.04,0],.025,p.metal);
    }else{
      const panels=market?3:2;
      for(let n=0;n<panels;n++){const panelW=(width+.4)/panels,u=-width/2+(n+.5)*width/panels,g=new THREE.PlaneGeometry(panelW,depth*1.18,14,5),v=g.attributes.position;for(let i=0;i<v.count;i++){const x=v.getX(i),z=v.getY(i);v.setXYZ(i,x,height+.12-.14*Math.cos(x*2.2)-z*.10,z+.1);}g.computeVertexNormals();geo(g,market?[olive,rust,linen][n]:roofMat,u,0,0);if(war||market)l.cloth(panelW*.75,.30+n*.07,market?[olive,rust,linen][n]:roofMat,u,height-.19,depth*.68,.09);}
    }
    // Street-facing contents form a continuous edge below the large silhouette.
    // Every significant solid is independently checked, not a broad invisible
    // box beneath the walkable canopy.
    let props=0;
    for(let n=0;n<5;n++){
      const u=(-.38+n*.19)*width,v=-depth*.22;if(!clearStoryPart(spec,u,v,.85,.65,.25))continue;
      if(market){l.crate(u,0,v,.72,.60,.40);for(let j=0;j<5;j++)geo(new THREE.SphereGeometry(.075,6,4),j%2?enamel:mark,u-.22+(j%3)*.19,.50+Math.floor(j/3)*.10,v+.05);}
      else if(medical){l.crate(u,0,v,.78,.60,.43);l.parcel(u,.45,v,.52);if(n%2===0)l.bottle(u+.2,.57,v+.05);}
      else if(layout.chapter===2||layout.chapter===3){l.crate(u,0,v,.75,.60,.52);geo(new THREE.CylinderGeometry(.19,.22,.20,10),olive,u,.67,v,PI/2);}
      else{l.crate(u,0,v,.80,.60,.35);l.rolls(u,v);}
      props++;
    }
    for(let n=0;n<27;n++){
      const u=Math.sin(n*2.399)*width*.46,v=.2+Math.cos(n*1.71)*depth*.47,point=l.at(u,.025,v);if(!clearStoryPart(spec,u,v,.13,.13,0))continue;
      const material=n%5===0?paper:n%3?p.exposed:p.brickEdge,g=n%5===0?new THREE.PlaneGeometry(.16,.22):new THREE.DodecahedronGeometry(.06+(n%4)*.025,0);if(n%5)g.scale(1,.35,.7);geo(g,material,u,sampleHeight(point[0],point[2])-spec.ground+.025,v,n%5===0?-PI/2:.12,n*.7,.1);detailCount++;
    }
    const kind=layout.chapter===3?'hangar-service-truss':layout.chapter===11?'triage-curtain-rail':market?'patchwork-market-frontage':[6,10,14].includes(layout.chapter)?'broken-masonry-roof':medical?'clinic-linen-canopy':war?'damaged-field-porch':'camp-service-canopy';
    architecture.push({landmarkId:spec.id,kind,position:[spec.x,spec.ground,spec.z],width,depth,height,posts:support.map(({u,v})=>l.at(u,0,v)),clearCentralPassage:true,shoulderProps:props});
  }
  for(const spec of sites){
    const l=station(spec),{b,geo,rod,scale}=l,k=spec.kind;
    if(spec.cockpit){
      // Keep the injured pilot's real seat and rescuer approach untouched.
      if(spec.coreIndex===0){b(.10,.33,.06,olive,0,.83,0);b(.16,.055,.09,p.metal,.04,.73,.02);rod([0,.92,0],[.17,1.06,.1],.012,p.rubber);}
      if(spec.coreIndex===1){b(.32,.12,.12,p.metal,0,.95,0);for(const x of[-.1,0,.1])geo(new THREE.CylinderGeometry(.025,.025,.025,9),paper,x,1.02,.02,PI/2);rod([-.13,.94,0],[-.22,.66,.18],.012,p.rubber);}
      if(spec.coreIndex===2){rod([0,.94,0],[0,1.35,0],.018,p.metal);l.cloth(.23,.32,linen,0,1.15,.02);}
      const node=cue(l,spec.cueKind);node.position.fromArray(l.at(0,spec.coreIndex===2?1.3:1.08,.03));node.scale.setScalar(.27);node.userData.storyCue.travel=[0,.035,0];node.userData.storyCue.angle=.16;Object.assign(cues.at(-1),{position:node.position.toArray(),travel:[0,.035,0],angle:.16});
    }else{
      const porch=['clinic-porch','family-porch','kit-canopy','boarding-frame','stretcher-porch','market-porch','market-rally','blackout-porch','aid-arrival'].includes(k);
      const wreck=['wreck-screen','broken-roof','wreck-perimeter','rescue-entry','recovery-mark','shelter-wall','rest-wall'].includes(k);
      if(porch){l.doorway(k==='clinic-porch'||k==='market-rally'?blue:olive);l.awning({torn:layout.enemySpawns.length>0,shade:k==='market-porch'?rust:olive});l.label(spec.coreIndex,0,2.72,.64,2.65*scale,.36);}
      if(wreck){l.backWall({damaged:true,color:p.exposed,height:k==='broken-roof'?3.0:2.5});l.rubble();l.label(spec.coreIndex,0,2.35,-.60,2.5*scale,.38);if(k==='broken-roof'){b(3.35*scale,.17,.72,p.concrete,0,2.62,-.35);rod([-1.4*scale,2.61,-.2],[.5*scale,2.29,.45],.055,p.rusty);}}
      if(['water-triage','vehicle-aid','surgical-tray','medical-screen','shared-supply','aid-arrival'].includes(k)){
        l.table(0,-.03,2.55*scale);for(let n=0;n<5;n++)l.parcel((n-2)*.40*scale,.89,-.02);l.bottle(.68*scale,.9,.10);l.jug(-1.26*scale,.54);if(!porch)l.label(spec.coreIndex,0,2.25,-.55,2.5*scale,.36);
        if(k==='water-triage'){for(const x of[-.65,.65])geo(new THREE.CylinderGeometry(.24,.22,.65,14),x<0?blue:enamel,x*scale,1.24,-.02);b(.5,.08,.03,mark,-.65*scale,1.2,.23);b(.5,.08,.03,red,.65*scale,1.2,.23);}
        if(k==='surgical-tray'){rod([.85,0,-.45],[.85,2.35,-.45],.024);rod([.85,2.35,-.45],[.25,2.48,.1],.024);geo(new THREE.ConeGeometry(.19,.19,12,1,true),enamel,.25,2.39,.1);}
      }else if(['stretcher-porch','casualty-transfer','pilot-shelter','treatment-bed','stretcher-handover','last-stretcher','rescue-entry'].includes(k)){
        l.cot(.1,.02);l.jug(-1.02*scale,.35);l.rolls(.8*scale,-.58);if(!porch&&!wreck){l.backWall({height:2.25,color:olive});l.label(spec.coreIndex,0,2.4,-.63,2.5*scale,.35);}if(k==='treatment-bed')l.cloth(.75,1.55,linen,1.05*scale,1.35,-.5);
      }else if(['briefing-wall','convoy-exit','return-turn','radio-last','relief-marker','recovery-mark','muster-line','escape-turn'].includes(k)){
        if(!wreck)l.mapBoard();l.table(0,.18,2.4*scale);b(.52,.29,.32,olive,-.65*scale,1.025,.12,true);for(let n=0;n<4;n++)b(.26,.008,.19,paper,(-.1+n*.31)*scale,.89,.15);rod([-.65*scale,1.17,.05],[-.65*scale,1.75,.05],.009);l.crate(.93*scale,0,-.48,.5,.48,.4);
        if(['return-turn','escape-turn'].includes(k)){for(let n=0;n<3;n++)b(.39,.08,.045,mark,(-.55+n*.34)*scale,2.01,-.53,false,n%2?.45:-.45);}
      }else if(['personal-effects','memorial-table','return-register','loadout-bench'].includes(k)){
        l.table(0,0,3.0*scale);for(let n=0;n<4;n++){l.parcel((-1+n*.67)*scale,.89,-.10,.42);b(.27,.008,.17,paper,(-1+n*.67)*scale,1.035,.11);}
        if(k==='memorial-table'){l.cloth(2.8*scale,.49,linen,0,.63,.39);for(let n=0;n<3;n++){geo(new THREE.CylinderGeometry(.038,.038,.17,9),paper,(-.65+n*.65)*scale,1.02,.23);rod([(-.65+n*.65)*scale,1.10,.23],[(-.65+n*.65)*scale,1.13,.23],.003,p.dark);}}
        if(k==='loadout-bench'){for(let n=0;n<3;n++)geo(new THREE.TorusGeometry(.16,.05,6,12),olive,(-.8+n*.8)*scale,1.0,.10,PI/2);}
        l.label(spec.coreIndex,0,1.72,-.57,2.7*scale,.38);for(const x of[-1.28,1.28])rod([x*scale,.85,-.57],[x*scale,2.0,-.57],.02);
      }else if(['roadblock-tableau','compound-check','loading-ramp'].includes(k)){
        l.backWall({height:1.15,color:k==='compound-check'?blue:p.exposed});for(const x of[-1.1,0,1.1]){b(.15,1.55,.15,p.wood,x*scale,.775,-.63,true);b(.72,.14,.08,mark,x*scale,1.18,-.50,false,.28);}l.crate(.85*scale,0,.05,.8,.7,.7);l.label(spec.coreIndex,0,2.15,-.58,2.6*scale,.38);rod([-1.25*scale,0,-.65],[-1.25*scale,2.4,-.65],.025);rod([1.25*scale,0,-.65],[1.25*scale,2.4,-.65],.025);
        if(k==='roadblock-tableau')for(let n=0;n<3;n++)geo(new THREE.TorusGeometry(.32,.105,6,12),p.rubber,(-.8+n*.48)*scale,.35,.40,0,PI/2,.12*n);
        if(k==='loading-ramp')b(1.2,.12,1.7,p.wood,-.55*scale,.23,.1,true);
      }else if(['barracks-rack','rear-cargo','kit-canopy'].includes(k)){
        for(const x of[-1.24,1.24])for(const z of[-.6,.27])b(.07,2.15,.07,p.metal,x*scale,1.075,z,true);for(const y of[.22,.87,1.52]){b(2.65*scale,.06,.9,p.wood,0,y,-.15,true);for(let n=0;n<4;n++)l.parcel((-1+n*.66)*scale,y+.04,-.1,.46);}if(!porch)l.label(spec.coreIndex,0,2.3,-.1,2.65*scale,.38);if(k==='rear-cargo')l.cloth(2.9*scale,.68,olive,0,1.85,-.64);
      }else{l.bench(0,.10,2.5*scale);l.jug(1.2*scale,.35);l.rolls(-.75*scale,-.52);if(!porch&&!wreck){l.backWall({height:1.9,color:blue});l.label(spec.coreIndex,0,2.1,-.62,2.5*scale,.35);}}
      if(k==='rope-landing'){l.awning({torn:true,height:3.15,width:3.1});for(let side of[-1,1]){rod([side*.35,3.1,-.15],[side*.35+.06,.17,.25],.028,olive);geo(new THREE.TorusGeometry(.24,.025,5,15),olive,side*.35,.055,.31,PI/2);}l.label(spec.coreIndex,0,2.85,.6,2.6*scale,.36);}
      architecturalFrame(l);cue(l,spec.cueKind);
    }
    landmarks.push({id:spec.id,label:spec.label,kind:spec.kind,coreIndex:spec.coreIndex,chapterId:layout.chapter,position:[spec.x,spec.ground+(spec.cockpit?1:1.5),spec.z],taskPosition:[...spec.taskPosition],approach:spec.front?[spec.front.x,sampleHeight(spec.front.x,spec.front.z),spec.front.z]:[...spec.taskPosition],bounds:spec.bounds||null,compact:spec.compact,cueId:spec.id,visible:true});
  }
  const result={version:1,landmarks,cues,architecture,staticTriangles:triangles,detailedParts:detailCount,solidCount,protectedRoutes:true,chapterId:layout.chapter};
  if(stats)stats.storySets=result;
  return result;
}
