import {
  WORKOUT_METRIC_KEYS,
  WORKOUT_VIEW_DEFAULT_METRIC,
  WORKOUT_VIEW_METRIC_KEYS,
  WorkoutMetricKey as DslMetricKey,
} from './generated/workoutDslContract';
import type {
  BreakdownMetricKey,
  ExerciseMetricKey,
  WorkoutMetricKey,
} from './generated/workoutApiContract';

export type {
  AnalyticsSummary,
  BreakdownGroupByKey,
  BreakdownMetricKey,
  BreakdownQuery,
  BreakdownResponse,
  BreakdownTotals,
  CalendarMonthQuery,
  CalendarMonthResponse,
  DistributionItem,
  ExerciseGroupByKey,
  ExerciseMetricKey,
  ExerciseSeriesPoint,
  ExerciseSeriesQuery,
  ExerciseSeriesResponse,
  HeatmapPoint,
  HomeDayQuery,
  HomeDayResponse,
  HomeDaysQuery,
  HomeDaysResponse,
  PersonalRecord,
  StreakResult,
  VolumePoint,
  WorkoutAnalyticsFilter,
  WorkoutAnalyticsQuery,
  WorkoutFilterKind,
  WorkoutGroupByKey,
  WorkoutMetricKey,
  WorkoutMetricPoint,
  WorkoutMetricsSeries,
} from './generated/workoutApiContract';

const WORKOUT_METRIC_KEY_SET = new Set<string>(
  WORKOUT_VIEW_METRIC_KEYS.workouts,
);
const BREAKDOWN_METRIC_KEY_SET = new Set<string>(
  WORKOUT_VIEW_METRIC_KEYS.breakdown,
);
const EXERCISE_METRIC_KEY_SET = new Set<string>(
  WORKOUT_VIEW_METRIC_KEYS.exercise_series,
);

const WORKOUT_METRIC_FALLBACK = WORKOUT_VIEW_METRIC_KEYS.workouts[0];
const BREAKDOWN_METRIC_FALLBACK = WORKOUT_VIEW_METRIC_KEYS.breakdown[0];
const EXERCISE_METRIC_FALLBACK = WORKOUT_VIEW_METRIC_KEYS.exercise_series[0];

export const ALL_DSL_METRIC_KEYS =
  WORKOUT_METRIC_KEYS as readonly DslMetricKey[];

export const normalizeWorkoutMetricKey = (value: string): WorkoutMetricKey =>
  (WORKOUT_METRIC_KEY_SET.has(value)
    ? value
    : WORKOUT_METRIC_FALLBACK) as WorkoutMetricKey;

export const normalizeBreakdownMetricKey = (
  value: string,
): BreakdownMetricKey =>
  (BREAKDOWN_METRIC_KEY_SET.has(value)
    ? value
    : BREAKDOWN_METRIC_FALLBACK) as BreakdownMetricKey;

export const normalizeExerciseMetricKey = (value: string): ExerciseMetricKey =>
  (EXERCISE_METRIC_KEY_SET.has(value)
    ? value
    : EXERCISE_METRIC_FALLBACK) as ExerciseMetricKey;

export const DEFAULT_WORKOUT_METRIC_KEY = normalizeWorkoutMetricKey(
  WORKOUT_VIEW_DEFAULT_METRIC.workouts ?? WORKOUT_METRIC_FALLBACK,
);
export const DEFAULT_BREAKDOWN_METRIC_KEY = normalizeBreakdownMetricKey(
  WORKOUT_VIEW_DEFAULT_METRIC.breakdown ?? BREAKDOWN_METRIC_FALLBACK,
);
export const DEFAULT_EXERCISE_METRIC_KEY = normalizeExerciseMetricKey(
  WORKOUT_VIEW_DEFAULT_METRIC.exercise_series ?? EXERCISE_METRIC_FALLBACK,
);
