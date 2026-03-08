import React, {
  useCallback,
  createContext,
  useContext,
  useMemo,
} from 'react';
import {
  JsonObject,
  getWorkoutAnalyticsCapabilities,
} from '../../TrackerEngine';
import type { WorkoutAnalyticsCapabilities } from '../../domain/generated/workoutDomainContract';
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
  analyticsCapabilities: WorkoutAnalyticsCapabilities | null;
  getEventsForRange: (range: AnalyticsRangeKey) => WorkoutEvent[];
  getPayloadForRange: (range: AnalyticsRangeKey) => JsonObject[];
};

const AnalyticsDataContext = createContext<AnalyticsDataContextValue | null>(
  null,
);

const MAX_RANGE_CACHE_ENTRIES = 64;
const globalEventsByRangeCache = new Map<string, WorkoutEvent[]>();
const globalPayloadByRangeCache = new Map<string, JsonObject[]>();

const writeBoundedCache = <T,>(cache: Map<string, T>, key: string, value: T) => {
  cache.set(key, value);
  if (cache.size > MAX_RANGE_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value as string | undefined;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
};

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
  const analyticsCapabilities = useMemo(
    () => getWorkoutAnalyticsCapabilities(),
    [],
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

  const getEventsForRange = useCallback(
    (range: AnalyticsRangeKey): WorkoutEvent[] => {
      const cacheKey = `${eventsRevision}:${range}`;
      const cached = globalEventsByRangeCache.get(cacheKey);
      if (cached) {
        return cached;
      }
      const filtered =
        range === 'all' ? events : filterEventsByRange(events, range);
      writeBoundedCache(globalEventsByRangeCache, cacheKey, filtered);
      return filtered;
    },
    [events, eventsRevision],
  );

  const getPayloadForRange = useCallback(
    (range: AnalyticsRangeKey): JsonObject[] => {
      const cacheKey = `${eventsRevision}:${range}`;
      const cached = globalPayloadByRangeCache.get(cacheKey);
      if (cached) {
        return cached;
      }
      const payload = toAnalyticsInputEvents(getEventsForRange(range));
      writeBoundedCache(globalPayloadByRangeCache, cacheKey, payload);
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
      analyticsCapabilities,
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
      analyticsCapabilities,
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
