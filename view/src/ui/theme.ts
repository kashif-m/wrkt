import { ColorHex, asColorHex } from '../domain/types';

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

export const palette: Palette = {
  // Base
  background: asColorHex('#0B1220'), // deep navy (less harsh than pure near-black)
  surface: asColorHex('#111A2E'), // primary card surface
  mutedSurface: asColorHex('#172342'), // elevated/secondary surface

  // Brand / Actions
  primary: asColorHex('#5FA8FF'), // calm sky-blue (good contrast on dark)
  primaryMuted: asColorHex('#2B66F0'), // deeper action/pressed state

  // Text
  text: asColorHex('#EAF2FF'), // slightly softer than pure white
  mutedText: asColorHex('#9AAAC7'), // readable but clearly secondary

  // UI Chrome
  border: asColorHex('#223154'), // clearer separation on dark surfaces

  // Status
  success: asColorHex('#34D399'), // softer green
  warning: asColorHex('#F4C84A'), // less neon yellow, still “warning”
  danger: asColorHex('#F87171'), // keep; already good on dark
};

export const spacing = (factor: number) => factor * 8;

export const radius = {
  card: 16,
  pill: 999,
};

export const typography = {
  title: { fontSize: 24, fontWeight: '600' as const, color: palette.text },
  section: { fontSize: 16, fontWeight: '600' as const, color: palette.text },
  body: { fontSize: 14, color: palette.text },
  label: { fontSize: 12, fontWeight: '500' as const, color: palette.mutedText },
};

export const fontSizes = {
  actionButton: 16,
  body: 14,
};
