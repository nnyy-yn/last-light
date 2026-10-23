import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const out='artifacts/model-upgrade-v0.5/hand-poses';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/hand-preview',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><body style="margin:0;background:#343b3b"><script type="module">
import * as T from '/node_modules/three/build/three.module.js';import {RoomEnvironment} from '/node_modules/three/examples/jsm/environments/RoomEnvironment.js';import {prepareWeapon,createWeapon} from '/src/weapon.js';
const r=new T.WebGLRenderer({antialias:true});r.setSize(innerWidth,innerHeight);r.toneMapping=T.ACESFilmicToneMapping;r.outputColorSpace=T.SRGBColorSpace;document.body.appendChild(r.domElement);
const s=new T.Scene();s.background=new T.Color('#343b3b');s.environment=new T.PMREMGenerator(r).fromScene(new RoomEnvironment(),.04).texture;s.environmentIntensity=.65;s.add(new T.HemisphereLight('#fff5e8','#4e5353',1.4));const l=new T.DirectionalLight('#fff0dc',3);l.position.set(-2,4,2);s.add(l);
const c=new T.PerspectiveCamera(74,innerWidth/innerHeight,.025,20);s.add(c);await prepareWeapon(r);const w=createWeapon(c);
window.pose=(id,phase,ads=false)=>{w.setWeapon(id);const d=w.group.userData;w.group.position.fromArray(d.hipPosition||[.22,-.215,-.29]);w.group.rotation.set(0,0,0);c.fov=ads?48:74;if(ads){w.group.position.set(-d.sight[0],-d.sight[1],d.adsDepth??-.35);w.group.rotation.x=d.sightPitch||0;}c.updateProjectionMatrix();w.update({reload:phase,dt:.016});s.updateMatrixWorld(true);r.render(s,c);return w.inspectHands();};window.ready=true;
</script></body></html>`}));
const records=[];
try{await page.goto('http://127.0.0.1:5175/hand-preview');await page.waitForFunction(()=>window.ready,undefined,{timeout:120000});for(const id of process.argv.slice(2).length?process.argv.slice(2):['m16a2','m249','ak','mp5','m1911','m4a1'])for(const phase of [0,.19,.34,.54,.72,.90]){const data=await page.evaluate(({id,phase})=>window.pose(id,phase),{id,phase});await page.screenshot({path:path.join(out,`${id}-${phase.toFixed(2)}.png`)});records.push({id,phase,...data});}console.log(JSON.stringify({errors,records:records.length,maxWristGap:Math.max(...records.flatMap(r=>[r.arms.L.wristGap,r.arms.R.wristGap]))}));}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({type:'Offline exact-phase animation poses, not real-time gameplay proof',errors,records},null,2));await browser.close();}
