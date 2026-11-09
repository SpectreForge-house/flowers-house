import { User, Session, AuthError } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { clearShopIdCache } from './supabaseStorage';
import { acceptShopInvite, clearPendingInviteToken, getPendingInviteToken } from './teamService';
import { setPendingInviteError, shouldClearPendingInviteAfterError } from './pendingInvite';
import {
  clearLastAccountEmail,
  isRememberMeEnabled,
  rememberLastAccountEmail,
  setRememberMeEnabled,
} from './authPreferences';

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

const NATIVE_AUTH_SCHEME = 'com.flowershouse.app';

function getAuthRedirectUrl(path: string): string | undefined {
  // Packaged Android/iOS builds must return through a custom scheme so the
  // email link reopens the app instead of a browser tab.
  if (Capacitor.isNativePlatform()) {
    const nativePath = path === '/' ? 'auth/confirm' : path.replace(/^\/+/, '');
    return `${NATIVE_AUTH_SCHEME}://${nativePath}`;
  }

  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (configured) {
    return new URL(path, configured.endsWith('/') ? configured : `${configured}/`).toString();
  }

  // Email links cannot return to file:// (Electron) or a packaged app:// shell.
  if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    return new URL(path, window.location.origin).toString();
  }

  return undefined;
}

function redirectAfterDeepLink(path: string): void {
  if (typeof window === 'undefined') return;
  window.location.replace(path);
}

export async function handleAuthDeepLink(url: string): Promise<void> {
  if (!supabase) return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const query = new URLSearchParams(parsed.search);
  const error = hash.get('error') || query.get('error');
  const errorCode = hash.get('error_code') || query.get('error_code');
  const isRecovery =
    parsed.hostname === 'reset-password' ||
    parsed.pathname.replace(/^\/+/, '').startsWith('reset-password');

  if (error) {
    const params = new URLSearchParams({ error });
    if (errorCode) params.set('error_code', errorCode);
    redirectAfterDeepLink(`/reset-password?${params.toString()}`);
    return;
  }

  const accessToken = hash.get('access_token') || query.get('access_token');
  const refreshToken = hash.get('refresh_token') || query.get('refresh_token');

  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) {
      console.error('[Auth] Native deep link session failed:', sessionError.message);
      redirectAfterDeepLink('/reset-password?error=access_denied&error_code=otp_expired');
      return;
    }
  } else {
    const code = query.get('code');
    if (!code) return;
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error('[Auth] Native deep link exchange failed:', exchangeError.message);
      redirectAfterDeepLink('/reset-password?error=access_denied&error_code=otp_expired');
      return;
    }
  }

  redirectAfterDeepLink(isRecovery ? '/reset-password' : '/');
}

export async function initAuthDeepLinks(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await App.addListener('appUrlOpen', ({ url }) => {
    void handleAuthDeepLink(url);
  });

  const launchUrl = await App.getLaunchUrl();
  if (launchUrl?.url) {
    await handleAuthDeepLink(launchUrl.url);
  }
}

export interface AuthActionResult {
  error?: string;
  /** Seconds until the user may retry after a rate-limit error. */
  retryAfterSeconds?: number;
}

export async function signUp(
  email: string,
  password: string,
  rememberMe = true,
): Promise<AuthActionResult & { needsEmailConfirmation?: boolean; email?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  // The storage adapter reads this flag while Supabase writes the session.
  setRememberMeEnabled(rememberMe);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: getAuthRedirectUrl('/') },
  });
  if (error) {
    return authErrorResult(error);
  }

  if (rememberMe) rememberLastAccountEmail(email);
  else clearLastAccountEmail();

  return {
    needsEmailConfirmation: !data.session && Boolean(data.user),
    email,
  };
}

export async function signIn(
  email: string,
  password: string,
  rememberMe = true,
): Promise<AuthActionResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  // The storage adapter reads this flag while Supabase writes the session.
  setRememberMeEnabled(rememberMe);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return authErrorResult(error);
  }

  if (rememberMe) rememberLastAccountEmail(email);
  else clearLastAccountEmail();
  return {};
}

export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthRedirectUrl('/reset-password'),
  });
  if (error) {
    return authErrorResult(error);
  }
  return {};
}

export async function resendConfirmationEmail(email: string): Promise<AuthActionResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: getAuthRedirectUrl('/') },
  });
  if (error) {
    return authErrorResult(error);
  }
  return {};
}

export async function updatePassword(password: string): Promise<AuthActionResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return authErrorResult(error);
  }
  return {};
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  clearShopIdCache();
  await supabase.auth.signOut();
  // Keep the email for the "Sign in as ..." hint only when the user chose to
  // be remembered; an unchecked box also forgets the account.
  if (!isRememberMeEnabled()) clearLastAccountEmail();
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

const DEFAULT_RATE_LIMIT_SECONDS = 60;
const DEFAULT_EMAIL_RATE_LIMIT_SECONDS = 3600;

function parseRetryAfterSeconds(message: string, fallbackSeconds: number): number {
  const match = message.toLowerCase().match(/(?:after|in)\s+(\d+)\s*(second|minute|hour)s?/);
  if (!match) return fallbackSeconds;

  const value = parseInt(match[1], 10);
  if (match[2] === 'minute') return value * 60;
  if (match[2] === 'hour') return value * 3600;
  return value;
}

function authErrorResult(error: AuthError): AuthActionResult {
  const key = translateAuthError(error);
  if (key === 'auth.emailRateLimited') {
    return {
      error: key,
      retryAfterSeconds: parseRetryAfterSeconds(error.message, DEFAULT_EMAIL_RATE_LIMIT_SECONDS),
    };
  }
  if (key !== 'auth.rateLimited') return { error: key };
  return { error: key, retryAfterSeconds: parseRetryAfterSeconds(error.message, DEFAULT_RATE_LIMIT_SECONDS) };
}

function translateAuthError(error: AuthError): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'auth.invalidCredentials';
  if (msg.includes('user already registered')) return 'auth.userExists';
  if (msg.includes('password should be at least')) return 'auth.passwordTooShort';
  if (msg.includes('unable to validate email address')) return 'auth.invalidEmail';
  if (msg.includes('email not confirmed')) return 'auth.emailNotConfirmed';
  if (msg.includes('email rate limit exceeded') || msg.includes('over_email_send_rate_limit')) return 'auth.emailRateLimited';
  if (msg.includes('for security purposes')) return 'auth.rateLimited';
  if (msg.includes('password should be different') || msg.includes('new password should be different')) return 'auth.passwordSame';
  if (msg.includes('signup requires a valid password')) return 'auth.passwordTooShort';
  if (msg.includes('email link is invalid or has expired') || msg.includes('token has expired')) return 'auth.linkExpired';
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
