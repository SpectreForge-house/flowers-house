-- ============================================================
-- Migration 003: Bootstrap function for shop + profile creation
-- Solves the RLS chicken-and-egg problem:
--   shops SELECT RLS requires user_profiles.shop_id
--   user_profiles INSERT requires shops.id (FK)
--   -> Neither can be read back after creation without a profile
-- SECURITY DEFINER runs as function owner, bypassing RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION create_initial_shop_and_profile(
  p_user_id UUID,
  p_shop_name TEXT
) RETURNS UUID AS $$
DECLARE
  v_shop_id UUID;
BEGIN
  -- Create the shop
  INSERT INTO shops (name) VALUES (p_shop_name) RETURNING id INTO v_shop_id;

  -- Create the user profile linked to the shop
  INSERT INTO user_profiles (id, shop_id, display_name, role)
  VALUES (p_user_id, v_shop_id, split_part(p_shop_name, '@', 1), 'owner');

  RETURN v_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
