# Supabase Migration Plan — Flower's House CRM

## 1. Current Architecture Summary

```
UI Components (Pages)
    ↓
React Hooks (useStore.ts: useCustomers, useOrders, etc.)
    ↓
Business Logic Services (orderService, inventoryService, reservationService, historyService, statisticsService)
    ↓
Storage Layer (storage.ts) — ALL localStorage access centralized here
    ↓
localStorage (13 keys, all prefixed "flower-shop-")
```

**Key facts from code inspection:**
- All localStorage access lives in `src/services/storage.ts` — zero direct access in components
- All entity relationships use stable string IDs (uuid v4, except ORD-XXX for orders)
- `BackupData` interface covers all 12 persistent data keys + language + remindersRead
- `STORAGE_VERSION = 1` with `migrateStorageIfNeeded()` on startup
- Business services (orderService, inventoryService, reservationService) orchestrate multi-step operations across entities
- Statistics are computed client-side by reading all data and aggregating

**Files inspected:** `storage.ts`, `useStore.ts`, `types/index.ts`, `orderService.ts`, `inventoryService.ts`, `reservationService.ts`, `historyService.ts`, `statisticsService.ts`, `SettingsPage.tsx`, `i18n/index.tsx`, `App.tsx`, `storage-architecture.md`

---

## 2. Target Architecture

```
Phone / PC (any device)
    ↓
UI Components (unchanged)
    ↓
React Hooks (unchanged)
    ↓
Business Logic Services (minor async changes)
    ↓
StorageAdapter interface (NEW)
    ├── LocalStorageAdapter (current behavior, offline)
    └── SupabaseStorageAdapter (online, cloud sync)
    ↓
Supabase (PostgreSQL + Auth + Realtime)
```

The `StorageAdapter` interface replaces direct `storage.ts` function calls. Both adapters implement the same interface, so the rest of the app does not know which backend is active.

---

## 3. Proposed Supabase Database Schema

### 3.1 `shops` (new — future multi-shop support)

```sql
CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Rationale:** A `shop_id` on every table allows future multi-shop support. For now, all data belongs to one shop. This is a single INSERT during setup and costs nothing.

### 3.2 `customers`

```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY,          -- preserve uuid v4 from localStorage
  shop_id UUID NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT NOT NULL,
  notes TEXT,
  preferences TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_customers_shop ON customers(shop_id);
