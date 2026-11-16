import { supabase } from '../lib/supabase';
import { getAuthState, isSupabaseAvailable, profileReady } from './authService';
import { getShopId } from './shopContext';

export type CloudHealthCheckId =
  | 'baseTables'
  | 'parityTables'
  | 'customerDates'
  | 'settingsParity'
  | 'profileFields'
  | 'photoBucket'
  | 'rlsHardening'
  | 'teamInvites'
  | 'inventoryFields'
  | 'purchaseFields'
  | 'financeTable'
  | 'schemaVersion';

export interface CloudHealthCheck {
  id: CloudHealthCheckId;
  ok: boolean;
  missing: string[];
  message?: string;
  migration?: string;
}

export interface CloudHealthReport {
  ok: boolean;
  checkedAt: string;
  checks: CloudHealthCheck[];
}

const BASE_TABLES = [
  'shops',
  'user_profiles',
  'customers',
  'inventory_items',
  'bouquets',
  'bouquet_items',
  'orders',
  'order_items',
  'deliveries',
  'inventory_transactions',
  'inventory_reservations',
  'history',
  'settings',
  'user_reminders_read',
  'app_meta',
];

const PARITY_TABLES = [
  'client_purchases',
  'photos',
  'user_reminders_dismissed',
];

function describeError(error: { message: string; code?: string }): string {
  return error.code ? `${error.message} (${error.code})` : error.message;
}

async function probeTable(table: string): Promise<string | null> {
  const { error } = await supabase!
    .from(table)
    .select('*', { count: 'exact', head: true });
  return error ? describeError(error) : null;
}

async function probeColumn(table: string, column: string): Promise<string | null> {
  const { error } = await supabase!
    .from(table)
    .select(column)
    .limit(1);
  return error ? describeError(error) : null;
}

async function missingTables(tables: string[]): Promise<{ missing: string[]; message?: string }> {
  const results = await Promise.all(tables.map(async table => ({
    table,
    error: await probeTable(table),
  })));
  const missing = results.filter(result => result.error).map(result => result.table);
  const firstError = results.find(result => result.error)?.error;
  return { missing, message: firstError ?? undefined };
}

async function missingColumns(table: string, columns: string[]): Promise<{ missing: string[]; message?: string }> {
  const results = await Promise.all(columns.map(async column => ({
    column: `${table}.${column}`,
    error: await probeColumn(table, column),
  })));
  const missing = results.filter(result => result.error).map(result => result.column);
  const firstError = results.find(result => result.error)?.error;
  return { missing, message: firstError ?? undefined };
}

async function probePhotoBucket(shopId: string | null): Promise<CloudHealthCheck> {
  if (!shopId) {
    return {
      id: 'photoBucket',
      ok: false,
      missing: ['shop-photos'],
      message: 'No shop profile found',
      migration: '006',
    };
  }

  const { error } = await supabase!.storage
    .from('shop-photos')
    .list(shopId, { limit: 1 });

  return {
    id: 'photoBucket',
    ok: !error,
    missing: error ? ['shop-photos'] : [],
    message: error ? describeError(error) : undefined,
    migration: '006',
  };
}

function tableCheck(
  id: CloudHealthCheckId,
  migration: string,
  result: { missing: string[]; message?: string },
): CloudHealthCheck {
  return {
    id,
    ok: result.missing.length === 0,
    missing: result.missing,
    message: result.message,
    migration,
  };
}

async function probeRlsHelpers(): Promise<{ missing: string[]; message?: string }> {
  const [shop, role] = await Promise.all([
    supabase!.rpc('current_shop_id'),
    supabase!.rpc('current_user_role'),
  ]);

  const missing: string[] = [];
  if (shop.error) missing.push('current_shop_id');
  if (role.error) missing.push('current_user_role');
  if (!shop.error && !shop.data) missing.push('current_shop_id');
  if (!role.error && !['owner', 'manager', 'staff'].includes(String(role.data))) {
    missing.push('current_user_role');
  }

  const message = shop.error
    ? describeError(shop.error)
    : role.error
      ? describeError(role.error)
      : undefined;

  return { missing, message };
}

async function probeSchemaVersion(): Promise<{ missing: string[]; message?: string }> {
  const { data, error } = await supabase!
    .from('app_meta')
    .select('value')
    .eq('key', 'schema_version')
    .maybeSingle();

  if (error) {
    return { missing: ['app_meta.schema_version'], message: describeError(error) };
  }

  const version = Number(data?.value);
  if (!data || !Number.isFinite(version) || version < 15) {
    return {
      missing: ['app_meta.schema_version'],
      message: data ? `Schema version ${data.value}, expected 15` : 'Schema version is not set',
    };
  }

  return { missing: [] };
}

async function probeTeamInvites(): Promise<{ missing: string[]; message?: string }> {
  const [table, accept] = await Promise.all([
    probeTable('shop_invites'),
    supabase!.rpc('accept_shop_invite', { p_token: '__health_check__' }),
  ]);

  const missing: string[] = [];
  if (table) missing.push('shop_invites');
  if (accept.error) missing.push('accept_shop_invite');

  return {
    missing,
    message: table
      ?? (accept.error ? describeError(accept.error) : undefined),
  };
}

export async function checkCloudHealth(): Promise<CloudHealthReport> {
  if (!supabase || !isSupabaseAvailable() || !getAuthState().user) {
    throw new Error('Sign in to a cloud account before checking the schema');
  }

  await profileReady;
  const shopId = await getShopId();

  const [base, parity, customerDates, settingsParity, profileFields, photoBucket, rlsHardening, teamInvites, inventoryFields, purchaseFields, financeTable, schemaVersion] = await Promise.all([
    missingTables(BASE_TABLES),
    missingTables(PARITY_TABLES),
    missingColumns('customers', ['important_dates']),
    missingColumns('settings', ['client_dates_window_days', 'client_status', 'updated_at']),
    missingColumns('user_profiles', ['role', 'language']),
    probePhotoBucket(shopId),
    probeRlsHelpers(),
    probeTeamInvites(),
    missingColumns('inventory_items', ['supplier', 'supplier_sku', 'pack_note', 'notes']),
    missingColumns('client_purchases', ['delivery_address']),
    missingTables(['finance_entries']),
    probeSchemaVersion(),
  ]);

  const checks = [
    tableCheck('baseTables', '001', base),
    tableCheck('parityTables', '006', parity),
    tableCheck('customerDates', '006', customerDates),
    tableCheck('settingsParity', '006', settingsParity),
    tableCheck('profileFields', '001', profileFields),
    photoBucket,
    tableCheck('rlsHardening', '007', rlsHardening),
    tableCheck('teamInvites', '008', teamInvites),
    tableCheck('inventoryFields', '012', inventoryFields),
    tableCheck('purchaseFields', '013', purchaseFields),
    tableCheck('financeTable', '014', financeTable),
    tableCheck('schemaVersion', '015', schemaVersion),
  ];

  return {
    ok: checks.every(check => check.ok),
    checkedAt: new Date().toISOString(),
    checks,
  };
}
