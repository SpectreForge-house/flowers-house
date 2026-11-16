const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const PORT = 5173;
const isDev = !app.isPackaged;
const projectDir = path.join(__dirname, '..');
const PID_FILE = path.join(projectDir, '.server.pid');
const distDir = path.join(projectDir, 'dist');

// Serve the built renderer through a privileged custom scheme instead of
// file:// so ES modules, history routing and relative assets work normally.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);


let mainWindow = null;
let serverProcess = null;
let serverStartedByUs = false;
let serverPid = null;
let cleanupDone = false;

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

function waitForServer(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const s = new net.Socket();
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - start > timeout) reject(new Error('Server startup timed out'));
        else setTimeout(check, 500);
      });
      s.connect(port, '127.0.0.1');
    };
    check();
  });
}

function readPidFile() {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function writePidFile(pid) {
  fs.writeFileSync(PID_FILE, String(pid), 'utf8');
}

function deletePidFile() {
  try { fs.unlinkSync(PID_FILE); } catch {}
}

function isProcessAlive(pid) {
  try {
    const out = execSync(`tasklist /fi "PID eq ${pid}" /nh`, { stdio: 'pipe', encoding: 'utf8', windowsHide: true });
    return out.includes(String(pid));
  } catch {
    return false;
  }
}

function killTree(pid) {
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
  } catch {}
}

function cleanupOrphanedServers() {
  const oldPid = readPidFile();
  if (oldPid && isProcessAlive(oldPid)) {
    killTree(oldPid);
  }
  deletePidFile();
}

async function startServer() {
  if (!isDev) return; // packaged builds use the app:// protocol
  cleanupOrphanedServers();

  const inUse = await isPortInUse(PORT);
  if (inUse) {
    serverStartedByUs = false;
    return;
  }

  serverProcess = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: projectDir,
    shell: true,
    stdio: 'ignore',
    detached: false,
  });

  serverStartedByUs = true;
  serverPid = serverProcess.pid;
  writePidFile(serverPid);

  serverProcess.on('error', (err) => {
    console.error('Server failed to start:', err.message);
    serverProcess = null;
    serverPid = null;
    deletePidFile();
  });

  serverProcess.on('exit', () => {
    serverProcess = null;
    serverPid = null;
    deletePidFile();
  });

  await waitForServer(PORT);

  // Spawn watchdog to kill server if Electron dies unexpectedly
  const watchdogPath = path.join(__dirname, 'watchdog.cjs');
  const watchdog = spawn('node', [watchdogPath, String(process.pid)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  watchdog.unref();
}

function stopServer() {
  if (cleanupDone) return;
  cleanupDone = true;

  if (!serverStartedByUs) {
    deletePidFile();
    return;
  }

  if (serverPid) {
    killTree(serverPid);
  }

  serverProcess = null;
  serverPid = null;
  serverStartedByUs = false;
  deletePidFile();
}

// ---------------------------------------------------------------------------
// Photo storage (client avatars, bouquet photos)
// Photos are stored as real files in <userData>/photos. The renderer only ever
// passes a plain filename - anything containing path separators, ".." or an
// unexpected extension is rejected, so a bad value can never reach outside the
// photos folder.
// ---------------------------------------------------------------------------
const PHOTO_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*\.[A-Za-z0-9]+$/;
const PHOTO_EXT_RE = /\.(jpe?g|png|webp)$/i;
const PHOTO_DATA_URL_RE = /^data:image\/(jpe?g|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_PHOTO_PAYLOAD_BYTES = 8 * 1024 * 1024;

let photosDir = null;

function getPhotosDir() {
  if (!photosDir) {
    photosDir = path.join(app.getPath('userData'), 'photos');
    fs.mkdirSync(photosDir, { recursive: true });
  }
  return photosDir;
}

function resolvePhotoPath(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 120) return null;
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) return null;
  if (!PHOTO_NAME_RE.test(name)) return null;
  if (!PHOTO_EXT_RE.test(name)) return null;

  const dir = getPhotosDir();
  const full = path.resolve(dir, name);
  // belt & braces: the resolved file must be a direct child of the photos folder
  if (path.dirname(full) !== dir) return null;
  return full;
}

