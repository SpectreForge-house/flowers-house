import { Customer, InventoryItem, Bouquet, Order, Delivery, InventoryTransaction, Settings, HistoryRecord, InventoryReservation, ClientPurchase, FinanceEntry } from '../types';
import { sampleCustomers, sampleInventory, sampleBouquets, sampleOrders, sampleDeliveries, sampleTransactions, sampleSettings } from '../data/sampleData';
import { exportPhotos, exportPhotoIndex, importPhotos, PhotoBackup } from './photoStorage';
import { getStorageMode } from './storageAdapter';
import { loadCloudBackupRecords } from './cloudBackupService';

export const STORAGE_VERSION = 1;

const STORAGE_KEYS = {
  customers: 'flower-shop-customers',
  inventory: 'flower-shop-inventory',
  bouquets: 'flower-shop-bouquets',
  orders: 'flower-shop-orders',
  deliveries: 'flower-shop-deliveries',
  transactions: 'flower-shop-transactions',
  settings: 'flower-shop-settings',
  initialized: 'flower-shop-initialized',
  history: 'flower-shop-history',
  reservations: 'flower-shop-reservations',
  remindersRead: 'flower-shop-reminders-read',
  remindersDismissed: 'flower-shop-reminders-dismissed',
  language: 'flower-shop-language',
  storageVersion: 'flower-shop-storage-version',
  // Owner key -> [photo filename]; the image files themselves live on disk
  // (Electron) or in IndexedDB (plain browser). Added together with the photo
  // feature - purely additive, existing records are untouched.
  photos: 'flower-shop-photo-index',
  // Manually added bouquet purchases per client. Added with the client
  // purchase history feature - purely additive, existing records untouched.
  purchases: 'flower-shop-purchases',
  // Owner's daily revenue / expense bookkeeping (separate from orders).
  finance: 'flower-shop-finance',
};

export interface BackupData {
  version: string;
  storageVersion: number;
  createdAt: string;
  customers: Customer[];
  inventory: InventoryItem[];
  bouquets: Bouquet[];
  orders: Order[];
  deliveries: Delivery[];
  transactions: InventoryTransaction[];
  reservations: InventoryReservation[];
  history: HistoryRecord[];
  settings: Settings;
  language: string;
  remindersRead: string[];
  /** Dismissed reminder keys. Optional so old backups still restore. */
  remindersDismissed?: string[];
  /** Photo files + their index. Optional so old backups still restore. */
  photos?: PhotoBackup;
  /** Manually added purchases. Optional so old backups still restore. */
  purchases?: ClientPurchase[];
  /** Owner's finance entries. Optional so old backups still restore. */
  finance?: FinanceEntry[];
}

export const ALL_STORAGE_KEYS = Object.values(STORAGE_KEYS);

function loadFromStorage<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading ${key} from storage:`, error);
  }
  return [];
}

function saveToStorage<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error saving ${key} to storage:`, error);
  }
}

function loadSettings(): Settings {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.settings);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return sampleSettings;
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

export function initializeData(): void {
  // Never seed the demo data into a cloud workspace: the empty cloud account
  // is the real starting point, and sample rows would be uploaded by mistake.
  if (getStorageMode() === 'supabase') return;

  const initialized = localStorage.getItem(STORAGE_KEYS.initialized);
  if (!initialized) {
    saveToStorage(STORAGE_KEYS.customers, sampleCustomers);
    saveToStorage(STORAGE_KEYS.inventory, sampleInventory);
    saveToStorage(STORAGE_KEYS.bouquets, sampleBouquets);
    saveToStorage(STORAGE_KEYS.orders, sampleOrders);
    saveToStorage(STORAGE_KEYS.deliveries, sampleDeliveries);
    saveToStorage(STORAGE_KEYS.transactions, sampleTransactions);
    saveSettings(sampleSettings);
    localStorage.setItem(STORAGE_KEYS.initialized, 'true');
  }
}

