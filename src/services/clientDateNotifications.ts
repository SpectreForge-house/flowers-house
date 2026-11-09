import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Customer, ImportantDateType } from '../types';
import { getNextOccurrence, startOfToday } from './clientDatesService';

/**
 * Local reminders for the clients' important dates (birthdays, name days,
 * anniversaries) on the phone.
 *
 * They are plain LOCAL notifications: the app itself schedules them with the
 * operating system, so no server, account or push service is involved. The
 * list is rebuilt and rescheduled every time the app opens, the client data
 * changes or the language/settings change; Android keeps the alarms even after
 * a reboot (the Capacitor plugin restores them).
 *
 * Two notifications are created for every date:
 *   1. `daysBefore` days before the date (default 5) at 09:00;
 *   2. on the day itself at 09:00.
 */

export interface ClientDateNotificationSettings {
  enabled: boolean;
  /** How many days before the date the reminder fires (1-30). */
  daysBefore: number;
}

/** Fired on `window` when the settings change, so the scheduler can resync. */
export const CLIENT_DATE_NOTIFICATIONS_CHANGED = 'flower-shop:client-date-notifications-changed';

const SETTINGS_KEY = 'flower-shop.client-date-notifications';
const PROMPTED_KEY = 'flower-shop.client-date-notifications.prompted';

export const DEFAULT_DAYS_BEFORE = 5;
export const MIN_DAYS_BEFORE = 1;
export const MAX_DAYS_BEFORE = 30;

/** Time of day the reminder is delivered (local time). */
const REMINDER_HOUR = 9;
/** Our notification ids live in this range, so only our own ones are cancelled. */
const ID_BASE = 1_000_000_000;
const MAX_NOTIFICATIONS = 200;

/**
 * Android notification channel. The id is versioned on purpose: Android
 * channels are immutable, so changing the sound/importance later requires a
 * new channel id.
 */
const CHANNEL_ID = 'client-dates-v1';
const CHANNEL_SOUND = 'notify_chime.wav';
const SMALL_ICON = 'ic_stat_flower';
const LARGE_ICON = 'ic_notification_large';
const ICON_COLOR = '#3d7a52';

export function isNativeNotificationsAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

function clampDays(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS_BEFORE;
  return Math.min(MAX_DAYS_BEFORE, Math.max(MIN_DAYS_BEFORE, Math.round(parsed)));
}

export function getClientDateNotificationSettings(): ClientDateNotificationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ClientDateNotificationSettings>;
      return {
        enabled: parsed.enabled !== false,
        daysBefore: clampDays(parsed.daysBefore),
      };
    }
  } catch {
    // Broken/missing storage - fall back to the defaults.
  }
  // Enabled by default: after installing the app the shop gets the reminders
  // without digging into the settings.
  return { enabled: true, daysBefore: DEFAULT_DAYS_BEFORE };
}

export function setClientDateNotificationSettings(
  patch: Partial<ClientDateNotificationSettings>,
): ClientDateNotificationSettings {
  const current = getClientDateNotificationSettings();
  const next: ClientDateNotificationSettings = {
    enabled: patch.enabled ?? current.enabled,
    daysBefore: clampDays(patch.daysBefore ?? current.daysBefore),
  };

  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures - the choice just won't survive a restart.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CLIENT_DATE_NOTIFICATIONS_CHANGED));
  }
  return next;
}

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt';

export async function getNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNativeNotificationsAvailable()) return 'denied';
  try {
    const { display } = await LocalNotifications.checkPermissions();
    // Capacitor can also report 'prompt-with-rationale'; for our purposes it
    // simply means "the user has not decided yet".
    if (display === 'granted' || display === 'denied') return display;
    return 'prompt';
  } catch (err) {
    console.error('[clientDateNotifications] checkPermissions failed:', err);
    return 'denied';
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNativeNotificationsAvailable()) return false;
  try {
    const { display } = await LocalNotifications.requestPermissions();
    return display === 'granted';
  } catch (err) {
    console.error('[clientDateNotifications] requestPermissions failed:', err);
    return false;
  }
}

/** The system dialog is shown only once per installation. */
export function hasPromptedForNotifications(): boolean {
  try {
    return localStorage.getItem(PROMPTED_KEY) === 'true';
  } catch {
    return true;
  }
}

export function markPromptedForNotifications(): void {
  try {
    localStorage.setItem(PROMPTED_KEY, 'true');
  } catch {
    // Ignore storage failures.
  }
}

/** Texts are passed in so the service stays independent from the i18n layer. */
export interface ClientDateNotificationMessages {
  typeLabel: (type: ImportantDateType) => string;
  formatDate: (date: Date) => string;
  today: string;
  tomorrow: string;
  inDays: (days: number) => string;
  dayHint: string;
}

export interface ClientDateNotificationItem {
  id: number;
  at: Date;
  title: string;
  body: string;
  /** Client the tap should open. */
  clientId: string;
}

export interface ClientDateNotificationChannelLabels {
  name: string;
  description: string;
}

