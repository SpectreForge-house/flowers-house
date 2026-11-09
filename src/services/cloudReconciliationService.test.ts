import { describe, expect, it } from 'vitest';
import { buildReconciliationItem } from './cloudReconciliationService';

describe('buildReconciliationItem', () => {
  it('reports ids that are only local or only cloud', () => {
    const item = buildReconciliationItem('customers', ['a', 'b', 'c'], ['b', 'c', 'd']);

    expect(item).toMatchObject({
      key: 'customers',
      localCount: 3,
      cloudCount: 3,
      missingInCloud: 1,
      extraInCloud: 1,
      missingSample: ['a'],
      extraSample: ['d'],
    });
  });

  it('deduplicates ids before comparing', () => {
    const item = buildReconciliationItem('orders', ['a', 'a', 'b'], ['b', 'b']);

    expect(item).toMatchObject({
      localCount: 2,
      cloudCount: 1,
      missingInCloud: 1,
      extraInCloud: 0,
      missingSample: ['a'],
    });
  });

  it('returns a clean item when both sides match', () => {
    const item = buildReconciliationItem('photos', ['client:1/a.jpg'], ['client:1/a.jpg']);

    expect(item.missingInCloud).toBe(0);
    expect(item.extraInCloud).toBe(0);
    expect(item.missingSample).toEqual([]);
    expect(item.extraSample).toEqual([]);
  });
});
