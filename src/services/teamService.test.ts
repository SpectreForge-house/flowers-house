import { describe, expect, it } from 'vitest';
import {
  clearPendingInviteToken,
  getPendingInviteToken,
  normalizeInviteToken,
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

  it('normalizes case and pasted whitespace', () => {
    expect(normalizeInviteToken('  ABC123 \n def456\t ')).toBe('abc123def456');
    expect(normalizeInviteToken('AB-CD-EF')).toBe('abcdef');
  });

  it('stores the normalized code', () => {
    setPendingInviteToken('  ABC123 \n DEF456 ');

    expect(getPendingInviteToken()).toBe('abc123def456');

    clearPendingInviteToken();
  });
});
