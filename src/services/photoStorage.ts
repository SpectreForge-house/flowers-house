import { v4 as uuidv4 } from 'uuid';
import {
  deleteCloudOwnerPhotos,
  deleteCloudPhoto,
  downloadCloudPhotoAsDataUrl,
  getCloudPhotoUrl,
  isCloudPhotosEnabled,
  listAllCloudPhotos,
  listCloudOwnerPhotos,
  uploadCloudPhoto,
} from './supabasePhotoStorage';

// ---------------------------------------------------------------------------
// Photo storage
//
// Photos are real image files (jpg / png / webp), never base64 blobs in the
// main database. In the Electron app they are written to <userData>/photos
// through the narrow IPC bridge exposed by electron/preload.cjs; app data only
// ever stores the plain filename. When the app runs in a plain browser tab
// (vite dev without Electron) the same API is backed by IndexedDB instead.
//
// Files are grouped by "owner key" (e.g. `client:<id>`, `order:<id>`), so all
// photos of an entity can be listed and deleted together.
// ---------------------------------------------------------------------------

const PHOTO_INDEX_KEY = 'flower-shop-photo-index';

export const MAX_PHOTO_DIMENSION = 1200;
export const PHOTO_QUALITY = 0.8;
export const MAX_SOURCE_SIZE_MB = 10;
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
// Must stay in sync with isSafePhotoName() in electron/main.cjs:
// a filename may never contain a path, ".." or an unexpected extension.
const SAFE_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*\.[A-Za-z0-9]+$/;

const DB_NAME = 'flower-shop-photos';
const STORE_NAME = 'files';

export type PhotoOwnerKind = 'client' | 'order' | 'purchase';

export type PhotoErrorCode = 'invalidType' | 'tooLarge' | 'readFailed' | 'invalidImage' | 'saveFailed';

export class PhotoError extends Error {
  code: PhotoErrorCode;

  constructor(code: PhotoErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PhotoError';
    this.code = code;
  }
}

type PhotoIndex = Record<string, string[]>;

export interface PhotoBackup {
  files: Record<string, string>;
  index: PhotoIndex;
}

// -------------------------------------------------------------------------
// Owner index (localStorage): ownerKey -> [filename, ...]
// -------------------------------------------------------------------------

function loadIndex(): PhotoIndex {
  try {
    const raw = localStorage.getItem(PHOTO_INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const clean: PhotoIndex = {};
        Object.entries(parsed).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            const names = value.filter((n): n is string => typeof n === 'string' && isSafeFilename(n));
            if (names.length > 0) clean[key] = names;
          }
        });
        return clean;
      }
    }
  } catch (error) {
    console.error('[photoStorage] Failed to read photo index:', error);
  }
  return {};
}

function saveIndex(index: PhotoIndex): void {
  try {
    localStorage.setItem(PHOTO_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.error('[photoStorage] Failed to save photo index:', error);
  }
}

export function photoOwnerKey(kind: PhotoOwnerKind, id: string): string {
  return `${kind}:${id}`;
}

export function listPhotos(ownerKey: string): string[] {
  return loadIndex()[ownerKey] ?? [];
}

// -------------------------------------------------------------------------
// Validation
// -------------------------------------------------------------------------

export function isSafeFilename(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0 || name.length > 120) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  if (!SAFE_FILENAME_RE.test(name)) return false;
  const ext = name.split('.').pop() || '';
  return ALLOWED_EXTENSIONS.includes(ext.toLowerCase());
}

/** Returns an error code (translated by the caller) or null when the file is usable. */
export function validatePhotoFile(file: File): PhotoErrorCode | null {
  const mime = (file.type || '').toLowerCase();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const typeOk = ALLOWED_MIME_TYPES.includes(mime);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);
  // Some files arrive without a MIME type - fall back to the extension.
  if (!typeOk && !(mime === '' && extOk)) return 'invalidType';
  if (file.size > MAX_SOURCE_SIZE_MB * 1024 * 1024) return 'tooLarge';
  return null;
}

