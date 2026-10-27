import test from 'node:test';
import assert from 'node:assert/strict';
import {captureChapterCheckpoint,validateChapterCheckpoint,applyChapterCheckpoint,chapterTaskSignature,CHECKPOINT_WEAPON_CAPACITIES} from '../src/chapter-checkpoints.js';
import {newCampaign,applyEffects} from '../src/simulation.js';
import {INITIAL_RESOURCES,CHAPTERS} from '../src/story.js';
import {createMountedGun,fireMountedGun,stepMountedGun,reloadMountedGun,MOUNTED_M2} from '../src/mounted-weapons.js';

const copy=value=>structuredClone(value);
function fixture(){
  const chapter={id:6,sceneId:'crash-district',tasks:[
    {id:'confirm-report',pos:[0,4],interaction:'radio',dialogue:[{text:'Confirm the crash.',speaker:'radio'}]},
    {id:'share-kit',pos:[8,12],interaction:'hold',reward:'supplies',decision:{prompt:'Who carries the kit?',options:[{id:'share',effects:{cohesion:1}},{id:'retain',effects:{medicine:1}}]}},
    {id:'reach-court',pos:[16,22],interaction:'reach'},
  ]};
  const campaign=newCampaign(INITIAL_RESOURCES);campaign.chapter=5;
  const player={x:8,z:12,y:1.72,yaw:-1.4,pitch:.13,health:62,stamina:41,mag:11,weaponId:'m16a2'};
  const stowedMagazines=Object.fromEntries(Object.keys(CHECKPOINT_WEAPON_CAPACITIES).map(k=>[k,k==='m249'?37:0]));
  const gun=createMountedGun();for(let i=0;i<8;i++){stepMountedGun(gun,.12);fireMountedGun(gun);}reloadMountedGun(gun);stepMountedGun(gun,.6);
  const context={chapter,bounds:{minX:-120,maxX:120,minZ:-120,maxZ:120},enemyCount:26,mountedWeaponIds:['vehicle-gun-0'],fieldIds:['field-6-ammo','field-6-medicine']};
  const input={...context,campaign,taskIndex:2,player,stowedMagazines,killedEnemyIndices:[7,1],smokeCharges:1,mountedWeapons:[{id:'vehicle-gun-0',gun}],fieldCollectedIds:['field-6-ammo'],pacingElapsed:628.42,taskDecisions:[{taskId:'share-kit',optionId:'share'}]};
  return {chapter,campaign,context,input};
}

test('a JSON round trip restores only completed prefix progress and every finite resource',()=>{
  const {input,context,campaign}=fixture(),saved=captureChapterCheckpoint(input),wire=JSON.parse(JSON.stringify(saved));
  campaign.resources.ammo=0;
  const restored=applyChapterCheckpoint(campaign,wire,context);
  assert.equal(restored.taskIndex,2);assert.equal(restored.nextTaskId,'reach-court');assert.deepEqual(restored.completedTaskIds,['confirm-report','share-kit']);
  assert.deepEqual(restored.player,input.player);assert.deepEqual(restored.stowedMagazines,input.stowedMagazines);assert.deepEqual(restored.killedEnemyIndices,[1,7]);assert.equal(restored.smokeCharges,1);assert.deepEqual(restored.mountedWeapons,input.mountedWeapons);assert.deepEqual(restored.fieldCollectedIds,['field-6-ammo']);assert.equal(restored.pacingElapsed,628.42);assert.deepEqual(restored.taskDecisions,input.taskDecisions);assert.deepEqual(campaign.resources,INITIAL_RESOURCES);
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
  input.player.health=1;input.stowedMagazines.m249=0;input.mountedWeapons[0].gun.ammo=0;input.campaign.resources.ammo=0;
  assert.equal(saved.player.health,62);assert.equal(saved.stowedMagazines.m249,37);assert.equal(saved.mountedWeapons[0].gun.ammo,92);assert.equal(saved.resources.ammo,90);
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
  for(const mutate of[p=>p.resources.ammo=241,p=>p.player.mag=31,p=>p.player.mag=2.5,p=>p.player.health=NaN,p=>p.player.x=121,p=>p.player.weaponId='unknown',p=>p.stowedMagazines.m16a2=11,p=>p.stowedMagazines.m249=101,p=>delete p.stowedMagazines.ak,p=>p.smokeCharges=3,p=>p.pacingElapsed=-1,p=>p.pacingElapsed=Infinity,p=>p.fieldCollectedIds.push('field-5-ammo'),p=>p.fieldCollectedIds.push('field-6-ammo'),p=>p.killedEnemyIndices.push(26),p=>p.killedEnemyIndices.push(1)]){const bad=copy(saved);mutate(bad);assert.equal(validateChapterCheckpoint(bad,context),null);}
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
  assert.equal(saved.assistUsed,true);assert.equal(saved.version,2);
  for(let n=0;n<3;n++){
    const restored=applyChapterCheckpoint(campaign,saved,context);
    let aidCount=0;
    if(!restored.assistUsed&&restored.player.health<35){aidCount++;restored.player.health+=25;}
    assert.equal(aidCount,0);assert.equal(restored.player.health,29);
    assert.equal(campaign.fieldCheckpoint.assistUsed,true);
  }
  const before=copy(campaign);
  for(const mutate of[p=>delete p.assistUsed,p=>p.assistUsed=0,p=>p.assistUsed='false',p=>p.assistUsed=null,p=>p.version=1]){
    const bad=copy(saved);mutate(bad);
    assert.equal(applyChapterCheckpoint(campaign,bad,context),null);
    assert.deepEqual(campaign,before,'old/invalid aid state must not partially restore a save');
  }
  delete input.assistUsed;
  assert.equal(captureChapterCheckpoint(input).assistUsed,false,'new captures default to unused only when the caller omits the flag');
});
