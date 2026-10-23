import test from 'node:test';
import assert from 'node:assert/strict';
import {createActorDirector,createNavigator} from '../src/actor-behavior.js';
import {blocked,lineBlocked} from '../src/simulation.js';
import {traceObstacles} from '../src/ballistics.js';

const actor=(x,z,kind='soldier')=>({position:{x,y:0,z},rotation:{y:0},userData:{kind}});
const run=(director,seconds,context,onStep=()=>{})=>{for(let t=0;t<seconds;t+=.05){director.update(.05,context);onStep();}};

test('smoke interrupts acquired targets and bursts without becoming bullet cover',()=>{
  let smoke=false;const shots=[],director=createActorDirector({obscures:()=>smoke,onFire:e=>shots.push(e)});
  director.add(actor(0,0,'enemy'),{kind:'enemy'});const context={player:{x:0,z:18,health:100},combatAllowed:true};
  run(director,3,context);assert.ok(shots.length>0);
  smoke=true;const count=shots.length;run(director,1.5,context);
  assert.equal(shots.length,count);assert.equal(director.inspect()[0].visible,false);
  assert.equal(traceObstacles({x:0,y:1.3,z:0},{x:0,y:1.3,z:18},[]),null);
  smoke=false;run(director,8,context);assert.ok(shots.length>count);
});

test('hold order anchors companions until follow is explicitly restored',()=>{
  const director=createActorDirector(),friend=actor(0,0);
  director.add(friend,{id:'squad-lead',role:'companion',follow:true});director.setSquadOrder('hold');
  run(director,6,{player:{x:0,z:24,yaw:0},combatAllowed:false});
  assert.ok(Math.hypot(friend.position.x,friend.position.z)<.2);assert.equal(director.inspect()[0].behavior,'hold');
  director.setSquadOrder('follow');run(director,12,{player:{x:0,z:24,yaw:0},combatAllowed:false});
  assert.ok(friend.position.z>15);
});

test('low supply boxes route feet around them without hiding standing targets',()=>{
  const box={minX:-.6,maxX:.6,minZ:6,maxZ:7,maxY:.4,minY:.02};
  const shots=[],director=createActorDirector({navigationColliders:[box],onFire:e=>shots.push(e)});
  director.add(actor(0,0,'enemy'),{kind:'enemy'});
  run(director,4,{player:{x:0,z:18,health:100},combatAllowed:true});assert.ok(shots.length>0);
  const path=director.navigator.findPath({x:0,z:0},{x:0,z:10});assert.ok(path.length>1);for(const p of path)assert.equal(blocked(p.x,p.z,[box]),false);
});

test('night limits distant acquisition while an exposed flashlight remains visible',()=>{
  const director=createActorDirector();director.add(actor(0,0,'enemy'),{kind:'enemy'});
  const player={x:0,z:30,health:100,flashlight:false};run(director,.5,{player,visibilityRange:22,combatAllowed:true});assert.equal(director.inspect()[0].visible,false);
  player.flashlight=true;run(director,1,{player,visibilityRange:22,combatAllowed:true});assert.equal(director.inspect()[0].visible,true);
});

test('navigation goes around a wall with radius clearance instead of sliding forever',()=>{
  const walls=[{minX:-1,maxX:1,minZ:-4,maxZ:4}],nav=createNavigator();nav.setColliders(walls);
  const path=nav.findPath({x:-5,z:0},{x:5,z:0});assert.ok(path.length>=3);
  let previous={x:-5,z:0};for(const p of path){assert.ok(nav.clear(previous,p));assert.ok(!blocked(p.x,p.z,walls,.4));previous=p;}
  assert.ok(Math.hypot(previous.x-5,previous.z)<.1);
});

test('cached routes invalidate when a dynamic vehicle moves into their path',()=>{
  const vehicle={minX:6,maxX:8,minZ:-2,maxZ:2},nav=createNavigator();nav.setColliders([vehicle]);
  assert.equal(nav.findPath({x:-4,z:0},{x:4,z:0}).length,1);
  const oldVersion=nav.version;vehicle.minX=-1;vehicle.maxX=1;nav.setColliders([vehicle]);assert.ok(nav.version>oldVersion);
  const path=nav.findPath({x:-4,z:0},{x:4,z:0});assert.ok(path.length>1);assert.ok(path.some(p=>Math.abs(p.z)>2.4));
});

