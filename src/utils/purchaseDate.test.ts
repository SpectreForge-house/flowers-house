import { describe, expect, it } from 'vitest';
import { replaceLocalDate, toDateInputValue } from './purchaseDate';

describe('purchase date helpers', () => {
  it('keeps a plain date untouched', () => {
    expect(toDateInputValue('2026-10-01')).toBe('2026-10-01');
  });

  it('uses the local calendar date of a timestamp', () => {
    const timestamp = '2026-10-01T22:30:00.000Z';
    const local = new Date(timestamp);

    expect(toDateInputValue(timestamp)).toBe(
      `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`,
    );
  });

  it('replaces the date but keeps the local time of day', () => {
    const original = '2026-11-04T10:23:45.123Z';
    const before = new Date(original);
    const result = new Date(replaceLocalDate(original, '2026-10-01'));

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(9);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(before.getHours());
    expect(result.getMinutes()).toBe(before.getMinutes());
    expect(result.getSeconds()).toBe(before.getSeconds());
    expect(result.getMilliseconds()).toBe(before.getMilliseconds());
  });
});
