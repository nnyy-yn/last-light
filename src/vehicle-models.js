import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Original meter-scale game meshes. The truck follows the M35A2 film silhouette,
// not the five-ton M939 recorded in the historical convoy account.
const UP=new THREE.Vector3(0,1,0), TAU=Math.PI*2;

export function createVehiclePalette(resources,anisotropy=4){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const c=canvas.getContext('2d');c.fillStyle='#c3c3bb';c.fillRect(0,0,1024,1024);
  let seed=3697;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<160;i++){const x=rnd()*1024,y=rnd()*1024,r=35+rnd()*125,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,i%3?'rgba(47,39,22,.055)':'rgba(236,221,184,.12)');g.addColorStop(1,'rgba(160,148,119,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
  for(let i=0;i<24000;i++){c.fillStyle=i%3?'rgba(28,27,22,.032)':'rgba(250,243,217,.07)';c.fillRect(rnd()*1024,rnd()*1024,1+rnd()*4,1+rnd()*3);}
  for(let i=0;i<110;i++){const x=rnd()*1024,y=rnd()*1024;c.strokeStyle='rgba(62,53,34,.09)';c.lineWidth=.5+rnd();c.beginPath();c.moveTo(x,y);c.lineTo(x+rnd()*38,y+rnd()*5);c.stroke();}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=anisotropy;resources.textures.add(map);
  const clothCanvas=document.createElement('canvas');clothCanvas.width=clothCanvas.height=256;
  const cc=clothCanvas.getContext('2d');cc.fillStyle='#99968a';cc.fillRect(0,0,256,256);
  for(let i=0;i<256;i+=2){cc.fillStyle=i%4?'#8e8b80':'#aba697';cc.fillRect(i,0,1,256);cc.fillStyle='rgba(54,49,36,.16)';cc.fillRect(0,i,256,1);}
  const fabricMap=new THREE.CanvasTexture(clothCanvas);fabricMap.colorSpace=THREE.SRGBColorSpace;fabricMap.wrapS=fabricMap.wrapT=THREE.RepeatWrapping;fabricMap.repeat.set(3,3);fabricMap.anisotropy=anisotropy;resources.textures.add(fabricMap);
  const mat=(name,options)=>{const m=new THREE.MeshStandardMaterial({name,roughness:.82,metalness:.25,...options});m.userData.sharedMaterial=true;resources.materials.add(m);return m;};
  return {olive:mat('weathered CARC olive',{color:'#71775b',map}),sand:mat('faded desert sand',{color:'#c3b28a',map}),burned:mat('scorched military sheet',{color:'#35332d',map,roughness:.96,metalness:.12}),
    edge:mat('worn olive hardware',{color:'#494f3f',map,roughness:.72,metalness:.45}),steel:mat('chassis and gun steel',{color:'#252a27',roughness:.69,metalness:.67}),
    rubber:mat('dusty tyre rubber',{color:'#30312c',roughness:.98,metalness:0}),fastener:mat('oxidised bolts',{color:'#7c7d6c',roughness:.62,metalness:.65}),
    seat:mat('seat cloth',{color:'#444c39',map:fabricMap,roughness:1,metalness:0}),canvas:mat('sun faded olive canvas',{color:'#8e9270',map:fabricMap,bumpMap:fabricMap,bumpScale:.0018,roughness:1,metalness:0,side:THREE.DoubleSide}),
    sandCanvas:mat('sun faded khaki canvas',{color:'#c4b48b',map:fabricMap,bumpMap:fabricMap,bumpScale:.0018,roughness:1,metalness:0,side:THREE.DoubleSide}),
    glass:mat('thin windshield glass',{color:'#7e9995',roughness:.14,metalness:.05,transparent:true,opacity:.21,depthWrite:false,side:THREE.DoubleSide}),
    lens:mat('unlit headlamp glass',{color:'#a7ac9d',roughness:.24,metalness:.3}),red:mat('tail lens',{color:'#651f18',roughness:.3,metalness:.1}),
    dust:mat('dry dirt in seams',{color:'#92836c',roughness:1,metalness:0}),skin:mat('far crew skin',{color:'#84634e',roughness:.96,metalness:0}),
    uniform:mat('far crew field uniform',{color:'#6f7051',map:fabricMap,roughness:1,metalness:0})};
}

