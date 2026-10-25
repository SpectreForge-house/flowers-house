import { supabase } from '../lib/supabase';

let cachedShopId: string | null = null;
let cachedUserId: string | null = null;

export function clearShopContextCache(): void {
  cachedShopId = null;
  cachedUserId = null;
}

export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function getShopId(): Promise<string | null> {
  if (!supabase) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  if (cachedUserId === userId && cachedShopId) {
    return cachedShopId;
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('shop_id')
    .eq('id', userId)
    .single();

  if (error || !profile?.shop_id) return null;

  cachedShopId = profile.shop_id;
  cachedUserId = userId;
  return cachedShopId;
}
