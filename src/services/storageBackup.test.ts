import { beforeEach, describe, expect, it } from 'vitest';
import {
  BackupData,
  STORAGE_VERSION,
  createBackup,
  getCustomers,
  getFinanceEntries,
  getLanguage,
  getPurchases,
  resetAllData,
  restoreBackup,
  saveCustomers,
  saveFinanceEntries,
  savePurchases,
  setLanguage,
} from './storage';
import { getCloudModePreference, getStorageMode, setStorageMode } from './storageAdapter';
import { CustomTheme, createCustomTheme, loadCustomThemes, saveCustomThemes } from '../themes/customTheme';
import { sampleSettings } from '../data/sampleData';
import { Customer } from '../types';

const customer: Customer = {
  id: 'customer-1',
  name: 'Ivana Petrova',
  phone: '+359 888 123 456',
  address: 'Sofia, Bulgaria',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

const customTheme: CustomTheme = createCustomTheme({
  label: 'Test theme',
  description: 'A theme created by the test',
  mode: 'dark',
  colors: {
    background: '#101010',
    card: '#202020',
    accent: '#e07a5f',
    accent2: '#81b29a',
    text: '#f2f2f2',
  },
});

function backupFixture(overrides: Partial<BackupData> = {}): BackupData {
  return {
    version: '1.1.0',
    storageVersion: STORAGE_VERSION,
    createdAt: '2026-01-01T00:00:00.000Z',
    customers: [],
    inventory: [],
    bouquets: [],
    orders: [],
    deliveries: [],
    transactions: [],
    reservations: [],
    history: [],
    settings: sampleSettings,
    language: 'en',
    remindersRead: [],
    ...overrides,
  };
}

describe('backup round trip', () => {
  beforeEach(() => {
    saveCustomers([customer]);
    saveFinanceEntries([
      {
        id: 'finance-1',
        type: 'income',
        date: '2026-02-01',
        amount: 120,
        note: 'Bouquet sold',
        createdAt: '2026-02-01T10:00:00.000Z',
        updatedAt: '2026-02-01T10:00:00.000Z',
      },
    ]);
    savePurchases([
      {
        id: 'purchase-1',
        customerId: customer.id,
        name: 'Spring bouquet',
        composition: 'Tulips and eucalyptus',
        price: 45,
        date: '2026-02-02',
        createdAt: '2026-02-02T10:00:00.000Z',
        updatedAt: '2026-02-02T10:00:00.000Z',
      },
    ]);
    setLanguage('ru');
    saveCustomThemes([customTheme]);
  });

  it('writes the current format marker and includes custom themes', async () => {
    const backup = await createBackup({ includePhotos: false });

    expect(backup.version).toBe('1.1.0');
    expect(backup.storageVersion).toBe(STORAGE_VERSION);
    expect(backup.customThemes).toHaveLength(1);
    expect(backup.customThemes?.[0].id).toBe(customTheme.id);
    expect(backup.customers).toHaveLength(1);
  });

  it('restores records, language and themes', async () => {
    const backup = await createBackup({ includePhotos: false });

    resetAllData();
    saveCustomThemes([]);
    expect(getCustomers()).toHaveLength(0);

    await restoreBackup(backup);

    expect(getCustomers()).toEqual([customer]);
    expect(getFinanceEntries()).toHaveLength(1);
    expect(getPurchases()).toHaveLength(1);
    expect(getLanguage()).toBe('ru');
    expect(loadCustomThemes().map((theme) => theme.id)).toEqual([customTheme.id]);
  });

  it('keeps installed themes when an old backup has none', async () => {
    await restoreBackup(backupFixture());

    expect(loadCustomThemes().map((theme) => theme.id)).toEqual([customTheme.id]);
  });

  it('restores into the local copy when the app is in cloud mode', async () => {
    setStorageMode('supabase');

    await restoreBackup(backupFixture({ customers: [customer] }));

    expect(getStorageMode()).toBe('local');
    expect(getCloudModePreference()).toBe('local');
    expect(getCustomers()).toEqual([customer]);
  });

  it('reset clears the data and the machine-specific backup settings', () => {
    localStorage.setItem('flower-shop-backup-settings', JSON.stringify({ enabled: true }));

    resetAllData();

    expect(getCustomers()).toHaveLength(0);
    expect(localStorage.getItem('flower-shop-backup-settings')).toBeNull();
  });
});
