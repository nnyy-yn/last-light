import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = path.join(root, 'release');
const releaseName = '归途-LastLight';
const releaseDirectory = path.join(releaseRoot, releaseName);
const markerName = '.last-light-generated.json';
const productId = 'studio.lastlight.demo';
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const portableName = `归途-LastLight-v${version}.exe`;
const withPortable = !process.argv.includes('--no-portable');

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

function assertGeneratedLocation(target) {
  const relative = path.relative(releaseRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify a location outside this project's release directory: ${target}`);
  }
}

async function requireGeneratedMarker(target) {
  assertGeneratedLocation(target);
  const marker = JSON.parse(await fs.readFile(path.join(target, markerName), 'utf8').catch(() => '{}'));
  if (marker.productId !== productId) throw new Error(`Refusing to replace a directory without the Last Light build marker: ${target}`);
}

async function findElectron() {
  const candidates = [process.env.LAST_LIGHT_ELECTRON_DIST,
    path.join(root, 'node_modules', 'electron', 'dist'),
    path.resolve(root, '..', 'shiyong-toolbox', 'node_modules', 'electron', 'dist')].filter(Boolean);
  for (const directory of candidates) {
    if (!await exists(path.join(directory, 'electron.exe'))) continue;
    const runtimeVersion = (await fs.readFile(path.join(directory, 'version'), 'utf8')).trim();
    if (!['44.7.2', '44.9.0'].includes(runtimeVersion)) throw new Error(`Electron ${runtimeVersion} has not been validated. Use 44.7.2 or 44.9.0.`);
    for (const file of ['LICENSE', 'LICENSES.chromium.html', 'icudtl.dat', 'resources.pak']) {
      if (!await exists(path.join(directory, file))) throw new Error(`Incomplete Electron runtime: ${file}`);
    }
    const executable = await fs.readFile(path.join(directory, 'electron.exe'));
    const peOffset = executable.readUInt32LE(0x3c);
    if (executable.subarray(0, 2).toString() !== 'MZ' || executable.readUInt16LE(peOffset + 4) !== 0x8664) throw new Error('Expected Windows x64 Electron.');
    return { directory: path.resolve(directory), runtimeVersion };
  }
  throw new Error('Electron runtime not found. Set LAST_LIGHT_ELECTRON_DIST to unpacked Windows x64 Electron 44.7.2 or 44.9.0.');
}

async function findNsis() {
  if (process.env.LAST_LIGHT_NSIS_EXE) {
    const executable = path.resolve(process.env.LAST_LIGHT_NSIS_EXE);
    if (!await exists(executable)) throw new Error('LAST_LIGHT_NSIS_EXE does not exist.');
    return executable;
  }
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron-builder', 'Cache', 'nsis-3.0.4.1');
  const entries = await fs.readdir(cache, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('nsis-3.0.4.1-')) continue;
    for (const relative of ['makensis.exe', path.join('Bin', 'makensis.exe')]) {
      const candidate = path.join(cache, entry.name, relative);
      if (await exists(candidate)) return candidate;
    }
  }
  throw new Error('NSIS 3.0.4.1 cache not found. Set LAST_LIGHT_NSIS_EXE or use --no-portable.');
}

async function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true, shell: false });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} exited with ${code}`)));
  });
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function listFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in release: ${relative}`);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function copyIfPresent(source, destination, options = {}) {
  if (await exists(source)) await fs.cp(source, destination, { recursive: true, dereference: true, errorOnExist: true, force: false, ...options });
}

function includeEditableSource(source) {
  const relative = path.relative(root, source);
  return !relative.split(path.sep).some(name =>
    ['__pycache__', '.cache', '.pytest_cache', '.DS_Store'].includes(name) ||
    /(?:\.blend\d+|\.py[co]|\.tmp|\.bak|~)$/i.test(name));
}

