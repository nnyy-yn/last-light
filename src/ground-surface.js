import * as THREE from 'three';

// One continuous height field owns asphalt, damaged edges, shoulders and soil.
// There is no flat underlay intersecting depressions and no overlay road quad.
export function createGroundSurface({layout,roads,add,box,material,palette,stats,routeDistance}){
  const camp=['military-camp','hangar-apron','base-hospital'].includes(layout.type);
  const flat=camp||layout.type==='interior-triage'||layout.type==='restricted-cockpit';
  const clamp=THREE.MathUtils.clamp,smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const noise=(x,z)=>Math.sin(x*.37+z*.11)*Math.cos(z*.29-x*.07)*.5+Math.sin(x*1.13-z*.63)*.22;
  const segments=roads.map((r,i)=>{const dx=r.b[0]-r.a[0],dz=r.b[1]-r.a[1],length=Math.hypot(dx,dz);return{...r,dx:dx/length,dz:dz/length,length,seed:i*2.71+layout.chapter};}).filter(s=>s.length>.01);
  const pits=[];
  if(!flat)for(const r of segments){if(r.surface==='sand')continue;for(let n=14;n<r.length-5;n+=27){
    const side=Math.sin(n+r.seed)>0?1:-1,across=side*Math.min(r.width*.33,3.1),x=r.a[0]+r.dx*n+r.dz*across,z=r.a[1]+r.dz*n-r.dx*across;
    if(routeDistance(x,z)>1.8&&!layout.taskPositions.some(p=>Math.hypot(x-p[0],z-p[1])<2))pits.push({x,z,rx:1.0+(n%3)*.17,rz:1.2+(n%4)*.13});
  }}
  let nearIndex=-1,nearAcross=0,nearAlong=0;
  function roadDistance(x,z){let best=1e9;nearIndex=-1;for(let i=0;i<segments.length;i++){
    const r=segments[i],xx=x-r.a[0],zz=z-r.a[1],along=xx*r.dx+zz*r.dz,across=xx*r.dz-zz*r.dx;
    const edge=r.width*.5+(flat?0:noise(x*.8,z*.8)*.68),d=Math.max(Math.abs(across)-edge,-along-edge,along-r.length-edge);
    if(d<best){best=d;nearIndex=i;nearAcross=across;nearAlong=along;}
  }return best;}
  function interiorFade(x,z){let f=1;for(const b of layout.buildings){const d=Math.max(Math.abs(x-b.x)-b.w*.5,Math.abs(z-b.z)-b.d*.5);if(d<1.2)f=Math.min(f,smooth(.08,1.2,d));}return f;}
  function fieldHeight(x,z){
    if(flat)return 0;
    const distance=roadDistance(x,z),r=segments[nearIndex],across=nearAcross,along=nearAlong;
    let y=.022*Math.sin(x*.19)*Math.cos(z*.17)+.014*Math.sin(x*.41+z*.33);
    if(r&&distance<0){
      const crown=.027*(1-clamp(Math.abs(across)/(r.width*.5),0,1)**2);
      const track=Math.exp(-(((Math.abs(across)-1.65)/.34)**2))*(.016+.012*Math.sin(along*.4+r.seed));
      y+=crown-track+.012*Math.sin(x*.87+z*.43);
    }else if(distance<4.2){
      const channel=-.15*Math.exp(-(((distance-.68)/.38)**2));
      const bank=.29*Math.exp(-(((distance-1.95)/.95)**2))*(.72+.28*Math.sin(x*.8+z*.49));
      const clear=clamp((routeDistance(x,z)-1.2)/1.4,0,1);y+=(channel+bank)*clear;
    }
    for(const p of pits){if(Math.abs(x-p.x)>p.rx*1.5||Math.abs(z-p.z)>p.rz*1.5)continue;const q=Math.hypot((x-p.x)/p.rx,(z-p.z)/p.rz);if(q<1.5)y+=-.18*(1-smooth(.12,1,q))+.045*Math.exp(-(((q-.99)/.17)**2));}
    const bounds=layout.bounds,outside=Math.max(bounds.minX-x,x-bounds.maxX,bounds.minZ-z,z-bounds.maxZ,0);
    return y*interiorFade(x,z)*(1-smooth(8,18,outside));
  }
  function sampleHeight(x,z){
    if(flat||x<-300||x>=300||z<-300||z>=300)return 0;
    const tx=Math.floor(x/20)*20,tz=Math.floor(z/20)*20,b=layout.bounds,near=tx<b.maxX+18&&tx+20>b.minX-18&&tz<b.maxZ+18&&tz+20>b.minZ-18,step=20/(near?24:5);
    const ix=Math.min((near?24:5)-1,Math.floor((x-tx)/step)),iz=Math.min((near?24:5)-1,Math.floor((z-tz)/step)),xx=tx+ix*step,zz=tz+iz*step,u=(x-xx)/step,v=(z-zz)/step;
    const a=fieldHeight(xx,zz),c=fieldHeight(xx,zz+step),d=fieldHeight(xx+step,zz),e=fieldHeight(xx+step,zz+step);
    return u+v<=1?a+(d-a)*u+(c-a)*v:e+(c-e)*(1-u)+(d-e)*(1-v);
  }
  const pbr=(source,color)=>{const options={color,roughness:1,vertexColors:true};for(const key of['map','normalMap','roughnessMap','aoMap','metalnessMap'])if(source[key])options[key]=source[key];return options;};
  const mats={
    asphalt:material(pbr(palette.road,'#ffffff')),
    concrete:material(pbr(palette.concrete,'#b5b0a0')),
  };
  // Only copy texture/PBR channels: spreading a Material contains internal IDs
  // and event dispatch state, neither of which belongs to a new instance.
  const sourceFor={asphalt:palette.road,concrete:palette.concrete};
  for(const [name,m]of Object.entries(mats)){const s=sourceFor[name];for(const key of['map','normalMap','roughnessMap','aoMap','metalnessMap'])m[key]=s[key]||null;m.normalScale.copy(s.normalScale||new THREE.Vector2(.5,.5));m.name='ground:'+name;}
  // PBR albedo and normal maps blend on the actual continuous surface. A cell
  // is never replaced by a rectangular gravel tile at a pothole or shoulder.
  mats.asphalt.onBeforeCompile=shader=>{
    shader.uniforms.groundSoilMap={value:palette.sand.map};shader.uniforms.groundSoilNormal={value:palette.sand.normalMap};
    shader.uniforms.groundRoadTint={value:new THREE.Color('#aaa69c')};shader.uniforms.groundSoilTint={value:new THREE.Color('#b6a98c')};
    shader.vertexShader='attribute float groundBlend; varying float vGroundBlend;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundBlend=groundBlend;');
    shader.fragmentShader='uniform sampler2D groundSoilMap; uniform sampler2D groundSoilNormal; uniform vec3 groundRoadTint; uniform vec3 groundSoilTint; varying float vGroundBlend;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      vec4 roadTexel=texture2D(map,vMapUv);vec4 soilTexel=texture2D(groundSoilMap,vMapUv);
      diffuseColor*=vec4(mix(roadTexel.rgb*groundRoadTint,soilTexel.rgb*groundSoilTint,clamp(vGroundBlend,0.0,1.0)),1.0);
    #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv ).xyz','mix(texture2D(normalMap,vNormalMapUv).xyz,texture2D(groundSoilNormal,vNormalMapUv).xyz,clamp(vGroundBlend,0.0,1.0))'));
  };
  mats.asphalt.customProgramCacheKey=()=> 'chapter-continuous-ground-v2';
  const meshData=new Map(Object.values(mats).map(m=>[m,{position:[],normal:[],uv:[],color:[],groundBlend:[]}]))
  function pickMaterial(x,z){const d=roadDistance(x,z),r=segments[nearIndex];
    if(r&&d<0&&r.surface==='concrete')return mats.concrete;
    const p=layout.plaza;if(p&&Math.abs(x-p.x)<p.w*.5&&Math.abs(z-p.z)<p.d*.5)return mats.concrete;
    return mats.asphalt;
  }
  function vertex(data,x,z,y){
    const eps=.12,nx=fieldHeight(x-eps,z)-fieldHeight(x+eps,z),nz=fieldHeight(x,z-eps)-fieldHeight(x,z+eps),length=Math.hypot(nx,2*eps,nz);
    data.position.push(x,y,z);data.normal.push(nx/length,2*eps/length,nz/length);data.uv.push(x/3.3,z/3.3);
    const d=roadDistance(x,z),r=segments[nearIndex];data.groundBlend.push(!r||r.surface==='sand'?1:smooth(-.8,.95,d));
    let shade=clamp(.94+noise(x*.32,z*.32)*.09+noise(x*1.7,z*1.7)*.035,.78,1.03);
    if(r?.surface==='sand'&&d<0)shade*=.88;
    if(!flat&&d>0&&d<1.7)shade*=.72+.28*Math.abs((d-.7)/1.0);
    for(const p of pits){if(Math.abs(x-p.x)>p.rx*1.3||Math.abs(z-p.z)>p.rz*1.3)continue;const q=Math.hypot((x-p.x)/p.rx,(z-p.z)/p.rz);if(q<1.2)shade*=.59+.41*smooth(.24,1.2,q);}
    data.color.push(shade,shade,shade*.985);
  }
  let triangles=0,min=1e9,max=-1e9,minPosition=null,maxPosition=null;
  // 20m tiles use metre-scale near geometry and 4m distant terrain. Matching
  // boundary samples keep coarse/fine tile transitions continuous.
  const bound=layout.bounds,pad=18;
  for(let tx=-300;tx<300;tx+=20)for(let tz=-300;tz<300;tz+=20){
    const near=tx<bound.maxX+pad&&tx+20>bound.minX-pad&&tz<bound.maxZ+pad&&tz+20>bound.minZ-pad;
    const divisions=near?24:5,step=20/divisions;
    for(let ix=0;ix<divisions;ix++)for(let iz=0;iz<divisions;iz++){
      const x=tx+ix*step,z=tz+iz*step,cx=x+step*.5,cz=z+step*.5;
      if(layout.buildings.some(b=>Math.abs(cx-b.x)<b.w*.5-.3&&Math.abs(cz-b.z)<b.d*.5-.3))continue;
      const d=meshData.get(pickMaterial(cx,cz)),a=fieldHeight(x,z),b=fieldHeight(x+step,z),c=fieldHeight(x,z+step),e=fieldHeight(x+step,z+step);
      vertex(d,x,z,a);vertex(d,x,z+step,c);vertex(d,x+step,z,b);vertex(d,x+step,z,b);vertex(d,x,z+step,c);vertex(d,x+step,z+step,e);
      for(const point of[[x,a,z],[x+step,b,z],[x,c,z+step],[x+step,e,z+step]]){if(point[1]<min){min=point[1];minPosition=point;}if(point[1]>max){max=point[1];maxPosition=point;}}triangles+=2;
    }
  }
  for(const [m,d]of meshData){if(!d.position.length)continue;const g=new THREE.BufferGeometry();for(const name of['position','normal','uv','color','groundBlend'])g.setAttribute(name,new THREE.Float32BufferAttribute(d[name],name==='uv'?2:name==='groundBlend'?1:3));add(g,m);}
  let brokenAsphalt=0;
  for(const [index,p]of pits.entries())for(let n=0;n<22;n++){
    if(Math.sin(n*2.71+index)>.66)continue;
    const a=n/22*Math.PI*2+Math.sin(n*1.7)*.13,r=.81+Math.sin(n*4.3+index)*.28,x=p.x+Math.cos(a)*p.rx*r,z=p.z+Math.sin(a)*p.rz*r,y=sampleHeight(x,z);
    const chip=new THREE.DodecahedronGeometry(1,0);chip.scale(.06+Math.abs(Math.sin(n))*.13,.014,.05+Math.abs(Math.cos(n*2))*.12);add(chip,n%5===0?palette.exposed:palette.road,[x,y+.016,z],[.08*Math.sin(n),a+.4,.08*Math.cos(n)]);brokenAsphalt++;
  }
  let brokenCurbs=0,drainGrates=0;
  if(!flat)for(const r of segments){if(r.surface==='sand'||r.background)continue;for(const side of[-1,1])for(let t=1.5;t<r.length-1;t+=2.7){
    if(Math.sin(t*.81+r.seed)>.45)continue;const x=r.a[0]+r.dx*t+r.dz*side*(r.width*.5+.05),z=r.a[1]+r.dz*t-r.dx*side*(r.width*.5+.05);
    if(routeDistance(x,z)<2.0||layout.buildings.some(b=>Math.abs(x-b.x)<b.w*.5+.2&&Math.abs(z-b.z)<b.d*.5+.2))continue;
    roadDistance(x,z);if(segments[nearIndex]!==r)continue;
    const yaw=Math.atan2(r.dx,r.dz),length=1.25+Math.abs(Math.sin(t))*1.05;
    box(.24,.13,length,palette.exposed,x,sampleHeight(x,z)+.065,z,yaw,.018*Math.sin(t),.04*Math.cos(t));brokenCurbs++;
    if(brokenCurbs%11===0){const xx=x+r.dz*side*.65,zz=z-r.dx*side*.65,y=sampleHeight(xx,zz)+.04;for(let bar=0;bar<7;bar++)box(.65,.035,.045,palette.metal,xx+r.dx*(bar-3)*.12,y,zz+r.dz*(bar-3)*.12,yaw);drainGrates++;}
  }}
  stats.groundSurface={triangles,materialBatches:Object.keys(mats).length,potholes:pits.length,brokenAsphalt,brokenCurbs,drainGrates,minHeight:min,maxHeight:max,minPosition,maxPosition,continuous:true};
  return{sampleHeight,pits,segments};
}
