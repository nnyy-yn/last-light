import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {SETTINGS_KEY} from '../src/simulation.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const expectedBuild=option('--expected-build'),expectedSha256=option('--expected-sha256'),returnOnly=args.includes('--return-only'),clearance=args.includes('--clearance');
const baseURL=process.argv.find(v=>/^https?:/.test(v))||'http://127.0.0.1:5175/';
const output=path.join(root,'artifacts/rebuild-v0.7/convoy-dynamic',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const require=createRequire(import.meta.url);
let playwright;
try { playwright=require('playwright'); }
catch { playwright=require(path.join(process.env.USERPROFILE || process.env.HOME || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const {chromium}=playwright;
const report={passed:false,baseURL,expectedBuild,expectedSha256,headless:true,methods:'Actual director scenes in the game, normal elapsed time; QA chapter selection and playSequence, no desktop input or pointer lock',errors:[],consoleErrors:[],httpErrors:[],scenes:[]};
const browser=await chromium.launch({...(process.env.LAST_LIGHT_CHROME_PATH ? {executablePath:process.env.LAST_LIGHT_CHROME_PATH} : process.platform==='win32' ? {executablePath:path.join(process.env.ProgramFiles || 'C:/Program Files','Google/Chrome/Application/chrome.exe')} : {}),headless:true,args:['--mute-audio','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(120000);
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()});});
await page.route('**/@vite/client',r=>r.fulfill({status:200,contentType:'text/javascript',body:`
export const createHotContext=()=>({data:{},accept(){},dispose(){},prune(){},on(){},off(){},invalidate(){}});
export const injectQuery=(url)=>url;
export function updateStyle(id,content){let el=document.getElementById(id);if(!el){el=document.createElement('style');el.id=id;document.head.appendChild(el)}el.textContent=content}
export function removeStyle(id){document.getElementById(id)?.remove()}
`}));
await page.addInitScript(({key})=>localStorage.setItem(key,JSON.stringify({graphicsVersion:2,quality:'high',renderScale:1,gentle:true,headbob:false,volume:0,aircraftVolume:0,battleVolume:0,sensitivity:1})),{key:SETTINGS_KEY});
const snapshot=()=>page.evaluate(()=>({state:__game.getState(),cinematic:__game.inspect().cinematic,locked:Boolean(document.pointerLockElement)}));
const key=(code,down)=>page.evaluate(({code,down})=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,key:code.slice(3).toLowerCase(),bubbles:true,repeat:false})),{code,down});
async function waitTime(target,ambient=false){const until=Date.now()+180000;let s;while(Date.now()<until){s=await snapshot();assert.equal(s.locked,false);assert.equal(s.cinematic.active,true);if((ambient?s.cinematic.ambientTime:s.cinematic.time)>=target)return s;await page.waitForTimeout(100);}throw new Error('Cinematic frame timeout '+JSON.stringify(s?.cinematic));}
async function waitProgress(predicate){const until=Date.now()+120000;while(Date.now()<until){const s=await snapshot();assert.equal(s.locked,false);assert.equal(s.cinematic.active,true);if(predicate(s.cinematic.playerAction))return s;await page.waitForTimeout(100);}throw new Error('Actual withdrawal input did not advance');}
try{
  await page.goto(baseURL+'?qa=1');await page.waitForFunction(()=>window.__game&&document.querySelector('[data-action="combat-demo"]'));
  if(expectedBuild){const src=await page.evaluate(()=>Array.from(document.scripts,s=>s.src).find(s=>/\/assets\/index-[\w-]+\.js$/.test(s)));assert.ok(src?.endsWith('/'+expectedBuild),'Loaded production script must match expected bundle');const response=await page.request.get(src);assert.equal(response.ok(),true);const bytes=await response.body(),sha256=createHash('sha256').update(bytes).digest('hex');if(expectedSha256)assert.equal(sha256,expectedSha256);report.build={url:src,sha256,bytes:bytes.length};}
  const scenes=returnOnly?[{id:8,phase:'closing',count:9,frames:[1,10,20.5]}]:clearance?[{id:5,phase:'opening',count:12,frames:[1,6]},{id:8,phase:'opening',count:9,frames:[4,11]},{id:8,phase:'closing',count:9,frames:[1,10,20.5]},{id:15,phase:'opening',count:12,frames:[4],ambient:true},{id:16,phase:'opening',count:12,frames:[1,7]}]:[{id:5,phase:'opening',count:12,frames:[1,6]},{id:5,phase:'closing',count:3,frames:[3]},{id:8,phase:'opening',count:9,frames:[4,11]},{id:13,phase:'opening',count:12,frames:[2,7]},{id:13,phase:'closing',count:12,frames:[3]},{id:15,phase:'opening',count:12,frames:[4],ambient:true}];
  for(const spec of scenes){
    await page.evaluate(({id,phase})=>{__game.loadChapter(id-1);__game.playSequence(phase);},spec);
    const record={...spec,samples:[]};report.scenes.push(record);
    for(const at of spec.frames){const s=await waitTime(at,spec.ambient);assert.equal(s.cinematic.convoy.vehicles.length,spec.count);assert.ok(s.cinematic.convoy.crew.filter(c=>c.visible).length>=3,'near drivers and crew must be present');
      record.samples.push(s);const file=`chapter-${spec.id}-${spec.phase}-${at}s.png`;await page.screenshot({path:path.join(output,file)});record.samples.at(-1).screenshot=file;console.log(`captured ${file}: ${spec.count} vehicles, ${s.state.render.calls} calls`);
    }
    if(clearance&&spec.id===15){const initial=await snapshot();await key('KeyW',true);let forward;try{forward=await waitProgress(a=>a.progress>=.35);}finally{await key('KeyW',false);}await page.screenshot({path:path.join(output,'chapter-15-forward.png')});await key('KeyS',true);let back;try{back=await waitProgress(a=>a.progress<=.15);}finally{await key('KeyS',false);}await page.screenshot({path:path.join(output,'chapter-15-back.png')});assert.ok(forward.cinematic.playerAction.position[2]<initial.cinematic.playerAction.position[2]-3);assert.ok(back.cinematic.playerAction.position[2]>forward.cinematic.playerAction.position[2]+1);record.withdrawal={method:'Actual DOM W then S, no time/progress edits',initial,forward,back};}
    await page.evaluate(()=>__game.pause());const paused=await snapshot();await page.waitForTimeout(350);assert.deepEqual((await snapshot()).cinematic.convoy,paused.cinematic.convoy);record.pauseFrozen=true;
    if((returnOnly||clearance)&&spec.id===8&&spec.phase==='closing'){assert.ok(record.samples.at(-1).cinematic.convoy.vehicles[0].position[2]-record.samples[0].cinematic.convoy.vehicles[0].position[2]>35,'The lead vehicle must return through the last junction');await page.locator('[data-action="resume"]').evaluate(el=>el.click());await page.waitForFunction(()=>!window.__game.inspect().cinematic.active);const completed=await snapshot();assert.equal(completed.cinematic.owned.objects,0);record.naturalCompletion={mode:completed.state.mode,owned:completed.cinematic.owned};}
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.httpErrors,[]);report.passed=true;
}catch(error){report.failure=String(error?.stack||error);try{report.failureState=await snapshot();await page.screenshot({path:path.join(output,'failure.png')});}catch{}throw error;
}finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log('convoy report: '+path.join(output,'report.json'));}
