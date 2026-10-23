import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});
const report={passed:false,errors:[],checks:[]};
try{
  for(const dpr of [1,2]){
    const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:dpr});
    const page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    await page.goto('http://127.0.0.1:5174/?qa=1');
    await page.waitForFunction(()=>window.__game,{timeout:120000});
    let render=await page.evaluate(()=>window.__game.getState().render);
    assert.equal(render.quality,'high');assert.equal(render.width,1280*dpr);assert.equal(render.height,720*dpr);
    await page.locator('[data-action=settings]').click();
    await page.locator('[data-setting=quality]').selectOption('low');
    render=await page.evaluate(()=>window.__game.getState().render);
    assert.equal(render.width,1280*dpr,'shadow quality never silently lowers resolution');
    await page.locator('[data-setting=renderScale]').selectOption('1.5');
    render=await page.evaluate(()=>window.__game.getState().render);
    assert.equal(render.width,1920*dpr);assert.equal(render.height,1080*dpr);
    assert.match(await page.locator('#render-resolution').textContent(),new RegExp(`${1920*dpr} × ${1080*dpr}`));
    await page.locator('[data-setting=renderScale]').selectOption('1');
    await page.locator('[data-setting=quality]').selectOption('high');
    await page.setViewportSize({width:960,height:600});
    await page.waitForFunction((ratio)=>window.__game.getState().render.width===960*ratio,dpr);
    const bounds=await page.locator('[data-action=back]').boundingBox();
    assert.ok(bounds.y>=0&&bounds.y+bounds.height<=600,'settings save button fits minimum window');
    if(dpr===1)await page.screenshot({path:'artifacts/resolution-settings.png'});
    await page.reload();await page.waitForFunction(()=>window.__game,{timeout:120000});
    assert.equal((await page.evaluate(()=>window.__game.getState().render)).renderScale,1);
    report.checks.push({dpr,native:true,qualityIndependent:true,supersampling:true,resize:true,minWindow:true,persisted:true});
    await context.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;console.log('RESOLUTION PASS');
}catch(e){report.failure=String(e.stack||e);console.error(e);process.exitCode=1;}
finally{await fs.writeFile('artifacts/resolution-test.json',JSON.stringify(report,null,2));await browser.close();}
