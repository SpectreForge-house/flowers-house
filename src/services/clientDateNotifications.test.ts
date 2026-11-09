import { describe, expect, it } from 'vitest';
import { Customer, ImportantDate } from '../types';
import {
  DEFAULT_DAYS_BEFORE,
  MAX_DAYS_BEFORE,
  MIN_DAYS_BEFORE,
  buildClientDateNotifications,
  getClientDateNotificationSettings,
  setClientDateNotificationSettings,
  ClientDateNotificationMessages,
} from './clientDateNotifications';

const messages: ClientDateNotificationMessages = {
  typeLabel: (type) => (type === 'birthday' ? 'День рождения' : 'Дата'),
  formatDate: (date) => `${date.getDate()}.${date.getMonth() + 1}`,
  today: 'Сегодня',
  tomorrow: 'Завтра',
  inDays: (days) => `Через ${days} дн.`,
  dayHint: 'Не забудьте поздравить!',
};

function makeCustomer(name: string, dates: ImportantDate[]): Customer {
  return {
    id: `c-${name}`,
    name,
    phone: '',
    address: '',
    importantDates: dates,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function iso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfDayWithOffset(offsetDays: number, hour = 0, minute = 5): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, hour, minute, 0, 0);
}

describe('buildClientDateNotifications', () => {
  it('schedules a reminder N days before and one on the day itself', () => {
    const event = startOfDayWithOffset(10);
    const customer = makeCustomer('Анна', [
      { id: 'd1', type: 'birthday', date: iso(event) },
    ]);

    const items = buildClientDateNotifications([customer], 5, messages, startOfDayWithOffset(0));

    expect(items).toHaveLength(2);
    expect(items[0].at).toEqual(new Date(event.getFullYear(), event.getMonth(), event.getDate() - 5, 9));
    expect(items[1].at).toEqual(new Date(event.getFullYear(), event.getMonth(), event.getDate(), 9));
    expect(items[0].title).toBe('День рождения — Анна');
    expect(items[0].body).toContain('Через 5 дн.');
    expect(items[1].body).toContain('Сегодня');
    expect(items[1].body).toContain('Не забудьте поздравить!');
  });

  it('skips moments that are already in the past', () => {
    const today = startOfDayWithOffset(0);
    const customer = makeCustomer('Иван', [
      { id: 'd1', type: 'birthday', date: iso(today) },
    ]);

    const items = buildClientDateNotifications(
      [customer],
      5,
      messages,
      startOfDayWithOffset(0, 10, 0),
    );

    expect(items).toHaveLength(0);
  });

  it('uses "tomorrow" for a one-day heads-up and keeps the custom label', () => {
    const event = startOfDayWithOffset(3);
    const customer = makeCustomer('Мария', [
      { id: 'd1', type: 'name_day', date: iso(event), label: 'Мамин день' },
    ]);

    const items = buildClientDateNotifications(
      [customer],
      1,
      messages,
      startOfDayWithOffset(0),
    );

    const reminder = items.find((item) => item.at.getDate() === new Date(event).getDate() - 1);
    expect(reminder?.body).toContain('Завтра');
    expect(reminder?.body).toContain('Мамин день');
  });

  it('sorts by date and respects the maximum count', () => {
    const customers = Array.from({ length: 5 }, (_, index) =>
      makeCustomer(`Клиент ${index}`, [
        { id: `d${index}`, type: 'birthday', date: iso(startOfDayWithOffset(10 + index)) },
      ]),
    );

    const items = buildClientDateNotifications(
      customers,
      5,
      messages,
      startOfDayWithOffset(0),
      3,
    );

    expect(items).toHaveLength(3);
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i - 1].at.getTime()).toBeLessThanOrEqual(items[i].at.getTime());
    }
  });

  it('ignores malformed dates', () => {
    const customer = makeCustomer('Без даты', [
      { id: 'd1', type: 'other', date: 'not-a-date' },
    ]);

    expect(buildClientDateNotifications([customer], 5, messages)).toEqual([]);
  });
});

describe('client date notification settings', () => {
  it('is enabled by default with a five-day heads-up', () => {
    expect(getClientDateNotificationSettings()).toEqual({
      enabled: true,
      daysBefore: DEFAULT_DAYS_BEFORE,
    });
  });

  it('clamps the number of days to the supported range', () => {
    expect(setClientDateNotificationSettings({ daysBefore: 0 }).daysBefore).toBe(MIN_DAYS_BEFORE);
    expect(setClientDateNotificationSettings({ daysBefore: 999 }).daysBefore).toBe(MAX_DAYS_BEFORE);
  });

  it('remembers the choice', () => {
    setClientDateNotificationSettings({ enabled: false, daysBefore: 4 });
    expect(getClientDateNotificationSettings()).toEqual({ enabled: false, daysBefore: 4 });
  });
});
