import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {blocked as pointBlocked,lineBlocked} from './simulation.js';

const RANGE=2.4,HOLD_SECONDS=1.55;
const NONE=()=>({id:null,label:'',detail:'',progress:0,near:false});

function roundedBox(w,h,d,r=.01){
  r=Math.min(r,w/3,h/3,d/3);const x=-w/2,y=-h/2,s=new THREE.Shape();
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
  const g=new THREE.ExtrudeGeometry(s,{depth:d-2*r,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:1,steps:1,curveSegments:3});
  g.translate(0,0,-d/2+r);return g;
}

// Two deliberately finite optional supplies. The owner applies the reward;
// this module owns presentation, proximity and exactly-once chapter state.
export function createFieldInteractions(scene,{colliders=[],groundHeight=()=>0,onComplete=()=>{}}={}){
  const group=new THREE.Group();group.name='Finite field supply cases';scene.add(group);
  const materials=new Map(),textures=new Set();let items=[],active=null,disposed=false;
  const boxes=()=>typeof colliders==='function'?colliders():colliders;
  function wornSurface(){
    if(typeof document==='undefined')return null;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#d3d2ca';ctx.fillRect(0,0,256,256);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){const n=Math.sin(x*12.9898+y*78.233)*43758.5453,f=n-Math.floor(n);ctx.fillStyle=f>.5?'rgba(255,254,233,.035)':'rgba(40,37,26,.035)';ctx.fillRect(x,y,1,1);}
    for(let i=0;i<75;i++){const x=(i*47+13)%256,y=(i*83+7)%256;ctx.strokeStyle=i%3?'rgba(52,46,29,.14)':'rgba(244,230,192,.2)';ctx.lineWidth=i%7===0?2:1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+4+i%18,y+(i%5-2));ctx.stroke();}
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,3);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);return texture;
  }
  const surface=wornSurface();
  const mat=(key,color,roughness=.9,metalness=0)=>{
    if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness,...(surface&&metalness===0?{map:surface,bumpMap:surface,bumpScale:.0003}:{})}));return materials.get(key);
  };
  const palette={case:mat('case','#4e5742'),med:mat('medical case','#6b7560'),edge:mat('rubber edge','#272c23'),lining:mat('cloth lining','#2c3025'),strap:mat('canvas straps','#6f6a4b'),metal:mat('latches','#55594e',.57,.65),ivory:mat('first aid marking','#d4d6c7'),pack:mat('sealed packets','#c4b89a'),ammo:mat('canvas ammunition packs','#7e8063'),brass:mat('cartridge caps','#948357',.5,.65)};
  function labelMaterial(kind){
    const key='label-'+kind;if(materials.has(key))return materials.get(key);
    if(typeof document==='undefined')return palette.ivory;
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const ctx=canvas.getContext('2d');
    ctx.fillStyle=kind==='medicine'?'#66725b':'#4d5741';ctx.fillRect(0,0,256,96);
    ctx.fillStyle='#d6d3b8';ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText(kind==='medicine'?'FIRST AID':'FIELD AMMO',128,43);ctx.font='16px monospace';ctx.fillText(kind==='medicine'?'DRESSINGS / KIT':'RESERVE SUPPLY',128,72);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;textures.add(map);
    const m=new THREE.MeshStandardMaterial({map,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});materials.set(key,m);return m;
  }
  function createCase(kind){
    const root=new THREE.Group();root.name=kind==='medicine'?'Field medical case':'Field ammunition case';
    const lid=new THREE.Group();lid.position.set(0,.35,-.23);root.add(lid);
    const buckets=new Map(),resources=new Set();
    const add=(geometry,material,pos=[0,0,0],target=root,rotation=null)=>{
      const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation||[0,0,0]))),new THREE.Vector3(1,1,1));geometry.applyMatrix4(matrix);
      const key=(target===lid?'lid:':'body:')+material.uuid;if(!buckets.has(key))buckets.set(key,{target,material,geometries:[]});buckets.get(key).geometries.push(geometry);
    };
    const box=(w,h,d,m,x,y,z,target=root)=>add(roundedBox(w,h,d),m,[x,y,z],target);
    const paint=kind==='medicine'?palette.med:palette.case;
    box(.74,.055,.46,paint,0,.045,0);
    for(const x of[-.352,.352])box(.036,.30,.46,paint,x,.217,0);
    for(const z of[-.212,.212])box(.67,.30,.036,paint,0,.217,z);
    box(.64,.026,.36,palette.lining,0,.085,0);
    box(.75,.055,.47,paint,0,.022,.23,lid);
    box(.66,.012,.39,palette.lining,0,-.009,.23,lid);
    for(const x of[-.23,.23]){
      box(.042,.32,.009,palette.strap,x,.213,.237);box(.042,.010,.47,palette.strap,x,.055,.23,lid);
      box(.059,.040,.013,palette.metal,x,.302,.245);box(.027,.024,.016,palette.edge,x,.304,.255);
      box(.067,.026,.024,palette.metal,x,.351,-.242);
    }
    // Raised side carry handles with an open gap and a wrapped middle grip.
    for(const side of[-1,1]){
      box(.022,.080,.025,palette.metal,side*.390,.233,-.07);box(.022,.080,.025,palette.metal,side*.390,.233,.07);
      box(.026,.024,.16,palette.edge,side*.390,.267,0);
    }
    if(kind==='medicine'){
      box(.17,.006,.047,palette.ivory,0,.056,.23,lid);box(.047,.006,.17,palette.ivory,0,.057,.23,lid);
      for(let i=0;i<3;i++){
        box(.17,.085,.28,palette.pack,(i-1)*.195,.142,0);box(.018,.006,.275,palette.strap,(i-1)*.195,.188,0);
      }
      for(const z of[-.11,.11])add(new THREE.CylinderGeometry(.029,.029,.13,12),palette.ivory,[.23,.244,z],root,[0,0,Math.PI/2]);
    }else{
      for(let i=0;i<3;i++){
        box(.165,.15,.29,palette.ammo,(i-1)*.198,.177,0);box(.17,.022,.29,palette.strap,(i-1)*.198,.258,0);
        for(let j=0;j<2;j++)add(new THREE.CylinderGeometry(.013,.013,.028,8),palette.brass,[(i-1)*.198+(j-.5)*.042,.267,.04]);
      }
    }
    add(new THREE.PlaneGeometry(.36,.135),labelMaterial(kind),[0,.191,.232]);
    for(const{target,material,geometries}of buckets.values()){
      // The rounded cases, packing and straps share one draw per material.
      const normals=geometries.map(g=>{if(g.index)g=g.toNonIndexed();return g;});
      const merged=mergeGeometries(normals,false);geometries.forEach(g=>g.dispose());for(const g of normals)if(!geometries.includes(g))g.dispose();
      const mesh=new THREE.Mesh(merged,material);mesh.castShadow=true;mesh.receiveShadow=true;target.add(mesh);resources.add(merged);
    }
    return{root,lid,resources};
  }
  function clear(){for(const item of items){item.visual.root.removeFromParent();for(const g of item.visual.resources)g.dispose();}items=[];active=null;}
  function reset({chapter}={}){
    clear();if(disposed||!chapter?.armed||!chapter.hostiles?.length)return [];
    const spawn={x:chapter.spawn[0],z:chapter.spawn[1]},horizontal=Math.abs(spawn.x)>Math.abs(spawn.z),axis=horizontal?'x':'z',side=horizontal?'z':'x';
    const direction=spawn[axis]>0?-1:1,obstacles=boxes()||[],tasks=(chapter.tasks||[]).map(t=>({x:t.pos[0],z:t.pos[1]}));
    for(const[kind,index]of[['medicine',0],['ammo',1]]){
      const candidates=[];
      for(const along of(index?[13,16,19,10,22]:[6,8,10,12]))for(const across of[4.4,5.2,3.7,6.1])for(const sign of[index%2===0?1:-1,index%2===0?-1:1]){
        const p={...spawn};p[axis]+=along*direction;p[side]+=across*sign;
        if(Math.abs(p.x)>88||Math.abs(p.z)>88||Math.hypot(p.x-spawn.x,p.z-spawn.z)<1.8)continue;
        if(tasks.some(t=>Math.hypot(p.x-t.x,p.z-t.z)<2.65)||items.some(i=>Math.hypot(p.x-i.x,p.z-i.z)<4.9))continue;
        if(pointBlocked(p.x,p.z,obstacles,.62)||lineBlocked(spawn,p,obstacles))continue;
        // A clear standing point toward the street rules out tucked-away boxes
        // which can be seen through a gap but not legally reached from the road.
        const approach={...p};approach[side]-=Math.sign(p[side]-spawn[side])*1.35;
        if(pointBlocked(approach.x,approach.z,obstacles,.38)||lineBlocked(spawn,approach,obstacles)||lineBlocked(approach,p,obstacles))continue;
        candidates.push({p,approach});
      }
      if(!candidates.length)continue; // Omit a blocked point instead of spawning inside masonry.
      const{p,approach}=candidates[0],visual=createCase(kind);visual.root.position.set(p.x,groundHeight(p.x,p.z)+.018,p.z);visual.root.rotation.y=horizontal?(p.z>spawn.z?Math.PI:0):(p.x>spawn.x?-Math.PI/2:Math.PI/2);group.add(visual.root);
      items.push({id:`field-${chapter.id}-${kind}`,kind,amount:kind==='ammo'?24:1,x:p.x,z:p.z,approach,used:false,progress:0,open:0,visual});
    }
    return inspect();
  }
  function cancel(){for(const item of items)item.progress=0;active=null;}
  function update(dt,{player,camera,held=false,blocked=false}={}){
    if(disposed)return NONE();dt=Number.isFinite(dt)?THREE.MathUtils.clamp(dt,0,.1):0;
    for(const item of items){if(item.used){item.open=THREE.MathUtils.damp(item.open,1,7,dt);item.visual.lid.rotation.x=-item.open*1.48;}}
    if(blocked||!player||!camera){cancel();return NONE();}
    camera.updateWorldMatrix(true,false);const origin=camera.getWorldPosition(new THREE.Vector3()),forward=camera.getWorldDirection(new THREE.Vector3()),obstacles=boxes()||[];
    let selected=null,distance=Infinity;
    for(const item of items){
      if(item.used)continue;const dist=Math.hypot(player.x-item.x,player.z-item.z);if(dist>RANGE)continue;
      const to=new THREE.Vector3(item.x,.29,item.z).sub(origin);if(to.lengthSq()<1e-8||forward.dot(to.normalize())<=.65)continue;
      // The owner may include these cases in player/AI movement obstacles.
      // A ray ending inside its own case must still allow opening that case.
      if(lineBlocked({x:player.x,z:player.z},{x:item.x,z:item.z},obstacles.filter(b=>b.fieldId!==item.id)))continue;
      if(dist<distance){selected=item;distance=dist;}
    }
    if(!selected){cancel();return NONE();}
    if(active!==selected){cancel();active=selected;}
    if(held)selected.progress=Math.min(1,selected.progress+dt/HOLD_SECONDS);else selected.progress=0;
    const result={id:selected.id,label:selected.kind==='ammo'?'取出备用弹药':'取出急救用品',detail:selected.kind==='ammo'?'按住 E · 备用弹药 +24':'按住 E · 医疗物资 +1',progress:selected.progress,near:true};
    if(selected.progress>=1){
      selected.used=true;selected.progress=0;active=null;result.progress=1;result.detail='已取用';
      // Mark first so re-entrant owner callbacks cannot award the same case twice.
      onComplete({kind:selected.kind,amount:selected.amount,id:selected.id});
    }
    return result;
  }
  function inspect(){return items.map(i=>({id:i.id,kind:i.kind,amount:i.amount,pos:[i.x,i.z],approach:[i.approach.x,i.approach.z],used:i.used,progress:i.progress,opened:i.open,draws:i.visual.resources.size}));}
  function getColliders(){return items.map(item=>{
    const yaw=item.visual.root.rotation.y,c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw));
    const hx=.45*c+.30*s,hz=.45*s+.30*c;
    // Stable even after opening: the physical base and lid still occupy space.
    // Height lets the owner avoid treating a low case as a full-height wall.
    return{minX:item.x-hx,maxX:item.x+hx,minZ:item.z-hz,maxZ:item.z+hz,minY:groundHeight(item.x,item.z)+.02,maxY:groundHeight(item.x,item.z)+.4,material:'metal',fieldId:item.id};
  });}
  function dispose(){clear();for(const m of materials.values())m.dispose();for(const t of textures)t.dispose();group.removeFromParent();disposed=true;}
  return{reset,update,cancel,inspect,getColliders,clear,dispose};
}
