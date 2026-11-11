import { useState, useRef, useEffect } from 'react';
import { Save, Clock, Download, Upload, Shield, Cloud, HardDrive, FolderOpen, Award, User, Bell, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { useSettings, getHistoryAdapter } from '../hooks/useStore';
import { showToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { recordHistory } from '../services/historyService';
import { useLanguage } from '../i18n';
import { createBackup, restoreBackup, resetAllData } from '../services/storage';
import { removeAllPhotos } from '../services/photoStorage';
import { exportBackupFile } from '../services/backupExport';
import {
  AutoBackupSettings,
  BackupFolderEntry,
  chooseBackupFolder,
  getAutoBackupSettings,
  isAutoBackupAvailable,
  listBackupFolders,
  markBackupCompleted,
  restoreFromBackup,
  runBackupNow,
  saveAutoBackupSettings,
} from '../services/backupService';
import { useAuth } from '../contexts/AuthContext';
import { normalizeStatusSettings } from '../services/clientStatusService';
import { ClientStatusSettings } from '../types';
import { isSupabaseAvailable } from '../services/authService';
import { nowMs } from '../utils/clock';
import { getStorageMode } from '../services/storageAdapter';
import { CloudSyncPanel } from '../components/cloud/CloudSyncPanel';
import { TeamSettings } from '../components/team/TeamSettings';
import { getDisplayNameCooldownEnd, updateMyDisplayName } from '../services/teamService';
import { usePermissions } from '../contexts/PermissionsContext';
import {
  DEFAULT_DAYS_BEFORE,
  MAX_DAYS_BEFORE,
  MIN_DAYS_BEFORE,
  NotificationPermissionState,
  getClientDateNotificationSettings,
  getNotificationPermission,
  isNativeNotificationsAvailable,
  requestNotificationPermission,
  setClientDateNotificationSettings,
} from '../services/clientDateNotifications';
import {
  DEFAULT_FINANCE_REMINDER_HOUR,
  getFinanceReminderSettings,
  sendTestFinanceNotification,
  setFinanceReminderSettings,
} from '../services/financeReminders';

export function SettingsPage() {
  const cloudMode = getStorageMode() === 'supabase';
  const { settings, updateSettings } = useSettings();
  const { t, tAddress } = useLanguage();
  const { user } = useAuth();
  const { profile, can, refresh, role } = usePermissions();
  const canEditShopInfo = can('editShopInfo');
  const canEditClientStatus = role === 'owner';
  const canManageCloud = can('manageCloud');
  const canBackup = can('backupRestore');
  const canReset = can('resetData');
  const [formData, setFormData] = useState(settings);
  const [deliveryFeeInput, setDeliveryFeeInput] = useState<string>(
    settings.defaultDeliveryFee != null && settings.defaultDeliveryFee !== 0
      ? String(settings.defaultDeliveryFee)
      : ''
  );
  const [deliveryFeeError, setDeliveryFeeError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatic backup (desktop app only; the section is rendered when the
  // flowerBackup bridge from electron/preload.cjs is present).
  const [autoBackup, setAutoBackup] = useState<AutoBackupSettings>(getAutoBackupSettings);
  const [keepCountInput, setKeepCountInput] = useState(() => String(getAutoBackupSettings().keepCount));
  const [backingUp, setBackingUp] = useState(false);
  const [restoreList, setRestoreList] = useState<BackupFolderEntry[] | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BackupFolderEntry | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

  // Client status (New/Regular/VIP): thresholds + suggested discounts.
  const [statusFormData, setStatusFormData] = useState<ClientStatusSettings>(() =>
    normalizeStatusSettings(settings.clientStatus)
  );

  // Local reminders about the clients' important dates (phone only). These are
  // device settings, so they live in localStorage and not in the shop settings.
  const nativeNotifications = isNativeNotificationsAvailable();
  const [notifySettings, setNotifySettings] = useState(getClientDateNotificationSettings);
  const [notifyDaysInput, setNotifyDaysInput] = useState(() =>
    String(getClientDateNotificationSettings().daysBefore)
  );
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermissionState>('prompt');

  // Evening finance reminder (also device-only, stored in localStorage).
  const [financeNotify, setFinanceNotify] = useState(getFinanceReminderSettings);
  const [testNotificationSending, setTestNotificationSending] = useState(false);

  useEffect(() => {
    if (!nativeNotifications) return;
    let cancelled = false;
    void getNotificationPermission().then((permission) => {
      if (!cancelled) setNotifyPermission(permission);
    });
    return () => {
      cancelled = true;
    };
  }, [nativeNotifications]);

  const handleToggleNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setNotifySettings(setClientDateNotificationSettings({ enabled: false }));
      showToast('info', t.clientDates.notifyDisabled);
      return;
    }

    const granted = await requestNotificationPermission();
    setNotifyPermission(granted ? 'granted' : 'denied');
    if (!granted) {
      showToast('error', t.clientDates.notifyPermissionDenied);
      return;
    }

    setNotifySettings(setClientDateNotificationSettings({ enabled: true }));
    showToast('success', t.clientDates.notifyEnabled);
  };

  const handleRequestNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifyPermission(granted ? 'granted' : 'denied');
    if (granted) {
      setNotifySettings(setClientDateNotificationSettings({ enabled: true }));
      showToast('success', t.clientDates.notifyEnabled);
    } else {
      showToast('error', t.clientDates.notifyPermissionDenied);
    }
  };

  const handleDaysBeforeChange = (raw: string) => {
    setNotifyDaysInput(raw);
    const parsed = parseInt(raw, 10);
    const days = Number.isNaN(parsed) ? DEFAULT_DAYS_BEFORE : parsed;
    setNotifySettings(setClientDateNotificationSettings({ daysBefore: days }));
  };

  const handleToggleFinanceReminders = async (enabled: boolean) => {
    if (!enabled) {
      setFinanceNotify(setFinanceReminderSettings({ enabled: false }));
      showToast('info', t.finance.reminderDisabled);
      return;
    }

    const granted = await requestNotificationPermission();
    setNotifyPermission(granted ? 'granted' : 'denied');
    if (!granted) {
      showToast('error', t.finance.reminderPermissionDenied);
      return;
    }

    setFinanceNotify(setFinanceReminderSettings({ enabled: true }));
    showToast('success', t.finance.reminderEnabled);
  };

  const handleFinanceHourChange = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const hour = Number.isNaN(parsed) ? DEFAULT_FINANCE_REMINDER_HOUR : parsed;
    setFinanceNotify(setFinanceReminderSettings({ hour }));
  };

  const handleTestNotification = async () => {
    setTestNotificationSending(true);
    try {
      const ok = await sendTestFinanceNotification(
        {
          name: t.finance.reminderChannelName,
          description: t.finance.reminderChannelDescription,
        },
        {
          title: t.finance.reminderTitle,
          body: t.finance.reminderBody,
          testBody: t.finance.reminderTestBody,
        },
      );
      showToast(ok ? 'success' : 'error', ok ? t.finance.testScheduled : t.finance.testFailed);
    } finally {
      setTestNotificationSending(false);
    }
  };

  // Profile nickname (Supabase users only) with a 3-day change cooldown.
  const [nickname, setNickname] = useState(profile?.displayName ?? '');
  const [nicknameError, setNicknameError] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);

  useEffect(() => {
    setNickname(profile?.displayName ?? '');
    setNicknameError('');
  }, [profile?.displayName]);

  const nicknameCooldownEnd = getDisplayNameCooldownEnd(profile?.displayNameUpdatedAt ?? null);
  const nicknameCooldownActive =
    nicknameCooldownEnd !== null && nicknameCooldownEnd.getTime() > nowMs();
  const nicknameChanged = nickname.trim() !== (profile?.displayName ?? '');

  const handleSaveNickname = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setNicknameError(t.account.required);
      return;
    }
    if (trimmed.length > 40) {
      setNicknameError(t.account.tooLong);
      return;
    }
    if (!nicknameChanged) {
      showToast('info', t.account.unchanged);
      return;
    }
    if (nicknameCooldownActive) {
      setNicknameError(t.account.cooldownActive.replace(
        '{date}',
        nicknameCooldownEnd ? format(nicknameCooldownEnd, 'dd.MM.yyyy HH:mm') : '',
      ));
      return;
    }

    setNicknameError('');
    setSavingNickname(true);
    try {
      await updateMyDisplayName(trimmed);
      await refresh();
      showToast('success', t.account.saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[SettingsPage] Failed to save nickname:', error);
      setNicknameError(
        message.includes('display_name_cooldown')
          ? t.account.cooldownError
          : message.includes('display_name_too_long')
            ? t.account.tooLong
            : t.account.saveError,
      );
    } finally {
      setSavingNickname(false);
    }
  };

  const handleStatusNumberChange = (field: keyof ClientStatusSettings, raw: string) => {
    const parsed = parseFloat(raw);
    setStatusFormData(prev => ({
      ...prev,
      // Treat empty/invalid as 0 so the field stays editable; validation
      // happens on save (non-negative, discount <= 100).
      [field]: isNaN(parsed) ? 0 : parsed,
    }));
  };

  const statusDiscountInvalid = {
    discountNew: statusFormData.discountNew < 0 || statusFormData.discountNew > 100,
    discountRegular: statusFormData.discountRegular < 0 || statusFormData.discountRegular > 100,
    discountVip: statusFormData.discountVip < 0 || statusFormData.discountVip > 100,
  };
  const hasInvalidDiscount =
    statusDiscountInvalid.discountNew || statusDiscountInvalid.discountRegular || statusDiscountInvalid.discountVip;
  const hasInvalidThreshold =
    statusFormData.regularMinCount < 0 || statusFormData.vipMinTotal < 0 || statusFormData.vipMinCount < 0;

  const handleChooseBackupFolder = async () => {
    try {
      const folder = await chooseBackupFolder();
      if (folder) setAutoBackup(saveAutoBackupSettings({ folderPath: folder }));
    } catch (error) {
      console.error('[SettingsPage] Failed to choose backup folder:', error);
      showToast('error', t.autoBackup.folderInvalid);
    }
  };

  const handleKeepCountChange = (value: string) => {
    setKeepCountInput(value);
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 365) {
      setAutoBackup(saveAutoBackupSettings({ keepCount: parsed }));
    }
  };

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      await runBackupNow();
      setAutoBackup(getAutoBackupSettings());
      showToast('success', t.autoBackup.backupDone);
    } catch (error) {
      console.error('[SettingsPage] Backup failed:', error);
      showToast('error', t.autoBackup.backupFailed);
    } finally {
      setBackingUp(false);
    }
  };

  const handleOpenRestoreList = async () => {
    setRestoreList([]);
    setSelectedBackup(null);
    setRestoreLoading(true);
    try {
      setRestoreList(await listBackupFolders());
    } catch (error) {
      console.error('[SettingsPage] Failed to list backups:', error);
      showToast('error', t.autoBackup.folderInvalid);
      setRestoreList(null);
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!selectedBackup || restoreBusy) return;
    setRestoreBusy(true);
    try {
      await restoreFromBackup(selectedBackup);
      showToast('success', t.autoBackup.restored);
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('[SettingsPage] Restore failed:', error);
      const isSafety = error instanceof Error && error.message === 'safety-backup-failed';
      showToast('error', isSafety ? t.autoBackup.safetyBackupFailed : t.autoBackup.restoreFailed);
      setConfirmRestore(null);
      setRestoreBusy(false);
    }
  };

  const handleSubmit = async () => {
    const fee = deliveryFeeInput === '' ? 0 : parseFloat(deliveryFeeInput);
    if (deliveryFeeInput !== '' && isNaN(fee)) {
      setDeliveryFeeError(true);
      return;
    }
    setDeliveryFeeError(false);

    // Validate client status thresholds (non-negative) and discounts (0..100).
    // The section is owner-only, so managers never submit these values.
    const cs = statusFormData;
    const invalidStatus = canEditClientStatus && (
      cs.regularMinCount < 0 || cs.vipMinTotal < 0 || cs.vipMinCount < 0 ||
      cs.discountNew < 0 || cs.discountNew > 100 ||
      cs.discountRegular < 0 || cs.discountRegular > 100 ||
      cs.discountVip < 0 || cs.discountVip > 100
    );
    if (invalidStatus) {
      showToast('error', t.clientStatus.validationError);
      return;
    }

    try {
      await updateSettings({
        ...formData,
        ...(canEditShopInfo
          ? {}
          : {
              shopName: settings.shopName,
              shopAddress: settings.shopAddress,
              shopPhone: settings.shopPhone,
              shopEmail: settings.shopEmail,
            }),
        defaultDeliveryFee: fee,
        ...(canEditClientStatus ? { clientStatus: normalizeStatusSettings(cs) } : {}),
      });
      if (canEditClientStatus) {
        setStatusFormData(normalizeStatusSettings(cs));
      }
      void recordHistory('settings_changed', 'settings', 'all', 'Settings updated', undefined, getHistoryAdapter());
      showToast('success', t.common.settingsSaved);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateBackup = async () => {
    try {
      const backup = await createBackup();

      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const timeStr = new Date().toISOString().split('T')[1].replace(/[:.]/g, '').substring(0, 4);
      const filename = `FlowerHouse_backup_${dateStr}_${timeStr}.json`;
      const method = await exportBackupFile(filename, JSON.stringify(backup, null, 2));
      markBackupCompleted();

      void recordHistory('backup_created', 'backup', 'backup', `Backup created: ${filename}`, undefined, getHistoryAdapter());
      showToast('success', method === 'share' ? t.settings.backupShared : t.settings.backupCreated);
    } catch {
      showToast('error', t.settings.backupError);
    }
  };

  const handleRestoreBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backup = JSON.parse(e.target?.result as string);

        if (!backup.version || !backup.createdAt || !backup.customers || !backup.inventory) {
          showToast('error', t.settings.invalidBackupFile);
          return;
        }

        if (!confirm(t.settings.restoreConfirmMessage)) {
          return;
        }

        await restoreBackup(backup);

        void recordHistory('backup_restored', 'backup', 'backup', `Backup restored from ${file.name}`, undefined, getHistoryAdapter());
        showToast('success', t.settings.backupRestored);

        setTimeout(() => window.location.reload(), 1000);
      } catch {
        showToast('error', t.settings.restoreError);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">{t.settings.title}</h1>
        <Button onClick={handleSubmit}>
          <Save size={20} />
          {t.common.saveChanges}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">{t.settings.shopInformation}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t.settings.shopName}</label>
              <input
                type="text"
                value={formData.shopName ?? ''}
                onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                placeholder={t.shop.name}
                disabled={!canEditShopInfo}
                className={`w-full px-3 py-2 bg-surface border border-border rounded-lg ${
                  canEditShopInfo ? 'text-text-primary' : 'text-text-muted cursor-not-allowed'
                }`}
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t.settings.address}</label>
              <input
                type="text"
                value={formData.shopAddress ?? ''}
                onChange={(e) => setFormData({ ...formData, shopAddress: e.target.value })}
                placeholder={tAddress()}
                disabled={!canEditShopInfo}
                className={`w-full px-3 py-2 bg-surface border border-border rounded-lg ${
                  canEditShopInfo ? 'text-text-primary' : 'text-text-muted cursor-not-allowed'
                }`}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.settings.phone}</label>
                <input
                  type="tel"
                  value={formData.shopPhone ?? ''}
                  onChange={(e) => setFormData({ ...formData, shopPhone: e.target.value })}
                  placeholder={t.shop.phone}
                  disabled={!canEditShopInfo}
                  className={`w-full px-3 py-2 bg-surface border border-border rounded-lg ${
                    canEditShopInfo ? 'text-text-primary' : 'text-text-muted cursor-not-allowed'
                  }`}
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.settings.email}</label>
                <input
                  type="email"
                  value={formData.shopEmail ?? ''}
                  onChange={(e) => setFormData({ ...formData, shopEmail: e.target.value })}
                  placeholder={t.shop.email}
                  disabled={!canEditShopInfo}
                  className={`w-full px-3 py-2 bg-surface border border-border rounded-lg ${
                    canEditShopInfo ? 'text-text-primary' : 'text-text-muted cursor-not-allowed'
                  }`}
                />
              </div>
            </div>
            {!canEditShopInfo && (
              <p className="text-xs text-text-muted">{t.settings.ownerOnlyShopInfo}</p>
            )}
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">{t.settings.businessSettings}</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.settings.currency}</label>
                <input
                  type="text"
                  value="EUR"
                  disabled
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-muted cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.settings.currencySymbol}</label>
                <input
                  type="text"
                  value={formData.currencySymbol || '\u20AC'}
                  disabled
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-muted cursor-not-allowed"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t.settings.defaultDeliveryFee}</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-secondary">
                  {formData.currencySymbol || '\u20AC'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryFeeInput}
                  onChange={(e) => {
                    setDeliveryFeeInput(e.target.value);
                    setDeliveryFeeError(false);
                  }}
                  className={`w-full pl-8 pr-3 py-2 bg-surface border border-border rounded-lg text-text-primary ${deliveryFeeError ? '!border-red-500' : ''}`}
                  placeholder="0.00"
                />
              </div>
              {deliveryFeeError && (
                <p className="text-xs text-status-danger mt-1">{t.inventory.validation.required}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t.clientDates.windowSetting}</label>
              <input
                type="number"
                min="1"
                max="90"
                value={formData.clientDatesWindowDays ?? 14}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  setFormData({
                    ...formData,
                    clientDatesWindowDays: isNaN(parsed) ? 14 : Math.min(90, Math.max(1, parsed)),
                  });
                }}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
              />
              <p className="text-xs text-text-muted mt-1">{t.clientDates.windowSettingHint}</p>
            </div>
          </div>

          {/* --- Client status (New / Regular / VIP) - owner only --- */}
          {canEditClientStatus && (
          <div className="pt-4 mt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <Award size={20} className="text-accent-green-light" />
              <h3 className="text-base font-semibold text-text-primary">{t.clientStatus.title}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.clientStatus.regularMinCount}</label>
                <input
                  type="number"
                  min="0"
                  value={statusFormData.regularMinCount}
                  onChange={(e) => handleStatusNumberChange('regularMinCount', e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.clientStatus.vipMinTotal}</label>
                <input
                  type="number"
                  min="0"
                  value={statusFormData.vipMinTotal}
                  onChange={(e) => handleStatusNumberChange('vipMinTotal', e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.clientStatus.vipMinCount}</label>
                <input
                  type="number"
                  min="0"
                  value={statusFormData.vipMinCount}
                  onChange={(e) => handleStatusNumberChange('vipMinCount', e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.clientStatus.discountNew}</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={statusFormData.discountNew}
                  onChange={(e) => handleStatusNumberChange('discountNew', e.target.value)}
                  className={`w-full px-3 py-2 bg-surface border rounded-lg text-text-primary ${statusDiscountInvalid.discountNew ? '!border-status-danger' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.clientStatus.discountRegular}</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={statusFormData.discountRegular}
                  onChange={(e) => handleStatusNumberChange('discountRegular', e.target.value)}
                  className={`w-full px-3 py-2 bg-surface border rounded-lg text-text-primary ${statusDiscountInvalid.discountRegular ? '!border-status-danger' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.clientStatus.discountVip}</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={statusFormData.discountVip}
                  onChange={(e) => handleStatusNumberChange('discountVip', e.target.value)}
                  className={`w-full px-3 py-2 bg-surface border rounded-lg text-text-primary ${statusDiscountInvalid.discountVip ? '!border-status-danger' : ''}`}
                />
              </div>
            </div>

            {hasInvalidThreshold && (
              <p className="text-xs text-status-danger mt-2">{t.clientStatus.thresholdInvalid}</p>
            )}
            {hasInvalidDiscount && (
              <p className="text-xs text-status-danger mt-2">{t.clientStatus.discountInvalid}</p>
            )}
            <p className="text-xs text-text-muted mt-2">{t.clientStatus.discountHint}</p>
          </div>
          )}
        </div>
      </div>

      {nativeNotifications && (
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-start gap-2 mb-4">
            <Bell size={20} className="text-accent-green-light shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t.clientDates.notifySectionTitle}
              </h2>
              <p className="text-text-secondary text-sm">
                {t.clientDates.notifyHint.replace('{days}', String(notifySettings.daysBefore))}
              </p>
            </div>
          </div>

          <div className="max-w-md space-y-4">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={notifySettings.enabled}
                onChange={(event) => void handleToggleNotifications(event.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-text-primary">{t.clientDates.notifyEnable}</span>
            </label>

            <div>
              <label
                htmlFor="notify-days-before"
                className="block text-sm text-text-secondary mb-1"
              >
                {t.clientDates.notifyDaysBefore}
              </label>
              <input
                id="notify-days-before"
                type="number"
                min={MIN_DAYS_BEFORE}
                max={MAX_DAYS_BEFORE}
                value={notifyDaysInput}
                onChange={(event) => handleDaysBeforeChange(event.target.value)}
                onBlur={() =>
                  setNotifyDaysInput(String(getClientDateNotificationSettings().daysBefore))
                }
                disabled={!notifySettings.enabled}
                className={`w-full px-3 py-2 bg-surface border border-border rounded-lg ${
                  notifySettings.enabled ? 'text-text-primary' : 'text-text-muted cursor-not-allowed'
                }`}
              />
            </div>

            {notifySettings.enabled && notifyPermission !== 'granted' && (
              <div className="rounded-lg border border-status-warning/40 bg-surface p-3 space-y-2">
                <p className="text-xs text-text-secondary">
                  {t.clientDates.notifyPermissionDenied}
                </p>
                <Button variant="secondary" size="sm" onClick={() => void handleRequestNotifications()}>
                  <Bell size={16} />
                  {t.clientDates.notifyRequest}
                </Button>
              </div>
            )}

            <p className="text-xs text-text-muted">{t.clientDates.notifyPhoneOnly}</p>
          </div>
        </div>
      )}

      {nativeNotifications && can('manageFinance') && (
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-start gap-2 mb-4">
            <Wallet size={20} className="text-accent-green-light shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t.finance.reminderSectionTitle}
              </h2>
              <p className="text-text-secondary text-sm">
                {t.finance.reminderHint.replace(
                  '{time}',
                  `${String(financeNotify.hour).padStart(2, '0')}:00`,
                )}
              </p>
            </div>
          </div>

          <div className="max-w-md space-y-4">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={financeNotify.enabled}
                onChange={(event) => void handleToggleFinanceReminders(event.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-text-primary">{t.finance.reminderEnable}</span>
            </label>

            <div>
              <label htmlFor="finance-reminder-hour" className="block text-sm text-text-secondary mb-1">
                {t.finance.reminderHour}
              </label>
              <input
                id="finance-reminder-hour"
                type="time"
                value={`${String(financeNotify.hour).padStart(2, '0')}:00`}
                onChange={(event) => handleFinanceHourChange(event.target.value.split(':')[0])}
                disabled={!financeNotify.enabled}
                className={`w-full px-3 py-2 bg-surface border border-border rounded-lg ${
                  financeNotify.enabled ? 'text-text-primary' : 'text-text-muted cursor-not-allowed'
                }`}
              />
            </div>

            {financeNotify.enabled && notifyPermission !== 'granted' && (
              <div className="rounded-lg border border-status-warning/40 bg-surface p-3 space-y-2">
                <p className="text-xs text-text-secondary">
                  {t.finance.reminderPermissionDenied}
                </p>
                <Button variant="secondary" size="sm" onClick={() => void handleRequestNotifications()}>
                  <Bell size={16} />
                  {t.clientDates.notifyRequest}
                </Button>
              </div>
            )}

            <div className="pt-1">
              <Button
                variant="secondary"
                size="sm"
                isLoading={testNotificationSending}
                onClick={() => void handleTestNotification()}
              >
                <Bell size={16} />
                {t.finance.testButton}
              </Button>
              <p className="text-xs text-text-muted mt-2">{t.finance.testPhoneOnly}</p>
            </div>
          </div>
        </div>
      )}

      {isSupabaseAvailable() && user && profile && (
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-start gap-2 mb-4">
            <User size={20} className="text-accent-green-light shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t.account.title}</h2>
              <p className="text-text-secondary text-sm">{t.account.subtitle}</p>
            </div>
          </div>
          <div className="max-w-md space-y-3">
            <div>
              <label htmlFor="profile-nickname" className="block text-sm text-text-secondary mb-1">
                {t.account.nickname}
              </label>
              <input
                id="profile-nickname"
                type="text"
                maxLength={40}
                value={nickname}
                onChange={(event) => {
                  setNickname(event.target.value);
                  if (nicknameError) setNicknameError('');
                }}
                placeholder={t.account.nicknamePlaceholder}
                disabled={savingNickname || nicknameCooldownActive}
                className={`w-full px-3 py-2 bg-surface border border-border rounded-lg ${
                  savingNickname || nicknameCooldownActive
                    ? 'text-text-muted cursor-not-allowed'
                    : 'text-text-primary'
                } ${nicknameError ? '!border-status-danger' : ''}`}
              />
              {nicknameError && (
                <p className="text-xs text-status-danger mt-1">{nicknameError}</p>
              )}
            </div>
            <p className={`text-xs ${nicknameCooldownActive ? 'text-status-warning' : 'text-text-muted'}`}>
              {nicknameCooldownActive
                ? t.account.cooldownActive.replace(
                    '{date}',
                    nicknameCooldownEnd ? format(nicknameCooldownEnd, 'dd.MM.yyyy HH:mm') : '',
                  )
                : t.account.cooldownHint}
            </p>
            <Button
              onClick={() => void handleSaveNickname()}
              disabled={savingNickname || !nicknameChanged || nicknameCooldownActive}
              isLoading={savingNickname}
            >
              <Save size={18} />
              {t.account.saveNickname}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={20} className="text-accent-green-light" />
          <h2 className="text-lg font-semibold text-text-primary">{t.common.workingHours}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface rounded-lg p-4">
            <p className="text-sm font-medium text-accent-green-light mb-3">{t.common.mondayFriday}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-1">{t.common.openingTime}</label>
                <input
                  type="time"
                  value={formData.openingTime}
                  onChange={(e) => setFormData({ ...formData, openingTime: e.target.value })}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">{t.common.closingTime}</label>
                <input
                  type="time"
                  value={formData.closingTime}
                  onChange={(e) => setFormData({ ...formData, closingTime: e.target.value })}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text-primary"
                />
              </div>
            </div>
          </div>
          <div className="bg-surface rounded-lg p-4">
            <p className="text-sm font-medium text-accent-burgundy-light mb-3">{t.common.saturdaySunday}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-1">{t.common.openingTime}</label>
                <input
                  type="time"
                  value={formData.weekendOpeningTime || '10:00'}
                  onChange={(e) => setFormData({ ...formData, weekendOpeningTime: e.target.value })}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">{t.common.closingTime}</label>
                <input
                  type="time"
                  value={formData.weekendClosingTime || '19:00'}
                  onChange={(e) => setFormData({ ...formData, weekendClosingTime: e.target.value })}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text-primary"
                />
              </div>
            </div>
          </div>
        </div>
        <p className="text-text-muted text-xs mt-3">{t.common.weekdaysSchedule} 09:00 - 19:00 | {t.common.weekendsSchedule} 10:00 - 19:00</p>
      </div>

      {canManageCloud && isSupabaseAvailable() && (
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Cloud size={20} className="text-accent-green-light" />
            <h2 className="text-lg font-semibold text-text-primary">{t.cloudCustomers.title}</h2>
          </div>
          <p className="text-text-secondary text-sm mb-4">{t.cloudCustomers.migrateDescription}</p>
          {user ? (
            <CloudSyncPanel />
          ) : (
            <p className="text-text-muted text-sm">{t.auth.signIn} {t.cloudCustomers.migrateDescription}</p>
          )}
        </div>
      )}

      {isSupabaseAvailable() && user && (
        <TeamSettings profile={profile} onRefreshProfile={refresh} />
      )}

      {canBackup && (
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive size={20} className="text-accent-green-light" />
          <h2 className="text-lg font-semibold text-text-primary">{t.autoBackup.title}</h2>
        </div>
        {isAutoBackupAvailable() ? (
          <>
            <p className="text-text-secondary text-sm mb-4">{t.autoBackup.description}</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-text-primary">{t.autoBackup.enabled}</span>
                <ToggleSwitch
                  checked={autoBackup.enabled}
                  label={t.autoBackup.enabled}
                  onChange={(enabled) => setAutoBackup(saveAutoBackupSettings({ enabled }))}
                />
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm text-text-secondary">{t.autoBackup.folder}</p>
                  <p className="text-sm text-text-primary truncate">
                    {autoBackup.folderPath ?? t.autoBackup.noFolder}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={handleChooseBackupFolder}>
                  <FolderOpen size={16} />
                  {t.autoBackup.chooseFolder}
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-text-secondary">{t.autoBackup.keepCount}</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={keepCountInput}
                  onChange={(e) => handleKeepCountChange(e.target.value)}
                  onBlur={() => setKeepCountInput(String(autoBackup.keepCount))}
                  className="w-24 px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-right"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-secondary">{t.autoBackup.lastBackup}</span>
                <span className="text-sm text-text-primary">
                  {autoBackup.lastBackupAt
                    ? format(autoBackup.lastBackupAt, 'dd.MM.yyyy HH:mm')
                    : t.autoBackup.never}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={handleBackupNow}
                  disabled={!autoBackup.folderPath || backingUp || restoreBusy}
                >
                  <Download size={18} />
                  {t.autoBackup.backUpNow}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleOpenRestoreList}
                  disabled={!autoBackup.folderPath || restoreBusy}
                >
                  <Upload size={18} />
                  {t.autoBackup.restoreFromList}
                </Button>
              </div>
              {cloudMode && (
                <p className="text-text-muted text-xs">{t.settings.restoreCloudNotice}</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-text-secondary text-sm">{t.autoBackup.browserHint}</p>
        )}
      </div>
      )}

      {canBackup && (
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} className="text-accent-green-light" />
          <h2 className="text-lg font-semibold text-text-primary">{t.settings.backupSection}</h2>
        </div>
        <p className="text-text-secondary text-sm mb-4">{t.settings.backupDescription}</p>
        <p className="text-text-muted text-xs mb-4">{t.settings.backupIncludesPhotos}</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleCreateBackup}>
            <Download size={18} />
            {t.settings.createBackup}
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} />
            {t.settings.restoreBackup}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleRestoreBackup}
            className="hidden"
          />
        </div>
        {cloudMode && (
          <p className="text-text-muted text-xs mt-3">{t.settings.restoreCloudNotice}</p>
        )}
      </div>
      )}

      {canReset && (
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">{t.common.dataManagement}</h2>
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            {t.common.resetDataDescription}
          </p>
          <Button
            variant="danger"
            disabled={cloudMode}
            onClick={async () => {
              if (confirm(t.common.resetDataConfirm)) {
                try {
                  await removeAllPhotos();
                } catch (error) {
                  console.error('[SettingsPage] Failed to remove photo files:', error);
                }
                try {
                  resetAllData();
                } catch (error) {
                  console.error('[SettingsPage] Reset failed:', error);
                  return;
                }
                window.location.reload();
              }
            }}
          >
            {t.common.resetData}
          </Button>
          {cloudMode && (
            <p className="text-text-muted text-xs">{t.cloudCustomers.localOnlyAction}</p>
          )}
        </div>
      </div>
      )}

      {canBackup && restoreList !== null && (
        <Modal
          isOpen
          onClose={() => { if (!restoreBusy) setRestoreList(null); }}
          title={t.autoBackup.restoreTitle}
          size="md"
        >
          {restoreLoading ? (
            <p className="text-text-secondary text-sm py-6 text-center">{t.autoBackup.loading}</p>
          ) : restoreList.length === 0 ? (
            <p className="text-text-muted text-sm py-6 text-center">{t.autoBackup.empty}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">{t.autoBackup.restorePick}</p>
              <div className="max-h-72 overflow-y-auto space-y-2">
                {restoreList.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    disabled={restoreBusy}
                    onClick={() => setSelectedBackup(entry.name)}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors ${
                      selectedBackup === entry.name
                        ? 'border-accent bg-surface'
                        : 'border-border bg-surface hover:border-elevated'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">
                        {format(new Date(entry.createdAt), 'dd.MM.yyyy HH:mm')}
                      </p>
                      <p className="text-xs text-text-muted truncate">{entry.name}</p>
                    </div>
                    <span className="text-xs text-text-secondary shrink-0">{formatBytes(entry.sizeBytes)}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button variant="ghost" onClick={() => setRestoreList(null)} disabled={restoreBusy}>
                  {t.common.cancel}
                </Button>
                <Button
                  disabled={!selectedBackup || restoreBusy}
                  onClick={() => {
                    const entry = restoreList.find((e) => e.name === selectedBackup);
                    if (entry) setConfirmRestore(entry);
                  }}
                >
                  <Upload size={16} />
                  {t.autoBackup.restoreAction}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {canBackup && confirmRestore && (
        <ConfirmDialog
          isOpen
          onClose={() => { if (!restoreBusy) setConfirmRestore(null); }}
          onConfirm={handleRestoreConfirm}
          title={t.autoBackup.restoreConfirmTitle}
          message={t.autoBackup.restoreConfirmMessage}
          confirmLabel={t.autoBackup.restoreAction}
          variant="danger"
        />
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-accent' : 'bg-elevated'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-text-inverse transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