function registerPhotoIpc() {
  ipcMain.handle('photos:save', async (_event, name, dataUrl) => {
    const target = resolvePhotoPath(name);
    if (!target) throw new Error('Invalid photo filename');

    const match = typeof dataUrl === 'string' ? PHOTO_DATA_URL_RE.exec(dataUrl) : null;
    if (!match) throw new Error('Invalid photo payload');

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0) throw new Error('Empty photo payload');
    if (buffer.length > MAX_PHOTO_PAYLOAD_BYTES) throw new Error('Photo file too large');

    await fs.promises.writeFile(target, buffer);
    return name;
  });

  ipcMain.handle('photos:read', async (_event, name) => {
    const target = resolvePhotoPath(name);
    if (!target) return null;
    try {
      const buffer = await fs.promises.readFile(target);
      const ext = path.extname(target).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch {
      // Missing or unreadable file -> renderer shows the placeholder.
      return null;
    }
  });

  ipcMain.handle('photos:remove', async (_event, name) => {
    const target = resolvePhotoPath(name);
    if (!target) return false;
    try {
      await fs.promises.unlink(target);
    } catch {
      // Already gone - deleting is idempotent.
    }
    return true;
  });
}

registerPhotoIpc();

// ---------------------------------------------------------------------------
// Backup folders. The renderer asks the main process to write/read whole
// backup folders on disk (one folder per backup with data.json + a copy of
// the photos folder). Every path is validated: the root folder must exist,
// backup folder names must match our naming pattern and must be a direct
// child of the chosen root - so a tampered IPC call can never read, write or
// delete anything outside the user's chosen backup folder.
// ---------------------------------------------------------------------------
const BACKUP_DIR_RE = /^backup-\d{4}-\d{2}-\d{2}-\d{4}$/;
const BACKUP_FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*\.[A-Za-z0-9]+$/;
const MAX_BACKUP_JSON_CHARS = 64 * 1024 * 1024;

function isValidFolderPath(folderPath) {
  return typeof folderPath === 'string' && folderPath.length > 0 && folderPath.length < 1024
    && !folderPath.includes('\0') && path.isAbsolute(folderPath);
}

// Resolves a validated backup subfolder inside the chosen root, or null.
function resolveBackupDir(folderPath, dirName) {
  if (!isValidFolderPath(folderPath)) return null;
  if (typeof dirName !== 'string' || !BACKUP_DIR_RE.test(dirName)) return null;
  const root = path.resolve(folderPath);
  const full = path.resolve(root, dirName);
  if (path.dirname(full) !== root) return null;
  return full;
}

function backupFolderName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

async function copyDirFiles(srcDir, destDir) {
  await fs.promises.mkdir(destDir, { recursive: true });
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue; // the photos folder only ever contains files
    await fs.promises.copyFile(path.join(srcDir, entry.name), path.join(destDir, entry.name));
  }
}

async function dirSizeBytes(dir) {
  let total = 0;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isFile()) total += (await fs.promises.stat(full)).size;
      else if (entry.isDirectory()) total += await dirSizeBytes(full);
    } catch {
      // A file disappearing mid-scan must not break the listing.
    }
  }
  return total;
}

async function assertFolderExists(folderPath) {
  if (!isValidFolderPath(folderPath)) throw new Error('Invalid backup folder');
  const stat = await fs.promises.stat(folderPath).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error('Backup folder not found');
}

async function listBackupDirs(folderPath) {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && BACKUP_DIR_RE.test(e.name))
    .map((e) => e.name)
    .sort(); // names sort chronologically, oldest first
}

async function pruneOldBackups(folderPath, keepCount) {
  const keep = Number.isInteger(keepCount) && keepCount >= 1 && keepCount <= 365 ? keepCount : 7;
  const dirs = await listBackupDirs(folderPath);
  const excess = dirs.slice(0, Math.max(0, dirs.length - keep)); // oldest first
  for (const name of excess) {
    // Only folders matching our naming pattern are ever deleted.
    await fs.promises.rm(path.join(folderPath, name), { recursive: true, force: true });
  }
  return excess.length;
}

