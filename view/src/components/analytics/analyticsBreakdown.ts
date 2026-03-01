import { LabelText, asLabelText } from '../../domain/types';
import {
  BreakdownGroupByKey,
  BreakdownMetricKey,
} from '../../domain/analytics';

export type BreakdownMetricOption = {
  key: BreakdownMetricKey;
  label: LabelText;
  unit: string;
};

export type BreakdownGroupOption = {
  key: BreakdownGroupByKey;
  label: LabelText;
};

export const breakdownMetricOptions: ReadonlyArray<BreakdownMetricOption> = [
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

export const breakdownGroupOptions: ReadonlyArray<BreakdownGroupOption> = [
  { key: 'muscle', label: asLabelText('Muscle group') },
  { key: 'exercise', label: asLabelText('Exercise') },
  { key: 'category', label: asLabelText('Category') },
];

export const unitForBreakdownMetric = (metric: BreakdownMetricKey): string =>
  breakdownMetricOptions.find(option => option.key === metric)?.unit ?? '';
