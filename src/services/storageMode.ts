import { getAuthState, isSupabaseAvailable } from './authService';
import { getStorageMode } from './storageAdapter';

/**
 * Cloud storage is active when the user explicitly selected Supabase mode,
 * the client is configured and a user is authenticated.
 */
export function isCloudActive(): boolean {
  return getStorageMode() === 'supabase' && isSupabaseAvailable() && getAuthState().user !== null;
}
