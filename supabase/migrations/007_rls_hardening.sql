-- ============================================================
-- Migration 007: RLS hardening, role matrix, safe bootstrap
--
-- Roles:
--   owner   - everything, including staff management
--   manager - full CRUD on shop data + settings, no staff management
--   staff   - create/update operational data, no destructive deletes,
--             no settings/shop edits, no staff management
--
-- Apply after migrations 001-006.
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers
--
-- SECURITY DEFINER lets these functions read user_profiles without triggering
-- RLS recursion. search_path is pinned so the functions cannot be hijacked.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_shop_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT shop_id
  FROM public.user_profiles
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role
  FROM public.user_profiles
  WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_shop_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_shop_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap: idempotent, auth.uid()-only, no arbitrary user ids
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_initial_shop_and_profile(
  p_user_id UUID,
  p_shop_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_shop_id UUID;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
    RAISE EXCEPTION 'Cannot create a profile for another user';
  END IF;

  -- Serialise concurrent first-sign-in calls for the same user.
  PERFORM pg_advisory_xact_lock(hashtext('profile:' || v_uid::TEXT)::BIGINT);

  SELECT shop_id INTO v_shop_id
  FROM public.user_profiles
  WHERE id = v_uid;

  IF v_shop_id IS NOT NULL THEN
    RETURN v_shop_id;
  END IF;

  v_name := COALESCE(NULLIF(btrim(p_shop_name), ''), 'Flower''s House');

  INSERT INTO public.shops (name)
  VALUES (v_name)
  RETURNING id INTO v_shop_id;

  INSERT INTO public.user_profiles (id, shop_id, display_name, role)
  VALUES (
    v_uid,
    v_shop_id,
    NULLIF(split_part(v_name, '@', 1), ''),
    'owner'
  );

  RETURN v_shop_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_initial_shop_and_profile(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_initial_shop_and_profile(UUID, TEXT) TO authenticated;

-- Direct shop/profile inserts are no longer needed. Keeping them would let any
-- authenticated user join an arbitrary shop as owner by inserting a profile.
DROP POLICY IF EXISTS "Authenticated users can create shop" ON public.shops;
DROP POLICY IF EXISTS "Authenticated users can create own profile" ON public.user_profiles;

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can read profiles in own shop" ON public.user_profiles;
CREATE POLICY "Users can read profiles in own shop"
  ON public.user_profiles FOR SELECT
  USING (shop_id = public.current_shop_id());

DROP POLICY IF EXISTS "Owners can manage profiles in own shop" ON public.user_profiles;
DROP POLICY IF EXISTS "Owners can update profiles in own shop" ON public.user_profiles;
CREATE POLICY "Owners can update profiles in own shop"
  ON public.user_profiles FOR UPDATE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() = 'owner'
  )
  WITH CHECK (shop_id = public.current_shop_id());

DROP POLICY IF EXISTS "Owners can delete profiles in own shop" ON public.user_profiles;
CREATE POLICY "Owners can delete profiles in own shop"
  ON public.user_profiles FOR DELETE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() = 'owner'
    AND id <> auth.uid()
  );

-- A shop must always keep at least one owner.
CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_owner_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role <> 'owner' THEN
      RETURN OLD;
    END IF;

    -- Deleting the auth user cascades into user_profiles. In that case the
    -- account is already gone, so do not block the cascade.
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.id) THEN
      RETURN OLD;
    END IF;

    v_shop_id := OLD.shop_id;
    v_owner_id := OLD.id;
  ELSE
    IF OLD.role <> 'owner' THEN
      RETURN NEW;
    END IF;

    -- Demotion or moving an owner to another shop also removes an owner.
    IF NEW.role = 'owner' AND NEW.shop_id = OLD.shop_id THEN
      RETURN NEW;
    END IF;

    v_shop_id := OLD.shop_id;
    v_owner_id := OLD.id;
  END IF;

  -- Serialise owner changes per shop to avoid two concurrent demotions
  -- leaving the shop without an owner.
  PERFORM pg_advisory_xact_lock(hashtext('shop-owners:' || v_shop_id::TEXT)::BIGINT);

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE shop_id = v_shop_id
      AND role = 'owner'
      AND id <> v_owner_id
  ) THEN
    RAISE EXCEPTION 'Cannot remove the last owner of shop %', v_shop_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_last_owner_removal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_last_owner_removal() TO authenticated;

