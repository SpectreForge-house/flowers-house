import { Delivery } from '../types';
import { getDeliveries, saveDeliveries, getOrders, updateOrder } from './storage';
import { completeReservationsForOrder } from './reservationService';
import { OrderStorageAdapter } from './orderStorageAdapter';
import { localDateKey } from '../utils/clock';

export function getTodayDeliveries(): Delivery[] {
  const today = localDateKey(new Date());
  return getDeliveries()
    .filter(d => d.scheduledDate === today)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

export async function updateDeliveryStatus(deliveryId: string, status: Delivery['status'], orderAdapter?: OrderStorageAdapter): Promise<Delivery | null> {
  if (orderAdapter) {
    // Cloud mode
    const deliveries = await orderAdapter.getDeliveries();
    const delivery = deliveries.find(d => d.id === deliveryId);
    if (!delivery) return null;

    delivery.status = status;
    delivery.updatedAt = new Date().toISOString();
    await orderAdapter.updateDelivery(delivery);

    if (status === 'delivered') {
      const orders = await orderAdapter.getOrders();
      const order = orders.find(o => o.id === delivery.orderId);
      if (order && order.status !== 'completed') {
        order.status = 'completed';
        order.updatedAt = new Date().toISOString();
        await orderAdapter.updateOrder(order);
      }
      await completeReservationsForOrder(delivery.orderId);
    }

    return delivery;
  }

  // Local mode
  const deliveries = getDeliveries();
  const delivery = deliveries.find(d => d.id === deliveryId);
  
  if (!delivery) return null;

  delivery.status = status;
  delivery.updatedAt = new Date().toISOString();
  saveDeliveries(deliveries);

  if (status === 'delivered') {
    const orders = getOrders();
    const order = orders.find(o => o.id === delivery.orderId);
    if (order && order.status !== 'completed') {
      order.status = 'completed';
      order.updatedAt = new Date().toISOString();
      updateOrder(order);
    }
    await completeReservationsForOrder(delivery.orderId);
  }

  return delivery;
}

export function getDeliveryStats() {
  const today = localDateKey(new Date());
  const todayDeliveries = getDeliveries().filter(d => d.scheduledDate === today);
  
  return {
    total: todayDeliveries.length,
    waiting: todayDeliveries.filter(d => d.status === 'waiting').length,
    ready: todayDeliveries.filter(d => d.status === 'ready').length,
    outForDelivery: todayDeliveries.filter(d => d.status === 'out_for_delivery').length,
    delivered: todayDeliveries.filter(d => d.status === 'delivered').length,
  };
}

export function getDeliveriesByDate(date: string): Delivery[] {
  return getDeliveries()
    .filter(d => d.scheduledDate === date)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}
