import { CheckCircle2, Download, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useLanguage } from '../../i18n';
import { useUpdate } from '../../contexts/UpdateContext';
import { RELEASES_PAGE } from '../../services/updateService';

function formatSize(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function UpdateDialog() {
  const { t } = useLanguage();
  const {
    phase,
    info,
    progress,
    error,
    currentVersion,
    isOpen,
    close,
    download,
    install,
    requestInstallPermission,
    check,
  } = useUpdate();

  const title = (() => {
    switch (phase) {
      case 'checking':
        return t.updates.checkingTitle;
      case 'up-to-date':
        return t.updates.upToDateTitle;
      case 'unsupported':
        return t.updates.unsupportedTitle;
      case 'error':
        return t.updates.errorTitle;
      default:
        return t.updates.availableTitle;
    }
  })();

  const showClose = phase !== 'downloading';

  return (
    <Modal isOpen={isOpen} onClose={showClose ? close : () => {}} title={title} size="md" closeOnBackdrop={showClose}>
      {phase === 'checking' && (
        <div className="flex items-center gap-3 py-4 text-text-secondary">
          <RefreshCw size={18} className="animate-spin" />
          <span className="text-sm">{t.updates.checking}</span>
        </div>
      )}

      {phase === 'available' && info && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {t.updates.availableBody
              .replace('{version}', info.version)
              .replace('{current}', currentVersion)}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
            <span>{t.updates.currentVersion}: {currentVersion}</span>
            {info.sizeBytes > 0 && <span>{formatSize(info.sizeBytes)}</span>}
          </div>
          {info.notes && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">{t.updates.releaseNotes}</p>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-surface border border-border p-3 text-xs text-text-secondary">
                {info.notes}
              </pre>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={close}>{t.updates.later}</Button>
            <Button onClick={() => void download()}>
              <Download size={16} />
              {info.platform === 'android' ? t.updates.downloadInstall : t.updates.download}
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            {info.platform === 'android' ? t.updates.hintAndroid : t.updates.hintWindows}
          </p>
        </div>
      )}

      {phase === 'downloading' && (
        <div className="space-y-3 py-2">
          <p className="text-sm text-text-secondary">{t.updates.downloading}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface border border-border">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${Math.max(3, Math.round(progress * 100))}%` }}
            />
          </div>
          <p className="text-xs text-text-muted text-right">{Math.round(progress * 100)}%</p>
        </div>
      )}

      {phase === 'ready' && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t.updates.downloadedBody}</p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={close}>{t.updates.later}</Button>
            <Button onClick={() => void install()}>
              <RefreshCw size={16} />
              {t.updates.restartInstall}
            </Button>
          </div>
        </div>
      )}

      {phase === 'installing' && (
        <div className="space-y-3 py-2">
          <p className="text-sm text-text-secondary">{t.updates.installing}</p>
          <p className="text-xs text-text-muted">{t.updates.installingHint}</p>
          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={close}>{t.common.close}</Button>
          </div>
        </div>
      )}

      {phase === 'permission' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <ShieldAlert size={18} className="text-accent-2 shrink-0 mt-0.5" />
            <p className="text-sm text-text-secondary">{t.updates.permissionBody}</p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={close}>{t.updates.later}</Button>
            <Button variant="secondary" onClick={() => void requestInstallPermission()}>
              {t.updates.permissionOpen}
            </Button>
            <Button onClick={() => void install()}>
              <Download size={16} />
              {t.updates.permissionRetry}
            </Button>
          </div>
        </div>
      )}

      {phase === 'up-to-date' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="text-accent-green-light shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm text-text-secondary">{t.updates.upToDate}</p>
              <p className="text-xs text-text-muted">{t.updates.currentVersion}: {currentVersion}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={close}>{t.common.close}</Button>
          </div>
        </div>
      )}

      {phase === 'unsupported' && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t.updates.unsupported}</p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={close}>{t.common.close}</Button>
            <Button variant="secondary" onClick={() => window.open(RELEASES_PAGE, '_blank', 'noopener')}>
              {t.updates.openReleases}
            </Button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <TriangleAlert size={18} className="text-accent-2 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm text-text-secondary">{t.updates.errorBody}</p>
              {error && <p className="text-xs text-text-muted break-words">{error}</p>}
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={close}>{t.common.close}</Button>
            <Button variant="secondary" onClick={() => void check()}>
              <RefreshCw size={16} />
              {t.updates.retry}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
