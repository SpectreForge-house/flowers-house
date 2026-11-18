import { beforeEach, describe, expect, it } from 'vitest';
import { HistoryRecord } from '../types';
import {
  getHistoryClearRange,
  isInHistoryClearRange,
} from './historyService';
import { LocalHistoryAdapter } from './localHistoryStorage';
import { saveHistory } from './storage';

function record(id: string, timestamp: string): HistoryRecord {
  return {
    id,
    timestamp,
    actionType: 'order_created',
    entityType: 'order',
    entityId: id,
    description: id,
  };
}

// Wednesday, 18 November 2026, 15:00 local time.
const NOW = new Date(2026, 10, 18, 15, 0, 0);

describe('history clear range', () => {
  it('"yesterday" covers the whole previous day only', () => {
    const range = getHistoryClearRange('yesterday', NOW);

    expect(range.since).toBe(new Date(2026, 10, 17, 0, 0, 0).toISOString());
    expect(range.until).toBe(new Date(2026, 10, 18, 0, 0, 0).toISOString());

    expect(isInHistoryClearRange(new Date(2026, 10, 17, 9, 30).toISOString(), range)).toBe(true);
    expect(isInHistoryClearRange(new Date(2026, 10, 17, 23, 59).toISOString(), range)).toBe(true);
    expect(isInHistoryClearRange(new Date(2026, 10, 18, 0, 1).toISOString(), range)).toBe(false);
    expect(isInHistoryClearRange(new Date(2026, 10, 16, 23, 59).toISOString(), range)).toBe(false);
  });

  it('"all" has no bounds', () => {
    expect(getHistoryClearRange('all', NOW)).toEqual({});
  });

  it('"7days" starts a week back and keeps the records before it', () => {
    const range = getHistoryClearRange('7days', NOW);

    expect(range.until).toBeUndefined();
    expect(isInHistoryClearRange(new Date(2026, 10, 11, 0, 0).toISOString(), range)).toBe(true);
    expect(isInHistoryClearRange(new Date(2026, 10, 10, 23, 59).toISOString(), range)).toBe(false);
  });
});

describe('LocalHistoryAdapter.deleteHistoryByFilter', () => {
  const adapter = new LocalHistoryAdapter();

  beforeEach(() => {
    saveHistory([
      record('old', new Date(2026, 10, 10, 12, 0).toISOString()),
      record('yesterday', new Date(2026, 10, 17, 12, 0).toISOString()),
      record('today', new Date(2026, 10, 18, 9, 0).toISOString()),
    ]);
  });

  it('deletes exactly the range that the confirmation counted', async () => {
    const range = getHistoryClearRange('yesterday', NOW);
    const deleted = await adapter.deleteHistoryByFilter(range);

    expect(deleted).toBe(1);
    expect((await adapter.getHistory()).map(r => r.id).sort()).toEqual(['old', 'today']);
  });

  it('deletes everything without a range', async () => {
    expect(await adapter.deleteHistoryByFilter({})).toBe(3);
    expect(await adapter.getHistory()).toEqual([]);
  });

  it('still supports the olderThan filter', async () => {
    const deleted = await adapter.deleteHistoryByFilter({
      olderThan: new Date(2026, 10, 15, 0, 0).toISOString(),
    });

    expect(deleted).toBe(1);
    expect((await adapter.getHistory()).map(r => r.id).sort()).toEqual(['today', 'yesterday']);
  });
});
