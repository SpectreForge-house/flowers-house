# Storage Architecture — Flower's House CRM

## Overview

The application uses **localStorage** as its primary data store. All data operations go through a centralized storage service layer, with React hooks providing reactive state management on top.

```
UI Components
    ↓
hooks / services (useStore.ts, orderService.ts, etc.)
    ↓
storage layer (src/services/storage.ts)
    ↓
localStorage
```

## Storage Version

Current version: **1**

Tracked in `localStorage` key `flower-shop-storage-version`. On startup, `migrateStorageIfNeeded()` checks the stored version and can run future migration logic when the schema changes.

## Storage Keys

All keys are prefixed with `flower-shop-` and managed exclusively through `storage.ts`.

| Key | Type | Description |
|-----|------|-------------|
| `flower-shop-customers` | `Customer[]` | All customers |
| `flower-shop-inventory` | `InventoryItem[]` | All inventory products |
| `flower-shop-bouquets` | `Bouquet[]` | All bouquet definitions |
| `flower-shop-orders` | `Order[]` | All orders |
| `flower-shop-deliveries` | `Delivery[]` | All deliveries (auto-created per order) |
| `flower-shop-transactions` | `InventoryTransaction[]` | All inventory transactions (add/remove/waste) |
| `flower-shop-reservations` | `InventoryReservation[]` | All inventory reservations |
| `flower-shop-history` | `HistoryRecord[]` | Audit log |
| `flower-shop-settings` | `Settings` | Business settings (hours, delivery fee, etc.) |
| `flower-shop-language` | `string` | UI language preference (`en`, `ru`, `bg`) |
| `flower-shop-initialized` | `string` | `"true"` after first run |
| `flower-shop-storage-version` | `string` | Storage schema version number |
| `flower-shop-reminders-read` | `string[]` | IDs of dismissed reminders |

## Persistent Entities

### Customer
- **ID**: `string` (uuid v4)
- **Fields**: `id`, `name`, `phone`, `email?`, `address`, `notes?`, `preferences?`, `createdAt`, `updatedAt`
- **Relationships**: Referenced by `Order.customerId`

### InventoryItem
- **ID**: `string` (uuid v4)
- **Fields**: `id`, `name`, `category`, `color?`, `quantity`, `minStock`, `purchasePrice`, `sellingPrice?`, `unit`, `capacity?`, `capacityUnit?`, `createdAt`, `updatedAt`
- **Relationships**: Referenced by `BouquetItem.inventoryItemId`, `InventoryTransaction.inventoryItemId`, `InventoryReservation.inventoryItemId`

### Bouquet
- **ID**: `string` (uuid v4)
- **Fields**: `id`, `name`, `description?`, `sellingPrice`, `items[]`, `photoUrl?`, `isActive`, `createdAt`, `updatedAt`
- **Contains**: `BouquetItem[]` (each has `inventoryItemId` + `quantity`)
- **Relationships**: Referenced by `OrderItem.bouquetId`

### Order
- **ID**: `string` (`ORD-XXX` sequential format)
- **Fields**: `id`, `customerId`, `customerName`, `customerPhone`, `recipientName`, `recipientPhone?`, `deliveryAddress`, `deliveryDate`, `deliveryTime`, `items[]`, `deliveryFee`, `total`, `comment?`, `status`, `inventoryDeducted`, `createdAt`, `updatedAt`
- **Contains**: `OrderItem[]` (each has `bouquetId`, `quantity`, `price`)
- **Relationships**: References `Customer` by `customerId`, references `Bouquet` via `OrderItem.bouquetId`. Creates a `Delivery` on creation. Has `InventoryReservation` entries.

### Delivery
- **ID**: `string` (uuid v4)
- **Fields**: `id`, `orderId`, `address`, `customerName`, `recipientName`, `phone`, `scheduledTime`, `scheduledDate`, `status`, `notes?`, `createdAt`, `updatedAt`
- **Relationships**: References `Order` by `orderId`

### InventoryTransaction
- **ID**: `string` (uuid v4)
- **Fields**: `id`, `inventoryItemId`, `type` (`add`/`remove`/`waste`), `quantity`, `reason`, `referenceId?`, `createdAt`, `comment?`
- **Relationships**: References `InventoryItem` by `inventoryItemId`. `referenceId` optionally points to an `Order.id`.

### InventoryReservation
- **ID**: `string` (uuid v4)
- **Fields**: `id`, `orderId`, `inventoryItemId`, `quantity`, `status` (`active`/`completed`/`released`), `note?`, `createdAt`, `updatedAt`
- **Relationships**: References `Order` by `orderId`, references `InventoryItem` by `inventoryItemId`

