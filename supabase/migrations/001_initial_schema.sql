-- ============================================================
-- Migration 001: Initial schema for Flower's House CRM
-- Creates 15 tables, the order-number sequence, RPC helpers,
-- indexes, CHECK constraints and Row Level Security policies.
--
-- Apply the migrations in numeric order (001 -> 005).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Core / auth tables
-- ---------------------------------------------------------------------------

CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id),
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'manager', 'staff')),
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_shop ON user_profiles(shop_id);

-- ---------------------------------------------------------------------------
-- Business data
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
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

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  color TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_stock NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  purchase_price NUMERIC(10,2) NOT NULL CHECK (purchase_price >= 0),
  selling_price NUMERIC(10,2) CHECK (selling_price IS NULL OR selling_price >= 0),
  unit TEXT NOT NULL CHECK (unit IN ('pieces', 'stems', 'rolls', 'bunches', 'sheets', 'meters')),
  capacity NUMERIC(10,2) CHECK (capacity IS NULL OR capacity >= 0),
  capacity_unit TEXT CHECK (capacity_unit IS NULL OR capacity_unit IN ('L', 'ml')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_inventory_shop ON inventory_items(shop_id);
CREATE INDEX idx_inventory_category ON inventory_items(shop_id, category);

CREATE TABLE bouquets (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  description TEXT,
  selling_price NUMERIC(10,2) NOT NULL CHECK (selling_price >= 0),
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_bouquets_shop ON bouquets(shop_id);

CREATE TABLE bouquet_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bouquet_id TEXT NOT NULL REFERENCES bouquets(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0)
);

CREATE INDEX idx_bouquet_items_bouquet ON bouquet_items(bouquet_id);
CREATE INDEX idx_bouquet_items_inv ON bouquet_items(inventory_item_id);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  delivery_address TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  delivery_time TEXT NOT NULL,
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled')),
  inventory_deducted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_orders_shop ON orders(shop_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(shop_id, status);
CREATE INDEX idx_orders_date ON orders(shop_id, delivery_date);
CREATE INDEX idx_orders_created ON orders(shop_id, created_at);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bouquet_id TEXT NOT NULL REFERENCES bouquets(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

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
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'ready', 'out_for_delivery', 'delivered')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_deliveries_shop ON deliveries(shop_id);
CREATE INDEX idx_deliveries_order ON deliveries(order_id);
CREATE INDEX idx_deliveries_date ON deliveries(shop_id, scheduled_date);

CREATE TABLE inventory_transactions (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  type TEXT NOT NULL CHECK (type IN ('add', 'remove', 'waste')),
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  comment TEXT
);

CREATE INDEX idx_transactions_shop ON inventory_transactions(shop_id);
CREATE INDEX idx_transactions_item ON inventory_transactions(inventory_item_id);
CREATE INDEX idx_transactions_type ON inventory_transactions(shop_id, type);
CREATE INDEX idx_transactions_ref ON inventory_transactions(reference_id) WHERE reference_id IS NOT NULL;

CREATE TABLE inventory_reservations (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  order_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'released')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_reservations_shop ON inventory_reservations(shop_id);
CREATE INDEX idx_reservations_order ON inventory_reservations(order_id);
CREATE INDEX idx_reservations_item ON inventory_reservations(inventory_item_id);
CREATE INDEX idx_reservations_active ON inventory_reservations(shop_id, status) WHERE status = 'active';

CREATE TABLE history (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  timestamp TIMESTAMPTZ NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB
);

CREATE INDEX idx_history_shop ON history(shop_id);
CREATE INDEX idx_history_entity ON history(shop_id, entity_type, entity_id);
CREATE INDEX idx_history_timestamp ON history(shop_id, timestamp DESC);
CREATE INDEX idx_history_action ON history(shop_id, action_type);

CREATE TABLE settings (
  shop_id UUID PRIMARY KEY REFERENCES shops(id),
  shop_name TEXT NOT NULL DEFAULT 'Flower''s House',
  shop_address TEXT,
  shop_phone TEXT,
  shop_email TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  currency_symbol TEXT NOT NULL DEFAULT '€',
  default_delivery_fee NUMERIC(10,2) DEFAULT 0 CHECK (default_delivery_fee >= 0),
  opening_time TEXT NOT NULL DEFAULT '09:00',
  closing_time TEXT NOT NULL DEFAULT '19:00',
  weekend_opening_time TEXT NOT NULL DEFAULT '10:00',
  weekend_closing_time TEXT NOT NULL DEFAULT '19:00'
);

CREATE TABLE user_reminders_read (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reminder_id)
);

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Order numbering + atomic inventory deduction
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION generate_order_id()
RETURNS TEXT AS $$
DECLARE
  next_num BIGINT;
BEGIN
  next_num := nextval('order_number_seq');
  RETURN 'ORD-' || LPAD(next_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Initialises the sequence after migrating existing ORD-XXX orders.
-- Pass the next number that should be handed out (max existing + 1).
CREATE OR REPLACE FUNCTION set_order_number(p_next INTEGER)
RETURNS VOID AS $$
BEGIN
  PERFORM setval('order_number_seq', GREATEST(p_next, 1), false);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION deduct_inventory_for_order(
  p_order_id TEXT,
  p_items JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
  item JSONB;
  inv RECORD;
  req_qty NUMERIC;
BEGIN
  -- 1. Lock the order row and verify it exists
  PERFORM 1 FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- 2. Prevent double deduction (concurrency guard)
  IF EXISTS (
    SELECT 1 FROM orders
    WHERE id = p_order_id AND inventory_deducted = true
  ) THEN
    RAISE EXCEPTION 'Order % inventory already deducted', p_order_id;
  END IF;

  -- 3. Only allow confirmation from 'new' status
  IF NOT EXISTS (
    SELECT 1 FROM orders
    WHERE id = p_order_id AND status = 'new'
  ) THEN
    RAISE EXCEPTION 'Order % cannot be confirmed (status is not new)', p_order_id;
  END IF;

  -- 4. Deduct inventory
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    req_qty := (item->>'quantity')::NUMERIC;

    -- Row-level lock to prevent concurrent deductions
    SELECT * INTO inv FROM inventory_items
    WHERE id = item->>'inventory_item_id'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory item not found: %', item->>'inventory_item_id';
    END IF;

    IF inv.quantity < req_qty THEN
      RAISE EXCEPTION 'Insufficient stock for %: need %, have %', inv.name, req_qty, inv.quantity;
    END IF;

    UPDATE inventory_items
    SET quantity = quantity - req_qty,
        updated_at = now()
    WHERE id = item->>'inventory_item_id';

    INSERT INTO inventory_transactions (id, shop_id, inventory_item_id, type, quantity, reason, reference_id, created_at)
    VALUES (gen_random_uuid()::TEXT, inv.shop_id, item->>'inventory_item_id', 'remove', req_qty, 'Order ' || p_order_id, p_order_id, now());
  END LOOP;

  -- 5. Mark order: inventory deducted + status confirmed (atomic with deductions)
  UPDATE orders
  SET inventory_deducted = true,
      status = 'confirmed',
      updated_at = now()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bouquets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bouquet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reminders_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_meta ENABLE ROW LEVEL SECURITY;

-- The current user's shop. user_profiles has a non-recursive policy below,
-- so these subqueries do not trigger RLS recursion.
CREATE POLICY "shops_select_own"
  ON shops FOR SELECT
  USING (id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid());

-- Data tables: authenticated users only see/modify rows in their shop.
CREATE POLICY "customers_select_own_shop"
  ON customers FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "customers_insert_own_shop"
  ON customers FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "customers_update_own_shop"
  ON customers FOR UPDATE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "customers_delete_own_shop"
  ON customers FOR DELETE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "inventory_select_own_shop"
  ON inventory_items FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "inventory_insert_own_shop"
  ON inventory_items FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "inventory_update_own_shop"
  ON inventory_items FOR UPDATE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "inventory_delete_own_shop"
  ON inventory_items FOR DELETE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "bouquets_select_own_shop"
  ON bouquets FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "bouquets_insert_own_shop"
  ON bouquets FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "bouquets_update_own_shop"
  ON bouquets FOR UPDATE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "bouquets_delete_own_shop"
  ON bouquets FOR DELETE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "bouquet_items_select_own_shop"
  ON bouquet_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM bouquets b
    WHERE b.id = bouquet_items.bouquet_id
      AND b.shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  ));
CREATE POLICY "bouquet_items_insert_own_shop"
  ON bouquet_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM bouquets b
    WHERE b.id = bouquet_items.bouquet_id
      AND b.shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  ));
