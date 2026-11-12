import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { ExpenseCategory, FinanceEntry, FinanceEntryType } from '../types';

/**
 * Owner's daily bookkeeping.
 *
 * The numbers are typed in manually (the daily revenue comes from the fiscal
 * receipt report, expenses from the shop's own records). They intentionally do
 * NOT reuse order totals - an order total is a sale, not the money that landed
 * in the register, and the owner asked for a separate cash-book.
 */

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'purchase',
  'salary',
  'rent',
  'taxes',
  'utilities',
  'packaging',
  'other',
];

export const CUSTOM_CATEGORIES_KEY = 'flower-shop.finance-categories';

/** Sentinel used by the category select to reveal the "new category" input. */
export const NEW_CATEGORY_VALUE = '__new__';

/** 'YYYY-MM-DD' of a Date in local time (dates are compared as strings). */
export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

// ---------------------------------------------------------------------------
// Custom expense categories (stored per device)
// ---------------------------------------------------------------------------

export function getCustomCategories(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function saveCustomCategories(categories: string[]): void {
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
  } catch {
    // Ignore storage failures - the category just won't be remembered.
  }
}

/** Adds a category name, ignoring blanks and case-insensitive duplicates. */
export function addCustomCategory(name: string): string[] {
  const clean = name.trim().slice(0, 40);
  const current = getCustomCategories();
  if (!clean) return current;
  if (current.some(item => item.toLowerCase() === clean.toLowerCase())) return current;
  const next = [...current, clean].slice(0, 30);
  saveCustomCategories(next);
  return next;
}