test('companion follows around actual wall geometry without ever penetrating it',()=>{
  const walls=[{minX:-1,maxX:1,minZ:-4,maxZ:4}],director=createActorDirector({colliders:walls});
  const friend=actor(-5,0);director.add(friend,{role:'companion'});
  run(director,20,{player:{x:6,z:0,yaw:0},combatAllowed:false},()=>assert.equal(blocked(friend.position.x,friend.position.z,walls),false));
  assert.ok(friend.position.x>2);assert.ok(director.inspect()[0].stuckCount<3);
});

test('dynamic vehicle cover blocks perception and shooting until the enemy gets a real sight line',()=>{
  const vehicle={minX:-2,maxX:2,minZ:3,maxZ:7},shots=[],director=createActorDirector({colliders:()=>[vehicle],onFire:e=>shots.push(e)});
  director.add(actor(0,0,'enemy'),{kind:'enemy'});const player={x:0,z:12,health:100};
  run(director,3,{player,combatAllowed:true});assert.equal(shots.length,0);assert.equal(director.inspect()[0].visible,false);
  director.notifyThreat({start:[0,12],end:[0,1],source:[0,12],position:[0,1],radius:16,kind:'near-miss',faction:'player'});
  run(director,14,{player,combatAllowed:true});
  for(const shot of shots)assert.equal(lineBlocked(shot.origin,shot.aim,[vehicle]),false,'no emitted shot can cross the car');
});

test('enemy fires when it sees the player, then searches the last seen point and forgets',()=>{
  const shots=[],director=createActorDirector({onFire:e=>shots.push(e)});director.add(actor(0,0,'enemy'),{kind:'enemy'});
  const player={x:0,z:15,health:100};run(director,3,{player,combatAllowed:true});assert.ok(shots.length>0);
  const last=director.inspect()[0].lastKnown;assert.deepEqual(last,{x:0,z:15});
  player.x=80;player.z=80;run(director,2,{player,combatAllowed:true});assert.equal(director.inspect()[0].behavior,'search');assert.deepEqual(director.inspect()[0].lastKnown,last);
  run(director,9,{player,combatAllowed:true});assert.equal(director.inspect()[0].behavior,'patrol');assert.equal(director.inspect()[0].lastKnown,null);
});

test('enemy does not acquire a distant player behind its back without hearing or seeing',()=>{
  const shots=[],director=createActorDirector({onFire:e=>shots.push(e)});director.add(actor(0,0,'enemy'),{kind:'enemy'});
  run(director,.2,{player:{x:0,z:-25},combatAllowed:true});assert.equal(director.inspect()[0].visible,false);assert.equal(shots.length,0);
});

test('enemy takes nearby cover, peeks out, fires with clear sight, and retreats again',()=>{
  const boxes=[{minX:1.5,maxX:4,minZ:4,maxZ:7}],shots=[],states=new Set();
  const director=createActorDirector({colliders:boxes,onFire:e=>shots.push(e)});director.add(actor(0,0,'enemy'),{kind:'enemy'});
  run(director,22,{player:{x:0,z:18,health:100},combatAllowed:true},()=>states.add(director.inspect()[0].behavior));
  assert.ok(states.has('cover'));assert.ok(states.has('peek'));assert.ok(shots.length>0);
  for(const shot of shots)assert.equal(lineBlocked(shot.origin,shot.aim,boxes),false);
});

test('two companions use separate formation slots and alternate movement and overwatch',()=>{
  const director=createActorDirector(),a=actor(-5,0),b=actor(5,0);director.add(a,{role:'companion'});director.add(b,{role:'companion'});director.add(actor(0,24,'enemy'),{kind:'enemy'});
  const states=[new Set(),new Set()],player={x:0,z:6,health:100,yaw:Math.PI};
  run(director,14,{player,combatAllowed:true},()=>{const snapshot=director.inspect();for(let i=0;i<2;i++)states[i].add(snapshot[i].behavior);player.z+=.012;});
  for(const observed of states){assert.ok(observed.has('bound'));assert.ok(observed.has('overwatch'));}
  assert.ok(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>.65);
});

