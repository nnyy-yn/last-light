import * as THREE from 'three';
import {ROCKET_LIMITS} from './rocket-projectiles.js';
export function createRocketView(scene){
 const geometry=new THREE.ConeGeometry(.055,.48,8);geometry.rotateX(Math.PI/2);
 const material=new THREE.MeshStandardMaterial({color:'#5a6045',roughness:.7,metalness:.3});
 const mesh=new THREE.InstancedMesh(geometry,material,ROCKET_LIMITS.capacity),transform=new THREE.Object3D(),direction=new THREE.Vector3(),axis=new THREE.Vector3(0,0,1);
 mesh.name='Swept RPG projectiles';mesh.frustumCulled=false;mesh.count=0;scene.add(mesh);
 return{update(records){mesh.count=records.length;records.forEach((r,i)=>{transform.position.set(r.position.x,r.position.y,r.position.z);direction.set(r.direction.x,r.direction.y-3.2*r.age/175,r.direction.z).normalize();transform.quaternion.setFromUnitVectors(axis,direction);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);});if(records.length)mesh.instanceMatrix.needsUpdate=true;},dispose(){mesh.removeFromParent();mesh.dispose();geometry.dispose();material.dispose();}};
}
