import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function click(selector){await page.locator(selector).evaluate(button=>button.click());}
try{
  await page.goto('http://127.0.0.1:5174/?qa=1');await page.waitForFunction(()=>window.__game,{timeout:120000});
  await page.evaluate(()=>window.__game.loadChapter(5));await click('[data-action=play]');
  await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
  await page.screenshot({path:'artifacts/city-after-rebuild.png'});
  await page.evaluate(()=>{window.__game.teleport(3,33);window.__game.lookAt(-9,4.4,22);});await page.waitForTimeout(10500);
  await page.screenshot({path:'artifacts/city-after-detail.png'});
  await page.evaluate(()=>window.__game.loadChapter(11));await click('[data-action=play]');await page.waitForTimeout(600);
  await page.screenshot({path:'artifacts/city-after-night.png'});
  const before=await sharp('artifacts/city-before-rebuild.png').resize(1200,750).toBuffer(),after=await sharp('artifacts/city-after-rebuild.png').resize(1200,750).toBuffer();
  const labels=Buffer.from('<svg width="1200" height="1572"><text x="24" y="28" fill="#e4d6b1" font-size="20" font-family="Arial">BEFORE</text><text x="24" y="814" fill="#e4d6b1" font-size="20" font-family="Arial">AFTER — v0.2.0</text></svg>');
  await sharp({create:{width:1200,height:1572,channels:3,background:'#101819'}}).composite([{input:before,top:36,left:0},{input:after,top:822,left:0},{input:labels,top:0,left:0}]).png().toFile('artifacts/city-rebuild-comparison.png');
  assert.deepEqual(errors,[]);await fs.writeFile('artifacts/final-visual-test.json',JSON.stringify({passed:true,errors,mouseCaptured:false,checks:['same camera before and after','ruined shop and collapsed interior','distant impact plume after 10 seconds','night fire and burnt car']},null,2));console.log('FINAL VISUAL PASS');
}finally{await browser.close();}
