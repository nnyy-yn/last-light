import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createNavigator} from '../src/actor-behavior.js';
import {CHAPTERS} from '../src/story.js';
import {campaignChapter} from '../src/campaign-tasks.js';
import {AMMO_TYPES,ammoTotal,validateAmmoReserves} from '../src/ammunition.js';
import {CHAPTER_CHECKPOINT_VERSION} from '../src/chapter-checkpoints.js';
import {blocked,lineBlocked,applyEffects,SETTINGS_KEY,SAVE_KEY} from '../src/simulation.js';

const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
const arg=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const baseURL=args.find(v=>/^https?:/.test(v))||'http://127.0.0.1:46171/';
const allCampaign=CHAPTERS.map(campaignChapter),chapterArgument=arg('--chapters'),targeted=args.includes('--chapters');
if(targeted)assert.match(chapterArgument||'',/^\d+(,\d+)*$/,'--chapters needs a comma-separated list such as 1,6,15');
const selectedChapterIds=targeted?chapterArgument.split(',').map(Number):allCampaign.map(c=>c.id);
assert(selectedChapterIds.length>0&&selectedChapterIds.every(id=>Number.isInteger(id)&&id>=1&&id<=allCampaign.length),'Requested chapter IDs must be 1–16');
assert.equal(new Set(selectedChapterIds).size,selectedChapterIds.length,'A targeted chapter may only occur once');
const campaign=selectedChapterIds.map(id=>allCampaign[id-1]),optionalPolicy=arg('--optional')||'mixed';
assert.ok(['all','skip','mixed'].includes(optionalPolicy),'--optional must be all, skip, or mixed');
const takeOptional=(chapter,task)=>!task.optional||optionalPolicy==='all'||optionalPolicy==='mixed'&&chapter.id%2===1;
const authoredTasks=campaign.flatMap(c=>c.tasks),playedTasks=campaign.flatMap(c=>c.tasks.filter(t=>takeOptional(c,t)));
const authoredScope={chapters:campaign.length,tasks:authoredTasks.length,mandatoryTasks:authoredTasks.filter(t=>!t.optional).length,optionalTasks:authoredTasks.filter(t=>t.optional).length,dialogue:authoredTasks.reduce((n,t)=>n+t.dialogue.length,0),fieldChoices:authoredTasks.filter(t=>t.decision).length};
const expectedTotals={chapters:campaign.length,dialogue:playedTasks.reduce((n,t)=>n+t.dialogue.length,0),tasks:authoredTasks.length,completedTasks:playedTasks.length,optionalTaken:playedTasks.filter(t=>t.optional).length,optionalSkipped:authoredTasks.length-playedTasks.length,escorts:playedTasks.filter(t=>t.interaction==='escort').length,defences:playedTasks.filter(t=>t.interaction==='defend').length,fieldChoices:playedTasks.filter(t=>t.decision).length,choices:campaign.length,handoffs:targeted?0:campaign.length-1};
for(const chapter of campaign){assert.equal(chapter.tasks.length,chapter.missionPlan.totalTaskCount);assert.deepEqual(chapter.tasks.filter(t=>t.coreIndex!=null).map(t=>t.id),CHAPTERS[chapter.id-1].tasks.map(t=>t.id));}
// This path verifies the authored QA scope without importing Playwright,
// opening a browser, creating a window, or treating estimates as measurements.
if(args.includes('--validate-plan')){console.log(JSON.stringify({coverage:targeted?'targeted-chapters':'full-campaign',selectedChapterIds,authoredScope,optionalPolicy,expectedTotals,normalPlaytimeVerified:false,fullCampaignVerified:false},null,2));process.exit(0);}
const expectedBuild=arg('--expected-build'),expectedSha256=arg('--expected-sha256');
assert.ok(expectedBuild,'Pass --expected-build so a stale build cannot pass this campaign test');
assert.match(expectedBuild,/^index-[\w-]+\.js$/);
const resumePath=arg('--resume-report');assert(!(targeted&&resumePath),'Targeted runs are isolated chapter checks and cannot resume a full-campaign report');const resumeReport=resumePath?JSON.parse(await fs.readFile(path.resolve(root,resumePath),'utf8')):null;
if(resumeReport){
  assert.notEqual(resumeReport.coverage,'targeted-chapters','A targeted result is not a complete campaign prefix');
  assert.equal(resumeReport.expectedBuild,expectedBuild,'Resume evidence must be from the same bundle');
  const complete=resumeReport.chapters.filter(c=>c.history===c.id);
  assert.deepEqual(complete.map(c=>c.id),Array.from({length:complete.length},(_,i)=>i+1),'Resume evidence must be a contiguous campaign prefix');
  assert.equal(resumeReport.failureState?.state?.saved?.history?.length,complete.length,'Resume save must match the verified prefix; a failure after an unverified choice requires a fresh full run');
  assert.equal(resumeReport.optionalPolicy,optionalPolicy,'Resume must preserve the same optional-branch coverage');
  assert.ok(!resumeReport.failureState?.state?.saved?.fieldCheckpoint?.taskIndex,'A report resume requires a chapter boundary; do not combine a partial chapter with an unverified saved prefix');
}
const output=path.join(root,targeted?'artifacts/rebuild-v0.9/targeted-chapters':'artifacts/rebuild-v0.9/campaign',expectedBuild.replace(/\.js$/,'')+'-'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(output,{recursive:true});
const artifact=name=>path.join(output,name),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const report={passed:false,started:new Date().toISOString(),baseURL,expectedBuild,expectedSha256,optionalPolicy,authoredScope,coverage:targeted?'targeted-chapters':'full-campaign',selectedChapterIds,fullCampaignVerified:false,normalPlaytimeVerified:false,headless:true,input:'DOM KeyboardEvent/MouseEvent and element.click only; no OS input or pointer lock',testMethods:{travel:'QA teleport only to legal interaction approaches; escorted actors move through their actual AI navigation while the player walks using synthetic WASD. This isolated-flow test is not evidence of a 20–25 minute normal first play.',combat:'Confirmed enemy damage through the existing damageHostile debug hook is disclosed per chapter; narrative progress, resources and simulation time are never modified',cinematics:targeted?'Explicit UI skip for selected chapter opening/task/closing animations; outgoing handoffs are outside this targeted scope':'Explicit UI skip for task/opening/closing animations; chapter transitions run on real frame time with automatic next opening, no next/play button between chapters',choices:'Authored field decisions are selected using visible enabled buttons; optional support uses the real decline UI according to --optional, and both outcomes are recorded',checkpoints:'Real midchapter reload restores schema 3 task IDs, decisions, caliber pools, loaded magazines, defeated-enemy weapon records and positions, assistance state, and pacing; no restore callbacks may award resources',entry:targeted?'Each selected chapter starts a fresh campaign through the real New UI; chapter >1 then uses the existing QA loadChapter entry, without writing resources, saves, task indices or choices':'One new campaign follows all chapters continuously'},chapters:[],errors:[],httpErrors:[],consoleErrors:[],requestFailures:[],checks:[]};
report.expectedTotals=expectedTotals;
if(resumeReport){report.resumedFrom=path.resolve(root,resumePath);report.chapters=resumeReport.chapters.filter(c=>c.history===c.id).map(c=>({...c,artifactDir:c.artifactDir||path.dirname(report.resumedFrom)}));}
const firstArrivalChapter=report.chapters.length+1;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--mute-audio','--autoplay-policy=no-user-gesture-required','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
page.setDefaultTimeout(90000);
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()});});
page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
await page.addInitScript(({key,saveKey,saved})=>{localStorage.setItem(key,JSON.stringify({graphicsVersion:2,quality:'low',renderScale:.75,gentle:true,headbob:false,volume:0,aircraftVolume:1,battleVolume:1,sensitivity:1}));if(saved&&!localStorage.getItem(saveKey))localStorage.setItem(saveKey,JSON.stringify(saved));},{key:SETTINGS_KEY,saveKey:SAVE_KEY,saved:resumeReport?.failureState?.state?.saved});
const snapshot=()=>page.evaluate(()=>({state:window.__game.getState(),inspect:window.__game.inspect(),behavior:window.__game.behaviorSnapshot(),pointerLocked:Boolean(document.pointerLockElement)}));
const mode=async()=>page.evaluate(()=>window.__game.getState().mode);
async function click(selector){const button=page.locator(selector).first();await button.waitFor({state:'visible'});assert.equal(await button.isEnabled(),true,`Disabled button ${selector}`);await button.evaluate(b=>b.click());}
async function key(code,down){await page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,key:code.startsWith('Key')?code.slice(3).toLowerCase():code,bubbles:true,repeat:false})),{code,down});}
async function tap(code){await key(code,true);await key(code,false);}
async function waitFor(predicate,label,timeout=90000){const until=Date.now()+timeout;let latest;while(Date.now()<until){latest=await snapshot();assert.notEqual(latest.state.mode,'error',label+' application error');assert.notEqual(latest.state.mode,'failed',label+' player died');assert.equal(latest.pointerLocked,false,'QA must never capture the pointer');if(predicate(latest))return latest;await page.waitForTimeout(100);}throw new Error(`${label}: timeout; ${JSON.stringify({state:latest?.state,narrative:latest?.inspect.narrative,cinematic:latest?.inspect.cinematic})}`);}
async function pauseResume(label,field){await tap('Escape');await waitFor(s=>s.state.mode==='paused',label+' pause');const before=await snapshot();await page.waitForTimeout(500);const during=await snapshot();assert.deepEqual(field(during),field(before),label+' must freeze');await click('[data-action="resume"]');await waitFor(s=>s.state.mode!=='paused',label+' resume');return {before:field(before),during:field(during)};}
async function cinematic(phase,id,pauseCheck=false){const initial=await waitFor(s=>s.state.mode==='cinematic',phase+' starts');assert.equal(initial.inspect.cinematic.phase,phase);assert.equal(initial.inspect.cinematic.sequenceId,id);assert.equal(initial.inspect.cinematic.active,true);const record={phase,id,before:initial.inspect.cinematic,method:'explicit UI skip'};
  if(pauseCheck)record.pause=await pauseResume('cinematic',s=>({time:s.inspect.cinematic.time,stage:s.inspect.cinematic.stage,camera:s.inspect.cinematic.camera}));
  await click('[data-action="skip-cinematic"]');const after=await waitFor(s=>s.state.mode!=='cinematic',phase+' skip continuation');assert.equal(after.inspect.cinematic.active,false);assert.equal(after.inspect.cinematic.owned.objects,0);assert.equal(after.inspect.cinematic.owned.worldObjects,0);record.nextMode=after.state.mode;return record;
}
function inside(p,bounds){return !bounds||p.x>bounds.minX+.4&&p.x<bounds.maxX-.4&&p.z>bounds.minZ+.4&&p.z<bounds.maxZ-.4;}
function approach(goal,inspect,preferred){const options=[];for(const radius of [1.3,1.8,2.4,2.9])for(let i=0;i<32;i++){const a=i*Math.PI/16,p={x:goal[0]+Math.cos(a)*radius,z:goal[1]+Math.sin(a)*radius};if(inside(p,inspect.scene.bounds)&&!blocked(p.x,p.z,inspect.colliders,.4)&&!lineBlocked(p,{x:goal[0],z:goal[1]},inspect.staticColliders))options.push(p);}options.sort((a,b)=>Math.hypot(a.x-preferred.x,a.z-preferred.z)-Math.hypot(b.x-preferred.x,b.z-preferred.z));return options[0];}
async function positionForTask(spec,index){const before=await snapshot(),task=before.inspect.tasks[index];if(spec.interaction==='radio'||CHAPTERS[before.state.chapter-1].movementLocked)return before;const goal=task.goal||task.actorPosition||task.pos,p=approach(goal,before.inspect,before.state.player);assert.ok(p,`No legal unobstructed approach: chapter ${before.state.chapter} ${spec.id}`);await page.evaluate(({p,goal})=>{window.__game.teleport(p.x,p.z);window.__game.lookAt(goal[0],1.2,goal[1]);},{p,goal});const after=await snapshot();assert.equal(blocked(after.state.player.x,after.state.player.z,after.inspect.colliders,.4),false,'A QA approach must not place the player inside any physical obstacle');return after;}
async function pressE(){const before=await snapshot(),signature=JSON.stringify([before.inspect.narrative.taskIndex,before.inspect.narrative.phase,before.inspect.narrative.lineIndex,before.state.mode]);await key('KeyE',true);try{return await waitFor(s=>JSON.stringify([s.inspect.narrative.taskIndex,s.inspect.narrative.phase,s.inspect.narrative.lineIndex,s.state.mode])!==signature,'fresh E press advances one narrative step',15000);}finally{await key('KeyE',false);}}
async function dialogue(spec,index,chapterRecord){await positionForTask(spec,index);let result=await pressE();const lines=[];for(let i=0;i<spec.dialogue.length;i++){
    assert.equal(result.inspect.narrative.phase,'dialogue');assert.equal(result.inspect.narrative.taskIndex,index);assert.equal(result.inspect.narrative.lineIndex,i);assert.deepEqual(result.inspect.narrative.line,spec.dialogue[i]);lines.push(result.inspect.narrative.line);
    if(chapterRecord.id===1&&index===0&&i===1){chapterRecord.dialoguePause=await pauseResume('dialogue',s=>({task:s.inspect.narrative.taskId,line:s.inspect.narrative.lineIndex,player:[s.state.player.x,s.state.player.z]}));const fixed=await snapshot();await key('KeyW',true);await page.waitForTimeout(400);await key('KeyW',false);const later=await snapshot();assert.deepEqual([later.state.player.x,later.state.player.z],[fixed.state.player.x,fixed.state.player.z]);chapterRecord.dialogueMovementFrozen=true;}
    if(i===spec.dialogue.length-1)assert.equal(result.inspect.tasks[index].done,false,'Displaying the last line is not completion');
    result=await pressE();
  }
  return {lines,result};
}
async function fieldDecision(spec,index,record){
  if(!spec.decision)return;
  const before=await waitFor(s=>s.inspect.narrative.phase==='decision','field decision '+spec.id);
  assert.equal(before.state.task,index);assert.equal(before.inspect.tasks[index].done,false);assert.deepEqual(before.inspect.narrative.decision,spec.decision);
  const panel=page.locator('#task-decision');await panel.waitFor({state:'visible'});assert.ok((await panel.textContent()).includes(spec.decision.prompt));
  if(record.id===1&&!record.decisionPause)record.decisionPause=await pauseResume('field decision',s=>({phase:s.inspect.narrative.phase,task:s.state.task,resources:s.state.resources,choices:s.inspect.pacing.taskDecisions,pacing:s.inspect.pacing.activeSeconds}));
  const preferred=spec.decision.options[(record.id+index)%spec.decision.options.length];
  let chosen=page.locator(`[data-action="task-decision"][data-value="${preferred.id}"]`);
  if(!await chosen.isEnabled())chosen=page.locator('[data-action="task-decision"]:enabled').first();
  assert(await chosen.count(),'At least one field response must remain available');
  const optionId=await chosen.getAttribute('data-value'),option=spec.decision.options.find(o=>o.id===optionId);assert(option);
  await chosen.evaluate(button=>button.click());
  const after=await waitFor(s=>s.inspect.narrative.phase!=='decision','field response accepted');
  assert.deepEqual(after.state.resources,applyEffects(before.state.resources,option.effects),'A field decision applies its bounded resources exactly once');
  const entries=after.inspect.pacing.taskDecisions.filter(d=>d.taskId===spec.id);assert.deepEqual(entries,[{taskId:spec.id,optionId}]);
  const events=after.inspect.storyEvents.filter(e=>e.type==='decision-made'&&e.taskId===spec.id);assert.equal(events.length,1);
  record.fieldChoices.push({taskId:spec.id,optionId,label:option.label,response:option.response,before:before.state.resources,after:after.state.resources,event:events[0]});
}
function dropsFromRuntime(snapshot){return snapshot.inspect.weaponDrops.map(({enemyIndex,weaponId,mag,reserve,taken,position})=>({enemyIndex,weaponId,mag,reserve,taken,position:[...position]})).sort((a,b)=>a.enemyIndex-b.enemyIndex);}
function inventoryTotal(state){return ammoTotal(state.ammoReserves)+state.player.mag+Object.values(state.stowedMagazines).reduce((sum,count)=>sum+count,0);}
function assertAmmoState(state,label){assert.deepEqual(Object.keys(state.ammoReserves).sort(),[...AMMO_TYPES].sort(),label);assert(validateAmmoReserves(state.ammoReserves,state.resources.ammo),label+' must keep every caliber and reserve total consistent');}
async function checkpointRoundTrip(record){
  const before=await snapshot(),saved=before.state.saved.fieldCheckpoint;assert(saved,'Completed operation must save an in-chapter checkpoint');
  assert.equal(saved.version,CHAPTER_CHECKPOINT_VERSION);assert.equal(saved.version,3);
  assert.equal(saved.chapterId,record.id);assert.equal(saved.taskIndex,before.state.task);
  assertAmmoState(before.state,'before reload');assert.deepEqual(saved.ammoReserves,before.state.ammoReserves);assert.deepEqual(saved.stowedMagazines,before.state.stowedMagazines);assert.equal(saved.player.weaponId,before.state.player.weaponId);assert.equal(saved.player.mag,before.state.player.mag);
  assert.deepEqual(saved.weaponDrops,dropsFromRuntime(before));assert.deepEqual(saved.weaponDrops.map(d=>d.enemyIndex),saved.killedEnemyIndices);const ammunitionBefore=inventoryTotal(before.state);
  assert.deepEqual(saved.completedTaskIds,before.inspect.tasks.slice(0,before.state.task).map(t=>t.id));
  assert.deepEqual(saved.taskDecisions,before.inspect.pacing.taskDecisions);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__game&&window.__game.getState().mode==='menu',undefined,{timeout:180000});
  await click('[data-action="continue"]');
  const after=await waitFor(s=>s.state.mode==='playing'&&s.state.chapter===record.id,'midchapter continuation',180000);
  assert.equal(after.state.task,saved.taskIndex);assert.equal(after.inspect.narrative.phase,'idle');assert.deepEqual(after.state.resources,saved.resources);
  assert.deepEqual(after.inspect.pacing.taskDecisions,saved.taskDecisions);
  assert.deepEqual(after.inspect.tasks.filter(t=>t.done).map(t=>t.id),saved.completedTaskIds);
  assert.deepEqual(after.inspect.enemies.flatMap((e,i)=>e.alive?[]:[i]),saved.killedEnemyIndices);
  assertAmmoState(after.state,'after reload');assert.deepEqual(after.state.ammoReserves,saved.ammoReserves);assert.deepEqual(after.state.stowedMagazines,saved.stowedMagazines);assert.equal(after.state.player.weaponId,saved.player.weaponId);assert.equal(after.state.player.mag,saved.player.mag);assert.equal(inventoryTotal(after.state),ammunitionBefore);
  assert.deepEqual(dropsFromRuntime(after),saved.weaponDrops);assert.equal(after.state.saved.fieldCheckpoint.assistUsed,saved.assistUsed);
  for(const drop of saved.weaponDrops){const live=after.inspect.weaponDrops.find(d=>d.enemyIndex===drop.enemyIndex),enemy=after.inspect.enemies[drop.enemyIndex];assert.equal(live.visible,!drop.taken);assert.deepEqual([enemy.actualPosition[0],enemy.actualPosition[2]],drop.position,'A defeated enemy and its gun stay at the saved fall location');}
  assert(after.inspect.pacing.activeSeconds>=saved.pacingElapsed&&after.inspect.pacing.activeSeconds-saved.pacingElapsed<5,'Pacing restores from saved elapsed time without inventing minutes');
  assert.equal(after.inspect.storyEvents.some(e=>e.type==='task-complete'||e.type==='decision-made'),false,'Restoration cannot replay task rewards or decisions');
  record.checkpointRoundTrip={schemaVersion:saved.version,ammoReserves:saved.ammoReserves,stowedMagazines:saved.stowedMagazines,weaponDrops:saved.weaponDrops,takenDropCount:saved.weaponDrops.filter(d=>d.taken).length,ammunitionTotal:ammunitionBefore,assistUsed:saved.assistUsed,taskIndex:saved.taskIndex,taskDecisions:saved.taskDecisions,resources:saved.resources,completedTaskIds:saved.completedTaskIds,beforeSeconds:saved.pacingElapsed,afterSeconds:after.inspect.pacing.activeSeconds,method:'Actual page reload and Continue UI; no progress writes'};
}
function clearSegment(a,b,boxes,radius=.47){const d=Math.hypot(a.x-b.x,a.z-b.z),steps=Math.ceil(d/.25);for(let i=0;i<=steps;i++){const t=steps?i/steps:0;if(blocked(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,boxes,radius))return false;}return true;}
function walkPath(start,end,boxes,bounds){assert.ok(bounds&&Object.values(bounds).every(Number.isFinite),'Expanded scene bounds must be exposed');const nav=createNavigator({cellSize:.75,radius:.47});nav.setBounds(bounds);nav.setColliders(boxes);assert.deepEqual(nav.bounds,bounds);const route=nav.findPath(start,end,120000);assert.ok(route.length,'Escort must have an actual collision-safe route');let previous=start;for(const p of route){assert.ok(inside(p,bounds));assert.ok(clearSegment(previous,p,boxes),'Each escort leg must fit a whole person, not only a centre ray');previous=p;}return route;}

