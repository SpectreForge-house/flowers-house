import { useMemo, useState } from 'react';
import { Edit, Flower2, ImageOff, Mail, MapPin, Phone, Plus, Repeat } from 'lucide-react';
import { Bouquet, ClientPurchase, Customer, Order } from '../../types';
import { buildPurchaseHistory, getPurchaseStats, PurchaseHistoryEntry } from '../../services/purchaseService';
import { usePurchases, useSettings } from '../../hooks/useStore';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useLanguage } from '../../i18n';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CustomerAvatar } from './CustomerAvatar';
import { StatusBadge } from './StatusBadge';
import { getClientStatus } from '../../services/clientStatusService';
import { PurchaseForm } from './PurchaseForm';
import { PurchaseDetail } from './PurchaseDetail';
import { LastPurchaseDateModal } from './LastPurchaseDateModal';

interface CustomerDetailProps {
  customer: Customer;
  orders: Order[];
  bouquets: Bouquet[];
  onClose: () => void;
  /** Called whenever the underlying data changed (order/purchase/photo). */
  onChanged: () => void;
  onEditCustomer: (customer: Customer) => void;
}

/**
 * Client detail view with the "Purchased bouquets" section: statistics
 * (count / total / average / last purchase) calculated from the client's
 * orders plus manually added purchases - every purchase counted once.
 */
