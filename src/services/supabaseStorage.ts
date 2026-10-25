import { Customer, ImportantDate } from '../types';
import { supabase } from '../lib/supabase';
import { CustomerStorageAdapter } from './storageAdapter';
import { clearShopContextCache, getShopId } from './shopContext';

export function clearShopIdCache(): void {
  clearShopContextCache();
}

export class SupabaseCustomerAdapter implements CustomerStorageAdapter {
  async getCustomers(): Promise<Customer[]> {
    if (!supabase) {
      return [];
    }

    const shopId = await getShopId();
    if (!shopId) {
      return [];
    }

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Supabase] SELECT customers failed:', error.message, error.code);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email || undefined,
      address: row.address,
      notes: row.notes || undefined,
      preferences: row.preferences || undefined,
      importantDates: Array.isArray(row.important_dates) ? row.important_dates as ImportantDate[] : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async addCustomer(customer: Customer): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    const shopId = await getShopId();
    if (!shopId) {
      throw new Error('Cannot add customer: no shop_id. Ensure you are signed in and your profile exists.');
    }

    const payload = {
      id: customer.id,
      shop_id: shopId,
      name: customer.name,
      phone: customer.phone,
      email: customer.email || null,
      address: customer.address,
      notes: customer.notes || null,
      preferences: customer.preferences || null,
      important_dates: customer.importantDates || [],
      created_at: customer.createdAt,
      updated_at: customer.updatedAt,
    };

    const { error } = await supabase
      .from('customers')
      .insert(payload);

    if (error) {
      throw new Error(`Supabase INSERT failed: ${error.message} (code: ${error.code})`);
    }
  }

  async updateCustomer(customer: Customer): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    const { error } = await supabase
      .from('customers')
      .update({
        name: customer.name,
        phone: customer.phone,
        email: customer.email || null,
        address: customer.address,
        notes: customer.notes || null,
        preferences: customer.preferences || null,
        important_dates: customer.importantDates || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id);

    if (error) {
      console.error('[Supabase] UPDATE customer failed:', error.message, error.code);
      throw new Error(`Failed to update customer: ${error.message}`);
    }
  }

  async deleteCustomer(id: string): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Supabase] DELETE customer failed:', error.message, error.code);
      throw new Error(`Failed to delete customer: ${error.message}`);
    }
  }

  async deleteAllCustomers(): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    const shopId = await getShopId();
    if (!shopId) {
      throw new Error('Cannot delete customers: no shop_id');
    }

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('shop_id', shopId);

    if (error) {
      console.error('[Supabase] DELETE all customers failed:', error.message, error.code);
      throw new Error(`Failed to delete customers: ${error.message}`);
    }
  }
}
