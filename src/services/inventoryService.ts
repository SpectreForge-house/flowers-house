import { v4 as uuidv4 } from 'uuid';
import { InventoryItem, InventoryTransaction, Bouquet, Order } from '../types';
import { getInventory, saveInventory, getTransactions, addTransaction, getReservations, getOrders, saveOrders } from './storage';
import { InventoryStorageAdapter } from './inventoryStorageAdapter';
import { isCloudActive } from './storageMode';
import { completeReservationsForOrder } from './reservationService';
import { adjustInventoryStockRpc, deductInventoryForOrderRpc, restoreInventoryForOrderRpc } from './supabaseInventoryStorage';

export type InventoryMessage = { key: string; params?: Record<string, string | number> };

function msg(key: string, params?: Record<string, string | number>): InventoryMessage {
  return { key, params };
}

export function getInventoryCost(bouquetItems: { inventoryItemId: string; quantity: number }[], inventoryOverride?: InventoryItem[]): number {
  const inventory = inventoryOverride ?? getInventory();
  return bouquetItems.reduce((total, item) => {
    const invItem = inventory.find(i => i.id === item.inventoryItemId);
    return total + (invItem ? invItem.purchasePrice * item.quantity : 0);
  }, 0);
}

export function calculateBouquetCost(bouquet: Bouquet, inventoryOverride?: InventoryItem[]): number {
  return getInventoryCost(bouquet.items, inventoryOverride);
}

export function calculateBouquetProfit(bouquet: Bouquet, inventoryOverride?: InventoryItem[]): number {
  const cost = calculateBouquetCost(bouquet, inventoryOverride);
  return bouquet.sellingPrice - cost;
}

export function calculateBouquetMargin(bouquet: Bouquet, inventoryOverride?: InventoryItem[]): number {
  const cost = calculateBouquetCost(bouquet, inventoryOverride);
  if (cost === 0) return 0;
  return ((bouquet.sellingPrice - cost) / bouquet.sellingPrice) * 100;
}

