import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ApkUpdater } from './apkUpdater';

/**
 * In-app updates.
 *
 * - Windows (installed app): electron-updater reads latest.yml from GitHub
 *   Releases and installs the new NSIS build on restart.
 * - Android (APK): the APK is fetched from the newest GitHub release with
 *   DownloadManager, checked against the published SHA-256 and passed to the
 *   system installer. Android always asks for one confirmation.
 * - Web/PWA: no self-update; the browser reloads the hosted build.
 *
 * The repository must stay public: the GitHub API is called without a token.
 */
export const RELEASES_REPO = 'SpectreForge-house/flowers-house';
const RELEASES_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`;

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CHECK_STORAGE_KEY = 'flower-shop-update-check-at';
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

export type UpdatePlatform = 'windows' | 'android' | 'web';

export interface UpdateInfo {
  version: string;
  notes: string;
  sizeBytes: number;
  platform: UpdatePlatform;
  downloadUrl?: string;
  sha256?: string;
  fileName?: string;
}

export type UpdateCheckResult =
  | { status: 'available'; info: UpdateInfo }
  | { status: 'latest'; version: string }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

interface GitHubAsset {
  name: string;
  size: number;
  browser_download_url: string;
  digest?: string | null;
}

interface GitHubRelease {
  tag_name: string;
  body?: string | null;
  prerelease?: boolean;
  draft?: boolean;
  assets?: GitHubAsset[];
}

export function getUpdatePlatform(): UpdatePlatform {
  if (typeof window !== 'undefined' && window.flowerUpdater) return 'windows';
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return 'android';
  return 'web';
}

export function supportsUpdates(): boolean {
  return getUpdatePlatform() !== 'web';
}

export async function getCurrentVersion(): Promise<string> {
  const platform = getUpdatePlatform();
  if (platform === 'windows' && window.flowerUpdater) {
    try {
      return await window.flowerUpdater.getVersion();
    } catch {
      return __APP_VERSION__;
    }
  }
  if (platform === 'android') {
    try {
      const info = await App.getInfo();
      return info.version || __APP_VERSION__;
    } catch {
      return __APP_VERSION__;
    }
  }
  return __APP_VERSION__;
}

/** Numeric comparison of dotted versions ("1.2.10" > "1.2.9"). */
export function isNewerVersion(remote: string, current: string): boolean {
  const toParts = (value: string) => value.replace(/^v/i, '').split('.').map(part => parseInt(part, 10) || 0);
  const next = toParts(remote);
  const base = toParts(current);
  const length = Math.max(next.length, base.length, 3);
  for (let i = 0; i < length; i += 1) {
    const a = next[i] || 0;
    const b = base[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function shortNotes(body?: string | null): string {
  if (!body) return '';
  const cleaned = body.replace(/\r/g, '').trim();
  return cleaned.length > 1500 ? `${cleaned.slice(0, 1500)}…` : cleaned;
}

function sha256FromDigest(digest?: string | null): string | undefined {
  if (!digest) return undefined;
  const match = /^sha256:([a-f0-9]{64})$/i.exec(digest.trim());
  return match ? match[1].toLowerCase() : undefined;
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const response = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`GitHub API responded with ${response.status}`);
  }
  const data = (await response.json()) as GitHubRelease;
  if (!data || !data.tag_name) {
    throw new Error('Unexpected GitHub release payload');
  }
  return data;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const platform = getUpdatePlatform();

  if (platform === 'web') return { status: 'unsupported' };

  if (platform === 'windows') {
    if (!window.flowerUpdater) return { status: 'unsupported' };
    try {
      const result = await window.flowerUpdater.check();
      if (!result.supported) return { status: 'unsupported' };
      if (!result.available || !result.version) {
        return { status: 'latest', version: result.version || (await getCurrentVersion()) };
      }
      return {
        status: 'available',
        info: {
          version: result.version,
          notes: shortNotes(result.notes),
          sizeBytes: result.sizeBytes || 0,
          platform,
        },
      };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }

  try {
    const [current, release] = await Promise.all([getCurrentVersion(), fetchLatestRelease()]);
    const version = String(release.tag_name).replace(/^v/i, '');
    if (release.draft || release.prerelease) {
      return { status: 'latest', version: current };
    }
    if (!isNewerVersion(version, current)) {
      return { status: 'latest', version };
    }
    const asset = (release.assets || []).find(entry => /\.apk$/i.test(entry.name));
    if (!asset) {
      return { status: 'error', message: 'The release has no APK asset' };
    }
    return {
      status: 'available',
      info: {
        version,
        notes: shortNotes(release.body),
        sizeBytes: asset.size,
        platform,
        downloadUrl: asset.browser_download_url,
        sha256: sha256FromDigest(asset.digest),
        fileName: asset.name,
      },
    };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/** True when the automatic once-a-day check is due. */
export function shouldAutoCheck(): boolean {
  if (!supportsUpdates()) return false;
  try {
    const last = Number(localStorage.getItem(CHECK_STORAGE_KEY) || 0);
    if (!Number.isFinite(last) || last <= 0) return true;
    return Date.now() - last >= UPDATE_CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

export function markChecked(): void {
  try {
    localStorage.setItem(CHECK_STORAGE_KEY, String(Date.now()));
  } catch {
    // Private mode / storage disabled - the next launch simply checks again.
  }
}

export interface AndroidInstallResult {
  started: boolean;
  needPermission: boolean;
}

export async function downloadAndroidUpdate(
  info: UpdateInfo,
  onProgress: (percent: number) => void,
): Promise<{ fileName: string }> {
  if (!info.downloadUrl || !info.fileName) {
    throw new Error('The update asset is missing a download URL');
  }

  const started = await ApkUpdater.download({ url: info.downloadUrl, fileName: info.fileName });
  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;

  for (;;) {
    const status = await ApkUpdater.status({ id: started.id });
    if (status.total > 0) {
      onProgress(Math.min(1, Math.max(0, status.bytes / status.total)));
    }
    if (status.state === 'successful') {
      onProgress(1);
      return { fileName: started.fileName };
    }
    if (status.state === 'failed') {
      throw new Error(status.reason ? `Download failed (${status.reason})` : 'Download failed');
    }
    if (Date.now() > deadline) {
      throw new Error('The download took too long');
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

export async function installAndroidUpdate(fileName: string, sha256?: string): Promise<AndroidInstallResult> {
  const result = await ApkUpdater.install({ fileName, sha256 });
  return { started: Boolean(result.started), needPermission: Boolean(result.needPermission) };
}

export async function openAndroidInstallSettings(): Promise<void> {
  await ApkUpdater.openInstallSettings();
}
