import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Filter,
  Pencil,
  RotateCcw,
  Scale,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  endOfYear,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { FinanceEntry, FinanceEntryType } from '../types';
import { useFinance, useSettings } from '../hooks/useStore';
import { useLanguage } from '../i18n';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FinanceEntryModal } from '../components/finance/FinanceEntryModal';
import { showToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../utils/formatters';
import { currentDate } from '../utils/clock';
import { useAuth } from '../contexts/AuthContext';
import {
  EXPENSE_CATEGORIES,
  FinanceRange,
  buildFinanceMonthGrid,
  createFinanceEntry,
  filterEntriesByRange,
  getAllTimeRange,
  getCustomCategories,
  getFinanceSummary,
  getPresetRange,
  getYearRange,
  groupEntriesByDate,
  matchesFinanceCategories,
  sortFinanceEntries,
  toDateKey,
  todayKey,
  updateFinanceEntryValues,
} from '../services/financeService';
import * as storage from '../services/storage';
import { getCloudFinanceIds, migrateLocalFinanceToCloud } from '../services/cloudSyncService';

type RangeMode = 'day' | 'week' | 'month' | 'year' | 'all' | 'custom';

const RANGE_MODES: RangeMode[] = ['day', 'week', 'month', 'year', 'all', 'custom'];

interface CategoryOption {
  key: string;
  label: string;
  type: FinanceEntryType;
}

export function FinancePage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { entries, loading, refresh, addEntry, updateEntry, deleteEntry } = useFinance();
  const { settings } = useSettings();
  const currency = settings.currencySymbol || '\u20AC';
  const [searchParams, setSearchParams] = useSearchParams();

  const [month, setMonth] = useState<Date>(() => startOfMonth(currentDate()));
  const [selectedDate, setSelectedDate] = useState<string>(() => todayKey());
  const [localEntries, setLocalEntries] = useState<FinanceEntry[]>(() => storage.getFinanceEntries());
  const [uploading, setUploading] = useState(false);

  // Period + category filters. An empty category list means "all categories".
  const [rangeMode, setRangeMode] = useState<RangeMode>('month');
  const [customStart, setCustomStart] = useState<string>(() => toDateKey(startOfMonth(currentDate())));
  const [customEnd, setCustomEnd] = useState<string>(() => todayKey());
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  // "Show more" is remembered per filter combination: changing any filter
  // starts the list from the first 30 days again (derived, no effect needed).
  const [visibleState, setVisibleState] = useState<{ key: string; count: number }>({
    key: '',
    count: 30,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('income');
  const [modalDate, setModalDate] = useState<string>(() => todayKey());
  const [editingEntry, setEditingEntry] = useState<FinanceEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<FinanceEntry | null>(null);

  const filteredCalendarEntries = useMemo(
    () =>
      selectedCategories.length > 0
        ? entries.filter((entry) => matchesFinanceCategories(entry, selectedCategories))
        : entries,
    [entries, selectedCategories],
  );

  const grid = useMemo(
    () => buildFinanceMonthGrid(filteredCalendarEntries, month),
    [filteredCalendarEntries, month],
  );

  // ---------------------------------------------------------------------------
  // Selected range (period presets, custom days, category filter)
  // ---------------------------------------------------------------------------

  const allTimeRange = useMemo(() => getAllTimeRange(entries), [entries]);

  const range = useMemo<FinanceRange>(() => {
    const now = currentDate();
    const anchor = selectedDate ? parseISO(selectedDate) : now;

    switch (rangeMode) {
      case 'day':
        return { start: selectedDate, end: selectedDate };
      case 'week':
        return {
          start: toDateKey(startOfWeek(anchor, { weekStartsOn: 1 })),
          end: toDateKey(endOfWeek(anchor, { weekStartsOn: 1 })),
        };
      case 'month':
        return {
          start: toDateKey(startOfMonth(anchor)),
          end: toDateKey(endOfMonth(anchor)),
        };
      case 'year':
        return {
          start: toDateKey(startOfYear(anchor)),
          end: toDateKey(endOfYear(anchor)),
        };
      case 'all':
        return allTimeRange;
      case 'custom':
      default:
        return { start: customStart, end: customEnd };
    }
  }, [rangeMode, selectedDate, customStart, customEnd, allTimeRange]);

  const customRangeInvalid = rangeMode === 'custom' && customStart > customEnd;

  const rangeEntries = useMemo(
    () =>
      sortFinanceEntries(
        filterEntriesByRange(entries, range).filter((entry) =>
          matchesFinanceCategories(entry, selectedCategories),
        ),
      ),
    [entries, range, selectedCategories],
  );

  const rangeSummary = useMemo(
    () => getFinanceSummary(rangeEntries, range),
    [rangeEntries, range],
  );

  const filteredGroups = useMemo(() => groupEntriesByDate(rangeEntries), [rangeEntries]);
  const filterKey = [rangeMode, selectedDate, customStart, customEnd, ...selectedCategories].join('|');
  const visibleGroups = visibleState.key === filterKey ? visibleState.count : 30;
  const shownGroups = filteredGroups.slice(0, visibleGroups);

  /** All categories that can be filtered, including self-added expense labels. */
  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const options: CategoryOption[] = [
      { key: 'income', label: t.finance.income, type: 'income' },
      { key: 'expense', label: t.finance.expense, type: 'expense' },
    ];

    const customLabels = new Map<string, string>();
    for (const entry of entries) {
      if (entry.type !== 'expense' || (entry.category ?? 'other') !== 'other') continue;
      const label = entry.categoryLabel?.trim();
      if (label) customLabels.set(label.toLowerCase(), label);
    }
    for (const label of getCustomCategories()) {
      const clean = label.trim();
      if (clean && !customLabels.has(clean.toLowerCase())) {
        customLabels.set(clean.toLowerCase(), clean);
      }
    }

    for (const category of EXPENSE_CATEGORIES) {
      if (category === 'other') continue;
      options.push({
        key: `expense:${category}`,
        label: t.finance.categories[category],
        type: 'expense',
      });
    }

    for (const [key, label] of [...customLabels.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], language),
    )) {
      options.push({ key: `expense:other:${key}`, label, type: 'expense' });
    }

    options.push({
      key: 'expense:other',
      label: t.finance.categories.other,
      type: 'expense',
    });

    return options;
  }, [entries, t, language]);

  const toggleCategory = (key: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(key)) return prev.filter((item) => item !== key);

      // The broad "all expenses" shortcut and single expense categories are
      // mutually exclusive: picking one replaces the other.
      if (key === 'expense') {
        return [...prev.filter((item) => item === 'income'), 'expense'];
      }
      if (key.startsWith('expense:')) {
        return [...prev.filter((item) => item !== 'expense'), key];
      }

      return [...prev, key];
    });
  };

  const resetFilters = () => {
    setSelectedCategories([]);
    setRangeMode('month');
    const now = currentDate();
    setMonth(startOfMonth(now));
    setSelectedDate(todayKey(now));
  };

  // ---------------------------------------------------------------------------
  // Cloud migration state
  // ---------------------------------------------------------------------------

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

  const formatMoney = (value: number) =>
    // A shortfall reads "-€400.00", not "€-400.00".
    value < 0 ? `\u2212${formatCurrency(Math.abs(value), currency)}` : formatCurrency(value, currency);
  // Balance always shows its sign, so a shortfall reads as "-EUR 400.00".
  const formatSignedMoney = (value: number) =>
    `${value < 0 ? '\u2212' : '+'}${formatCurrency(Math.abs(value), currency)}`;

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

  const formatShortDate = (dateKey: string) =>
    new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${dateKey}T00:00:00`));

  const rangeLabel =
    rangeMode === 'day'
      ? formatDay(selectedDate)
      : `${formatShortDate(range.start)} — ${formatShortDate(range.end)}`;

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
    const now = currentDate();
    const isCurrentMonth =
      next.getFullYear() === now.getFullYear() && next.getMonth() === now.getMonth();
    setSelectedDate(isCurrentMonth ? todayKey(now) : toDateKey(next));
  };

  const goToToday = () => {
    const now = currentDate();
    setMonth(startOfMonth(now));
    setSelectedDate(todayKey(now));
    setRangeMode('day');
  };

  const selectDay = (dateKey: string) => {
    setSelectedDate(dateKey);
    setRangeMode('day');
  };

  /** Totals-by-period rows jump to the same preset. */
  const applyPreset = (mode: 'week' | 'month' | 'year' | 'all') => {
    const now = currentDate();
    setRangeMode(mode);
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

    // Keep the calendar and the filter on the date that was just edited.
    setMonth(startOfMonth(parseISO(input.date)));
    setSelectedDate(input.date);
    setRangeMode('day');
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
        showToast('success', t.finance.uploadNothing);
      }
    } catch (err) {
      console.error('[FinancePage] Failed to upload local finance entries:', err);
      showToast('error', t.finance.uploadFailed);
    } finally {
      setUploading(false);
    }
  };

  const summaryCards: {
    label: string;
    value: string;
    icon: typeof TrendingUp;
    color: string;
    hint?: string;
  }[] = [
    {
      label: t.finance.grossRevenue,
      value: formatMoney(rangeSummary.income),
      icon: TrendingUp,
      color: 'text-status-success',
    },
    {
      label: t.finance.totalExpenses,
      value: formatMoney(rangeSummary.expense),
      icon: TrendingDown,
      color: 'text-status-danger',
    },
    {
      label: t.finance.profit,
      value: formatMoney(rangeSummary.profit),
      icon: Wallet,
      color: rangeSummary.profit >= 0 ? 'text-status-success' : 'text-status-danger',
    },
    {
      label: t.finance.avgDailyIncome,
      value: formatMoney(rangeSummary.avgDailyIncome),
      icon: ArrowUpRight,
      color: 'text-accent-light',
    },
    {
      label: t.finance.balance,
      value: formatSignedMoney(rangeSummary.profit),
      icon: Scale,
      color: rangeSummary.profit >= 0 ? 'text-status-success' : 'text-status-danger',
      hint: t.finance.balanceHint,
    },
  ];

  // Unfiltered totals the owner asked for: week / month / year / all time.
  const periodTotals = useMemo(() => {
    const now = currentDate();
    const allRange = getAllTimeRange(entries, now);
    return [
      {
        key: 'week' as const,
        label: t.finance.periods.week,
        summary: getFinanceSummary(entries, getPresetRange('week', now)),
      },
      {
        key: 'month' as const,
        label: t.finance.periods.month,
        summary: getFinanceSummary(entries, getPresetRange('month', now)),
      },
      {
        key: 'year' as const,
        label: t.finance.periods.year,
        summary: getFinanceSummary(entries, getYearRange(now)),
      },
      {
        key: 'all' as const,
        label: t.finance.periods.all,
        summary: getFinanceSummary(entries, allRange),
      },
    ];
  }, [entries, t]);

  const hasActiveFilters = selectedCategories.length > 0 || rangeMode !== 'month';

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

      {/* Period + category filters ------------------------------------------------ */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Filter size={18} className="text-accent-green-light" />
            {t.finance.filtersTitle}
          </h2>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw size={15} />
              {t.finance.resetFilters}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.finance.filtersTitle}>
          {RANGE_MODES.map((mode) => {
            const active = rangeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setRangeMode(mode)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  active
                    ? 'border-accent-green bg-accent-green/15 text-accent-green'
                    : 'border-border bg-surface text-text-secondary hover:bg-hover hover:text-text-primary'
                }`}
              >
                {t.finance.rangeModes[mode]}
              </button>
            );
          })}
        </div>

        {rangeMode === 'custom' && (
          <div className="mt-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <label htmlFor="finance-range-start" className="block text-xs text-text-muted mb-1">
                  {t.finance.from}
                </label>
                <input
                  id="finance-range-start"
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value || todayKey())}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="finance-range-end" className="block text-xs text-text-muted mb-1">
                  {t.finance.to}
                </label>
                <input
                  id="finance-range-end"
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value || todayKey())}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
                />
              </div>
            </div>
            {customRangeInvalid && (
              <p className="text-xs text-status-danger mt-1">{t.finance.invalidRange}</p>
            )}
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted mb-2">
            {t.finance.filterCategories}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategories([])}
              aria-pressed={selectedCategories.length === 0}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                selectedCategories.length === 0
                  ? 'border-accent-green bg-accent-green/15 text-accent-green'
                  : 'border-border bg-surface text-text-secondary hover:bg-hover hover:text-text-primary'
              }`}
            >
              {t.finance.allCategories}
            </button>
            {categoryOptions.map((option) => {
              const active = selectedCategories.includes(option.key);
              const activeClasses =
                option.type === 'income'
                  ? 'border-status-success bg-status-success/15 text-status-success'
                  : 'border-status-danger bg-status-danger/15 text-status-danger';
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => toggleCategory(option.key)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                    active
                      ? activeClasses
                      : 'border-border bg-surface text-text-secondary hover:bg-hover hover:text-text-primary'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-3 text-xs text-text-muted">
          {rangeLabel}
          <span className="mx-1.5">·</span>
          {rangeSummary.entryCount} {t.finance.entries}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-text-secondary text-sm truncate">{card.label}</p>
                <p className={`text-xl sm:text-2xl font-bold mt-1 truncate ${card.color}`}>
                  {card.value}
                </p>
                {card.hint ? <p className="text-xs text-text-muted mt-0.5">{card.hint}</p> : null}
              </div>
              <card.icon size={22} className={`${card.color} shrink-0`} />
            </div>
          </div>
        ))}
      </div>

      {/* Unfiltered week / month / year / all-time totals ------------------------ */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold text-text-primary">{t.finance.periodTotals}</h2>
        <p className="text-xs text-text-muted">{t.finance.periodTotalsHint}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-text-muted">
                <th className="pb-2 pr-3 text-left font-medium">{t.finance.period}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t.finance.income}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t.finance.expense}</th>
                <th className="pb-2 text-right font-medium">{t.finance.profit}</th>
              </tr>
            </thead>
            <tbody>
              {periodTotals.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => applyPreset(row.key)}
                      className="text-left text-text-primary hover:text-accent-green-light transition-colors"
                    >
                      {row.label}
                    </button>
                  </td>
                  <td className="py-2 pr-3 text-right font-medium text-status-success whitespace-nowrap">
                    +{formatMoney(row.summary.income)}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium text-status-danger whitespace-nowrap">
                    &minus;{formatMoney(row.summary.expense)}
                  </td>
                  <td
                    className={`py-2 text-right font-semibold whitespace-nowrap ${
                      row.summary.profit >= 0 ? 'text-status-success' : 'text-status-danger'
                    }`}
                  >
                    {formatMoney(row.summary.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                onClick={() => selectDay(day.key)}
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
            <h2 className="text-lg font-semibold text-text-primary">{t.finance.entriesInRange}</h2>
            <p className="text-sm text-text-muted">
              {rangeLabel}
              <span className="mx-1.5">·</span>
              {rangeSummary.entryCount} {t.finance.entries}
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
              +{formatMoney(rangeSummary.income)}
            </p>
          </div>
          <div className="rounded-lg bg-surface px-3 py-2">
            <p className="text-xs text-text-muted truncate">{t.finance.expense}</p>
            <p className="text-sm sm:text-base font-semibold truncate text-status-danger">
              &minus;{formatMoney(rangeSummary.expense)}
            </p>
          </div>
          <div className="rounded-lg bg-surface px-3 py-2">
            <p className="text-xs text-text-muted truncate">{t.finance.profit}</p>
            <p
              className={`text-sm sm:text-base font-semibold truncate ${
                rangeSummary.profit >= 0 ? 'text-status-success' : 'text-status-danger'
              }`}
            >
              {formatMoney(rangeSummary.profit)}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {loading ? (
            <p className="text-text-muted text-sm py-8 text-center">{t.common.loading}</p>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-8">
              <CalendarDays size={28} className="mx-auto text-text-muted mb-2" />
              {rangeMode === 'day' ? (
                <>
                  <p className="text-text-secondary">{t.finance.noDayEntries}</p>
                  <p className="text-text-muted text-sm mt-1">{t.finance.noDayEntriesHint}</p>
                </>
              ) : (
                <>
                  <p className="text-text-secondary">{t.finance.noFilteredEntries}</p>
                  <p className="text-text-muted text-sm mt-1">{t.finance.noFilteredEntriesHint}</p>
                </>
              )}
            </div>
          ) : (
            shownGroups.map((group) => (
              <div key={group.date}>
                {rangeMode !== 'day' && (
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium text-text-primary">
                      {formatDay(group.date)}
                    </h3>
                    <span className="text-xs text-text-muted">
                      {group.entries.length} {t.finance.entries}
                    </span>
                  </div>
                )}
                <div className="space-y-1">
                  {group.entries.map((entry) => (
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
              </div>
            ))
          )}
        </div>

        {filteredGroups.length > visibleGroups && (
          <div className="mt-3 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setVisibleState({ key: filterKey, count: visibleGroups + 30 })
              }
            >
              {t.finance.showMore} ({filteredGroups.length - visibleGroups})
            </Button>
          </div>
        )}
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
