import { FinanceEntry } from '../types';

export interface FinanceStorageAdapter {
  getEntries(): Promise<FinanceEntry[]>;
  addEntry(entry: FinanceEntry): Promise<void>;
  updateEntry(entry: FinanceEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  deleteAllEntries(): Promise<void>;
}
