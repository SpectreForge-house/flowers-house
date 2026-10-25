import {
  getOrders,
  getDeliveries,
  getInventory,
  getReservations,
  getReadReminders,
  saveReadReminders,
  getDismissedReminders,
  saveDismissedReminders,
} from './storage';
import { InventoryItem, Order, Delivery, InventoryReservation } from '../types';

export interface Reminder {
  id: string;
  type: 'delivery_today' | 'delivery_tomorrow' | 'low_stock' | 'reservation_problem';
  priority: 'high' | 'medium' | 'low';
  dateTime: string;
  message: string;
  read: boolean;
  entityType: 'order' | 'inventory' | 'reservation';
  entityId: string;
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

function isTomorrow(dateStr: string): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateStr === tomorrow.toISOString().split('T')[0];
}

export function getReminderDismissKey(reminder: Pick<Reminder, 'id' | 'message'>): string {
  return `${reminder.id}|${reminder.message}`;
}

export function generateReminders(
  inventoryOverride?: InventoryItem[],
  ordersOverride?: Order[],
  deliveriesOverride?: Delivery[],
  reservationsOverride?: InventoryReservation[],
  readIdsOverride?: string[],
  dismissedKeysOverride?: string[],
): Reminder[] {
  const orders = ordersOverride ?? getOrders();
  const deliveries = deliveriesOverride ?? getDeliveries();
  const inventory = inventoryOverride ?? getInventory();
  const reservations = reservationsOverride ?? getReservations();
  const readIds = readIdsOverride ?? getReadReminders();
  const dismissedKeys = new Set(dismissedKeysOverride ?? getDismissedReminders());
  const reminders: Reminder[] = [];

  // Delivery reminders
  for (const delivery of deliveries) {
    if (delivery.status === 'delivered') continue;

    if (isToday(delivery.scheduledDate)) {
      const order = orders.find(o => o.id === delivery.orderId);
      reminders.push({
        id: `delivery-today-${delivery.id}`,
        type: 'delivery_today',
        priority: 'high',
        dateTime: delivery.scheduledDate,
        message: `delivery_today|${delivery.scheduledTime}|${order?.id || delivery.orderId}|${delivery.recipientName}`,
        read: readIds.includes(`delivery-today-${delivery.id}`),
        entityType: 'order',
        entityId: delivery.orderId,
      });
    } else if (isTomorrow(delivery.scheduledDate)) {
      const order = orders.find(o => o.id === delivery.orderId);
      reminders.push({
        id: `delivery-tomorrow-${delivery.id}`,
        type: 'delivery_tomorrow',
        priority: 'medium',
        dateTime: delivery.scheduledDate,
        message: `delivery_tomorrow|${delivery.scheduledTime}|${order?.id || delivery.orderId}|${delivery.recipientName}`,
        read: readIds.includes(`delivery-tomorrow-${delivery.id}`),
        entityType: 'order',
        entityId: delivery.orderId,
      });
    }
  }

  // Low stock reminders
  for (const item of inventory) {
    if (item.quantity <= item.minStock) {
      reminders.push({
        id: `low-stock-${item.id}`,
        type: 'low_stock',
        priority: item.quantity === 0 ? 'high' : 'medium',
        dateTime: new Date().toISOString(),
        message: `low_stock|${item.name}|${item.quantity}|${item.unit}`,
        read: readIds.includes(`low-stock-${item.id}`),
        entityType: 'inventory',
        entityId: item.id,
      });
    }
  }

  // Reservation problems
  const activeOrders = orders.filter(o => ['confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(o.status));
  for (const order of activeOrders) {
    const orderReservations = reservations.filter(r => r.orderId === order.id && r.status === 'active');
    for (const res of orderReservations) {
      const item = inventory.find(i => i.id === res.inventoryItemId);
      if (item && item.quantity < res.quantity) {
        reminders.push({
          id: `reservation-problem-${res.id}`,
          type: 'reservation_problem',
          priority: 'high',
          dateTime: new Date().toISOString(),
          message: `reservation_problem|${item.name}|${res.quantity}|${item.quantity}|${order.id}`,
          read: readIds.includes(`reservation-problem-${res.id}`),
          entityType: 'reservation',
          entityId: res.id,
        });
      }
    }
  }

  return reminders
    .filter(reminder => !dismissedKeys.has(getReminderDismissKey(reminder)))
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
    });
}

export function markReminderRead(reminderId: string): void {
  const readIds = getReadReminders();
  if (!readIds.includes(reminderId)) {
    readIds.push(reminderId);
    saveReadReminders(readIds);
  }
}

export function dismissReminder(reminder: Reminder): void {
  const dismissedKeys = getDismissedReminders();
  const key = getReminderDismissKey(reminder);
  if (!dismissedKeys.includes(key)) {
    dismissedKeys.push(key);
    saveDismissedReminders(dismissedKeys);
  }
}

export function markAllRemindersRead(
  ordersOverride?: Order[],
  deliveriesOverride?: Delivery[],
  reservationsOverride?: InventoryReservation[],
): void {
  const reminders = generateReminders(undefined, ordersOverride, deliveriesOverride, reservationsOverride);
  saveReadReminders(reminders.map(r => r.id));
}

export function getUnreadReminderCount(
  ordersOverride?: Order[],
  deliveriesOverride?: Delivery[],
  reservationsOverride?: InventoryReservation[],
): number {
  return generateReminders(undefined, ordersOverride, deliveriesOverride, reservationsOverride).filter(r => !r.read).length;
}
