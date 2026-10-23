import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { createRequire } from 'node:module';
import { blocked, lineBlocked } from '../src/simulation.js';
const args=process.argv.slice(2),expectedBuild=args.includes('--expected-build')?args[args.indexOf('--expected-build')+1]:null;
assert.match(expectedBuild||'',/^index-[A-Za-z0-9_-]+\.js$/,'Pass the final bundle with --expected-build.');
const base=new URL(args.find(a=>/^https?:/.test(a))||'http://127.0.0.1:5174/');assert.ok(['127.0.0.1','localhost'].includes(base.hostname));base.searchParams.set('qa','1');
const output=path.resolve('artifacts/release-v0.6/combat-feedback',expectedBuild.replace(/\.js$/,''));await fs.mkdir(output,{recursive:true});
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),report={passed:false,expectedBuild,errors:[],input:'Page-local DOM events; no OS input or pointer capture'};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)report.errors.push('HTTP '+r.status()+' '+r.url());});
try{
  await page.goto(base.href);await page.waitForFunction(()=>window.__game,{timeout:120000});
  report.bundle=await page.locator('script[type="module"]').getAttribute('src');assert.ok(report.bundle.endsWith('/'+expectedBuild));
  const bundleResponse=await page.request.get(new URL(report.bundle,base).href);assert.ok(bundleResponse.ok());report.bundleSha256=createHash('sha256').update(await bundleResponse.body()).digest('hex');
  await page.evaluate(()=>{window.__game.loadChapter(1);window.__game.action('play');});
  const state=await page.evaluate(()=>window.__game.getState()),boxes=await page.evaluate(()=>window.__game.inspect().colliders);
  let shot;
  for(const box of boxes){
    if(Math.hypot((box.minX+box.maxX)/2-state.player.x,(box.minZ+box.maxZ)/2-state.player.z)>55)continue;
    for(const p of [
      {x:box.minX-2.4,z:(box.minZ+box.maxZ)/2,tx:box.minX+.1,tz:(box.minZ+box.maxZ)/2},
      {x:box.maxX+2.4,z:(box.minZ+box.maxZ)/2,tx:box.maxX-.1,tz:(box.minZ+box.maxZ)/2},
      {x:(box.minX+box.maxX)/2,z:box.maxZ+2.4,tx:(box.minX+box.maxX)/2,tz:box.maxZ-.1}
    ]){
      if(!blocked(p.x,p.z,boxes)&&lineBlocked(p,{x:p.tx,z:p.tz},boxes)){shot=p;break;}
    }
    if(shot)break;
  }
  assert.ok(shot,'real unobstructed player position beside a solid cover footprint exists');
  await page.evaluate(p=>{window.__game.teleport(p.x,p.z);window.__game.lookAt(p.tx,1.15,p.tz);},shot);
  await page.waitForTimeout(350);
  await page.screenshot({path:path.join(output,'before.png')});
  await page.evaluate(()=>document.getElementById('game').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true})));
  await page.waitForFunction(()=>window.__game.inspect().combatEffects.impactBursts>0,{timeout:10000});
  await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true})));
  report.during=await page.evaluate(()=>({effects:window.__game.inspect().combatEffects,state:window.__game.getState()}));
  assert.ok(report.during.effects.activeParticles>0);assert.ok(report.during.effects.activeParticles<=report.during.effects.capacity);
  assert.ok(report.during.state.player.mag<state.player.mag,'real player shot consumes ammunition');
  await page.screenshot({path:path.join(output,'during.png')});
  await page.waitForFunction(()=>window.__game.inspect().combatEffects.activeParticles===0,{timeout:12000});
  assert.equal(await page.evaluate(()=>document.pointerLockElement),null);assert.deepEqual(report.errors,[]);
  report.passed=true;report.shot=shot;report.checks=['actual player shot into real cover','visible pooled impact particles','impact particles expire without leaking','no pointer lock'];
  console.log('COMBAT FEEDBACK PASS',report.during.effects);
}catch(error){report.failure=String(error.stack||error);console.error(error);process.exitCode=1;}finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
