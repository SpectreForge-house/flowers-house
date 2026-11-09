import { useState, useCallback, useEffect, useRef } from 'react';
import * as storage from '../services/storage';
import { Customer, InventoryItem, Bouquet, Order, Delivery, InventoryTransaction, Settings, InventoryReservation, ClientPurchase, FinanceEntry } from '../types';
import { CustomerStorageAdapter, getStorageMode } from '../services/storageAdapter';
import { InventoryStorageAdapter } from '../services/inventoryStorageAdapter';
import { BouquetStorageAdapter } from '../services/bouquetStorageAdapter';
import { OrderStorageAdapter } from '../services/orderStorageAdapter';
import { SupabaseCustomerAdapter } from '../services/supabaseStorage';
import { SupabaseInventoryAdapter } from '../services/supabaseInventoryStorage';
import { SupabaseBouquetAdapter } from '../services/supabaseBouquetStorage';
import { SupabaseOrderAdapter } from '../services/supabaseOrderStorage';
import { HistoryStorageAdapter } from '../services/historyStorageAdapter';
import { LocalHistoryAdapter } from '../services/localHistoryStorage';
import { SupabaseHistoryAdapter } from '../services/supabaseHistoryStorage';
import { isSupabaseAvailable, profileReady, onAuthChange } from '../services/authService';
import { photoOwnerKey, removeOwnerPhotos } from '../services/photoStorage';
import { PurchaseStorageAdapter } from '../services/purchaseStorageAdapter';
import { SupabasePurchaseAdapter } from '../services/supabasePurchaseStorage';
import { FinanceStorageAdapter } from '../services/financeStorageAdapter';
import { SupabaseFinanceAdapter } from '../services/supabaseFinanceStorage';
import { SettingsStorageAdapter } from '../services/settingsStorageAdapter';
import { SupabaseSettingsAdapter } from '../services/supabaseSettingsStorage';
import { ReminderStorageAdapter } from '../services/reminderStorageAdapter';
import { SupabaseReminderAdapter } from '../services/supabaseReminderStorage';
import { onRealtimeChange } from '../services/realtimeService';
import { isCloudActive } from '../services/storageMode';
import { guardCloudWrites } from '../services/cloudWriteGuard';
import { readActiveCloudCache, writeCloudCache } from '../services/cloudCache';

export function getCustomerAdapter(): CustomerStorageAdapter {
  if (isCloudActive()) {
    return guardCloudWrites(new SupabaseCustomerAdapter());
  }
  return {
    getCustomers: () => storage.getCustomers(),
    addCustomer: (c) => storage.addCustomer(c),
    updateCustomer: (c) => storage.updateCustomer(c),
    deleteCustomer: (id) => storage.deleteCustomer(id),
    deleteAllCustomers: () => storage.deleteAllCustomers(),
  };
}

