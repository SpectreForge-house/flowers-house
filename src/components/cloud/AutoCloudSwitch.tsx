import { useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseAvailable } from '../../services/authService';
import { hasLocalData } from '../../services/localDataService';
import {
  getCloudModePreference,
  getStorageMode,
  setStorageMode,
} from '../../services/storageAdapter';

/** Session flag set before the reload, consumed by CloudSwitchNotice. */
export const CLOUD_SWITCH_NOTICE_KEY = 'flower-shop-cloud-switch-notice';

let switchStarted = false;

/**
 * Moves the app from local storage to Supabase once a cloud account is
 * available. The switch reloads the page so every hook picks up the new mode.
 * A manual "local storage" choice is preserved through the preference flag.
 */
export function AutoCloudSwitch() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (switchStarted || loading || !user) return;
    if (!isSupabaseAvailable()) return;
    if (getStorageMode() === 'supabase') return;
    if (getCloudModePreference() === 'local') return;

    switchStarted = true;

    try {
      if (hasLocalData()) {
        sessionStorage.setItem(CLOUD_SWITCH_NOTICE_KEY, '1');
      }
    } catch {
      // Ignore storage errors: the switch itself is still safe.
    }

    try {
      setStorageMode('supabase');
    } catch {
      switchStarted = false;
      return;
    }

    window.location.reload();
  }, [user, loading]);

  return null;
}