// -------------------------------------------------------------------------
// Image processing: resize to MAX_PHOTO_DIMENSION, compress to ~PHOTO_QUALITY
// -------------------------------------------------------------------------

async function loadImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // Keeps EXIF orientation, so phone photos are not stored sideways.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Fallback for engines without createImageBitmap(file, options).
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new PhotoError('invalidImage'));
      img.src = url;
    });
    return img;
  } catch (error) {
    throw error instanceof PhotoError ? error : new PhotoError('invalidImage');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function processPhoto(file: File): Promise<{ blob: Blob; ext: string }> {
  const source = await loadImageSource(file);

  const naturalWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const naturalHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!naturalWidth || !naturalHeight) {
    if ('close' in source) source.close();
    throw new PhotoError('invalidImage');
  }

  const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if ('close' in source) source.close();
    throw new PhotoError('readFailed');
  }

  ctx.drawImage(source, 0, 0, width, height);
  if ('close' in source) source.close();

  const webp = await canvasToBlob(canvas, 'image/webp', PHOTO_QUALITY);
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' };

  const jpeg = await canvasToBlob(canvas, 'image/jpeg', PHOTO_QUALITY);
  if (!jpeg) throw new PhotoError('readFailed');
  return { blob: jpeg, ext: 'jpg' };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new PhotoError('readFailed'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: match[1] });
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------------
// Backends
// -------------------------------------------------------------------------

interface PhotoBackend {
  save(name: string, dataUrl: string): Promise<void>;
  read(name: string): Promise<string | null>;
  remove(name: string): Promise<void>;
}

function createElectronBackend(): PhotoBackend | null {
  const bridge = typeof window !== 'undefined' ? window.flowerPhotos : undefined;
  if (!bridge) return null;
  return {
    save: async (name, dataUrl) => {
      await bridge.save(name, dataUrl);
    },
    read: async (name) => {
      try {
        return await bridge.read(name);
      } catch (error) {
        console.error('[photoStorage] Failed to read photo file:', error);
        return null;
      }
    },
    remove: async (name) => {
      await bridge.remove(name);
    },
  };
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    }).catch((error) => {
      dbPromise = null; // allow a retry on the next call
      throw error;
    });
  }
  return dbPromise;
}

const browserBackend: PhotoBackend = {
  save: async (name, dataUrl) => {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) throw new PhotoError('saveFailed');
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await idbRequest(tx.objectStore(STORE_NAME).put(blob, name));
  },
  read: async (name) => {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const blob = await idbRequest<Blob | undefined>(tx.objectStore(STORE_NAME).get(name));
      if (!blob) return null; // missing file -> placeholder
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('[photoStorage] Failed to read photo:', error);
      return null;
    }
  },
  remove: async (name) => {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await idbRequest(tx.objectStore(STORE_NAME).delete(name));
    } catch (error) {
      console.error('[photoStorage] Failed to delete photo:', error);
    }
  },
};

let cachedBackend: PhotoBackend | null = null;

function getBackend(): PhotoBackend {
  if (!cachedBackend) {
    cachedBackend = createElectronBackend() ?? browserBackend;
  }
  return cachedBackend;
}

// -------------------------------------------------------------------------
// Display URLs
// -------------------------------------------------------------------------

const urlCache = new Map<string, string>();

/** Resolves a displayable URL, or null when the file is missing/unreadable. */
export async function getPhotoUrl(filename: string | null | undefined): Promise<string | null> {
  if (!filename || !isSafeFilename(filename)) return null;
  const cached = urlCache.get(filename);
  if (cached) return cached;
  try {
    const url = await getBackend().read(filename);
    if (url) {
      urlCache.set(filename, url);
      return url;
    }
  } catch (error) {
    console.error('[photoStorage] Failed to load photo:', error);
  }

  if (isCloudPhotosEnabled()) {
    const cloudUrl = await getCloudPhotoUrl(filename);
    if (cloudUrl) {
      urlCache.set(filename, cloudUrl);
      return cloudUrl;
    }
  }
  return null;
}

