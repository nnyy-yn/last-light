import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {CHAPTERS} from '../src/story.js';
import {blocked} from '../src/simulation.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=new URL(process.argv[2]||process.env.QA_BASE_URL||'http://127.0.0.1:5174/');base.searchParams.set('qa','1');
const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const report={passed:false,url:base.href,chapters:[],walkApproach:null,errors:[],checks:[]};
page.on('pageerror',error=>report.errors.push(`JavaScript: ${error}`));
page.on('console',message=>{if(message.type()==='error')report.errors.push(`Console: ${message.text()}`);});
page.on('requestfailed',request=>report.errors.push(`Asset: ${request.url()} ${request.failure()?.errorText}`));
page.on('response',response=>{if(response.status()>=400)report.errors.push(`HTTP ${response.status()}: ${response.url()}`);});
const chapters=CHAPTERS.filter(chapter=>chapter.tasks.some(task=>task.kind==='wreck'));
assert.ok(chapters.length>0,'The campaign must contain wreck interactions.');
let exercisedWalk=false;

function candidates(task,colliders){
  return [1,-1].map(side=>({side,x:task.pos[0]+side*2.8,z:task.pos[1]}))
    .map(point=>({...point,blocked:blocked(point.x,point.z,colliders),distance:Math.hypot(point.x-task.pos[0],point.z-task.pos[1])}));
}

async function holdInteraction(index,seconds){
  await page.keyboard.down('KeyE');
  try{
    await page.waitForFunction(next=>window.__game.getState().task>=next,index+1,{timeout:Math.max(25000,(seconds||2)*6000)});
  }finally{await page.keyboard.up('KeyE');}
  const state=await page.evaluate(()=>window.__game.getState());
  assert.equal(state.task,index+1,'Holding E must advance exactly the current task.');
  assert.notEqual(state.mode,'failed','Route checks must not rely on a failed chapter.');
}

