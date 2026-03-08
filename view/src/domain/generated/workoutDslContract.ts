// AUTO-GENERATED from workout-pack/config/workout_v1.tracker. Do not edit.

export const WORKOUT_TRACKER_ID = 'workout_v1_836334a1' as const;

export const WORKOUT_METRIC_KEYS = [
  'avg_rpe',
  'max_active_duration',
  'max_distance',
  'max_est_1rm',
  'max_load_distance',
  'max_reps',
  'max_set_volume',
  'max_weight',
  'max_weight_at_reps',
  'total_active_duration',
  'total_distance',
  'total_load_distance',
  'total_reps',
  'total_sets',
  'total_volume',
  'total_weight',
] as const;

export const WORKOUT_VIEW_METRIC_KEYS = {
  breakdown: [
    'total_active_duration',
    'total_distance',
    'total_load_distance',
    'total_reps',
    'total_sets',
    'total_volume',
  ],
  exercise_series: [
    'max_active_duration',
    'max_distance',
    'max_est_1rm',
    'max_load_distance',
    'max_reps',
    'max_set_volume',
    'max_weight',
    'max_weight_at_reps',
    'total_active_duration',
    'total_distance',
    'total_load_distance',
    'total_reps',
    'total_volume',
    'total_weight',
  ],
  workouts: [
    'total_active_duration',
    'total_distance',
    'total_load_distance',
    'total_reps',
    'total_sets',
    'total_volume',
  ],
} as const;

export const WORKOUT_VIEW_DEFAULT_METRIC = {
  breakdown: 'total_volume',
  exercise_series: 'max_est_1rm',
  workouts: 'total_volume',
} as const;

export const WORKOUT_VIEW_METRIC_CONFIG = {
  breakdown: {
    total_active_duration: {
      metric: 'total_active_duration',
      label: 'Active duration',
      unit: 'min',
      modes: [],
      requires: ['duration'],
    },
    total_distance: {
      metric: 'total_distance',
      label: 'Distance',
      unit: 'm',
      modes: [],
      requires: ['distance'],
    },
    total_load_distance: {
      metric: 'total_load_distance',
      label: 'Load distance',
      unit: 'kg*m',
      modes: [],
      requires: ['weight', 'distance'],
    },
    total_reps: {
      metric: 'total_reps',
      label: 'Reps',
      unit: 'reps',
      modes: [],
      requires: ['reps'],
    },
    total_sets: {
      metric: 'total_sets',
      label: 'Sets',
      unit: 'sets',
      modes: [],
      requires: [],
    },
    total_volume: {
      metric: 'total_volume',
      label: 'Volume',
      unit: 'vol',
      modes: [],
      requires: ['weight', 'reps'],
    },
  },
  exercise_series: {
    max_active_duration: {
      metric: 'max_active_duration',
      label: 'Max active duration',
      unit: 'min',
      modes: ['time', 'time_distance'],
      requires: ['duration'],
    },
    max_distance: {
      metric: 'max_distance',
      label: 'Max distance',
      unit: 'm',
      modes: ['distance', 'time_distance', 'distance_weight'],
      requires: ['distance'],
    },
    max_est_1rm: {
      metric: 'max_est_1rm',
      label: 'Estimated 1RM',
      unit: 'kg',
      modes: ['reps_weight'],
      requires: ['weight', 'reps'],
    },
    max_load_distance: {
      metric: 'max_load_distance',
      label: 'Max load distance',
      unit: 'kg*m',
      modes: ['distance_weight'],
      requires: ['weight', 'distance'],
    },
    max_reps: {
      metric: 'max_reps',
      label: 'Max reps',
      unit: 'reps',
      modes: ['reps_weight', 'reps'],
      requires: ['reps'],
    },
    max_set_volume: {
      metric: 'max_set_volume',
      label: 'Max volume',
      unit: 'vol',
      modes: ['reps_weight'],
      requires: ['weight', 'reps'],
    },
    max_weight: {
      metric: 'max_weight',
      label: 'Max weight',
      unit: 'kg',
      modes: ['reps_weight', 'distance_weight'],
      requires: ['weight'],
    },
    max_weight_at_reps: {
      metric: 'max_weight_at_reps',
      label: 'PR by RM',
      unit: 'kg',
      modes: ['reps_weight'],
      requires: ['weight', 'reps'],
    },
    total_active_duration: {
      metric: 'total_active_duration',
      label: 'Workout active duration',
      unit: 'min',
      modes: ['time', 'time_distance'],
      requires: ['duration'],
    },
    total_distance: {
      metric: 'total_distance',
      label: 'Workout distance',
      unit: 'm',
      modes: ['distance', 'time_distance', 'distance_weight'],
      requires: ['distance'],
    },
    total_load_distance: {
      metric: 'total_load_distance',
      label: 'Workout load distance',
      unit: 'kg*m',
      modes: ['distance_weight'],
      requires: ['weight', 'distance'],
    },
    total_reps: {
      metric: 'total_reps',
      label: 'Workout reps',
      unit: 'reps',
      modes: ['reps_weight', 'reps'],
      requires: ['reps'],
    },
    total_volume: {
      metric: 'total_volume',
      label: 'Workout volume',
      unit: 'vol',
      modes: ['reps_weight'],
      requires: ['weight', 'reps'],
    },
    total_weight: {
      metric: 'total_weight',
      label: 'Total weight',
      unit: 'kg',
      modes: ['distance_weight'],
      requires: ['weight'],
    },
  },
  workouts: {
    total_active_duration: {
      metric: 'total_active_duration',
      label: 'Active duration',
      unit: 'min',
      modes: [],
      requires: ['duration'],
    },
    total_distance: {
      metric: 'total_distance',
      label: 'Distance',
      unit: 'm',
      modes: [],
      requires: ['distance'],
    },
    total_load_distance: {
      metric: 'total_load_distance',
      label: 'Load distance',
      unit: 'kg*m',
      modes: [],
      requires: ['weight', 'distance'],
    },
    total_reps: {
      metric: 'total_reps',
      label: 'Reps',
      unit: 'reps',
      modes: [],
      requires: ['reps'],
    },
    total_sets: {
      metric: 'total_sets',
      label: 'Sets',
      unit: 'sets',
      modes: [],
      requires: [],
    },
    total_volume: {
      metric: 'total_volume',
      label: 'Volume',
      unit: 'vol',
      modes: [],
      requires: ['weight', 'reps'],
    },
  },
} as const;

export type WorkoutMetricKey = (typeof WORKOUT_METRIC_KEYS)[number];
export type WorkoutViewName = keyof typeof WORKOUT_VIEW_METRIC_KEYS;
export type WorkoutViewMetricKey<V extends WorkoutViewName> =
  (typeof WORKOUT_VIEW_METRIC_KEYS)[V][number];
