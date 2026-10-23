import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {PLAYER_WEAPON_IDS} from '../src/weapon.js';

// node scripts/qa-audio-gameplay.mjs http://127.0.0.1:5175/
// node scripts/qa-audio-gameplay.mjs http://127.0.0.1:5174/ --expected-build index-HASH.js --expected-sha256 HEX
// Records the ACTUAL post-limiter Web Audio graph, not a synthetic substitute.
// Hardware output is disconnected, Chrome is muted, and input stays in a hidden
// page. The separate aircraft diagnostic uses the documented QA preview API.
const args=process.argv.slice(2),flag=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const expectedBuild=flag('--expected-build'),expectedSha256=flag('--expected-sha256');
const base=new URL(args.find(x=>/^https?:/.test(x))||'http://127.0.0.1:5175/');
assert.ok(['127.0.0.1','localhost'].includes(base.hostname));base.searchParams.set('qa','1');
if(expectedBuild||base.port==='5174')assert.match(expectedBuild||'',/^index-[A-Za-z0-9_-]+\.js$/,'Production audio QA requires --expected-build.');
if(args.includes('--expected-sha256')){assert.ok(expectedBuild);assert.match(expectedSha256||'',/^[a-fA-F0-9]{64}$/);}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.join(root,'artifacts/release-v0.6/audio',`${expectedBuild?.replace(/\.js$/,'')||'dev'}-${stamp}`);await fs.mkdir(out,{recursive:true});
const report={passed:false,startedAt:new Date().toISOString(),url:base.href,expectedBuild,expectedSha256,
  recording:'Real game WebAudio final-destination connection redirected after the limiter into MediaStreamAudioDestinationNode and recorded as Opus WebM.',
  input:'Headless page DOM clicks and synthetic keyboard/mouse events; no native input, focus, pointer lock or speaker playback.',
  safety:{chromeMuted:true,nativeAudioDestinationDisconnected:true,headless:true},
  limitation:'Peak/RMS/clipping and spectral differences establish signal properties only. No subjective listening quality, historic authenticity or isolated-stem quality is inferred from waveforms. Weapon clips contain real game ambience.',
  clips:[],checks:[],samples:[],actions:[],screenshots:[],errors:[],requestFailures:[]};
const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
let browser,page,recording=false;