export function CustomerDetail({ customer, orders, bouquets, onClose, onChanged, onEditCustomer }: CustomerDetailProps) {
  const { t } = useLanguage();
  const { purchases, refresh: refreshPurchases } = usePurchases();
  const { settings } = useSettings();
  const [addingPurchase, setAddingPurchase] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<ClientPurchase | null>(null);
  const [detailEntry, setDetailEntry] = useState<PurchaseHistoryEntry | null>(null);
  const [repeatingEntry, setRepeatingEntry] = useState<PurchaseHistoryEntry | null>(null);
  const [editingLastDate, setEditingLastDate] = useState<PurchaseHistoryEntry | null>(null);

  const entries = useMemo(
    () => buildPurchaseHistory(customer.id, orders, bouquets, purchases),
    // `purchases` is the state copy of the manual entries - included so the
    // list and the statistics update immediately after add/edit/delete.
    [customer.id, orders, bouquets, purchases],
  );
  const stats = useMemo(() => getPurchaseStats(entries), [entries]);
  // Entries are sorted newest first, so the first one is the purchase whose
  // date is shown in the "Last purchase" tile.
  const latestEntry = entries[0] ?? null;
  // Derived from live data - updates the moment a purchase is added/deleted.
  const status = useMemo(
    () => getClientStatus(customer.id, orders, bouquets, settings.clientStatus),
    [customer.id, orders, bouquets, settings.clientStatus],
  );

  const handleChanged = () => {
    refreshPurchases();
    onChanged();
  };

  return (
    <>
      <Modal isOpen onClose={onClose} title={customer.name} size="xl">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <CustomerAvatar customer={customer} size="lg" />
            <div className="min-w-0 flex-1 space-y-1">
              <StatusBadge status={status} />
              {customer.phone && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Phone size={14} className="shrink-0" />
                  {customer.phone}
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Mail size={14} className="shrink-0" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <MapPin size={14} className="shrink-0" />
                  <span className="truncate">{customer.address}</span>
                </div>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={() => onEditCustomer(customer)}>
              <Edit size={14} />
              {t.common.edit}
            </Button>
          </div>

          {(customer.preferences || customer.notes) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {customer.preferences && (
                <div className="bg-surface border border-border rounded-lg p-3">
                  <p className="text-xs text-text-secondary mb-1">{t.customers.preferences}</p>
                  <p className="text-text-primary whitespace-pre-line">{customer.preferences}</p>
                </div>
              )}
              {customer.notes && (
                <div className="bg-surface border border-border rounded-lg p-3">
                  <p className="text-xs text-text-secondary mb-1">{t.common.notes}</p>
                  <p className="text-text-primary whitespace-pre-line">{customer.notes}</p>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                <Flower2 size={18} className="text-accent-green-light" />
                {t.purchases.title}
              </h3>
              <Button size="sm" onClick={() => setAddingPurchase(true)}>
                <Plus size={16} />
                {t.purchases.addBouquet}
              </Button>
            </div>

            {entries.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatTile label={t.purchases.count} value={String(stats.count)} />
                  <StatTile label={t.purchases.totalSpent} value={formatCurrency(stats.total)} highlight />
                  <StatTile label={t.purchases.average} value={formatCurrency(stats.average)} />
                  <StatTile
                    label={t.purchases.lastPurchase}
                    value={stats.lastDate ? formatDate(stats.lastDate) : '—'}
                    onEdit={latestEntry ? () => setEditingLastDate(latestEntry) : undefined}
                    editLabel={t.purchases.editLastPurchaseDate}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {entries.map(entry => (
                    <EntryCard
                      key={entry.key}
                      entry={entry}
                      onOpen={() => setDetailEntry(entry)}
                      onRepeat={() => setRepeatingEntry(entry)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 bg-surface border border-dashed border-border rounded-lg">
                <Flower2 size={28} className="mx-auto text-text-muted mb-2" />
                <p className="text-text-secondary text-sm">{t.purchases.empty}</p>
                <p className="text-text-muted text-xs mt-1">{t.purchases.emptyHint}</p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {addingPurchase && (
        <PurchaseForm
          customer={customer}
          onClose={() => setAddingPurchase(false)}
          onSaved={handleChanged}
        />
      )}

      {editingPurchase && (
        <PurchaseForm
          customer={customer}
          purchase={editingPurchase}
          onClose={() => setEditingPurchase(null)}
          onSaved={handleChanged}
        />
      )}

      {repeatingEntry && (
        <PurchaseForm
          customer={customer}
          repeatFrom={repeatingEntry}
          onClose={() => setRepeatingEntry(null)}
          onSaved={handleChanged}
        />
      )}

      {detailEntry && (
        <PurchaseDetail
          entry={detailEntry}
          onClose={() => setDetailEntry(null)}
          onEdit={detailEntry.source === 'manual'
            ? () => {
                setEditingPurchase(detailEntry.purchase!);
                setDetailEntry(null);
              }
            : undefined}
          onRepeat={() => {
            setRepeatingEntry(detailEntry);
            setDetailEntry(null);
          }}
          onChanged={handleChanged}
        />
      )}

      {editingLastDate && (
        <LastPurchaseDateModal
          entry={editingLastDate}
          onClose={() => setEditingLastDate(null)}
          onSaved={handleChanged}
        />
      )}
    </>
  );
}

function StatTile({
  label,
  value,
  highlight,
  onEdit,
  editLabel,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  onEdit?: () => void;
  editLabel?: string;
}) {
  const content = (
    <>
      <span className="block pr-5 text-xs text-text-secondary">{label}</span>
      <span className={`block text-lg font-semibold mt-0.5 ${highlight ? 'text-status-success' : 'text-text-primary'}`}>
        {value}
      </span>
    </>
  );

  if (onEdit) {
    return (
      <button
        type="button"
        onClick={onEdit}
        title={editLabel}
        aria-label={editLabel}
        className="group relative bg-surface border border-border rounded-lg p-3 text-left hover:border-accent-green/50 transition-colors"
      >
        {content}
        <Edit
          size={14}
          className="absolute right-2 top-2 text-text-muted group-hover:text-accent-green-light transition-colors"
        />
      </button>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      {content}
    </div>
  );
}

function EntryCard({
  entry,
  onOpen,
  onRepeat,
}: {
  entry: PurchaseHistoryEntry;
  onOpen: () => void;
  onRepeat: () => void;
}) {
  const { t } = useLanguage();

  return (
    // Outer wrapper keeps "open" and "repeat" as siblings: buttons must not
    // be nested inside each other, and a repeat click must not open the card.
    <div className="flex items-center gap-1 p-3 bg-surface border border-border rounded-lg hover:border-elevated transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <EntryThumb filename={entry.photos[0]} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate">
            {entry.title || t.purchases.unknownBouquet}
          </p>
          <p className="text-xs text-text-secondary truncate">{entry.composition}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-card text-text-secondary">
              {entry.source === 'order' ? t.purchases.fromOrder : t.purchases.manual}
            </span>
            <span className="text-xs text-text-muted">{formatDate(entry.date)}</span>
          </div>
          {entry.deliveryAddress && (
            <p className="flex items-center gap-1 text-xs text-text-muted mt-1 min-w-0">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{entry.deliveryAddress}</span>
            </p>
          )}
        </div>
        <p className="text-sm font-semibold text-status-success shrink-0">
          {formatCurrency(entry.price)}
        </p>
      </button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRepeat}
        title={t.purchases.repeat}
        aria-label={t.purchases.repeat}
        className="shrink-0"
      >
        <Repeat size={16} />
      </Button>
    </div>
  );
}

function EntryThumb({ filename }: { filename?: string }) {
  const { t } = useLanguage();
  const url = usePhotoUrl(filename);
  const [broken, setBroken] = useState(false);

  if (!filename || !url || broken) {
    return (
      <div className="w-16 h-16 rounded-lg bg-card border border-border text-text-muted flex items-center justify-center shrink-0">
        {filename ? <ImageOff size={20} /> : <Flower2 size={22} />}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={t.photos.photo}
      onError={() => setBroken(true)}
      className="w-16 h-16 rounded-lg object-cover border border-border bg-surface shrink-0"
    />
  );
}
