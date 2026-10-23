import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { CHAPTERS } from '../src/story.js';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:5174/';
const reportPath = 'artifacts/character-update-test.json';
await fs.mkdir('artifacts', { recursive: true });
const report = {
  passed: false, baseURL, startedAt: new Date().toISOString(),
  checks: [], galleryTransitions: [], screenshots: [], errors: [], consoleErrors: [], badResponses: [],
};
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
page.on('response', response => {
  if (response.status() >= 400) report.badResponses.push({ url: response.url(), status: response.status() });
});
const state = () => page.evaluate(() => window.__game.getState());
const waitMode = mode => page.waitForFunction(expected => window.__game?.getState().mode === expected, mode);
async function settle() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function capture(name) {
  const path = `artifacts/${name}.png`;
  await settle();
  await page.screenshot({ path });
  report.screenshots.push(path);
}
async function checkVisibleControls(selector, { footer = false } = {}) {
  const measurements = await page.locator(selector).evaluateAll((buttons, footerRequired) => {
    const footerRect = document.querySelector('.menu-footer')?.getBoundingClientRect();
    const bottomBar = document.querySelector('.filmbar.bottom')?.getBoundingClientRect();
    return buttons.map(button => {
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        label: button.textContent.trim(), top: rect.top, bottom: rect.bottom,
        left: rect.left, right: rect.right, width: rect.width, height: rect.height,
        viewportWidth: innerWidth, viewportHeight: innerHeight,
        footerTop: footerRequired ? footerRect?.top : null,
        bottomBarTop: bottomBar?.top ?? innerHeight,
        receivesPointer: hit === button || button.contains(hit),
      };
    });
  }, footer);
  assert.ok(measurements.length >= 4, 'expected control group is present');
  for (const item of measurements) {
    assert.ok(item.width > 0 && item.height > 0, `${item.label}: no layout box`);
    assert.ok(item.top >= 0 && item.left >= 0 && item.right <= item.viewportWidth, `${item.label}: outside viewport`);
    assert.ok(item.bottom <= item.viewportHeight, `${item.label}: below viewport`);
    assert.ok(item.bottom <= item.bottomBarTop, `${item.label}: obscured by film bar`);
    if (footer) assert.ok(item.bottom <= item.footerTop - 4, `${item.label}: overlaps menu footer`);
    assert.equal(item.receivesPointer, true, `${item.label}: center is obscured`);
  }
  return measurements;
}

