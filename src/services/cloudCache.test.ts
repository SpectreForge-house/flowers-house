import { describe, expect, it } from 'vitest';
import { readCloudCache, writeCloudCache } from './cloudCache';
import { Customer } from '../types';

const customer: Customer = {
  id: 'c1',
  name: 'Anna',
  phone: '+1',
  address: 'Street 1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('cloudCache', () => {
  it('stores and reads a collection for the given user', () => {
    writeCloudCache('customers', [customer], 'user-a');

    expect(readCloudCache('customers', 'user-a')).toEqual([customer]);
  });

  it('keeps caches isolated per user', () => {
    writeCloudCache('customers', [customer], 'user-a');

    expect(readCloudCache('customers', 'user-b')).toBeNull();
  });

  it('merges collections written at different times', () => {
    writeCloudCache('customers', [customer], 'user-a');
    writeCloudCache('readReminders', ['r1'], 'user-a');

    expect(readCloudCache('customers', 'user-a')).toEqual([customer]);
    expect(readCloudCache('readReminders', 'user-a')).toEqual(['r1']);
  });

  it('does not return defaults for collections that were never cached', () => {
    writeCloudCache('customers', [customer], 'user-a');

    expect(readCloudCache('settings', 'user-a')).toBeNull();
    expect(readCloudCache('orders', 'user-a')).toBeNull();
  });

  it('returns null for corrupted cache data', () => {
    localStorage.setItem('flower-shop-cloud-cache-user-a', '{not-json');

    expect(readCloudCache('customers', 'user-a')).toBeNull();
  });

  it('does nothing without a user id', () => {
    writeCloudCache('customers', [customer], null);

    expect(readCloudCache('customers', null)).toBeNull();
  });
});