test('near miss affects actors near the shot segment and produces a crouch then relocation',()=>{
  const director=createActorDirector({colliders:[{minX:2,maxX:4,minZ:-1,maxZ:1}]});
  director.add(actor(0,0),{role:'companion'});director.add(actor(50,50),{role:'guard'});
  director.notifyThreat({start:[-10,0],end:[10,0],source:[-10,0],radius:8,kind:'near-miss',faction:'enemy'});
  director.update(.05,{player:{x:0,z:3},combatAllowed:true});assert.equal(director.inspect()[0].stance,'crouch');assert.equal(director.inspect()[0].behavior,'suppressed');assert.equal(director.inspect()[1].suppression,0);
  const behaviors=new Set();run(director,5,{player:{x:0,z:3},combatAllowed:true},()=>behaviors.add(director.inspect()[0].behavior));assert.ok(behaviors.has('relocate'));
});

test('story guard remains inside its task tether while patrolling and reacting to explosions',()=>{
  const director=createActorDirector(),guard=actor(3,5);director.add(guard,{role:'story',anchor:[3,5],tether:2});
  const places=[];run(director,5,{player:{x:0,z:0},combatAllowed:false},()=>places.push({...guard.position}));
  director.notifyThreat({position:[4,5],source:[8,5],kind:'explosion',radius:18});
  run(director,12,{player:{x:0,z:0},combatAllowed:false},()=>assert.ok(Math.hypot(guard.position.x-3,guard.position.z-5)<=2.001));
  assert.ok(places.some(p=>Math.hypot(p.x-3,p.z-5)>.5),'guard changes vantage point before any player movement');
});

test('civilian ducks at a blast then follows only after the escort instruction',()=>{
  const director=createActorDirector(),civilian=actor(0,0,'civilian');director.add(civilian,{kind:'civilian',role:'story'});
  director.notifyThreat({position:[0,1],source:[0,-10],radius:12,kind:'explosion'});director.update(.1,{player:{x:6,z:8},combatAllowed:false});assert.equal(director.inspect()[0].behavior,'frightened');
  run(director,5,{player:{x:6,z:8},combatAllowed:false});assert.ok(Math.hypot(civilian.position.x,civilian.position.z)<=2);
  director.setFollow(civilian,true);run(director,14,{player:{x:6,z:8},combatAllowed:false});assert.ok(civilian.position.z>5);
});

test('nearby interaction actor stops walking and faces player while one companion treats a casualty',()=>{
  const director=createActorDirector(),story=actor(0,0,'civilian'),medic=actor(5,0);director.add(story,{kind:'civilian',role:'story'});director.add(medic,{role:'companion'});
  const casualty=actor(5,1,'wounded');run(director,3,{player:{x:1,z:0},interactionActor:story,treatActor:casualty,combatAllowed:false});
  assert.equal(director.inspect()[0].behavior,'interact');assert.equal(story.position.x,0);assert.equal(story.position.z,0);
  assert.equal(director.inspect()[1].behavior,'treat');assert.equal(director.inspect()[1].stance,'treat');
});

test('paused context and dead entities freeze behavior, movement, and shot timers',()=>{
  const director=createActorDirector(),entity={alive:true,x:0,z:0};director.add(actor(0,0,'enemy'),{kind:'enemy',entity});
  run(director,1,{player:{x:0,z:20},combatAllowed:true});const before=director.inspect();run(director,3,{paused:true,player:{x:0,z:20}});assert.deepEqual(director.inspect(),before);
  entity.alive=false;run(director,3,{paused:false,player:{x:0,z:20}});const after=director.inspect()[0];assert.equal(after.x,before[0].x);assert.equal(after.z,before[0].z);assert.equal(after.shotsFired,before[0].shotsFired);
});

