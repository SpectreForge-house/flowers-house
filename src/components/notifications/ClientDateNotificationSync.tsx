import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '../../hooks/useStore';
import { useLanguage } from '../../i18n';
import {
  CLIENT_DATE_NOTIFICATIONS_CHANGED,
  buildClientDateNotifications,
  clearClientDateNotifications,
  ensureClientDateNotificationChannel,
  getClientDateNotificationSettings,
  getNotificationPermission,
  hasPromptedForNotifications,
  isNativeNotificationsAvailable,
  markPromptedForNotifications,
  onClientDateNotificationAction,
  requestNotificationPermission,
  syncClientDateNotifications,
  ClientDateNotificationMessages,
} from '../../services/clientDateNotifications';

/**
 * Keeps the phone's local reminders for the clients' important dates in sync
 * with the current client list. Rendered once in the layout, so it works from
 * any page and also picks up changes made on another device (the realtime
 * subscription lives inside `useCustomers`).
 */
export function ClientDateNotificationSync() {
  const { customers } = useCustomers();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [settingsVersion, setSettingsVersion] = useState(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleChange = () => setSettingsVersion((version) => version + 1);
    window.addEventListener(CLIENT_DATE_NOTIFICATIONS_CHANGED, handleChange);
    return () => window.removeEventListener(CLIENT_DATE_NOTIFICATIONS_CHANGED, handleChange);
  }, []);

  // Tapping a reminder opens the client's card.
  useEffect(
    () =>
      onClientDateNotificationAction((clientId) => {
        navigate(`/customers?client=${encodeURIComponent(clientId)}`);
      }),
    [navigate],
  );

  // Everything that changes the scheduled reminders. When the signature is
  // identical nothing is rescheduled.
  const signature = useMemo(() => {
    const settings = getClientDateNotificationSettings();
    return JSON.stringify({
      enabled: settings.enabled,
      daysBefore: settings.daysBefore,
      language,
      settingsVersion,
      customers: customers.map((customer) => [
        customer.id,
        customer.name,
        (customer.importantDates ?? []).map((date) => [
          date.id,
          date.type,
          date.date,
          date.label ?? '',
        ]),
      ]),
    });
  }, [customers, language, settingsVersion]);

  useEffect(() => {
    if (!isNativeNotificationsAvailable()) return;

    const settings = getClientDateNotificationSettings();
    const messages: ClientDateNotificationMessages = {
      typeLabel: (type) => t.clientDates.types[type],
      formatDate: (date) =>
        new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' }).format(date),
      today: t.clientDates.today,
      tomorrow: t.clientDates.tomorrow,
      inDays: (days) => t.clientDates.inDays.replace('{days}', String(days)),
      dayHint: t.clientDates.notifyDayHint,
    };

    // Runs are serialized so two quick updates cannot cancel each other's
    // notifications. The small delay lets the client list finish loading.
    const timer = setTimeout(() => {
      queueRef.current = queueRef.current
        .then(async () => {
          if (!settings.enabled) {
            await clearClientDateNotifications();
            return;
          }

          await ensureClientDateNotificationChannel({
            name: t.clientDates.notifyChannelName,
            description: t.clientDates.notifyChannelDescription,
          });

          let permission = await getNotificationPermission();
          if (permission === 'prompt' && !hasPromptedForNotifications()) {
            markPromptedForNotifications();
            permission = (await requestNotificationPermission()) ? 'granted' : 'denied';
          }
          if (permission !== 'granted') return;

          const items = buildClientDateNotifications(customers, settings.daysBefore, messages);
          await syncClientDateNotifications(items);
        })
        .catch((err) => {
          console.error('[ClientDateNotificationSync] Failed:', err);
        });
    }, 1200);

    return () => clearTimeout(timer);
    // `signature` already covers customers, language and notification settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}
