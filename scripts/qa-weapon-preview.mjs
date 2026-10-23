import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE ERROR',String(e));});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE',m.text());}});
await page.route('**/weapon-preview',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><base href="/"><style>html,body{margin:0;overflow:hidden;background:#272c30}canvas{display:block}</style></head><body><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import {RoomEnvironment} from '/node_modules/three/examples/jsm/environments/RoomEnvironment.js';
import {prepareWeapon,createRifle,createWeapon} from '/src/weapon.js';
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#30383a');const env=new THREE.PMREMGenerator(renderer);scene.environment=env.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.7;
scene.add(new THREE.HemisphereLight('#edf1ea','#55534c',1.3));const key=new THREE.DirectionalLight('#fff1dc',3);key.position.set(1,3,2);scene.add(key);const rim=new THREE.DirectionalLight('#aac5d8',2);rim.position.set(-3,2,-2);scene.add(rim);
const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.01,20);await prepareWeapon(renderer);const rifle=createRifle();scene.add(rifle);camera.position.set(.72,.24,.25);camera.lookAt(0,-.02,-.15);const viewCamera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.01,20);scene.add(viewCamera);const vm=createWeapon(viewCamera);vm.group.visible=false;
window.preview={scene,rifle,camera,viewCamera,vm,renderer,mode:'inspect',meta:rifle.userData,setMode(mode){this.mode=mode;rifle.visible=mode==='inspect';vm.group.visible=mode!=='inspect';},setPose(x,y,z){vm.group.position.set(x,y,z);},setTint(hex){rifle.traverse(o=>{if(o.isMesh&&o.material.name==='M_M4A1')o.material.color.set(hex);});},stats(){let meshes=0,triangles=0;rifle.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});return {meshes,triangles,meta:rifle.userData};}};
function render(){requestAnimationFrame(render);renderer.render(scene,window.preview.mode==='inspect'?camera:viewCamera);}render();window.ready=true;
</script></body></html>`}));
try {
 await page.goto('http://127.0.0.1:5175/weapon-preview');await page.waitForFunction(()=>window.ready,{timeout:90000});
 console.log(await page.evaluate(()=>window.preview.stats()));console.log(await page.evaluate(()=>{const bones=[];window.preview.vm.group.traverse(o=>{if(o.isBone&&/Arm|Forearm|Hand_L|Hand_R/.test(o.name)){const p=o.getWorldPosition(new window.preview.rifle.position.constructor());window.preview.vm.group.worldToLocal(p);bones.push({name:o.name,pos:p.toArray()});}});return bones;}));
 await page.screenshot({path:'artifacts/m4-real-inspect-final.png'});
 await page.evaluate(()=>{window.preview.setMode('hip');window.preview.viewCamera.fov=74;window.preview.viewCamera.updateProjectionMatrix();window.preview.setPose(.22,-.215,-.29);});await page.waitForTimeout(250);await page.screenshot({path:'artifacts/m4-real-hip-final.png'});
 await page.evaluate(()=>{window.preview.setPose(.16,-.14,-.36);});await page.waitForTimeout(250);await page.screenshot({path:'artifacts/m4-real-hip-raised.png'});
 await page.evaluate(()=>{window.preview.setPose(0,-.0639,-.35);window.preview.viewCamera.fov=48;window.preview.viewCamera.updateProjectionMatrix();});await page.waitForTimeout(250);await page.screenshot({path:'artifacts/m4-real-ads-final.png'});
 console.log(JSON.stringify({errors}));
} finally {await browser.close();}






