import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ensureUserProfile } from '../services/authService';
import { getMyProfile } from '../services/teamService';
import { UserProfile } from '../types';

export function useMyProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      await ensureUserProfile(user);
      setProfile(await getMyProfile());
    } catch (err) {
      console.error('[Team] Failed to refresh profile:', err);
      setProfile(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    ensureUserProfile(user)
      .then(() => getMyProfile())
      .then(result => {
        if (!cancelled) setProfile(result);
      })
      .catch(err => {
        console.error('[Team] Failed to load profile:', err);
        if (!cancelled) {
          setProfile(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { profile, loading, error, refresh };
}
