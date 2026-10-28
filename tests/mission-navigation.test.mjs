import test from 'node:test';import assert from 'node:assert/strict';
import {createMissionNavigation,routeBearing} from '../src/mission-navigation.js';
import {blocked,lineBlocked} from '../src/simulation.js';
const bounds={minX:-20,maxX:20,minZ:-20,maxZ:20};
test('guidance takes a real opening around a wall and gives the next corner rather than aiming through it',()=>{
  const colliders=[{minX:-2,maxX:2,minZ:-7,maxZ:7}],nav=createMissionNavigation();nav.reset({bounds,colliders});
  const player={x:-10,z:0,yaw:0},r=nav.update({player,goal:[10,0],taskId:'rescue',dt:.1});
  assert.equal(r.status,'route');assert.ok(r.routeDistance>20);assert.ok(r.next);assert.equal(lineBlocked(player,r.next,colliders),false);
  let p=player;for(const q of r.route){assert.equal(blocked(q.x,q.z,colliders,.43),false);assert.equal(lineBlocked(p,q,colliders),false);p=q;}
});
test('rear, left and right guidance remains explicit and target changes invalidate the route',()=>{
  assert.equal(routeBearing({x:0,z:0,yaw:0},[0,10]).turn,'转身');assert.equal(routeBearing({x:0,z:0,yaw:0},[-10,0]).turn,'向左转');assert.equal(routeBearing({x:0,z:0,yaw:0},[10,0]).turn,'向右转');
  const nav=createMissionNavigation();nav.reset({bounds,colliders:[]});const a=nav.update({player:{x:0,z:0},goal:[0,-15],taskId:'one'}),b=nav.update({player:{x:0,z:0},goal:[15,0],taskId:'two'});assert.ok(b.revision>a.revision);assert.equal(b.taskId,'two');assert.equal(b.turn,'向右转');
});
test('radio, arrival and sealed destinations have distinct states without a fabricated walk-through route',()=>{
  const nav=createMissionNavigation();nav.reset({bounds,colliders:[]});assert.equal(nav.update({player:{x:0,z:0},goal:[0,0],taskId:'call',radio:true}).status,'radio');assert.equal(nav.update({player:{x:0,z:0},goal:[1,0],taskId:'person',near:true}).status,'arrived');
  nav.reset({bounds,colliders:[{minX:-20,maxX:20,minZ:-1,maxZ:1}]});const r=nav.update({player:{x:0,z:10},goal:[0,-10],taskId:'sealed'});assert.equal(r.status,'unreachable');assert.equal(r.next,null);assert.deepEqual(r.route,[]);
});

test('walking away from an arrival or leaving a gun position restores the route immediately',()=>{
  const nav=createMissionNavigation();nav.reset({bounds,colliders:[]});
  const input={player:{x:0,z:0},goal:[0,-15],taskId:'person',dt:.01};
  nav.update(input);nav.update({...input,near:true});
  assert.equal(nav.update(input).status,'route');
  nav.update({...input,radio:true});assert.equal(nav.update(input).status,'route');
});
