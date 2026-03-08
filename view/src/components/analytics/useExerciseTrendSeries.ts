import { useMemo } from 'react';
import { WorkoutEvent } from '../../workoutFlows';
import { ExerciseMetricKey, ExerciseSeriesQuery } from '../../domain/analytics';
import { JsonObject, computeExerciseAnalytics } from '../../TrackerEngine';
import { AnalyticsRangeKey } from './analyticsRanges';
import {
  filterEventsByRange,
  formatBucketLabel,
  groupByForRange,
} from './analyticsUtils';
import { toAnalyticsInputEvents } from './analyticsPayload';

type UseExerciseTrendSeriesArgs = {
  events: WorkoutEvent[];
  catalog: JsonObject[] | null;
  exercise: string | null;
  metric: ExerciseMetricKey;
  range: AnalyticsRangeKey;
  rangeEvents?: WorkoutEvent[];
  rangePayload?: JsonObject[];
  rmReps?: number | null;
  traceSource?: string;
  revisions?: { eventsRevision: number; catalogRevision: number };
};

export const useExerciseTrendSeries = ({
  events,
  catalog,
  exercise,
  metric,
  range,
  rangeEvents,
  rangePayload,
  rmReps,
  traceSource = 'trends/exercises',
  revisions,
}: UseExerciseTrendSeriesArgs) => {
  const filteredEvents = useMemo(
    () => rangeEvents ?? filterEventsByRange(events, range),
    [events, range, rangeEvents],
  );

  const groupBy = useMemo(() => groupByForRange(range), [range]);

  const exerciseEventsInRange = useMemo(() => {
    if (!exercise) return [];
    const target = exercise.toLowerCase();
    return filteredEvents.filter(event => {
      const eventExercise = event.payload?.exercise;
      return (
        typeof eventExercise === 'string' &&
        eventExercise.toLowerCase() === target
      );
    });
  }, [exercise, filteredEvents]);

  const series = useMemo(() => {
    if (!catalog || !exercise || filteredEvents.length === 0) return null;

    const query: ExerciseSeriesQuery = {
      exercise,
      metric,
      group_by: groupBy,
      rm_reps:
        metric === 'max_weight_at_reps' &&
        typeof rmReps === 'number' &&
        Number.isFinite(rmReps)
          ? rmReps
          : undefined,
    };
    const offsetMinutes = new Date().getTimezoneOffset();
    const inputEvents = rangePayload ?? toAnalyticsInputEvents(filteredEvents);
    return computeExerciseAnalytics(
      inputEvents,
      -offsetMinutes,
      catalog,
      query,
      {
        trace: traceSource,
        cache: {
          enabled: true,
          eventsRevision: revisions?.eventsRevision,
          catalogRevision: revisions?.catalogRevision,
        },
      },
    );
  }, [
    catalog,
    exercise,
    filteredEvents,
    groupBy,
    metric,
    rangePayload,
    revisions?.catalogRevision,
    revisions?.eventsRevision,
    rmReps,
    traceSource,
  ]);

  const chartData = useMemo(() => {
    if (!series) return [];
    return series.points.map(point => ({
      ...point,
      label: formatBucketLabel(point.bucket, series.group_by),
    }));
  }, [series]);

  return {
    filteredEvents,
    exerciseEventsInRange,
    groupBy,
    series,
    chartData,
  };
};
