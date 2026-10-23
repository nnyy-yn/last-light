import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
await page.goto((process.argv[2]||'http://127.0.0.1:5173/')+'?qa=1');await page.waitForFunction(()=>window.__game,{timeout:90000});
await page.getByRole('button',{name:'人物与装备'}).click();await page.waitForTimeout(1800);await page.screenshot({path:'artifacts/soldier-full.png'});
await page.getByRole('button',{name:'查看面部与衣着'}).click();await page.waitForTimeout(700);await page.screenshot({path:'artifacts/soldier-portrait.png'});
await page.getByRole('button',{name:'城市居民',exact:true}).click();await page.waitForTimeout(700);await page.screenshot({path:'artifacts/civilian-portrait.png'});
await page.getByRole('button',{name:'查看全身'}).click();await page.waitForTimeout(700);await page.screenshot({path:'artifacts/civilian-full.png'});
await page.getByRole('button',{name:'返回主菜单'}).click();await page.screenshot({path:'artifacts/title-final.png'});
await page.evaluate(()=>window.__game.loadChapter(5));await page.getByRole('button',{name:'进入现场'}).click();await page.waitForTimeout(1000);await page.screenshot({path:'artifacts/combat-final.png'});
await page.keyboard.press('Escape');await page.evaluate(()=>window.__game.loadChapter(11));await page.getByRole('button',{name:'进入现场'}).click();await page.waitForTimeout(800);await page.screenshot({path:'artifacts/night-final.png'});
await page.keyboard.press('Escape');await page.setViewportSize({width:960,height:600});await page.screenshot({path:'artifacts/pause-960.png'});
console.log('VISUAL',await page.evaluate(()=>window.__game.getState().render),'ERRORS',errors);await fs.writeFile('artifacts/visual-test.json',JSON.stringify({passed:errors.length===0,errors},null,2));
}finally{await browser.close();}