DROP TRIGGER IF EXISTS trg_prevent_last_owner_removal ON public.user_profiles;
CREATE TRIGGER trg_prevent_last_owner_removal
  BEFORE DELETE OR UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_owner_removal();

-- A profile belongs to exactly one auth user and one shop. Owners manage the
-- role, not the identity of a profile.
CREATE OR REPLACE FUNCTION public.prevent_profile_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Cannot change a profile id';
  END IF;

  IF NEW.shop_id <> OLD.shop_id THEN
    RAISE EXCEPTION 'Cannot move a profile to another shop';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_profile_identity_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_profile_identity_change() TO authenticated;

DROP TRIGGER IF EXISTS trg_prevent_profile_identity_change ON public.user_profiles;
CREATE TRIGGER trg_prevent_profile_identity_change
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_identity_change();

-- ---------------------------------------------------------------------------
-- shops
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "shops_select_own" ON public.shops;
CREATE POLICY "shops_select_own"
  ON public.shops FOR SELECT
  USING (id = public.current_shop_id());

DROP POLICY IF EXISTS "shops_update_own" ON public.shops;
CREATE POLICY "shops_update_own"
  ON public.shops FOR UPDATE
  USING (
    id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

-- ---------------------------------------------------------------------------
-- Destructive deletes: owner + manager only
-- (staff can still create and update these entities)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "customers_delete_own_shop" ON public.customers;
CREATE POLICY "customers_delete_own_shop"
  ON public.customers FOR DELETE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "inventory_delete_own_shop" ON public.inventory_items;
CREATE POLICY "inventory_delete_own_shop"
  ON public.inventory_items FOR DELETE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "bouquets_delete_own_shop" ON public.bouquets;
CREATE POLICY "bouquets_delete_own_shop"
  ON public.bouquets FOR DELETE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "orders_delete_own_shop" ON public.orders;
CREATE POLICY "orders_delete_own_shop"
  ON public.orders FOR DELETE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "deliveries_delete_own_shop" ON public.deliveries;
CREATE POLICY "deliveries_delete_own_shop"
  ON public.deliveries FOR DELETE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "transactions_delete_own_shop" ON public.inventory_transactions;
CREATE POLICY "transactions_delete_own_shop"
  ON public.inventory_transactions FOR DELETE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "reservations_delete_own_shop" ON public.inventory_reservations;
CREATE POLICY "reservations_delete_own_shop"
  ON public.inventory_reservations FOR DELETE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "history_delete_own_shop" ON public.history;
CREATE POLICY "history_delete_own_shop"
  ON public.history FOR DELETE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "purchases_delete_own_shop" ON public.client_purchases;
CREATE POLICY "purchases_delete_own_shop"
  ON public.client_purchases FOR DELETE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

-- Replacing a customer/bouquet photo is part of editing, so staff can delete
-- photo metadata and the storage object too.
DROP POLICY IF EXISTS "photos_delete_own_shop" ON public.photos;
CREATE POLICY "photos_delete_own_shop"
  ON public.photos FOR DELETE
  USING (shop_id = public.current_shop_id());

-- ---------------------------------------------------------------------------
-- Settings: owner + manager only (read remains available to all shop users)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "settings_insert_own_shop" ON public.settings;
CREATE POLICY "settings_insert_own_shop"
  ON public.settings FOR INSERT
  WITH CHECK (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "settings_update_own_shop" ON public.settings;
CREATE POLICY "settings_update_own_shop"
  ON public.settings FOR UPDATE
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    shop_id = public.current_shop_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );

-- ---------------------------------------------------------------------------
-- app_meta: owners only (replaces the old subquery-based policy)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "app_meta_manage_owners" ON public.app_meta;
CREATE POLICY "app_meta_manage_owners"
  ON public.app_meta FOR ALL
  USING (public.current_user_role() = 'owner')
  WITH CHECK (public.current_user_role() = 'owner');

-- ---------------------------------------------------------------------------
-- Photo storage: all shop members can upload/replace, deletes are part of
-- editing photos (the metadata policy above has the same rule).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "shop_photos_select_own_shop" ON storage.objects;
CREATE POLICY "shop_photos_select_own_shop"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'shop-photos'
    AND (storage.foldername(name))[1] = public.current_shop_id()::TEXT
  );

