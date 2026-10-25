import { ClientPurchase } from '../types';
import { supabase } from '../lib/supabase';
import { getShopId } from './shopContext';
import { PurchaseStorageAdapter } from './purchaseStorageAdapter';

function rowToPurchase(row: Record<string, unknown>): ClientPurchase {
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    name: (row.name as string) || undefined,
    composition: (row.composition as string) || '',
    price: Number(row.price),
    date: row.purchase_date as string,
    note: (row.note as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class SupabasePurchaseAdapter implements PurchaseStorageAdapter {
  async getPurchases(): Promise<ClientPurchase[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { data, error } = await supabase
      .from('client_purchases')
      .select('*')
      .eq('shop_id', shopId)
      .order('purchase_date', { ascending: false });

    if (error) throw new Error(`Failed to load purchases: ${error.message}`);
    return (data || []).map(rowToPurchase);
  }

  async addPurchase(purchase: ClientPurchase): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { error } = await supabase.from('client_purchases').insert({
      id: purchase.id,
      shop_id: shopId,
      customer_id: purchase.customerId,
      name: purchase.name || null,
      composition: purchase.composition,
      price: purchase.price,
      purchase_date: purchase.date,
      note: purchase.note || null,
      created_at: purchase.createdAt,
      updated_at: purchase.updatedAt,
    });

    if (error) throw new Error(`Failed to add purchase: ${error.message}`);
  }

  async updatePurchase(purchase: ClientPurchase): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('client_purchases')
      .update({
        name: purchase.name || null,
        composition: purchase.composition,
        price: purchase.price,
        purchase_date: purchase.date,
        note: purchase.note || null,
        updated_at: purchase.updatedAt,
      })
      .eq('id', purchase.id);

    if (error) throw new Error(`Failed to update purchase: ${error.message}`);
  }

  async deletePurchase(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('client_purchases')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete purchase: ${error.message}`);
  }

  async deletePurchasesByCustomer(customerId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('client_purchases')
      .delete()
      .eq('customer_id', customerId);

    if (error) throw new Error(`Failed to delete customer purchases: ${error.message}`);
  }
}
