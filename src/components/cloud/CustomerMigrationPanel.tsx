import { useState, useEffect } from 'react';
import { Cloud, HardDrive, ArrowRight, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { getStorageMode, setStorageMode } from '../../services/storageAdapter';
import { SupabaseCustomerAdapter } from '../../services/supabaseStorage';
import { isSupabaseAvailable } from '../../services/authService';
import * as storage from '../../services/storage';
import { showToast } from '../ui/Toast';
import { Button } from '../ui/Button';

export function CustomerMigrationPanel() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [mode, setMode] = useState(getStorageMode());
  const [localCount, setLocalCount] = useState(0);
  const [cloudCount, setCloudCount] = useState(0);
  const [migrating, setMigrating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const supabaseReady = isSupabaseAvailable() && user !== null;

  useEffect(() => {
    setLocalCount(storage.getCustomers().length);
    if (supabaseReady) {
      new SupabaseCustomerAdapter().getCustomers()
        .then(c => setCloudCount(c.length))
        .catch(() => setCloudCount(0));
    }
  }, [supabaseReady, mode]);

  const handleMigrate = async () => {
    setMigrating(true);
    setShowConfirm(false);
    try {
      const localCustomers = storage.getCustomers();
      if (localCustomers.length === 0) {
        showToast('info', t.cloudCustomers.noLocalCustomers);
        return;
      }

      const adapter = new SupabaseCustomerAdapter();
      const cloudCustomers = await adapter.getCustomers();
      const cloudIds = new Set(cloudCustomers.map(c => c.id));

      const toUpload = localCustomers.filter(c => !cloudIds.has(c.id));

      if (toUpload.length === 0) {
        showToast('info', t.cloudCustomers.alreadyMigrated);
        return;
      }

      for (const customer of toUpload) {
        await adapter.addCustomer(customer);
      }

      const newCloudCount = await adapter.getCustomers();
      setCloudCount(newCloudCount.length);
      showToast('success', t.cloudCustomers.migrateSuccess.replace('{count}', String(toUpload.length)));
    } catch (err) {
      console.error('Migration error:', err);
      showToast('error', t.cloudCustomers.migrateError);
    } finally {
      setMigrating(false);
    }
  };

  const handleSwitchMode = (newMode: 'local' | 'supabase') => {
    if (newMode === 'supabase' && !supabaseReady) {
      showToast('warning', t.cloudCustomers.notSignedIn);
      return;
    }
    setStorageMode(newMode);
    setMode(newMode);
    window.location.reload();
  };

  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Cloud size={18} className="text-accent-green-light" />
        <h3 className="text-text-primary font-medium text-sm sm:text-base">{t.cloudCustomers.title}</h3>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <button
          onClick={() => handleSwitchMode('local')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            mode === 'local'
              ? 'bg-accent-green/20 text-accent-green-light border border-accent-green/30'
              : 'bg-surface text-text-secondary border border-border hover:bg-hover hover:text-text-primary'
          }`}
        >
          <HardDrive size={16} />
          {t.cloudCustomers.localMode}
        </button>
        <button
          onClick={() => handleSwitchMode('supabase')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            mode === 'supabase'
              ? 'bg-accent-green/20 text-accent-green-light border border-accent-green/30'
              : 'bg-surface text-text-secondary border border-border hover:bg-hover hover:text-text-primary'
          } ${!supabaseReady ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Cloud size={16} />
          {t.cloudCustomers.cloudMode}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2 text-text-secondary">
          <HardDrive size={14} />
          <span>{t.cloudCustomers.localCount.replace('{count}', String(localCount))}</span>
        </div>
        {supabaseReady && (
          <div className="flex items-center gap-2 text-text-secondary">
            <Cloud size={14} />
            <span>{t.cloudCustomers.cloudCount.replace('{count}', String(cloudCount))}</span>
          </div>
        )}
      </div>

      {supabaseReady && localCount > 0 && (
        <div className="pt-2 border-t border-border">
          {showConfirm ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <span className="text-text-secondary">
                  {t.cloudCustomers.confirmMigrate.replace('{count}', String(localCount))}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowConfirm(false)}
                  className="flex-1"
                >
                  {t.common.cancel}
                </Button>
                <Button
                  size="sm"
                  onClick={handleMigrate}
                  isLoading={migrating}
                  className="flex-1"
                >
                  {migrating ? t.cloudCustomers.migrating : t.cloudCustomers.migrateToCloud}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowConfirm(true)}
              className="w-full"
            >
              <ArrowRight size={16} />
              {t.cloudCustomers.migrateToCloud}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
