import { describe, expect, it } from 'vitest';
import { restoreInventoryForOrder } from './inventoryService';
import { addTransaction, getInventory, getOrders, getTransactions, saveInventory, saveOrders } from './storage';
import { Bouquet, InventoryItem, Order } from '../types';

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'item-1',
    name: 'Rose',
    category: 'flowers',
    quantity: 4,
    minStock: 5,
    purchasePrice: 2,
    unit: 'stems',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function bouquet(id: string, items: Bouquet['items']): Bouquet {
  return {
    id,
    name: id,
    sellingPrice: 20,
    items,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ORD-001',
    orderType: 'delivery',
    customerId: 'customer-1',
    customerName: 'Anna',
    customerPhone: '000',
    recipientName: 'Anna',
    deliveryAddress: 'Street 1',
    deliveryDate: '2026-11-20',
    deliveryTime: '12:00',
    items: [{ bouquetId: 'bouquet-1', quantity: 1, price: 20 }],
    deliveryFee: 0,
    total: 20,
    status: 'confirmed',
    inventoryDeducted: true,
    createdAt: '2026-11-18T09:00:00.000Z',
    updatedAt: '2026-11-18T09:00:00.000Z',
    ...overrides,
  };
}

describe('restoreInventoryForOrder (local mode)', () => {
  it('returns bouquet components to the warehouse and clears the flag', async () => {
    const bouquetItems = [{ inventoryItemId: 'item-1', quantity: 3 }];
    const entry = order();
    saveInventory([item()]);
    saveOrders([entry]);

    const result = await restoreInventoryForOrder(entry, [bouquet('bouquet-1', bouquetItems)]);

    expect(result.success).toBe(true);
    expect(result.restored).toBe(3);
    expect(getInventory()[0].quantity).toBe(7);
    expect(getOrders()[0].inventoryDeducted).toBe(false);
    expect(entry.inventoryDeducted).toBe(false);

    const transactions = getTransactions();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      inventoryItemId: 'item-1',
      type: 'add',
      quantity: 3,
      referenceId: 'ORD-001',
    });
  });

  it('aggregates shared components so nothing is returned twice', async () => {
    const entry = order({
      items: [
        { bouquetId: 'bouquet-1', quantity: 1, price: 20 },
        { bouquetId: 'bouquet-2', quantity: 2, price: 20 },
      ],
    });
    saveInventory([item()]);
    saveOrders([entry]);

    const result = await restoreInventoryForOrder(entry, [
      bouquet('bouquet-1', [{ inventoryItemId: 'item-1', quantity: 3 }]),
      bouquet('bouquet-2', [{ inventoryItemId: 'item-1', quantity: 1 }]),
    ]);

    expect(result.restored).toBe(5);
    expect(getInventory()[0].quantity).toBe(9);
    expect(getTransactions()).toHaveLength(1);
    expect(getTransactions()[0].quantity).toBe(5);
  });

  it('returns exactly what was deducted even if the bouquet changed later', async () => {
    const entry = order();
    saveInventory([item()]);
    saveOrders([entry]);
    addTransaction({
      id: 'txn-1',
      inventoryItemId: 'item-1',
      type: 'remove',
      quantity: 3,
      reason: 'Used for Order ORD-001',
      referenceId: 'ORD-001',
      createdAt: '2026-11-18T09:00:00.000Z',
    });

    // The bouquet now contains 5 stems, but the order deducted 3.
    const result = await restoreInventoryForOrder(entry, [
      bouquet('bouquet-1', [{ inventoryItemId: 'item-1', quantity: 5 }]),
    ]);

    expect(result.restored).toBe(3);
    expect(getInventory()[0].quantity).toBe(7);
    expect(getTransactions().filter(t => t.type === 'add')).toHaveLength(1);
    expect(getTransactions().find(t => t.type === 'add')?.reason).toBe('Order ORD-001 cancelled');
  });

  it('is idempotent: a repeated cancel does not inflate the stock', async () => {
    const entry = order();
    saveInventory([item()]);
    saveOrders([entry]);
    const bouquets = [bouquet('bouquet-1', [{ inventoryItemId: 'item-1', quantity: 3 }])];

    await restoreInventoryForOrder(entry, bouquets);
    const second = await restoreInventoryForOrder(entry, bouquets);

    expect(second.success).toBe(true);
    expect(second.restored).toBe(0);
    expect(second.message).toEqual({ key: 'orders.inventoryNotDeducted', params: undefined });
    expect(getInventory()[0].quantity).toBe(7);
    expect(getTransactions()).toHaveLength(1);
  });

  it('does nothing for an order that never deducted stock', async () => {
    const entry = order({ inventoryDeducted: false });
    saveInventory([item()]);
    saveOrders([entry]);

    const result = await restoreInventoryForOrder(entry, [bouquet('bouquet-1', [{ inventoryItemId: 'item-1', quantity: 3 }])]);

    expect(result.success).toBe(true);
    expect(result.restored).toBe(0);
    expect(getInventory()[0].quantity).toBe(4);
    expect(getOrders()[0].inventoryDeducted).toBe(false);
  });

  it('fails without touching the stock when a bouquet was deleted', async () => {
    const entry = order();
    saveInventory([item()]);
    saveOrders([entry]);

    const result = await restoreInventoryForOrder(entry, []);

    expect(result.success).toBe(false);
    expect(result.message.key).toBe('orders.bouquetNotFound');
    expect(getInventory()[0].quantity).toBe(4);
    expect(getOrders()[0].inventoryDeducted).toBe(true);
  });
});