export function cleanupTestData(): void {
  // Remove accidental 50 roses reservation
  const reservations = loadFromStorage<InventoryReservation>(STORAGE_KEYS.reservations);
  const rosesReservation = reservations.find(
    r => r.status === 'active' && r.quantity === 50 && r.inventoryItemId === 'inv-1'
  );
  if (rosesReservation) {
    const cleaned = reservations.filter(r => r.id !== rosesReservation.id);
    saveToStorage(STORAGE_KEYS.reservations, cleaned);
  }

  // Remove any leftover test orders that may have been created
  const orders = loadFromStorage<Order>(STORAGE_KEYS.orders);
  const testOrderIds = orders.filter(o => o.id.startsWith('ORD-') && o.id.match(/ORD-00[0-9]/));
  if (testOrderIds.length > 0) {
    const testIds = new Set(testOrderIds.map(o => o.id));
    const cleanedOrders = orders.filter(o => !testIds.has(o.id));
    saveToStorage(STORAGE_KEYS.orders, cleanedOrders);
    // Also clean related deliveries
    const deliveries = loadFromStorage<Delivery>(STORAGE_KEYS.deliveries);
    const cleanedDeliveries = deliveries.filter(d => !testIds.has(d.orderId));
    saveToStorage(STORAGE_KEYS.deliveries, cleanedDeliveries);
    // Clean related transactions
    const transactions = loadFromStorage<InventoryTransaction>(STORAGE_KEYS.transactions);
    const cleanedTransactions = transactions.filter(t => !t.referenceId || !testIds.has(t.referenceId));
    saveToStorage(STORAGE_KEYS.transactions, cleanedTransactions);
    // Clean related reservations
    const allReservations = loadFromStorage<InventoryReservation>(STORAGE_KEYS.reservations);
    const cleanedReservations = allReservations.filter(r => !testIds.has(r.orderId));
    saveToStorage(STORAGE_KEYS.reservations, cleanedReservations);
  }

  // Clear test history records
  const history = loadFromStorage<HistoryRecord>(STORAGE_KEYS.history);
  if (history.length > 0) {
    const testOrderEntityIds = new Set(['ORD-001', 'ORD-002', 'ORD-003', 'ORD-004', 'ORD-005', 'ORD-006']);
    const cleanedHistory = history.filter(r => {
      if (r.entityType === 'order' && testOrderEntityIds.has(r.entityId)) return false;
      if (r.entityType === 'delivery' && r.entityId.startsWith('del-')) return false;
      if (r.entityType === 'reservation' && r.entityId.startsWith('res-')) return false;
      return true;
    });
    if (cleanedHistory.length !== history.length) {
      saveToStorage(STORAGE_KEYS.history, cleanedHistory);
    }
  }
}

// Customers
export function getCustomers(): Customer[] {
  return loadFromStorage<Customer>(STORAGE_KEYS.customers);
}

export function saveCustomers(customers: Customer[]): void {
  saveToStorage(STORAGE_KEYS.customers, customers);
}

export function addCustomer(customer: Customer): void {
  const customers = getCustomers();
  customers.push(customer);
  saveCustomers(customers);
}

export function updateCustomer(updated: Customer): void {
  const customers = getCustomers();
  const index = customers.findIndex(c => c.id === updated.id);
  if (index !== -1) {
    customers[index] = updated;
    saveCustomers(customers);
  }
}

export function deleteCustomer(id: string): void {
  const customers = getCustomers().filter(c => c.id !== id);
  saveCustomers(customers);
  // Manual purchase entries are client-scoped - drop them with their owner.
  deletePurchasesByCustomer(id);
}

// Client purchases (manually added bouquet history entries). Photos are
// stored separately in the photo storage under `purchase:<id>`.
export function getPurchases(): ClientPurchase[] {
  return loadFromStorage<ClientPurchase>(STORAGE_KEYS.purchases);
}

export function savePurchases(purchases: ClientPurchase[]): void {
  saveToStorage<ClientPurchase>(STORAGE_KEYS.purchases, purchases);
}

export function addPurchase(purchase: ClientPurchase): void {
  const purchases = getPurchases();
  purchases.push(purchase);
  savePurchases(purchases);
}

export function updatePurchase(updated: ClientPurchase): void {
  const purchases = getPurchases();
  const index = purchases.findIndex(p => p.id === updated.id);
  if (index !== -1) {
    purchases[index] = updated;
    savePurchases(purchases);
  }
}

export function deletePurchase(id: string): void {
  savePurchases(getPurchases().filter(p => p.id !== id));
}

export function deletePurchasesByCustomer(customerId: string): void {
  savePurchases(getPurchases().filter(p => p.customerId !== customerId));
}

// Owner's finance entries (daily revenue and expenses).
export function getFinanceEntries(): FinanceEntry[] {
  return loadFromStorage<FinanceEntry>(STORAGE_KEYS.finance);
}

export function saveFinanceEntries(entries: FinanceEntry[]): void {
  saveToStorage<FinanceEntry>(STORAGE_KEYS.finance, entries);
}

export function addFinanceEntry(entry: FinanceEntry): void {
  const entries = getFinanceEntries();
  entries.push(entry);
  saveFinanceEntries(entries);
}

