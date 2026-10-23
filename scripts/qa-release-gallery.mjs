import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {PLAYER_WEAPON_IDS} from '../src/weapon.js';
// node scripts/qa-release-gallery.mjs [http://127.0.0.1:5174/] --expected-build index-HASH.js [--expected-sha256 HEX]
const args=process.argv.slice(2),flag=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const expectedBuild=flag('--expected-build'),expectedSha256=flag('--expected-sha256');
assert.match(expectedBuild||'',/^index-[A-Za-z0-9_-]+\.js$/,'Final gallery capture requires --expected-build index-HASH.js.');
if(args.includes('--expected-sha256'))assert.match(expectedSha256||'',/^[a-fA-F0-9]{64}$/,'--expected-sha256 must be a SHA256 hex digest.');
const base=new URL(args.find(value=>/^https?:/.test(value))||'http://127.0.0.1:5174/');
assert.ok(['127.0.0.1','localhost'].includes(base.hostname));base.searchParams.set('qa','1');
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=path.resolve('artifacts/release-v0.6/gallery');await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),report={passed:false,startedAt:new Date().toISOString(),url:base.href,expectedBuild,expectedSha256,errors:[],views:[],layouts:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
const click=s=>page.locator(s).evaluate(b=>b.click());
try{
 await page.goto(base.href);
 report.servedScripts=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(node=>node.src));
 report.bundleUrl=report.servedScripts.find(url=>new URL(url).origin===base.origin&&new URL(url).pathname.endsWith('/'+expectedBuild));
 assert.ok(report.bundleUrl,`Expected approved build ${expectedBuild}; served ${report.servedScripts.join(', ')}.`);
 const bundle=await page.request.get(report.bundleUrl);assert.ok(bundle.ok(),'Approved bundle must be readable.');
 report.bundleSha256=createHash('sha256').update(await bundle.body()).digest('hex');
 if(expectedSha256)assert.equal(report.bundleSha256,expectedSha256.toLowerCase(),'Approved bundle SHA256 must match.');
 await page.waitForFunction(()=>window.__game,{},{timeout:120000});
 await click('[data-action="gallery"]');
 for(const kind of ['soldier','civilian','enemy',...PLAYER_WEAPON_IDS.map(id=>id==='m4a1'?'rifle':id)]){
  await click(`[data-action="gallery-kind"][data-value="${kind}"]`);
  for(const close of [false,true]){
   if(close)await click('[data-action="gallery-close"]');
   await page.waitForTimeout(250);
   const state=await page.evaluate(()=>({state:window.__game.getState(),locked:!!document.pointerLockElement}));
   assert.equal(state.state.mode,'gallery');assert.equal(state.locked,false);assert.ok(state.state.render.triangles>500);
   const file=path.join(dir,`${kind}-${close?'close':'full'}.png`);await page.screenshot({path:file});report.views.push({kind,close,file,render:state.state.render});
  }
  await click('[data-action="gallery-close"]');
 }
 await page.setViewportSize({width:960,height:600});
 for(const screen of ['gallery','menu']){
  if(screen==='menu')await click('[data-action="menu"]');await page.waitForTimeout(150);
  const layout=await page.evaluate(()=>({locked:!!document.pointerLockElement,buttons:[...document.querySelectorAll('#overlay button')].map(b=>{const r=b.getBoundingClientRect();return{text:b.textContent,visible:r.width>0&&r.height>0&&r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth,rect:{x:r.x,y:r.y,w:r.width,h:r.height}};})}));
  report.layouts.push({screen,...layout});assert.equal(layout.locked,false);assert.ok(layout.buttons.every(b=>b.visible),`${screen} buttons fit 960x600`);await page.screenshot({path:path.join(dir,`${screen}-960.png`)});
 }
 assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({passed:true,expectedBuild,bundleSha256:report.bundleSha256,views:report.views.length,layouts:report.layouts.length}));
}catch(e){report.failure=String(e.stack||e);process.exitCode=1;console.error(e);}
finally{report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));await browser.close();}
