import test from 'node:test';
import assert from 'node:assert/strict';
import {captureChapterCheckpoint,validateChapterCheckpoint,applyChapterCheckpoint,chapterTaskSignature,CHECKPOINT_WEAPON_CAPACITIES} from '../src/chapter-checkpoints.js';
import {newCampaign,applyEffects} from '../src/simulation.js';
import {createAmmoReserves,ammoTotal} from '../src/ammunition.js';
import {createCarriedLoadout,replaceCarriedWeapon} from '../src/carried-loadout.js';
import {INITIAL_RESOURCES,CHAPTERS} from '../src/story.js';
import {createMountedGun,fireMountedGun,stepMountedGun,reloadMountedGun,MOUNTED_M2} from '../src/mounted-weapons.js';

const copy=value=>structuredClone(value);
function fixture(){
  const chapter={id:6,sceneId:'crash-district',tasks:[
    {id:'confirm-report',pos:[0,4],interaction:'radio',dialogue:[{text:'Confirm the crash.',speaker:'radio'}]},
    {id:'share-kit',pos:[8,12],interaction:'hold',reward:'supplies',decision:{prompt:'Who carries the kit?',options:[{id:'share',effects:{cohesion:1}},{id:'retain',effects:{medicine:1}}]}},
    {id:'reach-court',pos:[16,22],interaction:'reach'},
  ]};
  const campaign=newCampaign({...INITIAL_RESOURCES,ammo:90});campaign.chapter=5;
  const player={x:8,z:12,y:1.72,yaw:-1.4,pitch:.13,health:62,stamina:41,mag:11,weaponId:'m16a2'};
  const stowedMagazines={m16a2:0,m1911:5},carriedLoadout=createCarriedLoadout();
  const gun=createMountedGun();for(let i=0;i<8;i++){stepMountedGun(gun,.12);fireMountedGun(gun);}reloadMountedGun(gun);stepMountedGun(gun,.6);
  const context={chapter,bounds:{minX:-120,maxX:120,minZ:-120,maxZ:120},enemyCount:26,mountedWeaponIds:['vehicle-gun-0'],fieldIds:['field-6-ammo','field-6-medicine']};
  const input={...context,campaign,taskIndex:2,player,stowedMagazines,carriedLoadout,killedEnemyIndices:[7,1],weaponDrops:[{dropId:'enemy-7',source:'enemy',enemyIndex:7,weaponId:'ak',mag:0,reserve:0,taken:false,position:[7.25,-4],elevation:0},{dropId:'enemy-1',source:'enemy',enemyIndex:1,weaponId:'ak',mag:0,reserve:0,taken:false,position:[1,3.5],elevation:0}],smokeCharges:1,mountedWeapons:[{id:'vehicle-gun-0',gun,aiWait:2.3,burst:2,shotsAI:8}],fieldCollectedIds:['field-6-ammo'],pacingElapsed:628.42,taskDecisions:[{taskId:'share-kit',optionId:'share'}]};
  return {chapter,campaign,context,input};
}

test('a JSON round trip restores only completed prefix progress and every finite resource',()=>{
  const {input,context,campaign}=fixture(),saved=captureChapterCheckpoint(input),wire=JSON.parse(JSON.stringify(saved));
  campaign.resources.ammo=0;
  const restored=applyChapterCheckpoint(campaign,wire,context);
  assert.equal(restored.taskIndex,2);assert.equal(restored.nextTaskId,'reach-court');assert.deepEqual(restored.completedTaskIds,['confirm-report','share-kit']);
  assert.deepEqual(restored.player,input.player);assert.deepEqual(restored.stowedMagazines,input.stowedMagazines);assert.deepEqual(restored.killedEnemyIndices,[1,7]);assert.equal(restored.smokeCharges,1);assert.deepEqual(restored.mountedWeapons,input.mountedWeapons);assert.deepEqual(restored.fieldCollectedIds,['field-6-ammo']);assert.equal(restored.pacingElapsed,628.42);assert.deepEqual(restored.taskDecisions,input.taskDecisions);assert.deepEqual(campaign.resources,{...INITIAL_RESOURCES,ammo:90});
});

test('capture after a reward and repeated restore cannot apply that reward again',()=>{
  const {input,context,campaign}=fixture();campaign.resources.ammo=29;campaign.resources=applyEffects(campaign.resources,{ammo:12,cohesion:1});
  const saved=captureChapterCheckpoint(input);assert.equal(saved.resources.ammo,41);
  for(let n=0;n<4;n++){campaign.resources.ammo=0;const resume=applyChapterCheckpoint(campaign,saved,context);assert.equal(campaign.resources.ammo,41);assert.equal(campaign.resources.cohesion,3);assert.equal(resume.nextTaskId,'reach-court');assert.ok(resume.completedTaskIds.includes('share-kit'));}
  assert.deepEqual(saved.resources,campaign.resources);
});

