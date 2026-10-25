-- ============================================================
-- Migration 008: Team invitations
-- Adds one-time invites for managers/staff, owner-only member
-- listing, invite acceptance and safe migration of an invited
-- user from their auto-created empty shop.
--
-- Apply after migrations 001-007.
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shop_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (email = lower(email)),
  role TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shop_invites_shop
  ON public.shop_invites(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_invites_email
  ON public.shop_invites(shop_id, email);

ALTER TABLE public.shop_invites ENABLE ROW LEVEL SECURITY;

-- Only the owner can see invite codes. All writes go through the RPCs below.
DROP POLICY IF EXISTS "owners_select_shop_invites" ON public.shop_invites;
CREATE POLICY "owners_select_shop_invites"
  ON public.shop_invites FOR SELECT
  USING (
    shop_id = public.current_shop_id()
    AND public.current_user_role() = 'owner'
  );

GRANT SELECT ON public.shop_invites TO authenticated;

-- ---------------------------------------------------------------------------
-- Allow the invite RPC to move a sole owner out of an empty shop.
-- The 007 trigger intentionally blocks profile moves; this narrow GUC is only
-- set inside accept_shop_invite() after all validation has passed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_profile_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Cannot change a profile id';
  END IF;

  IF NEW.shop_id <> OLD.shop_id
     AND current_setting('app.invite_accept', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Cannot move a profile to another shop';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_profile_identity_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_profile_identity_change() TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_owner_id UUID;
BEGIN
  -- Moving an invited sole owner out of their empty shop is handled by
  -- accept_shop_invite(): the old shop is deleted in the same transaction.
  IF current_setting('app.invite_accept', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role <> 'owner' THEN
      RETURN OLD;
    END IF;

    -- Deleting the auth user cascades into user_profiles. In that case the
    -- account is already gone, so do not block the cascade.
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.id) THEN
      RETURN OLD;
    END IF;

    v_shop_id := OLD.shop_id;
    v_owner_id := OLD.id;
  ELSE
    IF OLD.role <> 'owner' THEN
      RETURN NEW;
    END IF;

    -- Demotion or moving an owner to another shop also removes an owner.
    IF NEW.role = 'owner' AND NEW.shop_id = OLD.shop_id THEN
      RETURN NEW;
    END IF;

    v_shop_id := OLD.shop_id;
    v_owner_id := OLD.id;
  END IF;

  -- Serialise owner changes per shop to avoid two concurrent demotions
  -- leaving the shop without an owner.
  PERFORM pg_advisory_xact_lock(hashtext('shop-owners:' || v_shop_id::TEXT)::BIGINT);

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE shop_id = v_shop_id
      AND role = 'owner'
      AND id <> v_owner_id
  ) THEN
    RAISE EXCEPTION 'Cannot remove the last owner of shop %', v_shop_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_last_owner_removal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_last_owner_removal() TO authenticated;

-- ---------------------------------------------------------------------------
-- Owner-only member list (includes e-mail from auth.users)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_shop_members()
RETURNS TABLE (
  id UUID,
  email TEXT,
  display_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ,
  is_self BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_shop_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.shop_id INTO v_shop_id
  FROM public.user_profiles p
  WHERE p.id = v_user_id;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'No shop profile';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = v_user_id AND p.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the shop owner can list members';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::TEXT,
    p.display_name,
    p.role,
    p.created_at,
    (p.id = v_user_id)
  FROM public.user_profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.shop_id = v_shop_id
  ORDER BY
    CASE p.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
    lower(u.email);
END;
$$;

REVOKE ALL ON FUNCTION public.list_shop_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_shop_members() TO authenticated;

-- ---------------------------------------------------------------------------
-- Create an invite
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_shop_invite(
  p_email TEXT,
  p_role TEXT DEFAULT 'staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_shop_id UUID;
  v_email TEXT := lower(btrim(coalesce(p_email, '')));
  v_role TEXT := lower(btrim(coalesce(p_role, '')));
  v_invite public.shop_invites%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT p.shop_id INTO v_shop_id
  FROM public.user_profiles p
  WHERE p.id = v_user_id;

  IF v_shop_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_shop');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = v_user_id AND p.shop_id = v_shop_id AND p.role = 'owner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;

  IF v_email = '' OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  IF v_role NOT IN ('manager', 'staff') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.shop_id = v_shop_id
      AND lower(u.email) = v_email
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  -- A new invite replaces any previous pending invite for the same address.
  UPDATE public.shop_invites
  SET revoked_at = now()
  WHERE shop_id = v_shop_id
    AND email = v_email
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  INSERT INTO public.shop_invites (shop_id, email, role, invited_by)
  VALUES (v_shop_id, v_email, v_role, v_user_id)
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'ok', true,
    'invite', jsonb_build_object(
      'id', v_invite.id,
      'email', v_invite.email,
      'role', v_invite.role,
      'token', v_invite.token,
      'created_at', v_invite.created_at,
      'expires_at', v_invite.expires_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_shop_invite(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_shop_invite(TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Revoke a pending invite
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_shop_invite(p_invite_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_shop_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT p.shop_id INTO v_shop_id
  FROM public.user_profiles p
  WHERE p.id = v_user_id;

  IF v_shop_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = v_user_id AND p.shop_id = v_shop_id AND p.role = 'owner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;

  UPDATE public.shop_invites
  SET revoked_at = now()
  WHERE id = p_invite_id
    AND shop_id = v_shop_id
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_shop_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_shop_invite(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Accept an invite
--
-- New accounts normally get their own empty shop from
-- create_initial_shop_and_profile(). If an invited user already owns such an
-- empty shop, move the profile to the inviting shop and delete the old shop.
-- Anything with real data is rejected to avoid silent data loss.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_shop_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
  v_invite public.shop_invites%ROWTYPE;
  v_profile public.user_profiles%ROWTYPE;
  v_old_shop UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  SELECT * INTO v_invite
  FROM public.shop_invites
  WHERE token = btrim(coalesce(p_token, ''))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    IF v_invite.accepted_by = v_user_id THEN
      RETURN jsonb_build_object('ok', true, 'shop_id', v_invite.shop_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'used');
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;

  IF v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF v_email IS NULL OR lower(v_invite.email) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_profile.shop_id = v_invite.shop_id THEN
      UPDATE public.shop_invites
      SET accepted_at = now(), accepted_by = v_user_id
      WHERE id = v_invite.id;
      RETURN jsonb_build_object('ok', true, 'shop_id', v_invite.shop_id);
    END IF;

    IF v_profile.role <> 'owner' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_member_other_shop');
    END IF;

    v_old_shop := v_profile.shop_id;

    IF EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE shop_id = v_old_shop AND id <> v_user_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'shop_not_empty');
    END IF;

    IF EXISTS (SELECT 1 FROM public.customers WHERE shop_id = v_old_shop)
       OR EXISTS (SELECT 1 FROM public.inventory_items WHERE shop_id = v_old_shop)
       OR EXISTS (SELECT 1 FROM public.bouquets WHERE shop_id = v_old_shop)
       OR EXISTS (SELECT 1 FROM public.orders WHERE shop_id = v_old_shop)
       OR EXISTS (SELECT 1 FROM public.deliveries WHERE shop_id = v_old_shop)
       OR EXISTS (SELECT 1 FROM public.inventory_transactions WHERE shop_id = v_old_shop)
       OR EXISTS (SELECT 1 FROM public.inventory_reservations WHERE shop_id = v_old_shop)
       OR EXISTS (SELECT 1 FROM public.history WHERE shop_id = v_old_shop)
       OR EXISTS (SELECT 1 FROM public.settings WHERE shop_id = v_old_shop)
       OR EXISTS (SELECT 1 FROM public.client_purchases WHERE shop_id = v_old_shop)
       OR EXISTS (SELECT 1 FROM public.photos WHERE shop_id = v_old_shop)
       OR EXISTS (
         SELECT 1 FROM public.shop_invites
         WHERE shop_id = v_old_shop
           AND accepted_at IS NULL
           AND revoked_at IS NULL
       )
    THEN
      RETURN jsonb_build_object('ok', false, 'error', 'shop_not_empty');
    END IF;

    -- The 007 identity/last-owner triggers must allow this one controlled move.
    PERFORM set_config('app.invite_accept', 'on', true);
    UPDATE public.user_profiles
    SET shop_id = v_invite.shop_id,
        role = v_invite.role
    WHERE id = v_user_id;

    DELETE FROM public.shops WHERE id = v_old_shop;
    PERFORM set_config('app.invite_accept', 'off', true);
  ELSE
    INSERT INTO public.user_profiles (id, shop_id, display_name, role)
    VALUES (
      v_user_id,
      v_invite.shop_id,
      COALESCE(NULLIF(split_part(v_email, '@', 1), ''), 'Staff'),
      v_invite.role
    );
  END IF;

  UPDATE public.shop_invites
  SET accepted_at = now(), accepted_by = v_user_id
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('ok', true, 'shop_id', v_invite.shop_id);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_shop_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_shop_invite(TEXT) TO authenticated;

COMMIT;