function installAudioCapture(){
  const nativeConnect=AudioNode.prototype.connect,byContext=new WeakMap(),upstream=new WeakMap(),records=[];
  AudioNode.prototype.connect=function(destination,...ports){
    const ctx=this.context;
    if(destination===ctx.destination&&typeof ctx.createMediaStreamDestination==='function'){
      let tap=byContext.get(ctx);
      if(!tap){
        const media=ctx.createMediaStreamDestination(),analyser=ctx.createAnalyser();analyser.fftSize=2048;
        nativeConnect.call(analyser,media);tap={ctx,media,analyser,connections:[],recorder:null,chunks:[]};byContext.set(ctx,tap);records.push(tap);
      }
      const seen=new Set(),ancestors=[];function walk(node){if(seen.has(node))return;seen.add(node);ancestors.push(node.constructor.name);for(const source of upstream.get(node)||[])walk(source);}walk(this);
      tap.connections.push({node:this.constructor.name,time:ctx.currentTime,ancestors:[...new Set(ancestors)]});
      nativeConnect.call(this,tap.analyser,...ports);
      return destination; // Preserve AudioNode.connect's return contract.
    }
    if(destination&&typeof destination==='object'){if(!upstream.has(destination))upstream.set(destination,new Set());upstream.get(destination).add(this);}
    return nativeConnect.call(this,destination,...ports);
  };
  const current=()=>records.at(-1);
  function meter(){const t=current();if(!t)return null;const data=new Float32Array(t.analyser.fftSize);t.analyser.getFloatTimeDomainData(data);let sum=0,peak=0;for(const v of data){sum+=v*v;peak=Math.max(peak,Math.abs(v));}return{rms:Math.sqrt(sum/data.length),samplePeak:peak};}
  async function analyse(bytes,exportWav=false){
    // Decode the captured WebM without connecting any buffer to any output.
    const offline=new OfflineAudioContext(2,1,48000),buffer=await offline.decodeAudioData(bytes.slice(0));
    const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
    const summarize=(from,to)=>{let sum=0,peak=0,clipped=0,n=0;const channelRms=[];for(const values of channels){let channelSum=0;for(let i=from;i<to;i++){const v=values[i];sum+=v*v;channelSum+=v*v;peak=Math.max(peak,Math.abs(v));if(Math.abs(v)>=.999)clipped++;n++;}channelRms.push(Math.sqrt(channelSum/Math.max(1,to-from)));}return{rms:Math.sqrt(sum/Math.max(1,n)),samplePeak:peak,clippedSamples:clipped,clippedRatio:clipped/Math.max(1,n),channelRms};};
    const windows=[];for(let from=0;from<buffer.length;from+=buffer.sampleRate)windows.push({start:from/buffer.sampleRate,...summarize(from,Math.min(buffer.length,from+buffer.sampleRate))});
    // Hann-windowed FFT on evenly spaced windows of the REAL recorded PCM.
    const size=1024,real=new Float64Array(size),imag=new Float64Array(size),bands=[0,0,0,0,0],limits=[120,500,2000,8000,Infinity];let totalPower=0,weighted=0,frames=0;
    const stride=Math.max(size,Math.floor(buffer.length/128));
    for(let offset=0;offset+size<=buffer.length;offset+=stride){
      for(let i=0;i<size;i++){real[i]=channels.reduce((sum,c)=>sum+c[offset+i],0)/channels.length*(.5-.5*Math.cos(2*Math.PI*i/(size-1)));imag[i]=0;}
      for(let i=1,j=0;i<size;i++){let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];}}
      for(let length=2;length<=size;length<<=1){const angle=-2*Math.PI/length;for(let start=0;start<size;start+=length)for(let j=0;j<length/2;j++){const c=Math.cos(angle*j),s=Math.sin(angle*j),a=start+j,b=a+length/2,tr=real[b]*c-imag[b]*s,ti=real[b]*s+imag[b]*c;real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;}}
      for(let bin=1;bin<size/2;bin++){const frequency=bin*buffer.sampleRate/size,power=real[bin]**2+imag[bin]**2;if(frequency<20)continue;bands[limits.findIndex(limit=>frequency<limit)]+=power;totalPower+=power;weighted+=power*frequency;}frames++;
    }
    const stats={duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,frames:buffer.length,...summarize(0,buffer.length),windows,
      spectrum:{method:'1024-point Hann FFT, at most 128 evenly spaced decoded-audio windows',frames,centroidHz:weighted/Math.max(1e-30,totalPower),bands:Object.fromEntries(['20-120Hz','120-500Hz','500-2000Hz','2000-8000Hz','8000Hz+'].map((label,i)=>[label,bands[i]/Math.max(1e-30,totalPower)]))}};
    let wav=null;
    if(exportWav){
      const dataBytes=buffer.length*channels.length*2,raw=new ArrayBuffer(44+dataBytes),view=new DataView(raw);
      const text=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
      text(0,'RIFF');view.setUint32(4,36+dataBytes,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels.length,true);
      view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels.length*2,true);view.setUint16(32,channels.length*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,dataBytes,true);
      let offset=44;for(let i=0;i<buffer.length;i++)for(const c of channels){const value=Math.max(-1,Math.min(1,c[i]));view.setInt16(offset,Math.round(value*(value<0?32768:32767)),true);offset+=2;}
      const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(new Blob([raw],{type:'audio/wav'}));});
      wav={base64,bytes:raw.byteLength,sampleRate:buffer.sampleRate,channels:channels.length,bitsPerSample:16,source:'Decoded PCM from this exact actual-game WebM recording; no regeneration, splicing or gain normalization.'};
    }
    return{stats,wav};
  }
  window.__audioCapture={
    inspect(){return{contexts:records.length,contextState:current()?.ctx.state,currentTime:current()?.ctx.currentTime,connections:records.flatMap(t=>t.connections),nativeDestinationConnections:0,meter:meter()};},
    start(){const t=current();if(!t)throw Error('Game audio never connected its final output');if(t.recorder?.state==='recording')throw Error('Recording is already active');
      const mimeType=['audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mimeType)throw Error('No Opus/WebM MediaRecorder support');
      t.chunks=[];t.recorder=new MediaRecorder(t.media.stream,{mimeType,audioBitsPerSecond:192000});t.recorder.ondataavailable=e=>{if(e.data.size)t.chunks.push(e.data);};t.recorder.start(200);t.startedWall=performance.now();t.startedAudio=t.ctx.currentTime;return{mimeType,startedAudio:t.startedAudio,connections:t.connections};},
    async stop(exportWav=false){const t=current();if(!t?.recorder||t.recorder.state!=='recording')return null;await new Promise((resolve,reject)=>{t.recorder.onerror=e=>reject(e.error||Error('MediaRecorder error'));t.recorder.onstop=resolve;t.recorder.stop();});
      const blob=new Blob(t.chunks,{type:t.recorder.mimeType}),bytes=await blob.arrayBuffer();
      const wallSeconds=(performance.now()-t.startedWall)/1000,audioSeconds=t.ctx.currentTime-t.startedAudio;
      const {stats,wav}=await analyse(bytes,exportWav),base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
      return{base64,bytes:blob.size,mimeType:blob.type,wallSeconds,audioSeconds,stats,wav};
    }
  };
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const click=selector=>page.locator(selector).evaluate(el=>el.click());
const key=(code,down)=>page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true})),{code,down});
async function press(code){await key(code,true);await key(code,false);}
const trigger=down=>page.evaluate(down=>(down?document.getElementById('game'):window).dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button:0,bubbles:true})),down);
async function read(){const s=await page.evaluate(()=>({state:__game.getState(),world:__game.inspect(),behavior:__game.behaviorSnapshot(),capture:__audioCapture.inspect(),pointer:!!document.pointerLockElement,fullscreen:!!document.fullscreenElement}));assert.equal(s.pointer,false);assert.equal(s.fullscreen,false);assert.ok(s.world.audio,'Root must expose Soundscape.inspect() before this script runs.');return s;}
async function shot(name){const file=path.join(out,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);}
async function waitFor(predicate,label,timeout=90000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const s=await read();if(predicate(s))return s;await sleep(80);}throw Error('Timeout: '+label);}
async function waitGame(seconds){const before=await read();return waitFor(s=>{assert.equal(s.state.mode,'playing');return s.behavior.time-before.behavior.time>=seconds;},`normal game loop ${seconds}s`);}
async function startClip(name,scope){const info=await page.evaluate(()=>__audioCapture.start());recording={name,scope,info};}
async function stopClip(){
  if(!recording)return null;const meta=recording,record=await page.evaluate(exportWav=>__audioCapture.stop(exportWav),['battle-45-seconds','aircraft-distance-diagnostic'].includes(meta.name));recording=false;
  if(!record)throw Error('Missing recorded audio');const bytes=Buffer.from(record.base64,'base64'),file=path.join(out,meta.name+'.webm');await fs.writeFile(file,bytes);delete record.base64;
  if(record.wav){const wavBytes=Buffer.from(record.wav.base64,'base64'),wavPath=path.join(out,meta.name+'.wav');await fs.writeFile(wavPath,wavBytes);delete record.wav.base64;record.wav.path=wavPath;record.wav.sha256=createHash('sha256').update(wavBytes).digest('hex');}
  const clip={...meta,...record,path:file,sha256:createHash('sha256').update(bytes).digest('hex')};report.clips.push(clip);return clip;
}
async function editSettings(values){
  let current=await read();if(current.state.mode==='playing'){await press('Escape');await waitFor(s=>s.state.mode==='paused','pause before settings');}
  await click('[data-action="settings"]');
  for(const[name,value]of Object.entries(values))await page.locator(`[data-setting="${name}"]`).evaluate((el,value)=>{if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));},value);
  await click('[data-action="back"]');current=await read();if(current.state.mode==='paused'){await click('[data-action="resume"]');await waitFor(s=>s.world.audio.contextState==='running','resume game audio');}
}
async function freshDemo(){let s=await read();if(s.state.mode!=='menu'){if(s.state.mode==='playing')await press('Escape');await click('[data-action="menu"]');}await click('[data-action="combat-demo"]');await click('[data-action="play"]');s=await waitFor(s=>s.state.mode==='playing'&&s.world.audio.contextState==='running','actual combat demo and live WebAudio');assert.equal(s.state.chapter,6);return s;}
const totalAmmo=s=>s.state.resources.ammo+s.state.player.mag+Object.values(s.state.stowedMagazines).reduce((a,b)=>a+b,0);
const eventCount=(sample,name)=>sample.world.audio.events[name]||0;
async function faceEnemy(){return page.evaluate(()=>{const p=__game.getState().player,e=__game.inspect().enemies.filter(e=>e.alive).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];if(e)__game.lookAt(e.x,1.2,e.z);return e?{x:e.x,z:e.z}:null;});}

