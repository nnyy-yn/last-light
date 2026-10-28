import * as THREE from 'three';
// These are the actual local cabin-door coordinates used by the rope director.
// The source airframe is converted into canonical metres before this clipping.
export const BLACKHAWK_ROPE_SOCKETS=Object.freeze([-1,1].map(side=>Object.freeze({id:side<0?'rope-left':'rope-right',side,position:[side*1.40,1.66,.30],doorBounds:{minY:.76,maxY:2.22,minZ:-.70,maxZ:1.08}})));
export function cutBlackHawkCabinDoors(source){
 const geometry=source.index?source.toNonIndexed():source.clone(),p=geometry.attributes.position,keep=[],doors=[[],[]],center=new THREE.Vector3();
 for(let i=0;i<p.count;i+=3){center.set(0,0,0);for(let j=0;j<3;j++)center.add(new THREE.Vector3().fromBufferAttribute(p,i+j));center.multiplyScalar(1/3);
  const side=center.x<0?-1:1;
  const sideShell=Math.abs(center.x)>1.06&&Math.abs(center.x)<1.40,within=center.y>.76&&center.y<2.22&&center.z>-.70&&center.z<1.08;
  // Restrict to lateral shell polygons. This excludes seat backs, cockpit
  // floor, roof and middle cabin structure even if their centroid is nearby.
  const lateral=[0,1,2].every(j=>Math.abs(p.getX(i+j))>1.025&&Math.sign(p.getX(i+j))===side);
  (sideShell&&within&&lateral?doors[side<0?0:1]:keep).push(i,i+1,i+2);
 }
 const select=indices=>{const out=new THREE.BufferGeometry();for(const name of['position','normal','uv']){const attr=geometry.attributes[name];if(!attr)continue;const values=[];for(const i of indices)for(let k=0;k<attr.itemSize;k++)values.push(attr.getComponent(i,k));out.setAttribute(name,new THREE.Float32BufferAttribute(values,attr.itemSize));}return out;};
 const result={body:select(keep),doors:doors.map(select),removedTriangles:doors.map(d=>d.length/3),sourceTriangles:p.count/3};geometry.dispose();return result;
}
