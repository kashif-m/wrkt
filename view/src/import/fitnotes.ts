import DocumentPicker from 'react-native-document-picker';
import { importFitnotes } from '../TrackerEngine';
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
  asMuscleGroup,
  asLoggingMode,
  asModality,
  JsonObject,
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

export const pickFitnotesFile = async () => {
  try {
    return await DocumentPicker.pickSingle({
      type: [DocumentPicker.types.allFiles],
    });
  } catch (error) {
    if (DocumentPicker.isCancel(error)) {
      return null;
    }
    throw error;
  }
};

export const importFitnotesBundle = async (path: string) => {
  const normalizedPath = path.replace(/^file:\/\//, '');
  const bundle = (await importFitnotes(normalizedPath)) as FitNotesImportBundle;
  return bundle;
};

export const applyFitnotesImport = async (bundle: FitNotesImportBundle) => {
  const trackerId = await getTrackerIdentifier();
  const catalog = await fetchMergedCatalog();
  const catalogSlugs = new Set(catalog.map(entry => String(entry.slug)));
  const custom = await listCustomExercises(true);
  const customSlugs = new Set(custom.map(entry => String(entry.slug)));

  const importedExercises: BaseExerciseCatalogEntry[] = bundle.exercises.map(
    entry => ({
      slug: asExerciseSlug(entry.slug),
      display_name: asExerciseName(entry.display_name),
      primary_muscle_group: asMuscleGroup(entry.primary_muscle_group),
      secondary_groups: entry.secondary_groups ?? [],
      modality: asModality(entry.modality as any),
      logging_mode: asLoggingMode(entry.logging_mode as any),
      suggested_load_range: entry.suggested_load_range ?? { min: 0, max: 0 },
      tags: entry.tags ?? [],
    }),
  );

  for (const exercise of importedExercises) {
    const slug = String(exercise.slug);
    if (catalogSlugs.has(slug) || customSlugs.has(slug)) {
      continue;
    }
    await saveCustomExercise(exercise);
  }

  for (const slug of bundle.favorites ?? []) {
    await setExerciseFavorite(asExerciseSlug(slug), true);
  }

  const offsetMinutes = getLocalOffsetMinutes();
  const importedEvents: WorkoutEvent[] = bundle.events.map((event, index) => {
    const meta = (event.meta ?? {}) as JsonObject;
    const ts = event.ts;
    const logId =
      typeof meta.fitnotes_log_id === 'number'
        ? meta.fitnotes_log_id
        : index;
    return {
      event_id: asEventId(`import-fitnotes-${logId}`),
      tracker_id: trackerId,
      ts,
      payload: {
        exercise: event.exercise,
        reps: event.reps,
        weight: event.weight,
        distance: event.distance,
        duration: event.duration,
        pr: event.pr,
      },
      meta: {
        ...meta,
        source: 'fitnotes',
        timezone_offset_minutes: offsetMinutes,
        day_bucket: roundToLocalDay(ts, offsetMinutes),
        week_bucket: roundToLocalWeek(ts, offsetMinutes),
      },
    };
  });

  const sorted = sortEventsByDeterministicOrder(importedEvents);
  await insertEvents(sorted);
  return { warnings: bundle.warnings ?? [] };
};
