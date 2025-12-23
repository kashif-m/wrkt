import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  JsonArray,
  JsonObject,
  getExerciseCatalog,
  validateExercise,
} from '../TrackerEngine';
import {
  DisplayLabel,
  ExerciseName,
  ExerciseSlug,
  ExerciseSource,
  LoggingMode,
  Modality,
  MuscleGroup,
  Tag,
  JsonText,
  asDisplayLabel,
  asExerciseName,
  asExerciseSlug,
  asExerciseSource,
  asMuscleGroup,
  asTag,
  toLoggingMode,
  toModality,
} from '../domain/types';

const CUSTOM_EXERCISES_KEY = 'strata.workout.customExercises';
const FAVORITES_KEY = 'strata.workout.favoriteExercises';

export interface BaseExerciseCatalogEntry {
  slug: ExerciseSlug;
  display_name: ExerciseName;
  primary_muscle_group: MuscleGroup;
  secondary_groups: MuscleGroup[];
  modality: Modality;
  logging_mode: LoggingMode;
  suggested_load_range: { min: number; max: number };
  tags?: Tag[];
}

export type ExerciseCatalogEntry = BaseExerciseCatalogEntry & {
  source: ExerciseSource;
  archived?: boolean;
};

const readCustomExercises = async (): Promise<ExerciseCatalogEntry[]> => {
  const raw = await AsyncStorage.getItem(CUSTOM_EXERCISES_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as JsonArray;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(entry => ({
      ...normalizeEntry(entry as JsonObject),
      source: asExerciseSource('custom'),
      archived: Boolean((entry as any)?.archived),
    }));
  } catch (error) {
    console.warn('Failed to parse custom catalog', error);
    return [];
  }
};

const writeCustomExercises = async (items: ExerciseCatalogEntry[]) => {
  await AsyncStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(items));
};

const readFavoriteSlugs = async (): Promise<ExerciseSlug[]> => {
  const raw = await AsyncStorage.getItem(FAVORITES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(item => asExerciseSlug(String(item)))
      : [];
  } catch (error) {
    console.warn('Failed to parse favorites', error);
    return [];
  }
};

const writeFavoriteSlugs = async (slugs: ExerciseSlug[]) => {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(slugs));
};

const normalizeEntry = (entry: JsonObject): BaseExerciseCatalogEntry => {
  const toArray = (value: unknown): DisplayLabel[] =>
    Array.isArray(value) ? value.map(item => asDisplayLabel(String(item))) : [];
  const toMuscleGroups = (value: unknown): MuscleGroup[] =>
    toArray(value).map(item => asMuscleGroup(item));
  const toTags = (value: unknown): Tag[] =>
    toArray(value).map(item => asTag(item));
  const rangeValue = (value: unknown): { min: number; max: number } => {
    if (
      value &&
      typeof value === 'object' &&
      'min' in (value as any) &&
      'max' in (value as any)
    ) {
      return {
        min: Number((value as any).min) || 0,
        max: Number((value as any).max) || 0,
      };
    }
    return { min: 0, max: 0 };
  };
  return {
    slug: asExerciseSlug(String(entry.slug ?? '')),
    display_name: asExerciseName(String(entry.display_name ?? '')),
    primary_muscle_group: asMuscleGroup(
      String(entry.primary_muscle_group ?? ''),
    ),
    secondary_groups: toMuscleGroups(entry.secondary_groups),
    modality: toModality(String(entry.modality ?? '')),
    logging_mode: toLoggingMode(String(entry.logging_mode ?? '')),
    suggested_load_range: rangeValue(entry.suggested_load_range),
    tags: toTags(entry.tags),
  };
};

const parseCatalog = (
  data: JsonArray | JsonText | undefined,
): Array<BaseExerciseCatalogEntry> => {
  console.log(
    'parseCatalog: raw payload type',
    typeof data,
    Array.isArray(data) ? data.length : undefined,
  );
  let normalizedPayload: JsonArray | undefined = undefined;
  if (typeof data === 'string') {
    try {
      normalizedPayload = JSON.parse(data) as JsonArray;
    } catch (error) {
      console.warn('parseCatalog: failed to parse string payload', error);
      normalizedPayload = undefined;
    }
  } else if (Array.isArray(data)) {
    normalizedPayload = data;
  }
  if (!Array.isArray(normalizedPayload)) {
    console.warn('parseCatalog: expected array but got', data);
    return [];
  }
  const normalized = normalizedPayload
    .map(entry => normalizeEntry(entry as JsonObject))
    .filter(entry => entry.slug.length > 0 && entry.display_name.length > 0);
  console.log('parseCatalog: normalized entries', normalized.length);
  return normalized;
};

export const fetchMergedCatalog = async (): Promise<ExerciseCatalogEntry[]> => {
  const baseData = await getExerciseCatalog().catch(error => {
    console.warn('Failed to load catalog from Rust', error);
    return undefined;
  });
  console.debug('Fetched catalog from Rust', baseData);
  const base = parseCatalog(baseData);
  const custom = await readCustomExercises();
  console.debug('Merged default and custom catalog', {
    baseCount: base.length,
    customCount: custom.length,
  });
  const merged = [
    ...base.map(entry => ({ ...entry, source: asExerciseSource('default') })),
    ...custom
      .filter(entry => !entry.archived)
      .map(entry => ({ ...entry, source: asExerciseSource('custom') })),
  ];
  return merged;
};

const slugify = (value: ExerciseName | ExerciseSlug) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

export const listCustomExercises = async (includeArchived = true) => {
  const entries = await readCustomExercises();
  return includeArchived ? entries : entries.filter(entry => !entry.archived);
};

export const saveCustomExercise = async (
  entry: BaseExerciseCatalogEntry,
  options?: { originalSlug?: ExerciseSlug },
) => {
  const validated = normalizeEntry(
    await validateExercise(entry as unknown as JsonObject),
  );
  const slug = slugify(validated.slug ?? validated.display_name);
  const existing = await readCustomExercises();
  const targetSlug =
    options?.originalSlug ?? asExerciseSlug(slugify(validated.slug));
  const remaining = existing.filter(item => item.slug !== targetSlug);
  if (remaining.some(item => item.slug === asExerciseSlug(slug))) {
    throw new Error('Exercise already exists');
  }
  const archived =
    existing.find(item => item.slug === targetSlug)?.archived ??
    existing.find(item => item.slug === asExerciseSlug(slug))?.archived ??
    false;
  const merged: ExerciseCatalogEntry[] = [
    ...remaining,
    {
      ...validated,
      slug: asExerciseSlug(slug),
      source: asExerciseSource('custom'),
      archived,
    },
  ];
  await writeCustomExercises(merged);
  return merged;
};

export const setCustomExerciseArchived = async (
  slug: ExerciseSlug,
  archived: boolean,
) => {
  const existing = await readCustomExercises();
  const updated = existing.map(entry =>
    entry.slug === slug ? { ...entry, archived } : entry,
  );
  await writeCustomExercises(updated);
  return updated;
};

export const loadFavoriteExercises = async () => readFavoriteSlugs();

export const setExerciseFavorite = async (
  slug: ExerciseSlug,
  favorite: boolean,
) => {
  const current = await readFavoriteSlugs();
  const next = favorite
    ? Array.from(new Set([...current, slug]))
    : current.filter(item => item !== slug);
  await writeFavoriteSlugs(next);
  return next;
};