/**
 * Creates (or updates the description of) the Android notification channel.
 * Importance HIGH makes the reminder pop up as a heads-up banner, like a
 * messaging app notification, and the custom chime is attached to it.
 */
export async function ensureClientDateNotificationChannel(
  labels: ClientDateNotificationChannelLabels,
): Promise<void> {
  if (!isNativeNotificationsAvailable()) return;

  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: labels.name,
      description: labels.description,
      importance: 4, // IMPORTANCE_HIGH -> heads-up
      visibility: 1, // VISIBILITY_PUBLIC -> shown on the lock screen
      sound: CHANNEL_SOUND, // res/raw/notify_chime.wav
      vibration: true,
      lights: true,
      lightColor: ICON_COLOR,
    });
  } catch (err) {
    // Channels are Android-only; a failure must not break scheduling.
    console.error('[clientDateNotifications] createChannel failed:', err);
  }
}

function atHour(date: Date, hour: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

/** Stable 32-bit id derived from the event, so the same event keeps its id. */
function notificationId(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ID_BASE + (Math.abs(hash) % 1_000_000_000);
}

/**
 * Build the list of notifications for the upcoming client dates. Pure function
 * (no native calls) so it can be tested and reused.
 */
export function buildClientDateNotifications(
  customers: Customer[],
  daysBefore: number,
  messages: ClientDateNotificationMessages,
  now: Date = new Date(),
  maxCount: number = MAX_NOTIFICATIONS,
): ClientDateNotificationItem[] {
  const days = clampDays(daysBefore);
  const today = startOfToday();
  const items: ClientDateNotificationItem[] = [];

  for (const customer of customers) {
    for (const date of customer.importantDates ?? []) {
      const occurrence = getNextOccurrence(date?.date ?? '', today);
      if (!occurrence) continue;

      const typeLabel = messages.typeLabel(date.type);
      const title = `${typeLabel} — ${customer.name}`;
      const whenLabel = days === 1 ? messages.tomorrow : messages.inDays(days);
      const dateText = messages.formatDate(occurrence);
      const label = date.label?.trim();
      const baseBody = label ? `${dateText} · ${whenLabel} · ${label}` : `${dateText} · ${whenLabel}`;

      const reminderAt = atHour(addDays(occurrence, -days), REMINDER_HOUR);
      if (reminderAt.getTime() > now.getTime()) {
        items.push({
          id: notificationId(`${customer.id}|${date.id}|reminder|${timeKey(occurrence)}`),
          at: reminderAt,
          title,
          body: baseBody,
          clientId: customer.id,
        });
      }

      const dayAt = atHour(occurrence, REMINDER_HOUR);
      if (dayAt.getTime() > now.getTime()) {
        items.push({
          id: notificationId(`${customer.id}|${date.id}|day|${timeKey(occurrence)}`),
          at: dayAt,
          title,
          body: `${dateText} · ${messages.today}. ${messages.dayHint}`,
          clientId: customer.id,
        });
      }
    }
  }

  return items
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, Math.max(0, maxCount));
}

function timeKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Replace the previously scheduled client-date notifications with `items`.
 * Only notifications created by this service are touched.
 * Returns how many reminders are now scheduled.
 */
export async function syncClientDateNotifications(
  items: ClientDateNotificationItem[],
): Promise<number> {
  if (!isNativeNotificationsAvailable()) return 0;

  try {
    const pending = await LocalNotifications.getPending();
    const ours = (pending.notifications ?? [])
      .filter((notification) => notification.id >= ID_BASE && notification.id < ID_BASE + 1_000_000_000)
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
        // Monochrome flower in the status bar + colored badge on the left.
        smallIcon: SMALL_ICON,
        iconColor: ICON_COLOR,
        largeIcon: LARGE_ICON,
        sound: CHANNEL_SOUND, // Android 7.x (Android 8+ uses the channel sound)
        channelId: CHANNEL_ID,
        schedule: { at: item.at, allowWhileIdle: true },
        // Needed to open the client's card when the reminder is tapped.
        extra: { clientId: item.clientId },
      })),
    });

    return items.length;
  } catch (err) {
    console.error('[clientDateNotifications] Failed to schedule reminders:', err);
    return 0;
  }
}

/** Remove every reminder this service scheduled (used when they are disabled). */
export async function clearClientDateNotifications(): Promise<void> {
  await syncClientDateNotifications([]);
}

/**
 * Calls `handler` with the client id stored in the notification when the user
 * taps a reminder (works for a cold start too: Capacitor delivers the pending
 * action once the listener is attached).
 * Returns an unsubscribe function.
 */
export function onClientDateNotificationAction(
  handler: (clientId: string) => void,
): () => void {
  if (!isNativeNotificationsAvailable()) return () => {};

  let removed = false;
  const listenerPromise = LocalNotifications.addListener(
    'localNotificationActionPerformed',
    (action) => {
      const extra = action?.notification?.extra as { clientId?: unknown } | undefined;
      const clientId = extra?.clientId;
      if (typeof clientId === 'string' && clientId) handler(clientId);
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