### HistoryRecord
- **ID**: `string` (uuid v4)
- **Fields**: `id`, `timestamp`, `actionType`, `entityType`, `entityId`, `description`, `metadata?`
- **Relationships**: `entityId` is polymorphic — points to the relevant entity's ID based on `entityType`

### Settings
- **ID**: None (singleton object)
- **Fields**: `shopName`, `shopAddress`, `shopPhone`, `shopEmail`, `currency`, `currencySymbol`, `defaultDeliveryFee`, `openingTime`, `closingTime`, `weekendOpeningTime`, `weekendClosingTime`

## Entity Relationship Diagram

```
Customer ←── Order.customerId
Order ←── OrderItem.bouquetId ──→ Bouquet
Order ←── Delivery.orderId
Order ←── InventoryReservation.orderId
Order ←── InventoryTransaction.referenceId (optional)
Bouquet ←── BouquetItem.inventoryItemId ──→ InventoryItem
InventoryReservation ←── InventoryReservation.inventoryItemId ──→ InventoryItem
InventoryTransaction ←── InventoryTransaction.inventoryItemId ──→ InventoryItem
HistoryRecord.entityId ──→ (any entity via entityType)
```

## CRUD Operations

| Entity | Read | Create | Update | Delete | Service |
|--------|------|--------|--------|--------|---------|
| Customers | `getCustomers()` | `addCustomer()` | `updateCustomer()` | `deleteCustomer()` | `storage.ts` |
| Inventory | `getInventory()` | `addInventoryItem()` | `updateInventoryItem()` | `deleteInventoryItem()` | `storage.ts` |
| Bouquets | `getBouquets()` | `addBouquet()` | `updateBouquet()` | `deleteBouquet()` | `storage.ts` |
| Orders | `getOrders()` | `addOrder()` / `createOrder()` | `updateOrder()` / `updateOrderStatus()` | `deleteOrder()` | `storage.ts` + `orderService.ts` |
| Deliveries | `getDeliveries()` | `addDelivery()` | `updateDelivery()` | `deleteDeliveryByOrderId()` | `storage.ts` + `orderService.ts` |
| Transactions | `getTransactions()` | `addTransaction()` | — | `deleteWasteTransaction()` | `storage.ts` + `inventoryService.ts` |
| Reservations | `getReservations()` | `addReservation()` / `createReservation()` | `updateReservation()` | `deleteReservation()` | `storage.ts` + `reservationService.ts` |
| History | `getHistory()` | `addHistory()` / `recordHistory()` | — | `deleteHistoryRecord()` | `storage.ts` + `historyService.ts` |
| Settings | `getSettings()` | — | `updateSettings()` | — | `storage.ts` |
| Language | `getLanguage()` | — | `setLanguage()` | — | `storage.ts` |
| Backup/Restore | `createBackup()` | `restoreBackup()` | — | `resetAllData()` | `storage.ts` |

## React Hooks (useStore.ts)

Hooks wrap storage functions with React state management:

- `useCustomers()` — CRUD for customers
- `useInventory()` — CRUD for inventory items
- `useBouquets()` — CRUD for bouquets
- `useOrders()` — CRUD for orders
- `useDeliveries()` — CRUD for deliveries
- `useTransactions()` — Read-only for transactions
- `useSettings()` — Read/update settings

Each hook loads data from storage on mount and re-reads after mutations.

## Backup & Restore

Backups are exported as JSON files containing all persistent entities plus `language` and `remindersRead`. The `BackupData` interface is exported from `storage.ts`.

Restore clears all keys, writes backup data, sets `initialized: true`, and reloads the page.

## Future Cloud Migration Strategy

When migrating from localStorage to a shared database (e.g., Supabase):

1. **Create a `StorageAdapter` interface** that mirrors the current `storage.ts` API:
   ```ts
   interface StorageAdapter {
     getCustomers(): Customer[];
     addCustomer(c: Customer): void;
     // ... all CRUD methods
     getLanguage(): string;
     setLanguage(lang: string): void;
     createBackup(): BackupData;
     restoreBackup(b: BackupData): void;
     resetAllData(): void;
   }
   ```

2. **Implement `LocalStorageAdapter`** — wraps the current `storage.ts` logic.

3. **Implement `CloudStorageAdapter`** — replaces localStorage calls with Supabase/REST/GraphQL calls.

4. **Swap adapters at initialization** based on configuration or feature flag.

5. **All hooks and services remain unchanged** — they already talk to the storage layer, not localStorage directly.

6. **The `BackupData` type already serves as the migration format** — it contains every persistent entity and can be used for initial data seeding or conflict resolution.

Key design properties that enable clean migration:
- All localStorage access is centralized in `storage.ts`
- All entity relationships use stable string IDs
- No component or service reads/writes localStorage directly
- Storage versioning allows schema evolution
