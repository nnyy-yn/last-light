import * as THREE from 'three';

// Two instanced flame layers and one spark/ash cloud; no opaque flame balls or
// hard-edged texture cards. Smoke is supplied by the world's soot emitter.
const noiseGLSL=`
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise21(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float n=0.,w=.55;for(int i=0;i<4;i++){n+=noise21(p)*w;p=p*2.07+vec2(7.1,4.7);w*=.5;}return n;}`;
const flameVertex=`
attribute vec3 aOffset;attribute vec4 aShape;attribute vec2 aLife;
varying vec2 vUv;varying float vSeed;varying float vOpacity;varying float vAge;
void main(){vUv=uv;vSeed=aShape.w;vOpacity=aShape.z;vAge=aLife.x;
vec4 center=modelViewMatrix*vec4(aOffset,1.);vec2 p=position.xy;
p.x+=sin(p.y*2.8+aShape.w)*.10*p.y;center.xy+=vec2(p.x*aShape.x,p.y*aShape.y);
gl_Position=projectionMatrix*center;}`;
const flameFragment=`
uniform float uTime;uniform float uCore;varying vec2 vUv;varying float vSeed;varying float vOpacity;varying float vAge;
${noiseGLSL}
void main(){
vec2 uv=vUv;float t=uTime*(1.45+fract(vSeed)*.8);float y=uv.y;
float flow=fbm(vec2(uv.x*3.8+vSeed,y*4.2-t*1.6));
float bend=(noise21(vec2(y*3.-t*.8,vSeed))-.5)*.34*y;
float x=abs(uv.x-.5+bend);float width=(.42*(1.-pow(y,.7))+.035)*( .72+flow*.60);
float edge=1.-smoothstep(width*.34,width+.035,x);
float tongues=fbm(vec2(uv.x*7.+vSeed,y*6.-t*2.5));
float cap=1.-smoothstep(.48+flow*.28,.98,y);
float floorFade=smoothstep(0.,.22,y);
float density=edge*cap*floorFade*(.46+flow*.52);
density*=smoothstep(.10,.42,tongues+(1.-y)*.24);
float opacity=clamp(density*vOpacity,0.,.96);if(opacity<.008)discard;
float heat=clamp((1.-x/max(width,.02))*.50+(1.-y)*.55+flow*.18+uCore*.16,0.,1.);
vec3 red=vec3(1.15,.018,.001),orange=vec3(2.8,.17,.003),yellow=vec3(4.8,1.15,.018),white=vec3(5.8,2.9,.24);
vec3 color=mix(red,orange,smoothstep(.10,.62,heat));color=mix(color,yellow,smoothstep(.68,.99,heat));color=mix(color,white,smoothstep(.94,1.,heat)*uCore*.38);
gl_FragColor=vec4(color,opacity);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const sparkVertex=`
attribute float aSize;attribute float aAlpha;attribute float aTone;uniform float uPointScale;
varying float vAlpha;varying float vTone;
void main(){vAlpha=aAlpha;vTone=aTone;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(aSize*uPointScale/max(1.,-p.z),1.,10.);}`;
const sparkFragment=`
varying float vAlpha;varying float vTone;
void main(){vec2 p=gl_PointCoord*2.-1.;float falloff=1.-smoothstep(.16,1.,dot(p,p));if(falloff*vAlpha<.008)discard;
vec3 color=mix(vec3(.09,.075,.06),vec3(5.8,1.3,.08),vTone);gl_FragColor=vec4(color,falloff*vAlpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

function flameLayer(count,core){
  const plane=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();
  geometry.index=plane.index.clone();for(const[key,value]of Object.entries(plane.attributes))geometry.setAttribute(key,value.clone());plane.dispose();
  const offsets=new THREE.InstancedBufferAttribute(new Float32Array(count*3),3),shapes=new THREE.InstancedBufferAttribute(new Float32Array(count*4),4),lives=new THREE.InstancedBufferAttribute(new Float32Array(count*2),2);
  for(const a of[offsets,shapes,lives])a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aOffset',offsets);geometry.setAttribute('aShape',shapes);geometry.setAttribute('aLife',lives);geometry.instanceCount=count;
  const material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uCore:{value:core?1:0}},vertexShader:flameVertex,fragmentShader:flameFragment,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,forceSinglePass:true});
  const object=new THREE.Mesh(geometry,material);object.frustumCulled=false;object.renderOrder=core?6:5;
  const particles=Array.from({length:count},(_,i)=>({index:i,phase:i/count,seed:(i*2.39996)%6.28318,position:new THREE.Vector3(),world:new THREE.Vector3(),distance:0,age:0,width:0,height:0,alpha:0}));
  return{object,geometry,material,offsets,shapes,lives,particles,core};
}

