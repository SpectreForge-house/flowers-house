import { supabase } from '../lib/supabase';
import * as storage from './storage';
import { getStorageMode } from './storageAdapter';
import { getAuthState, isSupabaseAvailable, profileReady } from './authService';
import { getShopId } from './shopContext';
import { SupabaseCustomerAdapter } from './supabaseStorage';
import { SupabaseInventoryAdapter } from './supabaseInventoryStorage';
import { SupabaseBouquetAdapter } from './supabaseBouquetStorage';
import { SupabaseOrderAdapter } from './supabaseOrderStorage';
import { SupabaseHistoryAdapter } from './supabaseHistoryStorage';
import { SupabasePurchaseAdapter } from './supabasePurchaseStorage';
import { SupabaseSettingsAdapter } from './supabaseSettingsStorage';
import { SupabaseReminderAdapter } from './supabaseReminderStorage';
import { exportPhotos } from './photoStorage';
import { uploadCloudPhoto } from './supabasePhotoStorage';

export interface MigrationCounts {
  customers: number;
  inventory: number;
  bouquets: number;
  orders: number;
  deliveries: number;
  transactions: number;
  reservations: number;
  purchases: number;
  history: number;
  photos: number;
  settings: boolean;
  reminders: boolean;
}

export interface MigrationResult {
  counts: MigrationCounts;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface CloudCounts {
  customers: number;
  inventory: number;
  bouquets: number;
  orders: number;
  purchases: number;
  photos: number;
}

export function emptyCounts(): MigrationCounts {
  return {
    customers: 0, inventory: 0, bouquets: 0, orders: 0, deliveries: 0,
    transactions: 0, reservations: 0, purchases: 0, history: 0,
    photos: 0, settings: false, reminders: false,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

export function isDuplicate(error: unknown): boolean {
  const message = errorMessage(error);
  return message.includes('23505') || message.toLowerCase().includes('duplicate key');
}

function recordError(errors: string[], label: string, error: unknown): void {
  if (errors.length >= 100) return;
  errors.push(`${label}: ${errorMessage(error)}`);
}

export interface CollectionMigration<T> {
  errors: string[];
  label: string;
  local: T[];
  loadCloud: () => Promise<T[]>;
  getId: (item: T) => string;
  add: (item: T) => Promise<void>;
}

export interface CollectionMigrationResult {
  added: number;
  skipped: number;
  failed: number;
}

export async function migrateCollection<T>(
  options: CollectionMigration<T>,
): Promise<CollectionMigrationResult> {
  const { errors, label, local, loadCloud, getId, add } = options;

  let cloudIds: Set<string>;
  try {
    cloudIds = new Set((await loadCloud()).map(getId));
  } catch (error) {
    recordError(errors, `${label} lookup`, error);
    return { added: 0, skipped: 0, failed: local.length };
  }

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of local) {
    const id = getId(item);
    if (cloudIds.has(id)) {
      skipped++;
      continue;
    }

    try {
      await add(item);
      added++;
    } catch (error) {
      if (isDuplicate(error)) {
        skipped++;
      } else {
        failed++;
        recordError(errors, `${label} ${id}`, error);
      }
    }
  }

  return { added, skipped, failed };
}

export async function getCloudCounts(): Promise<CloudCounts> {
  if (!supabase || !isSupabaseAvailable() || !getAuthState().user) {
    return { customers: 0, inventory: 0, bouquets: 0, orders: 0, purchases: 0, photos: 0 };
  }
  await profileReady;
  const shopId = await getShopId();
  if (!shopId) return { customers: 0, inventory: 0, bouquets: 0, orders: 0, purchases: 0, photos: 0 };

  const count = async (table: string): Promise<number> => {
    const { count: value, error } = await supabase!
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId);
    if (error) return 0;
    return value || 0;
  };

  const [customers, inventory, bouquets, orders, purchases, photos] = await Promise.all([
    count('customers'), count('inventory_items'), count('bouquets'),
    count('orders'), count('client_purchases'), count('photos'),
  ]);
  return { customers, inventory, bouquets, orders, purchases, photos };
}

/**
 * Idempotent local -> cloud migration. Existing cloud rows are never
 * overwritten; only missing records are uploaded. Photos are uploaded to
 * Supabase Storage and tracked in the photos table.
 */
export async function migrateLocalToCloud(
  onProgress?: (message: string) => void,
): Promise<MigrationResult> {
  if (!supabase || !isSupabaseAvailable() || !getAuthState().user) {
    throw new Error('Sign in to a cloud account before migrating');
  }
  await profileReady;
  const shopId = await getShopId();
  if (!shopId) throw new Error('No shop profile found');

  const errors: string[] = [];
  const counts = emptyCounts();
  let skipped = 0;
  let failed = 0;

  const progress = (message: string) => onProgress?.(message);
  const apply = (result: CollectionMigrationResult): number => {
    skipped += result.skipped;
    failed += result.failed;
    return result.added;
  };

  const customerAdapter = new SupabaseCustomerAdapter();
  const inventoryAdapter = new SupabaseInventoryAdapter();
  const bouquetAdapter = new SupabaseBouquetAdapter();
  const orderAdapter = new SupabaseOrderAdapter();
  const historyAdapter = new SupabaseHistoryAdapter();
  const purchaseAdapter = new SupabasePurchaseAdapter();
  const settingsAdapter = new SupabaseSettingsAdapter();
  const reminderAdapter = new SupabaseReminderAdapter();

  // 1. Customers
  progress('customers');
  counts.customers = apply(await migrateCollection({
    errors,
    label: 'customer',
    local: storage.getCustomers(),
    loadCloud: () => customerAdapter.getCustomers(),
    getId: customer => customer.id,
    add: customer => customerAdapter.addCustomer(customer),
  }));

  // 2. Inventory (before bouquets/orders - they reference items)
  progress('inventory');
  counts.inventory = apply(await migrateCollection({
    errors,
    label: 'inventory',
    local: storage.getInventory(),
    loadCloud: () => inventoryAdapter.getInventory(),
    getId: item => item.id,
    add: item => inventoryAdapter.addInventoryItem(item),
  }));

  // 3. Bouquets
  progress('bouquets');
  counts.bouquets = apply(await migrateCollection({
    errors,
    label: 'bouquet',
    local: storage.getBouquets(),
    loadCloud: () => bouquetAdapter.getBouquets(),
    getId: bouquet => bouquet.id,
    add: bouquet => bouquetAdapter.addBouquet(bouquet),
  }));

  // 4. Orders + deliveries
  progress('orders');
  counts.orders = apply(await migrateCollection({
    errors,
    label: 'order',
    local: storage.getOrders(),
    loadCloud: () => orderAdapter.getOrders(),
    getId: order => order.id,
    add: order => orderAdapter.addOrder(order),
  }));
  counts.deliveries = apply(await migrateCollection({
    errors,
    label: 'delivery',
    local: storage.getDeliveries(),
    loadCloud: () => orderAdapter.getDeliveries(),
    getId: delivery => delivery.id,
    add: delivery => orderAdapter.addDelivery(delivery),
  }));

  // 5. Transactions
  progress('transactions');
  for (const transaction of storage.getTransactions()) {
    try {
      await inventoryAdapter.addTransaction(transaction);
      counts.transactions++;
    } catch (error) {
      if (isDuplicate(error)) {
        skipped++;
      } else {
        failed++;
        recordError(errors, `transaction ${transaction.id}`, error);
      }
    }
  }

  // 6. Reservations
  progress('reservations');
  counts.reservations = apply(await migrateCollection({
    errors,
    label: 'reservation',
    local: storage.getReservations(),
    loadCloud: () => inventoryAdapter.getReservations(),
    getId: reservation => reservation.id,
    add: reservation => inventoryAdapter.addReservation(reservation),
  }));

  // 7. Manual client purchases
  progress('purchases');
  counts.purchases = apply(await migrateCollection({
    errors,
    label: 'purchase',
    local: storage.getPurchases(),
    loadCloud: () => purchaseAdapter.getPurchases(),
    getId: purchase => purchase.id,
    add: purchase => purchaseAdapter.addPurchase(purchase),
  }));

  // 8. History
  progress('history');
  counts.history = apply(await migrateCollection({
    errors,
    label: 'history',
    local: storage.getHistory(),
    loadCloud: () => historyAdapter.getHistory(),
    getId: record => record.id,
    add: record => historyAdapter.addHistory(record),
  }));

  // 9. Settings - only when the shop has no settings row yet, so a second
  //    device can never overwrite the cloud configuration with stale cache.
  progress('settings');
  try {
    const { data: existingSettings, error: settingsLookupError } = await supabase
      .from('settings')
      .select('shop_id')
      .eq('shop_id', shopId)
      .maybeSingle();
    if (settingsLookupError) {
      failed++;
      recordError(errors, 'settings lookup', settingsLookupError);
    } else if (!existingSettings) {
      await settingsAdapter.updateSettings(storage.getSettings());
      counts.settings = true;
    } else {
      skipped++;
    }
  } catch (error) {
    failed++;
    recordError(errors, 'settings', error);
  }

  // 10. Reminders (per user)
  progress('reminders');
  try {
    const [cloudRead, cloudDismissed] = await Promise.all([
      reminderAdapter.getReadReminders(),
      reminderAdapter.getDismissedReminders(),
    ]);
    const localRead = storage.getReadReminders();
    const localDismissed = storage.getDismissedReminders();
    if (cloudRead.length === 0 && localRead.length > 0) {
      await reminderAdapter.saveReadReminders(localRead);
      counts.reminders = true;
    } else if (localRead.length > 0) {
      skipped++;
    }
    if (cloudDismissed.length === 0 && localDismissed.length > 0) {
      await reminderAdapter.saveDismissedReminders(localDismissed);
      counts.reminders = true;
    } else if (localDismissed.length > 0) {
      skipped++;
    }
  } catch (error) {
    failed++;
    recordError(errors, 'reminders', error);
  }

  // 11. Photos (local files -> Supabase Storage; metadata in photos table)
  progress('photos');
  try {
    const backup = await exportPhotos();
    for (const [ownerKey, filenames] of Object.entries(backup.index)) {
      for (const filename of filenames) {
        const dataUrl = backup.files[filename];
        if (!dataUrl) continue;
        try {
          const blob = await (await fetch(dataUrl)).blob();
          await uploadCloudPhoto(ownerKey, filename, blob);
          counts.photos++;
        } catch (error) {
          if (isDuplicate(error)) {
            skipped++;
          } else {
            failed++;
            recordError(errors, `photo ${filename}`, error);
          }
        }
      }
    }
  } catch (error) {
    recordError(errors, 'photos', error);
  }

  progress('done');
  return { counts, skipped, failed, errors };
}

/** True when the local cache contains anything worth migrating. */
export function hasLocalData(): boolean {
  return (
    storage.getCustomers().length > 0 ||
    storage.getInventory().length > 0 ||
    storage.getBouquets().length > 0 ||
    storage.getOrders().length > 0 ||
    storage.getPurchases().length > 0
  );
}

export function isCloudMode(): boolean {
  return getStorageMode() === 'supabase';
}
