import React, { createContext, useContext, useMemo } from 'react';
import { JsonObject } from '../../TrackerEngine';
import { WorkoutEvent } from '../../workoutFlows';
import { AnalyticsSummary } from '../../domain/analytics';
import { useAppState } from '../../state/appContext';
import { useAnalyticsSummary } from './useAnalyticsSummary';
import { analyticsRangeOptions, AnalyticsRangeKey } from './analyticsRanges';
import { filterEventsByRange } from './analyticsUtils';

type AnalyticsDataContextValue = {
  events: WorkoutEvent[];
  summary: AnalyticsSummary | null;
  loading: boolean;
  error: string | null;
  catalog: JsonObject[] | null;
  catalogLookup: Map<string, string>;
  eventsByRange: Record<AnalyticsRangeKey, WorkoutEvent[]>;
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
  const providedCatalog = state.catalog.entries as unknown as JsonObject[];
  const { summary, loading, error, catalog } = useAnalyticsSummary(
    events,
    providedCatalog,
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

  const value = useMemo<AnalyticsDataContextValue>(
    () => ({
      events,
      summary,
      loading,
      error,
      catalog,
      catalogLookup,
      eventsByRange,
    }),
    [catalog, catalogLookup, error, events, eventsByRange, loading, summary],
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
