import { ColorHex, asColorHex } from '../domain/types';

export type ThemeMode =
  | 'dark'
  | 'light'
  | 'midnight_black'
  | 'charcoal_black'
  | 'burgundy'
  | 'forest_night'
  | 'slate_blue'
  | 'sepia_dark';
export type AccentKey =
  | 'blue'
  | 'sky'
  | 'cyan'
  | 'teal'
  | 'emerald'
  | 'green'
  | 'lime'
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'red'
  | 'rose'
  | 'pink'
  | 'purple'
  | 'violet'
  | 'indigo'
  | 'custom';

type Palette = {
  background: ColorHex;
  surface: ColorHex;
  mutedSurface: ColorHex;
  primary: ColorHex;
  primaryMuted: ColorHex;
  text: ColorHex;
  mutedText: ColorHex;
  border: ColorHex;
  success: ColorHex;
  warning: ColorHex;
  danger: ColorHex;
};

const modePaletteMap: Record<
  ThemeMode,
  Omit<Palette, 'primary' | 'primaryMuted'>
> = {
  dark: {
    background: asColorHex('#0B1220'),
    surface: asColorHex('#111A2E'),
    mutedSurface: asColorHex('#172342'),
    text: asColorHex('#EAF2FF'),
    mutedText: asColorHex('#9AAAC7'),
    border: asColorHex('#223154'),
    success: asColorHex('#34D399'),
    warning: asColorHex('#F4C84A'),
    danger: asColorHex('#F87171'),
  },
  light: {
    background: asColorHex('#F5F8FF'),
    surface: asColorHex('#FFFFFF'),
    mutedSurface: asColorHex('#EAF1FF'),
    text: asColorHex('#0E1A2B'),
    mutedText: asColorHex('#4A5B78'),
    border: asColorHex('#D3DDF2'),
    success: asColorHex('#1F9D68'),
    warning: asColorHex('#C28100'),
    danger: asColorHex('#D24949'),
  },
  midnight_black: {
    background: asColorHex('#05070D'),
    surface: asColorHex('#0A1020'),
    mutedSurface: asColorHex('#121A2C'),
    text: asColorHex('#E9F0FF'),
    mutedText: asColorHex('#9AA9C6'),
    border: asColorHex('#1D2942'),
    success: asColorHex('#34D399'),
    warning: asColorHex('#F4C84A'),
    danger: asColorHex('#F87171'),
  },
  charcoal_black: {
    background: asColorHex('#131416'),
    surface: asColorHex('#1A1C21'),
    mutedSurface: asColorHex('#23262C'),
    text: asColorHex('#F2F4F8'),
    mutedText: asColorHex('#AAB0BC'),
    border: asColorHex('#343944'),
    success: asColorHex('#4FD48D'),
    warning: asColorHex('#F4C568'),
    danger: asColorHex('#F07A7A'),
  },
  burgundy: {
    background: asColorHex('#1C0F16'),
    surface: asColorHex('#281420'),
    mutedSurface: asColorHex('#381B2B'),
    text: asColorHex('#FFE9F2'),
    mutedText: asColorHex('#D1A9BD'),
    border: asColorHex('#563046'),
    success: asColorHex('#4ED4A0'),
    warning: asColorHex('#F5C15B'),
    danger: asColorHex('#FF7C97'),
  },
  forest_night: {
    background: asColorHex('#0F1714'),
    surface: asColorHex('#15221D'),
    mutedSurface: asColorHex('#1E3029'),
    text: asColorHex('#EAF8F0'),
    mutedText: asColorHex('#9BBBAD'),
    border: asColorHex('#2D473D'),
    success: asColorHex('#41D38A'),
    warning: asColorHex('#EBC66C'),
    danger: asColorHex('#F07F7F'),
  },
  slate_blue: {
    background: asColorHex('#0F1322'),
    surface: asColorHex('#171D31'),
    mutedSurface: asColorHex('#222C47'),
    text: asColorHex('#EAF0FF'),
    mutedText: asColorHex('#A7B1CB'),
    border: asColorHex('#35415F'),
    success: asColorHex('#49CC93'),
    warning: asColorHex('#EFC96A'),
    danger: asColorHex('#F17D86'),
  },
  sepia_dark: {
    background: asColorHex('#1A1510'),
    surface: asColorHex('#241C15'),
    mutedSurface: asColorHex('#31261C'),
    text: asColorHex('#F8EEDF'),
    mutedText: asColorHex('#C4B39A'),
    border: asColorHex('#4A3A2A'),
    success: asColorHex('#6AC38D'),
    warning: asColorHex('#E7BB67'),
    danger: asColorHex('#E8897B'),
  },
};

