import { WorkoutEvent } from '../../workoutFlows';
import { WorkoutGroupByKey } from '../../domain/analytics';
import { AnalyticsRangeKey, getRangeOption } from './analyticsRanges';

export const filterEventsByRange = (
  events: WorkoutEvent[],
  range: AnalyticsRangeKey,
): WorkoutEvent[] => {
  const config = getRangeOption(range);
  if (config.days === null) return events;
  const cutoff = Date.now() - config.days * 24 * 60 * 60 * 1000;
  return events.filter(event => event.ts >= cutoff);
};

export const groupByForRange = (
  range: AnalyticsRangeKey,
): 'workout' | 'week' | 'month' => {
  switch (range) {
    case '1w':
    case '2w':
      return 'workout';
    case '1m':
      return 'week';
    case '3m':
    case '6m':
    case '1y':
    case 'all':
    default:
      return 'month';
  }
};

export type MetricSignals = {
  hasAny: boolean;
  hasWeight: boolean;
  hasReps: boolean;
  hasDistance: boolean;
  hasDuration: boolean;
};

export const metricSignalsFromEvents = (
  events: WorkoutEvent[],
): MetricSignals =>
  events.reduce<MetricSignals>(
    (signals, event) => {
      const weight = Number(event.payload?.weight);
      const reps = Number(event.payload?.reps);
      const distance = Number(event.payload?.distance);
      const duration = Number(event.payload?.duration);
      if (Number.isFinite(weight) && weight > 0) signals.hasWeight = true;
      if (Number.isFinite(reps) && reps > 0) signals.hasReps = true;
      if (Number.isFinite(distance) && distance > 0) signals.hasDistance = true;
      if (Number.isFinite(duration) && duration > 0) signals.hasDuration = true;
      if (
        (Number.isFinite(weight) && weight > 0) ||
        (Number.isFinite(reps) && reps > 0) ||
        (Number.isFinite(distance) && distance > 0) ||
        (Number.isFinite(duration) && duration > 0)
      ) {
        signals.hasAny = true;
      }
      return signals;
    },
    {
      hasAny: events.length > 0,
      hasWeight: false,
      hasReps: false,
      hasDistance: false,
      hasDuration: false,
    },
  );

const formatShortDate = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const formatMonthLabel = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

export const formatBucketLabel = (
  bucket: number,
  groupBy: WorkoutGroupByKey,
): string => {
  const start = new Date(bucket);
  switch (groupBy) {
    case 'workout':
      return formatShortDate(start);
    case 'week': {
      const end = new Date(bucket + 6 * 24 * 60 * 60 * 1000);
      return `${formatShortDate(start)}-${formatShortDate(end)}`;
    }
    case 'month':
      return formatMonthLabel(start);
    default:
      return formatShortDate(start);
  }
};