CREATE INDEX idx_customers_phone ON customers(shop_id, phone);
```

**Why not merge into orders:** Customers are referenced by `customerId` in orders. They exist independently and can have future orders.

### 3.3 `inventory_items`

```sql
CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  color TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_stock NUMERIC(10,2) NOT NULL DEFAULT 0,
  purchase_price NUMERIC(10,2) NOT NULL,
  selling_price NUMERIC(10,2),
  unit TEXT NOT NULL,            -- 'pieces' | 'stems' | 'rolls' | etc.
  capacity NUMERIC(10,2),
  capacity_unit TEXT,            -- 'L' | 'ml'
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_inventory_shop ON inventory_items(shop_id);
CREATE INDEX idx_inventory_category ON inventory_items(shop_id, category);
```

**Why `NUMERIC` for quantity:** Inventory quantities must be exact — no floating point rounding. `NUMERIC(10,2)` handles up to 99,999,999.99 which is more than sufficient.

### 3.4 `bouquets`

```sql
CREATE TABLE bouquets (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  description TEXT,
  selling_price NUMERIC(10,2) NOT NULL,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_bouquets_shop ON bouquets(shop_id);
```

### 3.5 `bouquet_items` (junction table — replaces nested `BouquetItem[]`)

```sql
CREATE TABLE bouquet_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bouquet_id TEXT NOT NULL REFERENCES bouquets(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity NUMERIC(10,2) NOT NULL
);

CREATE INDEX idx_bouquet_items_bouquet ON bouquet_items(bouquet_id);
CREATE INDEX idx_bouquet_items_inv ON bouquet_items(inventory_item_id);
```

**Why a separate table instead of JSONB:**
- Bouquet ingredients are queried when calculating costs (`getInventoryCost`, `calculateBouquetCost`)
- They are joined with `inventory_items` to get `purchasePrice`
- A relational table allows proper FK constraints ensuring referenced inventory items exist
- Querying "which bouquets use inventory item X" becomes trivial with a JOIN
- The current code iterates `bouquet.items` in loops — a separate table with `bouquet_id` filter is equivalent

### 3.6 `orders`

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,          -- ORD-XXX format, preserved
  shop_id UUID NOT NULL REFERENCES shops(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_name TEXT NOT NULL,  -- denormalized for display, matches current code
  customer_phone TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  delivery_address TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  delivery_time TEXT NOT NULL,
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  inventory_deducted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_orders_shop ON orders(shop_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(shop_id, status);
CREATE INDEX idx_orders_date ON orders(shop_id, delivery_date);
CREATE INDEX idx_orders_created ON orders(shop_id, created_at);
```

**Why `customer_name` is denormalized:** The current code stores `customerName` on the order at creation time and displays it directly. If the customer later changes their name, historical orders should still show the name at time of order. This is correct CRM behavior. The FK `customer_id` provides the relationship; `customer_name` is a snapshot.

**Why `delivery_date` is DATE not TEXT:** The current code uses `YYYY-MM-DD` strings. PostgreSQL `DATE` type is natively sortable and indexable, making date-range queries efficient.

### 3.7 `order_items` (junction table — replaces nested `OrderItem[]`)

```sql
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bouquet_id TEXT NOT NULL REFERENCES bouquets(id),
  quantity INTEGER NOT NULL,
  price NUMERIC(10,2) NOT NULL
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
```

**Why a separate table:**
- Same reasoning as bouquet_items — FK constraints ensure referenced bouquets exist
- `price` is captured per-item at order time (snapshot), not looked up dynamically
- Total is computed client-side from items + delivery fee

### 3.8 `deliveries`

```sql
CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_deliveries_shop ON deliveries(shop_id);
CREATE INDEX idx_deliveries_order ON deliveries(order_id);
CREATE INDEX idx_deliveries_date ON deliveries(shop_id, scheduled_date);
```

### 3.9 `inventory_transactions`

```sql
CREATE TABLE inventory_transactions (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  type TEXT NOT NULL,           -- 'add' | 'remove' | 'waste'
  quantity NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,            -- optional: order id, etc.
  created_at TIMESTAMPTZ NOT NULL,
  comment TEXT
);

CREATE INDEX idx_transactions_shop ON inventory_transactions(shop_id);
CREATE INDEX idx_transactions_item ON inventory_transactions(inventory_item_id);
CREATE INDEX idx_transactions_type ON inventory_transactions(shop_id, type);
CREATE INDEX idx_transactions_ref ON inventory_transactions(reference_id) WHERE reference_id IS NOT NULL;
```

**Why `reference_id` is TEXT not FK:** It is polymorphic — can reference an order ID or nothing. Adding a typed column (`order_id UUID REFERENCES orders(id)`) would be cleaner but changes the data model. The TEXT approach preserves current behavior. A future improvement could add `reference_type TEXT` and typed FK columns.

### 3.10 `inventory_reservations`

```sql
CREATE TABLE inventory_reservations (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  order_id TEXT NOT NULL,       -- references orders(id) but no ON DELETE CASCADE because reservations survive cancellation (status='released')
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_reservations_shop ON inventory_reservations(shop_id);
CREATE INDEX idx_reservations_order ON inventory_reservations(order_id);
CREATE INDEX idx_reservations_item ON inventory_reservations(inventory_item_id);
CREATE INDEX idx_reservations_active ON inventory_reservations(shop_id, status) WHERE status = 'active';
```

**Why no ON DELETE CASCADE for order_id:** When an order is cancelled, reservations are set to `released` status, not deleted. The reservation history must be preserved. The application code in `reservationService.ts` manages this lifecycle.

### 3.11 `history`

```sql
CREATE TABLE history (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  timestamp TIMESTAMPTZ NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,      -- polymorphic: references any entity
  description TEXT NOT NULL,
  metadata JSONB               -- flexible key-value store
);

CREATE INDEX idx_history_shop ON history(shop_id);
CREATE INDEX idx_history_entity ON history(shop_id, entity_type, entity_id);
CREATE INDEX idx_history_timestamp ON history(shop_id, timestamp DESC);
CREATE INDEX idx_history_action ON history(shop_id, action_type);
```

**Why `metadata` is JSONB:** The current code uses `Record<string, string | number | boolean>` — an unstructured map. JSONB is the natural PostgreSQL equivalent. It allows querying specific keys if needed (`metadata->>'orderId'`) without rigid schema.

### 3.12 `settings`

```sql
CREATE TABLE settings (
  shop_id UUID PRIMARY KEY REFERENCES shops(id),
  shop_name TEXT NOT NULL DEFAULT 'Flower''s House',
  shop_address TEXT,
  shop_phone TEXT,
  shop_email TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  currency_symbol TEXT NOT NULL DEFAULT '€',
  default_delivery_fee NUMERIC(10,2) DEFAULT 0,
  opening_time TEXT NOT NULL DEFAULT '09:00',
  closing_time TEXT NOT NULL DEFAULT '19:00',
  weekend_opening_time TEXT NOT NULL DEFAULT '10:00',
  weekend_closing_time TEXT NOT NULL DEFAULT '19:00'
);
```

**Why `shop_id` is PK:** Settings is a singleton per shop. One row per shop, enforced by PK.

### 3.13 `user_profiles` (new — for auth)

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id),
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff',  -- 'owner' | 'manager' | 'staff'
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_shop ON user_profiles(shop_id);
```

### 3.14 `user_reminders_read` (new — per-user reminder state)

```sql
CREATE TABLE user_reminders_read (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reminder_id)
);
```

**Why per-user instead of global:** In the current localStorage model, `remindersRead` is per-device. In a shared system, it should be per-user — each staff member dismisses their own reminders.

### 3.15 Storage version (new table)

```sql
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Stores `storage_version` as a row. Allows future migrations to check the schema version server-side.

