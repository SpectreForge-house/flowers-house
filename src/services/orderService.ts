import { v4 as uuidv4 } from 'uuid';
import { Order, OrderStatus, Customer, Delivery } from '../types';
import { getOrders, saveOrders, addDelivery, getCustomers, saveCustomers, deleteDeliveryByOrderId, getDeliveries, saveDeliveries } from './storage';
import { releaseReservationsForOrder } from './reservationService';
import { completeReservationsForOrder } from './reservationService';
import { photoOwnerKey, removeOwnerPhotos } from './photoStorage';
import { InventoryStorageAdapter } from './inventoryStorageAdapter';
import { OrderStorageAdapter } from './orderStorageAdapter';

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
): Promise<Order> {
  const now = new Date().toISOString();

  if (orderAdapter) {
    const orderId = await orderAdapter.generateOrderId();

    const order: Order = {
      ...orderData,
      id: orderId,
      inventoryDeducted: false,
      createdAt: now,
      updatedAt: now,
    };

    await orderAdapter.addOrder(order);

    const delivery: Delivery = {
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
    await orderAdapter.addDelivery(delivery);

    return order;
  }

  // Local mode
  const order: Order = {
    ...orderData,
    id: generateOrderId(),
    inventoryDeducted: false,
    createdAt: now,
    updatedAt: now,
  };

  addOrder(order);

  const delivery: Delivery = {
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
  addDelivery(delivery);

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
      await orderAdapter.deleteDeliveryByOrderId(orderId);
      await releaseReservationsForOrder(orderId, adapter);
    }

    if (status === 'completed') {
      const deliveries = await orderAdapter.getDeliveries();
      const delivery = deliveries.find(d => d.orderId === orderId);
      if (delivery) {
        delivery.status = 'delivered';
        delivery.updatedAt = new Date().toISOString();
        await orderAdapter.updateDelivery(delivery);
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
    deleteDeliveryByOrderId(orderId);
    await releaseReservationsForOrder(orderId, adapter);
  }

  if (status === 'completed') {
    // Sync delivery status to 'delivered'
    const deliveries = getDeliveries();
    const delivery = deliveries.find(d => d.orderId === orderId);
    if (delivery) {
      delivery.status = 'delivered';
      delivery.updatedAt = new Date().toISOString();
      saveDeliveries(deliveries);
    }
    // Complete reservations for this order
    await completeReservationsForOrder(orderId, adapter);
  }

  return order;
}

export function getOrderStats(ordersOverride?: Order[]) {
  const orders = ordersOverride ?? getOrders();
  const today = new Date().toISOString().split('T')[0];
  
  const todayOrders = orders.filter(o => o.createdAt.startsWith(today));
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

  const orders = getOrders().filter(o => o.customerId === customerId);
  const completedOrders = orders.filter(o => o.status === 'completed');
  
  customer.updatedAt = new Date().toISOString();
  saveCustomers(customers);
}
