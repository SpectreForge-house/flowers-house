import { ClientStatusSettings, Settings } from '../types';
import { supabase } from '../lib/supabase';
import { sampleSettings } from '../data/sampleData';
import { getShopId } from './shopContext';
import { SettingsStorageAdapter } from './settingsStorageAdapter';

export const DEFAULT_CLIENT_STATUS_SETTINGS: ClientStatusSettings = {
  regularMinCount: 3,
  vipMinTotal: 300,
  vipMinCount: 10,
  discountNew: 0,
  discountRegular: 0,
  discountVip: 0,
};

export const DEFAULT_CLIENT_DATES_WINDOW_DAYS = 14;

function numberOr(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function timeOr(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value : '';
  return /^\d{2}:\d{2}/.test(text) ? text.slice(0, 5) : fallback;
}

function normalizeStatus(raw: unknown): ClientStatusSettings {
  const value = raw && typeof raw === 'object' ? raw as Partial<ClientStatusSettings> : {};
  return {
    regularMinCount: numberOr(value.regularMinCount, DEFAULT_CLIENT_STATUS_SETTINGS.regularMinCount),
    vipMinTotal: numberOr(value.vipMinTotal, DEFAULT_CLIENT_STATUS_SETTINGS.vipMinTotal),
    vipMinCount: numberOr(value.vipMinCount, DEFAULT_CLIENT_STATUS_SETTINGS.vipMinCount),
    discountNew: numberOr(value.discountNew, DEFAULT_CLIENT_STATUS_SETTINGS.discountNew),
    discountRegular: numberOr(value.discountRegular, DEFAULT_CLIENT_STATUS_SETTINGS.discountRegular),
    discountVip: numberOr(value.discountVip, DEFAULT_CLIENT_STATUS_SETTINGS.discountVip),
  };
}

function rowToSettings(row: Record<string, unknown>): Settings {
  return {
    shopName: (row.shop_name as string) || sampleSettings.shopName,
    shopAddress: (row.shop_address as string) || '',
    shopPhone: (row.shop_phone as string) || '',
    shopEmail: (row.shop_email as string) || '',
    currency: (row.currency as string) || sampleSettings.currency,
    currencySymbol: (row.currency_symbol as string) || sampleSettings.currencySymbol,
    defaultDeliveryFee: numberOr(row.default_delivery_fee, sampleSettings.defaultDeliveryFee),
    openingTime: timeOr(row.opening_time, sampleSettings.openingTime),
    closingTime: timeOr(row.closing_time, sampleSettings.closingTime),
    weekendOpeningTime: timeOr(row.weekend_opening_time, sampleSettings.weekendOpeningTime),
    weekendClosingTime: timeOr(row.weekend_closing_time, sampleSettings.weekendClosingTime),
    clientDatesWindowDays: numberOr(row.client_dates_window_days, DEFAULT_CLIENT_DATES_WINDOW_DAYS),
    clientStatus: normalizeStatus(row.client_status),
  };
}

export class SupabaseSettingsAdapter implements SettingsStorageAdapter {
  async getSettings(): Promise<Settings> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('shop_id', shopId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load settings: ${error.message}`);
    if (!data) {
      const { data: shop, error: shopError } = await supabase
        .from('shops')
        .select('name, address, phone, email')
        .eq('id', shopId)
        .maybeSingle();
      if (shopError) console.error('[Supabase] Shop lookup failed:', shopError.message);
      return {
        ...sampleSettings,
        shopName: (shop?.name as string) || sampleSettings.shopName,
        shopAddress: (shop?.address as string) || '',
        shopPhone: (shop?.phone as string) || '',
        shopEmail: (shop?.email as string) || '',
        clientDatesWindowDays: DEFAULT_CLIENT_DATES_WINDOW_DAYS,
        clientStatus: DEFAULT_CLIENT_STATUS_SETTINGS,
      };
    }

    return rowToSettings(data);
  }

  async updateSettings(settings: Settings): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('settings')
      .upsert({
        shop_id: shopId,
        shop_name: settings.shopName,
        shop_address: settings.shopAddress,
        shop_phone: settings.shopPhone,
        shop_email: settings.shopEmail,
        currency: settings.currency,
        currency_symbol: settings.currencySymbol,
        default_delivery_fee: settings.defaultDeliveryFee,
        opening_time: settings.openingTime,
        closing_time: settings.closingTime,
        weekend_opening_time: settings.weekendOpeningTime,
        weekend_closing_time: settings.weekendClosingTime,
        client_dates_window_days: settings.clientDatesWindowDays ?? DEFAULT_CLIENT_DATES_WINDOW_DAYS,
        client_status: settings.clientStatus ?? DEFAULT_CLIENT_STATUS_SETTINGS,
        updated_at: now,
      }, { onConflict: 'shop_id' });

    if (error) throw new Error(`Failed to save settings: ${error.message}`);

    const { error: shopError } = await supabase
      .from('shops')
      .update({
        name: settings.shopName,
        address: settings.shopAddress || null,
        phone: settings.shopPhone || null,
        email: settings.shopEmail || null,
      })
      .eq('id', shopId);

    if (shopError) console.error('[Supabase] Shop profile update failed:', shopError.message);
  }
}
