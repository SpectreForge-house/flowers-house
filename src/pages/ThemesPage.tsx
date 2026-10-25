import { useState } from 'react';
import { Check, Lightbulb, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { themes, getThemeIds, ThemeId } from '../themes';
import { CustomTheme, isLightColor } from '../themes/customTheme';
import { useLanguage } from '../i18n';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { showToast } from '../components/ui/Toast';
import { ThemeCreatorModal } from '../components/themes/ThemeCreatorModal';

export function ThemesPage() {
  const { theme, themeId, setTheme, customThemes, addCustomTheme, deleteCustomTheme } = useTheme();
  const { t } = useLanguage();
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [themeToDelete, setThemeToDelete] = useState<CustomTheme | null>(null);

  const themeEntries: { id: ThemeId; theme: (typeof themes)[keyof typeof themes]; isCustom: boolean }[] = [
    ...getThemeIds().map((id) => ({ id: id as ThemeId, theme: themes[id], isCustom: false })),
    ...customThemes.map((customTheme) => ({
      id: customTheme.id as ThemeId,
      theme: customTheme,
      isCustom: true,
    })),
  ];

  const steps = [
    { title: t.themes.howTo1Title, text: t.themes.howTo1 },
    { title: t.themes.howTo2Title, text: t.themes.howTo2 },
    { title: t.themes.howTo3Title, text: t.themes.howTo3 },
    { title: t.themes.howTo4Title, text: t.themes.howTo4 },
  ];

  const handleCreate = (input: Parameters<typeof addCustomTheme>[0]) => {
    const created = addCustomTheme(input);
    setIsCreatorOpen(false);
    showToast('success', t.themes.created.replace('{name}', created.label));
  };

  const handleDelete = () => {
    if (!themeToDelete) return;
    deleteCustomTheme(themeToDelete.id);
    showToast('success', t.themes.deleted.replace('{name}', themeToDelete.label));
    setThemeToDelete(null);
  };

  const initialMode = isLightColor(theme.colors.background) ? 'light' : 'dark';
  const initialColors = {
    background: theme.colors.background,
    card: theme.colors.card,
    accent: theme.colors.accent,
    accent2: theme.colors.accent2,
    text: theme.colors.textPrimary,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t.nav.themes}</h1>
          <p className="text-text-secondary mt-1">{t.themes.description}</p>
        </div>
        <Button onClick={() => setIsCreatorOpen(true)}>
          <Plus size={18} />
          {t.themes.create}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2 text-accent">
          <Lightbulb size={18} />
          <h2 className="font-semibold">{t.themes.howToTitle}</h2>
        </div>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-text">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-text-primary">{step.title}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 border-t border-border pt-3 text-xs text-text-muted">{t.themes.howToNote}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {themeEntries.map(({ id, theme: themeEntry, isCustom }) => {
          const isSelected = themeId === id;

          return (
            <div
              key={id}
              className={`relative rounded-xl border-2 transition-all duration-200 overflow-hidden ${
                isSelected
                  ? 'border-accent shadow-theme scale-[1.02]'
                  : 'border-border hover:border-accent-light hover:shadow-theme'
              }`}
            >
              <button
                type="button"
                onClick={() => setTheme(id)}
                className="block w-full p-4 space-y-3 text-left focus:outline-none"
              >
                <div className="flex gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border border-border"
                    style={{ backgroundColor: themeEntry.preview.background }}
                  />
                  <div
                    className="w-8 h-8 rounded-lg border border-border"
                    style={{ backgroundColor: themeEntry.preview.sidebar }}
                  />
                  <div
                    className="w-8 h-8 rounded-lg border border-border"
                    style={{ backgroundColor: themeEntry.preview.card }}
                  />
                  <div
                    className="w-8 h-8 rounded-lg border border-border"
                    style={{ backgroundColor: themeEntry.preview.accent }}
                  />
                  <div
                    className="w-8 h-8 rounded-lg border border-border"
                    style={{ backgroundColor: themeEntry.preview.accent2 }}
                  />
                </div>

                <div>
                  <h3 className="flex flex-wrap items-center gap-2 font-semibold text-text-primary">
                    {themeEntry.label}
                    {isCustom && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                        <Sparkles size={10} />
                        {t.themes.customBadge}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    {themeEntry.description || t.themes.customDescription}
                  </p>
                </div>

                <div className="flex gap-1 pr-8">
                  {[
                    themeEntry.colors.statusSuccess,
                    themeEntry.colors.statusWarning,
                    themeEntry.colors.statusDanger,
                    themeEntry.colors.statusInfo,
                  ].map((color, index) => (
                    <div
                      key={index}
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </button>

              {isSelected && (
                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                  <Check size={14} className="text-accent-text" />
                </div>
              )}

              {isCustom && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setThemeToDelete(themeEntry as CustomTheme);
                  }}
                  title={t.common.delete}
                  aria-label={`${t.common.delete}: ${themeEntry.label}`}
                  className="absolute bottom-3 right-3 rounded-md p-1.5 text-text-muted transition-colors hover:bg-status-danger/10 hover:text-status-danger"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <ThemeCreatorModal
        key={themeId}
        isOpen={isCreatorOpen}
        onClose={() => setIsCreatorOpen(false)}
        initialMode={initialMode}
        initialColors={initialColors}
        onSave={handleCreate}
      />

      <ConfirmDialog
        isOpen={themeToDelete !== null}
        onClose={() => setThemeToDelete(null)}
        onConfirm={handleDelete}
        title={t.themes.deleteTitle}
        message={t.themes.deleteMessage.replace('{name}', themeToDelete?.label ?? '')}
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
      />
    </div>
  );
}