export function updateFinanceEntry(updated: FinanceEntry): void {
  const entries = getFinanceEntries();
  const index = entries.findIndex(entry => entry.id === updated.id);
  if (index !== -1) {
    entries[index] = updated;
    saveFinanceEntries(entries);
  }
}

export function deleteFinanceEntry(id: string): void {
  saveFinanceEntries(getFinanceEntries().filter(entry => entry.id !== id));
}

export function deleteAllFinanceEntries(): void {
  saveFinanceEntries([]);
}

// Inventory
export function getInventory(): InventoryItem[] {
  return loadFromStorage<InventoryItem>(STORAGE_KEYS.inventory);
}

export function saveInventory(inventory: InventoryItem[]): void {
  saveToStorage(STORAGE_KEYS.inventory, inventory);
}

export function addInventoryItem(item: InventoryItem): void {
  const inventory = getInventory();
  inventory.push(item);
  saveInventory(inventory);
}

export function updateInventoryItem(updated: InventoryItem): void {
  const inventory = getInventory();
  const index = inventory.findIndex(i => i.id === updated.id);
  if (index !== -1) {
    inventory[index] = updated;
    saveInventory(inventory);
  }
}

export function deleteInventoryItem(id: string): void {
  const inventory = getInventory().filter(i => i.id !== id);
  saveInventory(inventory);
}

// Bouquets
export function getBouquets(): Bouquet[] {
  return loadFromStorage<Bouquet>(STORAGE_KEYS.bouquets);
}

export function saveBouquets(bouquets: Bouquet[]): void {
  saveToStorage(STORAGE_KEYS.bouquets, bouquets);
}

export function addBouquet(bouquet: Bouquet): void {
  const bouquets = getBouquets();
  bouquets.push(bouquet);
  saveBouquets(bouquets);
}

export function updateBouquet(updated: Bouquet): void {
  const bouquets = getBouquets();
  const index = bouquets.findIndex(b => b.id === updated.id);
  if (index !== -1) {
    bouquets[index] = updated;
    saveBouquets(bouquets);
  }
}

export function deleteBouquet(id: string): void {
  const bouquets = getBouquets().filter(b => b.id !== id);
  saveBouquets(bouquets);
}

// Orders
export function getOrders(): Order[] {
  return loadFromStorage<Order>(STORAGE_KEYS.orders);
}

export function saveOrders(orders: Order[]): void {
  saveToStorage(STORAGE_KEYS.orders, orders);
}

export function addOrder(order: Order): void {
  const orders = getOrders();
  orders.push(order);
  saveOrders(orders);
}

export function updateOrder(updated: Order): void {
  const orders = getOrders();
  const index = orders.findIndex(o => o.id === updated.id);
  if (index !== -1) {
    orders[index] = updated;
    saveOrders(orders);
  }
}

export function deleteOrder(id: string): void {
  const orders = getOrders().filter(o => o.id !== id);
  saveOrders(orders);
  const deliveries = getDeliveries().filter(d => d.orderId !== id);
  saveDeliveries(deliveries);
}

export function deleteDeliveryByOrderId(orderId: string): void {
  const deliveries = getDeliveries().filter(d => d.orderId !== orderId);
  saveDeliveries(deliveries);
}

// Deliveries
export function getDeliveries(): Delivery[] {
  return loadFromStorage<Delivery>(STORAGE_KEYS.deliveries);
}

export function saveDeliveries(deliveries: Delivery[]): void {
  saveToStorage(STORAGE_KEYS.deliveries, deliveries);
}

export function addDelivery(delivery: Delivery): void {
  const deliveries = getDeliveries();
  deliveries.push(delivery);
  saveDeliveries(deliveries);
}

export function updateDelivery(updated: Delivery): void {
  const deliveries = getDeliveries();
  const index = deliveries.findIndex(d => d.id === updated.id);
  if (index !== -1) {
    deliveries[index] = updated;
    saveDeliveries(deliveries);
  }
}

// Transactions
export function getTransactions(): InventoryTransaction[] {
  return loadFromStorage<InventoryTransaction>(STORAGE_KEYS.transactions);
}

export function saveTransactions(transactions: InventoryTransaction[]): void {
  saveToStorage(STORAGE_KEYS.transactions, transactions);
}

export function addTransaction(transaction: InventoryTransaction): void {
  const transactions = getTransactions();
  transactions.push(transaction);
  saveTransactions(transactions);
}

// Settings
export function getSettings(): Settings {
  return loadSettings();
}

export function updateSettings(settings: Settings): void {
  saveSettings(settings);
}

