import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  JsonObject,
  computeBreakdownAnalytics,
  computeExerciseAnalytics,
  computeWorkoutAnalytics,
} from '../../TrackerEngine';
import { WorkoutEvent } from '../../workoutFlows';
import { AnalyticsSummary } from '../../domain/analytics';
import { useAppState } from '../../state/appContext';
import { useAnalyticsSummary } from './useAnalyticsSummary';
import { analyticsRangeOptions, AnalyticsRangeKey } from './analyticsRanges';
import { filterEventsByRange } from './analyticsUtils';
import { toAnalyticsInputEvents } from './analyticsPayload';

type AnalyticsDataContextValue = {
  events: WorkoutEvent[];
  eventsRevision: number;
  catalogRevision: number;
  summary: AnalyticsSummary | null;
  loading: boolean;
  error: string | null;
  catalog: JsonObject[] | null;
  catalogLookup: Map<string, string>;
  eventsByRange: Record<AnalyticsRangeKey, WorkoutEvent[]>;
  eventsPayloadByRange: Record<AnalyticsRangeKey, JsonObject[]>;
};

const AnalyticsDataContext = createContext<AnalyticsDataContextValue | null>(
  null,
);

export const AnalyticsDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const state = useAppState();
  const events = state.events;
  const eventsRevision = state.eventsRevision;
  const catalogRevision = state.catalogRevision;
  const providedCatalog = state.catalog.entries as unknown as JsonObject[];
  const { summary, loading, error, catalog } = useAnalyticsSummary(
    events,
    providedCatalog,
    { eventsRevision, catalogRevision },
  );

  const catalogLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (!catalog) return map;
    catalog.forEach(entry => {
      const name = entry.display_name;
      const muscle = entry.primary_muscle_group;
      if (typeof name === 'string' && typeof muscle === 'string') {
        map.set(name, muscle);
      }
    });
    return map;
  }, [catalog]);

  const eventsByRange = useMemo(() => {
    const ranges = analyticsRangeOptions.map(option => option.key);
    return ranges.reduce<Record<AnalyticsRangeKey, WorkoutEvent[]>>(
      (acc, range) => {
        acc[range] = filterEventsByRange(events, range);
        return acc;
      },
      {} as Record<AnalyticsRangeKey, WorkoutEvent[]>,
    );
  }, [events]);

  const eventsPayloadByRange = useMemo(() => {
    return Object.entries(eventsByRange).reduce<
      Record<AnalyticsRangeKey, JsonObject[]>
    >((acc, [range, rangeEvents]) => {
      acc[range as AnalyticsRangeKey] = toAnalyticsInputEvents(rangeEvents);
      return acc;
    }, {} as Record<AnalyticsRangeKey, JsonObject[]>);
  }, [eventsByRange]);

  const prewarmKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!catalog || events.length === 0) return;
    const prewarmKey = `${eventsRevision}:${catalogRevision}`;
    if (prewarmKeyRef.current === prewarmKey) return;
    prewarmKeyRef.current = prewarmKey;

    const timeout = setTimeout(() => {
      const offsetMinutes = -new Date().getTimezoneOffset();
      const windowEvents = eventsByRange['1m'] ?? [];
      const windowPayload = eventsPayloadByRange['1m'] ?? [];
      if (windowEvents.length === 0 || windowPayload.length === 0) return;

      const firstExercise = windowEvents.find(
        event => typeof event.payload?.exercise === 'string',
      )?.payload?.exercise as string | undefined;

      computeWorkoutAnalytics(
        windowPayload,
        offsetMinutes,
        catalog,
        {
          metric: 'volume',
          group_by: 'week',
          filter: {
            kind: 'exercise',
            value: firstExercise ?? null,
          },
        },
        {
          trace: 'trends/prewarm-workouts',
          cache: {
            enabled: true,
            eventsRevision,
            catalogRevision,
          },
        },
      );

      computeBreakdownAnalytics(
        windowPayload,
        offsetMinutes,
        catalog,
        {
          metric: 'volume',
          group_by: 'muscle',
        },
        {
          trace: 'trends/prewarm-breakdown',
          cache: {
            enabled: true,
            eventsRevision,
            catalogRevision,
          },
        },
      );

      if (firstExercise) {
        computeExerciseAnalytics(
          windowPayload,
          offsetMinutes,
          catalog,
          {
            exercise: firstExercise,
            metric: 'estimated_one_rm',
            group_by: 'week',
          },
          {
            trace: 'trends/prewarm-exercises',
            cache: {
              enabled: true,
              eventsRevision,
              catalogRevision,
            },
          },
        );
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, [
    catalog,
    catalogRevision,
    events,
    eventsByRange,
    eventsPayloadByRange,
    eventsRevision,
  ]);

  const value = useMemo<AnalyticsDataContextValue>(
    () => ({
      events,
      eventsRevision,
      catalogRevision,
      summary,
      loading,
      error,
      catalog,
      catalogLookup,
      eventsByRange,
      eventsPayloadByRange,
    }),
    [
      catalog,
      catalogLookup,
      catalogRevision,
      error,
      events,
      eventsByRange,
      eventsPayloadByRange,
      eventsRevision,
      loading,
      summary,
    ],
  );

  return (
    <AnalyticsDataContext.Provider value={value}>
      {children}
    </AnalyticsDataContext.Provider>
  );
};

export const useAnalyticsData = () => {
  const context = useContext(AnalyticsDataContext);
  if (!context) {
    throw new Error(
      'useAnalyticsData must be used within AnalyticsDataProvider',
    );
  }
  return context;
};
