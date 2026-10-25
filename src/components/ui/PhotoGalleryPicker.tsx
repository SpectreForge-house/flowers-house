import { useEffect, useRef, useState } from 'react';
import { ImageOff, ImagePlus, X } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';
import { MAX_SOURCE_SIZE_MB, PHOTO_ACCEPT, validatePhotoFile } from '../../services/photoStorage';
import { photoErrorCodeMessage } from '../../utils/photoErrors';

interface PhotoGalleryPickerProps {
  /** Photo filenames already stored for this entity. */
  photos: string[];
  /** Files chosen in the form but not written to disk yet. */
  pendingFiles: File[];
  onAdd: (file: File) => void;
  /** A saved photo - removing it deletes the file from disk. */
  onRemovePhoto: (filename: string) => void;
  /** A pending file - removing it only drops it from the form. */
  onRemovePending: (index: number) => void;
}

/**
 * Multi-photo picker: thumbnails of the saved photos plus previews of the
 * files chosen in the current session, an "Add photo" tile and per-photo
 * remove buttons. Validates files (type / size) with localized errors.
 */
export function PhotoGalleryPicker({ photos, pendingFiles, onAdd, onRemovePhoto, onRemovePending }: PhotoGalleryPickerProps) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = pendingFiles.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [pendingFiles]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    // Several files can be chosen at once - invalid ones are reported (first
    // error only) and skipped, the rest are added.
    let firstError = '';
    const valid: File[] = [];
    for (const file of files) {
      const code = validatePhotoFile(file);
      if (code) {
        if (!firstError) firstError = photoErrorCodeMessage(code, t);
      } else {
        valid.push(file);
      }
    }
    if (firstError) setError(firstError);
    else setError('');
    valid.forEach(file => onAdd(file));
  };

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="hidden"
        onChange={handleChange}
      />
      <div className="flex flex-wrap gap-2">
        {photos.map(filename => (
          <PhotoThumb key={filename} filename={filename} onRemove={() => onRemovePhoto(filename)} />
        ))}
        {previews.map((url, index) => (
          <div key={`pending-${index}`} className="relative w-20 h-20">
            <img
              src={url}
              alt={t.photos.photo}
              className="w-full h-full object-cover rounded-lg border border-border bg-surface"
            />
            <button
              type="button"
              onClick={() => onRemovePending(index)}
              aria-label={t.photos.removePhoto}
              className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-surface border border-border text-text-secondary hover:text-status-danger"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-lg border border-dashed border-border bg-surface text-text-muted hover:text-text-primary hover:border-elevated flex flex-col items-center justify-center gap-1"
        >
          <ImagePlus size={20} />
          <span className="text-[10px]">{t.photos.addPhoto}</span>
        </button>
      </div>
      <p className="text-xs text-text-muted">{t.photos.hint.replace('{max}', String(MAX_SOURCE_SIZE_MB))}</p>
      {error && <p className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}

function PhotoThumb({ filename, onRemove }: { filename: string; onRemove: () => void }) {
  const { t } = useLanguage();
  const url = usePhotoUrl(filename);
  const [broken, setBroken] = useState(false);

  return (
    <div className="relative w-20 h-20">
      {url && !broken ? (
        <img
          src={url}
          alt={t.photos.photo}
          onError={() => setBroken(true)}
          className="w-full h-full object-cover rounded-lg border border-border bg-surface"
        />
      ) : (
        <div className="w-full h-full rounded-lg border border-border bg-surface text-text-muted flex items-center justify-center">
          <ImageOff size={20} />
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t.photos.removePhoto}
        className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-surface border border-border text-text-secondary hover:text-status-danger"
      >
        <X size={12} />
      </button>
    </div>
  );
}
