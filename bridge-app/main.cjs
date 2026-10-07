const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let win, tray, bridge;
const PORT = 8765;
const configDir = path.join(app.getPath('userData'));
const configPath = path.join(configDir, 'config.json');

function ensureConfig() {
  fs.mkdirSync(configDir, { recursive: true });
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      source: 'virtualdj',
      virtualdj: { baseUrl: 'http://127.0.0.1:80', bearer: '' },
      rekordbox: { historyFile: '' }
    }, null, 2));
  }
}
function bridgeScript() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bridge', 'server.mjs')
    : path.join(__dirname, '..', 'bridge', 'server.mjs');
}
function startBridge() {
  if (bridge) return;
  ensureConfig();
  bridge = spawn(process.execPath, [bridgeScript()], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DJRL_BRIDGE_CONFIG: configPath, PORT: String(PORT) },
    stdio: 'ignore'
  });
  bridge.on('exit', () => { bridge = null; });
}
function stopBridge() {
  if (bridge) { bridge.kill(); bridge = null; }
}
function createWindow() {
  win = new BrowserWindow({
    width: 900, height: 620, minWidth: 720, minHeight: 520,
    title: 'SI DJ Bridge',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('close', e => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
}
function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('SI DJ Bridge');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open SI DJ Bridge', click: () => { win.show(); win.focus(); } },
    { label: 'Start Bridge', click: startBridge },
    { label: 'Stop Bridge', click: stopBridge },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}
ipcMain.handle('bridge:status', async () => {
  try {
    const r = await fetch('http://127.0.0.1:'+PORT+'/health');
    return await r.json();
  } catch { return { connected:false, source:null, nowPlaying:null, error:'Bridge offline' }; }
});
ipcMain.handle('bridge:start', () => { startBridge(); return { ok:true }; });
ipcMain.handle('bridge:stop', () => { stopBridge(); return { ok:true }; });
ipcMain.handle('bridge:open-config', () => shell.openPath(configPath));
app.whenReady().then(() => { ensureConfig(); startBridge(); createWindow(); createTray(); });
app.on('before-quit', () => { app.isQuitting=true; stopBridge(); });
app.on('window-all-closed', e => e.preventDefault());
