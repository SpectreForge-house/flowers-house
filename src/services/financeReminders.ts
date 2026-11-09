import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FinanceEntry } from '../types';
import { hasIncomeEntry, todayKey } from './financeService';

/**
 * Evening reminder to fill in the day's revenue.
 *
 * Like the client-date reminders these are plain LOCAL notifications scheduled
 * by the app itself (no server). The list is rebuilt whenever the finance
 * entries or the settings change, and days that already have a revenue entry
 * are skipped.
 */

export interface FinanceReminderSettings {
  enabled: boolean;
  /** Local hour of the reminder (0-23). */
  hour: number;
}

/** Fired on `window` when the settings change, so the scheduler can resync. */
export const FINANCE_REMINDERS_CHANGED = 'flower-shop:finance-reminders-changed';

const SETTINGS_KEY = 'flower-shop.finance-reminders';

export const DEFAULT_FINANCE_REMINDER_HOUR = 20;
export const FINANCE_REMINDER_DAYS = 14;

/** Our notification ids live in this range, so only our own ones are cancelled. */
const ID_BASE = 2_000_000_000;
const ID_MAX = 2_099_999_999;
/** Test notification sits outside the range so a resync never cancels it. */
const TEST_ID = 2_100_000_001;

const CHANNEL_ID = 'finance-reminders-v1';
const CHANNEL_SOUND = 'notify_chime.wav';
const SMALL_ICON = 'ic_stat_flower';
const LARGE_ICON = 'ic_notification_large';
const ICON_COLOR = '#3d7a52';

export function isNativeNotificationsAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

function clampHour(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_FINANCE_REMINDER_HOUR;
  return Math.min(23, Math.max(0, Math.round(parsed)));
}

export function getFinanceReminderSettings(): FinanceReminderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FinanceReminderSettings>;
      return {
        enabled: parsed.enabled !== false,
        hour: clampHour(parsed.hour),
      };
    }
  } catch {
    // Broken/missing storage - fall back to the defaults.
  }
  // Enabled by default, like the client-date reminders.
  return { enabled: true, hour: DEFAULT_FINANCE_REMINDER_HOUR };
}

export function setFinanceReminderSettings(
  patch: Partial<FinanceReminderSettings>,
): FinanceReminderSettings {
  const current = getFinanceReminderSettings();
  const next: FinanceReminderSettings = {
    enabled: patch.enabled ?? current.enabled,
    hour: clampHour(patch.hour ?? current.hour),
  };

  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures - the choice just won't survive a restart.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(FINANCE_REMINDERS_CHANGED));
  }
  return next;
}

export interface FinanceReminderMessages {
  title: string;
  body: string;
  /** Body for the on-demand test notification. */
  testBody: string;
}

export interface FinanceReminderItem {
  id: number;
  at: Date;
  title: string;
  body: string;
}

/**
 * Build the evening reminders for the next {@link FINANCE_REMINDER_DAYS} days.
 * Pure function (no native calls) so it is easy to test.
 */
export function buildFinanceReminders(
  entries: FinanceEntry[],
  settings: FinanceReminderSettings,
  messages: FinanceReminderMessages,
  now: Date = new Date(),
): FinanceReminderItem[] {
  if (!settings.enabled) return [];

  const items: FinanceReminderItem[] = [];
  const hour = clampHour(settings.hour);

  for (let offset = 0; offset < FINANCE_REMINDER_DAYS; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const dateKey = todayKey(day);
    if (hasIncomeEntry(entries, dateKey)) continue;

    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
    if (at.getTime() <= now.getTime()) continue;

    items.push({
      id: ID_BASE + offset,
      at,
      title: messages.title,
      body: messages.body,
    });
  }

  return items;
}

export interface FinanceNotificationChannelLabels {
  name: string;
  description: string;
}

