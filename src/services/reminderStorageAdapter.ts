export interface ReminderStorageAdapter {
  getReadReminders(): Promise<string[]>;
  saveReadReminders(ids: string[]): Promise<void>;
  getDismissedReminders(): Promise<string[]>;
  saveDismissedReminders(keys: string[]): Promise<void>;
}
