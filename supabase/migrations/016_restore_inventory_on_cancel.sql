-- ---------------------------------------------------------------------------
-- Returning stock when a confirmed order is cancelled or deleted
--
-- A confirmed order has already lowered inventory_items.quantity through
-- deduct_inventory_for_order(). Cancelling it used to leave the flowers
-- deducted forever. This function returns the components to the warehouse,
-- writes one "add" transaction per item and clears inventory_deducted in a
-- single transaction.
--
-- The quantities are taken from the stock movements that the confirmation
-- itself recorded (inventory_transactions with reference_id = order id), so
-- deleting or editing a bouquet after the sale cannot change what is returned.
-- Only when such movements are missing (legacy data) the current bouquet
-- composition is used.
--
-- inventory_deducted may only be changed by a database function (the
-- prevent_inventory_flag_tampering trigger from 007), so the client cannot do
-- this with a plain UPDATE. The flag is set inside the same transaction with
-- app.inventory_rpc switched on.
--
-- Idempotent: once inventory_deducted is false the call returns 0 and writes
-- nothing, so a repeated cancel cannot inflate the stock.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_inventory_for_order(p_order_id TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_order RECORD;
  rec RECORD;
  v_total NUMERIC := 0;
BEGIN
  v_shop_id := public.current_shop_id();

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'No profile/shop for current user';
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

  FOR rec IN
    WITH deducted AS (
      SELECT inventory_item_id, SUM(quantity) AS quantity
      FROM public.inventory_transactions
      WHERE shop_id = v_shop_id
        AND reference_id = p_order_id
        AND type = 'remove'
      GROUP BY inventory_item_id
    ),
    composed AS (
      SELECT bi.inventory_item_id, SUM(bi.quantity * oi.quantity) AS quantity
      FROM public.order_items oi
      JOIN public.bouquet_items bi ON bi.bouquet_id = oi.bouquet_id
      WHERE oi.order_id = p_order_id
      GROUP BY bi.inventory_item_id
    )
    SELECT inventory_item_id, quantity FROM deducted
    UNION ALL
    SELECT inventory_item_id, quantity FROM composed
    WHERE NOT EXISTS (SELECT 1 FROM deducted)
  LOOP
    IF rec.quantity IS NULL OR rec.quantity <= 0 THEN
      CONTINUE;
    END IF;

    -- Row-level lock so a concurrent stock change cannot overwrite the return.
    UPDATE public.inventory_items
    SET quantity = quantity + rec.quantity,
        updated_at = now()
    WHERE id = rec.inventory_item_id
      AND shop_id = v_shop_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory item not found: %', rec.inventory_item_id;
    END IF;

    INSERT INTO public.inventory_transactions (
      id, shop_id, inventory_item_id, type, quantity, reason, reference_id, created_at
    ) VALUES (
      gen_random_uuid()::TEXT,
      v_shop_id,
      rec.inventory_item_id,
      'add',
      rec.quantity,
      'Order ' || p_order_id || ' cancelled',
      p_order_id,
      now()
    );

    v_total := v_total + rec.quantity;
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

REVOKE ALL ON FUNCTION public.restore_inventory_for_order(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_inventory_for_order(TEXT) TO authenticated;
