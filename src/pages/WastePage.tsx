import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, AlertTriangle, Trash2 } from 'lucide-react';
import { InventoryItem, InventoryTransaction } from '../types';
import { useInventory, getHistoryAdapter } from '../hooks/useStore';
import { recordWaste, getWasteTransactions } from '../services/inventoryService';
import { InventoryStorageAdapter } from '../services/inventoryStorageAdapter';
import { recordHistory } from '../services/historyService';
import { formatDate } from '../utils/formatters';
import { showToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DiscardChangesDialog } from '../components/ui/DiscardChangesDialog';
import { useCloseGuard } from '../hooks/useCloseGuard';
import { usePermissions } from '../contexts/PermissionsContext';
import { useLanguage } from '../i18n';

const unitLabelMap: Record<string, Record<string, string>> = {
  en: { pieces: 'Pieces', stems: 'Stems', rolls: 'Rolls', bunches: 'Bunches', sheets: 'Sheets', meters: 'Meters' },
  ru: { pieces: '\u0428\u0442\u0443\u043A', stems: '\u0421\u0442\u0435\u0431\u043B\u0435\u0439', rolls: '\u0420\u0443\u043B\u043E\u043D\u043E\u0432', bunches: '\u0411\u0443\u043A\u0435\u0442\u043E\u0432', sheets: '\u041B\u0438\u0441\u0442\u043E\u0432', meters: '\u041C\u0435\u0442\u0440\u043E\u0432' },
  bg: { pieces: '\u0411\u0440\u043E\u0439\u043A\u0438', stems: '\u0421\u0442\u0435\u0431\u043B\u0430', rolls: '\u0420\u0443\u043B\u043E\u043D\u0438', bunches: '\u0411\u0443\u043A\u0435\u0442\u0438', sheets: '\u041B\u0438\u0441\u0442\u043E\u0432\u0435', meters: '\u041C\u0435\u0442\u0440\u0438' },
};

