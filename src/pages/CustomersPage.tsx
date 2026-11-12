import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Search, Plus, Phone, Mail, MapPin, ShoppingBag, Edit, Trash2, Flower2, Eye, ArrowUpDown, ChevronDown } from 'lucide-react';
import { Customer, ImportantDate, ImportantDateType } from '../types';
import { buildPurchaseHistory, getPurchaseStats } from '../services/purchaseService';
import { recordHistory } from '../services/historyService';
import { formatCurrency, formatDate } from '../utils/formatters';
import { currentDate, nowIso } from '../utils/clock';
import { showToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { AnimatedListItem } from '../components/ui/AnimatedListItem';
import { useLanguage } from '../i18n';
import { useCustomers, useOrders, useBouquets, usePurchases, getHistoryAdapter } from '../hooks/useStore';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { isSupabaseAvailable } from '../services/authService';
import { CloudSyncPanel } from '../components/cloud/CloudSyncPanel';
import { CustomerAvatar } from '../components/customers/CustomerAvatar';
import { StatusBadge } from '../components/customers/StatusBadge';
import { useSettings } from '../hooks/useStore';
import { getClientStatus } from '../services/clientStatusService';
import { CustomerDetail } from '../components/customers/CustomerDetail';
import { PurchaseForm } from '../components/customers/PurchaseForm';
import { removeCustomerPurchases } from '../services/purchaseService';
import { PhotoPicker } from '../components/ui/PhotoPicker';
import { DiscardChangesDialog } from '../components/ui/DiscardChangesDialog';
import { useCloseGuard } from '../hooks/useCloseGuard';
import { clearClientDraft, readClientDraft, saveClientDraft } from '../services/clientFormDraft';
import { useOwnerPhotos, usePhotoUrl } from '../hooks/usePhotoUrl';
import { photoOwnerKey, removeOwnerPhotos, replaceOwnerPhotos } from '../services/photoStorage';
import { photoErrorMessage } from '../utils/photoErrors';

type CustomerFormValues = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & {
  photoFile?: File | null;
  photoRemoved?: boolean;
};

type CustomerSort = 'nameAsc' | 'nameDesc' | 'newest' | 'totalDesc';

const SORT_OPTIONS: CustomerSort[] = ['nameAsc', 'nameDesc', 'newest', 'totalDesc'];

export function CustomersPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canDelete = can('deleteRecords');
  const canManageCloud = can('manageCloud');
  const { customers, loading, refresh, addCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const { orders: allOrders, refresh: refreshOrders } = useOrders();
  const { purchases, refresh: refreshPurchases } = usePurchases();
  const { bouquets } = useBouquets();
  const { settings } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<CustomerSort>('nameAsc');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [purchaseCustomer, setPurchaseCustomer] = useState<Customer | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newCustomerId, setNewCustomerId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!newCustomerId) return;
    const timer = setTimeout(() => setNewCustomerId(null), 900);
    return () => clearTimeout(timer);
  }, [newCustomerId]);

  // Deep link ?client=<id> (used by the "Upcoming client dates" block on the
  // Home page): open the client's detail card right away.
  useEffect(() => {
    const clientId = searchParams.get('client');
    if (!clientId) return;
    const target = customers.find((c) => c.id === clientId);
    if (target) {
      setSelectedCustomer(target);
      // Consume the parameter so a later refresh does not reopen the card.
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, customers, setSearchParams]);

  const supabaseReady = isSupabaseAvailable() && user !== null;

  const filteredCustomers = useMemo(() => {
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      return customers.filter(c =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.phone.includes(searchQuery) ||
        (c.email && c.email.toLowerCase().includes(lowerQuery))
      );
    }
    return customers;
  }, [customers, searchQuery]);

  // The card statistics must match the client's detail view: a client's
  // history is the union of their orders and the manually added purchases.
  // `purchases` is a dependency only to recompute after add/edit/delete.
  const statsByCustomer = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getPurchaseStats>>();
    for (const customer of customers) {
      map.set(
        customer.id,
        getPurchaseStats(buildPurchaseHistory(customer.id, allOrders, bouquets, purchases)),
      );
    }
    return map;
  }, [customers, allOrders, bouquets, purchases]);

  // Alphabetical order must follow the selected language's alphabet (Cyrillic
  // in Russian/Bulgarian), so a locale-aware collator is used instead of the
  // raw string comparison. Sorting is applied after the search filter.
  const sortedCustomers = useMemo(() => {
    const list = [...filteredCustomers];
    const collator = new Intl.Collator(language, { sensitivity: 'base', numeric: true });

    switch (sortBy) {
      case 'nameDesc':
        list.sort((a, b) => collator.compare(b.name, a.name));
        break;
      case 'newest':
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case 'totalDesc':
        list.sort(
          (a, b) =>
            (statsByCustomer.get(b.id)?.total ?? 0) - (statsByCustomer.get(a.id)?.total ?? 0),
        );
        break;
      default:
        list.sort((a, b) => collator.compare(a.name, b.name));
    }

    return list;
  }, [filteredCustomers, sortBy, language, statsByCustomer]);

  const handleCreateCustomer = async (
    data: CustomerFormValues,
    options?: { addBouquet?: boolean },
  ) => {
    const { photoFile, photoRemoved, ...values } = data;
    const now = nowIso();
    const customer: Customer = {
      ...values,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await addCustomer(customer);
      setNewCustomerId(customer.id);
      void recordHistory('customer_created', 'customer', customer.id, `Customer "${customer.name}" created`, { phone: customer.phone }, getHistoryAdapter());
      setShowCreateModal(false);
      // The client exists now - the typed draft must not resurface next time.
      clearClientDraft();
      const photoError = await persistCustomerPhoto(customer.id, photoFile, photoRemoved);
      // The avatar reads the photo index during render - refresh so the new
      // photo shows up immediately instead of after the next page reload.
      if (photoFile || photoRemoved) void refresh();
      showToast(photoError ? 'error' : 'success', photoError || t.customers.createdSuccessfully);
      // Straight into the bouquet form: adding a purchase must not require
      // opening the freshly created client card first.
      if (options?.addBouquet) setPurchaseCustomer(customer);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[CustomersPage] Create customer FAILED:', msg, err);
      showToast('error', msg);
    }
  };

  const handleUpdateCustomer = async (data: CustomerFormValues) => {
    if (!editingCustomer) return;
    const { photoFile, photoRemoved, ...values } = data;
    const updated: Customer = {
      ...values,
      id: editingCustomer.id,
      createdAt: editingCustomer.createdAt,
      updatedAt: nowIso(),
    };
    try {
      await updateCustomer(updated);
      void recordHistory('customer_edited', 'customer', updated.id, `Customer "${updated.name}" updated`, undefined, getHistoryAdapter());
      setEditingCustomer(null);
      const photoError = await persistCustomerPhoto(updated.id, photoFile, photoRemoved);
      if (photoFile || photoRemoved) void refresh();
      showToast(photoError ? 'error' : 'success', photoError || t.customers.updatedSuccessfully);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[CustomersPage] Update customer FAILED:', msg, err);
      showToast('error', msg);
    }
  };

  // Photo files live on disk; the record itself only carries the filename.
  // Returns a localized error message, or null when everything is fine.
  const persistCustomerPhoto = async (
    customerId: string,
    photoFile?: File | null,
    photoRemoved?: boolean
  ): Promise<string | null> => {
    const ownerKey = photoOwnerKey('client', customerId);
    try {
      if (photoFile) {
        await replaceOwnerPhotos(ownerKey, photoFile);
      } else if (photoRemoved) {
        await removeOwnerPhotos(ownerKey);
      }
      return null;
    } catch (err) {
      console.error('[CustomersPage] Failed to save customer photo:', err);
      return photoErrorMessage(err, t);
    }
  };

  const handleDeleteCustomer = async () => {
    if (customerToDelete) {
      setDeletingId(customerToDelete.id);
      setTimeout(async () => {
        try {
          // Purchases first: they hold the photo owner keys, and deleting the
          // customer record also drops the purchase records.
          await removeCustomerPurchases(customerToDelete.id);
          await deleteCustomer(customerToDelete.id);
          await removeOwnerPhotos(photoOwnerKey('client', customerToDelete.id));
          void recordHistory('customer_deleted', 'customer', customerToDelete.id, `Customer "${customerToDelete.name}" deleted`, undefined, getHistoryAdapter());
          setCustomerToDelete(null);
          setDeletingId(null);
          showToast('success', t.customers.deletedSuccessfully);
        } catch (err: any) {
          const msg = err?.message || String(err);
          console.error('[CustomersPage] Delete customer FAILED:', msg, err);
          showToast('error', msg);
          setDeletingId(null);
        }
      }, 400);
    }
  };

  const handleDeleteAllCustomers = async () => {
    try {
      for (const c of customers) {
        await removeCustomerPurchases(c.id);
        await deleteCustomer(c.id);
        await removeOwnerPhotos(photoOwnerKey('client', c.id));
      }
      setShowDeleteAll(false);
      showToast('success', t.customers.deleteAllSuccess);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[CustomersPage] Delete all customers FAILED:', msg, err);
      showToast('error', msg);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-text-muted">{t.common.loading}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-primary">{t.customers.title}</h1>
        <div className="flex items-center gap-2">
          {canDelete && (
            <Button variant="secondary" onClick={() => setShowDeleteAll(true)}>
              <Trash2 size={16} />
              {t.customers.deleteAll}
            </Button>
          )}
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus size={20} />
            {t.customers.addCustomer}
          </Button>
        </div>
      </div>

      {supabaseReady && canManageCloud && <CloudSyncPanel />}

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={t.customers.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent"
          />
        </div>
        <div className="relative">
          <ArrowUpDown size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as CustomerSort)}
            aria-label={t.customers.sort.label}
            className="w-full sm:w-auto pl-10 pr-10 py-2 bg-card border border-border rounded-lg text-text-primary appearance-none focus:border-accent"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>{t.customers.sort[option]}</option>
            ))}
          </select>
          <ChevronDown size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedCustomers.map((customer) => {
          const stats = statsByCustomer.get(customer.id) ?? {
            count: 0,
            total: 0,
            average: 0,
            lastDate: null,
          };
          return (
            <AnimatedListItem
              key={customer.id}
              isDeleting={deletingId === customer.id}
              variant="slide-up"
              animateOnMount={newCustomerId === customer.id}
            >
              <div
                className="bg-card rounded-lg border border-border p-4 hover:border-elevated transition-colors"
              >
              <div className="flex items-start justify-between mb-3 gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <CustomerAvatar customer={customer} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-text-primary font-medium truncate">{customer.name}</h3>
                      <StatusBadge status={getClientStatus(customer.id, allOrders, bouquets, settings.clientStatus)} />
                    </div>
                    {customer.phone && (
                      <div className="flex items-center gap-1 text-text-secondary text-sm mt-1">
                        <Phone size={14} />
                        {customer.phone}
                      </div>
                    )}
                    {customer.email && (
                      <div className="flex items-center gap-1 text-text-secondary text-sm mt-1">
                        <Mail size={14} />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setSelectedCustomer(customer)}
                    title={t.common.view}
                    className="p-2 text-text-secondary hover:text-text-primary hover:bg-hover rounded"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => setEditingCustomer(customer)}
                    className="p-2 text-text-secondary hover:text-text-primary hover:bg-hover rounded"
                  >
                    <Edit size={16} />
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => setCustomerToDelete(customer)}
                      className="p-2 text-text-secondary hover:text-status-danger hover:bg-hover rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {customer.address && (
                <div className="flex items-center gap-1 text-text-muted text-sm mb-3">
                  <MapPin size={14} />
                  {customer.address}
                </div>
              )}

              <div className="flex items-center gap-4 pt-3 border-t border-border">
                <div className="flex items-center gap-1">
                  <ShoppingBag size={14} className="text-text-muted" />
                  <span className="text-text-primary text-sm">{stats.count} {t.customers.orders}</span>
                </div>
                <div>
                  <span className="text-status-success text-sm font-medium">
                    {formatCurrency(stats.total)}
                  </span>
                </div>
              </div>

              {(() => {
                const today = new Date().toISOString().split('T')[0];
                const upcoming = allOrders.filter(o =>
                  o.customerId === customer.id &&
                  o.deliveryDate >= today &&
                  o.status !== 'cancelled' &&
                  o.status !== 'completed'
                );
                if (upcoming.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-text-secondary text-xs font-medium mb-2">{t.customers.upcomingBouquets}</p>
                    <div className="space-y-1.5">
                      {upcoming.slice(0, 3).map(order => {
                        const orderBouquets = order.items.map(item => {
                          const bouquet = bouquets.find(b => b.id === item.bouquetId);
                          return { name: bouquet?.name || 'вЂ”', quantity: item.quantity };
                        });
                        return (
                          <div key={order.id} className="flex items-center gap-2 text-xs">
                            <Flower2 size={12} className="text-accent-green-light shrink-0" />
                            <span className="text-text-primary truncate">{orderBouquets.map(b => `${b.name} \u00D7${b.quantity}`).join(', ')}</span>
                            <span className="text-text-muted shrink-0">{formatDate(order.deliveryDate)}</span>
                          </div>
                        );
                      })}
                      {upcoming.length > 3 && (
                        <p className="text-text-muted text-xs">+{upcoming.length - 3} {t.customers.more}</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {customer.notes && (
                <p className="text-text-muted text-xs mt-2 italic">{customer.notes}</p>
              )}
              </div>
            </AnimatedListItem>
          );
        })}
      </div>

      {filteredCustomers.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          {t.customers.noCustomers}
        </div>
      )}

      {showCreateModal && (
        <CustomerForm
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateCustomer}
        />
      )}

      {editingCustomer && (
        <CustomerForm
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSubmit={handleUpdateCustomer}
        />
      )}

      {purchaseCustomer && (
        <PurchaseForm
          customer={purchaseCustomer}
          onClose={() => setPurchaseCustomer(null)}
          onSaved={() => {
            void refresh();
            void refreshOrders();
            void refreshPurchases();
            setPurchaseCustomer(null);
          }}
        />
      )}

      {selectedCustomer && (
        <CustomerDetail
          customer={selectedCustomer}
          orders={allOrders}
          bouquets={bouquets}
          onClose={() => setSelectedCustomer(null)}
          onChanged={() => {
            void refresh();
            void refreshOrders();
            void refreshPurchases();
          }}
          onEditCustomer={(customer) => {
            setSelectedCustomer(null);
            setEditingCustomer(customer);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        onConfirm={handleDeleteCustomer}
        title={t.customers.deleteTitle}
        message={t.customers.deleteConfirm.replace('{name}', customerToDelete?.name || '')}
        confirmLabel={t.common.delete}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showDeleteAll}
        onClose={() => setShowDeleteAll(false)}
        onConfirm={handleDeleteAllCustomers}
        title={t.customers.deleteAll}
        message={t.customers.deleteAllConfirm}
        confirmLabel={t.common.delete}
        variant="danger"
      />
    </div>
  );
}

// Normalized key of an important-dates list, used to detect edits: the row ids
// stay stable while the dialog is open, so a plain comparison is enough.
function datesKey(dates: ImportantDate[]): string {
  return JSON.stringify(dates.map((d) => [d.id, d.type, d.date, d.label || '', !!d.noYear]));
}

function CustomerForm({
  customer,
  onClose,
  onSubmit,
}: {
  customer?: Customer;
  onClose: () => void;
  onSubmit: (data: CustomerFormValues, options?: { addBouquet?: boolean }) => void;
}) {
  const { t } = useLanguage();
  // Editing starts from the saved record; adding restores the draft of the
  // previous session of this form (memory + sessionStorage), so an accidental
  // close never loses what was typed. Photos are not part of the draft.
  const restoredDraft = customer ? null : readClientDraft();
  const [name, setName] = useState(customer?.name || restoredDraft?.name || '');
  const [phone, setPhone] = useState(customer?.phone || restoredDraft?.phone || '');
  const [email, setEmail] = useState(customer?.email || restoredDraft?.email || '');
  const [address, setAddress] = useState(customer?.address || restoredDraft?.address || '');
  const [notes, setNotes] = useState(customer?.notes || restoredDraft?.notes || '');
  const [preferences, setPreferences] = useState(customer?.preferences || restoredDraft?.preferences || '');
  const [importantDates, setImportantDates] = useState<ImportantDate[]>(customer?.importantDates || []);
  const [addBouquet, setAddBouquet] = useState(false);
  const [datesError, setDatesError] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Quick year picker for important dates: the native date picker requires
  // scrolling arrow-by-arrow, which is painful for a birthday from decades ago.
  const yearOptions = useMemo(() => {
    const currentYear = currentDate().getFullYear();
    const years: number[] = [];
    for (let year = currentYear + 10; year >= 1900; year -= 1) years.push(year);
    return years;
  }, []);

  // The photo is written to disk only when the form is submitted, so simply
  // closing the dialog never leaves orphan files behind.
  const savedPhotos = useOwnerPhotos(customer ? photoOwnerKey('client', customer.id) : '');
  const savedPhoto = savedPhotos[0];
  const savedPreview = usePhotoUrl(savedPhoto && !photoRemoved ? savedPhoto : null);
  const previewUrl = pendingPreview ?? savedPreview;

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  // The typed text of the "Add client" form is kept as a draft while the
  // dialog is open (memory + sessionStorage, cleared on save or Discard).
  useEffect(() => {
    if (customer) return;
    saveClientDraft({ name, phone, email, address, notes, preferences });
  }, [customer, name, phone, email, address, notes, preferences]);

  // Unsaved-changes detection: everything is compared with the values the
  // dialog was opened with (nothing changed -> closing needs no prompt).
  const [initial] = useState(() => ({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
    preferences: customer?.preferences || '',
    dates: datesKey(customer?.importantDates || []),
  }));

  const isDirty = useMemo(() => (
    name !== initial.name ||
    phone !== initial.phone ||
    email !== initial.email ||
    address !== initial.address ||
    notes !== initial.notes ||
    preferences !== initial.preferences ||
    datesKey(importantDates) !== initial.dates ||
    addBouquet ||
    pendingPhoto !== null ||
    photoRemoved
  ), [name, phone, email, address, notes, preferences, importantDates, addBouquet, pendingPhoto, photoRemoved, initial]);

  const guard = useCloseGuard({
    isDirty,
    onClose,
    // Only the "Add client" flow keeps a draft; a confirmed Discard drops it.
    onDiscard: customer ? undefined : clearClientDraft,
  });

  const handleChoosePhoto = (file: File) => {
    setPendingPhoto(file);
    setPendingPreview(URL.createObjectURL(file));
    setPhotoRemoved(false);
  };

  const handleRemovePhoto = () => {
    setPendingPhoto(null);
    setPendingPreview(null);
    if (savedPhoto) setPhotoRemoved(true);
  };

  const handleAddDate = () => {
    setImportantDates((prev) => [
      ...prev,
      { id: uuidv4(), type: 'birthday', date: '', label: '' },
    ]);
  };

  const handleDateChange = (id: string, patch: Partial<ImportantDate>) => {
    setImportantDates((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    setDatesError(false);
  };

  const handleRemoveDate = (id: string) => {
    setImportantDates((prev) => prev.filter((d) => d.id !== id));
  };

  /**
   * Changes only the year, keeping the picked day and month. An empty date
   * starts from today's day/month so the row becomes a valid date at once.
   */
  const handleDateYearChange = (id: string, year: string) => {
    if (!year) return;
    const current = importantDates.find((d) => d.id === id);
    const now = currentDate();
    const monthDay =
      current?.date?.slice(5) ||
      `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    handleDateChange(id, { date: `${year}-${monthDay}`, noYear: false });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const filtered = value.replace(/[^0-9+\-() ]/g, '');
    setPhone(filtered);
    if (phoneError) setPhoneError('');
  };

  const isValidPhone = (value: string): boolean => {
    return /^\+?[\d\s\-()]{4,}$/.test(value.trim());
  };

  const isValidEmail = (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      showToast('error', t.customers.nameRequired);
      return;
    }

    let hasError = false;

    // Phone is optional now: only a non-empty value has to be valid.
    if (phone.trim() && !isValidPhone(phone)) {
      setPhoneError(t.customers.invalidPhone);
      phoneRef.current?.focus();
      hasError = true;
    }

    if (email.trim() && !isValidEmail(email)) {
      setEmailError(t.customers.invalidEmail);
      if (!hasError) emailRef.current?.focus();
      hasError = true;
    }

    // Important dates: every added row must have a date; label is optional.
    if (importantDates.some((d) => !d.date)) {
      setDatesError(true);
      hasError = true;
    }

    if (hasError) return;

    onSubmit({
      ...customer,
      name,
      phone,
      email,
      address,
      notes,
      preferences,
      importantDates: importantDates
        .filter((d) => d.date)
        .map((d) => ({
          ...d,
          noYear: d.noYear || undefined,
          label: d.label?.trim() || undefined,
        })),
      photoFile: pendingPhoto,
      photoRemoved,
    }, customer ? undefined : { addBouquet });
  };

  return (
    <Modal isOpen onClose={guard.requestClose} closeOnBackdrop={false} title={customer ? t.common.edit + ' ' + t.customers.title : t.customers.addCustomer}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.photos.photo}</label>
          <PhotoPicker
            previewUrl={previewUrl}
            onChoose={handleChoosePhoto}
            onRemove={handleRemovePhoto}
            label={customer?.name || t.photos.photo}
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.common.name} *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="block text-sm text-text-secondary">{t.common.phone}</label>
            <span className="text-xs text-text-muted">{t.customers.phoneOptional}</span>
          </div>
          <input
            ref={phoneRef}
            type="tel"
            value={phone}
            onChange={handlePhoneChange}
            className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary ${phoneError ? '!border-red-500' : ''}`}
          />
          {phoneError && <p className="text-xs text-status-danger mt-1">{phoneError}</p>}
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.common.email}</label>
          <input
            ref={emailRef}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError('');
            }}
            className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary ${emailError ? '!border-red-500' : ''}`}
          />
          {emailError && <p className="text-xs text-status-danger mt-1">{emailError}</p>}
          {!emailError && <p className="text-xs text-text-muted mt-1">{t.customers.emailOptional}</p>}
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.common.address}</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.common.notes}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">{t.customers.preferences}</label>
          <input
            type="text"
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>

        {/* Important dates: yearly-recurring entries (birthday, name day, ...) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-text-secondary">{t.clientDates.sectionTitle}</label>
            <Button variant="secondary" onClick={handleAddDate} className="!px-3 !py-1.5 text-sm">
              <Plus size={16} className="inline mr-1 -mt-0.5" />
              {t.clientDates.addDate}
            </Button>
          </div>
          {importantDates.length > 0 && (
            <div className="space-y-2 mb-2">
              {importantDates.map((d) => (
                <div key={d.id} className="p-3 bg-surface border border-border rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={d.type}
                      onChange={(e) => handleDateChange(d.id, { type: e.target.value as ImportantDateType })}
                      className="px-2 py-2 bg-card border border-border rounded-lg text-text-primary text-sm"
                    >
                      <option value="birthday">{t.clientDates.types.birthday}</option>
                      <option value="name_day">{t.clientDates.types.name_day}</option>
                      <option value="anniversary">{t.clientDates.types.anniversary}</option>
                      <option value="other">{t.clientDates.types.other}</option>
                    </select>
                    <input
                      type="date"
                      value={d.date}
                      onChange={(e) => handleDateChange(d.id, { date: e.target.value })}
                      className={`flex-1 min-w-0 px-2 py-2 bg-card border border-border rounded-lg text-text-primary text-sm ${
                        datesError && !d.date ? '!border-red-500' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDate(d.id)}
                      title={t.clientDates.removeDate}
                      className="p-2 text-text-muted hover:text-status-danger transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={`important-date-year-${d.id}`}
                      className="text-xs text-text-muted whitespace-nowrap"
                    >
                      {t.clientDates.year}
                    </label>
                    <select
                      id={`important-date-year-${d.id}`}
                      value={d.date ? d.date.slice(0, 4) : ''}
                      onChange={(e) => handleDateYearChange(d.id, e.target.value)}
                      disabled={!!d.noYear}
                      className="flex-1 min-w-0 px-2 py-1.5 bg-card border border-border rounded-lg text-text-primary text-sm disabled:opacity-50"
                    >
                      {!d.date && (
                        <option value="" disabled>
                          {t.clientDates.yearPlaceholder}
                        </option>
                      )}
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={d.label || ''}
                      onChange={(e) => handleDateChange(d.id, { label: e.target.value })}
                      placeholder={t.clientDates.labelPlaceholder}
                      className="flex-1 min-w-0 px-2 py-1.5 bg-card border border-border rounded-lg text-text-primary text-sm"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-text-muted whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={!!d.noYear}
                        onChange={(e) => handleDateChange(d.id, { noYear: e.target.checked })}
                        className="rounded border-border"
                      />
                      {t.clientDates.noYear}
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
          {datesError && <p className="text-xs text-status-danger mb-2">{t.clientDates.dateRequired}</p>}
        </div>

        {!customer && (
          <label className="flex items-start gap-3 rounded-lg bg-surface border border-border p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={addBouquet}
              onChange={(e) => setAddBouquet(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span className="min-w-0">
              <span className="block text-sm text-text-primary">{t.customers.addBouquetAfter}</span>
              <span className="block text-xs text-text-muted mt-0.5">{t.customers.addBouquetAfterHint}</span>
            </span>
          </label>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={guard.requestClose} className="flex-1">
            {t.common.cancel}
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            {customer ? t.common.saveChanges : t.customers.addCustomer}
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
