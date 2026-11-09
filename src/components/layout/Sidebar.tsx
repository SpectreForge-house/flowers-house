import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Users, 
  Package, 
  Flower2, 
  Truck, 
  BarChart3, 
  Settings,
  Globe,
  Plus,
  Trash2,
  Calendar,
  Clock,
  AlertTriangle,
  Calculator,
  LogIn,
  LogOut,
  Cloud,
  Palette,
  Wallet
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLanguage, Language } from '../../i18n';
import { RemindersPanel } from '../reminders/RemindersPanel';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { LoginModal } from '../auth/LoginModal';
import { isSupabaseAvailable } from '../../services/authService';
import { canAccessPath } from '../../services/permissions';

export function Sidebar() {
  const [inventoryExpanded, setInventoryExpanded] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const { user, signOut } = useAuth();
  const { role, profile } = usePermissions();
  const location = useLocation();
  const supabaseReady = isSupabaseAvailable();

  // Keep the active menu item visible when the page changes. Scrolls only the
  // minimum needed amount and only when the item is outside the visible area -
  // the sidebar's own scroll position is never reset to the top.
  useEffect(() => {
    const navs = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-nav]'));
    // The desktop sidebar stays in the DOM (hidden by CSS on small screens)
    // while the drawer only exists while open - pick the rendered one.
    const nav = navs.find((el) => el.clientHeight > 0);
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;

    const navRect = nav.getBoundingClientRect();
    const linkRect = active.getBoundingClientRect();
    if (linkRect.top < navRect.top) {
      nav.scrollTop -= navRect.top - linkRect.top;
    } else if (linkRect.bottom > navRect.bottom) {
      nav.scrollTop += linkRect.bottom - navRect.bottom;
    }
  }, [location.pathname]);

  const languages: { value: Language; label: string; flag: string }[] = [
    { value: 'en', label: 'English', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
    { value: 'ru', label: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
    { value: 'bg', label: '\u0411\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438', flag: '\uD83C\uDDE7\uD83C\uDDEC' },
  ];

  const navItems = [
    { path: '/', label: t.nav.dashboard, icon: LayoutDashboard },
    { path: '/orders', label: t.nav.orders, icon: ShoppingCart },
    { path: '/customers', label: t.nav.customers, icon: Users },
    { path: '/inventory', label: t.nav.inventory, icon: Package, hasChildren: true },
    { path: '/bouquets', label: t.nav.bouquets, icon: Flower2 },
    { path: '/deliveries', label: t.nav.deliveries, icon: Truck },
    { path: '/calendar', label: t.nav.calendar, icon: Calendar },
    { path: '/reservations', label: t.nav.reservations, icon: AlertTriangle },
    { path: '/history', label: t.nav.history, icon: Clock },
    { path: '/statistics', label: t.nav.statistics, icon: BarChart3 },
    { path: '/finance', label: t.nav.finance, icon: Wallet },
    { path: '/themes', label: t.nav.themes, icon: Palette },
    { path: '/settings', label: t.nav.settings, icon: Settings },
  ];
  const visibleNavItems = navItems.filter(item => canAccessPath(role, item.path));

  const childItems: Record<string, { path: string; label: string; icon: typeof Trash2 }[]> = {
    '/inventory': [
      { path: '/inventory/waste', label: t.nav.waste, icon: Trash2 },
      { path: '/inventory/calculator', label: t.nav.calculator, icon: Calculator },
    ],
  };

  // NOTE: this is a plain render helper, NOT a component. Defining it as an
  // inner component (`const NavContent = () => ...` used as `<NavContent />`)
  // gives React a brand-new component type on every re-render (navigation),
  // which unmounts and remounts the scrollable <nav> - that reset the sidebar
  // scroll position to the top on every click. Calling it inlines the JSX so
  // the DOM (and its scroll position) survives.
  const renderNavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
            <Flower2 size={24} className="text-accent-text" />
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-text-primary">{t.shop.name}</h1>
            <p className="text-xs text-text-muted">{t.nav.orders} CRM</p>
          </div>
          <RemindersPanel />
        </div>
      </div>

      <nav data-sidebar-nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {visibleNavItems.map((item) => {
          const children = item.hasChildren ? childItems[item.path] : [];
          const isExpanded = item.hasChildren && inventoryExpanded;
          const isActive = location.pathname === item.path || 
            (item.hasChildren && location.pathname.startsWith(item.path));

          return (
            <div key={item.path}>
              <div className="flex items-center">
                <NavLink
                  to={item.path}
                  data-active={isActive && !isExpanded ? 'true' : undefined}
                  className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive && !isExpanded
                      ? 'bg-accent/20 text-accent-light'
                      : 'text-text-secondary hover:bg-hover hover:text-text-primary'
                  }`}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </NavLink>
                {item.hasChildren && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setInventoryExpanded(!inventoryExpanded);
                    }}
                    className={`p-1.5 rounded-lg transition-all duration-200 ${
                      isExpanded
                        ? 'text-accent-light bg-accent/10 rotate-45'
                        : 'text-text-muted hover:text-text-secondary hover:bg-hover'
                    }`}
                    title={isExpanded ? t.common.close : t.common.add}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
              {item.hasChildren && children && (
                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{
                    maxHeight: isExpanded ? `${children.length * 44}px` : '0px',
                    opacity: isExpanded ? 1 : 0,
                  }}
                >
                  {children.map((child) => (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      data-active={isActive ? 'true' : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-3 pl-12 pr-3 py-2 rounded-lg transition-colors ml-1 ${
                          isActive
                            ? 'bg-accent/20 text-accent-light'
                            : 'text-text-muted hover:bg-hover hover:text-text-secondary'
                        }`
                      }
                    >
                      <child.icon size={16} />
                      <span className="text-sm">{child.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Globe size={14} className="text-text-muted" />
          <span className="text-xs text-text-muted">{t.settings.language}</span>
        </div>
        <div className="flex gap-1">
          {languages.map((lang) => (
            <button
              key={lang.value}
              // Keep the caret in the field being edited: a normal mousedown on
              // a button moves DOM focus there and the field stops accepting input.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setLanguage(lang.value)}
              className={`flex-1 px-2 py-1.5 rounded text-xs transition-colors ${
                language === lang.value
                  ? 'bg-accent-green/20 text-accent-green-light border border-accent-green/30'
                  : 'bg-surface text-text-secondary hover:bg-hover hover:text-text-primary border border-transparent'
              }`}
            >
              {lang.flag}
            </button>
          ))}
        </div>
      </div>

      {supabaseReady && (
        <div className="p-3 border-t border-border shrink-0">
          {user ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2">
                <Cloud size={14} className="text-accent-green-light" />
                <span className="text-xs text-text-secondary truncate">{profile?.displayName || user.email}</span>
              </div>
              <button
                onClick={signOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary hover:bg-hover hover:text-text-primary transition-colors"
              >
                <LogOut size={14} />
                {t.auth.signOut}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs bg-accent-green/10 text-accent-green-light hover:bg-accent-green/20 transition-colors"
            >
              <LogIn size={14} />
              {t.auth.signIn}
            </button>
          )}
        </div>
      )}

      <div className="p-4 border-t border-border shrink-0">
        <div className="text-xs text-text-muted">
          v{__APP_VERSION__}<span className="ml-4 text-text-muted">By Spectre_Forge</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex flex-col w-64 h-screen bg-sidebar border-r border-border fixed left-0 top-0">
        {renderNavContent()}
      </aside>

      {supabaseReady && <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />}
    </>
  );
}
