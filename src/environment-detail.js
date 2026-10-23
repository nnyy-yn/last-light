import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Original metre-scale prop geometry. Callers bake each local part into the
// existing city material batches, so details add no per-object draw calls.
export function createEnvironmentDetail({ material, canvasTexture, palette, stats = {} }) {
  const PI = Math.PI, record = stats.modelDetails = { cabinets: 0, tires: 0, carts: 0, fractureEdges: 0, triangles: 0, materials: 4 };
  const { rusty, metal, dark, shard, exposed, brickEdge } = palette;
  const noise = n => { const a = Math.sin(n * 78.233 + 4.17) * 43758.5453; return a - Math.floor(a); };
  const paintMap = canvasTexture(512, 512, (ctx,w,h) => {
    ctx.fillStyle='#4f6258';ctx.fillRect(0,0,w,h);
    for(let i=0;i<4400;i++){const x=noise(i+1)*w,y=noise(i+9001)*h;ctx.fillStyle=i%3?'rgba(202,197,155,.08)':'rgba(17,28,23,.11)';ctx.fillRect(x,y,1+noise(i+31)*6,.5+noise(i+78)*2);}
    for(let i=0;i<190;i++){const x=noise(i+700)*w,y=noise(i+2100)*h,r=1+noise(i+4600)*13;ctx.fillStyle=i%3?'#665038':'#393d32';ctx.beginPath();for(let j=0;j<7;j++){const a=j*PI*2/7,s=r*(.5+noise(i*13+j));j?ctx.lineTo(x+Math.cos(a)*s,y+Math.sin(a)*s):ctx.moveTo(x+s,y);}ctx.closePath();ctx.fill();ctx.fillStyle='rgba(168,135,83,.45)';ctx.fillRect(x,y+r*.4,r*.8,.7);}
    for(let i=0;i<35;i++){const x=noise(i+23000)*w,y=noise(i+24000)*h;ctx.strokeStyle='rgba(190,181,142,.36)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+18+noise(i+18)*63,y+noise(i+22)*3);ctx.stroke();}
  });
  const grainMap=canvasTexture(1024,256,(ctx,w,h)=>{
    ctx.fillStyle='#685b45';ctx.fillRect(0,0,w,h);
    for(let row=0;row<h;row++){ctx.strokeStyle=`rgba(${row%3?'42,30,18':'198,175,128'},${.05+noise(row)*.26})`;ctx.lineWidth=.5+noise(row+700)*1.6;ctx.beginPath();for(let x=0;x<=w;x+=12){const y=row+Math.sin(x*.009+row*.6)*(1+noise(row+1)*2);x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
    for(let i=0;i<13;i++){const x=noise(i+70)*w,y=noise(i+101)*h;for(let r=0;r<5;r++){ctx.strokeStyle=`rgba(45,32,17,${.13-r*.018})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,8+r*12,2+r*2,.05,0,PI*2);ctx.stroke();}}
    for(let i=0;i<90;i++){ctx.fillStyle='rgba(21,19,12,.15)';ctx.fillRect(noise(i+871)*w,noise(i+971)*h,8+noise(i+196)*88,.8);}
    for(let i=0;i<24;i++){const x=noise(i+601)*w,y=noise(i+761)*h,r=20+noise(i+661)*100,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,i%2?'rgba(31,26,17,.23)':'rgba(166,153,122,.15)');g.addColorStop(1,'rgba(31,26,17,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
  });
  const endMap=canvasTexture(128,128,(ctx,w,h)=>{ctx.fillStyle='#9a8360';ctx.fillRect(0,0,w,h);for(let i=1;i<22;i++){ctx.strokeStyle=i%2?'#786345':'#a38e69';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(w*.21,h*.62,i*5.7,i*3.8,.14,0,PI*2);ctx.stroke();}});
  const rubberMap=canvasTexture(256,256,(ctx,w,h)=>{ctx.fillStyle='#343630';ctx.fillRect(0,0,w,h);for(let i=0;i<9500;i++){ctx.fillStyle=i%2?'rgba(3,5,2,.19)':'rgba(142,136,111,.13)';ctx.fillRect(noise(i)*w,noise(i+25000)*h,1,1);}for(let i=0;i<14;i++){ctx.strokeStyle='rgba(13,16,12,.28)';ctx.lineWidth=.7;let x=noise(i+36)*w,y=noise(i+413)*h;ctx.beginPath();ctx.moveTo(x,y);for(let n=0;n<8;n++){x+=noise(n+i*71)*8-4;y+=3;ctx.lineTo(x,y);}ctx.stroke();}});
  for(const t of[paintMap,grainMap,endMap,rubberMap]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
  const painted=material({map:paintMap,roughness:.84,metalness:.12,bumpMap:paintMap,bumpScale:.0005});
  const timber=material({map:grainMap,roughness:.96,bumpMap:grainMap,bumpScale:.0007});
  const endGrain=material({map:endMap,roughness:1});
  const tireRubber=material({map:rubberMap,roughness:.94,bumpMap:rubberMap,bumpScale:.0006});
  function emit(out,g,m,p=[0,0,0],r=[0,0,0]){record.triangles+=(g.index?g.index.count:g.attributes.position.count)/3;out(g,m,p,r);}
  function round(out,w,h,d,m,p,r=[0,0,0],radius=.006){emit(out,new RoundedBoxGeometry(w,h,d,1,Math.min(radius,w*.2,h*.2,d*.2)),m,p,r);}
  function bar(out,a,b,r,m=metal,sides=8){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),v=end.clone().sub(start),g=new THREE.CylinderGeometry(r,r,v.length(),sides);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());emit(out,g,m);}
  function curved(out,points,r,m){emit(out,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),12,r,6,false),m);}
  function ring(out,r,t,p,rotation=[0,0,0],m=metal){emit(out,new THREE.TorusGeometry(r,t,5,32),m,p,rotation);}
  function angle(out,length,leg,p,rotation=[0,0,0]){const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(leg,0);s.lineTo(leg,.004);s.lineTo(.004,.004);s.lineTo(.004,leg);s.lineTo(0,leg);s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:length,bevelEnabled:false});g.translate(-leg/2,-leg/2,-length/2);g.rotateY(PI/2);emit(out,g,rusty,p,rotation);}
  function plank(out,length,width,thickness,p,rotation=[0,0,0],broken=false,variant=0){
    const shape=new THREE.Shape(),half=length/2,z=width/2,points=[[-half,-z],[half-(broken?.10:0),-z],[half-.01,z*.05],[half-(broken?.19:0),z*.42],[half-(broken?.045:0),z],[-half+.01,z]];points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelSize:.0025,bevelThickness:.0025,bevelSegments:1});g.rotateX(-PI/2);g.translate(0,-thickness/2,0);const uv=g.attributes.uv,pos=g.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)/1.5+variant*.17,pos.getZ(i)/.23+variant*.13);emit(out,g,timber,p,rotation);
    // Real end grain is visible on the severed timber rather than a stretched side map.
    const end=new THREE.PlaneGeometry(thickness*.96,width*.90);end.rotateY(PI/2);end.rotateX(PI/2);end.translate(-half-.002,0,0);emit(out,end,endGrain,p,rotation);
  }
  function tire(out,{radius=.375,width=.19,hub=false,segments=48}={}){
    record.tires++;const thin=width/radius<.3,inner=radius*(thin?.82:.53),shoulder=radius*(thin?.91:.78),profile=[new THREE.Vector2(inner,-width*.38),new THREE.Vector2(inner+.008,-width*.48),new THREE.Vector2(shoulder,-width*.55),new THREE.Vector2(radius*.96,-width*.45),new THREE.Vector2(radius*.985,-width*.32),new THREE.Vector2(radius,width*.32),new THREE.Vector2(radius*.96,width*.45),new THREE.Vector2(shoulder,width*.55),new THREE.Vector2(inner+.008,width*.48),new THREE.Vector2(inner,width*.38),new THREE.Vector2(inner,-width*.38)];
    const g=new THREE.LatheGeometry(profile,segments);g.rotateX(PI/2);emit(out,g,tireRubber);
    for(let i=0;i<32;i++)for(const side of[-1,1]){const a=i*PI/16,patch=new THREE.BoxGeometry(radius*.165,thin?.004:.007,width*.42);emit(out,patch,tireRubber,[Math.sin(a)*(radius+.001),Math.cos(a)*(radius+.001),side*width*.24],[0,0,-a+side*.12]);}
    for(const side of[-1,1]){ring(out,radius*(thin?.92:.83),.003,[0,0,side*width*.53],[0,0,0],tireRubber);ring(out,inner+.008,.007,[0,0,side*width*.45],[0,0,0],tireRubber);for(let i=0;i<12;i++){const a=i*PI/6;bar(out,[Math.sin(a)*radius*(thin?.86:.63),Math.cos(a)*radius*(thin?.86:.63),side*width*.52],[Math.sin(a+.025)*radius*(thin?.91:.73),Math.cos(a+.025)*radius*(thin?.91:.73),side*width*.54],.002,tireRubber,4);}}
    if(hub){for(const side of[-1,1]){ring(out,inner+.008,.015,[0,0,side*width*.29],[0,0,0],painted);for(let i=0;i<5;i++){const a=i*PI*.4;round(out,.032,.032,.012,metal,[Math.sin(a)*.066,Math.cos(a)*.066,side*.066],[0,0,a],.004);}}emit(out,new THREE.CylinderGeometry(.054,.054,width*.65,12),rusty,[0,0,0],[PI/2,0,0]);}
  }
  function cabinet(out){
    record.cabinets++;
    // The carcass keeps its original 2.15 × .72 m footprint; folded sheet steel
    // encloses worn wooden shelves. Open rails and a torn back show its cavity.
    for(const z of[-.34,.34])for(const y of[.10,.61])angle(out,2.13,.043,[0,y,z],[y>.3?PI:0,0,0]);
    for(const x of[-1.045,1.045]){
      round(out,.035,.54,.70,painted,[x,.355,0],[0,0,0],.007);
      for(const z of[-.32,.32])round(out,.043,.58,.032,rusty,[x,.35,z]);
      for(const y of[.13,.57])round(out,.047,.024,.63,painted,[x,.0+y,0]);
      // Pressed perimeter seams, hinge pins and fasteners catch the side light.
      for(const z of[-.23,.23])round(out,.012,.31,.013,rusty,[x+Math.sign(x)*.023,.34,z]);
      for(const z of[-.29,.29])for(const y of[.17,.53])emit(out,new THREE.CylinderGeometry(.009,.009,.012,6),metal,[x+Math.sign(x)*.024,y,z],[0,0,PI/2]);
      for(const z of[-.24,.24])bar(out,[x,.10,z],[x+Math.sign(x)*.075,.035,z-.04],.013,metal);
    }
    for(let i=0;i<5;i++)plank(out,i===3?1.36:2.03,.125,.035,[i===3?-.30:0,.135,-.26+i*.13],[0,0,i===3?.018:0],i===3,i);
    for(const x of[-.57,.43]){angle(out,.64,.022,[x,.32,0],[0,PI/2,0]);bar(out,[x,.14,-.28],[x,.57,.30],.006,metal);}
    plank(out,.96,.55,.027,[-.38,.39,.04],[-.14,0,.05],true,3);
    const sheet=new THREE.PlaneGeometry(1.44,.44,14,5),p=sheet.attributes.position;for(let i=0;i<p.count;i++){const u=p.getX(i),v=p.getY(i);p.setXYZ(i,u-.2,.39+v,.343+Math.max(0,u-.22)*.27+Math.sin(u*7)*.012);}sheet.computeVertexNormals();emit(out,sheet,painted);
    // Pulled drawer: thin base, four cheeks, rebate and a wire pull.
    plank(out,.78,.49,.022,[-.31,.078,.54],[0,-.035,0],true,1);
    for(const x of[-.70,.08])round(out,.026,.16,.48,timber,[x,.155,.54]);
    for(const z of[.31,.77])round(out,.77,.16,.026,painted,[-.31,.155,z]);
    curved(out,[[-.46,.15,.796],[-.46,.15,.838],[-.16,.15,.838],[-.16,.15,.796]],.009,metal);
    for(const x of[-.68,.06])round(out,.018,.024,.58,metal,[x,.10,.50]);
    // Broken glazing remains trapped in the lip, never an invisible full pane.
    if(shard)for(const [x,z,scale]of[[-.77,-.25,.21],[.72,-.27,.29]]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([x,.63,z,x+scale,.62,z+.07,x+.04,.61,z+.23],3));g.computeVertexNormals();emit(out,g,shard);}
  }
  function cart(out){
    record.carts++;
    for(const z of[-.55,.55])angle(out,2.2,.052,[0,.10,z]);
    for(let i=0;i<7;i++)plank(out,i===2?1.15:2.15,.135,.044,[i===2?-.44:0,.19,-.47+i*.155],[0,0,i===5?.018:0],i===2,i);
    for(const z of[-.59,.59])for(let row=0;row<3;row++)plank(out,row===2&&z>0?1.68:2.15,.12,.038,[row===2&&z>0?-.23:0,.35+row*.18,z],[PI/2,0,row===2?.025:0],row===2,5+row);
    for(const x of[-1.02,1.02])for(const z of[-.57,.57]){angle(out,.73,.045,[x,.46,z],[0,0,PI/2]);for(let row=0;row<3;row++)emit(out,new THREE.CylinderGeometry(.008,.008,.014,6),metal,[x,.35+row*.18,z+Math.sign(z)*.032],[PI/2,0,0]);}
    for(let row=0;row<3;row++)plank(out,1.15,.12,.035,[-1.05,.35+row*.18,0],[PI/2,0,PI/2],row===2,row+12);
    bar(out,[.08,-.06,-.89],[.08,-.06,.89],.026,metal,12);
    for(const side of[-1,1]){
      const z=side*.75,center=[.08,-.06,z],rim=.348;
      const wheel=(g,m,p=[0,0,0],r=[0,0,0])=>out(g,m,[p[0]+center[0],p[1]+center[1],p[2]+center[2]],r);
      // A narrow handcart tyre has a defined sidewall and two rolled rim lips.
      tire(wheel,{radius:.43,width:.095,segments:48});
      for(const offset of[-.023,.023])ring(wheel,rim,.011,[0,0,offset],[0,0,0],painted);
      emit(wheel,new THREE.CylinderGeometry(.049,.049,.17,16),rusty,[0,0,0],[PI/2,0,0]);
      for(let i=0;i<20;i++){const a=i*PI/10;bar(wheel,[Math.cos(a+.25)*.045,Math.sin(a+.25)*.045,i%2?.043:-.043],[Math.cos(a)*rim,Math.sin(a)*rim,i%2?.020:-.020],.0033,metal,5);}
      emit(wheel,new THREE.CylinderGeometry(.019,.019,.19,6),metal,[0,0,0],[PI/2,0,0]);
      // Bearing hanger, two retaining U-bolts and a spring leaf connect the wheel.
      round(out,.16,.15,.055,rusty,[.08,.015,side*.56]);for(const dx of[-.065,.065])bar(out,[.08+dx,-.11,side*.56],[.08+dx,.13,side*.56],.007,metal,6);
      curved(out,[[-.32,.06,side*.54],[.05,-.015,side*.54],[.45,.06,side*.54]],.012,metal);
    }
    for(const z of[-.46,.46]){curved(out,[[.85,.10,z],[1.45,.07,z],[2.15,-.02,z*.92]],.025,rusty);round(out,.31,.055,.055,timber,[2.10,-.02,z*.92],[0,0,-.04],.012);}
    for(let i=0;i<5;i++)ring(out,.038,.008,[-1.02,.66,-.57+i*.023],[PI/2,0,0],endGrain);
    curved(out,[[-1.01,.65,-.57],[-.76,.51,-.59],[-.61,.39,-.61]],.008,endGrain);
  }
  function fractureEdge(out,points,{depth=.42,seed=0,plaster=true}={}){
    record.fractureEdges++;
    // An irregular continuous fracture surface bridges the two masonry faces.
    // Sparse chunks are embedded below its top, never a row of standing bricks.
    for(let segment=0;segment<points.length-1;segment++){
      const a=new THREE.Vector2(...points[segment]),b=new THREE.Vector2(...points[segment+1]),distance=a.distanceTo(b),steps=Math.max(2,Math.ceil(distance/.20));
      const vertices=[],uv=[],indices=[];
      for(let i=0;i<=steps;i++)for(let j=0;j<5;j++){
        const t=i/steps,n=seed+segment*67+i*19+j*31,x=THREE.MathUtils.lerp(a.x,b.x,t),top=THREE.MathUtils.lerp(a.y,b.y,t),edge=j===0||j===4,y=top+(edge?-.14:.035)+(noise(n)-.5)*(edge?.07:.09),z=(j-2)/2*depth*.53;
        vertices.push(x,y,z);uv.push(x/1.2,(z+y*.3)/1.2);
        if(i<steps&&j<4){const k=i*5+j;indices.push(k,k+1,k+5,k+1,k+6,k+5);}
      }
      const surface=new THREE.BufferGeometry();surface.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));surface.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));surface.setIndex(indices);surface.computeVertexNormals();emit(out,surface,exposed);
      for(let i=0;i<steps;i++){
        const t=(i+.5)/steps,x=THREE.MathUtils.lerp(a.x,b.x,t),y=THREE.MathUtils.lerp(a.y,b.y,t),n=seed+segment*67+i*19;
        if(y<.35||noise(n+55)>.25)continue;
        const width=Math.min(.29,distance/steps*.94),height=.055+noise(n+1)*.09,z=(noise(n+2)-.5)*depth*.8;
        const g=new THREE.BoxGeometry(width,height,.14+noise(n+3)*.13,1,1,1),p=g.attributes.position;
        for(let k=0;k<p.count;k++){const px=p.getX(k),py=p.getY(k),pz=p.getZ(k);p.setXYZ(k,px+(noise(n+px*89+pz*41)-.5)*.022,py+(noise(n+px*87+pz*97)-.5)*.026,pz+(noise(n+px*49+py*71)-.5)*.018);}g.computeVertexNormals();emit(out,g,i%4?brickEdge:exposed,[x,y-.055,z],[0,noise(n+8)*.12,Math.atan2(b.y-a.y,b.x-a.x)*.25]);
        if(plaster&&i%2===0){const s=new THREE.Shape();s.moveTo(-width*.55,0);s.lineTo(width*.45,-.03);s.lineTo(width*.30,-height*1.4);s.lineTo(-width*.40,-height*1.8);s.closePath();const skin=new THREE.ExtrudeGeometry(s,{depth:.025,bevelEnabled:false});emit(out,skin,exposed,[x,y-.04,depth*.5+.008],[0,.07,0]);}
        if(i%4===1&&segment%2===0)curved(out,[[x,y-.18,.04],[x+.04,y+.13,.07],[x+.12,y+.29,-.02]],.006,rusty);
      }
    }
  }
  return { tire, cabinet, cart, fractureEdge, materials: { painted,timber,endGrain,tireRubber } };
}
