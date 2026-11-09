import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Flower2,
  Truck,
  Calendar,
  AlertTriangle,
  Clock,
  BarChart3,
  Palette,
  Settings,
  Trash2,
  Calculator,
  Menu,
  X,
  Globe,
  LogIn,
  LogOut,
  Cloud,
  Wallet,
} from 'lucide-react';
import { useLanguage, Language } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { LoginModal } from '../auth/LoginModal';
import { isSupabaseAvailable } from '../../services/authService';
import { canAccessPath } from '../../services/permissions';

const primaryItems = [
  { path: '/', labelKey: 'dashboard', icon: LayoutDashboard },
  { path: '/orders', labelKey: 'orders', icon: ShoppingCart },
  { path: '/customers', labelKey: 'customers', icon: Users },
  { path: '/inventory', labelKey: 'inventory', icon: Package },
] as const;

const moreItems = [
  { path: '/bouquets', labelKey: 'bouquets', icon: Flower2 },
  { path: '/deliveries', labelKey: 'deliveries', icon: Truck },
  { path: '/calendar', labelKey: 'calendar', icon: Calendar },
  { path: '/reservations', labelKey: 'reservations', icon: AlertTriangle },
  { path: '/history', labelKey: 'history', icon: Clock },
  { path: '/statistics', labelKey: 'statistics', icon: BarChart3 },
  { path: '/finance', labelKey: 'finance', icon: Wallet },
  { path: '/themes', labelKey: 'themes', icon: Palette },
  { path: '/settings', labelKey: 'settings', icon: Settings },
  { path: '/inventory/waste', labelKey: 'waste', icon: Trash2 },
  { path: '/inventory/calculator', labelKey: 'calculator', icon: Calculator },
] as const;

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const { user, signOut } = useAuth();
  const { role, profile } = usePermissions();
  const location = useLocation();
  const supabaseReady = isSupabaseAvailable();

  const isPathActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const primaryActive = primaryItems.some((item) => isPathActive(item.path));
  const visibleMoreItems = moreItems.filter((item) => canAccessPath(role, item.path));

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const languages: { value: Language; label: string; flag: string }[] = [
    { value: 'en', label: 'English', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
    { value: 'ru', label: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
    { value: 'bg', label: '\u0411\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438', flag: '\uD83C\uDDE7\uD83C\uDDEC' },
  ];

  return (
    <>
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-sidebar border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch">
          {primaryItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors ${
                isPathActive(item.path)
                  ? 'text-accent-light'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <item.icon size={20} />
              <span className="truncate">{t.nav[item.labelKey]}</span>
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors ${
              !primaryActive ? 'text-accent-light' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Menu size={20} />
            <span className="truncate">{t.nav.more}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-sidebar border-t border-border shadow-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="sticky top-0 z-10 bg-sidebar border-b border-border">
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" />
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="font-semibold text-text-primary">{t.nav.more}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 -mr-2 text-text-secondary hover:text-text-primary"
                  aria-label={t.common.close}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-3 grid grid-cols-2 gap-2">
              {visibleMoreItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-accent/20 text-accent-light'
                        : 'bg-surface text-text-secondary hover:bg-hover hover:text-text-primary'
                    }`
                  }
                >
                  <item.icon size={18} />
                  <span className="truncate">{t.nav[item.labelKey]}</span>
                </NavLink>
              ))}
            </div>

            <div className="px-3 pb-3 space-y-3">
              <div className="rounded-lg bg-surface p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Globe size={14} className="text-text-muted" />
                  <span className="text-xs text-text-muted">{t.settings.language}</span>
                </div>
                <div className="flex gap-1">
                  {languages.map((lang) => (
                    <button
                      key={lang.value}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setLanguage(lang.value)}
                      className={`flex-1 px-2 py-1.5 rounded text-xs transition-colors ${
                        language === lang.value
                          ? 'bg-accent-green/20 text-accent-green-light border border-accent-green/30'
                          : 'bg-card text-text-secondary hover:bg-hover hover:text-text-primary border border-transparent'
                      }`}
                    >
                      {lang.flag} {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              {supabaseReady && (
                <div className="rounded-lg bg-surface p-3">
                  {user ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <Cloud size={14} className="text-accent-green-light" />
                        <span className="text-xs text-text-secondary truncate">{profile?.displayName || user.email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          void signOut();
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary hover:bg-hover hover:text-text-primary transition-colors"
                      >
                        <LogOut size={14} />
                        {t.auth.signOut}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setShowLogin(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs bg-accent-green/10 text-accent-green-light hover:bg-accent-green/20 transition-colors"
                    >
                      <LogIn size={14} />
                      {t.auth.signIn}
                    </button>
                  )}
                </div>
              )}

              <div className="text-center text-xs text-text-muted">
                v{__APP_VERSION__}<span className="ml-3">By Spectre_Forge</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {supabaseReady && <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />}
    </>
  );
}
