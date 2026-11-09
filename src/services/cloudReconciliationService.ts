import { supabase } from '../lib/supabase';
import * as storage from './storage';
import { getAuthState, isSupabaseAvailable, profileReady } from './authService';
import { getShopId } from './shopContext';
import { exportPhotoIndex } from './photoStorage';
import { SupabaseReminderAdapter } from './supabaseReminderStorage';

export type ReconciliationKey =
  | 'customers'
  | 'inventory'
  | 'bouquets'
  | 'orders'
  | 'deliveries'
  | 'transactions'
  | 'reservations'
  | 'purchases'
  | 'finance'
  | 'history'
  | 'photos'
  | 'settings'
  | 'reminders';

export interface ReconciliationItem {
  key: ReconciliationKey;
  localCount: number;
  cloudCount: number;
  missingInCloud: number;
  extraInCloud: number;
  missingSample: string[];
  extraSample: string[];
  error?: string;
}

export interface ReconciliationReport {
  items: ReconciliationItem[];
  missing: number;
  extra: number;
  errors: number;
  ok: boolean;
  checkedAt: string;
}

const SAMPLE_LIMIT = 10;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

export function buildReconciliationItem(
  key: ReconciliationKey,
  localIds: string[],
  cloudIds: string[],
): ReconciliationItem {
  const local = Array.from(new Set(localIds));
  const cloud = Array.from(new Set(cloudIds));
  const localSet = new Set(local);
  const cloudSet = new Set(cloud);
  const missing = local.filter(id => !cloudSet.has(id));
  const extra = cloud.filter(id => !localSet.has(id));

  return {
    key,
    localCount: local.length,
    cloudCount: cloud.length,
    missingInCloud: missing.length,
    extraInCloud: extra.length,
    missingSample: missing.slice(0, SAMPLE_LIMIT),
    extraSample: extra.slice(0, SAMPLE_LIMIT),
  };
}

async function loadCloudIds(table: string, shopId: string): Promise<string[]> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('shop_id', shopId);
  if (error) throw new Error(error.message);
  return (data || []).map(row => String((row as { id: unknown }).id));
}

function failedItem(key: ReconciliationKey, localCount: number, error: unknown): ReconciliationItem {
  return {
    key,
    localCount,
    cloudCount: 0,
    missingInCloud: 0,
    extraInCloud: 0,
    missingSample: [],
    extraSample: [],
    error: errorMessage(error),
  };
}

export async function buildReconciliationReport(): Promise<ReconciliationReport> {
  if (!supabase || !isSupabaseAvailable() || !getAuthState().user) {
    throw new Error('Sign in to a cloud account before checking reconciliation');
  }
  await profileReady;
  const shopId = await getShopId();
  if (!shopId) throw new Error('No shop profile found');

  const collectionSpecs: Array<{
    key: ReconciliationKey;
    table: string;
    localIds: string[];
  }> = [
    { key: 'customers', table: 'customers', localIds: storage.getCustomers().map(item => item.id) },
    { key: 'inventory', table: 'inventory_items', localIds: storage.getInventory().map(item => item.id) },
    { key: 'bouquets', table: 'bouquets', localIds: storage.getBouquets().map(item => item.id) },
    { key: 'orders', table: 'orders', localIds: storage.getOrders().map(item => item.id) },
    { key: 'deliveries', table: 'deliveries', localIds: storage.getDeliveries().map(item => item.id) },
    { key: 'transactions', table: 'inventory_transactions', localIds: storage.getTransactions().map(item => item.id) },
    { key: 'reservations', table: 'inventory_reservations', localIds: storage.getReservations().map(item => item.id) },
    { key: 'purchases', table: 'client_purchases', localIds: storage.getPurchases().map(item => item.id) },
    { key: 'finance', table: 'finance_entries', localIds: storage.getFinanceEntries().map(item => item.id) },
    { key: 'history', table: 'history', localIds: storage.getHistory().map(item => item.id) },
  ];

  const items = await Promise.all(collectionSpecs.map(async spec => {
    try {
      const cloudIds = await loadCloudIds(spec.table, shopId);
      return buildReconciliationItem(spec.key, spec.localIds, cloudIds);
    } catch (error) {
      return failedItem(spec.key, spec.localIds.length, error);
    }
  }));

  const localIndex = exportPhotoIndex().index;
  const localPhotoIds = Object.entries(localIndex).flatMap(([ownerKey, filenames]) =>
    filenames.map(filename => `${ownerKey}/${filename}`),
  );
  try {
    const { data, error } = await supabase
      .from('photos')
      .select('filename, owner_kind, owner_id')
      .eq('shop_id', shopId);
    if (error) throw new Error(error.message);
    const cloudIds = (data || []).map(photo =>
      `${photo.owner_kind as string}:${photo.owner_id as string}/${photo.filename as string}`,
    );
    items.push(buildReconciliationItem('photos', localPhotoIds, cloudIds));
  } catch (error) {
    items.push(failedItem('photos', localPhotoIds.length, error));
  }

  try {
    const { data, error } = await supabase
      .from('settings')
      .select('shop_id')
      .eq('shop_id', shopId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    items.push(buildReconciliationItem('settings', ['settings'], data ? ['settings'] : []));
  } catch (error) {
    items.push(failedItem('settings', 1, error));
  }

  try {
    const reminderAdapter = new SupabaseReminderAdapter();
    const [cloudRead, cloudDismissed] = await Promise.all([
      reminderAdapter.getReadReminders(),
      reminderAdapter.getDismissedReminders(),
    ]);
    const localIds = [
      ...storage.getReadReminders().map(id => `read:${id}`),
      ...storage.getDismissedReminders().map(key => `dismissed:${key}`),
    ];
    const cloudIds = [
      ...cloudRead.map(id => `read:${id}`),
      ...cloudDismissed.map(key => `dismissed:${key}`),
    ];
    items.push(buildReconciliationItem('reminders', localIds, cloudIds));
  } catch (error) {
    items.push(failedItem(
      'reminders',
      storage.getReadReminders().length + storage.getDismissedReminders().length,
      error,
    ));
  }

  const missing = items.reduce((sum, item) => sum + item.missingInCloud, 0);
  const extra = items.reduce((sum, item) => sum + item.extraInCloud, 0);
  const errors = items.filter(item => item.error).length;

  return {
    items,
    missing,
    extra,
    errors,
    ok: missing === 0 && errors === 0,
    checkedAt: new Date().toISOString(),
  };
}
