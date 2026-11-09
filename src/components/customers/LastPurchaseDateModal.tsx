import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { PurchaseHistoryEntry, updatePurchase } from '../../services/purchaseService';
import { updateOrderPurchaseDate } from '../../services/orderService';
import { getOrderAdapter } from '../../hooks/useStore';
import { replaceLocalDate, toDateInputValue } from '../../utils/purchaseDate';
import { showToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useLanguage } from '../../i18n';

interface LastPurchaseDateModalProps {
  entry: PurchaseHistoryEntry;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Edits the date of the most recent purchase shown in the client's
 * "Last purchase" tile. Manual purchases update their own date; orders use
 * their created date as the purchase date.
 */
export function LastPurchaseDateModal({ entry, onClose, onSaved }: LastPurchaseDateModalProps) {
  const { t } = useLanguage();
  const [date, setDate] = useState(() => toDateInputValue(entry.date));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!date) {
      setError(t.purchases.dateRequired);
      return;
    }

    setSaving(true);
    try {
      if (entry.source === 'manual' && entry.purchase) {
        const purchase = entry.purchase;
        await updatePurchase(purchase, {
          name: purchase.name,
          composition: purchase.composition,
          price: purchase.price,
          date,
          deliveryAddress: purchase.deliveryAddress,
          note: purchase.note,
        });
      } else if (entry.source === 'order' && entry.order) {
        await updateOrderPurchaseDate(
          entry.order.id,
          replaceLocalDate(entry.order.createdAt, date),
          getOrderAdapter(),
        );
      }

      showToast('success', t.purchases.dateUpdated);
      onSaved();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[LastPurchaseDateModal] Failed to update purchase date:', err);
      showToast('error', message);
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdrop={false}
      title={t.purchases.editLastPurchaseDate}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-sm text-text-secondary">
          <CalendarDays size={16} className="mt-0.5 shrink-0 text-accent-green-light" />
          <p>{t.purchases.editLastPurchaseDateHint}</p>
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.purchases.date} *</label>
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              if (error) setError('');
            }}
            className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary ${error ? '!border-status-danger' : ''}`}
          />
          {error && <p className="text-xs text-status-danger mt-1">{error}</p>}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {t.common.cancel}
          </Button>
          <Button onClick={handleSubmit} isLoading={saving} className="flex-1">
            {t.common.save}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
