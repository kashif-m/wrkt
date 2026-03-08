// AUTO-GENERATED from workout-pack domain contracts. Do not edit.

import type {
  BrandedString,
  EventId,
  ExerciseName,
  ExerciseSlug,
  ExerciseSource,
  LoggingMode,
  Modality,
  MuscleGroup,
  Tag,
  TrackerId,
} from '../types';

export type DomainJsonValue =
  | null
  | boolean
  | number
  | BrandedString
  | DomainJsonObject
  | DomainJsonValue[];

export type DomainJsonObject = {
  [key: string]: DomainJsonValue;
};

export type WorkoutEvent = DomainJsonObject & {
  event_id: EventId;
  tracker_id: TrackerId;
  ts: number;
  payload: DomainJsonObject;
  meta: DomainJsonObject;
};

export type WorkoutState = {
  events: WorkoutEvent[];
};

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

export type SetPayload = {
  exercise: ExerciseName;
  exercise_slug?: ExerciseSlug;
  modality?: Modality;
  reps?: number;
  weight?: number;
  duration?: number;
  distance?: number;
  pr?: boolean;
  pr_ts?: number;
};

export type PrType =
  | 'weight'
  | 'reps'
  | 'estimated_one_rm'
  | 'volume'
  | 'duration'
  | 'distance';

export type PrResult = {
  is_pr: boolean;
  pr_type?: PrType;
  previous_best?: number;
  new_value: number;
  improvement?: number;
};

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

export type WorkoutAnalyticsCapabilities = {
  views?: Record<
    string,
    {
      metrics?: string[];
      metric_config?: Record<
        string,
        {
          metric?: string;
          label?: string;
          unit?: string;
          modes?: string[];
          requires?: string[];
        }
      >;
    }
  >;
};
