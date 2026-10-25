import { Settings } from '../types';

export interface SettingsStorageAdapter {
  getSettings(): Promise<Settings>;
  updateSettings(settings: Settings): Promise<void>;
}
