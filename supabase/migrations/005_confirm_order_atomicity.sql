-- ============================================================
-- 005. RPC: deduct_inventory_for_order()
-- Atomic order confirmation: locks order, verifies state,
-- deducts inventory, and sets status = 'confirmed' in one transaction.
-- ============================================================
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

  -- 4. Deduct inventory (existing logic, unchanged)
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

    -- Deduct stock
    UPDATE inventory_items
    SET quantity = quantity - req_qty,
        updated_at = now()
    WHERE id = item->>'inventory_item_id';

    -- Record transaction
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
