import { createBackup, restoreBackup } from './storage';
import { recordHistory } from './historyService';

// ---------------------------------------------------------------------------
// Automatic backup (desktop app only).
//
// The renderer prepares the data export (JSON without embedded photo files)
// and hands it to the Electron main process through the narrow `flowerBackup`
// bridge (see electron/preload.cjs). The main process writes one folder per
// backup - `backup-YYYY-MM-DD-HHmm/data.json` plus a copy of the photos
// folder - into the user-chosen backup folder, and prunes the oldest backup
// folders beyond the keep limit.
//
// The settings (enabled, folder, keep count, last backup time) live in their
// own localStorage key that is deliberately NOT part of the backup payload,
// so restoring a backup never moves the backup folder of this machine.
// ---------------------------------------------------------------------------

export interface AutoBackupSettings {
  enabled: boolean;
  folderPath: string | null;
  keepCount: number;
  /** ms epoch of the last successful backup; null = never */
  lastBackupAt: number | null;
}

const BACKUP_SETTINGS_KEY = 'flower-shop-backup-settings';
const BACKUP_WARNING_DISMISSED_KEY = 'flower-shop-backup-warning-dismissed';
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BACKUP_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_SETTINGS: AutoBackupSettings = {
  enabled: false,
  folderPath: null,
  keepCount: 7,
  lastBackupAt: null,
};

function getBridge(): NonNullable<Window['flowerBackup']> | null {
  return typeof window !== 'undefined' && window.flowerBackup ? window.flowerBackup : null;
}

/** Reads the persisted settings, falling back to safe defaults on any garbage. */
export function getAutoBackupSettings(): AutoBackupSettings {
  try {
    const raw = localStorage.getItem(BACKUP_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled === true,
      folderPath: typeof parsed.folderPath === 'string' && parsed.folderPath.length > 0 ? parsed.folderPath : null,
      keepCount: Number.isInteger(parsed.keepCount) && parsed.keepCount >= 1 && parsed.keepCount <= 365
        ? parsed.keepCount
        : DEFAULT_SETTINGS.keepCount,
      lastBackupAt: typeof parsed.lastBackupAt === 'number' && parsed.lastBackupAt > 0 ? parsed.lastBackupAt : null,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAutoBackupSettings(patch: Partial<AutoBackupSettings>): AutoBackupSettings {
  const next = { ...getAutoBackupSettings(), ...patch };
  localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/** The user hid the stale-backup banner on the Home page. */
export function isBackupWarningDismissed(): boolean {
  try {
    return localStorage.getItem(BACKUP_WARNING_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissBackupWarning(): void {
  try {
    localStorage.setItem(BACKUP_WARNING_DISMISSED_KEY, 'true');
  } catch {
    // Storage can be unavailable in private mode; the banner simply stays visible.
  }
}

function clearBackupWarningDismissed(): void {
  try {
    localStorage.removeItem(BACKUP_WARNING_DISMISSED_KEY);
  } catch {
    // Nothing to do - the next stale warning is harmless.
  }
}

/** Records a successful backup (automatic or manual) and resets the Home warning. */
export function markBackupCompleted(): void {
  saveAutoBackupSettings({ lastBackupAt: Date.now() });
  clearBackupWarningDismissed();
}

/** The backup bridge only exists inside the Electron window. */
export function isAutoBackupAvailable(): boolean {
  return getBridge() !== null;
}

/** Opens the native folder dialog; returns the chosen path or null on cancel. */
export async function chooseBackupFolder(): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  return await bridge.chooseFolder();
}

export interface BackupFolderEntry {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

/** Lists backup folders (newest first) in the chosen backup folder. */
export async function listBackupFolders(): Promise<BackupFolderEntry[]> {
  const bridge = getBridge();
  const { folderPath } = getAutoBackupSettings();
  if (!bridge || !folderPath) return [];
  return await bridge.list(folderPath);
}

/**
 * Writes one backup folder (data.json + photos copy) and updates the
 * last-backup timestamp. Throws on failure so callers can show a clear
 * error - a failed backup never crashes the app.
 */
export async function runBackupNow(): Promise<string> {
  const bridge = getBridge();
  if (!bridge) throw new Error('Automatic backup is not available');
  const { folderPath, keepCount } = getAutoBackupSettings();
  if (!folderPath) throw new Error('Backup folder is not selected');

  // Data without embedded photo files: the main process copies the photos
  // folder itself right next to data.json.
  const backup = await createBackup({ includePhotos: false });
  const dirName = await bridge.write(folderPath, JSON.stringify(backup), keepCount);

  markBackupCompleted();
  recordHistory('backup_created', 'backup', dirName, `Automatic backup created: ${dirName}`);
  return dirName;
}

/**
 * Runs once on app start: makes a backup when automatic backup is enabled
 * and the last one is older than 24 hours. Failures are only logged - the
 * Home page shows a warning when backups get stale, so a broken folder
 * can never crash the app.
 */
export async function maybeRunAutoBackup(): Promise<void> {
  try {
    if (!isAutoBackupAvailable()) return;
    const { enabled, folderPath, lastBackupAt } = getAutoBackupSettings();
    if (!enabled || !folderPath) return;
    if (lastBackupAt && Date.now() - lastBackupAt < AUTO_BACKUP_INTERVAL_MS) return;
    await runBackupNow();
  } catch (error) {
    console.error('[backupService] Automatic backup on start failed:', error);
  }
}

/** True when no successful backup exists yet or the last one is older than 7 days. */
export function isBackupStale(): boolean {
  const { lastBackupAt } = getAutoBackupSettings();
  if (!lastBackupAt) return true;
  return Date.now() - lastBackupAt > BACKUP_STALE_AFTER_MS;
}

/**
 * Restores the given backup folder: first creates a safety backup of the
 * current data (aborting if that fails), then replaces the photo files on
 * disk and the app data, then the caller reloads the app.
 */
export async function restoreFromBackup(dirName: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge) throw new Error('Automatic backup is not available');
  const { folderPath } = getAutoBackupSettings();
  if (!folderPath) throw new Error('Backup folder is not selected');

  // 1. Safety backup of the current state - must succeed before anything is
  //    replaced, otherwise we stop with the original data untouched.
  try {
    await runBackupNow();
  } catch (error) {
    console.error('[backupService] Safety backup failed:', error);
    throw new Error('safety-backup-failed');
  }

  // 2. Read and validate the chosen backup.
  const json = await bridge.read(folderPath, dirName);
  const backup = JSON.parse(json);
  if (!backup.version || !backup.createdAt || !backup.customers || !backup.inventory) {
    throw new Error('invalid-backup');
  }

  // 3. Photo files on disk first, then app data (with the photo index from
  //    data.json). A missing photos folder in the backup restores data only.
  await bridge.restorePhotos(folderPath, dirName);
  await restoreBackup(backup);

  recordHistory('backup_restored', 'backup', dirName, `Backup restored from: ${dirName}`);
}
