/**
 * Hook for loading and refreshing workout data from storage
 */

import { useCallback, useEffect } from 'react';
import { init, fetchEvents } from '../storage';
import {
  fetchMergedCatalog,
  listCustomExercises,
  loadFavoriteExercises,
} from '../exercise/catalogStorage';
import { suggestNext, WorkoutState, PlanSuggestion } from '../workoutFlows';
import { PlannerKind } from '../domain/types';

export type DataDispatch = {
  setEvents: (events: WorkoutState['events']) => void;
  setCatalog: (entries: Awaited<ReturnType<typeof fetchMergedCatalog>>) => void;
  setCustomExercises: (
    custom: Awaited<ReturnType<typeof listCustomExercises>>,
  ) => void;
  setFavorites: (
    favorites: Awaited<ReturnType<typeof loadFavoriteExercises>>,
  ) => void;
  setSuggestions: (items: PlanSuggestion[]) => void;
  setSuggestionsLoading: (loading: boolean) => void;
};

export const useWorkoutData = (
  dispatch: DataDispatch,
  events: WorkoutState['events'],
  planner: PlannerKind,
) => {
  const refreshFromStorage = useCallback(async () => {
    const loadedEvents = await fetchEvents();
    dispatch.setEvents(loadedEvents);
  }, [dispatch]);

  const refreshCatalog = useCallback(async () => {
    const [entries, custom, favorites] = await Promise.all([
      fetchMergedCatalog(),
      listCustomExercises(true),
      loadFavoriteExercises(),
    ]);
    dispatch.setCatalog(entries);
    dispatch.setCustomExercises(custom);
    dispatch.setFavorites(favorites);
  }, [dispatch]);

  const refreshAll = useCallback(async () => {
    await refreshFromStorage();
    await refreshCatalog();
  }, [refreshFromStorage, refreshCatalog]);

  // Initialize on mount
  useEffect(() => {
    init()
      .then(async () => {
        await refreshFromStorage();
        await refreshCatalog();
      })
      .catch(console.warn);
  }, [refreshCatalog, refreshFromStorage]);

  // Refresh suggestions when events or planner changes
  useEffect(() => {
    let cancelled = false;
    dispatch.setSuggestionsLoading(true);
    suggestNext({ events } as WorkoutState, planner)
      .then((items: PlanSuggestion[]) => {
        if (!cancelled) {
          dispatch.setSuggestions(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch.setSuggestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          dispatch.setSuggestionsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [events, planner, dispatch]);

  return { refreshAll, refreshFromStorage, refreshCatalog };
};
