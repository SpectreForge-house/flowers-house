import { Bouquet, BouquetItem } from '../types';
import { supabase } from '../lib/supabase';
import { BouquetStorageAdapter } from './bouquetStorageAdapter';
import { getShopId } from './supabaseInventoryStorage';

function rowToBouquet(row: Record<string, unknown>, items: BouquetItem[]): Bouquet {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    sellingPrice: Number(row.selling_price),
    items,
    photoUrl: (row.photo_url as string) || undefined,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class SupabaseBouquetAdapter implements BouquetStorageAdapter {
  async getBouquets(): Promise<Bouquet[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { data: bouquetRows, error: bouquetError } = await supabase
      .from('bouquets')
      .select('*')
      .eq('shop_id', shopId)
      .order('name', { ascending: true });

    if (bouquetError) throw new Error(`Failed to load bouquets: ${bouquetError.message}`);

    if (!bouquetRows || bouquetRows.length === 0) return [];

    const bouquetIds = bouquetRows.map(b => b.id);

    const { data: itemRows, error: itemError } = await supabase
      .from('bouquet_items')
      .select('*')
      .in('bouquet_id', bouquetIds);

    if (itemError) throw new Error(`Failed to load bouquet items: ${itemError.message}`);

    const itemsByBouquet = new Map<string, BouquetItem[]>();
    for (const row of itemRows || []) {
      const bouquetId = row.bouquet_id as string;
      if (!itemsByBouquet.has(bouquetId)) itemsByBouquet.set(bouquetId, []);
      itemsByBouquet.get(bouquetId)!.push({
        inventoryItemId: row.inventory_item_id as string,
        quantity: Number(row.quantity),
      });
    }

    return bouquetRows.map(b => rowToBouquet(b, itemsByBouquet.get(b.id) || []));
  }

  async addBouquet(bouquet: Bouquet): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { error: bouquetError } = await supabase.from('bouquets').insert({
      id: bouquet.id,
      shop_id: shopId,
      name: bouquet.name,
      description: bouquet.description || null,
      selling_price: bouquet.sellingPrice,
      photo_url: bouquet.photoUrl || null,
      is_active: bouquet.isActive,
      created_at: bouquet.createdAt,
      updated_at: bouquet.updatedAt,
    });

    if (bouquetError) throw new Error(`Failed to add bouquet: ${bouquetError.message}`);

    if (bouquet.items.length > 0) {
      const itemRows = bouquet.items.map(item => ({
        bouquet_id: bouquet.id,
        inventory_item_id: item.inventoryItemId,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase.from('bouquet_items').insert(itemRows);
      if (itemsError) throw new Error(`Failed to add bouquet items: ${itemsError.message}`);
    }
  }

  async updateBouquet(bouquet: Bouquet): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error: bouquetError } = await supabase
      .from('bouquets')
      .update({
        name: bouquet.name,
        description: bouquet.description || null,
        selling_price: bouquet.sellingPrice,
        photo_url: bouquet.photoUrl || null,
        is_active: bouquet.isActive,
        updated_at: bouquet.updatedAt,
      })
      .eq('id', bouquet.id);

    if (bouquetError) throw new Error(`Failed to update bouquet: ${bouquetError.message}`);

    // Replace bouquet_items: delete existing, insert new
    const { error: deleteError } = await supabase
      .from('bouquet_items')
      .delete()
      .eq('bouquet_id', bouquet.id);

    if (deleteError) throw new Error(`Failed to clear bouquet items: ${deleteError.message}`);

    if (bouquet.items.length > 0) {
      const itemRows = bouquet.items.map(item => ({
        bouquet_id: bouquet.id,
        inventory_item_id: item.inventoryItemId,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase.from('bouquet_items').insert(itemRows);
      if (itemsError) throw new Error(`Failed to add bouquet items: ${itemsError.message}`);
    }
  }

  async deleteBouquet(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    // bouquet_items cascade-deletes via FK ON DELETE CASCADE
    const { error } = await supabase
      .from('bouquets')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete bouquet: ${error.message}`);
  }

  async deleteAllBouquets(): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { error } = await supabase
      .from('bouquets')
      .delete()
      .eq('shop_id', shopId);

    if (error) throw new Error(`Failed to delete all bouquets: ${error.message}`);
  }
}
