import { useState } from 'react';
import { Edit, ImageOff, MapPin, Repeat, Trash2 } from 'lucide-react';
import { PurchaseHistoryEntry, deletePurchase } from '../../services/purchaseService';
import { deleteOrderAndCleanup } from '../../services/orderService';
import { recordHistory } from '../../services/historyService';
import { photoOwnerKey, removeOwnerPhotos, removePhoto } from '../../services/photoStorage';
import { formatCurrency, formatDate, getStatusColor } from '../../utils/formatters';
import { useLanguage } from '../../i18n';
import { useOrders, useInventory, getHistoryAdapter } from '../../hooks/useStore';
import { usePermissions } from '../../contexts/PermissionsContext';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';
import { showToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { PhotoLightbox } from '../ui/PhotoLightbox';

interface PurchaseDetailProps {
  entry: PurchaseHistoryEntry;
  onClose: () => void;
  /** Manual entries only - orders are not editable from here. */
  onEdit?: () => void;
  /** Opens the new-order form prefilled from this entry ("Repeat bouquet"). */
  onRepeat?: () => void;
  /** Called after the entry or one of its photos changed/was deleted. */
  onChanged: () => void;
}

/**
 * Details of one purchase history entry: full photo gallery (lightbox with
 * prev/next and per-photo delete), composition, price, date and note.
 * Manual entries can be edited; deleting an entry removes its photo files.
 */
export function PurchaseDetail({ entry, onClose, onEdit, onRepeat, onChanged }: PurchaseDetailProps) {
  const { t } = useLanguage();
  const { can } = usePermissions();
  const canDelete = can('deleteRecords');
  const { getAdapter: getOrderAdapter } = useOrders();
  const { getAdapter: getInventoryAdapter } = useInventory();
  const [photos, setPhotos] = useState<string[]>(entry.photos);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirmEntryDelete, setConfirmEntryDelete] = useState(false);
  const [confirmPhotoDelete, setConfirmPhotoDelete] = useState<string | null>(null);

  const isOrder = entry.source === 'order';
  const displayTitle = entry.title || t.purchases.unknownBouquet;

  const handleDeletePhoto = async () => {
    const filename = confirmPhotoDelete;
    if (!filename) return;
    setConfirmPhotoDelete(null);
    setLightboxIndex(null);
    setPhotos(prev => prev.filter(f => f !== filename));
    await removePhoto(entry.key, filename);
    onChanged();
  };

  const handleDelete = async () => {
    try {
      if (isOrder) {
        // Same cleanup as deleting the order on the Orders page.
        await deleteOrderAndCleanup(entry.id, getOrderAdapter(), getInventoryAdapter());
        void recordHistory('order_deleted', 'order', entry.id, `Order ${entry.id} deleted`, undefined, getHistoryAdapter());
        showToast('success', t.orders.orderDeleted.replace('{id}', entry.id));
      } else {
        await deletePurchase(entry.id);
        await removeOwnerPhotos(entry.key);
        showToast('success', t.purchases.deleted);
      }
      onChanged();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[PurchaseDetail] Delete failed:', msg, err);
      showToast('error', msg);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={displayTitle} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-surface text-text-secondary">
            {isOrder ? t.purchases.fromOrder : t.purchases.manual}
          </span>
          {isOrder && entry.order && (
            <>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getStatusColor(entry.order.status)}`}>
                {t.statuses[entry.order.status]}
              </span>
              <span className="text-xs text-text-muted">{t.orderDetails.order} {entry.id}</span>
            </>
          )}
          <span className="ml-auto text-sm font-semibold text-status-success">
            {formatCurrency(entry.price)}
          </span>
        </div>

        <div>
          <p className="text-sm text-text-secondary mb-2">{t.purchases.photos}</p>
          {photos.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {photos.map((filename, index) => (
                <GalleryThumb key={filename} filename={filename} onClick={() => setLightboxIndex(index)} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-text-muted text-sm bg-surface border border-dashed border-border rounded-lg p-4">
              <ImageOff size={18} />
              {t.purchases.noPhotos}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="bg-surface border border-border rounded-lg p-3">
            <p className="text-xs text-text-secondary mb-1">{t.purchases.composition}</p>
            <p className="text-text-primary whitespace-pre-line">{entry.composition || '—'}</p>
          </div>
          <div className="space-y-3">
            <div className="bg-surface border border-border rounded-lg p-3">
              <p className="text-xs text-text-secondary mb-1">{t.purchases.date}</p>
              <p className="text-text-primary">{formatDate(entry.date)}</p>
              {entry.deliveryAddress && (
                <p className="flex items-start gap-1 text-xs text-text-secondary mt-2">
                  <MapPin size={12} className="shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{entry.deliveryAddress}</span>
                </p>
              )}
            </div>
            {isOrder && entry.order && (
              <div className="bg-surface border border-border rounded-lg p-3">
                <p className="text-xs text-text-secondary mb-1">{t.orderDetails.delivery}</p>
                <p className="text-text-primary">
                  {formatDate(entry.order.deliveryDate)} {entry.order.deliveryTime}
                </p>
              </div>
            )}
          </div>
        </div>

        {entry.note && (
          <div className="bg-surface border border-border rounded-lg p-3 text-sm">
            <p className="text-xs text-text-secondary mb-1">{t.purchases.note}</p>
            <p className="text-text-primary whitespace-pre-line">{entry.note}</p>
          </div>
        )}

        <div className="flex gap-3 pt-3 border-t border-border">
          {onRepeat && (
            <Button variant="secondary" onClick={onRepeat} className="flex-1">
              <Repeat size={16} />
              {t.purchases.repeat}
            </Button>
          )}
          {onEdit && (
            <Button variant="secondary" onClick={onEdit} className="flex-1">
              <Edit size={16} />
              {t.common.edit}
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" onClick={() => setConfirmEntryDelete(true)} className="flex-1">
              <Trash2 size={16} />
              {t.common.delete}
            </Button>
          )}
        </div>
      </div>

      {lightboxIndex !== null && photos.length > 0 && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDeletePhoto={(filename) => setConfirmPhotoDelete(filename)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmEntryDelete}
        onClose={() => setConfirmEntryDelete(false)}
        onConfirm={handleDelete}
        title={isOrder ? t.orders.deleteOrder : t.purchases.deleteTitle}
        message={isOrder
          ? t.orders.deleteOrderConfirm.replace('{id}', entry.id)
          : t.purchases.deleteConfirm.replace('{name}', displayTitle)}
        confirmLabel={t.common.delete}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={!!confirmPhotoDelete}
        onClose={() => setConfirmPhotoDelete(null)}
        onConfirm={handleDeletePhoto}
        title={t.purchases.deletePhotoTitle}
        message={t.purchases.deletePhotoConfirm}
        confirmLabel={t.common.delete}
        variant="danger"
      />
    </Modal>
  );
}

function GalleryThumb({ filename, onClick }: { filename: string; onClick: () => void }) {
  const { t } = useLanguage();
  const url = usePhotoUrl(filename);
  const [broken, setBroken] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-surface"
    >
      {url && !broken ? (
        <img
          src={url}
          alt={t.photos.photo}
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="w-full h-full flex items-center justify-center text-text-muted">
          <ImageOff size={20} />
        </span>
      )}
    </button>
  );
}
