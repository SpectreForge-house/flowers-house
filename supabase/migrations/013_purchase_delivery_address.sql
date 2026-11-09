-- ============================================================
-- Migration 013: delivery address on manually added purchases
--
-- Each bouquet in a client's purchase history can carry its own
-- delivery address (separate from the client's general address).
-- Apply after migration 012.
-- ============================================================

BEGIN;

ALTER TABLE public.client_purchases
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;

INSERT INTO public.app_meta (key, value, updated_at)
VALUES ('schema_version', '13', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;

COMMIT;
