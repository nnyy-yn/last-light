import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {blocked,lineBlocked} from '../src/simulation.js';
import {INITIAL_RESOURCES} from '../src/story.js';

// Real game integration QA, deliberately separate from the module fixture.
// Only menu DOM clicks and page-local KeyboardEvents drive gameplay. The only
// debug mutations are teleport/lookAt to checked supply/task approach points.
// No desktop input, pointer lock, time acceleration, resource writes or AI edits.
const args=process.argv.slice(2),flag=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const expectedBuild=flag('--expected-build');
if(expectedBuild)assert.match(expectedBuild,/^index-[A-Za-z0-9_-]+\.js$/);
const base=new URL(args.find(a=>/^https?:/.test(a))||'http://127.0.0.1:5175/');
assert.ok(['127.0.0.1','localhost'].includes(base.hostname));base.searchParams.set('qa','1');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.join(root,'artifacts/release-v0.6/field',`${expectedBuild?.replace(/\.js$/,'')||'preview'}-${stamp}`);
await fs.mkdir(out,{recursive:true});
const report={passed:false,startedAt:new Date().toISOString(),url:base.href,expectedBuild,headless:true,
  scope:'Actual combat-demo integration; checked QA teleports to supply and story-task approach points. This is not a continuous natural walking playthrough.',
  input:'DOM buttons and synthetic in-page key events only; no OS input or pointer lock',
  timePolicy:'Unmodified real frame loop; no time scaling or manual update calls',
  teleports:[],screenshots:[],checks:[],errors:[],requestFailures:[]};
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
let browser,page;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const click=selector=>page.locator(selector).evaluate(el=>el.click());
async function key(code,down){
  await page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{
    code,key:code.startsWith('Key')?code.slice(3).toLowerCase():code,bubbles:true
  })),{code,down});
}
async function press(code){await key(code,true);await key(code,false);}
async function read(){
  const sample=await page.evaluate(()=>({state:__game.getState(),world:__game.inspect(),behavior:__game.behaviorSnapshot(),
    pointer:!!document.pointerLockElement,fullscreen:!!document.fullscreenElement,
    interaction:{hidden:document.getElementById('interaction').hidden,
      label:document.querySelector('#interaction strong').textContent,
      progress:parseFloat(document.querySelector('#interaction .interact-track i').style.width)||0},
    squadHud:document.getElementById('squad-status')?.textContent||''}));
  assert.equal(sample.pointer,false,'The QA page must never acquire pointer lock.');
  assert.equal(sample.fullscreen,false,'The QA page must never enter fullscreen.');
  return sample;
}
const ammoTotal=sample=>sample.state.resources.ammo+sample.state.player.mag+Object.values(sample.state.stowedMagazines).reduce((a,b)=>a+b,0);
const itemFrom=(sample,id)=>sample.world.field.find(item=>item.id===id);
const squad=sample=>sample.behavior.actors.filter(a=>a.role==='companion'&&a.kind==='soldier');
async function waitUntil(predicate,message,{timeout=90000,playing=true,onSample=null}={}){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const sample=await read();if(playing)assert.equal(sample.state.mode,'playing',message+' requires an active chapter.');onSample?.(sample);if(predicate(sample))return sample;await sleep(65);}
  throw new Error('Timed out: '+message);
}
async function waitGame(seconds,onSample=null){const start=(await read()).behavior.time;return waitUntil(s=>s.behavior.time-start>=seconds,`real game time advances ${seconds}s`,{timeout:Math.max(60000,seconds*25000),onSample});}
async function shot(name){const file=path.join(out,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);}
async function approachCase(item){
  const sample=await read(),p={x:item.approach[0],z:item.approach[1]},target={x:item.pos[0],z:item.pos[1]};
  assert.ok(!blocked(p.x,p.z,sample.world.colliders),'Supply approach must have player clearance.');
  assert.ok(!lineBlocked(p,target,sample.world.colliders.filter(b=>b.fieldId!==item.id)),'Supply approach must have a clear line of sight to the case surface.');
  assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<=2.4);
  report.teleports.push({reason:'supply approach',id:item.id,position:p,target});
  await page.evaluate(({p,target})=>{__game.teleport(p.x,p.z);__game.lookAt(target.x,.29,target.z);},{p,target});
  await waitGame(.15);
  const visible=await read();assert.equal(visible.interaction.hidden,false,'Supply prompt must be visible from the authored approach.');
  assert.match(visible.interaction.label,item.kind==='medicine'?/急救/:/弹药/);
}
async function partialHold(item){
  await key('KeyE',true);
  return waitUntil(s=>itemFrom(s,item.id).progress>=.22&&itemFrom(s,item.id).progress<1,'E produces partial supply progress',{
    timeout:30000,onSample:s=>assert.equal(itemFrom(s,item.id).used,false,'Partial hold must not already use the case.')});
}
async function checkInterruptions(item){
  const initial=await read();
  let partial;try{partial=await partialHold(item);}finally{await key('KeyE',false);}
  await waitGame(.12);const released=await read();
  assert.equal(itemFrom(released,item.id).progress,0);assert.equal(itemFrom(released,item.id).used,false);
  assert.deepEqual(released.state.resources,initial.state.resources,'Releasing an unfinished hold must not award supplies.');
  report.checks.push({name:'release cancels supply progress',id:item.id,before:itemFrom(partial,item.id),after:itemFrom(released,item.id)});
  await partialHold(item);await press('Escape');await key('KeyE',false);
  const paused=await read();assert.equal(paused.state.mode,'paused');assert.equal(itemFrom(paused,item.id).progress,0);
  await sleep(550);const frozen=await read();assert.equal(frozen.behavior.time,paused.behavior.time);
  assert.equal(itemFrom(frozen,item.id).progress,0);assert.equal(itemFrom(frozen,item.id).used,false);
  assert.deepEqual(frozen.state.resources,initial.state.resources);
  report.checks.push({name:'pause cancels supply hold and freezes game time',id:item.id,pausedTime:paused.behavior.time,afterWallWait:frozen.behavior.time});
  await press('Escape');await waitGame(.12);assert.equal(itemFrom(await read(),item.id).progress,0,'Resume must require a new E hold.');
}
async function useCase(item){
  const before=await read(),timeline=[];await key('KeyE',true);
  let used;
  try{used=await waitUntil(s=>itemFrom(s,item.id).used,'completed E hold opens '+item.id,{onSample:s=>timeline.push({time:s.behavior.time,progress:itemFrom(s,item.id).progress,used:itemFrom(s,item.id).used})});}
  finally{await key('KeyE',false);}
  const reward=item.kind==='ammo'?24:1;
  assert.equal(used.state.resources[item.kind],before.state.resources[item.kind]+reward,'Case reward must be applied once by the real game.');
  assert.equal(ammoTotal(used),ammoTotal(before)+(item.kind==='ammo'?24:0));
  assert.equal(used.state.resources[item.kind==='ammo'?'medicine':'ammo'],before.state.resources[item.kind==='ammo'?'medicine':'ammo']);
  await waitUntil(s=>itemFrom(s,item.id).opened>.95,'case lid visibly opens');
  const opened=await read();await shot(item.kind+'-opened');
  await key('KeyE',true);try{await waitGame(1.8);}finally{await key('KeyE',false);}
  const repeated=await read();assert.deepEqual(repeated.state.resources,used.state.resources,'Holding E on a used case must not duplicate its reward.');
  assert.equal(itemFrom(repeated,item.id).progress,0);
  report.checks.push({name:'single-use '+item.kind+' reward and lid',id:item.id,amount:reward,before:before.state.resources,after:used.state.resources,repeated:repeated.state.resources,opened:itemFrom(opened,item.id).opened,timeline});
}
async function testSquad(){
  const initial=await read();assert.equal(initial.world.squadOrder,'follow');assert.ok(squad(initial).length>=2);
  await press('KeyF');const ordered=await read();assert.equal(ordered.world.squadOrder,'hold');
  const observations=[];
  const held=await waitUntil(s=>squad(s).some(a=>a.behavior==='hold'),'F reaches actual squad hold behavior',{timeout:60000,onSample:s=>observations.push({time:s.behavior.time,order:s.world.squadOrder,actors:squad(s)})});
  assert.ok(squad(held).every(a=>Math.hypot(a.x-a.anchor.x,a.z-a.anchor.z)<=a.tether+.45),'Ordered squad remains within its hold area.');
  await shot('squad-hold');await press('KeyF');assert.equal((await read()).world.squadOrder,'follow');
  // A short genuine movement segment gives the director a changing formation
  // target. Reject a blocked path instead of teleporting around it for a pass.
  const beforeMove=await read(),p=beforeMove.state.player;
  const destination={x:p.x-Math.sin(p.yaw)*6,z:p.z-Math.cos(p.yaw)*6};
  for(let i=1;i<=20;i++)assert.ok(!blocked(p.x+(destination.x-p.x)*i/20,p.z+(destination.z-p.z)*i/20,beforeMove.world.colliders),'The short WASD segment requires a legal road path.');
  await key('KeyW',true);let moved;
  try{moved=await waitGame(1.45,s=>observations.push({time:s.behavior.time,order:s.world.squadOrder,actors:squad(s)}));}finally{await key('KeyW',false);}
  assert.ok(Math.hypot(moved.state.player.x-p.x,moved.state.player.z-p.z)>3,'W must cause actual collision-resolved player movement.');
  await waitUntil(s=>squad(s).some(a=>['bound','overwatch','follow'].includes(a.behavior)),'F release reaches actual follow/cover behavior');
  await waitGame(.7,s=>observations.push({time:s.behavior.time,order:s.world.squadOrder,actors:squad(s)}));
  const followed=await read();assert.ok(squad(followed).some(a=>{const before=squad(held).find(b=>b.id===a.id);return before&&Math.hypot(a.x-before.x,a.z-before.z)>.35;}),'At least one squad member must physically reposition after following is restored.');
  await shot('squad-follow');report.checks.push({name:'F hold/follow changes director behavior and positions',playerBefore:{x:p.x,z:p.z},playerAfter:{x:moved.state.player.x,z:moved.state.player.z},observations});
}
async function testSmoke(){
  const before=await read();assert.equal(before.world.smokeCharges,2);assert.equal(before.world.smoke.active,0);
  await press('KeyQ');const first=await waitUntil(s=>s.world.smoke.active===1,'first smoke canister deploys');assert.equal(first.world.smokeCharges,1);
  await waitGame(2);const growing=await read();assert.ok(growing.world.smoke.clouds[0].age>1.9);assert.ok(growing.world.smoke.clouds[0].density>0);
  const center=growing.world.smoke.clouds[0].center;await page.evaluate(c=>__game.lookAt(c.x,c.y,c.z),center);await shot('smoke-deployed');
  await press('Escape');const paused=await read();assert.equal(paused.state.mode,'paused');
  await press('KeyQ');await sleep(700);const frozen=await read();
  assert.equal(frozen.behavior.time,paused.behavior.time);assert.deepEqual(frozen.world.smoke,paused.world.smoke,'Paused smoke age, density and positions must remain unchanged.');
  assert.equal(frozen.world.smokeCharges,1,'Q while paused must not spend a canister.');
  await press('Escape');await waitGame(.1);await press('KeyQ');
  const second=await waitUntil(s=>s.world.smoke.active===2,'second smoke canister deploys');assert.equal(second.world.smokeCharges,0);
  await press('KeyQ');await waitGame(.25);const third=await read();
  assert.equal(third.world.smokeCharges,0);assert.equal(third.world.smoke.active,2);
  assert.deepEqual(third.world.smoke.clouds.map(c=>c.id),second.world.smoke.clouds.map(c=>c.id),'A third Q cannot deploy another cloud.');
  await shot('smoke-two-charge-limit');report.checks.push({name:'Q two-use budget and pause freeze',first:first.world.smoke,growing:growing.world.smoke,paused:paused.world.smoke,afterPause:frozen.world.smoke,second:second.world.smoke,afterThird:third.world.smoke,chargesAfter:third.world.smokeCharges});
}
async function testStoryInteraction(){
  const before=await read(),index=before.state.task,task=before.world.tasks[index];let p;
  for(const radius of[1.2,1.8,2.4,2.9]){
    for(let i=0;i<24;i++){const angle=i*Math.PI/12,candidate={x:task.pos[0]+Math.cos(angle)*radius,z:task.pos[1]+Math.sin(angle)*radius};
      if(!blocked(candidate.x,candidate.z,before.world.colliders)&&!lineBlocked(candidate,{x:task.pos[0],z:task.pos[1]},before.world.staticColliders)){p=candidate;break;}}
    if(p)break;
  }
  assert.ok(p,'Story task needs a collision-free interaction approach.');
  report.teleports.push({reason:'story task approach',id:task.id,position:p,target:task.pos});
  await page.evaluate(({p,t})=>{__game.teleport(p.x,p.z);__game.lookAt(t.pos[0],1.1,t.pos[1]);},{p,t:task});
  await waitGame(.1);const timeline=[];await key('KeyE',true);
  let done;try{done=await waitUntil(s=>s.state.task===index+1,'story E interaction advances normally',{onSample:s=>{assert.ok(s.world.field.every(item=>item.progress===0),'Story interaction must not advance a supply hold.');timeline.push({time:s.behavior.time,task:s.state.task,interaction:s.interaction});}});}finally{await key('KeyE',false);}
  assert.equal(done.world.tasks[index].done,true);assert.deepEqual(done.world.field.map(i=>({id:i.id,used:i.used})),before.world.field.map(i=>({id:i.id,used:i.used})));await shot('story-interaction-complete');
  report.checks.push({name:'story E interaction stays usable with supply system active',task:task.id,beforeTask:index,afterTask:done.state.task,timeline,note:'The authored chapter has no simultaneous in-range supply/story target; blocked-priority conflict itself is additionally covered by the module test.'});
}
async function validateRequests(){
  report.assetRecovery=[];
  for(const failure of report.requestFailures){
    if(failure.error!=='net::ERR_ABORTED'||!/\.glb(?:\?|$)/.test(failure.url)){report.errors.push('Request '+failure.url+' '+failure.error);continue;}
    if(report.assetRecovery.some(a=>a.url===failure.url))continue;
    const recovered=await page.evaluate(async url=>{try{const r=await fetch(url),b=await r.arrayBuffer(),d=new DataView(b);return{url,bytes:b.byteLength,valid:r.ok&&b.byteLength>=12&&d.getUint32(0,true)===0x46546c67&&d.getUint32(8,true)===b.byteLength};}catch(e){return{url,valid:false,error:String(e)}};},failure.url);
    report.assetRecovery.push(recovered);if(!recovered.valid)report.errors.push('Invalid/failed GLB '+failure.url);
  }
}
try{
  browser=await chromium.launch({executablePath:process.env.QA_CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
  page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.setDefaultTimeout(90000);
  page.on('pageerror',e=>report.errors.push('JS '+e));page.on('console',m=>{if(m.type()==='error')report.errors.push('Console '+m.text());});
  page.on('response',r=>{if(r.status()>=400)report.errors.push('HTTP '+r.status()+' '+r.url());});
  page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
  await page.goto(base.href);await page.waitForFunction(()=>window.__game,undefined,{timeout:180000});
  report.servedScripts=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(n=>n.src));
  if(expectedBuild)assert.ok(report.servedScripts.some(url=>new URL(url).pathname.endsWith('/'+expectedBuild)),'The served build must match --expected-build.');
  report.bundleHashes=[];for(const url of report.servedScripts){const response=await page.request.get(url);assert.ok(response.ok());report.bundleHashes.push({url,sha256:createHash('sha256').update(await response.body()).digest('hex')});}
  await click('[data-action="settings"]');
  for(const[name,value]of Object.entries({quality:'high',renderScale:'1'}))await page.locator(`[data-setting="${name}"]`).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},value);
  for(const[name,value]of Object.entries({gentle:true,headbob:false}))await page.locator(`[data-setting="${name}"]`).evaluate((el,value)=>{el.checked=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await page.locator('[data-setting="volume"]').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});await click('[data-action="back"]');
  const savedBefore=(await read()).state.saved;await click('[data-action="combat-demo"]');await click('[data-action="play"]');await waitGame(.15);
  const initial=await read();report.initial={state:initial.state,field:initial.world.field,smokeCharges:initial.world.smokeCharges,squadOrder:initial.world.squadOrder};
  assert.equal(initial.state.chapter,6);assert.equal(ammoTotal(initial),INITIAL_RESOURCES.ammo);assert.equal(initial.state.resources.medicine,INITIAL_RESOURCES.medicine);
  assert.equal(initial.world.field.length,2);assert.deepEqual(initial.world.field.map(i=>i.kind).sort(),['ammo','medicine']);assert.ok(initial.world.field.every(i=>!i.used&&i.progress===0));
  await shot('combat-menu-entry');await testSquad();
  // Story interaction runs while both supply cases remain unused.
  await testStoryInteraction();
  for(const kind of['medicine','ammo']){const item=(await read()).world.field.find(i=>i.kind===kind);await approachCase(item);await shot(kind+'-closed');if(kind==='medicine')await checkInterruptions(item);await useCase(item);}
  await testSmoke();
  const final=await read();assert.equal(ammoTotal(final),INITIAL_RESOURCES.ammo+24);assert.equal(final.state.resources.medicine,INITIAL_RESOURCES.medicine+1);
  assert.deepEqual(final.state.saved,savedBefore,'The combat demonstration must not create or overwrite the campaign checkpoint.');
  report.final={state:final.state,field:final.world.field,smoke:final.world.smoke,smokeCharges:final.world.smokeCharges,squadOrder:final.world.squadOrder,pointer:final.pointer};
  await validateRequests();assert.deepEqual(report.errors,[]);report.passed=true;
  console.log(JSON.stringify({passed:true,expectedBuild,checks:report.checks.length,ammoTotal:ammoTotal(final),medicine:final.state.resources.medicine,charges:final.world.smokeCharges,errors:report.errors,out}));
}catch(error){report.failure=error.stack||String(error);if(page){try{report.failedState=await read();await shot('failure');}catch{}}console.error(report.failure);process.exitCode=1;}
finally{await browser?.close();report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