test('captured/applied data never aliases caller, campaign or visual objects',()=>{
  const {input,context,campaign}=fixture();input.player.obj={geometry:'do not serialize'};input.mountedWeapons[0].vehicle={geometry:'also not data'};
  input.chapter.tasks[0].obj={cycle:null};input.chapter.tasks[0].obj.cycle=input.chapter.tasks[0].obj;
  const saved=captureChapterCheckpoint(input);assert.equal('obj' in saved.player,false);assert.equal('vehicle' in saved.mountedWeapons[0],false);assert.ok(!JSON.stringify(saved).includes('geometry'));
  input.player.health=1;input.stowedMagazines.m1911=0;input.mountedWeapons[0].gun.ammo=0;input.campaign.resources.ammo=0;
  assert.equal(saved.player.health,62);assert.equal(saved.stowedMagazines.m1911,5);assert.equal(saved.mountedWeapons[0].gun.ammo,92);assert.equal(saved.resources.ammo,90);
  const restored=applyChapterCheckpoint(campaign,saved,context);restored.player.health=0;restored.resources.ammo=0;restored.fieldCollectedIds.push('invented');
  assert.equal(campaign.fieldCheckpoint.player.health,62);assert.equal(campaign.resources.ammo,90);assert.deepEqual(saved.fieldCollectedIds,['field-6-ammo']);
});

test('changed order, coordinates, effects, dialogue and content version invalidate stale saves',()=>{
  const {input,context}=fixture(),saved=captureChapterCheckpoint(input);
  for(const mutate of[c=>c.tasks.reverse(),c=>c.tasks[2].pos[0]++,c=>c.tasks[1].decision.options[0].effects.cohesion--,c=>c.tasks[0].dialogue[0].text+=' amended',c=>c.tasks[2].id='renamed',c=>c.sceneId='other-layout',c=>c.contentVersion=2]){const chapter=copy(context.chapter);mutate(chapter);assert.equal(validateChapterCheckpoint(saved,{...context,chapter}),null);}
  const reordered={tasks:context.chapter.tasks.map(t=>Object.fromEntries(Object.entries(t).reverse())),sceneId:context.chapter.sceneId,id:context.chapter.id};assert.equal(chapterTaskSignature(reordered),chapterTaskSignature(context.chapter));
  const runtime=copy(context.chapter);runtime.tasks[0].done=true;runtime.tasks[0].obj={geometry:'ignored'};assert.equal(chapterTaskSignature(runtime),chapterTaskSignature(context.chapter));
});

test('out-of-order, missing, duplicate and next-task mismatches are rejected atomically',()=>{
  const {input,context,campaign}=fixture(),saved=captureChapterCheckpoint(input),before=copy(campaign);
  for(const mutate of[p=>p.completedTaskIds.reverse(),p=>p.completedTaskIds=['share-kit'],p=>p.completedTaskIds=['confirm-report','confirm-report'],p=>p.taskIndex=1,p=>p.nextTaskId='share-kit',p=>p.taskIndex=99,p=>p.version=0,p=>p.chapterId=7]){const bad=copy(saved);mutate(bad);assert.equal(applyChapterCheckpoint(campaign,bad,context),null);assert.deepEqual(campaign,before);}
});

test('decision choices must be valid, unique and owned by completed tasks',()=>{
  const {input,context}=fixture(),saved=captureChapterCheckpoint(input);
  for(const decisions of[[],[{taskId:'share-kit',optionId:'fake'}],[...saved.taskDecisions,...saved.taskDecisions],[{taskId:'reach-court',optionId:'share'}],[{taskId:'confirm-report',optionId:'share'}]])assert.equal(validateChapterCheckpoint({...saved,taskDecisions:decisions},context),null);
  input.taskIndex=1;input.taskDecisions=[];assert.deepEqual(captureChapterCheckpoint(input).taskDecisions,[]);
  input.taskDecisions=[{taskId:'share-kit',optionId:'share'}];assert.throws(()=>captureChapterCheckpoint(input));
});

