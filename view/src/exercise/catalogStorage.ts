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
const DEFAULT_OVERRIDES_KEY = 'strata.workout.defaultOverrides';
const FAVORITES_KEY = 'strata.workout.favoriteExercises';
const HIDDEN_EXERCISES_KEY = 'strata.workout.hiddenExercises';

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

export type ManageArchiveSource = 'hidden_default' | 'archived_custom';

export type ManageCatalogEntry = ExerciseCatalogEntry & {
  archiveSource?: ManageArchiveSource;
};

export type ManageCatalogSnapshot = {
  active: ManageCatalogEntry[];
  archived: ManageCatalogEntry[];
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

const readDefaultOverrides = async (): Promise<BaseExerciseCatalogEntry[]> => {
  const raw = await AsyncStorage.getItem(DEFAULT_OVERRIDES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as JsonArray;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(entry => normalizeEntry(entry as JsonObject))
      .filter(entry => entry.slug.length > 0 && entry.display_name.length > 0);
  } catch (error) {
    console.warn('Failed to parse default overrides', error);
    return [];
  }
};

const writeDefaultOverrides = async (items: BaseExerciseCatalogEntry[]) => {
  await AsyncStorage.setItem(DEFAULT_OVERRIDES_KEY, JSON.stringify(items));
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

const readHiddenSlugs = async (): Promise<ExerciseSlug[]> => {
  const raw = await AsyncStorage.getItem(HIDDEN_EXERCISES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(item => asExerciseSlug(String(item)))
      : [];
  } catch (error) {
    console.warn('Failed to parse hidden exercises', error);
    return [];
  }
};

const writeHiddenSlugs = async (slugs: ExerciseSlug[]) => {
  await AsyncStorage.setItem(HIDDEN_EXERCISES_KEY, JSON.stringify(slugs));
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
  let normalizedPayload: JsonArray | undefined;
  if (typeof data === 'string') {
    try {
      normalizedPayload = JSON.parse(data) as JsonArray;
    } catch (error) {
      console.warn('Failed to parse catalog payload', error);
      normalizedPayload = undefined;
    }
  } else if (Array.isArray(data)) {
    normalizedPayload = data;
  }
  if (!Array.isArray(normalizedPayload)) {
    console.warn('Catalog payload is not an array');
    return [];
  }
  const normalized = normalizedPayload
    .map(entry => normalizeEntry(entry as JsonObject))
    .filter(entry => entry.slug.length > 0 && entry.display_name.length > 0);
  return normalized;
};

export const fetchMergedCatalog = async (): Promise<ExerciseCatalogEntry[]> => {
  const snapshot = await fetchManageCatalogEntries();
  return snapshot.active.map(
    ({ archiveSource: _archiveSource, ...entry }) => entry,
  );
};

export const fetchManageCatalogEntries =
  async (): Promise<ManageCatalogSnapshot> => {
    const baseData = await getExerciseCatalog().catch(error => {
      console.warn('Failed to load catalog from Rust', error);
      return undefined;
    });
    const base = parseCatalog(baseData);
    const custom = await readCustomExercises();
    const overrides = await readDefaultOverrides();
    const overrideMap = new Map(
      overrides.map(entry => [String(entry.slug), entry]),
    );
    const hidden = await readHiddenSlugs();
    const hiddenSet = new Set(hidden.map(slug => String(slug)));

    const defaultsVisible: ManageCatalogEntry[] = [];
    const defaultsArchived: ManageCatalogEntry[] = [];
    base.forEach(entry => {
      const override = overrideMap.get(String(entry.slug));
      const next = {
        ...(override ?? entry),
        source: asExerciseSource('default'),
      };
      if (hiddenSet.has(String(entry.slug))) {
        defaultsArchived.push({
          ...next,
          archived: true,
          archiveSource: 'hidden_default',
        });
        return;
      }
      defaultsVisible.push(next);
    });

    const customVisible: ManageCatalogEntry[] = [];
    const customArchived: ManageCatalogEntry[] = [];
    custom
      .filter(entry => !overrideMap.has(String(entry.slug)))
      .forEach(entry => {
        const next = { ...entry, source: asExerciseSource('custom') };
        if (entry.archived) {
          customArchived.push({
            ...next,
            archived: true,
            archiveSource: 'archived_custom',
          });
          return;
        }
        customVisible.push(next);
      });

    return {
      active: [...defaultsVisible, ...customVisible],
      archived: [...defaultsArchived, ...customArchived],
    };
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
  entry: BaseExerciseCatalogEntry | ExerciseCatalogEntry,
  options?: { originalSlug?: ExerciseSlug },
) => {
  const validated = normalizeEntry(
    await validateExercise(entry as unknown as JsonObject),
  );
  const requestedSource =
    'source' in entry && entry.source === asExerciseSource('default')
      ? asExerciseSource('default')
      : asExerciseSource('custom');
  const targetSlug =
    options?.originalSlug ?? asExerciseSlug(slugify(validated.slug));

  if (requestedSource === asExerciseSource('default')) {
    const existing = await readDefaultOverrides();
    const merged: BaseExerciseCatalogEntry[] = [
      ...existing.filter(item => item.slug !== targetSlug),
      {
        ...validated,
        slug: targetSlug,
      },
    ];
    await writeDefaultOverrides(merged);
    return merged;
  }

  const slug = slugify(validated.slug ?? validated.display_name);
  const existing = await readCustomExercises();
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

export const deleteCustomExercise = async (slug: ExerciseSlug) => {
  const existing = await readCustomExercises();
  const next = existing.filter(entry => entry.slug !== slug);
  await writeCustomExercises(next);
  return next;
};

export const removeDefaultOverride = async (slug: ExerciseSlug) => {
  const existing = await readDefaultOverrides();
  const next = existing.filter(entry => entry.slug !== slug);
  await writeDefaultOverrides(next);
  return next;
};

export const setExerciseHidden = async (
  slug: ExerciseSlug,
  hidden: boolean,
) => {
  const current = await readHiddenSlugs();
  const next = hidden
    ? Array.from(new Set([...current, slug]))
    : current.filter(item => item !== slug);
  await writeHiddenSlugs(next);
  return next;
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
