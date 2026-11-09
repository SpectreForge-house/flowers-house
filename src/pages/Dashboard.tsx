import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, DollarSign, Clock, Truck, AlertTriangle, ArrowRight, Bell, Cake, X, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { bg as bgLocale, enUS, ru as ruLocale } from 'date-fns/locale';
import { useInventory, useOrders, useDeliveries, useCustomers, useSettings } from '../hooks/useStore';
import { getDailyRevenue } from '../services/statisticsService';
import { getUpcomingClientDates, daysLeftText } from '../services/clientDatesService';
import { generateReminders } from '../services/reminderService';
import { useReminderState } from '../hooks/useReminderState';
import { dismissBackupWarning, isBackupStale, isBackupWarningDismissed } from '../services/backupService';
import { formatCurrency, getStatusColor, getDeliveryStatusColor } from '../utils/formatters';
import { CustomerAvatar } from '../components/customers/CustomerAvatar';
import { usePermissions } from '../contexts/PermissionsContext';
import { useLanguage, type Language } from '../i18n';

const DATE_LOCALES = { en: enUS, ru: ruLocale, bg: bgLocale };
const DATE_PATTERNS: Record<Language, string> = {
  en: 'EEEE, MMMM d, yyyy',
  ru: 'EEEE, d MMMM yyyy',
  bg: 'EEEE, d MMMM yyyy',
};

