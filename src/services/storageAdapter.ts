import { Customer } from '../types';

export interface CustomerStorageAdapter {
  getCustomers(): Customer[] | Promise<Customer[]>;
  addCustomer(customer: Customer): void | Promise<void>;
  updateCustomer(customer: Customer): void | Promise<void>;
  deleteCustomer(id: string): void | Promise<void>;
  deleteAllCustomers(): void | Promise<void>;
}

export type StorageMode = 'local' | 'supabase';

/**
 * Whether the app may switch to cloud storage automatically on start.
 * `auto` (the default) opts in; `local` keeps a manual local-storage choice.
 */
export type CloudModePreference = 'auto' | 'local';

const STORAGE_MODE_KEY = 'flower-shop-storage-mode';
const CLOUD_MODE_PREFERENCE_KEY = 'flower-shop-cloud-mode-preference';

export function getStorageMode(): StorageMode {
  try {
    const mode = localStorage.getItem(STORAGE_MODE_KEY);
    if (mode === 'supabase') return 'supabase';
  } catch {}
  return 'local';
}

export function setStorageMode(mode: StorageMode): void {
  localStorage.setItem(STORAGE_MODE_KEY, mode);
}

export function getCloudModePreference(): CloudModePreference {
  try {
    return localStorage.getItem(CLOUD_MODE_PREFERENCE_KEY) === 'local' ? 'local' : 'auto';
  } catch {
    return 'auto';
  }
}

export function setCloudModePreference(preference: CloudModePreference): void {
  try {
    localStorage.setItem(CLOUD_MODE_PREFERENCE_KEY, preference);
  } catch {}
}
