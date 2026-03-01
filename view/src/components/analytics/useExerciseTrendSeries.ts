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

type UseExerciseTrendSeriesArgs = {
  events: WorkoutEvent[];
  catalog: JsonObject[] | null;
  exercise: string | null;
  metric: ExerciseMetricKey;
  range: AnalyticsRangeKey;
  rmReps?: number | null;
};

export const useExerciseTrendSeries = ({
  events,
  catalog,
  exercise,
  metric,
  range,
  rmReps,
}: UseExerciseTrendSeriesArgs) => {
  const filteredEvents = useMemo(
    () => filterEventsByRange(events, range),
    [events, range],
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
        metric === 'pr_by_rm' &&
        typeof rmReps === 'number' &&
        Number.isFinite(rmReps)
          ? rmReps
          : undefined,
    };
    const offsetMinutes = new Date().getTimezoneOffset();
    return computeExerciseAnalytics(
      filteredEvents as unknown as JsonObject[],
      -offsetMinutes,
      catalog,
      query,
    );
  }, [catalog, exercise, filteredEvents, groupBy, metric, rmReps]);

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
