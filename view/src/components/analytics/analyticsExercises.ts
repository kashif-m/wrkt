import { LabelText, LoggingModeValue, asLabelText } from '../../domain/types';
import { ExerciseMetricKey } from '../../domain/analytics';

export type ExerciseMetricOption = {
  key: ExerciseMetricKey;
  label: LabelText;
  unit: string;
};

export const exerciseMetricOptions: ReadonlyArray<ExerciseMetricOption> = [
  { key: 'estimated_one_rm', label: asLabelText('Estimated 1RM'), unit: 'kg' },
  { key: 'max_weight', label: asLabelText('Max weight'), unit: 'kg' },
  { key: 'workout_weight', label: asLabelText('Total weight'), unit: 'kg' },
  { key: 'pr_by_rm', label: asLabelText('PR by RM'), unit: 'kg' },
  { key: 'max_reps', label: asLabelText('Max reps'), unit: 'reps' },
  { key: 'max_volume', label: asLabelText('Max volume'), unit: 'vol' },
  { key: 'workout_volume', label: asLabelText('Workout volume'), unit: 'vol' },
  { key: 'workout_reps', label: asLabelText('Workout reps'), unit: 'reps' },
  { key: 'max_distance', label: asLabelText('Max distance'), unit: 'm' },
  {
    key: 'workout_distance',
    label: asLabelText('Workout distance'),
    unit: 'm',
  },
  {
    key: 'max_active_duration',
    label: asLabelText('Max active duration'),
    unit: 'min',
  },
  {
    key: 'workout_active_duration',
    label: asLabelText('Workout active duration'),
    unit: 'min',
  },
  {
    key: 'max_load_distance',
    label: asLabelText('Max load distance'),
    unit: 'kg*m',
  },
  {
    key: 'workout_load_distance',
    label: asLabelText('Workout load distance'),
    unit: 'kg*m',
  },
];

export const unitForExerciseMetric = (metric: ExerciseMetricKey): string =>
  exerciseMetricOptions.find(option => option.key === metric)?.unit ?? '';

type ExerciseMetricSignals = {
  hasWeight: boolean;
  hasReps: boolean;
  hasDistance: boolean;
  hasDuration: boolean;
};

const metricKeysForMode = (
  loggingMode: LoggingModeValue,
): ReadonlyArray<ExerciseMetricKey> => {
  switch (loggingMode) {
    case 'reps_weight':
      return [
        'estimated_one_rm',
        'max_weight',
        'pr_by_rm',
        'max_reps',
        'max_volume',
        'workout_volume',
        'workout_reps',
      ];
    case 'reps':
      return ['max_reps', 'workout_reps'];
    case 'time':
      return ['max_active_duration', 'workout_active_duration'];
    case 'distance':
      return ['max_distance', 'workout_distance'];
    case 'time_distance':
      return [
        'max_distance',
        'workout_distance',
        'max_active_duration',
        'workout_active_duration',
      ];
    case 'distance_weight':
      return [
        'max_weight',
        'workout_weight',
        'max_load_distance',
        'workout_load_distance',
        'max_distance',
        'workout_distance',
      ];
    default:
      return exerciseMetricOptions.map(option => option.key);
  }
};

const metricKeysFromSignals = (
  signals: ExerciseMetricSignals,
): ReadonlyArray<ExerciseMetricKey> => {
  const keys: ExerciseMetricKey[] = [];
  if (signals.hasWeight && signals.hasReps) {
    keys.push(
      'estimated_one_rm',
      'max_weight',
      'pr_by_rm',
      'max_reps',
      'max_volume',
      'workout_volume',
      'workout_reps',
    );
  } else if (signals.hasReps) {
    keys.push('max_reps', 'workout_reps');
  }
  if (signals.hasDistance && signals.hasWeight) {
    keys.push(
      'max_weight',
      'workout_weight',
      'max_load_distance',
      'workout_load_distance',
      'max_distance',
      'workout_distance',
    );
  } else if (signals.hasDistance) {
    keys.push('max_distance', 'workout_distance');
  }
  if (signals.hasDuration) {
    keys.push('max_active_duration', 'workout_active_duration');
  }
  return keys;
};

export const exerciseMetricOptionsForMode = (
  loggingMode: LoggingModeValue | null | undefined,
  signals?: ExerciseMetricSignals,
): ReadonlyArray<ExerciseMetricOption> => {
  const modeKeys = loggingMode
    ? metricKeysForMode(loggingMode)
    : exerciseMetricOptions.map(option => option.key);
  if (!signals) {
    return exerciseMetricOptions.filter(option =>
      modeKeys.includes(option.key),
    );
  }

  const signalKeys = new Set(metricKeysFromSignals(signals));
  return exerciseMetricOptions.filter(
    option => modeKeys.includes(option.key) && signalKeys.has(option.key),
  );
};
