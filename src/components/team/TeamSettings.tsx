import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Copy, KeyRound, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { InviteRole, ShopInvite, ShopMember, UserProfile, UserRole } from '../../types';
import {
  acceptShopInvite,
  createShopInvite,
  listShopInvites,
  listShopMembers,
  normalizeInviteToken,
  removeMember,
  revokeShopInvite,
  transferOwnership,
  updateMemberRole,
} from '../../services/teamService';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { showToast } from '../ui/Toast';

interface TeamSettingsProps {
  profile: UserProfile | null;
  onRefreshProfile?: () => Promise<void>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date, 'dd.MM.yyyy HH:mm');
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy copy path.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function TeamSettings({ profile, onRefreshProfile }: TeamSettingsProps) {
  const { t } = useLanguage();
  const isOwner = profile?.role === 'owner';

  const [members, setMembers] = useState<ShopMember[]>([]);
  const [invites, setInvites] = useState<ShopInvite[]>([]);
  const [loading, setLoading] = useState(isOwner);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('staff');
  const [creating, setCreating] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<ShopInvite | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ShopMember | null>(null);
  const [confirmTransfer, setConfirmTransfer] = useState<ShopMember | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ShopInvite | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [refreshingProfile, setRefreshingProfile] = useState(false);

  const roleLabel = useCallback(
    (role: UserRole) => {
      if (role === 'owner') return t.team.owner;
      if (role === 'manager') return t.team.manager;
      return t.team.staff;
    },
    [t.team.manager, t.team.owner, t.team.staff],
  );

  const load = useCallback(async () => {
    if (!isOwner) return;

    setLoading(true);
    try {
      const [nextMembers, nextInvites] = await Promise.all([
        listShopMembers(),
        listShopInvites(),
      ]);
      setMembers(nextMembers);
      setInvites(nextInvites);
    } catch (error) {
      console.error('[Team] Failed to load team:', error);
      showToast('error', t.team.loadError);
    } finally {
      setLoading(false);
    }
  }, [isOwner, t.team.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const createErrorLabel = (code?: string): string => {
    if (code === 'invalid_email') return t.team.invalidEmail;
    if (code === 'already_member') return t.team.alreadyMember;
    if (code === 'not_owner') return t.team.onlyOwner;
    if (code === 'invalid_role') return t.team.invalidRole;
    return t.team.inviteError;
  };

  const joinErrorLabel = (code?: string): string => {
    switch (code) {
      case 'not_found':
        return t.team.joinNotFound;
      case 'expired':
        return t.team.joinExpired;
      case 'revoked':
        return t.team.joinRevoked;
      case 'used':
        return t.team.joinUsed;
      case 'email_mismatch':
        return t.team.joinEmailMismatch;
      case 'shop_not_empty':
        return t.team.joinShopNotEmpty;
      case 'already_member_other_shop':
        return t.team.joinAlreadyMember;
      default:
        return t.team.joinError;
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || creating) return;

    setCreating(true);
    try {
      const result = await createShopInvite(email.trim(), inviteRole);
      if (!result.ok || !result.invite) {
        showToast('error', createErrorLabel(result.error));
        return;
      }

      setCreatedInvite(result.invite);
      setEmail('');
      showToast('success', t.team.inviteCreated);
      await load();
    } catch (error) {
      console.error('[Team] Failed to create invite:', error);
      showToast('error', t.team.inviteError);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (value: string) => {
    const copied = await copyText(value);
    showToast(copied ? 'success' : 'warning', copied ? t.team.copied : t.team.copyFailed);
  };

  const handleRevoke = async (invite: ShopInvite) => {
    try {
      const result = await revokeShopInvite(invite.id);
      if (!result.ok) {
        showToast('error', t.team.revokeError);
        return;
      }
      if (createdInvite?.id === invite.id) setCreatedInvite(null);
      showToast('success', t.team.revoked);
      await load();
    } catch (error) {
      console.error('[Team] Failed to revoke invite:', error);
      showToast('error', t.team.revokeError);
    }
  };

  const handleRoleChange = async (member: ShopMember, role: UserRole) => {
    if (member.role === role || busyMemberId) return;

    if (role === 'owner') {
      setConfirmTransfer(member);
      return;
    }

    setBusyMemberId(member.id);
    try {
      await updateMemberRole(member.id, role);
      showToast('success', t.team.roleUpdated);
      await load();
    } catch (error) {
      console.error('[Team] Failed to update role:', error);
      showToast('error', t.team.roleUpdateError);
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleTransfer = async (member: ShopMember) => {
    setBusyMemberId(member.id);
    try {
      await transferOwnership(member.id, member.role);
      showToast('success', t.team.transferred);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error('[Team] Failed to transfer ownership:', error);
      showToast('error', t.team.transferError);
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRemove = async (member: ShopMember) => {
    setBusyMemberId(member.id);
    try {
      await removeMember(member.id);
      showToast('success', t.team.memberRemoved);
      await load();
    } catch (error) {
      console.error('[Team] Failed to remove member:', error);
      showToast('error', t.team.removeError);
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRefreshProfile = async () => {
    if (!onRefreshProfile || refreshingProfile) return;

    setRefreshingProfile(true);
    try {
      await onRefreshProfile();
    } finally {
      setRefreshingProfile(false);
    }
  };

  const handleJoin = async () => {
    const token = normalizeInviteToken(joinCode);
    if (!token || joining) return;

    if (token.length !== 32) {
      showToast('error', t.team.joinInvalidCode);
      return;
    }

    setJoining(true);
    try {
      const result = await acceptShopInvite(token);
      if (!result.ok) {
        showToast('error', joinErrorLabel(result.error));
        return;
      }

      showToast('success', t.team.joinSuccess);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error('[Team] Failed to accept invite:', error);
      showToast('error', t.team.joinError);
    } finally {
      setJoining(false);
    }
  };

  const now = Date.now();
  const pendingInvites = invites.filter(invite =>
    !invite.acceptedAt
    && !invite.revokedAt
    && new Date(invite.expiresAt).getTime() > now
    && invite.id !== createdInvite?.id,
  );
  const ownerCount = members.filter(member => member.role === 'owner').length;
  const showJoinPanel = !isOwner || (!loading && members.length <= 1);

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Users size={20} className="text-accent-green-light shrink-0" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text-primary">{t.team.title}</h2>
            <p className="text-text-secondary text-sm">{t.team.subtitle}</p>
          </div>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => void load()}
            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-hover"
            title={t.team.refresh}
            aria-label={t.team.refresh}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {!profile && (
        <div className="rounded-lg bg-surface border border-border p-4 space-y-3">
          <p className="text-sm text-text-secondary">{t.team.profileUnavailable}</p>
          {onRefreshProfile && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRefreshProfile()}
              isLoading={refreshingProfile}
            >
              {t.permissions.retry}
            </Button>
          )}
        </div>
      )}

      {profile && !isOwner && (
        <div className="rounded-lg bg-surface border border-border p-4 space-y-1">
          <p className="text-sm text-text-secondary">{t.team.onlyOwner}</p>
          <p className="text-sm text-text-primary">
            {t.team.yourRole}: <span className="font-medium">{roleLabel(profile.role)}</span>
          </p>
        </div>
      )}

      {isOwner && (loading ? (
        <p className="text-sm text-text-muted">{t.team.loading}</p>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-text-primary">{t.team.members}</h3>
            <p className="text-xs text-text-muted">{t.team.transferHint}</p>
            {members.map(member => {
              const isLastOwner = member.role === 'owner' && ownerCount <= 1;
              const busy = busyMemberId === member.id;

              return (
                <div
                  key={member.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border bg-surface p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {member.displayName || member.email || t.team.member}
                      </span>
                      {member.isSelf && (
                        <span className="shrink-0 rounded bg-accent-green/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-green-light">
                          {t.team.you}
                        </span>
                      )}
                    </div>
                    {member.email && (
                      <p className="text-xs text-text-muted truncate">{member.email}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 sm:shrink-0">
                    <label className="sr-only" htmlFor={`role-${member.id}`}>{t.team.role}</label>
                    <select
                      id={`role-${member.id}`}
                      value={member.role}
                      disabled={member.isSelf || busy}
                      onChange={event => void handleRoleChange(member, event.target.value as UserRole)}
                      className="px-2 py-1.5 bg-card border border-border rounded-lg text-xs text-text-primary disabled:opacity-60"
                    >
                      <option value="owner">{t.team.owner}</option>
                      <option value="manager">{t.team.manager}</option>
                      <option value="staff">{t.team.staff}</option>
                    </select>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={member.isSelf || isLastOwner || busy}
                      onClick={() => setConfirmRemove(member)}
                      title={t.team.removeMember}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus size={16} className="text-accent-green-light" />
              <h3 className="text-sm font-semibold text-text-primary">{t.team.inviteTitle}</h3>
            </div>
            <p className="text-xs text-text-secondary">{t.team.inviteDescription}</p>

            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder={t.team.emailPlaceholder}
                aria-label={t.team.email}
                className="flex-1 min-w-0 px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent outline-none text-sm"
              />
              <select
                value={inviteRole}
                onChange={event => setInviteRole(event.target.value as InviteRole)}
                aria-label={t.team.inviteRole}
                className="px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
              >
                <option value="staff">{t.team.staff}</option>
                <option value="manager">{t.team.manager}</option>
              </select>
              <Button type="submit" size="sm" disabled={!email.trim() || creating} isLoading={creating}>
                {creating ? t.team.creatingInvite : t.team.createInvite}
              </Button>
            </form>

            {createdInvite && (
              <div className="rounded-lg border border-accent-green/30 bg-accent-green/10 p-3 space-y-2">
                <p className="text-xs text-text-secondary">
                  {createdInvite.email} · {roleLabel(createdInvite.role)}
                </p>
                <div className="flex items-start gap-2">
                  <code className="flex-1 min-w-0 break-all rounded bg-card border border-border px-2 py-1.5 text-xs text-text-primary">
                    {createdInvite.token}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleCopy(createdInvite.token)}
                    title={t.team.copyCode}
                  >
                    <Copy size={14} />
                  </Button>
                </div>
                <p className="text-[11px] text-text-muted">
                  {t.team.expires}: {formatDate(createdInvite.expiresAt)}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-xs font-medium text-text-secondary">{t.team.pendingInvites}</h4>
              {pendingInvites.length === 0 ? (
                <p className="text-xs text-text-muted">{t.team.noInvites}</p>
              ) : (
                pendingInvites.map(invite => (
                  <div
                    key={invite.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border bg-surface p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary truncate">{invite.email}</p>
                      <p className="text-[11px] text-text-muted">
                        {roleLabel(invite.role)} · {t.team.expires}: {formatDate(invite.expiresAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 sm:shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleCopy(invite.token)}
                        title={t.team.copyCode}
                      >
                        <Copy size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmRevoke(invite)}
                        title={t.team.revoke}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      ))}

      {showJoinPanel && (
        <section className="border-t border-border mt-4 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-accent-green-light" />
            <h3 className="text-sm font-semibold text-text-primary">{t.team.joinTitle}</h3>
          </div>
          <p className="text-xs text-text-secondary">{t.team.joinDescription}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={joinCode}
              onChange={event => setJoinCode(normalizeInviteToken(event.target.value))}
              placeholder={t.team.joinCodePlaceholder}
              aria-label={t.team.joinCode}
              className="flex-1 min-w-0 px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent outline-none text-sm font-mono"
            />
            <Button
              size="sm"
              onClick={() => void handleJoin()}
              disabled={!joinCode || joining}
              isLoading={joining}
            >
              {joining ? t.team.joining : t.team.join}
            </Button>
          </div>
        </section>
      )}

      <ConfirmDialog
        isOpen={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) void handleRemove(confirmRemove);
        }}
        title={t.team.removeTitle}
        message={t.team.removeConfirm.replace(
          '{email}',
          confirmRemove?.email || confirmRemove?.displayName || t.team.member,
        )}
        confirmLabel={t.team.removeMember}
        cancelLabel={t.common.cancel}
      />

      <ConfirmDialog
        isOpen={confirmTransfer !== null}
        onClose={() => setConfirmTransfer(null)}
        onConfirm={() => {
          if (confirmTransfer) void handleTransfer(confirmTransfer);
        }}
        title={t.team.transferTitle}
        message={t.team.transferConfirm
          .split('{name}')
          .join(confirmTransfer?.displayName || confirmTransfer?.email || t.team.member)}
        confirmLabel={t.team.transferAction}
        cancelLabel={t.common.cancel}
        variant="warning"
      />

      <ConfirmDialog
        isOpen={confirmRevoke !== null}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={() => {
          if (confirmRevoke) void handleRevoke(confirmRevoke);
        }}
        title={t.team.revokeTitle}
        message={t.team.revokeConfirm.replace('{email}', confirmRevoke?.email || '')}
        confirmLabel={t.team.revoke}
        cancelLabel={t.common.cancel}
      />
    </div>
  );
}
