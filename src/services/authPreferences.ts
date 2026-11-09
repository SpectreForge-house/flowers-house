/**
 * Small, dependency-free helpers for the "Remember me" login option.
 *
 * The flag decides where Supabase keeps the auth session:
 *   - remembered (default) -> localStorage, survives an app restart;
 *   - not remembered       -> sessionStorage, lives until the app is closed.
 *
 * The last successfully used email is kept separately so the login dialog can
 * offer "Sign in as ..." after an explicit sign-out or an expired session.
 */

const REMEMBER_KEY = 'flower-shop.auth.remember-me';
const LAST_EMAIL_KEY = 'flower-shop.auth.last-email';

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function isRememberMeEnabled(): boolean {
  return readLocal(REMEMBER_KEY) !== 'false';
}

export function setRememberMeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, enabled ? 'true' : 'false');
  } catch {
    // Storage can be unavailable (private mode/quota) - the app still works.
  }
}

export function getLastAccountEmail(): string | null {
  const email = readLocal(LAST_EMAIL_KEY)?.trim();
  return email || null;
}

export function rememberLastAccountEmail(email: string): void {
  const normalized = email.trim();
  if (!normalized) return;
  try {
    localStorage.setItem(LAST_EMAIL_KEY, normalized);
  } catch {
    // Ignore storage failures.
  }
}

export function clearLastAccountEmail(): void {
  try {
    localStorage.removeItem(LAST_EMAIL_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Supabase auth storage adapter. It mirrors the "Remember me" choice so an
 * unchecked box really signs the user out when the app is restarted instead
 * of silently keeping the refresh token forever.
 */
export const authStorage = {
  getItem(key: string): string | null {
    const persistent = readLocal(key);
    if (persistent !== null) return persistent;
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (isRememberMeEnabled()) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage failures.
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
  },
};
