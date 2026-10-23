import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {PLAYER_WEAPON_IDS, WEAPON_DEFINITIONS} from '../src/weapon.js';
import {INITIAL_RESOURCES} from '../src/story.js';

// Final-build-only gameplay verification. All input is dispatched inside a
// headless page. No desktop input, focus, pointer lock, resource edits, game
// time scaling, AI injection, or hidden replacement of the rendered models.
// Usage: node scripts/qa-six-weapons.mjs http://127.0.0.1:5174/ --expected-build index-HASH.js
const args=process.argv.slice(2),flag=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const expectedBuild=flag('--expected-build');
assert.match(expectedBuild||'',/^index-[A-Za-z0-9_-]+\.js$/,'Pass the approved final JS filename with --expected-build; this script must not silently test an old build.');
const base=new URL(args.find(value=>/^https?:/.test(value))||'http://127.0.0.1:5174/');
assert.ok(['127.0.0.1','localhost'].includes(base.hostname),'Only a local game server is permitted.');base.searchParams.set('qa','1');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.join(root,'artifacts','release-v0.6','weapons',`${expectedBuild.replace(/\.js$/,'')}-${stamp}`);await fs.mkdir(out,{recursive:true});
assert.deepEqual([...PLAYER_WEAPON_IDS],['m16a2','m249','ak','mp5','m1911','m4a1'],'The approved six-slot order must match the runtime catalog.');
const definitions=Object.fromEntries(PLAYER_WEAPON_IDS.map(id=>[id,{...WEAPON_DEFINITIONS[id]}]));
const report={passed:false,startedAt:new Date().toISOString(),url:base.href,expectedBuild,catalog:definitions,slots:[...PLAYER_WEAPON_IDS],headless:true,input:'DOM clicks and synthetic in-page keyboard/mouse/wheel events only',gameTimePolicy:'Real frame loop; no simulation acceleration',initialBudget:INITIAL_RESOURCES.ammo,weapons:[],wheel:[],screenshots:[],errors:[],requestFailures:[]};
report.sourceSha256=createHash('sha256').update(await fs.readFile(path.join(root,'src/weapon.js'))).digest('hex');
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({executablePath:process.env.QA_CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.setDefaultTimeout(60000);
page.on('pageerror',error=>report.errors.push(`JS: ${error}`));
page.on('console',message=>{if(message.type()==='error')report.errors.push(`Console: ${message.text()}`);});
page.on('response',response=>{if(response.status()>=400)report.errors.push(`HTTP ${response.status()}: ${response.url()}`);});
page.on('requestfailed',request=>report.requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const click=selector=>page.locator(selector).evaluate(element=>element.click());
async function key(code){await page.evaluate(code=>{const key=code.startsWith('Digit')?code.slice(5):code.startsWith('Key')?code.slice(3).toLowerCase():code;for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key,code,bubbles:true}));},code);}
async function mouse(button,down){await page.evaluate(({button,down})=>(down?document.getElementById('game'):window).dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button,buttons:down?(button===2?2:1):0,bubbles:true})),{button,down});}
const wheel=deltaY=>page.evaluate(deltaY=>document.getElementById('game').dispatchEvent(new WheelEvent('wheel',{deltaY,bubbles:true,cancelable:true})),deltaY);
async function read(){
  const result=await page.evaluate(()=>({state:window.__game.getState(),time:window.__game.behaviorSnapshot().time,hud:document.getElementById('weapon-label').textContent,pointer:!!document.pointerLockElement,fullscreen:!!document.fullscreenElement}));
  assert.equal(result.pointer,false,'QA must never lock the pointer.');assert.equal(result.fullscreen,false,'QA must never request fullscreen.');
  return result;
}
function ledger(sample){
  const state=sample.state||sample,magazines={...state.stowedMagazines,[state.player.weaponId]:state.player.mag};
  assert.deepEqual(Object.keys(state.stowedMagazines).sort(),[...PLAYER_WEAPON_IDS].sort());
  assert.equal(state.stowedMagazines[state.player.weaponId],0,'The active magazine cannot also be counted as stowed.');
  for(const id of PLAYER_WEAPON_IDS){assert.ok(Number.isInteger(magazines[id])&&magazines[id]>=0&&magazines[id]<=definitions[id].magSize,`${id} magazine must be within its capacity.`);}
  assert.ok(Number.isInteger(state.resources.ammo)&&state.resources.ammo>=0);
  return{weaponId:state.player.weaponId,active:state.player.mag,magazines,reserve:state.resources.ammo,total:state.resources.ammo+Object.values(magazines).reduce((a,b)=>a+b,0)};
}
async function waitGame(seconds){
  const start=(await read()).time,deadline=Date.now()+Math.max(60000,seconds*30000);
  while(Date.now()<deadline){const sample=await read();assert.equal(sample.state.mode,'playing',`Expected active chapter while waiting ${seconds} game seconds.`);if(sample.time-start>=seconds)return sample;await sleep(55);}
  throw new Error(`Real frame loop did not advance ${seconds}s within the deadline.`);
}
async function screenshot(name){const file=path.join(out,`${name}.png`);await page.screenshot({path:file});report.screenshots.push(file);return file;}
async function stableCamera(sample){
  const p=sample.state.player;
  await page.evaluate(p=>window.__game.lookAt(p.x-Math.sin(p.yaw)*25,p.y+Math.tan(p.pitch)*25,p.z-Math.cos(p.yaw)*25),p);
  await waitGame(.65);
}
async function waitLoading(id,before,reason){
  const startTime=(await read()).time;
  await page.waitForFunction(id=>window.__game.getState().player.weaponId===id&&document.getElementById('weapon-label').textContent.includes('装填中'),id,{timeout:15000});
  const during=await read();assert.equal(during.state.player.mag,before.active,'Rounds are transferred when loading finishes, not at its start.');
  await mouse(0,true);await waitGame(.18);await mouse(0,false);
  assert.equal((await read()).state.player.mag,before.active,'Firing is blocked during a real reload window.');
  await page.waitForFunction(id=>window.__game.getState().player.weaponId===id&&!document.getElementById('weapon-label').textContent.includes('装填中'),id,{timeout:90000});
  const afterSample=await read(),after=ledger(afterSample),count=Math.min(definitions[id].magSize-before.active,before.reserve);
  assert.equal(after.active,before.active+count);assert.equal(after.reserve,before.reserve-count);assert.equal(after.total,before.total,'Loading must only transfer shared reserve rounds.');
  assert.ok(afterSample.time-startTime>=definitions[id].reloadTime-.18,'Reload must consume the catalog duration at normal simulation speed.');
  return{reason,before,after,observedGameSeconds:afterSample.time-startTime,hudDuring:during.hud};
}
async function selectSlot(id,record){
  const beforeSample=await read(),before=ledger(beforeSample),slot=PLAYER_WEAPON_IDS.indexOf(id)+1;
  await key(`Digit${slot}`);const selectedSample=await read(),selected=ledger(selectedSample);assert.equal(selected.weaponId,id,`Digit${slot} should select ${id}.`);
  assert.equal(selected.total,before.total,'Slot selection must conserve the ammunition ledger.');
  if(before.weaponId!==id&&selected.active===0&&selected.reserve>0)record?.reloads.push(await waitLoading(id,selected,'automatic loading after slot selection'));
  await waitGame(.4);return read();
}
async function startFreshDemo(){
  const current=await read();
  if(current.state.mode!=='menu'){if(current.state.mode==='playing')await key('Escape');await click('[data-action="menu"]');}
  await click('[data-action="combat-demo"]');assert.equal((await read()).state.chapter,6);await click('[data-action="play"]');
  const sample=await waitGame(.15),initial=ledger(sample);
  assert.equal(initial.weaponId,PLAYER_WEAPON_IDS[0]);assert.equal(initial.total,INITIAL_RESOURCES.ammo,'Each weapon starts with a fresh, normal narrative ammunition budget.');
  assert.equal(initial.active,Math.min(definitions[PLAYER_WEAPON_IDS[0]].magSize,INITIAL_RESOURCES.ammo));
  return sample;
}
async function holdFire(id,seconds){
  const original=await read(),before=ledger(original),p=original.state.player;
  // Fire into the nearby road. This exercises normal trigger/raycast/recoil
  // handlers without depending on a random moving enemy staying in the sights.
  await page.evaluate(p=>window.__game.lookAt(p.x,.25,p.z-7),p);
  await mouse(0,true);let middle,after;
  try{middle=await waitGame(seconds);after=await waitGame(.5);}finally{await mouse(0,false);}
  const result=ledger(after),spent=before.active-result.active,definition=definitions[id];
  assert.equal(before.total-result.total,spent,'Each fired round must leave the conserved ledger exactly once.');assert.ok(spent>0,`${id} must really fire.`);
  if(definition.fireMode==='burst'){assert.equal(spent,definition.burstCount);assert.equal(middle.state.player.mag,after.state.player.mag,'A held burst trigger must not start another burst.');}
  else if(definition.fireMode==='semi'){assert.equal(spent,1);assert.equal(middle.state.player.mag,after.state.player.mag,'A held semiautomatic trigger must fire only once.');}
  else{assert.ok(spent>=4,'Automatic weapons must continue firing while held.');assert.ok(after.state.player.mag<middle.state.player.mag,'Automatic fire must continue during the extra held interval.');}
  await stableCamera(original);return{before,after:result,spent,heldGameSeconds:after.time-original.time,mode:definition.fireMode};
}
async function validateAssetFailures(){
  report.assetRecovery=[];
  for(const failure of report.requestFailures){
    if(failure.error!=='net::ERR_ABORTED'||!failure.url.match(/\.glb(?:\?|$)/)){report.errors.push(`Request: ${failure.url} ${failure.error}`);continue;}
    if(report.assetRecovery.some(result=>result.url===failure.url))continue;
    const result=await page.evaluate(async url=>{try{const response=await fetch(url),bytes=await response.arrayBuffer(),data=new DataView(bytes);return{url,bytes:bytes.byteLength,valid:response.ok&&bytes.byteLength>=12&&data.getUint32(0,true)===0x46546c67&&data.getUint32(4,true)===2&&data.getUint32(8,true)===bytes.byteLength};}catch(error){return{url,valid:false,error:String(error)};}},failure.url);
    report.assetRecovery.push(result);if(!result.valid)report.errors.push(`Unrecovered GLB: ${failure.url}`);
  }
}

