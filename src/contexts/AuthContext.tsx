import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { initAuth, initAuthDeepLinks, onAuthChange, signOut as authSignOut, getAuthState } from '../services/authService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void initAuthDeepLinks();
    initAuth();

    const unsubscribe = onAuthChange((state) => {
      setUser(state.user);
      setLoading(state.loading);
    });

    return unsubscribe;
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
  }, []);

  const refreshAuth = useCallback(() => {
    const state = getAuthState();
    setUser(state.user);
    setLoading(state.loading);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
