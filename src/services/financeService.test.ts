import { describe, expect, it } from 'vitest';
import { FinanceEntry } from '../types';
import {
  addCustomCategory,
  buildFinanceMonthGrid,
  buildFinanceSeries,
  createFinanceEntry,
  daysInRange,
  financeCategoryKey,
  getAllTimeRange,
  getCustomCategories,
  getExpenseBreakdown,
  getFinanceSummary,
  getMonthRange,
  getPresetRange,
  getYearRange,
  groupEntriesByDate,
  hasIncomeEntry,
  matchesFinanceCategories,
  normaliseCustomRange,
  pickGranularity,
  updateFinanceEntryValues,
} from './financeService';

function entry(partial: Partial<FinanceEntry> & Pick<FinanceEntry, 'type' | 'date' | 'amount'>): FinanceEntry {
  return {
    id: `${partial.type}-${partial.date}-${Math.random()}`,
    createdAt: `${partial.date}T10:00:00.000Z`,
    updatedAt: `${partial.date}T10:00:00.000Z`,
    ...partial,
  };
}

describe('finance summary', () => {
  const entries = [
    entry({ type: 'income', date: '2026-03-02', amount: 100 }),
    entry({ type: 'income', date: '2026-03-03', amount: 50.5 }),
    entry({ type: 'expense', date: '2026-03-03', amount: 30, category: 'purchase' }),
    entry({ type: 'expense', date: '2026-03-04', amount: 10.25, category: 'rent' }),
    // Outside the range - must be ignored.
    entry({ type: 'income', date: '2026-02-28', amount: 999 }),
  ];

  it('adds income and expenses inside the range only', () => {
    const summary = getFinanceSummary(entries, { start: '2026-03-02', end: '2026-03-04' });

    expect(summary.income).toBe(150.5);
    expect(summary.expense).toBe(40.25);
    expect(summary.profit).toBe(110.25);
    expect(summary.entryCount).toBe(4);
    expect(summary.days).toBe(3);
  });

  it('averages the gross revenue over the days of the period', () => {
    const summary = getFinanceSummary(entries, { start: '2026-03-02', end: '2026-03-04' });
    expect(summary.avgDailyIncome).toBe(50.17);
  });

  it('keeps a negative profit when expenses are higher than income', () => {
    const summary = getFinanceSummary(
      [
        entry({ type: 'income', date: '2026-03-02', amount: 2000 }),
        entry({ type: 'expense', date: '2026-03-02', amount: 2400, category: 'purchase' }),
      ],
      { start: '2026-03-02', end: '2026-03-02' },
    );

    expect(summary.income).toBe(2000);
    expect(summary.expense).toBe(2400);
    expect(summary.profit).toBe(-400);
  });

  it('returns zeros for an empty range', () => {
    const summary = getFinanceSummary([], { start: '2026-03-02', end: '2026-03-04' });
    expect(summary).toEqual({
      income: 0,
      expense: 0,
      profit: 0,
      avgDailyIncome: 0,
      days: 3,
      entryCount: 0,
    });
  });

  it('counts days inclusively and rejects inverted ranges', () => {
    expect(daysInRange({ start: '2026-03-01', end: '2026-03-01' })).toBe(1);
    expect(daysInRange({ start: '2026-03-01', end: '2026-03-31' })).toBe(31);
    expect(daysInRange({ start: '2026-03-31', end: '2026-03-01' })).toBe(0);
  });
});

