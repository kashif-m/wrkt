const COMBINING_MARKS = /[\u0300-\u036f]/g;
const SEPARATORS = /[^a-z0-9]+/g;
const WHITESPACE = /\s+/g;

const normalizeCore = (text: string) =>
  text
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(SEPARATORS, ' ')
    .replace(WHITESPACE, ' ')
    .trim();

export const normalizeSearchText = (text: string) => normalizeCore(text);

const compact = (text: string) => text.replace(/\s+/g, '');

const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
};

const fuzzyTokenScore = (needle: string, haystack: string): number | null => {
  const needleTokens = needle.split(' ').filter(Boolean);
  const hayTokens = haystack.split(' ').filter(Boolean);
  if (!needleTokens.length || !hayTokens.length) return null;
  let score = 0;
  for (const needleToken of needleTokens) {
    let best = Infinity;
    for (const hayToken of hayTokens) {
      const distance = levenshtein(needleToken, hayToken);
      if (distance < best) best = distance;
      if (distance === 0) break;
    }
    const maxDistance = Math.max(1, Math.floor(needleToken.length * 0.34));
    if (best > maxDistance) return null;
    score += Math.max(0, 120 - best * 25 - needleToken.length);
  }
  return score;
};

const scoreNormalizedMatch = (
  normalizedNeedle: string,
  normalizedHaystack: string,
): number | null => {
  if (!normalizedNeedle || !normalizedHaystack) return null;
  if (normalizedHaystack === normalizedNeedle) return 1000;
  if (normalizedHaystack.startsWith(normalizedNeedle)) {
    return 900 - normalizedNeedle.length;
  }
  const includesIndex = normalizedHaystack.indexOf(normalizedNeedle);
  if (includesIndex >= 0) {
    return 800 - includesIndex;
  }
  const compactNeedle = compact(normalizedNeedle);
  const compactHaystack = compact(normalizedHaystack);
  const compactIndex = compactHaystack.indexOf(compactNeedle);
  if (compactIndex >= 0) {
    return 760 - compactIndex;
  }
  return fuzzyTokenScore(normalizedNeedle, normalizedHaystack);
};

export const exerciseSearchScore = (
  needle: string,
  ...haystacks: Array<string | undefined | null>
): number | null => {
  const normalizedNeedle = normalizeCore(needle);
  if (!normalizedNeedle) return 0;
  let best: number | null = null;
  haystacks.forEach(value => {
    if (!value) return;
    const normalized = normalizeCore(value);
    const score = scoreNormalizedMatch(normalizedNeedle, normalized);
    if (score === null) return;
    if (best === null || score > best) {
      best = score;
    }
  });
  return best;
};

export const matchesExerciseSearch = (
  needle: string,
  ...haystacks: Array<string | undefined | null>
): boolean => {
  const score = exerciseSearchScore(needle, ...haystacks);
  return score !== null;
};
