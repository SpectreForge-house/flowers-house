import { Customer, InventoryItem, Bouquet, Order, Delivery, InventoryTransaction, Settings } from '../types';

export const sampleCustomers: Customer[] = [
  {
    id: 'cust-1',
    name: 'Ivan Petrov',
    phone: '+359 888 123 456',
    email: 'ivan.petrov@email.com',
    address: 'ul. Vitosha 25, Sofia',
    notes: 'Prefers roses, allergies to lilies',
    preferences: 'Red roses, premium wrapping',
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-09-01T14:30:00Z',
  },
  {
    id: 'cust-2',
    name: 'Maria Georgieva',
    phone: '+359 899 234 567',
    email: 'maria.g@email.com',
    address: 'bul. Bulgaria 100, Sofia',
    notes: 'Regular customer, birthday on March 15',
    preferences: 'Mixed bouquets, pastel colors',
    createdAt: '2025-02-20T11:00:00Z',
    updatedAt: '2025-08-28T09:15:00Z',
  },
  {
    id: 'cust-3',
    name: 'Georgi Dimitrov',
    phone: '+359 878 345 678',
    address: 'ul. Slaveykov 12, Plovdiv',
    notes: 'Corporate orders for office',
    createdAt: '2025-03-10T09:00:00Z',
    updatedAt: '2025-09-05T16:45:00Z',
  },
  {
    id: 'cust-4',
    name: 'Anna Stoyanova',
    phone: '+359 887 456 789',
    email: 'anna.s@email.com',
    address: 'ul. Tsar Osvoboditel 50, Sofia',
    preferences: 'White flowers, elegant arrangements',
    createdAt: '2025-04-05T14:00:00Z',
    updatedAt: '2025-09-08T11:20:00Z',
  },
  {
    id: 'cust-5',
    name: 'Dimitar Kolev',
    phone: '+359 896 567 890',
    address: 'bul. Stefan Stambolov 33, Varna',
    createdAt: '2025-05-12T10:30:00Z',
    updatedAt: '2025-09-10T08:00:00Z',
  },
];

