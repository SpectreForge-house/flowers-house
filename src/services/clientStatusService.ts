import { ClientStatus, ClientStatusSettings, Order, Bouquet } from '../types';
import { buildPurchaseHistory, getPurchaseStats } from './purchaseService';

// ---------------------------------------------------------------------------
// Client status (New / Regular / VIP)
//
// Derived from the money a client has actually spent and how many purchases
// they made. buildPurchaseHistory already unions the client's Orders (status
// != 'cancelled') with manually added ClientPurchase entries and never copies
// between the two, so every purchase is counted exactly once here as well.
// Nothing is persisted - the status is always recomputed from live data, so it
// updates the moment a purchase is added, edited or deleted.
// ---------------------------------------------------------------------------

export const DEFAULT_STATUS_SETTINGS: ClientStatusSettings = {
  regularMinCount: 3,
  vipMinTotal: 300,
  vipMinCount: 10,
  discountNew: 0,
  discountRegular: 0,
  discountVip: 0,
};

/** Purchase count + total spent for one client, safe on empty data. */
export interface ClientStatusStats {
  count: number;
  total: number;
}

function safeNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** A discount is a percentage: finite, >= 0 and never above 100. */
function safeDiscount(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return Math.min(value, 100);
}

/** Clamps any missing/legacy/invalid value to defaults - no migration needed. */
export function normalizeStatusSettings(raw?: Partial<ClientStatusSettings> | null): ClientStatusSettings {
  return {
    regularMinCount: safeNonNegative(raw?.regularMinCount, DEFAULT_STATUS_SETTINGS.regularMinCount),
    vipMinTotal: safeNonNegative(raw?.vipMinTotal, DEFAULT_STATUS_SETTINGS.vipMinTotal),
    vipMinCount: safeNonNegative(raw?.vipMinCount, DEFAULT_STATUS_SETTINGS.vipMinCount),
    discountNew: safeDiscount(raw?.discountNew, DEFAULT_STATUS_SETTINGS.discountNew),
    discountRegular: safeDiscount(raw?.discountRegular, DEFAULT_STATUS_SETTINGS.discountRegular),
    discountVip: safeDiscount(raw?.discountVip, DEFAULT_STATUS_SETTINGS.discountVip),
  };
}

/** Raw numbers behind a status; every purchase counted once, never NaN. */
export function getClientStatusStats(
  customerId: string,
  orders: Order[],
  bouquets: Bouquet[],
): ClientStatusStats {
  const stats = getPurchaseStats(buildPurchaseHistory(customerId, orders, bouquets));
  return { count: stats.count || 0, total: stats.total || 0 };
}

/**
 * A client's status from their purchase count and total spent. Clients without
 * any purchases are "New". VIP wins when either the money or the frequency
 * threshold is reached.
 */
export function getClientStatus(
  customerId: string,
  orders: Order[],
  bouquets: Bouquet[],
  settings?: ClientStatusSettings,
): ClientStatus {
  const s = normalizeStatusSettings(settings);
  const { count, total } = getClientStatusStats(customerId, orders, bouquets);

  if (total >= s.vipMinTotal || count >= s.vipMinCount) return 'vip';
  if (count >= s.regularMinCount) return 'regular';
  return 'new';
}

/**
 * Suggested discount % for a status - a hint shown when creating an order,
 * never applied to any price automatically.
 */
export function getDiscountForStatus(status: ClientStatus, settings?: ClientStatusSettings): number {
  const s = normalizeStatusSettings(settings);
  const value = status === 'vip' ? s.discountVip : status === 'regular' ? s.discountRegular : s.discountNew;
  return safeNonNegative(value, 0);
}
