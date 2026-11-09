import { UserRole } from '../types';

export type Permission =
  | 'manageTeam'
  | 'manageSettings'
  | 'editShopInfo'
  | 'viewStatistics'
  | 'deleteRecords'
  | 'resetData'
  | 'backupRestore'
  | 'manageCloud'
  | 'viewFinancials'
  | 'manageFinance';

type RolePermissions = Record<Permission, boolean>;

const NONE: RolePermissions = {
  manageTeam: false,
  manageSettings: false,
  editShopInfo: false,
  viewStatistics: false,
  deleteRecords: false,
  resetData: false,
  backupRestore: false,
  manageCloud: false,
  viewFinancials: false,
  manageFinance: false,
};

const OWNER: RolePermissions = {
  manageTeam: true,
  manageSettings: true,
  editShopInfo: true,
  viewStatistics: true,
  deleteRecords: true,
  resetData: true,
  backupRestore: true,
  manageCloud: true,
  viewFinancials: true,
  manageFinance: true,
};

const MANAGER: RolePermissions = {
  manageTeam: false,
  manageSettings: true,
  editShopInfo: false,
  viewStatistics: false,
  deleteRecords: true,
  resetData: false,
  backupRestore: false,
  manageCloud: false,
  viewFinancials: true,
  manageFinance: false,
};

const STAFF: RolePermissions = {
  manageTeam: false,
  manageSettings: false,
  editShopInfo: false,
  viewStatistics: false,
  deleteRecords: false,
  resetData: false,
  backupRestore: false,
  manageCloud: false,
  viewFinancials: false,
  manageFinance: false,
};

const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  owner: OWNER,
  manager: MANAGER,
  staff: STAFF,
};

export function permissionsForRole(role: UserRole | null): RolePermissions {
  return role ? ROLE_PERMISSIONS[role] : NONE;
}

export function hasPermission(role: UserRole | null, permission: Permission): boolean {
  return permissionsForRole(role)[permission];
}

export function canAccessPath(role: UserRole | null, path: string): boolean {
  if (path === '/statistics') return hasPermission(role, 'viewStatistics');
  if (path === '/settings') return hasPermission(role, 'manageSettings');
  if (path === '/finance') return hasPermission(role, 'manageFinance');
  return true;
}

export interface ResolveRoleInput {
  storageMode: 'local' | 'supabase';
  hasUser: boolean;
  profileRole: UserRole | null;
}

export function resolveRole({ storageMode, hasUser, profileRole }: ResolveRoleInput): UserRole | null {
  if (storageMode !== 'supabase') return 'owner';
  if (!hasUser) return 'owner';
  return profileRole;
}