test('reset removes previous actors and threats and animation receives explicit pose',()=>{
  const poses=[],director=createActorDirector(),friend=actor(0,0);friend.userData.animate=(speed,dt,pose)=>poses.push(pose);director.add(friend,{role:'companion'});
  run(director,1,{player:{x:4,z:5},combatAllowed:false});assert.ok(poses.length);assert.ok(poses.every(p=>p.stance&&Number.isFinite(p.alert)));
  director.reset();assert.deepEqual(director.inspect(),[]);const r=director.add(actor(1,2));assert.equal(r.suppression,0);assert.equal(director.inspect()[0].time,0);
});

test('near miss excludes its shooter by id or actor while still suppressing the target',()=>{
  for(const explicit of ['shooterId','actor']){
    const director=createActorDirector(),shooter=actor(0,0,'enemy'),target=actor(0,5);director.add(shooter,{id:'shooter',kind:'enemy'});director.add(target,{id:'target',role:'story'});
    director.notifyThreat({[explicit]:explicit==='actor'?shooter:'shooter',start:[0,0],end:[0,8],source:[0,0],radius:4,kind:'near-miss',faction:'enemy'});
    assert.equal(director.inspect()[0].suppression,0);assert.ok(director.inspect()[1].suppression>0);
  }
});

test('civilian handoff establishes a new anchor at the vehicle rather than returning to the original scene',()=>{
  const director=createActorDirector(),civilian=actor(0,0,'civilian');director.add(civilian,{role:'story',kind:'civilian'});director.setFollow(civilian,true);
  const player={x:10,z:12};run(director,16,{player,combatAllowed:false});const atHandoff={x:civilian.position.x,z:civilian.position.z};assert.ok(Math.hypot(atHandoff.x,atHandoff.z)>7);
  director.setFollow(civilian,false);assert.deepEqual(director.inspect()[0].anchor,atHandoff);
  run(director,12,{player:{x:-20,z:-30},combatAllowed:false},()=>assert.ok(Math.hypot(civilian.position.x-atHandoff.x,civilian.position.z-atHandoff.z)<=2));
});

test('named squad point man stays in front and rear guard behind for either player heading',()=>{
  for(const yaw of [0,Math.PI/2]){
    const director=createActorDirector(),pointMan=actor(2,1),rear=actor(-2,1);director.add(pointMan,{id:'squad-cover',role:'companion'});director.add(rear,{id:'squad-lead',role:'companion'});
    run(director,12,{player:{x:0,z:0,yaw},combatAllowed:false});
    const forward=p=>p.x*(-Math.sin(yaw))+p.z*(-Math.cos(yaw));
    assert.ok(forward(pointMan.position)>3.8);assert.ok(forward(rear.position)<-2);
  }
});

test('invalid initial actor position is corrected out of collision and syncs its enemy entity',()=>{
  const boxes=[{minX:-1,maxX:1,minZ:-2,maxZ:2}],director=createActorDirector({colliders:boxes}),enemy=actor(0,0,'enemy'),entity={alive:true,x:0,z:0};
  director.add(enemy,{kind:'enemy',entity});assert.equal(blocked(enemy.position.x,enemy.position.z,boxes,.4),false);
  assert.equal(entity.x,enemy.position.x);assert.equal(entity.z,enemy.position.z);assert.equal(director.inspect()[0].startCorrected,true);
  run(director,5,{player:{x:50,z:50},combatAllowed:false});assert.equal(blocked(entity.x,entity.z,boxes,.4),false);
});

test('NPC fire consists of two-to-three shot bursts with short spacing and substantial pauses',()=>{
  const shots=[],director=createActorDirector({onFire:e=>shots.push(e)});director.add(actor(0,0,'enemy'),{kind:'enemy'});
  run(director,24,{player:{x:0,z:15,health:100},combatAllowed:true});
  const bursts=[];for(const shot of shots){const last=bursts.at(-1);if(!last||shot.time-last.at(-1).time>.6)bursts.push([shot]);else last.push(shot);}
  assert.ok(bursts.length>=4);for(const burst of bursts.slice(0,-1)){assert.ok(burst.length===2||burst.length===3);for(let i=1;i<burst.length;i++){const dt=burst[i].time-burst[i-1].time;assert.ok(dt>=.149&&dt<=.251);}}
  for(let i=1;i<bursts.length;i++)assert.ok(bursts[i][0].time-bursts[i-1].at(-1).time>=3.45);
});

