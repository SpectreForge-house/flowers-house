-- ============================================================
-- Migration 010: order integrity
--
-- 1. Creates orders, order items, the delivery and inventory
--    reservations in one database transaction.
-- 2. Completes active reservations when an order's inventory is
--    deducted, so reserved stock is not counted twice.
-- 3. Adds an atomic stock adjustment RPC for add/remove/waste.
-- 4. Records the schema version used by the in-app health check.
--
-- Apply after migration 009. The script refuses to run when the
-- order-sequence trigger from 009 is missing.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'trg_sync_order_number_sequence'
         AND tgrelid = 'public.orders'::regclass
     ) THEN
    RAISE EXCEPTION 'Migration 009 must be applied before 010 (missing trg_sync_order_number_sequence)';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic order creation with reservations
--
-- The 4-argument function is the new entry point. The existing 3-argument
-- function is kept as a wrapper so older app versions continue to work.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order JSONB,
  p_items JSONB,
  p_delivery JSONB,
  p_reservations JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_order_id TEXT;
  v_item JSONB;
  v_reservation JSONB;
  v_customer_id TEXT;
  v_bouquet_id TEXT;
  v_quantity NUMERIC;
  v_inventory_item_id TEXT;
  v_reserved NUMERIC;
  v_available NUMERIC;
  v_inv RECORD;
BEGIN
  v_shop_id := public.current_shop_id();

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

  IF p_reservations IS NOT NULL
     AND p_reservations <> 'null'::JSONB
     AND jsonb_typeof(p_reservations) <> 'array' THEN
    RAISE EXCEPTION 'Reservations payload must be a JSON array or null';
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(
    CASE WHEN p_items IS NULL OR p_items = 'null'::JSONB THEN '[]'::JSONB ELSE p_items END
  )
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

    v_quantity := (v_item->>'quantity')::NUMERIC;
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

  FOR v_reservation IN SELECT * FROM jsonb_array_elements(
    CASE WHEN p_reservations IS NULL OR p_reservations = 'null'::JSONB
      THEN '[]'::JSONB
      ELSE p_reservations
    END
  )
  LOOP
    IF jsonb_typeof(v_reservation) <> 'object' THEN
      RAISE EXCEPTION 'Each reservation must be a JSON object';
    END IF;

    v_inventory_item_id := NULLIF(v_reservation->>'inventory_item_id', '');
    IF v_inventory_item_id IS NULL THEN
      RAISE EXCEPTION 'Reservation inventory_item_id is required';
    END IF;

    v_quantity := (v_reservation->>'quantity')::NUMERIC;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Reservation quantity must be positive';
    END IF;

    -- Lock the stock row so two devices cannot reserve the same units.
    SELECT * INTO v_inv
    FROM public.inventory_items
    WHERE id = v_inventory_item_id
      AND shop_id = v_shop_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory item % does not belong to the current shop', v_inventory_item_id;
    END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO v_reserved
    FROM public.inventory_reservations
    WHERE shop_id = v_shop_id
      AND inventory_item_id = v_inventory_item_id
      AND status = 'active';

    v_available := v_inv.quantity - v_reserved;
    IF v_quantity > v_available THEN
      RAISE EXCEPTION 'Insufficient available stock for %: need %, available %',
        v_inv.name, v_quantity, v_available;
    END IF;

    INSERT INTO public.inventory_reservations (
      id, shop_id, order_id, inventory_item_id, quantity, status, note,
      created_at, updated_at
    ) VALUES (
      COALESCE(NULLIF(v_reservation->>'id', ''), gen_random_uuid()::TEXT),
      v_shop_id,
      v_order_id,
      v_inventory_item_id,
      v_quantity,
      'active',
      NULLIF(v_reservation->>'note', ''),
      COALESCE((v_reservation->>'created_at')::TIMESTAMPTZ, now()),
      COALESCE((v_reservation->>'updated_at')::TIMESTAMPTZ, now())
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- Backwards-compatible entry point for clients that do not send reservations.
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order JSONB,
  p_items JSONB,
  p_delivery JSONB
)
RETURNS TEXT
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  SELECT public.create_order_atomic(p_order, p_items, p_delivery, NULL::JSONB);
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- Completing reservations on stock deduction
--
-- deduct_inventory_for_order() lowers inventory_items.quantity. If the
-- reservations stayed active, available stock would be reduced twice until the
-- order is completed. This trigger closes them in the same transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_order_reservations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.inventory_deducted = true
     AND COALESCE(OLD.inventory_deducted, false) = false THEN
    UPDATE public.inventory_reservations
    SET status = 'completed',
        updated_at = now()
    WHERE order_id = NEW.id
      AND shop_id = NEW.shop_id
      AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_order_reservations ON public.orders;
