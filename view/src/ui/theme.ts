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
  background: asColorHex('#0b1120'),
  surface: asColorHex('#111b32'),
  mutedSurface: asColorHex('#18213d'),
  primary: asColorHex('#60a5fa'),
  primaryMuted: asColorHex('#1d4ed8'),
  text: asColorHex('#f1f5f9'),
  mutedText: asColorHex('#93a4c3'),
  border: asColorHex('#1f2a44'),
  success: asColorHex('#4ade80'),
  warning: asColorHex('#facc15'),
  danger: asColorHex('#f87171'),
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
