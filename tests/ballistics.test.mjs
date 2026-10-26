import test from 'node:test';
import assert from 'node:assert/strict';
import {traceObstacles,nearestOnSegment} from '../src/ballistics.js';

test('low boxes intercept low shots but allow standing shots over their lid',()=>{
  const boxes=[{minX:1,maxX:2,minY:.02,maxY:.4,minZ:-1,maxZ:1,material:'metal'}];
  assert.equal(traceObstacles({x:0,y:1.4,z:0},{x:3,y:1.4,z:0},boxes),null);
  const hit=traceObstacles({x:0,y:.2,z:0},{x:3,y:.2,z:0},boxes);assert.equal(hit.material,'metal');assert.deepEqual(hit.normal,{x:-1,y:0,z:0});assert.equal(hit.point.x,1);
});
const start={x:0,y:1.5,z:0},end={x:0,y:1,z:-30};
test('tracer stops at the first solid wall, regardless of obstacle order',()=>{
  const hit=traceObstacles(start,end,[{minX:-2,maxX:2,minZ:-21,maxZ:-20},{minX:-2,maxX:2,minZ:-8,maxZ:-7}]);
  assert.equal(hit.point.z,-7);assert.deepEqual(hit.normal,{x:0,y:0,z:1});assert.ok(hit.point.y>1);
});
test('parallel unobstructed shot stays clear and a missed downward shot hits the road',()=>{
  assert.equal(traceObstacles(start,end,[{minX:2,maxX:3,minZ:-8,maxZ:-7}]),null);
  const hit=traceObstacles(start,{x:0,y:-3,z:-30},[]);assert.equal(hit.kind,'ground');assert.equal(hit.point.y,.035);assert.ok(hit.point.z>-30);
});
test('near-miss distance uses the clipped segment rather than an infinite ray',()=>{
  const clipped={x:0,y:1.5,z:-5};
  assert.equal(nearestOnSegment({x:1,y:1.5,z:-3},start,clipped).distance,1);
  assert.ok(nearestOnSegment({x:0,y:1.5,z:-10},start,clipped).distance>=5);
});

test('horizontal bullets meet a rising road and the impact normal follows its slope',()=>{
  const hit=traceObstacles({x:0,y:.335,z:0},{x:8,y:.335,z:0},[],x=>x*.1);
  assert.equal(hit.kind,'ground');assert.ok(Math.abs(hit.point.x-3)<.001);
  assert.ok(Math.abs(hit.point.y-.335)<.001);assert.ok(hit.normal.x<-.09);
  assert.ok(Math.abs(Math.hypot(hit.normal.x,hit.normal.y,hit.normal.z)-1)<1e-8);
});

test('depressed road impacts occur on the surface instead of floating at the old flat ground',()=>{
  const hit=traceObstacles({x:0,y:1,z:0},{x:0,y:-1,z:0},[],()=>-.2);
  assert.equal(hit.kind,'ground');assert.ok(Math.abs(hit.point.y+.165)<1e-8);
  assert.ok(hit.fraction>.58);assert.deepEqual(hit.normal,{x:-0,y:1,z:-0});
});

test('a nearer wall still wins over the sampled road behind it',()=>{
  const hit=traceObstacles({x:0,y:1,z:0},{x:10,y:-1,z:0},[{minX:1,maxX:1.2,minZ:-1,maxZ:1}],()=>-.1);
  assert.equal(hit.kind,'cover');assert.equal(hit.point.x,1);
});