async function naturalBattle(){
  await freshDemo();const initial=await waitFor(s=>s.world.audio.aircraft.sampleLoaded===true,'real helicopter sample loads and decodes',30000);assert.equal(totalAmmo(initial),90);report.battleInitial={player:initial.state.player,audio:initial.world.audio};
  await startClip('battle-45-seconds','Actual battle-demo spawn; normal input, time and authored aircraft/explosions. No teleports or injected threats.');
  const start=Date.now(),done=new Set(),events=[
    [2,'walk forward',()=>key('KeyW',true)],[5,'stop walking',()=>key('KeyW',false)],
    [7,'look toward existing hostile',faceEnemy],[8,'M16 trigger down',()=>trigger(true)],[8.8,'release trigger',()=>trigger(false)],
    [11,'reload',()=>press('KeyR')],[16,'M16 trigger down',()=>trigger(true)],[16.8,'release trigger',()=>trigger(false)],
    [21,'select M249',()=>press('Digit2')],[33,'look toward existing hostile',faceEnemy],
    [35,'M249 trigger down',()=>trigger(true)],[36.2,'release trigger',()=>trigger(false)],
    [40,'battle screenshot',()=>shot('battle-audio-recording')]
  ];
  while(Date.now()-start<45000){const t=(Date.now()-start)/1000;for(let i=0;i<events.length;i++)if(t>=events[i][0]&&!done.has(i)){done.add(i);const result=await events[i][2]();report.actions.push({section:'natural battle',wallSeconds:(Date.now()-start)/1000,name:events[i][1],result});}
    const s=await read();assert.equal(s.state.mode,'playing');report.samples.push({section:'natural battle',wallSeconds:(Date.now()-start)/1000,gameTime:s.behavior.time,player:s.state.player,audio:s.world.audio,meter:s.capture.meter,aircraft:s.world.aircraft,shots:s.behavior.shots});await sleep(200);
  }
  await key('KeyW',false);await trigger(false);const final=await read(),clip=await stopClip();report.battleFinal={player:final.state.player,audio:final.world.audio,wallSeconds:(Date.now()-start)/1000,gameSeconds:final.behavior.time-initial.behavior.time};
  assert.ok(clip.stats.duration>40,'Recorded WebAudio must contain approximately 45 seconds, not a short substitute.');assert.ok(clip.stats.rms>1e-4,'Actual battle mix must be audible in the recorded signal.');
  assert.ok(eventCount(final,'shots')>eventCount(initial,'shots'));assert.ok(eventCount(final,'remoteShots')>eventCount(initial,'remoteShots'));assert.ok(eventCount(final,'impacts')>eventCount(initial,'impacts'),'Authored battle must produce at least one actual explosion event.');
  report.checks.push({name:'45-second actual game mix',shots:eventCount(final,'shots')-eventCount(initial,'shots'),remoteShots:eventCount(final,'remoteShots')-eventCount(initial,'remoteShots'),impacts:eventCount(final,'impacts')-eventCount(initial,'impacts'),clippedRatio:clip.stats.clippedRatio});
  assert.ok(clip.stats.clippedRatio<.01,'Recorded final mix must not spend 1% or more of samples at digital full scale.');
}
async function aircraftDiagnostic(){
  await freshDemo();await startClip('aircraft-distance-diagnostic','QA preview trajectory, explicitly not a natural flythrough: 90m left → 12m left → 12m right → 90m right. Game scene and audio renderer remain real.');
  const initial=await read(),p=initial.state.player,samples=[];
  async function position(distance,panSign){const right={x:Math.cos(p.yaw),z:-Math.sin(p.yaw)},forward={x:-Math.sin(p.yaw),z:-Math.cos(p.yaw)};const pos=[p.x+(right.x*.75*panSign+forward.x*.5)*distance,p.y+Math.sqrt(.1875)*distance,p.z+(right.z*.75*panSign+forward.z*.5)*distance];await page.evaluate(pos=>__game.setAircraftPreview(pos,[0,0,0]),pos);}
  async function observe(seconds,tag){const start=Date.now();while(Date.now()-start<seconds*1000){const s=await read();samples.push({tag,wallSeconds:(Date.now()-start)/1000,audio:s.world.audio.aircraft,meter:s.capture.meter,position:s.world.aircraft?.position});await sleep(100);}return samples.at(-1);}
  await position(90,-1);const farLeft=await observe(2,'far-left');
  for(let i=0;i<=24;i++){await position(90-78*i/24,-1);await observe(.10,'approach-left');}
  const nearLeft=await observe(2,'near-left');await position(12,1);const nearRight=await observe(2,'near-right');
  for(let i=0;i<=24;i++){await position(12+78*i/24,1);await observe(.10,'depart-right');}
  const farRight=await observe(2,'far-right');await page.evaluate(()=>__game.setAircraftPreview(null));const clip=await stopClip();
  report.checks.push({name:'aircraft controlled diagnostic',farLeft,nearLeft,nearRight,farRight,samples,clip:clip.path});
  assert.ok(nearLeft.audio.gain>farLeft.audio.gain*1.4,'Near aircraft must have materially greater gain than the distant aircraft.');assert.ok(nearLeft.audio.pan<-.2&&nearRight.audio.pan>.2,'Aircraft pan must follow the actual left/right geometry.');
  assert.ok(samples.some(s=>Math.abs(s.audio.radialVelocity)>2));assert.ok(samples.every(s=>Number.isFinite(s.audio.rate)&&s.audio.rate>0));assert.ok(Math.max(...samples.map(s=>s.audio.rate))-Math.min(...samples.map(s=>s.audio.rate))>.005,'Approach/departure must change inspected playback rate.');
}
async function pauseAndMix(){
  const before=await read();await press('Escape');const paused=await waitFor(s=>s.state.mode==='paused'&&s.world.audio.contextState==='suspended','paused audio clock');await sleep(750);const held=await read();
  assert.equal(held.world.audio.currentTime,paused.world.audio.currentTime);assert.equal(held.world.audio.activeVoices,0);assert.equal(held.world.audio.queuedVoices,0);assert.equal(held.capture.currentTime,paused.capture.currentTime);
  await click('[data-action="resume"]');const resumed=await waitFor(s=>s.world.audio.contextState==='running'&&s.world.audio.currentTime>paused.world.audio.currentTime+.15,'audio clock resumes');
  report.checks.push({name:'pause cancels transients and freezes actual context clock',before:before.world.audio,paused:paused.world.audio,held:held.world.audio,resumed:resumed.world.audio});
  await editSettings({volume:0});await sleep(1000);await startClip('master-volume-zero','Actual game master volume set to zero through settings.');await sleep(1500);const muted=await read(),silent=await stopClip();assert.equal(muted.world.audio.volume,0);assert.ok(silent.stats.rms<1e-5,'Muted game output must actually be silent in captured PCM.');
  await editSettings({volume:.5});await sleep(350);await startClip('master-volume-half','Actual game master volume restored to 0.5 through settings.');await sleep(2000);const audible=await read(),restored=await stopClip();assert.equal(audible.world.audio.volume,.5);assert.ok(restored.stats.rms>1e-4);
  // Channel controls are exercised through the actual settings UI. The mix API
  // reports their gains; the final master route is also checked independently.
  await editSettings({aircraftVolume:0,battleVolume:0});await sleep(450);const channelMuted=await read();
  assert.equal(channelMuted.world.audio.aircraft.gain,0);assert.equal(channelMuted.world.audio.fire.gain,0);
  await editSettings({aircraftVolume:1,battleVolume:1});await sleep(350);
  await press('Escape');await click('[data-action="settings"]');
  const persisted=await page.locator('[data-setting]').evaluateAll(nodes=>Object.fromEntries(nodes.filter(n=>['volume','aircraftVolume','battleVolume'].includes(n.dataset.setting)).map(n=>[n.dataset.setting,Number(n.value)])));
  assert.deepEqual(persisted,{volume:.5,aircraftVolume:1,battleVolume:1});await click('[data-action="back"]');await click('[data-action="resume"]');
  report.checks.push({name:'master and aircraft/battle channel sliders',silent:silent.stats,restored:restored.stats,channelMuted:channelMuted.world.audio,persisted});
  await press('Escape');await click('[data-action="menu"]');const menu=await waitFor(s=>s.state.mode==='menu'&&s.world.audio.contextState==='suspended','menu audio lifecycle');
  assert.equal(menu.world.audio.activeVoices,0);assert.equal(menu.world.audio.queuedVoices,0);assert.ok(menu.world.audio.resetCount>before.world.audio.resetCount);report.checks.push({name:'menu clears voices and resets envelopes',audio:menu.world.audio});
}
async function weapons(){
  const clips=[];
  for(const id of PLAYER_WEAPON_IDS){let before=await freshDemo();assert.equal(totalAmmo(before),90);await press('Digit'+(PLAYER_WEAPON_IDS.indexOf(id)+1));
    before=await waitFor(s=>s.state.player.weaponId===id&&s.state.player.mag>0&&s.world.audio.contextState==='running','selected loaded weapon');
    await page.waitForFunction(()=>!document.getElementById('weapon-label').textContent.includes('装填中'),undefined,{timeout:90000});await waitGame(.4);
    before=await read();await page.evaluate(p=>__game.lookAt(p.x,.25,p.z-8),before.state.player);await startClip('weapon-'+id,'Real fresh combat-demo budget and weapon trigger; background ambience is present, so this is not an isolated studio stem.');
    await sleep(200);await trigger(true);try{await waitGame(.65);}finally{await trigger(false);}await sleep(1200);
    const after=await read(),clip=await stopClip(),rounds=before.state.player.mag-after.state.player.mag;
    assert.ok(rounds>0);assert.equal(eventCount(before,'shots')+rounds,eventCount(after,'shots'),'Each actual shot must reach the audio engine exactly once.');assert.ok(clip.stats.rms>1e-4);
    clips.push({id,rounds,clip:clip.path,stats:clip.stats,eventsBefore:before.world.audio.events,eventsAfter:after.world.audio.events});
  }
  report.weaponComparison={scope:'Six actual-game trigger recordings, including real background ambience. Spectral differences are measured, not judged as authenticity.',clips};
}
async function settingsPersistence(){
  let s=await read();if(s.state.mode==='playing')await press('Escape');s=await read();if(s.state.mode!=='menu')await click('[data-action="menu"]');
  await page.setViewportSize({width:960,height:600});await click('[data-action="settings"]');
  const expected={volume:.35,aircraftVolume:.25,battleVolume:.75},layout=[];
  for(const[name,value]of Object.entries(expected)){
    const result=await page.locator(`[data-setting="${name}"]`).evaluate((el,value)=>{el.scrollIntoView({block:'center'});el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));const r=el.getBoundingClientRect();return{name:el.dataset.setting,value:Number(el.value),rect:{x:r.x,y:r.y,width:r.width,height:r.height},reachable:r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight};},value);
    assert.equal(result.reachable,true,`${name} slider must be reachable by scrolling at 960×600.`);layout.push(result);
  }
  await shot('settings-audio-960');
  const back=await page.locator('[data-action="back"]').evaluate(el=>{el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{rect:{x:r.x,y:r.y,width:r.width,height:r.height},reachable:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};});
  assert.equal(back.reachable,true,'Save/back button must remain scroll-reachable at 960×600.');await shot('settings-save-960');await click('[data-action="back"]');
  await page.reload();await page.waitForFunction(()=>window.__game,undefined,{timeout:180000});await click('[data-action="settings"]');
  const restored=await page.locator('[data-setting]').evaluateAll(nodes=>Object.fromEntries(nodes.filter(n=>['volume','aircraftVolume','battleVolume'].includes(n.dataset.setting)).map(n=>[n.dataset.setting,Number(n.value)])));
  assert.deepEqual(restored,expected,'All three actual audio sliders must survive a real page reload.');
  await click('[data-action="back"]');await freshDemo();await sleep(350);const audio=(await read()).world.audio;assert.equal(audio.volume,expected.volume);
  assert.equal(audio.mix.aircraft,expected.aircraftVolume);assert.equal(audio.mix.battle,expected.battleVolume);
  report.checks.push({name:'960×600 audio settings scroll reach and real reload persistence',layout,back,expected,restored,audio});
}
async function validateRequests(){report.assetRecovery=[];for(const failure of report.requestFailures){if(failure.error!=='net::ERR_ABORTED'||!/\.glb(?:\?|$)/.test(failure.url)){report.errors.push(`Request ${failure.error}: ${failure.url}`);continue;}if(report.assetRecovery.some(r=>r.url===failure.url))continue;const result=await page.evaluate(async url=>{try{const r=await fetch(url),b=await r.arrayBuffer(),v=new DataView(b);return{url,bytes:b.byteLength,valid:r.ok&&b.byteLength>=12&&v.getUint32(0,true)===0x46546c67&&v.getUint32(8,true)===b.byteLength};}catch(e){return{url,valid:false,error:String(e)}}},failure.url);report.assetRecovery.push(result);if(!result.valid)report.errors.push('Unrecovered GLB '+failure.url);}}

