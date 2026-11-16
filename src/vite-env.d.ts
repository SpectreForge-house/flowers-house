/// <reference types="vite/client" />

/** Injected by vite.config.ts from package.json. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (error: any) => void
  }

  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>
}

// Photo file bridge exposed by electron/preload.cjs (contextIsolated renderer).
// Only present when the app runs inside the Electron window; in a plain browser
// tab the app falls back to IndexedDB (see src/services/photoStorage.ts).
// flowerBackup is the automatic-backup bridge (see src/services/backupService.ts).
interface Window {
  flowerPhotos?: {
    save(name: string, dataUrl: string): Promise<string>;
    read(name: string): Promise<string | null>;
    remove(name: string): Promise<boolean>;
  };
  flowerBackup?: {
    chooseFolder(): Promise<string | null>;
    write(folderPath: string, json: string, keepCount: number): Promise<string>;
    list(folderPath: string): Promise<{ name: string; sizeBytes: number; createdAt: string }[]>;
    read(folderPath: string, dirName: string): Promise<string>;
    restorePhotos(folderPath: string, dirName: string): Promise<boolean>;
  };
  // Auto-update bridge (see electron/preload.cjs and src/services/updateService.ts).
  flowerUpdater?: {
    getVersion(): Promise<string>;
    check(): Promise<{
      supported: boolean;
      available?: boolean;
      version?: string;
      notes?: string;
      sizeBytes?: number;
      reason?: string;
    }>;
    download(): Promise<boolean>;
    install(): Promise<boolean>;
    onProgress(callback: (progress: {
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    }) => void): () => void;
    onDownloaded(callback: (info: { version: string }) => void): () => void;
    onError(callback: (info: { message: string }) => void): () => void;
  };
}
