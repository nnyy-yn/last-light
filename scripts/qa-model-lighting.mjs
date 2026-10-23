import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const out='artifacts/model-upgrade-v0.6/lighting';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),report={passed:false,errors:[],views:[]};page.on('pageerror',e=>report.errors.push(String(e)));
await page.route('**/lighting-preview',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><body style="margin:0"><script type="module">
import * as T from '/node_modules/three/build/three.module.js';import {createWorld} from '/src/world.js';import {prepareWeapon} from '/src/weapon.js';
const r=new T.WebGLRenderer({antialias:true});r.setSize(innerWidth,innerHeight);r.shadowMap.enabled=true;r.shadowMap.type=T.PCFSoftShadowMap;r.toneMapping=T.ACESFilmicToneMapping;r.outputColorSpace=T.SRGBColorSpace;document.body.appendChild(r.domElement);await prepareWeapon(r);const w=await createWorld(r),c=new T.PerspectiveCamera(74,innerWidth/innerHeight,.05,600);let sun;w.scene.traverse(o=>{if(o.isDirectionalLight&&o.castShadow)sun=o;});
window.draw=(mood,p,target,before)=>{w.setMood(mood);c.position.fromArray(p);c.lookAt(...target);c.updateMatrixWorld(true);w.update(0,10,c);const n=before?2048:4096;sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(n,n);const extent=before?85:40;Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:1,far:before?240:220});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=before?.065:.018;sun.shadow.bias=before?-.00025:-.00008;if(before){sun.position.fromArray(w.getLightingState().direction);sun.target.position.set(0,0,0);sun.target.updateMatrixWorld(true);}else w.updateShadows(c);r.render(w.scene,c);return{lighting:w.getLightingState(),render:{calls:r.info.render.calls,triangles:r.info.render.triangles},mapSize:n,pointerLocked:!!document.pointerLockElement};};window.ready=true;
</script></body></html>`}));
try{await page.goto('http://127.0.0.1:5175/lighting-preview');await page.waitForFunction(()=>window.ready,undefined,{timeout:180000});
 for(const [name,mood,p,target]of [['corner','day',[2,1.68,30],[-6,.7,30]],['north','day',[0,1.68,65],[0,1.4,43]],['west','dusk',[-65,1.68,-50],[-43,1.1,-50]],['night','night',[0,1.68,-15],[2,1,-35]],['dawn','dawn',[0,1.68,10],[6,1,0]]])for(const before of[true,false]){const result=await page.evaluate(args=>window.draw(...args),[mood,p,target,before]);assert.equal(result.pointerLocked,false);await page.screenshot({path:path.join(out,`${name}-${before?'before':'after'}.png`)});report.views.push({name,before,...result});}
 assert.deepEqual(report.errors,[]);report.passed=true;console.log('LIGHTING PASS',report.views.length);
}catch(e){report.failure=String(e.stack);process.exitCode=1;console.error(e);}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
