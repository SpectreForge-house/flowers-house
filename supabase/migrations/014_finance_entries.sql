-- ============================================================
-- Migration 014: owner's daily finance bookkeeping
--
-- Manual revenue / expense entries for the cash-book. Orders are
-- intentionally NOT used for this: the daily revenue is typed in
-- from the fiscal report.
--
-- Only the shop owner may read or write these rows.
-- Apply after migrations 001-013.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.finance_entries (
  id TEXT PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  entry_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  category TEXT,
  category_label TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_shop_date
  ON public.finance_entries(shop_id, entry_date DESC);

ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_entries_owner_all" ON public.finance_entries;
CREATE POLICY "finance_entries_owner_all"
  ON public.finance_entries FOR ALL
  USING (
    public.current_shop_id() = shop_id
    AND public.current_user_role() = 'owner'
  )
  WITH CHECK (
    public.current_shop_id() = shop_id
    AND public.current_user_role() = 'owner'
  );

-- Realtime so a second owner device sees new entries immediately.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'finance_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_entries;
  END IF;
END $$;

INSERT INTO public.app_meta (key, value, updated_at)
VALUES ('schema_version', '14', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;

COMMIT;
