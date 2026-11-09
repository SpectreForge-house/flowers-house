-- ============================================================
-- Migration 011: nickname cooldown
--
-- Adds display_name_updated_at and enforces a 3-day cooldown when a
-- user changes their own nickname. Language changes remain unlimited.
-- Apply after migration 010.
-- ============================================================

BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS display_name_updated_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_language TEXT DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_display TEXT;
  v_updated_at TIMESTAMPTZ;
  v_new_display TEXT;
BEGIN
  IF p_language IS NOT NULL AND p_language NOT IN ('en', 'ru', 'bg') THEN
    RAISE EXCEPTION 'Unsupported language: %', p_language;
  END IF;

  IF p_display_name IS NOT NULL THEN
    v_new_display := NULLIF(btrim(p_display_name), '');

    IF v_new_display IS NULL THEN
      RAISE EXCEPTION 'display_name_empty';
    END IF;

    IF char_length(v_new_display) > 40 THEN
      RAISE EXCEPTION 'display_name_too_long';
    END IF;

    SELECT display_name, display_name_updated_at
    INTO v_current_display, v_updated_at
    FROM public.user_profiles
    WHERE id = auth.uid()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'profile_not_found';
    END IF;

    IF v_new_display IS DISTINCT FROM v_current_display THEN
      IF v_updated_at IS NOT NULL AND v_updated_at > now() - INTERVAL '3 days' THEN
        RAISE EXCEPTION 'display_name_cooldown';
      END IF;

      UPDATE public.user_profiles
      SET display_name = v_new_display,
          display_name_updated_at = now(),
          language = COALESCE(p_language, language)
      WHERE id = auth.uid();

      RETURN;
    END IF;
  END IF;

  UPDATE public.user_profiles
  SET language = COALESCE(p_language, language)
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT) TO authenticated;

INSERT INTO public.app_meta (key, value, updated_at)
VALUES ('schema_version', '11', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;

COMMIT;
