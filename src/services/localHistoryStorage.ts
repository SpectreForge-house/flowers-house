import { HistoryRecord } from '../types';
import { HistoryStorageAdapter } from './historyStorageAdapter';
import { getHistory, addHistory, saveHistory } from './storage';

export class LocalHistoryAdapter implements HistoryStorageAdapter {
  async getHistory(): Promise<HistoryRecord[]> {
    return getHistory();
  }

  async addHistory(record: HistoryRecord): Promise<void> {
    addHistory(record);
  }

  async saveHistory(records: HistoryRecord[]): Promise<void> {
    saveHistory(records);
  }

  async deleteHistory(id: string): Promise<void> {
    const all = getHistory();
    saveHistory(all.filter(r => r.id !== id));
  }

  async deleteHistoryByFilter(filters: { olderThan?: string; since?: string; until?: string }): Promise<number> {
    const all = getHistory();

    const since = filters.since ? new Date(filters.since).getTime() : null;
    const until = filters.until ? new Date(filters.until).getTime() : null;
    const olderThan = filters.olderThan ? new Date(filters.olderThan).getTime() : null;

    const kept = all.filter(record => {
      const time = new Date(record.timestamp).getTime();
      if (since === null && olderThan === null && until === null) return false;
      let remove = false;
      if (since !== null) {
        remove = time >= since && (until === null || time < until);
      } else if (olderThan !== null) {
        remove = time < olderThan;
      }
      return !remove;
    });

    const deleted = all.length - kept.length;
    saveHistory(kept);
    return deleted;
  }
}
