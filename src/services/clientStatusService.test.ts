import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATUS_SETTINGS,
  getClientStatus,
  getDiscountForStatus,
  normalizeStatusSettings,
} from './clientStatusService';
import { Order } from '../types';

function order(id: string, total: number, status: Order['status'] = 'completed'): Order {
  return {
    id,
    customerId: 'customer-1',
    customerName: 'Anna',
    customerPhone: '+1',
    recipientName: 'Anna',
    deliveryAddress: 'Street 1',
    deliveryDate: '2026-01-01',
    deliveryTime: '12:00',
    items: [],
    deliveryFee: 0,
    total,
    status,
    inventoryDeducted: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('normalizeStatusSettings', () => {
  it('falls back to defaults for missing values', () => {
    expect(normalizeStatusSettings(null)).toEqual(DEFAULT_STATUS_SETTINGS);
  });

  it('rejects negative numbers and clamps discounts to 100', () => {
    const result = normalizeStatusSettings({
      regularMinCount: -1,
      vipMinTotal: Number.NaN,
      vipMinCount: 2,
      discountVip: 250,
    });
    expect(result.regularMinCount).toBe(DEFAULT_STATUS_SETTINGS.regularMinCount);
    expect(result.vipMinTotal).toBe(DEFAULT_STATUS_SETTINGS.vipMinTotal);
    expect(result.vipMinCount).toBe(2);
    expect(result.discountVip).toBe(100);
  });
});

describe('getClientStatus', () => {
  const settings = { ...DEFAULT_STATUS_SETTINGS, regularMinCount: 2, vipMinTotal: 300, vipMinCount: 10 };

  it('is new without purchases', () => {
    expect(getClientStatus('customer-1', [], [], settings)).toBe('new');
  });

  it('becomes regular at the purchase-count threshold', () => {
    expect(getClientStatus('customer-1', [order('ORD-1', 10)], [], settings)).toBe('new');
    expect(getClientStatus('customer-1', [order('ORD-1', 10), order('ORD-2', 10)], [], settings)).toBe('regular');
  });

  it('ignores cancelled orders', () => {
    const orders = [order('ORD-1', 500, 'cancelled')];
    expect(getClientStatus('customer-1', orders, [], settings)).toBe('new');
  });

  it('becomes vip at the spend threshold', () => {
    expect(getClientStatus('customer-1', [order('ORD-1', 300)], [], settings)).toBe('vip');
  });
});

describe('getDiscountForStatus', () => {
  it('returns the configured hint per status', () => {
    const settings = { ...DEFAULT_STATUS_SETTINGS, discountNew: 0, discountRegular: 5, discountVip: 10 };
    expect(getDiscountForStatus('new', settings)).toBe(0);
    expect(getDiscountForStatus('regular', settings)).toBe(5);
    expect(getDiscountForStatus('vip', settings)).toBe(10);
  });
});
