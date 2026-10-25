-- ============================================================
-- Migration 006: Cloud parity
-- Adds the remaining entity fields/tables required to fully use
-- Supabase as the primary store:
--   * customer important dates
--   * settings parity fields (client-status + upcoming-dates window)
--   * manually added client purchases
--   * dismissed reminders
--   * profile language RPC
--   * atomic order creation RPC
--   * realtime publication + photo storage bucket/policies
--
-- Apply after migrations 001-005.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Customer important dates (birthday, name day, ...)
-- ---------------------------------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS important_dates JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Settings parity
-- ---------------------------------------------------------------------------
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS client_dates_window_days INTEGER NOT NULL DEFAULT 14
    CHECK (client_dates_window_days >= 1 AND client_dates_window_days <= 90);

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS client_status JSONB NOT NULL DEFAULT
    '{"regularMinCount":3,"vipMinTotal":300,"vipMinCount":10,"discountNew":0,"discountRegular":0,"discountVip":0}'::jsonb;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- Manually added client purchases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_purchases (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT,
  composition TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  purchase_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchases_shop ON client_purchases(shop_id);
CREATE INDEX IF NOT EXISTS idx_purchases_customer ON client_purchases(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON client_purchases(shop_id, purchase_date DESC);

ALTER TABLE client_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchases_select_own_shop" ON client_purchases;
CREATE POLICY "purchases_select_own_shop"
  ON client_purchases FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "purchases_insert_own_shop" ON client_purchases;
CREATE POLICY "purchases_insert_own_shop"
  ON client_purchases FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "purchases_update_own_shop" ON client_purchases;
CREATE POLICY "purchases_update_own_shop"
  ON client_purchases FOR UPDATE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "purchases_delete_own_shop" ON client_purchases;
CREATE POLICY "purchases_delete_own_shop"
  ON client_purchases FOR DELETE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Dismissed reminders (per user, so each staff member dismisses their own)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_reminders_dismissed (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_key TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reminder_key)
);

ALTER TABLE user_reminders_dismissed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders_dismissed_select_own" ON user_reminders_dismissed;
CREATE POLICY "reminders_dismissed_select_own"
  ON user_reminders_dismissed FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "reminders_dismissed_insert_own" ON user_reminders_dismissed;
CREATE POLICY "reminders_dismissed_insert_own"
  ON user_reminders_dismissed FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reminders_dismissed_delete_own" ON user_reminders_dismissed;
CREATE POLICY "reminders_dismissed_delete_own"
  ON user_reminders_dismissed FOR DELETE
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Shop profile (name/address/phone/email) can be edited by shop users
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "shops_update_own" ON shops;
CREATE POLICY "shops_update_own"
  ON shops FOR UPDATE
  USING (id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Photo metadata (the files themselves live in the shop-photos bucket)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos(shop_id, owner_kind, owner_id);
CREATE INDEX IF NOT EXISTS idx_photos_filename ON photos(shop_id, filename);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photos_select_own_shop" ON photos;
CREATE POLICY "photos_select_own_shop"
  ON photos FOR SELECT
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "photos_insert_own_shop" ON photos;
CREATE POLICY "photos_insert_own_shop"
  ON photos FOR INSERT
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "photos_update_own_shop" ON photos;
CREATE POLICY "photos_update_own_shop"
  ON photos FOR UPDATE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "photos_delete_own_shop" ON photos;
CREATE POLICY "photos_delete_own_shop"
  ON photos FOR DELETE
  USING (shop_id = (SELECT shop_id FROM user_profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Profile language / display name
-- Column-level RLS is not possible, so expose a narrow SECURITY DEFINER RPC
-- instead of a broad UPDATE policy that would let users change their role/shop.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_my_profile(
  p_language TEXT DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF p_language IS NOT NULL AND p_language NOT IN ('en', 'ru', 'bg') THEN
    RAISE EXCEPTION 'Unsupported language: %', p_language;
  END IF;

  UPDATE user_profiles
  SET language = COALESCE(p_language, language),
      display_name = COALESCE(p_display_name, display_name)
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_my_profile(TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Atomic order creation: order + items + delivery in one transaction
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_order JSONB,
  p_items JSONB,
  p_delivery JSONB
)
RETURNS TEXT AS $$
DECLARE
  v_shop_id UUID;
  v_order_id TEXT;
  v_item JSONB;
BEGIN
  SELECT shop_id INTO v_shop_id
  FROM user_profiles
  WHERE id = auth.uid();

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'No profile/shop for current user';
  END IF;

  v_order_id := COALESCE(NULLIF(p_order->>'id', ''), generate_order_id());

  INSERT INTO orders (
    id, shop_id, customer_id, customer_name, customer_phone,
    recipient_name, recipient_phone, delivery_address,
    delivery_date, delivery_time, delivery_fee, total, comment,
    status, inventory_deducted, created_at, updated_at
  ) VALUES (
    v_order_id,
    v_shop_id,
    p_order->>'customer_id',
    p_order->>'customer_name',
    p_order->>'customer_phone',
    p_order->>'recipient_name',
    NULLIF(p_order->>'recipient_phone', ''),
    p_order->>'delivery_address',
    (p_order->>'delivery_date')::DATE,
    p_order->>'delivery_time',
    COALESCE((p_order->>'delivery_fee')::NUMERIC, 0),
    (p_order->>'total')::NUMERIC,
    NULLIF(p_order->>'comment', ''),
    COALESCE(NULLIF(p_order->>'status', ''), 'new'),
    COALESCE((p_order->>'inventory_deducted')::BOOLEAN, false),
    COALESCE((p_order->>'created_at')::TIMESTAMPTZ, now()),
    COALESCE((p_order->>'updated_at')::TIMESTAMPTZ, now())
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, bouquet_id, quantity, price)
    VALUES (
      v_order_id,
      v_item->>'bouquet_id',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'price')::NUMERIC
    );
  END LOOP;

  IF p_delivery IS NOT NULL AND p_delivery <> 'null'::jsonb THEN
    INSERT INTO deliveries (
      id, shop_id, order_id, address, customer_name, recipient_name,
      phone, scheduled_time, scheduled_date, status, notes,
      created_at, updated_at
    ) VALUES (
      p_delivery->>'id',
      v_shop_id,
      v_order_id,
      p_delivery->>'address',
      p_delivery->>'customer_name',
      p_delivery->>'recipient_name',
      p_delivery->>'phone',
      p_delivery->>'scheduled_time',
      (p_delivery->>'scheduled_date')::DATE,
      COALESCE(NULLIF(p_delivery->>'status', ''), 'waiting'),
      NULLIF(p_delivery->>'notes', ''),
      COALESCE((p_delivery->>'created_at')::TIMESTAMPTZ, now()),
      COALESCE((p_delivery->>'updated_at')::TIMESTAMPTZ, now())
    );
  END IF;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION create_order_atomic(JSONB, JSONB, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime publication (only the time-critical tables)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'orders', 'deliveries', 'inventory_items',
    'inventory_reservations', 'customers', 'client_purchases'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Photo storage bucket
-- Path layout: <shop_id>/<owner_kind>/<owner_id>/<filename>
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('shop-photos', 'shop-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "shop_photos_select_own_shop" ON storage.objects;
CREATE POLICY "shop_photos_select_own_shop"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'shop-photos'
    AND (storage.foldername(name))[1] = (
      SELECT shop_id::TEXT FROM user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "shop_photos_insert_own_shop" ON storage.objects;
CREATE POLICY "shop_photos_insert_own_shop"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'shop-photos'
    AND (storage.foldername(name))[1] = (
      SELECT shop_id::TEXT FROM user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "shop_photos_update_own_shop" ON storage.objects;
CREATE POLICY "shop_photos_update_own_shop"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'shop-photos'
    AND (storage.foldername(name))[1] = (
      SELECT shop_id::TEXT FROM user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "shop_photos_delete_own_shop" ON storage.objects;
CREATE POLICY "shop_photos_delete_own_shop"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'shop-photos'
    AND (storage.foldername(name))[1] = (
      SELECT shop_id::TEXT FROM user_profiles WHERE id = auth.uid()
    )
  );
