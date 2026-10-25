-- ============================================================
-- Migration 002: Add INSERT RLS policies for shops & user_profiles
-- These allow new users to create their shop + profile on first signup.
-- ============================================================

-- shops: allow authenticated users to create a shop
CREATE POLICY "Authenticated users can create shop"
  ON shops FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- user_profiles: allow authenticated users to create their own profile
CREATE POLICY "Authenticated users can create own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());