try{
  await page.goto(base.href);await page.waitForFunction(()=>window.__game,{timeout:180000});
  report.servedScripts=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(node=>node.src));
  assert.ok(report.servedScripts.some(url=>new URL(url).pathname.endsWith('/'+expectedBuild)),`Server must contain ${expectedBuild}; got ${report.servedScripts.join(', ')}.`);
  const bundle=await page.request.get(report.servedScripts.find(url=>new URL(url).pathname.endsWith('/'+expectedBuild)));assert.ok(bundle.ok());report.bundleSha256=createHash('sha256').update(await bundle.body()).digest('hex');
  await click('[data-action="settings"]');
  for(const [name,value] of Object.entries({quality:'high',renderScale:'1'}))await page.locator(`[data-setting="${name}"]`).evaluate((element,value)=>{element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));},value);
  for(const name of ['gentle','headbob'])await page.locator(`[data-setting="${name}"]`).evaluate((element,value)=>{element.checked=value;element.dispatchEvent(new Event('input',{bubbles:true}));},name==='gentle');
  await page.locator('[data-setting="volume"]').evaluate(element=>{element.value='0';element.dispatchEvent(new Event('input',{bubbles:true}));});await click('[data-action="back"]');
  await click('[data-action="new"]');if((await read()).state.mode==='confirm')await click('[data-action="confirm-new"]');
  await page.evaluate(()=>window.__game.action('menu'));const campaignSave=(await read()).state.saved;assert.ok(campaignSave,'Create a real campaign checkpoint before entering the demonstration.');

  for(const id of PLAYER_WEAPON_IDS){
    const record={id,slot:PLAYER_WEAPON_IDS.indexOf(id)+1,definition:definitions[id],reloads:[],roundTrips:[],passed:false};report.weapons.push(record);
    const fresh=await startFreshDemo();record.initial=ledger(fresh);
    await selectSlot(id,record);const presentation=await read();assert.ok(presentation.state.player.mag>0);assert.match(presentation.hud,new RegExp(definitions[id].shortName));
    await stableCamera(fresh);record.hip=await screenshot(`${id}-hip`);
    await mouse(2,true);await waitGame(.75);record.ads=await screenshot(`${id}-ads`);await mouse(2,false);await waitGame(.5);
    record.heldFire=await holdFire(id,1.3);
    if(definitions[id].fireMode!=='auto'){
      record.secondTrigger=await holdFire(id,.85);
      assert.equal(record.secondTrigger.spent,definitions[id].fireMode==='burst'?definitions[id].burstCount:1,'Releasing and pressing the trigger must allow a new burst or semiautomatic shot.');
    }
    const beforeReload=ledger(await read());await key('KeyR');
    if(beforeReload.reserve>0&&beforeReload.active<definitions[id].magSize)record.reloads.push(await waitLoading(id,beforeReload,'R after firing'));
    else{
      await waitGame(.35);const after=ledger(await read());assert.deepEqual(after,beforeReload);assert.ok(!(await read()).hud.includes('装填中'));
      record.emptyReserveReload={before:beforeReload,after,result:'No reserve: R cannot manufacture rounds. Initial selection already verified the real reload window.'};
      assert.ok(record.reloads.length>0,'Even an empty-reserve weapon must have exercised a real reload earlier.');
    }
    // Choose a loaded alternative; only the default rifle's first round trip
    // must initially fill a pistol. After that, both magazines stay unchanged.
    const other=id===PLAYER_WEAPON_IDS[0]?'m1911':PLAYER_WEAPON_IDS[0];
    await selectSlot(other,record);const stable=ledger(await read());
    for(let round=0;round<2;round++)for(const target of [id,other]){
      await selectSlot(target,record);const current=ledger(await read());assert.deepEqual(current.magazines,stable.magazines,'Switching back and forth must retain each magazine.');assert.equal(current.reserve,stable.reserve);assert.equal(current.total,stable.total);record.roundTrips.push(current);
    }
    await selectSlot(id,record);const beforePause=await read(),pausedLedger=ledger(beforePause);await key('Escape');const pauseStart=await read();assert.equal(pauseStart.state.mode,'paused');
    await mouse(0,true);await key(`Digit${PLAYER_WEAPON_IDS.indexOf(other)+1}`);await key('KeyR');await wheel(120);await sleep(600);await mouse(0,false);
    const paused=await read();assert.deepEqual(ledger(paused),pausedLedger,'Pause must block firing, reloading and switching.');assert.equal(paused.time,pauseStart.time,'Paused simulation must remain frozen.');
    record.pause={before:pausedLedger,after:ledger(paused),frozenGameTime:paused.time};await click('[data-action="resume"]');
    await waitGame(.3);record.final=ledger(await read());record.passed=true;console.log(JSON.stringify({weapon:id,passed:true,shots:record.heldFire.spent+(record.secondTrigger?.spent||0),reloads:record.reloads.length,totalRemaining:record.final.total}));
    await key('Escape');await click('[data-action="menu"]');assert.deepEqual((await read()).state.saved,campaignSave,'Weapon demonstrations must preserve the prior campaign checkpoint.');
  }

  // Validate both wheel directions, including 6 -> 1 and 1 -> 6, with the same
  // real 90-round budget. Empty slots remain empty after reserve is exhausted.
  await startFreshDemo();let index=0;
  for(const direction of [1,-1])for(let step=0;step<PLAYER_WEAPON_IDS.length;step++){
    const before=ledger(await read());await wheel(direction*120);index=(index+direction+PLAYER_WEAPON_IDS.length)%PLAYER_WEAPON_IDS.length;
    const id=PLAYER_WEAPON_IDS[index],selected=ledger(await read());assert.equal(selected.weaponId,id);assert.equal(selected.total,before.total);
    if(selected.active===0&&selected.reserve>0)await waitLoading(id,selected,'wheel selection');
    await waitGame(.08);const after=ledger(await read());assert.equal(after.total,INITIAL_RESOURCES.ammo);report.wheel.push({direction,id,after});
  }
  assert.equal((await read()).state.player.weaponId,PLAYER_WEAPON_IDS[0]);
  await key('Escape');await click('[data-action="menu"]');assert.deepEqual((await read()).state.saved,campaignSave);report.campaignSavePreserved=true;
  await validateAssetFailures();assert.deepEqual(report.errors,[]);report.visualReviewRequired=true;report.passed=true;
  console.log(JSON.stringify({passed:true,build:expectedBuild,weapons:report.weapons.length,wheelSteps:report.wheel.length,report:path.join(out,'report.json')}));
}catch(error){report.failure=String(error.stack||error);console.error(error);process.exitCode=1;await screenshot('failure').catch(()=>{});}
finally{await mouse(0,false).catch(()=>{});await mouse(2,false).catch(()=>{});report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
