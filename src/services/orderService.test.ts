import { describe, expect, it, vi } from 'vitest';
import { Order } from '../types';
import { updateOrderPurchaseDate } from './orderService';
import { OrderStorageAdapter } from './orderStorageAdapter';

const baseOrder: Order = {
  id: 'ORD-001',
  orderType: 'delivery',
  customerId: 'customer-1',
  customerName: 'Test Customer',
  customerPhone: '+359 888 000 000',
  recipientName: 'Test Customer',
  deliveryAddress: 'Test address',
  deliveryDate: '2026-11-04',
  deliveryTime: '12:00',
  items: [],
  deliveryFee: 0,
  total: 100,
  status: 'completed',
  inventoryDeducted: true,
  createdAt: '2026-11-04T10:23:45.123Z',
  updatedAt: '2026-11-04T10:23:45.123Z',
};

function makeAdapter(order: Order): OrderStorageAdapter {
  return {
    getOrders: () => [order],
    addOrder: vi.fn(),
    updateOrder: vi.fn(),
    deleteOrder: vi.fn(),
    getDeliveries: () => [],
    addDelivery: vi.fn(),
    updateDelivery: vi.fn(),
    deleteDeliveryByOrderId: vi.fn(),
    generateOrderId: () => 'ORD-002',
  };
}

describe('updateOrderPurchaseDate', () => {
  it('stores the given timestamp and bumps updatedAt', async () => {
    const adapter = makeAdapter({ ...baseOrder });
    const updated = await updateOrderPurchaseDate('ORD-001', '2026-10-01T10:23:45.123Z', adapter);

    expect(updated?.createdAt).toBe('2026-10-01T10:23:45.123Z');
    expect(updated?.updatedAt).not.toBe(baseOrder.updatedAt);
    expect(adapter.updateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ORD-001', createdAt: '2026-10-01T10:23:45.123Z' }),
    );
  });

  it('returns null when the order does not exist', async () => {
    const adapter = makeAdapter({ ...baseOrder });
    const updated = await updateOrderPurchaseDate('ORD-999', '2026-10-01T10:23:45.123Z', adapter);

    expect(updated).toBeNull();
    expect(adapter.updateOrder).not.toHaveBeenCalled();
  });
});
