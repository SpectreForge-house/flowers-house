import { useState, useCallback, useEffect, useRef } from 'react';
import { HistoryRecord } from '../types';
import { HistoryStorageAdapter } from '../services/historyStorageAdapter';
import { LocalHistoryAdapter } from '../services/localHistoryStorage';
import { SupabaseHistoryAdapter } from '../services/supabaseHistoryStorage';
import { getFilteredHistory, deleteHistoryRecord, clearHistory, ClearHistoryPeriod } from '../services/historyService';
import { getStorageMode } from '../services/storageAdapter';
import { isSupabaseAvailable, profileReady, onAuthChange } from '../services/authService';
import { isCloudActive } from '../services/storageMode';
import { guardCloudWrites } from '../services/cloudWriteGuard';
import { readActiveCloudCache, writeCloudCache } from '../services/cloudCache';
import * as storage from '../services/storage';

function getHistoryAdapter(): HistoryStorageAdapter {
  if (isCloudActive()) {
    return guardCloudWrites(new SupabaseHistoryAdapter());
  }
  return new LocalHistoryAdapter();
}

export function useHistory() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const mode = getStorageMode();
      if (mode === 'supabase' && isSupabaseAvailable()) {
        await profileReady;
      }
      const adapter = getHistoryAdapter();
      const data = await getFilteredHistory({}, adapter);
      const list = Array.isArray(data) ? data : [];
      if (isCloudActive()) writeCloudCache('history', list);
      setRecords(list);
      setError(null);
    } catch (err) {
      console.error('[useHistory] Failed to load history:', err);
      const message = err instanceof Error ? err.message : 'Failed to load history';
      setError(message);
      setRecords(readActiveCloudCache('history') ?? storage.getHistory());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const unsubscribe = onAuthChange((state) => {
      const newUserId = state.user?.id ?? null;
      if (newUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = newUserId;
        setLoading(true);
        loadHistory();
      }
    });
    return unsubscribe;
  }, [loadHistory]);

  const refresh = useCallback(async () => {
    await loadHistory();
  }, [loadHistory]);

  const deleteRecord = useCallback(async (id: string) => {
    const adapter = getHistoryAdapter();
    await deleteHistoryRecord(id, adapter);
    await loadHistory();
  }, [loadHistory]);

  const clearAllHistory = useCallback(async (period: ClearHistoryPeriod) => {
    const adapter = getHistoryAdapter();
    const count = await clearHistory(period, adapter);
    await loadHistory();
    return count;
  }, [loadHistory]);

  return { records, loading, error, refresh, deleteRecord, clearHistory: clearAllHistory, getAdapter: getHistoryAdapter };
}
