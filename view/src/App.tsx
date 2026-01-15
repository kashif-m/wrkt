import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import ExerciseBrowser from './screens/ExerciseBrowser';
import LoggingScreen from './screens/LoggingScreen';
import HistoryScreen from './screens/HistoryScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import MoreScreen from './screens/MoreScreen';
import ImportSummaryScreen from './screens/ImportSummaryScreen';
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
import { getMuscleColor } from './ui/muscleColors';
import BottomNav from './navigation/BottomNav';
import ScreenHeader from './ui/ScreenHeader';
import { AppProvider } from './state/appContext';
import { createInitialState, initialFields, reducer } from './state/appState';
import {
  applyFitnotesImport,
  importFitnotesBundle,
  pickFitnotesFile,
} from './import/fitnotes';
import {
  ExerciseCatalogEntry,
  fetchMergedCatalog,
  listCustomExercises,
  loadFavoriteExercises,
  saveCustomExercise,
  setCustomExerciseArchived,
  setExerciseFavorite,
} from './exercise/catalogStorage';
import {
  ExerciseName,
  ExerciseSlug,
  LoggingMode,
  asLoggingMode,
  asExerciseName,
  asNumericInput,
  asLabelText,
  asSearchQuery,
  unwrapLoggingMode,
  LabelText,
  asEventId,
  asTrackerId,
  EventId,
  NavKey,
  asScreenKey,
  asNavKey,
} from './domain/types';

