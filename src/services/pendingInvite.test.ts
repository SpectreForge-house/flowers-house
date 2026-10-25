import { describe, expect, it } from 'vitest';
import { shouldClearPendingInviteAfterError } from './pendingInvite';

describe('shouldClearPendingInviteAfterError', () => {
  it.each(['not_found', 'expired', 'revoked', 'used'])(
    'clears terminal invite error "%s"',
    (error) => {
      expect(shouldClearPendingInviteAfterError(error)).toBe(true);
    },
  );

  it.each(['email_mismatch', 'shop_not_empty', 'already_member_other_shop', 'unknown', ''])(
    'keeps the token for recoverable error "%s"',
    (error) => {
      expect(shouldClearPendingInviteAfterError(error)).toBe(false);
    },
  );

  it('keeps the token when no error is provided', () => {
    expect(shouldClearPendingInviteAfterError()).toBe(false);
    expect(shouldClearPendingInviteAfterError(null)).toBe(false);
  });
});