DROP POLICY IF EXISTS "shop_photos_insert_own_shop" ON storage.objects;
CREATE POLICY "shop_photos_insert_own_shop"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'shop-photos'
    AND (storage.foldername(name))[1] = public.current_shop_id()::TEXT
  );

DROP POLICY IF EXISTS "shop_photos_update_own_shop" ON storage.objects;
CREATE POLICY "shop_photos_update_own_shop"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'shop-photos'
    AND (storage.foldername(name))[1] = public.current_shop_id()::TEXT
  )
  WITH CHECK (
    bucket_id = 'shop-photos'
    AND (storage.foldername(name))[1] = public.current_shop_id()::TEXT
  );

DROP POLICY IF EXISTS "shop_photos_delete_own_shop" ON storage.objects;
CREATE POLICY "shop_photos_delete_own_shop"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'shop-photos'
    AND (storage.foldername(name))[1] = public.current_shop_id()::TEXT
  );

-- ---------------------------------------------------------------------------
-- Profile RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_language TEXT DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_language IS NOT NULL AND p_language NOT IN ('en', 'ru', 'bg') THEN
    RAISE EXCEPTION 'Unsupported language: %', p_language;
  END IF;

  UPDATE public.user_profiles
  SET language = COALESCE(p_language, language),
      display_name = COALESCE(NULLIF(btrim(p_display_name), ''), display_name)
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Atomic order creation: verify customer/bouquets belong to the current shop
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order JSONB,
  p_items JSONB,
  p_delivery JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_order_id TEXT;
  v_item JSONB;
  v_customer_id TEXT;
  v_bouquet_id TEXT;
  v_quantity INTEGER;
BEGIN
  SELECT shop_id INTO v_shop_id
  FROM public.user_profiles
  WHERE id = auth.uid();

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'No profile/shop for current user';
  END IF;

  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'Order payload must be a JSON object';
  END IF;

  v_customer_id := NULLIF(p_order->>'customer_id', '');
  IF v_customer_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = v_customer_id AND shop_id = v_shop_id
  ) THEN
    RAISE EXCEPTION 'Customer % does not belong to the current shop', COALESCE(v_customer_id, '<empty>');
  END IF;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items payload must be a JSON array';
  END IF;

  IF p_delivery IS NOT NULL
     AND p_delivery <> 'null'::JSONB
     AND jsonb_typeof(p_delivery) <> 'object' THEN
    RAISE EXCEPTION 'Delivery payload must be a JSON object or null';
  END IF;

  v_order_id := COALESCE(NULLIF(p_order->>'id', ''), public.generate_order_id());

  INSERT INTO public.orders (
    id, shop_id, customer_id, customer_name, customer_phone,
    recipient_name, recipient_phone, delivery_address,
    delivery_date, delivery_time, delivery_fee, total, comment,
    status, inventory_deducted, created_at, updated_at
  ) VALUES (
    v_order_id,
    v_shop_id,
    v_customer_id,
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Each order item must be a JSON object';
    END IF;

    v_bouquet_id := NULLIF(v_item->>'bouquet_id', '');
    IF v_bouquet_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.bouquets
      WHERE id = v_bouquet_id AND shop_id = v_shop_id
    ) THEN
      RAISE EXCEPTION 'Bouquet % does not belong to the current shop', COALESCE(v_bouquet_id, '<empty>');
    END IF;

    v_quantity := (v_item->>'quantity')::INTEGER;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Order item quantity must be positive';
    END IF;

    INSERT INTO public.order_items (order_id, bouquet_id, quantity, price)
    VALUES (
      v_order_id,
      v_bouquet_id,
      v_quantity,
      (v_item->>'price')::NUMERIC
    );
  END LOOP;

  IF p_delivery IS NOT NULL AND p_delivery <> 'null'::JSONB THEN
    INSERT INTO public.deliveries (
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
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB) TO authenticated;