try {
  await page.goto(`${baseURL}?qa=1`);
  await page.waitForFunction(() => window.__game, { timeout: 90000 });
  await waitMode('menu');
  await page.locator('[data-action="gallery"]').click();
  await waitMode('gallery');
  for (let round = 1; round <= 3; round++) {
    for (const kind of ['soldier', 'civilian']) {
      await page.locator(`[data-action="gallery-kind"][data-value="${kind}"]`).click();
      await waitMode('gallery');
      assert.ok((await page.locator(`[data-action="gallery-kind"][data-value="${kind}"]`).getAttribute('class')).includes('selected'));
      assert.equal((await page.locator('[data-action="gallery-close"]').textContent()).trim(), '查看面部与衣着');
      await settle();
      if (round === 1) await capture(`characters-${kind}-full-final`);
      await page.locator('[data-action="gallery-close"]').click();
      assert.equal((await page.locator('[data-action="gallery-close"]').textContent()).trim(), '查看全身');
      await settle();
      if (round === 1) await capture(`characters-${kind}-close-final`);
      report.galleryTransitions.push({ round, kind, view: 'close', render: (await state()).render });
      await page.locator('[data-action="gallery-close"]').click();
      assert.equal((await page.locator('[data-action="gallery-close"]').textContent()).trim(), '查看面部与衣着');
      await settle();
      report.galleryTransitions.push({ round, kind, view: 'full', render: (await state()).render });
    }
    console.log(`PASS gallery round ${round}: soldier/civilian full/close/full`);
  }
  report.checks.push('Three complete soldier/civilian gallery rounds with full and close views');
  await page.locator('.gallery-controls [data-action="menu"]').click();
  await waitMode('menu');

  await page.evaluate(() => window.__game.loadChapter(5));
  await waitMode('intro');
  await page.locator('[data-action="play"]').click();
  await waitMode('playing');
  await page.waitForFunction(() => document.pointerLockElement === document.getElementById('game'));
  await page.evaluate(() => {
    const target = window.__game.inspect().enemies[0];
    window.__game.teleport(target.x, target.z + 12);
    window.__game.lookAt(target.x, 1.1, target.z);
  });
  await settle();
  const beforeShot = await state();
  await page.mouse.down();
  try {
    await page.waitForFunction(count => window.__game.getState().enemyCount < count, beforeShot.enemyCount, { timeout: 12000 });
  } finally {
    await page.mouse.up();
  }
  const afterShot = await state();
  assert.ok(afterShot.player.mag < beforeShot.player.mag, 'actual firing consumes ammunition');
  assert.ok(afterShot.enemyCount < beforeShot.enemyCount, 'raycast shots hit and incapacitate the replacement character geometry');
  report.shooting = {
    chapter: afterShot.chapter, roundsFired: beforeShot.player.mag - afterShot.player.mag,
    enemiesBefore: beforeShot.enemyCount, enemiesAfter: afterShot.enemyCount,
    targets: (await page.evaluate(() => window.__game.inspect())).enemies,
  };
  report.checks.push('Chapter 6 real mouse firing hits replacement geometry and incapacitates a hostile');
  await capture('character-update-combat-final');
  console.log('PASS chapter 6 replacement geometry raycast hit');
  await page.keyboard.press('Escape');
  await waitMode('paused');
  await page.locator('[data-action="menu"]').click();
  await waitMode('menu');

  await page.evaluate(() => window.__game.loadChapter(0));
  await page.locator('[data-action="play"]').click();
  await waitMode('playing');
  const firstChapter = CHAPTERS[0];
  for (let index = 0; index < firstChapter.tasks.length; index++) {
    const task = firstChapter.tasks[index];
    await page.evaluate(({ x, z }) => {
      window.__game.teleport(x + 2.7, z);
      window.__game.lookAt(x, 1.1, z);
    }, { x: task.pos[0], z: task.pos[1] });
    await page.keyboard.down('KeyE');
    try {
      await page.waitForFunction(next => window.__game.getState().task >= next, index + 1, { timeout: Math.max(30000, task.seconds * 8000) });
    } finally {
      await page.keyboard.up('KeyE');
    }
    console.log(`PASS chapter 1 held interaction ${index + 1}`);
  }
  await waitMode('choice');
  const lastMoment = page.locator('.choice-panel .last-moment');
  await lastMoment.waitFor({ state: 'visible' });
  assert.equal((await lastMoment.textContent()).trim(), firstChapter.tasks.at(-1).text);
  report.lastMoment = { expected: firstChapter.tasks.at(-1).text, actual: (await lastMoment.textContent()).trim() };
  report.checks.push('Chapter 1 completes three real held interactions; final task text remains visible in the choice panel');
  await capture('character-update-choice-final');
  await page.locator('[data-action="choose"]:enabled').first().click();
  await waitMode('debrief');
  await page.locator('[data-action="menu"]').click();
  await waitMode('menu');

  await page.setViewportSize({ width: 960, height: 600 });
  await settle();
  report.compactMenu = await checkVisibleControls('.main-menu nav button', { footer: true });
  assert.ok(report.compactMenu.some(item => item.label.includes('继续归途')), 'compact test includes the extra saved-campaign button');
  await capture('character-update-menu-960');
  await page.locator('[data-action="gallery"]').click();
  await waitMode('gallery');
  report.compactGallery = await checkVisibleControls('.gallery-controls button');
  await capture('character-update-gallery-960');
  await page.locator('[data-action="gallery-close"]').click();
  await checkVisibleControls('.gallery-controls button');
  report.checks.push('960x600 saved-campaign menu: every button is on screen, clickable and clear of footer; gallery controls remain visible');
  console.log('PASS compact menu and gallery visibility at 960x600');

  assert.deepEqual(report.errors, [], 'no uncaught runtime errors');
  assert.deepEqual(report.consoleErrors, [], 'no browser console errors');
  assert.deepEqual(report.badResponses, [], 'no failed asset responses');
  report.passed = true;
  console.log('CHARACTER UPDATE PASS');
} catch (error) {
  report.error = String(error);
  report.stack = error.stack;
  console.error(error);
  try { report.failureState = await state(); } catch {}
  try { await capture('character-update-failure'); } catch {}
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await browser.close();
}
