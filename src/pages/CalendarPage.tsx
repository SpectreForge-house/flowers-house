import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Cake } from 'lucide-react';
import { Delivery, ImportantDate } from '../types';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n';
import { getDeliveryStatusColor } from '../utils/formatters';
import { useOrders, useDeliveries, useCustomers } from '../hooks/useStore';
import { getClientDatesForMonth } from '../services/clientDatesService';

export function CalendarPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { orders } = useOrders();
  const { deliveries } = useDeliveries();
  const { customers } = useCustomers();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDay = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = lastDayOfMonth.getDate();

  const today = new Date().toISOString().split('T')[0];

  const deliveriesByDate = useMemo(() => {
    const map: Record<string, Delivery[]> = {};
    for (const d of deliveries) {
      if (!map[d.scheduledDate]) map[d.scheduledDate] = [];
      map[d.scheduledDate].push(d);
    }
    return map;
  }, [deliveries]);

  // Client dates (birthdays, name days, ...) of the displayed month, grouped
  // by their "YYYY-MM-DD" occurrence. Visually distinct from deliveries.
  const clientDatesByDate = useMemo(() => {
    const map: Record<string, Array<{ customer: { id: string; name: string }; importantDate: ImportantDate }>> = {};
    for (const entry of getClientDatesForMonth(customers, year, month)) {
      if (!map[entry.date]) map[entry.date] = [];
      map[entry.date].push({ customer: entry.customer, importantDate: entry.importantDate });
    }
    return map;
  }, [customers, year, month]);

  const calendarDays = useMemo(() => {
    const days: { date: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean; hasDeliveries: boolean; deliveryCount: number; clientDateCount: number }[] = [];
    
    // Previous month padding
    const prevMonth = new Date(year, month, 0);
    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevMonth.getDate() - i;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ date: dateStr, dayNum: day, isCurrentMonth: false, isToday: false, hasDeliveries: false, deliveryCount: 0, clientDateCount: 0 });
    }

    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayDeliveries = deliveriesByDate[dateStr] || [];
      days.push({
        date: dateStr,
        dayNum: day,
        isCurrentMonth: true,
        isToday: dateStr === today,
        hasDeliveries: dayDeliveries.length > 0,
        deliveryCount: dayDeliveries.length,
        clientDateCount: (clientDatesByDate[dateStr] || []).length,
      });
    }

    // Next month padding
    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
      const nextMonth = new Date(year, month + 1, day);
      const dateStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ date: dateStr, dayNum: day, isCurrentMonth: false, isToday: false, hasDeliveries: false, deliveryCount: 0, clientDateCount: 0 });
    }

    return days;
  }, [year, month, startDay, daysInMonth, deliveriesByDate, clientDatesByDate, today]);

  const selectedDeliveries = useMemo(() => {
    if (!selectedDate) return [];
    return (deliveriesByDate[selectedDate] || []).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  }, [selectedDate, deliveriesByDate]);

  const selectedClientDates = useMemo(() => {
    if (!selectedDate) return [];
    return clientDatesByDate[selectedDate] || [];
  }, [selectedDate, clientDatesByDate]);

  const monthName = t.calendar.monthNames[month];

  const goToPrevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(today);
  };

  const upcomingDeliveries = useMemo(() => {
    const now = new Date().toISOString().split('T')[0];
    return deliveries
      .filter(d => d.scheduledDate >= now && d.status !== 'delivered')
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime))
      .slice(0, 8);
  }, [deliveries]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calendar size={28} className="text-accent-green-light" />
        <h1 className="text-2xl font-bold text-text-primary">{t.calendar.title}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{monthName} {year}</h2>
              <div className="flex items-center gap-2">
                <button onClick={goToToday} className="px-3 py-1 text-sm bg-accent-green/20 text-accent-green-light rounded hover:bg-accent-green/30 transition-colors">
                  {t.calendar.today}
                </button>
                <button onClick={goToPrevMonth} className="p-1 text-text-secondary hover:text-text-primary hover:bg-hover rounded">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={goToNextMonth} className="p-1 text-text-secondary hover:text-text-primary hover:bg-hover rounded">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {t.calendar.dayNames.map((day) => (
                <div key={day} className="text-center text-xs text-text-muted font-medium py-2">
                  {day}
                </div>
              ))}
              {calendarDays.map((day, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day.date)}
                  className={`relative p-2 rounded-lg text-sm transition-all ${
                    day.isToday
                      ? 'bg-accent-green text-text-primary font-bold'
                      : day.hasDeliveries
                      ? 'bg-accent/10 text-accent-text hover:bg-accent-green/20'
                      : day.isCurrentMonth
                      ? 'text-text-secondary hover:bg-hover'
                      : 'text-text-muted'
                  } ${selectedDate === day.date ? 'ring-2 ring-accent-light' : ''}`}
                >
                  {day.dayNum}
                  {day.hasDeliveries && (
                    <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${day.isToday ? 'bg-white' : 'bg-accent-green'}`} />
                  )}
                  {day.clientDateCount > 0 && (
                    <Cake
                      size={11}
                      className={`absolute top-0.5 right-0.5 ${day.isToday ? 'text-white' : 'text-accent-2-light'}`}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedDate && (
            <div className="mt-4 bg-card rounded-lg border border-border p-4">
              <h3 className="text-lg font-semibold text-text-primary mb-3">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString()} ({selectedDeliveries.length} {selectedDeliveries.length === 1 ? t.calendar.delivery : t.calendar.deliveries})
              </h3>
              {selectedClientDates.length > 0 && (
                <div className="mb-4 p-3 bg-accent-2/10 border-l-4 border-accent-2-light rounded-r-lg">
                  <p className="flex items-center gap-2 text-sm font-medium text-accent-2-light mb-2">
                    <Cake size={14} />
                    {t.clientDates.calendarEvent}
                  </p>
                  <div className="space-y-2">
                    {selectedClientDates.map((entry) => (
                      <button
                        key={`${entry.customer.id}-${entry.importantDate.id}`}
                        onClick={() => navigate(`/customers?client=${entry.customer.id}`)}
                        className="w-full flex items-center gap-3 p-2 bg-card rounded-lg hover:bg-hover transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary font-medium truncate">{entry.customer.name}</p>
                          <p className="text-text-muted text-xs truncate">
                            {t.clientDates.types[entry.importantDate.type]}
                            {entry.importantDate.label ? ` · ${entry.importantDate.label}` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {selectedDeliveries.length === 0 ? (
                <p className="text-text-muted text-center py-4">{t.calendar.noDeliveries}</p>
              ) : (
                <div className="space-y-3">
                  {selectedDeliveries.map((delivery) => {
                    const order = orders.find(o => o.id === delivery.orderId);
                    return (
                      <div
                        key={delivery.id}
                        onClick={() => navigate('/orders')}
                        className="flex items-center gap-4 p-3 bg-surface rounded-lg hover:bg-hover transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 text-accent-green-light">
                          <Clock size={16} />
                          <span className="font-medium">{delivery.scheduledTime}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary font-medium">{delivery.recipientName}</p>
                          <p className="text-text-muted text-sm truncate flex items-center gap-1">
                            <MapPin size={12} /> {delivery.address}
                          </p>
                          {order && (
                            <p className="text-text-muted text-xs">{t.calendar.customer}: {order.customerName}</p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${getDeliveryStatusColor(delivery.status)}`}>
                          {t.statuses[delivery.status as keyof typeof t.statuses]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-4">{t.calendar.upcomingDeliveries}</h3>
          {upcomingDeliveries.length === 0 ? (
            <p className="text-text-muted text-center py-4">{t.calendar.noDeliveries}</p>
          ) : (
            <div className="space-y-3">
              {upcomingDeliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  onClick={() => navigate('/orders')}
                  className="p-3 bg-surface rounded-lg hover:bg-hover transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-accent-green-light text-sm font-medium">{delivery.scheduledDate}</span>
                    <span className="text-text-primary text-sm">{delivery.scheduledTime}</span>
                  </div>
                  <p className="text-text-primary text-sm">{delivery.recipientName}</p>
                  <p className="text-text-muted text-xs truncate">{delivery.address}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
