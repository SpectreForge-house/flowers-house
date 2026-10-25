import { Customer, InventoryItem, Bouquet, Order, Delivery, InventoryTransaction, InventoryReservation, HistoryRecord, ClientPurchase } from '../types';
import { SupabaseCustomerAdapter } from './supabaseStorage';
import { SupabaseInventoryAdapter } from './supabaseInventoryStorage';
import { SupabaseBouquetAdapter } from './supabaseBouquetStorage';
import { SupabaseOrderAdapter } from './supabaseOrderStorage';
import { SupabaseHistoryAdapter } from './supabaseHistoryStorage';
import { SupabasePurchaseAdapter } from './supabasePurchaseStorage';
import { SupabaseSettingsAdapter } from './supabaseSettingsStorage';

export interface CloudBackupRecords {
  customers: Customer[];
  inventory: InventoryItem[];
  bouquets: Bouquet[];
  orders: Order[];
  deliveries: Delivery[];
  transactions: InventoryTransaction[];
  reservations: InventoryReservation[];
  history: HistoryRecord[];
  purchases: ClientPurchase[];
  settings: Awaited<ReturnType<SupabaseSettingsAdapter['getSettings']>>;
}

export async function loadCloudBackupRecords(): Promise<CloudBackupRecords> {
  const customerAdapter = new SupabaseCustomerAdapter();
  const inventoryAdapter = new SupabaseInventoryAdapter();
  const bouquetAdapter = new SupabaseBouquetAdapter();
  const orderAdapter = new SupabaseOrderAdapter();
  const purchaseAdapter = new SupabasePurchaseAdapter();
  const settingsAdapter = new SupabaseSettingsAdapter();

  const [customers, inventory, bouquets, orders, deliveries, reservations, history, purchases, settings] =
    await Promise.all([
      customerAdapter.getCustomers(),
      inventoryAdapter.getInventory(),
      bouquetAdapter.getBouquets(),
      orderAdapter.getOrders(),
      orderAdapter.getDeliveries(),
      inventoryAdapter.getReservations(),
      new SupabaseHistoryAdapter().getHistory(),
      purchaseAdapter.getPurchases(),
      settingsAdapter.getSettings(),
    ]);

  const transactions = await Promise.all(
    (inventory as InventoryItem[]).map(item => inventoryAdapter.getItemTransactions(item.id)),
  );

  return {
    customers: customers as Customer[],
    inventory: inventory as InventoryItem[],
    bouquets: bouquets as Bouquet[],
    orders: orders as Order[],
    deliveries: deliveries as Delivery[],
    transactions: transactions.flat() as InventoryTransaction[],
    reservations: reservations as InventoryReservation[],
    history: history as HistoryRecord[],
    purchases: purchases as ClientPurchase[],
    settings,
  };
}
