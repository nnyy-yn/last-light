import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {CHAPTERS} from '../src/story.js';
import {PLAYER_WEAPON_IDS,WEAPON_DEFINITIONS} from '../src/weapon.js';
import {blocked,lineBlocked} from '../src/simulation.js';
const require=createRequire(import.meta.url);
const args=process.argv.slice(2),expectedBuild=args.includes('--expected-build')?args[args.indexOf('--expected-build')+1]:null;
if(expectedBuild)assert.match(expectedBuild,/^index-[A-Za-z0-9_-]+\.js$/);
const outputDir=expectedBuild?path.join('artifacts','release-v0.6','campaign',`${expectedBuild.replace(/\.js$/,'')}-${new Date().toISOString().replace(/[:.]/g,'-')}`):'artifacts';
await fs.mkdir(outputDir,{recursive:true});
const artifact=name=>path.join(outputDir,name),buildEvidence={expectedBuild};
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[],badResponses=[],chapters=[];
page.setDefaultTimeout(90000);
page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()});});
const combatEvidence=[];
// All actions stay inside the headless page; no desktop keyboard or mouse APIs.
async function key(code,down){await page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:code.startsWith('Key')?code.slice(3).toLowerCase():code,code,bubbles:true})),{code,down});}
const keyDown=code=>key(code,true),keyUp=code=>key(code,false),state=()=>page.evaluate(()=>window.__game.getState());
async function pressKey(code){await keyDown(code);await keyUp(code);}
async function trigger(down){await page.evaluate(down=>{const target=down?document.getElementById('game'):window;target.dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button:0,buttons:down?1:0,bubbles:true}));},down);}
function interactionPoint(task,colliders,staticColliders){for(const radius of[1.1,1.6,2.2,2.7,3.05])for(let i=0;i<24;i++){const a=i*Math.PI/12,p={x:task.pos[0]+Math.cos(a)*radius,z:task.pos[1]+Math.sin(a)*radius};if(!blocked(p.x,p.z,colliders)&&!lineBlocked(p,{x:task.pos[0],z:task.pos[1]},staticColliders))return p;}return null;}
async function completeInteraction(chapter,index){
  const first=await page.evaluate(()=>window.__game.inspect()),task=first.tasks[index],target=interactionPoint(task,first.colliders,first.staticColliders);assert.ok(target,`No legal standing point for ${chapter.id}/${task.id}`);
  await page.evaluate(({p,t})=>{window.__game.teleport(p.x,p.z);window.__game.lookAt(t.pos[0],1.1,t.pos[1]);},{p:target,t:task});
  const deadline=Date.now()+Math.max(45000,chapter.tasks[index].seconds*10000);await keyDown('KeyE');
  try{while(Date.now()<deadline){const s=await state();assert.notEqual(s.mode,'failed',`Died during ${task.id}`);if(s.task>index){assert.equal(s.task,index+1);return;}const inspect=await page.evaluate(()=>window.__game.inspect()),active=inspect.tasks[index];
      if(Math.hypot(s.player.x-active.pos[0],s.player.z-active.pos[1])>2.8||lineBlocked(s.player,{x:active.pos[0],z:active.pos[1]},inspect.staticColliders)){const next=interactionPoint(active,inspect.colliders,inspect.staticColliders);assert.ok(next,`Moving ${task.id} lost every legal approach`);await page.evaluate(p=>window.__game.teleport(p.x,p.z),next);}
      await page.waitForTimeout(140);
    }throw new Error(`Timed out holding E for ${chapter.id}/${task.id}`);
  }finally{await keyUp('KeyE');}
}
async function testMovingCombat(){
  const initial=await state();assert.equal(initial.player.weaponId,PLAYER_WEAPON_IDS[0]);let hitConfirmed=false,downedIndex=-1;const deadline=Date.now()+90000;
  while(Date.now()<deadline){
    const inspect=await page.evaluate(()=>window.__game.inspect()),index=inspect.enemies.findIndex(e=>e.alive);assert.ok(index>=0,'Need a live hostile for raycast test');const enemy=inspect.enemies[index],candidates=[];
    for(const radius of[7,9,11])for(let i=0;i<24;i++){const a=i*Math.PI/12,p={x:enemy.x+Math.cos(a)*radius,z:enemy.z+Math.sin(a)*radius};if(!blocked(p.x,p.z,inspect.colliders)&&!lineBlocked(p,enemy,inspect.colliders))candidates.push(p);}
    assert.ok(candidates.length,'Live enemy requires a free clear sightline');await page.evaluate(p=>window.__game.teleport(p.x,p.z),candidates[0]);const before=await state();let seenHitmarker=false;
    await page.evaluate(index=>{window.__campaignAimIndex=index;window.__campaignAimActive=true;window.__campaignAimTick=()=>{if(!window.__campaignAimActive)return;const game=window.__game,e=game.inspect().enemies[window.__campaignAimIndex];if(e?.alive){const p=game.behaviorSnapshot().poses.find(p=>Math.hypot(p.position[0]-e.x,p.position[2]-e.z)<.05);if(p?.pose?.head&&p?.pose?.hips){const h=p.pose.head,b=p.pose.hips,t=.62,v=[b[0]+(h[0]-b[0])*t,b[1]+(h[1]-b[1])*t,b[2]+(h[2]-b[2])*t],yaw=p.rotationY;game.lookAt(e.x+v[0]*Math.cos(yaw)+v[2]*Math.sin(yaw),p.position[1]+v[1],e.z-v[0]*Math.sin(yaw)+v[2]*Math.cos(yaw));}}window.__campaignAimFrame=requestAnimationFrame(window.__campaignAimTick);};window.__campaignAimTick();},index);
    try{await trigger(true);const startTime=await page.evaluate(()=>window.__game.behaviorSnapshot().time),end=Date.now()+20000;while(Date.now()<end){const sample=await page.evaluate(index=>({enemy:window.__game.inspect().enemies[index],hit:getComputedStyle(document.getElementById('hitmarker')).opacity,time:window.__game.behaviorSnapshot().time}),index);if(Number(sample.hit)>.05)seenHitmarker=true;if(!sample.enemy.alive||sample.time-startTime>=1.1)break;await page.waitForTimeout(45);}}
    finally{await trigger(false);await page.evaluate(()=>{window.__campaignAimActive=false;cancelAnimationFrame(window.__campaignAimFrame);});}
    const after=await state(),afterEnemy=(await page.evaluate(()=>window.__game.inspect())).enemies[index];combatEvidence.push({enemy:index,magBefore:before.player.mag,magAfter:after.player.mag,healthBefore:enemy.health,healthAfter:afterEnemy.health,alive:afterEnemy.alive,hitmarker:seenHitmarker});assert.ok(after.player.mag<before.player.mag,'Actual shoot handler consumes ammunition');if(seenHitmarker&&afterEnemy.health<enemy.health)hitConfirmed=true;
    if(hitConfirmed&&!afterEnemy.alive){downedIndex=index;break;}if(after.player.mag<4){await pressKey('KeyR');await page.waitForFunction(capacity=>window.__game.getState().player.mag===capacity,WEAPON_DEFINITIONS[after.player.weaponId].magSize,{timeout:60000});}
  }
  assert.ok(hitConfirmed,'Current-skeleton aiming must produce player hitmarker and damage');assert.ok((await state()).enemyCount<initial.enemyCount,'Actual player shots must incapacitate a hostile');
  // Run the same visible-mesh fall review during chapter 6 of the full campaign
  // and during the focused combat run. New character geometry must also ground.
  {
    assert.ok(downedIndex>=0,'Need the hostile incapacitated by the real shooting test');
    const death={type:'casualty-fall',enemy:downedIndex,samples:[]};combatEvidence.push(death);let middle=false;const end=Date.now()+10000;
    while(Date.now()<end){const fallen=await page.evaluate(index=>window.__game.inspect().enemies[index],downedIndex);death.samples.push({time:Date.now(),...fallen});await page.evaluate(e=>window.__game.lookAt(e.x,.55,e.z),fallen);
      if(fallen.fallTime>.3&&!middle){await page.screenshot({path:artifact('combat-fall-transition.png')});middle=true;}
      if(fallen.fallTime>=1){await page.screenshot({path:artifact('combat-fallen-ground.png')});assert.ok(Number.isFinite(fallen.boundsMinY),'Fall review requires the measured visible-body ground bound');assert.ok(fallen.boundsMinY>=-.02&&fallen.boundsMinY<=.09,'Fallen body must rest on ground without floating or sinking');break;}
      await page.waitForTimeout(80);
    }
    assert.ok(death.samples.at(-1).fallTime>=1,'Casualty must complete its fall');assert.ok(death.samples.some(e=>e.fallTime>0&&e.fallTime<1),'Need evidence of an animated transition, not an instant rigid rotation');
  }
  const empty=await state();await pressKey('KeyR');await page.waitForFunction(capacity=>window.__game.getState().player.mag===capacity,WEAPON_DEFINITIONS[empty.player.weaponId].magSize,{timeout:60000});assert.ok((await state()).resources.ammo<empty.resources.ammo,'Reload consumes reserve ammunition');
  await page.evaluate(()=>window.__game.forceDamage(Math.max(0,window.__game.getState().player.health-40)));const injured=await state();await pressKey('KeyH');const healed=await state();assert.ok(healed.player.health>=80,'Medical item heals');assert.equal(healed.resources.medicine,injured.resources.medicine-1,'Medical item is consumed');
}
try{
  const base=new URL(args.find(a=>/^https?:/.test(a))||process.env.QA_BASE_URL||'http://127.0.0.1:5174/');base.searchParams.set('qa','1');await page.goto(base.href);await page.waitForFunction(()=>window.__game,undefined,{timeout:180000});
  buildEvidence.servedScripts=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(node=>node.src));
  if(expectedBuild){const script=buildEvidence.servedScripts.find(url=>new URL(url).pathname.endsWith('/'+expectedBuild));assert.ok(script,`Expected approved build ${expectedBuild}.`);const response=await page.request.get(script);assert.ok(response.ok());buildEvidence.bundleSha256=createHash('sha256').update(await response.body()).digest('hex');}
  await page.screenshot({path:artifact('title-final.png')});
  await page.getByRole('button',{name:'画面与声音'}).evaluate(button=>button.click());await page.locator('[data-setting=gentle]').evaluate(input=>{input.checked=true;input.dispatchEvent(new Event('input',{bubbles:true}));});await page.getByRole('button',{name:'保存并返回'}).evaluate(button=>button.click());
  if(process.argv.includes('--combat-only')){
    await page.evaluate(()=>window.__game.loadChapter(5));await page.locator('[data-action=play]').evaluate(button=>button.click());await page.waitForFunction(()=>window.__game.getState().mode==='playing');await testMovingCombat();assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);await fs.writeFile(artifact('combat-test.json'),JSON.stringify({passed:true,...buildEvidence,headless:true,inputMethod:'DOM events only',combatEvidence,errors,badResponses},null,2));console.log('COMBAT PASS');
  }else{
  await page.locator('[data-action="new"]').evaluate(button=>button.click());
  for(const ch of CHAPTERS){
    await page.getByRole('button',{name:'进入现场'}).evaluate(button=>button.click());await page.waitForFunction(()=>window.__game.getState().mode==='playing');
    const start=await page.evaluate(()=>window.__game.getState());assert.equal(start.chapter,ch.id);assert.equal(await page.evaluate(()=>document.pointerLockElement),null,'QA must never capture the desktop pointer');
    if(ch.id===1){await keyDown('KeyE');await page.waitForTimeout(900);await keyUp('KeyE');assert.equal((await page.evaluate(()=>window.__game.getState())).task,0);await keyDown('KeyW');try{await page.waitForFunction(z=>window.__game.getState().player.z<z-2.2,start.player.z,{timeout:30000});}finally{await keyUp('KeyW');}assert.ok((await page.evaluate(()=>window.__game.getState())).player.z<start.player.z-2);}
    if(ch.id===6)await testMovingCombat();
    if([1,6,12,15].includes(ch.id)){await page.waitForTimeout(250);await page.screenshot({path:artifact(`chapter-${String(ch.id).padStart(2,'0')}.png`)});}
    for(let i=0;i<ch.tasks.length;i++){
      await completeInteraction(ch,i);
    }
    assert.equal((await page.evaluate(()=>window.__game.getState())).mode,'choice');
    if(ch.id===1)await page.screenshot({path:artifact('choice-final.png')});
    const preferred=page.locator(`[data-action=choose][data-value="${ch.id%2}"]`);const button=await preferred.isEnabled()?preferred:page.locator('[data-action=choose]:enabled').first();await button.evaluate(button=>button.click());
    const completed=await page.evaluate(()=>window.__game.getState());assert.equal(completed.mode,'debrief');assert.equal(completed.saved.history.length,ch.id);chapters.push({id:ch.id,history:completed.saved.history.length,resources:completed.resources});console.log(`PASS chapter ${ch.id}: ${ch.title}`);
    await page.getByRole('button',{name:ch.id===16?'回看留下的命运':'继续这段旅程'}).evaluate(button=>button.click());
  }
  assert.equal((await page.evaluate(()=>window.__game.getState())).mode,'ending');await page.screenshot({path:artifact('ending-final.png')});
  await page.reload();await page.waitForFunction(()=>window.__game,{timeout:90000});assert.ok((await page.evaluate(()=>window.__game.getState())).saved.completed);await page.getByRole('button',{name:'继续归途'}).evaluate(button=>button.click());assert.equal((await page.evaluate(()=>window.__game.getState())).mode,'ending');
  await page.getByRole('button',{name:'返回主菜单'}).evaluate(button=>button.click());await page.getByRole('button',{name:'章节档案'}).evaluate(button=>button.click());await page.locator('[data-action=chapter][data-value="5"]').evaluate(button=>button.click());await page.getByRole('button',{name:'进入现场'}).evaluate(button=>button.click());
  const restored=await page.evaluate(()=>window.__game.getState());assert.equal(restored.saved.history.length,5);assert.equal(restored.saved.unlocked,6);await page.evaluate(()=>window.__game.forceDamage(150));await page.waitForFunction(()=>window.__game.getState().mode==='failed');await page.getByRole('button',{name:'回到本章检查点'}).evaluate(button=>button.click());assert.equal((await page.evaluate(()=>window.__game.getState())).mode,'intro');
  assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);
  await fs.writeFile(artifact('campaign-test.json'),JSON.stringify({passed:true,...buildEvidence,chapters,combatEvidence,errors,badResponses,headless:true,inputMethod:'DOM events only',checks:['16 chapters / 48 real hold interactions / 16 persisted choices','movement and out-of-range interaction','raycast shooting and hostile damage','animated casualty fall and measured visible-body ground contact','reload and medical item','ending survives reload','replay restores checkpoint','death restarts at checkpoint']},null,2));console.log(`CAMPAIGN PASS ${expectedBuild||''} ${artifact('campaign-test.json')}`);
  }
}catch(error){console.error(error);await page.screenshot({path:artifact('campaign-failure.png')});await fs.writeFile(artifact(process.argv.includes('--combat-only')?'combat-test.json':'campaign-test.json'),JSON.stringify({passed:false,...buildEvidence,error:String(error),state:await page.evaluate(()=>window.__game?.getState()),chapters,combatEvidence,errors,badResponses},null,2));process.exitCode=1;}finally{await browser.close();}