describe('finance periods', () => {
  const now = new Date(2026, 2, 18, 15, 0, 0); // Wed 18 Mar 2026

  it('starts the current week on Monday and ends today', () => {
    expect(getPresetRange('week', now)).toEqual({ start: '2026-03-16', end: '2026-03-18' });
  });

  it('uses the first day of the current month', () => {
    expect(getPresetRange('month', now)).toEqual({ start: '2026-03-01', end: '2026-03-18' });
  });

  it('covers the whole previous month', () => {
    expect(getPresetRange('lastMonth', now)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('validates custom ranges', () => {
    expect(normaliseCustomRange('2026-03-01', '2026-03-10')).toEqual({
      ok: true,
      range: { start: '2026-03-01', end: '2026-03-10' },
    });
    expect(normaliseCustomRange('2026-03-10', '2026-03-01').ok).toBe(false);
    expect(normaliseCustomRange('', '2026-03-01').ok).toBe(false);
  });

  it('switches long ranges to weekly buckets', () => {
    expect(pickGranularity({ start: '2026-03-01', end: '2026-03-31' })).toBe('day');
    expect(pickGranularity({ start: '2026-01-01', end: '2026-03-31' })).toBe('week');
  });

  it('builds the current year and all-time ranges', () => {
    expect(getYearRange(now)).toEqual({ start: '2026-01-01', end: '2026-03-18' });

    expect(
      getAllTimeRange(
        [
          entry({ type: 'income', date: '2024-05-10', amount: 10 }),
          entry({ type: 'expense', date: '2026-03-10', amount: 5, category: 'rent' }),
        ],
        now,
      ),
    ).toEqual({ start: '2024-05-10', end: '2026-03-18' });

    expect(getAllTimeRange([], now)).toEqual({ start: '2026-03-18', end: '2026-03-18' });
  });
});

describe('finance category filters', () => {
  it('collapses income into one bucket and keys custom expenses by label', () => {
    expect(financeCategoryKey(entry({ type: 'income', date: '2026-03-02', amount: 1 }))).toBe(
      'income',
    );
    expect(
      financeCategoryKey(
        entry({ type: 'expense', date: '2026-03-02', amount: 1, category: 'rent' }),
      ),
    ).toBe('expense:rent');
    expect(
      financeCategoryKey(
        entry({
          type: 'expense',
          date: '2026-03-02',
          amount: 1,
          category: 'other',
          categoryLabel: 'Marketing',
        }),
      ),
    ).toBe('expense:other:marketing');
    expect(
      financeCategoryKey(
        entry({ type: 'expense', date: '2026-03-02', amount: 1, category: 'other' }),
      ),
    ).toBe('expense:other');
  });

  it('matches the selected keys, treating an empty list as "all"', () => {
    const income = entry({ type: 'income', date: '2026-03-02', amount: 100 });
    const rent = entry({ type: 'expense', date: '2026-03-02', amount: 10, category: 'rent' });

    expect(matchesFinanceCategories(income, [])).toBe(true);
    expect(matchesFinanceCategories(income, ['income'])).toBe(true);
    expect(matchesFinanceCategories(rent, ['income'])).toBe(false);
    expect(matchesFinanceCategories(rent, ['expense'])).toBe(true);
    expect(matchesFinanceCategories(income, ['expense'])).toBe(false);
    expect(matchesFinanceCategories(rent, ['expense:rent', 'income'])).toBe(true);
  });
});

describe('finance series', () => {
  const entries = [
    entry({ type: 'income', date: '2026-03-02', amount: 100 }),
    entry({ type: 'expense', date: '2026-03-02', amount: 40, category: 'purchase' }),
    entry({ type: 'income', date: '2026-03-09', amount: 70 }),
  ];

  it('builds one bucket per day, including empty days', () => {
    const series = buildFinanceSeries(entries, { start: '2026-03-02', end: '2026-03-04' });

    expect(series).toHaveLength(3);
    expect(series[0]).toEqual({
      key: '2026-03-02',
      end: '2026-03-02',
      income: 100,
      expense: 40,
      profit: 60,
    });
    expect(series[1].income).toBe(0);
    expect(series[2].profit).toBe(0);
  });

  it('groups into seven-day buckets for weekly granularity', () => {
    const series = buildFinanceSeries(entries, { start: '2026-03-02', end: '2026-03-15' }, 'week');

    expect(series).toHaveLength(2);
    expect(series[0].key).toBe('2026-03-02');
    expect(series[0].end).toBe('2026-03-08');
    expect(series[0].income).toBe(100);
    expect(series[1].key).toBe('2026-03-09');
    expect(series[1].income).toBe(70);
  });
});

describe('expense breakdown', () => {
  const entries = [
    entry({ type: 'expense', date: '2026-03-02', amount: 50, category: 'purchase' }),
    entry({ type: 'expense', date: '2026-03-03', amount: 30, category: 'purchase' }),
    entry({ type: 'expense', date: '2026-03-03', amount: 20, category: 'rent' }),
    entry({ type: 'expense', date: '2026-03-04', amount: 10, category: 'other', categoryLabel: 'Marketing' }),
    entry({ type: 'income', date: '2026-03-04', amount: 500 }),
  ];

  it('groups by category and sorts by amount', () => {
    const slices = getExpenseBreakdown(entries, { start: '2026-03-01', end: '2026-03-31' });

    expect(slices.map(slice => slice.amount)).toEqual([80, 20, 10]);
    expect(slices[0]).toMatchObject({ category: 'purchase', percent: 72.7 });
    expect(slices[1]).toMatchObject({ category: 'rent', percent: 18.2 });
  });

  it('keeps self-added categories as separate slices', () => {
    const slices = getExpenseBreakdown(entries, { start: '2026-03-01', end: '2026-03-31' });
    const marketing = slices.find(slice => slice.label === 'Marketing');

    expect(marketing).toMatchObject({ category: 'other', amount: 10, percent: 9.1 });
    expect(marketing?.key).toBe('other:marketing');
  });
});

describe('finance month calendar', () => {
  it('covers November 2026 with full Monday-first weeks', () => {
    const grid = buildFinanceMonthGrid([], new Date(2026, 10, 15), new Date(2026, 10, 4));

    expect(grid.monthKey).toBe('2026-11');
    expect(grid.start).toBe('2026-11-01');
    expect(grid.end).toBe('2026-11-30');
    expect(grid.gridStart).toBe('2026-10-26');
    expect(grid.gridEnd).toBe('2026-12-06');
    expect(grid.days).toHaveLength(42);
    expect(grid.days[0]).toMatchObject({ key: '2026-10-26', inMonth: false });
    expect(grid.days[6]).toMatchObject({ key: '2026-11-01', inMonth: true });
    expect(grid.days[41]).toMatchObject({ key: '2026-12-06', inMonth: false });
  });

  it('returns the first and last day of the month', () => {
    expect(getMonthRange(new Date(2028, 1, 10))).toEqual({
      start: '2028-02-01',
      end: '2028-02-29',
    });
  });

  it('totals entries per day and for the whole month', () => {
    const entries = [
      entry({ type: 'income', date: '2026-11-01', amount: 100 }),
      entry({ type: 'expense', date: '2026-11-01', amount: 30, category: 'purchase' }),
      entry({ type: 'income', date: '2026-11-02', amount: 50.5 }),
      entry({ type: 'income', date: '2026-10-31', amount: 999 }),
      entry({ type: 'income', date: '2026-12-01', amount: 888 }),
    ];

    const grid = buildFinanceMonthGrid(entries, new Date(2026, 10, 15));
    const first = grid.days.find(day => day.key === '2026-11-01');
    const second = grid.days.find(day => day.key === '2026-11-02');
    const leading = grid.days.find(day => day.key === '2026-10-31');
    const trailing = grid.days.find(day => day.key === '2026-12-01');

    expect(first).toMatchObject({ income: 100, expense: 30, profit: 70, entryCount: 2 });
    expect(second).toMatchObject({ income: 50.5, expense: 0, profit: 50.5, entryCount: 1 });
    expect(leading).toMatchObject({ inMonth: false, income: 999 });
    expect(trailing).toMatchObject({ inMonth: false, income: 888 });
    expect(grid.summary).toMatchObject({
      income: 150.5,
      expense: 30,
      profit: 120.5,
      days: 30,
      entryCount: 3,
    });
  });

  it('marks a day whose expenses beat the income as a negative profit', () => {
    const entries = [
      entry({ type: 'income', date: '2026-11-05', amount: 2000 }),
      entry({ type: 'expense', date: '2026-11-05', amount: 2400, category: 'purchase' }),
    ];

    const grid = buildFinanceMonthGrid(entries, new Date(2026, 10, 15));
    const day = grid.days.find(cell => cell.key === '2026-11-05');

    expect(day).toMatchObject({ income: 2000, expense: 2400, profit: -400 });
    expect(grid.summary).toMatchObject({ income: 2000, expense: 2400, profit: -400 });
  });

  it('marks today', () => {
    const grid = buildFinanceMonthGrid([], new Date(2026, 10, 15), new Date(2026, 10, 4));
    expect(grid.days.filter(day => day.isToday).map(day => day.key)).toEqual(['2026-11-04']);
  });
});

describe('finance entries', () => {
  it('trims the note, rounds the amount and drops the category for income', () => {
    const created = createFinanceEntry(
      { type: 'income', date: '2026-03-02', amount: 10.129, category: 'rent', note: '  cash  ' },
      new Date('2026-03-02T18:00:00.000Z'),
    );

    expect(created.amount).toBe(10.13);
    expect(created.category).toBeUndefined();
    expect(created.note).toBe('cash');
    expect(created.createdAt).toBe('2026-03-02T18:00:00.000Z');
  });

  it('keeps the id and creation time on edit', () => {
    const created = createFinanceEntry(
      { type: 'expense', date: '2026-03-02', amount: 10, category: 'other', categoryLabel: ' Decor ' },
      new Date('2026-03-02T10:00:00.000Z'),
    );
    const updated = updateFinanceEntryValues(
      created,
      { type: 'expense', date: '2026-03-03', amount: 12.5, category: 'other', categoryLabel: 'Decor' },
      new Date('2026-03-03T09:00:00.000Z'),
    );

    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe('2026-03-03T09:00:00.000Z');
    expect(updated.date).toBe('2026-03-03');
    expect(updated.amount).toBe(12.5);
    expect(updated.categoryLabel).toBe('Decor');
  });

  it('groups entries by date, newest first', () => {
    const entries = [
      entry({ type: 'income', date: '2026-03-02', amount: 100 }),
      entry({ type: 'expense', date: '2026-03-03', amount: 10, category: 'rent' }),
      entry({ type: 'income', date: '2026-03-03', amount: 200 }),
    ];
    const groups = groupEntriesByDate(entries);

    expect(groups.map(group => group.date)).toEqual(['2026-03-03', '2026-03-02']);
    expect(groups[0].entries).toHaveLength(2);
  });

  it('detects a revenue entry for the reminder', () => {
    const entries = [entry({ type: 'income', date: '2026-03-02', amount: 100 })];
    expect(hasIncomeEntry(entries, '2026-03-02')).toBe(true);
    expect(hasIncomeEntry(entries, '2026-03-03')).toBe(false);
  });

  it('remembers self-added expense categories without duplicates', () => {
    expect(getCustomCategories()).toEqual([]);
    addCustomCategory(' Marketing ');
    addCustomCategory('marketing');
    addCustomCategory('Decor');

    expect(getCustomCategories()).toEqual(['Marketing', 'Decor']);
  });
});