export async function ensureFinanceNotificationChannel(
  labels: FinanceNotificationChannelLabels,
): Promise<void> {
  if (!isNativeNotificationsAvailable()) return;

  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: labels.name,
      description: labels.description,
      importance: 4, // IMPORTANCE_HIGH -> heads-up
      visibility: 1, // VISIBILITY_PUBLIC -> shown on the lock screen
      sound: CHANNEL_SOUND,
      vibration: true,
      lights: true,
      lightColor: ICON_COLOR,
    });
  } catch (err) {
    console.error('[financeReminders] createChannel failed:', err);
  }
}

/**
 * Replace the previously scheduled finance reminders. Only notifications in
 * our own id range are cancelled, so client-date reminders stay untouched.
 */
export async function syncFinanceReminders(items: FinanceReminderItem[]): Promise<number> {
  if (!isNativeNotificationsAvailable()) return 0;

  try {
    const pending = await LocalNotifications.getPending();
    const ours = (pending.notifications ?? [])
      .filter((notification) => notification.id >= ID_BASE && notification.id <= ID_MAX)
      .map((notification) => ({ id: notification.id }));

    if (ours.length > 0) {
      await LocalNotifications.cancel({ notifications: ours });
    }

    if (items.length === 0) return 0;

    await LocalNotifications.schedule({
      notifications: items.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        largeBody: item.body,
        smallIcon: SMALL_ICON,
        iconColor: ICON_COLOR,
        largeIcon: LARGE_ICON,
        sound: CHANNEL_SOUND,
        channelId: CHANNEL_ID,
        schedule: { at: item.at, allowWhileIdle: true },
        extra: { route: '/finance' },
      })),
    });

    return items.length;
  } catch (err) {
    console.error('[financeReminders] Failed to schedule reminders:', err);
    return 0;
  }
}

export async function clearFinanceReminders(): Promise<void> {
  await syncFinanceReminders([]);
}

async function ensurePermission(): Promise<boolean> {
  if (!isNativeNotificationsAvailable()) return false;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'granted') return true;
    if (display === 'denied') return false;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  } catch (err) {
    console.error('[financeReminders] Permission check failed:', err);
    return false;
  }
}

/**
 * Sends a notification a few seconds from now so the user can verify that the
 * phone actually shows the app's notifications. Returns true when it was
 * scheduled (the system may still suppress it if the channel is muted).
 */
export async function sendTestFinanceNotification(
  labels: FinanceNotificationChannelLabels,
  messages: FinanceReminderMessages,
): Promise<boolean> {
  if (!isNativeNotificationsAvailable()) return false;

  const granted = await ensurePermission();
  if (!granted) return false;

  await ensureFinanceNotificationChannel(labels);

  try {
    await LocalNotifications.cancel({ notifications: [{ id: TEST_ID }] });
  } catch {
    // Nothing scheduled yet - that's fine.
  }

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TEST_ID,
          title: messages.title,
          body: messages.testBody,
          largeBody: messages.testBody,
          smallIcon: SMALL_ICON,
          iconColor: ICON_COLOR,
          largeIcon: LARGE_ICON,
          sound: CHANNEL_SOUND,
          channelId: CHANNEL_ID,
          schedule: { at: new Date(Date.now() + 5_000), allowWhileIdle: true },
          extra: { route: '/finance', test: true },
        },
      ],
    });
    return true;
  } catch (err) {
    console.error('[financeReminders] Failed to send test notification:', err);
    return false;
  }
}

/** Opens the finance page when a reminder is tapped. */
export function onFinanceNotificationAction(handler: () => void): () => void {
  if (!isNativeNotificationsAvailable()) return () => {};

  let removed = false;
  const listenerPromise = LocalNotifications.addListener(
    'localNotificationActionPerformed',
    (action) => {
      const extra = action?.notification?.extra as { route?: unknown } | undefined;
      if (extra?.route === '/finance') handler();
    },
  );

  return () => {
    if (removed) return;
    removed = true;
    void listenerPromise
      .then((listener) => listener.remove())
      .catch(() => {
        // The app is closing - nothing to clean up.
      });
  };
}
