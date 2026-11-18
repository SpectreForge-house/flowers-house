import { v4 as uuidv4 } from 'uuid';
import { HistoryRecord, HistoryActionType, EntityType } from '../types';
import { HistoryStorageAdapter } from './historyStorageAdapter';
import { LocalHistoryAdapter } from './localHistoryStorage';

let defaultAdapter: HistoryStorageAdapter | null = null;

function getDefaultAdapter(): HistoryStorageAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new LocalHistoryAdapter();
  }
  return defaultAdapter;
}

export function recordHistory(
  actionType: HistoryActionType,
  entityType: EntityType,
  entityId: string,
  description: string,
  metadata?: Record<string, string | number | boolean>,
  adapter?: HistoryStorageAdapter
): void {
  const record: HistoryRecord = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    actionType,
    entityType,
    entityId,
    description,
    metadata,
  };
  const storage = adapter ?? getDefaultAdapter();
  const operation = storage.addHistory(record);
  // The promise is intentionally not awaited (call sites are fire-and-forget),
  // but a rejected write must not become an unhandled rejection.
  if (operation && typeof operation.catch === 'function') {
    void operation.catch(error => {
      console.error('[historyService] Failed to record history:', error);
    });
  }
}

export async function getFilteredHistory(filters: {
  dateFrom?: string;
  dateTo?: string;
  actionType?: HistoryActionType;
  entityType?: EntityType;
}, adapter?: HistoryStorageAdapter): Promise<HistoryRecord[]> {
  const storage = adapter ?? getDefaultAdapter();
  let history = await storage.getHistory();

  if (filters.dateFrom) {
    history = history.filter(r => r.timestamp >= filters.dateFrom!);
  }
  if (filters.dateTo) {
    const toDate = new Date(filters.dateTo!);
    toDate.setDate(toDate.getDate() + 1);
    history = history.filter(r => r.timestamp < toDate.toISOString());
  }
  if (filters.actionType) {
    history = history.filter(r => r.actionType === filters.actionType);
  }
  if (filters.entityType) {
    history = history.filter(r => r.entityType === filters.entityType);
  }

  return history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function deleteHistoryRecord(id: string, adapter?: HistoryStorageAdapter): Promise<void> {
  const storage = adapter ?? getDefaultAdapter();
  await storage.deleteHistory(id);
}

export type ClearHistoryPeriod = 'yesterday' | '7days' | 'month' | 'year' | 'all';

export interface HistoryClearRange {
  /** Delete records at or after this ISO timestamp. */
  since?: string;
  /** Delete records strictly before this ISO timestamp. */
  until?: string;
}

/**
 * One source of truth for "which records does this menu item delete".
 * The confirmation dialog counts with it and `clearHistory` deletes with it,
 * so the number the owner confirms is the number that disappears.
 */
export function getHistoryClearRange(
  period: ClearHistoryPeriod,
  now: Date = new Date(),
): HistoryClearRange {
  const startOfDay = (date: Date): Date => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  switch (period) {
    case 'yesterday': {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 1);
      return { since: start.toISOString(), until: startOfDay(now).toISOString() };
    }
    case '7days': {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 7);
      return { since: start.toISOString() };
    }
    case 'month': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      return { since: start.toISOString() };
    }
    case 'year': {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      return { since: start.toISOString() };
    }
    case 'all':
    default:
      return {};
  }
}

/** True when the record falls inside the range that would be cleared. */
export function isInHistoryClearRange(timestamp: string, range: HistoryClearRange): boolean {
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return false;
  if (range.since && time < new Date(range.since).getTime()) return false;
  if (range.until && time >= new Date(range.until).getTime()) return false;
  return true;
}

export async function clearHistory(period: ClearHistoryPeriod, adapter?: HistoryStorageAdapter): Promise<number> {
  const storage = adapter ?? getDefaultAdapter();
  return storage.deleteHistoryByFilter(getHistoryClearRange(period, new Date()));
}
