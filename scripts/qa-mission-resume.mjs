import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {CHAPTERS} from '../src/story.js';
import {campaignChapter} from '../src/campaign-tasks.js';
import {blocked,lineBlocked,SETTINGS_KEY} from '../src/simulation.js';
const args=process.argv.slice(2),arg=n=>args[args.indexOf(n)+1];
const expected=arg('--expected-build'),base=args.includes('--url')?arg('--url'):'http://127.0.0.1:46171/';
assert.match(expected||'',/^index-[\w-]+\.js$/);
const out='artifacts/rebuild-v0.8/resume-'+new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(150000);
const report={passed:false,bundle:expected,errors:[],steps:[],method:'Muted headless Chrome; DOM E/choice/pause/reload inputs. QA teleport only to unobstructed task approach positions. This checks save correctness, not chapter duration.'};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
await page.addInitScript(k=>localStorage.setItem(k,JSON.stringify({graphicsVersion:2,quality:'low',renderScale:1,gentle:true,volume:0,headbob:false})),SETTINGS_KEY);
const snap=()=>page.evaluate(()=>({state:__game.getState(),inspect:__game.inspect(),locked:!!document.pointerLockElement}));
const key=(code,down)=>page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true,repeat:false})),{code,down});
const click=async action=>{await page.locator(`[data-action="${action}"]`).first().evaluate(e=>e.click());};
async function press(){const s=await snap(),before=JSON.stringify([s.state.task,s.state.mode,s.inspect.narrative.phase,s.inspect.narrative.lineIndex]);await key('KeyE',true);await key('KeyE',false);await page.waitForFunction(before=>{const s=__game.getState(),n=__game.inspect().narrative;return JSON.stringify([s.task,s.mode,n.phase,n.lineIndex])!==before;},before,{timeout:20000});}
async function approach(index){const s=await snap(),task=s.inspect.tasks[index];if(task.interaction==='radio')return;const [x,z]=task.goal,b=s.inspect.scene.bounds,candidates=[];
  for(const radius of[1.4,1.9,2.5,3])for(let i=0;i<32;i++){const a=i*Math.PI/16,p={x:x+Math.cos(a)*radius,z:z+Math.sin(a)*radius};if(p.x>b.minX+.4&&p.x<b.maxX-.4&&p.z>b.minZ+.4&&p.z<b.maxZ-.4&&!blocked(p.x,p.z,s.inspect.colliders,.4)&&!lineBlocked(p,{x,z},s.inspect.staticColliders))candidates.push(p);}
  assert.ok(candidates.length,task.id+' must have a reachable interaction side');const p=candidates.sort((a,b)=>Math.hypot(a.x-s.state.player.x,a.z-s.state.player.z)-Math.hypot(b.x-s.state.player.x,b.z-s.state.player.z))[0];await page.evaluate(({p,x,z})=>{__game.teleport(p.x,p.z);__game.lookAt(x,1.2,z);},{p,x,z});
}
try{
  await page.goto(base+'?qa=1');await page.waitForFunction(()=>window.__game&&__game.getState().mode==='menu');
  assert.match(await page.title(),/LAST LIGHT/);const src=await page.locator('script[type=module]').getAttribute('src');assert.ok(src.endsWith(expected));report.sha256=createHash('sha256').update(await(await page.request.get(new URL(src,page.url()).href)).body()).digest('hex');
  await click('new');await click('play');await click('skip-cinematic');await page.waitForFunction(()=>__game.getState().mode==='playing');
  const chapter=campaignChapter(CHAPTERS[0]);let decisions=0;
  for(let i=0;i<chapter.tasks.length;i++){
    const task=chapter.tasks[i];if(task.interaction==='escort')break;
    await approach(i);for(let n=0;n<=task.dialogue.length;n++)await press();
    if(task.decision){const before=await snap();assert.equal(before.inspect.narrative.phase,'decision');await key('KeyW',true);await page.waitForTimeout(350);await key('KeyW',false);const fixed=(await snap()).state.player;for(const k of ['x','z','health','mag'])assert.equal(fixed[k],before.state.player[k],'Decision locks '+k);assert.ok(Math.abs(fixed.y-before.state.player.y)<1e-6,'Standing camera height is stable');
      await page.screenshot({path:out+'/decision-'+i+'.png'});await key('Escape',true);await key('Escape',false);await page.waitForFunction(()=>__game.getState().mode==='paused');await click('resume');await page.waitForFunction(()=>!document.getElementById('task-decision').hidden);assert.ok(await page.locator('[data-action="task-decision"]').count(),'Resumed decision must repaint its buttons');
      await page.locator('[data-action="task-decision"]:enabled').first().evaluate(e=>e.click());decisions++;
    }
    if(task.interaction==='hold')await key('KeyE',true);
    await page.waitForFunction(i=>__game.getState().task===i+1,i);await key('KeyE',false);await click('skip-cinematic');await page.waitForFunction(()=>__game.getState().mode==='playing');
    const s=await snap();assert.equal(s.state.saved.fieldCheckpoint.taskIndex,i+1);report.steps.push({id:task.id,resources:s.state.resources,checkpoint:s.state.saved.fieldCheckpoint});
    if(decisions&&chapter.tasks.slice(0,i+1).some(t=>t.id==='clinic-kit'))break;
  }
  assert.ok(decisions>=1);await key('Escape',true);await key('Escape',false);await page.waitForFunction(()=>__game.getState().mode==='paused');const saved=(await snap()).state.saved.fieldCheckpoint;assert.ok(saved.taskIndex>=4);
  await click('menu');await page.reload();await page.waitForFunction(()=>window.__game&&__game.getState().mode==='menu');await page.waitForTimeout(1000);report.resumeClock=await page.locator('[data-action="continue"]').evaluate(async(button)=>{const started=performance.now();button.click();const entered=performance.now();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {synchronousLoadSeconds:(entered-started)/1000,liveSeconds:(performance.now()-entered)/1000,activeSeconds:__game.inspect().pacing.activeSeconds};});await page.waitForFunction(()=>__game.getState().mode==='playing');const resumed=await snap();assert.ok(report.resumeClock.activeSeconds>=saved.pacingElapsed,'Continue cannot rewind active time');assert.ok(report.resumeClock.activeSeconds-saved.pacingElapsed<=report.resumeClock.liveSeconds+.12,'Synchronous scene loading and menu wait cannot become active chapter time');
  assert.equal(saved.version,2);assert.equal(typeof saved.assistUsed,'boolean');assert.equal(resumed.state.saved.fieldCheckpoint.assistUsed,saved.assistUsed,'The one-time aid guard survives Continue');assert.equal(resumed.state.task,saved.taskIndex);assert.deepEqual(resumed.state.resources,saved.resources);assert.deepEqual(resumed.state.stowedMagazines,saved.stowedMagazines);assert.equal(resumed.state.player.mag,saved.player.mag);assert.deepEqual(resumed.inspect.pacing.taskDecisions,saved.taskDecisions);assert.equal(resumed.inspect.tasks.filter(t=>t.done).length,saved.taskIndex);assert.equal(resumed.locked,false);report.resumed=resumed;
  await page.screenshot({path:out+'/resumed-checkpoint.png'});
  await key('Escape',true);await key('Escape',false);await click('restart-chapter');await page.waitForFunction(()=>__game.getState().mode==='intro');assert.equal((await snap()).state.task,0);assert.equal((await snap()).state.resources.medicine,3);
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error.stack||error);try{report.failureState=await snap();await page.screenshot({path:out+'/failure.png'});}catch{}process.exitCode=1;}
finally{await browser.close();await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,report:out+'/report.json',failure:report.failure}));}
