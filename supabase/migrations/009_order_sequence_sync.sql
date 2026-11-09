-- Migration 009: keep order_number_seq in sync with migrated ORD-XXX ids.
--
-- Local -> cloud migration inserts existing orders with their original ids
-- (ORD-001, ORD-002, ...), but does not call generate_order_id(). Without this
-- migration the sequence can stay at 1 and the next new order collides with a
-- migrated order.
--
-- The trigger advances the sequence whenever an explicit ORD-N id is inserted.
-- The DO block also initialises the sequence for orders that were migrated
-- before this migration was applied.

CREATE OR REPLACE FUNCTION public.sync_order_number_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_number BIGINT;
  v_last BIGINT;
  v_called BOOLEAN;
BEGIN
  IF NEW.id !~ '^ORD-[0-9]+$' THEN
    RETURN NEW;
  END IF;

  v_number := substring(NEW.id FROM 5)::BIGINT;

  SELECT last_value, is_called
    INTO v_last, v_called
  FROM public.order_number_seq;

  IF v_number > v_last OR (v_number = v_last AND NOT v_called) THEN
    PERFORM setval('public.order_number_seq', v_number, true);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_order_number_sequence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_order_number_sequence() TO authenticated;

DROP TRIGGER IF EXISTS trg_sync_order_number_sequence ON public.orders;
CREATE TRIGGER trg_sync_order_number_sequence
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_number_sequence();

-- Backfill the sequence for orders that already exist in the cloud.
DO $$
DECLARE
  v_max BIGINT;
  v_last BIGINT;
  v_called BOOLEAN;
BEGIN
  SELECT MAX((substring(id FROM 5))::BIGINT)
    INTO v_max
  FROM public.orders
  WHERE id ~ '^ORD-[0-9]+$';

  IF v_max IS NULL THEN
    RETURN;
  END IF;

  SELECT last_value, is_called
    INTO v_last, v_called
  FROM public.order_number_seq;

  IF v_max > v_last OR (v_max = v_last AND NOT v_called) THEN
    PERFORM setval('public.order_number_seq', v_max, true);
  END IF;
END;
$$;
