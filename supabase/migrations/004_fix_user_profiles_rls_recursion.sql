-- ============================================================
-- Migration 004: Fix infinite recursion in user_profiles RLS
-- Problem: policies #2 and #3 query user_profiles from within
-- policies ON user_profiles, causing PostgreSQL 42P17.
-- Fix: drop recursive policies, keep only non-recursive ones.
-- ============================================================

-- Drop the recursive SELECT policy
DROP POLICY IF EXISTS "Users can read profiles in own shop" ON user_profiles;

-- Drop the recursive ALL (SELECT+INSERT+UPDATE+DELETE) policy
DROP POLICY IF EXISTS "Owners can manage profiles in own shop" ON user_profiles;

-- Verify safe policies remain (idempotent recreation):
-- "Users can read own profile" — non-recursive, uses auth.uid() only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND policyname = 'Users can read own profile'
  ) THEN
    CREATE POLICY "Users can read own profile"
      ON user_profiles FOR SELECT
      USING (id = auth.uid());
  END IF;
END $$;

-- "Authenticated users can create own profile" — non-recursive INSERT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND policyname = 'Authenticated users can create own profile'
  ) THEN
    CREATE POLICY "Authenticated users can create own profile"
      ON user_profiles FOR INSERT
      WITH CHECK (id = auth.uid());
  END IF;
END $$;
