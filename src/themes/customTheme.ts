import { CustomThemeId, ThemeTokens, isCustomThemeId } from './tokens';

export const CUSTOM_THEMES_STORAGE_KEY = 'flower-shop-custom-themes';

export type ThemeMode = 'dark' | 'light';

export interface CustomThemeColorsInput {
  background: string;
  card: string;
  accent: string;
  accent2: string;
  text: string;
}

export interface CustomThemeInput {
  label: string;
  description?: string;
  mode: ThemeMode;
  colors: CustomThemeColorsInput;
}

export interface CustomTheme extends ThemeTokens {
  id: CustomThemeId;
  createdAt: string;
  mode: ThemeMode;
  sourceColors: CustomThemeColorsInput;
}

const COLOR_KEYS: (keyof ThemeTokens['colors'])[] = [
  'background',
  'sidebar',
  'card',
  'surface',
  'hover',
  'elevated',
  'overlay',
  'border',
  'borderFocus',
  'borderError',
  'textPrimary',
  'textSecondary',
  'textMuted',
  'textInverse',
  'accent',
  'accentLight',
  'accent2',
  'accent2Light',
  'accentText',
  'statusSuccess',
  'statusWarning',
  'statusDanger',
  'statusInfo',
  'statusNeutral',
  'chart1',
  'chart2',
  'chart3',
  'chart4',
  'chart5',
  'chartAxis',
  'chartGrid',
  'shadowColor',
  'ringColor',
];

function normalizeHex(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .slice(1)
      .split('')
      .map((char) => char + char)
      .join('')}`.toLowerCase();
  }
  return '#000000';
}

function parseHex(value: string): [number, number, number] {
  const hex = normalizeHex(value).slice(1);
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function toHex(channel: number): string {
  return Math.round(Math.min(255, Math.max(0, channel)))
    .toString(16)
    .padStart(2, '0');
}

function mix(colorA: string, colorB: string, weightB: number): string {
  const a = parseHex(colorA);
  const b = parseHex(colorB);
  const t = Math.min(1, Math.max(0, weightB));
  return `#${toHex(a[0] + (b[0] - a[0]) * t)}${toHex(a[1] + (b[1] - a[1]) * t)}${toHex(
    a[2] + (b[2] - a[2]) * t
  )}`;
}

function lighten(color: string, amount: number): string {
  return mix(color, '#ffffff', amount);
}

function darken(color: string, amount: number): string {
  return mix(color, '#000000', amount);
}

function relativeLuminance(color: string): number {
  const [r, g, b] = parseHex(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function readableText(background: string): string {
  return relativeLuminance(background) > 0.45 ? '#151515' : '#ffffff';
}

export function buildCustomThemeTokens(input: CustomThemeInput): ThemeTokens {
  const { mode, colors } = input;
  const isDark = mode === 'dark';
  const background = normalizeHex(colors.background);
  const card = normalizeHex(colors.card);
  const accent = normalizeHex(colors.accent);
  const accent2 = normalizeHex(colors.accent2);
  const text = normalizeHex(colors.text);

  const shift = (amount: number) => (isDark ? lighten(card, amount) : darken(card, amount));
  const sidebar = isDark ? lighten(background, 0.035) : darken(background, 0.04);
  const border = shift(0.16);
  const textSecondary = mix(text, background, 0.35);
  const textMuted = mix(text, background, 0.55);
  const statusSuccess = isDark ? '#5fbf7a' : '#2f7d46';
  const statusWarning = isDark ? '#e0b04a' : '#a06c12';
  const statusDanger = isDark ? '#ef6b6b' : '#b3261e';
  const statusInfo = isDark ? '#63a9e8' : '#2f6690';
  const statusNeutral = isDark ? '#8291a0' : '#6d7a86';

  return {
    name: input.label.trim(),
    label: input.label.trim(),
    description: input.description?.trim() ?? '',
    preview: {
      background,
      sidebar,
      card,
      accent,
      accent2,
      text,
    },
    colors: {
      background,
      sidebar,
      card,
      surface: isDark ? lighten(card, 0.03) : darken(card, 0.02),
      hover: shift(0.08),
      elevated: shift(0.14),
      overlay: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.35)',
      border,
      borderFocus: accent,
      borderError: statusDanger,
      textPrimary: text,
      textSecondary,
      textMuted,
      textInverse: isDark ? background : '#ffffff',
      accent,
      accentLight: isDark ? lighten(accent, 0.18) : darken(accent, 0.12),
      accent2,
      accent2Light: isDark ? lighten(accent2, 0.18) : darken(accent2, 0.12),
      accentText: readableText(accent),
      statusSuccess,
      statusWarning,
      statusDanger,
      statusInfo,
      statusNeutral,
      chart1: accent,
      chart2: isDark ? lighten(accent, 0.18) : darken(accent, 0.12),
      chart3: accent2,
      chart4: isDark ? lighten(accent2, 0.18) : darken(accent2, 0.12),
      chart5: mix(accent, accent2, 0.5),
      chartAxis: textSecondary,
      chartGrid: border,
      shadowColor: isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.12)',
      ringColor: accent,
    },
  };
}

export function createCustomTheme(input: CustomThemeInput): CustomTheme {
  const tokens = buildCustomThemeTokens(input);
  const id = `custom-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}` as CustomThemeId;

  return {
    ...tokens,
    id,
    createdAt: new Date().toISOString(),
    mode: input.mode,
    sourceColors: {
      background: normalizeHex(input.colors.background),
      card: normalizeHex(input.colors.card),
      accent: normalizeHex(input.colors.accent),
      accent2: normalizeHex(input.colors.accent2),
      text: normalizeHex(input.colors.text),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidCustomTheme(value: unknown): value is CustomTheme {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || !isCustomThemeId(value.id)) return false;
  if (typeof value.label !== 'string' || !value.label.trim()) return false;
  if (typeof value.description !== 'string') return false;
  if (!isRecord(value.preview)) return false;
  if (!COLOR_KEYS.every((key) => typeof value.colors?.[key as string] === 'string')) {
    return false;
  }
  return true;
}

export function loadCustomThemes(): CustomTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidCustomTheme);
  } catch (error) {
    console.error('Error loading custom themes:', error);
    return [];
  }
}

export function saveCustomThemes(customThemes: CustomTheme[]): void {
  try {
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(customThemes));
  } catch (error) {
    console.error('Error saving custom themes:', error);
  }
}

export function isLightColor(color: string): boolean {
  return relativeLuminance(color) > 0.45;
}
