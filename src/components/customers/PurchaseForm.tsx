import { useRef, useMemo, useState } from 'react';
import { Customer, ClientPurchase } from '../../types';
import {
  createPurchase,
  updatePurchase,
  PurchaseHistoryEntry,
} from '../../services/purchaseService';
import {
  copyPhotoToOwner,
  listPhotos,
  photoOwnerKey,
  removePhoto,
  savePhoto,
} from '../../services/photoStorage';
import { photoErrorMessage } from '../../utils/photoErrors';
import { showToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { DiscardChangesDialog } from '../ui/DiscardChangesDialog';
import { useCloseGuard } from '../../hooks/useCloseGuard';
import { PhotoGalleryPicker } from '../ui/PhotoGalleryPicker';
import { useLanguage } from '../../i18n';

interface PurchaseFormProps {
  customer: Customer;
  /** When set - the form edits an existing manual purchase. */
  purchase?: ClientPurchase;
  /** When set - the form repeats another purchase/order: name, composition and
   *  price are prefilled, the date defaults to today and the source photos are
   *  copied as independent files on submit. Cannot be combined with `purchase`. */
  repeatFrom?: PurchaseHistoryEntry;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Add / edit a manually added bouquet purchase (bouquets bought before the
 * shop started tracking orders). Photos are written to disk on submit; a
 * photo removed here is deleted from disk immediately. In repeat mode the
 * source entry's photos are copied to new files, so deleting the original
 * entry later never breaks the repeated purchase.
 */
export function PurchaseForm({ customer, purchase, repeatFrom, onClose, onSaved }: PurchaseFormProps) {
  const { t } = useLanguage();
  // Orders whose bouquet was deleted from the catalog show a placeholder
  // title - never prefill the name field with "—".
  const repeatTitle = repeatFrom?.title === '—' ? '' : repeatFrom?.title;
  const [name, setName] = useState(purchase?.name || repeatTitle || '');
  const [composition, setComposition] = useState(purchase?.composition || repeatFrom?.composition || '');
  const [price, setPrice] = useState(
    purchase ? String(purchase.price) : repeatFrom ? String(repeatFrom.price) : ''
  );
  const today = new Date().toISOString().split('T')[0];
  // Repeat always starts at today, never at the old purchase date.
  const [date, setDate] = useState(purchase?.date || today);
  const [deliveryAddress, setDeliveryAddress] = useState(
    purchase?.deliveryAddress || repeatFrom?.deliveryAddress || ''
  );
  const [note, setNote] = useState(purchase?.note || '');
  const [photos, setPhotos] = useState<string[]>(
    purchase ? listPhotos(photoOwnerKey('purchase', purchase.id)) : repeatFrom ? [...repeatFrom.photos] : []
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [priceError, setPriceError] = useState('');
  const [dateError, setDateError] = useState('');
  const [saving, setSaving] = useState(false);
  // Guards for a retry after a photo failure: never create the entry twice
  // (it would be counted twice in the statistics) and never copy the source
  // photos a second time.
  const createdRef = useRef<ClientPurchase | null>(null);
  const photosCopiedRef = useRef(false);

  // Unsaved-changes detection: compared with the values the dialog opened
  // with (a new purchase starts empty, so closing it needs no prompt).
  const initial = useRef({
    name: purchase?.name || repeatTitle || '',
    composition: purchase?.composition || repeatFrom?.composition || '',
    price: purchase ? String(purchase.price) : repeatFrom ? String(repeatFrom.price) : '',
    date: purchase?.date || today,
    deliveryAddress: purchase?.deliveryAddress || repeatFrom?.deliveryAddress || '',
    note: purchase?.note || '',
    photos: (purchase
      ? listPhotos(photoOwnerKey('purchase', purchase.id))
      : repeatFrom
      ? [...repeatFrom.photos]
      : []
    ).join(','),
  }).current;

  const isDirty = useMemo(() => (
    name !== initial.name ||
    composition !== initial.composition ||
    price !== initial.price ||
    date !== initial.date ||
    deliveryAddress !== initial.deliveryAddress ||
    note !== initial.note ||
    photos.join(',') !== initial.photos ||
    pendingFiles.length > 0
  ), [name, composition, price, date, deliveryAddress, note, photos, pendingFiles, initial]);

  const guard = useCloseGuard({ isDirty, onClose });

  const handleAddPhoto = (file: File) => {
    setPendingFiles(prev => [...prev, file]);
  };

  const handleRemovePending = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Removing an already saved photo deletes the file right away, so closing
  // the dialog without saving never leaves a half-removed photo behind. In
  // repeat mode the photos initially shown still belong to the source entry:
  // removing one there only drops it from the copy, the source file stays.
  const handleRemovePhoto = (filename: string) => {
    setPhotos(prev => prev.filter(f => f !== filename));
    const ownedBy = purchase ?? (photosCopiedRef.current ? createdRef.current : null);
    if (ownedBy) void removePhoto(photoOwnerKey('purchase', ownedBy.id), filename);
  };

  const handleSubmit = async () => {
    const parsedPrice = parseFloat(price);
    let hasError = false;

    if (price.trim() === '' || Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setPriceError(t.purchases.invalidPrice);
      hasError = true;
    }
    if (!date) {
      setDateError(t.purchases.dateRequired);
      hasError = true;
    }
    if (hasError) return;

    setSaving(true);
    try {
      const values = { name, composition, price: parsedPrice, date, deliveryAddress, note };
      // createdRef guards a retry after a photo failure: the entry already
      // exists by then and must be updated, never created a second time
      // (that would count it twice in the statistics).
      const saved = purchase
        ? await updatePurchase(purchase, values)
        : createdRef.current
        ? await updatePurchase(createdRef.current, values)
        : await createPurchase(customer.id, values);
      createdRef.current = saved;

      const ownerKey = photoOwnerKey('purchase', saved.id);

      // Repeat: copy the source photos to independent files under the new
      // entry. A missing/unreadable source file is skipped - the repeat still
      // works without that photo. Runs at most once even on a retry.
      if (repeatFrom && !photosCopiedRef.current) {
        photosCopiedRef.current = true;
        const copied: string[] = [];
        for (const filename of photos) {
          const copiedName = await copyPhotoToOwner(filename, ownerKey);
          if (copiedName) copied.push(copiedName);
        }
        setPhotos(copied);
      }

      for (const file of pendingFiles) {
        const filename = await savePhoto(ownerKey, file);
        setPhotos(prev => [...prev, filename]);
      }

      showToast('success', purchase ? t.purchases.updated : t.purchases.added);
      onSaved();
      onClose();
    } catch (err) {
      // The record is already saved; keep the dialog open so the photo can be
      // retried instead of losing the entry.
      console.error('[PurchaseForm] Failed to save purchase:', err);
      showToast('error', photoErrorMessage(err, t));
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={guard.requestClose}
      closeOnBackdrop={false}
      title={purchase ? t.purchases.editBouquet : repeatFrom ? t.purchases.repeatBouquet : t.purchases.addBouquet}
      size="lg"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.purchases.photos}</label>
          <PhotoGalleryPicker
            photos={photos}
            pendingFiles={pendingFiles}
            onAdd={handleAddPhoto}
            onRemovePhoto={handleRemovePhoto}
            onRemovePending={handleRemovePending}
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.purchases.nameOptional}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.purchases.composition}</label>
          <textarea
            value={composition}
            onChange={(e) => setComposition(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
            placeholder={t.purchases.compositionPlaceholder}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.common.price} *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                if (priceError) setPriceError('');
              }}
              className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary ${priceError ? '!border-status-danger' : ''}`}
            />
            {priceError && <p className="text-xs text-status-danger mt-1">{priceError}</p>}
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.purchases.date} *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (dateError) setDateError('');
              }}
              className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary ${dateError ? '!border-status-danger' : ''}`}
            />
            {dateError && <p className="text-xs text-status-danger mt-1">{dateError}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.purchases.deliveryAddressOptional}</label>
          <input
            type="text"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            placeholder={t.purchases.deliveryAddressPlaceholder}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.purchases.noteOptional}</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={guard.requestClose} className="flex-1">
            {t.common.cancel}
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="flex-1">
            {purchase ? t.common.saveChanges : t.purchases.addBouquet}
          </Button>
        </div>

        {/* Rendered inside the dialog so the prompt stacks above this form. */}
        <DiscardChangesDialog
          isOpen={guard.confirming}
          onCancel={guard.cancelDiscard}
          onConfirm={guard.confirmDiscard}
        />
      </div>
    </Modal>
  );
}
