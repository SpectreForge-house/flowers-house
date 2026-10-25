import { FormEvent, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useLanguage } from '../../i18n';
import {
  CustomThemeColorsInput,
  CustomThemeInput,
  ThemeMode,
  buildCustomThemeTokens,
} from '../../themes/customTheme';

interface ThemeCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode: ThemeMode;
  initialColors: CustomThemeColorsInput;
  onSave: (input: CustomThemeInput) => void;
}

export function ThemeCreatorModal({
  isOpen,
  onClose,
  initialMode,
  initialColors,
  onSave,
}: ThemeCreatorModalProps) {
  const { t } = useLanguage();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [colors, setColors] = useState<CustomThemeColorsInput>(initialColors);

  const colorFields: { key: keyof CustomThemeColorsInput; label: string }[] = [
    { key: 'background', label: t.themes.backgroundLabel },
    { key: 'card', label: t.themes.cardLabel },
    { key: 'accent', label: t.themes.accentLabel },
    { key: 'accent2', label: t.themes.accent2Label },
    { key: 'text', label: t.themes.textLabel },
  ];

  const preview = useMemo(
    () =>
      buildCustomThemeTokens({
        label: label.trim() || t.themes.previewTitle,
        description,
        mode,
        colors,
      }),
    [label, description, mode, colors, t.themes.previewTitle]
  );

  const canSave = label.trim().length > 0;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    onSave({ label: label.trim(), description: description.trim(), mode, colors });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.themes.createTitle} size="lg" closeOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <div>
              <label htmlFor="custom-theme-name" className="block text-sm font-medium text-text-secondary mb-1">
                {t.themes.nameLabel}
              </label>
              <input
                id="custom-theme-name"
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t.themes.namePlaceholder}
                maxLength={48}
                autoFocus
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="custom-theme-description" className="block text-sm font-medium text-text-secondary mb-1">
                {t.themes.descriptionLabel}
              </label>
              <input
                id="custom-theme-description"
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t.themes.descriptionPlaceholder}
                maxLength={120}
                className="w-full"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-text-secondary mb-1">{t.themes.modeLabel}</span>
              <div className="grid grid-cols-2 gap-2">
                {(['dark', 'light'] as ThemeMode[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      mode === option
                        ? 'border-accent bg-accent/10 text-text-primary'
                        : 'border-border bg-surface text-text-secondary hover:border-accent-light'
                    }`}
                  >
                    {option === 'dark' ? t.themes.modeDark : t.themes.modeLight}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-text-secondary mb-2">{t.themes.colorsLabel}</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {colorFields.map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 cursor-pointer"
                  >
                    <input
                      type="color"
                      value={colors[field.key]}
                      onChange={(event) =>
                        setColors((previous) => ({ ...previous, [field.key]: event.target.value }))
                      }
                      className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs text-text-secondary">{field.label}</span>
                      <span className="block font-mono text-xs uppercase text-text-muted">
                        {colors[field.key]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium text-text-secondary mb-2">{t.themes.previewLabel}</span>
            <div
              className="rounded-xl border p-4"
              style={{
                backgroundColor: preview.colors.background,
                borderColor: preview.colors.border,
              }}
            >
              <div className="mb-3 flex gap-2">
                {[
                  preview.colors.accent,
                  preview.colors.accent2,
                  preview.colors.statusSuccess,
                  preview.colors.statusWarning,
                  preview.colors.textMuted,
                ].map((color) => (
                  <span
                    key={color}
                    className="h-6 w-6 rounded-full border"
                    style={{ backgroundColor: color, borderColor: preview.colors.border }}
                  />
                ))}
              </div>

              <div
                className="rounded-lg p-3"
                style={{
                  backgroundColor: preview.colors.card,
                  border: `1px solid ${preview.colors.border}`,
                }}
              >
                <p className="text-sm font-semibold" style={{ color: preview.colors.textPrimary }}>
                  {label.trim() || t.themes.previewTitle}
                </p>
                <p className="mt-1 text-xs" style={{ color: preview.colors.textSecondary }}>
                  {t.themes.previewText}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className="rounded-md px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: preview.colors.accent, color: preview.colors.accentText }}
                  >
                    {t.common.save}
                  </span>
                  <span
                    className="rounded-md border px-3 py-1.5 text-xs font-medium"
                    style={{ color: preview.colors.textPrimary, borderColor: preview.colors.border }}
                  >
                    {t.common.cancel}
                  </span>
                </div>
                <div className="mt-3 h-1.5 rounded-full" style={{ backgroundColor: preview.colors.elevated }}>
                  <div
                    className="h-full w-2/3 rounded-full"
                    style={{ backgroundColor: preview.colors.accent }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" disabled={!canSave}>
            {t.themes.saveTheme}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