export function getInventoryAdapter(): InventoryStorageAdapter {
  if (isCloudActive()) {
    return guardCloudWrites(new SupabaseInventoryAdapter());
  }
  return {
    getInventory: () => storage.getInventory(),
    addInventoryItem: (item) => storage.addInventoryItem(item),
    updateInventoryItem: (item) => storage.updateInventoryItem(item),
    deleteInventoryItem: (id) => storage.deleteInventoryItem(id),
    deleteAllInventory: () => storage.deleteAllInventory(),
    getItemTransactions: (itemId) =>
      storage.getTransactions()
        .filter((t: InventoryTransaction) => t.inventoryItemId === itemId)
        .sort((a: InventoryTransaction, b: InventoryTransaction) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    addTransaction: (txn) => storage.addTransaction(txn),
    getWasteTransactions: () =>
      storage.getTransactions()
        .filter((t: InventoryTransaction) => t.type === 'waste'),
    deleteWasteTransaction: (id) => storage.deleteWasteTransaction(id),
    deleteAllWasteTransactions: () => storage.deleteAllWasteTransactions(),
    getReservations: () => storage.getReservations(),
    addReservation: (r) => storage.addReservation(r),
    updateReservation: (r) => storage.updateReservation(r),
    deleteReservation: (id) => storage.deleteReservation(id),
    deleteAllReservations: () => storage.deleteAllReservations(),
  };
}

export function getBouquetAdapter(): BouquetStorageAdapter {
  if (isCloudActive()) {
    return guardCloudWrites(new SupabaseBouquetAdapter());
  }
  return {
    getBouquets: () => storage.getBouquets(),
    addBouquet: (b) => storage.addBouquet(b),
    updateBouquet: (b) => storage.updateBouquet(b),
    deleteBouquet: (id) => storage.deleteBouquet(id),
    deleteAllBouquets: () => storage.deleteAllBouquets(),
  };
}

export function getOrderAdapter(): OrderStorageAdapter {
  if (isCloudActive()) {
    return guardCloudWrites(new SupabaseOrderAdapter());
  }
  return {
    getOrders: () => storage.getOrders(),
    addOrder: (o) => storage.addOrder(o),
    updateOrder: (o) => storage.updateOrder(o),
    deleteOrder: (id) => storage.deleteOrder(id),
    getDeliveries: () => storage.getDeliveries(),
    addDelivery: (d) => storage.addDelivery(d),
    updateDelivery: (d) => storage.updateDelivery(d),
    deleteDeliveryByOrderId: (id) => storage.deleteDeliveryByOrderId(id),
    generateOrderId: () => {
      const orders = storage.getOrders();
      const maxNum = orders.reduce((max, order) => {
        const num = parseInt(order.id.replace('ORD-', ''), 10);
        return num > max ? num : max;
      }, 0);
      return `ORD-${String(maxNum + 1).padStart(3, '0')}`;
    },
  };
}

export function getHistoryAdapter(): HistoryStorageAdapter {
  if (isCloudActive()) {
    return guardCloudWrites(new SupabaseHistoryAdapter());
  }
  return new LocalHistoryAdapter();
}

export function getPurchaseAdapter(): PurchaseStorageAdapter {
  if (isCloudActive()) {
    return guardCloudWrites(new SupabasePurchaseAdapter());
  }
  return {
    getPurchases: async () => storage.getPurchases(),
    addPurchase: async (p) => storage.addPurchase(p),
    updatePurchase: async (p) => storage.updatePurchase(p),
    deletePurchase: async (id) => storage.deletePurchase(id),
    deletePurchasesByCustomer: async (id) => storage.deletePurchasesByCustomer(id),
  };
}

export function getFinanceAdapter(): FinanceStorageAdapter {
  if (isCloudActive()) {
    return guardCloudWrites(new SupabaseFinanceAdapter());
  }
  return {
    getEntries: async () => storage.getFinanceEntries(),
    addEntry: async (entry: FinanceEntry) => storage.addFinanceEntry(entry),
    updateEntry: async (entry: FinanceEntry) => storage.updateFinanceEntry(entry),
    deleteEntry: async (id: string) => storage.deleteFinanceEntry(id),
    deleteAllEntries: async () => storage.deleteAllFinanceEntries(),
  };
}

export function getSettingsAdapter(): SettingsStorageAdapter {
  if (isCloudActive()) {
    return guardCloudWrites(new SupabaseSettingsAdapter());
  }
  return {
    getSettings: async () => storage.getSettings(),
    updateSettings: async (s) => storage.updateSettings(s),
  };
}

export function getReminderStorageAdapter(): ReminderStorageAdapter {
  if (isCloudActive()) {
    return guardCloudWrites(new SupabaseReminderAdapter());
  }
  return {
    getReadReminders: async () => storage.getReadReminders(),
    saveReadReminders: async (ids) => storage.saveReadReminders(ids),
    getDismissedReminders: async () => storage.getDismissedReminders(),
    saveDismissedReminders: async (keys) => storage.saveDismissedReminders(keys),
  };
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  const loadCustomers = useCallback(async () => {
    try {
      const mode = getStorageMode();
      if (mode === 'supabase' && isSupabaseAvailable()) {
        await profileReady;
      }
      const adapter = getCustomerAdapter();
      const data = await adapter.getCustomers();
      const list = Array.isArray(data) ? data : [];
      if (isCloudActive()) writeCloudCache('customers', list);
      setCustomers(list);
    } catch (err) {
      console.error('[useCustomers] Failed to load customers:', err);
      setCustomers(readActiveCloudCache('customers') ?? storage.getCustomers());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    const unsubscribe = onAuthChange((state) => {
      const newUserId = state.user?.id ?? null;
      if (newUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = newUserId;
        setLoading(true);
        loadCustomers();
      }
    });
    return unsubscribe;
  }, [loadCustomers]);

  useEffect(() => onRealtimeChange(table => {
    if (table === 'customers') void loadCustomers();
  }), [loadCustomers]);

  const refresh = useCallback(async () => {
    await loadCustomers();
  }, [loadCustomers]);

  const addCustomer = useCallback(async (customer: Customer) => {
    const mode = getStorageMode();
    if (mode === 'supabase' && isSupabaseAvailable()) {
      await profileReady;
    }
    const adapter = getCustomerAdapter();
    await adapter.addCustomer(customer);
    await loadCustomers();
  }, [loadCustomers]);

  const updateCustomer = useCallback(async (customer: Customer) => {
    const adapter = getCustomerAdapter();
    await adapter.updateCustomer(customer);
    await loadCustomers();
  }, [loadCustomers]);

  const deleteCustomer = useCallback(async (id: string) => {
    const adapter = getCustomerAdapter();
    await adapter.deleteCustomer(id);
    await loadCustomers();
  }, [loadCustomers]);

  return { customers, loading, refresh, addCustomer, updateCustomer, deleteCustomer, getAdapter: getCustomerAdapter };
}

export function useInventory() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  const loadInventory = useCallback(async () => {
    try {
      const mode = getStorageMode();
      if (mode === 'supabase' && isSupabaseAvailable()) {
        await profileReady;
      }
      const adapter = getInventoryAdapter();
      const data = await adapter.getInventory();
      const list = Array.isArray(data) ? data : [];
      if (isCloudActive()) writeCloudCache('inventory', list);
      const resData = await adapter.getReservations();
      const resList = Array.isArray(resData) ? resData : [];
      if (isCloudActive()) writeCloudCache('reservations', resList);
      setInventory(list);
      setReservations(resList);
    } catch (err) {
      console.error('[useInventory] Failed to load inventory:', err);
      setInventory(readActiveCloudCache('inventory') ?? storage.getInventory());
      setReservations(readActiveCloudCache('reservations') ?? storage.getReservations());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    const unsubscribe = onAuthChange((state) => {
      const newUserId = state.user?.id ?? null;
      if (newUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = newUserId;
        setLoading(true);
        loadInventory();
      }
    });
    return unsubscribe;
  }, [loadInventory]);

  useEffect(() => onRealtimeChange(table => {
    if (table === 'inventory_items' || table === 'inventory_reservations') void loadInventory();
  }), [loadInventory]);

  const refresh = useCallback(async () => {
    await loadInventory();
  }, [loadInventory]);

  const addItem = useCallback(async (item: InventoryItem) => {
    const mode = getStorageMode();
    if (mode === 'supabase' && isSupabaseAvailable()) {
      await profileReady;
    }
    const adapter = getInventoryAdapter();
    await adapter.addInventoryItem(item);
    await loadInventory();
  }, [loadInventory]);

  const updateItem = useCallback(async (item: InventoryItem) => {
    const adapter = getInventoryAdapter();
    await adapter.updateInventoryItem(item);
    await loadInventory();
  }, [loadInventory]);

  const deleteItem = useCallback(async (id: string) => {
    const adapter = getInventoryAdapter();
    await adapter.deleteInventoryItem(id);
    await removeOwnerPhotos(photoOwnerKey('inventory', id));
    await loadInventory();
  }, [loadInventory]);

  const deleteAll = useCallback(async () => {
    const adapter = getInventoryAdapter();
    const current = await adapter.getInventory();
    await adapter.deleteAllInventory();
    await Promise.all(
      (Array.isArray(current) ? current : []).map(item =>
        removeOwnerPhotos(photoOwnerKey('inventory', item.id))
      )
    );
    await loadInventory();
  }, [loadInventory]);

  const getWasteTransactions = useCallback(async () => {
    const adapter = getInventoryAdapter();
    return adapter.getWasteTransactions();
  }, []);

  const deleteWasteTransaction = useCallback(async (id: string) => {
    const adapter = getInventoryAdapter();
    await adapter.deleteWasteTransaction(id);
  }, []);

  const deleteAllWasteTransactions = useCallback(async () => {
    const adapter = getInventoryAdapter();
    await adapter.deleteAllWasteTransactions();
  }, []);

  const getReservations = useCallback(async () => {
    const adapter = getInventoryAdapter();
    return adapter.getReservations();
  }, []);

  const addReservation = useCallback(async (reservation: InventoryReservation) => {
    const adapter = getInventoryAdapter();
    await adapter.addReservation(reservation);
  }, []);

  const updateReservation = useCallback(async (reservation: InventoryReservation) => {
    const adapter = getInventoryAdapter();
    await adapter.updateReservation(reservation);
  }, []);

  const deleteReservation = useCallback(async (id: string) => {
    const adapter = getInventoryAdapter();
    await adapter.deleteReservation(id);
  }, []);

  const deleteAllReservations = useCallback(async () => {
    const adapter = getInventoryAdapter();
    await adapter.deleteAllReservations();
  }, []);

  return {
    inventory, reservations, loading, refresh, addItem, updateItem, deleteItem, deleteAll,
    getWasteTransactions, deleteWasteTransaction, deleteAllWasteTransactions,
    getReservations, addReservation, updateReservation, deleteReservation, deleteAllReservations,
    getAdapter: getInventoryAdapter,
  };
}

export function useBouquets() {
  const [bouquets, setBouquets] = useState<Bouquet[]>([]);
  const [loading, setLoading] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  const loadBouquets = useCallback(async () => {
    try {
      const mode = getStorageMode();
      if (mode === 'supabase' && isSupabaseAvailable()) {
        await profileReady;
      }
      const adapter = getBouquetAdapter();
      const data = await adapter.getBouquets();
      const list = Array.isArray(data) ? data : [];
      if (isCloudActive()) writeCloudCache('bouquets', list);
      setBouquets(list);
    } catch (err) {
      console.error('[useBouquets] Failed to load bouquets:', err);
      setBouquets(readActiveCloudCache('bouquets') ?? storage.getBouquets());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBouquets();
  }, [loadBouquets]);

  useEffect(() => {
    const unsubscribe = onAuthChange((state) => {
      const newUserId = state.user?.id ?? null;
      if (newUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = newUserId;
        setLoading(true);
        loadBouquets();
      }
    });
    return unsubscribe;
  }, [loadBouquets]);

  const refresh = useCallback(async () => {
    await loadBouquets();
  }, [loadBouquets]);

  const addBouquet = useCallback(async (bouquet: Bouquet) => {
    const mode = getStorageMode();
    if (mode === 'supabase' && isSupabaseAvailable()) {
      await profileReady;
    }
    const adapter = getBouquetAdapter();
    await adapter.addBouquet(bouquet);
    await loadBouquets();
  }, [loadBouquets]);

  const updateBouquet = useCallback(async (bouquet: Bouquet) => {
    const adapter = getBouquetAdapter();
    await adapter.updateBouquet(bouquet);
    await loadBouquets();
  }, [loadBouquets]);

  const deleteBouquet = useCallback(async (id: string) => {
    const adapter = getBouquetAdapter();
    await adapter.deleteBouquet(id);
    await loadBouquets();
  }, [loadBouquets]);

  const deleteAllBouquets = useCallback(async () => {
    const adapter = getBouquetAdapter();
    await adapter.deleteAllBouquets();
    await loadBouquets();
  }, [loadBouquets]);

  return { bouquets, loading, refresh, addBouquet, updateBouquet, deleteBouquet, deleteAllBouquets, getAdapter: getBouquetAdapter };
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const mode = getStorageMode();
      if (mode === 'supabase' && isSupabaseAvailable()) {
        await profileReady;
      }
      const adapter = getOrderAdapter();
      const data = await adapter.getOrders();
      const list = Array.isArray(data) ? data : [];
      if (isCloudActive()) writeCloudCache('orders', list);
      setOrders(list);
    } catch (err) {
      console.error('[useOrders] Failed to load orders:', err);
      setOrders(readActiveCloudCache('orders') ?? storage.getOrders());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const unsubscribe = onAuthChange((state) => {
      const newUserId = state.user?.id ?? null;
      if (newUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = newUserId;
        setLoading(true);
        loadOrders();
      }
    });
    return unsubscribe;
  }, [loadOrders]);

  useEffect(() => onRealtimeChange(table => {
    if (table === 'orders') void loadOrders();
  }), [loadOrders]);

  const refresh = useCallback(async () => {
    await loadOrders();
  }, [loadOrders]);

  const addOrder = useCallback(async (order: Order) => {
    const mode = getStorageMode();
    if (mode === 'supabase' && isSupabaseAvailable()) {
      await profileReady;
    }
    const adapter = getOrderAdapter();
    await adapter.addOrder(order);
    await loadOrders();
  }, [loadOrders]);

  const updateOrder = useCallback(async (order: Order) => {
    const adapter = getOrderAdapter();
    await adapter.updateOrder(order);
    await loadOrders();
  }, [loadOrders]);

  const deleteOrder = useCallback(async (id: string) => {
    const adapter = getOrderAdapter();
    await adapter.deleteOrder(id);
    await loadOrders();
  }, [loadOrders]);

  return { orders, loading, refresh, addOrder, updateOrder, deleteOrder, getAdapter: getOrderAdapter };
}

export function useDeliveries() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  const loadDeliveries = useCallback(async () => {
    try {
      const mode = getStorageMode();
      if (mode === 'supabase' && isSupabaseAvailable()) {
        await profileReady;
      }
      const adapter = getOrderAdapter();
      const data = await adapter.getDeliveries();
      const list = Array.isArray(data) ? data : [];
      if (isCloudActive()) writeCloudCache('deliveries', list);
      setDeliveries(list);
    } catch (err) {
      console.error('[useDeliveries] Failed to load deliveries:', err);
      setDeliveries(readActiveCloudCache('deliveries') ?? storage.getDeliveries());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  useEffect(() => {
    const unsubscribe = onAuthChange((state) => {
      const newUserId = state.user?.id ?? null;
      if (newUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = newUserId;
        setLoading(true);
        loadDeliveries();
      }
    });
    return unsubscribe;
  }, [loadDeliveries]);

  useEffect(() => onRealtimeChange(table => {
    if (table === 'deliveries') void loadDeliveries();
  }), [loadDeliveries]);

  const refresh = useCallback(async () => {
    await loadDeliveries();
  }, [loadDeliveries]);

  const addDelivery = useCallback(async (delivery: Delivery) => {
    const mode = getStorageMode();
    if (mode === 'supabase' && isSupabaseAvailable()) {
      await profileReady;
    }
    const adapter = getOrderAdapter();
    await adapter.addDelivery(delivery);
    await loadDeliveries();
  }, [loadDeliveries]);

  const updateDelivery = useCallback(async (delivery: Delivery) => {
    const adapter = getOrderAdapter();
    await adapter.updateDelivery(delivery);
    await loadDeliveries();
  }, [loadDeliveries]);

  return { deliveries, loading, refresh, addDelivery, updateDelivery, getAdapter: getOrderAdapter };
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);

  useEffect(() => {
    setTransactions(storage.getTransactions());
  }, []);

  const refresh = useCallback(() => {
    setTransactions(storage.getTransactions());
  }, []);

  return { transactions, refresh };
}

/** Manually added client purchases - local mode or Supabase (mirrored to the cloud cache). */
export function usePurchases() {
  const [purchases, setPurchases] = useState<ClientPurchase[]>(
    () => readActiveCloudCache('purchases') ?? storage.getPurchases(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPurchases = useCallback(async () => {
    try {
      if (getStorageMode() === 'supabase' && isSupabaseAvailable()) {
        await profileReady;
      }
      const adapter = getPurchaseAdapter();
      const data = await adapter.getPurchases();
      const list = Array.isArray(data) ? data : [];
      if (isCloudActive()) writeCloudCache('purchases', list);
      setPurchases(list);
      setError(null);
    } catch (err) {
      console.error('[usePurchases] Failed to load purchases:', err);
      setError(err instanceof Error ? err.message : String(err));
      setPurchases(readActiveCloudCache('purchases') ?? storage.getPurchases());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  useEffect(() => {
    return onAuthChange(() => {
      loadPurchases();
    });
  }, [loadPurchases]);

  useEffect(() => onRealtimeChange(table => {
    if (table === 'client_purchases') void loadPurchases();
  }), [loadPurchases]);

  const refresh = useCallback(async () => {
    await loadPurchases();
  }, [loadPurchases]);

  return { purchases, loading, error, refresh, getAdapter: getPurchaseAdapter };
}

/** Owner's daily finance entries - local mode or Supabase (mirrored to the cloud cache). */
export function useFinance() {
  const [entries, setEntries] = useState<FinanceEntry[]>(
    () => readActiveCloudCache('finance') ?? storage.getFinanceEntries(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      if (getStorageMode() === 'supabase' && isSupabaseAvailable()) {
        await profileReady;
      }
      const data = await getFinanceAdapter().getEntries();
      const list = Array.isArray(data) ? data : [];
      if (isCloudActive()) writeCloudCache('finance', list);
      setEntries(list);
      setError(null);
    } catch (err) {
      console.error('[useFinance] Failed to load finance entries:', err);
      setError(err instanceof Error ? err.message : String(err));
      setEntries(readActiveCloudCache('finance') ?? storage.getFinanceEntries());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    return onAuthChange(() => {
      loadEntries();
    });
  }, [loadEntries]);

  useEffect(() => onRealtimeChange(table => {
    if (table === 'finance_entries') void loadEntries();
  }), [loadEntries]);

  const refresh = useCallback(async () => {
    await loadEntries();
  }, [loadEntries]);

  const addEntry = useCallback(async (entry: FinanceEntry) => {
    await getFinanceAdapter().addEntry(entry);
    await loadEntries();
  }, [loadEntries]);

  const updateEntry = useCallback(async (entry: FinanceEntry) => {
    await getFinanceAdapter().updateEntry(entry);
    await loadEntries();
  }, [loadEntries]);

  const deleteEntry = useCallback(async (id: string) => {
    await getFinanceAdapter().deleteEntry(id);
    await loadEntries();
  }, [loadEntries]);

  return { entries, loading, error, refresh, addEntry, updateEntry, deleteEntry, getAdapter: getFinanceAdapter };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(
    () => readActiveCloudCache('settings') ?? storage.getSettings(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      if (getStorageMode() === 'supabase' && isSupabaseAvailable()) {
        await profileReady;
      }
      const data = await getSettingsAdapter().getSettings();
      if (isCloudActive()) writeCloudCache('settings', data);
      setSettings(data);
      setError(null);
    } catch (err) {
      console.error('[useSettings] Failed to load settings:', err);
      setError(err instanceof Error ? err.message : String(err));
      setSettings(readActiveCloudCache('settings') ?? storage.getSettings());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    return onAuthChange(() => {
      loadSettings();
    });
  }, [loadSettings]);

  const updateSettings = useCallback(async (newSettings: Settings) => {
    setSettings(newSettings);
    try {
      await getSettingsAdapter().updateSettings(newSettings);
      if (isCloudActive()) writeCloudCache('settings', newSettings);
      setError(null);
    } catch (err) {
      console.error('[useSettings] Failed to save settings:', err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  return { settings, loading, error, updateSettings };
}
