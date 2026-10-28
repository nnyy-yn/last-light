import test from 'node:test';import assert from 'node:assert/strict';
import {planEnemySupport,createSupportWeaponState,stepSupportWeapon,validateSupportWeaponState,SUPPORT_WEAPON_RULES} from '../src/enemy-support.js';
import {createActorDirector} from '../src/actor-behavior.js';import {blocked} from '../src/simulation.js';
const fixture=()=>{
 const layout={chapter:6,type:'crash-plaza',bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawn:[0,30],taskPositions:[[0,20],[0,0],[0,-20]],route:[[0,30],[0,0],[0,-35]],roads:[{points:[[0,60],[0,-60]],width:16}],enemySpawns:[{pos:[5,5]}]};
 const roofSurfaces=[{id:'left',bounds:{minX:-32,maxX:-18,minZ:-7,maxZ:7},height:6,flat:true,solid:true,accessible:false,obstacles:[],kind:'building'},{id:'right',bounds:{minX:18,maxX:32,minZ:-32,maxZ:-18},height:10,flat:true,solid:true,accessible:false,obstacles:[],kind:'building'}];
 const colliders=[...roofSurfaces.map(r=>({...r.bounds,minY:0,maxY:r.height})),{minX:5,maxX:8,minZ:5,maxZ:15}];return {layout,sceneState:{roofSurfaces},colliders,groundHeight:()=>0};
};
const fireContext={alive:true,visible:true,aligned:true,distance:35,targetId:'player',combatAllowed:true};
const advance=(s,seconds,context=fireContext)=>{const events=[];for(let t=0;t<seconds;t+=.05)events.push(...stepSupportWeapon(s,.05,context));return events;};

test('combat placement uses two real flat roof teams, a cover-based machinegun team and one clear technical',()=>{
 const f=fixture(),before=JSON.stringify(f),p=planEnemySupport(f);assert.equal(JSON.stringify(f),before);assert.deepEqual(planEnemySupport(f),p);assert.equal(p.roofIds.length,2);assert.equal(p.actors.filter(a=>a.weaponId==='rpg7').length,2);assert.equal(p.actors.filter(a=>a.supportType==='rooftop-spotter').length,2);assert.equal(p.actors.filter(a=>a.weaponId==='rpk').length,1);assert.equal(p.technicals.length,1);
 for(const a of p.actors.filter(a=>a.roofId)){const roof=f.sceneState.roofSurfaces.find(r=>r.id===a.roofId);assert.equal(a.elevation,roof.height);assert(a.pos[0]>roof.bounds.minX&&a.pos[0]<roof.bounds.maxX&&a.pos[1]>roof.bounds.minZ&&a.pos[1]<roof.bounds.maxZ);assert.equal(a.support.fixed,true);assert.equal(blocked(...a.support.retreat,roof.obstacles,.4),false);}
 const tech=p.technicals[0];assert.equal(tech.weaponId,'dshk');assert.equal(tech.crew.support.fireControlledBy,'vehicle');assert.equal(tech.crew.weaponId,'ak','Crew may carry a rifle; mounted DShK is not a backpack weapon');
});

test('peaceful, interior and cockpit scenes never gain heavy enemies and unsafe roofs are not fabricated',()=>{
 const f=fixture();for(const id of[1,2,3,9,11,16])assert.deepEqual(planEnemySupport({...f,layout:{...f.layout,chapter:id}}).actors,[]);
 for(const type of['interior-triage','restricted-cockpit','military-camp'])assert.equal(planEnemySupport({...f,layout:{...f.layout,type}}).technicals.length,0);
 for(const patch of[{flat:false},{solid:false},{accessible:true},{kind:'canopy'},{kind:'courtyard'},{height:NaN},{height:40},{obstacles:[{minX:-100,maxX:100,minZ:-100,maxZ:100}]}]){
  const sceneState={roofSurfaces:f.sceneState.roofSurfaces.map(r=>({...r,...patch}))},p=planEnemySupport({...f,sceneState});assert.equal(p.actors.filter(a=>a.weaponId==='rpg7').length,0);assert(p.omitted.some(o=>o.type==='rooftop-rpg'));
 }
 assert.equal(planEnemySupport({...f,sceneState:{}}).roofIds.length,0);
});

