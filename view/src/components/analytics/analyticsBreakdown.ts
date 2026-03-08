import { LabelText, asLabelText } from '../../domain/types';
import {
  BreakdownGroupByKey,
  BreakdownMetricKey,
} from '../../domain/analytics';
import { WORKOUT_VIEW_METRIC_CONFIG } from '../../domain/generated/workoutDslContract';

export type BreakdownMetricOption = {
  key: BreakdownMetricKey;
  label: LabelText;
  unit: string;
};

export type BreakdownGroupOption = {
  key: BreakdownGroupByKey;
  label: LabelText;
};

type BreakdownMetricSignals = {
  hasAny: boolean;
  hasWeight: boolean;
  hasReps: boolean;
  hasDistance: boolean;
  hasDuration: boolean;
};

const viewConfig = WORKOUT_VIEW_METRIC_CONFIG.breakdown;

const signalForRequirement = (
  requirement: string,
  signals: BreakdownMetricSignals,
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

const breakdownMetricMeta: Record<
  BreakdownMetricKey,
  { label: LabelText; unit: string }
> = (
  Object.entries(viewConfig) as Array<
    [
      BreakdownMetricKey,
      { label?: string; unit?: string; requires?: readonly string[] },
    ]
  >
).reduce((acc, [key, config]) => {
  acc[key] = {
    label: asLabelText(config.label ?? key),
    unit: config.unit ?? '',
  };
  return acc;
}, {} as Record<BreakdownMetricKey, { label: LabelText; unit: string }>);

export const breakdownMetricOptions: ReadonlyArray<BreakdownMetricOption> = (
  Object.keys(viewConfig) as BreakdownMetricKey[]
).map(key => ({
  key,
  label: breakdownMetricMeta[key].label,
  unit: breakdownMetricMeta[key].unit,
}));

export const breakdownGroupOptions: ReadonlyArray<BreakdownGroupOption> = [
  { key: 'muscle', label: asLabelText('Muscle group') },
  { key: 'exercise', label: asLabelText('Exercise') },
  { key: 'category', label: asLabelText('Category') },
];

export const unitForBreakdownMetric = (metric: BreakdownMetricKey): string =>
  breakdownMetricMeta[metric]?.unit ?? '';

export const breakdownMetricEnabledForSignals = (
  metric: BreakdownMetricKey,
  signals: BreakdownMetricSignals,
): boolean => {
  const requires = viewConfig[metric]?.requires ?? [];
  return requires.every(requirement =>
    signalForRequirement(requirement, signals),
  );
};