// History
export function getHistory(): HistoryRecord[] {
  return loadFromStorage<HistoryRecord>(STORAGE_KEYS.history);
}

export function addHistory(record: HistoryRecord): void {
  const history = getHistory();
  history.push(record);
  saveToStorage(STORAGE_KEYS.history, history);
}

export function saveHistory(records: HistoryRecord[]): void {
  saveToStorage(STORAGE_KEYS.history, records);
}

// Reservations
export function getReservations(): InventoryReservation[] {
  return loadFromStorage<InventoryReservation>(STORAGE_KEYS.reservations);
}

export function saveReservations(reservations: InventoryReservation[]): void {
  saveToStorage(STORAGE_KEYS.reservations, reservations);
}

export function addReservation(reservation: InventoryReservation): void {
  const reservations = getReservations();
  reservations.push(reservation);
  saveReservations(reservations);
}

export function updateReservation(updated: InventoryReservation): void {
  const reservations = getReservations();
  const index = reservations.findIndex(r => r.id === updated.id);
  if (index !== -1) {
    reservations[index] = updated;
    saveReservations(reservations);
  }
}

// Reminders read state
export function getReadReminders(): string[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.remindersRead);
    if (data) return JSON.parse(data);
  } catch {}
  return [];
}

export function saveReadReminders(ids: string[]): void {
  localStorage.setItem(STORAGE_KEYS.remindersRead, JSON.stringify(ids));
}

// Reminders dismissed with the X button. The key includes the reminder content
// so a changed condition (e.g. a different low-stock quantity) shows up again.
export function getDismissedReminders(): string[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.remindersDismissed);
    if (data) return JSON.parse(data);
  } catch {}
  return [];
}

export function saveDismissedReminders(keys: string[]): void {
  localStorage.setItem(STORAGE_KEYS.remindersDismissed, JSON.stringify(keys));
}

// Bulk delete operations
export function deleteAllCustomers(): void {
  saveToStorage<Customer>(STORAGE_KEYS.customers, []);
  saveToStorage<ClientPurchase>(STORAGE_KEYS.purchases, []);
}

export function deleteAllInventory(): void {
  const inventory = getInventory();
  const inventoryIds = new Set(inventory.map(i => i.id));
  saveToStorage<InventoryItem>(STORAGE_KEYS.inventory, []);
  // Remove transactions that reference deleted inventory items
  const transactions = getTransactions();
  const cleanedTransactions = transactions.filter(t => !inventoryIds.has(t.inventoryItemId));
  saveToStorage<InventoryTransaction>(STORAGE_KEYS.transactions, cleanedTransactions);
  // Remove reservations that reference deleted inventory items
  const reservations = getReservations();
  const cleanedReservations = reservations.filter(r => !inventoryIds.has(r.inventoryItemId));
  saveToStorage<InventoryReservation>(STORAGE_KEYS.reservations, cleanedReservations);
}

export function deleteAllBouquets(): void {
  saveToStorage<Bouquet>(STORAGE_KEYS.bouquets, []);
}

export function deleteReservation(id: string): void {
  const reservations = getReservations().filter(r => r.id !== id);
  saveReservations(reservations);
}

// Waste transactions
export function deleteWasteTransaction(id: string): void {
  const transactions = getTransactions().filter(t => t.id !== id);
  saveTransactions(transactions);
}

export function deleteAllWasteTransactions(): void {
  const transactions = getTransactions().filter(t => t.type !== 'waste');
  saveTransactions(transactions);
}

export function deleteAllReservations(): void {
  saveToStorage<InventoryReservation>(STORAGE_KEYS.reservations, []);
}

// Language preference
export function getLanguage(): string {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.language);
    if (data) return data;
  } catch {}
  return 'en';
}

export function setLanguage(lang: string): void {
  localStorage.setItem(STORAGE_KEYS.language, lang);
}

// Storage versioning
export function getStorageVersion(): number {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.storageVersion);
    if (data) return parseInt(data, 10);
  } catch {}
  return 0;
}

export function setStorageVersion(version: number): void {
  localStorage.setItem(STORAGE_KEYS.storageVersion, String(version));
}

export function migrateStorageIfNeeded(): void {
  const currentVersion = getStorageVersion();
  if (currentVersion < STORAGE_VERSION) {
    setStorageVersion(STORAGE_VERSION);
  }
}

export interface BackupOptions {
  /**
   * Embed photo files as base64 (used by the file download backup). Set to
   * false for the automatic backup in the desktop app, where the Electron
   * main process copies the photo files themselves - only the index is
   * embedded then.
   */
  includePhotos?: boolean;
}

