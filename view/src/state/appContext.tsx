import React, { createContext, useContext } from 'react';
import { ExerciseCatalogEntry } from '../exercise/catalogStorage';
import { EventId, ExerciseName, ExerciseSlug } from '../domain/types';
import { RootState, Action } from './appState';

export type AppDispatch = React.Dispatch<Action>;

const AppStateContext = createContext<RootState | null>(null);
const AppDispatchContext = createContext<AppDispatch | null>(null);
const AppActionsContext = createContext<RootStateActions | null>(null);

export type RootStateActions = {
  navigate: (screen: RootState['nav']['screen']) => void;
  setSelectedDate: (date: Date) => void;
  shiftDate: (deltaDays: number) => void;
  refreshAll: () => Promise<void>;
  startWorkoutForDate: (date: Date) => void;
  openLogForExercise: (
    exerciseName: ExerciseName | undefined,
    date: Date,
    tab: RootState['logging']['tab'],
  ) => void;
  logSet: (payload: {
    exercise: ExerciseName;
    reps?: number;
    weight?: number;
    duration?: number;
    distance?: number;
  }) => Promise<void>;
  updateSet: (
    eventId: EventId,
    payload: {
      exercise: ExerciseName;
      reps?: number;
      weight?: number;
      duration?: number;
      distance?: number;
    },
  ) => Promise<void>;
  deleteSet: (eventId: EventId) => Promise<void>;
  saveCustomExercise: (
    values: ExerciseCatalogEntry,
    originalSlug?: ExerciseSlug,
  ) => Promise<void>;
  archiveCustomExercise: (
    slug: ExerciseSlug,
    archived: boolean,
  ) => Promise<void>;
  toggleFavorite: (slug: ExerciseSlug, next: boolean) => Promise<void>;
};

export const AppProvider = ({
  state,
  dispatch,
  actions,
  children,
}: {
  state: RootState;
  dispatch: AppDispatch;
  actions: RootStateActions;
  children: React.ReactNode;
}) => (
  <AppStateContext.Provider value={state}>
    <AppDispatchContext.Provider value={dispatch}>
      <AppActionsContext.Provider value={actions}>
        {children}
      </AppActionsContext.Provider>
    </AppDispatchContext.Provider>
  </AppStateContext.Provider>
);

export const useAppState = () => {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used within AppProvider');
  }
  return ctx;
};

export const useAppDispatch = () => {
  const ctx = useContext(AppDispatchContext);
  if (!ctx) {
    throw new Error('useAppDispatch must be used within AppProvider');
  }
  return ctx;
};

export const useAppActions = () => {
  const ctx = useContext(AppActionsContext);
  if (!ctx) {
    throw new Error('useAppActions must be used within AppProvider');
  }
  return ctx;
};
