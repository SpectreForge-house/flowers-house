import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  list: vi.fn(),
  tableErrors: new Map<string, string>(),
  columnErrors: new Map<string, string>(),
  rpcErrors: new Map<string, { message: string; code?: string }>(),
  bucketError: null as { message: string; code?: string } | null,
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    storage: {
      from: () => ({ list: mocks.list }),
    },
  },
}));

vi.mock('./authService', () => ({
  getAuthState: () => ({ user: { id: 'user-1' } }),
  isSupabaseAvailable: () => true,
  profileReady: Promise.resolve(),
}));

vi.mock('./shopContext', () => ({
  getShopId: async () => 'shop-1',
}));

import { checkCloudHealth } from './cloudHealthService';

beforeEach(() => {
  mocks.tableErrors.clear();
  mocks.columnErrors.clear();
  mocks.rpcErrors.clear();
  mocks.bucketError = null;
  mocks.rpc.mockImplementation(async (fn: string) => ({
    data: fn === 'current_shop_id' ? 'shop-1' : 'owner',
    error: mocks.rpcErrors.get(fn) ?? null,
  }));
  mocks.from.mockImplementation((table: string) => ({
    select: (column: string) => {
      const tableError = mocks.tableErrors.has(table)
        ? { message: mocks.tableErrors.get(table)! }
        : null;
      const columnKey = `${table}.${column}`;
      return {
        error: tableError,
        limit: () => ({
          error: tableError ?? (mocks.columnErrors.has(columnKey)
            ? { message: mocks.columnErrors.get(columnKey)! }
            : null),
        }),
      };
    },
  }));
  mocks.list.mockImplementation(async () => ({ error: mocks.bucketError }));
});

describe('checkCloudHealth', () => {
  it('reports every check as healthy', async () => {
    const report = await checkCloudHealth();

    expect(report.ok).toBe(true);
    expect(report.checks).toHaveLength(8);
    expect(report.checks.every(check => check.ok)).toBe(true);
  });

  it('reports missing parity tables and columns', async () => {
    mocks.tableErrors.set('client_purchases', 'relation does not exist');
    mocks.columnErrors.set('customers.important_dates', 'column does not exist');

    const report = await checkCloudHealth();
    const parity = report.checks.find(check => check.id === 'parityTables');
    const dates = report.checks.find(check => check.id === 'customerDates');

    expect(report.ok).toBe(false);
    expect(parity?.ok).toBe(false);
    expect(parity?.missing).toContain('client_purchases');
    expect(dates?.ok).toBe(false);
    expect(dates?.missing).toContain('customers.important_dates');
    expect(dates?.migration).toBe('006');
  });

  it('reports a missing photo bucket', async () => {
    mocks.bucketError = { message: 'Bucket not found', code: '404' };

    const report = await checkCloudHealth();
    const bucket = report.checks.find(check => check.id === 'photoBucket');

    expect(bucket?.ok).toBe(false);
    expect(bucket?.missing).toContain('shop-photos');
    expect(bucket?.migration).toBe('006');
  });

  it('reports missing RLS helpers from migration 007', async () => {
    mocks.rpcErrors.set('current_shop_id', { message: 'function does not exist', code: '42883' });

    const report = await checkCloudHealth();
    const rls = report.checks.find(check => check.id === 'rlsHardening');

    expect(report.ok).toBe(false);
    expect(rls?.ok).toBe(false);
    expect(rls?.missing).toContain('current_shop_id');
    expect(rls?.migration).toBe('007');
  });

  it('reports missing team invite migration from 008', async () => {
    mocks.tableErrors.set('shop_invites', 'relation does not exist');
    mocks.rpcErrors.set('accept_shop_invite', { message: 'function does not exist', code: '42883' });

    const report = await checkCloudHealth();
    const team = report.checks.find(check => check.id === 'teamInvites');

    expect(report.ok).toBe(false);
    expect(team?.ok).toBe(false);
    expect(team?.missing).toContain('shop_invites');
    expect(team?.missing).toContain('accept_shop_invite');
    expect(team?.migration).toBe('008');
  });
});