export const sampleInventory: InventoryItem[] = [
  { id: 'inv-1', name: 'Red Rose', category: 'flowers', color: 'Red', quantity: 150, minStock: 30, purchasePrice: 2.50, unit: 'stems', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-10T08:00:00Z' },
  { id: 'inv-2', name: 'White Rose', category: 'flowers', color: 'White', quantity: 80, minStock: 20, purchasePrice: 2.80, unit: 'stems', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-09T14:00:00Z' },
  { id: 'inv-3', name: 'Pink Rose', category: 'flowers', color: 'Pink', quantity: 65, minStock: 20, purchasePrice: 2.60, unit: 'stems', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-10T10:00:00Z' },
  { id: 'inv-4', name: 'Eucalyptus', category: 'greenery', quantity: 120, minStock: 25, purchasePrice: 1.20, unit: 'stems', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-10T07:00:00Z' },
  { id: 'inv-5', name: 'Ruscus', category: 'greenery', quantity: 90, minStock: 20, purchasePrice: 0.90, unit: 'stems', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-09T16:00:00Z' },
  { id: 'inv-6', name: 'Lily White', category: 'flowers', color: 'White', quantity: 40, minStock: 15, purchasePrice: 3.50, unit: 'stems', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-10T09:00:00Z' },
  { id: 'inv-7', name: 'Carnation Pink', category: 'flowers', color: 'Pink', quantity: 100, minStock: 25, purchasePrice: 1.50, unit: 'stems', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-08T11:00:00Z' },
  { id: 'inv-8', name: 'Baby Breath', category: 'fillers', quantity: 50, minStock: 15, purchasePrice: 0.80, unit: 'stems', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-10T06:00:00Z' },
  { id: 'inv-9', name: 'Wrapping Paper - Burgundy', category: 'packaging', quantity: 25, minStock: 10, purchasePrice: 3.00, unit: 'sheets', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-07T15:00:00Z' },
  { id: 'inv-10', name: 'Wrapping Paper - White', category: 'packaging', quantity: 30, minStock: 10, purchasePrice: 3.00, unit: 'sheets', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-09T13:00:00Z' },
  { id: 'inv-11', name: 'Ribbon - Gold', category: 'packaging', quantity: 15, minStock: 5, purchasePrice: 2.50, unit: 'rolls', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-06T10:00:00Z' },
  { id: 'inv-12', name: 'Tulip Red', category: 'flowers', color: 'Red', quantity: 8, minStock: 20, purchasePrice: 2.00, unit: 'stems', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-10T11:00:00Z' },
  { id: 'inv-13', name: 'Glass Vase', category: 'basketsContainers', quantity: 10, minStock: 3, purchasePrice: 5.00, unit: 'pieces', capacity: 2, capacityUnit: 'L', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-10T08:00:00Z' },
  { id: 'inv-14', name: 'Wicker Basket', category: 'basketsContainers', quantity: 8, minStock: 2, purchasePrice: 8.00, unit: 'pieces', capacity: 3, capacityUnit: 'L', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-09-10T08:00:00Z' },
];

export const sampleBouquets: Bouquet[] = [
  {
    id: 'bouq-1',
    name: 'Red Love',
    description: 'Classic romantic bouquet with red roses',
    sellingPrice: 75.00,
    items: [
      { inventoryItemId: 'inv-1', quantity: 10 },
      { inventoryItemId: 'inv-4', quantity: 3 },
      { inventoryItemId: 'inv-9', quantity: 1 },
      { inventoryItemId: 'inv-11', quantity: 1 },
    ],
    isActive: true,
    createdAt: '2025-01-15T10:00:00Z',
    updatedAt: '2025-09-01T14:30:00Z',
  },
  {
    id: 'bouq-2',
    name: 'White Elegance',
    description: 'Pure and elegant white arrangement',
    sellingPrice: 85.00,
    items: [
      { inventoryItemId: 'inv-2', quantity: 12 },
      { inventoryItemId: 'inv-6', quantity: 5 },
      { inventoryItemId: 'inv-5', quantity: 4 },
      { inventoryItemId: 'inv-10', quantity: 1 },
    ],
    isActive: true,
    createdAt: '2025-02-01T09:00:00Z',
    updatedAt: '2025-08-15T11:00:00Z',
  },
  {
    id: 'bouq-3',
    name: 'Pink Dreams',
    description: 'Soft pink roses for every occasion',
    sellingPrice: 65.00,
    items: [
      { inventoryItemId: 'inv-3', quantity: 8 },
      { inventoryItemId: 'inv-7', quantity: 5 },
      { inventoryItemId: 'inv-8', quantity: 4 },
      { inventoryItemId: 'inv-10', quantity: 1 },
    ],
    isActive: true,
    createdAt: '2025-03-01T08:00:00Z',
    updatedAt: '2025-09-05T10:00:00Z',
  },
  {
    id: 'bouq-4',
    name: 'Spring Mix',
    description: 'Colorful seasonal arrangement',
    sellingPrice: 55.00,
    items: [
      { inventoryItemId: 'inv-1', quantity: 5 },
      { inventoryItemId: 'inv-3', quantity: 5 },
      { inventoryItemId: 'inv-7', quantity: 5 },
      { inventoryItemId: 'inv-4', quantity: 3 },
      { inventoryItemId: 'inv-9', quantity: 1 },
    ],
    isActive: true,
    createdAt: '2025-04-01T07:00:00Z',
    updatedAt: '2025-09-08T09:00:00Z',
  },
];

export const sampleOrders: Order[] = [];

export const sampleDeliveries: Delivery[] = [];

export const sampleTransactions: InventoryTransaction[] = [];

export const sampleSettings: Settings = {
  shopName: "Flower's House",
  shopAddress: 'Varna Center-Odessos, 19A Georgi Benkovski St., 9000 Varna',
  shopPhone: '087 828 7207',
  shopEmail: 'FlowersHouse@gmail.com',
  currency: 'EUR',
  currencySymbol: '\u20AC',
  defaultDeliveryFee: 8.00,
  openingTime: '09:00',
  closingTime: '19:00',
  weekendOpeningTime: '10:00',
  weekendClosingTime: '19:00',
};
