const { contextBridge, ipcRenderer } = require('electron');
const { version } = require('../package.json');

/**
 * De enige brug tussen de app en het besturingssysteem. Bewust klein gehouden:
 * alleen wat de renderer echt nodig heeft, en geen directe toegang tot Node.
 */
contextBridge.exposeInMainWorld('pathfinder', {
  platform: 'desktop',
  appVersion: version,

  secretGet: (key) => ipcRenderer.invoke('secret:get', key),
  secretSet: (key, value) => ipcRenderer.invoke('secret:set', key, value),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),

  configureUpdater: (token) => ipcRenderer.invoke('updater:configure', token),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:event', listener);
    return () => ipcRenderer.off('updater:event', listener);
  },
});
