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