const AppInner = () => {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const insets = useSafeAreaInsets();

  const estimateOneRm = (weight: number, reps: number) =>
    weight * (1 + reps / 30);

  const readNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const resolveLoggingMode = (exerciseName: ExerciseName | undefined) => {
    if (!exerciseName) return asLoggingMode('reps_weight');
    const match = state.catalog.entries.find(
      entry => entry.display_name === exerciseName,
    );
    return match?.logging_mode ?? asLoggingMode('reps_weight');
  };

  const scoreFromPayload = (
    payload: {
      reps?: number;
      weight?: number;
      duration?: number;
      distance?: number;
    },
    mode: LoggingMode,
  ) => {
    const reps = readNumber(payload.reps);
    const weight = readNumber(payload.weight);
    const duration = readNumber(payload.duration);
    const distance = readNumber(payload.distance);
    switch (unwrapLoggingMode(mode)) {
      case 'reps_weight':
        if (weight && reps) return estimateOneRm(weight, reps);
        return null;
      case 'reps':
        return reps ?? null;
      case 'time_distance':
        return duration ?? distance ?? null;
      case 'distance_time':
        return distance ?? duration ?? null;
      default:
        return null;
    }
  };

  const buildPrPayload = (
    payload: {
      exercise: ExerciseName;
      reps?: number;
      weight?: number;
      duration?: number;
      distance?: number;
    },
    eventTs: number,
    existingEvent?: (typeof state.events)[number],
  ) => {
    const mode = resolveLoggingMode(payload.exercise);
    const currentScore = scoreFromPayload(payload, mode);
    const existingPr = existingEvent?.payload?.pr === true;
    const existingPrTs =
      typeof existingEvent?.payload?.pr_ts === 'number'
        ? existingEvent?.payload?.pr_ts
        : existingEvent?.ts;
    const bestScore = state.events.reduce<number | null>((best, event) => {
      if (existingEvent && event.event_id === existingEvent.event_id) {
        return best;
      }
      const exerciseName = asExerciseName(
        String(event.payload?.exercise ?? ''),
      );
      if (exerciseName !== payload.exercise) return best;
      const score = scoreFromPayload(event.payload ?? {}, mode);
      if (typeof score !== 'number') return best;
      if (best === null || score > best) return score;
      return best;
    }, null);
    const isPr =
      existingPr || (typeof currentScore === 'number' &&
        (bestScore === null || currentScore > bestScore));
    if (!isPr) return payload;
    return {
      ...payload,
      pr: true,
      pr_ts: existingPrTs ?? eventTs,
    };
  };

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
        dispatch({ type: 'browser/mode', mode: 'groups' });
        dispatch({ type: 'browser/group', group: null });
        dispatch({ type: 'browser/query', query: asSearchQuery('') });
        dispatch({ type: 'browser/search', expanded: false });
        dispatch({ type: 'browser/menu', open: false });
        dispatch({ type: 'browser/context', context: null });
        dispatch({ type: 'browser/tab', tab: 'all' });
        dispatch({ type: 'nav/set', screen: asScreenKey('browser') });
      },
      openLogForExercise: (
        exerciseName: ExerciseName | undefined,
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
                event =>
                  asExerciseName(String(event.payload?.exercise ?? '')) ===
                  exerciseName,
              )
              .sort((a, b) => b.ts - a.ts)[0]
          : undefined;
        if (matching) {
          dispatch({
            type: 'log/fields',
            fields: {
              reps:
                typeof matching.payload?.reps === 'number'
                  ? asNumericInput(matching.payload.reps.toString())
                  : asNumericInput(''),
              weight:
                typeof matching.payload?.weight === 'number'
                  ? asNumericInput(matching.payload.weight.toString())
                  : asNumericInput(''),
              duration:
                typeof matching.payload?.duration === 'number'
                  ? asNumericInput(matching.payload.duration.toString())
                  : asNumericInput(''),
              distance:
                typeof matching.payload?.distance === 'number'
                  ? asNumericInput(matching.payload.distance.toString())
                  : asNumericInput(''),
            },
          });
        } else {
          dispatch({ type: 'log/fields', fields: { ...initialFields } });
        }
        dispatch({ type: 'nav/set', screen: asScreenKey('log') });
      },
      logSet: async (payload: {
        exercise: ExerciseName;
        reps?: number;
        weight?: number;
        duration?: number;
        distance?: number;
        pr?: boolean;
        pr_ts?: number;
      }) => {
        const eventTs = state.logging.logDate.getTime();
        const enrichedPayload = buildPrPayload(payload, eventTs);
        const event = await logSet({ events: state.events } as WorkoutState, {
          event_id: asEventId(`evt-${Date.now()}`),
          tracker_id: asTrackerId('workout'),
          ts: eventTs,
          payload: enrichedPayload,
          meta: {},
        });
        const nextEvents = (event as WorkoutState).events;
        dispatch({ type: 'events/set', events: nextEvents });
        await insertEvent(nextEvents[nextEvents.length - 1]);
      },
      updateSet: async (
        eventId: EventId,
        payload: {
          exercise: ExerciseName;
          reps?: number;
          weight?: number;
          duration?: number;
          distance?: number;
          pr?: boolean;
          pr_ts?: number;
        },
      ) => {
        const existingEvent = state.events.find(
          event => event.event_id === eventId,
        );
        const eventTs = existingEvent?.ts ?? state.logging.logDate.getTime();
        const enrichedPayload = buildPrPayload(
          payload,
          eventTs,
          existingEvent,
        );
        const nextState = await updateLoggedSet(
          { events: state.events } as WorkoutState,
          eventId,
          enrichedPayload,
        );
        dispatch({ type: 'events/set', events: nextState.events });
        const updated = nextState.events.find(
          event => event.event_id === eventId,
        );
        if (updated) {
          await persistUpdatedEvent(updated);
        }
      },
      deleteSet: async (eventId: EventId) => {
        const nextState = deleteLoggedSet(
          { events: state.events } as WorkoutState,
          eventId,
        );
        dispatch({ type: 'events/set', events: nextState.events });
        await removeEvent(eventId);
      },
      saveCustomExercise: async (
        values: ExerciseCatalogEntry,
        originalSlug?: ExerciseSlug,
      ) => {
        await saveCustomExercise(values, { originalSlug });
        await refreshCatalog();
      },
      archiveCustomExercise: async (slug: ExerciseSlug, archived: boolean) => {
        await setCustomExerciseArchived(slug, archived);
        await refreshCatalog();
      },
      toggleFavorite: async (slug: ExerciseSlug, next: boolean) => {
        const favorites = await setExerciseFavorite(slug, next);
        dispatch({ type: 'catalog/favorites', favorites });
      },
      importFitnotes: async () => {
        const filePath = await pickFitnotesFile();
        if (!filePath) return;
        const bundle = await importFitnotesBundle(filePath);
        const result = await applyFitnotesImport(bundle);
        if (result.warnings.length > 0) {
          console.warn('FitNotes import warnings', result.warnings);
        }
        dispatch({
          type: 'import/summary',
          summary: {
            source: 'fitnotes',
            summary: result.summary,
            warnings: result.warnings,
          },
        });
        dispatch({ type: 'nav/set', screen: asScreenKey('importSummary') });
        await refreshFromStorage();
        await refreshCatalog();
      },
    }),
    [
      refreshCatalog,
      refreshFromStorage,
      state.catalog.entries,
      state.events,
      state.logging.logDate,
      state.nav.screen,
      state.suggestions.planner,
    ],
  );

  const goHome = () => dispatch({ type: 'nav/set', screen: asScreenKey('home') });
  const logHeaderBackground =
    state.nav.screen === asScreenKey('log')
      ? (() => {
          const selected =
            state.catalog.entries.find(
              entry => entry.display_name === state.logging.exerciseName,
            ) ?? null;
          return selected
            ? addAlpha(getMuscleColor(selected.primary_muscle_group), 0.9)
            : palette.background;
        })()
      : palette.background;

  const renderScreen = () => {
    switch (state.nav.screen) {
      case asScreenKey('home'):
        return <HomeScreen />;
      case asScreenKey('browser'):
        return <ExerciseBrowser />;
      case asScreenKey('log'): {
        const selectedExercise =
          state.catalog.entries.find(
            entry => entry.display_name === state.logging.exerciseName,
          ) ?? null;
        const headerSubtitle = selectedExercise
          ? asLabelText(
              `${formatLabel(selectedExercise.primary_muscle_group)} · ${formatLabel(
                selectedExercise.modality,
              )}`,
            )
          : undefined;
        const isFavorite = selectedExercise
          ? state.catalog.favorites.includes(selectedExercise.slug)
          : false;
        const headerTone = selectedExercise
          ? contrastColor(getMuscleColor(selectedExercise.primary_muscle_group))
          : palette.text;
        const subtitleTone = toRgba(headerTone, 0.7);
        return (
          <View style={{ flex: 1 }}>
            <ScreenHeader
              title={
                (state.logging.exerciseName as unknown as LabelText) ??
                asLabelText('Log workout')
              }
              subtitle={headerSubtitle}
              onBack={goHome}
              tintColor={headerTone}
              subtitleColor={subtitleTone}
              rightSlot={
                selectedExercise ? (
                  <TouchableOpacity
                    onPress={() =>
                      actions.toggleFavorite(
                        selectedExercise.slug,
                        !isFavorite,
                      )
                    }
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 18,
                        color: headerTone,
                      }}
                    >
                      {isFavorite ? '★' : '☆'}
                    </Text>
                  </TouchableOpacity>
                ) : null
              }
              containerStyle={{
                backgroundColor: logHeaderBackground,
                borderColor: addAlpha(logHeaderBackground, 0.7),
              }}
            />
            <LoggingScreen />
          </View>
        );
      }
      case asScreenKey('history'):
        return <HistoryScreen />;
      case asScreenKey('analytics'):
        return (
          <View style={{ flex: 1 }}>
            <ScreenHeader
              title={asLabelText('Trends')}
              subtitle={asLabelText('Charts & records')}
            />
            <AnalyticsScreen />
          </View>
        );
      case asScreenKey('coach'):
        return <MoreScreen />;
      case asScreenKey('importSummary'):
        return <ImportSummaryScreen />;
      case asScreenKey('calendar'):
        return <CalendarScreen />;
    }
  };

  const topInsetColor =
    state.nav.screen === asScreenKey('log')
      ? logHeaderBackground
      : palette.background;

  return (
    <AppProvider state={state} dispatch={dispatch} actions={actions}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: palette.background }}
        edges={['left', 'right', 'bottom']}
      >
        <View style={{ height: insets.top, backgroundColor: topInsetColor }} />
        <View style={{ flex: 1, backgroundColor: palette.background }}>
          {renderScreen()}
        </View>
        <BottomNav
          current={
            state.nav.screen === asScreenKey('importSummary')
              ? asNavKey('coach')
              : state.nav.screen === asScreenKey('calendar') ||
                  state.nav.screen === asScreenKey('browser') ||
                  state.nav.screen === asScreenKey('analytics') ||
                  state.nav.screen === asScreenKey('coach')
                ? (state.nav.screen as unknown as NavKey)
                : asNavKey('home')
          }
          onSelect={key => {
            if (key === asNavKey('home')) {
              dispatch({ type: 'nav/set', screen: asScreenKey('home') });
            } else if (key === asNavKey('calendar')) {
              dispatch({ type: 'nav/set', screen: asScreenKey('calendar') });
            } else if (key === asNavKey('browser')) {
              dispatch({ type: 'nav/set', screen: asScreenKey('browser') });
            } else if (key === asNavKey('analytics')) {
              dispatch({ type: 'nav/set', screen: asScreenKey('analytics') });
            } else if (key === asNavKey('coach')) {
              dispatch({ type: 'nav/set', screen: asScreenKey('coach') });
            }
          }}
        />
      </SafeAreaView>
    </AppProvider>
  );
};

const App = () => (
  <SafeAreaProvider>
    <AppInner />
  </SafeAreaProvider>
);

const formatLabel = (value: string) =>
  value
    .split('_')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const addAlpha = (hex: string, alpha: number) => {
  const normalized = Math.max(0, Math.min(1, alpha));
  const alphaHex = Math.round(normalized * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alphaHex}`;
};

const contrastColor = (hex: string) => {
  const { r, g, b } = parseHex(hex);
  const [rs, gs, bs] = [r, g, b].map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  return luminance > 0.45 ? '#0f172a' : '#f8fafc';
};

const parseHex = (value: string) => {
  const normalized = value.replace('#', '');
  const clean = normalized.length >= 6 ? normalized.slice(0, 6) : normalized;
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return { r, g, b };
};

const toRgba = (hex: string, alpha: number) => {
  const { r, g, b } = parseHex(hex);
  const normalized = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalized})`;
};

export default App;
