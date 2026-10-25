import { describe, expect, it } from 'vitest';
import {
  canAccessPath,
  hasPermission,
  permissionsForRole,
  resolveRole,
  type Permission,
} from './permissions';

describe('permissions', () => {
  it('grants the owner every permission', () => {
    expect(permissionsForRole('owner')).toEqual({
      manageTeam: true,
      manageSettings: true,
      viewStatistics: true,
      deleteRecords: true,
      resetData: true,
      backupRestore: true,
      manageCloud: true,
      viewFinancials: true,
    });
  });

  it('lets managers manage data and settings but not team, backup or reset', () => {
    expect(hasPermission('manager', 'manageSettings')).toBe(true);
    expect(hasPermission('manager', 'deleteRecords')).toBe(true);
    expect(hasPermission('manager', 'viewStatistics')).toBe(true);
    expect(hasPermission('manager', 'manageTeam')).toBe(false);
    expect(hasPermission('manager', 'resetData')).toBe(false);
    expect(hasPermission('manager', 'backupRestore')).toBe(false);
    expect(hasPermission('manager', 'manageCloud')).toBe(false);
  });

  it('gives staff no destructive or privileged permissions', () => {
    const privileged: Permission[] = [
      'manageTeam',
      'manageSettings',
      'viewStatistics',
      'deleteRecords',
      'resetData',
      'backupRestore',
      'manageCloud',
      'viewFinancials',
    ];

    for (const permission of privileged) {
      expect(hasPermission('staff', permission)).toBe(false);
    }
  });

  it('denies every permission when the role is unknown', () => {
    expect(permissionsForRole(null)).toEqual({
      manageTeam: false,
      manageSettings: false,
      viewStatistics: false,
      deleteRecords: false,
      resetData: false,
      backupRestore: false,
      manageCloud: false,
      viewFinancials: false,
    });
  });

  it('treats local and signed-out modes as owner', () => {
    expect(resolveRole({ storageMode: 'local', hasUser: false, profileRole: null })).toBe('owner');
    expect(resolveRole({ storageMode: 'supabase', hasUser: false, profileRole: null })).toBe('owner');
  });

  it('uses the cloud profile role for signed-in users', () => {
    expect(resolveRole({ storageMode: 'supabase', hasUser: true, profileRole: 'manager' })).toBe('manager');
    expect(resolveRole({ storageMode: 'supabase', hasUser: true, profileRole: 'staff' })).toBe('staff');
    expect(resolveRole({ storageMode: 'supabase', hasUser: true, profileRole: null })).toBeNull();
  });

  it('protects privileged routes and leaves regular routes open', () => {
    expect(canAccessPath('staff', '/statistics')).toBe(false);
    expect(canAccessPath('staff', '/settings')).toBe(false);
    expect(canAccessPath('manager', '/statistics')).toBe(true);
    expect(canAccessPath('manager', '/settings')).toBe(true);
    expect(canAccessPath('staff', '/orders')).toBe(true);
    expect(canAccessPath('staff', '/themes')).toBe(true);
  });
});
