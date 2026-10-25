import { Bouquet } from '../types';

export interface BouquetStorageAdapter {
  getBouquets(): Bouquet[] | Promise<Bouquet[]>;
  addBouquet(bouquet: Bouquet): void | Promise<void>;
  updateBouquet(bouquet: Bouquet): void | Promise<void>;
  deleteBouquet(id: string): void | Promise<void>;
  deleteAllBouquets(): void | Promise<void>;
}
