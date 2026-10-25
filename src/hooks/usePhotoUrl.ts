import { useEffect, useState } from 'react';
import { getPhotoUrl, listPhotos, listPhotosAsync } from '../services/photoStorage';

/**
 * Loads an owner's filenames, falling back to cloud metadata when the local
 * index has no record yet (fresh device / other browser).
 */
export function useOwnerPhotos(ownerKey: string): string[] {
  const [photos, setPhotos] = useState<string[]>(() => listPhotos(ownerKey));

  useEffect(() => {
    let active = true;
    setPhotos(listPhotos(ownerKey));
    listPhotosAsync(ownerKey).then((result) => {
      if (active) setPhotos(result);
    });
    return () => {
      active = false;
    };
  }, [ownerKey]);

  return photos;
}

/**
 * Resolves a stored photo filename to a displayable URL.
 * Returns null while loading, when the file is missing on disk, or when there
 * is no photo at all - callers should show the placeholder in that case.
 */
export function usePhotoUrl(filename?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!filename) {
      setUrl(null);
      return () => {
        active = false;
      };
    }

    setUrl(null);
    getPhotoUrl(filename).then((resolved) => {
      if (active) setUrl(resolved);
    });

    return () => {
      active = false;
    };
  }, [filename]);

  return url;
}