test('ammo, health, position, elapsed time and consumed-item identities are bounded',()=>{
  const {input,context}=fixture(),saved=captureChapterCheckpoint(input);
  for(const mutate of[p=>p.resources.ammo=721,p=>p.player.mag=31,p=>p.player.mag=2.5,p=>p.player.health=NaN,p=>p.player.x=121,p=>p.player.weaponId='unknown',p=>p.stowedMagazines.m16a2=11,p=>p.stowedMagazines.m249=101,p=>delete p.stowedMagazines.m1911,p=>p.smokeCharges=3,p=>p.pacingElapsed=-1,p=>p.pacingElapsed=Infinity,p=>p.fieldCollectedIds.push('field-5-ammo'),p=>p.fieldCollectedIds.push('field-6-ammo'),p=>p.killedEnemyIndices.push(26),p=>p.killedEnemyIndices.push(1)]){const bad=copy(saved);mutate(bad);assert.equal(validateChapterCheckpoint(bad,context),null);}
});

test('partial mounted reload resumes its remaining time without replenishing reserve',()=>{
  const {input,context,campaign}=fixture(),saved=captureChapterCheckpoint(input),restored=applyChapterCheckpoint(campaign,saved,context),gun=restored.mountedWeapons[0].gun;
  assert.equal(gun.ammo,92);assert.equal(gun.reserve,300);assert.ok(gun.reload>4.7&&gun.reload<4.9);const sum=gun.ammo+gun.reserve;
  stepMountedGun(gun,0);assert.equal(gun.ammo,92);stepMountedGun(gun,gun.reload);assert.equal(gun.ammo,100);assert.equal(gun.reserve,292);assert.equal(gun.ammo+gun.reserve,sum);
  const next=applyChapterCheckpoint(campaign,saved,context).mountedWeapons[0].gun;assert.equal(next.ammo,92);assert.equal(next.reserve,300);
});

test('mounted gun identity, thermal state and ammunition cannot be forged or duplicated',()=>{
  const {input,context}=fixture(),saved=captureChapterCheckpoint(input);
  for(const mutate of[p=>p.mountedWeapons=[],p=>p.mountedWeapons.push(copy(p.mountedWeapons[0])),p=>p.mountedWeapons[0].id='other-gun',p=>p.mountedWeapons[0].gun.ammo=101,p=>p.mountedWeapons[0].gun.reserve=301,p=>p.mountedWeapons[0].gun.heat=1.01,p=>p.mountedWeapons[0].gun.cooldown=MOUNTED_M2.interval+1,p=>p.mountedWeapons[0].gun.reload=6,p=>p.mountedWeapons[0].gun.shots=400,p=>p.mountedWeapons[0].gun.overheated='yes']){const bad=copy(saved);mutate(bad);assert.equal(validateChapterCheckpoint(bad,context),null);}
});

test('chapter boundaries support zero completed tasks and completion awaiting final choice',()=>{
  const {input,context,campaign}=fixture();input.taskIndex=0;input.taskDecisions=[];const start=captureChapterCheckpoint(input);assert.equal(start.nextTaskId,'confirm-report');assert.deepEqual(start.completedTaskIds,[]);
  input.taskIndex=3;input.taskDecisions=[{taskId:'share-kit',optionId:'retain'}];const end=captureChapterCheckpoint(input);assert.equal(end.nextTaskId,null);assert.equal(end.completedTaskIds.length,3);assert.equal(applyChapterCheckpoint(campaign,end,context).taskIndex,3);
  campaign.completed=true;assert.equal(applyChapterCheckpoint(campaign,end,context),null);assert.throws(()=>captureChapterCheckpoint(input));campaign.completed=false;campaign.chapter=4;assert.equal(applyChapterCheckpoint(campaign,end,context),null);
});

test('all sixteen current authored chapter task lists produce distinct deterministic fingerprints',()=>{
  const signatures=CHAPTERS.map(chapterTaskSignature);assert.equal(new Set(signatures).size,16);assert.deepEqual(CHAPTERS.map(c=>chapterTaskSignature(JSON.parse(JSON.stringify(c)))),signatures);
  assert.throws(()=>chapterTaskSignature({id:1,tasks:[{id:'duplicate'},{id:'duplicate'}]}));
});

test('consumed squad assistance survives repeated checkpoint restores and cannot be reopened by missing data',()=>{
  const {input,context,campaign}=fixture();
  // The first low-health aid already ran before this task checkpoint. A later
  // injury may again satisfy the health threshold, but cannot grant aid twice.
  input.assistUsed=true;input.player.health=29;
  const saved=JSON.parse(JSON.stringify(captureChapterCheckpoint(input)));
  assert.equal(saved.assistUsed,true);assert.equal(saved.version,5);
  for(let n=0;n<3;n++){
    const restored=applyChapterCheckpoint(campaign,saved,context);
    let aidCount=0;
    if(!restored.assistUsed&&restored.player.health<35){aidCount++;restored.player.health+=25;}
    assert.equal(aidCount,0);assert.equal(restored.player.health,29);
    assert.equal(campaign.fieldCheckpoint.assistUsed,true);
  }
  const before=copy(campaign);
  for(const mutate of[p=>delete p.assistUsed,p=>p.assistUsed=0,p=>p.assistUsed='false',p=>p.assistUsed=null,p=>p.version=1,p=>p.version=2,p=>p.version=3,p=>p.version=4]){
    const bad=copy(saved);mutate(bad);
    assert.equal(applyChapterCheckpoint(campaign,bad,context),null);
    assert.deepEqual(campaign,before,'old/invalid aid state must not partially restore a save');
  }
  delete input.assistUsed;
  assert.equal(captureChapterCheckpoint(input).assistUsed,false,'new captures default to unused only when the caller omits the flag');
});

