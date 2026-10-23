import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:5175/';
const report = { baseURL, passed: false, errors: [], consoleErrors: [], badResponses: [], screenshots: [] };
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) report.badResponses.push({ url: response.url(), status: response.status() }); });
async function capture(name) {
  const path = `artifacts/${name}.png`;
  await page.screenshot({ path });
  report.screenshots.push(path);
}
try {
  await page.goto(`${baseURL}?qa=1`);
  await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
  await page.evaluate(() => window.__game.loadChapter(5));
  await page.locator('[data-action="play"]').click();
  await page.waitForFunction(() => window.__game.getState().mode === 'playing');
  await page.waitForTimeout(1200);
  report.hipState = await page.evaluate(() => window.__game.getState());
  await capture('weapon-runtime-hip-fixed');
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(1200);
  report.aimState = await page.evaluate(() => window.__game.getState());
  await capture('weapon-runtime-ads-fixed');
  await page.mouse.up({ button: 'right' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.getState().mode === 'paused');
  await page.locator('[data-action="menu"]').click();
  await page.locator('[data-action="gallery"]').click();
  await page.locator('[data-action="gallery-kind"][data-value="rifle"]').click();
  await page.waitForTimeout(400);
  await capture('weapon-runtime-gallery-fixed');
  assert.equal(report.hipState.chapter, 6);
  assert.equal(report.hipState.mode, 'playing');
  assert.equal(report.aimState.mode, 'playing');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.badResponses, []);
  report.passed = true;
} catch (error) {
  report.failure = String(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile('artifacts/weapon-runtime-test.json', JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