---

## 4. Entity Relationship Diagram

```
shops (1) ──── (N) customers
shops (1) ──── (N) inventory_items
shops (1) ──── (N) bouquets
shops (1) ──── (N) orders
shops (1) ──── (N) deliveries
shops (1) ──── (N) inventory_transactions
shops (1) ──── (N) inventory_reservations
shops (1) ──── (N) history
shops (1) ───── (1) settings
shops (1) ──── (N) user_profiles

customers (1) ──── (N) orders
orders (1) ──── (N) order_items
orders (1) ──── (N) deliveries
orders (1) ──── (N) inventory_reservations
orders (1) ──── (N) inventory_transactions (via reference_id, optional)

bouquets (1) ──── (N) bouquet_items
bouquets (1) ──── (N) order_items

inventory_items (1) ──── (N) bouquet_items
inventory_items (1) ──── (N) inventory_transactions
inventory_items (1) ──── (N) inventory_reservations

auth.users (1) ──── (1) user_profiles
auth.users (1) ──── (N) user_reminders_read
```

---

## 5. Nested Array Analysis

### BouquetItem[] inside Bouquet → **Separate table `bouquet_items`**

| Decision | Reason |
|----------|--------|
| Separate table | Ingredients are queried for cost calculation, joined with inventory_items for prices, and need FK constraints to ensure referenced items exist |

### OrderItem[] inside Order → **Separate table `order_items`**

| Decision | Reason |
|----------|--------|
| Separate table | Items are joined with bouquets for display, counted for statistics (`getPopularBouquets`), and need FK constraints. Price is snapshotted per-item at order time |

### HistoryRecord.metadata → **JSONB column**

| Decision | Reason |
|----------|--------|
| JSONB | The metadata is an unstructured map (`Record<string, string | number | boolean>`) with varying keys per action type. No FK constraints needed. JSONB allows ad-hoc queries |

### Everything else → **Flat columns**

All other entities have flat scalar fields. No nested arrays remain after extracting `bouquet_items` and `order_items`.

---

## 6. StorageAdapter Architecture

### 6.1 Interface Definition

```ts
// src/services/types/StorageAdapter.ts

interface StorageAdapter {
  // Initialization
  initialize(): Promise<void>;
  migrateStorageIfNeeded(): Promise<void>;

  // Customers
  getCustomers(): Promise<Customer[]>;
  addCustomer(customer: Customer): Promise<void>;
  updateCustomer(customer: Customer): Promise<void>;
  deleteCustomer(id: string): Promise<void>;
  deleteAllCustomers(): Promise<void>;

  // Inventory
  getInventory(): Promise<InventoryItem[]>;
  addInventoryItem(item: InventoryItem): Promise<void>;
  updateInventoryItem(item: InventoryItem): Promise<void>;
  deleteInventoryItem(id: string): Promise<void>;
  deleteAllInventory(): Promise<void>;

  // Bouquets
  getBouquets(): Promise<Bouquet[]>;
  addBouquet(bouquet: Bouquet): Promise<void>;
  updateBouquet(bouquet: Bouquet): Promise<void>;
  deleteBouquet(id: string): Promise<void>;
  deleteAllBouquets(): Promise<void>;

  // Orders
  getOrders(): Promise<Order[]>;
  addOrder(order: Order): Promise<void>;
  updateOrder(order: Order): Promise<void>;
  deleteOrder(id: string): Promise<void>;

  // Deliveries
  getDeliveries(): Promise<Delivery[]>;
  addDelivery(delivery: Delivery): Promise<void>;
  updateDelivery(delivery: Delivery): Promise<void>;
  deleteDeliveryByOrderId(orderId: string): Promise<void>;

  // Transactions
  getTransactions(): Promise<InventoryTransaction[]>;
  addTransaction(transaction: InventoryTransaction): Promise<void>;
  deleteWasteTransaction(id: string): Promise<void>;
  deleteAllWasteTransactions(): Promise<void>;

  // Reservations
  getReservations(): Promise<InventoryReservation[]>;
  addReservation(reservation: InventoryReservation): Promise<void>;
  updateReservation(reservation: InventoryReservation): Promise<void>;
  deleteReservation(id: string): Promise<void>;
  deleteAllReservations(): Promise<void>;

  // History
  getHistory(): Promise<HistoryRecord[]>;
  addHistory(record: HistoryRecord): Promise<void>;
  saveHistory(records: HistoryRecord[]): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(settings: Settings): Promise<void>;

  // Language (per-user preference)
  getLanguage(): Promise<string>;
  setLanguage(lang: string): Promise<void>;

  // Reminders (per-user)
  getReadReminders(): Promise<string[]>;
  saveReadReminders(ids: string[]): Promise<void>;

  // Backup/Restore
  createBackup(): Promise<BackupData>;
  restoreBackup(backup: BackupData): Promise<void>;
  resetAllData(): Promise<void>;
}
```

