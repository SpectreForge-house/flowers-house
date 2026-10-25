import { describe, expect, it } from 'vitest';
import {
  calculateBouquetCost,
  calculateBouquetMargin,
  calculateBouquetProfit,
  getInventoryCost,
  getInventoryValue,
  getLowStockItems,
} from './inventoryService';
import { Bouquet, InventoryItem } from '../types';

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'item-1',
    name: 'Rose',
    category: 'flowers',
    quantity: 10,
    minStock: 5,
    purchasePrice: 2,
    unit: 'stems',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function bouquet(overrides: Partial<Bouquet> = {}): Bouquet {
  return {
    id: 'bouquet-1',
    name: 'Classic',
    sellingPrice: 20,
    items: [{ inventoryItemId: 'item-1', quantity: 3 }],
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('bouquet cost calculations', () => {
  const inventory = [item()];

  it('sums purchase price times quantity', () => {
    expect(getInventoryCost([{ inventoryItemId: 'item-1', quantity: 3 }], inventory)).toBe(6);
  });

  it('ignores unknown inventory items instead of producing NaN', () => {
    expect(getInventoryCost([{ inventoryItemId: 'missing', quantity: 4 }], inventory)).toBe(0);
  });

  it('calculates cost, profit and margin', () => {
    const b = bouquet();
    expect(calculateBouquetCost(b, inventory)).toBe(6);
    expect(calculateBouquetProfit(b, inventory)).toBe(14);
    expect(calculateBouquetMargin(b, inventory)).toBe(70);
  });

  it('returns a zero margin when cost is zero', () => {
    const b = bouquet({ sellingPrice: 20, items: [] });
    expect(calculateBouquetMargin(b, inventory)).toBe(0);
  });
});

describe('inventory value helpers', () => {
  it('values stock at purchase price', () => {
    expect(getInventoryValue([item({ quantity: 4, purchasePrice: 2.5 })])).toBe(10);
  });

  it('flags items at or below their minimum stock', () => {
    const low = item({ id: 'low', quantity: 5, minStock: 5 });
    const ok = item({ id: 'ok', quantity: 6, minStock: 5 });
    expect(getLowStockItems([low, ok]).map(i => i.id)).toEqual(['low']);
  });
});
