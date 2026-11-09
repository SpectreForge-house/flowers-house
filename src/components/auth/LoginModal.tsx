import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Flower2, Loader2, X } from 'lucide-react';
import { requestPasswordReset, resendConfirmationEmail, signIn, signUp } from '../../services/authService';
import { getLastAccountEmail, isRememberMeEnabled } from '../../services/authPreferences';
import { normalizeInviteToken, setPendingInviteToken } from '../../services/teamService';
import { useLanguage } from '../../i18n';
import { PasswordInput } from '../ui/PasswordInput';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Mode = 'signin' | 'signup' | 'reset' | 'checkEmail' | 'resetSent';

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { t, tMessage } = useLanguage();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [noticeEmail, setNoticeEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const [rateLimitKey, setRateLimitKey] = useState('auth.rateLimitedWithTime');
  const [now, setNow] = useState(() => Date.now());
  const [rememberMe, setRememberMe] = useState(() => isRememberMeEnabled());
  const [suggestedEmail, setSuggestedEmail] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Every time the dialog opens, offer the account used last on this device
  // (after sign-out or an expired session) and restore the saved preference.
  useEffect(() => {
    if (!isOpen) return;
    setRememberMe(isRememberMeEnabled());
    const last = getLastAccountEmail();
    setSuggestedEmail(last);
    if (last) setEmail(prev => (prev.trim() ? prev : last));
  }, [isOpen]);

  useEffect(() => {
    if (!rateLimitUntil) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= rateLimitUntil) {
        setRateLimitUntil(null);
        setError('');
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [rateLimitUntil]);

  if (!isOpen) return null;

  const remainingSeconds = rateLimitUntil
    ? Math.max(0, Math.ceil((rateLimitUntil - now) / 1000))
    : 0;
  const isRateLimited = remainingSeconds > 0;

  const formatRemaining = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = String(seconds % 60).padStart(2, '0');
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`;
    return `${minutes}:${secs}`;
  };

  const rateLimitClock = tMessage({
    key: 'auth.rateLimitedWithTime',
    params: { time: formatRemaining(remainingSeconds) },
  });
  const rateLimitMessage = isRateLimited
    ? rateLimitKey === 'auth.emailRateLimited'
      ? `${tMessage({ key: rateLimitKey })} ${rateLimitClock}`
      : rateLimitClock
    : '';

  const showAuthError = (result: { error?: string; retryAfterSeconds?: number }) => {
    if (!result.error) return;
    setError(tMessage({ key: result.error }));
    if ((result.error === 'auth.rateLimited' || result.error === 'auth.emailRateLimited') && result.retryAfterSeconds) {
      const current = Date.now();
      setNow(current);
      setRateLimitKey(result.error === 'auth.emailRateLimited' ? 'auth.emailRateLimited' : 'auth.rateLimitedWithTime');
      setRateLimitUntil(current + result.retryAfterSeconds * 1000);
    }
  };

  const clearForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setInviteCode('');
    setNoticeEmail('');
    setError('');
  };

  const finish = () => {
    clearForm();
    setMode('signin');
    onClose();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setRateLimitUntil(null);
    setRateLimitKey('auth.rateLimitedWithTime');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError('');

    if (mode === 'signup' && password !== confirmPassword) {
      setError(t.auth.passwordsDoNotMatch);
      return;
    }

    const normalizedInvite = normalizeInviteToken(inviteCode);
    if (mode === 'signup' && inviteCode.trim() && normalizedInvite.length !== 32) {
      setError(t.team.joinInvalidCode);
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      if (mode === 'reset') {
        const result = await requestPasswordReset(email.trim());
        if (result.error) {
          showAuthError(result);
          return;
        }
        setNoticeEmail(email.trim());
        setPassword('');
        setMode('resetSent');
        return;
      }

      if (mode === 'signup' && normalizedInvite) {
        setPendingInviteToken(normalizedInvite);
      }

      const result = mode === 'signup'
        ? await signUp(email, password, rememberMe)
        : await signIn(email, password, rememberMe);

      if (result.error) {
        showAuthError(result);
        return;
      }

      if (mode === 'signup' && 'needsEmailConfirmation' in result && result.needsEmailConfirmation) {
        setNoticeEmail(email);
        setPassword('');
        setInviteCode('');
        setMode('checkEmail');
        return;
      }

      finish();
    } catch (err) {
      console.error('[Auth] Request failed:', err);
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      const isConnectionError = ['fetch', 'network', 'timeout', 'timed out'].some(part => message.includes(part));
      setError(isConnectionError ? t.auth.serviceUnavailable : t.auth.unknownError);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await resendConfirmationEmail(noticeEmail);
      if (result.error) {
        showAuthError(result);
      }
    } finally {
      setLoading(false);
    }
  };

  const title = {
    signin: t.auth.signInTitle,
    signup: t.auth.signUpTitle,
    reset: t.auth.resetTitle,
    checkEmail: t.auth.checkEmailTitle,
    resetSent: t.auth.resetSentTitle,
  }[mode];

  const showForm = mode === 'signin' || mode === 'signup' || mode === 'reset';

  return createPortal(
    <div className="fixed inset-0 modal-overlay lg:left-64 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-card rounded-lg border border-border shadow-2xl overflow-hidden">
        <button
          type="button"
          onClick={finish}
          title={t.common.close}
          aria-label={t.common.close}
          className="absolute top-3 right-3 p-2 text-text-muted hover:text-text-primary hover:bg-hover rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
        <div className="p-6">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent-green flex items-center justify-center">
              <Flower2 size={24} className="text-text-primary" />
            </div>
            <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          </div>

          {mode === 'signin'
            && suggestedEmail
            && email.trim().toLowerCase() === suggestedEmail.toLowerCase() && (
              <p className="mb-4 text-sm text-text-secondary bg-accent-green/10 border border-accent-green/20 rounded-lg px-3 py-2">
                {t.auth.welcomeBack.replace('{email}', suggestedEmail)}
              </p>
            )}

          {showForm ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.auth.email}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.auth.emailPlaceholder}
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent outline-none"
                />
              </div>

              {mode === 'reset' ? (
                <p className="text-sm text-text-secondary">{t.auth.resetDescription}</p>
              ) : (
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t.auth.password}</label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    placeholder={t.auth.passwordPlaceholder}
                    required
                    minLength={6}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t.auth.confirmPassword}</label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder={t.auth.passwordPlaceholder}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    {t.team.inviteCodeOptional}
                  </label>
                  <input
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(normalizeInviteToken(e.target.value))}
                    placeholder={t.team.joinCodePlaceholder}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent outline-none font-mono text-sm"
                  />
                  <p className="text-xs text-text-muted mt-1">{t.team.inviteCodeHint}</p>
                </div>
              )}

              {mode !== 'reset' && (
                <label className="flex items-start gap-2 text-sm text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{t.auth.rememberMe}</span>
                </label>
              )}

              {(isRateLimited || error) && (
                <p className="text-sm text-status-danger bg-status-danger/10 px-3 py-2 rounded-lg">
                  {isRateLimited ? rateLimitMessage : error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || isRateLimited}
                className="w-full py-2.5 bg-accent hover:bg-accent-light text-accent-text font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {mode === 'reset'
                      ? t.auth.sendingResetLink
                      : mode === 'signup'
                        ? t.auth.signingUp
                        : t.auth.signingIn}
                  </>
                ) : (
                  mode === 'reset'
                    ? t.auth.sendResetLink
                    : mode === 'signup'
                      ? t.auth.signUp
                      : t.auth.signIn
                )}
              </button>

              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="w-full text-sm text-text-secondary hover:text-accent-green-light transition-colors"
                >
                  {t.auth.forgotPassword}
                </button>
              )}

              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="w-full flex items-center justify-center gap-1 text-sm text-text-secondary hover:text-accent-green-light transition-colors"
                >
                  <ArrowLeft size={14} />
                  {t.auth.backToSignIn}
                </button>
              )}
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary bg-accent-green/10 border border-accent-green/20 rounded-lg px-3 py-3">
                {(mode === 'checkEmail' ? t.auth.checkEmailMessage : t.auth.resetSentMessage)
                  .replace('{email}', noticeEmail)}
              </p>

              {mode === 'checkEmail' && (
                <p className="text-xs text-text-muted">{t.auth.checkEmailHint}</p>
              )}

              {(isRateLimited || error) && (
                <p className="text-sm text-status-danger bg-status-danger/10 px-3 py-2 rounded-lg">
                  {isRateLimited ? rateLimitMessage : error}
                </p>
              )}

              {mode === 'checkEmail' && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading || isRateLimited}
                  className="w-full py-2.5 bg-surface hover:bg-elevated border border-elevated text-text-primary font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? t.auth.resending : t.auth.resendEmail}
                </button>
              )}

              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="w-full flex items-center justify-center gap-1 text-sm text-text-secondary hover:text-accent-green-light transition-colors"
              >
                <ArrowLeft size={14} />
                {t.auth.backToSignIn}
              </button>
            </div>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <div className="mt-4 text-center">
              <button
                onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-sm text-text-secondary hover:text-accent-green-light transition-colors"
              >
                {mode === 'signin' ? t.auth.noAccount : t.auth.hasAccount}{' '}
                <span className="text-accent-green-light font-medium">
                  {mode === 'signin' ? t.auth.signUp : t.auth.signIn}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
