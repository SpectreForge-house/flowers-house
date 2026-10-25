const PENDING_INVITE_ERROR_KEY = 'flower-shop-pending-invite-error';
export const PENDING_INVITE_ERROR_EVENT = 'flower-shop:pending-invite-error';

const TERMINAL_INVITE_ERRORS = new Set([
  'not_found',
  'expired',
  'revoked',
  'used',
]);

export function shouldClearPendingInviteAfterError(error?: string | null): boolean {
  if (!error) return false;
  return TERMINAL_INVITE_ERRORS.has(error);
}

export function setPendingInviteError(error: string): void {
  try {
    localStorage.setItem(PENDING_INVITE_ERROR_KEY, error);
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PENDING_INVITE_ERROR_EVENT));
  }
}

export function getPendingInviteError(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_ERROR_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInviteError(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_ERROR_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PENDING_INVITE_ERROR_EVENT));
  }
}
