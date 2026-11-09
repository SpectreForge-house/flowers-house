import { describe, expect, it } from 'vitest';
import { FinanceEntry } from '../types';
import {
  DEFAULT_FINANCE_REMINDER_HOUR,
  FINANCE_REMINDER_DAYS,
  FinanceReminderMessages,
  buildFinanceReminders,
  getFinanceReminderSettings,
  setFinanceReminderSettings,
} from './financeReminders';

const messages: FinanceReminderMessages = {
  title: 'Не забудьте внести выручку',
  body: 'Внесите выручку и расходы за сегодня.',
  testBody: 'Это тестовое уведомление.',
};

function entry(type: 'income' | 'expense', date: string): FinanceEntry {
  return {
    id: `${type}-${date}`,
    type,
    date,
    amount: 100,
    category: type === 'expense' ? 'purchase' : undefined,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
  };
}

const now = new Date(2026, 2, 2, 10, 0, 0); // Mon 2 Mar 2026, 10:00 local

describe('finance reminders', () => {
  it('is enabled by default at 20:00', () => {
    expect(getFinanceReminderSettings()).toEqual({
      enabled: true,
      hour: DEFAULT_FINANCE_REMINDER_HOUR,
    });
  });

  it('clamps the hour to a valid value', () => {
    expect(setFinanceReminderSettings({ hour: -5 }).hour).toBe(0);
    expect(setFinanceReminderSettings({ hour: 99 }).hour).toBe(23);
  });

  it('schedules an evening reminder for the next two weeks', () => {
    const items = buildFinanceReminders([], { enabled: true, hour: 20 }, messages, now);

    expect(items).toHaveLength(FINANCE_REMINDER_DAYS);
    expect(items[0].at).toEqual(new Date(2026, 2, 2, 20, 0, 0));
    expect(items[items.length - 1].at).toEqual(new Date(2026, 2, 15, 20, 0, 0));
    expect(items[0].title).toBe(messages.title);
    expect(items[0].body).toBe(messages.body);
  });

  it('skips days that already have a revenue entry', () => {
    const entries = [
      entry('income', '2026-03-02'),
      entry('income', '2026-03-05'),
      // An expense alone must not suppress the reminder.
      entry('expense', '2026-03-03'),
    ];

    const items = buildFinanceReminders(entries, { enabled: true, hour: 20 }, messages, now);
    const days = items.map((item) => item.at.getDate());

    expect(items).toHaveLength(FINANCE_REMINDER_DAYS - 2);
    expect(days).not.toContain(2);
    expect(days).not.toContain(5);
    expect(days).toContain(3);
  });

  it('skips today when the reminder hour has already passed', () => {
    const items = buildFinanceReminders(
      [],
      { enabled: true, hour: 9 },
      messages,
      new Date(2026, 2, 2, 10, 0, 0),
    );

    expect(items).toHaveLength(FINANCE_REMINDER_DAYS - 1);
    expect(items[0].at).toEqual(new Date(2026, 2, 3, 9, 0, 0));
  });

  it('schedules nothing when reminders are disabled', () => {
    expect(buildFinanceReminders([], { enabled: false, hour: 20 }, messages, now)).toEqual([]);
  });
});
