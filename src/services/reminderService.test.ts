import { describe, expect, it } from 'vitest';
import { generateReminders, getReminderDismissKey } from './reminderService';
import { InventoryItem } from '../types';

function inventoryItem(quantity: number): InventoryItem {
  return {
    id: 'inv-rose',
    name: 'Red Rose',
    category: 'flowers',
    quantity,
    minStock: 10,
    purchasePrice: 1,
    sellingPrice: 2,
    unit: 'stems',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('reminder dismissal', () => {
  it('filters out a dismissed low-stock reminder', () => {
    const reminders = generateReminders([inventoryItem(5)], [], [], [], [], []);
    expect(reminders).toHaveLength(1);

    const dismissedKey = getReminderDismissKey(reminders[0]);
    expect(generateReminders([inventoryItem(5)], [], [], [], [], [dismissedKey])).toHaveLength(0);
  });

  it('shows the reminder again when the stock level changes', () => {
    const reminders = generateReminders([inventoryItem(5)], [], [], [], [], []);
    const dismissedKey = getReminderDismissKey(reminders[0]);

    expect(generateReminders([inventoryItem(4)], [], [], [], [], [dismissedKey])).toHaveLength(1);
  });
});