function registerBackupIpc() {
  ipcMain.handle('backup:chooseFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose backup folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('backup:write', async (_event, folderPath, json, keepCount) => {
    await assertFolderExists(folderPath);

    if (typeof json !== 'string' || json.length === 0 || json.length > MAX_BACKUP_JSON_CHARS) {
      throw new Error('Invalid backup payload');
    }

    const dirName = backupFolderName();
    const dir = path.join(folderPath, dirName);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, 'data.json'), json, 'utf8');

    // Photos are copied as files; a photos failure must never lose the data
    // backup that was already written.
    try {
      await copyDirFiles(getPhotosDir(), path.join(dir, 'photos'));
    } catch (error) {
      console.error('[backup] Failed to copy photos folder:', error);
    }

    try {
      await pruneOldBackups(folderPath, keepCount);
    } catch (error) {
      console.error('[backup] Failed to prune old backups:', error);
    }

    return dirName;
  });

  ipcMain.handle('backup:list', async (_event, folderPath) => {
    await assertFolderExists(folderPath);
    const dirs = await listBackupDirs(folderPath);
    const result = [];
    for (const name of dirs) {
      const dir = path.join(folderPath, name);
      let sizeBytes = 0;
      let createdAt = new Date(0).toISOString();
      try {
        sizeBytes = await dirSizeBytes(dir);
        createdAt = new Date((await fs.promises.stat(dir)).mtimeMs).toISOString();
      } catch {
        // Unreadable folder - still list it so the user sees something is off.
      }
      result.push({ name, sizeBytes, createdAt });
    }
    result.sort((a, b) => b.name.localeCompare(a.name)); // newest first
    return result;
  });

  ipcMain.handle('backup:read', async (_event, folderPath, dirName) => {
    const dir = resolveBackupDir(folderPath, dirName);
    if (!dir) throw new Error('Invalid backup name');
    const file = path.join(dir, 'data.json');
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat || !stat.isFile() || stat.size > MAX_BACKUP_JSON_CHARS) {
      throw new Error('Backup data not found');
    }
    return await fs.promises.readFile(file, 'utf8');
  });

  ipcMain.handle('backup:restorePhotos', async (_event, folderPath, dirName) => {
    const dir = resolveBackupDir(folderPath, dirName);
    if (!dir) throw new Error('Invalid backup name');
    const src = path.join(dir, 'photos');
    const stat = await fs.promises.stat(src).catch(() => null);
    if (!stat || !stat.isDirectory()) return false; // backups without photos restore data only

    const dest = getPhotosDir();
    // Replace current photos with the backup's ones; only our own validated
    // filenames are removed, nothing else in the folder is touched.
    const old = await fs.promises.readdir(dest).catch(() => []);
    for (const name of old) {
      if (!BACKUP_FILE_NAME_RE.test(name)) continue;
      await fs.promises.unlink(path.join(dest, name)).catch(() => {});
    }
    await copyDirFiles(src, dest);
    return true;
  });
}

registerBackupIpc();

