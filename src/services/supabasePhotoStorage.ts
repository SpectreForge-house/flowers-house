import { supabase } from '../lib/supabase';
import { getStorageMode } from './storageAdapter';
import { getAuthState, isSupabaseAvailable } from './authService';
import { getShopId } from './shopContext';

const BUCKET = 'shop-photos';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export function isCloudPhotosEnabled(): boolean {
  return getStorageMode() === 'supabase' && isSupabaseAvailable() && getAuthState().user !== null;
}

function splitOwnerKey(ownerKey: string): { kind: string; id: string } {
  const sep = ownerKey.indexOf(':');
  return {
    kind: sep >= 0 ? ownerKey.slice(0, sep) : ownerKey,
    id: sep >= 0 ? ownerKey.slice(sep + 1) : '',
  };
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'x';
}

export function cloudPhotoPath(shopId: string, ownerKey: string, filename: string): string {
  const { kind, id } = splitOwnerKey(ownerKey);
  return `${shopId}/${safePathPart(kind)}/${safePathPart(id)}/${filename}`;
}

export async function uploadCloudPhoto(ownerKey: string, filename: string, blob: Blob): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');
  const shopId = await getShopId();
  if (!shopId) throw new Error('Not signed in or profile missing');

  const { kind, id } = splitOwnerKey(ownerKey);
  const storagePath = cloudPhotoPath(shopId, ownerKey, filename);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, {
      upsert: true,
      contentType: blob.type || 'image/webp',
    });
  if (uploadError) throw new Error(`Failed to upload photo: ${uploadError.message}`);

  const { error: metaError } = await supabase
    .from('photos')
    .upsert({
      shop_id: shopId,
      owner_kind: kind,
      owner_id: id,
      filename,
      storage_path: storagePath,
    }, { onConflict: 'shop_id,filename' });
  if (metaError) throw new Error(`Failed to save photo metadata: ${metaError.message}`);
}

export async function getCloudPhotoUrl(filename: string): Promise<string | null> {
  if (!supabase) return null;
  const shopId = await getShopId();
  if (!shopId) return null;

  const { data, error } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('shop_id', shopId)
    .eq('filename', filename)
    .maybeSingle();
  if (error || !data) return null;

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(data.storage_path as string, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed) return null;
  return signed.signedUrl;
}

export async function deleteCloudPhoto(filename: string): Promise<void> {
  if (!supabase) return;
  const shopId = await getShopId();
  if (!shopId) return;

  const { data } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('shop_id', shopId)
    .eq('filename', filename)
    .maybeSingle();

  if (data?.storage_path) {
    await supabase.storage.from(BUCKET).remove([data.storage_path as string]);
  }
  await supabase.from('photos').delete().eq('shop_id', shopId).eq('filename', filename);
}

export async function deleteCloudOwnerPhotos(ownerKey: string): Promise<void> {
  if (!supabase) return;
  const shopId = await getShopId();
  if (!shopId) return;
  const { kind, id } = splitOwnerKey(ownerKey);

  const { data } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('shop_id', shopId)
    .eq('owner_kind', kind)
    .eq('owner_id', id);

  const paths = (data || []).map(row => row.storage_path as string);
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths);
  }
  await supabase.from('photos').delete()
    .eq('shop_id', shopId)
    .eq('owner_kind', kind)
    .eq('owner_id', id);
}

export async function listCloudOwnerPhotos(ownerKey: string): Promise<string[]> {
  if (!supabase) return [];
  const shopId = await getShopId();
  if (!shopId) return [];
  const { kind, id } = splitOwnerKey(ownerKey);

  const { data, error } = await supabase
    .from('photos')
    .select('filename')
    .eq('shop_id', shopId)
    .eq('owner_kind', kind)
    .eq('owner_id', id)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list cloud photos: ${error.message}`);
  return (data || []).map(row => row.filename as string);
}

export async function downloadCloudPhotoAsDataUrl(filename: string): Promise<string | null> {
  const url = await getCloudPhotoUrl(filename);
  if (!url) return null;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function listAllCloudPhotos(): Promise<Array<{ filename: string; owner_kind: string; owner_id: string; storage_path: string }>> {
  if (!supabase) return [];
  const shopId = await getShopId();
  if (!shopId) return [];

  const { data, error } = await supabase
    .from('photos')
    .select('filename, owner_kind, owner_id, storage_path')
    .eq('shop_id', shopId);
  if (error) return [];
  return (data || []) as Array<{ filename: string; owner_kind: string; owner_id: string; storage_path: string }>;
}
