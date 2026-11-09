import * as storage from './storage';

/**
 * True when the local cache contains anything worth migrating to Supabase.
 * Kept in a lightweight module so the app shell can check it without pulling
 * the full cloud migration service into the main bundle.
 */
export function hasLocalData(): boolean {
  return (
    storage.getCustomers().length > 0 ||
    storage.getInventory().length > 0 ||
    storage.getBouquets().length > 0 ||
    storage.getOrders().length > 0 ||
    storage.getPurchases().length > 0 ||
    storage.getFinanceEntries().length > 0
  );
}
