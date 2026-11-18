import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  Filter,
  AlertTriangle,
  Edit,
  Trash2,
  History,
  ArrowUp,
  ArrowDown,
  ImageOff,
} from 'lucide-react';
import { InventoryItem, InventoryTransaction } from '../types';
import { useInventory, getHistoryAdapter } from '../hooks/useStore';
import { addStock, removeStock, getItemTransactions } from '../services/inventoryService';
import { InventoryStorageAdapter } from '../services/inventoryStorageAdapter';
import { getStorageMode } from '../services/storageAdapter';
import { recordHistory } from '../services/historyService';
import { listPhotos, photoOwnerKey, removePhoto, savePhoto } from '../services/photoStorage';
import { formatCurrency, formatDate } from '../utils/formatters';
import { photoErrorMessage } from '../utils/photoErrors';
import { showToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { DiscardChangesDialog } from '../components/ui/DiscardChangesDialog';
import { PhotoGalleryPicker } from '../components/ui/PhotoGalleryPicker';
import { PhotoLightbox } from '../components/ui/PhotoLightbox';
import { useCloseGuard } from '../hooks/useCloseGuard';
import { usePhotoUrl, useOwnerPhotos } from '../hooks/usePhotoUrl';
import { usePermissions } from '../contexts/PermissionsContext';
import { useLanguage } from '../i18n';

export function InventoryPage() {
  const { t, tMessage } = useLanguage();
  const { can } = usePermissions();
  const canDelete = can('deleteRecords');
  const { inventory, refresh, addItem, updateItem, deleteItem, deleteAll, getAdapter, reservations } = useInventory();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showAddStock, setShowAddStock] = useState<InventoryItem | null>(null);
  const [showRemoveStock, setShowRemoveStock] = useState<InventoryItem | null>(null);
  const [showHistory, setShowHistory] = useState<InventoryItem | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);

  const categories = useMemo(() => {
    const cats = new Set(inventory.map(i => i.category));
    return Array.from(cats);
  }, [inventory]);

  const categoryLabelMap = useMemo<Record<string, string>>(() => ({
    flowers: t.categories.flowers,
    greenery: t.categories.greenery,
    fillers: t.categories.fillers,
    packaging: t.categories.packaging,
    basketsContainers: t.categories.basketsContainers,
    floralSupplies: t.categories.floralSupplies,
    decorations: t.categories.decorations,
    other: t.categories.other,
  }), [t]);

  const getCategoryLabel = useCallback(
    (cat: string) => categoryLabelMap[cat] || cat,
    [categoryLabelMap],
  );

  const filteredInventory = useMemo(() => {
    let result = [...inventory];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(i => 
        i.name.toLowerCase().includes(query) ||
        i.category.toLowerCase().includes(query) ||
        getCategoryLabel(i.category).toLowerCase().includes(query) ||
        (i.supplier || '').toLowerCase().includes(query) ||
        (i.supplierSku || '').toLowerCase().includes(query)
      );
    }
    
    if (categoryFilter) {
      result = result.filter(i => i.category === categoryFilter);
    }
    
    if (showLowStock) {
      result = result.filter(i => i.quantity <= i.minStock);
    }
    
    return result;
  }, [inventory, searchQuery, categoryFilter, showLowStock, getCategoryLabel]);

  const lowStockCount = inventory.filter(i => i.quantity <= i.minStock).length;

  const handleAddStock = async (itemId: string, quantity: number, reason: string) => {
    try {
      const adapter = getStorageMode() === 'supabase' ? getAdapter() : undefined;
      const result = await addStock(itemId, quantity, reason, adapter);
      if (result.success) {
        await refresh();
        setShowAddStock(null);
        const item = inventory.find(i => i.id === itemId);
        void recordHistory('inventory_received', 'inventory', itemId, `Received ${quantity} ${item?.unit || ''} of ${item?.name || ''}: ${reason}`, { quantity, reason }, getHistoryAdapter());
        showToast('success', tMessage(result.message));
      } else {
        showToast('error', tMessage(result.message));
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to add stock');
    }
  };

  const handleRemoveStock = async (itemId: string, quantity: number, reason: string) => {
    try {
      const adapter = getStorageMode() === 'supabase' ? getAdapter() : undefined;
      const result = await removeStock(itemId, quantity, reason, adapter);
      if (result.success) {
        await refresh();
        setShowRemoveStock(null);
        const item = inventory.find(i => i.id === itemId);
        void recordHistory('inventory_decreased', 'inventory', itemId, `Removed ${quantity} ${item?.unit || ''} of ${item?.name || ''}: ${reason}`, { quantity, reason }, getHistoryAdapter());
        showToast('success', tMessage(result.message));
      } else {
        showToast('error', tMessage(result.message));
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to remove stock');
    }
  };

  const handleDeleteItem = async () => {
    if (itemToDelete) {
      setDeletingId(itemToDelete.id);
      setTimeout(async () => {
        try {
          await deleteItem(itemToDelete.id);
          void recordHistory('inventory_decreased', 'inventory', itemToDelete.id, `Inventory item "${itemToDelete.name}" deleted`, undefined, getHistoryAdapter());
          setItemToDelete(null);
          setDeletingId(null);
          showToast('success', t.inventory.itemDeleted);
        } catch (err) {
          setDeletingId(null);
          showToast('error', err instanceof Error ? err.message : 'Failed to delete item');
        }
      }, 350);
    }
  };

  const handleDeleteAllInventory = async () => {
    try {
      await deleteAll();
      setShowDeleteAll(false);
      showToast('success', t.inventory.deleteAllSuccess);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete all inventory');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-text-primary">{t.inventory.title}</h1>
          {lowStockCount > 0 && (
            <Badge variant="warning">
              <AlertTriangle size={14} className="mr-1" />
              {lowStockCount} {t.inventory.lowStock}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <Button variant="secondary" onClick={() => setShowDeleteAll(true)}>
              <Trash2 size={16} />
              {t.inventory.deleteAll}
            </Button>
          )}
          <Button onClick={() => setEditingItem({} as InventoryItem)}>
            <Plus size={16} />
            {t.inventory.addItem}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={t.inventory.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-text-primary focus:border-accent"
        >
          <option value="">{t.inventory.allCategories}</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
          ))}
        </select>
        <Button
          variant={showLowStock ? 'primary' : 'secondary'}
          onClick={() => setShowLowStock(!showLowStock)}
        >
          <Filter size={16} />
          {t.inventory.lowStock}
        </Button>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.inventory.product}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.inventory.category}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.inventory.stock}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.reservations.reserved}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.reservations.available}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.inventory.minStock}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.price}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.inventory.sellingPrice}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.status}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item) => {
                const isLow = item.quantity <= item.minStock;
                const reserved = reservations.filter(r => r.inventoryItemId === item.id && r.status === 'active').reduce((sum, r) => sum + r.quantity, 0);
                const available = item.quantity - reserved;
                return (
                  <tr key={item.id} className={`border-b border-border hover:bg-surface ${isLow ? 'bg-status-danger/5' : ''} ${deletingId === item.id ? 'animate-delete-row' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <InventoryThumb key={`${item.id}-${photoVersion}`} item={item} />
                        <div className="min-w-0">
                          <span className="text-text-primary font-medium">{item.name}</span>
                          {item.color && (
                            <span className="ml-2 text-text-muted text-sm">({item.color})</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{getCategoryLabel(item.category)}</td>
                    <td className="px-4 py-3">
                      <span className="text-text-primary">
                        {item.quantity}
                      </span>
                      <span className="text-text-muted text-sm ml-1">{t.inventory[item.unit]}</span>
                    </td>
                    <td className="px-4 py-3">
                      {reserved > 0 ? (
                        <span className="text-status-warning font-medium">{reserved} <span className="text-text-muted text-sm">{t.inventory[item.unit]}</span></span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${available <= 0 ? 'text-status-danger' : available <= item.minStock ? 'text-status-warning' : 'text-status-success'}`}>
                        {available}
                      </span>
                      <span className="text-text-muted text-sm ml-1">{t.inventory[item.unit]}</span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {item.minStock} {t.inventory[item.unit]}
                    </td>
                    <td className="px-4 py-3 text-status-success">
                      {formatCurrency(item.purchasePrice)}
                    </td>
                    <td className="px-4 py-3 text-status-success">
                      {item.sellingPrice ? formatCurrency(item.sellingPrice) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {isLow ? (
                        <Badge variant="danger">
                          <AlertTriangle size={12} className="mr-1" />
                          {t.inventory.lowStockAlert}
                        </Badge>
                      ) : (
                        <Badge variant="success">{t.inventory.inStock}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setShowAddStock(item)}
                          className="p-1.5 text-status-success hover:bg-status-success/20 rounded"
                          title={t.inventory.addStock}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          onClick={() => setShowRemoveStock(item)}
                          className="p-1.5 text-status-warning hover:bg-status-warning/20 rounded"
                          title={t.inventory.removeStock}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          onClick={() => setShowHistory(item)}
                          className="p-1.5 text-status-info hover:bg-status-info/20 rounded"
                          title={t.inventory.history}
                        >
                          <History size={16} />
                        </button>
                        <button
                          onClick={() => setEditingItem(item)}
                          className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-hover rounded"
                          title={t.common.edit}
                        >
                          <Edit size={16} />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setItemToDelete(item)}
                            className="p-1.5 text-text-secondary hover:text-status-danger hover:bg-hover rounded"
                            title={t.common.delete}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="sm:hidden divide-y divide-[#2a2a2a]">
          {filteredInventory.map((item) => {
            const isLow = item.quantity <= item.minStock;
            const reserved = reservations.filter(r => r.inventoryItemId === item.id && r.status === 'active').reduce((sum, r) => sum + r.quantity, 0);
            const available = item.quantity - reserved;
            return (
              <div key={item.id} className={`p-4 hover:bg-surface ${isLow ? 'bg-status-danger/5' : ''} ${deletingId === item.id ? 'animate-delete-row' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <InventoryThumb key={`${item.id}-${photoVersion}`} item={item} />
                    <div className="min-w-0">
                      <span className="text-text-primary font-medium">{item.name}</span>
                      {item.color && <span className="ml-2 text-text-muted text-sm">({item.color})</span>}
                    </div>
                  </div>
                  {isLow ? (
                    <Badge variant="danger">
                      <AlertTriangle size={12} className="mr-1" />
                      {t.inventory.lowStockAlert}
                    </Badge>
                  ) : (
                    <Badge variant="success">{t.inventory.inStock}</Badge>
                  )}
                </div>
                <p className="text-text-muted text-sm mb-2">{getCategoryLabel(item.category)}</p>
                <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-text-muted">{t.inventory.stock}:</span>
                    <span className="text-text-primary">{item.quantity} {t.inventory[item.unit]}</span>
                  </div>
                  {reserved > 0 && (
                    <div>
                      <span className="text-text-muted">{t.reservations.reserved}:</span>
                      <span className="ml-1 text-status-warning">{reserved}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-text-muted">{t.reservations.available}:</span>
                    <span className={`ml-1 font-medium ${available <= 0 ? 'text-status-danger' : 'text-status-success'}`}>{available}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowAddStock(item)} className="p-2 text-status-success hover:bg-status-success/20 rounded" title={t.inventory.addStock}>
                    <ArrowUp size={16} />
                  </button>
                  <button onClick={() => setShowRemoveStock(item)} className="p-2 text-status-warning hover:bg-status-warning/20 rounded" title={t.inventory.removeStock}>
                    <ArrowDown size={16} />
                  </button>
                  <button onClick={() => setShowHistory(item)} className="p-2 text-status-info hover:bg-status-info/20 rounded" title={t.inventory.history}>
                    <History size={16} />
                  </button>
                  <button onClick={() => setEditingItem(item)} className="p-2 text-text-secondary hover:text-text-primary hover:bg-hover rounded" title={t.common.edit}>
                    <Edit size={16} />
                  </button>
                  {canDelete && (
                    <button onClick={() => setItemToDelete(item)} className="p-2 text-text-secondary hover:text-status-danger hover:bg-hover rounded" title={t.common.delete}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {filteredInventory.length === 0 && (
          <div className="text-center py-8 text-text-muted">
            {t.common.noData}
          </div>
        )}
      </div>

      {showAddStock && (
        <StockAdjustment
          item={showAddStock}
          type="add"
          onClose={() => setShowAddStock(null)}
          onConfirm={(qty, reason) => handleAddStock(showAddStock.id, qty, reason)}
        />
      )}

      {showRemoveStock && (
        <StockAdjustment
          item={showRemoveStock}
          type="remove"
          onClose={() => setShowRemoveStock(null)}
          onConfirm={(qty, reason) => handleRemoveStock(showRemoveStock.id, qty, reason)}
        />
      )}

      {showHistory && (
        <TransactionHistory
          item={showHistory}
          onClose={() => setShowHistory(null)}
          adapter={getAdapter()}
        />
      )}

      {editingItem && (
        <InventoryItemForm
          item={editingItem.id ? editingItem : undefined}
          onClose={() => setEditingItem(null)}
          onSaved={async () => {
            await refresh();
            setPhotoVersion(v => v + 1);
            setEditingItem(null);
          }}
          addItem={addItem}
          updateItem={updateItem}
        />
      )}

      <ConfirmDialog
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleDeleteItem}
        title={t.inventory.delete}
        message={t.inventory.deleteConfirm.replace('{name}', itemToDelete?.name || '')}
        confirmLabel={t.inventory.delete}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showDeleteAll}
        onClose={() => setShowDeleteAll(false)}
        onConfirm={handleDeleteAllInventory}
        title={t.inventory.deleteAll}
        message={t.inventory.deleteAllConfirm}
        confirmLabel={t.common.delete}
        variant="danger"
      />
    </div>
  );
}

function InventoryThumb({ item }: { item: InventoryItem }) {
  const { t } = useLanguage();
  const photos = useOwnerPhotos(photoOwnerKey('inventory', item.id));
  const [index, setIndex] = useState<number | null>(null);
  const url = usePhotoUrl(photos[0]);

  if (photos.length === 0) {
    return (
      <div className="w-9 h-9 shrink-0 rounded-lg border border-border bg-surface text-text-muted flex items-center justify-center">
        <ImageOff size={15} />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIndex(0)}
        aria-label={t.photos.photo}
        className="w-9 h-9 shrink-0 rounded-lg border border-border bg-surface overflow-hidden hover:border-accent"
      >
        {url ? (
          <img src={url} alt={t.photos.photo} className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-text-muted">
            <ImageOff size={15} />
          </span>
        )}
      </button>
      {index !== null && (
        <PhotoLightbox
          photos={photos}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setIndex(null)}
        />
      )}
    </>
  );
}

function StockAdjustment({
  item,
  type,
  onClose,
  onConfirm,
}: {
  item: InventoryItem;
  type: 'add' | 'remove';
  onClose: () => void;
  onConfirm: (quantity: number, reason: string) => void;
}) {
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');

  // This dialog only holds a quantity and a reason: any difference from the
  // initial values counts as an unsaved change.
  const guard = useCloseGuard({ isDirty: quantity !== 1 || reason !== '', onClose });

  const handleSubmit = () => {
    if (quantity <= 0) {
      showToast('error', t.inventory.quantityRequired);
      return;
    }
    if (!reason.trim()) {
      showToast('error', t.inventory.reasonRequired);
      return;
    }
    onConfirm(quantity, reason);
  };

  return (
    <Modal
      isOpen
      onClose={guard.requestClose}
      closeOnBackdrop={false}
      title={`${type === 'add' ? t.inventory.add : t.inventory.remove} ${t.inventory.stock} - ${item.name}`}
      size="sm"
    >
      <div className="space-y-4">
        <div className="bg-surface rounded-lg p-3">
          <p className="text-text-secondary text-sm">{t.inventory.currentStock}</p>
          <p className="text-text-primary text-lg font-medium">
            {item.quantity} {t.inventory[item.unit]}
          </p>
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.inventory.quantity} *</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.inventory.reason} *</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={type === 'add' ? t.inventory.reasonPlaceholder : t.inventory.reasonRemovePlaceholder}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>

        <div className="bg-surface rounded-lg p-3">
          <p className="text-text-secondary text-sm">{t.inventory.newStock}</p>
          <p className={`text-lg font-medium ${type === 'add' ? 'text-status-success' : 'text-status-warning'}`}>
            {type === 'add' ? item.quantity + quantity : item.quantity - quantity} {t.inventory[item.unit]}
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={guard.requestClose} className="flex-1">
            {t.common.cancel}
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            {type === 'add' ? t.inventory.add : t.inventory.remove} {t.inventory.stock}
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

function TransactionHistory({
  item,
  onClose,
  adapter,
}: {
  item: InventoryItem;
  onClose: () => void;
  adapter?: InventoryStorageAdapter;
}) {
  const { t } = useLanguage();
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);

  useEffect(() => {
    getItemTransactions(item.id, adapter).then(setTransactions);
  }, [item.id, adapter]);

  return (
    <Modal isOpen onClose={onClose} title={`${t.inventory.history} - ${item.name}`} size="lg">
      <div className="space-y-3">
        {transactions.length === 0 ? (
          <p className="text-text-muted text-center py-4">{t.inventory.noTransactions}</p>
        ) : (
          transactions.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center gap-4 p-3 bg-surface rounded-lg"
            >
              <div className={`p-2 rounded-full ${txn.type === 'add' ? 'bg-status-success/20' : txn.type === 'waste' ? 'bg-status-warning/20' : 'bg-status-warning/20'}`}>
                {txn.type === 'add' ? (
                  <ArrowUp size={16} className="text-status-success" />
                ) : txn.type === 'waste' ? (
                  <AlertTriangle size={16} className="text-status-warning" />
                ) : (
                  <ArrowDown size={16} className="text-status-warning" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-text-primary">{txn.reason}</p>
                <p className="text-text-muted text-sm">{formatDate(txn.createdAt)}</p>
              </div>
              <span className={`font-medium ${txn.type === 'add' ? 'text-status-success' : txn.type === 'waste' ? 'text-status-warning' : 'text-status-warning'}`}>
                {txn.type === 'add' ? '+' : '-'}{txn.quantity} {t.inventory[item.unit]}
              </span>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function InventoryItemForm({
  item,
  onClose,
  onSaved,
  addItem,
  updateItem,
}: {
  item?: InventoryItem;
  onClose: () => void;
  onSaved: () => void;
  addItem: (item: InventoryItem) => Promise<void>;
  updateItem: (item: InventoryItem) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(item?.name || '');
  const [category, setCategory] = useState(item?.category || 'flowers');
  const [color, setColor] = useState(item?.color || '');
  const [quantity, setQuantity] = useState<string>(item?.quantity != null ? String(item.quantity) : '');
  const [minStock, setMinStock] = useState<string>(item?.minStock != null ? String(item.minStock) : '');
  const [purchasePrice, setPurchasePrice] = useState<string>(item?.purchasePrice != null ? String(item.purchasePrice) : '');
  const [sellingPrice, setSellingPrice] = useState<string>(item?.sellingPrice != null ? String(item.sellingPrice) : '');
  const [unit, setUnit] = useState<InventoryItem['unit']>(item?.unit || 'stems');
  const [supplier, setSupplier] = useState(item?.supplier || '');
  const [supplierSku, setSupplierSku] = useState(item?.supplierSku || '');
  const [packNote, setPackNote] = useState(item?.packNote || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [capacity, setCapacity] = useState<string>(item?.capacity != null ? String(item.capacity) : '');
  const [capacityUnit, setCapacityUnit] = useState<'L' | 'ml'>(item?.capacityUnit || 'L');
  const [initialPhotos] = useState<string[]>(() => (
    item?.id ? listPhotos(photoOwnerKey('inventory', item.id)) : []
  ));
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const createdRef = useRef<InventoryItem | null>(null);

  // Unsaved-changes detection: every field is compared with the values the
  // dialog was opened with, so an unchanged form closes without a prompt.
  const isDirty =
    name !== (item?.name || '') ||
    category !== (item?.category || 'flowers') ||
    color !== (item?.color || '') ||
    quantity !== (item?.quantity != null ? String(item.quantity) : '') ||
    minStock !== (item?.minStock != null ? String(item.minStock) : '') ||
    purchasePrice !== (item?.purchasePrice != null ? String(item.purchasePrice) : '') ||
    sellingPrice !== (item?.sellingPrice != null ? String(item.sellingPrice) : '') ||
    unit !== (item?.unit || 'stems') ||
    supplier !== (item?.supplier || '') ||
    supplierSku !== (item?.supplierSku || '') ||
    packNote !== (item?.packNote || '') ||
    notes !== (item?.notes || '') ||
    capacity !== (item?.capacity != null ? String(item.capacity) : '') ||
    capacityUnit !== (item?.capacityUnit || 'L') ||
    photos.join(',') !== initialPhotos.join(',') ||
    pendingFiles.length > 0;

  const guard = useCloseGuard({ isDirty, onClose });

  const isContainerCategory = category === 'basketsContainers';

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    if (newCategory === 'basketsContainers') {
      setUnit('pieces');
    }
  };

  const categoryOptions = [
    { value: 'flowers', label: t.categories.flowers },
    { value: 'greenery', label: t.categories.greenery },
    { value: 'fillers', label: t.categories.fillers },
    { value: 'packaging', label: t.categories.packaging },
    { value: 'basketsContainers', label: t.categories.basketsContainers },
    { value: 'floralSupplies', label: t.categories.floralSupplies },
    { value: 'decorations', label: t.categories.decorations },
    { value: 'other', label: t.categories.other },
  ];

  const handleAddPhoto = (file: File) => {
    setPendingFiles(prev => [...prev, file]);
  };

  const handleRemovePending = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemovePhoto = (filename: string) => {
    setPhotos(prev => prev.filter(f => f !== filename));
    const owner = item ?? createdRef.current;
    if (owner?.id) void removePhoto(photoOwnerKey('inventory', owner.id), filename);
  };

  const handleSubmit = async () => {
    const errors: Record<string, boolean> = {};
    if (!name || !category) {
      showToast('error', t.inventory.nameRequired);
      return;
    }

    if (isContainerCategory && (!capacity || parseFloat(capacity) <= 0)) {
      errors.capacity = true;
      setValidationErrors(errors);
      return;
    }

    if (!quantity || parseInt(quantity) < 0) {
      errors.quantity = true;
      setValidationErrors(errors);
      return;
    }

    if (!minStock || parseInt(minStock) < 0) {
      errors.minStock = true;
      setValidationErrors(errors);
      return;
    }

    if (!purchasePrice || parseFloat(purchasePrice) < 0) {
      errors.purchasePrice = true;
      setValidationErrors(errors);
      return;
    }

    setValidationErrors({});

    const itemData = {
      name,
      category,
      color,
      quantity: parseInt(quantity) || 0,
      minStock: parseInt(minStock) || 0,
      purchasePrice: parseFloat(purchasePrice) || 0,
      sellingPrice: parseFloat(sellingPrice) || undefined,
      unit,
      supplier: supplier.trim() || undefined,
      supplierSku: supplierSku.trim() || undefined,
      packNote: packNote.trim() || undefined,
      notes: notes.trim() || undefined,
      ...(isContainerCategory ? { capacity: parseFloat(capacity) || 0, capacityUnit } : {}),
    };

    setSaving(true);
    try {
      const historyAdapter = getHistoryAdapter();
      const savedItem: InventoryItem = item?.id
        ? { ...item, ...itemData, updatedAt: new Date().toISOString() }
        : createdRef.current
        ? { ...createdRef.current, ...itemData, updatedAt: new Date().toISOString() }
        : {
            id: Math.random().toString(36).substring(7),
            ...itemData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

      const wasSavedBefore = !!createdRef.current;
      if (item?.id || createdRef.current) {
        await updateItem(savedItem);
      } else {
        await addItem(savedItem);
      }
      createdRef.current = savedItem;

      if (!wasSavedBefore) {
        void recordHistory(
          'inventory_received',
          'inventory',
          savedItem.id,
          `Inventory item "${name}" ${item?.id ? 'updated' : 'created'}`,
          { category, quantity, minStock },
          historyAdapter,
        );
      }

      const ownerKey = photoOwnerKey('inventory', savedItem.id);
      const remaining = [...pendingFiles];
      while (remaining.length > 0) {
        const filename = await savePhoto(ownerKey, remaining[0]);
        remaining.shift();
        setPendingFiles([...remaining]);
        setPhotos(prev => [...prev, filename]);
      }

      showToast('success', item?.id ? t.inventory.itemUpdated : t.inventory.itemCreated);
      onSaved();
    } catch (err) {
      console.error('[InventoryItemForm] Failed to save item:', err);
      showToast('error', photoErrorMessage(err, t));
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={guard.requestClose} closeOnBackdrop={false} title={item?.id ? t.inventory.editItem : t.inventory.newItem}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.inventory.photos}</label>
          <PhotoGalleryPicker
            photos={photos}
            pendingFiles={pendingFiles}
            onAdd={handleAddPhoto}
            onRemovePhoto={handleRemovePhoto}
            onRemovePending={handleRemovePending}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.name} *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.category} *</label>
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.colorVariant}</label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.unit}</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as InventoryItem['unit'])}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            >
              <option value="pieces">{t.inventory.pieces}</option>
              <option value="stems">{t.inventory.stems}</option>
              <option value="rolls">{t.inventory.rolls}</option>
              <option value="bunches">{t.inventory.bunches}</option>
              <option value="sheets">{t.inventory.sheets}</option>
              <option value="meters">{t.inventory.meters}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.supplier}</label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.supplierSku}</label>
            <input
              type="text"
              value={supplierSku}
              onChange={(e) => setSupplierSku(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.packNote}</label>
            <input
              type="text"
              value={packNote}
              onChange={(e) => setPackNote(e.target.value)}
              placeholder={t.inventory.packNotePlaceholder}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.notes}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
        </div>

        {isContainerCategory && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t.inventory.capacity} *</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary ${validationErrors.capacity ? '!border-red-500' : ''}`}
              />
              {validationErrors.capacity && <p className="text-xs text-status-danger mt-1">{t.inventory.validation.required}</p>}
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t.inventory.unit}</label>
              <select
                value={capacityUnit}
                onChange={(e) => setCapacityUnit(e.target.value as 'L' | 'ml')}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
              >
                <option value="L">{t.inventory.capacityUnit}</option>
                <option value="ml">ml</option>
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.quantity}</label>
            <input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary ${validationErrors.quantity ? '!border-red-500' : ''}`}
            />
            {validationErrors.quantity && <p className="text-xs text-status-danger mt-1">{t.inventory.validation.required}</p>}
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.minStock}</label>
            <input
              type="number"
              min="0"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary ${validationErrors.minStock ? '!border-red-500' : ''}`}
            />
            {validationErrors.minStock && <p className="text-xs text-status-danger mt-1">{t.inventory.validation.required}</p>}
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.purchasePrice} *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary ${validationErrors.purchasePrice ? '!border-red-500' : ''}`}
            />
            {validationErrors.purchasePrice && <p className="text-xs text-status-danger mt-1">{t.inventory.validation.required}</p>}
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.inventory.sellingPrice}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={guard.requestClose} className="flex-1">
            {t.common.cancel}
          </Button>
          <Button onClick={handleSubmit} className="flex-1" disabled={saving}>
            {item?.id ? t.common.saveChanges : t.inventory.addItem}
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