export async function deductInventoryForOrder(order: Order, bouquets: Bouquet[], adapter?: InventoryStorageAdapter): Promise<{ success: boolean; message: InventoryMessage }> {
  if (order.inventoryDeducted) {
    return { success: false, message: msg('orders.inventoryAlreadyDeducted') };
  }

  if (adapter) {
    // Cloud mode: use Supabase RPC for atomic deduction
    try {
      const rpcItems: { inventory_item_id: string; quantity: number }[] = [];

      for (const orderItem of order.items) {
        const bouquet = bouquets.find(b => b.id === orderItem.bouquetId);
        if (!bouquet) {
          return { success: false, message: msg('orders.bouquetNotFound', { id: orderItem.bouquetId }) };
        }

        for (let i = 0; i < orderItem.quantity; i++) {
          for (const bouquetItem of bouquet.items) {
            rpcItems.push({
              inventory_item_id: bouquetItem.inventoryItemId,
              quantity: bouquetItem.quantity,
            });
          }
        }
      }

      await deductInventoryForOrderRpc(order.id, rpcItems);
      return { success: true, message: msg('inventory.deductedSuccessfully') };
    } catch (error) {
      const err = error as Error;
      return { success: false, message: msg('orders.insufficientStock', { item: err.message, need: 0, have: 0 }) };
    }
  }

  // Local mode: use localStorage
  const inventory = getInventory();
  const transactions: InventoryTransaction[] = [];

  for (const orderItem of order.items) {
    const bouquet = bouquets.find(b => b.id === orderItem.bouquetId);
    if (!bouquet) {
      return { success: false, message: msg('orders.bouquetNotFound', { id: orderItem.bouquetId }) };
    }

    for (let i = 0; i < orderItem.quantity; i++) {
      for (const bouquetItem of bouquet.items) {
        const invItem = inventory.find(inv => inv.id === bouquetItem.inventoryItemId);
        if (!invItem) {
          return { success: false, message: msg('orders.inventoryItemNotFound', { id: bouquetItem.inventoryItemId }) };
        }

        const requiredQty = bouquetItem.quantity;
        const reserved = getReservations()
          .filter(r => r.inventoryItemId === invItem.id && r.status === 'active' && r.orderId !== order.id)
          .reduce((sum, r) => sum + r.quantity, 0);
        const available = invItem.quantity - reserved;
        if (available < requiredQty) {
          return { success: false, message: msg('orders.insufficientStock', { item: invItem.name, need: requiredQty, have: available }) };
        }

        invItem.quantity -= requiredQty;
        invItem.updatedAt = new Date().toISOString();

        transactions.push({
          id: uuidv4(),
          inventoryItemId: invItem.id,
          type: 'remove',
          quantity: requiredQty,
          reason: `Used for Order ${order.id}`,
          referenceId: order.id,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  saveInventory(inventory);
  transactions.forEach(t => addTransaction(t));

  const orders = getOrders();
  const storedOrder = orders.find(o => o.id === order.id);
  if (storedOrder) {
    storedOrder.inventoryDeducted = true;
    storedOrder.updatedAt = new Date().toISOString();
    saveOrders(orders);
  }
  order.inventoryDeducted = true;

  await completeReservationsForOrder(order.id);

  return { success: true, message: msg('inventory.deductedSuccessfully') };
}

export async function restoreInventoryForOrder(
  order: Order,
  bouquets: Bouquet[],
): Promise<{ success: boolean; message: InventoryMessage; restored: number }> {
  if (!order.inventoryDeducted) {
    return { success: true, message: msg('orders.inventoryNotDeducted'), restored: 0 };
  }

  const timestamp = new Date().toISOString();

  if (isCloudActive()) {
    // The database does the whole restore atomically and is idempotent: it
    // refuses to return the same components twice.
    let restored = 0;
    try {
      restored = await restoreInventoryForOrderRpc(order.id);
    } catch (error) {
      const raw = (error as Error).message;
      // A clear hint when the database has not been migrated yet: without the
      // restore_inventory_for_order() function nothing can be returned.
      const notMigrated = /Could not find the function|PGRST202|schema cache/i.test(raw);
      return {
        success: false,
        message: notMigrated
          ? msg('inventory.restoreUnavailable')
          : msg('inventory.stockUpdateFailed', { error: raw }),
        restored: 0,
      };
    }

    order.inventoryDeducted = false;
    order.updatedAt = timestamp;
    return { success: true, message: msg('orders.inventoryRestored', { qty: restored }), restored };
  }

  // Local mode. The stock movements written when the order was confirmed are
  // the source of truth: editing or deleting a bouquet afterwards must not
  // change what comes back to the warehouse. The current composition is only a
  // fallback for legacy orders that have no movements recorded.
  const required = new Map<string, number>();
  for (const txn of getTransactions()) {
    if (txn.referenceId === order.id && txn.type === 'remove') {
      required.set(txn.inventoryItemId, (required.get(txn.inventoryItemId) ?? 0) + txn.quantity);
    }
  }

  if (required.size === 0) {
    // Aggregate per warehouse item: two bouquets in the same order may share
    // the same roses, and each item must be returned exactly once.
    for (const orderItem of order.items) {
      const bouquet = bouquets.find(b => b.id === orderItem.bouquetId);
      if (!bouquet) {
        return {
          success: false,
          message: msg('orders.bouquetNotFound', { id: orderItem.bouquetId }),
          restored: 0,
        };
      }
      for (const bouquetItem of bouquet.items) {
        required.set(
          bouquetItem.inventoryItemId,
          (required.get(bouquetItem.inventoryItemId) ?? 0) + bouquetItem.quantity * orderItem.quantity,
        );
      }
    }
  }

  const inventory = getInventory();
  for (const [itemId, quantity] of required) {
    const invItem = inventory.find(inv => inv.id === itemId);
    if (!invItem) {
      return { success: false, message: msg('orders.inventoryItemNotFound', { id: itemId }), restored: 0 };
    }
    invItem.quantity += quantity;
    invItem.updatedAt = timestamp;
  }
  saveInventory(inventory);

  let restored = 0;
  for (const [itemId, quantity] of required) {
    restored += quantity;
    addTransaction({
      id: uuidv4(),
      inventoryItemId: itemId,
      type: 'add',
      quantity,
      reason: `Order ${order.id} cancelled`,
      referenceId: order.id,
      createdAt: timestamp,
    });
  }

  const orders = getOrders();
  const storedOrder = orders.find(o => o.id === order.id);
  if (storedOrder) {
    storedOrder.inventoryDeducted = false;
    storedOrder.updatedAt = timestamp;
    saveOrders(orders);
  }

  order.inventoryDeducted = false;
  order.updatedAt = timestamp;
  return { success: true, message: msg('orders.inventoryRestored', { qty: restored }), restored };
}

export async function addStock(itemId: string, quantity: number, reason: string, adapter?: InventoryStorageAdapter): Promise<{ success: boolean; message: InventoryMessage }> {
  const inventory = adapter ? await adapter.getInventory() : getInventory();
  const item = inventory.find(i => i.id === itemId);

  if (!item) {
    return { success: false, message: msg('inventory.itemNotFound') };
  }

  if (quantity <= 0) {
    return { success: false, message: msg('inventory.quantityRequired') };
  }

  if (adapter) {
    try {
      await adjustInventoryStockRpc({ itemId, quantity, type: 'add', reason });
    } catch (error) {
      return { success: false, message: msg('inventory.stockUpdateFailed', { error: (error as Error).message }) };
    }
  } else {
    item.quantity += quantity;
    item.updatedAt = new Date().toISOString();
    saveInventory(inventory);
    addTransaction({
      id: uuidv4(),
      inventoryItemId: itemId,
      type: 'add',
      quantity,
      reason,
      createdAt: new Date().toISOString(),
    });
  }

  return { success: true, message: msg('inventory.addedStock', { qty: quantity, unit: item.unit, name: item.name }) };
}

export async function removeStock(itemId: string, quantity: number, reason: string, adapter?: InventoryStorageAdapter): Promise<{ success: boolean; message: InventoryMessage }> {
  const inventory = adapter ? await adapter.getInventory() : getInventory();
  const item = inventory.find(i => i.id === itemId);

  if (!item) {
    return { success: false, message: msg('inventory.itemNotFound') };
  }

  if (quantity <= 0) {
    return { success: false, message: msg('inventory.quantityRequired') };
  }

  if (item.quantity < quantity) {
    return { success: false, message: msg('inventory.insufficientStock', { have: item.quantity, need: quantity }) };
  }

  if (adapter) {
    try {
      await adjustInventoryStockRpc({ itemId, quantity, type: 'remove', reason });
    } catch (error) {
      return { success: false, message: msg('inventory.stockUpdateFailed', { error: (error as Error).message }) };
    }
  } else {
    item.quantity -= quantity;
    item.updatedAt = new Date().toISOString();
    saveInventory(inventory);
    addTransaction({
      id: uuidv4(),
      inventoryItemId: itemId,
      type: 'remove',
      quantity,
      reason,
      createdAt: new Date().toISOString(),
    });
  }

  return { success: true, message: msg('inventory.removedStock', { qty: quantity, unit: item.unit, name: item.name }) };
}

export async function getItemTransactions(itemId: string, adapter?: InventoryStorageAdapter): Promise<InventoryTransaction[]> {
  if (adapter) {
    const transactions = await adapter.getItemTransactions(itemId);
    return transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return getTransactions()
    .filter(t => t.inventoryItemId === itemId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getLowStockItems(inventoryOverride?: InventoryItem[]): InventoryItem[] {
  const inventory = inventoryOverride ?? getInventory();
  return inventory.filter(item => item.quantity <= item.minStock);
}

export function getInventoryValue(inventoryOverride?: InventoryItem[]): number {
  const inventory = inventoryOverride ?? getInventory();
  return inventory.reduce((total, item) => total + (item.purchasePrice * item.quantity), 0);
}

export async function recordWaste(itemId: string, quantity: number, reason: string, comment?: string, adapter?: InventoryStorageAdapter): Promise<{ success: boolean; message: InventoryMessage }> {
  const inventory = adapter ? await adapter.getInventory() : getInventory();
  const item = inventory.find(i => i.id === itemId);

  if (!item) {
    return { success: false, message: msg('inventory.itemNotFound') };
  }

  if (quantity <= 0) {
    return { success: false, message: msg('inventory.quantityRequired') };
  }

  if (item.quantity < quantity) {
    return { success: false, message: msg('inventory.insufficientStock', { have: item.quantity, need: quantity }) };
  }

  if (adapter) {
    try {
      await adjustInventoryStockRpc({ itemId, quantity, type: 'waste', reason, comment });
    } catch (error) {
      return { success: false, message: msg('inventory.stockUpdateFailed', { error: (error as Error).message }) };
    }
  } else {
    item.quantity -= quantity;
    item.updatedAt = new Date().toISOString();
    saveInventory(inventory);
    addTransaction({
      id: uuidv4(),
      inventoryItemId: itemId,
      type: 'waste',
      quantity,
      reason,
      comment,
      createdAt: new Date().toISOString(),
    });
  }

  return { success: true, message: msg('waste.recordedSuccessfully', { qty: quantity, unit: item.unit, name: item.name }) };
}

export async function getWasteTransactions(adapter?: InventoryStorageAdapter): Promise<InventoryTransaction[]> {
  if (adapter) {
    const transactions = await adapter.getWasteTransactions();
    return transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return getTransactions()
    .filter(t => t.type === 'waste')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
