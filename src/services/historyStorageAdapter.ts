import { HistoryRecord } from '../types';

export interface HistoryStorageAdapter {
  getHistory(): Promise<HistoryRecord[]>;
  addHistory(record: HistoryRecord): Promise<void>;
  saveHistory(records: HistoryRecord[]): Promise<void>;
  deleteHistory(id: string): Promise<void>;
  deleteHistoryByFilter(filters: { olderThan?: string }): Promise<number>;
}