### 6.2 Why `async`?

The current `storage.ts` functions are synchronous because localStorage is synchronous. Supabase calls are inherently async (network requests). Making the interface async from the start means:
- `LocalStorageAdapter` wraps synchronous calls in `Promise.resolve()` — zero overhead
- `SupabaseStorageAdapter` uses real async Supabase client calls
- All consumers (hooks, services) already exist and just need `await` added

### 6.3 Implementation Plan

```
src/services/
  adapters/
    StorageAdapter.ts          (interface)
    LocalStorageAdapter.ts     (wraps current storage.ts logic)
    SupabaseStorageAdapter.ts  (Supabase client calls)
    adapterFactory.ts          (returns correct adapter based on config)
```

**adapterFactory.ts** selects the adapter:
```ts
export function createStorageAdapter(): StorageAdapter {
  if (supabaseConfigured()) {
    return new SupabaseStorageAdapter();
  }
  return new LocalStorageAdapter();
}
```

### 6.4 Migration Path

1. Add the interface — zero behavior change
2. Move current `storage.ts` logic into `LocalStorageAdapter`
3. Make hooks call `adapter.getCustomers()` instead of `storage.getCustomers()`
4. Verify everything works identically
5. Implement `SupabaseStorageAdapter` incrementally
6. Add feature flag to switch adapters

---

## 7. Authentication Plan

### 7.1 Recommended Model: Email/Password via Supabase Auth

**Why email/password (not magic link):**
- Flower shop staff are repeat users who log in daily
- Magic link requires checking email each time — impractical for daily use
- Email/password is the simplest model for a small team
- Supabase Auth handles it natively with zero infrastructure

### 7.2 User Roles

| Role | Permissions |
|------|-------------|
| `owner` | Full access: CRUD everything, manage users, view statistics, backup/restore |
| `manager` | Full CRUD, view statistics. Cannot manage users |
| `staff` | Create/edit orders, record inventory transactions, view history. Cannot delete customers, view financial statistics, or backup/restore |

### 7.3 Authentication Flow

1. App loads → check `supabase.auth.getSession()`
2. No session → show login screen (email + password)
3. Has session → load user profile from `user_profiles` → get `shop_id` → initialize adapter with `shop_id`
4. All subsequent queries are scoped to `shop_id`

### 7.4 Initial Setup

Owner account is created during Supabase project setup (via SQL or dashboard). Owner invites staff via email from the Settings page. Supabase sends invite emails automatically.

---

## 8. Row Level Security (RLS) Plan

### 8.1 Principle

Every table (except `shops` and `app_meta`) has RLS enabled. No anonymous access. No unauthenticated reads.

### 8.2 Policy Structure

**Authenticated users see only their shop's data:**

```sql
-- Example: customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own shop customers"
  ON customers FOR SELECT
  USING (
    shop_id = (
      SELECT shop_id FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert into own shop"
  ON customers FOR INSERT
  WITH CHECK (
    shop_id = (
      SELECT shop_id FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own shop customers"
  ON customers FOR UPDATE
  USING (
    shop_id = (
      SELECT shop_id FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete from own shop"
  ON customers FOR DELETE
  USING (
    shop_id = (
      SELECT shop_id FROM user_profiles
      WHERE id = auth.uid()
    )
  );
```

**Same pattern for all data tables:** `inventory_items`, `bouquets`, `bouquet_items`, `orders`, `order_items`, `deliveries`, `inventory_transactions`, `inventory_reservations`, `history`, `settings`.

### 8.3 Role-Based Restrictions

For sensitive operations, add role checks:

```sql
-- Only owner/manager can delete customers
CREATE POLICY "Only managers can delete customers"
  ON customers FOR DELETE
  USING (
    shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );
```

### 8.4 What Each Role Can Do

| Operation | owner | manager | staff |
|-----------|-------|---------|-------|
| Read all shop data | Yes | Yes | Yes |
| Create orders | Yes | Yes | Yes |
| Edit orders | Yes | Yes | Yes |
| Delete orders | Yes | Yes | No |
| View statistics | Yes | Yes | No |
| Manage inventory | Yes | Yes | Yes |
| Delete inventory items | Yes | Yes | No |
| Manage bouquets | Yes | Yes | Yes |
| Delete bouquets | Yes | Yes | No |
| View history | Yes | Yes | Yes |
| Delete history | Yes | Yes | No |
| Backup/restore | Yes | Yes | No |
| Manage users | Yes | No | No |
| Edit settings | Yes | Yes | No |

### 8.5 `shops` and `app_meta` Access

These system tables are only readable by authenticated users who have a profile:

```sql
CREATE POLICY "Authenticated users can read shops"
  ON shops FOR SELECT
  USING (
    id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  );
```

---

## 9. Realtime Analysis

### 9.1 Which Entities Benefit from Realtime?

