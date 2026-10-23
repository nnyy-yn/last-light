import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {CHAPTERS} from '../src/story.js';
import {blocked,lineBlocked} from '../src/simulation.js';

// This suite never uses OS input, CDP Input, focus, pointer lock or a visible
// browser. Real simulation frames are observed over time; no AI time-skipping.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const reloadOnly=process.argv.includes('--reload-only');
const base=new URL(process.argv.slice(2).find(a=>!a.startsWith('--'))||process.env.QA_BASE_URL||'http://127.0.0.1:5174/');base.searchParams.set('qa','1');
const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
const report={passed:false,url:base.href,headless:true,inputMethod:'DOM actions and in-page events only',startedAt:new Date().toISOString(),checks:[],phases:[],screenshots:[],errors:[]};
const browser=await chromium.launch({executablePath:process.env.QA_CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const completedRequests=new Set(),failedRequests=[];
page.setDefaultTimeout(60000);
page.on('pageerror',error=>report.errors.push(`JavaScript: ${error}`));
page.on('console',message=>{if(message.type()==='error')report.errors.push(`Console: ${message.text()}`);});
page.on('requestfinished',request=>completedRequests.add(request.url()));
page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
page.on('response',response=>{if(response.status()>=400)report.errors.push(`HTTP ${response.status()}: ${response.url()}`);});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const position=a=>({x:a.x??a.position?.[0],z:a.z??a.position?.[2]??a.position?.[1]});
const turn=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function click(selector){await page.locator(selector).evaluate(button=>button.click());}
async function screenshot(name){const file=path.join(artifacts,`actor-behavior-${name}.png`);await page.screenshot({path:file});report.screenshots.push(file);return file;}
async function snapshot(){return page.evaluate(()=>{const game=window.__game,state=game.getState(),raw=game.behaviorSnapshot(),behavior=Array.isArray(raw)?{actors:raw}:raw;const poses=[...(behavior.poses||[])];for(const actor of behavior.actors){let best=-1,distance=.05;for(let i=0;i<poses.length;i++){const p=poses[i].position,d=Math.hypot(actor.x-p[0],actor.z-p[2]);if(d<distance){best=i;distance=d;}}if(best>=0){const matched=poses.splice(best,1)[0];actor.rotationY=matched.rotationY;actor.pose=matched.pose;}}return{wallTime:performance.now(),state,behavior,pointerCaptured:Boolean(document.pointerLockElement),fullscreen:Boolean(document.fullscreenElement)};});}
function actors(sample){return sample.behavior.actors||sample.behavior.agents||[];}
function sameActor(sample,id){return actors(sample).find(actor=>actor.id===id);}
function pose(actor){return actor?.pose||actor?.poseState||{};}
async function loadChapter(index){await page.evaluate(index=>window.__game.loadChapter(index),index);await click('[data-action="play"]');await page.waitForFunction(()=>window.__game.getState().mode==='playing');}
async function lookAtActor(actor){const p=position(actor);await page.evaluate(p=>window.__game.lookAt(p.x,1.15,p.z),p);}
async function settledPortrait(actor,name){const player=(await snapshot()).state.player;await page.evaluate(()=>{window.__game.pause();document.getElementById('overlay').style.display='none';});await lookAtActor(actor);await screenshot(name);await page.evaluate(p=>{document.getElementById('overlay').style.display='';window.__game.lookAt(p.x-Math.sin(p.yaw)*10,p.y+Math.tan(p.pitch)*10,p.z-Math.cos(p.yaw)*10);window.__game.action('resume');},player);}
async function verifyCancelledAssets(){
  const cancelled=[...new Set(failedRequests.filter(r=>r.error==='net::ERR_ABORTED'&&/\.glb(?:\?|$)/.test(r.url)).map(r=>r.url))];
  const validated=[];for(const url of cancelled){const result=await page.evaluate(async url=>{try{const response=await fetch(url);if(!response.ok)return{url,valid:false,status:response.status};const bytes=await response.arrayBuffer(),view=new DataView(bytes);return{url,bytes:bytes.byteLength,declaredBytes:bytes.byteLength>=12?view.getUint32(8,true):0,valid:bytes.byteLength>=12&&view.getUint32(0,true)===0x46546c67&&view.getUint32(4,true)===2&&view.getUint32(8,true)===bytes.byteLength};}catch(error){return{url,valid:false,error:String(error)};}},url);validated.push(result);}
  report.validatedCancelledAssets=validated;report.networkFailures=[...failedRequests];report.recoveredRequests=failedRequests.filter(request=>request.error==='net::ERR_ABORTED'&&(completedRequests.has(request.url)||validated.some(v=>v.url===request.url&&v.valid)));
  for(const request of failedRequests)if(!report.recoveredRequests.includes(request))report.errors.push(`Asset: ${request.url} ${request.error}`);
}
async function observe(name,seconds,{until,onSample,screens=[]}={}){
  const phase={name,requestedSeconds:seconds,samples:[],startedAt:new Date().toISOString()};report.phases.push(phase);
  const start=Date.now();let screenIndex=0;
  while(Date.now()-start<seconds*1000){
    const sample=await snapshot();sample.wallElapsed=(Date.now()-start)/1000;phase.samples.push(sample);
    assert.equal(sample.pointerCaptured,false,'Background QA must never capture the pointer.');assert.equal(sample.fullscreen,false,'Background QA must not enter fullscreen.');
    assert.notEqual(sample.state.mode,'failed',`${name}: player must not fail during observation.`);
    if(onSample)await onSample(sample);
    if(screenIndex<screens.length&&sample.wallElapsed>=screens[screenIndex]){await screenshot(`${name}-${screens[screenIndex]}s`);screenIndex++;}
    if(until?.(sample)){phase.endedEarly=true;break;}
    await pause(100);
  }
  phase.wallSeconds=(Date.now()-start)/1000;return phase;
}
function actorActivity(samples,id){const list=samples.map(sample=>sameActor(sample,id)).filter(Boolean),first=list[0];let movement=0,yaw=0,aim=0;for(const actor of list){movement=Math.max(movement,distance(position(first),position(actor)));yaw=Math.max(yaw,turn(actor.rotationY??actor.yaw??0,first.rotationY??first.yaw??0));aim=Math.max(aim,Math.abs((pose(actor).aimYaw||0)-(pose(first).aimYaw||0)));}return{id,samples:list.length,movement,yaw,aim,states:[...new Set(list.map(actor=>actor.behavior))],stances:[...new Set(list.map(actor=>pose(actor).stance||actor.stance))]};}
function assertStoryTethers(samples){const starts=new Map();for(const sample of samples)for(const actor of actors(sample).filter(a=>a.role==='story'||(a.kind==='civilian'&&!a.follow))){if(!starts.has(actor.id))starts.set(actor.id,position(actor));const anchor=Array.isArray(actor.anchor)?{x:actor.anchor[0],z:actor.anchor[1]}:actor.anchor||starts.get(actor.id);assert.ok(distance(position(actor),anchor)<=Math.min(2.75,(actor.tether??2)+.35),`${actor.id} left its interaction anchor.`);}return starts.size;}
function freeInteraction(task,colliders,clearBoxes=colliders){for(const radius of[1.6,2.5,2.85,3.1])for(let i=0;i<16;i++){const a=i*Math.PI/8,p={x:task.pos[0]+Math.cos(a)*radius,z:task.pos[1]+Math.sin(a)*radius};if(!blocked(p.x,p.z,colliders)&&!lineBlocked(p,{x:task.pos[0],z:task.pos[1]},clearBoxes))return p;}throw new Error(`No legal interaction point for ${task.id}`);}
async function holdInteraction(task,index){const {colliders,staticColliders,tasks}=await page.evaluate(()=>window.__game.inspect());const currentTask={...task,...tasks.find(t=>t.id===task.id)},target=freeInteraction(currentTask,colliders,staticColliders||colliders);await page.evaluate(p=>window.__game.teleport(p.x,p.z),target);await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'e',code:'KeyE',bubbles:true})));try{await page.waitForFunction(index=>window.__game.getState().task>index,index,{timeout:Math.max(30000,task.seconds*9000)});}finally{await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'e',code:'KeyE',bubbles:true})));}assert.equal((await snapshot()).state.task,index+1,'Real held E must advance exactly one objective.');}

