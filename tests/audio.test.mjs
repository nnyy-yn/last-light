import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundscape} from '../src/audio.js';
test('paused UI clicks do not queue sounds on a suspended audio clock',()=>{
  const audio=new Soundscape();let created=0,resumed=0;
  audio.ctx={state:'suspended',currentTime:12,createOscillator(){created++;},createBufferSource(){created++;},resume(){resumed++;}};
  for(let i=0;i<30;i++){audio.click();audio.burst(.1,.1,100);audio.spatialBurst(.1,.1,100);}
  assert.equal(created,0);audio.pause(false);assert.equal(resumed,1);
});
