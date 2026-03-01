import { WorkoutFilterKind, WorkoutMetricKey } from '../../domain/analytics';
import { LabelText, asLabelText } from '../../domain/types';

export type WorkoutMetricOption = {
  key: WorkoutMetricKey;
  label: LabelText;
  unit: string;
};

export type WorkoutFilterOption = {
  key: WorkoutFilterKind;
  label: LabelText;
};

export const workoutMetricOptions: ReadonlyArray<WorkoutMetricOption> = [
  { key: 'volume', label: asLabelText('Volume'), unit: 'vol' },
  { key: 'sets', label: asLabelText('Sets'), unit: 'sets' },
  { key: 'reps', label: asLabelText('Reps'), unit: 'reps' },
  { key: 'distance', label: asLabelText('Distance'), unit: 'm' },
  {
    key: 'active_duration',
    label: asLabelText('Active duration'),
    unit: 'min',
  },
  {
    key: 'load_distance',
    label: asLabelText('Load distance'),
    unit: 'kg*m',
  },
];

export const workoutFilterOptions: ReadonlyArray<WorkoutFilterOption> = [
  { key: 'exercise', label: asLabelText('Exercise') },
  { key: 'muscle', label: asLabelText('Muscle group') },
];

export const metricLabelForSelection = (metric: WorkoutMetricKey): LabelText =>
  workoutMetricOptions.find(option => option.key === metric)?.label ??
  asLabelText('Metric');

export const unitForMetric = (metric: WorkoutMetricKey): string =>
  workoutMetricOptions.find(option => option.key === metric)?.unit ?? '';
