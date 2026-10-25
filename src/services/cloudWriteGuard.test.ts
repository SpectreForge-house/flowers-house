import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  guardCloudWrites,
  isOfflineCloudWriteError,
  OfflineCloudWriteError,
} from './cloudWriteGuard';

function setOnline(online: boolean) {
  vi.stubGlobal('navigator', { onLine: online });
}

describe('guardCloudWrites', () => {
  beforeEach(() => {
    setOnline(false);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('blocks write methods while offline', async () => {
    const adapter = {
      getCustomers: vi.fn(async () => [] as string[]),
      addCustomer: vi.fn(async (_id: string) => {}),
    };
    const guarded = guardCloudWrites(adapter);

    await expect(guarded.addCustomer('c1')).rejects.toBeInstanceOf(OfflineCloudWriteError);
    expect(adapter.addCustomer).not.toHaveBeenCalled();
  });

  it('allows read methods while offline', async () => {
    const adapter = {
      getCustomers: vi.fn(async () => ['c1']),
      addCustomer: vi.fn(async (_id: string) => {}),
    };
    const guarded = guardCloudWrites(adapter);

    await expect(guarded.getCustomers()).resolves.toEqual(['c1']);
    expect(adapter.getCustomers).toHaveBeenCalledTimes(1);
  });

  it('passes writes through when online', async () => {
    setOnline(true);
    const adapter = {
      getCustomers: vi.fn(async () => [] as string[]),
      addCustomer: vi.fn(async (_id: string) => {}),
    };
    const guarded = guardCloudWrites(adapter);

    await guarded.addCustomer('c1');
    expect(adapter.addCustomer).toHaveBeenCalledWith('c1');
  });

  it('recognises offline write errors from other realms', () => {
    expect(isOfflineCloudWriteError({ code: 'OFFLINE_CLOUD_WRITE' })).toBe(true);
    expect(isOfflineCloudWriteError(new Error('network'))).toBe(false);
  });
});
