import { useCallback, useEffect, useState } from 'react';
import { Cloud, HardDrive, ArrowRight, Check, AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { getStorageMode, setStorageMode } from '../../services/storageAdapter';
import { isSupabaseAvailable } from '../../services/authService';
import * as storage from '../../services/storage';
import {
  CloudCounts,
  MigrationCounts,
  MigrationResult,
  getCloudCounts,
  hasLocalData,
  migrateLocalToCloud,
} from '../../services/cloudSyncService';
import { checkCloudHealth, CloudHealthReport } from '../../services/cloudHealthService';
import { showToast } from '../ui/Toast';
import { Button } from '../ui/Button';

export function CloudSyncPanel() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [mode, setMode] = useState(getStorageMode());
  const [localCounts, setLocalCounts] = useState(() => ({
    customers: storage.getCustomers().length,
    inventory: storage.getInventory().length,
    bouquets: storage.getBouquets().length,
    orders: storage.getOrders().length,
    purchases: storage.getPurchases().length,
  }));
  const [cloudCounts, setCloudCounts] = useState<CloudCounts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [health, setHealth] = useState<CloudHealthReport | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const supabaseReady = isSupabaseAvailable() && user !== null;

  const refreshCounts = useCallback(async () => {
    setLocalCounts({
      customers: storage.getCustomers().length,
      inventory: storage.getInventory().length,
      bouquets: storage.getBouquets().length,
      orders: storage.getOrders().length,
      purchases: storage.getPurchases().length,
    });
    if (!supabaseReady) {
      setCloudCounts(null);
      return;
    }
    setLoadingCounts(true);
    try {
      setCloudCounts(await getCloudCounts());
    } catch (err) {
      console.error('[CloudSyncPanel] Failed to load cloud counts:', err);
      setCloudCounts(null);
    } finally {
      setLoadingCounts(false);
    }
  }, [supabaseReady]);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts, mode]);

  const handleMigrate = async () => {
    setMigrating(true);
    setShowConfirm(false);
    setResult(null);
    setProgress('');
    try {
      if (!hasLocalData()) {
        showToast('info', t.cloudCustomers.noLocalCustomers);
        return;
      }
      const migrationResult = await migrateLocalToCloud(setProgress);
      const total = countMigrated(migrationResult.counts);
      setResult(migrationResult);
      await refreshCounts();

      if (migrationResult.errors.length > 0) {
        showToast('warning', t.cloudCustomers.migratePartial
          .replace('{count}', String(total))
          .replace('{failed}', String(migrationResult.failed)));
      } else {
        showToast('success', t.cloudCustomers.migrateSuccess.replace('{count}', String(total)));
      }
    } catch (err) {
      console.error('[CloudSyncPanel] Migration failed:', err);
      showToast('error', err instanceof Error ? err.message : t.cloudCustomers.migrateError);
    } finally {
      setMigrating(false);
      setProgress('');
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

  const handleHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      setHealth(await checkCloudHealth());
    } catch (err) {
      console.error('[CloudSyncPanel] Health check failed:', err);
      showToast('error', err instanceof Error ? err.message : t.cloudCustomers.healthCheckError);
    } finally {
      setCheckingHealth(false);
    }
  };

  const localTotal = Object.values(localCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cloud size={18} className="text-accent-green-light" />
          <h3 className="text-text-primary font-medium text-sm sm:text-base">{t.cloudCustomers.title}</h3>
        </div>
        <button
          type="button"
          onClick={() => void refreshCounts()}
          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-hover"
          title={'Refresh'}
          aria-label={'Refresh'}
        >
          <RefreshCw size={16} className={loadingCounts ? 'animate-spin' : ''} />
        </button>
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <CountTile icon={<HardDrive size={13} />} label={t.nav.customers} value={localCounts.customers} />
        <CountTile icon={<HardDrive size={13} />} label={t.nav.inventory} value={localCounts.inventory} />
        <CountTile icon={<HardDrive size={13} />} label={t.nav.bouquets} value={localCounts.bouquets} />
        <CountTile icon={<HardDrive size={13} />} label={t.nav.orders} value={localCounts.orders} />
        <CountTile icon={<HardDrive size={13} />} label={t.purchases.title} value={localCounts.purchases} />
        <CountTile icon={<HardDrive size={13} />} label={t.common.total} value={localTotal} />
      </div>

      {supabaseReady && cloudCounts && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs border-t border-border pt-3">
          <CountTile icon={<Cloud size={13} />} label={t.nav.customers} value={cloudCounts.customers} />
          <CountTile icon={<Cloud size={13} />} label={t.nav.inventory} value={cloudCounts.inventory} />
          <CountTile icon={<Cloud size={13} />} label={t.nav.bouquets} value={cloudCounts.bouquets} />
          <CountTile icon={<Cloud size={13} />} label={t.nav.orders} value={cloudCounts.orders} />
          <CountTile icon={<Cloud size={13} />} label={t.purchases.title} value={cloudCounts.purchases} />
          <CountTile icon={<Cloud size={13} />} label={t.photos.photo} value={cloudCounts.photos} />
        </div>
      )}

      {!supabaseReady && (
        <p className="text-xs text-text-muted">{t.cloudCustomers.notSignedIn}</p>
      )}

      {supabaseReady && (
        <div className="pt-2 border-t border-border space-y-3">
          {showConfirm ? (
            <>
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle size={16} className="text-status-warning mt-0.5 shrink-0" />
                <span className="text-text-secondary">
                  {t.cloudCustomers.confirmMigrate.replace('{count}', String(localTotal))}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowConfirm(false)} className="flex-1">
                  {t.common.cancel}
                </Button>
                <Button size="sm" onClick={handleMigrate} disabled={migrating} className="flex-1">
                  {migrating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  {t.cloudCustomers.migrateToCloud}
                </Button>
              </div>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowConfirm(true)}
              disabled={migrating || localTotal === 0}
              className="w-full"
            >
              {migrating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {migrating ? t.cloudCustomers.migrating : t.cloudCustomers.migrateToCloud}
            </Button>
          )}

          {migrating && progress && (
            <p className="text-xs text-text-muted">{t.cloudCustomers.migrating} {progress}</p>
          )}

          {result && (
            <div className="rounded-lg bg-surface border border-border p-3 space-y-2 text-xs">
              {result.errors.length > 0 ? (
                <div className="flex items-start gap-2 text-status-warning">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span className="font-medium">
                    {t.cloudCustomers.migratePartial
                      .replace('{count}', String(countMigrated(result.counts)))
                      .replace('{failed}', String(result.failed))}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-status-success">
                  <Check size={14} />
                  <span className="font-medium">
                    {t.cloudCustomers.migrateSuccess.replace('{count}', String(countMigrated(result.counts)))}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-text-secondary">
                <span>{t.nav.customers}: {result.counts.customers}</span>
                <span>{t.nav.inventory}: {result.counts.inventory}</span>
                <span>{t.nav.bouquets}: {result.counts.bouquets}</span>
                <span>{t.nav.orders}: {result.counts.orders}</span>
                <span>{t.nav.deliveries}: {result.counts.deliveries}</span>
                <span>{t.purchases.title}: {result.counts.purchases}</span>
                <span>{t.photos.photo}: {result.counts.photos}</span>
              </div>
              {result.skipped > 0 && (
                <p className="text-text-muted">{t.cloudCustomers.alreadyMigrated} ({result.skipped})</p>
              )}
              {result.errors.length > 0 && (
                <div className="text-status-danger space-y-1">
                  {result.errors.slice(0, 4).map((error, index) => (
                    <p key={index} className="break-words">{error}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg bg-surface border border-border p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-accent-green-light" />
                <span className="font-medium text-text-primary">{t.cloudCustomers.healthTitle}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleHealthCheck()}
                disabled={checkingHealth}
              >
                {checkingHealth ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                {checkingHealth ? t.cloudCustomers.healthChecking : t.cloudCustomers.healthCheck}
              </Button>
            </div>

            {health && (
              <>
                <div className={`flex items-center gap-2 ${health.ok ? 'text-status-success' : 'text-status-warning'}`}>
                  {health.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
                  <span className="font-medium">
                    {health.ok ? t.cloudCustomers.healthAllGood : t.cloudCustomers.healthIssues}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {health.checks.map(check => (
                    <div key={check.id} className="flex items-start gap-2">
                      {check.ok ? (
                        <Check size={13} className="mt-0.5 shrink-0 text-status-success" />
                      ) : (
                        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-status-danger" />
                      )}
                      <div className="min-w-0">
                        <span className="text-text-secondary">{t.cloudCustomers.healthChecks[check.id]}</span>
                        {!check.ok && (
                          <p className="text-status-danger break-words">
                            {check.missing.length > 0 && (
                              <>{t.cloudCustomers.healthMissing}: {check.missing.join(', ')}. </>
                            )}
                            {check.message && <>{check.message}. </>}
                            {check.migration && t.cloudCustomers.healthApplyMigration
                              .replace('{migration}', check.migration)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function countMigrated(counts: MigrationCounts): number {
  return Object.values(counts).reduce<number>(
    (sum, value) => sum + (typeof value === 'number' ? value : 0),
    0,
  );
}

function CountTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-surface border border-border px-2 py-1.5 min-w-0">
      <span className="text-text-muted shrink-0">{icon}</span>
      <span className="text-text-secondary truncate">{label}</span>
      <span className="ml-auto text-text-primary font-medium shrink-0">{value}</span>
    </div>
  );
}
