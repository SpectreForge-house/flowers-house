import { v4 as uuidv4 } from 'uuid';
import { Bouquet, ClientPurchase, Order } from '../types';
import * as storage from './storage';
import { listPhotos, photoOwnerKey, removeOwnerPhotos } from './photoStorage';
import { getPurchaseAdapter } from '../hooks/useStore';
import { isCloudActive } from './storageMode';
import { readCloudCache, writeCloudCache } from './cloudCache';

// ---------------------------------------------------------------------------
// Client purchase history
//
// The history of a client is the union of two SEPARATE sources:
//   1. their existing Orders (status != 'cancelled'), shown as "from order";
//   2. manually added ClientPurchase entries ("added manually") - for
//      bouquets bought before the shop started tracking orders.
// Nothing is ever copied between the two, so every purchase is counted
// exactly once in the statistics.
// ---------------------------------------------------------------------------

export interface PurchaseFormValues {
  name?: string;
  composition: string;
  price: number;
  date: string;
  deliveryAddress?: string;
  note?: string;
}

export async function createPurchase(customerId: string, data: PurchaseFormValues): Promise<ClientPurchase> {
  const now = new Date().toISOString();
  const purchase: ClientPurchase = {
    id: uuidv4(),
    customerId,
    name: data.name?.trim() || undefined,
    composition: data.composition.trim(),
    price: data.price,
    date: data.date,
    deliveryAddress: data.deliveryAddress?.trim() || undefined,
    note: data.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  await getPurchaseAdapter().addPurchase(purchase);
  if (isCloudActive()) {
    const cached = readCloudCache('purchases') ?? storage.getPurchases();
    writeCloudCache('purchases', [...cached, purchase]);
  }
  return purchase;
}

export async function updatePurchase(existing: ClientPurchase, data: PurchaseFormValues): Promise<ClientPurchase> {
  const updated: ClientPurchase = {
    ...existing,
    name: data.name?.trim() || undefined,
    composition: data.composition.trim(),
    price: data.price,
    date: data.date,
    deliveryAddress: data.deliveryAddress?.trim() || undefined,
    note: data.note?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  await getPurchaseAdapter().updatePurchase(updated);
  if (isCloudActive()) {
    const cached = readCloudCache('purchases') ?? storage.getPurchases();
    writeCloudCache('purchases', cached.map(p => (p.id === updated.id ? updated : p)));
  }
  return updated;
}

export async function deletePurchase(id: string): Promise<void> {
  await getPurchaseAdapter().deletePurchase(id);
  if (isCloudActive()) {
    const cached = readCloudCache('purchases') ?? storage.getPurchases();
    writeCloudCache('purchases', cached.filter(p => p.id !== id));
  }
}

export function getCustomerPurchases(
  customerId: string,
  purchasesOverride?: ClientPurchase[],
): ClientPurchase[] {
  const purchases = purchasesOverride
    ?? (isCloudActive()
      ? readCloudCache('purchases') ?? storage.getPurchases()
      : storage.getPurchases());

  return purchases
    .filter(p => p.customerId === customerId)
    .sort((a, b) => {
      // 'YYYY-MM-DD' compares correctly as a string; fall back to creation time.
      const byDate = b.date.localeCompare(a.date);
      return byDate !== 0 ? byDate : b.createdAt.localeCompare(a.createdAt);
    });
}

/**
 * Removes every manual purchase of a customer together with its photo files.
 * Must be called BEFORE the customer record itself is deleted (the storage
 * layer drops the entries as well, but only this function knows the photos).
 */
export async function removeCustomerPurchases(customerId: string): Promise<void> {
  const adapter = getPurchaseAdapter();
  let purchases = getCustomerPurchases(customerId);
  try {
    const cloudPurchases = await adapter.getPurchases();
    purchases = cloudPurchases.filter(p => p.customerId === customerId);
  } catch (err) {
    console.error('[purchaseService] Failed to load cloud purchases before delete:', err);
  }

  const ownerKeys = purchases.map(p => photoOwnerKey('purchase', p.id));
  try {
    await adapter.deletePurchasesByCustomer(customerId);
  } catch (err) {
    console.error('[purchaseService] Failed to delete purchases in cloud:', err);
    throw err;
  }
  if (isCloudActive()) {
    const cached = readCloudCache('purchases') ?? storage.getPurchases();
    writeCloudCache('purchases', cached.filter(p => p.customerId !== customerId));
  }
  await Promise.all(ownerKeys.map(ownerKey => removeOwnerPhotos(ownerKey)));
}

// -------------------------------------------------------------------------
// Unified history entries (orders + manual purchases)
// -------------------------------------------------------------------------

export interface PurchaseHistoryEntry {
  /** Photo storage owner key - also unique within one client's history. */
  key: string;
  /** The record id: order id for orders, purchase id for manual entries. */
  id: string;
  source: 'order' | 'manual';
  order?: Order;
  purchase?: ClientPurchase;
  /** Short display title (first bouquet / manual name). */
  title: string;
  composition: string;
  price: number;
  /** ISO date used for sorting and stats: order createdAt or purchase date. */
  date: string;
  /** Delivery address attached to this bouquet (order address or manual entry). */
  deliveryAddress?: string;
  note?: string;
  photos: string[];
}

export function buildPurchaseHistory(
  customerId: string,
  orders: Order[],
  bouquets: Bouquet[],
  purchasesOverride?: ClientPurchase[],
): PurchaseHistoryEntry[] {
  const orderEntries: PurchaseHistoryEntry[] = orders
    .filter(o => o.customerId === customerId && o.status !== 'cancelled')
    .map(o => {
      const items = o.items.map(item => {
        const bouquet = bouquets.find(b => b.id === item.bouquetId);
        return { name: bouquet?.name || '—', quantity: item.quantity };
      });
      return {
        key: photoOwnerKey('order', o.id),
        id: o.id,
        source: 'order' as const,
        order: o,
        title: items.length > 1
          ? `${items[0]?.name || '—'} +${items.length - 1}`
          : items[0]?.name || '—',
        composition: items.map(i => `${i.name} \u00D7${i.quantity}`).join(', '),
        // What the customer actually paid for this order.
        price: o.total,
        date: o.createdAt,
        deliveryAddress: o.deliveryAddress || undefined,
        note: o.comment,
        photos: listPhotos(photoOwnerKey('order', o.id)),
      };
    });

  const manualEntries: PurchaseHistoryEntry[] = getCustomerPurchases(customerId, purchasesOverride)
    .map(p => ({
      key: photoOwnerKey('purchase', p.id),
      id: p.id,
      source: 'manual' as const,
      purchase: p,
      title: p.name || p.composition.split('\n')[0]?.trim() || '',
      composition: p.composition,
      price: p.price,
      date: p.date,
      deliveryAddress: p.deliveryAddress,
      note: p.note,
      photos: listPhotos(photoOwnerKey('purchase', p.id)),
    }));

  // Newest first.
  return [...orderEntries, ...manualEntries].sort((a, b) => b.date.localeCompare(a.date));
}

export interface PurchaseStats {
  count: number;
  total: number;
  average: number;
  /** 'YYYY-MM-DD' of the most recent purchase, or null when empty. */
  lastDate: string | null;
}

export function getPurchaseStats(entries: PurchaseHistoryEntry[]): PurchaseStats {
  if (entries.length === 0) return { count: 0, total: 0, average: 0, lastDate: null };

  const total = entries.reduce((sum, e) => sum + e.price, 0);
  const lastDate = entries.reduce(
    (max, e) => (e.date > max ? e.date : max),
    entries[0].date,
  );

  return {
    count: entries.length,
    total,
    average: total / entries.length,
    lastDate,
  };
}
