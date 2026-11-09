import {
  Bouquet,
  ClientPurchase,
  Customer,
  Delivery,
  FinanceEntry,
  HistoryRecord,
  InventoryItem,
  InventoryReservation,
  Order,
  Settings,
} from '../types';
import { getAuthState } from './authService';
import { isCloudActive } from './storageMode';

const CACHE_VERSION = 1;

interface CloudCacheData {
  version: number;
  userId: string;
  updatedAt: string;
  customers: Customer[];
  inventory: InventoryItem[];
  reservations: InventoryReservation[];
  bouquets: Bouquet[];
  orders: Order[];
  deliveries: Delivery[];
  purchases: ClientPurchase[];
  finance: FinanceEntry[];
  settings: Settings;
  history: HistoryRecord[];
  readReminders: string[];
  dismissedReminders: string[];
}

type StoredCloudCache = Partial<Omit<CloudCacheData, 'version' | 'userId'>> & {
  version: number;
  userId: string;
};

export type CloudCacheKey = Exclude<keyof CloudCacheData, 'version' | 'userId' | 'updatedAt'>;

type CloudCacheValue<K extends CloudCacheKey> = CloudCacheData[K];

function cacheKey(userId: string): string {
  return `flower-shop-cloud-cache-${userId}`;
}

function currentUserId(): string | null {
  return getAuthState().user?.id ?? null;
}

function loadCache(userId: string): StoredCloudCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CloudCacheData>;
    if (parsed.version !== CACHE_VERSION || parsed.userId !== userId) return null;

    return parsed as StoredCloudCache;
  } catch {
    return null;
  }
}

/**
 * Returns the last successfully synced value for the signed-in user.
 * Returns null when there is no cache yet or the user cannot be resolved.
 */
export function readCloudCache<K extends CloudCacheKey>(
  key: K,
  userId: string | null = currentUserId(),
): CloudCacheValue<K> | null {
  if (!userId) return null;

  const cache = loadCache(userId);
  if (!cache) return null;

  return Object.prototype.hasOwnProperty.call(cache, key) ? (cache[key] as CloudCacheValue<K>) : null;
}

/** Reads the cache only when Supabase is the active storage mode. */
export function readActiveCloudCache<K extends CloudCacheKey>(
  key: K,
  userId: string | null = currentUserId(),
): CloudCacheValue<K> | null {
  return isCloudActive() ? readCloudCache(key, userId) : null;
}

/**
 * Stores a successfully synced value in the per-user read cache.
 * Intentionally never touches the local workspace keys so an un-migrated
 * local dataset cannot be overwritten by cloud data (or vice versa).
 */
export function writeCloudCache<K extends CloudCacheKey>(
  key: K,
  value: CloudCacheValue<K>,
  userId: string | null = currentUserId(),
): void {
  if (!userId) return;

  try {
    const cache: StoredCloudCache = {
      ...(loadCache(userId) ?? {}),
      version: CACHE_VERSION,
      userId,
      updatedAt: new Date().toISOString(),
    };
    (cache as Record<string, unknown>)[key] = value;
    localStorage.setItem(cacheKey(userId), JSON.stringify(cache));
  } catch (err) {
    console.warn('[cloudCache] Failed to persist cloud cache:', err);
  }
}

export function getCloudCacheUpdatedAt(userId: string | null = currentUserId()): string | null {
  if (!userId) return null;
  return loadCache(userId)?.updatedAt ?? null;
}

export function clearCloudCache(userId: string | null = currentUserId()): void {
  if (!userId) return;

  try {
    localStorage.removeItem(cacheKey(userId));
  } catch (err) {
    console.warn('[cloudCache] Failed to clear cloud cache:', err);
  }
}