test('RPG announces its aim, loses preparation behind cover, reloads finite rounds, then withdraws',()=>{
 const spec={id:'roof-rpg',weaponId:'rpg7',activationDelay:0},s=createSupportWeaponState(spec),early=advance(s,2.5);assert(early.some(e=>e.type==='aim-start'));assert(!early.some(e=>e.type==='fire'));
 advance(s,.2,{...fireContext,visible:false});assert.equal(s.aimElapsed,0);assert.equal(s.mag,1);const resetAim=advance(s,3);assert(!resetAim.some(e=>e.type==='fire'),'A broken sight line must require a fresh whole aim period');
 const rest=advance(s,55,{...fireContext,atRetreat:true}),shots=[...early,...resetAim,...rest].filter(e=>e.type==='fire');assert.equal(shots.length,3);assert.deepEqual(shots.map(e=>e.sequence),[1,2,3]);assert(shots.every(e=>e.projectile==='rocket'));assert.equal(s.mag+s.reserve,0);assert.equal(s.phase,'withdrawn');assert(validateSupportWeaponState(s,spec));assert.equal(advance(s,100).filter(e=>e.type==='fire').length,0);
});

test('suppression, near range, a dead owner and paused time cannot release an RPG',()=>{
 for(const invalid of[{visible:false},{aligned:false},{distance:5},{suppressed:true},{combatAllowed:false},{paused:true}]){const s=createSupportWeaponState({id:'rpg',weaponId:'rpg7',activationDelay:0});assert.equal(advance(s,8,{...fireContext,...invalid}).filter(e=>e.type==='fire').length,0);assert.equal(s.mag+s.reserve,3);}
 const s=createSupportWeaponState({id:'rpg',weaponId:'rpg7',activationDelay:0});advance(s,2);const before=structuredClone(s);stepSupportWeapon(s,0,fireContext);assert.deepEqual(s,before);stepSupportWeapon(s,.05,{...fireContext,alive:false});assert.equal(s.phase,'dead');assert.equal(s.mag,1);assert.equal(advance(s,20).length,0);
});

test('RPK bursts and reloads never replenish its initial finite budget; vehicle crew emits no duplicate fire',()=>{
 const spec={id:'rpk',weaponId:'rpk',activationDelay:0},s=createSupportWeaponState(spec),events=advance(s,260,{...fireContext,atRetreat:true});assert.equal(events.filter(e=>e.type==='fire').length,225);assert.equal(s.shotsFired,225);assert.equal(s.mag+s.reserve,0);assert.equal(events.filter(e=>e.type==='reloaded').length,2);assert(validateSupportWeaponState(s,spec));
 const observer=createSupportWeaponState({id:'crew',weaponId:'ak',fireControlledBy:'vehicle'});assert.deepEqual(advance(observer,60),[]);assert.equal(observer.shotsFired,0);assert.equal(observer.phase,'observer');
});

test('support snapshots reject refilled magazines, altered identities and accelerated reloads',()=>{
 const spec={id:'rpg',weaponId:'rpg7',activationDelay:0},s=createSupportWeaponState(spec);advance(s,3.4);assert.equal(s.phase,'reloading');assert(s.reloadRemaining>0);assert(validateSupportWeaponState(s,spec));
 for(const mutate of[v=>v.reserve++,v=>v.mag=1,v=>v.shotsFired=0,v=>v.supportId='other',v=>v.reloadRemaining=9,v=>v.phase='watching',v=>v.dead=true]){const bad=structuredClone(s);mutate(bad);assert.equal(validateSupportWeaponState(bad,spec),null);}
 const restored=validateSupportWeaponState(JSON.parse(JSON.stringify(s)),spec),before=restored.reloadRemaining;advance(restored,before-.2);assert.equal(restored.mag,0);advance(restored,.3);assert.equal(restored.mag,1);assert.equal(restored.reserve,1);
});