function quoteNsis(value) {
  return value.replaceAll('$', '$$').replaceAll('"', '$\\"');
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This script builds Windows releases on Windows.');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a major.minor.patch version.');
  if (!await exists(path.join(root, 'dist', 'index.html'))) throw new Error('dist/index.html is missing. Run the Vite build first.');
  const runtime = await findElectron();
  const nsis = withPortable ? await findNsis() : null;
  await fs.mkdir(releaseRoot, { recursive: true });
  const runId = `${Date.now()}-${process.pid}`;
  const stage = path.join(releaseRoot, `.last-light-stage-${runId}`);
  assertGeneratedLocation(stage);
  await fs.mkdir(stage);
  await fs.writeFile(path.join(stage, markerName), JSON.stringify({ productId, version }, null, 2));
  // Read only the adjacent runtime; never copy or change its application.
  await fs.cp(runtime.directory, stage, { recursive: true, dereference: true, filter: (source) => {
    const relative = path.relative(runtime.directory, source).replaceAll('\\', '/');
    return !relative.startsWith('resources/app') && relative !== 'resources/default_app.asar';
  } });
  await fs.rename(path.join(stage, 'electron.exe'), path.join(stage, '归途.exe'));
  const appDirectory = path.join(stage, 'resources', 'app');
  await fs.mkdir(path.join(appDirectory, 'desktop'), { recursive: true });
  await fs.cp(path.join(root, 'dist'), path.join(appDirectory, 'dist'), { recursive: true });
  await fs.copyFile(path.join(root, 'desktop', 'main.cjs'), path.join(appDirectory, 'desktop', 'main.cjs'));
  await fs.writeFile(path.join(appDirectory, 'package.json'), JSON.stringify({ name: packageJson.name, version, private: true, productName: '归途 · LAST LIGHT', main: 'desktop/main.cjs' }, null, 2));
  const licensesDirectory = path.join(stage, 'licenses');
  await fs.mkdir(licensesDirectory);
  await fs.copyFile(path.join(runtime.directory, 'LICENSE'), path.join(licensesDirectory, 'Electron-LICENSE.txt'));
  const threeLicense = path.join(root, 'node_modules', 'three', 'LICENSE');
  if (!await exists(threeLicense)) throw new Error('Three.js LICENSE not found in project dependencies.');
  await fs.copyFile(threeLicense, path.join(licensesDirectory, 'Three-LICENSE.txt'));
  const sourceDirectory = path.join(stage, 'source');
  await fs.mkdir(sourceDirectory);
  for (const name of ['src', 'public', 'desktop', 'scripts', 'tests', 'character-sources', 'weapon-sources', 'environment-sources', 'audio-sources', 'index.html', '.gitignore', 'package.json', 'vite.config.js', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package-lock.json']) {
    // Retain editable Blender and asset sources, not editor backups or caches.
    await copyIfPresent(path.join(root, name), path.join(sourceDirectory, name),
      name.endsWith('-sources') ? { filter: includeEditableSource } : {});
  }
  const documentation = (await fs.readdir(root, { withFileTypes: true })).filter((entry) => entry.isFile() && (/\.md$/i.test(entry.name) || /^(LICENSE|NOTICE)(\..*)?$/i.test(entry.name)));
  for (const entry of documentation) await fs.copyFile(path.join(root, entry.name), path.join(sourceDirectory, entry.name));
  await fs.writeFile(path.join(stage, '开始前请读.txt'), '\ufeff' + [
    '归途 · LAST LIGHT', `版本 ${version} — 原创交互战役演示`, '',
    '运行方式：双击本目录的“归途.exe”。请保留整个目录，不要只移动这一个文件。',
    `单文件便携版：运行“${portableName}”后会解压到临时目录，启动请稍候。`,
    'Windows 10 / 11，64 位系统。F11 切换全屏，Alt + F4 退出。',
    'WASD移动，鼠标射击/瞄准，R换弹，E逐句交谈或持续行动，H救护；Q烟雾，F小队跟随/坚守，T手电。',
    '只携带一把主武器和一把手枪：1/2切换，拾枪替换同槽旧枪；M打开现场地图与当前剧情方向。',
    'V接管/离开M2或已空出的DShK枪位，R更换弹链；G指定压制方向，现场判断1/2选择，X放弃可选掩护。',
    '可操作演出依现场提示：E索降/救护，A/D稳住机身，W/S进退；右键拖动观察，ESC暂停。',
    '夜间默认关闭手电；打开会暴露位置，请利用火光与掩体移动。',
    '运行时无需网络；存档位于 %APPDATA%\\LastLight。',
    '这是原创交互战役演示，并非官方电影改编或商业 3A 成品。',
    'source 含可编辑工程；licenses 与 LICENSES.chromium.html 含第三方许可。',
    '该本地构建未进行代码签名。',
  ].join('\r\n') + '\r\n', 'utf8');
  const fileEntries = [];
  for (const relative of await listFiles(stage)) {
    const file = path.join(stage, relative);
    fileEntries.push({ path: relative, bytes: (await fs.stat(file)).size, sha256: await hashFile(file) });
  }
  const directoryManifest = { productId, name: '归途 · LAST LIGHT', version, platform: 'win32-x64', electron: runtime.runtimeVersion, generatedAt: new Date().toISOString(), files: fileEntries };
  await fs.writeFile(path.join(stage, 'manifest.sha256.json'), JSON.stringify(directoryManifest, null, 2));
  if (await exists(releaseDirectory)) {
    await requireGeneratedMarker(releaseDirectory);
    const backup = path.join(releaseRoot, `.last-light-previous-${runId}`);
    assertGeneratedLocation(backup);
    await fs.rename(releaseDirectory, backup);
  }
  await fs.rename(stage, releaseDirectory);
  // Chromium's AppContainer renderer needs read/execute access to the copied runtime.
  // Grant only this project's generated output; never change the source runtime ACL.
  await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe'),
    [releaseDirectory, '/grant', '*S-1-15-2-1:(OI)(CI)(RX)', '/Q']);
  console.log(`Directory build ready: ${path.join(releaseDirectory, '归途.exe')}`);
  const summary = { productId, version, platform: 'win32-x64', electron: runtime.runtimeVersion,
    generatedAt: new Date().toISOString(),
    directory: { path: releaseName, bytes: fileEntries.reduce((sum, file) => sum + file.bytes, 0) + (await fs.stat(path.join(releaseDirectory, 'manifest.sha256.json'))).size, fileCount: fileEntries.length + 1 },
    portable: null };
  if (withPortable) {
    const nsiPath = path.join(releaseRoot, `.last-light-portable-${runId}.nsi`);
    const portableStage = path.join(releaseRoot, `.last-light-portable-${runId}.exe`);
    const portableFinal = path.join(releaseRoot, portableName);
    const [major, minor, patch] = version.split('.');
    const nsi = `Unicode true
Name "归途 · LAST LIGHT"
OutFile "${quoteNsis(portableStage)}"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
ShowInstDetails nevershow
SetCompressor /SOLID lzma
SetCompressorDictSize 32
SetDatablockOptimize on
VIProductVersion "${major}.${minor}.${patch}.0"
VIAddVersionKey /LANG=1033 "ProductName" "归途 · LAST LIGHT"
VIAddVersionKey /LANG=1033 "FileDescription" "Last Light portable campaign demo"
VIAddVersionKey /LANG=1033 "ProductVersion" "${version}"
VIAddVersionKey /LANG=1033 "FileVersion" "${version}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Last Light original demo"
Section
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\\LastLight"
  File /r "${quoteNsis(releaseDirectory)}\\*.*"
  nsExec::ExecToStack /TIMEOUT=30000 '\"$SYSDIR\\icacls.exe\" \"$PLUGINSDIR\\LastLight\" /grant \"*S-1-15-2-1:(OI)(CI)(RX)\" /Q'
  Pop $1
  Pop $2
  StrCmp $1 "0" 0 launchFailed
  ; Leave the extracted directory before launch so it can be removed on exit.
  SetOutPath "$TEMP"
  ClearErrors
  ExecWait '\"$PLUGINSDIR\\LastLight\\归途.exe\"' $0
  IfErrors launchFailed
  SetErrorLevel $0
  Goto finished
launchFailed:
  ReadEnvStr $2 "LAST_LIGHT_QA_HIDDEN"
  StrCmp $2 "1" silentFailure
  MessageBox MB_ICONSTOP "Unable to start Last Light. Please try the directory release."
silentFailure:
  SetErrorLevel 1
finished:
SectionEnd
`;
    await fs.writeFile(nsiPath, '\ufeff' + nsi, 'utf8');
    await run(nsis, ['/V2', nsiPath]);
    if (await exists(portableFinal)) {
      const previous = path.join(releaseRoot, `.last-light-portable-previous-${runId}.exe`);
      assertGeneratedLocation(previous);
      await fs.rename(portableFinal, previous);
    }
    await fs.rename(portableStage, portableFinal);
    summary.portable = { path: portableName, bytes: (await fs.stat(portableFinal)).size, sha256: await hashFile(portableFinal) };
  }
  await fs.writeFile(path.join(releaseRoot, 'release-manifest.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Directory executable: ${path.join(releaseDirectory, '归途.exe')}`);
  if (summary.portable) console.log(`Portable executable: ${path.join(releaseRoot, summary.portable.path)}`);
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
