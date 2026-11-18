import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Clock, ShoppingCart, Package, Flower2, Users, Settings, ArrowDown, AlertTriangle, History as HistoryIcon, Trash2, Wallet } from 'lucide-react';
import { HistoryActionType, EntityType } from '../types';
import { ClearHistoryPeriod, getHistoryClearRange, isInHistoryClearRange } from '../services/historyService';
import { useHistory } from '../hooks/useHistory';
import { usePermissions } from '../contexts/PermissionsContext';
import { useLanguage } from '../i18n';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export function HistoryPage() {
  const { t, language } = useLanguage();
  const { can } = usePermissions();
  const canDelete = can('deleteRecords');
  const dateLocale = language === 'ru' ? 'ru-RU' : language === 'bg' ? 'bg-BG' : 'en-GB';
  const { records: allRecords, loading, error, deleteRecord, clearHistory } = useHistory();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState<HistoryActionType | ''>('');
  const [entityFilter, setEntityFilter] = useState<EntityType | ''>('');
  const [showClearMenu, setShowClearMenu] = useState(false);
  const [clearConfirmPeriod, setClearConfirmPeriod] = useState<ClearHistoryPeriod | null>(null);
  const [clearCount, setClearCount] = useState(0);
  const clearMenuRef = useRef<HTMLDivElement>(null);

  const records = useMemo(() => {
    let filtered = allRecords;
    if (dateFrom) filtered = filtered.filter(r => r.timestamp >= dateFrom);
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setDate(toDate.getDate() + 1);
      filtered = filtered.filter(r => r.timestamp < toDate.toISOString());
    }
    if (actionFilter) filtered = filtered.filter(r => r.actionType === actionFilter);
    if (entityFilter) filtered = filtered.filter(r => r.entityType === entityFilter);
    return filtered;
  }, [allRecords, dateFrom, dateTo, actionFilter, entityFilter]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clearMenuRef.current && !clearMenuRef.current.contains(e.target as Node)) {
        setShowClearMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClearClick = useCallback((period: ClearHistoryPeriod) => {
    const count =
      period === 'all'
        ? allRecords.length
        : allRecords.filter(r => isInHistoryClearRange(r.timestamp, getHistoryClearRange(period))).length;
    setClearCount(count);
    setClearConfirmPeriod(period);
    setShowClearMenu(false);
  }, [allRecords]);

  const confirmClear = useCallback(async () => {
    if (clearConfirmPeriod) {
      await clearHistory(clearConfirmPeriod);
      setClearConfirmPeriod(null);
    }
  }, [clearConfirmPeriod, clearHistory]);

  const handleDeleteRecord = useCallback(async (id: string) => {
    await deleteRecord(id);
  }, [deleteRecord]);

  const getActionLabel = (actionType: HistoryActionType): string => {
    // Action ids are snake_case ('order_created'), translation keys camelCase
    // ('orderCreated'), so the lookup has to convert one into the other.
    const key = actionType.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const label = (t.history as Record<string, unknown>)[key];
    return typeof label === 'string' ? label : actionType;
  };

  const getEntityIcon = (entityType: EntityType) => {
    const icons: Record<EntityType, typeof ShoppingCart> = {
      order: ShoppingCart,
      delivery: Clock,
      inventory: Package,
      bouquet: Flower2,
      customer: Users,
      reservation: AlertTriangle,
      finance: Wallet,
      settings: Settings,
      backup: ArrowDown,
    };
    return icons[entityType] || HistoryIcon;
  };

  const getActionColor = (actionType: HistoryActionType): string => {
    if (actionType.includes('created')) return 'text-status-success';
    if (actionType.includes('cancelled') || actionType.includes('deleted') || actionType.includes('released')) return 'text-status-danger';
    if (actionType.includes('changed') || actionType.includes('edited') || actionType.includes('updated')) return 'text-status-warning';
    if (actionType.includes('completed') || actionType.includes('restored')) return 'text-status-info';
    return 'text-text-secondary';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HistoryIcon size={28} className="text-accent-green-light" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t.history.title}</h1>
            <p className="text-text-muted text-sm">{t.history.subtitle}</p>
          </div>
        </div>
        {canDelete && (
          <div className="relative" ref={clearMenuRef}>
            <button
              onClick={() => setShowClearMenu(!showClearMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-text-secondary hover:text-status-danger hover:border-status-danger/30 transition-colors text-sm"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">{t.history.clearHistory}</span>
            </button>
            {showClearMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
                {([
                  ['yesterday', t.history.clearYesterday],
                  ['7days', t.history.clearLast7Days],
                  ['month', t.history.clearLastMonth],
                  ['year', t.history.clearLastYear],
                  ['all', t.history.clearAll],
                ] as const).map(([period, label]) => (
                  <button
                    key={period}
                    onClick={() => handleClearClick(period)}
                    className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex gap-2">
          <div>
            <label className="block text-xs text-text-muted mb-1">{t.history.dateFrom}</label>
            <input
              type="date"
              lang={language}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 bg-card border border-border rounded-lg text-text-primary text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">{t.history.dateTo}</label>
            <input
              type="date"
              lang={language}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 bg-card border border-border rounded-lg text-text-primary text-sm"
            />
          </div>
        </div>
        <div className="relative">
          <label className="block text-xs text-text-muted mb-1">{t.history.filterByAction}</label>
          <div className="relative">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as HistoryActionType | '')}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text-primary text-sm appearance-none pr-8"
            >
              <option value="">{t.history.allActions}</option>
              <option value="order_created">{t.history.orderCreated}</option>
              <option value="order_edited">{t.history.orderEdited}</option>
              <option value="order_status_changed">{t.history.orderStatusChanged}</option>
              <option value="order_cancelled">{t.history.orderCancelled}</option>
              <option value="order_deleted">{t.history.orderDeleted}</option>
              <option value="reservation_created">{t.history.reservationCreated}</option>
              <option value="reservation_released">{t.history.reservationReleased}</option>
              <option value="reservation_completed">{t.history.reservationCompleted}</option>
              <option value="inventory_received">{t.history.inventoryReceived}</option>
              <option value="inventory_decreased">{t.history.inventoryDecreased}</option>
              <option value="inventory_waste">{t.history.inventoryWaste}</option>
              <option value="bouquet_created">{t.history.bouquetCreated}</option>
              <option value="bouquet_edited">{t.history.bouquetEdited}</option>
              <option value="customer_created">{t.history.customerCreated}</option>
              <option value="customer_edited">{t.history.customerEdited}</option>
              <option value="finance_created">{t.history.financeCreated}</option>
              <option value="finance_edited">{t.history.financeEdited}</option>
              <option value="finance_deleted">{t.history.financeDeleted}</option>
              <option value="settings_changed">{t.history.settingsChanged}</option>
              <option value="backup_created">{t.history.backupCreated}</option>
              <option value="backup_restored">{t.history.backupRestored}</option>
            </select>
            <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        </div>
        <div className="relative">
          <label className="block text-xs text-text-muted mb-1">{t.history.filterByEntity}</label>
          <div className="relative">
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value as EntityType | '')}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text-primary text-sm appearance-none pr-8"
            >
              <option value="">{t.history.allEntities}</option>
              <option value="order">{t.orders.title}</option>
              <option value="delivery">{t.deliveries.title}</option>
              <option value="inventory">{t.inventory.title}</option>
              <option value="bouquet">{t.bouquets.title}</option>
              <option value="customer">{t.customers.title}</option>
              <option value="reservation">{t.reservations.title}</option>
              <option value="finance">{t.finance.title}</option>
              <option value="settings">{t.settings.title}</option>
              <option value="backup">{t.settings.backupSection}</option>
            </select>
            <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-status-danger/10 border border-status-danger/30 rounded-lg px-4 py-3 text-status-danger text-sm">
          {error}
        </div>
      )}

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-text-muted">
            <div className="inline-block w-6 h-6 border-2 border-accent-green-light/30 border-t-accent-green-light rounded-full animate-spin mb-3" />
            <p>{t.common.loading}</p>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <HistoryIcon size={48} className="mx-auto mb-3 opacity-30" />
            <p>{t.history.noRecords}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2a2a2a]">
            {records.map((record) => {
              const EntityIcon = getEntityIcon(record.entityType);
              const colorClass = getActionColor(record.actionType);
              return (
                <div key={record.id} className="flex items-start gap-4 p-4 hover:bg-surface transition-colors">
                  <div className={`p-2 rounded-lg bg-surface ${colorClass}`}>
                    <EntityIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium ${colorClass}`}>
                        {getActionLabel(record.actionType)}
                      </span>
                       <span className="text-text-muted text-xs">—</span>
                      <span className="text-text-muted text-xs">{record.entityId}</span>
                    </div>
                    <p className="text-text-primary text-sm line-clamp-2">{record.description}</p>
                    {record.metadata && Object.keys(record.metadata).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {Object.entries(record.metadata).map(([key, value]) => (
                          <span key={key} className="text-xs text-text-muted bg-surface px-2 py-0.5 rounded">
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex items-start gap-2">
                    <div className="text-right">
                      <p className="text-text-muted text-xs">{new Date(record.timestamp).toLocaleDateString(dateLocale)}</p>
                      <p className="text-text-muted text-xs">{new Date(record.timestamp).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    {canDelete && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record.id); }}
                        title={t.history.deleteRecord}
                        className="p-1 text-text-muted hover:text-status-danger transition-colors rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={clearConfirmPeriod !== null}
        title={t.history.clearHistory}
        message={clearCount > 0
          ? t.history.clearConfirm.replace('{count}', String(clearCount))
          : t.history.clearNothing
        }
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        onConfirm={confirmClear}
        onClose={() => setClearConfirmPeriod(null)}
        variant="danger"
      />
    </div>
  );
}
