import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { clearShopIdCache } from './supabaseStorage';
import { acceptShopInvite, clearPendingInviteToken, getPendingInviteToken } from './teamService';
import { setPendingInviteError, shouldClearPendingInviteAfterError } from './pendingInvite';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

type AuthListener = (state: AuthState) => void;

let currentState: AuthState = { user: null, session: null, loading: true };
let listeners: AuthListener[] = [];
let unsubscribeFn: (() => void) | null = null;
let profileReadyResolve: (() => void) | null = null;

export const profileReady = new Promise<void>(resolve => {
  profileReadyResolve = resolve;
});

function notify() {
  listeners.forEach(l => l({ ...currentState }));
}

function setState(partial: Partial<AuthState>) {
  currentState = { ...currentState, ...partial };
  notify();
}

export function getAuthState(): AuthState {
  return { ...currentState };
}

export function onAuthChange(listener: AuthListener): () => void {
  listeners.push(listener);
  listener({ ...currentState });
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

export async function ensureUserProfile(user: User): Promise<string | null> {
  if (!supabase) {
    console.error('[Auth] ensureUserProfile: supabase client not configured');
    return null;
  }

  const pendingInvite = getPendingInviteToken();
  if (pendingInvite) {
    const accepted = await acceptShopInvite(pendingInvite);

    if (accepted.ok && accepted.shopId) {
      clearPendingInviteToken();
      clearShopIdCache();
      window.location.reload();
      return accepted.shopId;
    }

    const error = accepted.error || 'unknown';
    setPendingInviteError(error);
    if (shouldClearPendingInviteAfterError(error)) {
      clearPendingInviteToken();
    }

    console.warn('[Auth] Pending invite could not be accepted:', error);
  }

  const { data: existing, error: lookupError } = await supabase
    .from('user_profiles')
    .select('shop_id')
    .eq('id', user.id)
    .single();

  if (existing?.shop_id) {
    return existing.shop_id;
  }

  if (lookupError && lookupError.code !== 'PGRST116') {
    console.error('[Auth] Profile lookup failed:', lookupError.code, lookupError.message);
  }

  const { data: shopId, error: rpcError } = await supabase
    .rpc('create_initial_shop_and_profile', {
      p_user_id: user.id,
      p_shop_name: user.email || "Flower's House",
    });

  if (rpcError) {
    console.error('[Auth] create_initial_shop_and_profile failed:', rpcError.message);
    return null;
  }

  if (!shopId) {
    console.error('[Auth] create_initial_shop_and_profile returned null');
    return null;
  }

  clearShopIdCache();
  return shopId as string;
}

export async function initAuth(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    setState({ loading: false });
    if (profileReadyResolve) profileReadyResolve();
    return;
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('[Auth] getSession error:', sessionError.message);
    }

    const user = session?.user ?? null;

    setState({
      session,
      user,
      loading: false,
    });

    if (user) {
      ensureUserProfile(user)
        .then(() => {
          if (profileReadyResolve) profileReadyResolve();
        })
        .catch(() => {
          if (profileReadyResolve) profileReadyResolve();
        });
    } else {
      if (profileReadyResolve) profileReadyResolve();
    }
  } catch (err) {
    console.error('[Auth] initAuth exception:', err);
    setState({ loading: false });
    if (profileReadyResolve) profileReadyResolve();
  }

  if (unsubscribeFn) unsubscribeFn();

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    if (!user) clearShopIdCache();
    setState({
      session,
      user,
      loading: false,
    });

    if (user) {
      ensureUserProfile(user)
        .then(() => {
          if (profileReadyResolve) profileReadyResolve();
        })
        .catch(() => {
          if (profileReadyResolve) profileReadyResolve();
        });
    }
  });

  unsubscribeFn = () => subscription.unsubscribe();
}

export async function signUp(email: string, password: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return { error: translateAuthError(error) };
  }
  return {};
}

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: translateAuthError(error) };
  }
  return {};
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  clearShopIdCache();
  await supabase.auth.signOut();
}

export function isSupabaseAvailable(): boolean {
  return isSupabaseConfigured && supabase !== null;
}

export async function getProfileLanguage(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('language')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Auth] Failed to load profile language:', error.message);
    return null;
  }
  return (data?.language as string) || null;
}

export async function updateProfileLanguage(language: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('update_my_profile', { p_language: language });
  if (error) console.error('[Auth] Failed to save profile language:', error.message);
}

function translateAuthError(error: AuthError): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'auth.invalidCredentials';
  if (msg.includes('user already registered')) return 'auth.userExists';
  if (msg.includes('password should be at least')) return 'auth.passwordTooShort';
  if (msg.includes('unable to validate email address')) return 'auth.invalidEmail';
  if (msg.includes('email not confirmed')) return 'auth.emailNotConfirmed';
  if (msg.includes('email rate limit exceeded')) return 'auth.rateLimited';
  if (msg.includes('invalid api key') || msg.includes('no api key found') || msg.includes('project not found')) return 'auth.serviceUnavailable';
  if (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  ) return 'auth.serviceUnavailable';
  console.error('[Auth] Unmapped auth error:', error.name, error.status, error.message);
  return 'auth.unknownError';
}
