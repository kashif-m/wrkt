import { LabelText, LoggingModeValue, asLabelText } from '../../domain/types';
import { ExerciseMetricKey } from '../../domain/analytics';
import { WORKOUT_VIEW_METRIC_CONFIG } from '../../domain/generated/workoutDslContract';

export type ExerciseMetricOption = {
  key: ExerciseMetricKey;
  label: LabelText;
  unit: string;
};

const viewConfig = WORKOUT_VIEW_METRIC_CONFIG.exercise_series;

const exerciseMetricMeta: Record<
  ExerciseMetricKey,
  { label: LabelText; unit: string }
> = (
  Object.entries(viewConfig) as Array<
    [
      ExerciseMetricKey,
      {
        label?: string;
        unit?: string;
        modes?: readonly string[];
        requires?: readonly string[];
      },
    ]
  >
).reduce((acc, [key, config]) => {
  acc[key] = {
    label: asLabelText(config.label ?? key),
    unit: config.unit ?? '',
  };
  return acc;
}, {} as Record<ExerciseMetricKey, { label: LabelText; unit: string }>);

export const exerciseMetricOptions: ReadonlyArray<ExerciseMetricOption> = (
  Object.keys(viewConfig) as ExerciseMetricKey[]
).map(key => ({
  key,
  label: exerciseMetricMeta[key].label,
  unit: exerciseMetricMeta[key].unit,
}));

export const unitForExerciseMetric = (metric: ExerciseMetricKey): string =>
  exerciseMetricMeta[metric]?.unit ?? '';

type ExerciseMetricSignals = {
  hasWeight: boolean;
  hasReps: boolean;
  hasDistance: boolean;
  hasDuration: boolean;
};

const signalForRequirement = (
  requirement: string,
  signals: ExerciseMetricSignals,
): boolean => {
  switch (requirement) {
    case 'weight':
      return signals.hasWeight;
    case 'reps':
      return signals.hasReps;
    case 'distance':
      return signals.hasDistance;
    case 'duration':
      return signals.hasDuration;
    default:
      return false;
  }
};

export const exerciseMetricOptionsForMode = (
  loggingMode: LoggingModeValue | null | undefined,
  signals?: ExerciseMetricSignals,
): ReadonlyArray<ExerciseMetricOption> => {
  return exerciseMetricOptions.filter(option => {
    const config = viewConfig[option.key];
    const allowedModes: readonly string[] = config?.modes ?? [];
    if (
      loggingMode &&
      allowedModes.length > 0 &&
      !allowedModes.includes(loggingMode)
    ) {
      return false;
    }
    if (!signals) {
      return true;
    }
    const requires = config?.requires ?? [];
    return requires.every(requirement =>
      signalForRequirement(requirement, signals),
    );
  });
};
