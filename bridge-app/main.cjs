const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let win, tray, bridge;
const PORT = 8765;
const configDir = path.join(app.getPath('userData'));
const configPath = path.join(configDir, 'config.json');

function defaultConfig() {
  return {
    source: 'virtualdj-history',
    virtualdjHistory: {
      historyFile: path.join(os.homedir(), 'Library', 'Application Support', 'VirtualDJ', 'History', 'tracklist.txt')
    },
    rekordbox: { historyFile: '' }
  };
}

function ensureConfig() {
  fs.mkdirSync(configDir, { recursive: true });

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig(), null, 2));
    return;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const actualVdjHistory = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'VirtualDJ',
      'History',
      'tracklist.txt'
    );
    const configuredHistory = config.virtualdjHistory?.historyFile;
    const needsMigration =
      config.source === 'virtualdj' ||
      !!config.virtualdj ||
      !configuredHistory ||
      !fs.existsSync(configuredHistory);

    if (needsMigration) {
      const migrated = {
        source: 'virtualdj-history',
        virtualdjHistory: { historyFile: actualVdjHistory },
        rekordbox: config.rekordbox || { historyFile: '' }
      };
      fs.writeFileSync(configPath, JSON.stringify(migrated, null, 2));
    }
  } catch {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig(), null, 2));
  }
}

function bridgeScript() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bridge', 'server.mjs')
    : path.join(__dirname, '..', 'bridge', 'server.mjs');
}

function startBridge() {
  if (bridge && !bridge.killed) return;

  ensureConfig();
  bridge = spawn(process.execPath, [bridgeScript()], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DJRL_BRIDGE_CONFIG: configPath,
      PORT: String(PORT)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  bridge.stdout.on('data', data => console.log('[Bridge]', data.toString().trim()));
  bridge.stderr.on('data', data => console.error('[Bridge]', data.toString().trim()));
  bridge.on('error', err => {
    console.error('[Bridge process error]', err);
    bridge = null;
  });
  bridge.on('exit', (code, signal) => {
    console.log('[Bridge exited]', { code, signal });
    bridge = null;
  });
}

function stopBridge() {
  if (bridge) {
    bridge.kill();
    bridge = null;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 720,
    minHeight: 520,
    title: 'SI DJ Bridge',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('close', e => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
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
    const r = await fetch('http://127.0.0.1:' + PORT + '/health');
    return await r.json();
  } catch {
    return { connected: false, source: null, nowPlaying: null, error: 'Bridge offline' };
  }
});

ipcMain.handle('bridge:start', () => {
  startBridge();
  return { ok: true };
});

ipcMain.handle('bridge:stop', () => {
  stopBridge();
  return { ok: true };
});

ipcMain.handle('bridge:open-config', () => {
  ensureConfig();
  return shell.openPath(configPath);
});

app.whenReady().then(() => {
  ensureConfig();
  startBridge();
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopBridge();
});

app.on('window-all-closed', e => e.preventDefault());