function invalidateUrl(filename: string): void {
  const url = urlCache.get(filename);
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  urlCache.delete(filename);
}

// -------------------------------------------------------------------------
// CRUD
// -------------------------------------------------------------------------

export async function savePhoto(ownerKey: string, file: File): Promise<string> {
  const invalid = validatePhotoFile(file);
  if (invalid) throw new PhotoError(invalid);

  let processed: { blob: Blob; ext: string };
  try {
    processed = await processPhoto(file);
  } catch (error) {
    throw error instanceof PhotoError ? error : new PhotoError('invalidImage');
  }

  let dataUrl: string;
  try {
    dataUrl = await blobToDataUrl(processed.blob);
  } catch {
    throw new PhotoError('readFailed');
  }

  const filename = buildFilename(ownerKey, processed.ext);
  try {
    await getBackend().save(filename, dataUrl);
  } catch (error) {
    console.error('[photoStorage] Failed to save photo:', error);
    throw new PhotoError('saveFailed');
  }

  if (isCloudPhotosEnabled()) {
    try {
      await uploadCloudPhoto(ownerKey, filename, processed.blob);
    } catch (error) {
      console.error('[photoStorage] Failed to upload photo to cloud:', error);
      throw new PhotoError('saveFailed');
    }
  }

  const index = loadIndex();
  index[ownerKey] = [...(index[ownerKey] ?? []), filename];
  saveIndex(index);
  return filename;
}

export async function removePhoto(ownerKey: string, filename: string): Promise<void> {
  if (!isSafeFilename(filename)) return;

  const index = loadIndex();
  const current = index[ownerKey];
  if (current) {
    const next = current.filter((f) => f !== filename);
    if (next.length > 0) index[ownerKey] = next;
    else delete index[ownerKey];
    saveIndex(index);
  }

  invalidateUrl(filename);
  try {
    await getBackend().remove(filename);
  } catch (error) {
    console.error('[photoStorage] Failed to delete photo:', error);
  }

  if (isCloudPhotosEnabled()) {
    try {
      await deleteCloudPhoto(filename);
    } catch (error) {
      console.error('[photoStorage] Failed to delete cloud photo:', error);
    }
  }
}

/** Deletes every photo of an owner (file on disk + index entry). */
export async function removeOwnerPhotos(ownerKey: string): Promise<void> {
  const filenames = listPhotos(ownerKey);
  const index = loadIndex();
  delete index[ownerKey];
  saveIndex(index);

  await Promise.all(
    filenames.map(async (filename) => {
      invalidateUrl(filename);
      try {
        await getBackend().remove(filename);
      } catch (error) {
        console.error('[photoStorage] Failed to delete photo:', filename, error);
      }
    })
  );

  if (isCloudPhotosEnabled()) {
    try {
      await deleteCloudOwnerPhotos(ownerKey);
    } catch (error) {
      console.error('[photoStorage] Failed to delete cloud owner photos:', error);
    }
  }
}

/** Avatar-style usage: exactly one photo per owner - the new one replaces it. */
export async function replaceOwnerPhotos(ownerKey: string, file: File): Promise<string> {
  const previous = new Set(listPhotos(ownerKey));
  if (isCloudPhotosEnabled()) {
    try {
      for (const name of await listCloudOwnerPhotos(ownerKey)) previous.add(name);
    } catch (error) {
      console.error('[photoStorage] Failed to list cloud owner photos:', error);
    }
  }
  const filename = await savePhoto(ownerKey, file);
  await Promise.all(
    Array.from(previous).filter((f) => f !== filename).map((f) => removePhoto(ownerKey, f)),
  );
  return filename;
}

