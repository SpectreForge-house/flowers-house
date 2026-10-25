import { supabase } from '../lib/supabase';
import { getCurrentUserId } from './shopContext';
import { ReminderStorageAdapter } from './reminderStorageAdapter';

export class SupabaseReminderAdapter implements ReminderStorageAdapter {
  async getReadReminders(): Promise<string[]> {
    if (!supabase) throw new Error('Supabase not configured');
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { data, error } = await supabase
      .from('user_reminders_read')
      .select('reminder_id')
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to load read reminders: ${error.message}`);
    return (data || []).map(row => row.reminder_id as string);
  }

  async saveReadReminders(ids: string[]): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { error: deleteError } = await supabase
      .from('user_reminders_read')
      .delete()
      .eq('user_id', userId);
    if (deleteError) throw new Error(`Failed to clear read reminders: ${deleteError.message}`);

    if (ids.length === 0) return;
    const rows = Array.from(new Set(ids)).map(reminderId => ({
      user_id: userId,
      reminder_id: reminderId,
    }));
    const { error } = await supabase
      .from('user_reminders_read')
      .upsert(rows, { onConflict: 'user_id,reminder_id' });
    if (error) throw new Error(`Failed to save read reminders: ${error.message}`);
  }

  async getDismissedReminders(): Promise<string[]> {
    if (!supabase) throw new Error('Supabase not configured');
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { data, error } = await supabase
      .from('user_reminders_dismissed')
      .select('reminder_key')
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to load dismissed reminders: ${error.message}`);
    return (data || []).map(row => row.reminder_key as string);
  }

  async saveDismissedReminders(keys: string[]): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not signed in');

    const { error: deleteError } = await supabase
      .from('user_reminders_dismissed')
      .delete()
      .eq('user_id', userId);
    if (deleteError) throw new Error(`Failed to clear dismissed reminders: ${deleteError.message}`);

    if (keys.length === 0) return;
    const rows = Array.from(new Set(keys)).map(reminderKey => ({
      user_id: userId,
      reminder_key: reminderKey,
    }));
    const { error } = await supabase
      .from('user_reminders_dismissed')
      .upsert(rows, { onConflict: 'user_id,reminder_key' });
    if (error) throw new Error(`Failed to save dismissed reminders: ${error.message}`);
  }
}
