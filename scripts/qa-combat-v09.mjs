import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {SETTINGS_KEY} from '../src/simulation.js';
import {WEAPON_AMMO,AMMO_LABELS} from '../src/ammunition.js';

const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const baseURL=option('--url',null),expectedBuild=option('--expected-build',null),expectedHash=option('--expected-sha256',null),chapterId=Number(option('--chapter','6')),gentle=!args.includes('--normal');
assert.ok(baseURL,'Pass the root-approved --url explicitly');assert.equal(new URL(baseURL).hostname,'127.0.0.1');assert.ok(new URL(baseURL).port,'Use the dedicated game preview port');
assert.match(expectedBuild||'',/^index-[A-Za-z0-9_-]+\.js$/);assert.match(expectedHash||'',/^[a-fA-F0-9]{64}$/);
assert.ok(Number.isInteger(chapterId)&&chapterId>=1&&chapterId<=16);
const out=path.resolve('artifacts/combat-v0.9/gameplay/'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,startedAt:new Date().toISOString(),baseURL,expectedBuild,expectedHash,chapterId,gentle,methods:{inputs:'Headless muted Chrome. DOM KeyboardEvent/MouseEvent/click only, no OS input/pointer lock/fullscreen.',positioning:'Disclosed QA teleport only to validated clear shooting/approach points; QA lookAt aims. Actual mouse fire causes all tested damage/death. Actual held W approaches dropped gun; held E collects it.',inventory:'Normal QA chapter load with campaign persistence enabled; no combat demo, damage injection, time changes, health grants or ammunition grants.',difficulty:gentle?'Gentle mode for inventory/input verification; not a normal-difficulty balance claim.':'Normal difficulty.',video:'Continuous live WebGL canvas plus the actual game ceiling output tapped into a MediaStreamDestination; hardware output muted by Chrome. Default .48 master / 1 aircraft / 1 battle in this isolated QA profile. UI independently captured; not an FPS benchmark or offline PCM overlay.'},errors:[],consoleErrors:[],httpErrors:[],checks:[],screenshots:[],bursts:[],attempts:[]};
let browser,page,recording=false;
const inventory=s=>({weaponId:s.state.player.weaponId,mag:s.state.player.mag,stowed:{...s.state.stowedMagazines},reserves:{...s.state.ammoReserves}});
const rounds=v=>v.mag+Object.values(v.stowed).reduce((n,x)=>n+x,0)+Object.values(v.reserves).reduce((n,x)=>n+x,0);
const reserve=s=>s.state.ammoReserves[WEAPON_AMMO[s.state.player.weaponId]];
const drops=s=>s.inspect.weaponDrops||s.state.weaponDrops||[];
const recoil=s=>s.inspect.recoil||s.state.recoil;
const snapshot=()=>page.evaluate(()=>({state:__game.getState(),inspect:__game.inspect(),behavior:__game.behaviorSnapshot(),hud:{reserve:document.getElementById('reserve').textContent,mag:document.getElementById('mag').textContent,weapon:document.getElementById('weapon-label').textContent,interaction:document.getElementById('interaction')?.textContent||'',interactionHidden:document.getElementById('interaction')?.hidden??true}}));
const key=(code,down)=>page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true,repeat:false})),{code,down});
async function tap(code){await key(code,true);await key(code,false);}
const mouse=(button,down)=>page.evaluate(({button,down})=>document.getElementById('game').dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button,buttons:down?(button===2?2:1):0,bubbles:true,clientX:640,clientY:400})),{button,down});
async function click(action){await page.locator(`[data-action="${action}"]`).evaluate(el=>el.click());}
async function screenshot(name){const file=path.join(out,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);return file;}
async function waitSim(seconds){const at=await page.evaluate(()=>__game.behaviorSnapshot().time);await page.waitForFunction(({at,seconds})=>__game.behaviorSnapshot().time>=at+seconds||__game.getState().mode!=='playing',{at,seconds},{timeout:45000});assert.equal((await snapshot()).state.mode,'playing');}
function clearPoint(p,boxes,bounds,r=.38){return p.x>=bounds.minX+r&&p.x<=bounds.maxX-r&&p.z>=bounds.minZ+r&&p.z<=bounds.maxZ-r&&!boxes.some(b=>p.x>b.minX-r&&p.x<b.maxX+r&&p.z>b.minZ-r&&p.z<b.maxZ+r);}
function lineClear(a,b,boxes){for(const box of boxes){let low=0,high=1;for(const axis of ['x','z']){const min=box['min'+axis.toUpperCase()],max=box['max'+axis.toUpperCase()],d=b[axis]-a[axis];if(Math.abs(d)<1e-8){if(a[axis]<min||a[axis]>max){low=2;break;}}else{let x=(min-a[axis])/d,y=(max-a[axis])/d;if(x>y)[x,y]=[y,x];low=Math.max(low,x);high=Math.min(high,y);}}if(low<=high&&high>0&&low<1)return false;}return true;}
function dropPoint(drop){assert.ok(Array.isArray(drop.worldPosition)&&drop.worldPosition.length===3,'Drop inspect must expose explicit XYZ worldPosition');return {x:drop.worldPosition[0],y:drop.worldPosition[1],z:drop.worldPosition[2]};}
function assertHud(s){const shown=Number(s.hud.reserve.match(/\d+/)?.[0]);assert.equal(shown,reserve(s),'HUD reserve must match only the active weapon caliber');assert.ok(s.hud.weapon.includes(AMMO_LABELS[WEAPON_AMMO[s.state.player.weaponId]]),'HUD identifies the active caliber');}
async function settle(){await page.waitForFunction(()=>{const r=__game.inspect().recoil||__game.getState().recoil;return r.timeSinceShot>.8&&r.intensity<.015||__game.getState().mode!=='playing';},undefined,{timeout:45000});assert.equal((await snapshot()).state.mode,'playing');}
async function startVideo(){await page.evaluate(()=>{
  const taps=window.__v09AudioTaps||[];if(!taps.length)throw new Error('Game ceiling audio output has not been connected');
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  const canvasStream=document.getElementById('game').captureStream(24),audioTracks=taps.flatMap(t=>t.sink.stream.getAudioTracks().map(track=>track.clone())),stream=new MediaStream([...canvasStream.getVideoTracks(),...audioTracks]);
  if(stream.getAudioTracks().length!==1)throw new Error('Expected exactly one actual mixed game audio track');
  const chunks=[],recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000,audioBitsPerSecond:128000});
  window.__v09Video={mime,stream,chunks,recorder,started:performance.now(),audioTrackCount:audioTracks.length,videoTrackCount:stream.getVideoTracks().length};
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(200);
});recording=true;}