export function Dashboard() {
  const { t, language } = useLanguage();
  const { can, role } = usePermissions();
  // Revenue is owner-only, even though managers have viewFinancials.
  const canViewRevenue = role === 'owner';
  const canManageFinance = can('manageFinance');
  const canBackup = can('backupRestore');
  const navigate = useNavigate();
  const { inventory, reservations } = useInventory();
  const { orders } = useOrders();
  const { deliveries } = useDeliveries();
  const { customers } = useCustomers();
  const { settings } = useSettings();
  const { readIds: reminderReadIds, dismissedKeys: reminderDismissedKeys, markRead, dismiss } = useReminderState();
  const [revenueData, setRevenueData] = useState<{ date: string; revenue: number }[]>([]);
  const [reminders, setReminders] = useState<ReturnType<typeof generateReminders>>([]);
  // Visible when no backup was made for more than 7 days (or never).
  const [backupStale] = useState(() => isBackupStale());
  const [backupWarningDismissed, setBackupWarningDismissed] = useState(() => isBackupWarningDismissed());

  const handleDismissBackupWarning = () => {
    dismissBackupWarning();
    setBackupWarningDismissed(true);
  };

  const lowStockItems = useMemo(
    () => inventory.filter(i => i.quantity <= i.minStock),
    [inventory]
  );

  useEffect(() => {
    if (canViewRevenue) {
      setRevenueData(getDailyRevenue(7, orders));
    } else {
      setRevenueData([]);
    }
    setReminders(
      generateReminders(inventory, orders, deliveries, reservations, reminderReadIds, reminderDismissedKeys).slice(0, 5),
    );
  }, [inventory, orders, deliveries, reservations, reminderReadIds, reminderDismissedKeys, canViewRevenue]);

  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => o.createdAt.startsWith(today) || o.deliveryDate === today);
  const todayRevenue = todayOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);
  const waitingOrders = orders.filter(o => ['confirmed', 'preparing'].includes(o.status));
  const todayDeliveries = deliveries
    .filter(d => d.scheduledDate === today)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  const deliveryStats = {
    total: todayDeliveries.length,
    waiting: todayDeliveries.filter(d => d.status === 'waiting').length,
    ready: todayDeliveries.filter(d => d.status === 'ready').length,
    outForDelivery: todayDeliveries.filter(d => d.status === 'out_for_delivery').length,
    delivered: todayDeliveries.filter(d => d.status === 'delivered').length,
  };

  const stats = [
    { label: t.dashboard.ordersToday, value: todayOrders.length, icon: ShoppingCart, color: 'text-status-info' },
    ...(canViewRevenue
      ? [{ label: t.dashboard.revenueToday, value: formatCurrency(todayRevenue), icon: DollarSign, color: 'text-status-success' }]
      : []),
    { label: t.dashboard.waitingToPrepare, value: waitingOrders.length, icon: Clock, color: 'text-status-warning' },
    { label: t.dashboard.deliveriesToday, value: deliveryStats.total, icon: Truck, color: 'text-accent-2-light' },
  ];

  // Upcoming client dates (birthdays, name days, ...) for the next N days;
  // N comes from Settings (clientDatesWindowDays, default 14).
  const clientDatesWindow = settings.clientDatesWindowDays || 14;
  const upcomingClientDates = useMemo(
    () => getUpcomingClientDates(customers, clientDatesWindow),
    [customers, clientDatesWindow]
  );

  return (
    <div className="space-y-6">
      {canBackup && backupStale && !backupWarningDismissed && (
        <div className="flex items-center gap-3 bg-surface border border-status-warning rounded-lg p-3">
          <AlertTriangle size={20} className="text-status-warning shrink-0" />
          <p className="text-sm text-text-primary flex-1">{t.autoBackup.staleWarning}</p>
          <Link to="/settings" className="text-sm text-accent-green-light hover:underline whitespace-nowrap">
            {t.autoBackup.openSettings}
          </Link>
          <button
            type="button"
            onClick={handleDismissBackupWarning}
            title={t.common.close}
            aria-label={t.common.close}
            className="p-1 -m-1 text-text-muted hover:text-text-primary hover:bg-hover rounded transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">{t.dashboard.title}</h1>
        <p className="text-text-muted">
          {format(new Date(), DATE_PATTERNS[language], { locale: DATE_LOCALES[language] })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-secondary text-sm">{stat.label}</p>
                <p className="text-2xl font-bold text-text-primary mt-1">{stat.value}</p>
              </div>
              <stat.icon size={24} className={stat.color} />
            </div>
          </div>
        ))}
      </div>

      {canManageFinance && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/finance?action=income"
            className="flex items-center gap-3 rounded-lg border border-status-success/40 bg-status-success/10 p-4 hover:bg-status-success/15 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-status-success/20 flex items-center justify-center shrink-0">
              <TrendingUp size={20} className="text-status-success" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-text-primary">{t.finance.addIncomeShort}</p>
              <p className="text-sm text-text-secondary">{t.finance.incomeHint}</p>
            </div>
            <ArrowRight size={18} className="text-status-success ml-auto shrink-0" />
          </Link>
          <Link
            to="/finance?action=expense"
            className="flex items-center gap-3 rounded-lg border border-status-danger/40 bg-status-danger/10 p-4 hover:bg-status-danger/15 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-status-danger/20 flex items-center justify-center shrink-0">
              <TrendingDown size={20} className="text-status-danger" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-text-primary">{t.finance.addExpense}</p>
              <p className="text-sm text-text-secondary">{t.finance.expenseHint}</p>
            </div>
            <ArrowRight size={18} className="text-status-danger ml-auto shrink-0" />
          </Link>
        </div>
      )}

      {upcomingClientDates.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Cake size={20} className="text-accent-2-light" />
              {t.clientDates.upcomingTitle}
            </h2>
            <Link to="/calendar" className="text-accent-green-light hover:text-accent-green text-sm flex items-center gap-1">
              {t.dashboard.viewAll} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="space-y-2">
            {upcomingClientDates.map((item) => (
              <button
                key={`${item.customer.id}-${item.date.id}`}
                onClick={() => navigate(`/customers?client=${item.customer.id}`)}
                className="w-full flex items-center gap-3 p-3 bg-surface rounded-lg hover:bg-hover transition-colors text-left"
              >
                <CustomerAvatar customer={item.customer} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-medium truncate">{item.customer.name}</p>
                  <p className="text-text-muted text-sm truncate">
                    {t.clientDates.types[item.date.type]}
                    {item.date.label ? ` · ${item.date.label}` : ''}
                  </p>
                </div>
                <span className={`text-sm font-medium whitespace-nowrap ${
                  item.daysLeft <= 1 ? 'text-accent-2-light' : 'text-text-secondary'
                }`}>
                  {daysLeftText(
                    item.daysLeft,
                    t.clientDates.today,
                    t.clientDates.tomorrow,
                    (n) => t.clientDates.inDays.replace('{days}', String(n))
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {canViewRevenue && (
          <div className="lg:col-span-2 bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{t.dashboard.revenueChart}</h2>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <XAxis dataKey="date" stroke="var(--chart-axis)" fontSize={12} tickFormatter={(v: string) => v.split(' ')[1] || v} />
                  <YAxis stroke="var(--chart-axis)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                    itemStyle={{ color: 'var(--status-success)' }}
                  />
                  <Bar dataKey="revenue" name={t.dashboard.revenueToday} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className={`${canViewRevenue ? '' : 'lg:col-span-3'} bg-card rounded-lg border border-border p-4`}>
          <h2 className="text-lg font-semibold text-text-primary mb-4">{t.dashboard.todayDeliveries}</h2>
          <div className="space-y-3">
            {todayDeliveries.length === 0 ? (
              <p className="text-text-muted text-sm">{t.dashboard.noDeliveries}</p>
            ) : (
              todayDeliveries.slice(0, 5).map((delivery) => (
                <Link
                  key={delivery.id}
                  to={`/orders`}
                  className="flex items-center justify-between p-3 bg-surface rounded-lg hover:bg-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-text-primary font-medium">{delivery.scheduledTime}</span>
                    <div>
                      <p className="text-text-primary text-sm">{delivery.recipientName}</p>
                      <p className="text-text-muted text-xs">{delivery.address}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${getDeliveryStatusColor(delivery.status)}`}>
                    {t.statuses[delivery.status as keyof typeof t.statuses]}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {reminders.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Bell size={20} className="text-accent-green-light" />
              {t.reminders.title}
            </h2>
          </div>
          <div className="space-y-2">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  !reminder.read ? 'bg-surface' : 'bg-card'
                } hover:bg-hover`}
              >
                <button
                  type="button"
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
                  onClick={() => {
                    markRead(reminder.id);
                    setReminders(current => current.map(item => (
                      item.id === reminder.id ? { ...item, read: true } : item
                    )));
                  }}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    reminder.priority === 'high' ? 'bg-status-danger' : reminder.priority === 'medium' ? 'bg-status-warning' : 'bg-blue-400'
                  }`} />
                  <p className={`${!reminder.read ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {reminder.type === 'delivery_today' && `${t.reminders.deliveryToday} — ${reminder.message.split('|')[1]}`}
                    {reminder.type === 'delivery_tomorrow' && `${t.reminders.deliveryTomorrow} — ${reminder.message.split('|')[1]}`}
                    {reminder.type === 'low_stock' && `${t.reminders.lowStock} — ${reminder.message.split('|')[1]}: ${reminder.message.split('|')[2]} ${reminder.message.split('|')[3]}`}
                    {reminder.type === 'reservation_problem' && `${t.reminders.reservationProblem} — ${reminder.message.split('|')[1]}`}
                  </p>
                  {!reminder.read && <div className="w-2 h-2 bg-accent-green rounded-full shrink-0" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dismiss(reminder);
                    setReminders(
                      generateReminders(
                        inventory, orders, deliveries, reservations,
                        reminderReadIds, [...reminderDismissedKeys, `${reminder.id}|${reminder.message}`],
                      ).slice(0, 5),
                    );
                  }}
                  className="p-1 text-text-muted hover:text-status-danger transition-colors rounded shrink-0"
                  title={t.reminders.dismiss}
                  aria-label={t.reminders.dismiss}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">{t.dashboard.recentOrders}</h2>
            <Link to="/orders" className="text-accent-green-light hover:text-accent-green text-sm flex items-center gap-1">
              {t.dashboard.viewAll} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="space-y-3">
            {orders.slice(0, 5).map((order) => (
              <Link
                key={order.id}
                to={`/orders`}
                className="flex items-center justify-between p-3 bg-surface rounded-lg hover:bg-hover transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-medium">{order.id}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(order.status)}`}>
                      {t.statuses[order.status as keyof typeof t.statuses]}
                    </span>
                  </div>
                  <p className="text-text-secondary text-sm mt-1">{order.customerName}</p>
                </div>
                <span className="text-status-success font-medium">{formatCurrency(order.total)}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <AlertTriangle size={20} className="text-status-warning" />
              {t.dashboard.lowStockAlert}
            </h2>
            <Link to="/inventory" className="text-accent-green-light hover:text-accent-green text-sm flex items-center gap-1">
              {t.dashboard.viewAll} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="space-y-3">
            {lowStockItems.length === 0 ? (
              <p className="text-text-muted text-sm">{t.dashboard.allItemsWellStocked}</p>
            ) : (
              lowStockItems.slice(0, 5).map((item) => (
                <Link
                  key={item.id}
                  to={`/inventory`}
                  className="flex items-center justify-between p-3 bg-surface rounded-lg hover:bg-hover transition-colors"
                >
                  <div>
                    <p className="text-text-primary font-medium">{item.name}</p>
                    <p className="text-text-muted text-xs">{item.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-status-danger font-medium">
                      {item.quantity} {item.unit}
                    </p>
                    <p className="text-text-muted text-xs">{t.dashboard.min}: {item.minStock}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
