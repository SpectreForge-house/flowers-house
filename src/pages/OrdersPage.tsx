import { useState, useMemo } from 'react';
import { Search, Plus, Filter, ChevronDown, Trash2 } from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { updateOrderStatus, deleteOrderAndCleanup } from '../services/orderService';
import { deductInventoryForOrder } from '../services/inventoryService';
import { recordHistory } from '../services/historyService';
import { formatCurrency, formatDate, getStatusColor, getNextStatus } from '../utils/formatters';
import { showToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { OrderForm } from '../components/orders/OrderForm';
import { OrderDetails } from '../components/orders/OrderDetails';
import { useBouquets, useInventory, useOrders, getHistoryAdapter } from '../hooks/useStore';
import { usePermissions } from '../contexts/PermissionsContext';
import { useLanguage } from '../i18n';

export function OrdersPage() {
  const { t, tMessage } = useLanguage();
  const { can } = usePermissions();
  const canDelete = can('deleteRecords');
  const { orders, refresh: refreshOrders, getAdapter: getOrderAdapter } = useOrders();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { bouquets } = useBouquets();
  const { getAdapter } = useInventory();

  const filteredOrders = useMemo(() => {
    let result = [...orders];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(o => 
        o.id.toLowerCase().includes(query) ||
        o.customerName.toLowerCase().includes(query) ||
        o.customerPhone.includes(query)
      );
    }
    
    if (statusFilter) {
      result = result.filter(o => o.status === statusFilter);
    }
    
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, searchQuery, statusFilter]);

  const handleStatusChange = async (order: Order, newStatus: OrderStatus) => {
    try {
      if (newStatus === 'confirmed' && !order.inventoryDeducted) {
        const adapter = getAdapter();
        const result = await deductInventoryForOrder(order, bouquets, adapter);
        if (!result.success) {
          showToast('error', tMessage(result.message));
          return;
        }
        // In cloud mode, RPC set inventory_deducted = true in DB.
        // Update local order so the subsequent updateOrderStatus saves the correct flag.
        order.inventoryDeducted = true;
      }
      
      const adapter = getAdapter();
      const updated = await updateOrderStatus(order.id, newStatus, adapter, getOrderAdapter());
      if (updated) {
        await refreshOrders();
        void recordHistory('order_status_changed', 'order', order.id, `Order ${order.id} status changed from ${order.status} to ${newStatus}`, {
          oldStatus: order.status,
          newStatus,
        }, getHistoryAdapter());
        showToast('success', t.orders.orderUpdated.replace('{id}', order.id).replace('{status}', t.statuses[newStatus]));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', msg);
    }
  };

  const handleCancelOrder = async () => {
    if (orderToCancel) {
      setDeletingId(orderToCancel.id);
      setTimeout(async () => {
        try {
          await updateOrderStatus(orderToCancel.id, 'cancelled', getAdapter(), getOrderAdapter());
          void recordHistory('order_cancelled', 'order', orderToCancel.id, `Order ${orderToCancel.id} has been cancelled`, undefined, getHistoryAdapter());
          await refreshOrders();
          setOrderToCancel(null);
          setDeletingId(null);
          showToast('success', t.orders.orderCancelled.replace('{id}', orderToCancel.id));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          showToast('error', msg);
          setDeletingId(null);
        }
      }, 400);
    }
  };

  const handleDeleteOrder = async () => {
    if (orderToDelete) {
      setDeletingId(orderToDelete.id);
      setTimeout(async () => {
        try {
          // Deletes the order, releases its reservations and removes its photos.
          await deleteOrderAndCleanup(orderToDelete.id, getOrderAdapter(), getAdapter());
          void recordHistory('order_deleted', 'order', orderToDelete.id, `Order ${orderToDelete.id} deleted`, undefined, getHistoryAdapter());
          await refreshOrders();
          setOrderToDelete(null);
          setDeletingId(null);
          showToast('success', t.orders.orderDeleted.replace('{id}', orderToDelete.id));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          showToast('error', msg);
          setDeletingId(null);
        }
      }, 400);
    }
  };

  const statuses: { value: OrderStatus | ''; label: string }[] = [
    { value: '', label: t.orders.allStatuses },
    { value: 'new', label: t.statuses.new },
    { value: 'confirmed', label: t.statuses.confirmed },
    { value: 'preparing', label: t.statuses.preparing },
    { value: 'ready', label: t.statuses.ready },
    { value: 'out_for_delivery', label: t.statuses.out_for_delivery },
    { value: 'completed', label: t.statuses.completed },
    { value: 'cancelled', label: t.statuses.cancelled },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-primary">{t.orders.title}</h1>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus size={20} />
          {t.orders.newOrder}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={t.orders.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent"
          />
        </div>
        <div className="relative">
          <Filter size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
            className="pl-10 pr-10 py-2 bg-card border border-border rounded-lg text-text-primary appearance-none focus:border-accent"
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDown size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.orders.orderId}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.orders.customer}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.orders.deliveryDate}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.total}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.status}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                  <tr key={order.id} className={`border-b border-border hover:bg-surface ${deletingId === order.id ? 'animate-delete-row' : ''}`}>
                  <td className="px-4 py-3">
                    <span className="text-text-primary font-medium">{order.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-text-primary">{order.customerName}</p>
                    <p className="text-text-muted text-sm">{order.customerPhone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-text-primary">{formatDate(order.deliveryDate)}</p>
                    <p className="text-text-muted text-sm">{order.deliveryTime}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-status-success font-medium">{formatCurrency(order.total)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(order.status)}`}>
                      {t.statuses[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="px-3 py-1 text-sm bg-hover hover:bg-elevated text-text-primary rounded transition-colors"
                      >
                        {t.common.view}
                      </button>
                      {order.status !== 'completed' && order.status !== 'cancelled' && (
                        <div className="relative group">
                          <button className="px-3 py-1 text-sm bg-accent-green/20 hover:bg-accent-green/30 text-accent-green-light rounded transition-colors">
                            {t.common.status} <ChevronDown size={14} className="inline" />
                          </button>
                          <div className="absolute right-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                            {getNextStatus(order.status) && (
                              <button
                                onClick={() => handleStatusChange(order, getNextStatus(order.status)!)}
                                className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-hover"
                              >
                                → {t.statuses[getNextStatus(order.status)!]}
                              </button>
                            )}
                            <button
                              onClick={() => setOrderToCancel(order)}
                              className="w-full px-4 py-2 text-left text-sm text-status-danger hover:bg-hover"
                            >
                              {t.orders.cancelOrder}
                            </button>
                          </div>
                        </div>
                      )}
                      {canDelete && (order.status === 'completed' || order.status === 'cancelled') && (
                        <button
                          onClick={() => setOrderToDelete(order)}
                          className="p-1.5 text-text-secondary hover:text-status-danger hover:bg-hover rounded transition-colors"
                          title={t.common.delete}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sm:hidden divide-y divide-[#2a2a2a]">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className={`p-4 hover:bg-surface ${deletingId === order.id ? 'animate-delete-row' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-text-primary font-medium">{order.id}</span>
                <span className={`px-2 py-1 rounded text-xs ${getStatusColor(order.status)}`}>
                  {t.statuses[order.status]}
                </span>
              </div>
              <p className="text-text-secondary text-sm">{order.customerName}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-text-muted text-sm">{formatDate(order.deliveryDate)} {order.deliveryTime}</span>
                <span className="text-status-success font-medium">{formatCurrency(order.total)}</span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => setSelectedOrder(order)}
                  className="px-3 py-2 text-sm bg-hover hover:bg-elevated text-text-primary rounded transition-colors text-center shrink-0"
                >
                  {t.common.view}
                </button>
                {order.status !== 'completed' && order.status !== 'cancelled' && (
                  <>
                    {getNextStatus(order.status) && (
                      <button
                        onClick={() => handleStatusChange(order, getNextStatus(order.status)!)}
                        className="flex-1 min-w-0 px-3 py-2 text-sm bg-accent-green/20 hover:bg-accent-green/30 text-accent-green-light rounded transition-colors text-center truncate"
                      >
                        → {t.statuses[getNextStatus(order.status)!]}
                      </button>
                    )}
                    <button
                      onClick={() => setOrderToCancel(order)}
                      className="px-2 py-2 text-sm text-status-danger hover:bg-status-danger/20 rounded transition-colors shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
                {canDelete && (order.status === 'completed' || order.status === 'cancelled') && (
                  <button
                    onClick={() => setOrderToDelete(order)}
                    className="px-3 py-2 text-sm text-status-danger hover:bg-status-danger/20 rounded transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {filteredOrders.length === 0 && (
          <div className="text-center py-8 text-text-muted">
            {t.orders.noOrders}
          </div>
        )}
      </div>

      {showCreateModal && (
        <OrderForm
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => {
            await refreshOrders();
            setShowCreateModal(false);
          }}
        />
      )}

      {selectedOrder && (
        <OrderDetails
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={(status) => {
            handleStatusChange(selectedOrder, status);
            setSelectedOrder({ ...selectedOrder, status });
          }}
        />
      )}

      <ConfirmDialog
        isOpen={!!orderToCancel}
        onClose={() => setOrderToCancel(null)}
        onConfirm={handleCancelOrder}
        title={t.orders.cancelOrder}
        message={t.orders.cancelOrderConfirm.replace('{id}', orderToCancel?.id || '')}
        confirmLabel={t.orders.cancelOrder}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={!!orderToDelete}
        onClose={() => setOrderToDelete(null)}
        onConfirm={handleDeleteOrder}
        title={t.orders.deleteOrder}
        message={t.orders.deleteOrderConfirm.replace('{id}', orderToDelete?.id || '')}
        confirmLabel={t.common.delete}
        variant="danger"
      />
    </div>
  );
}