| Entity | Realtime needed? | Why |
|--------|-----------------|-----|
| `orders` | **Yes** | Status changes (new → preparing → ready) should appear on PC immediately when set on phone |
| `deliveries` | **Yes** | Delivery status updates are time-sensitive |
| `inventory_items` | **Yes** | Stock level changes should be visible immediately to prevent overselling |
| `inventory_reservations` | **Yes** | New reservations affect available stock in real-time |
| `customers` | No | Customer changes are rare and not time-critical |
| `bouquets` | No | Bouquet edits are admin work, not real-time |
| `inventory_transactions` | No | Append-only audit log, no conflict risk |
| `history` | No | Append-only audit log |
| `settings` | No | Changed rarely, not time-critical |

### 9.2 Supabase Realtime Implementation

```ts
// Subscribe to order changes
supabase
  .channel('orders')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'orders',
    filter: `shop_id=eq.${shopId}`
  }, (payload) => {
    // Update local state
    refreshOrders();
  })
  .subscribe();
```

### 9.3 Deduplication

When a device makes a change, it should not re-process its own change from Realtime. Add a local `lastSyncedAt` timestamp and ignore Realtime events with `updated_at` older than `lastSyncedAt`.

---

## 10. Offline Strategy

### 10.1 Phase 1: Graceful Degradation (Minimal)

When offline:
- App continues working with last-known data in localStorage
- Show a subtle "Offline — changes sync when connected" banner
- Queue write operations locally
- On reconnect, flush the queue to Supabase

### 10.2 Phase 2: Service Worker Cache

The current PWA already caches assets via workbox. Extend to:
- Cache API responses for read-heavy entities (inventory, bouquets, settings)
- Serve cached data when offline
- Show stale data with an "offline" indicator

### 10.3 Conflict Resolution Strategy

For this small business CRM, the simplest strategy is **last-write-wins with timestamps**:

1. Every entity has `updated_at`
2. On write conflict, compare `updated_at`
3. The newer write wins
4. Show a non-blocking notification: "Conflict resolved: order ORD-005 was updated on another device"

**Why last-write-wins is sufficient:**
- This is a small shop, not a distributed system
- Two people editing the exact same record simultaneously is rare
- Financial data (orders) is append-mostly — status changes are the only edits
- Inventory is the main conflict risk, addressed below

### 10.4 Inventory-Specific Safety

Inventory is financially critical. The strategy:

1. **Optimistic locking:** Every inventory write sends `WHERE updated_at = $expected`
2. If the row was modified since read, Supabase returns 0 rows affected
3. On conflict: re-read current stock, show the user the new value, ask them to re-enter
4. This prevents accidental double-deduction

### 10.5 Preventing Duplicate Orders

Each order has a client-generated ID (`ORD-XXX`). Before creating:
1. Check if an order with that ID already exists
2. If yes, skip creation (idempotent)
3. The sequential ID generation uses `MAX(id)` which is safe in Supabase with a transaction

### 10.6 Preventing Duplicate Transactions

Inventory transactions are append-only with UUID IDs. Duplicate detection:
1. Client generates UUID before sending
2. Supabase `INSERT` with `ON CONFLICT DO NOTHING`
3. If the same UUID exists, it's a no-op

---

## 11. Data Migration Strategy

### 11.1 Process

```
localStorage on device
  ↓
createBackup() (already implemented)
  ↓
BackupData JSON file
  ↓
Migration script (Node.js / browser console)
  ↓
Transform & validate
  ↓
Supabase batch INSERT
  ↓
Verify counts + spot-check
```

### 11.2 ID Preservation

All existing IDs are preserved exactly as-is:
- `uuid v4` strings → `TEXT PRIMARY KEY`
- `ORD-XXX` strings → `TEXT PRIMARY KEY`

This means existing localStorage data and Supabase data can coexist during migration. No ID regeneration.

### 11.3 Transformation Rules

| Field | localStorage | Supabase |
|-------|-------------|----------|
| `createdAt` | ISO string `"2025-01-15T10:30:00.000Z"` | `TIMESTAMPTZ` — PostgreSQL parses ISO strings directly |
| `deliveryDate` | `"2025-01-15"` | `DATE` — PostgreSQL parses `YYYY-MM-DD` directly |
| `quantity` | number | `NUMERIC` — JavaScript number → numeric is lossless for our values |
| `metadata` | JS object | `JSONB` — `JSON.stringify()` then let Supabase parse |
| `items[]` | nested array | Extracted into junction tables with parent ID |

### 11.4 Migration Script Pseudocode

