import { InventoryItem, InventoryTransaction, InventoryReservation } from '../types';
import { supabase } from '../lib/supabase';
import { InventoryStorageAdapter } from './inventoryStorageAdapter';
import { clearShopContextCache, getShopId } from './shopContext';

export { getShopId };

export function clearInventoryShopIdCache(): void {
  clearShopContextCache();
}

function rowToItem(row: Record<string, unknown>): InventoryItem {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    color: (row.color as string) || undefined,
    quantity: Number(row.quantity),
    minStock: Number(row.min_stock),
    purchasePrice: Number(row.purchase_price),
    sellingPrice: row.selling_price != null ? Number(row.selling_price) : undefined,
    unit: row.unit as InventoryItem['unit'],
    capacity: row.capacity != null ? Number(row.capacity) : undefined,
    capacityUnit: (row.capacity_unit as 'L' | 'ml') || undefined,
    supplier: (row.supplier as string) || undefined,
    supplierSku: (row.supplier_sku as string) || undefined,
    packNote: (row.pack_note as string) || undefined,
    notes: (row.notes as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToTransaction(row: Record<string, unknown>): InventoryTransaction {
  return {
    id: row.id as string,
    inventoryItemId: row.inventory_item_id as string,
    type: row.type as InventoryTransaction['type'],
    quantity: Number(row.quantity),
    reason: row.reason as string,
    referenceId: (row.reference_id as string) || undefined,
    createdAt: row.created_at as string,
    comment: (row.comment as string) || undefined,
  };
}

function rowToReservation(row: Record<string, unknown>): InventoryReservation {
  return {
    id: row.id as string,
    orderId: (row.order_id as string) || undefined,
    inventoryItemId: row.inventory_item_id as string,
    quantity: Number(row.quantity),
    status: row.status as InventoryReservation['status'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    note: (row.note as string) || undefined,
  };
}

export class SupabaseInventoryAdapter implements InventoryStorageAdapter {
  async getInventory(): Promise<InventoryItem[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('shop_id', shopId)
      .order('name', { ascending: true });

    if (error) throw new Error(`Failed to load inventory: ${error.message}`);

    return (data || []).map(rowToItem);
  }

  async addInventoryItem(item: InventoryItem): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const payload = {
      id: item.id,
      shop_id: shopId,
      name: item.name,
      category: item.category,
      color: item.color || null,
      quantity: item.quantity,
      min_stock: item.minStock,
      purchase_price: item.purchasePrice,
      selling_price: item.sellingPrice ?? null,
      unit: item.unit,
      capacity: item.capacity ?? null,
      capacity_unit: item.capacityUnit || null,
      supplier: item.supplier || null,
      supplier_sku: item.supplierSku || null,
      pack_note: item.packNote || null,
      notes: item.notes || null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };

    const { error } = await supabase.from('inventory_items').insert(payload);
    if (error) throw new Error(`Failed to add inventory item: ${error.message}`);
  }

  async updateInventoryItem(item: InventoryItem): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('inventory_items')
      .update({
        name: item.name,
        category: item.category,
        color: item.color || null,
        quantity: item.quantity,
        min_stock: item.minStock,
        purchase_price: item.purchasePrice,
        selling_price: item.sellingPrice ?? null,
        unit: item.unit,
        capacity: item.capacity ?? null,
        capacity_unit: item.capacityUnit || null,
        supplier: item.supplier || null,
        supplier_sku: item.supplierSku || null,
        pack_note: item.packNote || null,
        notes: item.notes || null,
        updated_at: item.updatedAt,
      })
      .eq('id', item.id);

    if (error) throw new Error(`Failed to update inventory item: ${error.message}`);
  }

  async deleteInventoryItem(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete inventory item: ${error.message}`);
  }

  async deleteAllInventory(): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .eq('shop_id', shopId);

    if (error) throw new Error(`Failed to delete all inventory: ${error.message}`);
  }

  async getItemTransactions(itemId: string): Promise<InventoryTransaction[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .eq('shop_id', shopId)
      .eq('inventory_item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to load transactions: ${error.message}`);

    return (data || []).map(rowToTransaction);
  }

  async addTransaction(transaction: InventoryTransaction): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const payload = {
      id: transaction.id,
      shop_id: shopId,
      inventory_item_id: transaction.inventoryItemId,
      type: transaction.type,
      quantity: transaction.quantity,
      reason: transaction.reason,
      reference_id: transaction.referenceId || null,
      created_at: transaction.createdAt,
      comment: transaction.comment || null,
    };

    const { error } = await supabase.from('inventory_transactions').insert(payload);
    if (error) throw new Error(`Failed to add transaction: ${error.message}`);
  }

  async getWasteTransactions(): Promise<InventoryTransaction[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .eq('shop_id', shopId)
      .eq('type', 'waste')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to load waste transactions: ${error.message}`);

    return (data || []).map(rowToTransaction);
  }

  async deleteWasteTransaction(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('inventory_transactions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete waste transaction: ${error.message}`);
  }

  async deleteAllWasteTransactions(): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { error } = await supabase
      .from('inventory_transactions')
      .delete()
      .eq('shop_id', shopId)
      .eq('type', 'waste');

    if (error) throw new Error(`Failed to delete all waste transactions: ${error.message}`);
  }

  async getReservations(): Promise<InventoryReservation[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { data, error } = await supabase
      .from('inventory_reservations')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to load reservations: ${error.message}`);

    return (data || []).map(rowToReservation);
  }

  async addReservation(reservation: InventoryReservation): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const payload = {
      id: reservation.id,
      shop_id: shopId,
      order_id: reservation.orderId || null,
      inventory_item_id: reservation.inventoryItemId,
      quantity: reservation.quantity,
      status: reservation.status,
      created_at: reservation.createdAt,
      updated_at: reservation.updatedAt,
      note: reservation.note || null,
    };

    const { error } = await supabase.from('inventory_reservations').insert(payload);
    if (error) throw new Error(`Failed to add reservation: ${error.message}`);
  }

  async updateReservation(reservation: InventoryReservation): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('inventory_reservations')
      .update({
        order_id: reservation.orderId || null,
        inventory_item_id: reservation.inventoryItemId,
        quantity: reservation.quantity,
        status: reservation.status,
        updated_at: reservation.updatedAt,
        note: reservation.note || null,
      })
      .eq('id', reservation.id);

    if (error) throw new Error(`Failed to update reservation: ${error.message}`);
  }

  async deleteReservation(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('inventory_reservations')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete reservation: ${error.message}`);
  }

  async deleteAllReservations(): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { error } = await supabase
      .from('inventory_reservations')
      .delete()
      .eq('shop_id', shopId);

    if (error) throw new Error(`Failed to delete all reservations: ${error.message}`);
  }
}