CREATE POLICY "bouquet_items_update_own_shop"
  ON bouquet_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM bouquets b
    WHERE b.id = bouquet_items.bouquet_id
      AND b.shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM bouquets b
    WHERE b.id = bouquet_items.bouquet_id
      AND b.shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  ));
CREATE POLICY "bouquet_items_delete_own_shop"
  ON bouquet_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM bouquets b
    WHERE b.id = bouquet_items.bouquet_id
      AND b.shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  ));

CREATE POLICY "orders_select_own_shop"
  ON orders FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "orders_insert_own_shop"
  ON orders FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "orders_update_own_shop"
  ON orders FOR UPDATE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "orders_delete_own_shop"
  ON orders FOR DELETE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "order_items_select_own_shop"
  ON order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
      AND o.shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  ));
CREATE POLICY "order_items_insert_own_shop"
  ON order_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
      AND o.shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  ));
CREATE POLICY "order_items_update_own_shop"
  ON order_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
      AND o.shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
      AND o.shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  ));
CREATE POLICY "order_items_delete_own_shop"
  ON order_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
      AND o.shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid())
  ));

CREATE POLICY "deliveries_select_own_shop"
  ON deliveries FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "deliveries_insert_own_shop"
  ON deliveries FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "deliveries_update_own_shop"
  ON deliveries FOR UPDATE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "deliveries_delete_own_shop"
  ON deliveries FOR DELETE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "transactions_select_own_shop"
  ON inventory_transactions FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "transactions_insert_own_shop"
  ON inventory_transactions FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "transactions_delete_own_shop"
  ON inventory_transactions FOR DELETE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "reservations_select_own_shop"
  ON inventory_reservations FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "reservations_insert_own_shop"
  ON inventory_reservations FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "reservations_update_own_shop"
  ON inventory_reservations FOR UPDATE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "reservations_delete_own_shop"
  ON inventory_reservations FOR DELETE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "history_select_own_shop"
  ON history FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "history_insert_own_shop"
  ON history FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "history_delete_own_shop"
  ON history FOR DELETE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "settings_select_own_shop"
  ON settings FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "settings_insert_own_shop"
  ON settings FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "settings_update_own_shop"
  ON settings FOR UPDATE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "reminders_select_own"
  ON user_reminders_read FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "reminders_insert_own"
  ON user_reminders_read FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "reminders_update_own"
  ON user_reminders_read FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "reminders_delete_own"
  ON user_reminders_read FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "app_meta_select_authenticated"
  ON app_meta FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "app_meta_manage_owners"
  ON app_meta FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'owner'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'owner'
  ));

-- ---------------------------------------------------------------------------
-- Privileges (Supabase grants these by default; explicit for clarity)
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
