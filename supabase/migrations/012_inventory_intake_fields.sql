-- ============================================================
-- Migration 012: inventory intake fields
--
-- Adds optional supplier metadata captured from catalog photos:
-- supplier name, supplier SKU, pack note (e.g. "14 x 30") and notes.
-- Apply after migration 011.
-- ============================================================

BEGIN;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS supplier_sku TEXT,
  ADD COLUMN IF NOT EXISTS pack_note TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_supplier
  ON public.inventory_items(shop_id, supplier)
  WHERE supplier IS NOT NULL;

INSERT INTO public.app_meta (key, value, updated_at)
VALUES ('schema_version', '12', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;

COMMIT;
