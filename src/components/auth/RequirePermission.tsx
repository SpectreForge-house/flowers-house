import { ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useLanguage } from '../../i18n';
import { usePermissions } from '../../contexts/PermissionsContext';
import { type Permission } from '../../services/permissions';
import { showToast } from '../ui/Toast';
import { Button } from '../ui/Button';

interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
}

export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const { t } = useLanguage();
  const { role, loading, error, can, refresh } = usePermissions();
  const denied = !loading && !error && role !== null && !can(permission);

  useEffect(() => {
    if (denied) showToast('warning', t.permissions.denied);
  }, [denied, t.permissions.denied]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }

  if (error || role === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-text-secondary">{t.permissions.unavailable}</p>
          <Button className="mt-4" onClick={() => void refresh()}>
            {t.permissions.retry}
          </Button>
        </div>
      </div>
    );
  }

  if (denied) return <Navigate to="/" replace />;

  return <>{children}</>;
}