```ts
async function migrateToDevice(backup: BackupData, supabase: SupabaseClient) {
  const shopId = await createOrGetShop();

  // 1. Settings first (no dependencies)
  await supabase.from('settings').upsert({ shop_id: shopId, ...backup.settings });

  // 2. Customers (no dependencies)
  await supabase.from('customers').insert(
    backup.customers.map(c => ({ ...c, shop_id: shopId }))
  );

  // 3. Inventory items (no dependencies)
  await supabase.from('inventory_items').insert(
    backup.inventory.map(i => ({ ...i, shop_id: shopId }))
  );

  // 4. Bouquets (no dependencies on other entities)
  await supabase.from('bouquets').insert(
    backup.bouquets.map(b => ({ id: b.id, shop_id: shopId, name: b.name, ... }))
  );

  // 5. Bouquet items (depends on bouquets + inventory_items)
  const bouquetItems = backup.bouquets.flatMap(b =>
    b.items.map(item => ({
      bouquet_id: b.id,
      inventory_item_id: item.inventoryItemId,
      quantity: item.quantity
    }))
  );
  await supabase.from('bouquet_items').insert(bouquetItems);

  // 6. Orders (depends on customers)
  await supabase.from('orders').insert(
    backup.orders.map(o => ({ ...o, shop_id: shopId, delivery_date: o.deliveryDate, ... }))
  );

  // 7. Order items (depends on orders + bouquets)
  const orderItems = backup.orders.flatMap(o =>
    o.items.map(item => ({
      order_id: o.id,
      bouquet_id: item.bouquetId,
      quantity: item.quantity,
      price: item.price
    }))
  );
  await supabase.from('order_items').insert(orderItems);

  // 8. Deliveries (depends on orders)
  await supabase.from('deliveries').insert(
    backup.deliveries.map(d => ({ ...d, shop_id: shopId, scheduled_date: d.scheduledDate, ... }))
  );

  // 9. Transactions (depends on inventory_items)
  await supabase.from('inventory_transactions').insert(
    backup.transactions.map(t => ({ ...t, shop_id: shopId, inventory_item_id: t.inventoryItemId, ... }))
  );

  // 10. Reservations (depends on orders + inventory_items)
  await supabase.from('inventory_reservations').insert(
    backup.reservations.map(r => ({ ...r, shop_id: shopId, order_id: r.orderId, inventory_item_id: r.inventoryItemId, ... }))
  );

  // 11. History
  await supabase.from('history').insert(
    backup.history.map(h => ({ ...h, shop_id: shopId, action_type: h.actionType, entity_type: h.entityType, entity_id: h.entityId, ... }))
  );
}
```

### 11.5 Verification

After migration:
1. Count rows in each Supabase table vs BackupData array lengths
2. Spot-check 5 random orders: total, status, items count
3. Spot-check 5 random inventory items: quantity, price
4. Verify no orphaned foreign keys
5. Test creating one new order on the phone → appears on PC

---

## 12. Inventory Safety Analysis

### 12.1 Current Inventory Flow

```
User adds stock → addStock() → quantity += N → transaction(type='add')
User removes stock → removeStock() → quantity -= N → transaction(type='remove')
Order created → deductInventoryForOrder() → quantity -= (bouquet ingredients × qty) → transaction(type='remove')
Order cancelled → releaseReservationsForOrder() → reservation.status = 'released' (stock NOT restored)
Waste recorded → recordWaste() → quantity -= N → transaction(type='waste')
```

### 12.2 Critical Safety Points

1. **`inventoryDeducted` flag on Order:** Prevents double-deduction. Once deducted, the flag is `true` and subsequent calls return early.

2. **Available quantity calculation:** `available = item.quantity - reservedQuantity`. Reservations reduce available stock without changing `quantity`. This prevents two orders from claiming the same stock.

3. **Transaction audit trail:** Every quantity change creates a transaction record. The sum of all `add` transactions minus sum of all `remove` + `waste` transactions should equal `item.quantity`. This is verifiable.

### 12.3 Supabase Safeguards

1. **Database-level constraint:** `CHECK (quantity >= 0)` on `inventory_items.quantity` — prevents negative stock at the database level.

2. **Atomic deduction:** Use a Supabase RPC function:
   ```sql
   CREATE OR REPLACE FUNCTION deduct_inventory(
     p_order_id TEXT,
     p_items JSONB
   ) RETURNS BOOLEAN AS $$
   DECLARE
     item JSONB;
     inv RECORD;
   BEGIN
     FOR item IN SELECT * FROM jsonb_array_elements(p_items)
     LOOP
       SELECT * INTO inv FROM inventory_items
       WHERE id = item->>'inventory_item_id'
       FOR UPDATE;  -- row-level lock

       IF inv.quantity < (item->>'quantity')::numeric THEN
         RAISE EXCEPTION 'Insufficient stock for %', inv.name;
       END IF;

       UPDATE inventory_items
       SET quantity = quantity - (item->>'quantity')::numeric,
           updated_at = now()
       WHERE id = item->>'inventory_item_id';

       INSERT INTO inventory_transactions (id, shop_id, inventory_item_id, type, quantity, reason, reference_id, created_at)
       VALUES (gen_random_uuid(), inv.shop_id, item->>'inventory_item_id', 'remove', (item->>'quantity')::numeric, 'Order ' || p_order_id, p_order_id, now());
     END LOOP;

     UPDATE orders SET inventory_deducted = true, updated_at = now() WHERE id = p_order_id;
     RETURN TRUE;
   END;
   $$ LANGUAGE plpgsql;
   ```

   This ensures atomic deduction — either all items are deducted or none, with row-level locking preventing race conditions.

