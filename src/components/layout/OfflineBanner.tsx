import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { getStorageMode } from '../../services/storageAdapter';

export function OfflineBanner() {
  const { t } = useLanguage();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [cloudMode] = useState(() => getStorageMode() === 'supabase');

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!offline || !cloudMode) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[70] flex items-center justify-center gap-2 bg-status-warning px-4 py-2 text-sm text-accent-text shadow-lg"
      style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
    >
      <CloudOff size={16} />
      <span>{t.cloudCustomers.offlineWarning}</span>
    </div>
  );
}
