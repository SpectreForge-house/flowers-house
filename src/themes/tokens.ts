export interface ThemeTokens {
  name: string;
  label: string;
  description: string;
  preview: {
    background: string;
    sidebar: string;
    card: string;
    accent: string;
    accent2: string;
    text: string;
  };
  colors: {
    background: string;
    sidebar: string;
    card: string;
    surface: string;
    hover: string;
    elevated: string;
    overlay: string;
    border: string;
    borderFocus: string;
    borderError: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textInverse: string;
    accent: string;
    accentLight: string;
    accent2: string;
    accent2Light: string;
    accentText: string;
    statusSuccess: string;
    statusWarning: string;
    statusDanger: string;
    statusInfo: string;
    statusNeutral: string;
    chart1: string;
    chart2: string;
    chart3: string;
    chart4: string;
    chart5: string;
    chartAxis: string;
    chartGrid: string;
    shadowColor: string;
    ringColor: string;
  };
}

export type BuiltInThemeId =
  | 'midnight'
  | 'botanical'
  | 'blossom'
  | 'minimal-light'
  | 'luxury'
  | 'ocean'
  | 'lavender'
  | 'autumn'
  | 'office-plant'
  | 'grandmas-carpet'
  | 'strawberry-milk'
  | 'neon-funeral'
  | 'golden-hour'
  | 'wet-asphalt'
  | 'cyber-tulip'
  | 'deadline';

export type CustomThemeId = `custom-${string}`;

export type ThemeId = BuiltInThemeId | CustomThemeId;

export function isCustomThemeId(id: string): id is CustomThemeId {
  return id.startsWith('custom-');
}
