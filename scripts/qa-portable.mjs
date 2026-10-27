import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')); }
const { chromium } = playwright;
assert.ok(!process.argv.includes('--visible'), 'Portable QA is always hidden; visible desktop testing is disabled.');
const args = process.argv.slice(2);
const expectedBuild = args.includes('--expected-build') ? args[args.indexOf('--expected-build') + 1] : null;
assert.match(expectedBuild || '', /^index-[A-Za-z0-9_-]+\.js$/, 'Pass the approved final bundle with --expected-build before launching the portable EXE.');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const executable = path.resolve(args.find(value => /\.exe$/i.test(value)) || path.join(root, 'release', `归途-LastLight-v${packageJson.version}.exe`));
const releaseRelative = path.relative(path.join(root, 'release'), executable);
assert.ok(releaseRelative && !releaseRelative.startsWith('..') && !path.isAbsolute(releaseRelative), 'QA may launch only an executable inside this project release directory.');
assert.equal(path.extname(executable).toLowerCase(), '.exe');
await fs.access(executable);
const sourceDist = path.join(root, 'dist');
const sourceEntry = await fs.readFile(path.join(sourceDist, 'index.html'), 'utf8');
assert.ok(sourceEntry.includes(`assets/${expectedBuild}`), 'The current dist entry must reference the approved bundle.');
const hashFile = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const expectedBundleSha256 = await hashFile(path.join(sourceDist, 'assets', expectedBuild));
const releaseManifest = JSON.parse(await fs.readFile(path.join(root, 'release', 'release-manifest.json'), 'utf8'));
assert.equal(releaseManifest.version, packageJson.version, 'The generated release must match the current project version.');
assert.equal(releaseManifest.portable?.path, path.basename(executable), 'Launch the portable named by the generated release manifest.');
assert.equal(await hashFile(executable), releaseManifest.portable.sha256, 'The actual portable EXE must match its generated SHA-256 before launch.');
async function listFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, {withFileTypes:true}), files = [];
  for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Unexpected non-file in packaged resource tree: ${relative}`);
  }
  return files;
}
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const runId = `${Date.now()}-${process.pid}`;
const profile = path.join(artifacts, `portable-qa-profile-${runId}`);
const tempRoot = path.join(artifacts, `portable-qa-temp-${runId}`);
await fs.mkdir(profile);
await fs.mkdir(tempRoot);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const hasPath = async (target) => { try { await fs.access(target); return true; } catch { return false; } };

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const port = await freePort();
const launchEnv = { ...process.env, LAST_LIGHT_QA_PROFILE: profile,
  LAST_LIGHT_QA_DEBUG_PORT: String(port), LAST_LIGHT_QA_HIDDEN: '1', TEMP: tempRoot, TMP: tempRoot };
delete launchEnv.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [], { cwd: root, env: launchEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
let output = '', exit = null, spawnError = null;
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });
child.once('error', (error) => { spawnError = error; });
const exited = new Promise((resolve) => child.once('exit', (code, signal) => { exit = { code, signal }; resolve(exit); }));
const report = { passed: false, executable, profile, debugHost: '127.0.0.1', debugPort: port,
  hidden: true, inputMethod: 'DOM buttons only', checks: [], errors: [], screenshots: [], extractionDirectory: null, extractionCleaned: false, exit: null };
report.version = packageJson.version;
report.expectedBuild = expectedBuild;
report.expectedBundleSha256 = expectedBundleSha256;
report.portableSha256 = releaseManifest.portable.sha256;
let browser, page, nsisTempDirectory, caught;

async function screenshot(name) {
  const destination = path.join(artifacts, `portable-${name}.png`);
  await page.screenshot({ path: destination });
  report.screenshots.push(destination);
}

async function waitForExit(timeout = 30000) {
  if (exit) return exit;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    exited.then((result) => { clearTimeout(timer); resolve(result); });
  });
}

try {
  console.log(`Launching hidden portable EXE (PID ${child.pid}); waiting for extraction and local CDP.`);
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 180000;
  let ready = false;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (exit) throw new Error(`Portable process exited before the game started: ${JSON.stringify(exit)}\n${output}`);
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.json()).webSocketDebuggerUrl) { ready = true; break; }
    } catch {}
    await pause(300);
  }
  assert.ok(ready, `No CDP endpoint after 180 seconds.\n${output}`);
  browser = await chromium.connectOverCDP(endpoint, { timeout: 30000 });
  const context = browser.contexts()[0];
  assert.ok(context, 'Expected the Electron browser context.');
  const pageDeadline = Date.now() + 60000;
  while (Date.now() < pageDeadline) {
    page = context.pages().find((candidate) => candidate.url().startsWith('file:'));
    if (page) break;
    await pause(200);
  }
  assert.ok(page, 'Expected a file:// game page.');
  const rendererSession = await context.newCDPSession(page);
  // Renderer emulation only. The native window stays hidden and unfocused.
  await rendererSession.send('Emulation.setFocusEmulationEnabled', {enabled:true});
  await rendererSession.send('Emulation.setDeviceMetricsOverride', {width:1280,height:800,deviceScaleFactor:1,mobile:false});
  page.setDefaultTimeout(60000);
  page.on('pageerror', (error) => report.errors.push(`JavaScript: ${String(error)}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`Console: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) report.errors.push(`Asset ${response.status()}: ${response.url()}`); });
  page.on('requestfailed', (request) => report.errors.push(`Asset failed: ${request.url()} ${request.failure()?.errorText}`));
  await page.locator('.main-menu').waitFor({ timeout: 90000 });
  // Reload only after attaching observers, so startup assets and scripts are checked too.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.main-menu').waitFor({ timeout: 90000 });
  assert.equal(await page.title(), '归途 · LAST LIGHT');
  assert.equal(new URL(page.url()).searchParams.get('qa'), '1', 'Hidden QA must enter qa=1 before any button is activated, so pointer capture is disabled.');
  const entryPath = fileURLToPath(page.url());
  assert.ok(entryPath.endsWith(path.join('resources', 'app', 'dist', 'index.html')), 'Expected the real unpacked application entry.');
  const extractedRoot = path.resolve(path.dirname(entryPath), '..', '..', '..');
  const tempRelative = path.relative(tempRoot, extractedRoot);
  assert.ok(tempRelative && !tempRelative.startsWith('..') && !path.isAbsolute(tempRelative), 'Expected extraction inside this run isolated TEMP directory.');
  nsisTempDirectory = path.dirname(extractedRoot);
  report.extractionDirectory = extractedRoot;
  const embeddedPackage = JSON.parse(await fs.readFile(path.join(extractedRoot, 'resources', 'app', 'package.json'), 'utf8'));
  assert.equal(embeddedPackage.version, packageJson.version, 'The actual extracted application version must match the release.');
  const embeddedDist = path.join(extractedRoot, 'resources', 'app', 'dist');
  const sourceFiles = await listFiles(sourceDist), embeddedFiles = await listFiles(embeddedDist);
  assert.deepEqual(embeddedFiles, sourceFiles, 'The EXE must contain exactly the approved dist files.');
  report.distFiles = [];
  for (const relative of sourceFiles) {
    const expected = await hashFile(path.join(sourceDist, relative));
    const actual = await hashFile(path.join(embeddedDist, relative));
    assert.equal(actual, expected, `Embedded dist resource mismatch: ${relative}`);
    report.distFiles.push({path:relative,sha256:actual});
  }
  const servedScripts = await page.locator('script[type="module"][src]').evaluateAll(nodes => nodes.map(node => node.src));
  assert.ok(servedScripts.some(url => path.basename(fileURLToPath(url)) === expectedBuild), 'The launched page must actually reference the approved bundle.');
  report.servedScripts = servedScripts;
  const packagedSource = path.join(extractedRoot, 'source');
  for (const document of ['WEAPON-REFERENCE.md', 'ASSET-SOURCES.md', 'README.md', 'VALIDATION.md', 'AUDIO-SOURCES.md']) {
    assert.equal(await hashFile(path.join(packagedSource, document)), await hashFile(path.join(root, document)), `Packaged documentation mismatch: ${document}`);
  }
  const characterFiles = await listFiles(path.join(packagedSource, 'character-sources'));
  assert.ok(characterFiles.some(file => file.endsWith('.blend')), 'Editable MakeHuman/Blender sources must be included.');
  assert.ok(!characterFiles.some(file => /(?:\.blend\d+|\.py[co]|\.tmp|\.bak|~)$|(?:^|\/)__pycache__(?:\/|$)/i.test(file)), 'Character backups and caches must be excluded.');
  const weaponFiles = await listFiles(path.join(packagedSource, 'weapon-sources'));
  const environmentFiles = await listFiles(path.join(packagedSource, 'environment-sources'));
  assert.ok(weaponFiles.includes('v0.5/m249-detail-source.blend'), 'The authored M249 additions must retain their editable source.');
  for(const file of ['v0.6/akm-source.blend','v0.6/m249-source.blend']) assert.ok(weaponFiles.includes(file), 'Current weapon source included: '+file);
  for(const file of ['makehuman/v0.6/pasgt-field-helmet-source.blend','makehuman/v0.6/soldier-equipment-source.blend']) assert.ok(characterFiles.includes(file), 'Current character source included: '+file);
  assert.ok(environmentFiles.some(file => file.startsWith('v0.4-baseline/') && file.endsWith('.js')), 'The environment baseline must remain reviewable.');
  for (const folder of ['character-sources','weapon-sources','environment-sources','audio-sources']) {
    const files = await listFiles(path.join(packagedSource,folder));
    assert.ok(!files.some(file => /(?:\.blend\d+|\.py[co]|\.tmp|\.bak|~)$|(?:^|\/)__pycache__(?:\/|$)/i.test(file)), `${folder}: exclude caches and editor backups`);
    for (const relative of files) assert.equal(await hashFile(path.join(packagedSource,folder,relative)),await hashFile(path.join(root,folder,relative)),`${folder}/${relative}: editable source must match`);
  }
  assert.equal(await hasPath(path.join(packagedSource, 'tools')), false, 'DCC tools must not be copied into the source package.');
  report.checks.push('actual EXE version, every embedded dist SHA-256, current documentation and filtered editable character, weapon and environment sources match');
  report.checks.push('actual NSIS EXE extracted and launched a sandboxed file application', 'offline main menu loaded');
  await screenshot('menu');

  await page.locator('[data-action="gallery"]').evaluate(button => button.click());
  await page.locator('.gallery-overlay').waitFor();
  await page.getByRole('button', { name: '游骑兵', exact: true }).waitFor();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.gallery-caption span').innerText(), '游骑兵');
  await screenshot('soldier');
  await page.getByRole('button', { name: '查看面部与衣着', exact: true }).evaluate(button => button.click());
  await page.waitForTimeout(350);
  await screenshot('soldier-close');
  await page.getByRole('button', { name: '城市居民', exact: true }).evaluate(button => button.click());
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.gallery-caption span').innerText(), '城市居民');
  await screenshot('civilian-close');
  await page.getByRole('button', { name: '查看全身', exact: true }).evaluate(button => button.click());
  await page.waitForTimeout(350);
  await screenshot('civilian');
  report.checks.push('soldier and civilian gallery full and close views loaded');

  report.weaponGallery = [];
  for (const id of ['m16a2', 'm249', 'ak', 'mp5', 'm1911', 'rifle']) {
    const button = page.locator(`[data-action="gallery-kind"][data-value="${id}"]`);
    const label = await button.innerText();
    await button.evaluate(button => button.click());
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.gallery-caption span').innerText(), label);
    assert.equal(await page.locator('[data-action="gallery-close"]').innerText(), '查看枪身细节');
    await screenshot(`weapon-${id}`);
    await page.locator('[data-action="gallery-close"]').evaluate(button => button.click());
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-action="gallery-close"]').innerText(), '查看整枪');
    await screenshot(`weapon-${id}-detail`);
    report.weaponGallery.push({id,label});
    await page.locator('[data-action="gallery-close"]').evaluate(button => button.click());
  }
  await page.getByRole('button', { name: '游骑兵', exact: true }).evaluate(button => button.click());
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.gallery-caption span').innerText(), '游骑兵');
  report.checks.push('all six authored weapons loaded in full and detail views; returned to soldier');

  await page.locator('[data-action="menu"]').evaluate(button => button.click());
  await page.locator('.main-menu').waitFor();
  await page.locator('[data-action="new"]').evaluate(button => button.click());
  await page.locator('[data-action="play"]').evaluate(button => button.click());
  await page.waitForFunction(()=>__game.getState().mode==='cinematic');
  report.opening=await page.evaluate(()=>__game.inspect().cinematic);
  assert.equal(report.opening.phase,'opening');
  await page.locator('[data-action="skip-cinematic"]').evaluate(button=>button.click());
  await page.locator('#hud').waitFor({ state: 'visible' });
  await page.waitForTimeout(700);
  await page.waitForFunction(()=>__game.inspect().audio?.aircraft.sampleState==='ready',undefined,{timeout:20000});
  report.audio=await page.evaluate(()=>__game.inspect().audio);
  assert.equal(report.audio.contextState,'running');assert.equal(report.audio.aircraft.sampleLoaded,true);assert.equal(report.audio.aircraft.sampleDuration,6);
  assert.equal(report.audio.aircraft.sampleError,null);
  report.checks.push('actual file application decodes the bundled six-second recorded helicopter loop, with running audio context and no sample error');
  await screenshot('first-chapter');
  report.checks.push('first chapter rendered in hidden window with HUD; no desktop input or pointer capture');
  await page.evaluate(()=>{__game.loadChapter(11);__game.action('play');});
  await page.waitForFunction(()=>__game.getState().mode==='cinematic');
  await page.locator('[data-action="skip-cinematic"]').evaluate(button=>button.click());
  await page.waitForTimeout(500);
  report.nightOff=await page.evaluate(()=>({game:__game.getState(),flashlight:__game.inspect().flashlight}));
  assert.equal(report.nightOff.game.chapter,12);assert.equal(report.nightOff.flashlight.enabled,false);
  await screenshot('night-light-off');
  await page.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyT',bubbles:true}));});
  await page.waitForTimeout(700);
  report.nightOn=await page.evaluate(()=>__game.inspect().flashlight);assert.equal(report.nightOn.enabled,true);assert.equal(report.nightOn.castShadow,true);
  await screenshot('night-light-on');
  report.checks.push('actual EXE night chapter starts dark with flashlight off; page-local T enables a shadowed local light');
  report.chapterScenes=[];
  for(const index of [0,2,8,10]){
    await page.evaluate(index=>{__game.loadChapter(index);__game.action('play');},index);
    await page.waitForFunction(()=>__game.getState().mode==='cinematic');
    await page.locator('[data-action="skip-cinematic"]').evaluate(button=>button.click());
    report.chapterScenes.push(await page.evaluate(()=>__game.inspect().scene));
  }
  assert.equal(new Set(report.chapterScenes.map(s=>s.id)).size,4,'Clinic, hangar, cockpit and aid room must load different maps in the real EXE.');
  report.checks.push('four different chapter maps and their real-time openings load inside the offline EXE');
  await page.evaluate(()=>{__game.loadChapter(3);__game.action('play');});
  await page.waitForFunction(()=>__game.inspect().cinematic.playerAction?.active,undefined,{timeout:240000,polling:1000});
  const waitingAction=await page.evaluate(()=>__game.inspect().cinematic);
  await page.waitForFunction(before=>__game.inspect().cinematic.ambientTime>before+.05,waitingAction.ambientTime,{timeout:30000,polling:500});
  const stillWaiting=await page.evaluate(()=>__game.inspect().cinematic);
  assert.equal(stillWaiting.playerAction.progress,waitingAction.playerAction.progress,'Rope descent waits for the player');
  assert.ok(stillWaiting.ambientTime>waitingAction.ambientTime,'Waiting for input must not freeze the surroundings');
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',bubbles:true})));
  await page.waitForFunction(()=>__game.inspect().cinematic.playerAction.progress>.15,undefined,{timeout:90000,polling:500});
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE',bubbles:true})));
  report.playableScene=await page.evaluate(()=>__game.inspect().cinematic);
  assert.equal(report.playableScene.playerAction.id,'fast-rope');
  await screenshot('player-controlled-descent');
  await page.locator('[data-action="skip-cinematic"]').evaluate(button=>button.click());
  report.checks.push('offline EXE waits for sustained E during the playable descent while ambient animation continues');
  assert.equal(await page.evaluate(() => document.pointerLockElement === null && document.fullscreenElement === null), true, 'Hidden QA must never capture the pointer or enter fullscreen.');
  // Reload reaches the saved campaign menu without synthesizing keyboard input.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.main-menu').waitFor();
  assert.deepEqual(report.errors, [], 'Expected no JavaScript errors or missing assets.');
  report.checks.push('no JavaScript, console, HTTP or file asset errors');
  await page.locator('[data-action="quit"]').evaluate(button => button.click());
  const portableExit = await waitForExit(45000);
  assert.ok(portableExit, 'Portable launcher did not exit after the game window closed.');
  assert.equal(portableExit.code, 0, 'Portable launcher must exit with code 0.');
  report.exit = portableExit;
  const cleanupDeadline = Date.now() + 30000;
  while (await hasPath(nsisTempDirectory) && Date.now() < cleanupDeadline) await pause(300);
  report.extractionCleaned = !await hasPath(nsisTempDirectory);
  assert.ok(report.extractionCleaned, `NSIS did not remove its extraction directory: ${nsisTempDirectory}`);
  report.checks.push('game window and portable process exited normally', 'NSIS extraction directory removed automatically');
  report.passed = true;
  console.log('PORTABLE PASS: approved embedded build, menu, character views, six weapon inspections, first chapter, exit and temporary cleanup.');
} catch (error) {
  caught = error;
  report.failure = String(error.stack || error);
} finally {
  if (page && !page.isClosed()) await page.evaluate(() => window.close()).catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (!exit && child.pid) {
    await waitForExit(10000);
    if (!exit) {
      // Stop only the process tree launched by this run if a failed check left it open.
      await new Promise((resolve) => {
        const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
        killer.once('error', resolve); killer.once('exit', resolve);
      });
    }
  }
  report.exit = exit;
  report.processOutput = output.slice(-20000);
  await fs.writeFile(path.join(artifacts, 'portable-test.json'), JSON.stringify(report, null, 2));
}
if (caught) throw caught;
