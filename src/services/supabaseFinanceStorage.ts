import { ExpenseCategory, FinanceEntry, FinanceEntryType } from '../types';
import { supabase } from '../lib/supabase';
import { getShopId } from './shopContext';
import { FinanceStorageAdapter } from './financeStorageAdapter';

function rowToEntry(row: Record<string, unknown>): FinanceEntry {
  const type = row.type as FinanceEntryType;
  return {
    id: row.id as string,
    type: type === 'expense' ? 'expense' : 'income',
    date: row.entry_date as string,
    amount: Number(row.amount),
    category: (row.category as ExpenseCategory) || undefined,
    categoryLabel: (row.category_label as string) || undefined,
    note: (row.note as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class SupabaseFinanceAdapter implements FinanceStorageAdapter {
  async getEntries(): Promise<FinanceEntry[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { data, error } = await supabase
      .from('finance_entries')
      .select('*')
      .eq('shop_id', shopId)
      .order('entry_date', { ascending: false });

    if (error) throw new Error(`Failed to load finance entries: ${error.message}`);
    return (data || []).map(rowToEntry);
  }

  async addEntry(entry: FinanceEntry): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { error } = await supabase.from('finance_entries').insert({
      id: entry.id,
      shop_id: shopId,
      type: entry.type,
      entry_date: entry.date,
      amount: entry.amount,
      category: entry.category || null,
      category_label: entry.categoryLabel || null,
      note: entry.note || null,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
    });

    if (error) throw new Error(`Failed to add finance entry: ${error.message}`);
  }

  async updateEntry(entry: FinanceEntry): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('finance_entries')
      .update({
        type: entry.type,
        entry_date: entry.date,
        amount: entry.amount,
        category: entry.category || null,
        category_label: entry.categoryLabel || null,
        note: entry.note || null,
        updated_at: entry.updatedAt,
      })
      .eq('id', entry.id);

    if (error) throw new Error(`Failed to update finance entry: ${error.message}`);
  }

  async deleteEntry(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('finance_entries')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete finance entry: ${error.message}`);
  }

  async deleteAllEntries(): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { error } = await supabase
      .from('finance_entries')
      .delete()
      .eq('shop_id', shopId);

    if (error) throw new Error(`Failed to delete finance entries: ${error.message}`);
  }
}
