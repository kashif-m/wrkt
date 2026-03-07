import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { JsonObject } from '../../TrackerEngine';
import { WorkoutEvent } from '../../workoutFlows';
import { AnalyticsSummary } from '../../domain/analytics';
import { useAppState } from '../../state/appContext';
import { useAnalyticsSummary } from './useAnalyticsSummary';
import { AnalyticsRangeKey } from './analyticsRanges';
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
  getEventsForRange: (range: AnalyticsRangeKey) => WorkoutEvent[];
  getPayloadForRange: (range: AnalyticsRangeKey) => JsonObject[];
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

  const eventsByRangeCacheRef = useRef(new Map<string, WorkoutEvent[]>());
  const payloadByRangeCacheRef = useRef(new Map<string, JsonObject[]>());

  useEffect(() => {
    eventsByRangeCacheRef.current.clear();
    payloadByRangeCacheRef.current.clear();
  }, [eventsRevision]);

  const getEventsForRange = useCallback(
    (range: AnalyticsRangeKey): WorkoutEvent[] => {
      const cacheKey = `${eventsRevision}:${range}`;
      const cached = eventsByRangeCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }
      const filtered =
        range === 'all' ? events : filterEventsByRange(events, range);
      eventsByRangeCacheRef.current.set(cacheKey, filtered);
      return filtered;
    },
    [events, eventsRevision],
  );

  const getPayloadForRange = useCallback(
    (range: AnalyticsRangeKey): JsonObject[] => {
      const cacheKey = `${eventsRevision}:${range}`;
      const cached = payloadByRangeCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }
      const payload = toAnalyticsInputEvents(getEventsForRange(range));
      payloadByRangeCacheRef.current.set(cacheKey, payload);
      return payload;
    },
    [eventsRevision, getEventsForRange],
  );

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
      getEventsForRange,
      getPayloadForRange,
    }),
    [
      catalog,
      catalogLookup,
      catalogRevision,
      error,
      events,
      eventsRevision,
      getEventsForRange,
      getPayloadForRange,
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