3. **Optimistic locking on updates:** When the client updates `inventory_items.quantity`, it sends `WHERE updated_at = $expected`. If another device modified it first, 0 rows are updated, and the client re-reads.

---

## 13. Order/Financial Data Safety

### 13.1 Immutable Fields After Completion

Once an order status is `completed`:
- `total` should not change
- `items` should not change
- `inventoryDeducted` is `true` and should not change

The Supabase adapter should enforce this at the service level (not just UI):

```ts
async updateOrder(order: Order): Promise<void> {
  const existing = await this.getOrder(order.id);
  if (existing.status === 'completed' && existing.status !== order.status) {
    throw new Error('Cannot modify a completed order');
  }
  // proceed with update
}
```

### 13.2 Financial Records

- **Order total** is snapshotted at creation time (items × prices + delivery fee)
- **Bouquet selling price** is snapshotted on each `OrderItem.price`
- **Inventory purchase price** is used for cost calculations but NOT for order totals
- **Statistics** compute revenue from order totals, cost from current inventory prices

This means historical profit margins may differ from current margins if inventory prices change. This is correct behavior — the actual cost at time of sale is what matters, but we currently use current prices as an approximation.

### 13.3 Audit Trail

Every state change is recorded in `history`:
- `order_created`, `order_edited`, `order_status_changed`, `order_cancelled`
- `inventory_received`, `inventory_decreased`, `inventory_waste`
- `reservation_created`, `reservation_released`, `reservation_completed`

The `history` table is append-only in practice (can be cleared by time period but individual records are not edited).

---

## 14. Risks & Mitigations

### Risk 1: Syncing Business Logic to Supabase RPCs

| | |
|---|---|
| **What** | Current business logic (deductInventoryForOrder, createOrder, etc.) is in TypeScript services that orchestrate multiple localStorage writes. In Supabase, some of these need to become database functions or careful multi-step client operations. |
| **Why it matters** | If the logic is split between client and server, bugs can appear. For example, creating an order + delivery + reservation must be atomic. |
| **Solution** | Use Supabase RPC functions for multi-step operations (deductInventory, createOrder). The TypeScript services call the RPC instead of multiple individual writes. |

### Risk 2: ORD-XXX Sequential IDs

| | |
|---|---|
| **What** | Order IDs are generated client-side by finding the current MAX and incrementing. In a multi-device setup, two devices could generate the same ID simultaneously. |
| **Why it matters** | Duplicate order IDs would corrupt data. |
| **Solution** | Option A: Use a PostgreSQL sequence (`CREATE SEQUENCE order_seq`). Option B: Use UUIDs for orders (breaking change). Option C: Generate IDs server-side in an RPC. Recommended: Option A — preserve ORD-XXX format with a server-side sequence. |

### Risk 3: Bouquet photoUrl as base64 in localStorage

| | |
|---|---|
| **What** | `bouquet.photoUrl` stores a base64 data URL. These can be large (100KB+). |
| **Why it matters** | Supabase `TEXT` columns can hold this, but it bloats every query. Realtime subscriptions would be slow. |
| **Solution** | Migrate photos to Supabase Storage (S3-compatible). Store the public URL in `photo_url`. This is a Phase 2 improvement after core migration. |

### Risk 4: Realtime Subscription Overhead

| | |
|---|---|
| **What** | Subscribing to all order + inventory changes on every device. |
| **Why it matters** | With many concurrent users (unlikely for a small shop), subscription overhead grows. |
| **Solution** | Filter subscriptions by `shop_id`. For a single shop, this is fine. If scaling to multiple shops, add per-page subscriptions. |

### Risk 5: `initialized` Flag Behavior

| | |
|---|---|
| **What** | Currently, `initializeData()` loads sample data on first visit and sets `initialized=true`. |
| **Why it matters** | With Supabase, this flag is irrelevant — data lives in the cloud. But during migration, we must not overwrite real cloud data with sample data. |
| **Solution** | `SupabaseStorageAdapter.initialize()` checks if the shop already has data in Supabase. If yes, skip. If no, seed from sample data or skip entirely (data comes from migration). |

### Risk 6: Migration Order Dependencies

| | |
|---|---|
| **What** | Tables have FK constraints. Inserting orders before customers fails. |
| **Why it matters** | The migration script must insert in dependency order. |
| **Solution** | Fixed insertion order: shops → settings → customers → inventory_items → bouquets → bouquet_items → orders → order_items → deliveries → transactions → reservations → history. |

### Risk 7: ID Format for Order IDs During Migration

| | |
|---|---|
| **What** | `ORD-XXX` IDs must not conflict with new orders created after migration. |
| **Why it matters** | If the sequence starts at 1 and existing data has ORD-150, new orders could collide. |
| **Solution** | Initialize the PostgreSQL sequence to `MAX(existing order number) + 1` after migration. |

---

## 15. Phased Migration Roadmap

