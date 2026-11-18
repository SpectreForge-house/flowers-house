import { v4 as uuidv4 } from 'uuid';
import { Order, OrderStatus, Delivery, InventoryReservation } from '../types';
import { getOrders, saveOrders, addDelivery, getCustomers, saveCustomers, deleteDeliveryByOrderId, getDeliveries, saveDeliveries, getReservations, saveReservations } from './storage';
import { createReservation, PendingReservation, releaseReservationsForOrder, completeReservationsForOrder } from './reservationService';
import { photoOwnerKey, removeOwnerPhotos } from './photoStorage';
import { InventoryStorageAdapter } from './inventoryStorageAdapter';
import { OrderStorageAdapter } from './orderStorageAdapter';
import { currentDate, localDateKey } from '../utils/clock';

export function generateOrderId(): string {
  const orders = getOrders();
  const maxNum = orders.reduce((max, order) => {
    const num = parseInt(order.id.replace('ORD-', ''), 10);
    return num > max ? num : max;
  }, 0);
  return `ORD-${String(maxNum + 1).padStart(3, '0')}`;
}

export async function createOrder(
  orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'inventoryDeducted'>,
  orderAdapter?: OrderStorageAdapter,
  pendingReservations: PendingReservation[] = [],
): Promise<Order> {
  const now = new Date().toISOString();
  const orderId = orderAdapter ? await orderAdapter.generateOrderId() : generateOrderId();

  const order: Order = {
    ...orderData,
    id: orderId,
    inventoryDeducted: false,
    createdAt: now,
    updatedAt: now,
  };

  const delivery: Delivery | undefined = order.orderType === 'in_store'
    ? undefined
    : {
        id: uuidv4(),
        orderId: order.id,
        address: order.deliveryAddress,
        customerName: order.customerName,
        recipientName: order.recipientName,
        phone: order.recipientPhone || order.customerPhone,
        scheduledTime: order.deliveryTime,
        scheduledDate: order.deliveryDate,
        status: 'waiting',
        notes: order.comment,
        createdAt: now,
        updatedAt: now,
      };

  if (orderAdapter) {
    const reservations: InventoryReservation[] = pendingReservations.map(reservation => ({
      id: uuidv4(),
      orderId: order.id,
      inventoryItemId: reservation.inventoryItemId,
      quantity: reservation.quantity,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }));

    await orderAdapter.addOrder(order, delivery, reservations);
    return order;
  }

  // Local mode: write the order and delivery first, then reserve stock. If a
  // reservation fails, roll the order and delivery back so the data stays
  // consistent.
  addOrder(order);
  if (delivery) addDelivery(delivery);

  const createdReservationIds: string[] = [];
  for (const pending of pendingReservations) {
    const result = await createReservation(order.id, pending.inventoryItemId, pending.quantity);
    if (!result.success) {
      const created = new Set(createdReservationIds);
      saveReservations(getReservations().filter(r => !created.has(r.id)));
      saveOrders(getOrders().filter(o => o.id !== order.id));
      if (delivery) deleteDeliveryByOrderId(order.id);
      throw new Error(result.error || 'Failed to reserve inventory');
    }
    if (result.reservation) createdReservationIds.push(result.reservation.id);
  }

  return order;
}

export function addOrder(order: Order): void {
  const orders = getOrders();
  orders.push(order);
  saveOrders(orders);
}

/**
 * Deletes an order and everything attached to it: its inventory reservations
 * and its photo files (photos attached to orders live in the photo storage
 * under `order:<id>`; the order record itself never references files).
 * Used by the Orders page and by the client purchase history.
 */
