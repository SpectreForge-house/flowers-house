import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ThemeTokens, ThemeId, isCustomThemeId } from '../themes/tokens';
import { themes, getTheme as getBuiltInTheme } from '../themes';
import {
  CustomTheme,
  CustomThemeInput,
  createCustomTheme,
  loadCustomThemes,
  saveCustomThemes,
} from '../themes/customTheme';

const THEME_STORAGE_KEY = 'flower-shop-theme';

interface ThemeContextType {
  themeId: ThemeId;
  theme: ThemeTokens;
  customThemes: CustomTheme[];
  setTheme: (id: ThemeId) => void;
  addCustomTheme: (input: CustomThemeInput) => CustomTheme;
  deleteCustomTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function resolveTheme(id: ThemeId, customThemes: CustomTheme[]): ThemeTokens {
  if (isCustomThemeId(id)) {
    return customThemes.find((theme) => theme.id === id) ?? themes.midnight;
  }
  return getBuiltInTheme(id);
}

function getInitialThemeId(customThemes: CustomTheme[]): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      if (isCustomThemeId(stored)) {
        if (customThemes.some((theme) => theme.id === stored)) return stored;
      } else if (stored in themes) {
        return stored as ThemeId;
      }
    }
  } catch {}
  return 'midnight';
}

function saveThemeId(id: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {}
}

function applyThemeToDocument(theme: ThemeTokens, id: ThemeId) {
  const root = document.documentElement;
  const c = theme.colors;
  root.style.setProperty('--background', c.background);
  root.style.setProperty('--sidebar', c.sidebar);
  root.style.setProperty('--card', c.card);
  root.style.setProperty('--surface', c.surface);
  root.style.setProperty('--hover', c.hover);
  root.style.setProperty('--elevated', c.elevated);
  root.style.setProperty('--overlay', c.overlay);
  root.style.setProperty('--border-color', c.border);
  root.style.setProperty('--border-focus', c.borderFocus);
  root.style.setProperty('--border-error', c.borderError);
  root.style.setProperty('--text-primary', c.textPrimary);
  root.style.setProperty('--text-secondary', c.textSecondary);
  root.style.setProperty('--text-muted', c.textMuted);
  root.style.setProperty('--text-inverse', c.textInverse);
  root.style.setProperty('--accent', c.accent);
  root.style.setProperty('--accent-light', c.accentLight);
  root.style.setProperty('--accent-2', c.accent2);
  root.style.setProperty('--accent-2-light', c.accent2Light);
  root.style.setProperty('--accent-text', c.accentText);
  root.style.setProperty('--status-success', c.statusSuccess);
  root.style.setProperty('--status-warning', c.statusWarning);
  root.style.setProperty('--status-danger', c.statusDanger);
  root.style.setProperty('--status-info', c.statusInfo);
  root.style.setProperty('--status-neutral', c.statusNeutral);
  root.style.setProperty('--chart-1', c.chart1);
  root.style.setProperty('--chart-2', c.chart2);
  root.style.setProperty('--chart-3', c.chart3);
  root.style.setProperty('--chart-4', c.chart4);
  root.style.setProperty('--chart-5', c.chart5);
  root.style.setProperty('--chart-axis', c.chartAxis);
  root.style.setProperty('--chart-grid', c.chartGrid);
  root.style.setProperty('--shadow-color', c.shadowColor);
  root.style.setProperty('--ring-color', c.ringColor);
  root.setAttribute('data-theme', id);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(loadCustomThemes);
  const [themeId, setThemeIdState] = useState<ThemeId>(() => getInitialThemeId(loadCustomThemes()));
  const [theme, setThemeState] = useState<ThemeTokens>(() => resolveTheme(themeId, customThemes));

  const setTheme = useCallback(
    (id: ThemeId) => {
      const exists = isCustomThemeId(id)
        ? customThemes.some((customTheme) => customTheme.id === id)
        : id in themes;
      const nextId: ThemeId = exists ? id : 'midnight';
      const newTheme = resolveTheme(nextId, customThemes);
      setThemeIdState(nextId);
      setThemeState(newTheme);
      applyThemeToDocument(newTheme, nextId);
      saveThemeId(nextId);
    },
    [customThemes]
  );

  const addCustomTheme = useCallback(
    (input: CustomThemeInput) => {
      const created = createCustomTheme(input);
      const next = [...customThemes, created];
      setCustomThemes(next);
      saveCustomThemes(next);
      setThemeIdState(created.id);
      setThemeState(created);
      applyThemeToDocument(created, created.id);
      saveThemeId(created.id);
      return created;
    },
    [customThemes]
  );

  const deleteCustomTheme = useCallback(
    (id: ThemeId) => {
      if (!isCustomThemeId(id)) return;
      const next = customThemes.filter((customTheme) => customTheme.id !== id);
      setCustomThemes(next);
      saveCustomThemes(next);
      if (themeId === id) setTheme('midnight');
    },
    [customThemes, themeId, setTheme]
  );

  useEffect(() => {
    applyThemeToDocument(theme, themeId);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ themeId, theme, customThemes, setTheme, addCustomTheme, deleteCustomTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