/** Merged owner photo list: local cache plus cloud metadata (cross-device). */
export async function listPhotosAsync(ownerKey: string): Promise<string[]> {
  const local = listPhotos(ownerKey);
  if (!isCloudPhotosEnabled()) return local;

  try {
    const cloud = await listCloudOwnerPhotos(ownerKey);
    return Array.from(new Set([...local, ...cloud]));
  } catch (error) {
    console.error('[photoStorage] Failed to load cloud owner photos:', error);
    return local;
  }
}

function buildFilename(ownerKey: string, ext: string): string {
  const sep = ownerKey.indexOf(':');
  const kind = sanitizePart(sep >= 0 ? ownerKey.slice(0, sep) : ownerKey, 16) || 'photo';
  const id = sanitizePart(sep >= 0 ? ownerKey.slice(sep + 1) : '', 32) || 'x';
  const unique = uuidv4().replace(/-/g, '').slice(0, 12);
  return `${kind}-${id}-${unique}.${ext}`;
}

function sanitizePart(value: string, maxLength: number): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, maxLength);
}

// -------------------------------------------------------------------------
// Backup / restore (photos travel with the JSON backup)
// -------------------------------------------------------------------------

async function readAsDataUrl(name: string): Promise<string | null> {
  const url = await getBackend().read(name);
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    URL.revokeObjectURL(url);
    return await blobToDataUrl(blob);
  } catch (error) {
    console.error('[photoStorage] Failed to export photo:', name, error);
    return null;
  }
}

/**
 * Raw file bytes as a data URL, or null when the file is missing/unreadable.
 * Unlike getPhotoUrl (which returns a blob: URL for display) this is meant for
 * copying a photo to a new owner - the new file gets a fresh unique filename.
 */
export async function readPhotoAsDataUrl(filename: string): Promise<string | null> {
  if (!isSafeFilename(filename)) return null;
  return readAsDataUrl(filename);
}

/**
 * Copies an existing photo file to a new owner under a fresh unique filename,
 * so the copy is fully independent: deleting the source entry later never
 * breaks it ("Repeat bouquet" uses this). Returns null when the source file is
 * missing or unreadable - the caller just continues without the photo.
 */
export async function copyPhotoToOwner(sourceFilename: string, targetOwnerKey: string): Promise<string | null> {
  const dataUrl = await readPhotoAsDataUrl(sourceFilename);
  if (!dataUrl) return null;

  const extRaw = (sourceFilename.split('.').pop() || '').toLowerCase();
  const ext = ALLOWED_EXTENSIONS.includes(extRaw) ? extRaw : 'jpg';
  const filename = buildFilename(targetOwnerKey, ext);

  try {
    await getBackend().save(filename, dataUrl);
  } catch (error) {
    console.error('[photoStorage] Failed to copy photo:', sourceFilename, error);
    return null;
  }

  const index = loadIndex();
  index[targetOwnerKey] = [...(index[targetOwnerKey] ?? []), filename];
  saveIndex(index);
  return filename;
}

export async function exportPhotos(): Promise<PhotoBackup> {
  const index = loadIndex();
  const files: Record<string, string> = {};
  const names = new Set(Object.values(index).reduce<string[]>((all, list) => all.concat(list), []));

  if (isCloudPhotosEnabled()) {
    for (const photo of await listAllCloudPhotos()) {
      names.add(photo.filename);
      const ownerKey = `${photo.owner_kind}:${photo.owner_id}`;
      index[ownerKey] = Array.from(new Set([...(index[ownerKey] ?? []), photo.filename]));
    }
  }

  for (const name of names) {
    if (files[name]) continue;
    const dataUrl = await readAsDataUrl(name) ?? (isCloudPhotosEnabled()
      ? await downloadCloudPhotoAsDataUrl(name)
      : null);
    if (dataUrl) files[name] = dataUrl;
  }
  return { files, index };
}

/**
 * Photo index only, without file contents. Used by the automatic backup in the
 * desktop app: the photo files are copied by the Electron main process, so the
 * data.json carries just the owner -> filename mapping.
 */