test('finite magazine empties, reload blocks every shot, and firing resumes after refill',()=>{
  const shots=[],poses=[],director=createActorDirector({onFire:e=>shots.push(e)}),enemy=actor(0,0,'enemy');enemy.userData.animate=(s,d,p)=>poses.push(p.reload);
  director.add(enemy,{kind:'enemy'});const intervals=[],seenStarts=new Set();
  run(director,95,{player:{x:0,z:15,health:100},combatAllowed:true},()=>{
    const s=director.inspect()[0];assert.ok(s.mag>=0&&s.mag<=s.magSize);
    if(s.reloading&&!seenStarts.has(s.reloadStart)){seenStarts.add(s.reloadStart);intervals.push([s.reloadStart,s.reloadUntil,s.shotsFired]);assert.equal(s.mag,0);}
  });
  assert.ok(intervals.length>=1);assert.equal(intervals[0][2],18);assert.ok(director.inspect()[0].reloads>=1);
  for(const[start,end]of intervals){assert.ok(end-start>=2.5&&end-start<=3);assert.ok(!shots.some(s=>s.time>start+.001&&s.time<end));}
  assert.ok(shots.some(s=>s.time>intervals[0][1]));assert.ok(poses.some(p=>p>.3&&p<.9));
});

test('a target relocation requires turning toward the new line before another shot',()=>{
  const enemy=actor(0,0,'enemy'),shots=[],player={x:0,z:12,health:100};
  const director=createActorDirector({onFire:e=>{const aim=Math.atan2(e.aim.x-e.origin.x,e.aim.z-e.origin.z);const error=Math.atan2(Math.sin(aim-enemy.rotation.y),Math.cos(aim-enemy.rotation.y));assert.ok(Math.abs(error)<=.65);shots.push(e);}});
  director.add(enemy,{kind:'enemy'});run(director,3,{player,combatAllowed:true});assert.ok(shots.length>0);const before=shots.length;
  player.x=10;player.z=-2;director.notifyThreat({source:[10,-2],position:[10,-2],radius:10,kind:'shot',faction:'player'});
  director.update(.05,{player,combatAllowed:true});assert.equal(shots.length,before);
  run(director,10,{player,combatAllowed:true});assert.ok(shots.length>before,'turn completes and does not permanently block fire');
});

test('safe stationary squad uses standing watch and distinct leader/rear positions',()=>{
  const director=createActorDirector(),leader=actor(0,0),rear=actor(0,0);director.add(leader,{id:'squad-lead',role:'companion'});director.add(rear,{id:'squad-rear',role:'companion'});
  run(director,10,{player:{x:0,z:0,yaw:0},combatAllowed:false});
  for(const s of director.inspect())assert.equal(s.stance,'stand');assert.ok(Math.hypot(leader.position.x-rear.position.x,leader.position.z-rear.position.z)>3.5);
});

test('enemy returns fire at a visible flanking soldier while the player is behind a wall',()=>{
  const walls=[{minX:-1.8,maxX:1.8,minZ:4,maxZ:6}],shots=[];
  const director=createActorDirector({colliders:walls,onFire:e=>shots.push(e)}),enemy=actor(0,0,'enemy'),soldier=actor(6,7),civilian=actor(2,2,'civilian');
  director.add(enemy,{id:'enemy',kind:'enemy'});director.add(soldier,{id:'flanker',role:'story',tether:.35});
  director.add(civilian,{id:'civilian',kind:'civilian',role:'story',tether:.35});
  director.add(actor(-3,2),{id:'dead-soldier',entity:{alive:false},role:'story'});
  run(director,32,{player:{x:0,z:12,y:1.68,health:100},combatAllowed:true});
  const returnFire=shots.filter(s=>s.id==='enemy'&&s.targetActor===soldier);
  assert.ok(returnFire.length>=2,'visible flank fire must receive a response even when the player is hidden');
  assert.ok(shots.filter(s=>s.id==='enemy').every(s=>s.targetActor!==civilian));
  for(const shot of shots)assert.equal(lineBlocked(shot.origin,shot.aim,walls),false);
});