-- Cancelling an order removes its delivery row. Staff can edit orders, but
-- cannot delete deliveries directly, so cancellation goes through this narrow
-- SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION public.delete_delivery_for_cancelled_order(p_order_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID := public.current_shop_id();
BEGIN
  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'No profile/shop for current user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orders
    WHERE id = p_order_id
      AND shop_id = v_shop_id
      AND status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Order % is not cancelled or does not belong to the current shop', p_order_id;
  END IF;

  DELETE FROM public.deliveries
  WHERE order_id = p_order_id
    AND shop_id = v_shop_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_delivery_for_cancelled_order(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_delivery_for_cancelled_order(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Inventory deduction: verify order/inventory shop ownership, and prevent
-- direct REST updates from flipping inventory_deducted without deducting.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_inventory_flag_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.inventory_deducted IS DISTINCT FROM OLD.inventory_deducted
     AND current_setting('app.inventory_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'inventory_deducted can only be changed by deduct_inventory_for_order()';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_inventory_flag_tampering() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_inventory_flag_tampering() TO authenticated;

DROP TRIGGER IF EXISTS trg_prevent_inventory_flag_tampering ON public.orders;
CREATE TRIGGER trg_prevent_inventory_flag_tampering
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_inventory_flag_tampering();

CREATE OR REPLACE FUNCTION public.deduct_inventory_for_order(
  p_order_id TEXT,
  p_items JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_order RECORD;
  item JSONB;
  inv RECORD;
  req_qty NUMERIC;
BEGIN
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items payload must be a JSON array';
  END IF;

  -- Lock the order row and verify it belongs to the current shop.
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND shop_id = public.current_shop_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.inventory_deducted = true THEN
    RAISE EXCEPTION 'Order % inventory already deducted', p_order_id;
  END IF;

  IF v_order.status <> 'new' THEN
    RAISE EXCEPTION 'Order % cannot be confirmed (status is not new)', p_order_id;
  END IF;

  v_shop_id := v_order.shop_id;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
  LOOP
    IF jsonb_typeof(item) <> 'object' THEN
      RAISE EXCEPTION 'Each inventory item must be a JSON object';
    END IF;

    req_qty := (item->>'quantity')::NUMERIC;
    IF req_qty IS NULL OR req_qty <= 0 THEN
      RAISE EXCEPTION 'Inventory quantity must be positive';
    END IF;

    -- Row-level lock to prevent concurrent deductions.
    SELECT * INTO inv
    FROM public.inventory_items
    WHERE id = item->>'inventory_item_id'
      AND shop_id = v_shop_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory item not found: %', item->>'inventory_item_id';
    END IF;

    IF inv.quantity < req_qty THEN
      RAISE EXCEPTION 'Insufficient stock for %: need %, have %', inv.name, req_qty, inv.quantity;
    END IF;

    UPDATE public.inventory_items
    SET quantity = quantity - req_qty,
        updated_at = now()
    WHERE id = inv.id
      AND shop_id = v_shop_id;

    INSERT INTO public.inventory_transactions (
      id, shop_id, inventory_item_id, type, quantity, reason, reference_id, created_at
    ) VALUES (
      gen_random_uuid()::TEXT,
      v_shop_id,
      inv.id,
      'remove',
      req_qty,
      'Order ' || p_order_id,
      p_order_id,
      now()
    );
  END LOOP;

  -- Allow the guarded trigger to update inventory_deducted for this transaction.
  PERFORM set_config('app.inventory_rpc', 'on', true);

  UPDATE public.orders
  SET inventory_deducted = true,
      status = 'confirmed',
      updated_at = now()
  WHERE id = p_order_id
    AND shop_id = v_shop_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_inventory_for_order(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_inventory_for_order(TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

-- The sequence must only be adjusted by an administrator running SQL manually.
REVOKE ALL ON FUNCTION public.set_order_number(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_number(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.set_order_number(INTEGER) FROM authenticated;

REVOKE ALL ON FUNCTION public.generate_order_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_order_id() TO authenticated;

COMMIT;
