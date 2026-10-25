import { describe, expect, it } from 'vitest';
import {
  clearPendingInviteToken,
  getPendingInviteToken,
  setPendingInviteToken,
} from './teamService';

describe('teamService pending invite', () => {
  it('stores a trimmed invite code and clears it', () => {
    setPendingInviteToken('  abc123  ');

    expect(getPendingInviteToken()).toBe('abc123');

    clearPendingInviteToken();

    expect(getPendingInviteToken()).toBeNull();
  });

  it('treats blank codes as absent', () => {
    setPendingInviteToken('   ');

    expect(getPendingInviteToken()).toBeNull();
  });
});
