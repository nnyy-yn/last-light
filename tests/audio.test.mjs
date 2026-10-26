import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundscape,renderSoundPCM} from '../src/audio.js';
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
