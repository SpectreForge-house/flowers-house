import { describe, expect, it } from 'vitest';
import { isDuplicate, migrateCollection } from './cloudSyncService';

interface Item {
  id: string;
}

describe('migrateCollection', () => {
  it('continues after an item fails and reports the failure', async () => {
    const errors: string[] = [];
    const result = await migrateCollection<Item>({
      errors,
      label: 'customer',
      local: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      loadCloud: async () => [{ id: 'b' }],
      getId: item => item.id,
      add: async item => {
        if (item.id === 'c') throw new Error('insert failed');
      },
    });

    expect(result).toEqual({ added: 1, skipped: 1, failed: 1 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('customer c');
    expect(errors[0]).toContain('insert failed');
  });

  it('treats duplicate rows as skipped, not failed', async () => {
    const errors: string[] = [];
    const result = await migrateCollection<Item>({
      errors,
      label: 'order',
      local: [{ id: 'a' }],
      loadCloud: async () => [],
      getId: item => item.id,
      add: async () => {
        throw new Error('duplicate key value violates unique constraint (23505)');
      },
    });

    expect(result).toEqual({ added: 0, skipped: 1, failed: 0 });
    expect(errors).toHaveLength(0);
  });

  it('marks every local item as failed when the cloud lookup fails', async () => {
    const errors: string[] = [];
    const result = await migrateCollection<Item>({
      errors,
      label: 'purchase',
      local: [{ id: 'a' }, { id: 'b' }],
      loadCloud: async () => {
        throw { message: 'relation does not exist' };
      },
      getId: item => item.id,
      add: async () => {},
    });

    expect(result).toEqual({ added: 0, skipped: 0, failed: 2 });
    expect(errors[0]).toContain('purchase lookup');
  });
});

describe('isDuplicate', () => {
  it('recognises PostgreSQL duplicate key errors', () => {
    expect(isDuplicate(new Error('duplicate key value violates unique constraint'))).toBe(true);
    expect(isDuplicate(new Error('new row violates check constraint (23505)'))).toBe(true);
    expect(isDuplicate(new Error('network error'))).toBe(false);
  });
});
