import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {_electron}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const exe=process.argv[2]||path.resolve('../shiyong-toolbox/node_modules/electron/dist/electron.exe');
const packaged=process.argv.includes('--packaged');
const profile=path.resolve('artifacts/desktop-qa-profile');await fs.mkdir(profile,{recursive:true});
const launchEnv={...process.env,LAST_LIGHT_QA_PROFILE:profile,LAST_LIGHT_QA_HIDDEN:'1'};delete launchEnv.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:exe,args:packaged?[]:[process.cwd()],env:launchEnv,timeout:60000});
const errors=[];
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 if(process.argv.includes('--visible'))await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();});
 await page.locator('.main-menu').waitFor({timeout:90000});await page.screenshot({path:packaged?'artifacts/desktop-packaged.png':'artifacts/desktop-preview.png'});
 assert.equal(await page.title(),'归途 · LAST LIGHT');
 await page.getByRole('button',{name:'开始新的战役'}).click();if(await page.getByRole('button',{name:'开始新的战役'}).count())await page.getByRole('button',{name:'开始新的战役'}).click();
 await page.getByRole('button',{name:'进入现场'}).click();await page.waitForTimeout(1000);assert.ok(await page.locator('#hud').isVisible());
 const lock=await page.evaluate(()=>document.pointerLockElement?.id||null);console.log('DESKTOP pointer lock:',lock);
 await page.screenshot({path:packaged?'artifacts/desktop-packaged-game.png':'artifacts/desktop-game-preview.png'});
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'画面与声音'}).click();await page.locator('[data-setting=quality]').selectOption('low');await page.getByRole('button',{name:'保存并返回'}).click();assert.ok(await page.getByRole('button',{name:'继续行动'}).isVisible());
 const fullscreenBefore=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen());
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.sendInputEvent({type:'keyDown',keyCode:'F11'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'F11'});});
 await page.waitForTimeout(700);const fullscreenAfter=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen());if(process.argv.includes('--visible'))assert.notEqual(fullscreenAfter,fullscreenBefore);
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.sendInputEvent({type:'keyDown',keyCode:'F11'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'F11'});});
 assert.deepEqual(errors,[]);await fs.writeFile('artifacts/'+(packaged?'desktop-packaged-test.json':'desktop-test.json'),JSON.stringify({passed:true,errors,pointerLock:lock,fullscreenVerified:process.argv.includes('--visible')&&fullscreenBefore!==fullscreenAfter,exe,checks:['offline file assets load','menu and first chapter','pause/settings/low quality']},null,2));console.log('DESKTOP PASS');
}finally{await app.close();}