const accentThemeMap: Record<
  Exclude<AccentKey, 'custom'>,
  { primary: ColorHex; primaryMuted: ColorHex }
> = {
  blue: {
    primary: asColorHex('#5FA8FF'),
    primaryMuted: asColorHex('#2B66F0'),
  },
  sky: {
    primary: asColorHex('#63C5FF'),
    primaryMuted: asColorHex('#2D8EC7'),
  },
  cyan: {
    primary: asColorHex('#54D2D2'),
    primaryMuted: asColorHex('#2D8F8F'),
  },
  teal: {
    primary: asColorHex('#5BD6C8'),
    primaryMuted: asColorHex('#2F9186'),
  },
  emerald: {
    primary: asColorHex('#46D98A'),
    primaryMuted: asColorHex('#2B8D5D'),
  },
  green: {
    primary: asColorHex('#6FD46A'),
    primaryMuted: asColorHex('#3F9140'),
  },
  lime: {
    primary: asColorHex('#B2D95B'),
    primaryMuted: asColorHex('#748C34'),
  },
  yellow: {
    primary: asColorHex('#F4D95B'),
    primaryMuted: asColorHex('#B79F34'),
  },
  amber: {
    primary: asColorHex('#F4C04A'),
    primaryMuted: asColorHex('#B78329'),
  },
  orange: {
    primary: asColorHex('#FFB45F'),
    primaryMuted: asColorHex('#C8792F'),
  },
  red: {
    primary: asColorHex('#F77A7A'),
    primaryMuted: asColorHex('#B14A4A'),
  },
  rose: {
    primary: asColorHex('#FF7FA4'),
    primaryMuted: asColorHex('#B5476D'),
  },
  pink: {
    primary: asColorHex('#F995D0'),
    primaryMuted: asColorHex('#B35C93'),
  },
  purple: {
    primary: asColorHex('#C78AFF'),
    primaryMuted: asColorHex('#8051B8'),
  },
  violet: {
    primary: asColorHex('#A68DFF'),
    primaryMuted: asColorHex('#6A56B8'),
  },
  indigo: {
    primary: asColorHex('#7E9BFF'),
    primaryMuted: asColorHex('#4A63B8'),
  },
};

let activeAccent: AccentKey = 'blue';
let activeThemeMode: ThemeMode = 'dark';
let activeCustomAccentHex: string | null = null;

export const accentOptions: ReadonlyArray<{
  key: AccentKey;
  label: string;
}> = [
  { key: 'blue', label: 'Blue' },
  { key: 'sky', label: 'Sky' },
  { key: 'cyan', label: 'Cyan' },
  { key: 'teal', label: 'Teal' },
  { key: 'emerald', label: 'Emerald' },
  { key: 'green', label: 'Green' },
  { key: 'lime', label: 'Lime' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'amber', label: 'Amber' },
  { key: 'orange', label: 'Orange' },
  { key: 'red', label: 'Red' },
  { key: 'rose', label: 'Rose' },
  { key: 'pink', label: 'Pink' },
  { key: 'purple', label: 'Purple' },
  { key: 'violet', label: 'Violet' },
  { key: 'indigo', label: 'Indigo' },
  { key: 'custom', label: 'Custom' },
];

export const themeModeOptions: ReadonlyArray<{
  key: ThemeMode;
  label: string;
}> = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'midnight_black', label: 'Midnight Black' },
  { key: 'charcoal_black', label: 'Charcoal Black' },
  { key: 'burgundy', label: 'Burgundy' },
  { key: 'forest_night', label: 'Forest Night' },
  { key: 'slate_blue', label: 'Slate Blue' },
  { key: 'sepia_dark', label: 'Sepia Dark' },
];

const normalizeHex = (value: string): string | null => {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) {
    return withHash.toUpperCase();
  }
  return null;
};

