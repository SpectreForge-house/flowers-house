import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ImageOff } from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { formatCurrency, formatDate, getStatusColor, getNextStatus } from '../../utils/formatters';
import { listPhotos, photoOwnerKey } from '../../services/photoStorage';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';
import { Button } from '../ui/Button';
import { useLanguage } from '../../i18n';
import { useBouquets } from '../../hooks/useStore';

interface OrderDetailsProps {
  order: Order;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
}

export function OrderDetails({ order, onClose, onStatusChange }: OrderDetailsProps) {
  const { t } = useLanguage();
  const { bouquets } = useBouquets();
  const nextStatus = getNextStatus(order.status);
  // Optional bouquet photo attached when the order was created.
  const orderPhoto = listPhotos(photoOwnerKey('order', order.id))[0];

  return createPortal(
    <div className="fixed inset-0 modal-overlay lg:left-64 z-[55] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-2xl bg-card sm:rounded-lg border border-border shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t.orderDetails.order} {order.id}</h2>
            <span className={`px-2 py-1 rounded text-xs ${getStatusColor(order.status)}`}>
              {t.statuses[order.status as keyof typeof t.statuses]}
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary hover:bg-hover rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface rounded-lg p-3">
              <p className="text-text-secondary text-sm mb-1">{t.orderDetails.customer}</p>
              <p className="text-text-primary font-medium">{order.customerName}</p>
              <p className="text-text-secondary text-sm">{order.customerPhone}</p>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <p className="text-text-secondary text-sm mb-1">{t.orderDetails.recipient}</p>
              <p className="text-text-primary font-medium">{order.recipientName}</p>
              {order.recipientPhone && (
                <p className="text-text-secondary text-sm">{order.recipientPhone}</p>
              )}
            </div>
          </div>

          <div className="bg-surface rounded-lg p-3">
            <p className="text-text-secondary text-sm mb-1">{t.orderDetails.delivery}</p>
            <p className="text-text-primary">{order.deliveryAddress}</p>
            <p className="text-text-secondary text-sm">{formatDate(order.deliveryDate)} {t.orderDetails.at} {order.deliveryTime}</p>
          </div>

          <div>
            <p className="text-text-secondary text-sm mb-2">{t.orderDetails.items}</p>
            <div className="space-y-2">
              {order.items.map((item, index) => {
                const bouquet = bouquets.find(b => b.id === item.bouquetId);
                return (
                  <div key={index} className="flex items-center justify-between bg-surface rounded-lg p-3">
                    <div>
                      <p className="text-text-primary">{bouquet?.name || t.orderDetails.unknownBouquet}</p>
                      <p className="text-text-secondary text-sm">{t.orderDetails.qty}: {item.quantity} × {formatCurrency(item.price)}</p>
                    </div>
                    <span className="text-status-success font-medium">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-surface rounded-lg p-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-secondary">{t.orderDetails.subtotal}</span>
              <span className="text-text-primary">
                {formatCurrency(order.total - order.deliveryFee)}
              </span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-text-secondary">{t.orderDetails.deliveryFee}</span>
              <span className="text-text-primary">{formatCurrency(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between font-medium pt-2 border-t border-elevated">
              <span className="text-text-primary">{t.orderDetails.total}</span>
              <span className="text-status-success text-lg">{formatCurrency(order.total)}</span>
            </div>
          </div>

          {order.comment && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-text-secondary text-sm mb-1">{t.orderDetails.comment}</p>
              <p className="text-text-primary">{order.comment}</p>
            </div>
          )}

          {orderPhoto && <OrderPhoto filename={orderPhoto} />}

          {order.status !== 'completed' && order.status !== 'cancelled' && nextStatus && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-text-secondary text-sm mb-2">{t.orderDetails.updateStatus}</p>
              <Button
                onClick={() => onStatusChange(nextStatus)}
                className="w-full justify-center"
              >
                <span className="truncate">{t.orderDetails.markAs} {t.statuses[nextStatus as keyof typeof t.statuses]}</span>
                <ChevronRight size={16} className="shrink-0" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function OrderPhoto({ filename }: { filename: string }) {
  const { t } = useLanguage();
  const url = usePhotoUrl(filename);
  const [broken, setBroken] = useState(false);

  return (
    <div className="bg-surface rounded-lg p-3">
      <p className="text-text-secondary text-sm mb-2">{t.photos.photo}</p>
      {url && !broken ? (
        <img
          src={url}
          alt={t.photos.photo}
          onError={() => setBroken(true)}
          className="w-full max-h-64 object-contain rounded-lg border border-border bg-card"
        />
      ) : (
        <div className="w-full h-32 flex items-center justify-center gap-2 text-text-muted border border-dashed border-border rounded-lg">
          <ImageOff size={20} />
          <span className="text-sm">{t.photos.unavailable}</span>
        </div>
      )}
    </div>
  );
}
