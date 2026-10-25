import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { Button } from './Button';
import { useLanguage } from '../../i18n';
import { MAX_SOURCE_SIZE_MB, PHOTO_ACCEPT, PhotoErrorCode, validatePhotoFile } from '../../services/photoStorage';
import { photoErrorCodeMessage } from '../../utils/photoErrors';

interface PhotoPickerProps {
  /** Already resolved photo URL (existing photo or a just chosen local file). */
  previewUrl: string | null;
  onChoose: (file: File) => void;
  onRemove?: () => void;
  /** Used as image alt text, defaults to the localized "Photo" label. */
  label?: string;
}

/**
 * "Choose photo" button + live preview + "Remove photo".
 * Validates the file (type / size) and shows a friendly localized error.
 */
export function PhotoPicker({ previewUrl, onChoose, onRemove, label }: PhotoPickerProps) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [previewUrl]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const code = validatePhotoFile(file);
    if (code) {
      setError(photoErrorCodeMessage(code, t));
      return;
    }
    setError('');
    onChoose(file);
  };

  const handleRemove = () => {
    setError('');
    onRemove?.();
  };

  const showPreview = !!previewUrl && !broken;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-4">
        <input
          ref={inputRef}
          type="file"
          accept={PHOTO_ACCEPT}
          className="hidden"
          onChange={handleChange}
        />
        {showPreview ? (
          <img
            src={previewUrl!}
            alt={label ?? t.photos.photo}
            onError={() => setBroken(true)}
            className="w-20 h-20 rounded-full object-cover border border-border bg-surface shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-surface border border-border text-text-muted flex items-center justify-center shrink-0">
            <Camera size={28} />
          </div>
        )}

        <div className="flex flex-col items-start gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            <ImagePlus size={16} />
            {t.photos.choosePhoto}
          </Button>
          {showPreview && onRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
              <X size={16} />
              {t.photos.removePhoto}
            </Button>
          )}
          <p className="text-xs text-text-muted">{t.photos.hint.replace('{max}', String(MAX_SOURCE_SIZE_MB))}</p>
        </div>
      </div>
      {error && <p className="text-xs text-status-danger mt-1">{error}</p>}
    </div>
  );
}
