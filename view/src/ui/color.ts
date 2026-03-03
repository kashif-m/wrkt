const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const normalizeHex = (value: string): string | null => {
  const raw = value.trim().replace('#', '');
  if (raw.length === 3 && /^[0-9a-fA-F]{3}$/.test(raw)) {
    return raw
      .split('')
      .map(char => `${char}${char}`)
      .join('');
  }
  if (raw.length === 6 && /^[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (raw.length === 8 && /^[0-9a-fA-F]{8}$/.test(raw)) return raw.slice(0, 6);
  return null;
};

export const addAlpha = (hex: string, alpha: number): string => {
  const normalizedHex = normalizeHex(hex);
  if (!normalizedHex) return hex;
  const alphaHex = Math.round(clamp01(alpha) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${normalizedHex}${alphaHex}`;
};
