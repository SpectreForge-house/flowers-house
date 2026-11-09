import { describe, expect, it } from 'vitest';
import {
  getCloudModePreference,
  getStorageMode,
  setCloudModePreference,
  setStorageMode,
} from './storageAdapter';

describe('storageAdapter', () => {
  it('defaults to local storage and automatic cloud switching', () => {
    expect(getStorageMode()).toBe('local');
    expect(getCloudModePreference()).toBe('auto');
  });

  it('stores the selected storage mode', () => {
    setStorageMode('supabase');
    expect(getStorageMode()).toBe('supabase');

    setStorageMode('local');
    expect(getStorageMode()).toBe('local');
  });

  it('keeps a manual local-storage choice', () => {
    setCloudModePreference('local');
    expect(getCloudModePreference()).toBe('local');
  });

  it('re-enables automatic switching', () => {
    setCloudModePreference('local');
    setCloudModePreference('auto');
    expect(getCloudModePreference()).toBe('auto');
  });
});