test('schema 5 requires typed reserves to match the reserve total exactly',()=>{
  const {input,context,campaign}=fixture();
  const explicit={'556':40,'762':30,'9mm':13,'45':7,rocket:0};campaign.ammoReserves=copy(explicit);
  const saved=captureChapterCheckpoint(input);assert.deepEqual(saved.ammoReserves,explicit);assert.equal(saved.version,5);
  for(const mutate of[p=>delete p.ammoReserves,p=>p.ammoReserves=null,p=>p.ammoReserves['556']++,p=>p.ammoReserves['762']=-1,p=>p.ammoReserves['45']=.5,p=>p.ammoReserves['9mm']=Infinity,p=>p.ammoReserves.extra=0,p=>delete p.ammoReserves['45'],p=>p.resources.ammo=90.5,p=>p.version=2]){
    const bad=copy(saved),before=copy(campaign);mutate(bad);assert.equal(applyChapterCheckpoint(campaign,bad,context),null);assert.deepEqual(campaign,before);
  }
  input.ammoReserves=createAmmoReserves(90);assert.deepEqual(captureChapterCheckpoint(input).ammoReserves,input.ammoReserves,'Explicit actual runtime reserves take priority over campaign fallback');
  delete input.ammoReserves;campaign.ammoReserves=null;assert.throws(()=>captureChapterCheckpoint(input),'An invalid existing pool cannot silently become migrated ammo');
  delete campaign.ammoReserves;assert.deepEqual(captureChapterCheckpoint(input).ammoReserves,createAmmoReserves(90));assert.equal(Object.hasOwn(campaign,'ammoReserves'),false,'Capture is data-only and does not migrate the caller');
  campaign.resources.ammo=720;assert.equal(ammoTotal(captureChapterCheckpoint(input).ammoReserves),720);
});

test('each defeated enemy requires exactly one bounded physical firearm record',()=>{
  const {input,context,campaign}=fixture(),saved=captureChapterCheckpoint(input);
  assert.deepEqual(saved.weaponDrops.map(d=>d.enemyIndex),[1,7]);
  for(const mutate of[p=>delete p.weaponDrops,p=>p.weaponDrops=null,p=>p.weaponDrops.pop(),p=>p.weaponDrops.push(copy(p.weaponDrops[0])),p=>p.weaponDrops[1].enemyIndex=1,p=>p.weaponDrops[0].enemyIndex=0,p=>p.weaponDrops[0].enemyIndex=26,p=>p.weaponDrops[0].enemyIndex=.5,p=>p.weaponDrops[0].weaponId='missing',p=>p.weaponDrops[0].mag=31,p=>p.weaponDrops[0].mag=-1,p=>p.weaponDrops[0].mag=.5,p=>p.weaponDrops[0].reserve=301,p=>p.weaponDrops[0].reserve=-1,p=>p.weaponDrops[0].reserve=Infinity,p=>p.weaponDrops[0].taken=0,p=>p.weaponDrops[0].taken='false',p=>delete p.weaponDrops[0].taken,p=>delete p.weaponDrops[0].elevation,p=>p.weaponDrops[0].elevation=81,p=>p.weaponDrops[0].elevation=NaN,p=>delete p.weaponDrops[0].position,p=>p.weaponDrops[0].position=null,p=>p.weaponDrops[0].position=[0],p=>p.weaponDrops[0].position=[0,0,0],p=>p.weaponDrops[0].position=[121,0],p=>p.weaponDrops[0].position=[0,-121],p=>p.weaponDrops[0].position=[NaN,0],p=>p.weaponDrops[0].position=[0,Infinity],p=>p.weaponDrops[0].position=['1',2]]){
    const bad=copy(saved),before=copy(campaign);mutate(bad);assert.equal(applyChapterCheckpoint(campaign,bad,context),null);assert.deepEqual(campaign,before);
  }
  for(const [weaponId,mag]of Object.entries(CHECKPOINT_WEAPON_CAPACITIES)){
    const atLimit=copy(saved);Object.assign(atLimit.weaponDrops[0],{weaponId,mag,reserve:weaponId==='rpg7'?3:300,taken:true});assert(validateChapterCheckpoint(atLimit,context));atLimit.weaponDrops[0].mag++;assert.equal(validateChapterCheckpoint(atLimit,context),null);
  }
  delete input.weaponDrops;assert.throws(()=>captureChapterCheckpoint(input),'Missing drops must not be manufactured from kill IDs');
  input.killedEnemyIndices=[];assert.deepEqual(captureChapterCheckpoint(input).weaponDrops,[]);
});


