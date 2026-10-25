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
