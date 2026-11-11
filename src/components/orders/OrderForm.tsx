import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { X, Plus, Trash2, Check } from 'lucide-react';
import { Customer, Bouquet, OrderItem, OrderType } from '../../types';
import { createOrder, deleteOrderAndCleanup, updateOrderStatus } from '../../services/orderService';
import { deductInventoryForOrder } from '../../services/inventoryService';
import { isCloudActive } from '../../services/storageMode';
import { recordHistory } from '../../services/historyService';
import { buildPendingReservations } from '../../services/reservationService';
import { formatCurrency } from '../../utils/formatters';
import { todayIso } from '../../utils/clock';
import { showToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { DiscardChangesDialog } from '../ui/DiscardChangesDialog';
import { PhotoPicker } from '../ui/PhotoPicker';
import { useCloseGuard } from '../../hooks/useCloseGuard';
import { photoOwnerKey, replaceOwnerPhotos } from '../../services/photoStorage';
import { photoErrorMessage } from '../../utils/photoErrors';
import { useLanguage } from '../../i18n';
import { useCustomers, useBouquets, useInventory, useOrders, useSettings, getHistoryAdapter } from '../../hooks/useStore';
import { getClientStatus, getDiscountForStatus } from '../../services/clientStatusService';
import { ClientStatus } from '../../types';

type CustomerMode = null | 'existing' | 'new';

interface OrderFormProps {
  onClose: () => void;
  onCreated: () => void;
  initialOrderType?: OrderType;
}

export function OrderForm({ onClose, onCreated, initialOrderType = 'delivery' }: OrderFormProps) {
  const { t, tMessage } = useLanguage();
  const { customers: hookCustomers, getAdapter: getCustomerAdapter } = useCustomers();
  const { bouquets: hookBouquets } = useBouquets();
  const { getAdapter: getOrderAdapter, orders: allOrders } = useOrders();
  const { getAdapter: getInventoryAdapter } = useInventory();
  const { settings } = useSettings();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bouquets, setBouquets] = useState<Bouquet[]>([]);
  const [orderType, setOrderType] = useState<OrderType>(initialOrderType);
  const [customerMode, setCustomerMode] = useState<CustomerMode>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [today] = useState(() => todayIso());
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [deliveryTime, setDeliveryTime] = useState('12:00');
  const [items, setItems] = useState<OrderItem[]>([{ bouquetId: '', quantity: 1, price: 0 }]);
  const [deliveryFee, setDeliveryFee] = useState(8);
  const [comment, setComment] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  // Unsaved-changes detection: every field is compared with the value the
  // form was opened with, so a blank form closes without a prompt.
  const [initial] = useState(() => ({
    orderType: initialOrderType,
    deliveryDate: today,
    items: JSON.stringify([{ bouquetId: '', quantity: 1, price: 0 }]),
  }));

  const isDirty =
    orderType !== initial.orderType ||
    customerMode !== null ||
    selectedCustomerId !== '' ||
    newCustomer.name !== '' ||
    newCustomer.phone !== '' ||
    newCustomer.address !== '' ||
    recipientName !== '' ||
    recipientPhone !== '' ||
    deliveryAddress !== '' ||
    deliveryDate !== initial.deliveryDate ||
    deliveryTime !== '12:00' ||
    JSON.stringify(items) !== initial.items ||
    deliveryFee !== 8 ||
    comment !== '' ||
    photoFile !== null;

  const guard = useCloseGuard({ isDirty, onClose });
  const { confirming: closeConfirming, requestClose } = guard;

  // Escape behaves like the X button: unchanged forms close right away, forms
  // with typed data first ask "Discard changes?".
  useEffect(() => {
    if (closeConfirming) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [closeConfirming, requestClose]);

  useEffect(() => {
    setCustomers(hookCustomers);
    setBouquets(hookBouquets.filter(b => b.isActive));
  }, [hookCustomers, hookBouquets]);

  // Suggested discount for the selected client's status - a hint only, the
  // order price is never changed automatically.
  const selectedStatus: ClientStatus | null =
    selectedCustomerId && customerMode === 'existing'
      ? getClientStatus(selectedCustomerId, allOrders, bouquets, settings.clientStatus)
      : null;
  const statusDiscount = selectedStatus ? getDiscountForStatus(selectedStatus, settings.clientStatus) : 0;

  const toggleCustomerMode = (mode: 'existing' | 'new') => {
    setCustomerMode(prev => {
      if (prev === mode) return null;
      return mode;
    });
    if (mode === 'new') {
      setSelectedCustomerId('');
    } else {
      setNewCustomer({ name: '', phone: '', address: '' });
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setDeliveryAddress(customer.address);
    }
  };

  const handleBouquetChange = (index: number, bouquetId: string) => {
    const bouquet = bouquets.find(b => b.id === bouquetId);
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      bouquetId,
      price: bouquet?.sellingPrice || 0,
    };
    setItems(newItems);
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], quantity: Math.max(1, quantity) };
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { bouquetId: '', quantity: 1, price: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const calculateTotal = () => {
    const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return itemsTotal + (orderType === 'delivery' ? deliveryFee : 0);
  };

  const handleChoosePhoto = (file: File) => {
    setPhotoFile(file);
    setPendingPreview(URL.createObjectURL(file));
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPendingPreview(null);
  };

  const handleSubmit = async () => {
    if (customerMode === null) {
      showToast('error', t.orderForm.pleaseSelectCustomerType);
      return;
    }
    if (customerMode === 'existing' && !selectedCustomerId) {
      showToast('error', t.orderForm.pleaseSelectCustomer);
      return;
    }
    if (customerMode === 'new' && (!newCustomer.name || !newCustomer.phone)) {
      showToast('error', t.orderForm.pleaseFillCustomerDetails);
      return;
    }
    if (!items.some(item => item.bouquetId)) {
      showToast('error', t.orderForm.pleaseAddBouquet);
      return;
    }
    const isInStore = orderType === 'in_store';
    if (!isInStore && !deliveryAddress) {
      showToast('error', t.orderForm.pleaseEnterAddress);
      return;
    }

    let customer: Customer;
    try {
      if (customerMode === 'new') {
        customer = { id: uuidv4(), name: newCustomer.name, phone: newCustomer.phone, address: newCustomer.address, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const customerAdapter = getCustomerAdapter();
        await customerAdapter.addCustomer(customer);
      } else {
        customer = customers.find(c => c.id === selectedCustomerId)!;
      }

      const orderAdapter = getOrderAdapter();
      const orderItems = items.filter(i => i.bouquetId);
      const pendingReservations = isInStore ? [] : buildPendingReservations(orderItems, hookBouquets);
      const now = new Date();
      const orderDeliveryDate = isInStore ? now.toISOString().split('T')[0] : deliveryDate;
      const orderDeliveryTime = isInStore ? now.toTimeString().slice(0, 5) : deliveryTime;
      const order = await createOrder({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        recipientName: recipientName || customer.name,
        recipientPhone,
        orderType,
        deliveryAddress: isInStore ? '' : deliveryAddress,
        deliveryDate: orderDeliveryDate,
        deliveryTime: orderDeliveryTime,
        items: orderItems,
        deliveryFee: isInStore ? 0 : deliveryFee,
        total: calculateTotal(),
        comment,
        status: 'new',
      }, orderAdapter, pendingReservations);

      if (isInStore) {
        const inventoryAdapter = getInventoryAdapter();
        const activeInventoryAdapter = isCloudActive() ? inventoryAdapter : undefined;
        const deduction = await deductInventoryForOrder(order, hookBouquets, activeInventoryAdapter);
        if (!deduction.success) {
          await deleteOrderAndCleanup(order.id, orderAdapter, activeInventoryAdapter);
          showToast('error', tMessage(deduction.message));
          return;
        }
        order.inventoryDeducted = true;
        await updateOrderStatus(order.id, 'completed', activeInventoryAdapter, orderAdapter);
      }

      const historyAdapter = getHistoryAdapter();
      void recordHistory('order_created', 'order', order.id, isInStore
        ? `In-store sale ${order.id} completed for ${customer.name}`
        : `Order ${order.id} created for ${customer.name}`, {
        total: order.total,
        deliveryDate: orderDeliveryDate,
        itemCount: order.items.length,
        orderType,
      }, historyAdapter);

      // Optional bouquet photo: written to disk under `order:<id>`, the order
      // record itself never references files (works in Supabase mode too).
      let photoError: string | null = null;
      if (photoFile) {
        try {
          await replaceOwnerPhotos(photoOwnerKey('order', order.id), photoFile);
        } catch (photoErr) {
          console.error('[OrderForm] Failed to save order photo:', photoErr);
          photoError = photoErrorMessage(photoErr, t);
        }
      }

      const successMessage = isInStore
        ? t.orderForm.saleCreated.replace('{id}', order.id)
        : t.orderForm.orderCreated.replace('{id}', order.id);
      showToast(photoError ? 'error' : 'success', photoError || successMessage);
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', msg);
    }
  };

  return createPortal(
    <div className="fixed inset-0 modal-overlay lg:left-64 z-[55] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-2xl bg-card sm:rounded-lg border border-border shadow-2xl max-h-[88vh] sm:max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">
            {orderType === 'in_store' ? t.orderForm.inStoreTitle : t.orderForm.title}
          </h2>
          <button onClick={guard.requestClose} className="p-1 text-text-secondary hover:text-text-primary hover:bg-hover rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.orderForm.type}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['delivery', 'in_store'] as OrderType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setOrderType(type)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                    orderType === type
                      ? 'border-accent-green bg-accent/10 text-accent-text'
                      : 'border-border bg-surface text-text-secondary hover:border-elevated'
                  }`}
                >
                  {type === 'delivery' ? t.orderForm.delivery : t.orderForm.inStore}
                </button>
              ))}
            </div>
            {orderType === 'in_store' && (
              <p className="text-xs text-text-muted mt-1">{t.orderForm.inStoreHint}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => toggleCustomerMode('existing')}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-200 flex-1 ${
                customerMode === 'existing'
                  ? 'border-accent-green bg-accent/10 text-accent-text shadow-sm shadow-accent-green/10'
                  : 'border-border bg-surface text-text-secondary hover:border-elevated hover:text-text-secondary'
              } active:scale-[0.98]`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                customerMode === 'existing'
                  ? 'border-accent-green bg-accent-green'
                  : 'border-gray-500'
              }`}>
                {customerMode === 'existing' && (
                  <Check size={10} className="text-text-primary" strokeWidth={3} />
                )}
              </div>
              <span className="text-sm font-medium">{t.orders.existingCustomer}</span>
            </button>

            <button
              type="button"
              onClick={() => toggleCustomerMode('new')}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-200 flex-1 ${
                customerMode === 'new'
                  ? 'border-accent-green bg-accent/10 text-accent-text shadow-sm shadow-accent-green/10'
                  : 'border-border bg-surface text-text-secondary hover:border-elevated hover:text-text-secondary'
              } active:scale-[0.98]`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                customerMode === 'new'
                  ? 'border-accent-green bg-accent-green'
                  : 'border-gray-500'
              }`}>
                {customerMode === 'new' && (
                  <Check size={10} className="text-text-primary" strokeWidth={3} />
                )}
              </div>
              <span className="text-sm font-medium">{t.orders.newCustomer}</span>
            </button>
          </div>

          {customerMode === null && (
            <p className="text-text-muted text-sm text-center py-2">{t.orderForm.selectCustomerType}</p>
          )}

          {customerMode === 'existing' && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">{t.orderForm.selectCustomer}</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
              >
                <option value="">{t.orderForm.chooseCustomer}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {selectedCustomerId && statusDiscount > 0 && (
                <p className="text-xs text-accent-green-light mt-1">
                  {t.clientStatus.statuses[selectedStatus]} &middot;{' '}
                  {t.clientStatus.suggestedDiscount.replace('{value}', String(statusDiscount))}
                </p>
              )}
            </div>
          )}

          {customerMode === 'new' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.orderForm.customerName}</label>
                <input
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.orderForm.phone}</label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
              {orderType === 'delivery' && (
                <div className="col-span-2">
                  <label className="block text-sm text-text-secondary mb-1">{t.orderForm.address}</label>
                  <input
                    type="text"
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                  />
                </div>
              )}
            </div>
          )}

          {orderType === 'delivery' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t.orderForm.recipientName}</label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                    placeholder={t.orderForm.sameAsCustomer}
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t.orderForm.recipientPhone}</label>
                  <input
                    type="tel"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.orderForm.deliveryAddress}</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t.orderForm.deliveryDate}</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">{t.orderForm.deliveryTime}</label>
                  <input
                    type="time"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-secondary">{t.orderForm.orderItems}</label>
              <button
                type="button"
                onClick={addItem}
                className="text-accent-green-light hover:text-accent-green text-sm flex items-center gap-1"
              >
                <Plus size={16} /> {t.orderForm.addItem}
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <select
                    value={item.bouquetId}
                    onChange={(e) => handleBouquetChange(index, e.target.value)}
                    className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                  >
                    <option value="">{t.orderForm.selectBouquet}</option>
                    {bouquets.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} - {formatCurrency(b.sellingPrice)}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                    className="w-20 px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-center"
                  />
                  <span className="flex items-center text-text-secondary w-24">
                    {formatCurrency(item.price * item.quantity)}
                  </span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {orderType === 'delivery' && (
              <div>
                <label className="block text-sm text-text-secondary mb-1">{t.orderForm.deliveryFee}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
            )}
            <div className={`flex items-end ${orderType === 'in_store' ? 'sm:col-span-2' : ''}`}>
              <div className="text-right">
                <p className="text-text-secondary text-sm">{t.orderForm.total}</p>
                <p className="text-2xl font-bold text-status-success">{formatCurrency(calculateTotal())}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.orderForm.comment}</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
              placeholder={t.orderForm.specialInstructions}
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.photos.photo}</label>
            <PhotoPicker
              previewUrl={pendingPreview}
              onChoose={handleChoosePhoto}
              onRemove={handleRemovePhoto}
              label={orderType === 'in_store' ? t.orderForm.inStoreTitle : t.orderForm.title}
            />
          </div>
        </div>

        <div className="flex gap-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 border-t border-border">
          <Button variant="secondary" onClick={guard.requestClose} className="flex-1">
            {t.orderForm.cancel}
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            {orderType === 'in_store' ? t.orderForm.completeSale : t.orderForm.create}
          </Button>
        </div>

        {/* Rendered inside the dialog so the prompt stacks above this form. */}
        <DiscardChangesDialog
          isOpen={guard.confirming}
          onCancel={guard.cancelDiscard}
          onConfirm={guard.confirmDiscard}
        />
      </div>
    </div>,
    document.body
  );
}