test('schema 5 accepts only one carried primary and one sidearm and atomically rejects old six-gun state',()=>{
  const {input,context,campaign}=fixture(),saved=captureChapterCheckpoint(input);assert.deepEqual(saved.carriedLoadout,{primary:'m16a2',sidearm:'m1911'});assert.equal(saved.version,5);
  for(const mutate of[p=>delete p.carriedLoadout,p=>p.carriedLoadout=null,p=>p.carriedLoadout.primary='m1911',p=>p.carriedLoadout.sidearm='mp5',p=>p.carriedLoadout.extra='ak',p=>p.carriedLoadout.primary='ak',p=>p.player.weaponId='m249',p=>p.stowedMagazines.ak=5,p=>p.version=3]){
    const bad=copy(saved),before=copy(campaign);mutate(bad);assert.equal(applyChapterCheckpoint(campaign,bad,context),null);assert.deepEqual(campaign,before);
  }
  const restored=applyChapterCheckpoint(campaign,saved,context);restored.carriedLoadout.primary='ak';assert.equal(campaign.fieldCheckpoint.carriedLoadout.primary,'m16a2');assert.equal(Object.hasOwn(campaign,'carriedLoadout'),false,'Chapter loadout is not transferred to a different protagonist through global campaign data');
});

test('player-discarded firearm identities coexist with every dead enemy and cannot masquerade as enemy drops',()=>{
  const {input,context,campaign}=fixture();input.weaponDrops.push({dropId:'player-3',source:'player',weaponId:'m16a2',mag:11,reserve:0,taken:false,position:[4,-8],elevation:0});
  const saved=captureChapterCheckpoint(input);assert.equal(saved.weaponDrops.length,3);assert.equal(saved.weaponDrops.at(-1).source,'player');assert.equal(Object.hasOwn(saved.weaponDrops.at(-1),'enemyIndex'),false);
  for(const mutate of[p=>p.weaponDrops[2].enemyIndex=1,p=>p.weaponDrops[2].source='enemy',p=>p.weaponDrops[2].dropId='enemy-1',p=>p.weaponDrops[2].dropId='player-0',p=>p.weaponDrops[2].reserve=1,p=>p.weaponDrops.push(copy(p.weaponDrops[2])),p=>p.weaponDrops[0].dropId='enemy-7',p=>p.weaponDrops.splice(0,1)]){
    const bad=copy(saved),before=copy(campaign);mutate(bad);assert.equal(applyChapterCheckpoint(campaign,bad,context),null);assert.deepEqual(campaign,before);
  }
});

