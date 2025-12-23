import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import ExerciseBrowser from './screens/ExerciseBrowser';
import LoggingScreen from './screens/LoggingScreen';
import HistoryScreen from './screens/HistoryScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import SuggestionsScreen from './screens/SuggestionsScreen';
import HomeScreen from './screens/HomeScreen';
import CalendarScreen from './screens/CalendarScreen';
import {
  PlanSuggestion,
  suggestNext,
  WorkoutState,
  logSet,
  updateLoggedSet,
  deleteLoggedSet,
} from './workoutFlows';
import {
  init,
  fetchEvents,
  insertEvent,
  updateEvent as persistUpdatedEvent,
  removeEvent,
} from './storage';
import { palette } from './ui/theme';
import BottomNav, { NavKey } from './navigation/BottomNav';
import ScreenHeader from './ui/ScreenHeader';
import { AppProvider } from './state/appContext';
import { createInitialState, initialFields, reducer } from './state/appState';
import {
  ExerciseCatalogEntry,
  fetchMergedCatalog,
  listCustomExercises,
  loadFavoriteExercises,
  saveCustomExercise,
  setCustomExerciseArchived,
  setExerciseFavorite,
} from './exercise/catalogStorage';

const App = () => {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const refreshFromStorage = useCallback(async () => {
    const events = await fetchEvents();
    dispatch({ type: 'events/set', events });
  }, []);

  const refreshCatalog = useCallback(async () => {
    const [entries, custom, favorites] = await Promise.all([
      fetchMergedCatalog(),
      listCustomExercises(true),
      loadFavoriteExercises(),
    ]);
    dispatch({ type: 'catalog/set', entries });
    dispatch({ type: 'catalog/custom', custom });
    dispatch({ type: 'catalog/favorites', favorites });
  }, []);

  useEffect(() => {
    init()
      .then(async () => {
        await refreshFromStorage();
        await refreshCatalog();
      })
      .catch(console.warn);
  }, [refreshCatalog, refreshFromStorage]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'suggestions/loading', loading: true });
    suggestNext(
      { events: state.events } as WorkoutState,
      state.suggestions.planner,
    )
      .then((items: PlanSuggestion[]) => {
        if (!cancelled) {
          dispatch({ type: 'suggestions/items', items });
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: 'suggestions/items', items: [] });
        }
      })
      .finally(() => {
        if (!cancelled) {
          dispatch({ type: 'suggestions/loading', loading: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.events, state.suggestions.planner]);

  useEffect(() => {
    if (!state.logging.status) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'log/status', status: null });
    }, 2500);
    return () => clearTimeout(timer);
  }, [state.logging.status]);

  const actions = useMemo(
    () => ({
      navigate: (screen: typeof state.nav.screen) =>
        dispatch({ type: 'nav/set', screen }),
      setSelectedDate: (date: Date) => dispatch({ type: 'date/set', date }),
      shiftDate: (deltaDays: number) =>
        dispatch({ type: 'date/shift', deltaDays }),
      refreshAll: async () => {
        await refreshFromStorage();
        await refreshCatalog();
      },
      startWorkoutForDate: (date: Date) => {
        dispatch({ type: 'log/date', date });
        dispatch({ type: 'log/exercise', exerciseName: undefined });
        dispatch({ type: 'log/fields', fields: { ...initialFields } });
        dispatch({ type: 'log/tab', tab: 'Track' });
        dispatch({ type: 'nav/set', screen: 'browser' });
      },
      openLogForExercise: (
        exerciseName: string | undefined,
        date: Date,
        tab: typeof state.logging.tab,
      ) => {
        dispatch({ type: 'log/date', date });
        dispatch({ type: 'log/exercise', exerciseName });
        dispatch({ type: 'log/tab', tab });
        dispatch({ type: 'log/editing', eventId: null });
        const matching = exerciseName
          ? state.events
              .filter(
                event => String(event.payload?.exercise ?? '') === exerciseName,
              )
              .sort((a, b) => b.ts - a.ts)[0]
          : undefined;
        if (matching) {
          dispatch({
            type: 'log/fields',
            fields: {
              reps:
                typeof matching.payload?.reps === 'number'
                  ? matching.payload.reps.toString()
                  : '',
              weight:
                typeof matching.payload?.weight === 'number'
                  ? matching.payload.weight.toString()
                  : '',
              duration:
                typeof matching.payload?.duration === 'number'
                  ? matching.payload.duration.toString()
                  : '',
              distance:
                typeof matching.payload?.distance === 'number'
                  ? matching.payload.distance.toString()
                  : '',
            },
          });
        } else {
          dispatch({ type: 'log/fields', fields: { ...initialFields } });
        }
        dispatch({ type: 'nav/set', screen: 'log' });
      },
      logSet: async (payload: {
        exercise: string;
        reps?: number;
        weight?: number;
        duration?: number;
        distance?: number;
      }) => {
        const event = await logSet({ events: state.events } as WorkoutState, {
          event_id: `evt-${Date.now()}`,
          tracker_id: 'workout',
          ts: state.logging.logDate.getTime(),
          payload,
          meta: {},
        });
        const nextEvents = (event as WorkoutState).events;
        dispatch({ type: 'events/set', events: nextEvents });
        await insertEvent(nextEvents[nextEvents.length - 1]);
      },
      updateSet: async (
        eventId: string,
        payload: {
          exercise: string;
          reps?: number;
          weight?: number;
          duration?: number;
          distance?: number;
        },
      ) => {
        const nextState = await updateLoggedSet(
          { events: state.events } as WorkoutState,
          eventId,
          payload,
        );
        dispatch({ type: 'events/set', events: nextState.events });
        const updated = nextState.events.find(
          event => event.event_id === eventId,
        );
        if (updated) {
          await persistUpdatedEvent(updated);
        }
      },
      deleteSet: async (eventId: string) => {
        const nextState = deleteLoggedSet(
          { events: state.events } as WorkoutState,
          eventId,
        );
        dispatch({ type: 'events/set', events: nextState.events });
        await removeEvent(eventId);
      },
      saveCustomExercise: async (
        values: ExerciseCatalogEntry,
        originalSlug?: string,
      ) => {
        await saveCustomExercise(values, { originalSlug });
        await refreshCatalog();
      },
      archiveCustomExercise: async (slug: string, archived: boolean) => {
        await setCustomExerciseArchived(slug, archived);
        await refreshCatalog();
      },
      toggleFavorite: async (slug: string, next: boolean) => {
        const favorites = await setExerciseFavorite(slug, next);
        dispatch({ type: 'catalog/favorites', favorites });
      },
    }),
    [
      refreshCatalog,
      refreshFromStorage,
      state.events,
      state.logging.logDate,
      state.nav.screen,
      state.suggestions.planner,
    ],
  );

  const goHome = () => dispatch({ type: 'nav/set', screen: 'home' });

  const renderScreen = () => {
    switch (state.nav.screen) {
      case 'home':
        return <HomeScreen />;
      case 'browser':
        return <ExerciseBrowser />;
      case 'log':
        return (
          <View style={{ flex: 1 }}>
            <ScreenHeader
              title={state.logging.exerciseName ?? 'Log workout'}
              subtitle="Track · History · Trends"
              onBack={goHome}
            />
            <LoggingScreen />
          </View>
        );
      case 'history':
        return <HistoryScreen />;
      case 'analytics':
        return (
          <View style={{ flex: 1 }}>
            <ScreenHeader title="Trends" subtitle="Charts & records" />
            <AnalyticsScreen />
          </View>
        );
      case 'coach':
        return (
          <View style={{ flex: 1 }}>
            <ScreenHeader title="Coach" subtitle="Suggestions" />
            <SuggestionsScreen />
          </View>
        );
      case 'calendar':
        return <CalendarScreen />;
    }
  };

  return (
    <SafeAreaProvider>
      <AppProvider state={state} dispatch={dispatch} actions={actions}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
          <View style={{ flex: 1 }}>{renderScreen()}</View>
          <BottomNav
            current={
              state.nav.screen === 'calendar' ||
              state.nav.screen === 'browser' ||
              state.nav.screen === 'analytics' ||
              state.nav.screen === 'coach'
                ? (state.nav.screen as NavKey)
                : 'home'
            }
            onSelect={key => {
              if (key === 'home') {
                dispatch({ type: 'nav/set', screen: 'home' });
              } else if (key === 'calendar') {
                dispatch({ type: 'nav/set', screen: 'calendar' });
              } else if (key === 'browser') {
                dispatch({ type: 'nav/set', screen: 'browser' });
              } else if (key === 'analytics') {
                dispatch({ type: 'nav/set', screen: 'analytics' });
              } else if (key === 'coach') {
                dispatch({ type: 'nav/set', screen: 'coach' });
              }
            }}
          />
        </SafeAreaView>
      </AppProvider>
    </SafeAreaProvider>
  );
};

export default App;
