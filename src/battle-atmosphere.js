import * as THREE from 'three';

// Local low dust and intermittent distant impact plumes. All particles share
// one material and one draw call. A bounded debris batch anchors distant
// impacts to the street; no full-screen fog veil obscures the view.
export function createBattleAtmosphere(scene,{groundHeight=()=>0}={}){
  let seed=9713;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');
  for(let i=0;i<70;i++){
    const angle=random()*Math.PI*2,r=Math.sqrt(random())*64,x=128+Math.cos(angle)*r,y=128+Math.sin(angle)*r;
    const size=20+random()*38,gradient=ctx.createRadialGradient(x,y,0,x,y,size);
    gradient.addColorStop(0,'rgba(255,255,255,.18)');gradient.addColorStop(.5,'rgba(255,255,255,.09)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(x-size,y-size,size*2,size*2);
  }
  const map=new THREE.CanvasTexture(canvas),count=180,offsets=new THREE.InstancedBufferAttribute(new Float32Array(count*3),3),sizes=new THREE.InstancedBufferAttribute(new Float32Array(count*3),3),heats=new THREE.InstancedBufferAttribute(new Float32Array(count),1);
  const source=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();geometry.index=source.index.clone();
  for(const[key,value]of Object.entries(source.attributes))geometry.setAttribute(key,value.clone());source.dispose();
  geometry.setAttribute('aPosition',offsets);geometry.setAttribute('aShape',sizes);geometry.setAttribute('aHeat',heats);geometry.instanceCount=count;
  const material=new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{map:{value:map},tint:{value:new THREE.Color('#978b72')}}]),fog:true,transparent:true,depthWrite:false,
    vertexShader:`attribute vec3 aPosition;attribute vec3 aShape;attribute float aHeat;varying vec2 vUv;varying float vAlpha;varying float vHeat;varying float vDepth;
      #include <fog_pars_vertex>
      void main(){vUv=uv;vAlpha=aShape.z;vHeat=aHeat;vec4 mvPosition=modelViewMatrix*vec4(aPosition,1.);vDepth=-mvPosition.z;mvPosition.xy+=position.xy*aShape.xy;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`uniform sampler2D map;uniform vec3 tint;varying vec2 vUv;varying float vAlpha;varying float vHeat;varying float vDepth;
      #include <fog_pars_fragment>
      void main(){float alpha=texture2D(map,vUv).a*vAlpha*smoothstep(.2,1.1,vDepth);if(alpha<.003)discard;gl_FragColor=vec4(mix(tint,vec3(3.1,1.3,.28),vHeat),alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`,
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.name='windblown dust and distant impact plumes';scene.add(mesh);
  const litterCanvas=document.createElement('canvas');litterCanvas.width=litterCanvas.height=128;
  const ink=litterCanvas.getContext('2d');ink.fillStyle='#b1a68b';ink.fillRect(0,0,128,128);
  ink.fillStyle='#665f50';ink.fillRect(12,12,104,7);
  for(let column=0;column<3;column++)for(let row=0;row<17;row++)ink.fillRect(12+column*36,25+row*5,18+random()*12,1);
  const litterMap=new THREE.CanvasTexture(litterCanvas);litterMap.colorSpace=THREE.SRGBColorSpace;
  const litterGeometry=new THREE.PlaneGeometry(1,1,2,2);litterGeometry.rotateX(-Math.PI/2);
  const paperVertices=litterGeometry.attributes.position;
  for(let i=0;i<paperVertices.count;i++)paperVertices.setY(i,Math.abs(paperVertices.getX(i))*.12+Math.abs(paperVertices.getZ(i))*.04);
  litterGeometry.computeVertexNormals();
  const litterMaterial=new THREE.MeshStandardMaterial({map:litterMap,roughness:1,side:THREE.DoubleSide});
  const litter=new THREE.InstancedMesh(litterGeometry,litterMaterial,30),paperTransform=new THREE.Object3D();
  litter.name='loose newspaper scraps moved by street gusts';litter.frustumCulled=false;scene.add(litter);
  const scraps=Array.from({length:30},(_,i)=>({
    x:0,
    z:0,
    phase:random()*Math.PI*2,size:.14+random()*.18,turn:random()*6.28
  }));
  const light=new THREE.PointLight('#ffb168',0,20,2);scene.add(light);
  const debrisGeometry=new THREE.IcosahedronGeometry(1,0),debrisMaterial=new THREE.MeshStandardMaterial({color:'#746450',roughness:1});
  const debris=new THREE.InstancedMesh(debrisGeometry,debrisMaterial,32),debrisTransform=new THREE.Object3D();
  debris.name='bounded ballistic street fragments';debris.frustumCulled=false;debris.count=0;scene.add(debris);
  const fragments=Array.from({length:32},(_,i)=>{const a=i*2.39996323,r=1.7+random()*4.5;return{vx:Math.sin(a)*r,vz:Math.cos(a)*r,vy:2.6+random()*5.5,size:.035+random()*.095,spin:random()*6};});
  const particles=Array.from({length:count},(_,index)=>({index,seed:random()*100,position:new THREE.Vector3(),velocity:new THREE.Vector3(),width:0,height:0,alpha:0,heat:0,distance:0,life:0,totalLife:0,spark:false}));
  const transients=particles.filter(p=>p.index>=60);let burstCursor=0,impactBursts=0;
  function hit(position,normal={x:0,y:1,z:0},power=1){
    impactBursts++;
    for(let i=0;i<10;i++){
      const p=transients[burstCursor++%transients.length];p.spark=i>=7;p.vehicleDust=false;
      p.totalLife=p.life=p.spark?.22+random()*.22:.65+random()*.75;
      p.position.set(position.x+normal.x*.045,Math.max(groundHeight(position.x,position.z)+.045,position.y)+normal.y*.045,position.z+normal.z*.045);
      const push=(p.spark?2.8:1.3)*power;
      p.velocity.set(normal.x*push+(random()-.5)*1.8,.5+normal.y*push+random()*1.4,normal.z*push+(random()-.5)*1.8);
      p.width=p.height=p.spark?.035:.13;p.alpha=p.spark?1.4:.5;p.heat=p.spark?1:0;
    }
  }
  const sites=[],events=[],dustSources=[];
  let chapterId=null;
  function setChapter(layout){
    chapterId=layout?.id||null;dustSources.length=0;sites.length=0;
    const segments=[];
    for(const road of layout?.roads||[])for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length>.01)segments.push({a,dx:dx/length,dz:dz/length,length,width:road.width});
    }
    const total=segments.reduce((n,r)=>n+r.length,0);
    if(total>0)for(let i=0;i<36;i++){
      let distance=(i+.5)/36*total,r=segments[0];
      for(const segment of segments){r=segment;if(distance<=r.length)break;distance-=r.length;}
      const side=i%2?1:-1,edge=side*(r.width*.5-.5);
      const x=r.a[0]+r.dx*distance+r.dz*edge,z=r.a[1]+r.dz*distance-r.dx*edge;
      // Closed rooms and hangar floors have no outdoor wind sources.
      if((layout.buildings||[]).some(b=>b.interior&&Math.abs(x-b.x)<b.w*.5+.5&&Math.abs(z-b.z)<b.d*.5+.5))continue;
      dustSources.push({x,z});
    }
    for(let i=0;i<dustSources.length;i+=Math.max(1,Math.floor(dustSources.length/4)))sites.push([dustSources[i].x,dustSources[i].z]);
    litter.count=dustSources.length?30:0;
    scraps.forEach((p,i)=>{const source=dustSources[i%dustSources.length];p.x=source?.x||0;p.z=source?.z||0;});
  }
  let impact=null,nextImpact=9,lastMood='',distantImpacts=0,disposed=false,wakeClock=0,vehicleDust=0;
  function update(dt,time,camera,{active=false,mood='day',combat=false,vehicles=[]}={}){
    if(lastMood!==mood){material.uniforms.tint.value.set(mood==='night'?'#333d47':mood==='dusk'?'#8c765a':'#a5977c');lastMood=mood;}
    dt=Number.isFinite(dt)?Math.max(0,dt):0;let justTriggered=false;
    if(dt>0){wakeClock+=dt;if(wakeClock>=.12){wakeClock%=.12;
      for(const vehicle of vehicles.filter(v=>v.speed>.7&&v.distance<65).slice(0,8))for(const side of[-1,1]){
        const p=transients[burstCursor++%transients.length],s=Math.sin(vehicle.yaw),c=Math.cos(vehicle.yaw);
        const x=vehicle.x-s*vehicle.rear+c*side*.8,z=vehicle.z-c*vehicle.rear-s*side*.8;
        p.spark=false;p.vehicleDust=true;p.totalLife=p.life=1.6+random()*.65;p.position.set(x,groundHeight(x,z)+.14,z);
        p.velocity.set(-s*.8+side*c*.28,.26+random()*.16,-c*.8-side*s*.28);p.heat=0;vehicleDust++;
      }
    }}
    if(active&&combat&&sites.length&&dt>0){nextImpact-=dt;if(nextImpact<=0){const site=sites[Math.floor(random()*sites.length)];impact={x:site[0],z:site[1],age:0};justTriggered=true;distantImpacts++;events.push({x:site[0],z:site[1]});nextImpact=13+random()*14;}}
    if(impact){if(!justTriggered)impact.age+=dt;light.position.set(impact.x,groundHeight(impact.x,impact.z)+.7,impact.z);light.intensity=impact.age<.19?35*Math.exp(-impact.age*23):0;if(impact.age>9)impact=null;}else light.intensity=0;
    debris.count=impact&&impact.age<3.8?fragments.length:0;
    if(debris.count){const age=impact.age;fragments.forEach((f,i)=>{const flight=Math.min(age,2*f.vy/9.81),grounded=age>flight;
      const x=impact.x+f.vx*flight,z=impact.z+f.vz*flight;debrisTransform.position.set(x,groundHeight(x,z)+.055+Math.max(0,f.vy*flight-4.905*flight*flight),z);
      debrisTransform.rotation.set(f.spin+flight*4,f.spin+flight*2,flight*6);const fade=1-THREE.MathUtils.smoothstep(age,2.6,3.8);
      debrisTransform.scale.set(f.size*1.7*fade,f.size*(grounded?.35:.7)*fade,f.size*fade);debrisTransform.updateMatrix();debris.setMatrixAt(i,debrisTransform.matrix);
    });debris.instanceMatrix.needsUpdate=true;}
    for(const p of particles){
      if(p.index<36){
        const phase=(time*.045+p.seed*.17)%1,side=p.index%2?1:-1,gust=Math.pow(Math.max(0,Math.sin(time*.24+p.seed)),4);
        const source=dustSources[p.index%dustSources.length];
        const x=(source?.x||0)+(phase-.5)*5,z=(source?.z||0)+Math.sin(p.seed)*1.2+phase;
        p.position.set(x,groundHeight(x,z)+.22+gust*.25,z);
        p.width=4.2+gust*3;p.height=.55+gust*.8;
        p.alpha=source?(.15+gust*.22)*Math.sin(phase*Math.PI):0;
      }else if(p.index>=60){
        p.life=Math.max(0,p.life-dt);
        if(p.life>0){
          p.velocity.y-=dt*(p.spark?8:p.vehicleDust?.02:.5);p.position.addScaledVector(p.velocity,dt);p.velocity.multiplyScalar(Math.max(0,1-dt*(p.spark?.25:p.vehicleDust?.35:1.5)));
          const floor=groundHeight(p.position.x,p.position.z)+.04;if(p.position.y<floor){p.position.y=floor;p.velocity.y=Math.abs(p.velocity.y)*.22;}
          const age=p.totalLife-p.life,fade=p.life/p.totalLife;
          p.width=p.spark?.035:p.vehicleDust?.4+age*1.5:.13+age*.9;p.height=p.vehicleDust?.28+age*.65:p.width;p.alpha=(p.spark?1.4:p.vehicleDust?.3:.48)*fade;p.heat=p.spark?fade:0;
        }else{p.alpha=0;p.heat=0;p.position.y=-50;}
      }else if(impact){
        const age=impact.age,index=p.index-36,angle=p.seed*3.7;
        p.heat=0;
        if(index===0){p.position.set(impact.x,.35,impact.z);p.width=1.1+age*3;p.height=.7+age*2;p.alpha=age<.18?(1-age/.18)*2.6:0;p.heat=1;}
        else if(index<9){const spread=.2+Math.min(age,2.7)*(1.3+(index%3)*.45);p.position.set(impact.x+Math.sin(angle)*spread,.18+age*.12,impact.z+Math.cos(angle)*spread);
          p.width=1.2+age*.85;p.height=.38+age*.25;p.alpha=Math.min(1,age*12)*Math.max(0,1-age/6)*.58;
        }else{const launch=(index-9)*.035,a=Math.max(0,age-launch),speed=1.4+(index%4)*.52,spread=Math.min(a,2.5)*(.45+(index%3)*.22);
          p.position.set(impact.x+Math.sin(angle)*spread+a*.42,.2+speed*Math.min(a,1.6)+Math.max(0,a-1.6)*.19,impact.z+Math.cos(angle)*spread*.65);
          p.width=.4+a*.72;p.height=.8+a*.54;p.alpha=age<launch?0:Math.min(1,a*9)*Math.pow(Math.max(0,1-a/9),1.4)*.75;
        }
        p.position.y+=groundHeight(p.position.x,p.position.z);
      }else{p.alpha=0;p.heat=0;p.position.set(0,-50,0);}
      p.distance=p.position.distanceToSquared(camera.position);
    }
    particles.sort((a,b)=>b.distance-a.distance);
    particles.forEach((p,i)=>{offsets.setXYZ(i,p.position.x,p.position.y,p.position.z);sizes.setXYZ(i,p.width,p.height,p.alpha);heats.setX(i,p.heat);});
    offsets.needsUpdate=sizes.needsUpdate=heats.needsUpdate=true;
    scraps.forEach((scrap,i)=>{
      const gust=Math.pow(Math.max(0,Math.sin(time*.31+scrap.phase)),8),roll=time*2.8+scrap.phase;
      paperTransform.position.set(scrap.x+Math.sin(time*.31+scrap.phase)*1.4,.045+gust*(.08+Math.abs(Math.sin(roll))*.24),scrap.z+Math.sin(time*.22+scrap.phase)*.45);
      paperTransform.position.y+=groundHeight(paperTransform.position.x,paperTransform.position.z);
      paperTransform.rotation.set(gust*Math.sin(roll)*1.5,scrap.turn+gust*Math.sin(roll*.5),gust*Math.cos(roll)*.5);
      paperTransform.scale.set(scrap.size,1,scrap.size*1.3);paperTransform.updateMatrix();litter.setMatrixAt(i,paperTransform.matrix);
    });litter.instanceMatrix.needsUpdate=true;
  }
  return{update,hit,setChapter,inspect:()=>({chapterId,dustSources:dustSources.length,impactBursts,vehicleDust,activeParticles:transients.filter(p=>p.life>0).length,capacity:transients.length,distantImpacts,impact:impact?{...impact}:null,debris:debris.count,debrisCapacity:32}),reset(){impact=null;nextImpact=9;impactBursts=0;wakeClock=0;vehicleDust=0;distantImpacts=0;events.length=0;light.intensity=0;debris.count=0;for(const p of transients){p.life=0;p.alpha=0;}},takeEvents:()=>events.splice(0),dispose(){if(disposed)return;disposed=true;for(const object of[litter,debris])if(!object.userData.instanceBuffersDisposed){object.dispose();object.userData.instanceBuffersDisposed=true;}mesh.removeFromParent();light.removeFromParent();litter.removeFromParent();debris.removeFromParent();debrisGeometry.dispose();debrisMaterial.dispose();litterMap.dispose();litterGeometry.dispose();litterMaterial.dispose();map.dispose();geometry.dispose();material.dispose();}};
}
