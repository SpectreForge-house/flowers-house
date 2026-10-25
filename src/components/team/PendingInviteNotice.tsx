import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../../i18n';
import {
  clearPendingInviteError,
  getPendingInviteError,
  PENDING_INVITE_ERROR_EVENT,
} from '../../services/pendingInvite';

function errorMessage(code: string, t: ReturnType<typeof useLanguage>['t']): string {
  switch (code) {
    case 'not_found':
      return t.team.joinNotFound;
    case 'expired':
      return t.team.joinExpired;
    case 'revoked':
      return t.team.joinRevoked;
    case 'used':
      return t.team.joinUsed;
    case 'email_mismatch':
      return t.team.joinEmailMismatch;
    case 'shop_not_empty':
      return t.team.joinShopNotEmpty;
    case 'already_member_other_shop':
      return t.team.joinAlreadyMember;
    default:
      return t.team.joinError;
  }
}

export function PendingInviteNotice() {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(getPendingInviteError);

  useEffect(() => {
    const sync = () => setError(getPendingInviteError());
    window.addEventListener(PENDING_INVITE_ERROR_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PENDING_INVITE_ERROR_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!error) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-status-warning bg-surface p-3"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-status-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{t.team.pendingInviteErrorTitle}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{errorMessage(error, t)}</p>
      </div>
      <button
        type="button"
        onClick={clearPendingInviteError}
        className="rounded p-1 text-text-muted hover:bg-hover hover:text-text-primary"
        title={t.common.close}
      >
        <X size={16} />
      </button>
    </div>
  );
}