const actor=(p,weaponId)=>({position:{x:p[0],y:p[1],z:p[2]},rotation:{y:0},userData:{kind:'enemy',weaponId}});
test('the real actor director keeps roof height and geometry, emits one RPG loop, and restores consumed ammo',()=>{
 const f=fixture(),plan=planEnemySupport(f),spec=plan.actors.find(a=>a.weaponId==='rpg7'),shots=[],alerts=[],d=createActorDirector({colliders:f.colliders,onFire:e=>shots.push(e),onCallout:e=>alerts.push(e)});d.reset({bounds:f.layout.bounds});const model=actor([spec.pos[0],spec.elevation,spec.pos[1]],'rpg7'),entity={alive:true,health:100};d.add(model,{id:'enemy-0',kind:'enemy',entity,encounter:spec});
 const player={x:0,z:30,y:1.68,health:100};for(let t=0;t<13;t+=.05){d.update(.05,{player,combatAllowed:true});assert.equal(model.position.y,spec.elevation);}assert(alerts.some(e=>e.type==='heavy-aim'));assert(shots.length>=1&&shots.length<=2);assert(shots.every(e=>e.projectile==='rocket'&&e.origin.y>spec.elevation));assert.equal(d.inspect()[0].startCorrected,false,'An actual roof operator must not snap to a ground-nav free cell');
 const saved=d.snapshotSupport();assert.equal(d.restoreSupport(saved),true);assert.equal(d.snapshotSupport()[0].state.shotsFired,saved[0].state.shotsFired);const forged=structuredClone(saved);forged[0].state.reserve++;assert.equal(d.restoreSupport(forged),false);
 const count=shots.length;entity.alive=false;for(let i=0;i<100;i++)d.update(.05,{player,combatAllowed:true});assert.equal(shots.length,count);const dead=d.snapshotSupport();assert.equal(dead[0].state.dead,true);assert.equal(d.restoreSupport(saved),false,'Reload cannot revive a defeated operator');assert.equal(d.restoreSupport(dead),true);
});

test('only convoy chapters add one reachable ground launcher at a separate covered position',()=>{
 for(const chapter of[6,8,13]){
  const f=fixture();f.layout.chapter=chapter;f.colliders.push({minX:-10,maxX:-5,minZ:-22,maxZ:-7,minY:0,maxY:3});
  const plan=planEnemySupport(f),ground=plan.actors.filter(a=>a.supportType==='ground-rpg');assert.equal(ground.length,[8,13].includes(chapter)?1:0);
  if(!ground.length)continue;const g=ground[0],rpk=plan.actors.find(a=>a.weaponId==='rpk');assert.equal(g.elevation,f.groundHeight(...g.pos));assert.equal(g.weaponId,'rpg7');assert.equal(blocked(...g.pos,f.colliders,.6),false);assert(Math.hypot(g.pos[0]-rpk.pos[0],g.pos[1]-rpk.pos[1])>=5);assert.equal(createSupportWeaponState(g.support).mag+createSupportWeaponState(g.support).reserve,3);
 }
});

test('support machinegun recovers between real spaced incoming bursts despite residual stress',()=>{
 const shots=[],director=createActorDirector({colliders:[],onFire:e=>shots.push(e)}),model=actor([0,0,0],'rpk'),entity={alive:true,health:100},support={id:'rpk-recovery',weaponId:'rpk',activationDelay:0,elevation:0,supportType:'support-machinegun',retreat:[0,-2]};director.add(model,{id:'enemy-0',kind:'enemy',entity,support});
 const player={x:0,z:30,y:1.68,health:100};for(let frame=0;frame<600;frame++){const phase=frame%120;if([0,4,8,12,16,20].includes(phase))director.notifyThreat({source:[0,30],start:[0,30],end:[0,0],position:[0,0],kind:'near-miss',faction:'ally',radius:2.8,intensity:.4});director.update(.05,{player,combatAllowed:true});}
 assert(shots.length>0,'Actual incoming bursts have a long pause; residual stress must not permanently disable return fire');assert(shots.every(e=>e.weaponId==='rpk'));const state=director.snapshotSupport()[0].state;assert.equal(state.mag+state.reserve+state.shotsFired,225);
});