// Backup
export async function createBackup(options: BackupOptions = {}): Promise<BackupData> {
  let backup: BackupData;

  if (getStorageMode() === 'supabase') {
    try {
      backup = await createCloudBackup();
    } catch (error) {
      console.error('[storage] Cloud backup failed, falling back to local cache:', error);
      backup = createLocalBackup();
    }
  } else {
    backup = createLocalBackup();
  }

  // Photos are real files, not part of the records above - embed them so a
  // restore never leaves records pointing at missing images.
  backup.photos = options.includePhotos === false ? exportPhotoIndex() : await exportPhotos();
  return backup;
}

function createLocalBackup(): BackupData {
  return {
    version: '1.0.0',
    storageVersion: STORAGE_VERSION,
    createdAt: new Date().toISOString(),
    customers: loadFromStorage<Customer>(STORAGE_KEYS.customers),
    inventory: loadFromStorage<InventoryItem>(STORAGE_KEYS.inventory),
    bouquets: loadFromStorage<Bouquet>(STORAGE_KEYS.bouquets),
    orders: loadFromStorage<Order>(STORAGE_KEYS.orders),
    deliveries: loadFromStorage<Delivery>(STORAGE_KEYS.deliveries),
    transactions: loadFromStorage<InventoryTransaction>(STORAGE_KEYS.transactions),
    reservations: loadFromStorage<InventoryReservation>(STORAGE_KEYS.reservations),
    history: loadFromStorage<HistoryRecord>(STORAGE_KEYS.history),
    settings: loadSettings(),
    language: getLanguage(),
    remindersRead: getReadReminders(),
    remindersDismissed: getDismissedReminders(),
    purchases: loadFromStorage<ClientPurchase>(STORAGE_KEYS.purchases),
    finance: loadFromStorage<FinanceEntry>(STORAGE_KEYS.finance),
  };
}

async function createCloudBackup(): Promise<BackupData> {
  const records = await loadCloudBackupRecords();
  return {
    version: '1.0.0',
    storageVersion: STORAGE_VERSION,
    createdAt: new Date().toISOString(),
    ...records,
    language: getLanguage(),
    remindersRead: getReadReminders(),
    remindersDismissed: getDismissedReminders(),
  };
}

// Restore
export async function restoreBackup(backup: BackupData): Promise<void> {
  if (getStorageMode() === 'supabase') {
    throw new Error('Restore is only available in local storage mode');
  }

  ALL_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));

  saveToStorage<Customer>(STORAGE_KEYS.customers, backup.customers || []);
  saveToStorage<InventoryItem>(STORAGE_KEYS.inventory, backup.inventory || []);
  saveToStorage<Bouquet>(STORAGE_KEYS.bouquets, backup.bouquets || []);
  saveToStorage<Order>(STORAGE_KEYS.orders, backup.orders || []);
  saveToStorage<Delivery>(STORAGE_KEYS.deliveries, backup.deliveries || []);
  saveToStorage<InventoryTransaction>(STORAGE_KEYS.transactions, backup.transactions || []);
  saveToStorage<InventoryReservation>(STORAGE_KEYS.reservations, backup.reservations || []);
  saveToStorage<HistoryRecord>(STORAGE_KEYS.history, backup.history || []);
  saveToStorage<ClientPurchase>(STORAGE_KEYS.purchases, backup.purchases || []);
  saveToStorage<FinanceEntry>(STORAGE_KEYS.finance, backup.finance || []);
  saveSettings(backup.settings || sampleSettings);
  localStorage.setItem(STORAGE_KEYS.language, backup.language || 'en');
  localStorage.setItem(STORAGE_KEYS.remindersRead, JSON.stringify(backup.remindersRead || []));
  localStorage.setItem(STORAGE_KEYS.remindersDismissed, JSON.stringify(backup.remindersDismissed || []));
  localStorage.setItem(STORAGE_KEYS.initialized, 'true');

  // Photo files are written after the keys above were cleared (the photo index
  // is one of them). Backups without photos restore as before.
  await importPhotos(backup.photos);
}

// Reset all data
export function resetAllData(): void {
  if (getStorageMode() === 'supabase') {
    throw new Error('Reset is only available in local storage mode');
  }

  ALL_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  // Automatic backup settings are machine-specific (folder path) and deliberately
  // kept out of the backup payload - but after a full reset they must go too,
  // otherwise auto backup would keep running against the old folder and could
  // prune the user's existing backups down to the keep limit.
  localStorage.removeItem('flower-shop-backup-settings');
}
