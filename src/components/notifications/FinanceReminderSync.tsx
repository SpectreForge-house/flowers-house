import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '../../hooks/useStore';
import { useLanguage } from '../../i18n';
import {
  FINANCE_REMINDERS_CHANGED,
  FinanceReminderMessages,
  buildFinanceReminders,
  clearFinanceReminders,
  ensureFinanceNotificationChannel,
  getFinanceReminderSettings,
  isNativeNotificationsAvailable,
  onFinanceNotificationAction,
  syncFinanceReminders,
} from '../../services/financeReminders';
import {
  getNotificationPermission,
  hasPromptedForNotifications,
  markPromptedForNotifications,
  requestNotificationPermission,
} from '../../services/clientDateNotifications';

/**
 * Keeps the evening "enter today's revenue" reminders in sync with the finance
 * data. Rendered once in the layout; days that already have a revenue entry are
 * skipped automatically.
 */
export function FinanceReminderSync() {
  const { entries } = useFinance();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [settingsVersion, setSettingsVersion] = useState(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleChange = () => setSettingsVersion((version) => version + 1);
    window.addEventListener(FINANCE_REMINDERS_CHANGED, handleChange);
    return () => window.removeEventListener(FINANCE_REMINDERS_CHANGED, handleChange);
  }, []);

  useEffect(
    () =>
      onFinanceNotificationAction(() => {
        navigate('/finance');
      }),
    [navigate],
  );

  const signature = useMemo(() => {
    const settings = getFinanceReminderSettings();
    return JSON.stringify({
      enabled: settings.enabled,
      hour: settings.hour,
      language,
      settingsVersion,
      entries: entries.map((entry) => [entry.id, entry.type, entry.date]),
    });
  }, [entries, language, settingsVersion]);

  useEffect(() => {
    if (!isNativeNotificationsAvailable()) return;

    const settings = getFinanceReminderSettings();
    const messages: FinanceReminderMessages = {
      title: t.finance.reminderTitle,
      body: t.finance.reminderBody,
      testBody: t.finance.reminderTestBody,
    };

    const timer = setTimeout(() => {
      queueRef.current = queueRef.current
        .then(async () => {
          if (!settings.enabled) {
            await clearFinanceReminders();
            return;
          }

          await ensureFinanceNotificationChannel({
            name: t.finance.reminderChannelName,
            description: t.finance.reminderChannelDescription,
          });

          let permission = await getNotificationPermission();
          if (permission === 'prompt' && !hasPromptedForNotifications()) {
            markPromptedForNotifications();
            permission = (await requestNotificationPermission()) ? 'granted' : 'denied';
          }
          if (permission !== 'granted') return;

          await syncFinanceReminders(
            buildFinanceReminders(entries, settings, messages),
          );
        })
        .catch((err) => {
          console.error('[FinanceReminderSync] Failed:', err);
        });
    }, 1500);

    return () => clearTimeout(timer);
    // `signature` already covers entries, language and reminder settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}
