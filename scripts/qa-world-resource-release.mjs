import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage();const errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/resource-release-check',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><base href="/"><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import {prepareWeapon} from '/src/weapon.js';
import {createWorld} from '/src/world.js';
const renderer=new THREE.WebGLRenderer();renderer.setSize(128,128);await prepareWeapon(renderer);const world=await createWorld(renderer);
const camera=new THREE.PerspectiveCamera(65,1,.05,200);camera.position.set(0,1.6,5);camera.lookAt(0,1,0);
window.result=[];
for(let i=0;i<7;i++){
 const civilian=world.createActor('civilian',[-1,0]);const enemy=world.createActor('enemy',[1,0]);world.createProp('wreck',[2,-12]);
 world.update(.016,i,camera);renderer.render(world.scene,camera);
 const hadBones=[];civilian.traverse(o=>{if(o.skeleton)hadBones.push(o.skeleton);});
 world.destroyActor(civilian);world.destroyActor(civilian);world.clearDynamic();renderer.render(world.scene,camera);
 window.result.push({...world.getResourceState(),geometry:renderer.info.memory.geometries,textures:renderer.info.memory.textures,boneTexturesReleased:hadBones.every(s=>s.boneTexture===null)});
}
world.dispose();renderer.dispose();window.ready=true;
</script>`}));
try{await page.goto('http://127.0.0.1:5175/resource-release-check');await page.waitForFunction(()=>window.ready,null,{timeout:120000});const samples=await page.evaluate(()=>window.result);assert.deepEqual(errors,[]);for(const sample of samples.slice(1)){assert.equal(sample.actors,0);assert.equal(sample.materials,samples[0].materials);assert.equal(sample.textures,samples[0].textures);assert.equal(sample.geometry,samples[0].geometry);assert.equal(sample.boneTexturesReleased,true);}await fs.writeFile('artifacts/world-resource-release.json',JSON.stringify({passed:true,errors,samples},null,2));console.log(JSON.stringify({passed:true,samples}));}finally{await browser.close();}