export function WastePage() {
  const { t, language, tMessage } = useLanguage();
  const { can } = usePermissions();
  const canDelete = can('deleteRecords');
  const { inventory, updateItem, getWasteTransactions: loadWasteTransactions, deleteWasteTransaction: deleteOneWasteTxn, deleteAllWasteTransactions: deleteAllWasteTxns, getAdapter } = useInventory();
  const [wasteTransactions, setWasteTransactions] = useState<InventoryTransaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<InventoryTransaction | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  useEffect(() => {
    loadWasteTransactions().then(setWasteTransactions);
  }, [loadWasteTransactions]);

  const getUnitLabel = (unit: string) => unitLabelMap[language]?.[unit] || unit;

  const filteredTransactions = useMemo(() => {
    if (!searchQuery) return wasteTransactions;
    const query = searchQuery.toLowerCase();
    return wasteTransactions.filter(txn => {
      const item = inventory.find(i => i.id === txn.inventoryItemId);
      return (
        item?.name.toLowerCase().includes(query) ||
        txn.reason.toLowerCase().includes(query) ||
        (txn.comment && txn.comment.toLowerCase().includes(query))
      );
    });
  }, [wasteTransactions, searchQuery, inventory]);

  const refreshWaste = async () => {
    const adapter = getAdapter();
    const txns = await getWasteTransactions(adapter);
    setWasteTransactions(txns);
  };

  const handleRecordWaste = async (itemId: string, quantity: number, reason: string, comment: string) => {
    try {
      const adapter = getAdapter();
      const result = await recordWaste(itemId, quantity, reason, comment, adapter);
      if (result.success) {
        const item = inventory.find(i => i.id === itemId);
        void recordHistory('inventory_waste', 'inventory', itemId, `Spoilage recorded: ${quantity} ${item?.unit || ''} of ${item?.name || ''} - ${reason}`, { quantity, reason, comment }, getHistoryAdapter());
        await refreshWaste();
        setShowRecordModal(false);
        showToast('success', tMessage(result.message));
      } else {
        showToast('error', tMessage(result.message));
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to record waste');
    }
  };

  const handleDeleteRecord = async () => {
    if (!recordToDelete) return;
    try {
      const adapter = getAdapter();
      const item = inventory.find(i => i.id === recordToDelete.inventoryItemId);
      if (item) {
        await updateItem({
          ...item,
          quantity: item.quantity + recordToDelete.quantity,
          updatedAt: new Date().toISOString(),
        });
      }
      await deleteOneWasteTxn(recordToDelete.id);
      void recordHistory('inventory_received', 'inventory', recordToDelete.inventoryItemId, `Waste record deleted: ${recordToDelete.quantity} ${item?.unit || ''} of ${item?.name || ''} restored`, undefined, getHistoryAdapter());
      await refreshWaste();
      setRecordToDelete(null);
      showToast('success', t.waste.recordDeleted);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete waste record');
    }
  };

  const handleDeleteAll = async () => {
    try {
      for (const txn of wasteTransactions) {
        const item = inventory.find(i => i.id === txn.inventoryItemId);
        if (item) {
          await updateItem({
            ...item,
            quantity: item.quantity + txn.quantity,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      await deleteAllWasteTxns();
      void recordHistory('inventory_received', 'inventory', 'all', `All ${wasteTransactions.length} waste records deleted`, undefined, getHistoryAdapter());
      await refreshWaste();
      setShowDeleteAll(false);
      showToast('success', t.waste.deleteAllSuccess);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete all waste records');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t.waste.title}</h1>
          <p className="text-text-muted text-sm mt-1">{t.waste.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && wasteTransactions.length > 0 && (
            <Button variant="secondary" onClick={() => setShowDeleteAll(true)}>
              <Trash2 size={16} />
              {t.waste.deleteAll}
            </Button>
          )}
          <Button onClick={() => setShowRecordModal(true)}>
            <Plus size={16} />
            {t.waste.recordWaste}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder={t.inventory.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent"
        />
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.waste.product}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.waste.quantity}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.inventory.unit}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.waste.date}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.waste.reason}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.waste.comment}</th>
                {canDelete && <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((txn) => {
                const item = inventory.find(i => i.id === txn.inventoryItemId);
                return (
                  <tr key={txn.id} className="border-b border-border hover:bg-surface">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={14} className="text-status-warning" />
                        <span className="text-text-primary font-medium">{item?.name || ''}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-status-warning font-medium">-{txn.quantity}</span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{getUnitLabel(item?.unit || '')}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(txn.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="warning">{txn.reason}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted text-sm">{txn.comment || ''}</td>
                    {canDelete && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setRecordToDelete(txn)}
                          className="p-1.5 text-text-secondary hover:text-status-danger hover:bg-hover rounded transition-colors"
                          title={t.common.delete}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredTransactions.length === 0 && (
          <div className="text-center py-8 text-text-muted">
            {t.waste.noRecords}
          </div>
        )}
      </div>

      {showRecordModal && (
        <WasteForm
          inventory={inventory}
          onClose={() => setShowRecordModal(false)}
          onConfirm={handleRecordWaste}
        />
      )}

      <ConfirmDialog
        isOpen={!!recordToDelete}
        onClose={() => setRecordToDelete(null)}
        onConfirm={handleDeleteRecord}
        title={t.waste.deleteRecord}
        message={t.waste.deleteRecordConfirm}
        confirmLabel={t.common.delete}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showDeleteAll}
        onClose={() => setShowDeleteAll(false)}
        onConfirm={handleDeleteAll}
        title={t.waste.deleteAll}
        message={t.waste.deleteAllConfirm}
        confirmLabel={t.common.delete}
        variant="danger"
      />
    </div>
  );
}

function WasteForm({
  inventory,
  onClose,
  onConfirm,
}: {
  inventory: InventoryItem[];
  onClose: () => void;
  onConfirm: (itemId: string, quantity: number, reason: string, comment: string) => void;
}) {
  const { t, language } = useLanguage();
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');

  // Unsaved-changes detection: compared with the blank form it opened with.
  const guard = useCloseGuard({
    isDirty: itemId !== '' || quantity !== 1 || reason !== '' || comment !== '',
    onClose,
  });

  const selectedItem = inventory.find(i => i.id === itemId);

  const unitLabelMap: Record<string, Record<string, string>> = {
    en: { pieces: 'Pieces', stems: 'Stems', rolls: 'Rolls', bunches: 'Bunches', sheets: 'Sheets', meters: 'Meters' },
    ru: { pieces: '\u0428\u0442\u0443\u043A', stems: '\u0421\u0442\u0435\u0431\u043B\u0435\u0439', rolls: '\u0420\u0443\u043B\u043E\u043D\u043E\u0432', bunches: '\u0411\u0443\u043A\u0435\u0442\u043E\u0432', sheets: '\u041B\u0438\u0441\u0442\u043E\u0432', meters: '\u041C\u0435\u0442\u0440\u043E\u0432' },
    bg: { pieces: '\u0411\u0440\u043E\u0439\u043A\u0438', stems: '\u0421\u0442\u0435\u0431\u043B\u0430', rolls: '\u0420\u0443\u043B\u043E\u043D\u0438', bunches: '\u0411\u0443\u043A\u0435\u0442\u0438', sheets: '\u041B\u0438\u0441\u0442\u043E\u0432\u0435', meters: '\u041C\u0435\u0442\u0440\u0438' },
  };

  const getUnitLabel = (unit: string) => unitLabelMap[language]?.[unit] || unit;

  const handleSubmit = () => {
    if (!itemId) {
      showToast('error', t.waste.productRequired);
      return;
    }
    if (quantity <= 0) {
      showToast('error', t.waste.quantityRequired);
      return;
    }
    if (!reason.trim()) {
      showToast('error', t.waste.reasonRequired);
      return;
    }
    if (selectedItem && quantity > selectedItem.quantity) {
      showToast('error', t.waste.insufficientStock
        .replace('{need}', String(quantity))
        .replace('{unit}', selectedItem.unit)
        .replace('{have}', String(selectedItem.quantity)));
      return;
    }
    onConfirm(itemId, quantity, reason, comment);
  };

  return (
    <Modal isOpen onClose={guard.requestClose} closeOnBackdrop={false} title={t.waste.recordWaste}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.waste.product} *</label>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          >
            <option value="">{t.waste.selectProduct}</option>
            {inventory.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.color || item.category})  {item.quantity} {item.unit}
              </option>
            ))}
          </select>
        </div>

        {selectedItem && (
          <div className="bg-surface rounded-lg p-3">
            <p className="text-text-secondary text-sm">{t.waste.unit}</p>
            <p className="text-text-primary font-medium">{getUnitLabel(selectedItem.unit)}</p>
          </div>
        )}

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.waste.quantity} *</label>
          <input
            type="number"
            min="1"
            max={selectedItem?.quantity || 999}
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
          {selectedItem && quantity > selectedItem.quantity && (
            <p className="text-status-danger text-xs mt-1">
              {t.waste.insufficientStock
                .replace('{need}', String(quantity))
                .replace('{unit}', selectedItem.unit)
                .replace('{have}', String(selectedItem.quantity))}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.waste.reason} *</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.waste.reasonPlaceholder}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.waste.comment}</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={t.waste.commentPlaceholder}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={guard.requestClose} className="flex-1">
            {t.waste.cancel}
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            {t.waste.confirm}
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
