import { useEffect, useMemo, useState } from 'react';
import { AnalyticsSummary } from '../../domain/analytics';
import { JsonObject, computeAnalytics } from '../../TrackerEngine';
import { WorkoutEvent } from '../../workoutFlows';
import { fetchMergedCatalog } from '../../exercise/catalogStorage';

export const useAnalyticsSummary = (
  events: WorkoutEvent[],
  providedCatalog?: JsonObject[] | null,
) => {
  const [catalog, setCatalog] = useState<JsonObject[] | null>(null);
  const [loading, setLoading] = useState(!providedCatalog);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (providedCatalog && providedCatalog.length > 0) {
      setCatalog(providedCatalog);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    const loadCatalog = async () => {
      try {
        const data: unknown = await fetchMergedCatalog();
        if (!Array.isArray(data)) {
          throw new Error(`Catalog is not an array, got: ${typeof data}`);
        }
        if (active) {
          setCatalog(data as JsonObject[]);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    loadCatalog();
    return () => {
      active = false;
    };
  }, [providedCatalog]);

  const summary = useMemo<AnalyticsSummary | null>(() => {
    if (!catalog || events.length === 0) return null;
    const offset = new Date().getTimezoneOffset();
    return computeAnalytics(
      events as unknown as JsonObject[],
      -offset,
      catalog,
    );
  }, [events, catalog]);

  return { summary, loading, error, catalog };
};
