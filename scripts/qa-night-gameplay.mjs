import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {blocked,lineBlocked} from '../src/simulation.js';

const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const args=process.argv.slice(2),option=name=>{const direct=args.find(a=>a.startsWith(name+'='));return direct?direct.slice(name.length+1):args.includes(name)?args[args.indexOf(name)+1]:undefined;};
const baseURL=option('--base-url')||args.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:5175';
const expected=option('--expected-build'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.resolve('artifacts/release-v0.6/night',stamp);await fs.mkdir(out,{recursive:true});
const report={baseURL,expectedBuild:expected||null,started:new Date().toISOString(),viewport:{width:1280,height:800,deviceScaleFactor:1},passed:null,logicPassed:false,visualPassed:null,errors:[],chapters:[],captures:[],checks:[],visualReview:'Pending human/agent inspection; luminance is descriptive, not a pass threshold.'};
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
const state=()=>page.evaluate(()=>({game:__game.getState(),flashlight:__game.inspect().flashlight,lighting:__game.inspect().lighting,smoke:__game.inspect().smoke}));
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const key=code=>page.evaluate(code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,key:code.slice(3).toLowerCase(),bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,key:code.slice(3).toLowerCase(),bubbles:true}));},code);
async function setQuality(quality){await page.evaluate(quality=>__game.action('setting',{key:'quality',value:quality}),quality);await frames();const s=await state();assert.equal(s.flashlight.quality,quality);assert.equal(s.flashlight.castShadow,true);assert.equal(s.flashlight.shadowMapSize,quality==='high'?1024:quality==='medium'?512:256);}
async function setLight(enabled){const s=await state();if(s.flashlight.enabled!==enabled)await key('KeyT');await page.waitForFunction(enabled=>__game.inspect().flashlight.enabled===enabled,enabled);await frames();}
async function luminance(file){
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const region={left:Math.round(info.width*.25),top:Math.round(info.height*.25),width:Math.round(info.width*.5),height:Math.round(info.height*.5)};
 const values=[];let sum=0,squares=0,min=255,max=0;for(let y=region.top;y<region.top+region.height;y++)for(let x=region.left;x<region.left+region.width;x++){const i=(y*info.width+x)*3,value=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;values.push(value);sum+=value;squares+=value*value;min=Math.min(min,value);max=Math.max(max,value);}values.sort((a,b)=>a-b);const mean=sum/values.length;
 return{region,scale:'0–255 display luminance; no acceptance threshold',mean,stddev:Math.sqrt(squares/values.length-mean*mean),min,max,p10:values[Math.floor(values.length*.10)],median:values[Math.floor(values.length*.50)],p90:values[Math.floor(values.length*.90)],p99:values[Math.floor(values.length*.99)]};
}
async function capture(name){
 const s=await state();assert.equal(s.game.render.width,1280,'Actual canvas must use native width');assert.equal(s.game.render.height,800,'Actual canvas must use native height');
 const screenshot=path.join(out,name+'.png'),canvasFile=path.join(out,name+'-canvas.png');await page.screenshot({path:screenshot});
 // Capture the WebGL buffer after the game's RAF draw, before presentation clears it.
 // An element screenshot would still include DOM HUD overlays covering the canvas.
 const dataURL=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(document.getElementById('game').toDataURL('image/png')))));
 await fs.writeFile(canvasFile,Buffer.from(dataURL.split(',')[1],'base64'));
 const entry={name,screenshot:path.relative(process.cwd(),screenshot),canvas:path.relative(process.cwd(),canvasFile),...s,luminance:await luminance(canvasFile)};report.captures.push(entry);return entry;
}
function wallView(spawn,colliders){
 const candidates=[];for(const b of colliders){const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;if(Math.hypot(cx-spawn.x,cz-spawn.z)>24)continue;for(const p of[{x:b.minX-2.8,z:cz,tx:b.minX,tz:cz},{x:b.maxX+2.8,z:cz,tx:b.maxX,tz:cz},{x:cx,z:b.minZ-2.8,tx:cx,tz:b.minZ},{x:cx,z:b.maxZ+2.8,tx:cx,tz:b.maxZ}])if(!blocked(p.x,p.z,colliders,.45)&&!lineBlocked(spawn,p,colliders))candidates.push({...p,distance:Math.hypot(p.x-spawn.x,p.z-spawn.z),box:b});}return candidates.sort((a,b)=>a.distance-b.distance)[0]||null;
}
try{
 await page.goto(new URL('?qa=1',baseURL).href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__game,{timeout:180000});
 const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));report.scripts=scripts;report.build=scripts.find(s=>/index-[\w-]+\.js/.test(s))?.split('/').pop()||'development';
 if(expected)assert.equal(report.build,expected.endsWith('.js')?expected:expected.startsWith('index-')?expected+'.js':`index-${expected}.js`,'Serving the requested production build');
 await page.evaluate(()=>{__game.action('setting',{key:'renderScale',value:1});__game.action('setting',{key:'headbob',value:false});__game.action('setting',{key:'gentle',value:true});});
 for(const index of[10,11,12]){
  await page.evaluate(index=>{__game.loadChapter(index);__game.action('play');},index);await frames();assert.equal((await state()).flashlight.enabled,false,'Chapter begins with torch off');await setQuality('high');
  const before=await capture(`chapter-${index+1}-high-off`);await setLight(true);const after=await capture(`chapter-${index+1}-high-on`);
  assert.deepEqual([after.game.player.x,after.game.player.z,after.game.player.yaw,after.game.player.pitch],[before.game.player.x,before.game.player.z,before.game.player.yaw,before.game.player.pitch],'Off/on camera anchor unchanged');
  const chapterReport={chapter:index+1,unarmed:index===10,spawn:[before.game.player.x,before.game.player.z],offMean:before.luminance.mean,onMean:after.luminance.mean};
  for(const quality of['medium','low']){await setQuality(quality);await capture(`chapter-${index+1}-${quality}-on`);}await setQuality('high');
  if(index===11){
   for(const [id,code]of[['m249','Digit2'],['m4a1','Digit6']]){
    await key(code);await page.waitForFunction(id=>__game.getState().player.weaponId===id,id,{timeout:15000});await frames();
    // Let the actual reload finish after selecting an initially empty weapon.
    await page.waitForFunction(()=>!document.getElementById('weapon-label').textContent.includes('装填中'),undefined,{timeout:20000});await frames();await capture(`chapter-12-${id}-hip-on`);
    await page.evaluate(()=>document.getElementById('game').dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true})));await page.waitForFunction(()=>__game.getState().render.fov<49,undefined,{timeout:10000});await frames();await capture(`chapter-12-${id}-ads-on`);
    await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true})));await page.waitForFunction(()=>__game.getState().render.fov>72,undefined,{timeout:10000});
   }
  }
  await page.evaluate(()=>__game.pause());await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',repeat:true,bubbles:true})));assert.equal((await state()).game.mode,'paused','Repeated Escape does not resume a paused game');await key('KeyT');assert.equal((await state()).flashlight.enabled,false,'Paused light stays off');await page.evaluate(()=>__game.action('resume'));await frames();assert.equal((await state()).flashlight.enabled,true,'T while paused does not alter remembered toggle');
  await page.evaluate(index=>{__game.loadChapter(index);__game.action('play');},index);await frames();assert.equal((await state()).flashlight.enabled,false,'Reopening chapter resets light');
  await setLight(true);await page.evaluate(()=>__game.action('menu'));await key('KeyT');await frames();assert.equal((await state()).flashlight.enabled,false,'Menu disables light and ignores T');
  report.chapters.push(chapterReport);report.checks.push(`Chapter ${index+1}: native off/on captures; high/medium/low; repeated Escape and T ignored while paused; chapter and menu reset`);
 }
 await page.evaluate(()=>{__game.loadChapter(10);__game.action('play');});await frames();const initial=await state(),colliders=await page.evaluate(()=>__game.inspect().staticColliders),wall=wallView(initial.game.player,colliders);assert.ok(wall,'A legal nearby position facing an actual wall exists');report.wall=wall;
 await page.evaluate(p=>{__game.teleport(p.x,p.z);__game.lookAt(p.tx,1.05,p.tz);},wall);await setQuality('high');await capture('wall-high-off');await setLight(true);await capture('wall-high-on');for(const q of['medium','low']){await setQuality(q);await capture(`wall-${q}-on`);}report.checks.push('Legal wall-facing captures taken for actual scene shadow review');
 // Let genuine squad AI clear the chapter-13 spawn before judging navigation.
 // Walk through the normal key handler; do not teleport to improve the lighting.
 await page.evaluate(()=>{__game.loadChapter(12);__game.action('play');});await setQuality('high');await setLight(true);
 let startTime=await page.evaluate(()=>__game.behaviorSnapshot().time);await page.waitForFunction(t=>__game.behaviorSnapshot().time>=t+3,startTime,{timeout:30000});await capture('chapter-13-high-after-wait');
 const walkStart=(await state()).game.player;startTime=await page.evaluate(()=>__game.behaviorSnapshot().time);
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w',bubbles:true})));await page.waitForFunction(t=>__game.behaviorSnapshot().time>=t+2,startTime,{timeout:30000});await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w',bubbles:true})));await frames();
 const walked=await capture('chapter-13-high-after-walk'),walkDistance=Math.hypot(walked.game.player.x-walkStart.x,walked.game.player.z-walkStart.z);assert.ok(walkDistance>1,'Two seconds of real W input advances along a legal road');report.chapter13Navigation={start:[walkStart.x,walkStart.z],end:[walked.game.player.x,walked.game.player.z],distance:walkDistance};
 await setLight(false);await capture('chapter-13-walk-off');await setLight(true);await capture('chapter-13-walk-on');
 const player=(await state()).game.player,nearWall=colliders.map(b=>({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2})).sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0];
 await page.evaluate(p=>__game.lookAt(p.x,1.05,p.z),nearWall);await frames();await capture('chapter-13-turn-wall-on');report.checks.push('Chapter 13: actual squad settles for three game seconds; two seconds of real W movement; off/on and wall look without teleport');
 assert.equal(await page.evaluate(()=>document.pointerLockElement),null);assert.deepEqual(report.errors,[]);report.logicPassed=true;console.log(JSON.stringify({out,build:report.build,logicPassed:true,visualReview:'pending',errors:report.errors,chapters:report.chapters}));
}catch(error){report.failure=String(error.stack||error);console.error(report.failure);process.exitCode=1;}finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
