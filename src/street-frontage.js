import * as THREE from 'three';

// These objects belong to the chapter's existing material batches. There are
// no independent meshes, textures, lights or resources for a caller to dispose.
export function createStreetFrontage({layout,add,box,line,palette,obstacle,colliders=[],
  routeDistance=()=>Infinity,safeProp=()=>true,sampleHeight=()=>0,stats={}}){
  const result={faces:0,shops:0,courtyards:0,workyards:0,gapYards:0,shoulderGroups:[],walls:0,awnings:0,props:0,colliders:0,triangles:0};
  stats.frontage=result;
  if(!layout.roads?.length||['military-camp','hangar-apron','interior-triage','base-return','base-hospital','restricted-cockpit'].includes(layout.type))return result;
  const {wood,metal,rusty,rubber,cloth,dark,green,blue,concrete}=palette;
  const wall=palette.walls?.[2]||concrete,exposed=palette.exposed||concrete,brick=palette.brickEdge||palette.brick||concrete;
  let seed=layout.chapter*4931+12839;
  const rand=(a,b)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return a+(b-a)*seed/4294967296;};
  const protectedPoints=[layout.spawn,...layout.taskPositions,...(layout.enemySpawns||[]).map(e=>e.pos)];
  const ground=(x,z)=>sampleHeight(x,z)||0;
  const addGeometry=(g,m,p=[0,0,0],r=[0,0,0])=>{result.triangles+=(g.index?.count||g.attributes.position.count)/3;add(g,m,p,r);};
  const drawBox=(w,h,d,m,p,yaw=0,rx=0,rz=0)=>{result.triangles+=12;box(w,h,d,m,...p,yaw,rx,rz);};
  const rod=(a,b,r,m=metal,sides=7)=>{
    if(line){result.triangles+=sides*4;line(a,b,r,m,sides);return;}
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);
    const g=new THREE.CylinderGeometry(r,r,delta.length(),sides);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    addGeometry(g,m,av.add(bv).multiplyScalar(.5).toArray());
  };
  function faceFrame(face){
    const c=Math.cos(face.yaw),s=Math.sin(face.yaw);
    return {at:(u,y,v)=>[face.x+u*c+v*s,y,face.z-u*s+v*c],yaw:face.yaw,c,s};
  }
  function footprint(f,u,v,w,d){
    const p=f.at(u,0,v),hw=(Math.abs(f.c)*w+Math.abs(f.s)*d)/2,hd=(Math.abs(f.s)*w+Math.abs(f.c)*d)/2;
    return {x:p[0],z:p[2],w:hw*2,d:hd*2,minX:p[0]-hw,maxX:p[0]+hw,minZ:p[2]-hd,maxZ:p[2]+hd};
  }
  function allowed(f,u,v,w,d){
    const b=footprint(f,u,v,w,d);
    // Check the whole footprint, rather than a centre-only clearance test.
    for(const x of[b.minX,b.x,b.maxX])for(const z of[b.minZ,b.z,b.maxZ]){
      if(routeDistance(x,z)<2.15||!safeProp(x,z,.95))return false;
      if(protectedPoints.some(p=>Math.hypot(x-p[0],z-p[1])<1.85))return false;
    }
    if((layout.props||[]).some(p=>!['washing','lamp'].includes(p.kind)&&Math.hypot(b.x-p.pos[0],b.z-p.pos[1])<Math.max(w,d)*.45+1.35))return false;
    return true;
  }
  function solid(f,u,v,w,d,kind='masonry'){
    const p=footprint(f,u,v,w,d);obstacle?.(p.x,p.z,p.w,p.d,kind);result.colliders++;
  }
  // A thick irregular wall section: actual broken top and exposed end faces,
  // not an alpha card or a flat triangle pasted across an intact facade.
  function brokenWall(f,u,v,length,height,depth=.28){
    if(!allowed(f,u,v,length,depth+.1))return false;
    const p=f.at(u,0,v),y=ground(p[0],p[2]),profile=[[-length/2,-.08]],top=[];
    const courses=[.86,.84,.65,.70,.46,.61,.56];
    for(let i=0;i<7;i++){
      const x=-length/2+length*i/7,yy=height*(courses[i]+rand(-.035,.035));
      top.push([x,yy],[x+length/7*.92,yy+rand(-.025,.025)]);
    }
    top.push([length/2,top.at(-1)[1]]);profile.push(...top,[length/2,-.08]);
    const shape=new THREE.Shape(profile.map(q=>new THREE.Vector2(...q))),front=new THREE.ShapeGeometry(shape);
    const uv=front.attributes.uv,position=front.attributes.position;
    for(let i=0;i<uv.count;i++)uv.setXY(i,position.getX(i)/2.2,position.getY(i)/2.2);
    // add() bakes its transform in place: clone the local face before handing
    // either face to the batcher, otherwise the reverse face is transformed twice.
    const rear=front.clone();rear.scale(-1,1,1);
    addGeometry(front,wall,f.at(u,y,v+depth/2),[0,f.yaw,0]);
    addGeometry(rear,wall,f.at(u,y,v-depth/2),[0,f.yaw+Math.PI,0]);
    const vs=[],uvs=[];
    for(let i=0;i<profile.length;i++){
      const a=profile[i],b=profile[(i+1)%profile.length];
      for(const q of[[a[0],a[1],-depth/2],[b[0],b[1],-depth/2],[a[0],a[1],depth/2],[b[0],b[1],-depth/2],[b[0],b[1],depth/2],[a[0],a[1],depth/2]]){vs.push(...q);uvs.push(q[0]/.65,(q[1]+q[2])/.65);}
    }
    const edge=new THREE.BufferGeometry();edge.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));edge.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));edge.computeVertexNormals();addGeometry(edge,brick,f.at(u,y,v),[0,f.yaw,0]);
    // A continuous chipped plaster margin follows the actual broken courses;
    // it reveals masonry at the fracture instead of a row of pasted decals.
    const fracture=[...top,...top.toReversed().map(([x,yy])=>[x,Math.max(.1,yy-.13-rand(0,.07))])];
    const chips=new THREE.ShapeGeometry(new THREE.Shape(fracture.map(q=>new THREE.Vector2(...q))));
    const cp=chips.attributes.position,cu=chips.attributes.uv;for(let i=0;i<cu.count;i++)cu.setXY(i,cp.getX(i)/.8,cp.getY(i)/.8);
    addGeometry(chips,brick,f.at(u,y,v+depth/2+.003),[0,f.yaw,0]);
    // A snapped tie bar remains anchored in the masonry.
    rod(f.at(u-length*.3,y+height*.63,v),f.at(u-length*.29,y+height+.22,v+.06),.009,rusty,5);
    solid(f,u,v,length,depth);result.walls++;return true;
  }
  function tyre(f,u,v,flat=false){
    const p=f.at(u,0,v),y=ground(p[0],p[2]),r=.29;
    addGeometry(new THREE.TorusGeometry(r,.095,6,18),rubber,[p[0],y+(flat?.11:.38),p[2]],[flat?Math.PI/2:0,f.yaw,flat?.12:.12]);
    if(!flat){rod(f.at(u,y+.04,v-.04),f.at(u,y+.62,v+.04),.018,rusty);}
  }
  function barrel(f,u,v,open=false){
    if(!allowed(f,u,v,.68,.68))return;
    const p=f.at(u,0,v),y=ground(p[0],p[2]);
    // The rolled rim and visible dark interior keep the object from reading as
    // a painted cylinder; the shallow dish is the bottom of an open drum.
    addGeometry(new THREE.CylinderGeometry(.29,.305,.84,14,3,open),rusty,[p[0],y+.42,p[2]]);
    for(const h of[.06,.24,.63,.83])addGeometry(new THREE.TorusGeometry(.302,.015,5,16),metal,[p[0],y+h,p[2]],[Math.PI/2,0,0]);
    if(open){addGeometry(new THREE.CylinderGeometry(.276,.276,.025,14),dark,[p[0],y+.1,p[2]]);const inside=new THREE.CylinderGeometry(.276,.276,.68,14,1,true);inside.scale(-1,1,1);addGeometry(inside,dark,[p[0],y+.43,p[2]]);}
    else addGeometry(new THREE.CylinderGeometry(.033,.033,.02,7),metal,[p[0]+.14,y+.851,p[2]]);
    solid(f,u,v,.66,.66,'metal');result.props++;
  }
  function timber(f,u,v,count=4){
    if(!allowed(f,u,v,1.65,.6))return;
    const p=f.at(u,0,v),y=ground(p[0],p[2]);
    for(let i=0;i<count;i++)drawBox(rand(1.1,1.8),.055,.15,wood,f.at(u+rand(-.16,.16),y+.04+i*.05,v+rand(-.16,.16)),f.yaw+rand(-.13,.13));
    result.props++;
  }
  function crate(f,u,v,broken=false){
    if(!allowed(f,u,v,.75,.65))return;
    const p=f.at(u,0,v),y=ground(p[0],p[2]);
    for(const dx of[-.32,.32])for(const dz of[-.27,.27])drawBox(.05,.49,.05,wood,f.at(u+dx,y+.25,v+dz),f.yaw);
    for(let j=0;j<3;j++){
      for(const dz of[-.3,.3])if(!(broken&&j===2&&dz>0))drawBox(.72,.105,.035,wood,f.at(u,y+.1+j*.16,v+dz),f.yaw);
      for(const dx of[-.35,.35])drawBox(.035,.105,.6,wood,f.at(u+dx,y+.1+j*.16,v),f.yaw);
    }
    for(let i=0;i<4;i++)drawBox(.15,.025,.6,wood,f.at(u-.26+i*.17,y+.035,v),f.yaw);
    solid(f,u,v,.76,.66,'wood');result.props++;
  }
  function awning(f,u,width,depth,damaged=false){
    const p=f.at(u,0,depth*.55),y=ground(p[0],p[2]);
    if(!allowed(f,u,depth*.55,width,depth))return false;
    const h=2.65,nx=12,nz=5,positions=[],uv=[],indices=[];
    for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
      const xx=(ix/nx-.5)*width,zz=.18+iz/nz*depth;
      const sag=Math.sin(ix/nx*Math.PI)*(.06+iz/nz*.1),drop=iz/nz*.29;
      positions.push(xx,h-drop-sag+(damaged&&ix>8?-.10*(ix-8)*iz/nz:0),zz);uv.push(ix/nx*2,iz/nz);
    }
    for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
      if(damaged&&iz>=nz-2&&ix===9)continue;
      const a=iz*(nx+1)+ix,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    // Keep the underside visible without modifying the shared cloth material.
    // Separate winding also preserves correct lighting on both fabric sides.
    const underside=g.clone(),backIndex=underside.index;
    for(let i=0;i<backIndex.count;i+=3){const first=backIndex.getX(i);backIndex.setX(i,backIndex.getX(i+2));backIndex.setX(i+2,first);}underside.computeVertexNormals();
    addGeometry(g,cloth,f.at(u,y,0),[0,f.yaw,0]);
    addGeometry(underside,cloth,f.at(u,y-.006,0),[0,f.yaw,0]);
    for(const side of[-1,1]){
      const x=u+side*width*.48,lean=damaged&&side===1?.18:0;
      rod(f.at(x,y,.18),f.at(x,y+h+.09,.18),.033,wood);
      rod(f.at(x,y+h,.18),f.at(x+lean,y+h-.3,depth+.16),.026,rusty);
      rod(f.at(x+lean,y+.03,depth+.16),f.at(x+lean,y+h-.28,depth+.16),.031,wood);
      solid(f,x+lean,depth+.16,.15,.15,'wood');
    }
    rod(f.at(u-width*.5,y+h-.3,depth+.16),f.at(u+width*.5,y+h-.3,depth+.16),.025,rusty);
    for(const sign of[-1,1])rod(f.at(u+sign*width*.45,y+h-.31,depth+.16),f.at(u+sign*width*.65,y+1.76,.06),.006,dark,5);
    result.awnings++;return true;
  }
  function shutter(f,u,width=2.3,broken=false,paint=green){
    const p=f.at(u,0,.53),y=ground(p[0],p[2]),height=2.85;
    // Existing authored window modules protrude up to 0.59m from the facade.
    // The independent closed storefront must fully cover those frames.
    drawBox(width+.12,height+.12,.15,dark,f.at(u,y+height/2,.54),f.yaw);
    for(const sign of[-1,1])drawBox(.12,height+.17,.30,exposed,f.at(u+sign*(width/2+.08),y+height/2,.57),f.yaw);
    drawBox(width+.25,.16,.33,concrete,f.at(u,y+height+.05,.57),f.yaw);
    for(let j=0;j<16;j++){
      const yy=.1+j*.18,shift=broken&&j<4?(4-j)*.025:0;
      drawBox(width-.06,.165,.055,j%4===0?rusty:paint,f.at(u+shift,y+yy,.69+shift),f.yaw,0,broken&&j<4?.02*(4-j):0);
      rod(f.at(u-width*.48,y+yy-.07,.728+shift),f.at(u+width*.48,y+yy-.07,.728+shift),.009,rusty,5);
    }
    drawBox(.05,.22,.05,metal,f.at(u+.27,y+.9,.77),f.yaw);
    solid(f,u,.45,width+.25,.85,'metal');
  }
  function table(f,u,v,collapsed=false){
    if(!allowed(f,u,v,1.7,.75))return;
    const p=f.at(u,0,v),y=ground(p[0],p[2]),height=collapsed?.34:.83;
    for(let j=0;j<5;j++)drawBox(1.68,.045,.13,wood,f.at(u,y+height,v-.28+j*.14),f.yaw,collapsed?.13:0,collapsed?.07:0);
    for(const dx of[-.68,.68])for(const dz of[-.27,.27]){
      rod(f.at(u+dx,y+.03,v+dz),f.at(u+dx+(collapsed?.19:0),y+height,v+dz),.033,wood);
    }
    for(const dz of[-.27,.27])rod(f.at(u-.68,y+.16,v+dz),f.at(u+.68,y+.69*(collapsed?.5:1),v+dz),.02,wood);
    solid(f,u,v,1.8,.82,'wood');result.props++;
  }
  function doorstep(f,u,width=2.7){
    if(!allowed(f,u,.47,width,.88))return;
    const p=f.at(u,0,.47),y=ground(p[0],p[2]);
    drawBox(width,.13,.88,exposed,f.at(u,y+.065,.47),f.yaw);
    drawBox(width-.23,.13,.48,concrete,f.at(u-.07,y+.195,.27),f.yaw);
    // These shallow ledges remain below the walking radius, with no invisible
    // tall blocker; the adjacent building wall already prevents entry.
  }
  function shop(f,u,index,ruined=false){
    if(!allowed(f,u,1.1,3.8,1.8))return false;
    shutter(f,u,2.55,ruined,index%2?blue:green);doorstep(f,u);
    awning(f,u,3.6,1.55,ruined||index%3===1);
    if(index%2){table(f,u-.25,1.05,ruined);crate(f,u+1.35,.84,true);}
    else {crate(f,u-1.35,.83);barrel(f,u+1.35,1.02,index%3===0);}
    const p=f.at(u,0,.18),y=ground(p[0],p[2]);
    drawBox(3,.33,.10,index%2?blue:green,f.at(u,y+3.06,.23),f.yaw);
    // Worn board sign with individual support brackets, without adding a
    // unique canvas/material for every shop in every chapter.
    for(const s of[-1,1])rod(f.at(u+s*1.15,y+3.2,.07),f.at(u+s*1.15,y+3.2,.29),.018,rusty);
    result.shops++;return true;
  }
  function courtyard(f,u,index,ruined=false){
    if(!allowed(f,u,1.1,4.1,1.8))return false;
    const p=f.at(u,0,.15),y=ground(p[0],p[2]);
    // Door boards are uneven, with proper battens and metal strap hinges.
    drawBox(1.72,2.9,.16,dark,f.at(u,y+1.45,.53),f.yaw);
    for(let i=0;i<8;i++)drawBox(.19,2.83-rand(0,.08),.065,wood,f.at(u-.7+i*.2,y+1.42,.68),f.yaw);
    for(const yy of[.4,1.65]){drawBox(1.58,.1,.05,wood,f.at(u,y+yy,.74),f.yaw);for(const s of[-1,1])drawBox(.27,.055,.025,metal,f.at(u+s*.64,y+yy,.78),f.yaw);}
    for(const side of[-1,1])drawBox(.12,2.95,.3,exposed,f.at(u+side*.88,y+1.47,.57),f.yaw);
    solid(f,u,.45,1.92,.85,'wood');
    doorstep(f,u,2.15);
    brokenWall(f,u-1.65,1.63,1.2,ruined?.93:1.36,.3);
    brokenWall(f,u+1.7,1.66,1.2,ruined?.6:1.12,.3);
    if(index%2)barrel(f,u+1.62,.7,true);else timber(f,u-1.7,.65,5);
    if(!ruined&&index%3===0){
      awning(f,u,2.35,1.18,false);
      const a=f.at(u-1.7,y+2.0,.2),b=f.at(u+1.8,y+1.87,1.1);rod(a,b,.008,dark,5);
      for(let i=0;i<3;i++){const q=THREE.MathUtils.lerp(.25,.68,i/2),pos=a.map((v,j)=>THREE.MathUtils.lerp(v,b[j],q));drawBox(.35,.51,.016,i%2?cloth:blue,[pos[0],pos[1]-.24,pos[2]],f.yaw-.1);}
    }
    result.courtyards++;return true;
  }
  function workyard(f,u,index,ruined=false){
    if(!allowed(f,u,1.16,4,1.95))return false;
    if(layout.type==='recovery-ruins'||layout.type==='crash-perimeter'){
      // Exposed recovery and defensive lanes retain the ruined building's
      // opening instead of rebuilding every bay as an intact roller shop.
      if(!ruined&&index%2)shutter(f,u,2.65,true,rusty);
      else brokenWall(f,u-.35,.83,2.75,layout.type==='recovery-ruins'?.67:.96,.36);
      table(f,u+1.1,1.15,true);timber(f,u-.8,.5,6);barrel(f,u-1.5,1.23,true);
      result.workyards++;return true;
    }
    if(layout.type==='relief-avenue'){
      // The wider relief avenue serves delivery/storage frontages. It is not
      // another row of tyre repair stalls from the ambushed convoy chapter.
      shutter(f,u,2.65,index%2===0,index%2?blue:green);doorstep(f,u,2.9);
      if(index%2===0)awning(f,u,3.4,1.6,false);
      crate(f,u-1.32,.87);crate(f,u-.42,1.31,true);barrel(f,u+1.35,1.16);timber(f,u+.48,.49,3);
      result.workyards++;return true;
    }
    shutter(f,u,2.65,true);doorstep(f,u,2.9);
    if(index%2===0)awning(f,u,3.4,1.6,true);
    barrel(f,u-1.38,.85,index%2===0);tyre(f,u+1.4,1.0);tyre(f,u+.91,1.24,true);
    solid(f,u+1.2,1.1,1.0,.8,'rubber');
    timber(f,u,.65,5);
    // A leaning handcart frame has axle, hubs, slatted tray and handles. Its
    // sparse open construction reads distinctly from cargo boxes.
    if(allowed(f,u+.65,1.14,1.23,1.32)){
      const p=f.at(u+.65,0,1.14),y=ground(p[0],p[2]);
      for(const side of[-1,1]){
        const g=new THREE.TorusGeometry(.21,.045,5,12);addGeometry(g,rubber,f.at(u+.65+side*.54,y+.28,1.14),[0,f.yaw+Math.PI/2,0]);
        rod(f.at(u+.65+side*.46,y+.3,.65),f.at(u+.65+side*.46,y+.56,1.81),.025,rusty);
      }
      rod(f.at(u+.06,y+.28,1.14),f.at(u+1.24,y+.28,1.14),.026,metal);
      for(let i=0;i<5;i++)drawBox(.84,.035,.12,wood,f.at(u+.65,y+.34+i*.017,.77+i*.15),f.yaw,.11);
      solid(f,u+.65,1.14,1.23,1.32,'wood');result.props++;
    }
    result.workyards++;return true;
  }
  function nearestRoad(x,z){
    let best=null;
    for(const road of layout.roads)for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);
      const px=a[0]+dx*t,pz=a[1]+dz*t,distance=Math.hypot(x-px,z-pz);
      if(!best||distance<best.distance)best={x:px,z:pz,distance,width:road.width};
    }
    return best;
  }
  const market=layout.type==='market-dogleg',civilian=['civilian-courtyard','walled-compound','defended-courtyard'].includes(layout.type);
  const workshops=['convoy-switchback','relief-avenue','foot-withdrawal','crash-plaza','crash-perimeter'].includes(layout.type);
  for(let i=0;i<layout.buildings.length;i++){
    const b=layout.buildings[i];if(b.interior||['barracks','hangar','warehouse'].includes(b.style))continue;
    const faces=[{x:b.x,z:b.z+b.d/2,yaw:0,length:b.w,name:'south'},{x:b.x,z:b.z-b.d/2,yaw:Math.PI,length:b.w,name:'north'},
      {x:b.x+b.w/2,z:b.z,yaw:Math.PI/2,length:b.d,name:'east'},{x:b.x-b.w/2,z:b.z,yaw:-Math.PI/2,length:b.d,name:'west'}];
    const chosen=faces.map(face=>{const r=nearestRoad(face.x,face.z);return{...face,road:r,dot:(r.x-face.x)*Math.sin(face.yaw)+(r.z-face.z)*Math.cos(face.yaw)};})
      .filter(face=>face.dot>1.2&&face.road.distance<face.road.width/2+11.5&&!b.doors?.includes(face.name))
      .sort((a,b)=>a.road.distance-b.road.distance).slice(0,market?2:1);
    for(const face of chosen){
      result.faces++;const f=faceFrame(face),slots=face.length>=17?[-.27,.24]:[0];
      for(let j=0;j<slots.length;j++){
        const u=slots[j]*face.length,index=i*7+j+layout.chapter;
        if(layout.chapter===4){
          if(i%3===0)shop(f,u,index,b.ruin);
          else if(i%3===1)courtyard(f,u,index,b.ruin);
          else workyard(f,u,index,b.ruin);
        }
        else if(market)shop(f,u,index,b.ruin);
        else if(layout.type==='convoy-switchback'&&index%3===0)courtyard(f,u,index,b.ruin);
        else if(layout.type==='convoy-switchback'&&index%3===1)shop(f,u,index,b.ruin);
        else if(civilian) courtyard(f,u,index,b.ruin);
        else if(workshops||b.ruin)workyard(f,u,index,b.ruin);
        else if(index%2)shop(f,u,index,false);else courtyard(f,u,index,false);
      }
      // Thin service cables run along actual facade brackets, never suspended
      // across an authored helicopter / convoy route or detached in mid-air.
      const p=f.at(0,0,.16),y=ground(p[0],p[2]),h=Math.min(3.6,b.h-.5),pts=[];
      for(let k=0;k<=10;k++){const t=k/10;pts.push(new THREE.Vector3(...f.at((t-.5)*(face.length-1),y+h-Math.sin(t*Math.PI)*.18,.2)));}
      addGeometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),14,.012,4,false),dark);
      for(const sign of[-1,1])rod(f.at(sign*(face.length/2-.5),y+h-.16,.03),f.at(sign*(face.length/2-.5),y+h+.1,.25),.022,rusty);
    }
  }
  // The insertion camera looks back toward +Z. The gap before the next block
  // is a usable forecourt, rather than an unoccupied twenty-metre sand strip.
  // These low boundaries remain outside the road and never seal the gate.
  if(layout.chapter===4){
    for(const side of[-1,1]){
      const f=faceFrame({x:side*10.3,z:side<0?42:43,yaw:side<0?Math.PI/2:-Math.PI/2});
      const height=side<0?1.13:.81;
      brokenWall(f,-2.65,0,3.2,height,.34);brokenWall(f,2.65,0,3.2,height*.83,.34);
      for(const end of[-1,1]){
        const p=f.at(end*4.12,0,-1.35),endFace=faceFrame({x:p[0],z:p[2],yaw:f.yaw+Math.PI/2});
        brokenWall(endFace,0,0,2.7,height*.7,.3);
      }
      for(const gateSide of[-1,1]){
        const p=f.at(gateSide*1.04,0,0),y=ground(p[0],p[2]);
        drawBox(.18,1.65,.2,wood,[p[0],y+.825,p[2]],f.yaw);solid(f,gateSide*1.04,0,.2,.22,'wood');
      }
      const p=f.at(0,0,-1),y=ground(p[0],p[2]);
      drawBox(1.9,.13,1.15,exposed,f.at(0,y+.065,-.1),f.yaw);
      if(side<0){
        barrel(f,-2.5,-1.12,true);crate(f,2.5,-1.4);timber(f,2.7,-.65,4);
        for(const end of[-1,1]){
          rod(f.at(end*3.6,y,-2.05),f.at(end*3.6,y+2.05,-2.05),.035,wood);solid(f,end*3.6,-2.05,.15,.15,'wood');
        }
        const wire=[];for(let k=0;k<=12;k++){const t=k/12;wire.push(new THREE.Vector3(...f.at((t-.5)*7.2,y+2.05-Math.sin(t*Math.PI)*.2,-2.05)));}
        addGeometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wire),16,.009,4,false),dark);
        for(let j=0;j<4;j++){
          const u=-2.2+j*1.23,g=new THREE.PlaneGeometry(.72,.83,4,5),pos=g.attributes.position;
          for(let k=0;k<pos.count;k++)pos.setZ(k,Math.sin(pos.getX(k)*14+j)*.025+Math.max(0,-pos.getY(k))*.14);
          g.computeVertexNormals();addGeometry(g,j%2?cloth:blue,f.at(u,y+1.42,-2.05),[0,f.yaw,0]);
        }
      }else{
        awning(f,-2.05,3.05,1.15,true);table(f,-2.05,-1.0,true);crate(f,2.45,-1.1,true);barrel(f,3.1,-1.12);timber(f,2.5,-.5,5);
      }
      result.gapYards++;
    }
  }
  // Facade dressing alone leaves wide vacant shoulders empty. Find actual
  // vacant land beside the road and give it a legible former use: a small
  // enclosed delivery yard, abandoned stall or repair shelter. Whole plots
  // are checked against current scene colliders (including the convoy), not
  // just building centres. No invisible plot-sized collider is added.
  const overlaps=(a,b,m=0)=>a.minX<b.maxX+m&&a.maxX>b.minX-m&&a.minZ<b.maxZ+m&&a.maxZ>b.minZ-m;
  const occupiedBuildings=layout.buildings.map(b=>({minX:b.x-b.w/2,maxX:b.x+b.w/2,minZ:b.z-b.d/2,maxZ:b.z+b.d/2}));
  const reserved=[],candidates=[],bounds=layout.bounds||{minX:-layout.bound,maxX:layout.bound,minZ:-layout.bound,maxZ:layout.bound};
  const plotW=6.3,plotD=4.7;
  function emptyPlot(f){
    const b=footprint(f,0,0,plotW,plotD);
    if(b.minX<bounds.minX+.4||b.maxX>bounds.maxX-.4||b.minZ<bounds.minZ+.4||b.maxZ>bounds.maxZ-.4)return false;
    if([...occupiedBuildings,...colliders].some(c=>overlaps(b,c,.38))||reserved.some(c=>overlaps(b,c,2.7)))return false;
    for(let x=b.minX;x<=b.maxX+.01;x+=.55)for(let z=b.minZ;z<=b.maxZ+.01;z+=.55){
      const r=nearestRoad(x,z);
      if(r.distance<r.width/2+.35||routeDistance(x,z)<2.15||!safeProp(x,z,1.25))return false;
      if(protectedPoints.some(p=>Math.hypot(x-p[0],z-p[1])<2.3))return false;
    }
    return b;
  }
  function goodsStack(f,u,v,levels){
    const p=f.at(u,0,v),y=ground(p[0],p[2]);
    for(let level=0;level<levels;level++){
      const x=u+(level%2?.07:0),yy=y+.23+level*.47;
      for(const s of[-1,1]){
        for(let j=0;j<3;j++)drawBox(.76,.105,.045,wood,f.at(x,yy-.15+j*.15,v+s*.33),f.yaw);
        drawBox(.05,.46,.69,wood,f.at(x+s*.36,yy,v),f.yaw);
        drawBox(.06,.46,.045,rusty,f.at(x+s*.25,yy,v+.357),f.yaw);
      }
      for(let j=0;j<4;j++)drawBox(.17,.035,.66,wood,f.at(x-.27+j*.18,yy+.22,v),f.yaw);
    }
    solid(f,u+.04,v,.9,.8,'wood');result.props++;
  }
  function shoulderYard(f,b,index){
    const start=colliders.length,y=ground(b.x,b.z),damaged=['crash-plaza','crash-perimeter','recovery-ruins','foot-withdrawal'].includes(layout.type);
    // The entrance faces the road; the rear/return wall separates the yard
    // from the vacant lot, making an occupied shoulder read at long distance.
    brokenWall(f,0,-2.03,5.72,damaged?1.2:1.65,.34);
    const end=f.at(-2.77,0,-.55),turn=faceFrame({x:end[0],z:end[2],yaw:f.yaw+Math.PI/2});
    brokenWall(turn,0,0,2.65,damaged?.95:1.35,.32);
    brokenWall(f,2.15,1.91,1.2,.89,.3);
    const roofOrigin=f.at(-.72,0,-1.52),roof=faceFrame({x:roofOrigin[0],z:roofOrigin[2],yaw:f.yaw});
    if(index%3!==2){
      awning(roof,0,3.35,2.28,damaged||index%2===0);
      // Rear posts also have colliders for this freestanding shelter.
      for(const s of[-1,1])solid(roof,s*3.35*.48,.18,.15,.15,'wood');
      table(f,-.7,-.31,damaged&&index%2===0);
    }else{
      // An open slatted shed has a broken roof silhouette rather than a
      // second intact shop facade or a solid generic box.
      for(const u of[-1.95,.55])for(const v of[-1.58,.62]){
        rod(f.at(u,y,v),f.at(u,y+2.12-(v>0?.2:0),v),.047,wood);
        solid(f,u,v,.16,.16,'wood');
      }
      for(let j=0;j<8;j++)if(j!==5)drawBox(.27,.055,2.6,wood,f.at(-1.83+j*.34,y+2.04,-.45),f.yaw,.09,j===6?.08:0);
      rod(f.at(-2.04,y+.4,-1.58),f.at(.6,y+1.98,-1.58),.028,rusty);
      crate(f,-.75,-.3,true);
    }
    goodsStack(f,1.55,-1.15,index%2?3:2);
    barrel(f,1.66,.25,index%3===0);
    if(index%2){
      const p=f.at(2.27,0,1.05),gy=ground(p[0],p[2]);
      for(let j=0;j<3;j++)addGeometry(new THREE.TorusGeometry(.29,.095,6,18),rubber,[p[0]+j*.025,gy+.11+j*.18,p[2]],[Math.PI/2,0,j*.1]);
      solid(f,2.3,1.05,.84,.84,'rubber');result.props++;
    }else timber(f,-1.42,1.26,4);
    // A short broken drain at the yard boundary collects concrete fragments
    // and discarded packaging. It is a cluster with a source, not a uniform
    // carpet of random stones spread across the traversable road.
    for(let j=0;j<5;j++){
      const u=-2.1+j*.63,p=f.at(u,0,1.91),gy=ground(p[0],p[2]);
      if(j!==2)drawBox(.48,.09,.37,exposed,[p[0],gy+.05,p[2]],f.yaw+rand(-.12,.12),rand(-.12,.12));
      for(let k=0;k<2;k++){
        const q=f.at(u+rand(-.25,.25),0,1.75+rand(-.18,.19)),size=rand(.065,.16);
        addGeometry(new THREE.DodecahedronGeometry(size,0),k?brick:exposed,[q[0],ground(q[0],q[2])+size*.55,q[2]],[.15,rand(0,3),.3]);
      }
      if(j%2)drawBox(.24,.012,.17,cloth,f.at(u+.12,gy+.025,1.55),f.yaw+.28);
    }
    reserved.push(b);
    result.shoulderGroups.push({x:b.x,z:b.z,yaw:f.yaw,bounds:b,kind:index%3===2?'broken-wood-shed':damaged?'abandoned-stall':'delivery-yard',colliderStart:start,colliderEnd:colliders.length});
  }
  for(const road of layout.roads)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<8)continue;
    const nx=-dz/len,nz=dx/len;
    for(let distance=4;distance<len-3;distance+=5.8)for(const side of[-1,1])for(const extra of[0,4.9]){
      const offset=road.width/2+2.95+extra,x=a[0]+dx*distance/len+nx*side*offset,z=a[1]+dz*distance/len+nz*side*offset;
      candidates.push({x,z,yaw:Math.atan2(-nx*side,-nz*side),score:Math.hypot(x-layout.spawn[0],z-layout.spawn[1])+extra*2});
    }
  }
  // Prioritise the arrival view, then fill separated pockets along the route.
  // Existing narrow alleys naturally reject plots instead of being crowded.
  candidates.sort((a,b)=>a.score-b.score);
  const budget=layout.chapter===6?14:layout.chapter===5?12:market?8:10;
  for(const c of candidates){
    if(result.shoulderGroups.length>=budget)break;
    const f=faceFrame(c),b=emptyPlot(f);if(b)shoulderYard(f,b,result.shoulderGroups.length+layout.chapter);
  }
  return result;
}
