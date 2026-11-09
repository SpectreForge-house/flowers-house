import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getShopId } from './shopContext';
import { getAuthState, isSupabaseAvailable, onAuthChange } from './authService';

export type RealtimeTable =
  | 'orders'
  | 'deliveries'
  | 'inventory_items'
  | 'inventory_reservations'
  | 'customers'
  | 'client_purchases'
  | 'finance_entries';

const TABLES: RealtimeTable[] = [
  'orders',
  'deliveries',
  'inventory_items',
  'inventory_reservations',
  'customers',
  'client_purchases',
  'finance_entries',
];

type Listener = (table: RealtimeTable) => void;

const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;
let channelShopId: string | null = null;
let authListenerAttached = false;

function notify(table: RealtimeTable) {
  listeners.forEach(listener => {
    try {
      listener(table);
    } catch (err) {
      console.error('[realtimeService] Listener failed:', err);
    }
  });
}

export function stopRealtime(): void {
  if (channel && supabase) {
    void supabase.removeChannel(channel);
  }
  channel = null;
  channelShopId = null;
}

async function ensureStarted(): Promise<void> {
  if (!supabase || !isSupabaseAvailable() || !getAuthState().user) return;
  const shopId = await getShopId();
  if (!shopId) return;
  if (channel && channelShopId === shopId) return;

  stopRealtime();
  const next = supabase.channel(`shop-realtime-${shopId}`);
  for (const table of TABLES) {
    next.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `shop_id=eq.${shopId}` },
      () => notify(table),
    );
  }
  next.subscribe();
  channel = next;
  channelShopId = shopId;
}

export function onRealtimeChange(listener: Listener): () => void {
  listeners.add(listener);
  if (!authListenerAttached) {
    authListenerAttached = true;
    onAuthChange(state => {
      if (state.user) void ensureStarted();
      else stopRealtime();
    });
  }
  void ensureStarted();
  return () => {
    listeners.delete(listener);
  };
}
