import { supabase } from '../lib/supabase';
import { clearShopIdCache } from './supabaseStorage';
import { getCurrentUserId } from './shopContext';
import { setStorageMode } from './storageAdapter';
import { clearPendingInviteError } from './pendingInvite';
import { InviteRole, ShopInvite, ShopMember, UserProfile, UserRole } from '../types';

const PENDING_INVITE_KEY = 'flower-shop-pending-invite';

export function normalizeInviteToken(token: string): string {
  return token.toLowerCase().replace(/[^0-9a-f]/g, '');
}

export interface InviteResult {
  ok: boolean;
  error?: string;
  invite?: ShopInvite;
  shopId?: string;
}

interface RawInvite {
  id: string;
  email: string;
  role: InviteRole;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
}

interface RawMember {
  id: string;
  email: string | null;
  display_name: string | null;
  role: UserRole;
  created_at: string;
  is_self: boolean;
}

export function setPendingInviteToken(token: string): void {
  try {
    const normalized = normalizeInviteToken(token);
    if (!normalized) {
      localStorage.removeItem(PENDING_INVITE_KEY);
      return;
    }
    localStorage.setItem(PENDING_INVITE_KEY, normalized);
    clearPendingInviteError();
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
}

export function getPendingInviteToken(): string | null {
  try {
    const token = localStorage.getItem(PENDING_INVITE_KEY);
    return token ? normalizeInviteToken(token) || null : null;
  } catch {
    return null;
  }
}

export function clearPendingInviteToken(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

function mapInvite(row: RawInvite): ShopInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at ?? null,
    revokedAt: row.revoked_at ?? null,
  };
}

function mapMember(row: RawMember): ShopMember {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    isSelf: row.is_self,
  };
}

export const DISPLAY_NAME_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

export async function getMyProfile(): Promise<UserProfile | null> {
  if (!supabase) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const baseColumns = 'id, shop_id, display_name, role, language, created_at';
  let result = await supabase
    .from('user_profiles')
    .select(`${baseColumns}, display_name_updated_at`)
    .eq('id', userId)
    .maybeSingle();

  // Keep older databases working until migration 011 is applied.
  if (result.error && /display_name_updated_at/i.test(result.error.message)) {
    result = await supabase
      .from('user_profiles')
      .select(baseColumns)
      .eq('id', userId)
      .maybeSingle();
  }

  const { data, error } = result;
  if (error) {
    console.error('[Team] Failed to load profile:', error.message);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    shopId: data.shop_id as string,
    displayName: (data.display_name as string | null) ?? null,
    displayNameUpdatedAt: (data.display_name_updated_at as string | null | undefined) ?? null,
    role: data.role as UserRole,
    language: (data.language as string) || 'en',
    createdAt: data.created_at as string,
  };
}

export function getDisplayNameCooldownEnd(updatedAt: string | null): Date | null {
  if (!updatedAt) return null;
  const time = new Date(updatedAt).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time + DISPLAY_NAME_COOLDOWN_MS);
}

export async function updateMyDisplayName(displayName: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase.rpc('update_my_profile', {
    p_display_name: displayName.trim(),
  });

  if (error) throw new Error(error.message);
}

export async function listShopMembers(): Promise<ShopMember[]> {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.rpc('list_shop_members');
  if (error) throw new Error(error.message);

  return ((data || []) as RawMember[]).map(mapMember);
}

export async function listShopInvites(): Promise<ShopInvite[]> {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('shop_invites')
    .select('id, email, role, token, created_at, expires_at, accepted_at, revoked_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return ((data || []) as RawInvite[]).map(mapInvite);
}

export async function createShopInvite(email: string, role: InviteRole): Promise<InviteResult> {
  if (!supabase) return { ok: false, error: 'not_configured' };

  const { data, error } = await supabase.rpc('create_shop_invite', {
    p_email: email,
    p_role: role,
  });

  if (error) return { ok: false, error: error.message };

  const payload = data as { ok?: boolean; error?: string; invite?: RawInvite } | null;
  if (!payload?.ok || !payload.invite) {
    return { ok: false, error: payload?.error || 'unknown' };
  }

  return { ok: true, invite: mapInvite(payload.invite) };
}

export async function revokeShopInvite(inviteId: string): Promise<InviteResult> {
  if (!supabase) return { ok: false, error: 'not_configured' };

  const { data, error } = await supabase.rpc('revoke_shop_invite', {
    p_invite_id: inviteId,
  });

  if (error) return { ok: false, error: error.message };

  const payload = data as { ok?: boolean; error?: string } | null;
  return payload?.ok
    ? { ok: true }
    : { ok: false, error: payload?.error || 'unknown' };
}

export async function acceptShopInvite(token: string): Promise<InviteResult> {
  if (!supabase) return { ok: false, error: 'not_configured' };

  const { data, error } = await supabase.rpc('accept_shop_invite', {
    p_token: normalizeInviteToken(token),
  });

  if (error) return { ok: false, error: error.message };

  const payload = data as { ok?: boolean; error?: string; shop_id?: string } | null;
  if (!payload?.ok || !payload.shop_id) {
    return { ok: false, error: payload?.error || 'unknown' };
  }

  clearPendingInviteToken();
  clearPendingInviteError();
  clearShopIdCache();
  setStorageMode('supabase');
  return { ok: true, shopId: payload.shop_id };
}

export async function updateMemberRole(memberId: string, role: UserRole): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('user_profiles')
    .update({ role })
    .eq('id', memberId);

  if (error) throw new Error(error.message);
}

export async function transferOwnership(
  memberId: string,
  previousRole: UserRole,
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');
  if (userId === memberId) throw new Error('Cannot transfer ownership to yourself');

  const { error: promoteError } = await supabase
    .from('user_profiles')
    .update({ role: 'owner' })
    .eq('id', memberId);

  if (promoteError) throw new Error(promoteError.message);

  const { error: demoteError } = await supabase
    .from('user_profiles')
    .update({ role: 'manager' })
    .eq('id', userId);

  if (demoteError) {
    await supabase
      .from('user_profiles')
      .update({ role: previousRole })
      .eq('id', memberId);
    throw new Error(demoteError.message);
  }
}

export async function removeMember(memberId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('user_profiles')
    .delete()
    .eq('id', memberId);

  if (error) throw new Error(error.message);
}