function builder(root,resources){
  const buckets=new Map();
  function add(g,m,p=[0,0,0],r=[0,0,0],s=[1,1,1]){
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...p),new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),new THREE.Vector3(...s));g.applyMatrix4(matrix);
    if(g.index){const old=g;g=g.toNonIndexed();old.dispose();}
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
    if(!buckets.has(m))buckets.set(m,[]);buckets.get(m).push(g);
  }
  const box=(sz,p,m,r=[0,0,0],bevel=0)=>add(bevel?new RoundedBoxGeometry(...sz,1,bevel):new THREE.BoxGeometry(...sz),m,p,r);
  const cyl=(radius,length,p,m,r=[0,0,Math.PI/2],segments=16)=>add(new THREE.CylinderGeometry(radius,radius,length,segments),m,p,r);
  function beam(a,b,radius,m){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va),g=new THREE.CylinderGeometry(radius,radius,d.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,d.normalize()));add(g,m,va.add(vb).multiplyScalar(.5).toArray());}
  function pane(points,m){const positions=[],uv=[];for(let i=1;i<points.length-1;i++)for(const k of[0,i,i+1]){positions.push(...points[k]);uv.push(points[k][0],points[k][1]+points[k][2]);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();add(g,m);}
  function prism(profile,width,m,x=0){const shape=new THREE.Shape();profile.forEach(([z,y],i)=>i?shape.lineTo(z,y):shape.moveTo(z,y));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.008,bevelThickness:.008,curveSegments:12});g.rotateY(-Math.PI/2);add(g,m,[x+width/2,0,0]);}
  function finish(){for(const[m,list]of buckets){const g=mergeGeometries(list,false);list.forEach(v=>v.dispose());resources.geometries.add(g);const mesh=new THREE.Mesh(g,m);mesh.name=m.name;mesh.castShadow=!m.transparent;mesh.receiveShadow=true;mesh.userData.sharedGeometry=mesh.userData.sharedMaterial=true;root.add(mesh);}buckets.clear();return root;}
  return {add,box,cyl,beam,pane,prism,finish};
}

function makeWheel(resources,p,radius,width,dual=false){
  const root=new THREE.Group(),b=builder(root,resources);root.name='WheelSpin';
  const centers=dual?[-width*.52,width*.52]:[0];const tyreWidth=dual?width*.47:width;
  for(const x of centers){
    b.cyl(radius-.075,tyreWidth,[x,0,0],p.rubber,[0,0,Math.PI/2],32);
    for(const side of[-1,1])b.add(new THREE.TorusGeometry(radius-.105,.105,8,32),p.rubber,[x+side*(tyreWidth/2-.065),0,0],[0,Math.PI/2,0],[1,1,.8]);
    for(let i=0;i<32;i++){const a=i*TAU/32;for(const side of[-1,1])b.box([tyreWidth*.54,.038,.105],[x+side*tyreWidth*.22,Math.cos(a)*(radius-.014),Math.sin(a)*(radius-.014)],p.rubber,[a,0,side*.28]);}
    for(const side of[-1,1]){
      b.cyl(radius*.52,.035,[x+side*tyreWidth*.49,0,0],p.paint,[0,0,Math.PI/2],24);
      b.add(new THREE.TorusGeometry(radius*.48,.018,6,24),p.edge,[x+side*tyreWidth*.55,0,0],[0,Math.PI/2,0]);
      b.cyl(radius*.21,.065,[x+side*tyreWidth*.56,0,0],p.edge,[0,0,Math.PI/2],16);
      for(let i=0;i<8;i++){const a=i*TAU/8;b.cyl(.017,.045,[x+side*tyreWidth*.56,Math.cos(a)*radius*.35,Math.sin(a)*radius*.35],p.edge,[0,0,Math.PI/2],6);}
    }
  }return b.finish();
}

function attachWheels(root,resources,p,axles,{radius=.47,width=.32,track=1.80,dual=false}={}){
  const single=makeWheel(resources,p,radius,width,false),double=dual?makeWheel(resources,p,radius,.56,true):single;
  axles.forEach((z,axle)=>{for(const side of[-1,1]){const steering=new THREE.Group();steering.name=`wheel-${axle}-${side<0?'L':'R'}`;steering.position.set(side*(dual&&axle>0?.735:track/2),radius+.030,z);steering.userData={wheel:true,front:axle===0,radius,side};steering.add((dual&&axle>0?double:single).clone(true));root.add(steering);}});
}

