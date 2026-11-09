import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Pencil,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { addMonths, parseISO, startOfMonth } from 'date-fns';
import { FinanceEntry } from '../types';
import { useFinance, useSettings } from '../hooks/useStore';
import { useLanguage } from '../i18n';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FinanceEntryModal } from '../components/finance/FinanceEntryModal';
import { showToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';
import {
  buildFinanceMonthGrid,
  createFinanceEntry,
  getFinanceSummary,
  sortFinanceEntries,
  toDateKey,
  todayKey,
  updateFinanceEntryValues,
} from '../services/financeService';
import * as storage from '../services/storage';
import { getCloudFinanceIds, migrateLocalFinanceToCloud } from '../services/cloudSyncService';

export function FinancePage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { entries, loading, refresh, addEntry, updateEntry, deleteEntry } = useFinance();
  const { settings } = useSettings();
  const currency = settings.currencySymbol || '\u20AC';
  const [searchParams, setSearchParams] = useSearchParams();

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => todayKey());
  const [localEntries, setLocalEntries] = useState<FinanceEntry[]>(() => storage.getFinanceEntries());
  const [uploading, setUploading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('income');
  const [modalDate, setModalDate] = useState<string>(() => todayKey());
  const [editingEntry, setEditingEntry] = useState<FinanceEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<FinanceEntry | null>(null);

  const grid = useMemo(() => buildFinanceMonthGrid(entries, month), [entries, month]);
  const selectedSummary = useMemo(
    () => getFinanceSummary(entries, { start: selectedDate, end: selectedDate }),
    [entries, selectedDate],
  );
  const selectedEntries = useMemo(
    () => sortFinanceEntries(entries.filter((entry) => entry.date === selectedDate)),
    [entries, selectedDate],
  );

  const [cloudFinanceIds, setCloudFinanceIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setCloudFinanceIds(null);
      return;
    }

    getCloudFinanceIds()
      .then((ids) => {
        if (!cancelled) setCloudFinanceIds(ids);
      })
      .catch((err) => {
        console.error('[FinancePage] Failed to load cloud finance ids:', err);
        if (!cancelled) setCloudFinanceIds(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user, entries]);

  const missingLocal = useMemo(() => {
    if (!cloudFinanceIds) return [];
    return localEntries.filter((entry) => !cloudFinanceIds.has(entry.id));
  }, [cloudFinanceIds, localEntries]);

  const formatMoney = (value: number) => formatCurrency(value, currency);

  /** Drops a trailing ".00" so the small calendar cells stay readable. */
  const formatCellMoney = (value: number) =>
    formatCurrency(Math.round(value * 100) / 100, currency).replace(/\.00$/, '');

  const formatDay = (dateKey: string) =>
    new Intl.DateTimeFormat(language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${dateKey}T00:00:00`));

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(month),
    [language, month],
  );

  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2024, 0, 1 + index)));
  }, [language]);

  const categoryLabel = (entry: FinanceEntry): string => {
    if (entry.type === 'income') return t.finance.income;
    if (entry.category === 'other') {
      return entry.categoryLabel?.trim() || t.finance.categories.other;
    }
    return t.finance.categories[entry.category ?? 'other'];
  };

  const changeMonth = (offset: number) => {
    const next = addMonths(month, offset);
    setMonth(next);
    const now = new Date();
    const isCurrentMonth =
      next.getFullYear() === now.getFullYear() && next.getMonth() === now.getMonth();
    setSelectedDate(isCurrentMonth ? todayKey(now) : toDateKey(next));
  };

  const goToToday = () => {
    const now = new Date();
    setMonth(startOfMonth(now));
    setSelectedDate(todayKey(now));
  };

  const openAdd = (type: 'income' | 'expense') => {
    setEditingEntry(null);
    setModalType(type);
    setModalDate(selectedDate);
    setModalOpen(true);
  };

  const openEdit = (entry: FinanceEntry) => {
    setEditingEntry(entry);
    setModalType(entry.type);
    setModalDate(entry.date);
    setModalOpen(true);
  };

  // The Home page quick buttons link to /finance?action=income|expense.
  useEffect(() => {
    const action = searchParams.get('action');
    if (action !== 'income' && action !== 'expense') return;
    setEditingEntry(null);
    setModalType(action);
    setModalDate(selectedDate);
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, selectedDate]);

  const handleSubmit = async (input: Parameters<typeof createFinanceEntry>[0]) => {
    if (editingEntry) {
      await updateEntry(updateFinanceEntryValues(editingEntry, input));
      showToast('success', t.finance.updated);
    } else {
      await addEntry(createFinanceEntry(input));
      showToast('success', input.type === 'income' ? t.finance.savedIncome : t.finance.savedExpense);
    }

    // Keep the calendar on the date that was just edited.
    setMonth(startOfMonth(parseISO(input.date)));
    setSelectedDate(input.date);
  };

  const handleDelete = async () => {
    if (!deletingEntry) return;
    try {
      await deleteEntry(deletingEntry.id);
      showToast('success', t.finance.deleted);
    } catch (err) {
      console.error('[FinancePage] Failed to delete entry:', err);
      showToast('error', t.finance.saveFailed);
    } finally {
      setDeletingEntry(null);
    }
  };

  const handleUploadLocal = async () => {
    setUploading(true);
    try {
      const result = await migrateLocalFinanceToCloud();
      await refresh();
      setLocalEntries(storage.getFinanceEntries());

      if (result.errors.length === 0) {
        setCloudFinanceIds(
          (prev) => new Set([...(prev ?? []), ...localEntries.map((entry) => entry.id)]),
        );
      }

      if (result.errors.length > 0) {
        showToast('warning', t.finance.uploadFailed);
        console.error('[FinancePage] Finance migration errors:', result.errors);
      } else if (result.added > 0) {
        showToast('success', t.finance.uploaded.replace('{count}', String(result.added)));
      } else {
        showToast('info', t.finance.uploadNothing);
      }
    } catch (err) {
      console.error('[FinancePage] Failed to upload local finance entries:', err);
      showToast('error', t.finance.uploadFailed);
    } finally {
      setUploading(false);
    }
  };

  const monthCards = [
    {
      label: t.finance.grossRevenue,
      value: formatMoney(grid.summary.income),
      icon: TrendingUp,
      color: 'text-status-success',
    },
    {
      label: t.finance.totalExpenses,
      value: formatMoney(grid.summary.expense),
      icon: TrendingDown,
      color: 'text-status-danger',
    },
    {
      label: t.finance.profit,
      value: formatMoney(grid.summary.profit),
      icon: Wallet,
      color: grid.summary.profit >= 0 ? 'text-status-success' : 'text-status-danger',
    },
    {
      label: t.finance.avgDailyIncome,
      value: formatMoney(grid.summary.avgDailyIncome),
      icon: ArrowUpRight,
      color: 'text-accent-light',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t.finance.title}</h1>
          <p className="text-sm text-text-secondary">{t.finance.subtitle}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => openAdd('income')}>
            <TrendingUp size={18} />
            {t.finance.addIncomeShort}
          </Button>
          <Button variant="secondary" onClick={() => openAdd('expense')}>
            <TrendingDown size={18} />
            {t.finance.addExpense}
          </Button>
        </div>
      </div>

      {user && !loading && missingLocal.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-status-warning/30 bg-status-warning/10 p-4 sm:flex-row sm:items-center">
          <CloudUpload size={20} className="shrink-0 text-status-warning" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">
              {t.finance.localNotInCloud.replace('{count}', String(missingLocal.length))}
            </p>
            <p className="text-xs text-text-muted">{t.finance.localNotInCloudHint}</p>
          </div>
          <Button size="sm" onClick={() => void handleUploadLocal()} isLoading={uploading}>
            {!uploading && <CloudUpload size={16} />}
            {uploading ? t.finance.uploading : t.finance.uploadToCloud}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {monthCards.map((card) => (
          <div key={card.label} className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-text-secondary text-sm truncate">{card.label}</p>
                <p className={`text-xl sm:text-2xl font-bold mt-1 truncate ${card.color}`}>
                  {card.value}
                </p>
              </div>
              <card.icon size={22} className={`${card.color} shrink-0`} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              title={t.finance.previousMonth}
              aria-label={t.finance.previousMonth}
              className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-hover transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="min-w-[9rem] text-center text-lg font-semibold capitalize text-text-primary">
              {monthLabel}
            </h2>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              title={t.finance.nextMonth}
              aria-label={t.finance.nextMonth}
              className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-hover transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={goToToday}>
            <CalendarDays size={16} />
            {t.finance.today}
          </Button>
        </div>

        <div
          className="grid grid-cols-7 gap-1 mb-1"
          role="presentation"
          aria-hidden="true"
        >
          {weekdayLabels.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="text-center text-[11px] sm:text-xs font-medium uppercase tracking-wide text-text-muted py-1"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1" role="group" aria-label={t.finance.calendar}>
          {grid.days.map((day) => {
            const selected = day.key === selectedDate;
            return (
              <button
                key={day.key}
                type="button"
                onClick={() => setSelectedDate(day.key)}
                aria-pressed={selected}
                aria-label={formatDay(day.key)}
                className={`relative flex min-h-[64px] sm:min-h-[92px] flex-col rounded-lg border p-1.5 sm:p-2 text-left transition-colors ${
                  selected
                    ? 'border-accent-green bg-accent-green/15'
                    : day.inMonth
                      ? 'border-border bg-surface/40 hover:bg-hover'
                      : 'border-transparent bg-transparent hover:bg-hover'
                }`}
              >
                <span
                  className={`text-xs sm:text-sm font-medium ${
                    day.inMonth ? 'text-text-primary' : 'text-text-muted'
                  }`}
                >
                  {day.day}
                </span>

                {day.isToday && (
                  <span
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-green"
                    aria-hidden="true"
                  />
                )}

                <div className="mt-auto w-full space-y-0.5">
                  {day.income > 0 && (
                    <span className="block truncate text-[10px] sm:text-xs font-medium text-status-success">
                      +{formatCellMoney(day.income)}
                    </span>
                  )}
                  {day.expense > 0 && (
                    <span className="block truncate text-[10px] sm:text-xs font-medium text-status-danger">
                      &minus;{formatCellMoney(day.expense)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text-primary">{formatDay(selectedDate)}</h2>
            <p className="text-sm text-text-muted">
              {selectedSummary.entryCount} {t.finance.entries}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => openAdd('income')}>
              <ArrowUpRight size={16} />
              {t.finance.addIncomeShort}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openAdd('expense')}>
              <ArrowDownRight size={16} />
              {t.finance.addExpense}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-surface px-3 py-2">
            <p className="text-xs text-text-muted truncate">{t.finance.income}</p>
            <p className="text-sm sm:text-base font-semibold truncate text-status-success">
              +{formatMoney(selectedSummary.income)}
            </p>
          </div>
          <div className="rounded-lg bg-surface px-3 py-2">
            <p className="text-xs text-text-muted truncate">{t.finance.expense}</p>
            <p className="text-sm sm:text-base font-semibold truncate text-status-danger">
              &minus;{formatMoney(selectedSummary.expense)}
            </p>
          </div>
          <div className="rounded-lg bg-surface px-3 py-2">
            <p className="text-xs text-text-muted truncate">{t.finance.profit}</p>
            <p
              className={`text-sm sm:text-base font-semibold truncate ${
                selectedSummary.profit >= 0 ? 'text-status-success' : 'text-status-danger'
              }`}
            >
              {formatMoney(selectedSummary.profit)}
            </p>
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <p className="text-text-muted text-sm py-8 text-center">{t.common.loading}</p>
          ) : selectedEntries.length === 0 ? (
            <div className="text-center py-8">
              <CalendarDays size={28} className="mx-auto text-text-muted mb-2" />
              <p className="text-text-secondary">{t.finance.noDayEntries}</p>
              <p className="text-text-muted text-sm mt-1">{t.finance.noDayEntriesHint}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {selectedEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2.5"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      entry.type === 'income'
                        ? 'bg-status-success/15 text-status-success'
                        : 'bg-status-danger/15 text-status-danger'
                    }`}
                  >
                    {entry.type === 'income' ? (
                      <ArrowUpRight size={16} />
                    ) : (
                      <ArrowDownRight size={16} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm truncate">{categoryLabel(entry)}</p>
                    {entry.note && (
                      <p className="text-text-muted text-xs truncate">{entry.note}</p>
                    )}
                  </div>
                  <span
                    className={`font-medium whitespace-nowrap ${
                      entry.type === 'income' ? 'text-status-success' : 'text-status-danger'
                    }`}
                  >
                    {entry.type === 'income' ? '+' : '\u2212'}
                    {formatMoney(entry.amount)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(entry)}
                      title={t.common.edit}
                      aria-label={t.common.edit}
                      className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-hover transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingEntry(entry)}
                      title={t.common.delete}
                      aria-label={t.common.delete}
                      className="p-1.5 rounded text-text-muted hover:text-status-danger hover:bg-hover transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <FinanceEntryModal
        isOpen={modalOpen}
        initialType={modalType}
        initialDate={modalDate}
        entry={editingEntry}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        isOpen={deletingEntry !== null}
        onClose={() => setDeletingEntry(null)}
        onConfirm={() => void handleDelete()}
        title={t.finance.deleteTitle}
        message={t.finance.deleteConfirm}
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
      />
    </div>
  );
}
