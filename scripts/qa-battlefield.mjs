import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {blocked,lineBlocked,movePlayer} from '../src/simulation.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const report={passed:false,errors:[],routes:[],screenshots:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
function reachable(start,boxes){
  assert.ok(!blocked(start.x,start.z,boxes),'chapter spawn must not be inside an obstacle');
  const step=.7,seen=new Set(['0,0']),queue=[{x:start.x,z:start.z,ix:0,iz:0}];
  for(let head=0;head<queue.length;head++){
    const a=queue[head];
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const ix=a.ix+dx,iz=a.iz+dz,key=ix+','+iz;if(seen.has(key))continue;seen.add(key);
      const x=start.x+ix*step,z=start.z+iz*step;if(Math.abs(x)>91||Math.abs(z)>91)continue;
      const p=movePlayer({x:a.x,z:a.z},dx*step,dz*step,boxes);
      if(Math.hypot(p.x-x,p.z-z)<.01)queue.push({x,z,ix,iz});
    }
  }
  return queue;
}
async function shot(name){const file=`artifacts/rebuilt-${name}.png`;await page.screenshot({path:file});report.screenshots.push(file);}
try{
  await page.goto((process.env.QA_BASE_URL||'http://127.0.0.1:5174/')+'?qa=1');await page.waitForFunction(()=>window.__game,{timeout:120000});
  await shot('menu');
  for(let i=0;i<16;i++){
    await page.evaluate(i=>window.__game.loadChapter(i),i);
    const data=await page.evaluate(()=>({state:window.__game.getState(),...window.__game.inspect()}));
    const space=reachable(data.state.player,data.colliders);
    const targets=data.tasks.map(t=>{const possible=space.filter(p=>Math.hypot(p.x-t.pos[0],p.z-t.pos[1])<3.25&&!lineBlocked(p,{x:t.pos[0],z:t.pos[1]},data.staticColliders));assert.ok(possible.length,`chapter ${i+1} task ${t.id} has a walking route and interaction sight line`);return{id:t.id,approaches:possible.length};});
    report.routes.push({chapter:i+1,reachableCells:space.length,targets});
    console.log('ROUTES',i+1,targets.length);
  }
  await page.evaluate(()=>window.__game.loadChapter(5));await page.locator('[data-action=play]').click();
  await page.waitForTimeout(300);await shot('street');
  await page.evaluate(()=>{window.__game.teleport(3,33);window.__game.lookAt(-9,4.4,22);});await page.waitForTimeout(300);await shot('ruins');
  await page.evaluate(()=>{window.__game.teleport(2,30);window.__game.lookAt(-6,.55,30);});await page.waitForTimeout(300);await shot('user-corner');
  await page.evaluate(()=>{window.__game.teleport(4,-12);window.__game.lookAt(0,2,0);});await page.waitForTimeout(300);await shot('fire-day');
  await page.evaluate(()=>{window.__game.pause();window.__game.loadChapter(11);window.__game.action('play');});
  await page.waitForTimeout(300);await shot('night');
  report.render=await page.evaluate(()=>window.__game.getState().render);
  report.urban=await page.evaluate(()=>window.__game.inspect().urban);
  assert.deepEqual(report.errors,[]);report.passed=true;console.log('BATTLEFIELD PASS',report.render);
}catch(e){report.failure=String(e.stack||e);await shot('failure').catch(()=>{});console.error(e);process.exitCode=1;}
finally{await fs.writeFile('artifacts/battlefield-test.json',JSON.stringify(report,null,2));await browser.close();}

