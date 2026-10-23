import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {PLAYER_WEAPON_IDS,WEAPON_DEFINITIONS} from '../src/weapon.js';

// Captures actual rendered frames on the live RAF clock. No time scaling,
// synthetic animation poses, resource writes, pointer lock or desktop input.
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const isDev=args.includes('--dev'),expectedBuild=option('--expected-build');if(!isDev)assert.match(expectedBuild||'',/^index-[A-Za-z0-9_-]+\.js$/,'Pass the current approved preview bundle, or explicitly select --dev for provisional source testing.');
const base=new URL(args.find(a=>/^https?:/.test(a))||'http://127.0.0.1:5174/');assert.ok(['localhost','127.0.0.1'].includes(base.hostname));base.searchParams.set('qa','1');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'artifacts','model-upgrade-v0.6','reload-frames',isDev?`dev-${Date.now()}`:expectedBuild.replace(/\.js$/,''));await fs.mkdir(out,{recursive:true});
const require=createRequire(import.meta.url),dependency=path.join(process.env.USERPROFILE,'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules');
const {chromium}=require(path.join(dependency,'playwright')),sharp=require(path.join(dependency,'sharp'));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.setDefaultTimeout(120000);
const report={passed:false,startedAt:new Date().toISOString(),expectedBuild:expectedBuild||'dev-source',provisional:isDev,url:base.href,headless:true,input:'In-page DOM events only',policy:'Real game RAF, normal 90-round campaign start; M249 receives +12 only through walking to and interacting with chapter 2 supplies.',videoPolicy:'Six independent live canvas.captureStream(24) MediaRecorder WebM recordings; real wall time, no audio track, no screenshot assembly or time scaling.',weapons:[],errors:[],requestFailures:[]};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),click=selector=>page.locator(selector).evaluate(b=>b.click());
const key=(code,down)=>page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true})),{code,down});
const tap=async code=>{await key(code,true);await key(code,false);};
const trigger=down=>page.evaluate(down=>(down?document.getElementById('game'):window).dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button:0,buttons:down?1:0,bubbles:true})),down);
const aim=down=>page.evaluate(down=>(down?document.getElementById('game'):window).dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button:2,buttons:down?2:0,bubbles:true})),down);
const read=()=>page.evaluate(()=>({state:__game.getState(),time:__game.behaviorSnapshot().time,pose:__game.inspectHands?.()||null,reloading:document.getElementById('weapon-label').textContent.includes('装填中'),pointer:!!document.pointerLockElement,fullscreen:!!document.fullscreenElement}));
const budget=s=>s.resources.ammo+s.player.mag+Object.values(s.stowedMagazines).reduce((a,b)=>a+b,0);
const vectorDistance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function inspectSequence(sequence){
 const snapshots=sequence.samples.map(s=>s.pose).filter(Boolean),first=sequence.initialPose,last=snapshots.at(-1),stages=[...new Set(snapshots.map(p=>p.stage))];
 assert.ok(first&&last,'Both original grip and final grip must be recorded.');
 const metrics={stages,byStage:{},arms:{},maxMagazineDisplacement:0,magazineReturnError:null};
 for(const stage of stages){const matching=sequence.samples.filter(s=>s.pose?.stage===stage);metrics.byStage[stage]={samples:matching.length,firstGameSecond:matching[0].gameSeconds,lastGameSecond:matching.at(-1).gameSeconds};}
 for(const side of ['L','R']){
  const armFrames=snapshots.map(p=>p.arms?.[side]);assert.ok(armFrames.every(Boolean),`${side} articulated arm samples must be present.`);
  for(const arm of armFrames){for(const k of ['shoulder','elbow','wrist','forearmEnd'])assert.ok(Array.isArray(arm[k])&&arm[k].length===3&&arm[k].every(Number.isFinite),`${side}.${k} must remain finite.`);assert.ok(Number.isFinite(arm.wristGap));assert.equal(arm.fingers.length,15,'All five fingers require live articulated joints.');assert.ok(arm.fingers.every(f=>f.position.length===3&&f.position.every(Number.isFinite)));}
  const baseline=first.arms[side].wrist;
  metrics.arms[side]={maxWristGap:Math.max(...armFrames.map(a=>a.wristGap)),maxWristTravel:Math.max(...armFrames.map(a=>vectorDistance(a.wrist,baseline))),gripReturnError:vectorDistance(last.arms[side].wrist,baseline)};
  assert.ok(metrics.arms[side].maxWristGap<.01,`${side} wrist detached from forearm by more than 1 cm.`);
  assert.ok(metrics.arms[side].gripReturnError<.006,`${side} wrist did not return to its original grip.`);
 }
 assert.ok(metrics.arms.L.maxWristTravel>.15,'The support hand must actually leave the fore-end and reach the magazine/pouch.');
 assert.ok(metrics.arms.R.maxWristTravel<.01,'The firing hand must maintain its grip during reload.');
 for(const stage of ['reach','remove','retrieve','insert','settle','return','hold'])assert.ok(stages.includes(stage),`Missing actual ${stage} stage samples.`);
 assert.ok(snapshots.every(p=>p.bones===68&&Number.isFinite(p.reload)),'Preserve the 68-bone skin throughout the reload.');
 assert.ok(first.magazine&&last.magazine,'A real movable magazine or ammunition container must be present.');
 metrics.maxMagazineDisplacement=Math.max(...snapshots.map(p=>vectorDistance(p.magazine,first.magazine)));
 metrics.magazineReturnError=vectorDistance(last.magazine,first.magazine);
 assert.ok(metrics.maxMagazineDisplacement>.15,'The magazine must visibly move out of its seated position.');
 assert.ok(metrics.magazineReturnError<.002,'The magazine must return to its original seated position.');
 return metrics;
}
async function waitGame(seconds){const first=await read(),deadline=Date.now()+90000;while(Date.now()<deadline){const now=await read();assert.equal(now.state.mode,'playing');assert.equal(now.pointer,false);assert.equal(now.fullscreen,false);if(now.time-first.time>=seconds)return now;await sleep(35);}throw new Error('Normal game clock did not advance.');}
async function walkTo(x,z){const deadline=Date.now()+90000;while(Date.now()<deadline){const a=await read(),p=a.state.player;if(Math.hypot(p.x-x,p.z-z)<.8){await key('KeyW',false);return a;}await page.evaluate(({x,z})=>{const p=__game.getState().player;__game.lookAt(x,p.y,z);},{x,z});await key('KeyW',true);await sleep(55);}await key('KeyW',false);throw new Error('Walking route to the real supply task failed.');}
async function freshChapter(){const old=await read();if(old.state.mode==='playing')await tap('Escape');if((await read()).state.mode!=='menu')await page.evaluate(()=>__game.action('menu'));await click('[data-action="new"]');if((await read()).state.mode==='confirm')await click('[data-action="confirm-new"]');await page.evaluate(()=>__game.loadChapter(1));await click('[data-action="play"]');const start=await waitGame(.25);assert.equal(start.state.chapter,2);assert.equal(budget(start.state),90);return start;}
async function captureReload(id){
 return await page.evaluate(async({id,reloadTime})=>{
  const g=window.__game,canvas=document.getElementById('game'),start=g.behaviorSnapshot().time,startWall=performance.now(),frames=[],samples=[],thresholds=Array.from({length:13},(_,i)=>i/12),initial=g.getState(),initialPose=g.inspectHands();let next=0,finishedAt=null,frameNumber=0;
  if(typeof canvas.captureStream!=='function'||typeof MediaRecorder==='undefined')throw new Error('This browser cannot record the actual canvas stream.');
  const stream=canvas.captureStream(24),mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
  if(!mimeType){stream.getTracks().forEach(t=>t.stop());throw new Error('No supported WebM MediaRecorder codec.');}
  const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6000000}),chunks=[];let recordingError=null;
  recorder.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data);});
  recorder.addEventListener('error',event=>{recordingError=String(event.error||'MediaRecorder error');});
  const recordingStopped=new Promise(resolve=>recorder.addEventListener('stop',resolve,{once:true}));
  const recordingStartedWall=performance.now();recorder.start(250);
  const state=()=>({state:g.getState(),time:g.behaviorSnapshot().time,pose:g.inspectHands?.()||null,reloading:document.getElementById('weapon-label').textContent.includes('装填中')});
  const image=(s,raf)=>({frameNumber,rafTimestamp:raf,wallSeconds:(performance.now()-startWall)/1000,gameSeconds:s.time-start,observedProgress:s.reloading?Math.min(1,(s.time-start)/reloadTime):1,animationProgress:s.pose?.reload,pose:s.pose,ammo:{mag:s.state.player.mag,reserve:s.state.resources.ammo},jpeg:canvas.toDataURL('image/jpeg',.91).split(',')[1]});
  const result=new Promise((resolve,reject)=>{const tick=raf=>{frameNumber++;const s=state(),elapsed=s.time-start;
   if(document.pointerLockElement||document.fullscreenElement){reject(new Error('Unexpected pointer/fullscreen capture'));return;}
   if(s.state.mode!=='playing'||s.state.player.weaponId!==id){reject(new Error('Playback left the expected weapon/chapter'));return;}
   samples.push({frameNumber,rafTimestamp:raf,wallSeconds:(performance.now()-startWall)/1000,gameSeconds:elapsed,reloading:s.reloading,mag:s.state.player.mag,reserve:s.state.resources.ammo,pose:s.pose});
   const progress=Math.min(1,elapsed/reloadTime);
   if(s.reloading&&next<thresholds.length&&progress>=thresholds[next]){frames.push(image(s,raf));while(next<thresholds.length&&progress>=thresholds[next])next++;}
   if(!s.reloading&&elapsed>.2){if(finishedAt===null){finishedAt=elapsed;frames.push(image(s,raf));}if(elapsed-finishedAt>.3){frames.push(image(s,raf));resolve({initial,initialPose,final:s.state,startGameTime:start,finishedGameSeconds:finishedAt,wallSeconds:(performance.now()-startWall)/1000,frames,samples});return;}}
   if(performance.now()-startWall>90000){reject(new Error('Reload capture timed out'));return;}requestAnimationFrame(tick);
  };requestAnimationFrame(tick);});
  try{
   for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{code:'KeyR',key:'r',bubbles:true}));
   const sequence=await result,recordingWallSeconds=(performance.now()-recordingStartedWall)/1000;recorder.stop();await recordingStopped;
   if(recordingError)throw new Error(recordingError);
   const blob=new Blob(chunks,{type:mimeType}),base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
   const video=document.createElement('video'),url=URL.createObjectURL(blob);let dimensions;
   try{video.preload='metadata';await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Recorded WebM metadata could not be decoded')),10000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error('Recorded WebM is not playable'));};video.src=url;});dimensions={width:video.videoWidth,height:video.videoHeight,containerDuration:Number.isFinite(video.duration)?video.duration:null};}
   finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
   sequence.video={base64,mimeType,bytes:blob.size,requestedFramesPerSecond:24,recordedWallSeconds:recordingWallSeconds,videoTracks:stream.getVideoTracks().length,audioTracks:stream.getAudioTracks().length,trackSettings:stream.getVideoTracks()[0].getSettings(),...dimensions,metadataValidated:true,revokedPreviewUrl:url,source:'Live canvas stream during this exact reload; no frame synthesis; no audio.'};return sequence;
  }finally{if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());}
 },{id,reloadTime:WEAPON_DEFINITIONS[id].reloadTime});
}
async function captureAdsPauseReload(){
 return await page.evaluate(async reloadTime=>{
  const g=window.__game,canvas=document.getElementById('game'),start=g.behaviorSnapshot().time,startWall=performance.now(),initial=g.getState(),initialPose=g.inspectHands(),frames=[],samples=[],events=[];
  let frameNumber=0,pausedAtWall=null,pauseStart=null,resumed=false,finishedAt=null,completionState=null;
  const key=code=>{for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));};
  const snapshot=()=>({state:g.getState(),time:g.behaviorSnapshot().time,pose:g.inspectHands(),reloading:document.getElementById('weapon-label').textContent.includes('装填中')});
  const image=(s,raf,label)=>({label,frameNumber,rafTimestamp:raf,wallSeconds:(performance.now()-startWall)/1000,gameSeconds:s.time-start,animationProgress:s.pose.reload,pose:s.pose,fov:s.state.render.fov,mode:s.state.mode,ammo:{mag:s.state.player.mag,reserve:s.state.resources.ammo},jpeg:canvas.toDataURL('image/jpeg',.91).split(',')[1]});
  const result=new Promise((resolve,reject)=>{const tick=raf=>{
   frameNumber++;const s=snapshot(),wall=(performance.now()-startWall)/1000,elapsed=s.time-start;
   if(document.pointerLockElement||document.fullscreenElement){reject(new Error('Unexpected pointer/fullscreen capture'));return;}
   if(s.state.player.weaponId!=='m16a2'||!['playing','paused'].includes(s.state.mode)){reject(new Error('ADS/pause test left its expected weapon or mode'));return;}
   samples.push({frameNumber,rafTimestamp:raf,wallSeconds:wall,gameSeconds:elapsed,mode:s.state.mode,fov:s.state.render.fov,reloading:s.reloading,mag:s.state.player.mag,reserve:s.state.resources.ammo,pose:s.pose});
   if(frameNumber===1)frames.push(image(s,raf,'ADS to reload'));
   if(pausedAtWall===null&&s.reloading&&s.pose.reload>=.32){
    frames.push(image(s,raf,'Before Esc'));key('Escape');pauseStart=snapshot();pausedAtWall=performance.now();events.push({name:'pause',wallSeconds:wall,gameSeconds:elapsed,state:pauseStart});key('KeyR');
   }else if(pausedAtWall!==null&&!resumed&&performance.now()-pausedAtWall>=1400){
    events.push({name:'paused-after-1.4s',wallSeconds:wall,gameSeconds:elapsed,state:s});frames.push(image(s,raf,'Paused 1.4s'));key('Escape');resumed=true;events.push({name:'resume',wallSeconds:wall,gameSeconds:elapsed,state:snapshot()});
   }else if(resumed&&!s.reloading&&s.state.mode==='playing'){
    if(finishedAt===null){finishedAt=elapsed;completionState=s;events.push({name:'complete',wallSeconds:wall,gameSeconds:elapsed,state:s});frames.push(image(s,raf,'Reload completed'));key('KeyR');}
    if(elapsed-finishedAt>=.6){events.push({name:'settled-no-extra-transfer',wallSeconds:wall,gameSeconds:elapsed,state:s});frames.push(image(s,raf,'Settled'));resolve({initial,initialPose,final:s.state,startGameTime:start,finishedGameSeconds:finishedAt,wallSeconds:wall,frames,samples,events,pauseStart,completionState,reloadTime});return;}
   }else if(resumed&&s.reloading&&frames.at(-1)?.label!=='Resumed insertion'&&s.pose.stage==='insert'){frames.push(image(s,raf,'Resumed insertion'));}
   if(performance.now()-startWall>90000){reject(new Error('ADS/pause reload timed out'));return;}requestAnimationFrame(tick);
  };requestAnimationFrame(tick);});key('KeyR');return result;
 },WEAPON_DEFINITIONS.m16a2.reloadTime);
}
async function checkAdsPause(){
 const result={id:'m16a2',passed:false};report.adsPause=result;
 await freshChapter();assert.equal((await read()).state.player.weaponId,'m16a2');
 await trigger(true);await waitGame(.28);await trigger(false);await waitGame(.65);await aim(true);await waitGame(.75);
 result.aimed=await read();assert.ok(Number.isFinite(result.aimed.state.render.fov),'Expose read-only getState().render.fov for the ADS check.');assert.ok(result.aimed.state.render.fov<50,'Right button must engage the normal 48-degree ADS view before reloading.');
 const sequence=await captureAdsPauseReload();result.sequence=sequence;await saveSequence('m16a2-ads-pause',sequence);
 const paused=sequence.samples.filter(s=>s.mode==='paused'),start=sequence.pauseStart,after=sequence.events.find(e=>e.name==='paused-after-1.4s').state;
 assert.ok(paused.length>=2);assert.ok(sequence.events.find(e=>e.name==='paused-after-1.4s').wallSeconds-sequence.events.find(e=>e.name==='pause').wallSeconds>=1.4);
 assert.ok(start.state.render.fov>65,'Reload must leave ADS even while the right mouse button remains held.');
 for(const s of paused){assert.equal(s.gameSeconds,start.time-sequence.startGameTime,'Game clock must freeze while paused.');assert.deepEqual(s.pose,start.pose,'The stage, both articulated hands, fingers and magazine must remain frozen.');assert.equal(s.mag,start.state.player.mag);assert.equal(s.reserve,start.state.resources.ammo);}
 assert.deepEqual(after.pose,start.pose);assert.ok(start.pose.reload>0&&start.pose.reload<1);assert.ok(['remove','retrieve'].includes(start.pose.stage),'Pause must happen inside the actual magazine movement.');
 assert.equal(budget(sequence.initial),budget(sequence.final));assert.equal(sequence.initial.player.mag,start.state.player.mag,'No ammunition should transfer before the pause.');
 let previous=sequence.initial.player.mag,transfers=0;for(const s of sequence.samples){if(s.mag!==previous){assert.ok(!s.reloading&&s.mode==='playing','Ammunition may transfer only after resumed reload completion.');transfers++;previous=s.mag;}}
 assert.equal(transfers,1,'Paused R presses and post-completion R must never duplicate ammunition transfer.');assert.equal(sequence.final.player.mag,WEAPON_DEFINITIONS.m16a2.magSize);assert.equal(sequence.initial.resources.ammo-sequence.final.resources.ammo,sequence.final.player.mag-sequence.initial.player.mag);
 assert.ok(sequence.finishedGameSeconds>=WEAPON_DEFINITIONS.m16a2.reloadTime-.08);assert.equal(sequence.completionState.pose.stage,'hold');assert.equal(sequence.samples.at(-1).pose.stage,'hold');
 result.freeze={wallSeconds:sequence.events.find(e=>e.name==='paused-after-1.4s').wallSeconds-sequence.events.find(e=>e.name==='pause').wallSeconds,stage:start.pose.stage,reload:start.pose.reload,adsFov:result.aimed.state.render.fov,reloadFov:start.state.render.fov,transfers};result.passed=true;await aim(false);console.log(JSON.stringify({adsPause:result.freeze,contactSheet:sequence.contactSheet}));
}
async function saveSequence(id,sequence){
 if(sequence.video){const video=sequence.video,bytes=Buffer.from(video.base64,'base64');assert.ok(bytes.length>10000,'The live recording must contain encoded video data.');assert.equal(bytes.readUInt32BE(0),0x1a45dfa3,'A real WebM/EBML stream is required.');assert.equal(video.audioTracks,0);assert.equal(video.videoTracks,1);assert.ok(video.width>=640&&video.height>=400,'The browser must decode actual full-size recorded video.');video.file=path.join(out,`${id}-reload.webm`);video.sha256=createHash('sha256').update(bytes).digest('hex');await fs.writeFile(video.file,bytes);delete video.base64;}
 const layers=[];for(let i=0;i<sequence.frames.length;i++){const frame=sequence.frames[i],file=path.join(out,`${id}-${String(i).padStart(2,'0')}.jpg`),bytes=Buffer.from(frame.jpeg,'base64');assert.ok(bytes.length>10000,'Captured actual canvas must contain scene pixels.');await fs.writeFile(file,bytes);frame.file=file;delete frame.jpeg;
  const label=Buffer.from(`<svg width="426" height="30"><rect width="426" height="30" fill="#101817"/><text x="10" y="21" fill="#e5d9b6" font-family="Arial" font-size="15">${id} / game ${frame.gameSeconds.toFixed(3)}s / frame ${frame.frameNumber}</text></svg>`),thumb=await sharp(bytes).resize(426,266).toBuffer(),tile=await sharp({create:{width:426,height:296,channels:3,background:'#101817'}}).composite([{input:thumb,top:30,left:0},{input:label,top:0,left:0}]).png().toBuffer();layers.push({input:tile,left:(i%3)*426,top:Math.floor(i/3)*296});
 }const sheet=path.join(out,`${id}-sequence.png`);await sharp({create:{width:1278,height:Math.ceil(layers.length/3)*296,channels:3,background:'#101817'}}).composite(layers).png().toFile(sheet);sequence.contactSheet=sheet;
}
try{
 report.handSourceSha256=createHash('sha256').update(await fs.readFile(path.join(root,'src/first-person-hands.js'))).digest('hex');
 await page.goto(base.href);await page.waitForFunction(()=>window.__game,{timeout:180000});const served=await page.locator('script[type=module][src]').evaluateAll(nodes=>nodes.map(n=>n.src));const script=served.find(url=>new URL(url).pathname.endsWith(isDev?'/src/main.js':'/'+expectedBuild));assert.ok(script,'Expected current approved build.');report.bundleSha256=createHash('sha256').update(await(await page.request.get(script)).body()).digest('hex');
 assert.equal(await page.evaluate(()=>typeof __game.inspectHands),'function','The read-only inspectHands interface must be integrated before this test runs.');
 for(const id of PLAYER_WEAPON_IDS){const result={id,passed:false};report.weapons.push(result);result.start=await freshChapter();const slot=PLAYER_WEAPON_IDS.indexOf(id)+1;await tap('Digit'+slot);await page.waitForFunction(id=>{const p=__game.getState().player;return p.weaponId===id&&p.mag>0&&!document.getElementById('weapon-label').textContent.includes('装填中');},id,{timeout:90000});await waitGame(.55);
  if(id==='m249'){const before=await read();await walkTo(0,46);await walkTo(-2.4,45);await key('KeyE',true);try{await page.waitForFunction(()=>__game.getState().task>=1,{timeout:30000});}finally{await key('KeyE',false);}result.supplies={before:before.state,after:(await read()).state};assert.equal(budget(result.supplies.after)-budget(result.supplies.before),12);}
  const before=await read();await page.evaluate(()=>{const p=__game.getState().player;__game.lookAt(p.x,p.y-.3,p.z-16);});await trigger(true);await waitGame(.28);await trigger(false);await waitGame(.65);const fired=await read();assert.ok(fired.state.player.mag<before.state.player.mag);assert.ok(fired.state.resources.ammo>0);result.shots=before.state.player.mag-fired.state.player.mag;
  const sequence=await captureReload(id);await saveSequence(id,sequence);result.sequence=sequence;assert.equal(budget(sequence.initial),budget(sequence.final));assert.ok(sequence.final.player.mag>sequence.initial.player.mag);assert.ok(sequence.frames.length>=9,'Reload must have enough actual temporal samples.');assert.ok(sequence.finishedGameSeconds>=WEAPON_DEFINITIONS[id].reloadTime-.08);assert.ok(sequence.samples.filter(s=>s.reloading).every(s=>s.mag===sequence.initial.player.mag),'Ammunition must transfer only after the animation window.');assert.ok(sequence.samples.some(s=>s.pose),'Read-only pose samples are required.');result.motion=inspectSequence(sequence);result.passed=true;console.log(JSON.stringify({id,frames:sequence.frames.length,gameSeconds:sequence.finishedGameSeconds,motion:result.motion,contactSheet:sequence.contactSheet}));
 }
 await checkAdsPause();
 const releasedPreviews=new Set(report.weapons.map(w=>w.sequence?.video).filter(v=>v?.metadataValidated).map(v=>v.revokedPreviewUrl));
 for(const failure of report.requestFailures){if(failure.error==='net::ERR_ABORTED'&&releasedPreviews.has(failure.url)){failure.disposition='Only the successfully decoded QA-owned preview blob was deliberately revoked after metadata inspection.';continue;}if(failure.error!=='net::ERR_ABORTED'||!failure.url.endsWith('.glb')){report.errors.push(`${failure.error} ${failure.url}`);continue;}const r=await page.request.get(failure.url),b=await r.body();assert.ok(r.ok()&&b.readUInt32LE(0)===0x46546c67&&b.readUInt32LE(8)===b.length,'Any aborted model request must be revalidated byte-for-byte.');}
 assert.equal(createHash('sha256').update(await fs.readFile(path.join(root,'src/first-person-hands.js'))).digest('hex'),report.handSourceSha256,'Hands source changed during capture; do not accept HMR-mixed evidence.');
 assert.deepEqual(report.errors,[]);report.passed=true;report.visualReviewRequired=true;
}catch(error){report.failure=String(error.stack||error);console.error(error);process.exitCode=1;}finally{await key('KeyW',false).catch(()=>{});await key('KeyE',false).catch(()=>{});await trigger(false).catch(()=>{});await aim(false).catch(()=>{});report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
