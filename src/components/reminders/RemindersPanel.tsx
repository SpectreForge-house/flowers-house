import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, CheckCheck, AlertTriangle, Truck, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generateReminders, Reminder } from '../../services/reminderService';
import { useOrders, useDeliveries, useInventory } from '../../hooks/useStore';
import { useReminderState } from '../../hooks/useReminderState';
import { useLanguage } from '../../i18n';

const SIDEBAR_WIDTH = 256;

export function RemindersPanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { orders } = useOrders();
  const { deliveries } = useDeliveries();
  const { reservations } = useInventory();
  const { readIds, dismissedKeys, markRead, dismiss, markAllRead } = useReminderState();
  const [isOpen, setIsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 384 });
  const reminders = useMemo(() => {
    void refreshKey;
    return generateReminders(undefined, orders, deliveries, reservations, readIds, dismissedKeys);
  }, [orders, deliveries, reservations, refreshKey, readIds, dismissedKeys]);
  const unreadCount = reminders.filter(r => !r.read).length;

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
        setDropdownPos({
          top: rect.bottom + 8,
          left: Math.max(8, rect.right - 320),
          width: Math.min(320, window.innerWidth - 16),
        });
      } else {
        const dropdownWidth = 384;
        const rightEdge = SIDEBAR_WIDTH + 8 + dropdownWidth;
        const leftPos = rightEdge > window.innerWidth - 16
          ? window.innerWidth - dropdownWidth - 16
          : SIDEBAR_WIDTH + 8;
        setDropdownPos({
          top: rect.bottom + 8,
          left: Math.max(SIDEBAR_WIDTH + 8, leftPos),
          width: dropdownWidth,
        });
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleReposition = () => updatePosition();
      window.addEventListener('resize', handleReposition);
      window.addEventListener('scroll', handleReposition, true);
      return () => {
        window.removeEventListener('resize', handleReposition);
        window.removeEventListener('scroll', handleReposition, true);
      };
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false);
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const formatReminderMessage = (reminder: Reminder): { title: string; subtitle: string } => {
    const parts = reminder.message.split('|');
    switch (reminder.type) {
      case 'delivery_today':
        return {
          title: `${t.reminders.deliveryToday} — ${parts[1]}`,
          subtitle: `${t.reminders.forOrder} ${parts[2]} — ${parts[3]}`,
        };
      case 'delivery_tomorrow':
        return {
          title: `${t.reminders.deliveryTomorrow} — ${parts[1]}`,
          subtitle: `${t.reminders.forOrder} ${parts[2]} — ${parts[3]}`,
        };
      case 'low_stock':
        return {
          title: `${t.reminders.lowStock} — ${parts[1]}`,
          subtitle: `${t.reminders.stock}: ${parts[2]} ${parts[3]}`,
        };
      case 'reservation_problem':
        return {
          title: `${t.reminders.reservationProblem} — ${parts[1]}`,
          subtitle: `${t.reminders.reserved}: ${parts[2]}, ${t.reminders.stock}: ${parts[3]} — ${parts[4]}`,
        };
      default:
        return { title: reminder.message, subtitle: '' };
    }
  };

  const handleReminderClick = (reminder: Reminder) => {
    markRead(reminder.id);
    setRefreshKey(k => k + 1);
    setIsOpen(false);

    if (reminder.entityType === 'order') {
      navigate('/orders');
    } else if (reminder.entityType === 'inventory') {
      navigate('/inventory');
    } else if (reminder.entityType === 'reservation') {
      navigate('/reservations');
    }
  };

  const handleMarkAllRead = () => {
    markAllRead(reminders.map(r => r.id));
    setRefreshKey(k => k + 1);
  };

  const handleDismiss = (event: React.MouseEvent, reminder: Reminder) => {
    event.stopPropagation();
    dismiss(reminder);
    setRefreshKey(k => k + 1);
  };

  const getIcon = (type: Reminder['type']) => {
    switch (type) {
      case 'delivery_today':
      case 'delivery_tomorrow':
        return <Truck size={16} className="text-status-info" />;
      case 'low_stock':
        return <Package size={16} className="text-status-warning" />;
      case 'reservation_problem':
        return <AlertTriangle size={16} className="text-status-danger" />;
      default:
        return <Bell size={16} className="text-text-secondary" />;
    }
  };

  const getPriorityColor = (priority: Reminder['priority']) => {
    switch (priority) {
      case 'high': return 'border-l-red-500';
      case 'medium': return 'border-l-yellow-500';
      case 'low': return 'border-l-blue-500';
      default: return 'border-l-gray-500';
    }
  };

  const dropdown = isOpen ? createPortal(
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 51 }}
        onClick={() => setIsOpen(false)}
      />
      <div
        className="bg-card border border-border rounded-lg shadow-2xl max-h-[70vh] flex flex-col"
        style={{
          position: 'fixed',
          top: dropdownPos.top,
          left: dropdownPos.left,
          width: dropdownPos.width,
          zIndex: 52,
        }}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Bell size={18} className="text-accent-green-light shrink-0" />
            <h3 className="text-text-primary font-semibold truncate">{t.reminders.title}</h3>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 bg-accent-green/20 text-accent-green-light text-xs rounded shrink-0">
                {unreadCount} {t.reminders.unread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="p-1.5 text-text-secondary hover:text-accent-green-light hover:bg-hover rounded"
                title={t.reminders.markAllRead}
              >
                <CheckCheck size={16} />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-hover rounded"
              title={t.common.close}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {reminders.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              <Bell size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t.reminders.noReminders}</p>
            </div>
          ) : (
            <div className="divide-y divide-[#2a2a2a]">
              {reminders.map((reminder) => {
                const { title, subtitle } = formatReminderMessage(reminder);
                return (
                  <div
                    key={reminder.id}
                    className={`flex items-stretch border-l-2 ${getPriorityColor(reminder.priority)} ${
                      !reminder.read ? 'bg-card' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleReminderClick(reminder)}
                      className="flex-1 min-w-0 text-left p-3 hover:bg-surface transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 shrink-0">{getIcon(reminder.type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className={`${!reminder.read ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>{title}</p>
                          <p className="text-text-muted text-xs mt-0.5">{subtitle}</p>
                        </div>
                        {!reminder.read && (
                          <div className="w-2 h-2 bg-accent-green rounded-full shrink-0 mt-1.5" />
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => handleDismiss(event, reminder)}
                      className="shrink-0 px-3 text-text-muted hover:text-status-danger hover:bg-surface transition-colors"
                      title={t.reminders.dismiss}
                      aria-label={t.reminders.dismiss}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => {
          if (!isOpen) updatePosition();
          setIsOpen(!isOpen);
        }}
        className="relative p-2 text-text-secondary hover:text-text-primary hover:bg-hover rounded-lg transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-status-danger text-accent-text text-xs rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {dropdown}
    </div>
  );
}
