import { createContext, useCallback, useContext, useEffect, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useMyProfile } from '../hooks/useMyProfile';
import { getStorageMode } from '../services/storageAdapter';
import { hasPermission, resolveRole, type Permission } from '../services/permissions';
import { UserProfile, UserRole } from '../types';

interface PermissionsContextType {
  role: UserRole | null;
  profile: UserProfile | null;
  loading: boolean;
  error: boolean;
  can: (permission: Permission) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile, loading: profileLoading, error: profileError, refresh } = useMyProfile();
  const storageMode = getStorageMode();
  const role = resolveRole({
    storageMode,
    hasUser: Boolean(user),
    profileRole: profile?.role ?? null,
  });

  const loading = storageMode === 'supabase' && Boolean(user) && profileLoading;
  const error = storageMode === 'supabase' && Boolean(user) && profileError;

  const can = useCallback(
    (permission: Permission) => hasPermission(role, permission),
    [role],
  );

  useEffect(() => {
    if (storageMode !== 'supabase' || !user) return;

    const handleFocus = () => {
      void refresh();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refresh, storageMode, user]);

  const value = useMemo(
    () => ({ role, profile, loading, error, can, refresh }),
    [role, profile, loading, error, can, refresh],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}