test('replacing then reclaiming a dropped rifle survives repeated saves without extra weapons or rounds',()=>{
  const {input,context,campaign}=fixture();campaign.ammoReserves={'556':80,'762':5,'9mm':3,'45':2,rocket:0};
  input.weaponDrops=[{dropId:'enemy-1',source:'enemy',enemyIndex:1,weaponId:'ak',mag:24,reserve:63,taken:false,position:[19.5,-8.25],elevation:0},{dropId:'enemy-7',source:'enemy',enemyIndex:7,weaponId:'mp5',mag:0,reserve:0,taken:false,position:[-12,6],elevation:0}];
  const total=(inventory,drops)=>ammoTotal(inventory.reserves)+inventory.mag+Object.values(inventory.stowedMagazines).reduce((a,b)=>a+b,0)+drops.filter(d=>!d.taken).reduce((a,d)=>a+d.mag+d.reserve,0);
  let inventory={carriedLoadout:input.carriedLoadout,weaponId:input.player.weaponId,mag:input.player.mag,stowedMagazines:input.stowedMagazines,reserves:campaign.ammoReserves},before=total(inventory,input.weaponDrops);
  const picked=replaceCarriedWeapon(inventory,input.weaponDrops[0]);assert(picked&&!picked.blocked);input.weaponDrops[0].taken=true;
  input.weaponDrops.push({dropId:'player-1',source:'player',...picked.replaced,taken:false,position:[8,12],elevation:0});inventory=picked;assert.equal(total(inventory,input.weaponDrops),before);
  input.player={...input.player,weaponId:inventory.weaponId,mag:inventory.mag};input.carriedLoadout=inventory.carriedLoadout;input.stowedMagazines=inventory.stowedMagazines;campaign.ammoReserves=inventory.reserves;campaign.resources.ammo=ammoTotal(inventory.reserves);
  const wire=JSON.parse(JSON.stringify(captureChapterCheckpoint(input)));
  for(let n=0;n<5;n++){
    campaign.resources.ammo=0;campaign.ammoReserves=createAmmoReserves(0);const restored=applyChapterCheckpoint(campaign,wire,context);
    const live={carriedLoadout:restored.carriedLoadout,weaponId:restored.player.weaponId,mag:restored.player.mag,stowedMagazines:restored.stowedMagazines,reserves:restored.ammoReserves};
    assert.equal(total(live,restored.weaponDrops),before);assert.equal(replaceCarriedWeapon(live,restored.weaponDrops[0]),null,'Consumed enemy gun cannot be granted after restore');
    const reclaimed=replaceCarriedWeapon(live,restored.weaponDrops.find(d=>d.dropId==='player-1'));assert.equal(reclaimed.carriedLoadout.primary,'m16a2');assert.equal(reclaimed.mag,11);assert.equal(reclaimed.replaced.weaponId,'ak');assert.equal(reclaimed.replaced.mag,24);
    const ground=restored.weaponDrops.map(d=>({...d,taken:d.dropId==='player-1'?true:d.taken}));ground.push({dropId:'player-2',source:'player',...reclaimed.replaced,taken:false,position:[9,12],elevation:0});assert.equal(total(reclaimed,ground),before);
    restored.carriedLoadout.primary='m249';restored.weaponDrops[0].position[0]=999;assert.equal(campaign.fieldCheckpoint.carriedLoadout.primary,'ak');assert.deepEqual(campaign.fieldCheckpoint.weaponDrops,wire.weaponDrops);
  }
});

test('schema 5 restores an in-progress roof RPG reload without adding rockets or losing height',async()=>{
 const {createSupportWeaponState,stepSupportWeapon}=await import('../src/enemy-support.js');const {input,context,campaign}=fixture();
 const spec={id:'roof-six',supportId:'roof-six',enemyId:'enemy-8',weaponId:'rpg7',activationDelay:0,elevation:7,worldY:7,origin:[30,20],roofBounds:{minX:25,maxX:35,minZ:15,maxZ:25},retreat:[28,18]};
 const state=createSupportWeaponState(spec);for(let t=0;t<3.6;t+=.05)stepSupportWeapon(state,.05,{alive:true,visible:true,aligned:true,distance:30,targetId:'player',combatAllowed:true});assert.equal(state.shotsFired,1);assert(state.reloadRemaining>0);
 context.supportSpecs=[spec];input.supportSpecs=[spec];input.supportState=[{supportId:spec.id,enemyId:spec.enemyId,weaponId:'rpg7',position:[30,7,20],state}];campaign.ammoReserves={...createAmmoReserves(90),rocket:2};
 const saved=captureChapterCheckpoint(input);assert.equal(saved.version,5);const before=copy(campaign);
 for(const mutate of[p=>p.version=4,p=>delete p.supportState,p=>p.supportState=[],p=>p.supportState.push(copy(p.supportState[0])),p=>p.supportState[0].state.reserve++,p=>p.supportState[0].state.shotsFired=0,p=>p.supportState[0].position[1]=0,p=>p.supportState[0].position[0]=90,p=>p.supportState[0].enemyId='enemy-9',p=>delete p.ammoReserves.rocket]){const bad=copy(saved);mutate(bad);assert.equal(applyChapterCheckpoint(campaign,bad,context),null);assert.deepEqual(campaign,before);}
 for(let n=0;n<4;n++){const restored=applyChapterCheckpoint(campaign,JSON.parse(JSON.stringify(saved)),context);assert.equal(restored.ammoReserves.rocket,2);assert.deepEqual(restored.supportState[0],saved.supportState[0]);const live=restored.supportState[0].state;for(let t=0;t<live.reloadRemaining-.3;t+=.05)stepSupportWeapon(live,.05,{alive:true,visible:true,aligned:true,distance:30,targetId:'player',combatAllowed:true});assert.equal(live.mag+live.reserve+live.shotsFired,3);assert.equal(campaign.fieldCheckpoint.supportState[0].state.mag,0);}
});