try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio','--autoplay-policy=no-user-gesture-required']});
  page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.setDefaultTimeout(120000);await page.addInitScript(installAudioCapture);
  page.on('pageerror',e=>report.errors.push('JS '+e));page.on('console',m=>{if(m.type()==='error')report.errors.push('Console '+m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push('HTTP '+r.status()+' '+r.url());});page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
  await page.goto(base.href);report.servedScripts=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(n=>n.src));
  if(expectedBuild){report.bundleUrl=report.servedScripts.find(url=>new URL(url).origin===base.origin&&new URL(url).pathname.endsWith('/'+expectedBuild));assert.ok(report.bundleUrl,'Approved build is not served');const response=await page.request.get(report.bundleUrl);assert.ok(response.ok());report.bundleSha256=createHash('sha256').update(await response.body()).digest('hex');if(expectedSha256)assert.equal(report.bundleSha256,expectedSha256.toLowerCase());}
  else{report.developmentSources={};for(const file of['src/audio.js','src/main.js'])report.developmentSources[file]=createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');}
  await page.waitForFunction(()=>window.__game,undefined,{timeout:180000});await editSettings({volume:.5,aircraftVolume:1,battleVolume:1,gentle:true,headbob:false,quality:'high',renderScale:1});
  await naturalBattle();console.log('AUDIO PASS: actual 45-second battle recording, sample decode and peak/RMS analysis');
  if(!args.includes('--smoke')){await aircraftDiagnostic();console.log('AUDIO PASS: controlled aircraft distance, pan and rate');}
  await pauseAndMix();console.log('AUDIO PASS: pause, master/channel volume and menu cleanup');
  if(!args.includes('--smoke')){if(!args.includes('--skip-weapons')){await weapons();console.log('AUDIO PASS: all six real weapon triggers');}await settingsPersistence();console.log('AUDIO PASS: 960×600 audio controls and persistence');}
  const final=await read();report.capture=final.capture;assert.equal(final.capture.nativeDestinationConnections,0);assert.ok(final.capture.connections.some(c=>c.ancestors.includes('DynamicsCompressorNode')&&c.node==='WaveShaperNode'),'Capture must follow the compressor and final ceiling shaper.');
  if(final.state.mode==='playing')await press('Escape');if((await read()).state.mode!=='menu')await click('[data-action="menu"]');report.menuFinal=(await read()).world.audio;assert.equal(report.menuFinal.activeVoices,0);assert.equal(report.menuFinal.queuedVoices,0);
  await validateRequests();assert.deepEqual(report.errors,[]);report.passed=true;
  console.log(JSON.stringify({passed:true,expectedBuild,bundleSha256:report.bundleSha256,clips:report.clips.length,checks:report.checks.length,errors:report.errors,out}));
}catch(error){report.failure=error.stack||String(error);process.exitCode=1;console.error(report.failure);if(page){try{report.failedState=await read();await shot('failure');}catch{}}}
finally{if(page){await key('KeyW',false).catch(()=>{});await trigger(false).catch(()=>{});await stopClip().catch(e=>report.errors.push('Capture finalization '+e));}await browser?.close();report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
