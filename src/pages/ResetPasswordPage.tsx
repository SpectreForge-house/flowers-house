import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Flower2, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { updatePassword } from '../services/authService';
import { PasswordInput } from '../components/ui/PasswordInput';

function hasLinkError(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const error = hash.get('error') || query.get('error');
  const code = hash.get('error_code') || query.get('error_code');
  return error === 'access_denied' || code === 'otp_expired';
}

export function ResetPasswordPage() {
  const { t, tMessage } = useLanguage();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [linkError] = useState(hasLinkError);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => navigate('/', { replace: true }), 1800);
    return () => window.clearTimeout(timer);
  }, [done, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError(t.auth.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.auth.passwordsDoNotMatch);
      return;
    }

    setSaving(true);
    try {
      const result = await updatePassword(password);
      if (result.error) {
        setError(tMessage({ key: result.error }));
        return;
      }
      setDone(true);
    } catch (err) {
      console.error('[ResetPasswordPage] Update failed:', err);
      setError(t.auth.unknownError);
    } finally {
      setSaving(false);
    }
  };

  const goHome = () => navigate('/', { replace: true });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card rounded-lg border border-border shadow-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent-green flex items-center justify-center">
              <Flower2 size={24} className="text-text-primary" />
            </div>
            <h1 className="text-lg font-bold text-text-primary">{t.auth.resetTitle}</h1>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-accent-green-light" />
            </div>
          ) : linkError || !user ? (
            <div className="space-y-4">
              <p className="text-sm text-status-danger bg-status-danger/10 px-3 py-3 rounded-lg">
                {t.auth.resetLinkInvalid}
              </p>
              <button
                type="button"
                onClick={goHome}
                className="w-full flex items-center justify-center gap-1 text-sm text-text-secondary hover:text-accent-green-light transition-colors"
              >
                <ArrowLeft size={14} />
                {t.auth.backToSignIn}
              </button>
            </div>
          ) : done ? (
            <div className="space-y-4">
              <p className="text-sm text-status-success bg-status-success/10 px-3 py-3 rounded-lg">
                {t.auth.passwordUpdated}
              </p>
              <button
                type="button"
                onClick={goHome}
                className="w-full py-2.5 bg-accent hover:bg-accent-light text-accent-text font-medium rounded-lg transition-colors"
              >
                {t.common.close}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-text-secondary">{t.auth.resetDescription}</p>

              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.auth.newPassword}</label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  placeholder={t.auth.passwordPlaceholder}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

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

              {error && (
                <p className="text-sm text-status-danger bg-status-danger/10 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 bg-accent hover:bg-accent-light text-accent-text font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                {saving ? t.auth.updatingPassword : t.auth.updatePassword}
              </button>

              <button
                type="button"
                onClick={goHome}
                className="w-full flex items-center justify-center gap-1 text-sm text-text-secondary hover:text-accent-green-light transition-colors"
              >
                <ArrowLeft size={14} />
                {t.auth.backToSignIn}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
