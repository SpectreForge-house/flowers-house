import { HistoryRecord } from '../types';
import { HistoryStorageAdapter } from './historyStorageAdapter';
import { supabase } from '../lib/supabase';
import { getShopId } from './supabaseInventoryStorage';

export class SupabaseHistoryAdapter implements HistoryStorageAdapter {
  async getHistory(): Promise<HistoryRecord[]> {
    const shopId = await getShopId();
    if (!shopId) throw new Error('No shop ID available');

    const { data, error } = await supabase
      .from('history')
      .select('*')
      .eq('shop_id', shopId)
      .order('timestamp', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      actionType: row.action_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      description: row.description,
      metadata: row.metadata,
    }));
  }

  async addHistory(record: HistoryRecord): Promise<void> {
    const shopId = await getShopId();
    if (!shopId) throw new Error('No shop ID available');

    const { error } = await supabase
      .from('history')
      .insert({
        id: record.id,
        shop_id: shopId,
        timestamp: record.timestamp,
        action_type: record.actionType,
        entity_type: record.entityType,
        entity_id: record.entityId,
        description: record.description,
        metadata: record.metadata ?? null,
      });

    if (error) throw error;
  }

  async saveHistory(records: HistoryRecord[]): Promise<void> {
    const shopId = await getShopId();
    if (!shopId) throw new Error('No shop ID available');

    const { data: existing, error: fetchError } = await supabase
      .from('history')
      .select('id')
      .eq('shop_id', shopId);

    if (fetchError) throw fetchError;

    const existingIds = new Set((existing || []).map(r => r.id));
    const keepIds = new Set(records.map(r => r.id));
    const toDelete = [...existingIds].filter(id => !keepIds.has(id));

    if (toDelete.length === 0) return;

    const { error: deleteError } = await supabase
      .from('history')
      .delete()
      .in('id', toDelete)
      .eq('shop_id', shopId);

    if (deleteError) throw deleteError;
  }

  async deleteHistory(id: string): Promise<void> {
    const shopId = await getShopId();
    if (!shopId) throw new Error('No shop ID available');

    const { error } = await supabase
      .from('history')
      .delete()
      .eq('id', id)
      .eq('shop_id', shopId);

    if (error) throw error;
  }

  async deleteHistoryByFilter(filters: { olderThan?: string; since?: string; until?: string }): Promise<number> {
    const shopId = await getShopId();
    if (!shopId) throw new Error('No shop ID available');

    let query = supabase
      .from('history')
      .delete()
      .eq('shop_id', shopId);

    if (filters.olderThan) {
      query = query.lt('timestamp', filters.olderThan);
    }
    if (filters.since) {
      query = query.gte('timestamp', filters.since);
    }
    if (filters.until) {
      query = query.lt('timestamp', filters.until);
    }

    const { data, error } = await query.select('id');

    if (error) throw error;

    return data?.length || 0;
  }
}
