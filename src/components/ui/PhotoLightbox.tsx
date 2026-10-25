import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImageOff, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';

interface PhotoLightboxProps {
  /** Stored photo filenames (already in the photo storage). */
  photos: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** When provided, shows a delete button that removes the current photo. */
  onDeletePhoto?: (filename: string) => void;
}

/**
 * Fullscreen photo viewer with prev/next navigation (also via arrow keys)
 * and an optional per-photo delete button. A missing/broken file shows a
 * placeholder instead of crashing.
 */
export function PhotoLightbox({ photos, index, onIndexChange, onClose, onDeletePhoto }: PhotoLightboxProps) {
  const { t } = useLanguage();
  const filename = photos[index];
  const url = usePhotoUrl(filename);

  const goPrev = useCallback(() => {
    if (photos.length > 1) onIndexChange((index - 1 + photos.length) % photos.length);
  }, [index, photos.length, onIndexChange]);

  const goNext = useCallback(() => {
    if (photos.length > 1) onIndexChange((index + 1) % photos.length);
  }, [index, photos.length, onIndexChange]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, goPrev, goNext]);

  return createPortal(
    <div
      className="fixed inset-0 modal-overlay lg:left-64 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t.common.close}
        className="absolute top-4 right-4 p-2 rounded-full bg-surface border border-border text-text-primary hover:bg-hover"
      >
        <X size={22} />
      </button>

      <div
        className="relative max-w-4xl w-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {url ? (
          <img
            src={url}
            alt={t.photos.photo}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        ) : (
          <div className="w-full h-64 flex flex-col items-center justify-center gap-2 bg-surface border border-border rounded-lg text-text-muted">
            <ImageOff size={40} />
            <p className="text-sm">{t.photos.unavailable}</p>
          </div>
        )}

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={t.photos.prevPhoto}
              className="absolute left-0 p-2 rounded-full bg-surface border border-border text-text-primary hover:bg-hover"
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={t.photos.nextPhoto}
              className="absolute right-0 p-2 rounded-full bg-surface border border-border text-text-primary hover:bg-hover"
            >
              <ChevronRight size={26} />
            </button>
            <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-text-primary bg-surface border border-border px-2 py-0.5 rounded-full">
              {index + 1} / {photos.length}
            </p>
          </>
        )}
      </div>

      {onDeletePhoto && (
        <button
          type="button"
          onClick={() => onDeletePhoto(filename)}
          aria-label={t.common.delete}
          className="absolute bottom-6 right-6 p-3 rounded-full bg-surface border border-border text-status-danger hover:bg-hover"
        >
          <Trash2 size={20} />
        </button>
      )}
    </div>,
    document.body
  );
}
