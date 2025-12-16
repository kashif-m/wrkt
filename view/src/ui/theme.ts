export const palette = {
  background: "#0b1120",
  surface: "#111b32",
  mutedSurface: "#18213d",
  primary: "#60a5fa",
  primaryMuted: "#1d4ed8",
  text: "#f1f5f9",
  mutedText: "#93a4c3",
  border: "#1f2a44",
  success: "#4ade80",
  warning: "#facc15",
  danger: "#f87171",
}

export const spacing = (factor: number) => factor * 8

export const radius = {
  card: 16,
  pill: 999,
}

export const typography = {
  title: { fontSize: 24, fontWeight: "600" as const, color: palette.text },
  section: { fontSize: 16, fontWeight: "600" as const, color: palette.text },
  body: { fontSize: 14, color: palette.text },
  label: { fontSize: 12, fontWeight: "500" as const, color: palette.mutedText },
}
