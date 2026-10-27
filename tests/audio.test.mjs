import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundscape,renderSoundPCM,AUDIO_VOICE_LIMIT} from '../src/audio.js';

const rms=(data,start=0,end=data.length)=>Math.sqrt(data.subarray(start,end).reduce((sum,v)=>sum+v*v,0)/Math.max(1,end-start));
function lowBand(data,sampleRate,cutoff=180){const a=1-Math.exp(-Math.PI*2*cutoff/sampleRate),out=new Float32Array(data.length);let current=0;for(let i=0;i<data.length;i++){current+=a*(data[i]-current);out[i]=current;}return out;}

test('gunshots have a sharp finite attack, pressure body and quiet tail within the same peak ceiling',()=>{
  for(const weaponId of['m16a2','m4a1','m249','akm','mp5','m1911','mounted-m2']){
    const pcm=renderSoundPCM('shot',{sampleRate:24000,seed:107,weaponId}),data=pcm.channels[0];
    assert.ok(data.every(Number.isFinite),weaponId);assert.ok(Math.max(...data.map(Math.abs))<=.881,weaponId);
    assert.ok(rms(data,0,240)>.08,'first 10 ms must contain a clear shot attack');
    assert.ok(rms(data,240,1200)>.015,'pressure body must survive the initial crack');
    assert.ok(rms(data,Math.floor(.4*pcm.sampleRate))<.009,'no long hiss between rounds');
    assert.deepEqual(pcm,renderSoundPCM('shot',{sampleRate:24000,seed:107,weaponId}));
  }
});

test('mounted .50 sound is a lower longer pressure pulse and distant reports lose sharp detail',()=>{
  const opts={sampleRate:24000,seed:107},rifle=renderSoundPCM('shot',{...opts,weaponId:'m4a1'}).channels[0],heavy=renderSoundPCM('shot',{...opts,gunType:'mounted-m2'}).channels[0];
  const ratio=data=>rms(lowBand(data,24000),0,2400)/rms(data,0,2400);
  assert.ok(ratio(heavy)>ratio(rifle)*1.1,'heavy shot must change its spectrum, not only its amplitude');
  assert.ok(rms(heavy,1200,2400)>rms(rifle,1200,2400),'heavy pressure body persists longer');
  const far=renderSoundPCM('shot',{...opts,weaponId:'m4a1',distant:true}).channels[0];
  const edge=data=>Math.sqrt(data.slice(1).reduce((sum,v,i)=>sum+(v-data[i])**2,0)/(data.length-1));
  assert.ok(edge(far)<edge(rifle)*.6,'distant gunfire must lose the nearby brittle crack');
});

test('metal, masonry, wood and sand impacts are distinct short sounds and actor confirmation ends quickly',()=>{
  const sounds=['metal','masonry','wood','sand'].map(material=>renderSoundPCM('bullet-impact',{sampleRate:24000,seed:58,material}));
  for(const pcm of sounds){assert.ok(pcm.channels[0].every(Number.isFinite));assert.ok(pcm.duration<=.25);assert.ok(rms(pcm.channels[0])>.015);}
  for(let i=1;i<sounds.length;i++)assert.notDeepEqual(sounds[0].channels[0],sounds[i].channels[0]);
  const hit=renderSoundPCM('hit-confirm',{sampleRate:24000}),kill=renderSoundPCM('hit-confirm',{sampleRate:24000,killed:true});
  assert.ok(hit.duration<=.12);assert.ok(rms(hit.channels[0],1600)<.001);assert.notDeepEqual(hit.channels[0],kill.channels[0]);
});

test('gunfire, material hits and confirmation share a finite voice budget and pause cancels scheduled audio',()=>{
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>({gain:param(),frequency:param(),Q:param(),pan:param(),playbackRate:param(),connect(target){return target;},disconnect(){this.disconnected=true;},start(){},stop(){this.stopped=true;}});
  const audio=new Soundscape({autoLoadSamples:false});audio.ctx={state:'running',currentTime:1,createBufferSource:node,createGain:node,createBiquadFilter:node,createStereoPanner:node,suspend(){this.state='suspended';}};audio.master={};audio.paused=false;
  audio._buffer=(kind,options)=>({duration:.5,kind,options});
  for(let i=0;i<150;i++){audio.shot('mounted-m2');audio.bulletImpact(15,-.7,'vehicle-steel',{gunType:'mounted-m2'});audio.confirmHit(i%5===0);}
  assert.equal(audio.voices.size,AUDIO_VOICE_LIMIT);assert.ok(audio.droppedVoices>0);assert.equal(audio.events['shot_mounted-m2'],150);assert.equal(audio.events.hitConfirmations,150);
  const before=[...audio.voices];audio.pause(true);assert.equal(audio.voices.size,0);assert.ok(before.every(v=>v.retired&&v.source.stopped));
  const shots=audio.events.shots;audio.shot('mounted-m2');assert.equal(audio.events.shots,shots,'paused input cannot queue shots');
});
test('paused UI clicks do not queue sounds on a suspended audio clock',()=>{
  const audio=new Soundscape();let created=0,resumed=0;
  audio.ctx={state:'suspended',currentTime:12,createOscillator(){created++;},createBufferSource(){created++;},resume(){resumed++;}};
  for(let i=0;i<30;i++){audio.click();audio.burst(.1,.1,100);audio.spatialBurst(.1,.1,100);}
  assert.equal(created,0);audio.pause(false);assert.equal(resumed,1);
});

test('diesel engine loop is finite, audible and continuous at its wrap',()=>{
  const pcm=renderSoundPCM('engine',{sampleRate:24000,seed:37}),data=pcm.channels[0];
  assert.ok(pcm.duration>3.8&&pcm.duration<4);
  assert.ok(data.every(Number.isFinite));
  const rms=Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);
  assert.ok(rms>.05&&rms<.5);
  assert.ok(Math.abs(data[0]-data.at(-1))<.08,'loop seam must not click');
});

test('convoy audio attenuates with distance, follows stereo position and mutes outside play',()=>{
  const param=()=>({value:0,setTargetAtTime(v){this.value=v;}}),audio=new Soundscape();
  audio.ctx={state:'running',currentTime:3};audio.master={};audio.paused=false;
  audio.vehicleBed={gain:{gain:param()},pan:{pan:param()},loop:{source:{playbackRate:param()},filter:{frequency:param()}}};
  audio.updateVehicles([{distance:5,pan:-1,speed:8}],true);
  const near=audio.inspect().vehicles;assert.equal(near.count,1);assert.ok(near.gain>0);assert.ok(audio.vehicleBed.pan.pan.value<0);
  audio.updateVehicles([{distance:60,pan:1,speed:2}],true);
  assert.ok(audio.inspect().vehicles.gain<near.gain);assert.ok(audio.vehicleBed.pan.pan.value>0);
  audio.updateVehicles([{distance:NaN,pan:NaN,speed:NaN},{distance:6,pan:0,speed:Infinity}],true);
  assert.ok(Object.values(audio.inspect().vehicles).every(Number.isFinite));
  audio.updateVehicles([{distance:5,pan:0,speed:8}],false);
  assert.equal(audio.inspect().vehicles.count,0);assert.equal(audio.vehicleBed.gain.gain.value,0);
});
