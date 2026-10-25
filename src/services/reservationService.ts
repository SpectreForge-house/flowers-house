import { v4 as uuidv4 } from 'uuid';
import { InventoryReservation, InventoryItem } from '../types';
import { getReservations, saveReservations, getInventory, saveInventory } from './storage';
import { InventoryStorageAdapter } from './inventoryStorageAdapter';
import { HistoryStorageAdapter } from './historyStorageAdapter';
import { recordHistory } from './historyService';

export async function createReservation(orderId: string, inventoryItemId: string, quantity: number, adapter?: InventoryStorageAdapter, historyAdapter?: HistoryStorageAdapter): Promise<{ success: boolean; error?: string }> {
  const reservations = adapter ? await adapter.getReservations() : getReservations();
  const inventory = adapter ? await adapter.getInventory() : getInventory();
  const item = inventory.find(i => i.id === inventoryItemId);

  if (!item) return { success: false, error: 'Item not found' };

  const activeReserved = reservations
    .filter(r => r.inventoryItemId === inventoryItemId && r.status === 'active')
    .reduce((sum, r) => sum + r.quantity, 0);

  const available = item.quantity - activeReserved;

  if (quantity > available) {
    return { success: false, error: `Insufficient available stock. Available: ${available}, Requested: ${quantity}` };
  }

  const reservation: InventoryReservation = {
    id: uuidv4(),
    orderId,
    inventoryItemId,
    quantity,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (adapter) {
    await adapter.addReservation(reservation);
  } else {
    reservations.push(reservation);
    saveReservations(reservations);
  }

  void recordHistory('reservation_created', 'reservation', reservation.id, `Reservation created for ${item.name}: ${quantity} ${item.unit}`, {
    orderId,
    itemName: item.name,
    quantity,
    unit: item.unit,
  }, historyAdapter);

  return { success: true };
}

export async function releaseReservation(reservationId: string, adapter?: InventoryStorageAdapter, historyAdapter?: HistoryStorageAdapter): Promise<void> {
  const reservations = adapter ? await adapter.getReservations() : getReservations();
  const reservation = reservations.find(r => r.id === reservationId);
  if (!reservation) return;

  reservation.status = 'released';
  reservation.updatedAt = new Date().toISOString();

  if (adapter) {
    await adapter.updateReservation(reservation);
  } else {
    saveReservations(reservations);
  }

  const inventory = adapter ? await adapter.getInventory() : getInventory();
  const item = inventory.find(i => i.id === reservation.inventoryItemId);
  void recordHistory('reservation_released', 'reservation', reservationId, `Reservation released for ${item?.name || 'unknown'}: ${reservation.quantity}`, {
    orderId: reservation.orderId,
    itemName: item?.name || '',
    quantity: reservation.quantity,
  }, historyAdapter);
}

export async function completeReservation(reservationId: string, adapter?: InventoryStorageAdapter, historyAdapter?: HistoryStorageAdapter): Promise<void> {
  const reservations = adapter ? await adapter.getReservations() : getReservations();
  const reservation = reservations.find(r => r.id === reservationId);
  if (!reservation) return;

  reservation.status = 'completed';
  reservation.updatedAt = new Date().toISOString();

  if (adapter) {
    await adapter.updateReservation(reservation);
  } else {
    saveReservations(reservations);
  }

  const inventory = adapter ? await adapter.getInventory() : getInventory();
  const item = inventory.find(i => i.id === reservation.inventoryItemId);
  void recordHistory('reservation_completed', 'reservation', reservationId, `Reservation completed for ${item?.name || 'unknown'}: ${reservation.quantity}`, {
    orderId: reservation.orderId,
    itemName: item?.name || '',
    quantity: reservation.quantity,
  }, historyAdapter);
}

export async function releaseReservationsForOrder(orderId: string, adapter?: InventoryStorageAdapter): Promise<void> {
  const reservations = adapter ? await adapter.getReservations() : getReservations();
  let changed = false;
  for (const r of reservations) {
    if (r.orderId === orderId && r.status === 'active') {
      r.status = 'released';
      r.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    if (adapter) {
      for (const r of reservations.filter(r => r.orderId === orderId && r.status === 'released')) {
        await adapter.updateReservation(r);
      }
    } else {
      saveReservations(reservations);
    }
  }
}

export async function completeReservationsForOrder(orderId: string, adapter?: InventoryStorageAdapter): Promise<void> {
  const reservations = adapter ? await adapter.getReservations() : getReservations();
  let changed = false;
  for (const r of reservations) {
    if (r.orderId === orderId && r.status === 'active') {
      r.status = 'completed';
      r.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    if (adapter) {
      for (const r of reservations.filter(r => r.orderId === orderId && r.status === 'completed')) {
        await adapter.updateReservation(r);
      }
    } else {
      saveReservations(reservations);
    }
  }
}

export async function getReservationsForItem(itemId: string, adapter?: InventoryStorageAdapter): Promise<InventoryReservation[]> {
  const reservations = adapter ? await adapter.getReservations() : getReservations();
  return reservations.filter(r => r.inventoryItemId === itemId && r.status === 'active');
}

export async function getReservedQuantity(itemId: string, adapter?: InventoryStorageAdapter): Promise<number> {
  const reservations = adapter ? await adapter.getReservations() : getReservations();
  return reservations
    .filter(r => r.inventoryItemId === itemId && r.status === 'active')
    .reduce((sum, r) => sum + r.quantity, 0);
}

export async function getAvailableQuantity(item: InventoryItem, adapter?: InventoryStorageAdapter): Promise<number> {
  const reserved = await getReservedQuantity(item.id, adapter);
  return item.quantity - reserved;
}

export async function getReservationsForOrder(orderId: string, adapter?: InventoryStorageAdapter): Promise<InventoryReservation[]> {
  const reservations = adapter ? await adapter.getReservations() : getReservations();
  return reservations.filter(r => r.orderId === orderId);
}