### Phase 0 — Current State (DONE)
- All localStorage access centralized in `storage.ts`
- Stable IDs, backup/restore, storage versioning
- `docs/storage-architecture.md` exists
- `tsc` and `vite build` pass

### Phase 1 — Supabase Project + Schema
- Create Supabase project
- Run all CREATE TABLE migrations
- Create `shops` table with one seed row
- Create `app_meta` table with `storage_version = 1`
- Enable RLS on all tables
- **No application code changes**

### Phase 2 — StorageAdapter Interface
- Define `StorageAdapter` interface
- Move current `storage.ts` logic into `LocalStorageAdapter`
- Create `adapterFactory.ts`
- Update `useStore.ts` and services to use adapter
- Verify: all tests pass, app works identically
- **No visual changes, no behavior changes**

### Phase 3 — Authentication
- Add Supabase Auth (email/password)
- Create `user_profiles` table
- Add login screen
- Create `user_reminders_read` table
- Migrate language preference to per-user
- **Only adds login screen; all existing data remains in localStorage**

### Phase 4 — Migrate One Simple Entity
- Implement `SupabaseStorageAdapter` for `customers` only
- Feature flag: `USE_CLOUD = false` by default
- Test: create/edit/delete customer with `USE_CLOUD=true`
- **All other entities still use localStorage**

### Phase 5 — Migrate Remaining Entities
- Implement all CRUD methods in `SupabaseStorageAdapter`
- Add RPC functions for multi-step operations (deductInventory, createOrder)
- Add `shop_id` to all adapter methods
- Test each entity individually

### Phase 6 — Existing Data Migration
- Build migration script (reads BackupData, writes to Supabase)
- Run on each device that has existing data
- Verify row counts, spot-check data
- Initialize order sequence from max existing order number
- **One-time operation per device**

### Phase 7 — Phone/PC Testing
- Both devices connected to same Supabase
- Create order on phone → verify on PC
- Change inventory on PC → verify on phone
- Test offline → reconnect → sync
- Test backup/restore still works (now exports from Supabase)

### Phase 8 — Realtime
- Enable Supabase Realtime for `orders`, `deliveries`, `inventory_items`, `inventory_reservations`
- Add subscription management in adapter
- Add deduplication (ignore own changes)
- **Only subscribes to needed tables, filtered by shop_id**

### Phase 9 — Offline Improvements
- Add offline detection banner
- Queue writes when offline
- Flush queue on reconnect
- Add optimistic locking for inventory
- Add conflict resolution UI (if needed)
- Migrate photos to Supabase Storage

### Phase 10 — Polish
- Remove localStorage fallback (optional — keep as offline backup)
- Remove feature flags
- Performance testing with realistic data volume
- Security audit

---

## 16. Summary of Architectural Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Schema approach | Separate tables for junction arrays | FK constraints, queryability, data integrity |
| ID preservation | Keep all existing IDs as TEXT | Zero-downtime migration, no data loss |
| Order IDs | Server-side sequence (ORD-XXX) | Prevents duplicates in multi-device |
| Settings | Singleton per shop (shop_id = PK) | Natural fit, one row per shop |
| Language | Per-user in `user_profiles` | Each user chooses their language |
| Reminders | Per-user in `user_reminders_read` | Each user dismisses their own |
| History metadata | JSONB | Flexible unstructured map, matches current usage |
| Inventory safety | Database-level CHECK + atomic RPC | Prevents double-deduction and negative stock |
| Realtime | Orders + deliveries + inventory only | Only time-critical entities need it |
| Offline | localStorage as local cache | Preserves current offline capability |
| Auth | Email/password | Simple, practical for daily shop use |
| RLS | shop_id scoping on every table | Prevents cross-shop data leaks |
| Multi-step ops | Supabase RPC functions | Atomicity for order creation, inventory deduction |
| Photos | Supabase Storage (Phase 2) | Avoids bloating queries and realtime payloads |

---

## 17. Files Inspected

| File | Purpose |
|------|---------|
| `src/services/storage.ts` | Central storage layer — all CRUD operations |
| `src/hooks/useStore.ts` | React hooks wrapping storage functions |
| `src/types/index.ts` | All entity type definitions |
| `src/services/orderService.ts` | Order creation, status management, cascading effects |
| `src/services/inventoryService.ts` | Stock management, waste, cost calculations |
| `src/services/reservationService.ts` | Reservation lifecycle management |
| `src/services/historyService.ts` | Audit log recording and querying |
| `src/services/statisticsService.ts` | Revenue, profit, popular items computation |
| `src/pages/SettingsPage.tsx` | Backup/restore/reset (now uses centralized functions) |
| `src/i18n/index.tsx` | Language preference (now uses centralized functions) |
| `src/App.tsx` | Initialization, migration on startup |
| `docs/storage-architecture.md` | Current architecture documentation |

## 18. Confirmation

- **Documentation created:** `docs/supabase-migration-plan.md`
- **Application code NOT modified:** No changes to any `.ts`, `.tsx`, or config files
- **Current status:** All existing code is unchanged and functional
