import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Static, chapter-owned set dressing. Geometry/material lifetime and batching
// stay with chapter-world. There is no quest, resource or actor state here.
export function dressChapterInterior(layout,ctx){
  if(![1,2,3,11,16].includes(layout.chapter))return{placed:0,skipped:0,stations:[],counts:{}};
  const {add,box,line,material,canvasTexture,palette,obstacle,routeDistance,sampleHeight=()=>0,stats}=ctx;
  const PI=Math.PI,existing=ctx.colliders||[],reserved=[],stations=[],skipped=[];
  const counts={cots:0,cabinets:0,medicalTrolleys:0,waterPoints:0,equipmentRacks:0,workbenches:0,curtains:0,cargoStacks:0,briefingBoards:0,memorialTables:0};
  const p=palette,lightSources=[];
  const fabricMap=canvasTexture(256,256,(c,w,h)=>{c.fillStyle='#b5b3a2';c.fillRect(0,0,w,h);for(let i=0;i<w;i+=2){c.strokeStyle=i%4?'rgba(42,47,40,.08)':'rgba(255,255,230,.12)';c.beginPath();c.moveTo(i,0);c.lineTo(i,h);c.stroke();}for(let i=0;i<h;i+=3){c.strokeStyle='rgba(44,48,40,.07)';c.beginPath();c.moveTo(0,i);c.lineTo(w,i);c.stroke();}});
  fabricMap.wrapS=fabricMap.wrapT=THREE.RepeatWrapping;
  const cloth=material({map:fabricMap,color:'#67715b',roughness:1,side:THREE.DoubleSide});
  const linen=material({map:fabricMap,color:'#c5c3ad',roughness:1,side:THREE.DoubleSide});
  const curtainMat=material({map:fabricMap,color:'#8f9d8b',roughness:1,side:THREE.DoubleSide});
  const enamel=material({color:'#b2b5a5',roughness:.62,metalness:.15});
  const steel=material({color:'#7b807c',roughness:.46,metalness:.65});
  const frame=material({color:'#4d554b',roughness:.7,metalness:.45});
  const amber=material({color:'#50351e',roughness:.42,metalness:.03});
  const labelWhite=material({color:'#d4cfb7',roughness:.95});
  const red=material({color:'#87594b',roughness:.95});
  const blue=material({color:'#657c83',roughness:.85});
  const lampMat=material({color:'#d9d3b8',roughness:.5,emissive:'#d8bd7f',emissiveIntensity:.28});
  const workMark=material({color:'#ada17b',roughness:1});
  const oilMap=canvasTexture(128,128,(c,w,h)=>{c.clearRect(0,0,w,h);for(let i=0;i<8;i++){const x=38+Math.sin(i*7)*22,y=64+Math.cos(i*11)*26,r=12+i*2,g=c.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,'rgba(41,37,28,.17)');g.addColorStop(1,'rgba(41,37,28,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}});
  const oil=material({map:oilMap,transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2});
  const labels=['CLINIC','DRESSINGS','SALINE','STERILE','WATER','RATIONS','PERSONAL KIT','TOOLS','SPARES','MEDICAL','TRIAGE','RECOVERY','RETURNED / 04 OCT','PERSONNEL LOG','AIRFIELD / 03 OCT','KEEP CLEAR','SECTOR SKETCH','FUEL','USED LINEN','CLEAN LINEN','INSPECTED','EQUIPMENT'];
  const atlas=canvasTexture(1024,1024,(c,w,h)=>{c.fillStyle='#c3bba2';c.fillRect(0,0,w,h);for(let i=0;i<labels.length;i++){const x=i%2*512,y=Math.floor(i/2)*80;c.fillStyle=i%3?'#c5c1ad':'#69735e';c.fillRect(x+5,y+5,502,70);c.strokeStyle=i%3?'#747a69':'#b4b69b';c.lineWidth=3;c.strokeRect(x+8,y+8,496,64);c.fillStyle=i%3?'#414b42':'#ded9c3';c.font='bold 31px sans-serif';c.textAlign='center';c.fillText(labels[i],x+256,y+52);}});
  const lettering=material({map:atlas,roughness:1});
  function text(index,w,h,x,y,z,yaw=0){const g=new THREE.PlaneGeometry(w,h),uv=g.attributes.uv,col=index%2,row=Math.floor(index/2);for(let i=0;i<uv.count;i++)uv.setXY(i,(col*512+5+uv.getX(i)*502)/1024,1-(row*80+75-uv.getY(i)*70)/1024);add(g,lettering,[x,y,z],[0,yaw,0]);}
  const overlap=(a,b,pad=0)=>a.minX<b.maxX+pad&&a.maxX>b.minX-pad&&a.minZ<b.maxZ+pad&&a.maxZ>b.minZ-pad;
  function footprint(x,z,w,d,yaw=0){const c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw)),hx=(w*c+d*s)/2,hz=(d*c+w*s)/2;return{minX:x-hx,maxX:x+hx,minZ:z-hz,maxZ:z+hz};}
  function pointGap(x,z,b){return Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ));}
  function doorPoints(){const result=[];for(const b of layout.buildings||[])for(const side of b.doors||[]){if(side==='east'||side==='west'){const bays=Math.max(2,Math.round(b.d/3.5)),off=bays%2?0:b.d/bays/2;result.push([b.x+(side==='east'?1:-1)*b.w/2,b.z+(side==='east'?-off:off)]);}else{const bays=Math.max(2,Math.round(b.w/3.5)),off=bays%2?0:b.w/bays/2;result.push([b.x+(side==='south'?off:-off),b.z+(side==='south'?1:-1)*b.d/2]);}}return result;}
  const doors=doorPoints();
  function canPlace(b){
    if(b.minX<layout.bounds.minX+.25||b.maxX>layout.bounds.maxX-.25||b.minZ<layout.bounds.minZ+.25||b.maxZ>layout.bounds.maxZ-.25)return'bounds';
    if(pointGap(...layout.spawn,b)<1.8)return'spawn';
    if(layout.taskPositions.some(v=>pointGap(...v,b)<2.2))return'task';
    if(doors.some(v=>pointGap(...v,b)<1.5))return'door';
    for(let x=b.minX;x<=b.maxX+.1;x+=.35)for(let z=b.minZ;z<=b.maxZ+.1;z+=.35)if(routeDistance(Math.min(x,b.maxX),Math.min(z,b.maxZ))<2)return'route';
    if(existing.some(v=>overlap(b,v,.1))||reserved.some(v=>overlap(b,v,.14)))return'occupied';
    return null;
  }
  function station(name,x,z,w,d,yaw,paint,{solid=true,materialName='metal'}={}){
    const bounds=footprint(x,z,w,d,yaw),reason=canPlace(bounds);if(reason){skipped.push({name,x,z,reason});return false;}
    const y=sampleHeight(x,z)||0,c=Math.cos(yaw),s=Math.sin(yaw),pos=(a,b,q)=>[x+a*c+q*s,y+b,z-a*s+q*c];
    const local={pos,box:(a,b,q,m,xx,yy,zz,angle=0)=>box(a,b,q,m,...pos(xx,yy,zz),yaw+angle),
      soft:(a,b,q,m,xx,yy,zz,r=.035,angle=0)=>add(new RoundedBoxGeometry(a,b,q,2,Math.min(r,a*.2,b*.2,q*.2)),m,pos(xx,yy,zz),[0,yaw+angle,0]),
      add:(g,m,xx,yy,zz,rx=0,ry=0,rz=0)=>{const matrix=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx,ry,rz));g.applyMatrix4(matrix);add(g,m,pos(xx,yy,zz),[0,yaw,0]);},
      line:(a,b,r,m=frame,sides=8)=>line(pos(...a),pos(...b),r,m,sides),
      text:(i,a,b,xx,yy,zz,angle=0)=>text(i,a,b,...pos(xx,yy,zz),yaw+angle),
      light:(xx,yy,zz,intensity=16,distance=8)=>{const spec={position:pos(xx,yy,zz),color:'#e1c295',intensity,distance};lightSources.push(spec);ctx.addInteriorLight?.(spec);}};
    paint(local);reserved.push(bounds);if(solid){const ob=obstacle((bounds.minX+bounds.maxX)/2,(bounds.minZ+bounds.maxZ)/2,bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ,materialName);if(ob)ob.interiorDetail=name;}
    stations.push({name,x,z,w,d,yaw,bounds,solid});return true;
  }
  function bottle(l,x,y,z,h=.18,medical=true){l.add(new THREE.CylinderGeometry(.035,.042,h,10),medical?amber:blue,x,y+h/2,z);l.add(new THREE.CylinderGeometry(.028,.028,.035,10),labelWhite,x,y+h+.01,z);l.box(.071,h*.42,.004,labelWhite,x,y+h*.5,z+.041);}
  function packageBox(l,x,y,z,w=.33,d=.24,h=.15){l.soft(w,h,d,linen,x,y+h/2,z,.015);l.box(w+.005,.018,.055,cloth,x,y+h/2,z);l.box(.055,h+.005,d+.005,cloth,x,y+h/2,z);}
  function bucket(l,x,z,water=false){l.add(new THREE.CylinderGeometry(.21,.16,.35,18,1,true),enamel,x,.2,z);l.add(new THREE.CircleGeometry(.195,18),water?blue:p.dark,x,.335,z,-PI/2);l.add(new THREE.TorusGeometry(.205,.013,6,20),steel,x,.375,z,PI/2);const points=[];for(let i=0;i<=12;i++){const a=i*PI/12;points.push(new THREE.Vector3(x+Math.cos(a)*.205,.38+Math.sin(a)*.19,z));}l.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.012,5,false),steel,0,0,0);}
  function cot(l,{covered=false}={}){
    counts.cots++;l.soft(.86,.12,1.95,covered?linen:cloth,0,.57,0,.04);l.soft(.64,.13,.37,linen,0,.68,-.69,.05);l.soft(.81,.055,1.1,covered?linen:cloth,0,.665,.36,.025);
    for(const x of[-.46,.46]){l.line([x,.48,-1.02],[x,.48,1.02],.027);l.line([x,.04,-.78],[x,.55,.78],.025);l.line([x,.04,.78],[x,.55,-.78],.025);}
    for(const z of[-.95,.95])l.line([-.46,.49,z],[.46,.49,z],.027);for(const x of[-.36,.36])l.box(.006,.002,1.01,cloth,x,.695,.36);
  }
  function bench(l){l.soft(2.15,.075,.48,p.wood,0,.48,0,.02);for(const x of[-.88,.88]){l.line([x,.02,-.18],[x,.51,-.18],.035);l.line([x,.02,.18],[x,1,.18],.035);}l.box(2.1,.22,.055,p.wood,0,.84,.20);}
  function cabinet(l){counts.cabinets++;l.soft(1.25,1.72,.045,enamel,0,.93,-.24,.015);for(const x of[-.60,.60])l.soft(.055,1.72,.5,enamel,x,.93,0,.015);for(const y of[.10,1.77])l.soft(1.25,.055,.5,enamel,0,y,0,.015);l.box(1.11,1.48,.018,frame,0,.98,-.207);for(const y of[.3,.72,1.13,1.53]){l.box(1.11,.035,.4,enamel,0,y,.07);for(let i=0;i<6;i++)bottle(l,-.44+i*.17,y+.025,.18,.14+i%2*.06);}
    // One actual open door with a handle; the contents remain readable.
    l.box(.57,1.48,.035,enamel,-.79,.98,.48,-.55);l.line([-.86,.75,.63],[-.86,1.05,.63],.012,steel);l.text(9,.94,.15,0,1.73,.272);
    for(const x of[-.49,.49])for(const z of[-.16,.16])l.box(.055,.16,.055,frame,x,.08,z);
  }
  function trolley(l){counts.medicalTrolleys++;for(const y of[.28,.78]){l.soft(.74,.045,.49,steel,0,y,0,.018);for(const z of[-.25,.25])l.line([-.37,y+.06,z],[.37,y+.06,z],.012,steel);}for(const x of[-.31,.31])for(const z of[-.19,.19]){l.line([x,.1,z],[x,.93,z],.015,steel);l.add(new THREE.TorusGeometry(.055,.018,6,10),p.rubber,x,.07,z,0,PI/2);}
    l.soft(.29,.025,.21,enamel,-.14,.82,0,.015);for(let i=0;i<3;i++)bottle(l,.10+i*.075,.815,.08,.13);packageBox(l,.1,.31,.05,.34,.28,.12);l.line([-.32,.94,-.19],[.32,.94,-.19],.02,steel);
  }
  function screen(l,w=1.5,h=1.85){counts.curtains++;for(const x of[-w/2,w/2]){l.line([x,.03,0],[x,h+.18,0],.02,steel);l.line([x,.03,-.24],[x,.03,.24],.026,steel);}l.line([-w/2,h+.15,0],[w/2,h+.15,0],.022,steel);
    const g=new THREE.PlaneGeometry(w-.10,h-.24,24,8),v=g.attributes.position;for(let i=0;i<v.count;i++){const x=v.getX(i),y=v.getY(i);v.setZ(i,Math.sin(x*25)*.055+Math.sin(x*8+y*3)*.008);}g.computeVertexNormals();l.add(g,curtainMat,0,h/2+.1,0);for(let i=0;i<8;i++)l.add(new THREE.TorusGeometry(.031,.005,4,8),steel,-w*.42+i*w*.12,h+.12,0,0,PI/2);
  }
  function waterStation(l){counts.waterPoints++;l.soft(1.3,.08,.65,p.wood,0,.66,0,.025);for(const x of[-.53,.53])for(const z of[-.24,.24])l.box(.07,.64,.07,frame,x,.32,z);l.add(new THREE.CylinderGeometry(.27,.25,.59,20),blue,-.27,.99,0);l.add(new THREE.TorusGeometry(.26,.018,5,20),steel,-.27,1.29,0,PI/2);l.line([-.27,.77,.24],[-.27,.77,.37],.018,steel);l.line([-.27,.77,.37],[-.27,.71,.37],.018,steel);l.text(4,.36,.11,-.27,1.0,.272);bucket(l,.57,.4,true);l.soft(.25,.10,.24,linen,.45,.76,0,.025);}
  function workbench(l,medical=false){counts.workbenches++;l.soft(2.25,.095,.78,medical?enamel:p.wood,0,.86,0,.028);for(const x of[-.98,.98])for(const z of[-.29,.29])l.line([x,.03,z],[x,.84,z],.032);l.box(2.05,.05,.6,frame,0,.26,0);if(medical){for(let i=0;i<5;i++)packageBox(l,-.85+i*.36,.92,.08,.28,.24,.14);l.text(3,.66,.17,0,.59,.40);bucket(l,.77,-.3);}else{
      l.soft(.38,.16,.30,frame,-.75,1.0,-.1,.015);l.line([-.74,1.06,-.32],[-.74,1.06,.20],.028,steel);l.line([-.98,.99,.16],[-.45,.99,.16],.014,steel);
      for(let i=0;i<6;i++){const x=-.30+i*.20;l.line([x,.924,-.2],[x+.09,.924,.12],.015,steel);l.add(new THREE.TorusGeometry(.025,.008,5,8),steel,x+.095,.924,.145,PI/2);}packageBox(l,.66,.30,0,.6,.45,.35);l.text(7,.56,.15,.5,.61,.4);
      l.add(new THREE.PlaneGeometry(2.1,.82),oil,0,.053,0,-PI/2);for(const z of[-.45,.45])l.box(2.35,.008,.035,workMark,0,.056,z);for(let i=0;i<3;i++)l.add(new THREE.TorusGeometry(.19+i*.021,.009,5,24),p.rubber,-.66,.29,.06,PI/2);
    }}
  function rack(l,medical=false){counts.equipmentRacks++;for(const x of[-.84,.84])for(const z of[-.29,.29])l.line([x,.03,z],[x,1.94,z],.025,frame);for(const y of[.16,.72,1.28,1.82]){l.box(1.75,.045,.64,p.wood,0,y,0);for(let i=0;i<4;i++)packageBox(l,-.61+i*.4,y+.025,.03,.32,.44,.28);}l.text(medical?9:6,1.25,.22,0,2.02,.02);}
  function barrel(l,x,z,fuel=false){l.add(new THREE.CylinderGeometry(.31,.31,.85,24),fuel?p.rusty:blue,x,.44,z);for(const y of[.13,.73])l.add(new THREE.TorusGeometry(.313,.016,5,24),steel,x,y,z,PI/2);l.add(new THREE.CylinderGeometry(.035,.035,.012,8),steel,x+.13,.872,z+.09);l.text(fuel?17:4,.34,.12,x,.48,z+.314);}
  function cargo(l){counts.cargoStacks++;for(const x of[-.64,.64])for(const z of[-.4,.4]){l.soft(1.16,.62,.71,p.wood,x,.41,z,.025);for(const side of[-1,1])l.box(.065,.67,.75,frame,x+side*.37,.41,z);}for(const x of[-1.1,0,1.1])l.box(.11,.12,1.8,p.wood,x,.06,0);for(let i=0;i<5;i++)l.box(2.5,.05,.16,p.wood,0,.15,-.72+i*.36);packageBox(l,-.22,.75,.1,.75,.7,.42);l.text(20,.52,.15,.65,.55,.76);}
  function taskLamp(l){l.line([0,.05,0],[0,1.55,0],.021,steel);l.line([0,1.55,0],[.25,1.86,0],.022,steel);l.line([.25,1.86,0],[.52,1.70,0],.018,steel);l.add(new THREE.ConeGeometry(.15,.16,16,1,true),enamel,.52,1.65,0);l.add(new THREE.CircleGeometry(.125,16),lampMat,.52,1.57,0,-PI/2);for(let i=0;i<3;i++){const a=i*PI*2/3;l.line([0,.08,0],[Math.cos(a)*.28,.04,Math.sin(a)*.28],.02,steel);}l.light(.52,1.48,0,18,8);}
  function foldingChairs(l){for(const x of[-.48,.48]){l.soft(.43,.035,.43,cloth,x,.47,0,.013);l.soft(.43,.33,.025,cloth,x,.81,-.22,.013);for(const s of[-1,1]){const a=x+s*.23;l.line([a,.03,-.25],[a,.52,.21],.018,steel);l.line([a,.03,.25],[a,.97,-.23],.018,steel);}}}
  function serviceHoist(l){for(const x of[-.8,.8]){l.line([x,.10,-.45],[x,2.2,0],.05,frame);l.line([x,.10,.45],[x,2.2,0],.05,frame);for(const z of[-.45,.45])l.add(new THREE.TorusGeometry(.08,.028,6,12),p.rubber,x,.09,z,0,PI/2);}l.line([-.86,2.2,0],[.86,2.2,0],.075,frame);l.add(new THREE.CylinderGeometry(.12,.12,.10,16),steel,0,2.05,0,PI/2);for(let i=0;i<12;i++)l.add(new THREE.TorusGeometry(.031,.006,5,10),steel,0,1.98-i*.06,0,0,i%2*PI/2);l.add(new THREE.TorusGeometry(.09,.014,6,14,PI*1.4),steel,0,1.20,0);l.soft(.66,.42,.55,frame,0,.30,.05,.045);for(const x of[-.22,.22])l.add(new THREE.CylinderGeometry(.06,.06,.42,8),steel,x,.48,.05,0,0,PI/2);l.add(new THREE.PlaneGeometry(1.65,1),oil,0,.053,0,-PI/2);}
  function board(l){counts.briefingBoards++;for(const x of[-1.10,1.10]){l.line([x,.04,-.3],[x,2.35,0],.028,frame);l.line([x,.04,.45],[x,1.3,.12],.028,frame);}l.box(2.5,1.55,.07,p.wood,0,1.82,0);
    const map=canvasTexture(768,512,(c,w,h)=>{c.fillStyle='#c8bea0';c.fillRect(0,0,w,h);c.strokeStyle='#888d77';c.lineWidth=1;for(let x=24;x<w;x+=32){c.beginPath();c.moveTo(x,30);c.lineTo(x,h-30);c.stroke();}for(let y=30;y<h;y+=32){c.beginPath();c.moveTo(24,y);c.lineTo(w-24,y);c.stroke();}c.fillStyle='#8c9c92';c.beginPath();c.moveTo(w,0);c.lineTo(w*.82,0);c.lineTo(w*.7,h*.6);c.lineTo(w*.78,h);c.lineTo(w,h);c.fill();c.strokeStyle='#bca77c';c.lineWidth=12;for(const x of[110,290,480]){c.beginPath();c.moveTo(x,80);c.lineTo(x+80,420);c.stroke();}c.strokeStyle='#505a4b';c.lineWidth=4;for(const y of[130,240,350]){c.beginPath();c.moveTo(60,y);c.lineTo(560,y+40);c.stroke();}c.strokeStyle='#915c46';c.lineWidth=6;c.setLineDash([14,8]);c.beginPath();c.moveTo(110,375);c.lineTo(310,268);c.lineTo(420,150);c.stroke();c.setLineDash([]);for(const[x,y]of[[110,375],[310,268],[420,150]]){c.beginPath();c.arc(x,y,18,0,PI*2);c.stroke();}c.fillStyle='#414a3f';c.font='bold 28px sans-serif';c.fillText('SECTOR SKETCH / BRIEFING',28,42);c.font='18px sans-serif';c.fillText('3 OCT 1993',28,h-20);});
    l.add(new THREE.PlaneGeometry(2.32,1.40),material({map,roughness:1}),0,1.82,.041);for(const[x,y]of[[-1,2.42],[1,2.42],[-1,1.24],[1,1.24]])l.add(new THREE.SphereGeometry(.022,6,4),red,x,y,.055);
  }
  function memorial(l){counts.memorialTables++;l.soft(2.55,.09,.8,p.wood,0,.79,0,.025);for(const x of[-1.09,1.09])for(const z of[-.29,.29])l.box(.065,.75,.065,frame,x,.375,z);l.soft(2.35,.02,.72,linen,0,.85,0,.009);
    for(let i=0;i<3;i++){const x=-.78+i*.78;packageBox(l,x,.87,-.09,.48,.36,.10);l.box(.22,.006,.14,labelWhite,x,.99,.14);l.add(new THREE.CylinderGeometry(.045,.045,.18,12),labelWhite,x+.23,.96,.16);l.line([x+.23,1.05,.16],[x+.23,1.066,.16],.003,p.dark,4);}l.text(12,1.65,.22,0,1.40,-.12);l.line([-.88,.82,-.16],[-.88,1.55,-.16],.014,steel);l.line([.88,.82,-.16],[.88,1.55,-.16],.014,steel);
  }
  const put=(name,x,z,w,d,paint,yaw=0,opts)=>station(name,x,z,w,d,yaw,paint,opts);
  if(layout.chapter===1){
    put('clinic-pharmacy',12,-11.5,2.05,1.20,cabinet);put('clinic-clean-dressings',7,-10.9,2.4,1.0,l=>workbench(l,true));put('clinic-water-wash',.3,-10.8,1.8,1.4,waterStation);
    put('clinic-treatment-trolley',9.2,-5.2,.85,.65,trolley);put('clinic-privacy-screen',6,-4,1.7,.6,l=>screen(l,1.5));put('clinic-waiting-bench',.2,1.4,2.3,.65,bench);
    put('courtyard-waiting-bench',-13.6,17,2.3,.65,bench,PI/2);put('courtyard-drinking-water',-12.8,11.3,1.8,1.4,waterStation);put('courtyard-family-storage',-14,24,1.8,.8,l=>rack(l,false));
  }else if(layout.chapter===2){
    put('camp-weapon-maintenance',-20.8,12.4,2.4,1.0,l=>workbench(l));put('camp-personal-equipment',-10,10.5,1.9,.85,l=>rack(l));put('camp-waiting-bench',-7.5,13,2.3,.65,bench);
    put('camp-water-line',-32.5,4,2.7,1.0,l=>{for(const x of[-.85,0,.85])barrel(l,x,0);});put('camp-wash-point',-32.2,13.8,1.8,1.4,waterStation);put('camp-tent-field-desk',-31,-23,2.4,1.0,l=>workbench(l,true));
    put('camp-spare-folding-cot',-33.5,-17.5,1.05,2.15,l=>cot(l));put('camp-ready-cot',-29,-17.5,1.05,2.15,l=>cot(l));put('camp-cargo-awaiting-load',10.4,-14.5,2.65,1.85,cargo);put('camp-fuel-safety-zone',30,-33,2.7,1.0,l=>{for(const x of[-.85,0,.85])barrel(l,x,0,true);});put('camp-team-seat-pair',-14,11,1.6,.8,foldingChairs);
  }else if(layout.chapter===3){
    put('hangar-tool-bench',-45,-13,2.4,1.0,l=>workbench(l));put('hangar-parts-rack',-47,1,1.9,.85,l=>rack(l));put('hangar-briefing-sector-board',-30.8,-12.5,2.65,1.0,board);
    put('hangar-medical-preflight',-25,-15,2.4,1.0,l=>workbench(l,true));put('hangar-loaded-pallets',-20,8.5,2.65,1.85,cargo);put('hangar-second-pallet',-17,13.6,2.65,1.85,cargo);
    put('hangar-crewchief-desk',-43,10.5,2.4,1.0,l=>{workbench(l);l.box(.6,.01,.42,labelWhite,.38,.924,.03);l.line([.6,.94,-.1],[.65,.94,.13],.008,red);});
    put('hangar-equipment-ready',-16,-16,1.9,.85,l=>rack(l));put('apron-wheel-service',6.5,-15,2.4,1.0,l=>workbench(l));put('apron-inspected-supplies',8,15,2.65,1.85,cargo);put('hangar-chain-hoist',-40,15,1.95,1.1,serviceHoist);put('hangar-briefing-seats-front',-27,-7,1.6,.8,foldingChairs,PI);put('hangar-briefing-seats-rear',-24,-7,1.6,.8,foldingChairs,PI);
  }else if(layout.chapter===11){
    put('triage-pharmacy',8.9,-12.6,2.05,1.2,cabinet);put('triage-hand-wash',-9.5,-11.8,1.8,1.4,waterStation);put('triage-dressing-bench',-5,-12.8,2.4,1.0,l=>workbench(l,true));
    put('triage-right-mobile-tray',10,4.3,.85,.65,trolley);put('triage-left-privacy',-9.6,3.7,1.7,.6,l=>screen(l,1.5),PI/2);put('triage-rear-curtain',8.8,-4,1.7,.6,l=>screen(l,1.5));
    put('triage-arrival-stretcher',8.8,7.7,1.05,2.15,l=>cot(l));put('triage-folded-linen',-9.8,7.5,1.9,.85,l=>rack(l,true));put('triage-task-lamp-right',8.3,3,.65,.65,taskLamp);put('triage-task-lamp-left',-8.3,3,.65,.65,taskLamp);
  }else if(layout.chapter===16){
    put('base-arrival-medical-staging',-22.5,16.5,2.65,1.85,cargo);put('base-arrival-water',-23.5,10.5,1.8,1.4,waterStation);put('base-courtyard-waiting-bench',-18,6,2.3,.65,bench);
    put('base-recovery-pharmacy',-8,-18.5,2.05,1.2,cabinet);put('base-recovery-clean-linen',-18.6,-18,1.9,.85,l=>rack(l,true));put('base-recovery-tray',-11.3,-12,.85,.65,trolley);
    put('base-tent-reception-desk',6,-1.5,1.6,.9,l=>{l.soft(1.5,.08,.75,p.wood,0,.8,0,.02);for(const x of[-.63,.63])for(const z of[-.29,.29])l.box(.065,.76,.065,frame,x,.38,z);l.box(.52,.01,.38,labelWhite,-.2,.85,0);l.text(13,.8,.15,0,.58,.39);bottle(l,.42,.85,-.1,.18,false);});
    put('base-quiet-memorial-table',28,19.2,2.7,1.0,memorial);put('base-memorial-bench-west',23,20.5,2.3,.65,bench,PI/2);put('base-memorial-bench-east',33.5,20.5,2.3,.65,bench,-PI/2);put('base-returned-equipment',18.5,17,1.9,.85,l=>rack(l));
  }
  const result={placed:stations.length,skipped:skipped.length,counts,stations,skippedStations:skipped,lightSources};if(stats)stats.interiorDetails=result;return result;
}
