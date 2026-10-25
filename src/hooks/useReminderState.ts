import { useCallback, useEffect, useState } from 'react';
import * as storage from '../services/storage';
import { getStorageMode } from '../services/storageAdapter';
import { isSupabaseAvailable, onAuthChange, profileReady } from '../services/authService';
import { getReminderDismissKey, Reminder } from '../services/reminderService';
import { getReminderStorageAdapter } from './useStore';

export function useReminderState() {
  const [readIds, setReadIds] = useState<string[]>(storage.getReadReminders());
  const [dismissedKeys, setDismissedKeys] = useState<string[]>(storage.getDismissedReminders());
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
      storage.saveReadReminders(read);
      storage.saveDismissedReminders(dismissed);
      setReadIds(read);
      setDismissedKeys(dismissed);
    } catch (err) {
      console.error('[useReminderState] Failed to load reminder state:', err);
      setReadIds(storage.getReadReminders());
      setDismissedKeys(storage.getDismissedReminders());
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
    storage.saveReadReminders(next);
    setReadIds(next);
    void getReminderStorageAdapter().saveReadReminders(next).catch(err => {
      console.error('[useReminderState] Failed to save read reminders:', err);
    });
  }, []);

  const persistDismissed = useCallback((next: string[]) => {
    storage.saveDismissedReminders(next);
    setDismissedKeys(next);
    void getReminderStorageAdapter().saveDismissedReminders(next).catch(err => {
      console.error('[useReminderState] Failed to save dismissed reminders:', err);
    });
  }, []);

  const markRead = useCallback((reminderId: string) => {
    setReadIds(current => {
      if (current.includes(reminderId)) return current;
      const next = [...current, reminderId];
      storage.saveReadReminders(next);
      void getReminderStorageAdapter().saveReadReminders(next).catch(err => {
        console.error('[useReminderState] Failed to save read reminder:', err);
      });
      return next;
    });
  }, []);

  const dismiss = useCallback((reminder: Reminder) => {
    const key = getReminderDismissKey(reminder);
    setDismissedKeys(current => {
      if (current.includes(key)) return current;
      const next = [...current, key];
      storage.saveDismissedReminders(next);
      void getReminderStorageAdapter().saveDismissedReminders(next).catch(err => {
        console.error('[useReminderState] Failed to save dismissed reminder:', err);
      });
      return next;
    });
  }, []);

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