CREATE TRIGGER trg_complete_order_reservations
  AFTER UPDATE OF inventory_deducted ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_order_reservations();

REVOKE ALL ON FUNCTION public.complete_order_reservations() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Atomic stock adjustment
--
-- Replaces the read-modify-write sequence in addStock/removeStock/recordWaste.
-- The item row is locked, the new quantity is checked, and the matching
-- inventory transaction is inserted in the same transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_item_id TEXT,
  p_quantity NUMERIC,
  p_type TEXT,
  p_reason TEXT,
  p_transaction_id TEXT DEFAULT NULL,
  p_comment TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_inv RECORD;
  v_new_quantity NUMERIC;
BEGIN
  v_shop_id := public.current_shop_id();

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'No profile/shop for current user';
  END IF;

  IF p_type NOT IN ('add', 'remove', 'waste') THEN
    RAISE EXCEPTION 'Invalid inventory transaction type: %', p_type;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Inventory quantity must be positive';
  END IF;

  SELECT * INTO v_inv
  FROM public.inventory_items
  WHERE id = p_item_id
    AND shop_id = v_shop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % not found', p_item_id;
  END IF;

  IF p_type IN ('remove', 'waste') AND v_inv.quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for %: need %, have %',
      v_inv.name, p_quantity, v_inv.quantity;
  END IF;

  v_new_quantity := v_inv.quantity + CASE WHEN p_type = 'add' THEN p_quantity ELSE -p_quantity END;

  UPDATE public.inventory_items
  SET quantity = v_new_quantity,
      updated_at = now()
  WHERE id = p_item_id
    AND shop_id = v_shop_id;

  INSERT INTO public.inventory_transactions (
    id, shop_id, inventory_item_id, type, quantity, reason,
    reference_id, created_at, comment
  ) VALUES (
    COALESCE(NULLIF(p_transaction_id, ''), gen_random_uuid()::TEXT),
    v_shop_id,
    p_item_id,
    p_type,
    p_quantity,
    p_reason,
    NULL,
    now(),
    NULLIF(p_comment, '')
  );

  RETURN v_new_quantity;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_inventory_stock(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Deduction must respect reservations held by other orders
--
-- The 007 version only compared against inventory_items.quantity, so it could
-- deduct stock that was already reserved by another order. Reservations owned
-- by the order being confirmed are ignored because this call consumes them.
-- ---------------------------------------------------------------------------

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
  v_reserved_other NUMERIC;
  v_available NUMERIC;
BEGIN
  IF p_items IS NOT NULL
     AND p_items <> 'null'::JSONB
     AND jsonb_typeof(p_items) <> 'array' THEN
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

  FOR item IN SELECT * FROM jsonb_array_elements(
    CASE WHEN p_items IS NULL OR p_items = 'null'::JSONB THEN '[]'::JSONB ELSE p_items END
  )
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

    SELECT COALESCE(SUM(quantity), 0) INTO v_reserved_other
    FROM public.inventory_reservations
    WHERE shop_id = v_shop_id
      AND inventory_item_id = inv.id
      AND status = 'active'
      AND (order_id IS NULL OR order_id <> p_order_id);

    v_available := inv.quantity - v_reserved_other;
    IF v_available < req_qty THEN
      RAISE EXCEPTION 'Insufficient available stock for %: need %, available %',
        inv.name, req_qty, v_available;
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
-- Schema version for the in-app health check
-- ---------------------------------------------------------------------------

INSERT INTO public.app_meta (key, value, updated_at)
VALUES ('schema_version', '10', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;

COMMIT;
