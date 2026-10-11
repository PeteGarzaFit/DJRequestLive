const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sidjBridge', {
  status: () => ipcRenderer.invoke('bridge:status'),
  start: () => ipcRenderer.invoke('bridge:start'),
  stop: () => ipcRenderer.invoke('bridge:stop'),
  openConfig: () => ipcRenderer.invoke('bridge:open-config'),
  onPairingResult: (callback) => ipcRenderer.on('bridge:pairing-result', (_event, result) => callback(result))
});