try{
  await page.goto(base.href);await page.waitForFunction(()=>window.__game,{timeout:120000});
  await page.locator('[data-action=settings]').click();await page.locator('[data-setting=gentle]').check();
  await page.locator('[data-action=back]').click();
  for(const chapter of chapters){
    await page.evaluate(index=>window.__game.loadChapter(index),chapter.id-1);
    await page.locator('[data-action=play]').click();await page.waitForFunction(()=>window.__game.getState().mode==='playing');
    const chapterReport={id:chapter.id,title:chapter.title,tasks:[],wrecks:[],render:null};
    report.chapters.push(chapterReport);
    const lastWreck=chapter.tasks.reduce((last,task,index)=>task.kind==='wreck'?index:last,-1);
    for(let index=0;index<=lastWreck;index++){
      const task=chapter.tasks[index];
      const {colliders}=await page.evaluate(()=>window.__game.inspect());
      const options=candidates(task,colliders);const available=options.filter(point=>!point.blocked&&point.distance<3.4);
      assert.ok(available.length,`Chapter ${chapter.id} ${task.id}: neither ±2.8 m side has a legal standing point.`);
      let target=available[0];
      if(task.kind==='wreck'){
        const body=colliders.find(box=>task.pos[0]>=box.minX&&task.pos[0]<=box.maxX&&task.pos[1]>=box.minZ&&task.pos[1]<=box.maxZ);
        assert.ok(body,`Chapter ${chapter.id}: wreck body collision must be registered at the task centre.`);
        assert.ok(body.maxX-body.minX<6,'The collision proxy must fit the fuselage, not the entire rotor span.');
        assert.ok(blocked(task.pos[0],task.pos[1],colliders),'The solid wreck centre must block movement.');
        chapterReport.wrecks.push({id:task.id,position:task.pos,candidates:options,body});
        if(!exercisedWalk){
          target=available.find(point=>{
            for(let d=2.8;d<=5.2;d+=.2)if(blocked(task.pos[0]+point.side*d,task.pos[1],colliders))return false;
            return true;
          });
          assert.ok(target,'Expected at least one unobstructed approach from outside the wreck.');
          const start={x:task.pos[0]+target.side*5.2,z:task.pos[1]};
          await page.evaluate(({start,center})=>{window.__game.teleport(start.x,start.z);window.__game.lookAt(center[0],1.68,center[1]);},{start,center:task.pos});
          const before=await page.evaluate(()=>window.__game.getState().player);
          await page.keyboard.down('KeyW');
          try{
            await page.waitForFunction(center=>{const p=window.__game.getState().player;return Math.hypot(p.x-center[0],p.z-center[1])<3.1;},task.pos,{timeout:15000});
            await page.waitForTimeout(1400);
          }finally{await page.keyboard.up('KeyW');}
          const stopped=await page.evaluate(()=>window.__game.getState().player);
          assert.ok(Math.hypot(stopped.x-before.x,stopped.z-before.z)>1.5,'W must actually move from the outside approach.');
          assert.ok(Math.hypot(stopped.x-task.pos[0],stopped.z-task.pos[1])<3.4,'W must reach interaction distance.');
          assert.ok(!blocked(stopped.x,stopped.z,colliders),'Movement must stop outside the expanded fuselage collision bounds.');
          const nearEdge=target.side>0?body.maxX+.36:body.minX-.36;
          assert.ok(target.side*(stopped.x-nearEdge)>=-.04,'Player must not pass through the fuselage side.');
          await page.keyboard.down('KeyW');await page.waitForTimeout(850);await page.keyboard.up('KeyW');
          const held=await page.evaluate(()=>window.__game.getState().player);
          assert.ok(Math.hypot(held.x-stopped.x,held.z-stopped.z)<.12,'Continued W must remain blocked at the fuselage.');
          await page.keyboard.down('KeyS');await page.waitForTimeout(300);await page.keyboard.up('KeyS');
          const backedAway=await page.evaluate(()=>window.__game.getState().player);
          assert.ok(target.side*(backedAway.x-held.x)>.35,'S must allow backing away from the collision wall.');
          await page.keyboard.down('KeyW');
          try{await page.waitForFunction(center=>{const p=window.__game.getState().player;return Math.hypot(p.x-center[0],p.z-center[1])<3.1;},task.pos,{timeout:10000});}
          finally{await page.keyboard.up('KeyW');}
          report.walkApproach={chapter:chapter.id,task:task.id,side:target.side,before,stopped,held,backedAway};
          exercisedWalk=true;
          await page.screenshot({path:path.join(artifacts,'wreck-walk-approach.png')});
        }else{
          await page.evaluate(({point,center})=>{window.__game.teleport(point.x,point.z);window.__game.lookAt(center[0],2.5,center[1]);},{point:target,center:task.pos});
        }
      }else{
        await page.evaluate(({point,center})=>{window.__game.teleport(point.x,point.z);window.__game.lookAt(center[0],1.1,center[1]);},{point:target,center:task.pos});
      }
      await holdInteraction(index,task.seconds);
      const after=await page.evaluate(()=>window.__game.getState());
      chapterReport.tasks.push({id:task.id,kind:task.kind,advancedTo:after.task,health:after.player.health});
      if(task.kind==='wreck')await page.screenshot({path:path.join(artifacts,`wreck-route-chapter-${chapter.id}.png`)});
    }
    chapterReport.render=(await page.evaluate(()=>window.__game.getState())).render;
    console.log(`PASS wreck route chapter ${chapter.id}: ${chapterReport.tasks.length} real hold interactions.`);
    if((await page.evaluate(()=>window.__game.getState())).mode==='playing')await page.keyboard.press('Escape');
  }
  assert.ok(exercisedWalk,'A real keyboard collision approach must be exercised.');
  assert.equal(report.chapters.reduce((sum,ch)=>sum+ch.wrecks.length,0),chapters.reduce((sum,ch)=>sum+ch.tasks.filter(task=>task.kind==='wreck').length,0));
  assert.deepEqual(report.errors,[],'No smoke shader, script or asset failures are allowed.');
  report.checks=['all campaign wreck tasks have an unblocked side within 3.4 m','prerequisite tasks advanced by real E holds','all wreck tasks advanced by real E holds','keyboard W reaches the wreck but cannot cross its fuselage','keyboard S can back away from the collision wall','new smoke and aircraft render without shader or asset errors'];
  report.passed=true;console.log('WRECK ROUTING PASS');
}catch(error){report.failure=String(error.stack||error);report.state=await page.evaluate(()=>window.__game?.getState()).catch(()=>null);await page.screenshot({path:path.join(artifacts,'wreck-routing-failure.png')}).catch(()=>{});console.error(error);process.exitCode=1;}
finally{await fs.writeFile(path.join(artifacts,'wreck-routing-test.json'),JSON.stringify(report,null,2));await browser.close();}