export async function deductInventoryForOrderRpc(orderId: string, items: { inventory_item_id: string; quantity: number }[]): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.rpc('deduct_inventory_for_order', {
    p_order_id: orderId,
    p_items: items,
  });

  if (error) throw new Error(`Failed to deduct inventory: ${error.message}`);
}

/**
 * Returns the components of a confirmed order to the warehouse and clears
 * inventory_deducted in one transaction. The database takes the quantities from
 * the stock movements recorded when the order was confirmed. Returns the
 * restored quantity (0 when the order had nothing deducted).
 */
export async function restoreInventoryForOrderRpc(orderId: string): Promise<number> {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.rpc('restore_inventory_for_order', {
    p_order_id: orderId,
  });

  if (error) throw new Error(`Failed to restore inventory: ${error.message}`);
  return Number(data);
}

export async function adjustInventoryStockRpc(params: {
  itemId: string;
  quantity: number;
  type: 'add' | 'remove' | 'waste';
  reason: string;
  transactionId?: string;
  comment?: string;
}): Promise<number> {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.rpc('adjust_inventory_stock', {
    p_item_id: params.itemId,
    p_quantity: params.quantity,
    p_type: params.type,
    p_reason: params.reason,
    p_transaction_id: params.transactionId ?? null,
    p_comment: params.comment ?? null,
  });

  if (error) throw new Error(`Failed to adjust inventory: ${error.message}`);
  return Number(data);
}
