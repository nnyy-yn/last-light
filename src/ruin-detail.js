import * as THREE from 'three';

// Original metre-scale masonry construction. Everything is baked into the
// caller's existing material batches and stays in the existing building proxy.
// A private deterministic generator cannot change street/navigation placement.
export function createRuinDetail({add,palette,stats,exposed,brickEdge,oldPlaster,burned,rubble,awning,signs,material,canvasTexture,scorch}) {
  const {rusty,wood,metal,dark,blue,green,trim}=palette,PI=Math.PI;
  const record=stats.ruinStructure={buildings:0,thickWalls:0,openings:0,layeredSlabs:0,columns:0,interiorRooms:0,triangles:0,newMaterials:0};
  let seed=1;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;},rand=(a,b)=>a+(b-a)*rnd();
  // The source plaster scan includes straight panel seams. Sampling the same
  // seam-free region in albedo/normal/roughness retains genuine surface detail
  // without repeating those construction joints across a shattered wall.
  const hash=(x,y)=>{let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;};
  const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),s),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),s),t);};
  const crop=(source,albedo=false)=>{const tex=canvasTexture(1024,1024,(ctx,w,h)=>{
    const img=source.image;ctx.drawImage(img,img.width*.52,img.height*.08,img.width*.205,img.height*.84,0,0,w,h);
    if(albedo){const pixels=ctx.getImageData(0,0,w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,broad=noise(x/137+12,y/163+23),grain=noise(x/8+4,y/8+9),weather=.76+broad*.34+(grain-.5)*.12;
      for(let c=0;c<3;c++)pixels.data[i+c]=Math.max(0,Math.min(255,((pixels.data[i+c]-183)*1.75+177)*weather));
    }ctx.putImageData(pixels,0,0);}
  });tex.wrapS=tex.wrapT=THREE.MirroredRepeatWrapping;tex.anisotropy=8;if(!albedo)tex.colorSpace=THREE.NoColorSpace;return tex;};
  const weatheredPlaster=material({map:crop(palette.wallMaps.map,true),normalMap:crop(palette.wallMaps.normalMap),roughnessMap:crop(palette.wallMaps.roughnessMap),color:'#cdc3ad',roughness:1,normalScale:new THREE.Vector2(1.65,1.65)});record.newMaterials=1;
  function emit(g,m,p=[0,0,0],r=[0,0,0]){record.triangles+=(g.index?.count||g.attributes.position.count)/3;add(g,m,p,r);}
  function shape(points){const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
  function path(points){const p=new THREE.Path();points.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));p.closePath();return p;}
  function uv(g,scale=1.8){const a=g.attributes.uv;if(a)for(let i=0;i<a.count;i++)a.setXY(i,a.getX(i)/scale,a.getY(i)/scale);return g;}
  function box(w,h,d,m,p,r=[0,0,0],damage=0){
    const g=new THREE.BoxGeometry(w,h,d),a=g.attributes.position;
    if(damage){const points=new Map();for(let i=0;i<a.count;i++){const key=[a.getX(i),a.getY(i),a.getZ(i)].join(',');if(!points.has(key))points.set(key,[a.getX(i)+rand(-damage,damage),a.getY(i)+rand(-damage,damage),a.getZ(i)+rand(-damage,damage)]);a.setXYZ(i,...points.get(key));}g.computeVertexNormals();}
    const tex=g.attributes.uv;for(let i=0;i<tex.count;i++){const face=Math.floor(i/4);tex.setXY(i,tex.getX(i)*(face<2?d:w)/1.8,tex.getY(i)*(face<2?h:face<4?d:h)/1.8);}emit(g,m,p,r);
  }
  function bar(a,b,r,m=rusty,segments=6){const v=new THREE.Vector3(...a),d=new THREE.Vector3(...b).sub(v),g=new THREE.CylinderGeometry(r,r,d.length(),segments);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...v.add(new THREE.Vector3(...b)).multiplyScalar(.5).toArray());emit(g,m);}
  function bent(points,r=.009,m=rusty){emit(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),8,r,5,false),m);}

  function wall({x,z,width,yaw,heights,index,base=0,interior=false,shop=false,depth=.48}){
    record.thickWalls++;
    const c=Math.cos(yaw),s=Math.sin(yaw),wp=(u,y,v=0)=>[x+u*c+v*s,base+y,z-u*s+v*c];
    const top=[];
    // Horizontal floor remnants and near-vertical sheared piers replace the
    // previous smooth diagonal gable. Each ledge has attached chipped edges.
    const step=width/(heights.length-1);
    for(let i=0;i<heights.length-1;i++){
      const u=-width/2+i*step,h=heights[i],next=heights[i+1];
      top.push([u,h],[u+step*.17,h-rand(.04,.20)],[u+step*.28,h-rand(.02,.09)],[u+step*.52,h-rand(.05,.16)],[u+step*.65,h+rand(-.10,.04)],[u+step*.79,Math.min(h,next)-rand(.03,.17)],[u+step*.87,Math.min(h,next)+rand(-.12,.04)]);
    }top.push([width/2,heights.at(-1)]);
    const topAt=u=>{for(let i=1;i<top.length;i++)if(top[i][0]>=u){const a=top[i-1],b=top[i];return THREE.MathUtils.lerp(a[1],b[1],(u-a[0])/(b[0]-a[0]));}return top.at(-1)[1];};
    const outline=[[-width/2,.08],[width/2,.08],...top.slice().reverse()],body=shape(outline),openings=[];
    const bays=Math.max(3,Math.floor(width/2.9)),bw=width/bays,shopU=width*.29;
    const opening=(u,y,w,h,door=false)=>{
      const corners=[[u-w/2,y],[u-w/2-.035,y+h*.38],[u-w/2+.025,y+h-.05],[u-.24,y+h+.025],[u+w/2-.03,y+h],[u+w/2+.04,y+h*.65],[u+w/2,y+.06],[u+.12,y-.025]];
      body.holes.push(path(corners));openings.push({u,y,w,h,door,corners});record.openings++;
    };
    if(shop&&topAt(shopU-1.15)>2.9&&topAt(shopU+1.15)>2.9)opening(shopU,.12,2.2,2.45,true);
    for(let bay=0;bay<bays;bay++){
      const u=-width/2+(bay+.5)*bw;
      for(let floor=0;floor<3;floor++){
        const y=floor*3.2+(interior?.15:1.0),h=interior?2.45:1.62,w=interior?1.05:1.25;
        if(y+h+.30>Math.min(topAt(u-w*.6),topAt(u+w*.6)))continue;
        if(shop&&floor===0&&Math.abs(u-shopU)<2)continue;
        if(interior&&bay!==Math.floor(bays*.6))continue;
        opening(u,y,w,h,interior);
      }
    }
    const core=new THREE.ExtrudeGeometry(body,{depth,bevelEnabled:false});core.translate(0,0,-depth/2);emit(uv(core,1.7),interior?exposed:brickEdge,[x,base,z],[0,yaw,0]);
    // Separate 18 mm render layers, inset from every broken edge and opening.
    // Through-holes share the exact same contour so no plaster seals a reveal.
    const render=body.clone();
    const plaster=new THREE.ExtrudeGeometry(render,{depth:.018,bevelEnabled:false});plaster.translate(0,0,depth/2+.003);uv(plaster,3.6);
    // add() bakes transforms destructively, so clone the unbaked inner skin first.
    const inner=plaster.clone();inner.translate(0,0,-depth-.024);
    emit(plaster,interior?oldPlaster:weatheredPlaster,[x,base,z],[0,yaw,0]);
    emit(inner,interior?oldPlaster:weatheredPlaster,[x,base,z],[0,yaw,0]);
    if(!interior){
      // The overlay is cut by the same real apertures. Smoke stains originate
      // at one damaged bay and run upward, rather than uniformly dotting walls.
      const stainU=shop?shopU:width*(index%2?.19:-.25),stainY=shop?2.55:1.8;
      const soot=new THREE.ShapeGeometry(body),a=soot.attributes.position,t=soot.attributes.uv;
      for(let i=0;i<a.count;i++)t.setXY(i,(a.getX(i)-stainU)/(shop?4.2:3.4)+.5,(a.getY(i)-stainY)/4.9+.5);
      emit(soot,scorch,wp(0,0,depth/2+.025),[0,yaw,0]);
    }
    for(const o of openings){
      // Mortar reveals, thick concrete lintel, a projecting sill and separated
      // rebated frame strips produce real light/shadow inside the opening.
      box(o.w+.38,.19,depth+.09,exposed,wp(o.u,o.y+o.h+.15),[0,yaw,0],.014);
      if(!o.door)box(o.w+.30,.105,depth+.22,trim,wp(o.u,o.y-.06,.025),[0,yaw,.012],.008);
      for(const side of[-1,1]){
        box(.13,o.h+.12,depth+.025,exposed,wp(o.u+side*(o.w/2+.085),o.y+o.h/2),[0,yaw,0],.008);
        if((index+Math.round(o.u)+side)%3!==0){
          const g=new THREE.ExtrudeGeometry(shape([[0,0],[.055,0],[.055,.04],[.025,.04],[.025,.085],[0,.085]]),{depth:o.h*.93,bevelEnabled:false});g.rotateX(-PI/2);emit(uv(g),wood,wp(o.u+side*(o.w/2-.065),o.y+.04,.095),[0,yaw,side===1?.025:0]);
        }
      }
      if(!o.door){
        box(o.w-.09,.055,.085,wood,wp(o.u,o.y+o.h-.065,.095),[0,yaw,0]);
        box(o.w*.53,.035,.07,rusty,wp(o.u-o.w*.19,o.y+.68,.10),[0,yaw,-.09]);
        // One hinged shutter remains connected to its jamb, with thin blades.
        if((index+Math.floor(o.y))%3===0){const angle=yaw-.55;box(o.w*.45,o.h*.91,.055,blue,wp(o.u-o.w*.53,o.y+o.h*.51,.27),[0,angle,.06]);for(let k=0;k<7;k++)box(o.w*.38,.045,.07,wood,wp(o.u-o.w*.53,o.y+.18+k*.18,.31),[0,angle,.06]);}
      }
      // Chipped masonry courses are seated along the opening, never floating.
      for(let k=0;k<4;k++){const sign=k%2?1:-1,u=o.u+sign*(o.w*.5+.055),y=o.y+.18+k*.30;box(.20,.10,.13,brickEdge,wp(u,y,depth/2+.015),[0,yaw,rand(-.09,.09)],.012);}
    }
    for(let i=0;i<top.length-1;i++){
      const a=top[i],b=top[i+1];
      // A complete, rough cap wraps the wall's thickness. Its material differs
      // from the thin plaster skins, exposing the masonry cross-section.
      const points=[[a[0],a[1]-.12],[b[0],b[1]-.12],[b[0],b[1]+.025],[a[0],a[1]+.025]],cap=new THREE.ExtrudeGeometry(shape(points),{depth:depth+.025,bevelEnabled:false});cap.translate(0,0,-depth/2-.012);emit(uv(cap,.9),exposed,[x,base,z],[0,yaw,0]);
      if(i%4===1&&a[1]>.6){box(.21,.09,depth*.65,brickEdge,wp((a[0]+b[0])*.5,(a[1]+b[1])*.5-.05,.015),[0,yaw,rand(-.05,.05)],.017);}
    }
    // Loss of render grows out of a broken edge. These irregular strips are
    // connected to the exposed cap, rather than identical marks on blank walls.
    if(!interior)for(let strip=0;strip<3;strip++){
      const u=-width*.40+strip*width*.30,span=rand(.52,1.0),points=[];
      for(let i=0;i<6;i++){const xx=u+span*i/5;points.push([xx,topAt(xx)-rand(.015,.055)]);}
      for(let i=5;i>=0;i--){const xx=u+span*i/5;points.push([xx+rand(-.035,.035),Math.max(.15,topAt(xx)-rand(.16,.47))]);}
      const g=new THREE.ExtrudeGeometry(shape(points),{depth:.021,bevelEnabled:false});emit(uv(g,1.7),brickEdge,wp(0,0,depth/2+.023),[0,yaw,0]);
    }
    if(shop){
      const shopHeight=2.55;
      // The existing canopy post location is retained to match its proxy.
      box(2.64,.69,.12,wood,wp(shopU+.14,3.16,.34),[0,yaw,-.075]);emit(new THREE.PlaneGeometry(2.56,.61),signs[index%signs.length],wp(shopU+.14,3.16,.407),[0,yaw,-.075]);
      const g=new THREE.PlaneGeometry(2.10,1.38,20,26),a=g.attributes.position;
      for(let i=0;i<a.count;i++){const u=a.getX(i),v=a.getY(i),t=.69-v;a.setXYZ(i,u+.06*t,shopHeight-.66+v,.20+Math.sin(v*54)*.023+t*t*.19);}g.computeVertexNormals();emit(g,rusty,wp(shopU,0),[0,yaw,0]);
      for(const du of[-1.17,1.17])box(.08,2.67,.095,metal,wp(shopU+du,1.4,.24),[0,yaw,0]);
      box(2.42,.22,.24,rusty,wp(shopU,2.77,.23),[0,yaw,0]);
      const canopy=new THREE.PlaneGeometry(3.2,1.55,22,8),cp=canopy.attributes.position;
      for(let i=0;i<cp.count;i++){const u=cp.getX(i),v=(cp.getY(i)+.775)/1.55;cp.setXYZ(i,shopU+u,shopHeight+.27-v*(.28+THREE.MathUtils.smoothstep(u,.2,1.6)*1.25)+Math.sin(u*23)*.014,.2+v*1.5);}canopy.computeVertexNormals();emit(canopy,awning,[x,base,z],[0,yaw,0]);
      bent([wp(shopU-1.6,2.78,.18),wp(shopU-1.6,2.49,1.7),wp(shopU+.6,1.9,1.7),wp(shopU+1.65,.55,1.9)],.025);
      bent([wp(shopU+1.65,.05,1.9),wp(shopU+1.65,.7,1.9),wp(shopU+1.35,1.2,1.45)],.03);
    }
  }

  function building({cx,cz,w,d,h,index}){
    seed=(19931003+index*7919)>>>0;record.buildings++;
    const side=Math.sign(cx),front=Math.sign(cz),at=(u,y,v)=>[cx-side*w/2+side*u,y,cz+front*d/2-front*v];
    const street=[.85,1.18,3.02,2.91,3.45,6.55,6.41,h-.65,h-.25].map(v=>Math.min(v,h-.15));
    const frontProfile=[h-.2,h-.35,Math.min(h-.4,6.65),Math.min(h-.6,6.35),3.18,3.12,1.28,.72,.85];
    const flip=(side<0&&front>0)||(side>0&&front<0);
    wall({x:cx-side*w/2,z:cz,width:d,yaw:-side*PI/2,heights:street,index,shop:true});
    wall({x:cx,z:cz+front*d/2,width:w,yaw:front>0?0:PI,heights:flip?frontProfile:frontProfile.slice().reverse(),index:index+1});
    wall({x:cx+side*w/2,z:cz,width:d,yaw:side*PI/2,heights:[h-.35,h-.55,h-.2,h-.9,h-.72,h-.65],index:index+2});
    wall({x:cx,z:cz-front*d/2,width:w,yaw:front>0?PI:0,heights:[h-.25,h-.4,h-.15,h-.6,h-.95,h-.7],index:index+3});
    box(w-.25,.22,d-.25,rubble,[cx,.08,cz]);

    const floors=Math.ceil(h/3.2)-1;
    for(let floor=1;floor<=floors;floor++){
      const y=floor*3.2,cut=w*(floor===1?.58:.68),back=d*(floor===1?.66:.74);
      const outline=[[cut,.30],[w-.27,.30],[w-.27,d-.27],[.28,d-.27],[.28,back],[cut-.48,back],[cut-.56,back-.23],[cut-.18,back-.35],[cut-.12,back-.70],[cut+.12,back-.83],[cut,back-1.2]];
      const worldOutline=outline.map(([u,v])=>{const p=at(u,0,v);return[p[0],p[2]];});
      const slab=new THREE.ExtrudeGeometry(shape(worldOutline),{depth:.31,bevelEnabled:false});slab.rotateX(PI/2);emit(uv(slab,2.2),exposed,[0,y,0]);
      const screed=new THREE.ExtrudeGeometry(shape(worldOutline),{depth:.048,bevelEnabled:false});screed.rotateX(PI/2);emit(uv(screed,2.6),oldPlaster,[0,y+.048,0]);record.layeredSlabs++;
      // Continuous beams land on columns or retained walls, under every slab.
      for(const v of[.48,back-.1,d-.48])box(w-cut,.38,.28,exposed,at((w+cut)*.5,y-.40,v),[0,0,0],.009);
      box(.28,.38,d-.8,exposed,at(cut+.18,y-.40,d*.5),[0,0,0],.008);
      box(w-.8,.38,.28,exposed,at(w*.5,y-.40,back+.17),[0,0,0],.008);
      // Two rows of actual tile remnants reveal the top layer at the broken lip.
      for(let i=0;i<Math.floor((d*.55)/.31);i++){const v=1.0+i*.31;if(v>back-.7)break;box(.28,.018,.28,i%4?palette.walls[4]:trim,at(cut+.20,y+.065,v));}
      for(let k=0;k<9;k++){
        const v=.65+k*(back-.95)/8,start=at(cut+.20,y-.14,v),mid=at(cut-.22,y-.16-rand(0,.10),v+.02),end=at(cut-rand(.35,.72),y-rand(.20,.45),v+rand(-.08,.12));bent([start,mid,end],.009);
      }
      // Internal doorways, plaster returns and a faded painted dado establish
      // a room behind the shell, rather than disconnected floating floor plates.
      const px=at(cut+.32,0,d*.76),roomWidth=d*.43;
      wall({x:px[0],z:px[2],width:roomWidth,yaw:-side*PI/2,heights:[2.95,2.9,2.97,2.92],index:index+floor,base:y-3.2,interior:true,depth:.20});record.interiorRooms++;
      const rear=at(w*.39,0,back+.42);
      wall({x:rear[0],z:rear[2],width:w*.58,yaw:front>0?0:PI,heights:[2.88,2.96,2.93,2.86],index:index+floor+1,base:y-3.2,interior:true,depth:.20});record.interiorRooms++;
      // Small connected service traces on the rear wall, all inside the room.
      const baseY=y-3.2;bar(at(w*.28,baseY+.2,back+.29),at(w*.28,baseY+2.4,back+.29),.018,dark);box(.18,.25,.07,green,at(w*.28,baseY+1.4,back+.25));
      for(let n=0;n<3;n++)box(.78,.035,.27,wood,at(w*.32,baseY+.50+n*.48,back+.14));
      bar(at(w*.03,baseY+.72,back+.1),at(w*.45,baseY+.72,back+.1),.035,blue);
    }
    // Linked concrete piers carry the stepped floors; broken stumps expose
    // reinforcement only at a concrete end, with no isolated floating rods.
    for(const [u,v,height]of[[w-.42,.45,h-.45],[w-.42,d-.45,h-.4],[w*.59,d*.65,floors*3.2-.1],[w*.59,.55,side<0?3.7:2.55],[w*.30,d*.35,1.23]]){
      box(.35,height,.36,exposed,at(u,height/2,v),[0,0,0],.013);record.columns++;
      const collar=.10;for(let k=0;k<3;k++){const yy=height-.25-k*.14;for(const dv of[-.15,.15])bar(at(u-.145,yy,v+dv),at(u+.145,yy,v+dv),.006);}
      if(height<h-.5)for(let barIndex=0;barIndex<4;barIndex++){const du=(barIndex%2-.5)*.22,dv=(Math.floor(barIndex/2)-.5)*.22;bent([at(u+du,height-.2,v+dv),at(u+du,height+.22,v+dv),at(u+du+rand(-.12,.12),height+rand(.35,.65),v+dv+.07)],.009);}
    }
    // One sheared slab drops into its own ground-floor rubble, with a thick
    // exposed side and a cracked top skin; the two ends have actual supports.
    const fall=at(w*.38,1.30,d*.35),rotation=[.28*front,side*.13,side*.28];
    box(w*.30,.30,d*.30,exposed,fall,rotation,.025);box(w*.30,.035,d*.30,oldPlaster,[fall[0],fall[1]+.17,fall[2]],rotation,.012);
    box(.85,1.1,.95,brickEdge,at(w*.25,.55,d*.38),[0,.1,0],.035);
    box(.70,1.8,.65,exposed,at(w*.49,.90,d*.31),[0,-.1,0],.020);
  }
  return {building};
}
