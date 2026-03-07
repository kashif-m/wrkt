import DocumentPicker from 'react-native-document-picker';
import { JsonObject, importFitnotes } from '../TrackerEngine';
import {
  BaseExerciseCatalogEntry,
  fetchMergedCatalog,
  listCustomExercises,
  saveCustomExercise,
  setExerciseFavorite,
} from '../exercise/catalogStorage';
import { insertEvents } from '../storage';
import {
  asEventId,
  asExerciseName,
  asExerciseSlug,
  asJsonString,
  asLoggingMode,
  asModality,
  asMuscleGroup,
  asTag,
} from '../domain/types';
import {
  getLocalOffsetMinutes,
  roundToLocalDay,
  roundToLocalWeek,
  sortEventsByDeterministicOrder,
} from '../timePolicy';
import { getTrackerIdentifier, WorkoutEvent } from '../workoutFlows';

export type FitNotesImportBundle = {
  source: string;
  exercises: Array<{
    slug: string;
    display_name: string;
    primary_muscle_group: string;
    secondary_groups: string[];
    modality: string;
    logging_mode: string;
    suggested_load_range: { min: number; max: number };
    tags?: string[];
  }>;
  events: Array<{
    ts: number;
    exercise: string;
    reps?: number;
    weight?: number;
    distance?: number;
    duration?: number;
    pr?: boolean;
    meta?: Record<string, unknown>;
  }>;
  favorites: string[];
  warnings?: Array<{ kind: string; message: string }>;
};

export type FitNotesImportSummary = {
  eventsImported: number;
  exercisesAdded: number;
  exercisesSkipped: number;
  favoritesAdded: number;
  warningsCount: number;
};

export const pickFitnotesFile = async (): Promise<string | null> => {
  try {
    const picked = await DocumentPicker.pickSingle({
      type: [DocumentPicker.types.allFiles],
      copyTo: 'cachesDirectory',
    });
    const candidate = picked.fileCopyUri ?? picked.uri;
    if (!candidate) return null;
    if (candidate.startsWith('content://')) {
      throw new Error(
        'Selected file cannot be accessed. Please retry the import.',
      );
    }
    return candidate.replace(/^file:\/\//, '');
  } catch (error) {
    if (DocumentPicker.isCancel(error)) {
      return null;
    }
    throw error;
  }
};

export const importFitnotesBundle = async (path: string) => {
  const normalizedPath = path.replace(/^file:\/\//, '');
  const bundle = (await importFitnotes(
    normalizedPath,
  )) as unknown as FitNotesImportBundle;
  return bundle;
};

export const applyFitnotesImport = async (bundle: FitNotesImportBundle) => {
  const trackerId = await getTrackerIdentifier();
  const catalog = await fetchMergedCatalog();
  const catalogSlugs = new Set(catalog.map(entry => String(entry.slug)));
  const slugToName = new Map(
    catalog.map(entry => [String(entry.slug), String(entry.display_name)]),
  );
  const custom = await listCustomExercises(true);
  const customSlugs = new Set(custom.map(entry => String(entry.slug)));
  let exercisesAdded = 0;
  let exercisesSkipped = 0;
  let favoritesAdded = 0;

  const importedExercises: BaseExerciseCatalogEntry[] = bundle.exercises.map(
    entry => ({
      slug: asExerciseSlug(entry.slug),
      display_name: asExerciseName(entry.display_name),
      primary_muscle_group: asMuscleGroup(entry.primary_muscle_group),
      secondary_groups: (entry.secondary_groups ?? []).map(group =>
        asMuscleGroup(group),
      ),
      modality: asModality(entry.modality as any),
      logging_mode: asLoggingMode(entry.logging_mode as any),
      suggested_load_range: entry.suggested_load_range ?? { min: 0, max: 0 },
      tags: (entry.tags ?? []).map(tag => asTag(tag)),
    }),
  );

  for (const exercise of importedExercises) {
    const slug = String(exercise.slug);
    if (catalogSlugs.has(slug) || customSlugs.has(slug)) {
      exercisesSkipped += 1;
      continue;
    }
    await saveCustomExercise(exercise);
    slugToName.set(slug, String(exercise.display_name));
    exercisesAdded += 1;
  }

  for (const slug of bundle.favorites ?? []) {
    await setExerciseFavorite(asExerciseSlug(slug), true);
    favoritesAdded += 1;
  }

  const offsetMinutes = getLocalOffsetMinutes();
  const nameToSlug = new Map(
    bundle.exercises.map(entry => [
      entry.display_name.trim().toLowerCase(),
      entry.slug,
    ]),
  );
  const importedEvents: WorkoutEvent[] = bundle.events.map((event, index) => {
    const meta = (event.meta ?? {}) as JsonObject;
    const ts = event.ts;
    const logId =
      typeof meta.fitnotes_log_id === 'number' ? meta.fitnotes_log_id : index;
    const resolvedSlug = nameToSlug.get(
      String(event.exercise ?? '')
        .trim()
        .toLowerCase(),
    );
    const resolvedName =
      resolvedSlug && slugToName.has(resolvedSlug)
        ? slugToName.get(resolvedSlug)
        : event.exercise;
    const payload: JsonObject = {
      exercise: asExerciseName(String(resolvedName ?? event.exercise ?? '')),
    };
    if (typeof event.reps === 'number') payload.reps = event.reps;
    if (typeof event.weight === 'number') payload.weight = event.weight;
    if (typeof event.distance === 'number') payload.distance = event.distance;
    if (typeof event.duration === 'number') payload.duration = event.duration;
    if (typeof event.pr === 'boolean') payload.pr = event.pr;
    const dayBucket = roundToLocalDay(ts, offsetMinutes);
    const weekBucket = roundToLocalWeek(ts, offsetMinutes);
    payload.day_bucket = dayBucket;
    payload.week_bucket = weekBucket;

    return {
      event_id: asEventId(`import-fitnotes-${logId}`),
      tracker_id: trackerId,
      ts,
      payload,
      meta: {
        ...meta,
        source: asJsonString('fitnotes'),
        duration_unit: asJsonString('s'),
        timezone_offset_minutes: offsetMinutes,
        day_bucket: dayBucket,
        week_bucket: weekBucket,
      },
    };
  });

  const sorted = sortEventsByDeterministicOrder(importedEvents);
  await insertEvents(sorted);
  const warnings = bundle.warnings ?? [];
  return {
    warnings,
    summary: {
      exercisesAdded,
      exercisesSkipped,
      favoritesAdded,
      eventsImported: sorted.length,
      warningsCount: warnings.length,
    },
  };
};
