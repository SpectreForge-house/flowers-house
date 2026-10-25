import { Order, OrderItem, Delivery, OrderStatus } from '../types';

export interface OrderStorageAdapter {
  getOrders(): Order[] | Promise<Order[]>;
  addOrder(order: Order): void | Promise<void>;
  updateOrder(order: Order): void | Promise<void>;
  deleteOrder(id: string): void | Promise<void>;

  getDeliveries(): Delivery[] | Promise<Delivery[]>;
  addDelivery(delivery: Delivery): void | Promise<void>;
  updateDelivery(delivery: Delivery): void | Promise<void>;
  deleteDeliveryByOrderId(orderId: string): void | Promise<void>;

  generateOrderId(): string | Promise<string>;
}
