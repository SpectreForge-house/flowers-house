import { ClientPurchase } from '../types';

export interface PurchaseStorageAdapter {
  getPurchases(): Promise<ClientPurchase[]>;
  addPurchase(purchase: ClientPurchase): Promise<void>;
  updatePurchase(purchase: ClientPurchase): Promise<void>;
  deletePurchase(id: string): Promise<void>;
  deletePurchasesByCustomer(customerId: string): Promise<void>;
}
