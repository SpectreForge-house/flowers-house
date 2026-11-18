import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Clock, CheckCircle, MapPin, Phone, ExternalLink } from 'lucide-react';
import { Delivery } from '../types';
import { updateDeliveryStatus } from '../services/deliveryService';
import { formatDate, getDeliveryStatusColor } from '../utils/formatters';
import { todayIso } from '../utils/clock';
import { showToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { useLanguage } from '../i18n';
import { useDeliveries } from '../hooks/useStore';

export function DeliveriesPage() {
  const { t } = useLanguage();
  const { deliveries: allDeliveries, refresh: refreshDeliveries, getAdapter: getOrderAdapter } = useDeliveries();
  const [selectedDate, setSelectedDate] = useState(() => todayIso());

  const deliveries = useMemo(() => {
    return allDeliveries
      .filter(d => d.scheduledDate === selectedDate)
      .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  }, [allDeliveries, selectedDate]);

  const handleStatusChange = async (delivery: Delivery, newStatus: Delivery['status']) => {
    try {
      const adapter = getOrderAdapter();
      const updated = await updateDeliveryStatus(delivery.id, newStatus, adapter);
      if (updated) {
        await refreshDeliveries();
        showToast('success', t.deliveries.statusUpdated.replace('{status}', t.statuses[newStatus as keyof typeof t.statuses]));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', msg);
    }
  };

  const statusFlow: Record<string, string[]> = {
    waiting: ['ready'],
    ready: ['out_for_delivery'],
    out_for_delivery: ['delivered'],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-primary">{t.deliveries.title}</h1>
        <div className="flex items-center gap-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-lg text-text-primary focus:border-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-status-warning mb-2">
            <Clock size={20} />
            <span className="text-sm font-medium">{t.deliveries.waiting}</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {deliveries.filter(d => d.status === 'waiting').length}
          </p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <CheckCircle size={20} />
            <span className="text-sm font-medium">{t.deliveries.ready}</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {deliveries.filter(d => d.status === 'ready').length}
          </p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-accent-2-light mb-2">
            <Truck size={20} />
            <span className="text-sm font-medium">{t.deliveries.outForDelivery}</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {deliveries.filter(d => d.status === 'out_for_delivery').length}
          </p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-status-success mb-2">
            <CheckCircle size={20} />
            <span className="text-sm font-medium">{t.deliveries.delivered}</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {deliveries.filter(d => d.status === 'delivered').length}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {deliveries.length === 0 ? (
          <div className="text-center py-12 text-text-muted bg-card rounded-lg border border-border">
            {t.deliveries.noDeliveries}
          </div>
        ) : (
          deliveries.map((delivery) => (
            <div
              key={delivery.id}
              className="bg-card rounded-lg border border-border p-4 hover:border-elevated transition-colors"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-center min-w-[60px]">
                    <p className="text-2xl font-bold text-text-primary">{delivery.scheduledTime}</p>
                    <p className="text-text-muted text-sm">{formatDate(delivery.scheduledDate)}</p>
                  </div>
                  <div className="h-12 w-px bg-hover" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-text-primary font-medium">{delivery.recipientName}</h3>
                      <span className={`px-2 py-1 rounded text-xs ${getDeliveryStatusColor(delivery.status)}`}>
                        {t.statuses[delivery.status as keyof typeof t.statuses]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-text-secondary text-sm mt-1">
                      <MapPin size={14} />
                      {delivery.address}
                    </div>
                    <div className="flex items-center gap-1 text-text-secondary text-sm mt-1">
                      <Phone size={14} />
                      {delivery.phone}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to="/orders"
                    className="p-2 text-text-secondary hover:text-text-primary hover:bg-hover rounded"
                    title={t.deliveries.viewOrder}
                  >
                    <ExternalLink size={18} />
                  </Link>
                  {statusFlow[delivery.status]?.map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      size="sm"
                      onClick={() => handleStatusChange(delivery, nextStatus as Delivery['status'])}
                    >
                      {nextStatus === 'ready' && t.deliveries.markReady}
                      {nextStatus === 'out_for_delivery' && t.deliveries.startDelivery}
                      {nextStatus === 'delivered' && t.deliveries.markDelivered}
                    </Button>
                  ))}
                </div>
              </div>

              {delivery.notes && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-text-secondary text-sm">{delivery.notes}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
