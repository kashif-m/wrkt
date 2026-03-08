import { WorkoutFilterKind, WorkoutMetricKey } from '../../domain/analytics';
import { LabelText, asLabelText } from '../../domain/types';
import { WORKOUT_VIEW_METRIC_CONFIG } from '../../domain/generated/workoutDslContract';

export type WorkoutMetricOption = {
  key: WorkoutMetricKey;
  label: LabelText;
  unit: string;
};

export type WorkoutFilterOption = {
  key: WorkoutFilterKind;
  label: LabelText;
};

type WorkoutMetricSignals = {
  hasAny: boolean;
  hasWeight: boolean;
  hasReps: boolean;
  hasDistance: boolean;
  hasDuration: boolean;
};

const viewConfig = WORKOUT_VIEW_METRIC_CONFIG.workouts;

const signalForRequirement = (
  requirement: string,
  signals: WorkoutMetricSignals,
): boolean => {
  switch (requirement) {
    case 'any':
      return signals.hasAny;
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

const workoutMetricMeta: Record<
  WorkoutMetricKey,
  { label: LabelText; unit: string }
> = (
  Object.entries(viewConfig) as Array<
    [
      WorkoutMetricKey,
      { label?: string; unit?: string; requires?: readonly string[] },
    ]
  >
).reduce((acc, [key, config]) => {
  acc[key] = {
    label: asLabelText(config.label ?? key),
    unit: config.unit ?? '',
  };
  return acc;
}, {} as Record<WorkoutMetricKey, { label: LabelText; unit: string }>);

export const workoutMetricOptions: ReadonlyArray<WorkoutMetricOption> = (
  Object.keys(viewConfig) as WorkoutMetricKey[]
).map(key => ({
  key,
  label: workoutMetricMeta[key].label,
  unit: workoutMetricMeta[key].unit,
}));

export const workoutFilterOptions: ReadonlyArray<WorkoutFilterOption> = [
  { key: 'exercise', label: asLabelText('Exercise') },
  { key: 'muscle', label: asLabelText('Muscle group') },
];

export const metricLabelForSelection = (metric: WorkoutMetricKey): LabelText =>
  workoutMetricMeta[metric]?.label ?? asLabelText('Metric');

export const unitForMetric = (metric: WorkoutMetricKey): string =>
  workoutMetricMeta[metric]?.unit ?? '';

export const workoutMetricEnabledForSignals = (
  metric: WorkoutMetricKey,
  signals: WorkoutMetricSignals,
): boolean => {
  const requires = viewConfig[metric]?.requires ?? [];
  return requires.every(requirement =>
    signalForRequirement(requirement, signals),
  );
};
