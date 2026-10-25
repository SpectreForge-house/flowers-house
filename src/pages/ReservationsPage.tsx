import { useState, useMemo, useEffect } from 'react';
import { AlertTriangle, Check, X, Package, Trash2, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { InventoryReservation, InventoryItem } from '../types';
import { useInventory, useOrders, useCustomers, getHistoryAdapter } from '../hooks/useStore';
import { releaseReservation, completeReservation, createReservation } from '../services/reservationService';
import { InventoryStorageAdapter } from '../services/inventoryStorageAdapter';
import { recordHistory } from '../services/historyService';
import { showToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { DiscardChangesDialog } from '../components/ui/DiscardChangesDialog';
import { useCloseGuard } from '../hooks/useCloseGuard';
import { usePermissions } from '../contexts/PermissionsContext';
import { useLanguage } from '../i18n';

export function ReservationsPage() {
  const { t } = useLanguage();
  const { can } = usePermissions();
  const canDelete = can('deleteRecords');
  const { inventory, getReservations: loadReservations, deleteReservation: deleteOneReservation, deleteAllReservations: deleteAllResvs, getAdapter } = useInventory();
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [reservationToDelete, setReservationToDelete] = useState<InventoryReservation | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const { orders } = useOrders();
  const { customers } = useCustomers();

  useEffect(() => {
    loadReservations().then(setReservations);
  }, [loadReservations]);

  const activeReservations = useMemo(() =>
    reservations.filter(r => r.status === 'active').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reservations]
  );

  const completedReservations = useMemo(() =>
    reservations.filter(r => r.status !== 'active').sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [reservations]
  );

  const refreshReservations = async () => {
    const txns = await loadReservations();
    setReservations(txns);
  };

  const handleRelease = async (reservation: InventoryReservation) => {
    try {
      const adapter = getAdapter();
      const historyAdapter = getHistoryAdapter();
      await releaseReservation(reservation.id, adapter, historyAdapter);
      showToast('success', t.reservations.releasedSuccess);
      await refreshReservations();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to release reservation');
    }
  };

  const handleComplete = async (reservation: InventoryReservation) => {
    try {
      const adapter = getAdapter();
      const historyAdapter = getHistoryAdapter();
      await completeReservation(reservation.id, adapter, historyAdapter);
      showToast('success', t.reservations.completedSuccess);
      await refreshReservations();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to complete reservation');
    }
  };

  const handleDeleteReservation = async () => {
    if (reservationToDelete) {
      try {
        await deleteOneReservation(reservationToDelete.id);
        showToast('success', t.reservations.deletedSuccess);
        setReservationToDelete(null);
        await refreshReservations();
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to delete reservation');
      }
    }
  };

  const handleDeleteAllReservations = async () => {
    try {
      await deleteAllResvs();
      void recordHistory('reservation_released', 'reservation', 'all', `All ${reservations.length} reservations deleted`, undefined, getHistoryAdapter());
      showToast('success', t.reservations.deleteAllSuccess);
      setShowDeleteAll(false);
      await refreshReservations();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete all reservations');
    }
  };

  const handleCreateReservation = async (data: { inventoryItemId: string; quantity: number; orderId: string; note: string }) => {
    try {
      const adapter = getAdapter();
      const historyAdapter = getHistoryAdapter();
      const result = await createReservation(data.orderId, data.inventoryItemId, data.quantity, adapter, historyAdapter);
      if (result.success) {
        if (data.note) {
          const currentRes = await loadReservations();
          const last = currentRes[currentRes.length - 1];
          if (last) {
            last.note = data.note;
            const updateAdapter = getAdapter();
            await updateAdapter.updateReservation(last);
          }
        }
        showToast('success', t.reservations.success);
        setShowAddForm(false);
        await refreshReservations();
      } else {
        showToast('error', result.error || t.reservations.insufficientStock);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create reservation');
    }
  };

  const getItemName = (itemId: string) => {
    return inventory.find(i => i.id === itemId)?.name || 'Unknown';
  };

  const getItemUnit = (itemId: string) => {
    return inventory.find(i => i.id === itemId)?.unit || '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle size={28} className="text-accent-green-light" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t.reservations.title}</h1>
            <p className="text-text-muted text-sm">{t.reservations.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAddForm(true)}>
            <Plus size={16} />
            {t.reservations.addReservation}
          </Button>
          {canDelete && reservations.length > 0 && (
            <Button variant="secondary" onClick={() => setShowDeleteAll(true)}>
              <Trash2 size={16} />
              {t.reservations.deleteAll}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">{t.reservations.active} ({activeReservations.length})</h2>
        </div>
        {activeReservations.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <Package size={48} className="mx-auto mb-3 opacity-30" />
            <p>{t.reservations.noReservations}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.reservations.status}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.inventory.product}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.reservations.quantityReserved}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.reservations.forOrder}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.date}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {activeReservations.map((res) => {
                  const item = inventory.find(i => i.id === res.inventoryItemId);
                  return (
                    <tr key={res.id} className="border-b border-border hover:bg-surface">
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded text-xs bg-status-warning/20 text-status-warning">
                          {t.reservations.active}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {getItemName(res.inventoryItemId)}
                        {item && (
                          <span className="text-text-muted text-sm ml-2">
                            ({item.quantity - reservations.filter(r => r.inventoryItemId === res.inventoryItemId && r.status === 'active').reduce((sum, r) => sum + r.quantity, 0)} / {item.quantity} {item.unit} {t.reservations.available})
                          </span>
                        )}
                        {res.note && (
                          <p className="text-text-muted text-xs mt-1">{res.note}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-primary">{res.quantity} {getItemUnit(res.inventoryItemId)}</td>
                      <td className="px-4 py-3 text-accent-green-light">{res.orderId || '—'}</td>
                      <td className="px-4 py-3 text-text-secondary text-sm">{new Date(res.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleComplete(res)}
                            className="p-1.5 text-status-success hover:bg-status-success/20 rounded"
                            title={t.reservations.completed}
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => handleRelease(res)}
                            className="p-1.5 text-status-danger hover:bg-status-danger/20 rounded"
                            title={t.reservations.released}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {completedReservations.length > 0 && (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text-secondary">{t.reservations.completed} ({completedReservations.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.reservations.status}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.inventory.product}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.reservations.quantityReserved}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.reservations.forOrder}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.date}</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {completedReservations.map((res) => (
                  <tr key={res.id} className="border-b border-border hover:bg-surface opacity-60">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        res.status === 'completed' ? 'bg-status-success/20 text-status-success' : 'bg-status-danger/20 text-status-danger'
                      }`}>
                        {t.reservations[res.status as keyof typeof t.reservations] || res.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-primary">{getItemName(res.inventoryItemId)}</td>
                    <td className="px-4 py-3 text-text-primary">{res.quantity} {getItemUnit(res.inventoryItemId)}</td>
                    <td className="px-4 py-3 text-text-secondary">{res.orderId || '—'}</td>
                    <td className="px-4 py-3 text-text-secondary text-sm">{new Date(res.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {canDelete && (
                        <button
                          onClick={() => setReservationToDelete(res)}
                          className="p-1.5 text-text-secondary hover:text-status-danger hover:bg-hover rounded transition-colors"
                          title={t.reservations.delete}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddForm && (
        <AddReservationForm
          inventory={inventory}
          orders={orders}
          onClose={() => setShowAddForm(false)}
          onConfirm={handleCreateReservation}
        />
      )}

      <ConfirmDialog
        isOpen={!!reservationToDelete}
        onClose={() => setReservationToDelete(null)}
        onConfirm={handleDeleteReservation}
        title={t.reservations.delete}
        message={t.reservations.deleteConfirm}
        confirmLabel={t.common.delete}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showDeleteAll}
        onClose={() => setShowDeleteAll(false)}
        onConfirm={handleDeleteAllReservations}
        title={t.reservations.deleteAll}
        message={t.reservations.deleteAllConfirm}
        confirmLabel={t.common.delete}
        variant="danger"
      />
    </div>
  );
}

function AddReservationForm({
  inventory,
  orders,
  onClose,
  onConfirm,
}: {
  inventory: InventoryItem[];
  orders: { id: string }[];
  onClose: () => void;
  onConfirm: (data: { inventoryItemId: string; quantity: number; orderId: string; note: string }) => void;
}) {
  const { t } = useLanguage();
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [orderId, setOrderId] = useState('');
  const [note, setNote] = useState('');

  // Unsaved-changes detection: compared with the blank form it opened with.
  const guard = useCloseGuard({
    isDirty: inventoryItemId !== '' || quantity !== 1 || orderId !== '' || note !== '',
    onClose,
  });

  const selectedItem = inventory.find(i => i.id === inventoryItemId);

  const handleSubmit = () => {
    if (!inventoryItemId) {
      showToast('error', t.reservations.selectItemRequired);
      return;
    }
    if (quantity <= 0) {
      showToast('error', t.reservations.quantityRequired);
      return;
    }
    onConfirm({ inventoryItemId, quantity, orderId, note });
  };

  return (
    <Modal isOpen onClose={guard.requestClose} closeOnBackdrop={false} title={t.reservations.addReservation}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.inventory.product} *</label>
          <select
            value={inventoryItemId}
            onChange={(e) => setInventoryItemId(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          >
            <option value="">{t.reservations.selectItem}</option>
            {inventory.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.color || item.category}) — {item.quantity} {item.unit}
              </option>
            ))}
          </select>
        </div>

        {selectedItem && (
          <div className="bg-surface rounded-lg p-3">
            <p className="text-text-secondary text-sm">{t.reservations.available}</p>
            <p className="text-text-primary font-medium">{selectedItem.quantity} {selectedItem.unit}</p>
          </div>
        )}

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.reservations.quantityReserved} *</label>
          <input
            type="number"
            min="1"
            max={selectedItem?.quantity || 999}
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.reservations.forOrder}</label>
          <select
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          >
            <option value="">{t.reservations.noOrder}</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>{order.id}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.common.notes}</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t.reservations.notePlaceholder}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={guard.requestClose} className="flex-1">
            {t.common.cancel}
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            {t.reservations.createReservation}
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
