import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {addCoastalRoofDetails} from './coastal-details.js';
import {createRuinDetail} from './ruin-detail.js';
import {createEnvironmentDetail} from './environment-detail.js';
import {createGroundSurface} from './ground-surface.js';
import {createStreetFrontage} from './street-frontage.js';
import {dressChapterInterior} from './chapter-interiors.js';
import {getChapterConvoy} from './chapter-convoys.js';

// The builder owns only this chapter's batches, lamps and instanced props.
// Loaded GLB geometry and PBR maps remain shared and are never disposed here.
export function buildChapterScene(layout,{group,colliders,palette,rubbleMaps,facadeAsset,makeVehicle,makeAircraft,addFire,addSmoke,nightLights,destroyObject}){
  const PI=Math.PI,batches=new Map(),ownedMaterials=new Set(),ownedTextures=new Set(),objects=[],lights=[];
  const stats={buildings:0,openWindows:0,ruinedBays:0,rubblePiles:0,looseFragments:0,drawCalls:0,triangles:0};
  const {walls,brick,road,concrete,dark,rusty,trim,blue,green,wood,metal,cloth,rubber,white}=palette;
  let seed=layout.chapter*4919+1993,disposed=false,propElevation=0;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},rand=(a,b)=>a+(b-a)*rnd();
  const material=options=>{const m=new THREE.MeshStandardMaterial(options);ownedMaterials.add(m);return m;};
  const canvasTexture=(w,h,paint)=>{const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;ownedTextures.add(t);return t;};
  // Retain the source scan's fine grain while suppressing large dried-river
  // fissures which read as giant tiled paving when repeated over sandy streets.
  const soilMap=canvasTexture(1024,1024,(ctx,w,h)=>{ctx.fillStyle='#aaa08c';ctx.fillRect(0,0,w,h);ctx.globalAlpha=.24;ctx.drawImage(palette.dirtMaps.map.image,0,0,w,h);ctx.globalAlpha=1;const pixels=ctx.getImageData(0,0,w,h);for(let i=0;i<pixels.data.length;i+=4){const shade=rand(-8,8);pixels.data[i]+=shade;pixels.data[i+1]+=shade;pixels.data[i+2]+=shade;}ctx.putImageData(pixels,0,0);});soilMap.wrapS=soilMap.wrapT=THREE.RepeatWrapping;
  const sand=material({map:soilMap,normalMap:palette.dirtMaps.normalMap,normalScale:new THREE.Vector2(.1,.1),roughness:1,color:'#c4b697'});
  const cropMap=(source,color=false)=>{const t=canvasTexture(1024,1024,(ctx,w,h)=>{const image=source.image;ctx.drawImage(image,image.width*.52,image.height*.08,image.width*.205,image.height*.84,0,0,w,h);if(color){for(let i=0;i<12;i++){const x=rand(0,w),y=rand(0,h),r=rand(120,330),g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(69,62,46,.045)');g.addColorStop(1,'rgba(69,62,46,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}}});t.wrapS=t.wrapT=THREE.MirroredRepeatWrapping;if(!color)t.colorSpace=THREE.NoColorSpace;return t;};
  const plasterMaps={map:cropMap(palette.wallMaps.map,true),normalMap:cropMap(palette.wallMaps.normalMap),roughnessMap:cropMap(palette.wallMaps.roughnessMap)};
  const plaster=['#ccc8b8','#aeb8aa','#c5b298'].map(color=>material({...plasterMaps,color,roughness:1,normalScale:new THREE.Vector2(1.1,1.1)}));
  const rubble=material({...rubbleMaps,color:'#9a8b77',roughness:1}),exposed=material({...palette.brokenMaps,color:'#a79b86',roughness:1}),brickEdge=material({...palette.brickMaps,color:'#8e735c',roughness:1});
  const awning=material({...palette.dirtMaps,color:'#8d8870',roughness:1,side:THREE.DoubleSide}),burned=material({...palette.wallMaps,color:'#524e43',roughness:1});
  const sootMap=canvasTexture(512,512,(ctx,w,h)=>{for(let i=0;i<145;i++){const v=rnd(),y=h*(.88-v*.82),x=w*(.5+rand(-.09,.09)*(1+v*1.7)),r=rand(16,56)*(1-v*.32),g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,.10)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}});
  const scorch=material({map:sootMap,color:'#24231e',roughness:1,transparent:true,opacity:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});scorch.userData.noShadow=true;
  const shard=material({color:'#546867',roughness:.7,metalness:.1}),roadMark=material({color:'#b9b397',roughness:1});
  const signMap=canvasTexture(512,128,(ctx,w,h)=>{ctx.fillStyle='#61675a';ctx.fillRect(0,0,w,h);ctx.fillStyle='#c4bea5';ctx.font='bold 38px sans-serif';ctx.fillText('SUUQA  •  DUKAAN',18,76);});
  const signs=[material({map:signMap,roughness:1})];
  const transform=new THREE.Object3D();
  function add(geometry,mat,position=[0,0,0],rotation=[0,0,0]){
    if(geometry.index){const original=geometry;geometry=geometry.toNonIndexed();original.dispose();}
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv','color','groundBlend'].includes(name))geometry.deleteAttribute(name);
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    // GLB quantised/interleaved attributes must be expanded before merge.
    for(const key of ['position','normal','uv']){const a=geometry.attributes[key];if(a.isInterleavedBufferAttribute||a.normalized||!(a.array instanceof Float32Array)){const values=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)values[i*a.itemSize+j]=a.getComponent(i,j);geometry.setAttribute(key,new THREE.BufferAttribute(values,a.itemSize));}}
    transform.position.set(position[0],position[1]+propElevation,position[2]);transform.rotation.set(...rotation);transform.scale.set(1,1,1);transform.updateMatrix();geometry.applyMatrix4(transform.matrix);
    if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(geometry);
  }
  function box(w,h,d,mat,x,y,z,ry=0,rx=0,rz=0){
    const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv;
    for(let i=0;i<uv.count;i++){const face=Math.floor(i/4);uv.setXY(i,uv.getX(i)*(face<2?d:w)/2.2,uv.getY(i)*(face<2?h:face<4?d:h)/2.2);}
    add(g,mat,[x,y,z],[rx,ry,rz]);
  }
  function line(a,b,r,m=metal,sides=6){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),g=new THREE.CylinderGeometry(r,r,delta.length(),sides);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());add(g,m);}
  function curve(points,r,m){add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),18,r,5,false),m);}
  const details=createEnvironmentDetail({material,canvasTexture,palette:{...palette,shard,exposed,brickEdge},stats});
  let ruins;
  function obstacle(x,z,w,d,materialName='masonry'){
    const b={minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,material:materialName};colliders.push(b);return b;
  }
  function routeDistance(x,z){let distance=Infinity;for(let i=1;i<layout.route.length;i++){const a=layout.route[i-1],b=layout.route[i],dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}return distance;}
  function safeProp(x,z,r=1.8){return routeDistance(x,z)>r&&![layout.spawn,...layout.taskPositions,...layout.enemySpawns.map(e=>e.pos)].some(p=>Math.hypot(x-p[0],z-p[1])<r+1.0);}
  function lamp(x,z,height=4.7,inside=false){
    if(!inside){line([x,0,z],[x,height,z],.055,metal);line([x,height,z],[x+.75,height,z],.045,metal);box(.55,.12,.32,metal,x+.75,height-.08,z);}
    const light=new THREE.PointLight(inside?'#efbc80':'#edc18c',0,inside?17:22,2);light.position.set(x+(inside?0:.75),height-.2+propElevation,z);light.userData.chapterLamp=true;light.userData.interior=inside;group.add(light);lights.push(light);nightLights.push(light);
    if(inside){box(.42,.08,.42,white,x,height,z);}
  }
  function label(text,x,y,z,yaw=0){
    const map=canvasTexture(768,160,(ctx,w,h)=>{ctx.fillStyle='#bbb49d';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#5e6255';ctx.lineWidth=12;ctx.strokeRect(6,6,w-12,h-12);ctx.fillStyle='#454a40';ctx.font='bold 58px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText(text,w/2,103);});
    add(new THREE.PlaneGeometry(4.3,.9),material({map,roughness:1}),[x,y,z],[0,yaw,0]);
  }
  const windowParts=[];facadeAsset?.scene.updateMatrixWorld(true);
  facadeAsset?.scene.getObjectByName('window_centered_small_01')?.traverse(o=>{if(o.isMesh&&!/glass/i.test(o.material.name))windowParts.push({geometry:o.geometry,matrix:o.matrixWorld.clone(),material:o.material});});
  function authoredWindow(position,yaw,width,height){for(const part of windowParts){const g=part.geometry.clone().applyMatrix4(part.matrix);g.scale(width/1.12,height/2.3,1);add(g,part.material,position,[0,yaw,0]);}}
  function bed(x,z,covered=false){
    box(.92,.1,2.05,cloth,x,.55,z);box(.9,.055,1.55,covered?white:cloth,x,.63,z+.16);box(.68,.13,.35,white,x,.67,z-.69);
    for(const dx of[-.46,.46])for(const dz of[-.91,.91])line([x+dx,.05,z+dz],[x+dx,.69,z+dz],.026,metal);
    for(const dx of[-.46,.46])line([x+dx,.45,z-1],[x+dx,.45,z+1],.025,metal);obstacle(x,z,1.02,2.1,'metal');
  }
  // Exterior faces have real 0.36m thick piers and open window holes. Only
  // ground walls collide; an authored doorway remains physically passable.
  function facade(cx,cz,length,height,yaw,mat,door=false,index=0){
    const c=Math.cos(yaw),s=Math.sin(yaw),at=(u,y,v=0)=>[cx+u*c+v*s,y,cz-u*s+v*c];
    const wb=(u,y,w,h,d,m=mat,v=0)=>box(w,h,d,m,...at(u,y,v),yaw);
    const floors=Math.max(1,Math.round(height/3.2)),fh=height/floors,bays=Math.max(2,Math.round(length/3.5)),bw=length/bays;
    for(let j=0;j<bays;j++){
      const u=-length/2+(j+.5)*bw,isDoor=door&&j===Math.floor(bays/2),gap=isDoor?Math.min(2.4,bw-.38):Math.min(1.35,bw-.65),pier=(bw-gap)/2;
      for(const side of[-1,1])wb(u+side*(gap/2+pier/2),height/2,pier,height,.36);
      for(let f=0;f<floors;f++){
        const bottom=f*fh+(f===0&&isDoor?0:1.0),top=f*fh+(f===0&&isDoor?Math.min(2.6,fh-.25):fh-.44);
        if(bottom>f*fh)wb(u,(bottom+f*fh)/2,gap,bottom-f*fh,.36);
        wb(u,(top+(f+1)*fh)/2,gap,(f+1)*fh-top,.36);
        if(!(isDoor&&f===0)){
          stats.openWindows++;wb(u,bottom-.045,gap+.21,.11,.56,trim);
          for(const side of[-1,1])wb(u+side*(gap/2-.02),(bottom+top)/2,.055,top-bottom,.08,wood,.03);
          wb(u,top-.03,gap,.055,.08,wood,.03);
          if((index+j+f)%3===0){const p=at(u-gap*.7,(bottom+top)/2,.20);box(gap*.43,top-bottom-.09,.055,index%2?blue:green,...p,yaw-.32);}
          if(f===0)for(let k=-1;k<=1;k++)wb(u+k*gap*.22,(bottom+top)/2,.018,top-bottom,.025,metal,.02);
          if((index+j+f)%4===0)authoredWindow(at(u,bottom,.20),yaw,gap,top-bottom);
        }
      }
      const register=(center,width)=>{const p=at(center,0);obstacle(p[0],p[2],Math.abs(c)*width+Math.abs(s)*.42,Math.abs(s)*width+Math.abs(c)*.42);};
      if(isDoor){register(u-(gap/2+pier/2),pier);register(u+(gap/2+pier/2),pier);}else register(u,bw);
    }
  }
  function building(b,index){
    stats.buildings++;const {x,z,w,d,h}=b;
    if(b.ruin){
      ruins??=createRuinDetail({add,palette,stats,exposed,brickEdge,oldPlaster:walls[2],burned,rubble,awning,signs,material,canvasTexture,scorch});
      ruins.building({cx:x,cz:z,w,d,h,index:index+layout.chapter*13});obstacle(x,z,w,d);stats.ruinedBays+=6;
      addCoastalRoofDetails({cx:x,cz:z,w,d,h,index,ruin:true,add,box,line,curve,palette});return;
    }
    if(b.style==='hangar'){
      // A tall open east portal, exposed roof trusses and a covered briefing
      // floor distinguish the hangar from the low masonry clinic interiors.
      box(w,.18,d,concrete,x,-.09,z);box(.4,h,d,concrete,x-w/2,h/2,z);obstacle(x-w/2,z,.4,d);
      for(const side of[-1,1]){box(w,h,.3,rusty,x,h/2,z+side*d/2);obstacle(x,z+side*d/2,w,.3);}
      for(let t=-w/2;t<=w/2;t+=4.8){
        line([x+t,h-.3,z-d/2],[x+t,h+3,z],.1,metal);line([x+t,h+3,z],[x+t,h-.3,z+d/2],.1,metal);line([x+t,h-1,z-d/2],[x+t,h-1,z+d/2],.09,metal);
        for(let q=-d/2;q<d/2;q+=4)line([x+t,h-1,z+q],[x+t,h+3-Math.abs(q+2)*3/(d/2),z+q+2],.035,metal);
      }
      for(const side of[-1,1])box(w+.4,.15,Math.hypot(d/2,3)+.25,rusty,x,h+1.5,z+side*d/4,0,side*Math.atan2(3,d/2));
      box(.35,3,d,metal,x+w/2,h-1.5,z);label('任务简报 / BRIEFING',x-w/2+.23,3,z,-PI/2);
      for(const zz of[-8,-3,2,7]){box(5,.09,1,wood,x-7,.8,z+zz);for(const dx of[-2,2])box(.1,.8,.8,metal,x-7+dx,.4,z+zz);}
      for(const zz of[-13,13])lamp(x,z+zz,h-1,true);return;
    }
    const doors=b.doors||[],m=b.style==='barracks'?green:plaster[index%plaster.length];
    box(w,.12,d,concrete,x,-.06,z);
    facade(x,z+d/2,w,h,0,m,doors.includes('south'),index);
    facade(x,z-d/2,w,h,PI,m,doors.includes('north'),index+1);
    facade(x+w/2,z,d,h,PI/2,m,doors.includes('east'),index+2);
    facade(x-w/2,z,d,h,-PI/2,m,doors.includes('west'),index+3);
    if(!b.interior){obstacle(x,z,w,d);for(let level=3.2;level<h;level+=3.2)box(w-.2,.17,d-.2,concrete,x,level,z);}
    box(w+.24,.18,d+.24,b.style==='barracks'?rusty:concrete,x,h+.09,z);
    if(b.style==='barracks')for(const side of[-1,1])box(w+.5,.09,d*.52,rusty,x,h+.55,z+side*d*.25,0,-side*.16);
    else addCoastalRoofDetails({cx:x,cz:z,w,d,h,index:index+layout.chapter,ruin:false,add,box,line,curve,palette});
    if(b.label)label(b.label,x,2.9,z+d/2+.21);
    if(b.interior){
      for(const dx of[-w*.28,w*.28])for(const dz of[-d*.24,d*.21]){
        // Keep the authored central routes and all interaction spots clear.
        if(!safeProp(x+dx,z+dz,1.8))continue;
        if(['clinic','treatment','recovery'].includes(b.interior))bed(x+dx,z+dz,b.interior==='recovery');
        else {box(2.1,.10,.85,wood,x+dx,.75,z+dz);obstacle(x+dx,z+dz,2.1,.85);}
      }
      for(const dx of[-w*.28,w*.28])lamp(x+dx,z,Math.min(h-.45,3.1),true);
      // An actual side room wall and doorway; the centre aisle stays open.
      if(b.interior==='treatment'){facade(x,z-d*.2,w*.38,3.3,0,concrete,true,index);box(.12,2.8,d*.35,cloth,x-w*.27,1.4,z-d*.24);}
    }
  }
  function fragmentPile(x,z,scale=1){
    stats.rubblePiles++;
    for(let i=0;i<42;i++){
      const a=rand(0,PI*2),r=rand(0,scale*1.7),xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;
      if(routeDistance(xx,zz)<1.2)continue;
      const size=rand(.12,.48)*scale,y=surface.sampleHeight(xx,zz)+rand(.06,.18)+(1-r/(scale*1.8))*.16;
      box(size,rand(.06,.19),size*.7,i%4?brickEdge:exposed,xx,y,zz,rand(0,PI),rand(-.3,.3),rand(-.3,.3));stats.looseFragments++;
    }
  }
  function placeObject(object,x,z,rotation=0,collision=true){
    object.position.x=x;object.position.z=z;object.position.y+=surface.sampleHeight(x,z);object.rotation.y+=rotation;group.add(object);objects.push(object);object.updateMatrixWorld(true);
    if(collision)for(const b of object.userData.collisionBoxes||[]){
      const corners=[[b.minX,b.minZ],[b.maxX,b.minZ],[b.minX,b.maxZ],[b.maxX,b.maxZ]].map(([xx,zz])=>new THREE.Vector3(xx,0,zz).applyMatrix4(object.matrixWorld));
      colliders.push({minX:Math.min(...corners.map(p=>p.x)),maxX:Math.max(...corners.map(p=>p.x)),minZ:Math.min(...corners.map(p=>p.z)),maxZ:Math.max(...corners.map(p=>p.z)),material:'metal'});
    }
    return object;
  }
  function prop(p,index){
    const [x,z]=p.pos,yaw=p.rotation||0;
    if(['vehicle','burned','aircraft','wreck'].includes(p.kind)){
      const flight=p.kind==='aircraft'||p.kind==='wreck',object=flight?makeAircraft(p.kind==='wreck',{managed:false}):makeVehicle({burned:p.kind==='burned',medical:false,type:p.type||'humvee',variant:p.variant||'olive',occupied:p.occupied!==false});
      object.userData.chapterPropKind=p.kind;
      if(p.convoy)Object.assign(object.userData,{convoy:true,convoyGroup:p.convoyGroup,convoyIndex:p.convoyIndex,convoyId:p.convoyId});
      placeObject(object,x,z,yaw,true);
      if(p.fire){addFire(object,{position:flight?[-.4,.3,-2]:object.userData.fireAnchor,scale:flight?1.65:.7,intensity:flight?1.1:.7});addSmoke(object,0,-1,flight?18:10,{height:flight?30:15,spread:.6,persistent:true,intensity:.65});}
      if(p.kind==='wreck')fragmentPile(x+3.8,z+2,1.4);return;
    }
    if(p.kind==='rubble'){fragmentPile(x,z,1.1);return;}
    if(p.kind==='lamp'){lamp(x,z);return;}
    if(p.kind==='wall'){box(p.length,1.55,.4,walls[2],x,.775,z,yaw);obstacle(x,z,Math.abs(Math.cos(yaw))*p.length+.4,Math.abs(Math.sin(yaw))*p.length+.4);return;}
    if(p.kind==='gate'){for(const side of[-1,1]){const px=x+Math.cos(yaw)*side*4,pz=z-Math.sin(yaw)*side*4;box(.45,3.5,.5,concrete,px,1.75,pz);obstacle(px,pz,.45,.5);}box(8.6,.4,.5,concrete,x,3.5,z,yaw);return;}
    if(p.kind==='helipad'){
      add(new THREE.RingGeometry(9.75,10,64),roadMark,[x,.069,z],[-PI/2,0,0]);for(const dx of[-1.3,1.3])box(.35,.012,4,roadMark,x+dx,.069,z);box(2.7,.012,.35,roadMark,x,.069,z);return;
    }
    if(p.kind==='cockpit'){cockpit();return;}
    if(p.kind==='flag'){
      line([x,0,z],[x,7,z],.045,metal);box(.06,1,1.6,cloth,x,5.8,z+.8,0,0,.1);return;
    }
    if(p.kind==='washing'){
      for(const side of[-1,1])line([x+side*2,0,z],[x+side*2,3,z],.04,wood);
      curve([[x-2,2.9,z],[x,2.7,z],[x+2,2.9,z]],.008,dark);
      for(let i=0;i<4;i++)box(.7,.85,.018,i%2?cloth:white,x-1.3+i*.85,2.25,z,.12*i);return;
    }
    if(p.kind==='tent'){
      for(const dx of[-3.5,3.5])for(const dz of[-3,3])line([x+dx,0,z+dz],[x+dx,2.5,z+dz],.04,metal);
      for(const side of[-1,1]){box(3.75,.025,6.3,cloth,x+side*1.75,3.15,z,0,0,-side*.35);box(.025,2.45,6.2,cloth,x+side*3.5,1.22,z);}
      box(7,.025,6.2,concrete,x,-.02,z);for(const dx of[-2,2])if(safeProp(x+dx,z,1.1))bed(x+dx,z);return;
    }
    if(p.kind==='memorialArea'){for(let i=0;i<4;i++)bed(x-3+i*2,z+2,true);label('IN MEMORY',x,1.6,z-2);return;}
    if(p.kind==='memorial'){if(safeProp(x,z,1.1))bed(x,z,true);return;}
    if(!safeProp(x,z,p.kind==='stall'?2:1.1))return;
    if(p.kind==='sandbags'||p.kind==='barricade'){
      const count=p.kind==='barricade'?11:6;
      for(let row=0;row<3;row++)for(let i=0;i<count-row%2;i++){
        const off=(i-(count-1)/2+row%2*.45)*.63,xx=x+Math.cos(yaw)*off,zz=z-Math.sin(yaw)*off;
        const sack=new THREE.SphereGeometry(1,8,5);sack.scale(.36,.16,.25);add(sack,cloth,[xx,.16+row*.26,zz],[0,yaw,0]);
      }
      obstacle(x,z,Math.abs(Math.cos(yaw))*count*.63+.5,Math.abs(Math.sin(yaw))*count*.63+.5);return;
    }
    if(p.kind==='well'){
      add(new THREE.CylinderGeometry(1,1,.75,18,1,true),concrete,[x,.375,z]);add(new THREE.TorusGeometry(1,.1,5,18),trim,[x,.8,z],[PI/2,0,0]);for(const side of[-1,1])line([x+side*1.15,.6,z],[x+side*1.15,2.4,z],.065,wood);line([x-1.2,2.3,z],[x+1.2,2.3,z],.07,wood);obstacle(x,z,2.3,2.3);return;
    }
    if(p.kind==='stall'){
      for(const dx of[-1.7,1.7])for(const dz of[-1.0,1.0])line([x+dx,0,z+dz],[x+dx,2.6,z+dz],.035,wood);
      const g=new THREE.PlaneGeometry(3.8,2.5,12,6),v=g.attributes.position;for(let i=0;i<v.count;i++){const u=v.getX(i),t=v.getY(i);v.setXYZ(i,u,2.6-.18*Math.cos(u*.85)-t*.07,t);}g.computeVertexNormals();add(g,awning,[x,0,z]);
      box(3.1,.12,1.1,wood,x,.8,z);for(let i=0;i<6;i++)box(.45,.18,.4,i%2?green:wood,x-1.2+i*.48,1,z);obstacle(x,z,3.2,1.2);
      details.cart((g,m,pos=[0,0,0],rot=[0,0,0])=>{const matrix=new THREE.Matrix4().compose(new THREE.Vector3(x-2.5+pos[0],pos[1]+.46,z+pos[2]),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(1,1,1));g.applyMatrix4(matrix);add(g,m);});return;
    }
    if(p.kind==='fuel'){
      for(let i=0;i<5;i++)add(new THREE.CylinderGeometry(.32,.32,.88,16),rusty,[x+i*.8, .44,z]);obstacle(x+1.6,z,4.1,.7);return;
    }
    // Cargo crates have planks, straps and lids, not an untextured marker cube.
    for(let j=0;j<3;j++){const xx=x+(j-1)*1.05;box(.9,.64,.7,wood,xx,.32,z);for(const side of[-1,1])box(.055,.7,.73,metal,xx+side*.3,.35,z);box(.95,.055,.74,wood,xx,.68,z);}obstacle(x,z,3.1,.8);
  }
  function cockpit(){
    // The authored UH-60 mesh supplies curved canopy, dashboard, seats and
    // cockpit controls. Its transform is independent of the outside defence
    // chapter; a separate small walking boundary keeps the injured pilot here.
    const body=makeAircraft(false,{managed:false});body.position.set(0,-.82,3.6);body.rotation.set(0,PI,0);body.userData.chapterPropKind='cockpit';
    body.userData.rotor.children.filter(o=>o.material?.isShaderMaterial).forEach(o=>{o.geometry.dispose();o.removeFromParent();});
    body.userData.tailRotor.children.filter(o=>o.material?.isShaderMaterial).forEach(o=>{o.geometry.dispose();o.removeFromParent();});
    group.add(body);objects.push(body);
    box(2.8,.1,3.6,metal,0,-.05,0);obstacle(-1.45,0,.18,4.3,'metal');
    // Open starboard cabin door: dialogue rays and the rescuer use the same
    // visible opening, rather than hitting a full-length invisible wall.
    obstacle(1.45,(-2.15+.2)/2,.18,2.35,'metal');obstacle(1.45,(1.5+2.15)/2,.18,.65,'metal');
    obstacle(0,-1.96,3.3,.25,'metal');obstacle(0,1.85,3.3,.25,'metal');
    // Through the broken windshield: nearby debris and a wall, not the other
    // chapter's loaded defence map.
    box(30,.12,30,sand,0,-.18,-5);facade(-3,-12,22,5,0,plaster[0],false,0);fragmentPile(1,-5,2.0);fragmentPile(-3,-7,1.5);
    const fireAnchor=new THREE.Group();fireAnchor.position.set(3,0,-5);group.add(fireAnchor);objects.push(fireAnchor);addFire(fireAnchor,{scale:.65,intensity:.5});addSmoke(fireAnchor,0,0,8,{height:11,spread:.35,persistent:true,intensity:.3});
    lamp(0,1.5,1.3,true);
  }

  const bounds=layout.bounds,spanX=bounds.maxX-bounds.minX,spanZ=bounds.maxZ-bounds.minZ;
  const camp=['military-camp','hangar-apron','base-hospital'].includes(layout.type),extensions=[];
  const groundRoads=layout.roads.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,width:r.width,surface:r.surface})));
  // Finite streets terminate at perpendicular junctions and inhabited blocks.
  for(const r of layout.roads){if(r.points.length<2||Math.hypot(r.points[0][0]-r.points.at(-1)[0],r.points[0][1]-r.points.at(-1)[1])<.1)continue;for(const start of[true,false]){
    const p=start?r.points[0]:r.points.at(-1),q=start?r.points[1]:r.points.at(-2),dx=p[0]-q[0],dz=p[1]-q[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
    const boundary=ux>0?bounds.maxX-p[0]:ux<0?p[0]-bounds.minX:uz>0?bounds.maxZ-p[1]:p[1]-bounds.minZ;
    if(boundary>19)continue;
    const end=[p[0]+ux*(boundary+22),p[1]+uz*(boundary+22)],side=(extensions.length%2?1:-1),turn=[end[0]+uz*side*43,end[1]-ux*side*43],last=[turn[0]+ux*37,turn[1]+uz*37];
    for(const [a,b,width]of[[p,end,r.width],[end,turn,Math.max(7,r.width*.75)],[turn,last,8]])extensions.push({a,b,width,surface:camp?'sand':'road',background:true});
  }}
  groundRoads.push(...extensions);
  const surface=createGroundSurface({layout,roads:groundRoads,add,box,material,palette:{...palette,sand,exposed},stats,routeDistance});
  let missingRuins=layout.enemySpawns.length?Math.max(0,2-layout.buildings.filter(b=>b.ruin).length):0;
  layout.buildings.forEach((b,i)=>{if(missingRuins&&!b.ruin&&!b.interior&&!b.style){building({...b,ruin:true},i);missingRuins--;stats.silhouetteUpgrades=(stats.silhouetteUpgrades||0)+1;}else building(b,i);});
  const convoy=getChapterConvoy(layout);
  [...layout.props,...convoy].forEach((p,i)=>{propElevation=['vehicle','burned','aircraft','wreck','rubble','cockpit'].includes(p.kind)?0:surface.sampleHeight(...p.pos);prop(p,i);propElevation=0;});
  stats.convoyVehicles=convoy.length;
  stats.convoyComposition={humvee:convoy.filter(p=>p.type==='humvee').length,trucks:convoy.filter(p=>p.type==='cargo-truck').length};
  if(layout.chapter===15){
    // The first evacuation bend ends at a residential compound. Its closed
    // entrance makes the east turn readable instead of opening into bare sand.
    const x=-65,z=21.5,y=surface.sampleHeight(x,z);
    for(const side of[-1,1]){box(6.8,1.8,.38,plaster[1],x+side*5.2,y+.9,z);box(6.8,.14,.44,exposed,x+side*5.2,y+1.87,z);box(.48,2.4,.52,exposed,x+side*1.72,y+1.2,z);}
    for(let plank=0;plank<18;plank++)box(.17,2.1,.09,wood,x-1.53+plank*.18,y+1.05,z+.04);
    for(const h of[.35,1.55])box(3.25,.08,.14,rusty,x,y+h,z+.12);
    line([x-1.5,y+.38,z+.14],[x+1.5,y+1.52,z+.14],.035,rusty);obstacle(x,z,17.2,.52);
    fragmentPile(x-6.8,z+1.2,.65);stats.routeTerminations=1;
  }
  createStreetFrontage({layout,add,box,line,curve,material,canvasTexture,palette:{...palette,exposed,brickEdge,sand},rand,obstacle,colliders,routeDistance,safeProp,sampleHeight:surface.sampleHeight,stats});
  dressChapterInterior(layout,{add,box,line,curve,material,canvasTexture,palette:{...palette,exposed,brickEdge,sand},obstacle,colliders,routeDistance,safeProp,sampleHeight:surface.sampleHeight,stats,addInteriorLight({position,color='#e1b982',intensity=16,distance=9}){const light=new THREE.PointLight(color,intensity,distance,2);light.position.set(...position);light.userData.chapterLamp=true;light.userData.interior=true;light.userData.fixtureIntensity=intensity;group.add(light);lights.push(light);nightLights.push(light);}});
  if(layout.enemySpawns.length&&layout.type!=='restricted-cockpit'){
    // Deposits collect against each road edge in uneven pockets. The geometry
    // is ankle-height scenery; the authored route/collision data is unchanged.
    const dustMap=canvasTexture(256,256,(ctx,w,h)=>{
      for(let i=0;i<170;i++){const x=rand(w*.1,w*.9),y=rand(h*.18,h*.82),r=rand(8,55),g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(183,164,133,${rand(.035,.14)})`);g.addColorStop(1,'rgba(183,164,133,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
    });
    const dust=material({map:dustMap,color:'#b9aa91',roughness:1,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3});dust.userData.noShadow=true;
    const soot=dust.clone();soot.color.set('#3d3932');ownedMaterials.add(soot);soot.userData.noShadow=true;
    const paper=material({color:'#b6ad94',roughness:1,side:THREE.DoubleSide});paper.userData.noShadow=true;
    const clear=(x,z,r=.45)=>x>bounds.minX+r&&x<bounds.maxX-r&&z>bounds.minZ+r&&z<bounds.maxZ-r&&routeDistance(x,z)>1.4+r&&![layout.spawn,...layout.taskPositions].some(p=>Math.hypot(x-p[0],z-p[1])<2+r)&&!colliders.some(b=>x>b.minX-.12&&x<b.maxX+.12&&z>b.minZ-.12&&z<b.maxZ+.12);
    let clusters=0;
    for(const def of layout.roads)for(let segment=1;segment<def.points.length;segment++){
      const a=def.points[segment-1],b=def.points[segment],length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
      for(const side of[-1,1])for(let at=rand(1.5,4);at<length;at+=rand(5.2,9.5)){
        if(rnd()<.18)continue;const edge=side*(def.width*.5-rand(.35,1.05)),x=a[0]+dx*at+dz*edge,z=a[1]+dz*at-dx*edge;
        if(!clear(x,z,.8))continue;const yaw=Math.atan2(dx,dz),spread=rand(1.0,2.0);
        const patch=new THREE.PlaneGeometry(rand(3.0,5.5),rand(2.3,3.7),8,6),pv=patch.attributes.position;
        for(let i=0;i<pv.count;i++){const u=pv.getX(i),v=pv.getY(i),xx=x+u*Math.cos(yaw)+v*Math.sin(yaw),zz=z+u*Math.sin(yaw)-v*Math.cos(yaw);pv.setZ(i,surface.sampleHeight(xx,zz)+.009);}
        patch.computeVertexNormals();add(patch,clusters%6===0?soot:dust,[x,0,z],[-PI/2,0,-yaw]);
        for(let k=0;k<24;k++){
          const along=rand(-spread,spread),across=rand(-.65,.65),xx=x+dx*along+dz*across,zz=z+dz*along-dx*across;if(!clear(xx,zz))continue;
          const yy=surface.sampleHeight(xx,zz);
          if(k<17){const size=rand(.07,.28),height=rand(.045,.11),g=new THREE.DodecahedronGeometry(1,0);g.scale(size,height,size*rand(.65,1.3));add(g,k%4?exposed:brickEdge,[xx,yy+height*.65,zz],[rand(-.2,.2),rand(0,PI),rand(-.2,.2)]);}
          else if(k<20)box(rand(.45,1.05),.035,rand(.08,.17),k%2?wood:rusty,xx,yy+.03,zz,yaw+rand(-.9,.9),rand(-.04,.04),rand(-.04,.04));
          else{const g=new THREE.PlaneGeometry(rand(.10,.24),rand(.13,.3),1,1),v=g.attributes.position;v.setZ(0,.025);v.setZ(3,.01);g.computeVertexNormals();add(g,paper,[xx,yy+.018,zz],[-PI/2,0,rand(0,PI)]);}
          stats.looseFragments++;
        }
        clusters++;
      }
    }
    stats.roadsideClusters=clusters;
  }
  if(layout.bounds){
    // The playable footprints remain independent. Dense surrounding quarters
    // are scenery only, extending below aerial cameras rather than ending in
    // a bare plane beyond the last playable house.
    if(layout.type!=='restricted-cockpit')for(const [x,z,w,d]of [[bounds.minX-.3,(bounds.minZ+bounds.maxZ)/2,.5,spanZ+1],[bounds.maxX+.3,(bounds.minZ+bounds.maxZ)/2,.5,spanZ+1],[(bounds.minX+bounds.maxX)/2,bounds.minZ-.3,spanX+1,.5],[(bounds.minX+bounds.maxX)/2,bounds.maxZ+.3,spanX+1,.5]])obstacle(x,z,w,d);
    const outside=(x,z,margin=0)=>x<bounds.minX-margin||x>bounds.maxX+margin||z<bounds.minZ-margin||z>bounds.maxZ+margin;
    const extensionClear=(x,z,r)=>!extensions.some(({a,b,width})=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<width*.5+r;});
    const spacing=camp?27:21,extent=230;
    let backgroundBuildings=0;
    for(let gx=-extent;gx<=extent;gx+=spacing)for(let gz=-extent;gz<=extent;gz+=spacing){
      const x=gx+rand(-1.3,1.3),z=gz+rand(-1.3,1.3),w=camp?rand(13,20):rand(12,17),d=camp?rand(10,18):rand(11,17);
      if(!outside(x,z,Math.max(w,d)/2+3)||!extensionClear(x,z,Math.max(w,d)/2))continue;
      const h=camp?rand(3.2,5.8):3.1*(2+Math.floor(rnd()*3)),m=camp?green:plaster[backgroundBuildings%plaster.length];
      const damaged=!camp&&layout.enemySpawns.length&&backgroundBuildings%4===0&&Math.hypot(x,z)<175;
      if(damaged){
        const lower=h-3.1;box(w,lower,d,m,x,lower*.5,z);box(w*.51,3.1,d,m,x-w*.245,lower+1.55,z);box(w*.51+.15,.18,d+.15,concrete,x-w*.245,h+.09,z);
        box(w*.49,.22,d*.45,exposed,x+w*.255,lower+.06,z-d*.27);box(w*.30,.24,d*.43,exposed,x+w*.31,lower-1.25,z+d*.18,0,.19,-.16);
        for(let n=0;n<4;n++){const zz=z-d*.36+n*d*.23;box(.25,rand(.35,1.2),.32,brickEdge,x+w*.5,lower+.28,zz);line([x+w*.03,lower+.2,zz],[x+w*.22,lower+.5,zz+.12],.014,rusty);}
        stats.backgroundDamaged=(stats.backgroundDamaged||0)+1;
      }else{box(w,h,d,m,x,h/2,z);box(w+.23,.18,d+.23,concrete,x,h+.09,z);}
      // Dark inset window rows and cornices establish metre-scale facades in
      // a few material batches; no per-building meshes or texture allocations.
      for(let floor=0;floor<Math.floor(h/3.1);floor++)for(let bay=0;bay<Math.floor(w/3);bay++)for(const side of[-1,1]){
        const xx=x-w/2+1.5+bay*3,zz=z+side*(d/2+.025),rotation=[0,side<0?PI:0,0];
        if(damaged&&floor===Math.floor(h/3.1)-1&&xx>x-w*.03)continue;
        add(new THREE.PlaneGeometry(1.02,1.44),dark,[xx,1.8+floor*3.1,zz],rotation);add(new THREE.PlaneGeometry(1.18,.07),trim,[xx,1.04+floor*3.1,zz+.005*side],rotation);
      }
      for(let floor=0;floor<Math.floor(h/3.1);floor++)for(let bay=0;bay<Math.floor(d/3.2);bay++)for(const side of[-1,1])if(!(damaged&&side===1&&floor===Math.floor(h/3.1)-1))add(new THREE.PlaneGeometry(1,1.4),dark,[x+side*(w/2+.025),1.8+floor*3.1,z-d/2+1.5+bay*3.2],[0,side*PI/2,0]);
      if(backgroundBuildings%3===0){box(w*.4,.8,.25,concrete,x-w*.25,h+.5,z+d*.45);box(1.3,.95,1.2,concrete,x+(damaged?-w*.26:w*.26),h+.57,z-d*.27);line([x-w*.2,h,z],[x-w*.2,h+2.3,z],.018,metal);}
      if(!camp&&Math.hypot(x,z)<165){
        // The first outer quarters have lived-in frontage and enclosed yards,
        // not just a row of facade cards above an empty strip of sand.
        let nearest=null,best=Infinity;
        for(const street of groundRoads){const dx=street.b[0]-street.a[0],dz=street.b[1]-street.a[1],t=THREE.MathUtils.clamp(((x-street.a[0])*dx+(z-street.a[1])*dz)/(dx*dx+dz*dz),0,1),px=street.a[0]+t*dx,pz=street.a[1]+t*dz,dist=Math.hypot(px-x,pz-z);if(dist<best){best=dist;nearest=[px,pz];}}
        if(nearest&&best<39){
          const vx=nearest[0]-x,vz=nearest[1]-z,nx=Math.abs(vx)>Math.abs(vz)?Math.sign(vx):0,nz=nx?0:Math.sign(vz),tx=nz,tz=-nx,face=nx?w/2:d/2,length=nx?d:w,fx=x+nx*(face+.04),fz=z+nz*(face+.04),yaw=Math.atan2(nx,nz);
          box(1.5,2.35,.065,wood,fx,1.175,fz,yaw);for(const side of[-1,1])box(.12,2.48,.16,trim,fx+tx*side*.81,1.24,fz+tz*side*.81,yaw);box(1.76,.13,.16,trim,fx,2.48,fz,yaw);
          if(backgroundBuildings%3!==0){
            box(length*.46,.045,1.8,cloth,fx+nx*.85,2.65,fz+nz*.85,yaw,-.1);
            for(const side of[-1,1])line([fx+tx*side*length*.22+nx*1.65,0,fz+tz*side*length*.22+nz*1.65],[fx+tx*side*length*.22+nx*1.65,2.5,fz+tz*side*length*.22+nz*1.65],.024,wood);
          }
          for(const side of[-1,1]){
            const wx=fx+nx*2.8+tx*side*length*.31,wz=fz+nz*2.8+tz*side*length*.31;
            if(extensionClear(wx,wz,length*.17)){box(length*.34,.85,.28,plaster[(backgroundBuildings+1)%3],wx,.425,wz,yaw);box(length*.34,.09,.34,concrete,wx,.89,wz,yaw);}
            const xx=fx+tx*side*(length*.5-.4),zz=fz+tz*side*(length*.5-.4);if(extensionClear(xx+nx*1.3,zz+nz*1.3,.4))box(.28,1.1,2.6,plaster[(backgroundBuildings+1)%3],xx+nx*1.3,.55,zz+nz*1.3,yaw);
          }
          if(backgroundBuildings%5===0){for(let j=0;j<3;j++)add(new THREE.CylinderGeometry(.28,.31,.8,10),rusty,[fx+tx*(2+j*.7)+nx*.6,.4,fz+tz*(2+j*.7)+nz*.6]);}
          stats.backgroundFrontages=(stats.backgroundFrontages||0)+1;
        }
      }
      backgroundBuildings++;
    }
    stats.backgroundBuildings=backgroundBuildings;
    if(!camp){let parked=0;for(let i=0;i<extensions.length;i++){
      const r=extensions[i],dx=r.b[0]-r.a[0],dz=r.b[1]-r.a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
      let previous=null;for(let t=7;t<length;t+=21){
        const x=r.a[0]+ux*t+uz*(r.width*.5+1.6),z=r.a[1]+uz*t-ux*(r.width*.5+1.6);if(!outside(x,z,4))continue;
        line([x,0,z],[x+.09,5.8,z],.065,wood);line([x-.5,5.4,z],[x+.6,5.4,z],.025,metal);
        if(previous)for(const off of[-.24,0,.24])curve([[previous[0]+off,5.4,previous[1]],[(previous[0]+x)/2+off,4.95,(previous[1]+z)/2],[x+off,5.4,z]],.009,dark);
        previous=[x,z];
      }
      if(i%3===1&&parked<4){const t=length*.55,x=r.a[0]+ux*t+uz*(r.width*.5-1),z=r.a[1]+uz*t-ux*(r.width*.5-1);if(outside(x,z,10)){const car=makeVehicle({burned:true,medical:false});car.userData.chapterPropKind='background-vehicle';placeObject(car,x,z,Math.atan2(ux,uz)+.1,false);parked++;}}
      if(i%3===2){const x=r.b[0],z=r.b[1];for(const off of[-2.4,2.4])box(1.5,.64,.7,exposed,x+uz*off,.32,z-ux*off,Math.atan2(ux,uz)+.13);}
    }stats.backgroundVehicles=parked;}
    if(camp){
      // Camp perimeter walls stop only at authored vehicle exits.
      for(const [x,z,w,d]of [[bounds.minX-2,0,.3,spanZ+4],[bounds.maxX+2,0,.3,spanZ+4],[0,bounds.minZ-2,spanX+4,.3],[0,bounds.maxZ+2,spanX+4,.3]]){
        const horizontal=w>d,length=horizontal?w:d;
        for(let n=0;n<length;n+=3){const xx=x+(horizontal?n-length/2:0),zz=z+(horizontal?0:n-length/2);if(extensionClear(xx,zz,1.6))box(horizontal?2.9:.3,2.1,horizontal?.3:2.9,concrete,xx,1.05,zz);}
      }
    }
    if(layout.enemySpawns.length){const haze=new THREE.Group();haze.position.set(bounds.maxX+9,0,bounds.minZ-7);group.add(haze);objects.push(haze);addSmoke(haze,0,0,12,{height:30,spread:.8,persistent:true,intensity:.38});}
  }
  for(const [mat,parts]of batches){
    const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!geometry)throw new Error(`Cannot merge chapter material ${mat.name||mat.uuid}`);
    geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=!mat.userData.noShadow;mesh.receiveShadow=true;mesh.name=`${layout.id}:batch`;group.add(mesh);stats.drawCalls++;stats.triangles+=geometry.attributes.position.count/3;
  }
  batches.clear();group.name=`chapter:${layout.id}`;group.updateMatrixWorld(true);
  const state={id:layout.id,chapter:layout.chapter,name:layout.name,type:layout.type,bounds:{...layout.bounds},bound:layout.bound,spawn:[...layout.spawn],route:structuredClone(layout.route),taskPositions:structuredClone(layout.taskPositions),landmarks:structuredClone(layout.landmarks),colliderCount:colliders.length,...stats};
  return {state,objects,surface,dispose(){
    if(disposed)return;disposed=true;
    for(const object of objects)destroyObject(object);
    for(const light of lights){const i=nightLights.indexOf(light);if(i!==-1)nightLights.splice(i,1);light.dispose();light.removeFromParent();}
    const geometries=new Set();group.traverse(o=>{if(o.geometry&&!o.userData.sharedGeometry)geometries.add(o.geometry);});for(const g of geometries)g.dispose();
    for(const m of ownedMaterials)m.dispose();for(const t of ownedTextures)t.dispose();group.clear();
  }};
}