async function escort(spec,index,chapterRecord){const initial=await snapshot(),actorStart=initial.inspect.tasks[index].actorPosition;assert.ok(actorStart,'Actor positions must be exposed for real escort verification');const goal=initial.inspect.tasks[index].anchor,center={x:goal[0],z:goal[1]},end=inside(center,initial.inspect.scene.bounds)&&!blocked(center.x,center.z,initial.inspect.colliders,.47)?center:approach(goal,initial.inspect,center);assert.ok(end,'Escort endpoint is reachable');const route=walkPath(initial.state.player,end,initial.inspect.colliders,initial.inspect.scene.bounds),trace=[],deadline=Date.now()+240000;let waypoint=0,moving=false,lastMovement=Date.now(),lastActor=actorStart,actorTravel=0;chapterRecord.escort={taskId:spec.id,actorStart,goal,end,route,trace,method:'Actual actor director follow + DOM WASD; no actor position edits'};
  while(Date.now()<deadline){const s=await snapshot();assert.notEqual(s.state.mode,'failed');const task=s.inspect.tasks[index],actor=task.actorPosition;if(actor){const move=Math.hypot(actor[0]-lastActor[0],actor[1]-lastActor[1]);actorTravel+=move;if(move>.05)lastMovement=Date.now();lastActor=actor;}
    trace.push({gameTime:s.behavior.time,player:[s.state.player.x,s.state.player.z],actor,phase:s.inspect.narrative.phase,mode:s.state.mode});
    if(s.state.task>index)break;
    assert.equal(s.state.mode,'playing');assert.equal(s.inspect.narrative.phase,'action');
    while(waypoint<route.length&&Math.hypot(s.state.player.x-route[waypoint].x,s.state.player.z-route[waypoint].z)<.7&&(!route[waypoint+1]||clearSegment(s.state.player,route[waypoint+1],s.inspect.colliders)))waypoint++;
    const gap=Math.hypot(actor[0]-s.state.player.x,actor[1]-s.state.player.z),shouldMove=waypoint<route.length&&gap<7;
    if(shouldMove){await page.evaluate(p=>window.__game.lookAt(p.x,1.68,p.z),route[waypoint]);if(!moving){await key('KeyW',true);moving=true;}}
    else if(moving){await key('KeyW',false);moving=false;}
    assert.ok(Date.now()-lastMovement<45000,`Escorted ${spec.speaker} stopped following for 45 wall seconds`);
    await page.waitForTimeout(180);
  }
  await key('KeyW',false);const final=await snapshot();assert.equal(final.state.task,index+1,'Escort must actually finish');assert.ok(actorTravel>5,'Escorted actor must really travel, not exist at the destination');const position=final.inspect.tasks[index].actorPosition;assert.ok(Math.hypot(position[0]-goal[0],position[1]-goal[1])<5.05);assert.ok(Math.hypot(final.state.player.x-goal[0],final.state.player.z-goal[1])<4.05);chapterRecord.escort={taskId:spec.id,actorStart,goal,end,route,actorTravel,trace,method:'Actual actor director follow + DOM WASD; no actor position edits'};chapterRecord.escorts.push(chapterRecord.escort);
}
async function damageForFlow(chapterRecord){const before=await snapshot();if(!before.inspect.enemies.length)return;assert.equal(await page.evaluate(()=>typeof window.__game.damageHostile),'function','Need explicitly disclosed damage hook');const records=await page.evaluate(()=>window.__game.inspect().enemies.map((enemy,index)=>{if(!enemy.alive)return {index,alreadyDown:true};const result=window.__game.damageHostile(index,100);return {index,before:enemy.health,result};}));const after=await snapshot();assert.equal(after.state.enemyCount,0);chapterRecord.combatPreparation={method:'Debug damageHostile calls normal damageEnemy; not player-earned kills; no narrative bypass',beforeAlive:before.state.enemyCount,confirmedDead:after.inspect.enemies.filter(e=>!e.alive).length,records};}
async function actionForTask(spec,index,chapterRecord){if(['talk','radio','reach'].includes(spec.interaction))return;
  if(spec.interaction==='escort'){await escort(spec,index,chapterRecord);return;}
  if(spec.interaction==='hold'){
    if(spec.id==='check-kit'){await key('KeyE',true);await waitFor(s=>s.inspect.narrative.progress>.15,'hold starts');await key('KeyE',false);await waitFor(s=>s.inspect.narrative.progress===0,'hold release cancels');chapterRecord.holdInterrupted=true;}
    await key('KeyE',true);try{await waitFor(s=>s.state.task===index+1,`hold ${spec.id}`,90000);}finally{await key('KeyE',false);}return;
  }
  if(spec.interaction==='defend'){
    const before=await snapshot(),trace=[];if(spec.id==='crash-approach'){await waitFor(s=>s.inspect.narrative.defendElapsed>.5,'defence starts');chapterRecord.defencePause=await pauseResume('defence',s=>({time:s.inspect.narrative.defendElapsed,task:s.inspect.narrative.taskId}));}
    const done=await waitFor(s=>{trace.push({time:s.behavior.time,defendElapsed:s.inspect.narrative.defendElapsed,kills:s.inspect.narrative.kills,task:s.state.task});return s.state.task===index+1;},`real defence ${spec.id}`,150000);
    const began=done.inspect.storyEvents.find(e=>e.type==='action-start'&&e.taskId===spec.id),ended=done.inspect.storyEvents.find(e=>e.type==='task-complete'&&e.taskId===spec.id);assert.ok(began&&ended,'Defence events must be present');const gameTimeElapsed=ended.time-began.time;chapterRecord.defend={taskId:spec.id,requiredSeconds:spec.defendSeconds,requiredKills:spec.requiredKills,gameTimeElapsed,observedFrom:before.inspect.narrative.defendElapsed,trace};chapterRecord.defences.push(chapterRecord.defend);assert.ok(gameTimeElapsed>=spec.defendSeconds-.075,'Defence must wait actual game time');assert.ok(done.inspect.enemies.filter(e=>!e.alive).length>=spec.requiredKills);
  }
}
async function cockpitCheck(record){const start=await snapshot();assert.equal(start.inspect.scene.id,'super64-cockpit');assert.ok(start.state.player.y<1.2);for(const code of ['KeyW','KeyA','KeyS','KeyD']){await key(code,true);await page.waitForTimeout(180);await key(code,false);}const after=await snapshot();assert.deepEqual([after.state.player.x,after.state.player.z],[start.state.player.x,start.state.player.z]);record.cockpit={movementLocked:true,before:start.state.player,after:after.state.player,method:'Four actual DOM WASD inputs, no teleport in chapter 9'};}

