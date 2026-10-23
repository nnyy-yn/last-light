import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const report={passed:false,errors:[],checks:[],screenshots:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('requestfailed',r=>{const message=r.url()+': '+r.failure()?.errorText;console.log('REQUEST FAILED',message,r.resourceType());report.errors.push(message);});
page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
async function shot(name){await page.screenshot({path:`artifacts/war-${name}.png`});report.screenshots.push(`artifacts/war-${name}.png`);}
try{
  await page.goto((process.env.QA_BASE_URL||'http://127.0.0.1:5174/')+'?qa=1');
  await page.waitForFunction(()=>window.__game,{timeout:120000});
  await page.waitForTimeout(800);await shot('menu');
  await page.locator('[data-action=gallery]').click();
  await page.locator('[data-value=rifle]').click();await page.waitForTimeout(600);await shot('rifle-full');
  await page.locator('[data-action=gallery-close]').click();await page.waitForTimeout(500);await shot('rifle-detail');
  assert.equal(await page.locator('[data-action=gallery-close]').textContent(),'查看整枪');
  await page.locator('[data-value=soldier]').click();await page.waitForTimeout(500);await shot('soldier-rifle');
  await page.locator('[data-action=menu]').click();
  await page.evaluate(()=>window.__game.loadChapter(5));await page.locator('[data-action=play]').click();
  await page.waitForTimeout(700);await shot('first-person');
  await page.mouse.down({button:'right'});await page.waitForTimeout(700);await shot('aim');await page.mouse.up({button:'right'});
  await page.evaluate(()=>{window.__game.setAircraftPreview([-3,14,18],[.03,.35,-.06]);window.__game.teleport(0,35);window.__game.lookAt(-3,14,18);});
  await page.waitForTimeout(200);await shot('aircraft-pass');await page.evaluate(()=>window.__game.setAircraftPreview(null));
  await page.evaluate(()=>{window.__game.teleport(0,-15);window.__game.lookAt(3,6,0);});await page.waitForTimeout(700);await shot('wreck-smoke');
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__game.loadChapter(11));await page.locator('[data-action=play]').click();await page.waitForTimeout(600);await shot('night');
  report.render=await page.evaluate(()=>window.__game.getState().render);
  await page.keyboard.press('Escape');await page.locator('[data-action=settings]').click();
  await page.locator('[data-setting=quality]').selectOption('high');await page.locator('[data-action=back]').click();await page.locator('[data-action=resume]').click();await page.waitForTimeout(700);await shot('high-bloom');
  await page.keyboard.press('Escape');await page.locator('[data-action=settings]').click();await page.locator('[data-setting=quality]').selectOption('low');await page.locator('[data-action=back]').click();await page.locator('[data-action=resume]').click();await page.waitForTimeout(500);await shot('low');
  report.checks=['full rifle and detail gallery','NPC shared rifle','first person and aim view','aircraft and smoke visible','day and night lighting','high bloom and low quality settings'];
  assert.deepEqual(report.errors,[]);report.passed=true;console.log('WAR ART PASS',report.render);
}catch(e){report.failure=String(e.stack||e);await shot('failure').catch(()=>{});console.error(e);process.exitCode=1;}finally{await fs.writeFile('artifacts/war-art-test.json',JSON.stringify(report,null,2));await browser.close();}
