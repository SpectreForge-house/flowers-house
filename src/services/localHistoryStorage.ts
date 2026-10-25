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

  async deleteHistoryByFilter(filters: { olderThan?: string }): Promise<number> {
    const all = getHistory();

    if (!filters.olderThan) {
      const count = all.length;
      saveHistory([]);
      return count;
    }

    const cutoff = new Date(filters.olderThan);
    const kept = all.filter(r => new Date(r.timestamp) >= cutoff);
    const deleted = all.length - kept.length;
    saveHistory(kept);
    return deleted;
  }
}