export function removeCustomCategory(name: string): string[] {
  const next = getCustomCategories().filter(item => item !== name);
  saveCustomCategories(next);
  return next;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface FinanceEntryInput {
  type: FinanceEntryType;
  date: string;
  amount: number;
  category?: ExpenseCategory;
  categoryLabel?: string;
  note?: string;
}

export function createFinanceEntry(input: FinanceEntryInput, now: Date = new Date()): FinanceEntry {
  const timestamp = now.toISOString();
  const cleanLabel = input.categoryLabel?.trim();
  return {
    id: uuidv4(),
    type: input.type,
    date: input.date,
    amount: roundMoney(input.amount),
    category: input.type === 'expense' ? (input.category ?? 'other') : undefined,
    categoryLabel:
      input.type === 'expense' && cleanLabel ? cleanLabel.slice(0, 40) : undefined,
    note: input.note?.trim() || undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateFinanceEntryValues(
  entry: FinanceEntry,
  input: FinanceEntryInput,
  now: Date = new Date(),
): FinanceEntry {
  const cleanLabel = input.categoryLabel?.trim();
  return {
    ...entry,
    type: input.type,
    date: input.date,
    amount: roundMoney(input.amount),
    category: input.type === 'expense' ? (input.category ?? 'other') : undefined,
    categoryLabel:
      input.type === 'expense' && cleanLabel ? cleanLabel.slice(0, 40) : undefined,
    note: input.note?.trim() || undefined,
    updatedAt: now.toISOString(),
  };
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value) * 100) / 100;
}

/** Newest first, then newest edit first. */
export function sortFinanceEntries(entries: FinanceEntry[]): FinanceEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/** Entries inside an inclusive 'YYYY-MM-DD' range. */
export function filterEntriesByRange(
  entries: FinanceEntry[],
  range: FinanceRange,
): FinanceEntry[] {
  return entries.filter(entry => entry.date >= range.start && entry.date <= range.end);
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export type FinancePeriodPreset = 'week' | 'month' | 'lastMonth' | 'custom';

export interface FinanceRange {
  /** Inclusive, 'YYYY-MM-DD'. */
  start: string;
  /** Inclusive, 'YYYY-MM-DD'. */
  end: string;
}

/** Week starts on Monday, matching the rest of the app. */
export function getPresetRange(preset: Exclude<FinancePeriodPreset, 'custom'>, now: Date = new Date()): FinanceRange {
  const today = todayKey(now);

  if (preset === 'week') {
    return { start: toDateKey(startOfWeek(now, { weekStartsOn: 1 })), end: today };
  }

  if (preset === 'month') {
    return { start: toDateKey(startOfMonth(now)), end: today };
  }

  const previousMonth = subMonths(now, 1);
  return {
    start: toDateKey(startOfMonth(previousMonth)),
    end: toDateKey(endOfMonth(previousMonth)),
  };
}

/** From the first day of the current year up to today. */
export function getYearRange(now: Date = new Date()): FinanceRange {
  return { start: toDateKey(startOfYear(now)), end: todayKey(now) };
}

/**
 * From the earliest entry to today (or the latest future-dated entry).
 * An empty cash-book falls back to today so the range stays valid.
 */
export function getAllTimeRange(
  entries: FinanceEntry[],
  now: Date = new Date(),
): FinanceRange {
  const today = todayKey(now);
  if (entries.length === 0) return { start: today, end: today };

  let start = entries[0].date;
  let end = entries[0].date;
  for (const entry of entries) {
    if (entry.date < start) start = entry.date;
    if (entry.date > end) end = entry.date;
  }

  return { start, end: end > today ? end : today };
}

/**
 * Stable key of the entry's category, used by the Finance tab filters.
 * Income always collapses into a single 'income' bucket; custom expense
 * categories are keyed by their label so two "Marketing" entries match.
 */
export function financeCategoryKey(entry: FinanceEntry): string {
  if (entry.type === 'income') return 'income';

  const category = entry.category ?? 'other';
  if (category === 'other') {
    const label = entry.categoryLabel?.trim();
    if (label) return `expense:other:${label.toLowerCase()}`;
  }

  return `expense:${category}`;
}

/** True when the entry belongs to one of the keys (an empty list means all). */
export function matchesFinanceCategories(entry: FinanceEntry, keys: string[]): boolean {
  if (keys.length === 0) return true;
  // 'expense' is a shortcut for every expense category at once.
  if (keys.includes('expense') && entry.type === 'expense') return true;
  if (keys.includes('income') && entry.type === 'income') return true;
  return keys.includes(financeCategoryKey(entry));
}

/** Number of calendar days in the range, inclusive. At least 1. */
export function daysInRange(range: FinanceRange): number {
  if (range.end < range.start) return 0;
  const start = parseISO(range.start);
  const end = parseISO(range.end);
  return eachDayOfInterval({ start, end }).length;
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export interface FinanceSummary {
  income: number;
  expense: number;
  profit: number;
  /** Gross revenue divided by the number of days in the period. */
  avgDailyIncome: number;
  /** Days in the period; 0 for an invalid range. */
  days: number;
  entryCount: number;
}

export function getFinanceSummary(entries: FinanceEntry[], range: FinanceRange): FinanceSummary {
  const inRange = filterEntriesByRange(entries, range);
  let income = 0;
  let expense = 0;

  for (const entry of inRange) {
    if (entry.type === 'income') income += entry.amount;
    else expense += entry.amount;
  }

  const days = daysInRange(range);
  income = roundMoney(income);
  expense = roundMoney(expense);

  return {
    income,
    expense,
    profit: roundMoney(income - expense),
    avgDailyIncome: days > 0 ? roundMoney(income / days) : 0,
    days,
    entryCount: inRange.length,
  };
}

export interface FinanceCalendarDay {
  /** 'YYYY-MM-DD' of the cell. */
  key: string;
  /** Day of the month, 1-31. */
  day: number;
  /** False for the leading/trailing cells that belong to another month. */
  inMonth: boolean;
  isToday: boolean;
  income: number;
  expense: number;
  profit: number;
  entryCount: number;
}

export interface FinanceMonthGrid {
  /** 'YYYY-MM' of the displayed month. */
  monthKey: string;
  /** First day of the displayed month. */
  start: string;
  /** Last day of the displayed month. */
  end: string;
  /** Monday of the first calendar week in the grid. */
  gridStart: string;
  /** Sunday of the last calendar week in the grid. */
  gridEnd: string;
  /** Whole weeks (Monday first), always a multiple of seven days. */
  days: FinanceCalendarDay[];
  /** Totals for the displayed month only. */
  summary: FinanceSummary;
}

/** First and last day of the month that contains `month`. */
export function getMonthRange(month: Date): FinanceRange {
  return {
    start: toDateKey(startOfMonth(month)),
    end: toDateKey(endOfMonth(month)),
  };
}

/**
 * Builds the month calendar used by the Finance tab: Monday-first weeks with
 * the leading/trailing days of the neighbouring months, and per-day totals so
 * a single click can show what happened that day.
 */
export function buildFinanceMonthGrid(
  entries: FinanceEntry[],
  month: Date,
  now: Date = new Date(),
): FinanceMonthGrid {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthRange = getMonthRange(month);
  const gridRange: FinanceRange = {
    start: toDateKey(gridStart),
    end: toDateKey(gridEnd),
  };

  const byDate = new Map<string, FinanceEntry[]>();
  for (const entry of filterEntriesByRange(entries, gridRange)) {
    const list = byDate.get(entry.date);
    if (list) list.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  const today = todayKey(now);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => {
    const key = toDateKey(date);
    let income = 0;
    let expense = 0;
    const dayEntries = byDate.get(key) ?? [];

    for (const entry of dayEntries) {
      if (entry.type === 'income') income += entry.amount;
      else expense += entry.amount;
    }

    income = roundMoney(income);
    expense = roundMoney(expense);

    return {
      key,
      day: date.getDate(),
      inMonth: key >= monthRange.start && key <= monthRange.end,
      isToday: key === today,
      income,
      expense,
      profit: roundMoney(income - expense),
      entryCount: dayEntries.length,
    };
  });

  return {
    monthKey: monthRange.start.slice(0, 7),
    start: monthRange.start,
    end: monthRange.end,
    gridStart: gridRange.start,
    gridEnd: gridRange.end,
    days,
    summary: getFinanceSummary(entries, monthRange),
  };
}

export interface FinanceDayBucket {
  /** 'YYYY-MM-DD' of the first day of the bucket. */
  key: string;
  /** 'YYYY-MM-DD' of the last day of the bucket. */
  end: string;
  income: number;
  expense: number;
  profit: number;
}

function emptyBucket(key: string, end: string): FinanceDayBucket {
  return { key, end, income: 0, expense: 0, profit: 0 };
}

function addToBucket(bucket: FinanceDayBucket, entry: FinanceEntry): void {
  if (entry.type === 'income') bucket.income += entry.amount;
  else bucket.expense += entry.amount;
}

function finishBucket(bucket: FinanceDayBucket): FinanceDayBucket {
  return {
    ...bucket,
    income: roundMoney(bucket.income),
    expense: roundMoney(bucket.expense),
    profit: roundMoney(bucket.income - bucket.expense),
  };
}

/**
 * Revenue / expense / profit per day or per week. Weeks are used for long
 * periods so the chart stays readable; a bucket is seven days from the start
 * of the selected range (not calendar weeks).
 */
export function buildFinanceSeries(
  entries: FinanceEntry[],
  range: FinanceRange,
  granularity: 'day' | 'week' = 'day',
): FinanceDayBucket[] {
  if (range.end < range.start) return [];

  const days = eachDayOfInterval({ start: parseISO(range.start), end: parseISO(range.end) });
  const inRange = filterEntriesByRange(entries, range);
  const byDate = new Map<string, FinanceEntry[]>();
  for (const entry of inRange) {
    const list = byDate.get(entry.date);
    if (list) list.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  if (granularity === 'day') {
    return days.map(day => {
      const key = toDateKey(day);
      const bucket = emptyBucket(key, key);
      for (const entry of byDate.get(key) ?? []) addToBucket(bucket, entry);
      return finishBucket(bucket);
    });
  }

  const buckets: FinanceDayBucket[] = [];
  days.forEach((day, index) => {
    const key = toDateKey(day);
    if (index % 7 === 0) {
      const endDay = days[Math.min(index + 6, days.length - 1)];
      buckets.push(emptyBucket(key, toDateKey(endDay)));
    }
    const bucket = buckets[buckets.length - 1];
    for (const entry of byDate.get(key) ?? []) addToBucket(bucket, entry);
  });

  return buckets.map(finishBucket);
}

/** Long ranges switch to weekly buckets automatically. */
export function pickGranularity(range: FinanceRange): 'day' | 'week' {
  return daysInRange(range) > 62 ? 'week' : 'day';
}

export interface ExpenseSlice {
  /** Stable key used for the pie cells: category or `other:<label>`. */
  key: string;
  category: ExpenseCategory;
  /** Custom category name (only for `category === 'other'`). */
  label?: string;
  amount: number;
  /** Share of the total expenses, 0-100. */
  percent: number;
}

/** Expense totals per category, biggest first. */
export function getExpenseBreakdown(entries: FinanceEntry[], range: FinanceRange): ExpenseSlice[] {
  const inRange = filterEntriesByRange(entries, range).filter(entry => entry.type === 'expense');
  const totals = new Map<string, { category: ExpenseCategory; label?: string; amount: number }>();

  for (const entry of inRange) {
    const category = entry.category ?? 'other';
    const label = category === 'other' ? entry.categoryLabel?.trim() : undefined;
    const key = label ? `other:${label.toLowerCase()}` : category;
    const current = totals.get(key);
    if (current) current.amount += entry.amount;
    else totals.set(key, { category, label, amount: entry.amount });
  }

  const total = [...totals.values()].reduce((sum, item) => sum + item.amount, 0);

  return [...totals.entries()]
    .map(([key, item]) => ({
      key,
      category: item.category,
      label: item.label,
      amount: roundMoney(item.amount),
      percent: total > 0 ? Math.round((item.amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** Dates (newest first) that have at least one entry inside the range. */
export function groupEntriesByDate(entries: FinanceEntry[], range?: FinanceRange): Array<{ date: string; entries: FinanceEntry[] }> {
  const scoped = range ? filterEntriesByRange(entries, range) : entries;
  const groups = new Map<string, FinanceEntry[]>();

  for (const entry of sortFinanceEntries(scoped)) {
    const list = groups.get(entry.date);
    if (list) list.push(entry);
    else groups.set(entry.date, [entry]);
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, list]) => ({ date, entries: list }));
}

/** True when the day already has a revenue entry (used by the evening reminder). */
export function hasIncomeEntry(entries: FinanceEntry[], date: string): boolean {
  return entries.some(entry => entry.type === 'income' && entry.date === date);
}

export interface FinanceDateRangeValidation {
  ok: boolean;
  /** The normalised range when ok. */
  range?: FinanceRange;
}

/** Validates a custom range typed by the user ('YYYY-MM-DD' both sides). */
export function normaliseCustomRange(start: string, end: string): FinanceDateRangeValidation {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { ok: false };
  if (end < start) return { ok: false };
  return { ok: true, range: { start, end } };
}

/** Days covered by the reminder window, ending today + `days`. */
export function upcomingReminderDays(now: Date, days: number): string[] {
  const result: string[] = [];
  for (let offset = 0; offset <= days; offset += 1) {
    result.push(toDateKey(addDays(now, offset)));
  }
  return result;
}
