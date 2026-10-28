import test from 'node:test';
import assert from 'node:assert/strict';
import {createRocketProjectiles,validateRocketSnapshot,rocketBlastExposure} from '../src/rocket-projectiles.js';
import {traceObstacles} from '../src/ballistics.js';
const launch={origin:{x:0,y:3,z:0},direction:{x:0,y:0,z:1},ownerId:'enemy-3',faction:'enemy'};
test('RPG swept collision cannot tunnel through thin cover on a slow frame',()=>{
 const wall=[{minX:-2,maxX:2,minY:0,maxY:6,minZ:8,maxZ:8.08}],hits=[];
 const r=createRocketProjectiles({trace:(a,b)=>traceObstacles(a,b,wall),onImpact:e=>hits.push(e)});
 r.launch(launch);r.update(.5);r.update(1);assert.equal(hits.length,1);assert.equal(hits[0].hit.kind,'cover');assert.ok(Math.abs(hits[0].hit.point.z-8)<1e-6);assert.equal(r.inspect().records.length,0);
});
test('Flight path is independent of frame size and zero delta pauses it',()=>{
 const a=createRocketProjectiles(),b=createRocketProjectiles();a.launch(launch);b.launch(launch);a.update(.4);for(let i=0;i<24;i++)b.update(1/60);
 for(const k of ['x','y','z'])assert.ok(Math.abs(a.inspect().records[0].position[k]-b.inspect().records[0].position[k])<1e-7);
 const before=a.snapshot();a.update(0);assert.deepEqual(a.snapshot(),before);
});
test('Continue restores the active projectile rather than launching or impacting twice',()=>{
 let hitCount=0;const wall=[{minX:-2,maxX:2,minY:0,maxY:8,minZ:22,maxZ:23}],make=()=>createRocketProjectiles({trace:(a,b)=>traceObstacles(a,b,wall),onImpact:()=>hitCount++});
 const a=make();a.launch(launch);a.update(.1);const saved=a.snapshot(),b=make();assert.ok(b.restore(saved));assert.equal(b.inspect().launched,1);b.update(.4);b.update(1);assert.equal(hitCount,1);assert.equal(b.inspect().impacts,1);assert.equal(b.inspect().records.length,0);
 const corrupt=structuredClone(saved);corrupt.records[0].position.z+=2;assert.equal(validateRocketSnapshot(corrupt),null);assert.deepEqual(b.inspect().launched,1);
});
test('Swept actor collision ignores launcher but detects a real body before a wall',()=>{
 const hits=[],r=createRocketProjectiles({targets:()=>[{id:'enemy-3',position:launch.origin},{id:'player',position:{x:0,y:3,z:10},radius:.5}],onImpact:e=>hits.push(e)});
 r.launch(launch);r.update(.3);assert.equal(hits[0].hit.targetId,'player');assert.equal(hits.length,1);
});
test('Solid wall blocks blast pressure and outside radius takes no damage',()=>{
 const hit={point:{x:0,y:1,z:0},normal:{x:0,y:1,z:0}},wall=[{minX:-5,maxX:5,minY:0,maxY:4,minZ:1,maxZ:1.2}];
 assert.ok(rocketBlastExposure(hit,{x:1,y:1,z:0})>.7);assert.equal(rocketBlastExposure(hit,{x:0,y:1,z:3},wall),0);assert.equal(rocketBlastExposure(hit,{x:0,y:1,z:8}),0);
});
test('Projectile pool is finite, malformed state is rejected, unknown fields are stripped',()=>{
 const r=createRocketProjectiles();for(let i=0;i<12;i++)assert.ok(r.launch(launch));assert.equal(r.launch(launch),null);
 const value=r.snapshot();value.extra={unsafe:'not gameplay state'};value.records[0].extra=9;const clean=validateRocketSnapshot(value);assert.ok(clean);assert.equal(clean.extra,undefined);assert.equal(clean.records[0].extra,undefined);
 value.impacts=13;assert.equal(validateRocketSnapshot(value),null);
});
test('A barrel blocked at launch resolves the near-face collision once and cannot reappear after Continue',()=>{
 const hits=[],r=createRocketProjectiles({onImpact:e=>hits.push(e)}),rocket=r.launch(launch),wall={point:{x:0,y:3,z:.1},normal:{x:0,y:0,z:-1},kind:'cover',fraction:.1};
 assert.ok(r.impact(rocket.id,wall));assert.equal(r.impact(rocket.id,wall),false);r.update(.5);assert.equal(hits.length,1);assert.equal(r.inspect().launched,1);assert.equal(r.inspect().impacts,1);const b=createRocketProjectiles({onImpact:e=>hits.push(e)});assert.ok(b.restore(r.snapshot()));b.update(.5);assert.equal(hits.length,1);
});