function suspension(b,p,axles,track,floor){
  for(const x of[-.56,.56])b.box([.14,.17,axles[0]-axles.at(-1)+1.35],[x,floor, (axles[0]+axles.at(-1))/2],p.steel);
  for(const z of axles){b.cyl(.075,track,[0,floor-.07,z],p.steel);b.add(new THREE.SphereGeometry(.17,12,8),p.steel,[0,floor-.07,z],[0,0,0],[1.2,.8,1]);for(const x of[-.67,.67]){for(let n=0;n<3;n++)b.box([.085,.025,.68+n*.12],[x,floor+.015+n*.027,z],p.steel);b.beam([x,floor-.11,z-.24],[x,floor+.31,z+.18],.035,p.fastener);}}
  b.cyl(.045,axles[0]-axles.at(-1),[0,floor-.05,(axles[0]+axles.at(-1))/2],p.steel,[Math.PI/2,0,0]);
}

function seat(b,p,x,y,z){b.box([.48,.12,.48],[x,y-.08,z],p.seat,[0,0,0],.035);b.box([.48,.49,.105],[x,y+.20,z-.23],p.seat,[.1,0,0],.025);b.box([.32,.13,.09],[x,y+.47,z-.25],p.seat,[.1,0,0],.025);}

function distantCrew(root,resources,p,anchors){
  const crew=new THREE.Group();crew.name='FarCrew';const b=builder(crew,resources);
  for(const a of anchors){if(a.role==='passenger'&&a.index>3)continue;const [x,y,z]=a.position,gunner=a.role==='gunner',yaw=a.rotation?.[1]||0;
    const point=(dx,dy,dz)=>[x+Math.cos(yaw)*dx+Math.sin(yaw)*dz,y+dy,z-Math.sin(yaw)*dx+Math.cos(yaw)*dz];
    b.add(new THREE.CapsuleGeometry(.14,.22,3,8),p.uniform,point(0,.23,0),[0,yaw,0],[1.35,1,.78]);
    b.add(new THREE.SphereGeometry(.115,12,8),p.skin,point(0,.55,.015),[0,yaw,0],[.85,1.17,.95]);
    b.add(new THREE.SphereGeometry(.127,12,6,0,TAU,0,Math.PI*.56),p.edge,point(0,.605,.005));
    for(const side of[-1,1]){const shoulder=point(side*.19,.36,0),elbow=point(side*.23,gunner?.40:.16,.20),hand=point(side*.14,gunner?.62:a.role==='driver'?.35:.07,gunner?-.06:a.role==='driver'?.37:.28);b.beam(shoulder,elbow,.063,p.uniform);b.beam(elbow,hand,.052,p.uniform);b.add(new THREE.SphereGeometry(.052,8,6),p.skin,hand,[0,0,0],[.8,1,1.2]);
      const hip=point(side*.105,0,0),knee=point(side*.14,gunner?-.36:.08,gunner?.06:.36),foot=point(side*.14,gunner?-.74:a.role==='passenger'&&Math.abs(yaw)>1?-.36:-.22,gunner?.14:.59);b.beam(hip,knee,.08,p.uniform);b.beam(knee,foot,.067,p.uniform);b.box([.13,.12,.25],[foot[0]+Math.sin(yaw)*.06,foot[1]-.015,foot[2]+Math.cos(yaw)*.06],p.steel,[0,yaw,0],.025);}
  }b.finish();root.add(crew);
}

