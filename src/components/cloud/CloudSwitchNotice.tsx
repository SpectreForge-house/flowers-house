import { useState } from 'react';
import { Cloud, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { CLOUD_SWITCH_NOTICE_KEY } from './AutoCloudSwitch';

/**
 * One-time notice after the automatic local → cloud switch, shown only when
 * local records still exist and can be uploaded to Supabase.
 */
export function CloudSwitchNotice() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { can } = usePermissions();
  const [visible, setVisible] = useState(() => {
    try {
      return sessionStorage.getItem(CLOUD_SWITCH_NOTICE_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!visible || !user || !can('manageCloud')) return null;

  const dismiss = () => {
    try {
      sessionStorage.removeItem(CLOUD_SWITCH_NOTICE_KEY);
    } catch {
      // Ignore storage errors; hiding the notice is enough.
    }
    setVisible(false);
  };

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-lg border border-accent-green bg-surface p-3"
    >
      <Cloud size={18} className="mt-0.5 shrink-0 text-accent-green-light" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{t.cloudSwitch.noticeTitle}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{t.cloudSwitch.noticeBody}</p>
        <Link
          to="/settings"
          onClick={dismiss}
          className="mt-2 inline-block text-sm font-medium text-accent-green-light hover:text-accent-green"
        >
          {t.cloudSwitch.noticeAction}
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded p-1 text-text-muted hover:bg-hover hover:text-text-primary"
        title={t.common.close}
      >
        <X size={16} />
      </button>
    </div>
  );
}
