import { useState, useMemo, useRef } from 'react';
import { Search, Plus, Edit, Trash2, DollarSign, TrendingUp, Camera, Flower2, X } from 'lucide-react';
import { Bouquet, InventoryItem } from '../types';
import { useBouquets, useInventory, getHistoryAdapter } from '../hooks/useStore';
import { calculateBouquetCost, calculateBouquetProfit, calculateBouquetMargin } from '../services/inventoryService';
import { recordHistory } from '../services/historyService';
import { formatCurrency } from '../utils/formatters';
import { showToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { DiscardChangesDialog } from '../components/ui/DiscardChangesDialog';
import { useCloseGuard } from '../hooks/useCloseGuard';
import { AnimatedListItem } from '../components/ui/AnimatedListItem';
import { usePermissions } from '../contexts/PermissionsContext';
import { useLanguage } from '../i18n';

const MAX_IMAGE_SIZE_MB = 2;
const MAX_IMAGE_DIMENSION = 800;

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width > height) {
            height = (height / width) * MAX_IMAGE_DIMENSION;
            width = MAX_IMAGE_DIMENSION;
          } else {
            width = (width / height) * MAX_IMAGE_DIMENSION;
            height = MAX_IMAGE_DIMENSION;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas error')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Invalid image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

export function BouquetsPage() {
  const { t } = useLanguage();
  const { can } = usePermissions();
  const canDelete = can('deleteRecords');
  const { bouquets, refresh, addBouquet, updateBouquet, deleteBouquet: deleteOneBouquet, deleteAllBouquets } = useBouquets();
  const { inventory } = useInventory();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingBouquet, setEditingBouquet] = useState<Bouquet | null>(null);
  const [bouquetToDelete, setBouquetToDelete] = useState<Bouquet | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredBouquets = useMemo(() => {
    if (!searchQuery) return bouquets;
    const query = searchQuery.toLowerCase();
    return bouquets.filter(b => b.name.toLowerCase().includes(query));
  }, [bouquets, searchQuery]);

  const handleDeleteBouquet = async () => {
    if (bouquetToDelete) {
      setDeletingId(bouquetToDelete.id);
      setTimeout(async () => {
        try {
          void recordHistory('bouquet_deleted', 'bouquet', bouquetToDelete.id, `Bouquet "${bouquetToDelete.name}" deleted`, undefined, getHistoryAdapter());
          await deleteOneBouquet(bouquetToDelete.id);
          setBouquetToDelete(null);
          setDeletingId(null);
          showToast('success', t.bouquets.bouquetDeleted);
        } catch (err) {
          setDeletingId(null);
          showToast('error', err instanceof Error ? err.message : 'Failed to delete bouquet');
        }
      }, 400);
    }
  };

  const handleDeleteAllBouquets = async () => {
    try {
      await deleteAllBouquets();
      setShowDeleteAll(false);
      showToast('success', t.bouquets.deleteAllSuccess);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete all bouquets');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-primary">{t.bouquets.title}</h1>
        <div className="flex items-center gap-2">
          {canDelete && (
            <Button variant="secondary" onClick={() => setShowDeleteAll(true)}>
              <Trash2 size={16} />
              {t.bouquets.deleteAll}
            </Button>
          )}
          <Button onClick={() => setEditingBouquet({} as Bouquet)}>
            <Plus size={20} />
            {t.bouquets.createBouquet}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder={t.bouquets.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBouquets.map((bouquet) => {
          const cost = calculateBouquetCost(bouquet, inventory);
          const profit = calculateBouquetProfit(bouquet, inventory);
          const margin = calculateBouquetMargin(bouquet, inventory);

          return (
            <AnimatedListItem key={bouquet.id} isDeleting={deletingId === bouquet.id} variant="slide-up">
              <div
                className="bg-card rounded-lg border border-border overflow-hidden hover:border-elevated transition-colors"
              >
              <div className="h-32 bg-gradient-to-br from-accent-green/20 to-accent-burgundy/20 flex items-center justify-center">
                {bouquet.photoUrl ? (
                  <img src={bouquet.photoUrl} alt={bouquet.name} className="w-full h-full object-cover" />
                ) : (
                  <Flower2 size={40} className="text-accent-green-light" strokeWidth={1.5} />
                )}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-text-primary font-medium">{bouquet.name}</h3>
                    {bouquet.description && (
                      <p className="text-text-muted text-sm mt-1">{bouquet.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditingBouquet(bouquet)}
                      className="p-2 text-text-secondary hover:text-text-primary hover:bg-hover rounded"
                    >
                      <Edit size={16} />
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => setBouquetToDelete(bouquet)}
                        className="p-2 text-text-secondary hover:text-status-danger hover:bg-hover rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">{t.bouquets.ingredients}:</span>
                    <span className="text-text-primary">{bouquet.items.length} {t.bouquets.items}</span>
                  </div>
                  {bouquet.items.map((item, idx) => {
                    const invItem = inventory.find(i => i.id === item.inventoryItemId);
                    return (
                      <div key={idx} className="flex justify-between text-sm text-text-secondary">
                        <span>{invItem?.name || 'Unknown'}{invItem?.capacity ? ` (${invItem.capacity} ${invItem.capacityUnit})` : ''}</span>
                        <span>×{item.quantity}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-border space-y-2">
                  <div className="flex justify-between">
                    <span className="text-text-secondary text-sm">{t.bouquets.sellingPrice}</span>
                    <span className="text-text-primary font-medium">{formatCurrency(bouquet.sellingPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary text-sm flex items-center gap-1">
                      <DollarSign size={14} /> {t.bouquets.cost}
                    </span>
                    <span className="text-status-warning">{formatCurrency(cost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary text-sm flex items-center gap-1">
                      <TrendingUp size={14} /> {t.bouquets.profit}
                    </span>
                    <span className="text-status-success font-medium">{formatCurrency(profit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary text-sm">{t.bouquets.margin}</span>
                    <Badge variant={margin > 50 ? 'success' : margin > 30 ? 'warning' : 'danger'}>
                      {margin.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </div>
              </div>
            </AnimatedListItem>
          );
        })}
      </div>

      {filteredBouquets.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          {t.bouquets.noBouquets}
        </div>
      )}

      {editingBouquet && (
        <BouquetForm
          bouquet={editingBouquet.id ? editingBouquet : undefined}
          inventory={inventory}
          onClose={() => setEditingBouquet(null)}
          onSaved={async () => {
            await refresh();
            setEditingBouquet(null);
          }}
          addBouquet={addBouquet}
          updateBouquet={updateBouquet}
        />
      )}

      <ConfirmDialog
        isOpen={!!bouquetToDelete}
        onClose={() => setBouquetToDelete(null)}
        onConfirm={handleDeleteBouquet}
        title={t.bouquets.delete}
        message={t.bouquets.deleteConfirm.replace('{name}', bouquetToDelete?.name || '')}
        confirmLabel={t.bouquets.delete}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showDeleteAll}
        onClose={() => setShowDeleteAll(false)}
        onConfirm={handleDeleteAllBouquets}
        title={t.bouquets.deleteAll}
        message={t.bouquets.deleteAllConfirm}
        confirmLabel={t.common.delete}
        variant="danger"
      />
    </div>
  );
}

function BouquetForm({
  bouquet,
  inventory,
  onClose,
  onSaved,
  addBouquet,
  updateBouquet,
}: {
  bouquet?: Bouquet;
  inventory: InventoryItem[];
  onClose: () => void;
  onSaved: () => void;
  addBouquet: (bouquet: Bouquet) => Promise<void>;
  updateBouquet: (bouquet: Bouquet) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(bouquet?.name || '');
  const [description, setDescription] = useState(bouquet?.description || '');
  const [sellingPrice, setSellingPrice] = useState(bouquet?.sellingPrice || 0);
  const [items, setItems] = useState<{ inventoryItemId: string; quantity: number }[]>(
    bouquet?.items || [{ inventoryItemId: '', quantity: 1 }]
  );
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(bouquet?.photoUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unsaved-changes detection: everything is compared with the values the
  // dialog was opened with, so an unchanged form closes without a prompt.
  const [initial] = useState(() => ({
    name: bouquet?.name || '',
    description: bouquet?.description || '',
    sellingPrice: bouquet?.sellingPrice || 0,
    photoUrl: bouquet?.photoUrl,
    items: JSON.stringify(bouquet?.items || [{ inventoryItemId: '', quantity: 1 }]),
  }));

  const isDirty = useMemo(() => (
    name !== initial.name ||
    description !== initial.description ||
    sellingPrice !== initial.sellingPrice ||
    photoUrl !== initial.photoUrl ||
    JSON.stringify(items) !== initial.items
  ), [name, description, sellingPrice, photoUrl, items, initial]);

  const guard = useCloseGuard({ isDirty, onClose });

  const categoryLabelMap: Record<string, string> = {
    flowers: t.categories.flowers,
    greenery: t.categories.greenery,
    fillers: t.categories.fillers,
    packaging: t.categories.packaging,
    basketsContainers: t.categories.basketsContainers,
    floralSupplies: t.categories.floralSupplies,
    decorations: t.categories.decorations,
    other: t.categories.other,
  };

  const getCategoryLabel = (cat: string) => categoryLabelMap[cat] || cat;

  const addItem = () => {
    setItems([...items, { inventoryItemId: '', quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const calculatedCost = items.reduce((sum, item) => {
    const invItem = inventory.find(i => i.id === item.inventoryItemId);
    return sum + (invItem ? invItem.purchasePrice * item.quantity : 0);
  }, 0);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('error', t.bouquets.invalidImageType);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      showToast('error', t.bouquets.imageTooLarge.replace('{size}', String(MAX_IMAGE_SIZE_MB)));
      return;
    }
    try {
      const resized = await resizeImage(file);
      setPhotoUrl(resized);
    } catch {
      showToast('error', t.bouquets.imageLoadError);
    }
  };

  const handleSubmit = async () => {
    if (!name) {
      showToast('error', t.bouquets.nameRequired);
      return;
    }
    if (!items.some(i => i.inventoryItemId)) {
      showToast('error', t.bouquets.addIngredientRequired);
      return;
    }

    try {
      const historyAdapter = getHistoryAdapter();
      if (bouquet?.id) {
        await updateBouquet({
          ...bouquet,
          name,
          description,
          sellingPrice,
          photoUrl,
          items: items.filter(i => i.inventoryItemId),
          updatedAt: new Date().toISOString(),
        });
        void recordHistory('bouquet_edited', 'bouquet', bouquet.id, `Bouquet "${name}" updated`, { price: sellingPrice, ingredientCount: items.filter(i => i.inventoryItemId).length }, historyAdapter);
      } else {
        const newBouquet: Bouquet = {
          id: uuidv4(),
          name,
          description,
          sellingPrice,
          photoUrl,
          items: items.filter(i => i.inventoryItemId),
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await addBouquet(newBouquet);
        void recordHistory('bouquet_created', 'bouquet', newBouquet.id, `Bouquet "${name}" created`, { price: sellingPrice }, historyAdapter);
      }

      showToast('success', bouquet?.id ? t.bouquets.bouquetUpdated : t.bouquets.bouquetCreated);
      onSaved();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save bouquet');
    }
  };

  return (
    <Modal isOpen onClose={guard.requestClose} closeOnBackdrop={false} title={bouquet?.id ? t.bouquets.editBouquet : t.bouquets.newBouquet} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.bouquets.name} *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.bouquets.sellingPrice}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.bouquets.description}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.bouquets.photo}</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoUpload}
            className="hidden"
          />
          {photoUrl ? (
            <div className="relative inline-block">
              <img src={photoUrl} alt={name} className="w-32 h-32 object-cover rounded-lg border border-border" />
              <button
                type="button"
                onClick={() => setPhotoUrl(undefined)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-status-danger rounded-full flex items-center justify-center text-accent-text hover:bg-status-danger/80"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-3 border border-dashed border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-elevated transition-colors"
            >
              <Camera size={20} />
              <span className="text-sm">{t.bouquets.uploadPhoto}</span>
            </button>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-text-secondary">{t.bouquets.ingredients} *</label>
            <button
              type="button"
              onClick={addItem}
              className="text-accent-green-light hover:text-accent-green text-sm flex items-center gap-1"
            >
              <Plus size={16} /> {t.bouquets.addIngredient}
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex flex-col sm:flex-row gap-2">
                <select
                  value={item.inventoryItemId}
                  onChange={(e) => updateItem(index, 'inventoryItemId', e.target.value)}
                  className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                >
                  <option value="">{t.bouquets.selectItem}</option>
                  {inventory.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.color || getCategoryLabel(inv.category)}){inv.capacity ? `  ${inv.capacity} ${inv.capacityUnit}` : ''} - {formatCurrency(inv.sellingPrice || inv.purchasePrice)}/{String(t.inventory[inv.unit as keyof typeof t.inventory])}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-center"
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-2 text-status-danger hover:text-status-danger"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-text-secondary text-sm">{t.bouquets.cost}</p>
            <p className="text-status-warning font-medium">{formatCurrency(calculatedCost)}</p>
          </div>
          <div>
            <p className="text-text-secondary text-sm">{t.bouquets.profit}</p>
            <p className="text-status-success font-medium">{formatCurrency(sellingPrice - calculatedCost)}</p>
          </div>
          <div>
            <p className="text-text-secondary text-sm">{t.bouquets.margin}</p>
            <p className="text-text-primary font-medium">
              {sellingPrice > 0 ? (((sellingPrice - calculatedCost) / sellingPrice) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={guard.requestClose} className="flex-1">
            {t.common.cancel}
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            {bouquet?.id ? t.bouquets.update : t.bouquets.create}
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