function gunMount(b,p,z=-.5,y=1.86){
  // Ring stays open; the gunner occupies its interior. Original visual M2-like mesh.
  b.add(new THREE.TorusGeometry(.405,.036,8,40),p.edge,[0,y,z],[Math.PI/2,0,0]);
  b.add(new THREE.TorusGeometry(.45,.018,6,40),p.paint,[0,y-.035,z],[Math.PI/2,0,0]);
  b.beam([.25,y,z+.24],[.25,y+.32,z+.24],.034,p.steel);b.beam([-.25,y,z+.24],[.25,y+.32,z+.24],.027,p.steel);
  b.box([.15,.17,.46],[0,y+.35,z+.26],p.steel,[0,0,0],.012);b.box([.16,.035,.29],[0,y+.45,z+.28],p.edge);
  b.cyl(.027,.69,[0,y+.36,z+.80],p.steel,[Math.PI/2,0,0],16);b.cyl(.042,.27,[0,y+.36,z+.49],p.steel,[Math.PI/2,0,0],16);
  for(let i=0;i<6;i++)b.cyl(.044,.018,[0,y+.36,z+.39+i*.04],p.edge,[Math.PI/2,0,0],12);
  b.box([.24,.20,.27],[-.21,y+.33,z+.28],p.paint,[0,0,0],.015);for(const x of[-.12,.12]){b.beam([x,y+.35,z+.02],[x,y+.35,z-.1],.019,p.steel);b.cyl(.024,.11,[x,y+.34,z-.11],p.seat,[0,0,0],8);}
  b.box([.055,.075,.035],[0,y+.42,z+1.05],p.steel);b.box([.035,.06,.04],[0,y+.46,z+.16],p.steel);
}

