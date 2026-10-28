import * as THREE from 'three';
import {buildChapterScene} from '../../src/chapter-world.js';
import {getChapterLayout} from '../../src/chapter-layouts.js';
const noop=()=>{},context=new Proxy({getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),measureText:t=>({width:String(t).length*16}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>k in o?o[k]:noop});
export function storySceneFixture(id){
 globalThis.document={createElement:()=>({width:16,height:16,getContext:()=>context})};
 const texture=new THREE.Texture({width:1024,height:1024}),maps={map:texture,normalMap:texture,roughnessMap:texture},palette=Object.fromEntries(['brick','road','concrete','dark','rusty','trim','blue','green','wood','metal','cloth','rubber','white','sand','exposed','brickEdge'].map(k=>[k,new THREE.MeshStandardMaterial({...maps,color:'#aaa899'})]));palette.walls=Array(6).fill(palette.concrete);for(const k of['wallMaps','dirtMaps','brokenMaps','brickMaps','roadMaps'])palette[k]=maps;
 const vehicle=({type='humvee'}={})=>{const g=new THREE.Group();g.userData.collisionBoxes=[{minX:-1.08,maxX:1.08,minZ:type==='cargo-truck'?-3.7:-2.4,maxZ:type==='cargo-truck'?3.7:2.4}];return g;};
 const aircraft=()=>{const g=new THREE.Group();g.userData.collisionBoxes=[];g.userData.rotor=new THREE.Group();g.userData.tailRotor=new THREE.Group();return g;};
 const layout=getChapterLayout(id),group=new THREE.Group(),colliders=[],built=buildChapterScene(layout,{group,colliders,palette,rubbleMaps:maps,facadeAsset:null,makeVehicle:vehicle,makeAircraft:aircraft,addFire:noop,addSmoke:noop,nightLights:[],destroyObject:o=>o.removeFromParent()});
 return {layout,group,colliders,built,dispose(){built.dispose();for(const m of Object.values(palette))if(m?.isMaterial)m.dispose();texture.dispose();}};
}