export const resolveAccentColor = (
  accent: AccentKey,
  customAccentHex?: string | null,
): ColorHex => {
  const customHex = customAccentHex ? normalizeHex(customAccentHex) : null;
  if (accent === 'custom' && customHex) {
    return asColorHex(customHex);
  }
  const resolved = accentThemeMap[accent === 'custom' ? 'blue' : accent];
  return resolved.primary;
};

export const resolveThemeModeColor = (mode: ThemeMode): ColorHex =>
  (modePaletteMap[mode] ?? modePaletteMap.dark).background;

const resolveModePalette = (mode: ThemeMode) =>
  modePaletteMap[mode] ?? modePaletteMap.dark;

const resolveAccentPalette = (
  accent: AccentKey,
  customAccentHex?: string | null,
) => {
  const customHex = customAccentHex ? normalizeHex(customAccentHex) : null;
  const resolvedAccent = resolveAccentColor(accent, customHex);
  return {
    primary: resolvedAccent,
    primaryMuted:
      accent === 'custom' && customHex
        ? resolvedAccent
        : accentThemeMap[accent === 'custom' ? 'blue' : accent].primaryMuted,
    customHex,
  };
};

const buildPalette = (
  mode: ThemeMode,
  accent: AccentKey,
  customAccentHex?: string | null,
): Palette => {
  const modePalette = modePaletteMap[mode] ?? modePaletteMap.dark;
  const accentPalette = resolveAccentPalette(accent, customAccentHex);
  return {
    ...modePalette,
    primary: accentPalette.primary,
    primaryMuted: accentPalette.primaryMuted,
  };
};

export let palette: Palette = buildPalette(
  activeThemeMode,
  activeAccent,
  activeCustomAccentHex,
);

export const applyThemeSettings = ({
  mode,
  accent,
  customAccentHex,
}: {
  mode: ThemeMode;
  accent: AccentKey;
  customAccentHex?: string | null;
}) => {
  activeThemeMode = mode;
  activeAccent = accent;
  const accentPalette = resolveAccentPalette(accent, customAccentHex);
  activeCustomAccentHex = accentPalette.customHex;
  palette = {
    ...resolveModePalette(mode),
    primary: accentPalette.primary,
    primaryMuted: accentPalette.primaryMuted,
  };
};

export const getActiveAccent = (): AccentKey => activeAccent;
export const getActiveThemeMode = (): ThemeMode => activeThemeMode;
export const getActiveCustomAccentHex = (): string | null =>
  activeCustomAccentHex;

export const spacing = (factor: number) => factor * 8;

export const radius = {
  card: 16,
  pill: 999,
};

export const analyticsUi = {
  controlHeight: 34,
  controlPaddingX: 12,
  controlPaddingY: 4,
  tabTapAnimationMs: 180,
  selectorRailPadding: 2,
  selectorRailGap: 2,
  selectorCardRadius: 14,
  cardShadowOpacity: 0.12,
  cardShadowRadius: 12,
  cardShadowOffsetY: 4,
};

export const cardShadowStyle = {
  shadowColor: '#000',
  shadowOpacity: analyticsUi.cardShadowOpacity,
  shadowRadius: analyticsUi.cardShadowRadius,
  shadowOffset: { width: 0, height: analyticsUi.cardShadowOffsetY },
  elevation: 2,
};

export const typography = {
  get title() {
    return {
      fontSize: 24,
      fontWeight: '600' as const,
      color: palette.text,
    };
  },
  get section() {
    return {
      fontSize: 16,
      fontWeight: '600' as const,
      color: palette.text,
    };
  },
  get body() {
    return {
      fontSize: 14,
      color: palette.text,
    };
  },
  get label() {
    return {
      fontSize: 12,
      fontWeight: '500' as const,
      color: palette.mutedText,
    };
  },
};

export const fontSizes = {
  actionButton: 16,
  body: 14,
};

export const getContrastTextColor = (hex: string): ColorHex => {
  const normalized = hex.replace('#', '');
  const clean = normalized.length >= 6 ? normalized.slice(0, 6) : normalized;
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  const [rs, gs, bs] = [r, g, b].map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  return asColorHex(luminance > 0.45 ? '#0f172a' : '#f8fafc');
};