test('a dead roof launcher keeps the exact remaining physical drop and can never resume aiming',async()=>{
 const {createSupportWeaponState,stepSupportWeapon}=await import('../src/enemy-support.js');const {input,context,campaign}=fixture();const spec={id:'roof-dead',supportId:'roof-dead',enemyId:'enemy-7',weaponId:'rpg7',activationDelay:0,elevation:6,worldY:6,origin:[7,0],roofBounds:{minX:3,maxX:12,minZ:-5,maxZ:5}};
 const state=createSupportWeaponState(spec);for(let t=0;t<3.4;t+=.05)stepSupportWeapon(state,.05,{alive:true,visible:true,aligned:true,distance:30,targetId:'player',combatAllowed:true});stepSupportWeapon(state,0,{alive:false});
 input.supportSpecs=context.supportSpecs=[spec];input.supportState=[{supportId:spec.id,enemyId:spec.enemyId,weaponId:'rpg7',position:[7,6,0],state}];const drop=input.weaponDrops.find(d=>d.enemyIndex===7);Object.assign(drop,{weaponId:'rpg7',mag:state.mag,reserve:state.reserve,elevation:6,position:[7,0]});const saved=captureChapterCheckpoint(input);
 for(let n=0;n<3;n++){const restored=applyChapterCheckpoint(campaign,saved,context);assert.equal(restored.weaponDrops.find(d=>d.enemyIndex===7).elevation,6);assert.equal(restored.supportState[0].state.dead,true);assert.deepEqual(stepSupportWeapon(restored.supportState[0].state,20,{alive:true,visible:true,aligned:true,distance:30,targetId:'player',combatAllowed:true}),[]);}
 const bad=copy(saved);bad.weaponDrops.find(d=>d.enemyIndex===7).reserve++;assert.equal(validateChapterCheckpoint(bad,context),null,'The same spent rocket cannot reappear as extra loot');
});

test('schema 5 retains in-flight rockets from an already-dead roof operator and finite airborne support',async()=>{
 const {createSupportWeaponState,stepSupportWeapon}=await import('../src/enemy-support.js');const {createRocketProjectiles}=await import('../src/rocket-projectiles.js');const {createAirSupport}=await import('../src/air-support.js');const {traceObstacles}=await import('../src/ballistics.js');
 const {input,context,campaign}=fixture(),spec={id:'roof-flight',supportId:'roof-flight',enemyId:'enemy-7',weaponId:'rpg7',activationDelay:0,elevation:6,worldY:6,origin:[7,0],roofBounds:{minX:3,maxX:12,minZ:-5,maxZ:5}};
 const state=createSupportWeaponState(spec);for(let t=0;t<3.3;t+=.05)stepSupportWeapon(state,.05,{alive:true,visible:true,aligned:true,distance:30,targetId:'player',combatAllowed:true});assert.equal(state.shotsFired,1);stepSupportWeapon(state,0,{alive:false});input.supportSpecs=context.supportSpecs=[spec];input.supportState=[{supportId:spec.id,enemyId:spec.enemyId,weaponId:'rpg7',position:[7,6,0],state}];Object.assign(input.weaponDrops.find(d=>d.enemyIndex===7),{weaponId:'rpg7',mag:state.mag,reserve:state.reserve,elevation:6,position:[7,0]});
 const flight=createRocketProjectiles();flight.launch({origin:{x:7,y:7.35,z:0},direction:{x:0,y:0,z:1},ownerId:'enemy-7',faction:'enemy'});flight.update(.1);input.rocketState=flight.snapshot();
 const air=createAirSupport({enabled:true}),airContext={sockets:[{id:'hawk-gun',position:{x:0,y:25,z:0}}],targets:[{id:'enemy-8',hostile:true,alive:true,position:{x:0,y:0,z:45}}],friendlies:[],clear:()=>true,aim:()=>true};for(let t=0;t<10;t+=.05)air.update(.05,airContext);input.airSupportState=air.snapshot();assert(input.airSupportState.shots>0&&input.airSupportState.ammo<180);
 const saved=captureChapterCheckpoint(input);assert.equal(saved.rocketState.records.length,1);const restored=applyChapterCheckpoint(campaign,JSON.parse(JSON.stringify(saved)),context);assert.deepEqual(restored.rocketState,saved.rocketState);assert.deepEqual(restored.airSupportState,saved.airSupportState);
 let impacts=0;const resumed=createRocketProjectiles({trace:(from,to)=>traceObstacles(from,to,[{minX:5,maxX:9,minZ:30,maxZ:31,minY:0,maxY:10}]),onImpact:()=>impacts++});assert(resumed.restore(restored.rocketState));resumed.update(0);assert.equal(impacts,0);for(let t=0;t<.7;t+=.05)resumed.update(.05);assert.equal(impacts,1);assert.equal(resumed.snapshot().launched,1);const afterImpact=resumed.snapshot();assert(resumed.restore(afterImpact));resumed.update(.5);assert.equal(impacts,1,'A completed projectile cannot impact a second time after restore');
 const resumedAir=createAirSupport();assert(resumedAir.restore(restored.airSupportState));assert.equal(resumedAir.snapshot().ammo,saved.airSupportState.ammo);resumedAir.update(0,airContext);assert.deepEqual(resumedAir.snapshot(),saved.airSupportState);
});