try{
  await page.goto(base.href);await page.waitForFunction(()=>window.__game,{timeout:120000});
  assert.equal(new URL(page.url()).searchParams.get('qa'),'1');
  const api=await page.evaluate(()=>Object.fromEntries(['behaviorSnapshot','behaviorEvent','pause','action'].map(name=>[name,typeof window.__game[name]])));
  for(const[name,type]of Object.entries(api))assert.equal(type,'function',`Missing QA interface __game.${name}()`);
  await click('[data-action="settings"]');
  await page.locator('[data-setting="gentle"]').evaluate(input=>{input.checked=true;input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('[data-setting="volume"]').evaluate(input=>{input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('[data-setting="quality"]').evaluate(input=>{input.value='low';input.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('[data-setting="renderScale"]').evaluate(input=>{input.value='0.75';input.dispatchEvent(new Event('change',{bubbles:true}));});
  report.logicRenderSettings={quality:'low',renderScale:.75,note:'Headless logical verification; no claim about Windows rendering performance.'};
  await click('[data-action="back"]');

  if(!reloadOnly){
  // Stationary-player evidence spans twenty real wall-clock seconds and includes
  // repeated positions, actual pose measurements and three separate images.
  await loadChapter(1);const initial=await snapshot(),companion=actors(initial).find(actor=>actor.role==='companion');assert.ok(companion,'Chapter 2 must contain a companion.');await lookAtActor(companion);
  const idle=await observe('idle-watch',20,{screens:[0,10,19.5]});assert.ok(idle.wallSeconds>=20);assert.ok(idle.samples.length>=20,'Need a continuous trajectory, not one screenshot.');
  const activity=actorActivity(idle.samples,companion.id);idle.activity=activity;
  assert.ok(activity.movement>.35||activity.yaw>.14||activity.aim>.14,'A stationary player must still see the companion shift guard position or scan.');
  idle.settledActivity=actorActivity(idle.samples.filter(sample=>sample.wallElapsed>=10),companion.id);
  assert.ok(idle.settledActivity.movement>.12||idle.settledActivity.yaw>.14||idle.settledActivity.aim>.14,'The companion must remain alert after initially settling into formation.');
  assert.ok(assertStoryTethers(idle.samples)>0,'Idle chapter must exercise at least one tethered story NPC.');
  await settledPortrait(sameActor(idle.samples.at(-1),companion.id),'idle-watch-settled-portrait');
  report.checks.push('twenty-second stationary-player recording shows companion alert movement or scanning; story NPCs stay within interaction range');

  // Pick a nearby narrow solid obstacle that actually blocks a direct route from
  // the current companion, so a straight-line follower cannot pass this check.
  const beforeFollow=await snapshot(),follower=sameActor(beforeFollow,companion.id),start=position(follower),{colliders}=await page.evaluate(()=>window.__game.inspect());
  const routeOptions=[];
  for(const obstacle of colliders){const width=obstacle.maxX-obstacle.minX,depth=obstacle.maxZ-obstacle.minZ,center={x:(obstacle.minX+obstacle.maxX)/2,z:(obstacle.minZ+obstacle.maxZ)/2};if(Math.min(width,depth)>6||Math.max(width,depth)>13||distance(start,center)>18)continue;const dx=center.x-start.x,dz=center.z-start.z,len=Math.hypot(dx,dz);if(len<1)continue;for(const margin of[2.4,4,6]){const reach=Math.hypot(width,depth)/2+margin,target={x:center.x+dx/len*reach,z:center.z+dz/len*reach};if(distance(start,target)>24||blocked(target.x,target.z,colliders)||!lineBlocked(start,target,[obstacle]))continue;routeOptions.push({obstacle,target,distance:distance(start,target)});}}
  routeOptions.sort((a,b)=>a.distance-b.distance);assert.ok(routeOptions.length,'Need a real nearby obstacle separating follower and destination.');const route=routeOptions[0];
  await page.evaluate(p=>window.__game.teleport(p.x,p.z),route.target);await lookAtActor(follower);
  const follow=await observe('obstacle-follow',40,{until:sample=>{const actor=sameActor(sample,companion.id);return actor&&distance(position(actor),route.target)<5;},onSample:sample=>{const actor=sameActor(sample,companion.id);assert.ok(actor,'Companion must survive route test.');const p=position(actor);assert.ok(!blocked(p.x,p.z,colliders,.24),'Companion crossed into a solid obstacle.');},screens:[0,5,12]});follow.route=route;
  const arrived=position(sameActor(follow.samples.at(-1),companion.id));assert.ok(distance(arrived,route.target)<5,'Companion failed to route around the obstacle and follow.');assert.ok(distance(arrived,start)>2,'Companion must actually move.');
  report.checks.push('companion follows a changed player location around a blocking obstacle without crossing collision geometry');

  // Threat feedback must change real pose geometry, not only an AI state label.
  const threatBefore=await snapshot(),threatActor=sameActor(threatBefore,companion.id);await lookAtActor(threatActor);await screenshot('before-threat');
  await page.evaluate(p=>window.__game.behaviorEvent({kind:'near-miss',position:[p.x+.6,p.z],source:[p.x+14,p.z-5],radius:18,intensity:1,faction:'enemy'}),position(threatActor));
  const nearMiss=await observe('near-miss',4,{screens:[.6,2]});const nearResponses=nearMiss.samples.map(sample=>sameActor(sample,companion.id)).filter(Boolean);
  assert.ok(nearResponses.some(a=>a.suppression>.05||['crouch','low','kneel'].includes(a.stance)),'Near miss must trigger a defensive reaction.');
  const priorPoses=[threatActor,...idle.samples.map(s=>sameActor(s,companion.id)),...follow.samples.map(s=>sameActor(s,companion.id))].filter(Boolean);
  const beforeHead=Math.max(...priorPoses.map(a=>pose(a).headHeight).filter(Number.isFinite));assert.ok(Number.isFinite(beforeHead),'Pose QA requires a measured headHeight.');
  assert.ok(nearResponses.some(a=>Number.isFinite(pose(a).headHeight)&&pose(a).headHeight<beforeHead-.12),'Defensive stance must physically lower the head.');
  const explosionStart=position(sameActor(await snapshot(),companion.id));await page.evaluate(p=>window.__game.behaviorEvent({kind:'explosion',position:[p.x+.8,p.z+.4],source:[p.x+15,p.z],radius:24,intensity:1.4,faction:'enemy'}),explosionStart);
  const explosion=await observe('explosion-reaction',7,{screens:[.6,3,6]});
  assert.ok(explosion.samples.some(sample=>{const a=sameActor(sample,companion.id);return a&&distance(position(a),explosionStart)>.45;}),'Explosion must produce an actual defensive reposition.');
  report.checks.push('near miss produces a measurable lowered pose; nearby explosion causes defensive movement');

  await page.evaluate(()=>window.__game.pause());assert.equal((await snapshot()).state.mode,'paused');
  const paused=await observe('paused-freeze',2);const freeze=sample=>actors(sample).map(a=>({id:a.id,x:a.x,z:a.z,yaw:a.rotationY??a.yaw,behavior:a.behavior,stance:a.stance,shotsFired:a.shotsFired,headHeight:pose(a).headHeight}));
  assert.deepEqual(freeze(paused.samples.at(-1)),freeze(paused.samples[0]),'Pause must freeze AI positions, orientations, stances and firing.');await page.evaluate(()=>window.__game.action('resume'));
  report.checks.push('pause freezes AI movement, pose and shooting');

  await loadChapter(4);const combatStart=await snapshot(),enemy=actors(combatStart).find(a=>a.role==='enemy');assert.ok(enemy,'Combat chapter must contain enemies.');
  const combatColliders=(await page.evaluate(()=>window.__game.inspect())).colliders,enemyPosition=position(enemy),occluded=[];
  for(let radius=7;radius<=24;radius+=3)for(let i=0;i<32;i++){const angle=i*Math.PI/16,p={x:enemyPosition.x+Math.cos(angle)*radius,z:enemyPosition.z+Math.sin(angle)*radius};if(!blocked(p.x,p.z,combatColliders)&&lineBlocked(enemyPosition,p,combatColliders))occluded.push(p);}
  assert.ok(occluded.length,'Need a genuinely occluded player location.');await page.evaluate(p=>window.__game.teleport(p.x,p.z),occluded[0]);await lookAtActor(enemy);
  const combat=await observe('occluded-combat',12,{screens:[0,6,11]});const shotMap=new Map();let blockedSamples=0;
  for(const sample of combat.samples){for(const a of actors(sample).filter(a=>a.role==='enemy'))if(lineBlocked(position(a),sample.state.player,combatColliders))blockedSamples++;for(const shot of sample.behavior.shots||sample.behavior.shotLog||[]){const from=Array.isArray(shot.from)?{x:shot.from[0],z:shot.from[1]}:shot.from,to=Array.isArray(shot.to)?{x:shot.to[0],z:shot.to[1]}:shot.to;if(from&&to){assert.equal(lineBlocked(from,to,combatColliders),false,'A recorded shot crossed solid cover.');assert.notEqual(shot.blocked,true,'Director emitted a blocked shot.');shotMap.set(JSON.stringify(shot),shot);}}}
  assert.ok(blockedSamples>=5,'The cover scenario must actually keep enemies occluded across multiple frames.');assert.ok(Array.isArray(combat.samples[0].behavior.shots||combat.samples[0].behavior.shotLog),'Accurate fire review requires the QA shot event ledger.');combat.checkedShots=[...shotMap.values()];combat.blockedSamples=blockedSamples;
  report.checks.push('enemy cover scenario contains sustained blocked sightlines; all emitted firing rays are independently checked against solid colliders');

  // Positive control: an empty shot ledger is not sufficient evidence. Alert an
  // enemy with a clear nearby sightline and require at least one real fired ray.
  await loadChapter(4);const openInitial=await snapshot(),openEnemy=actors(openInitial).find(a=>a.role==='enemy'),openColliders=(await page.evaluate(()=>window.__game.inspect())).colliders;const openTargets=[];
  for(let i=0;i<32;i++){const angle=i*Math.PI/16,p={x:openEnemy.x+Math.cos(angle)*11,z:openEnemy.z+Math.sin(angle)*11};if(!blocked(p.x,p.z,openColliders)&&!lineBlocked(position(openEnemy),p,openColliders))openTargets.push(p);}
  assert.ok(openTargets.length,'Positive fire control requires an open sightline.');await page.evaluate(p=>{window.__game.teleport(p.x,p.z);window.__game.behaviorEvent({kind:'shot',source:[p.x,p.z],position:[p.x,p.z],radius:16,intensity:.15,faction:'player'});},openTargets[0]);
  const openFire=await observe('open-fire-control',12,{until:sample=>(sample.behavior.shots||[]).some(shot=>shot.faction==='enemy'),screens:[0]});const fired=(openFire.samples.at(-1).behavior.shots||[]).filter(shot=>shot.faction==='enemy');assert.ok(fired.length,'Enemy must actually fire when it has an open sightline.');for(const shot of fired)assert.equal(lineBlocked({x:shot.from[0],z:shot.from[1]},{x:shot.to[0],z:shot.to[1]},openColliders),false,'Positive-control shot crossed solid cover.');report.checks.push('positive control confirms enemies really fire along open sightlines');

  }
  // Observe a natural magazine depletion and reload. Do not mutate ammunition,
  // cooldowns or actor animation state to manufacture a convenient reload.
  let naturalReload=null;
  for(const chapterIndex of[4,12]){
    await loadChapter(chapterIndex);const initialReload=await snapshot(),enemies=actors(initialReload).filter(a=>a.role==='enemy'),squad=actors(initialReload).filter(a=>a.role==='companion');
    enemies.sort((a,b)=>Math.min(...squad.map(s=>distance(b,s)))-Math.min(...squad.map(s=>distance(a,s))));const subject=enemies[0],reloadColliders=(await page.evaluate(()=>window.__game.inspect())).colliders,locations=[];
    await fs.writeFile(path.join(artifacts,`actor-behavior-chapter${chapterIndex+1}-colliders.json`),JSON.stringify(reloadColliders,null,2));
    assert.ok(Number.isFinite(subject.mag)&&subject.mag===subject.magSize,'Reload scenario must begin with a natural full magazine.');
    for(const radius of[8,10,12])for(let i=0;i<32;i++){const angle=i*Math.PI/16,p={x:subject.x+Math.cos(angle)*radius,z:subject.z+Math.sin(angle)*radius};if(!blocked(p.x,p.z,reloadColliders)&&!lineBlocked(subject,p,reloadColliders))locations.push({p,score:Math.min(...squad.map(s=>distance(p,s)))});}
    locations.sort((a,b)=>b.score-a.score);assert.ok(locations.length,'Need a clear sustained-fire position.');await page.evaluate(p=>{window.__game.teleport(p.x,p.z);window.__game.behaviorEvent({kind:'shot',position:[p.x,p.z],source:[p.x,p.z],radius:20,intensity:.1,faction:'player'});},locations[0].p);
    let reloadWindow=null,done=false,dead=false,midImage=false,lastShotTime=Date.now(),lastShotCount=0,lastReposition=Date.now();
    const phase=await observe(`natural-reload-ch${chapterIndex+1}`,110,{until:()=>done||dead,onSample:async sample=>{
      const actor=sameActor(sample,subject.id);if(!actor?.alive){dead=true;return;}
      if(actor.shotsFired>lastShotCount){lastShotCount=actor.shotsFired;lastShotTime=Date.now();}
      if(actor.reloading&&!reloadWindow)reloadWindow={start:actor.reloadStart,end:actor.reloadUntil,mag:actor.mag};
      if(actor.reloading&&actor.reload>.3&&!midImage){await lookAtActor(actor);await screenshot('natural-reload-mid');midImage=true;}
      if(actor.reloads>0&&(sample.behavior.shots||[]).some(shot=>shot.shooterId===subject.id&&shot.time>reloadWindow.end+.05)){await lookAtActor(actor);await screenshot('natural-reload-fired-again');done=true;}
      if(!actor.reloading&&Date.now()-lastShotTime>9000&&Date.now()-lastReposition>9000){const current=sample.state.player,points=[];for(let i=0;i<24;i++){const a=i*Math.PI/12,p={x:actor.x+Math.cos(a)*9,z:actor.z+Math.sin(a)*9};if(!blocked(p.x,p.z,reloadColliders)&&!lineBlocked(actor,p,reloadColliders))points.push(p);}points.sort((a,b)=>distance(a,current)-distance(b,current));if(points.length)await page.evaluate(p=>{window.__game.teleport(p.x,p.z);window.__game.behaviorEvent({kind:'shot',position:[p.x,p.z],source:[p.x,p.z],radius:20,intensity:.1,faction:'player'});},points[0]);lastReposition=Date.now();}
    }});
    phase.subject=subject.id;phase.reloadWindow=reloadWindow;phase.subjectKilled=dead;
    if(!done)continue;
    const states=phase.samples.map(s=>sameActor(s,subject.id)).filter(Boolean),allShots=new Map();for(const sample of phase.samples)for(const shot of sample.behavior.shots||[])if(shot.shooterId===subject.id)allShots.set(`${shot.time}:${shot.from}`,shot);
    const shots=[...allShots.values()].sort((a,b)=>a.time-b.time),gaps=shots.slice(1).map((shot,i)=>shot.time-shots[i].time);
    assert.ok(gaps.some(gap=>gap>.08&&gap<.40),'Real shot ledger must contain short burst intervals.');assert.ok(gaps.some(gap=>gap>2),'Burst groups must contain a genuine cease-fire interval.');
    const burstLengths=shots.length?[1]:[];for(const gap of gaps)if(gap<.40)burstLengths[burstLengths.length-1]++;else burstLengths.push(1);assert.ok(burstLengths.some(n=>n===2||n===3),'Actual ledger must show a two- or three-round burst.');assert.ok(burstLengths.every(n=>n<=3),'A burst must not become unbroken automatic fire.');phase.burstLengths=burstLengths;
    assert.ok(reloadWindow.end-reloadWindow.start>=2.45&&reloadWindow.end-reloadWindow.start<=3.1,'Natural reload must last the authored 2.5–3 seconds.');
    assert.equal(reloadWindow.mag,0,'Reload must follow actual magazine exhaustion.');assert.ok(!shots.some(shot=>shot.time>reloadWindow.start+.08&&shot.time<reloadWindow.end-.08),'No weapon may fire during its reload.');
    assert.ok(states.some(a=>a.reloads>0&&a.mag>=a.magSize-3),'Reload must refill the magazine before the next burst.');
    const handVectors=states.filter(a=>a.reloading&&pose(a).limbs?.length).map(a=>{const limbs=pose(a).limbs,l=limbs.find(l=>l.side==='Left').hand,r=limbs.find(l=>l.side==='Right').hand;return l.map((v,i)=>v-r[i]);});
    assert.ok(handVectors.length>=3,'Need several real hand poses during reload.');assert.ok(handVectors.some(v=>Math.hypot(...v.map((n,i)=>n-handVectors[0][i]))>.08),'Reload must physically move the support hand away from its normal grip.');
    phase.checkedShots=shots;phase.shotGaps=gaps;naturalReload=phase;break;
  }
  assert.ok(naturalReload,'A live enemy must naturally empty a magazine, animate a full reload and resume fire.');report.checks.push('real 2–3 round burst intervals, natural empty magazine, silent 2.5–3s reload with moving hand bones, refill and resumed real fire');

  // Complete an ordinary NPC objective through the real held-interaction handler.
  await loadChapter(0);const npcWatch=await observe('story-npc',3,{screens:[0]});assertStoryTethers(npcWatch.samples);
  const task=CHAPTERS[0].tasks[0];await holdInteraction(task,0);await screenshot('story-interaction-complete');assert.equal((await snapshot()).state.task,1);
  report.checks.push('ordinary story NPC interaction still advances through the real held-E handler');
  await verifyCancelledAssets();
  assert.deepEqual(report.errors,[],'No JavaScript, shader or unrecovered asset failures are allowed.');report.passed=true;console.log('ACTOR BEHAVIOR PASS');
}catch(error){report.failure=String(error.stack||error);report.finalState=await snapshot().catch(()=>null);await screenshot('failure').catch(()=>{});console.error(error);process.exitCode=1;}
finally{if(!report.validatedCancelledAssets)await verifyCancelledAssets().catch(error=>report.errors.push(`Asset verification: ${error}`));report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(artifacts,reloadOnly?'actor-reload-test.json':'actor-behavior-test.json'),JSON.stringify(report,null,2));await browser.close();}