async function stopVideo(){if(!recording)return;const v=await page.evaluate(async()=>{const v=window.__v09Video;window.__v09Video=null;await new Promise(r=>{v.recorder.onstop=r;v.recorder.stop();});v.stream.getTracks().forEach(t=>t.stop());const blob=new Blob(v.chunks,{type:v.mime}),base64=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.slice(f.result.lastIndexOf(',')+1));f.readAsDataURL(blob);});return{base64,mime:v.mime,audioTrackCount:v.audioTrackCount,videoTrackCount:v.videoTrackCount,audioOutput:window.__v09AudioOutput,wallSeconds:(performance.now()-v.started)/1000,bytes:blob.size};});recording=false;const bytes=Buffer.from(v.base64,'base64');delete v.base64;v.path=path.join(out,'real-fire-and-enemy-weapon-pickup.webm');v.sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(bytes.readUInt32BE(0),0x1a45dfa3);await fs.writeFile(v.path,bytes);report.video=v;assert.equal(v.audioTrackCount,1);assert.ok(v.audioOutput?.nonzeroFrames>0&&v.audioOutput.maxPeak>.0001,'Actual ceiling capture must contain non-silent game sound');}
async function startSampling(){await page.evaluate(()=>{window.__v09Frames=[];window.__v09Sampling=true;const tick=()=>{if(!window.__v09Sampling)return;const s=__game.getState(),i=__game.inspect();let audioOutput={peak:0,rms:0};for(const tap of window.__v09AudioTaps||[]){tap.analyser.getFloatTimeDomainData(tap.samples);let sum=0,peak=0;for(const value of tap.samples){sum+=value*value;peak=Math.max(peak,Math.abs(value));}audioOutput.peak=Math.max(audioOutput.peak,peak);audioOutput.rms=Math.max(audioOutput.rms,Math.sqrt(sum/tap.samples.length));}const meter=window.__v09AudioOutput;meter.frames++;if(audioOutput.peak>.00001)meter.nonzeroFrames++;meter.maxPeak=Math.max(meter.maxPeak,audioOutput.peak);meter.maxRms=Math.max(meter.maxRms,audioOutput.rms);if(s.mode==='playing'&&window.__v09Frames.length<5000)window.__v09Frames.push({wall:performance.now(),time:__game.behaviorSnapshot().time,weaponId:s.player.weaponId,mag:s.player.mag,health:s.player.health,audioOutput,recoil:i.recoil||s.recoil,audio:{shots:i.audio.events.shots||0,hitConfirmations:i.audio.events.hitConfirmations||0,killConfirmations:i.audio.events.killConfirmations||0,actorImpacts:i.audio.events.actorImpacts||0,lastConfirmation:i.audio.lastConfirmation},feedback:{shots:i.combatEffects.shots,actorHits:i.combatEffects.actorHits,lastActorHit:i.combatEffects.lastActorHit},drops:i.weaponDrops||s.weaponDrops});requestAnimationFrame(tick);};requestAnimationFrame(tick);});}
async function stopSampling(){if(!page)return;report.frames=await page.evaluate(()=>{window.__v09Sampling=false;return window.__v09Frames||[];});}
async function fireOnce(aim){
  if(aim)await page.evaluate(p=>__game.lookAt(p.x,p.y,p.z),aim);
  const before=await snapshot(),startFrame=await page.evaluate(()=>window.__v09Frames.length);
  const event=await page.evaluate(()=>new Promise((resolve,reject)=>{const canvas=document.getElementById('game'),start=__game.inspect().audio.events.shots||0,wall=performance.now();const release=()=>canvas.dispatchEvent(new MouseEvent('mouseup',{button:0,buttons:0,bubbles:true}));canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,buttons:1,bubbles:true}));const tick=()=>{const s=__game.getState(),i=__game.inspect();if((i.audio.events.shots||0)>start){release();resolve({shots:i.audio.events.shots-start,ammo:s.player.mag,wallMs:performance.now()-wall});return;}if(s.mode!=='playing'||performance.now()-wall>10000){release();reject(new Error('Actual DOM trigger did not produce a shot; mode='+s.mode));return;}requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
  await settle();const after=await snapshot(),frames=await page.evaluate(at=>window.__v09Frames.slice(at),startFrame),peak=Math.max(...frames.map(f=>f.recoil.intensity));
  assert.ok(peak>.03,'Actual shot must drive a visible recoil spring peak');assert.ok(recoil(after).intensity<peak*.08,'Recoil must recover after releasing the trigger');assert.equal(before.state.player.mag-after.state.player.mag,event.shots,'Actual trigger shot consumes matching rounds');
  const result={beforeTime:before.behavior.time,afterTime:after.behavior.time,weaponId:before.state.player.weaponId,event,peak,endIntensity:recoil(after).intensity,magBefore:before.state.player.mag,magAfter:after.state.player.mag,confirmationsBefore:before.inspect.audio.events.hitConfirmations||0,confirmationsAfter:after.inspect.audio.events.hitConfirmations||0,killConfirmationsAfter:after.inspect.audio.events.killConfirmations||0};report.bursts.push(result);return after;
}
function shootingChoice(s,excluded){
  const candidates=[];
  for(const [index,e]of s.inspect.enemies.entries()){
    if(!e.alive||excluded.has(index))continue;const ai=s.behavior.actors.find(a=>a.id==='enemy-'+index);if((e.weaponId||ai?.weaponId)!=='ak')continue;
    for(const radius of [7,9,5.5])for(let j=0;j<16;j++){const angle=j*Math.PI/8,p={x:e.x+Math.cos(angle)*radius,z:e.z+Math.sin(angle)*radius};
      if(!clearPoint(p,s.inspect.colliders,s.inspect.layout.bounds)||!lineClear(p,e,s.inspect.colliders))continue;
      candidates.push({index,point:p,health:e.health,distance:Math.hypot(p.x-s.state.player.x,p.z-s.state.player.z)});break;
    }
  }
  candidates.sort((a,b)=>b.health-a.health||a.distance-b.distance);return candidates[0];
}
try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(120000);
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()});});
  await page.addInitScript(({settingsKey,gentle})=>{localStorage.setItem(settingsKey,JSON.stringify({graphicsVersion:2,quality:'medium',renderScale:1,gentle,headbob:false,volume:.48,aircraftVolume:1,battleVolume:1,sensitivity:1}));window.__qaSafety={pointerLock:0,fullscreen:0,audioTaps:0,originalDestinationConnections:0};window.__v09AudioTaps=[];window.__v09AudioOutput={frames:0,nonzeroFrames:0,maxPeak:0,maxRms:0};
    Element.prototype.requestPointerLock=function(){window.__qaSafety.pointerLock++;throw new Error('QA forbids pointer lock');};Element.prototype.requestFullscreen=function(){window.__qaSafety.fullscreen++;return Promise.reject(new Error('QA forbids fullscreen'));};
    const connect=AudioNode.prototype.connect,taps=new WeakMap();AudioNode.prototype.connect=function(destination,...ports){
      const result=connect.call(this,destination,...ports);
      if(destination===this.context.destination){
        window.__qaSafety.originalDestinationConnections++;let tap=taps.get(this.context);
        if(!tap){const sink=this.context.createMediaStreamDestination(),analyser=this.context.createAnalyser();analyser.fftSize=2048;connect.call(analyser,sink);tap={sink,analyser,samples:new Float32Array(analyser.fftSize)};taps.set(this.context,tap);window.__v09AudioTaps.push(tap);window.__qaSafety.audioTaps++;}
        connect.call(this,tap.analyser,...ports);
      }return result;
    };},{settingsKey:SETTINGS_KEY,gentle});
  await page.goto(new URL('?qa=1',baseURL).href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__game&&document.querySelector('[data-action="combat-demo"]'));
  assert.equal(await page.title(),'归途 · LAST LIGHT','Verify intended game before inputs');const src=await page.locator('script[type="module"][src]').getAttribute('src');assert.ok(src.endsWith(expectedBuild));const bytes=await(await page.request.get(new URL(src,page.url()).href)).body();report.build={name:expectedBuild,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};assert.equal(report.build.sha256,expectedHash.toLowerCase());
  await page.evaluate(i=>__game.loadChapter(i-1),chapterId);await click('play');await page.waitForFunction(()=>['cinematic','playing'].includes(__game.getState().mode));if((await snapshot()).state.mode==='cinematic')await click('skip-cinematic');await page.waitForFunction(()=>__game.getState().mode==='playing');await waitSim(.15);report.initial=await snapshot();assertHud(report.initial);assert.equal(report.initial.state.player.weaponId,'m16a2');assert.ok(report.initial.state.ammoReserves['556']>0);assert.ok(recoil(report.initial));assert.equal(report.initial.inspect.audio.volume,.48);assert.deepEqual(report.initial.inspect.audio.mix,{aircraft:1,battle:1});
  await startSampling();await startVideo();console.log('START actual fire / enemy drop');
  const excluded=new Set(),killsBefore=report.initial.inspect.audio.events.killConfirmations||0;
  for(let attempt=0;attempt<4&&!report.confirmedKill;attempt++){
    const chosen=shootingChoice(await snapshot(),excluded);assert.ok(chosen,'No clear legal shooting point for an AK enemy');excluded.add(chosen.index);report.attempts.push(chosen);
    await page.evaluate(p=>__game.teleport(p.x,p.z),chosen.point);await mouse(2,true);
    for(let shot=0;shot<8;shot++){
      const state=await snapshot(),enemy=state.inspect.enemies[chosen.index];if(!enemy.alive)break;
      const ai=state.behavior.actors.find(a=>a.id==='enemy-'+chosen.index),height=ai?.stance==='crouch'?.73:1.08;
      const after=await fireOnce({x:enemy.x,y:enemy.y+height,z:enemy.z});
      if(!after.inspect.enemies[chosen.index].alive){
        if((after.inspect.audio.events.killConfirmations||0)>killsBefore){report.confirmedKill={index:chosen.index,state:after};break;}
        break;
      }
    }
    await mouse(2,false);
  }
  assert.ok(report.confirmedKill,'A real DOM shot must receive confirmed lethal feedback');
  while(report.bursts.length<2)await fireOnce();
  const killed=report.confirmedKill,dead=killed.state.inspect.enemies[killed.index],deadAI=killed.state.behavior.actors.find(a=>a.id==='enemy-'+killed.index),drop=drops(killed.state).find(d=>d.enemyIndex===killed.index);
  assert.ok(drop&&!drop.taken&&drop.visible,'A dead enemy must leave a visible physical gun');assert.equal(drop.weaponId,'ak');assert.equal(drop.mag,(dead.weaponAmmo||deadAI).mag);assert.equal(drop.reserve,(dead.weaponAmmo||deadAI).reserve);
  assert.ok(killed.state.inspect.audio.events.actorImpacts>0);assert.ok(killed.state.inspect.audio.events.hitConfirmations>0);assert.ok(killed.state.inspect.combatEffects.actorHits>0);report.dropAtDeath=drop;await screenshot('01-confirmed-kill-and-drop');
  report.checks.push('At least two actual trigger events drive recoil peaks and recover; a real confirmed lethal shot creates an AK with the deceased actor remaining magazine/reserve.');
  console.log('START walk / held E pickup');
  const point=dropPoint(drop),state=await snapshot(),approaches=[];
  for(let j=0;j<24;j++){const angle=j*Math.PI/12,start={x:point.x+Math.cos(angle)*3.05,z:point.z+Math.sin(angle)*3.05},end={x:point.x+Math.cos(angle)*1.55,z:point.z+Math.sin(angle)*1.55};if(clearPoint(start,state.inspect.colliders,state.inspect.layout.bounds)&&clearPoint(end,state.inspect.colliders,state.inspect.layout.bounds)&&lineClear(start,end,state.inspect.colliders)&&lineClear(end,point,state.inspect.colliders))approaches.push(start);}
  assert.ok(approaches.length,'Physical dropped weapon must have a clear walking approach');report.pickupApproach={start:approaches[0],drop:point};await page.evaluate(p=>{__game.teleport(p.start.x,p.start.z);__game.lookAt(p.drop.x,p.drop.y+.09,p.drop.z);},report.pickupApproach);
  const walkStart=await snapshot();await key('KeyW',true);try{await page.waitForFunction(p=>{const s=__game.getState();return Math.hypot(s.player.x-p.x,s.player.z-p.z)<1.7||s.mode!=='playing';},point,{timeout:15000});}finally{await key('KeyW',false);}report.walkedMetres=Math.hypot((await snapshot()).state.player.x-walkStart.state.player.x,(await snapshot()).state.player.z-walkStart.state.player.z);assert.ok(report.walkedMetres>1,'Use real W to enter pickup range');
  await page.evaluate(p=>__game.lookAt(p.x,p.y+1.2,p.z),point);await waitSim(.15);report.standingSight=await snapshot();assert.ok(report.standingSight.hud.interactionHidden||!report.standingSight.hud.interaction.includes('拾取'),'Looking above the gun toward standing-person height must not offer pickup');await screenshot('02a-standing-look-does-not-steal-interaction');
  await page.evaluate(p=>__game.lookAt(p.x,p.y+.09,p.z),point);await waitSim(.15);report.beforePickup=await snapshot();assertHud(report.beforePickup);await screenshot('02-looking-down-at-enemy-gun');
  await key('KeyE',true);try{await page.waitForFunction(index=>(__game.inspect().weaponDrops||__game.getState().weaponDrops).some(d=>d.enemyIndex===index&&d.taken)||__game.getState().mode!=='playing',killed.index,{timeout:15000});}finally{await key('KeyE',false);}report.afterPickup=await snapshot();assert.equal(report.afterPickup.state.mode,'playing');assertHud(report.afterPickup);
  const before=inventory(report.beforePickup),after=inventory(report.afterPickup),taken=drops(report.afterPickup).find(d=>d.enemyIndex===killed.index);
  assert.equal(after.weaponId,'ak');assert.equal(rounds(after)-rounds(before),drop.mag+drop.reserve,'Pickup conserves the physical enemy ammunition');assert.equal(after.stowed.m16a2,before.mag,'Original rifle magazine stays stowed');assert.equal(after.mag,drop.mag);for(const key of ['556','9mm','45'])assert.equal(after.reserves[key],before.reserves[key]);assert.equal(after.reserves['762']-before.reserves['762'],drop.reserve);assert.ok(taken.taken&&!taken.visible);await screenshot('03-ak-equipped-after-hold');
  console.log('START caliber reload / persistence');
  report.beforeReload=await snapshot();await tap('KeyR');await page.waitForFunction(()=>__game.inspect().reloading>0);await page.waitForFunction(()=>__game.inspect().reloading===0||__game.getState().mode!=='playing',undefined,{timeout:45000});report.afterReload=await snapshot();assertHud(report.afterReload);
  const r0=inventory(report.beforeReload),r1=inventory(report.afterReload),loaded=r1.mag-r0.mag;assert.ok(loaded>0);assert.equal(r0.reserves['762']-r1.reserves['762'],loaded);for(const key of ['556','9mm','45'])assert.equal(r1.reserves[key],r0.reserves[key]);assert.equal(rounds(r1),rounds(r0));
  await tap('Digit1');await waitSim(.4);report.returnedRifle=await snapshot();assertHud(report.returnedRifle);assert.equal(report.returnedRifle.state.player.weaponId,'m16a2');assert.equal(report.returnedRifle.state.player.mag,before.mag);assert.equal(report.returnedRifle.state.stowedMagazines.ak,r1.mag);await screenshot('04-original-rifle-magazine-preserved');
  console.log('START actual ammo case +90');
  const caseState=await snapshot(),ammoCase=caseState.inspect.field.find(f=>f.kind==='ammo'&&!f.used);assert.ok(ammoCase,'Chapter must expose a real unused ammunition case');assert.equal(ammoCase.amount,90);report.ammoCase=ammoCase;
  const approach={x:ammoCase.approach[0],z:ammoCase.approach[1]};assert.ok(clearPoint(approach,caseState.inspect.colliders,caseState.inspect.layout.bounds));
  const caseCollider=caseState.inspect.colliders.find(b=>b.fieldId===ammoCase.id);assert.ok(caseCollider,'Use actual case height for the look target');const casePoint={x:ammoCase.pos[0],y:caseCollider.minY+.25,z:ammoCase.pos[1]};
  await page.evaluate(p=>{__game.teleport(p.approach.x,p.approach.z);__game.lookAt(p.target.x,p.target.y,p.target.z);},{approach,target:casePoint});await waitSim(.15);report.beforeCase=await snapshot();assertHud(report.beforeCase);assert.ok(report.beforeCase.hud.interaction.includes('+90'),'Actual case hint advertises current-caliber +90');await screenshot('05-ammo-case-90-before');
  await key('KeyE',true);
  try{await page.waitForFunction(id=>__game.inspect().field.some(f=>f.id===id&&f.used)||__game.getState().mode!=='playing',ammoCase.id,{timeout:15000});report.afterCase=await snapshot();await waitSim(1.75);report.heldAfterCase=await snapshot();}finally{await key('KeyE',false);}
  const c0=inventory(report.beforeCase),c1=inventory(report.afterCase);assert.equal(c1.reserves['556']-c0.reserves['556'],90);for(const k of ['762','9mm','45'])assert.equal(c1.reserves[k],c0.reserves[k]);assert.equal(c1.mag,c0.mag);assert.deepEqual(c1.stowed,c0.stowed);assert.deepEqual(inventory(report.heldAfterCase),c1,'Keeping E held cannot repeatedly collect the same case');assert.equal(report.heldAfterCase.inspect.narrative.phase,'idle','A supply interaction must not enter the always-near radio dialogue');assertHud(report.heldAfterCase);await screenshot('06-ammo-case-opened-once');
  report.checks.push('Actual held E opens the +90 ammunition case once, adds only the active 5.56 caliber and leaves the nearby radio narrative idle.');
  await tap('Escape');await page.waitForFunction(()=>__game.getState().mode==='paused');report.saved=await snapshot();assert.ok(report.saved.state.saved.fieldCheckpoint);assert.ok(report.saved.state.saved.fieldCheckpoint.weaponDrops.some(d=>d.enemyIndex===killed.index&&d.taken));report.savedInventory=inventory(report.saved);await stopSampling();await stopVideo();
  report.checks.push('Real W approach and held E pickup equips AK, preserves original M16 magazine and conserves all remaining rounds; R transfers only 7.62 ammunition.');
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__game&&document.querySelector('[data-action="continue"]'));await click('continue');await page.waitForFunction(()=>__game.getState().mode==='playing');await waitSim(.15);report.restored=await snapshot();assert.deepEqual(inventory(report.restored),report.savedInventory);assertHud(report.restored);await page.waitForFunction(()=>__game.inspect().audio.contextState==='running',undefined,{timeout:10000});report.restoredAudio=await page.evaluate(()=>__game.inspect().audio);assert.ok(report.restoredAudio.persistentSources>=6,'Continue must initialize the audio graph after a fresh page load');
  const restoredDrop=drops(report.restored).find(d=>d.enemyIndex===killed.index);assert.ok(restoredDrop?.taken&&!restoredDrop.visible,'Collected weapon stays absent after a real page reload');assert.ok(report.restored.inspect.field.find(f=>f.id===report.ammoCase.id)?.used,'Consumed ammunition case stays consumed after reload');
  await page.evaluate(p=>{__game.teleport(p.player.x,p.player.z);__game.lookAt(p.drop.x,p.drop.y+.09,p.drop.z);},{player:report.afterPickup.state.player,drop:point});
  await startSampling();const resumedShotCount=(await snapshot()).inspect.audio.events.shots||0;report.resumedShot=await fireOnce({x:point.x,y:point.y+.09,z:point.z});assert.ok(report.resumedShot.inspect.audio.events.shots>resumedShotCount,'A real shot after Continue must emit sound events');report.resumeFrames=await page.evaluate(()=>{window.__v09Sampling=false;return window.__v09Frames;});const restoredInventoryAfterShot=inventory(report.resumedShot);
  await key('KeyE',true);try{await waitSim(.9);}finally{await key('KeyE',false);}report.afterRepeatedE=await snapshot();assert.deepEqual(inventory(report.afterRepeatedE),restoredInventoryAfterShot,'Holding E after restore cannot award the gun/ammunition twice');assert.equal(drops(report.afterRepeatedE).filter(d=>d.enemyIndex===killed.index).length,1);await screenshot('07-reload-no-duplicate-pickup');
  report.checks.push('Actual page reload restores typed reserves, active/stowed magazines and consumed drop; audio initializes and a real shot sounds after Continue; repeated E cannot duplicate a weapon or rounds.');
  report.safety=await page.evaluate(()=>({...__qaSafety,locked:Boolean(document.pointerLockElement),fullscreenActive:Boolean(document.fullscreenElement)}));assert.equal(report.safety.pointerLock,0);assert.equal(report.safety.fullscreen,0);assert.equal(report.safety.locked,false);assert.equal(report.safety.fullscreenActive,false);assert.ok(report.safety.audioTaps>=1&&report.safety.originalDestinationConnections>=1);assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.httpErrors,[]);report.passed=true;
}catch(error){report.failure=String(error.stack||error);try{report.failureState=await snapshot();await screenshot('failure');await stopSampling();}catch{}console.log('FAIL '+error.message);}
finally{
  if(page){await mouse(0,false).catch(()=>{});await mouse(2,false).catch(()=>{});for(const code of ['KeyE','KeyW','KeyR'])await key(code,false).catch(()=>{});try{await stopVideo();}catch(error){report.videoFailure=String(error);}}
  if(browser)await browser.close();report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),checks:report.checks,failure:report.failure?.split('\n')[0]}));if(!report.passed)process.exitCode=1;
}
