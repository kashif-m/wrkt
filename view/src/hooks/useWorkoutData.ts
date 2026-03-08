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
import { WorkoutState } from '../workoutFlows';

export type DataDispatch = {
  setEvents: (events: WorkoutState['events']) => void;
  setCatalog: (entries: Awaited<ReturnType<typeof fetchMergedCatalog>>) => void;
  setCustomExercises: (
    custom: Awaited<ReturnType<typeof listCustomExercises>>,
  ) => void;
  setFavorites: (
    favorites: Awaited<ReturnType<typeof loadFavoriteExercises>>,
  ) => void;
};

export const useWorkoutData = (
  dispatch: DataDispatch,
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

  return { refreshAll, refreshFromStorage, refreshCatalog };
};
