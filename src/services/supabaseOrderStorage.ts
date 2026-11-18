import { Order, OrderItem, Delivery, InventoryReservation } from '../types';
import { supabase } from '../lib/supabase';
import { OrderStorageAdapter } from './orderStorageAdapter';
import { getShopId } from './supabaseInventoryStorage';

function rowToOrder(row: Record<string, unknown>, items: OrderItem[]): Order {
  const deliveryAddress = (row.delivery_address as string) || '';
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string,
    recipientName: row.recipient_name as string,
    recipientPhone: (row.recipient_phone as string) || undefined,
    orderType: deliveryAddress ? 'delivery' : 'in_store',
    deliveryAddress,
    deliveryDate: row.delivery_date as string,
    deliveryTime: row.delivery_time as string,
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    comment: (row.comment as string) || undefined,
    status: row.status as Order['status'],
    inventoryDeducted: row.inventory_deducted as boolean,
    items,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToDelivery(row: Record<string, unknown>): Delivery {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    address: row.address as string,
    customerName: row.customer_name as string,
    recipientName: row.recipient_name as string,
    phone: row.phone as string,
    scheduledTime: row.scheduled_time as string,
    scheduledDate: row.scheduled_date as string,
    status: row.status as Delivery['status'],
    notes: (row.notes as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class SupabaseOrderAdapter implements OrderStorageAdapter {
  async getOrders(): Promise<Order[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { data: orderRows, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (orderError) throw new Error(`Failed to load orders: ${orderError.message}`);
    if (!orderRows || orderRows.length === 0) return [];

    const orderIds = orderRows.map(o => o.id);

    const { data: itemRows, error: itemError } = await supabase
      .from('order_items')
      .select('*')
      .in('order_id', orderIds);

    if (itemError) throw new Error(`Failed to load order items: ${itemError.message}`);

    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const row of itemRows || []) {
      const orderId = row.order_id as string;
      if (!itemsByOrder.has(orderId)) itemsByOrder.set(orderId, []);
      itemsByOrder.get(orderId)!.push({
        bouquetId: row.bouquet_id as string,
        quantity: Number(row.quantity),
        price: Number(row.price),
      });
    }

    return orderRows.map(o => rowToOrder(o, itemsByOrder.get(o.id) || []));
  }

  async addOrder(order: Order, delivery?: Delivery, reservations?: InventoryReservation[]): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    // Order, items, delivery and inventory reservations are written in one
    // database transaction, so a failed reservation cannot leave a half-order.
    const { error } = await supabase.rpc('create_order_atomic', {
      p_order: {
        id: order.id,
        customer_id: order.customerId,
        customer_name: order.customerName,
        customer_phone: order.customerPhone,
        recipient_name: order.recipientName,
        recipient_phone: order.recipientPhone || '',
        delivery_address: order.deliveryAddress,
        delivery_date: order.deliveryDate,
        delivery_time: order.deliveryTime,
        delivery_fee: order.deliveryFee,
        total: order.total,
        comment: order.comment || '',
        status: order.status,
        inventory_deducted: order.inventoryDeducted,
        created_at: order.createdAt,
        updated_at: order.updatedAt,
      },
      p_items: order.items.map(item => ({
        bouquet_id: item.bouquetId,
        quantity: item.quantity,
        price: item.price,
      })),
      p_delivery: delivery
        ? {
            id: delivery.id,
            address: delivery.address,
            customer_name: delivery.customerName,
            recipient_name: delivery.recipientName,
            phone: delivery.phone,
            scheduled_time: delivery.scheduledTime,
            scheduled_date: delivery.scheduledDate,
            status: delivery.status,
            notes: delivery.notes || '',
            created_at: delivery.createdAt,
            updated_at: delivery.updatedAt,
          }
        : null,
      p_reservations: (reservations || []).map(reservation => ({
        id: reservation.id,
        inventory_item_id: reservation.inventoryItemId,
        quantity: reservation.quantity,
        note: reservation.note || '',
        created_at: reservation.createdAt,
        updated_at: reservation.updatedAt,
      })),
    });

    if (error) throw new Error(`Failed to add order atomically: ${error.message}`);
  }

  async updateOrder(order: Order): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('orders')
      .update({
        customer_id: order.customerId,
        customer_name: order.customerName,
        customer_phone: order.customerPhone,
        recipient_name: order.recipientName,
        recipient_phone: order.recipientPhone || null,
        delivery_address: order.deliveryAddress,
        delivery_date: order.deliveryDate,
        delivery_time: order.deliveryTime,
        delivery_fee: order.deliveryFee,
        total: order.total,
        comment: order.comment || null,
        status: order.status,
        inventory_deducted: order.inventoryDeducted,
        created_at: order.createdAt,
        updated_at: order.updatedAt,
      })
      .eq('id', order.id);

    if (error) throw new Error(`Failed to update order: ${error.message}`);
  }

  async deleteOrder(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete order: ${error.message}`);
  }

  async getDeliveries(): Promise<Delivery[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { data: rows, error } = await supabase
      .from('deliveries')
      .select('*')
      .eq('shop_id', shopId)
      .order('scheduled_time', { ascending: true });

    if (error) throw new Error(`Failed to load deliveries: ${error.message}`);
    return (rows || []).map(rowToDelivery);
  }

  async addDelivery(delivery: Delivery): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const shopId = await getShopId();
    if (!shopId) throw new Error('Not signed in or profile missing');

    const { error } = await supabase.from('deliveries').insert({
      id: delivery.id,
      shop_id: shopId,
      order_id: delivery.orderId,
      address: delivery.address,
      customer_name: delivery.customerName,
      recipient_name: delivery.recipientName,
      phone: delivery.phone,
      scheduled_time: delivery.scheduledTime,
      scheduled_date: delivery.scheduledDate,
      status: delivery.status,
      notes: delivery.notes || null,
      created_at: delivery.createdAt,
      updated_at: delivery.updatedAt,
    });

    if (error) throw new Error(`Failed to add delivery: ${error.message}`);
  }

  async updateDelivery(delivery: Delivery): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('deliveries')
      .update({
        address: delivery.address,
        customer_name: delivery.customerName,
        recipient_name: delivery.recipientName,
        phone: delivery.phone,
        scheduled_time: delivery.scheduledTime,
        scheduled_date: delivery.scheduledDate,
        status: delivery.status,
        notes: delivery.notes || null,
        updated_at: delivery.updatedAt,
      })
      .eq('id', delivery.id);

    if (error) throw new Error(`Failed to update delivery: ${error.message}`);
  }

  async deleteDeliveryByOrderId(orderId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    // Staff can cancel an order but cannot delete deliveries directly.
    const { error } = await supabase.rpc('delete_delivery_for_cancelled_order', {
      p_order_id: orderId,
    });

    if (error) throw new Error(`Failed to delete delivery: ${error.message}`);
  }

  async generateOrderId(): Promise<string> {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase.rpc('generate_order_id');
    if (error) throw new Error(`Failed to generate order ID: ${error.message}`);
    return data as string;
  }
}