function humvee(resources,p){
  const root=new THREE.Group();root.name='M1025-like HMMWV';const b=builder(root,resources);
  suspension(b,p,[1.57,-1.61],1.85,.47);
  b.box([1.78,.10,3.75],[0,.61,-.14],p.steel);b.box([.55,.29,1.8],[0,.88,-.32],p.paint,[0,0,0],.035);
  // Side sheets genuinely cut around the tyres instead of black circles on a box.
  for(const side of[-1,1]){
    // Four independent lower door panels leave the wheel arches open.
    b.prism([[-1.05,.75],[.98,.75],[.65,1.29],[-1.16,1.28]],.065,p.paint,side*.962);
    b.prism([[.68,.76],[1.05,.76],[1.12,.91],[1.30,1.04],[1.57,1.10],[1.84,1.04],[2.04,.90],[2.16,.90],[2.16,1.15],[.60,1.32]],.13,p.paint,side*.94);
    b.prism([[-2.20,.76],[-2.13,.76],[-2.07,.90],[-1.87,1.05],[-1.61,1.10],[-1.35,1.02],[-1.15,.8],[-1.08,.75],[-1.08,1.26],[-2.20,1.19]],.13,p.paint,side*.94);
    b.prism([[-2.15,1.20],[-1.30,1.80],[-1.22,1.30]],.055,p.paint,side*.92);
    for(const z of[1.57,-1.61]){const outer=.58,inner=.51,shape=new THREE.Shape();shape.absarc(z,.48,outer,0,Math.PI,false);shape.absarc(z,.48,inner,Math.PI,0,true);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:false,curveSegments:24});g.rotateY(-Math.PI/2);b.add(g,p.paint,[side*.99+.11,0,0]);}
    const x=side*.979;
    for(const [z,len]of[[.12,.79],[-.77,.85]]){
      b.box([.055,.49,len],[x,1.06,z],p.paint,[0,0,0],.012);
      for(const dz of[-len*.41,len*.41])b.box([.008,.012,.025],[x+side*.032,1.1,z+dz],p.fastener);
      b.box([.072,.035,.14],[x+side*.033,1.23,z-len*.31],p.steel,[0,0,0],.008);
      for(const dy of[.87,1.18])b.box([.085,.035,.09],[x,dy,z+len*.46],p.edge);
      b.beam([x+side*.035,.87,z-len*.4],[x+side*.035,1.22,z+len*.4],.012,p.edge);
      b.beam([x+side*.035,1.22,z-len*.4],[x+side*.035,.87,z+len*.4],.012,p.edge);
    }
    b.pane([[x,1.32,.52],[x,1.32,-.27],[side*.91,1.77,-.27],[side*.91,1.77,.28]],p.glass);
    b.pane([[x,1.32,-.37],[x,1.32,-1.17],[side*.91,1.77,-1.17],[side*.91,1.77,-.37]],p.glass);
    for(const z of[-1.22,-.32])b.beam([x,1.27,z],[side*.91,1.83,z],.031,p.paint);
    b.beam([x,1.31,.59],[side*.91,1.83,.30],.036,p.paint);b.beam([side*.91,1.83,.30],[side*.91,1.83,-1.29],.029,p.paint);
    b.beam([x,1.34,.56],[side*1.13,1.48,.63],.016,p.steel);b.box([.035,.18,.13],[side*1.15,1.53,.64],p.steel,[0,0,0],.018);b.box([.008,.15,.1],[side*1.172,1.53,.64],p.fastener);
    b.box([.18,.055,1.84],[side*1.015,.69,-.22],p.edge);b.beam([side*.91,1.34,-1.88],[side*.93,2.89,-1.94],.006,p.steel);
  }
  b.prism([[.60,1.26],[.62,1.33],[2.15,1.15],[2.17,1.08]],1.80,p.paint);
  b.box([1.78,.09,.13],[0,1.28,.63],p.paint);
  for(const x of[-.86,.86]){b.beam([x,1.34,.66],[x,1.17,2.09],.012,p.edge);for(const z of[.82,1.97])b.box([.07,.025,.09],[x,1.335-(z-.65)*.118,z],p.edge);}
  for(let i=-4;i<=4;i++)b.box([.075,.012,.23],[i*.105,1.301,.92],p.steel,[-.115,0,0]);
  b.pane([[-.91,1.32,.64],[.91,1.32,.64],[.87,1.79,.32],[-.87,1.79,.32]],p.glass);b.beam([0,1.31,.65],[0,1.83,.30],.024,p.paint);
  for(const x of[-.46,.46])b.beam([x-.22,1.35,.63],[x+.12,1.53,.50],.009,p.steel);
  const roof=new THREE.Shape();roof.moveTo(-.92,-1.31);roof.lineTo(.92,-1.31);roof.lineTo(.92,.32);roof.lineTo(-.92,.32);roof.closePath();const hole=new THREE.Path();hole.absarc(0,-.55,.39,0,TAU,true);roof.holes.push(hole);const rg=new THREE.ExtrudeGeometry(roof,{depth:.055,bevelEnabled:false,curveSegments:40});rg.rotateX(Math.PI/2);b.add(rg,p.paint,[0,1.855,0]);
  b.prism([[-2.15,1.14],[-2.15,1.20],[-1.30,1.82],[-1.30,1.76]],1.84,p.paint);
  b.box([1.26,.35,1.28],[0,.98,1.39],p.steel,[0,0,0],.025);
  for(const x of[-.6,.6])b.beam([x,1.81,-1.32],[x,1.21,-2.12],.02,p.edge);
  b.box([1.91,.35,.07],[0,.99,-2.18],p.paint);b.box([1.86,.25,.08],[0,.96,2.14],p.steel);
  for(let i=-3;i<=3;i++)b.box([.075,.28,.045],[i*.14,1.00,2.197],p.paint,[0,0,0],.01);
  for(const x of[-.74,.74]){b.cyl(.128,.045,[x,1.03,2.20],p.edge,[Math.PI/2,0,0],24);b.cyl(.099,.051,[x,1.03,2.223],p.lens,[Math.PI/2,0,0],24);b.box([.09,.055,.04],[x,1.19,2.18],p.lens);b.box([.12,.16,.045],[x,1.01,-2.225],p.red);}
  for(const z of[-2.30,2.30]){b.box([2.06,.145,.20],[0,.67,z],p.edge,[0,0,0],.02);for(const x of[-.64,.64])b.add(new THREE.TorusGeometry(.062,.018,6,12),p.fastener,[x,.68,z+Math.sign(z)*.13]);}
  b.box([1.68,.20,.25],[0,1.23,.43],p.steel);for(const x of[-.48,.48])for(const z of[.05,-.84])seat(b,p,x,.91,z);
  b.add(new THREE.TorusGeometry(.165,.015,6,24),p.steel,[-.48,1.28,.44],[.47,0,0]);b.beam([-.48,1.28,.44],[-.48,1.13,.64],.021,p.steel);
  for(let i=0;i<5;i++)b.cyl(i? .025:.048,.012,[-.55+i*.095,1.28,.32],p.lens,[Math.PI/2,0,0],12);
  b.beam([.05,.94,.20],[.05,1.17,.08],.014,p.steel);b.add(new THREE.SphereGeometry(.029,8,6),p.steel,[.05,1.17,.08]);
  gunMount(b,p);b.finish();attachWheels(root,resources,p,[1.57,-1.61]);
  root.userData={vehicleType:'humvee',modelName:'HMMWV M1025-style gun carrier',dimensions:{width:2.16,height:1.85,length:4.84,overallHeight:2.90},collisionBoxes:[{minX:-1.08,maxX:1.08,minZ:-2.42,maxZ:2.42}],fireAnchor:[0,1.18,1.38],anchorSpace:'hips',steeringWheel:[-.48,1.28,.44],crewAnchors:[{role:'driver',position:[-.48,.95,.05],rotation:[0,0,0]},{role:'gunner',position:[0,1.58,-.55],rotation:[0,0,0]},{role:'passenger',index:0,position:[.48,.95,.05],rotation:[0,0,0]},{role:'passenger',index:1,position:[-.48,.95,-.84],rotation:[0,0,0]},{role:'passenger',index:2,position:[.48,.95,-.84],rotation:[0,0,0]}]};
  distantCrew(root,resources,p,root.userData.crewAnchors);return root;
}