export function exportPhotoIndex(): PhotoBackup {
  return { files: {}, index: loadIndex() };
}

// One-time migration flag: photos saved through the IndexedDB fallback (while
// the preload bridge was not loaded - see the note about `preload` in
// electron/main.cjs) are copied to disk the first time the desktop app runs
// with a working bridge.
const DISK_MIGRATION_KEY = 'flower-shop-photo-disk-migrated';

/**
 * One-time safety migration for the desktop app: every indexed photo that is
 * missing on disk but present in the legacy IndexedDB store is copied there,
 * so switching from the fallback backend to the disk backend never makes
 * existing photos disappear. No-op in a plain browser tab; runs once and
 * retries on the next start if anything failed.
 */
export async function migrateIndexedPhotosToDisk(): Promise<void> {
  if (!createElectronBackend()) return; // not the desktop app
  if (localStorage.getItem(DISK_MIGRATION_KEY) === 'done') return;

  const index = loadIndex();
  const names = Array.from(new Set(
    Object.values(index).reduce<string[]>((all, list) => all.concat(list), []),
  ));
  if (names.length === 0) {
    localStorage.setItem(DISK_MIGRATION_KEY, 'done');
    return;
  }

  for (const name of names) {
    try {
      const onDisk = await getBackend().read(name);
      if (onDisk) continue; // already on disk
      const url = await browserBackend.read(name);
      if (!url) continue; // not in the legacy store either - nothing to migrate
      let dataUrl = url;
      if (url.startsWith('blob:')) {
        const response = await fetch(url);
        const blob = await response.blob();
        dataUrl = await blobToDataUrl(blob);
      }
      URL.revokeObjectURL(url);
      await getBackend().save(name, dataUrl);
    } catch (error) {
      console.error('[photoStorage] IndexedDB -> disk migration failed for', name, error);
      return; // no flag set: retried on the next app start
    }
  }
  localStorage.setItem(DISK_MIGRATION_KEY, 'done');
}

export async function importPhotos(backup?: PhotoBackup | null): Promise<void> {
  if (!backup) return;

  const files = backup.files ?? {};
  for (const [name, dataUrl] of Object.entries(files)) {
    if (!isSafeFilename(name)) continue;
    if (!/^data:image\/(jpe?g|png|webp);base64,/.test(dataUrl)) continue;
    invalidateUrl(name);
    try {
      await getBackend().save(name, dataUrl);
    } catch (error) {
      // A missing/broken photo must never break a restore: the record stays and
      // the UI falls back to the placeholder.
      console.error('[photoStorage] Failed to import photo:', name, error);
    }
  }

  const merged = loadIndex();
  const indexBackup = backup.index ?? {};
  Object.entries(indexBackup).forEach(([ownerKey, names]) => {
    if (!Array.isArray(names)) return;
    const valid = names.filter((n): n is string => typeof n === 'string' && isSafeFilename(n));
    if (valid.length === 0) return;
    merged[ownerKey] = Array.from(new Set([...(merged[ownerKey] ?? []), ...valid]));
  });
  saveIndex(merged);

  if (isCloudPhotosEnabled()) {
    for (const [ownerKey, names] of Object.entries(indexBackup)) {
      if (!Array.isArray(names)) continue;
      for (const name of names) {
        if (typeof name !== 'string' || !isSafeFilename(name)) continue;
        const dataUrl = files[name];
        if (!dataUrl) continue;
        const blob = dataUrlToBlob(dataUrl);
        if (!blob) continue;
        try {
          await uploadCloudPhoto(ownerKey, name, blob);
        } catch (error) {
          console.error('[photoStorage] Failed to upload restored photo:', name, error);
        }
      }
    }
  }
}

/** Wipes the index and every indexed photo file (used by "reset all data"). */
export async function removeAllPhotos(): Promise<void> {
  const ownerKeys = Object.keys(loadIndex());
  await Promise.all(ownerKeys.map((ownerKey) => removeOwnerPhotos(ownerKey)));
}