test('checkpoint rocket owners cannot be forged into ordinary enemies or unidentified allies',async()=>{
 const {createRocketProjectiles}=await import('../src/rocket-projectiles.js');const {input,context,campaign}=fixture(),flight=createRocketProjectiles();flight.launch({origin:{x:0,y:1.7,z:0},direction:{x:0,y:0,z:1},ownerId:'player',faction:'player'});input.rocketState=flight.snapshot();const saved=captureChapterCheckpoint(input),before=copy(campaign);
 for(const mutate of[p=>delete p.rocketState,p=>delete p.airSupportState,p=>p.rocketState.records[0].ownerId='enemy-1',p=>p.rocketState.records[0].faction='ally',p=>p.airSupportState.ammo++,p=>p.airSupportState.shots=10]){const bad=copy(saved);mutate(bad);assert.equal(applyChapterCheckpoint(campaign,bad,context),null);assert.deepEqual(campaign,before);}
});


test('mounted AI burst and wait survive repeated Continue and reject over-budget shots',()=>{
 const {input,context,campaign}=fixture(),saved=captureChapterCheckpoint(input);
 for(let i=0;i<4;i++){const m=applyChapterCheckpoint(campaign,saved,context).mountedWeapons[0];assert.equal(m.aiWait,2.3);assert.equal(m.burst,2);assert.equal(m.shotsAI,8);assert.equal(m.gun.shots,8);}
 for(const patch of[{aiWait:-.1},{aiWait:31},{burst:6},{burst:1.2},{shotsAI:9},{shotsAI:-1}]){const bad=copy(saved);Object.assign(bad.mountedWeapons[0],patch);assert.equal(validateChapterCheckpoint(bad,context),null);}
 const legacy=fixture();for(const key of['aiWait','burst','shotsAI'])delete legacy.input.mountedWeapons[0][key];const m=captureChapterCheckpoint(legacy.input).mountedWeapons[0];assert.equal(m.aiWait,0);assert.equal(m.burst,0);assert.equal(m.shotsAI,0);
});

test('a technical observer owns one portable drop while its mounted belt stays in the vehicle',async()=>{
 const {createSupportWeaponState,stepSupportWeapon}=await import('../src/enemy-support.js');const {input,context,campaign}=fixture();
 const spec={id:'technical-crew',supportId:'technical-crew',enemyId:'enemy-7',weaponId:'ak',fireControlledBy:'vehicle',vehicleId:'vehicle-gun-0',elevation:1.05,origin:[7,0]},state=createSupportWeaponState(spec);
 for(let t=0;t<20;t+=.05)assert.deepEqual(stepSupportWeapon(state,.05,{alive:true,visible:true,aligned:true,distance:30,targetId:'player',combatAllowed:true}),[]);
 assert.equal(state.phase,'observer');assert.equal(state.shotsFired,0);stepSupportWeapon(state,0,{alive:false});
 input.supportSpecs=context.supportSpecs=[spec];input.supportState=[{supportId:spec.id,enemyId:spec.enemyId,weaponId:'ak',position:[7,1.05,0],state}];Object.assign(input.weaponDrops.find(d=>d.enemyIndex===7),{weaponId:'ak',mag:30,reserve:60,elevation:1.05,position:[7,0]});
 const saved=captureChapterCheckpoint(input);for(let n=0;n<3;n++){const restored=applyChapterCheckpoint(campaign,saved,context);assert.equal(restored.supportState[0].state.phase,'dead');assert.equal(restored.supportState[0].state.shotsFired,0);assert.equal(restored.weaponDrops.find(d=>d.enemyIndex===7).mag,30);assert.equal(restored.mountedWeapons[0].gun.ammo,92);assert.equal(restored.mountedWeapons[0].gun.shots,8);}
 assert.equal(validateChapterCheckpoint(saved,{...context,supportSpecs:[{...spec,vehicleId:'missing-technical'}]}),null);const forged=copy(saved);forged.supportState[0].state.phase='watching';assert.equal(validateChapterCheckpoint(forged,context),null);
});
