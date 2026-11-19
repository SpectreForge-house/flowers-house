-- ---------------------------------------------------------------------------
-- Returning stock when a confirmed order is cancelled or deleted
--
-- A confirmed order has already lowered inventory_items.quantity through
-- deduct_inventory_for_order(). Cancelling it used to leave the flowers
-- deducted forever. This function returns the components to the warehouse,
-- writes one "add" transaction per item and clears inventory_deducted in a
-- single transaction.
--
-- inventory_deducted may only be changed by a database function (the
-- prevent_inventory_flag_tampering trigger from 007), so the client cannot do
-- this with a plain UPDATE. The flag is set inside the same transaction with
-- app.inventory_rpc switched on.
--
-- Idempotent: once inventory_deducted is false the call returns 0 and writes
-- nothing, so a repeated cancel cannot inflate the stock.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_inventory_for_order(
  p_order_id TEXT,
  p_items JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_order RECORD;
  item JSONB;
  inv RECORD;
  req_qty NUMERIC;
  v_total NUMERIC := 0;
BEGIN
  v_shop_id := public.current_shop_id();

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'No profile/shop for current user';
  END IF;

  IF p_items IS NOT NULL
     AND p_items <> 'null'::JSONB
     AND jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items payload must be a JSON array';
  END IF;

  -- Lock the order row and verify it belongs to the current shop.
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND shop_id = v_shop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF COALESCE(v_order.inventory_deducted, false) = false THEN
    RETURN 0;
  END IF;

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

    -- Row-level lock so a concurrent stock change cannot overwrite the return.
    SELECT * INTO inv
    FROM public.inventory_items
    WHERE id = item->>'inventory_item_id'
      AND shop_id = v_shop_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory item not found: %', item->>'inventory_item_id';
    END IF;

    UPDATE public.inventory_items
    SET quantity = quantity + req_qty,
        updated_at = now()
    WHERE id = inv.id
      AND shop_id = v_shop_id;

    INSERT INTO public.inventory_transactions (
      id, shop_id, inventory_item_id, type, quantity, reason, reference_id, created_at
    ) VALUES (
      gen_random_uuid()::TEXT,
      v_shop_id,
      inv.id,
      'add',
      req_qty,
      'Order ' || p_order_id || ' cancelled',
      p_order_id,
      now()
    );

    v_total := v_total + req_qty;
  END LOOP;

  -- Allow the guard trigger to clear inventory_deducted for this transaction.
  PERFORM set_config('app.inventory_rpc', 'on', true);

  UPDATE public.orders
  SET inventory_deducted = false,
      updated_at = now()
  WHERE id = p_order_id
    AND shop_id = v_shop_id;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_inventory_for_order(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_inventory_for_order(TEXT, JSONB) TO authenticated;
