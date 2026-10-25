import { useCallback, useEffect, useState } from 'react';
import * as storage from '../services/storage';
import { getStorageMode } from '../services/storageAdapter';
import { isSupabaseAvailable, onAuthChange, profileReady } from '../services/authService';
import { getReminderDismissKey, Reminder } from '../services/reminderService';
import { getReminderStorageAdapter } from './useStore';
import { isCloudActive } from '../services/storageMode';
import { readActiveCloudCache, writeCloudCache } from '../services/cloudCache';

function initialReadIds(): string[] {
  return readActiveCloudCache('readReminders') ?? storage.getReadReminders();
}

function initialDismissedKeys(): string[] {
  return readActiveCloudCache('dismissedReminders') ?? storage.getDismissedReminders();
}

export function useReminderState() {
  const [readIds, setReadIds] = useState<string[]>(initialReadIds);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>(initialDismissedKeys);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      if (getStorageMode() === 'supabase' && isSupabaseAvailable()) {
        await profileReady;
      }
      const adapter = getReminderStorageAdapter();
      const [read, dismissed] = await Promise.all([
        adapter.getReadReminders(),
        adapter.getDismissedReminders(),
      ]);
      if (isCloudActive()) {
        writeCloudCache('readReminders', read);
        writeCloudCache('dismissedReminders', dismissed);
      }
      setReadIds(read);
      setDismissedKeys(dismissed);
    } catch (err) {
      console.error('[useReminderState] Failed to load reminder state:', err);
      setReadIds(readActiveCloudCache('readReminders') ?? storage.getReadReminders());
      setDismissedKeys(readActiveCloudCache('dismissedReminders') ?? storage.getDismissedReminders());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return onAuthChange(() => {
      load();
    });
  }, [load]);

  const persistRead = useCallback((next: string[]) => {
    setReadIds(next);
    void getReminderStorageAdapter().saveReadReminders(next)
      .then(() => {
        if (isCloudActive()) writeCloudCache('readReminders', next);
        else storage.saveReadReminders(next);
      })
      .catch(err => {
        console.error('[useReminderState] Failed to save read reminders:', err);
      });
  }, []);

  const persistDismissed = useCallback((next: string[]) => {
    setDismissedKeys(next);
    void getReminderStorageAdapter().saveDismissedReminders(next)
      .then(() => {
        if (isCloudActive()) writeCloudCache('dismissedReminders', next);
        else storage.saveDismissedReminders(next);
      })
      .catch(err => {
        console.error('[useReminderState] Failed to save dismissed reminders:', err);
      });
  }, []);

  const markRead = useCallback((reminderId: string) => {
    if (readIds.includes(reminderId)) return;
    persistRead([...readIds, reminderId]);
  }, [readIds, persistRead]);

  const dismiss = useCallback((reminder: Reminder) => {
    const key = getReminderDismissKey(reminder);
    if (dismissedKeys.includes(key)) return;
    persistDismissed([...dismissedKeys, key]);
  }, [dismissedKeys, persistDismissed]);

  const markAllRead = useCallback((ids: string[]) => {
    persistRead(Array.from(new Set(ids)));
  }, [persistRead]);

  return {
    readIds,
    dismissedKeys,
    loading,
    markRead,
    dismiss,
    markAllRead,
    persistRead,
    persistDismissed,
    refresh: load,
  };
}