function cargoTruck(resources,p){
  const root=new THREE.Group();root.name='M35A2 film-style cargo truck';const b=builder(root,resources),axles=[2.13,-1.02,-2.37];
  suspension(b,p,axles,2.01,.70);
  b.box([2.17,.15,3.71],[0,1.26,-1.36],p.edge);for(let i=-5;i<=5;i++)b.box([.185,.06,3.58],[i*.19,1.36,-1.36],p.paint);
  for(const side of[-1,1]){
    const x=side*1.08;
    for(const y of[1.52,1.75,1.98])b.box([.055,.19,3.66],[x,y,-1.36],p.paint,[0,0,0],.009);
    for(const z of[.42,-.42,-1.3,-2.18,-3.18]){b.box([.075,.82,.07],[x+side*.035,1.69,z],p.edge);for(const y of[1.46,1.95])b.cyl(.017,.012,[x+side*.08,y,z],p.fastener);}
    b.box([.34,.09,3.25],[side*.84,1.75,-1.34],p.seat);b.box([.09,.30,3.25],[side*1.005,1.95,-1.34],p.seat);
    b.box([.39,.30,.87],[side*.84,.96,.28],p.paint,[0,0,0],.055);b.box([.4,.045,.9],[side*.86,1.15,.28],p.edge);
    for(const z of[-1.02,-2.37])b.box([.58,.055,1.09],[side*.86,1.16,z],p.paint);
    b.box([.57,.4,.04],[side*.88,.77,-3.03],p.rubber);b.beam([x,2.12,.48],[x,2.12,-3.22],.025,p.edge);
    // Cab lower door, with window left open except for translucent glazing.
    b.box([.065,.63,1.04],[side*.87,1.40,1.14],p.paint,[0,0,0],.02);
    b.pane([[side*.885,1.74,1.66],[side*.885,1.74,.65],[side*.83,2.26,.66],[side*.83,2.26,1.49]],p.glass);
    for(const z of[.59,1.67])b.beam([side*.88,1.66,z],[side*.83,2.32,z===1.67?1.49:.59],.033,p.paint);
    b.box([.09,.04,.17],[side*.92,1.63,.83],p.steel);for(const y of[1.27,1.59])b.box([.09,.05,.09],[side*.9,y,1.57],p.edge);
    b.box([.42,.06,.9],[side*1.04,.91,1.05],p.edge);for(const z of[.70,1.39])b.beam([side*.87,1.17,z],[side*1.15,.92,z],.025,p.steel);
    b.beam([side*.9,1.81,1.68],[side*1.18,2.01,1.80],.018,p.edge);b.box([.04,.28,.17],[side*1.19,2.08,1.80],p.steel,[0,0,0],.02);b.box([.012,.25,.14],[side*1.217,2.08,1.80],p.fastener);
    b.prism([[1.48,1.20],[1.62,1.30],[2.10,1.34],[2.63,1.26],[2.79,1.13],[2.69,1.07],[2.54,1.16],[2.10,1.23],[1.69,1.21]],.40,p.paint,side*.88);
    for(let i=0;i<7;i++)b.box([.014,.16,.028],[side*.695,1.50,2.30+i*.09],p.steel,[.1,0,0]);
  }
  b.box([1.77,.10,1.23],[0,1.13,1.11],p.steel);b.box([1.77,.81,.07],[0,1.72,.55],p.paint);
  b.prism([[1.73,1.41],[1.78,1.76],[3.14,1.57],[3.20,1.35]],1.36,p.paint);
  b.beam([0,1.78,1.79],[0,1.59,3.12],.014,p.edge);for(const x of[-.68,.68])for(const z of[1.92,3.0])b.box([.04,.09,.12],[x,1.57,z],p.edge);
  b.box([1.42,.58,.11],[0,1.27,3.20],p.steel);for(let i=-5;i<=5;i++)b.box([.035,.52,.045],[i*.108,1.28,3.27],p.paint);for(const y of[1.11,1.37])b.box([1.38,.027,.035],[0,y,3.29],p.edge);
  for(const x of[-.88,.88]){b.cyl(.16,.09,[x,1.35,3.02],p.paint,[Math.PI/2,0,0],24);b.cyl(.123,.10,[x,1.35,3.07],p.lens,[Math.PI/2,0,0],24);b.beam([x-.16,1.19,3.16],[x-.16,1.54,3.16],.017,p.edge);b.beam([x+.16,1.19,3.16],[x+.16,1.54,3.16],.017,p.edge);b.beam([x-.16,1.54,3.16],[x+.16,1.54,3.16],.017,p.edge);b.box([.13,.12,.05],[x,1.17,-3.30],p.red);}
  b.box([2.28,.19,.27],[0,.87,3.38],p.edge,[0,0,0],.025);b.box([2.17,.15,.18],[0,1.04,-3.34],p.edge);
  for(const z of[3.51,-3.46])for(const x of[-.72,.72])b.add(new THREE.TorusGeometry(.08,.023,6,12),p.fastener,[x,.85,z]);
  b.pane([[-.84,1.78,1.80],[.84,1.78,1.80],[.80,2.28,1.54],[-.80,2.28,1.54]],p.glass);b.beam([0,1.77,1.80],[0,2.31,1.53],.028,p.paint);for(const x of[-.41,.41])b.beam([x-.15,1.8,1.79],[x+.13,2.02,1.67],.01,p.steel);
  b.box([1.79,.08,1.11],[0,2.35,1.08],p.canvas,[0,0,0],.035);b.box([1.64,.22,.22],[0,1.65,1.62],p.steel);for(const x of[-.5,.5])seat(b,p,x,1.43,1.06);
  b.add(new THREE.TorusGeometry(.20,.018,6,24),p.steel,[-.50,1.78,1.48],[.55,0,0]);b.beam([-.5,1.78,1.48],[-.5,1.53,1.70],.025,p.steel);
  b.beam([.73,1.4,.53],[.73,2.88,.53],.049,p.steel);b.cyl(.085,.34,[.73,2.63,.53],p.edge,[0,0,0],16);b.cyl(.057,.15,[.73,2.94,.53],p.steel,[0,0,0],12);
  for(const z of[.37,-.48,-1.33,-2.18,-3.12]){for(const side of[-1,1]){b.beam([side*1.045,2.04,z],[side*1.045,2.63,z],.021,p.edge);b.beam([side*1.045,2.63,z],[side*.77,2.91,z],.021,p.edge);b.beam([side*.77,2.91,z],[0,3.02,z],.021,p.edge);}}
  // A sagging fabric roof over the forward bed; open rear and rolled curtains
  // retain a readable cargo volume and the bench passengers.
  const positions=[],uv=[],nx=18,nz=28;for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)for(const [dx,dz]of[[0,0],[1,1],[1,0],[0,0],[0,1],[1,1]]){const u=(i+dx)/nx,v=(j+dz)/nz,x=(u-.5)*2.14,z=.39-v*2.82,y=2.64+.36*Math.pow(Math.cos((u-.5)*Math.PI),.45)-.035*Math.sin(v*TAU*3)**2+.008*Math.sin(u*31+v*18);positions.push(x,y,z);uv.push(u*2,v*3);}
  const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));cg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));cg.computeVertexNormals();b.add(cg,p.canvas);
  for(const side of[-1,1]){b.cyl(.085,2.80,[side*1.07,2.60,-1.02],p.canvas,[Math.PI/2,0,0],16);for(const z of[.25,-.45,-1.15,-1.85,-2.38]){b.beam([side*1.08,2.65,z],[side*1.10,2.48,z],.015,p.edge);b.beam([side*1.10,2.48,z],[side*1.10,2.04,z+.04],.008,p.seat);}}
  b.box([2.09,.64,.06],[0,1.73,-3.23],p.paint);for(const x of[-.72,0,.72])b.box([.06,.64,.08],[x,1.73,-3.28],p.edge);for(const x of[-.6,.6])b.box([.28,.05,.15],[x,1.13,-3.43],p.edge);b.beam([-.85,1.2,-3.3],[-.85,.65,-3.5],.026,p.edge);b.beam([.85,1.2,-3.3],[.85,.65,-3.5],.026,p.edge);
  b.finish();attachWheels(root,resources,p,axles,{radius:.56,width:.27,track:1.94,dual:true});
  const anchors=[{role:'driver',position:[-.50,1.47,1.06],rotation:[0,0,0]},{role:'passenger',index:0,position:[.50,1.47,1.06],rotation:[0,0,0]}];for(const side of[-1,1])for(let i=0;i<3;i++)anchors.push({role:'passenger',index:1+i+(side>0?3:0),position:[side*.82,1.82,-.30-i*1.02],rotation:[0,-side*Math.PI/2,0]});
  root.userData={vehicleType:'cargo-truck',modelName:'M35A2 film-style 6×6 cargo truck',dimensions:{width:2.36,height:3.03,length:7.10,cabinHeight:2.39},collisionBoxes:[{minX:-1.18,maxX:1.18,minZ:-3.55,maxZ:3.55}],fireAnchor:[0,1.59,2.39],anchorSpace:'hips',steeringWheel:[-.5,1.78,1.48],crewAnchors:anchors};distantCrew(root,resources,p,anchors);return root;
}