export function createFire(parent,{position=[0,0,0],scale=1,intensity=1}={}){
  const root=new THREE.Group();root.name='layered vehicle fire';root.position.set(...position);parent.add(root);
  const layers=[flameLayer(22,false),flameLayer(8,true)];layers.forEach(layer=>root.add(layer.object));
  const sparkCount=90,geometry=new THREE.BufferGeometry();
  const sparkPositions=new THREE.Float32BufferAttribute(new Float32Array(sparkCount*3),3),sparkSizes=new THREE.Float32BufferAttribute(new Float32Array(sparkCount),1),sparkAlpha=new THREE.Float32BufferAttribute(new Float32Array(sparkCount),1),sparkTone=new THREE.Float32BufferAttribute(new Float32Array(sparkCount),1);
  for(const a of[sparkPositions,sparkSizes,sparkAlpha,sparkTone])a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',sparkPositions);geometry.setAttribute('aSize',sparkSizes);geometry.setAttribute('aAlpha',sparkAlpha);geometry.setAttribute('aTone',sparkTone);
  const sparkMaterial=new THREE.ShaderMaterial({uniforms:{uPointScale:{value:480}},vertexShader:sparkVertex,fragmentShader:sparkFragment,transparent:true,depthWrite:false,depthTest:true});
  const sparks=new THREE.Points(geometry,sparkMaterial);sparks.frustumCulled=false;sparks.renderOrder=7;root.add(sparks);
  const light=new THREE.PointLight('#ff9e49',18*scale,11*scale,2);light.position.set(0,.75*scale,0);light.castShadow=false;root.add(light);
  const cameraPosition=new THREE.Vector3();let disposed=false;
  function update(dt,time,camera){
    if(disposed)return;
    root.updateMatrixWorld(true);if(camera)camera.getWorldPosition(cameraPosition);
    const flicker=.82+Math.sin(time*6.3)*.08+Math.sin(time*13.37+1.1)*.09+Math.sin(time*24.7+.9)*.045;
    light.intensity=22*scale*intensity*flicker;light.position.x=Math.sin(time*3.4)*.12*scale;
    for(const layer of layers){
      layer.material.uniforms.uTime.value=time;
      for(const p of layer.particles){
        const age=(time*(layer.core?.46:.29)+p.phase)%1;p.age=age;
        const spread=layer.core?.34:.70;const angle=p.seed+p.index*.57;
        const rise=layer.core?age*.05:age*.17;
        p.width=(layer.core?.50: .92+Math.sin(p.seed)*.21)*(1-age*.36)*scale;
        p.height=(layer.core?.70:1.55+Math.sin(p.seed*2)*.50)*(1-age*.28)*scale;
        p.position.set((Math.sin(angle)*spread+Math.sin(time*1.2+p.seed)*age*.21+age*.20)*scale,p.height*.5+rise*scale,(Math.cos(angle)*spread*.66+Math.sin(age*4+p.seed)*age*.15)*scale);
        p.alpha=THREE.MathUtils.smoothstep(age,0,.09)*(1-THREE.MathUtils.smoothstep(age,.58,1))*(layer.core?.94:.86)*intensity;
        p.world.copy(p.position).applyMatrix4(root.matrixWorld);p.distance=p.world.distanceToSquared(cameraPosition);
      }
      if(camera)layer.particles.sort((a,b)=>b.distance-a.distance);
      layer.particles.forEach((p,i)=>{layer.offsets.setXYZ(i,p.position.x,p.position.y,p.position.z);layer.shapes.setXYZW(i,p.width,p.height,p.alpha,p.seed);layer.lives.setXY(i,p.age,0);});
      layer.offsets.needsUpdate=layer.shapes.needsUpdate=layer.lives.needsUpdate=true;
    }
    for(let i=0;i<sparkCount;i++){
      const seed=i*2.39996,age=(time*(.14+(i%7)*.013)+i/sparkCount)%1;
      const ember=i%4!==0,lift=age*(ember?5.1:6.8),spread=.25+age*1.8;
      sparkPositions.setXYZ(i,(Math.sin(seed+age*4)*spread+age*1.6)*scale,(.3+lift)*scale,(Math.cos(seed+age*3)*spread*.68+age*.5)*scale);
      sparkSizes.setX(i,(ember?.028:.046)*scale*(.65+(i%5)*.1));
      sparkAlpha.setX(i,Math.sin(age*Math.PI)*(ember?.9:.35)*intensity);sparkTone.setX(i,ember?1-age*.42:0);
    }
    sparkPositions.needsUpdate=sparkSizes.needsUpdate=sparkAlpha.needsUpdate=sparkTone.needsUpdate=true;
    sparkMaterial.uniforms.uPointScale.value=(globalThis.innerHeight||960)*.65;
  }
  function dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const layer of layers){layer.geometry.dispose();layer.material.dispose();}geometry.dispose();sparkMaterial.dispose();}
  return{root,light,update,dispose,drawCalls:3};
}
