import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {lineBlocked} from '../src/simulation.js';
import {chapterLocation} from '../src/setting.js';

// Run only after the final build signal. Headless, DOM-only controls: no OS
// input, pointer lock, focus, visible windows, ammo edits or injected AI events.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base=new URL(process.argv[2]||process.env.QA_BASE_URL||'http://127.0.0.1:5174/');base.searchParams.set('qa','1');
assert.ok(['127.0.0.1','localhost'].includes(base.hostname));
const out=path.join(root,'artifacts','release-v0.3');await fs.mkdir(out,{recursive:true});
const report={passed:false,url:base.href,headless:true,input:'Synthetic in-page events and DOM buttons only',startedAt:new Date().toISOString(),checks:[],screenshots:[],ammo:[],errors:[],requestsFailed:[]};
const browser=await chromium.launch({executablePath:process.env.QA_CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.setDefaultTimeout(60000);
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(`Console: ${m.text()}`);});
page.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()}: ${r.url()}`);});
page.on('requestfailed',r=>report.requestsFailed.push({url:r.url(),error:r.failure()?.errorText}));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function click(selector){await page.locator(selector).evaluate(b=>b.click());}
async function key(code){await page.evaluate(code=>{const key=code.startsWith('Digit')?code.slice(5):code.slice(3).toLowerCase();for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key,code,bubbles:true}));},code);}
async function mouse(button,down){await page.evaluate(({button,down})=>(down?document.getElementById('game'):window).dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button,buttons:down?(button===2?2:1):0,bubbles:true})),{button,down});}
async function snap(){return page.evaluate(()=>({state:window.__game.getState(),behavior:window.__game.behaviorSnapshot(),inspect:window.__game.inspect(),hud:document.getElementById('weapon-label').textContent,pointer:!!document.pointerLockElement,fullscreen:!!document.fullscreenElement}));}
async function shot(name){const file=path.join(out,`${name}.png`);await page.screenshot({path:file});report.screenshots.push(file);}
function total(state){assert.ok(state.stowedMagazines,'QA requires the actual stowed magazines.');return state.player.mag+state.resources.ammo+Object.values(state.stowedMagazines).reduce((n,a)=>n+a,0);}
async function ammo(label){const s=(await snap()).state;report.ammo.push({label,weapon:s.player.weaponId,active:s.player.mag,stowed:s.stowedMagazines,reserve:s.resources.ammo,total:total(s)});return s;}
async function location(id){assert.equal(await page.locator('[data-chapter-location]').textContent(),`地点 · ${chapterLocation(id)}`);}
function visibleEnemy(sample){
  const {player:p}=sample.state,aspect=1280/800,tan=Math.tan(74*Math.PI/360),result=[];
  for(const e of sample.inspect.enemies.filter(e=>e.alive)){
    const pose=sample.behavior.poses.find(a=>Math.hypot(a.position[0]-e.x,a.position[2]-e.z)<.05)?.pose;
    const height=pose?.headHeight||1.2,dx=e.x-p.x,dz=e.z-p.z,dy=height-p.y;
    const right=dx*Math.cos(p.yaw)-dz*Math.sin(p.yaw),forward=-(dx*Math.sin(p.yaw)+dz*Math.cos(p.yaw));
    const depth=forward*Math.cos(p.pitch)+dy*Math.sin(p.pitch),up=dy*Math.cos(p.pitch)-forward*Math.sin(p.pitch);
    const ndcX=right/(depth*tan*aspect),ndcY=up/(depth*tan),heightPixels=height/(Math.max(.01,depth)*tan)*400;
    if(depth>0&&Math.abs(ndcX)<.95&&Math.abs(ndcY)<.95&&heightPixels>=16&&!lineBlocked(p,e,sample.inspect.colliders))result.push({x:e.x,z:e.z,ndcX,ndcY,heightPixels});
  }
  return result;
}
async function fireOnce(){
  const before=await ammo('before-fire'),p=before.player;
  await page.evaluate(p=>window.__game.lookAt(p.x,.2,p.z-8),p);
  await mouse(0,true);try{await page.waitForFunction(mag=>window.__game.getState().player.mag<mag,before.player.mag,{timeout:12000});}finally{await mouse(0,false);}
  const after=await ammo('after-fire');assert.ok(after.player.mag<before.player.mag);assert.equal(total(before)-total(after),before.player.mag-after.player.mag,'Only fired rounds may leave the ammunition ledger.');
  await page.evaluate(p=>window.__game.lookAt(p.x,1.4,p.z-20),p);return{before,after,spent:before.player.mag-after.player.mag};
}
async function validateAbortedAssets(){
  report.assetRecovery=[];
  for(const failure of report.requestsFailed){
    if(failure.error!=='net::ERR_ABORTED'||!failure.url.match(/\.glb(?:\?|$)/)){report.errors.push(`Asset: ${failure.url} ${failure.error}`);continue;}
    if(report.assetRecovery.some(a=>a.url===failure.url))continue;
    const result=await page.evaluate(async url=>{try{const response=await fetch(url),bytes=await response.arrayBuffer(),view=new DataView(bytes);return{url,bytes:bytes.byteLength,valid:response.ok&&bytes.byteLength>=12&&view.getUint32(0,true)===0x46546c67&&view.getUint32(4,true)===2&&view.getUint32(8,true)===bytes.byteLength};}catch(error){return{url,valid:false,error:String(error)};}},failure.url);
    report.assetRecovery.push(result);if(!result.valid)report.errors.push(`Unrecovered asset: ${failure.url}`);
  }
}
try{
  await page.goto(base.href);await page.waitForFunction(()=>window.__game,{timeout:120000});
  await click('[data-action="settings"]');
  for(const [name,value]of Object.entries({quality:'high',renderScale:'1'}))await page.locator(`[data-setting="${name}"]`).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));},value);
  for(const [name,value]of Object.entries({gentle:true,headbob:false}))await page.locator(`[data-setting="${name}"]`).evaluate((e,v)=>{e.checked=v;e.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await page.locator('[data-setting="volume"]').evaluate(e=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));});await click('[data-action="back"]');

  // Create a real campaign checkpoint first, then prove the direct battle demo
  // leaves it intact. No teleportation or camera changes during opening review.
  await click('[data-action="new"]');await location(1);await shot('intro-city-location');
  await page.evaluate(()=>window.__game.action('menu'));const savedBefore=(await snap()).state.saved;
  assert.ok(savedBefore,'Need a genuine prior campaign save.');
  await click('[data-action="combat-demo"]');await location(6);await shot('intro-combat-location');await click('[data-action="play"]');
  const start=Date.now(),first=await snap(),opening={samples:[],shots:[],initial:first.state,firstEnemyShotAt:null,firstAllyShotAt:null};report.opening=opening;
  const shots=new Map();let picture=0;
  while(Date.now()-start<18000){
    const s=await snap(),wallSeconds=(Date.now()-start)/1000;
    assert.equal(s.state.mode,'playing');assert.equal(s.pointer,false);assert.equal(s.fullscreen,false);
    const visible=visibleEnemy(s);opening.samples.push({wallSeconds,gameTime:s.behavior.time,player:s.state.player,visibleEnemies:visible,actors:s.behavior.actors.map(a=>({id:a.id,role:a.role,x:a.x,z:a.z,stance:a.stance,behavior:a.behavior,shotsFired:a.shotsFired}))});
    for(const event of s.behavior.shots){shots.set(`${event.shooterId}:${event.time}`,event);if(event.faction==='enemy'&&opening.firstEnemyShotAt===null)opening.firstEnemyShotAt=event.time;if(event.faction==='ally'&&opening.firstAllyShotAt===null)opening.firstAllyShotAt=event.time;}
    if(picture<3&&wallSeconds>=[.5,6,15][picture]){await shot(`opening-${['start','exchange','squad'][picture]}`);picture++;}
    await sleep(150);
  }
  opening.shots=[...shots.values()];opening.wallSeconds=(Date.now()-start)/1000;opening.gameSeconds=opening.samples.at(-1).gameTime-first.behavior.time;
  assert.ok(opening.samples.some(s=>s.wallSeconds<=5&&s.visibleEnemies.length),'A real hostile must be in the initial view, large enough to distinguish and on an open sightline.');
  assert.ok(opening.shots.some(s=>s.faction==='enemy'),'Opening must contain actual enemy fire without QA threat injection.');
  assert.ok(opening.shots.some(s=>s.faction==='ally'),'Opening must contain actual squad return fire.');
  assert.ok(opening.firstEnemyShotAt<=8,'Opening fire must begin promptly at normal simulation speed.');
  assert.ok(opening.samples.every(s=>Math.hypot(s.player.x-first.state.player.x,s.player.z-first.state.player.z)<.01),'Opening review must remain at the authored spawn.');
  report.checks.push('menu battle entry reaches chapter 6; an enemy is visible from the authored spawn and both sides fire naturally');
  await page.evaluate(()=>window.__game.pause());await click('[data-action="menu"]');assert.deepEqual((await snap()).state.saved,savedBefore,'Direct battle demo must preserve the campaign checkpoint.');
  report.checks.push('direct battle demonstration preserves the prior campaign save');

  // Exercise equipment in the non-hostile base chapter so incoming damage does
  // not obscure independent magazine accounting and weapon presentation.
  await page.evaluate(()=>window.__game.loadChapter(1));await location(2);await click('[data-action="play"]');
  const original=await ammo('initial-m4');assert.equal(original.player.weaponId,'m4a1');assert.ok(original.player.mag>0&&original.resources.ammo>0);
  await shot('weapon-m4-hip');await mouse(2,true);await sleep(600);await shot('weapon-m4-ads');await mouse(2,false);
  const rifleFire=await fireOnce(),rifleMag=rifleFire.after.player.mag;
  await key('Digit2');assert.equal((await snap()).state.player.weaponId,'m249');
  await key('Digit1');assert.equal((await snap()).state.player.weaponId,'m249','Switching is blocked while the machine gun is loading.');
  await page.waitForFunction(()=>window.__game.getState().player.mag>0&&document.getElementById('weapon-label').textContent.includes('M249'),undefined,{timeout:25000});
  const machine=await ammo('loaded-m249');assert.equal(machine.player.mag,Math.min(100,rifleFire.after.resources.ammo));assert.equal(machine.stowedMagazines.m4a1,rifleMag);assert.equal(total(machine),total(rifleFire.after),'Reload transfers reserve rounds; it does not create ammunition.');
  await shot('weapon-m249-hip');await mouse(2,true);await sleep(600);await shot('weapon-m249-ads');await mouse(2,false);
  const machineFire=await fireOnce();
  for(let i=0;i<3;i++){
    await key('Digit1');await page.waitForFunction(()=>document.getElementById('weapon-label').textContent.includes('M4A1'));let s=await ammo(`return-m4-${i}`);assert.equal(s.player.weaponId,'m4a1');assert.equal(s.player.mag,rifleMag);assert.equal(total(s),total(machineFire.after));assert.match((await snap()).hud,/M4A1/);
    await key('Digit2');await page.waitForFunction(()=>document.getElementById('weapon-label').textContent.includes('M249'));s=await ammo(`return-m249-${i}`);assert.equal(s.player.weaponId,'m249');assert.equal(s.player.mag,machineFire.after.player.mag);assert.equal(total(s),total(machineFire.after));assert.match((await snap()).hud,/M249/);
  }
  assert.equal(total(original)-total(machineFire.after),rifleFire.spent+machineFire.spent);
  report.checks.push('M4A1 and M249 render in hip/ADS views, fire through real handlers, retain separate magazines and share a conserved reserve');
  const beforePause=await ammo('before-pause');await page.evaluate(()=>window.__game.pause());await key('Digit1');assert.equal((await snap()).state.player.weaponId,beforePause.player.weaponId,'Paused input cannot change equipment.');
  await validateAbortedAssets();assert.deepEqual(report.errors,[]);
  const final=await snap();assert.equal(final.pointer,false);assert.equal(final.fullscreen,false);report.visualReviewRequired=true;report.passed=true;
  console.log(JSON.stringify({passed:true,openingEnemyFire:opening.firstEnemyShotAt,openingShots:opening.shots.length,checks:report.checks}));
}catch(error){report.failure=String(error.stack||error);console.error(error);process.exitCode=1;await shot('loadout-opening-failure').catch(()=>{});}
finally{await mouse(0,false).catch(()=>{});await mouse(2,false).catch(()=>{});report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'loadout-opening-report.json'),JSON.stringify(report,null,2));await browser.close();}
