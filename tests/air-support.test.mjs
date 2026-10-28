import test from 'node:test';
import assert from 'node:assert/strict';
import {createAirSupport,validateAirSupport,AIR_SUPPORT_RULES as R} from '../src/air-support.js';
const context={sockets:[{id:'door-left',position:{x:-20,y:20,z:0}}],targets:[{id:'enemy-1',hostile:true,alive:true,position:{x:0,y:1,z:0}}],friendlies:[],clear:()=>true,aim:()=>true};
test('Air support fires finite short bursts with real preparation and recovery',()=>{
 const a=createAirSupport({enabled:true}),events=[];for(let i=0;i<16000;i++)events.push(...a.update(.05,context));
 assert.equal(events.filter(e=>e.type==='fire').length,R.budget);assert.equal(a.inspect().ammo,0);assert.equal(a.inspect().shots,R.budget);assert.equal(events.filter(e=>e.type==='cover-start').length,R.budget/R.burst);assert.ok(validateAirSupport(a.snapshot()));
});
test('Aircraft cancels a burst for lost sight, dead target or nearby civilian',()=>{
 const a=createAirSupport({enabled:true});for(let i=0;i<195;i++)a.update(.05,context);assert.ok(a.inspect().shots>0);
 const spent=a.inspect().shots;for(let i=0;i<40;i++)a.update(.1,{...context,clear:()=>false});assert.equal(a.inspect().shots,spent);assert.equal(a.inspect().burstRemaining,0);
 for(const patch of [{targets:[{...context.targets[0],alive:false}]},{friendlies:[{position:{x:1,y:1,z:0}}]}]){for(let i=0;i<100;i++)a.update(.1,{...context,...patch});assert.equal(a.inspect().shots,spent);}
});
test('Pause and Continue preserve ammunition and relative firing timers',()=>{
 const a=createAirSupport({enabled:true});for(let i=0;i<50;i++)a.update(.25,context);const saved=a.snapshot();assert.ok(validateAirSupport(saved));a.update(0,context);assert.deepEqual(a.inspect(),saved);
 const b=createAirSupport();assert.ok(b.restore(saved));for(let i=0;i<20;i++){assert.deepEqual(a.update(.05,context),b.update(.05,context));}assert.deepEqual(a.snapshot(),b.snapshot());
 const corrupt={...saved,ammo:R.budget};assert.equal(validateAirSupport(corrupt),null);assert.equal(validateAirSupport({...saved,unknown:{a:4}}).unknown,undefined);
});
test('Peaceful chapter and gun outside its physical traverse cannot fire',()=>{
 const a=createAirSupport();for(let i=0;i<500;i++)a.update(.1,context);assert.equal(a.inspect().shots,0);a.reset(true);for(let i=0;i<500;i++)a.update(.1,{...context,aim:()=>false});assert.equal(a.inspect().shots,0);
});
