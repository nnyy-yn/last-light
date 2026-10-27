import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createActorDirector,createNavigator} from '../src/actor-behavior.js';
import {blocked,movePlayer} from '../src/simulation.js';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/clinic-escort.json',import.meta.url),'utf8'));
const actor=(x,z,kind='civilian')=>({position:{x,y:0,z},rotation:{y:0},userData:{kind}});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function clinicDirector(start){
  const director=createActorDirector({colliders:fixture.colliders});director.reset({bounds:fixture.bounds});
  // The reported follower is the fourth actor. Earlier distant story actors
  // preserve that formation side without altering this route's collisions.
  for(let i=0;i<3;i++)director.add(actor(-80+i*3,80),{role:'story',tether:.5});
  const person=actor(...start);director.add(person,{id:'story-find-family',role:'story',follow:true,tether:.5});
  return {director,person};
}

test('clinic escort recovers from the actual unreachable formation pocket without moving the player',()=>{
  const start=fixture.stalledActor,{director,person}=clinicDirector([start.x,start.z]);
  assert(director.navigator.valid(start));assert(director.navigator.valid(start.goal));
  assert.deepEqual(director.navigator.findPath(start,start.goal,120000),[],'The capture contains a valid but disconnected formation point');
  const player=structuredClone(fixture.stalledPlayer),unchanged=structuredClone(player);let travelled=0,previous={...person.position};
  for(let t=0;t<18;t+=.05){
    director.update(.05,{player,combatAllowed:false});
    assert(!blocked(person.position.x,person.position.z,fixture.colliders,.4));
    const step=distance(previous,person.position);assert(step<=1.1*.05+1e-8,'Recovery cannot teleport or accelerate the civilian');travelled+=step;previous={...person.position};
  }
  assert.deepEqual(player,unchanged);
  assert(travelled>4,'The follower must escape the stalled state through normal walking');
  assert(distance(person.position,player)<3.2,'The follower catches up while the player waits');
  assert(director.navigator.clear(person.position,player),'The follower must be on the reachable side of the shed');
});

test('clinic escort completes the recorded multi-corner route against actual building and shed collisions',()=>{
  const {director,person}=clinicDirector(fixture.actorStart),player={x:fixture.playerStart[0],z:fixture.playerStart[1],yaw:0},goal={x:fixture.goal[0],z:fixture.goal[1]};
  const nav=createNavigator({cellSize:.75,radius:.47});nav.setBounds(fixture.bounds);nav.setColliders(fixture.colliders);
  const route=fixture.playerRoute;let from=player;for(const p of route){assert(nav.clear(from,p));from=p;}
  let waypoint=0,travelled=0,stationary=0,finished=false,previous={...person.position};
  for(let t=0;t<160;t+=.05){
    while(waypoint<route.length&&distance(player,route[waypoint])<.7&&(!route[waypoint+1]||nav.clear(player,route[waypoint+1])))waypoint++;
    if(waypoint<route.length&&distance(person.position,player)<7){
      const p=route[waypoint],d=distance(player,p);player.yaw=Math.atan2(player.x-p.x,player.z-p.z);
      const step=Math.min(d,3.7*.05);movePlayer(player,(p.x-player.x)/d*step,(p.z-player.z)/d*step,fixture.colliders,120);
    }
    director.update(.05,{player,combatAllowed:false});
    assert(!blocked(person.position.x,person.position.z,fixture.colliders,.4));assert(!blocked(player.x,player.z,fixture.colliders,.36));
    const step=distance(previous,person.position);assert(step<=1.1*.05+1e-8);travelled+=step;previous={...person.position};stationary=step<.001?stationary+.05:0;
    assert(stationary<12,'No unreachable formation goal may strand the follower while the player waits');
    if(waypoint===route.length&&distance(person.position,goal)<5&&distance(player,goal)<4){finished=true;break;}
  }
  assert(finished,'The real escort handover radius must be reached');assert(travelled>40);
});

test('story escorts walk around an actual convoy vehicle and retain clearance as the player turns',()=>{
  const box=fixture.vehicle.box,director=createActorDirector({colliders:[box]}),person=actor(0,-24,'soldier');
  director.add(person,{id:'story-injured-escort',kind:'soldier',role:'story',follow:true,tether:.5});
  const player={x:0,z:-15.8,yaw:0};let previous={...person.position},travelled=0;
  for(let t=0;t<16;t+=.05){
    if(t>8)player.yaw=Math.PI/2;
    director.update(.05,{player,combatAllowed:false});
    assert(!blocked(person.position.x,person.position.z,[box],.4));
    const step=distance(previous,person.position);assert(step<=2.5*.05+1e-8);travelled+=step;previous={...person.position};
  }
  assert(travelled>5);assert(distance(person.position,player)<3.2);assert(director.navigator.clear(person.position,player));
});