export function buildMilitaryVehicle(type,variant,resources,palette,{burned=false}={}){
  const p={...palette,paint:burned?palette.burned:palette[variant==='sand'?'sand':'olive'],canvas:variant==='sand'?palette.sandCanvas:palette.canvas};
  const root=type==='cargo-truck'?cargoTruck(resources,p):humvee(resources,p);root.userData.variant=variant;root.userData.authored=true;root.userData.burned=burned;
  const wheel=root.userData.steeringWheel,driver=root.userData.crewAnchors.find(a=>a.role==='driver');
  driver.hands={left:[wheel[0]-.13,wheel[1]+.025,wheel[2]-.025],right:[wheel[0]+.13,wheel[1]+.025,wheel[2]-.025]};
  const gunner=root.userData.crewAnchors.find(a=>a.role==='gunner');if(gunner)gunner.hands={left:[-.12,2.20,-.61],right:[.12,2.20,-.61]};
  for(const a of root.userData.crewAnchors){if(a.role==='gunner')continue;const [x,y,z]=a.position,yaw=a.rotation[1],ankleY=type==='humvee'?.73:a.role==='driver'||a.index===0?1.25:1.46,dz=type==='humvee'?.62:.59;const at=side=>[x+Math.cos(yaw)*side*.12+Math.sin(yaw)*dz,ankleY,z-Math.sin(yaw)*side*.12+Math.cos(yaw)*dz];a.feet={left:at(-1),right:at(1)};}
  return root;
}

export function bindVehicleMotion(root,{occupied=true}={}){
  const wheels=[];root.traverse(node=>{if(node.userData.wheel)wheels.push(node);if(node.name==='FarCrew')node.visible=occupied;});
  root.userData.wheels=wheels;root.userData.occupied=occupied;root.userData.vehicleMotion={speed:0,steer:0,time:0};let lastTime=null,angle=0;
  root.userData.updateVehicleMotion=(speed=0,steer=0,time=0)=>{
    Object.assign(root.userData.vehicleMotion,{speed,steer,time});
    const dt=lastTime===null?0:Math.min(.1,Math.max(0,time-lastTime));lastTime=time;
    angle=(angle+speed*dt/(wheels[0]?.userData.radius||.47))%TAU;
    for(const wheel of wheels){wheel.rotation.y=wheel.userData.front?THREE.MathUtils.clamp(steer,-.55,.55):0;wheel.children[0].rotation.x=angle;}
  };
  root.userData.resetVehicleMotion=()=>{lastTime=null;angle=0;Object.assign(root.userData.vehicleMotion,{speed:0,steer:0,time:0});for(const wheel of wheels){wheel.rotation.y=0;wheel.children[0].rotation.x=0;}};
  return root;
}
