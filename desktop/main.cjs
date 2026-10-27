const { app, BrowserWindow, Menu, session, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const qaPortText = process.env.LAST_LIGHT_QA_DEBUG_PORT || '';
const qaDebugPort = /^\d{4,5}$/.test(qaPortText) && Number(qaPortText) >= 1024 && Number(qaPortText) <= 65535
  ? Number(qaPortText) : null;
if (qaDebugPort !== null) {
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  app.commandLine.appendSwitch('remote-debugging-port', String(qaDebugPort));
}

app.setName('LastLight');
app.setAppUserModelId('studio.lastlight.demo');
app.setPath('userData', process.env.LAST_LIGHT_QA_PROFILE || path.join(app.getPath('appData'), 'LastLight'));
// QA keeps the native window and hardware audio silent while inspecting the
// same decoded game sounds through Web Audio, without a fabricated user click.
if (process.env.LAST_LIGHT_QA_HIDDEN) {
  app.commandLine.appendSwitch('mute-audio');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}
let mainWindow;
const entryFile = path.join(__dirname, '..', 'dist', 'index.html');
const entryUrl = pathToFileURL(entryFile).href;
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

function allowGamePermission(contents, permission) {
  if (process.env.LAST_LIGHT_QA_HIDDEN) return false;
  return Boolean(contents && contents === mainWindow?.webContents &&
    contents.getURL().split(/[?#]/)[0] === entryUrl &&
    ['pointerLock', 'fullscreen'].includes(permission));
}

function createWindow() {
  const {width, height} = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1600, width), height: Math.min(1000, height), minWidth: 960, minHeight: 600,
    title: '归途 · LAST LIGHT', backgroundColor: '#080c11',
    show: false, autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: !process.env.LAST_LIGHT_QA_HIDDEN,
      webSecurity: true, devTools: !app.isPackaged || qaDebugPort !== null,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl.split(/[?#]/)[0] !== entryUrl) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!process.env.LAST_LIGHT_QA_HIDDEN && input.type === 'keyDown' && input.key === 'F11' && !input.isAutoRepeat) {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });
  mainWindow.once('ready-to-show', () => { if (!process.env.LAST_LIGHT_QA_HIDDEN) { mainWindow.maximize(); mainWindow.show(); } });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(entryFile, process.env.LAST_LIGHT_QA_HIDDEN || qaDebugPort !== null ? {query:{qa:'1'}} : {});
}

if (singleInstance) app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(allowGamePermission(contents, permission)));
  session.defaultSession.setPermissionCheckHandler((contents, permission) => allowGamePermission(contents, permission));
  createWindow();
});
app.on('second-instance', () => {
  if (process.env.LAST_LIGHT_QA_HIDDEN) return;
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.on('window-all-closed', () => app.quit());