export async function deleteOrderAndCleanup(
  orderId: string,
  orderAdapter: OrderStorageAdapter,
  invAdapter?: InventoryStorageAdapter,
): Promise<void> {
  await orderAdapter.deleteOrder(orderId);
  await releaseReservationsForOrder(orderId, invAdapter);
  await removeOwnerPhotos(photoOwnerKey('order', orderId));
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, adapter?: InventoryStorageAdapter, orderAdapter?: OrderStorageAdapter): Promise<Order | null> {
  if (orderAdapter) {
    // Cloud mode: use adapter to read, update, and handle delivery
    const orders = await orderAdapter.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) return null;

    order.status = status;
    order.updatedAt = new Date().toISOString();
    await orderAdapter.updateOrder(order);

    if (status === 'cancelled') {
      if (order.orderType !== 'in_store') {
        await orderAdapter.deleteDeliveryByOrderId(orderId);
      }
      await releaseReservationsForOrder(orderId, adapter);
    }

    if (status === 'completed') {
      if (order.orderType !== 'in_store') {
        const deliveries = await orderAdapter.getDeliveries();
        const delivery = deliveries.find(d => d.orderId === orderId);
        if (delivery) {
          delivery.status = 'delivered';
          delivery.updatedAt = new Date().toISOString();
          await orderAdapter.updateDelivery(delivery);
        }
      }
      await completeReservationsForOrder(orderId, adapter);
    }

    return order;
  }

  // Local mode: use localStorage
  const orders = getOrders();
  const order = orders.find(o => o.id === orderId);
  
  if (!order) return null;

  order.status = status;
  order.updatedAt = new Date().toISOString();
  saveOrders(orders);

  if (status === 'cancelled') {
    if (order.orderType !== 'in_store') {
      deleteDeliveryByOrderId(orderId);
    }
    await releaseReservationsForOrder(orderId, adapter);
  }

  if (status === 'completed') {
    if (order.orderType !== 'in_store') {
      // Sync delivery status to 'delivered'
      const deliveries = getDeliveries();
      const delivery = deliveries.find(d => d.orderId === orderId);
      if (delivery) {
        delivery.status = 'delivered';
        delivery.updatedAt = new Date().toISOString();
        saveDeliveries(deliveries);
      }
    }
    // Complete reservations for this order
    await completeReservationsForOrder(orderId, adapter);
  }

  return order;
}

/**
 * Changes the date an order is recorded under in the client's purchase
 * history. Orders use `createdAt` as their purchase date, so the caller passes
 * a full ISO timestamp (see `replaceLocalDate`) that keeps the original time
 * of day.
 */
export async function updateOrderPurchaseDate(
  orderId: string,
  createdAt: string,
  orderAdapter: OrderStorageAdapter,
): Promise<Order | null> {
  const orders = await orderAdapter.getOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order) return null;

  order.createdAt = createdAt;
  order.updatedAt = new Date().toISOString();
  await orderAdapter.updateOrder(order);
  return order;
}

export function getOrderStats(ordersOverride?: Order[]) {
  const orders = ordersOverride ?? getOrders();
  const today = localDateKey(currentDate());

  const todayOrders = orders.filter(o => localDateKey(new Date(o.createdAt)) === today);
  const todayRevenue = todayOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  const waitingOrders = orders.filter(o => ['confirmed', 'preparing'].includes(o.status));
  
  return {
    todayOrders: todayOrders.length,
    todayRevenue,
    waitingOrders: waitingOrders.length,
    totalOrders: orders.length,
  };
}

export function searchOrders(query: string, ordersOverride?: Order[]): Order[] {
  const orders = ordersOverride ?? getOrders();
  const lowerQuery = query.toLowerCase();
  
  return orders.filter(o => 
    o.id.toLowerCase().includes(lowerQuery) ||
    o.customerName.toLowerCase().includes(lowerQuery) ||
    o.customerPhone.includes(query) ||
    o.recipientName.toLowerCase().includes(lowerQuery)
  );
}

export function filterOrders(status?: OrderStatus, date?: string, ordersOverride?: Order[]): Order[] {
  let orders = ordersOverride ?? getOrders();
  
  if (status) {
    orders = orders.filter(o => o.status === status);
  }
  
  if (date) {
    orders = orders.filter(o => o.deliveryDate === date);
  }
  
  return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function updateCustomerOrderStats(customerId: string): void {
  const customers = getCustomers();
  const customer = customers.find(c => c.id === customerId);
  if (!customer) return;

  customer.updatedAt = new Date().toISOString();
  saveCustomers(customers);
}
