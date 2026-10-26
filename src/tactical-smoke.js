import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const CAPACITY=2,PUFFS=68,LIFETIME=18;
const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);
const point=value=>Array.isArray(value)?{x:value[0],y:value.length===2?1.35:value[1],z:value.length===2?value[1]:value[2]}:{x:value?.x,y:value?.y??1.35,z:value?.z};
const NOISE=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.56+noise(p*2.03+7.1)*.28+noise(p*4.09-3.7)*.16;}`;

export function createTacticalSmoke(scene){
  const count=CAPACITY*PUFFS,plane=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();
  geometry.index=plane.index.clone();for(const[k,a]of Object.entries(plane.attributes))geometry.setAttribute(k,a.clone());plane.dispose();
  const offsets=new THREE.InstancedBufferAttribute(new Float32Array(count*3),3),shapes=new THREE.InstancedBufferAttribute(new Float32Array(count*4),4);
  offsets.setUsage(THREE.DynamicDrawUsage);shapes.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('aOffset',offsets);geometry.setAttribute('aShape',shapes);geometry.instanceCount=0;
  const material=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,fog:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:{value:0},uLighting:{value:new THREE.Vector3(1,1,1)}}]),
    vertexShader:`attribute vec3 aOffset;attribute vec4 aShape;varying vec2 vUv;varying float vAlpha;varying float vSeed;varying float vDepth;
    #include <fog_pars_vertex>
    void main(){vUv=uv;vAlpha=aShape.z;vSeed=aShape.w;vec4 mvPosition=modelViewMatrix*vec4(aOffset,1.);vDepth=-mvPosition.z;mvPosition.xy+=position.xy*aShape.xy;gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
    }`,
    fragmentShader:`uniform float uTime;uniform vec3 uLighting;varying vec2 vUv;varying float vAlpha;varying float vSeed;varying float vDepth;${NOISE}
    #include <fog_pars_fragment>
    void main(){vec2 p=vUv-.5;float drift=uTime*.045;float n=fbm(vUv*4.2+vec2(vSeed,drift));float warp=fbm(vUv*7.1+vec2(-drift,vSeed*.7));
    float edge=1.-smoothstep(.18,.50,length(p)+(n-.5)*.14);float density=edge*(.47+n*.53)*(.82+warp*.18);
    float nearFade=smoothstep(.25,1.15,vDepth);float alpha=clamp(density*vAlpha*nearFade,0.,.78);if(alpha<.004)discard;
    float volume=clamp(1.-length(p*1.6),0.,1.);vec3 dark=vec3(.23,.24,.22),light=vec3(.56,.56,.50);vec3 color=mix(dark,light,.28+volume*.26+n*.22+vUv.y*.10);
    gl_FragColor=vec4(color*uLighting,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    }`});
  const smoke=new THREE.Mesh(geometry,material);smoke.name='tactical smoke sorted volume puffs';smoke.frustumCulled=false;
  // Wall soot is a transparent decal batch. Draw smoke afterwards so a distant
  // black decal cannot paint over a nearer cloud; opaque depth still occludes it.
  // Reserve a layer above world smoke (10+), without re-sorting its emitters.
  smoke.renderOrder=100;scene.add(smoke);
  const body=new THREE.CylinderGeometry(.061,.065,.215,12),lid=new THREE.CylinderGeometry(.067,.067,.017,12),ring=new THREE.TorusGeometry(.034,.006,4,10);lid.translate(0,.108,0);ring.rotateX(PI/2);ring.translate(0,.132,0);
  const canisterGeometry=mergeGeometries([body,lid,ring]),canisterMaterial=new THREE.MeshStandardMaterial({color:'#626750',metalness:.45,roughness:.72});body.dispose();lid.dispose();ring.dispose();
  const cans=new THREE.InstancedMesh(canisterGeometry,canisterMaterial,CAPACITY);cans.name='deployed smoke canisters';cans.frustumCulled=false;cans.count=0;scene.add(cans);
  const clouds=[],particles=Array.from({length:count},()=>({p:new THREE.Vector3(),w:0,h:0,alpha:0,seed:0,distance:0})),cameraPosition=new THREE.Vector3(),dummy=new THREE.Object3D();
  let time=0,nextId=1,disposed=false,mood='day';
  function setMood(value){mood=['day','dusk','night','dawn'].includes(value)?value:'day';material.uniforms.uLighting.value.set(...({day:[1,1,1],dusk:[.48,.39,.30],night:[.065,.085,.12],dawn:[.50,.57,.65]}[mood]));}
  function parameters(c){
    const grow=smooth(0,3.2,c.age),fade=1-smooth(13.5,LIFETIME,c.age);
    c.radius=.28+3.72*grow;c.height=.7+2.35*grow;c.density=smooth(.2,2.0,c.age)*fade;
    c.center={x:c.position.x+Math.min(c.age,13)*.045,y:c.position.y+c.height*.47,z:c.position.z+Math.min(c.age,13)*.018};
  }
  function deploy(position){
    if(disposed||clouds.length>=CAPACITY)return false;
    const p=point(position);if(Array.isArray(position)&&position.length===2||!Array.isArray(position)&&position?.y===undefined)p.y=0;if(![p.x,p.y,p.z].every(Number.isFinite))return false;
    const c={id:nextId++,position:{x:p.x,y:p.y,z:p.z},age:0,radius:0,height:0,density:0};parameters(c);clouds.push(c);return{id:c.id,position:{...c.position}};
  }
  function update(dt,camera){
    if(disposed)return;const delta=Number.isFinite(dt)?Math.max(0,dt):0;time+=delta;
    for(let i=clouds.length-1;i>=0;i--){clouds[i].age+=delta;if(clouds[i].age>=LIFETIME)clouds.splice(i,1);else parameters(clouds[i]);}
    if(camera)camera.getWorldPosition(cameraPosition);let used=0;
    clouds.forEach((c,slot)=>{
      dummy.position.set(c.position.x,c.position.y+.11,c.position.z);dummy.rotation.set(.10,c.id*.61,.08);dummy.scale.set(1,1,1);dummy.updateMatrix();cans.setMatrixAt(slot,dummy.matrix);
      for(let i=0;i<PUFFS;i++){
        const p=particles[used++],phase=(c.age*.17+i*.61803398875)%1,angle=i*2.39996323+c.id*.7,jet=i<12;
        const r=jet?.15+.35*phase:c.radius*(.10+.77*Math.sqrt(((i*17)%53)/53));
        const swirl=Math.sin(c.age*.25+i)*.13;
        p.p.set(c.center.x+Math.cos(angle+swirl)*r,c.position.y+(jet?.16+phase*1.65:.38+((i*13)%29)/29*(c.height-.5)),c.center.z+Math.sin(angle+swirl)*r);
        p.w=jet?.32+phase*.75:(1.65+c.radius*.27)*(1+.13*Math.sin(i));p.h=jet?.45+phase*.9:1.2+c.height*.33;
        const pulse=jet?Math.sin(phase*Math.PI):.8+.2*Math.sin(phase*Math.PI);
        p.alpha=c.density*(jet?.48:.86)*pulse;p.seed=i*.731+c.id*4.7;p.distance=p.p.distanceToSquared(cameraPosition);
      }
    });
    const sorted=particles.slice(0,used).sort((a,b)=>b.distance-a.distance);
    sorted.forEach((p,i)=>{offsets.setXYZ(i,...p.p.toArray());shapes.setXYZW(i,p.w,p.h,p.alpha,p.seed);});geometry.instanceCount=used;cans.count=clouds.length;smoke.visible=used>0;cans.visible=clouds.length>0;
    offsets.needsUpdate=shapes.needsUpdate=cans.instanceMatrix.needsUpdate=true;material.uniforms.uTime.value=time;
  }
  function obscures(from,to){
    const a=point(from),b=point(to);if(![a.x,a.y,a.z,b.x,b.y,b.z].every(Number.isFinite))return false;
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=Math.hypot(dx,dy,dz);if(length<.001)return false;
    let opticalDepth=0;
    for(const c of clouds){
      if(c.density<.02)continue;
      const rx=c.radius,ry=c.height*.5,ax=(a.x-c.center.x)/rx,ay=(a.y-c.center.y)/ry,az=(a.z-c.center.z)/rx,vx=dx/rx,vy=dy/ry,vz=dz/rx;
      const A=vx*vx+vy*vy+vz*vz,B=2*(ax*vx+ay*vy+az*vz),C=ax*ax+ay*ay+az*az-1,D=B*B-4*A*C;if(D<=0)continue;
      const t0=Math.max(0,(-B-Math.sqrt(D))/(2*A)),t1=Math.min(1,(-B+Math.sqrt(D))/(2*A));if(t1<=t0)continue;
      // Short tangential grazes remain visible; independent clouds accumulate.
      opticalDepth+=(t1-t0)*length*c.density*.65;if(opticalDepth>=1.15)return true;
    }return false;
  }
  function reset(){clouds.length=0;time=0;geometry.instanceCount=0;cans.count=0;smoke.visible=cans.visible=false;material.uniforms.uTime.value=0;}
  function inspect(){return{time,mood,capacity:CAPACITY,active:clouds.length,particleCapacity:count,particles:geometry.instanceCount,lifetime:LIFETIME,drawCalls:clouds.length?2:0,clouds:clouds.map(c=>({id:c.id,age:c.age,radius:c.radius,height:c.height,density:c.density,position:{...c.position},center:{...c.center}}))};}
  function dispose(){if(disposed)return;reset();disposed=true;smoke.removeFromParent();cans.removeFromParent();if(!cans.userData.instanceBuffersDisposed){cans.dispose();cans.userData.instanceBuffersDisposed=true;}geometry.dispose();material.dispose();canisterGeometry.dispose();canisterMaterial.dispose();}
  reset();return{deploy,update,obscures,setMood,reset,inspect,dispose};
}
const PI=Math.PI;
