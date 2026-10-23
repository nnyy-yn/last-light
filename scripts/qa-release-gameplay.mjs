import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Hidden actual-time capture: DOM input only, no OS focus, pointer lock,
// teleport, resource overrides, injected threats, or accelerated simulation.
// node scripts/qa-release-gameplay.mjs [http://127.0.0.1:5174/] --expected-build index-HASH.js [--expected-sha256 HEX]
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const args=process.argv.slice(2),flag=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const expectedBuild=flag('--expected-build'),expectedSha256=flag('--expected-sha256');
assert.match(expectedBuild||'',/^index-[A-Za-z0-9_-]+\.js$/,'Final capture requires --expected-build index-HASH.js.');
if(args.includes('--expected-sha256'))assert.match(expectedSha256||'',/^[a-fA-F0-9]{64}$/,'--expected-sha256 must be a SHA256 hex digest.');
const base=new URL(args.find(value=>/^https?:/.test(value))||'http://127.0.0.1:5174/');
assert.ok(['127.0.0.1','localhost'].includes(base.hostname));
base.searchParams.set('qa','1');
const output=path.join(root,'artifacts','release-v0.6');
await fs.mkdir(output,{recursive:true});
const report={passed:false,startedAt:new Date().toISOString(),url:base.href,expectedBuild,expectedSha256,
 capture:{width:1280,height:800,quality:'high',renderScale:1,fpsRequested:24,audio:false,
 video:'Actual WebGL canvas; accompanying screenshots include the HUD. Headless capture is not a hardware performance benchmark.'},
 safety:{headless:true,input:'DOM events only',pointerCaptured:false},
 setup:'Battle demo menu entry, original spawn, normal simulation and ammunition.',
 actions:[],screenshots:[],samples:[],errors:[],networkFailures:[],assetRecovery:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
page.setDefaultTimeout(120000);
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()}: ${r.url()}`);});
page.on('requestfailed',r=>report.networkFailures.push({url:r.url(),error:r.failure()?.errorText}));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
let recording=false,videoSaved=false;
const click=selector=>page.locator(selector).evaluate(b=>b.click());
const key=(code,down)=>page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true})),{code,down});
const fire=down=>page.evaluate(down=>(down?document.getElementById('game'):window).dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button:0,bubbles:true})),down);
const sample=()=>page.evaluate(()=>({state:window.__game.getState(),behavior:window.__game.behaviorSnapshot(),pointerCaptured:!!document.pointerLockElement,fullscreen:!!document.fullscreenElement}));
async function shot(name){const file=path.join(output,`${name}.png`);await page.screenshot({path:file});report.screenshots.push(file);}
async function faceEnemy(){return page.evaluate(()=>{
 const g=window.__game,p=g.getState().player,e=g.inspect().enemies.filter(e=>e.alive).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
 if(e)g.lookAt(e.x,1.25,e.z);return e?{x:e.x,z:e.z}:null;
});}
async function startVideo(){await page.evaluate(()=>{
 const stream=document.getElementById('game').captureStream(24),chunks=[],mimeType='video/webm;codecs=vp8';
 const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6500000});
 window.__releaseCapture={stream,chunks,recorder,mimeType};
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(250);
});recording=true;}
async function auditAssets(){
 // Chromium may report a completed large GLB stream as aborted. Readiness above
 // requires every model loader to finish; additionally verify those exact bytes.
 for(const failure of report.networkFailures){
  if(failure.error!=='net::ERR_ABORTED'||!failure.url.match(/\.glb(?:\?|$)/)){report.errors.push(`${failure.error}: ${failure.url}`);continue;}
  const result=await page.evaluate(async url=>{try{const r=await fetch(url),b=await r.arrayBuffer(),v=new DataView(b);return{url,bytes:b.byteLength,valid:r.ok&&b.byteLength>=12&&v.getUint32(0,true)===0x46546c67&&v.getUint32(4,true)===2&&v.getUint32(8,true)===b.byteLength};}catch(e){return{url,valid:false,error:String(e)};}},failure.url);
  report.assetRecovery.push(result);if(!result.valid)report.errors.push(`Unrecovered model: ${failure.url}`);
 }
}
async function saveVideo(){if(!recording||videoSaved)return;
 const result=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const c=window.__releaseCapture;c.recorder.onerror=e=>reject(String(e.error));
  c.recorder.onstop=()=>{c.stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onerror=()=>reject(String(reader.error));reader.onload=()=>resolve({base64:String(reader.result).split(',')[1],mimeType:c.mimeType});reader.readAsDataURL(new Blob(c.chunks,{type:'video/webm'}));};c.recorder.stop();
 }));const file=path.join(output,'gameplay.webm');await fs.writeFile(file,Buffer.from(result.base64,'base64'));
 report.video={path:file,bytes:(await fs.stat(file)).size,mimeType:result.mimeType};recording=false;videoSaved=true;
}
try{
 await page.goto(base.href);
 report.servedScripts=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(node=>node.src));
 report.bundleUrl=report.servedScripts.find(url=>new URL(url).origin===base.origin&&new URL(url).pathname.endsWith('/'+expectedBuild));
 assert.ok(report.bundleUrl,`Expected approved build ${expectedBuild}; served ${report.servedScripts.join(', ')}.`);
 const bundle=await page.request.get(report.bundleUrl);assert.ok(bundle.ok(),'Approved bundle must be readable.');
 report.bundleSha256=createHash('sha256').update(await bundle.body()).digest('hex');
 if(expectedSha256)assert.equal(report.bundleSha256,expectedSha256.toLowerCase(),'Approved bundle SHA256 must match.');
 await page.waitForFunction(()=>window.__game);
 await click('[data-action="combat-demo"]');await click('[data-action="play"]');
 await page.waitForFunction(()=>window.__game.getState().mode==='playing');await pause(800);
 report.initial=await sample();assert.equal(report.initial.state.chapter,6);
 assert.equal(report.initial.state.render.quality,'high');assert.equal(report.initial.state.render.renderScale,1);
 assert.equal(report.initial.state.player.mag,30);
 await startVideo();const start=Date.now(),done=new Set();
 const actions=[
  [1,'opening screenshot',()=>shot('gameplay-opening')],
  [3,'walk forward',()=>key('KeyW',true)],
  [7,'stop walking',()=>key('KeyW',false)],
  [8,'aim camera at an existing enemy',()=>faceEnemy()],
  [9,'fire starting rifle',()=>fire(true)],
  [9.6,'release trigger',()=>fire(false)],
  [12,'squad screenshot',()=>shot('gameplay-squad')],
  [13,'select M249 and automatic reload',async()=>{await key('Digit2',true);await key('Digit2',false);}],
  [22,'aim camera at an existing enemy',()=>faceEnemy()],
  [24,'fire M249',()=>fire(true)],
  [25.2,'release trigger',()=>fire(false)],
  [29,'M249 screenshot',()=>shot('gameplay-m249')]
 ];
 while(Date.now()-start<32000){
  const time=(Date.now()-start)/1000;
  for(let i=0;i<actions.length;i++)if(time>=actions[i][0]&&!done.has(i)){done.add(i);const result=await actions[i][2]();report.actions.push({wallSeconds:(Date.now()-start)/1000,name:actions[i][1],result});}
  const s=await sample();s.wallSeconds=(Date.now()-start)/1000;report.samples.push(s);
  assert.equal(s.pointerCaptured,false);assert.equal(s.fullscreen,false);assert.equal(s.state.mode,'playing');
  await pause(200);
 }
 await key('KeyW',false);await fire(false);report.wallSeconds=(Date.now()-start)/1000;
 report.final=await sample();await saveVideo();
 // Separate stationary comparison of the user's reported street corner.
 await page.evaluate(()=>{window.__game.teleport(2,30);window.__game.lookAt(-6,.55,30);});
 await pause(500);await shot('gameplay-street-corner');
 report.cornerScreenshotSetup='Developer camera placement after recording, matching the reported street corner; excluded from movement and combat measurements.';
 const first=report.initial,last=report.final;report.gameSeconds=last.behavior.time-first.behavior.time;
 report.playerDistance=distance(first.state.player,last.state.player);
 const shots=new Map();for(const s of report.samples)for(const shot of s.behavior.shots)shots.set(`${shot.shooterId}:${shot.time}`,shot);
 report.shotsByFaction=Object.fromEntries(['enemy','ally'].map(f=>[f,[...shots.values()].filter(s=>s.faction===f).length]));
 report.actorSummary=first.behavior.actors.map(a=>{const states=report.samples.map(s=>s.behavior.actors.find(b=>b.id===a.id)).filter(Boolean);return{id:a.id,role:a.role,maxDisplacement:Math.max(0,...states.map(b=>distance(a,b))),behaviors:[...new Set(states.map(b=>b.behavior))],shotsFired:states.at(-1)?.shotsFired||0};});
 const primaryId=first.state.player.weaponId,primary=report.samples.filter(s=>s.state.player.weaponId===primaryId),m249=report.samples.filter(s=>s.state.player.weaponId==='m249');
 report.primaryWeapon=primaryId;report.primaryRoundsFired=first.state.player.mag-Math.min(...primary.map(s=>s.state.player.mag));
 report.m249Loaded=Math.max(...m249.map(s=>s.state.player.mag));report.m249RoundsFired=report.m249Loaded-last.state.player.mag;
 assert.ok(report.playerDistance>2,'Actual key input must move the player.');
 assert.ok(report.shotsByFaction.enemy>0&&report.shotsByFaction.ally>0,'Both sides must actually fire.');
 assert.ok(report.actorSummary.some(a=>a.role==='companion'&&a.maxDisplacement>2),'Squad must move.');
 assert.equal(last.state.player.weaponId,'m249');assert.ok(report.primaryRoundsFired>0&&report.m249RoundsFired>0,'Both selected weapons must actually fire.');
 await auditAssets();assert.deepEqual(report.errors,[]);report.passed=true;
 console.log(JSON.stringify({passed:true,expectedBuild,bundleSha256:report.bundleSha256,wallSeconds:report.wallSeconds,gameSeconds:report.gameSeconds,shotsByFaction:report.shotsByFaction,playerDistance:report.playerDistance,primaryWeapon:report.primaryWeapon,primaryRoundsFired:report.primaryRoundsFired,m249RoundsFired:report.m249RoundsFired,video:report.video}));
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;console.error(error);await shot('gameplay-failure').catch(()=>{});}
finally{
 await key('KeyW',false).catch(()=>{});await fire(false).catch(()=>{});
 await saveVideo().catch(e=>{report.errors.push(`Video save: ${e}`);report.passed=false;process.exitCode=1;});
 report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(output,'gameplay-report.json'),JSON.stringify(report,null,2));await browser.close();
}
