import { registerPlugin } from '@capacitor/core';

export interface ApkDownloadStart {
  id: number;
  fileName: string;
}

export type ApkDownloadState = 'pending' | 'running' | 'paused' | 'successful' | 'failed';

export interface ApkDownloadStatus {
  state: ApkDownloadState;
  bytes: number;
  total: number;
  reason?: string;
}

export interface ApkInstallResult {
  started: boolean;
  needPermission?: boolean;
}

export interface ApkUpdaterPlugin {
  getInfo(): Promise<{ versionName: string; versionCode: number; canInstall: boolean }>;
  download(options: { url: string; fileName: string }): Promise<ApkDownloadStart>;
  status(options: { id: number }): Promise<ApkDownloadStatus>;
  install(options: { fileName: string; sha256?: string }): Promise<ApkInstallResult>;
  openInstallSettings(): Promise<void>;
}

// Native bridge implemented in android/app/src/main/java/com/flowershouse/app/ApkUpdaterPlugin.java.
// Calling it outside Android throws, so it is only used from the update service
// after the platform check.
export const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');
