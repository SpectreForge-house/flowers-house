import { Customer } from '../types';

export interface CustomerStorageAdapter {
  getCustomers(): Customer[] | Promise<Customer[]>;
  addCustomer(customer: Customer): void | Promise<void>;
  updateCustomer(customer: Customer): void | Promise<void>;
  deleteCustomer(id: string): void | Promise<void>;
  deleteAllCustomers(): void | Promise<void>;
}

export type StorageMode = 'local' | 'supabase';

const STORAGE_MODE_KEY = 'flower-shop-storage-mode';

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
