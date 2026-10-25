import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Flower2, Loader2 } from 'lucide-react';
import { signIn, signUp } from '../../services/authService';
import { setPendingInviteToken } from '../../services/teamService';
import { useLanguage } from '../../i18n';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { t } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp && inviteCode.trim()) {
        setPendingInviteToken(inviteCode);
      }

      const result = isSignUp
        ? await signUp(email, password)
        : await signIn(email, password);

      if (result.error) {
        setError(t.auth[result.error as keyof typeof t.auth] || result.error);
      } else {
        onClose();
        setEmail('');
        setPassword('');
        setInviteCode('');
      }
    } catch (err) {
      console.error('[Auth] Sign-in request failed:', err);
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      const isConnectionError = ['fetch', 'network', 'timeout', 'timed out'].some(part => message.includes(part));
      setError(isConnectionError ? t.auth.serviceUnavailable : t.auth.unknownError);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
  };

  return createPortal(
    <div className="fixed inset-0 modal-overlay lg:left-64 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-card rounded-lg border border-border shadow-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent-green flex items-center justify-center">
              <Flower2 size={24} className="text-text-primary" />
            </div>
            <h2 className="text-lg font-bold text-text-primary">
              {isSignUp ? t.auth.signUpTitle : t.auth.signInTitle}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t.auth.email}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.auth.emailPlaceholder}
                required
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1">{t.auth.password}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.auth.passwordPlaceholder}
                required
                minLength={6}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent outline-none"
              />
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  {t.team.inviteCodeOptional}
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder={t.team.joinCodePlaceholder}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent outline-none font-mono text-sm"
                />
                <p className="text-xs text-text-muted mt-1">{t.team.inviteCodeHint}</p>
              </div>
            )}

            {error && (
              <p className="text-sm text-status-danger bg-status-danger/10 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent hover:bg-accent-light text-accent-text font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {isSignUp ? t.auth.signingUp : t.auth.signingIn}
                </>
              ) : (
                isSignUp ? t.auth.signUp : t.auth.signIn
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={toggleMode}
              className="text-sm text-text-secondary hover:text-accent-green-light transition-colors"
            >
              {isSignUp ? t.auth.hasAccount : t.auth.noAccount}{' '}
              <span className="text-accent-green-light font-medium">
                {isSignUp ? t.auth.signIn : t.auth.signUp}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
