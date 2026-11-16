// Narrow bridge for photo files. The renderer never gets fs access:
// it can only ask the main process to save/read/remove a photo, and the main
// process re-validates every filename (see isSafePhotoName in main.cjs).
// contextIsolation stays enabled, no nodeIntegration in the renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowerPhotos', {
  save: (name, dataUrl) => ipcRenderer.invoke('photos:save', name, dataUrl),
  read: (name) => ipcRenderer.invoke('photos:read', name),
  remove: (name) => ipcRenderer.invoke('photos:remove', name),
});

// Narrow bridge for automatic backups. The renderer only passes a folder
// path, the JSON payload and validated backup names; the main process
// re-validates everything (see registerBackupIpc in main.cjs).
contextBridge.exposeInMainWorld('flowerBackup', {
  chooseFolder: () => ipcRenderer.invoke('backup:chooseFolder'),
  write: (folderPath, json, keepCount) => ipcRenderer.invoke('backup:write', folderPath, json, keepCount),
  list: (folderPath) => ipcRenderer.invoke('backup:list', folderPath),
  read: (folderPath, dirName) => ipcRenderer.invoke('backup:read', folderPath, dirName),
  restorePhotos: (folderPath, dirName) => ipcRenderer.invoke('backup:restorePhotos', folderPath, dirName),
});

// Auto-update bridge (electron-updater runs in the main process). The renderer
// only triggers check/download/install and listens for progress; it never gets
// filesystem or process access.
const subscribe = (channel, callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('flowerUpdater', {
  getVersion: () => ipcRenderer.invoke('update:version'),
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  onProgress: (callback) => subscribe('update:progress', callback),
  onDownloaded: (callback) => subscribe('update:downloaded', callback),
  onError: (callback) => subscribe('update:error', callback),
});
