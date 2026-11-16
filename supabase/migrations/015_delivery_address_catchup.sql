-- ============================================================
-- Migration 015: catch-up for the purchase delivery address
--
-- Some deployments applied 014 before 013, so
-- client_purchases.delivery_address was never created and every
-- purchase written from the app failed with
--   Could not find the 'delivery_address' column of
--   'client_purchases' in the schema cache
-- Re-asserting the column here makes the fix a single script and
-- keeps the recorded schema version monotonic.
--
-- Safe to run more than once. Apply after migrations 001-014.
-- ============================================================

BEGIN;

ALTER TABLE public.client_purchases
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;

INSERT INTO public.app_meta (key, value, updated_at)
VALUES ('schema_version', '15', now())
ON CONFLICT (key) DO UPDATE
SET value = '15',
    updated_at = EXCLUDED.updated_at;

COMMIT;
