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
  storage.addHistory(record);
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

export async function clearHistory(period: ClearHistoryPeriod, adapter?: HistoryStorageAdapter): Promise<number> {
  const storage = adapter ?? getDefaultAdapter();
  const now = new Date();

  if (period === 'all') {
    return storage.deleteHistoryByFilter({});
  }

  let cutoff: Date;
  switch (period) {
    case 'yesterday':
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 1);
      cutoff.setHours(0, 0, 0, 0);
      break;
    case '7days':
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
      break;
    case 'month':
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1);
      break;
    case 'year':
      cutoff = new Date(now);
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
  }

  return storage.deleteHistoryByFilter({ olderThan: cutoff!.toISOString() });
}
