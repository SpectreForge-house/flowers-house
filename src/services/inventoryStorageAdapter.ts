import { InventoryItem, InventoryTransaction, InventoryReservation } from '../types';

export interface InventoryStorageAdapter {
  getInventory(): InventoryItem[] | Promise<InventoryItem[]>;
  addInventoryItem(item: InventoryItem): void | Promise<void>;
  updateInventoryItem(item: InventoryItem): void | Promise<void>;
  deleteInventoryItem(id: string): void | Promise<void>;
  deleteAllInventory(): void | Promise<void>;
  getItemTransactions(itemId: string): InventoryTransaction[] | Promise<InventoryTransaction[]>;
  addTransaction(transaction: InventoryTransaction): void | Promise<void>;
  getWasteTransactions(): InventoryTransaction[] | Promise<InventoryTransaction[]>;
  deleteWasteTransaction(id: string): void | Promise<void>;
  deleteAllWasteTransactions(): void | Promise<void>;
  getReservations(): InventoryReservation[] | Promise<InventoryReservation[]>;
  addReservation(reservation: InventoryReservation): void | Promise<void>;
  updateReservation(reservation: InventoryReservation): void | Promise<void>;
  deleteReservation(id: string): void | Promise<void>;
  deleteAllReservations(): void | Promise<void>;
}
