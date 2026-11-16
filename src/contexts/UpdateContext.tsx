import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import {
  UpdateInfo,
  checkForUpdate,
  downloadAndroidUpdate,
  getCurrentVersion,
  getUpdatePlatform,
  installAndroidUpdate,
  markChecked,
  openAndroidInstallSettings,
  shouldAutoCheck,
} from '../services/updateService';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'permission'
  | 'up-to-date'
  | 'unsupported'
  | 'error';

interface UpdateContextValue {
  phase: UpdatePhase;
  info: UpdateInfo | null;
  progress: number;
  error: string;
  currentVersion: string;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  check: (options?: { silent?: boolean }) => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  requestInstallPermission: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | undefined>(undefined);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [currentVersion, setCurrentVersion] = useState(__APP_VERSION__);
  const [isOpen, setIsOpen] = useState(false);
  const androidFile = useRef<string>('');
  const checking = useRef(false);

  useEffect(() => {
    void getCurrentVersion().then(setCurrentVersion).catch(() => {});
  }, []);

  // electron-updater reports progress and completion from the main process.
  useEffect(() => {
    const bridge = window.flowerUpdater;
    if (!bridge) return;
    const offProgress = bridge.onProgress(event => {
      setProgress(Math.max(0, Math.min(1, (event.percent || 0) / 100)));
    });
    const offDownloaded = bridge.onDownloaded(() => {
      setProgress(1);
      setPhase('ready');
    });
    const offError = bridge.onError(event => {
      setError(event.message || 'Update error');
      setPhase('error');
    });
    return () => {
      offProgress();
      offDownloaded();
      offError();
    };
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
    if (phase === 'idle') void (async () => {
      setPhase('checking');
      const result = await checkForUpdate();
      if (result.status === 'available') {
        setInfo(result.info);
        setPhase('available');
        markChecked();
      } else if (result.status === 'latest') {
        setCurrentVersion(result.version);
        setPhase('up-to-date');
        markChecked();
      } else if (result.status === 'unsupported') {
        setPhase('unsupported');
      } else {
        setError(result.message);
        setPhase('error');
      }
    })();
  }, [phase]);

  const close = useCallback(() => {
    setIsOpen(false);
    if (phase === 'up-to-date' || phase === 'unsupported' || phase === 'error') {
      setPhase(info ? 'available' : 'idle');
    }
  }, [phase, info]);

  const check = useCallback(async (options?: { silent?: boolean }) => {
    if (checking.current) return;
    checking.current = true;
    try {
      setError('');
      if (!options?.silent) {
        setIsOpen(true);
        setPhase('checking');
      }
      const result = await checkForUpdate();
      if (result.status === 'available') {
        setInfo(result.info);
        setIsOpen(true);
        setPhase('available');
        markChecked();
      } else if (result.status === 'latest') {
        setCurrentVersion(result.version);
        markChecked();
        if (!options?.silent) {
          setIsOpen(true);
          setPhase('up-to-date');
        }
      } else if (result.status === 'unsupported') {
        if (!options?.silent) {
          setIsOpen(true);
          setPhase('unsupported');
        }
      } else if (!options?.silent) {
        setError(result.message);
        setIsOpen(true);
        setPhase('error');
      }
    } finally {
      checking.current = false;
    }
  }, []);

  // One automatic check per day on the installed desktop/mobile app.
  useEffect(() => {
    if (!shouldAutoCheck()) return;
    const timer = setTimeout(() => void check({ silent: true }), 4000);
    return () => clearTimeout(timer);
  }, [check]);

  const download = useCallback(async () => {
    if (!info) return;
    setError('');
    setProgress(0);
    setPhase('downloading');

    if (info.platform === 'windows') {
      if (!window.flowerUpdater) {
        setError('Updater bridge is not available');
        setPhase('error');
        return;
      }
      try {
        await window.flowerUpdater.download();
        setProgress(1);
        setPhase('ready');
      } catch (downloadError) {
        setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
        setPhase('error');
      }
      return;
    }

    try {
      const file = await downloadAndroidUpdate(info, percent => setProgress(percent));
      androidFile.current = file.fileName;
      const result = await installAndroidUpdate(file.fileName, info.sha256);
      if (result.started) {
        setPhase('installing');
      } else {
        setPhase('permission');
      }
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
      setPhase('error');
    }
  }, [info]);

  const install = useCallback(async () => {
    if (!info) return;
    if (info.platform === 'windows') {
      await window.flowerUpdater?.install();
      return;
    }
    try {
      const result = await installAndroidUpdate(androidFile.current, info.sha256);
      setPhase(result.started ? 'installing' : 'permission');
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
      setPhase('error');
    }
  }, [info]);

  const requestInstallPermission = useCallback(async () => {
    try {
      await openAndroidInstallSettings();
    } catch (permissionError) {
      setError(permissionError instanceof Error ? permissionError.message : String(permissionError));
      setPhase('error');
    }
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        phase,
        info,
        progress,
        error,
        currentVersion,
        isOpen,
        open,
        close,
        check,
        download,
        install,
        requestInstallPermission,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate() {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdate must be used within an UpdateProvider');
  }
  return context;
}

export { getUpdatePlatform };