test('near misses stopped by cover do not suppress the occupant on the other side',()=>{
  const walls=[{minX:-2,maxX:2,minZ:2,maxZ:3}],director=createActorDirector({colliders:walls});
  const sheltered=actor(0,4,'enemy'),exposed=actor(1,1,'enemy');
  director.add(sheltered,{id:'sheltered',kind:'enemy'});director.add(exposed,{id:'exposed',kind:'enemy'});
  for(let i=0;i<20;i++)director.notifyThreat({start:[0,-10],end:[0,1.995],source:[0,-10],radius:2.8,intensity:.4,kind:'near-miss',faction:'ally'});
  assert.equal(director.inspect()[0].suppression,0);
  assert.ok(director.inspect()[1].suppression>.5,'actual exposed near misses still cause suppression');
});

test('reciprocal flank fire with real near-miss feedback continues through a natural reload',()=>{
  const walls=[{minX:-1.8,maxX:1.8,minZ:4,maxZ:6}],shots=[];let director;
  director=createActorDirector({colliders:walls,onFire:event=>{
    assert.equal(lineBlocked(event.origin,event.aim,walls),false);
    shots.push(event);const impact=traceObstacles(event.origin,event.aim,walls);
    director.notifyThreat({position:impact?.point||event.aim,source:event.origin,start:event.origin,end:impact?.point||event.aim,radius:2.8,intensity:.4,kind:'near-miss',faction:event.faction,shooterId:event.id});
  }});
  director.add(actor(0,0,'enemy'),{id:'enemy',kind:'enemy'});
  director.add(actor(6,7),{id:'flanker',role:'story',tether:.35});
  run(director,120,{player:{x:0,z:12,health:100},combatAllowed:true});
  const enemy=director.inspect().find(r=>r.id==='enemy');
  assert.ok(enemy.reloads>=1,'cover and repeated incoming fire must not permanently prevent return fire');
  assert.ok(enemy.shotsFired>enemy.magSize,'enemy resumes after completing its first finite magazine');
  assert.equal(enemy.stuckCount,0);
  assert.ok(shots.some(s=>s.faction==='ally')&&shots.some(s=>s.faction==='enemy'));
});

test('residual stress does not pull an enemy back during an already committed peek',()=>{
  const director=createActorDirector({colliders:[{minX:1.5,maxX:4,minZ:4,maxZ:7}]});
  director.add(actor(0,0,'enemy'),{kind:'enemy'});
  director.notifyThreat({source:[0,18],position:[0,0],kind:'explosion',radius:12,intensity:1.5});
  let consecutive=0,longest=0;
  run(director,12,{player:{x:0,z:18,health:100},combatAllowed:true},()=>{
    const s=director.inspect()[0];consecutive=s.behavior==='peek'&&s.suppression>.18?consecutive+1:0;longest=Math.max(longest,consecutive);
  });
  assert.ok(longest>=8,'a deliberate peek survives multiple decisions while residual stress decays');
  assert.ok(director.inspect()[0].shotsFired>0);
});

test('stationary suppressed squad mates separate without being pushed through nearby cover',()=>{
  const walls=[{minX:.75,maxX:2,minZ:-3,maxZ:3}],director=createActorDirector({colliders:walls}),a=actor(0,0),b=actor(0,0);
  director.add(a,{id:'squad-lead',role:'companion'});director.add(b,{id:'squad-cover',role:'companion'});
  director.notifyThreat({kind:'explosion',position:[0,0],source:[0,6],radius:10,intensity:1});
  run(director,1,{player:{x:0,z:8},combatAllowed:false},()=>{for(const p of [a.position,b.position])assert.equal(blocked(p.x,p.z,walls),false);});
  assert.ok(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>.72,'idle crouching actors still maintain body clearance');
});
