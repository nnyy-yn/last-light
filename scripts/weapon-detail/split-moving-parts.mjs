// Separate original authored components without inventing substitute geometry.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
const root=path.resolve(import.meta.dirname,'../..'),reports=[];
for(const id of ['m16a2','akm']){
  const file=path.join(root,`public/assets/${id}-real.glb`),input=fs.readFileSync(file),n=input.readUInt32LE(12),g=JSON.parse(input.subarray(20,20+n)),bin=input.subarray(28+n);
  if(g.nodes.some(node=>node.name==='Magazine'))throw new Error('Run refine-pbr.mjs first to restore the unsplit source.');
  const read=index=>{const a=g.accessors[index],v=g.bufferViews[a.bufferView],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],stride=v.byteStride||size*({5126:4,5123:2,5125:4}[a.componentType]),start=(v.byteOffset||0)+(a.byteOffset||0),values=[];for(let i=0;i<a.count;i++)for(let k=0;k<size;k++)values.push(a.componentType===5126?bin.readFloatLE(start+i*stride+k*4):a.componentType===5123?bin.readUInt16LE(start+i*stride+k*2):bin.readUInt32LE(start+i*stride+k*4));return{a,size,values};};
  const chunks=[bin];let length=bin.length;
  const append=(array,type,size)=>{const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}const bytes=Buffer.from(array.buffer),view=g.bufferViews.length;g.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});chunks.push(bytes);length+=bytes.length;const accessor={bufferView:view,componentType:type,type:{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[size],count:array.length/size};if(size===3){accessor.min=[0,1,2].map(k=>Math.min(...array.filter((_,i)=>i%3===k)));accessor.max=[0,1,2].map(k=>Math.max(...array.filter((_,i)=>i%3===k)));}g.accessors.push(accessor);return g.accessors.length-1;};
  const world=[];
  const walk=(index,parent)=>{const node=g.nodes[index],matrix=node.matrix?new THREE.Matrix4().fromArray(node.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(node.translation||[0,0,0])),new THREE.Quaternion(...(node.rotation||[0,0,0,1])),new THREE.Vector3(...(node.scale||[1,1,1])));world[index]=parent.clone().multiply(matrix);for(const child of node.children||[])walk(child,world[index]);};
  for(const node of g.scenes[g.scene||0].nodes)walk(node,new THREE.Matrix4());
  const newMeshes=[],newNodes=[],stats=[];let oldTris=0,newTris=0;
  const part=(name,primitive,selected,matrix)=>{
    const order=[...new Set(selected)],map=new Map(order.map((v,i)=>[v,i])),attributes={},normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
    for(const [semantic,index]of Object.entries(primitive.attributes)){
      const{values,size}=read(index),array=new Float32Array(order.length*size);
      for(let i=0;i<order.length;i++){
        const v=values.slice(order[i]*size,order[i]*size+size);
        if(semantic==='POSITION')new THREE.Vector3(...v).applyMatrix4(matrix).toArray(array,i*size);
        else if(semantic==='NORMAL')new THREE.Vector3(...v).applyMatrix3(normalMatrix).normalize().toArray(array,i*size);
        else if(semantic==='TANGENT'){new THREE.Vector3(...v.slice(0,3)).transformDirection(matrix).toArray(array,i*size);array[i*size+3]=v[3]*(matrix.determinant()<0?-1:1);}
        else array.set(v,i*size);
      }
      attributes[semantic]=append(array,5126,size);
    }
    const indices=append(new Uint32Array(selected.map(v=>map.get(v))),5125,1),mesh=newMeshes.length;
    newMeshes.push({name,primitives:[{...primitive,attributes,indices}]});newNodes.push({name,mesh});newTris+=selected.length/3;
    const bounds=g.accessors[attributes.POSITION],center=bounds.min.map((v,k)=>(v+bounds.max[k])/2);
    stats.push({name,triangles:selected.length/3,localBounds:{min:bounds.min,max:bounds.max},localCenter:center,suggestedGrip:[bounds.min[0]-.012,center[1],center[2]]});
  };
  for(let nodeIndex=0;nodeIndex<g.nodes.length;nodeIndex++){
    const node=g.nodes[nodeIndex];if(node.mesh==null)continue;
    for(const primitive of g.meshes[node.mesh].primitives){
      const index=read(primitive.indices).values;oldTris+=index.length/3;
      if(id==='m16a2'){
        const name=/magazine/i.test(node.name)?'Magazine':/ejection_port/i.test(node.name)?'EjectionPortCover':/bolt_carrier/i.test(node.name)?'BoltCarrier':'Body';
        part(name,primitive,index,world[nodeIndex]);
      }else{
        const positions=read(primitive.attributes.POSITION).values,count=positions.length/3,parent=Array.from({length:count},(_,i)=>i),find=i=>parent[i]===i?i:parent[i]=find(parent[i]),join=(a,b)=>parent[find(a)]=find(b),weld=new Map();
        for(let i=0;i<count;i++){const key=positions.slice(i*3,i*3+3).map(v=>Math.round(v*1e5)).join();if(weld.has(key))join(i,weld.get(key));else weld.set(key,i);}
        for(let i=0;i<index.length;i+=3){join(index[i],index[i+1]);join(index[i],index[i+2]);}
        const sets={Body:[],Magazine:[],ChargingHandle:[]};
        for(let i=0;i<index.length;i+=3){const component=find(index[i]),name=component===3143?'Magazine':component===2904?'ChargingHandle':'Body';sets[name].push(...index.slice(i,i+3));}
        if(sets.Magazine.length!==450||sets.ChargingHandle.length!==510)throw new Error('Original AKM connected components changed; re-audit before splitting.');
        for(const[name,indices]of Object.entries(sets))part(name,primitive,indices,world[nodeIndex]);
      }
    }
  }
  if(oldTris!==newTris)throw new Error('Part separation must conserve every triangle.');
  g.nodes=newNodes;g.meshes=newMeshes;g.scenes=[{name:id+' authored moving components',nodes:newNodes.map((_,i)=>i)}];g.scene=0;
  g.asset.extras={...g.asset.extras,v05Parts:'Original geometry separated into named moving components. No replacement magazine. Metre/Y-up transforms baked; idle vertex locations preserved.'};
  g.buffers[0].byteLength=length;
  const raw=Buffer.from(JSON.stringify(g)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),body=Buffer.concat(chunks),h=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+body.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(body.length);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(file,Buffer.concat([h,jh,json,bh,body]));
  reports.push({id,trianglesBefore:oldTris,trianglesAfter:newTris,parts:stats});
}
fs.writeFileSync(path.join(root,'weapon-sources/v0.5/moving-part-anchors.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