try{
  const entry=new URL(baseURL);entry.searchParams.set('qa','1');await page.goto(entry.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__game&&window.__game.getState().mode==='menu',undefined,{timeout:180000});
  const scripts=await page.evaluate(()=>[...document.scripts].map(s=>s.src).filter(Boolean));const scriptURL=scripts.find(u=>new URL(u).pathname.endsWith('/'+expectedBuild));assert.ok(scriptURL,`Expected ${expectedBuild}, got ${scripts.join(',')}`);const bundle=await page.request.get(scriptURL);assert.equal(bundle.status(),200);report.scriptURL=scriptURL;report.scriptSha256=sha(await bundle.body());if(expectedSha256)assert.equal(report.scriptSha256,expectedSha256);if(resumeReport)assert.equal(report.scriptSha256,resumeReport.scriptSha256,'Resume must execute identical bundle bytes');
  if(resumeReport){await click('[data-action="continue"]');assert.equal((await snapshot()).state.saved.history.length,report.chapters.length);}else{await click('[data-action="new"]');if(await mode()==='confirm')await click('[data-action="confirm-new"]');}
  for(const chapter of campaign.slice(report.chapters.length)){
    if(targeted){
      if(report.chapters.length){await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__game&&window.__game.getState().mode==='menu',undefined,{timeout:180000});await click('[data-action="new"]');if(await mode()==='confirm')await click('[data-action="confirm-new"]');}
      if(chapter.id>1)await page.evaluate(index=>window.__game.loadChapter(index),chapter.id-1);
      assert.equal((await snapshot()).state.saved.history.length,0,'Targeted entry must use a fresh real campaign');
    }
    const record={id:chapter.id,title:chapter.title,artifactDir:output,tasks:[],fieldChoices:[],escorts:[],defences:[],cinematics:[]};report.chapters.push(record);
    const intro=await waitFor(s=>s.state.chapter===chapter.id&&['intro','cinematic'].includes(s.state.mode),'chapter arrival');assert.equal(intro.state.chapter,chapter.id);record.scene=intro.inspect.scene;record.colliderSignature=sha(JSON.stringify(intro.inspect.staticColliders));assert.ok(record.scene?.id);assert.equal(intro.state.task,0);assert.equal(intro.inspect.narrative.phase,'idle');
    if(!targeted&&chapter.id!==firstArrivalChapter)assert.equal(intro.state.mode,'cinematic','An automatic handoff may not stop at another intro');
    if(intro.state.mode==='intro')await click('[data-action="play"]');record.cinematics.push(await cinematic('opening',chapter.opening,chapter.id===1));await waitFor(s=>s.state.mode==='playing','chapter gameplay');
    const materialized=await snapshot();assertAmmoState(materialized.state,'chapter entry');assert.deepEqual(materialized.inspect.tasks.map(t=>t.id),chapter.tasks.map(t=>t.id),'Runtime must preserve the full interleaved authored chain');
    record.reachableOperations=[];
    if(!chapter.movementLocked){const nav=createNavigator({cellSize:.75,radius:.36});nav.setBounds(materialized.inspect.scene.bounds);nav.setColliders(materialized.inspect.colliders);
      for(const task of materialized.inspect.tasks){if(task.interaction==='radio')continue;const goal=task.goal,standing=approach(goal,materialized.inspect,materialized.state.player);assert.ok(standing,task.id+' has an unobstructed standing position');assert.ok(nav.findPath(materialized.state.player,standing,120000).length,task.id+' is reachable through actual buildings, vehicles and supplies');record.reachableOperations.push(task.id);}
    }
    assert.deepEqual(materialized.inspect.pacing.targetMinutes,chapter.missionPlan.targetMinutes);assert.match(materialized.inspect.pacing.estimateNote,/尚未实测/);
    record.actorReuse=[];
    for(const task of materialized.inspect.tasks){
      const spec=chapter.tasks.find(t=>t.id===task.id);assert.deepEqual(task.decision,spec.decision);assert.equal(Boolean(task.optional),Boolean(spec.optional));assert.equal(task.sceneEvent,spec.sceneEvent);
      if(task.actorFrom){const source=materialized.inspect.tasks.find(t=>t.id===task.actorFrom);assert(source);assert.equal(task.actorId,source.actorId,'A repeated person must reuse the source actor');record.actorReuse.push({taskId:task.id,actorFrom:task.actorFrom,actorId:task.actorId});}
    }
    if(chapter.id===9)await cockpitCheck(record);
    await damageForFlow(record);
    await page.screenshot({path:artifact(`chapter-${String(chapter.id).padStart(2,'0')}-${record.scene.id}.png`)});
    for(const [index,spec]of chapter.tasks.entries()){
      const before=await snapshot();assert.equal(before.state.task,index);if(spec.interaction==='radio'){assert.equal(before.inspect.tasks[index].virtual,true,'Radio task must not have a spawned world object');}
      if(chapter.id===9){const gordon=before.inspect.tasks.find(t=>t.id==='durant-wait'),gordonIndex=before.inspect.tasks.findIndex(t=>t.id==='durant-wait');assert(gordon);assert.equal(gordon.visible,index>=gordonIndex,'Gordon appears only when the authored durant-wait node begins');record.gordonStaging??=[];record.gordonStaging.push({taskId:spec.id,visible:gordon.visible,actorPosition:gordon.actorPosition,anchor:gordon.anchor});if(spec.id==='durant-wait'){assert.ok(Math.hypot(gordon.actorPosition[0]-before.state.player.x,gordon.actorPosition[1]-before.state.player.z)>=1.3,'Gordon stands beside the cockpit rather than overlapping the seated player');assert.equal(lineBlocked(before.state.player,{x:gordon.goal[0],z:gordon.goal[1]},before.inspect.staticColliders),false,'Gordon dialogue must have a clear door-side sightline');await page.evaluate(p=>window.__game.lookAt(p[0],1.4,p[1]),gordon.actorPosition);await page.screenshot({path:artifact('chapter-09-gordon-at-door.png')});}}
      if(spec.optional&&!takeOptional(chapter,spec)){
        await click('[data-action="skip-optional"]');const skipped=await waitFor(s=>s.state.task===index+1,'decline optional '+spec.id);
        assert.equal(skipped.inspect.tasks[index].done,true);assert.deepEqual(skipped.state.resources,before.state.resources,'Declining cannot award supplies');
        const events=skipped.inspect.storyEvents.filter(e=>e.type==='task-complete'&&e.taskId===spec.id);assert.equal(events.length,1);assert.equal(events[0].skipped,true);
        assert.equal(skipped.inspect.storyEvents.some(e=>['dialogue','action-start'].includes(e.type)&&e.taskId===spec.id),false);
        assert.equal(skipped.state.mode,index===chapter.tasks.length-1?'choice':'playing');
        record.tasks.push({id:spec.id,interaction:spec.interaction,optional:true,skipped:true,dialogue:[],completion:events[0]});
        console.log(`PASS optional declined ${chapter.id}/${index+1}: ${spec.id}`);continue;
      }
      const conversation=await dialogue(spec,index,record);await fieldDecision(spec,index,record);await actionForTask(spec,index,record);
      const finished=await waitFor(s=>s.state.task===index+1,`task completes ${spec.id}`);assert.equal(finished.inspect.tasks[index].done,true);const completion=finished.inspect.storyEvents.filter(e=>e.type==='task-complete'&&e.taskId===spec.id);assert.equal(completion.length,1,'Each task completes exactly once');assert.equal(completion[0].sceneEvent,spec.sceneEvent);
      const taskRecord={id:spec.id,interaction:spec.interaction,optional:Boolean(spec.optional),skipped:false,dialogue:conversation.lines,completion:completion[0],actorPosition:finished.inspect.tasks[index].actorPosition};record.tasks.push(taskRecord);
      if(['escort','defend'].includes(spec.interaction))await page.screenshot({path:artifact(`chapter-${chapter.id}-${spec.interaction}-completed.png`)});
      record.cinematics.push(await cinematic('event',spec.sceneEvent));console.log(`PASS task ${chapter.id}/${index+1}: ${spec.id} (${spec.interaction})`);
      assert.equal(await mode(),index===chapter.tasks.length-1?'choice':'playing');
      const checkpoint=(await snapshot()).state.saved.fieldCheckpoint;assert.equal(checkpoint?.taskIndex,index+1,'Every completed operation is saved at the actual expanded cursor');assert.deepEqual(checkpoint.taskDecisions,record.fieldChoices.map(({taskId,optionId})=>({taskId,optionId})));
      if((targeted||chapter.id===6)&&record.fieldChoices.length===1&&!record.checkpointRoundTrip)await checkpointRoundTrip(record);
    }
    const atChoice=await snapshot();record.pacing={...atChoice.inspect.pacing,normalPlaytimeVerified:false};assert(Number.isFinite(record.pacing.activeSeconds)&&record.pacing.activeSeconds>0);assert.equal(record.fieldChoices.length,chapter.tasks.filter(t=>t.decision).length);
    const choiceButtons=page.locator('[data-action="choose"]:enabled'),preferred=page.locator(`[data-action="choose"][data-value="${chapter.id%2}"]`);const chosen=await preferred.isEnabled()?preferred:choiceButtons.first();record.chosen=await chosen.getAttribute('data-value');record.choiceClock=await chosen.evaluate(button=>{const activeSeconds=window.__game.inspect().pacing.activeSeconds;button.click();return {activeSeconds};});
    let completed;
    if(targeted){
      const closing=await waitFor(s=>s.inspect.cinematic.phase==='closing'&&s.inspect.cinematic.active,'targeted outgoing closing starts');await click('[data-action="skip-cinematic"]');completed=await snapshot();assert(!completed.inspect.cinematic.active||completed.inspect.cinematic.phase!=='closing');record.cinematics.push({phase:'closing',id:chapter.closing,before:closing.inspect.cinematic,method:'explicit UI skip; outgoing handoff outside targeted coverage'});
    }else if(chapter.id<allCampaign.length){
      const before=await waitFor(s=>s.inspect.cinematic.phase==='closing'&&s.inspect.cinematic.active,'closing starts');
      await page.evaluate(()=>{window.__modeTrace=[];window.__modeObserver?.disconnect();window.__modeObserver=new MutationObserver(()=>window.__modeTrace.push({mode:document.getElementById('app').dataset.mode,chapter:window.__game.getState().chapter}));window.__modeObserver.observe(document.getElementById('app'),{attributes:true,attributeFilter:['data-mode']});});
      await click('[data-action="skip-cinematic"]');
      if(chapter.id===1){await waitFor(s=>s.inspect.transition?.active,'transition starts');record.transitionPause=await pauseResume('chapter transition',s=>({phase:s.inspect.transition.phase,time:s.inspect.transition.time,opacity:s.inspect.transition.opacity,chapter:s.state.chapter}));}
      completed=await waitFor(s=>s.state.chapter===chapter.id+1&&s.inspect.cinematic.phase==='opening'&&!s.inspect.transition?.active,'automatic next chapter opening',180000);
      record.transition={before:before.inspect.cinematic,after:completed.inspect.cinematic,ledger:completed.inspect.transitionEvents,modeTrace:await page.evaluate(()=>{window.__modeObserver.disconnect();return window.__modeTrace;})};
      assert.equal(record.transition.modeTrace.some(e=>['intro','debrief','menu','loading'].includes(e.mode)),false,'Continuous chapter playback may not flash an intro/debrief/menu/loading page');
      assert.ok(record.transition.ledger.some(e=>e.type==='swap-scene'&&e.fromId===chapter.id&&e.coveredFrames>=1),'Scene swap must occur only under a cover already rendered for a frame');
      assert.equal(record.transition.ledger.filter(e=>e.type==='swap-scene'&&e.fromId===chapter.id&&e.toId===chapter.id+1).length,1,'A handoff swaps the scene exactly once');
      assert.equal(record.transition.ledger.filter(e=>e.type==='complete'&&e.fromId===chapter.id&&e.toId===chapter.id+1).length,1,'The same automatic handoff completes exactly once');
      record.cinematics.push({phase:'closing',id:chapter.closing,method:'explicit UI skip then actual timed chapter transition'});
    }else{record.cinematics.push(await cinematic('closing',chapter.closing));completed=await waitFor(s=>s.state.mode==='debrief','final chapter debrief');}
    assert.equal(completed.state.saved.history.length,targeted?1:chapter.id);record.history=completed.state.saved.history.length;record.resources=completed.state.resources;
    const history=completed.state.saved.history.find(h=>h.chapter===chapter.id);assert.deepEqual(history.fieldChoices,record.fieldChoices.map(({taskId,optionId,label,response})=>({taskId,optionId,label,response})));const recordedSeconds=completed.state.saved.chapterTimes[chapter.id].activeSeconds;assert.equal(recordedSeconds,Math.round(record.choiceClock.activeSeconds),'Persist the activity clock sampled in the same synchronous click as the chapter choice');record.pacing.persistedSeconds=recordedSeconds;
    await fs.writeFile(artifact('report.json'),JSON.stringify(report,null,2));console.log(`PASS chapter ${chapter.id}: ${record.scene.id}; ${record.tasks.filter(t=>!t.skipped).length} E conversations/actions, ${record.tasks.filter(t=>t.skipped).length} optional declines, ${record.fieldChoices.length} field choices`);if(!targeted&&chapter.id===allCampaign.length)await click('[data-action="next"]');
  }
  let ending;if(targeted){if(['playing','cinematic'].includes(await mode())){await tap('Escape');await waitFor(s=>s.state.mode==='paused','targeted result pause');}ending=await snapshot();assert.deepEqual(report.chapters.map(c=>c.id),selectedChapterIds);}else{ending=await waitFor(s=>s.state.mode==='ending','campaign ending');assert.equal(ending.state.saved.history.length,campaign.length);assert.equal(ending.state.saved.completed,true);}
  assert.equal(new Set(report.chapters.map(c=>c.scene.id)).size,campaign.length);assert.equal(new Set(report.chapters.map(c=>c.colliderSignature)).size,campaign.length);
  const actualTasks=report.chapters.flatMap(c=>c.tasks);
  report.totals={chapters:report.chapters.length,dialogue:actualTasks.reduce((n,t)=>n+t.dialogue.length,0),tasks:actualTasks.length,completedTasks:actualTasks.filter(t=>!t.skipped).length,optionalTaken:actualTasks.filter(t=>t.optional&&!t.skipped).length,optionalSkipped:actualTasks.filter(t=>t.optional&&t.skipped).length,escorts:report.chapters.flatMap(c=>c.escorts).length,defences:report.chapters.flatMap(c=>c.defences).length,fieldChoices:report.chapters.flatMap(c=>c.fieldChoices).length,choices:report.chapters.filter(c=>c.chosen!=null).length,handoffs:report.chapters.filter(c=>c.transition).length};assert.deepEqual(report.totals,expectedTotals);
  if(targeted)assert(report.chapters.every(c=>c.checkpointRoundTrip),'Each targeted chapter must survive a real midchapter continuation');else assert(report.chapters.some(c=>c.checkpointRoundTrip),'The expanded chain must include a real midchapter continuation check');
  const savedHistory=structuredClone(ending.state.saved.history),savedTimes=structuredClone(ending.state.saved.chapterTimes);
  if(!targeted)await page.screenshot({path:artifact('ending.png')});
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__game&&window.__game.getState().mode==='menu',undefined,{timeout:180000});assert.deepEqual((await snapshot()).state.saved.history,savedHistory);assert.deepEqual((await snapshot()).state.saved.chapterTimes,savedTimes);
  if(!targeted){await click('[data-action="continue"]');assert.equal(await mode(),'ending');}
  report.checks.push(`${campaign.length} selected unique scene IDs and collision footprints`,`${expectedTotals.dialogue} actual E dialogue lines; ${expectedTotals.completedTasks} performed actions and ${expectedTotals.optionalSkipped} explicit optional declines`,`${expectedTotals.escorts} real actor escorts through navigation`,`${expectedTotals.defences} defences using actual frame time and confirmed chapter kill counters`,`${expectedTotals.fieldChoices} field choices with response, resource effects, schema 3 checkpoint and journal persistence`,'Repeated named people reuse actor identity; complete task order matches materialized authored plans','Schema 3 restores exact caliber pools, six loaded magazines, defeated-enemy drops/taken flags/fall positions and consumed assistance without awarding resources','Pacing is telemetry only; no claim of verified 20–25 minute normal first play');
  if(selectedChapterIds.includes(9))report.checks.push('Chapter 9 movement locked, no QA teleport, Gordon staged by durant-wait ID');
  if(targeted)report.checks.push('Selected chapters entered through real New UI plus QA loadChapter; outgoing handoffs and a full campaign ending are not covered');
  else report.checks.push(`${expectedTotals.handoffs} automatic covered transitions without an interchapter menu; complete campaign ending survives reload`);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.requestFailures,[]);report.passed=true;report.fullCampaignVerified=!targeted;console.log(`${targeted?'TARGETED CHAPTERS':'CAMPAIGN'} PASS ${expectedBuild} ${artifact('report.json')}`);
}catch(error){report.error=String(error);report.stack=error.stack;try{report.failureState=await snapshot();await page.screenshot({path:artifact('failure.png')});}catch{}process.exitCode=1;console.error(error);}finally{try{for(const code of ['KeyW','KeyA','KeyS','KeyD','KeyE'])await key(code,false);}catch{}report.finished=new Date().toISOString();await fs.writeFile(artifact('report.json'),JSON.stringify(report,null,2));await browser.close();console.log(`BROWSER CLOSED ${output}`);}