// ---------------------------------------------------------------------------
// Windows auto-update. electron-updater reads latest.yml from the newest
// GitHub release of the public repository configured under `publish` in
// electron-builder.yml. Disabled in dev, where app-update.yml does not exist.
// ---------------------------------------------------------------------------
function isNewerVersion(remote, current) {
  const toParts = (value) => String(value).split('.').map((part) => parseInt(part, 10) || 0);
  const next = toParts(remote);
  const currentParts = toParts(current);
  for (let i = 0; i < Math.max(next.length, currentParts.length, 3); i += 1) {
    const a = next[i] || 0;
    const b = currentParts[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function registerUpdateIpc() {
  let updater = null;
  let eventsReady = false;

  const getUpdater = () => {
    if (!updater) {
      // Bundled by scripts/build-updater.mjs so the installer does not need a
      // node_modules tree (see electron-builder.yml `files`).
      updater = require('./updater.bundle.cjs').autoUpdater;
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
    }
    return updater;
  };

  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  const ensureEvents = () => {
    if (eventsReady) return;
    const instance = getUpdater();
    eventsReady = true;
    instance.on('download-progress', (progress) => {
      send('update:progress', {
        percent: Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
        transferred: Number(progress?.transferred) || 0,
        total: Number(progress?.total) || 0,
        bytesPerSecond: Number(progress?.bytesPerSecond) || 0,
      });
    });
    instance.on('update-downloaded', (info) => {
      send('update:downloaded', {
        version: (info && info.version) || (instance.currentVersion && instance.currentVersion.version) || '',
      });
    });
    instance.on('error', (error) => {
      send('update:error', { message: (error && error.message) || String(error) });
    });
  };

  ipcMain.handle('update:version', () => app.getVersion());

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { supported: false, reason: 'dev' };
    const instance = getUpdater();
    ensureEvents();
    const result = await instance.checkForUpdates();
    const info = result && result.updateInfo;
    const current = (instance.currentVersion && instance.currentVersion.version) || app.getVersion();
    if (!info || !isNewerVersion(info.version, current)) {
      return { supported: true, available: false, version: current };
    }
    const primary = (info.files || []).find((file) => file && file.sha512) || (info.files || [])[0] || {};
    const notes = Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map((entry) => (entry && entry.note) || '').filter(Boolean).join('\n\n')
      : typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : '';
    return {
      supported: true,
      available: true,
      version: info.version,
      notes,
      sizeBytes: Number(primary.size) || 0,
    };
  });

  ipcMain.handle('update:download', async () => {
    if (!app.isPackaged) throw new Error('Updates are only available in the installed app');
    const instance = getUpdater();
    ensureEvents();
    await instance.downloadUpdate();
    return true;
  });

  ipcMain.handle('update:install', () => {
    if (!app.isPackaged) return false;
    const instance = getUpdater();
    // Let the IPC reply reach the renderer before the app quits.
    setTimeout(() => instance.quitAndInstall(true, true), 250);
    return true;
  });
}

registerUpdateIpc();

// ---------------------------------------------------------------------------
// Production renderer protocol. Files are served from dist/ through app://,
// with an index.html fallback for client-side routes.
// ---------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function registerAppProtocol() {
  if (isDev) return;

  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let relativePath = decodeURIComponent(url.pathname);
      if (relativePath === '/' || relativePath === '') relativePath = '/index.html';

      const resolved = path.resolve(distDir, `.${relativePath}`);
      const insideDist = resolved === distDir || resolved.startsWith(distDir + path.sep);
      if (!insideDist) {
        return new Response('Forbidden', { status: 403 });
      }

      let filePath = resolved;
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }

      // fs is asar-aware, unlike a plain file:// fetch.
      const data = await fs.promises.readFile(filePath);
      const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      return new Response(data, { headers: { 'content-type': contentType } });
    } catch (error) {
      console.error('[main] app protocol error:', error);
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: "Flower's House",
    icon: isDev ? path.join(projectDir, 'public', 'favicon.png') : undefined,
    webPreferences: {
      // Must live inside webPreferences - at the top level Electron silently
      // ignores it and the preload (photo + backup bridges) never loads.
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Windows layout switch (Alt+Shift) must not hand focus to the menu bar:
  // the default app menu reacts to the bare Alt press, the input blurs and
  // keystrokes stop reaching the form. Ignore only the bare Alt key so
  // AltGr / Ctrl+Alt combinations (e.g. typing €) still reach the renderer.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Alt' && !input.control && !input.meta) {
      event.preventDefault();
    }
  });

  if (isDev) {
    mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  } else {
    // Served by the app:// protocol handler above; no local web server needed.
    mainWindow.loadURL('app://bundle/');
  }

  mainWindow.on('close', () => {
    if (isDev) stopServer();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  getPhotosDir(); // make sure the photo folder exists from the very first run
  registerAppProtocol();
  if (isDev) await startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (isDev) stopServer();
  app.quit();
});

app.on('before-quit', () => {
  if (isDev) stopServer();
});

process.on('SIGINT', () => {
  if (isDev) stopServer();
  app.quit();
});

process.on('SIGTERM', () => {
  if (isDev) stopServer();
  app.quit();
});
