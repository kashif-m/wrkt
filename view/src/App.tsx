import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  BackHandler,
  Platform,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  NavigationContainer,
  StackActions,
  useNavigation,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import { roundToLocalDay } from './timePolicy';
import ExerciseBrowser from './screens/ExerciseBrowser';
import LoggingScreen from './screens/LoggingScreen';
import HistoryScreen from './screens/HistoryScreen';
import AnalyticsHub from './screens/AnalyticsHub';
import MoreScreen from './screens/MoreScreen';
import ImportSummaryScreen from './screens/ImportSummaryScreen';
import HomeScreen from './screens/HomeScreen';
import CalendarScreen from './screens/CalendarScreen';
import ErrorBoundary from './components/ErrorBoundary';
import {
  WorkoutEvent,
  deleteLoggedSet,
  logSet,
  updateLoggedSet,
} from './workoutFlows';
import { init } from './storage';
import {
  loadAllEvents,
  loadSettings,
  saveSettings,
  scheduleSave,
  setStorageErrorCallback,
} from './state/persistence';
import {
  estimateOneRm as rustEstimateOneRm,
  scoreSet as rustScoreSet,
} from './TrackerEngine';
import { applyThemeSettings, palette, spacing } from './ui/theme';
import { addAlpha } from './ui/color';
import { getMuscleColor } from './ui/muscleColors';
import { formatTrimmedNumber, secondsToMinutes } from './ui/formatters';
import BottomNav from './navigation/BottomNav';
import ScreenHeader from './ui/ScreenHeader';
import {
  AppProvider,
  useAppActions,
  useAppDispatch,
  useAppState,
} from './state/appContext';
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
  deleteCustomExercise,
  removeDefaultOverride,
  saveCustomExercise as persistCustomExercise,
  setCustomExerciseArchived,
  setExerciseHidden,
  setExerciseFavorite,
} from './exercise/catalogStorage';
import {
  ExerciseName,
  ExerciseSlug,
  LoggingMode,
  ScreenKey,
  ScreenKeyValue,
  asLoggingMode,
  asExerciseName,
  asExerciseSlug,
  asExerciseSource,
  asModality,
  asMuscleGroup,
  asNumericInput,
  asLabelText,
  asSearchQuery,
  asToastText,
  asToastTone,
  asJsonString,
  unwrapLoggingMode,
  LabelText,
  asEventId,
  asTrackerId,
  EventId,
  NavKey,
  NavKeyValue,
  asNavKey,
  asScreenKey,
  unwrapScreenKey,
} from './domain/types';
import {
  estimateOneRm,
  resolveLoggingMode,
  scoreFromPayload,
  buildPrPayload,
} from './hooks/useMetrics';
import type { SetPayload } from './domain/generated/workoutDomainContract';

type RootStackParamList = {
  home: undefined;
  calendar: undefined;
  analytics: undefined;
  more: undefined;
  browser: undefined;
  log: undefined;
  history: undefined;
  importSummary: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

enableScreens();

const ScreenShell = ({
  children,
  topInsetColor,
}: {
  children: React.ReactNode;
  topInsetColor?: string;
}) => {
  const { preferences } = useAppState();
  const insets = useSafeAreaInsets();
  const insetColor = topInsetColor ?? palette.background;
  const _themeKey = `${preferences.themeMode}:${preferences.themeAccent}:${
    preferences.customAccentHex ?? ''
  }`;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ height: insets.top, backgroundColor: insetColor }} />
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        {children}
      </View>
    </View>
  );
};

const getActiveRouteName = (state: unknown): ScreenKeyValue => {
  const navState = state as {
    index?: number;
    routes?: Array<{ name: string; state?: unknown }>;
  };
  if (!navState?.routes?.length) return 'home';
  const index = navState.index ?? 0;
  const route = navState.routes[index];
  if (route?.name === 'browser') return 'browser';
  if (route?.state) return getActiveRouteName(route.state);
  return route?.name as ScreenKeyValue;
};

const isPrimaryRoute = (route: ScreenKeyValue) =>
  route === 'home' ||
  route === 'calendar' ||
  route === 'analytics' ||
  route === 'more';

const isScreenRoute = (route: string): route is ScreenKeyValue =>
  route === 'home' ||
  route === 'calendar' ||
  route === 'browser' ||
  route === 'log' ||
  route === 'analytics' ||
  route === 'more' ||
  route === 'history' ||
  route === 'importSummary';

const primaryRouteOrder: ScreenKeyValue[] = [
  'home',
  'calendar',
  'analytics',
  'more',
];

const getPrimaryRouteIndex = (route: ScreenKeyValue) =>
  primaryRouteOrder.indexOf(route);

const resetBrowserUiState = (dispatch: ReturnType<typeof useAppDispatch>) => {
  dispatch({ type: 'browser/mode', mode: 'groups' });
  dispatch({ type: 'browser/returnMode', mode: 'groups' });
  dispatch({ type: 'browser/group', group: null });
  dispatch({ type: 'browser/query', query: asSearchQuery('') });
  dispatch({ type: 'browser/search', expanded: false });
  dispatch({ type: 'browser/menu', open: false });
  dispatch({ type: 'browser/context', context: null });
  dispatch({ type: 'browser/tab', tab: 'all' });
  dispatch({ type: 'browser/form', entry: null });
  dispatch({
    type: 'browser/formDraft',
    draft: {
      displayName: asExerciseName(''),
      slug: asExerciseSlug(''),
      primary: asMuscleGroup('chest'),
      secondary: [],
      modality: asModality('strength'),
      loggingMode: asLoggingMode('reps_weight'),
      minLoad: asNumericInput(''),
      maxLoad: asNumericInput(''),
      tags: [],
      saving: false,
      error: null,
    },
  });
};

const PrimaryRoute = ({
  current,
  children,
}: {
  current: NavKey;
  children: React.ReactNode;
}) => {
  const state = useAppState();
  const actions = useAppActions();
  const dispatch = useAppDispatch();
  const isToday =
    roundToLocalDay(state.selectedDate.getTime()) ===
    roundToLocalDay(Date.now());

  return (
    <ScreenShell>
      <View style={{ flex: 1 }}>
        {children}
        <BottomNav
          current={current}
          themeMode={state.preferences.themeMode}
          onSelect={key => {
            if (key === asNavKey('browser')) {
              resetBrowserUiState(dispatch);
              actions.navigate(
                asScreenKey('browser'),
                current as ScreenKeyValue,
              );
              return;
            }
            if (key === asNavKey('home')) {
              if (!isToday) {
                actions.setSelectedDate(new Date());
              }
              if (current !== asNavKey('home')) {
                actions.navigate(
                  asScreenKey('home'),
                  current as ScreenKeyValue,
                );
              }
              return;
            }
            if (key === current) return;
            actions.navigate(
              asScreenKey(key as NavKeyValue),
              current as ScreenKeyValue,
            );
          }}
        />
      </View>
    </ScreenShell>
  );
};

const HomeRoute = () => (
  <PrimaryRoute current={asNavKey('home')}>
    <HomeScreen />
  </PrimaryRoute>
);

const CalendarRoute = () => (
  <PrimaryRoute current={asNavKey('calendar')}>
    <CalendarScreen />
  </PrimaryRoute>
);

const AnalyticsRoute = () => (
  <PrimaryRoute current={asNavKey('analytics')}>
    <AnalyticsHub />
  </PrimaryRoute>
);

const MoreRoute = () => (
  <PrimaryRoute current={asNavKey('more')}>
    <MoreScreen />
  </PrimaryRoute>
);

const BrowserRoute = () => (
  <ScreenShell>
    <ExerciseBrowser />
  </ScreenShell>
);

const HistoryRoute = () => (
  <ScreenShell>
    <HistoryScreen />
  </ScreenShell>
);

const ImportSummaryRoute = () => (
  <ScreenShell>
    <ImportSummaryScreen />
  </ScreenShell>
);

const LogRoute = () => {
  const state = useAppState();
  const actions = useAppActions();
  const navigation = useNavigation();

  const logHeaderBackground = useMemo(() => {
    const selected =
      state.catalog.entries.find(
        entry => entry.display_name === state.logging.exerciseName,
      ) ?? null;
    return selected
      ? addAlpha(getMuscleColor(selected.primary_muscle_group), 0.9)
      : palette.background;
  }, [state.catalog.entries, state.logging.exerciseName]);

  const logStatusBarStyle =
    contrastColor(logHeaderBackground) === '#0f172a' ? 'dark' : 'light';

  useEffect(() => {
    navigation.setOptions({
      statusBarStyle: logStatusBarStyle,
    });
  }, [logHeaderBackground, logStatusBarStyle, navigation]);

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
    <ScreenShell topInsetColor={logHeaderBackground}>
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title={
            (state.logging.exerciseName as unknown as LabelText) ??
            asLabelText('Log workout')
          }
          subtitle={headerSubtitle}
          onBack={actions.handleBack}
          tintColor={headerTone}
          subtitleColor={subtitleTone}
          rightSlot={
            selectedExercise ? (
              <TouchableOpacity
                onPress={() =>
                  actions.toggleFavorite(selectedExercise.slug, !isFavorite)
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
    </ScreenShell>
  );
};

const AppInner = () => {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const browserBackStateRef = useRef(state.browser);

  // Apply theme before rendering descendants so accent/mode changes repaint immediately.
  applyThemeSettings({
    mode: state.preferences.themeMode,
    accent: state.preferences.themeAccent,
    customAccentHex: state.preferences.customAccentHex,
  });

  // scoreFromPayload and buildPrPayload replaced by hooks

  const refreshFromStorage = useCallback(async () => {
    const events = await loadAllEvents();
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
    // Set up storage error handler
    setStorageErrorCallback(error => {
      dispatch({
        type: 'log/status',
        status: {
          text: asToastText('Failed to save data. Please try again.'),
          tone: asToastTone('danger'),
        },
      });
    });

    init()
      .then(async () => {
        const settings = await loadSettings();
        applyThemeSettings({
          mode: settings.themeMode,
          accent: settings.themeAccent,
          customAccentHex: settings.customAccentHex,
        });
        dispatch({
          type: 'preferences/themeAccent',
          accent: settings.themeAccent,
        });
        dispatch({
          type: 'preferences/themeMode',
          mode: settings.themeMode,
        });
        dispatch({
          type: 'preferences/customAccent',
          color: settings.customAccentHex,
        });
        dispatch({
          type: 'preferences/homeSplitMode',
          mode: settings.homeSplitMode,
        });
        dispatch({
          type: 'preferences/summaryConsistencyWindow',
          mode: settings.summaryConsistencyWindow,
        });
        await refreshFromStorage();
        await refreshCatalog();
        setSettingsHydrated(true);
      })
      .catch(error => {
        console.warn(error);
        setSettingsHydrated(true);
      });
  }, [refreshCatalog, refreshFromStorage]);

  useEffect(() => {
    if (!settingsHydrated) {
      return;
    }
    void saveSettings({
      themeAccent: state.preferences.themeAccent,
      themeMode: state.preferences.themeMode,
      customAccentHex: state.preferences.customAccentHex,
      homeSplitMode: state.preferences.homeSplitMode,
      summaryConsistencyWindow: state.preferences.summaryConsistencyWindow,
    });
  }, [
    settingsHydrated,
    state.preferences.customAccentHex,
    state.preferences.homeSplitMode,
    state.preferences.summaryConsistencyWindow,
    state.preferences.themeAccent,
    state.preferences.themeMode,
  ]);

  useEffect(() => {
    if (!state.logging.status) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'log/status', status: null });
    }, 2500);
    return () => clearTimeout(timer);
  }, [state.logging.status]);

  const pushScreen = useCallback(
    (screen: ScreenKey) => {
      if (!navigationRef.isReady()) return;
      navigationRef.dispatch(
        StackActions.push(unwrapScreenKey(screen) as ScreenKeyValue),
      );
    },
    [navigationRef],
  );

  const beginImport = useCallback(async () => {
    const filePath = await pickFitnotesFile();
    if (!filePath) return;
    dispatch({ type: 'log/status', status: null });
    const bundle = await importFitnotesBundle(filePath);
    if (!bundle) return;
    const result = await applyFitnotesImport(bundle);
    dispatch({
      type: 'import/summary',
      summary: {
        source: 'fitnotes',
        summary: result.summary,
        warnings: result.warnings,
      },
    });
    pushScreen(asScreenKey('importSummary'));
    await refreshFromStorage();
    await refreshCatalog();
  }, [pushScreen, refreshCatalog, refreshFromStorage]);

  const getCurrentScreen = useCallback((): ScreenKeyValue => {
    if (!navigationRef.isReady()) {
      return 'home';
    }
    const rootState = navigationRef.getRootState();
    const activeRoute = getActiveRouteName(rootState);
    if (isScreenRoute(activeRoute)) {
      return activeRoute;
    }
    const routeName = navigationRef.getCurrentRoute()?.name;
    if (routeName && isScreenRoute(routeName)) {
      return routeName;
    }
    return 'home';
  }, [navigationRef]);

  useEffect(() => {
    browserBackStateRef.current = state.browser;
  }, [state.browser]);

  const interceptBrowserBack = useCallback(() => {
    const browserState = browserBackStateRef.current;
    if (browserState.menuOpen) {
      dispatch({ type: 'browser/menu', open: false });
      return true;
    }
    if (browserState.searchExpanded) {
      dispatch({ type: 'browser/search', expanded: false });
      dispatch({ type: 'browser/query', query: asSearchQuery('') });
      return true;
    }
    if (browserState.contextEntry) {
      dispatch({ type: 'browser/context', context: null });
      return true;
    }
    return false;
  }, [dispatch]);

  const handleBack = useCallback(() => {
    if (interceptBrowserBack()) {
      return true;
    }

    if (!navigationRef.isReady()) {
      return false;
    }
    const canGoBack = navigationRef.canGoBack();
    if (canGoBack) {
      navigationRef.goBack();
      return true;
    }
    const topScreen = getCurrentScreen();
    if (topScreen !== 'home') {
      navigationRef.dispatch(StackActions.replace('home'));
      return true;
    }
    return false;
  }, [getCurrentScreen, interceptBrowserBack, navigationRef]);

  const handleHardwareBack = useCallback(() => {
    if (interceptBrowserBack()) {
      return true;
    }
    return handleBack();
  }, [handleBack, interceptBrowserBack]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleHardwareBack,
    );
    return () => subscription.remove();
  }, [handleHardwareBack]);

  const actions = useMemo(
    () => ({
      navigate: (screen: ScreenKey, fromScreen?: ScreenKeyValue) => {
        const target = unwrapScreenKey(screen);
        if (!navigationRef.isReady()) return;
        const current = fromScreen ?? getCurrentScreen();
        if (current === target) return;
        if (isPrimaryRoute(target as ScreenKeyValue)) {
          if (target === 'home') {
            if (current === 'home') {
              return;
            }
            navigationRef.dispatch(StackActions.popToTop());
            return;
          }
          if (current === 'home') {
            navigationRef.dispatch(StackActions.push(target as ScreenKeyValue));
            return;
          }
          if (isPrimaryRoute(current)) {
            const currentIndex = getPrimaryRouteIndex(current);
            const targetIndex = getPrimaryRouteIndex(target as ScreenKeyValue);
            if (targetIndex > currentIndex) {
              navigationRef.dispatch(
                StackActions.push(target as ScreenKeyValue),
              );
              return;
            }
            if (targetIndex < currentIndex) {
              const rootState = navigationRef.getRootState();
              const stackIndex = rootState.index ?? 0;
              const routes = rootState.routes ?? [];
              let popCount: number | null = null;
              for (let idx = stackIndex - 1; idx >= 0; idx -= 1) {
                if (routes[idx]?.name === target) {
                  popCount = stackIndex - idx;
                  break;
                }
              }
              if (popCount && popCount > 0) {
                navigationRef.dispatch(StackActions.pop(popCount));
                return;
              }
            }
            navigationRef.dispatch(
              StackActions.replace(target as ScreenKeyValue),
            );
            return;
          }
          navigationRef.dispatch(StackActions.popToTop());
          navigationRef.dispatch(StackActions.push(target as ScreenKeyValue));
          return;
        }
        navigationRef.dispatch(StackActions.push(target as ScreenKeyValue));
      },
      handleBack,
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
        pushScreen(asScreenKey('browser'));
      },
      openLogForExercise: (
        exerciseName: ExerciseName | undefined,
        date: Date,
        tab: typeof state.logging.tab,
      ) => {
        dispatch({ type: 'browser/search', expanded: false });
        dispatch({ type: 'browser/query', query: asSearchQuery('') });
        dispatch({ type: 'browser/menu', open: false });
        dispatch({ type: 'browser/context', context: null });
        dispatch({ type: 'log/date', date });
        dispatch({ type: 'log/exercise', exerciseName });
        dispatch({ type: 'log/tab', tab });
        dispatch({ type: 'log/editing', eventId: null });
        const matching =
          exerciseName === undefined
            ? undefined
            : pickPrefillEventForExerciseDate(state.events, exerciseName, date);
        if (matching) {
          dispatch({
            type: 'log/fields',
            fields: loggingFieldsFromEvent(matching),
          });
        } else {
          dispatch({ type: 'log/fields', fields: { ...initialFields } });
        }
        pushScreen(asScreenKey('log'));
      },
      logSet: async (payload: SetPayload) => {
        const eventTs = buildLogTimestamp(state.logging.logDate);
        const eventId = asEventId(
          `evt-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        );
        const normalizedPayload = enrichSetPayloadWithCatalog(
          payload,
          state.catalog.entries,
        );
        if (__DEV__) {
          console.log('Logging set', normalizedPayload, eventTs);
        }
        const baseEvent: WorkoutEvent = {
          tracker_id: asTrackerId('workout_v1'),
          event_id: eventId,
          ts: eventTs,
          payload: normalizedPayload,
          meta: {
            source: asJsonString('manual'),
            ...(typeof normalizedPayload.duration === 'number'
              ? { duration_unit: asJsonString('s') }
              : {}),
          },
        };
        const nextState = await logSet({ events: state.events }, baseEvent);
        const createdEvent =
          nextState.events.find(item => item.event_id === eventId) ??
          nextState.events[nextState.events.length - 1];

        // OPTIMIZATION: Filter events to only relevant exercise to reduce JSON serialization overhead
        const relevantEvents = state.events.filter(
          e =>
            asExerciseName(String(e.payload?.exercise ?? '')) ===
            normalizedPayload.exercise,
        );

        const eventWithPr = createdEvent
          ? {
              ...createdEvent,
              payload: {
                ...normalizedPayload,
                ...buildPrPayload(
                  normalizedPayload,
                  createdEvent.ts,
                  relevantEvents,
                  state.catalog.entries,
                  undefined, // existingEvent is undefined for new logs
                ),
              },
            }
          : null;

        if (!eventWithPr) {
          dispatch({
            type: 'log/status',
            status: {
              text: asToastText('Set incomplete'),
              tone: asToastTone('info'),
            },
          });
          return;
        }
        const finalEvents = [...state.events, eventWithPr];

        // OPTIMIZATION: Optimistic update with O(1) Reducer Action
        dispatch({ type: 'events/add', event: eventWithPr });
        dispatch({ type: 'log/status', status: null });

        // Persist in background (debounced)
        scheduleSave(finalEvents);
      },
      updateSet: async (eventId: EventId, payload: SetPayload) => {
        const existing = state.events.find(event => event.event_id === eventId);
        if (!existing) return;
        const normalizedPayload = enrichSetPayloadWithCatalog(
          payload,
          state.catalog.entries,
        );
        // OPTIMIZATION: Filter events to only relevant exercise
        const relevantEvents = state.events.filter(
          e =>
            asExerciseName(String(e.payload?.exercise ?? '')) ===
            normalizedPayload.exercise,
        );

        const payloadWithPr = {
          ...normalizedPayload,
          ...buildPrPayload(
            normalizedPayload,
            existing.ts,
            relevantEvents,
            state.catalog.entries,
            existing,
          ),
        };
        const nextState = await updateLoggedSet(
          { events: state.events },
          eventId,
          payloadWithPr,
        );
        const updated =
          nextState.events.find(event => event.event_id === eventId) ?? null;

        // OPTIMIZATION: Granular update
        if (updated) {
          dispatch({ type: 'events/update', event: updated });
        }
        dispatch({ type: 'log/editing', eventId: null });
        dispatch({
          type: 'log/status',
          status: {
            text: asToastText('Saved changes'),
            tone: asToastTone('success'),
          },
        });

        // Background persist (debounced)
        scheduleSave(nextState.events);

        dispatch({
          type: 'log/status',
          status: {
            text: asToastText('Saved changes'),
            tone: asToastTone('success'),
          },
        });
      },
      deleteSet: async (eventId: EventId) => {
        // Reducer is synchronous
        const nextState = deleteLoggedSet({ events: state.events }, eventId);

        // OPTIMIZATION: Granular delete
        dispatch({ type: 'events/delete', eventId });
        dispatch({
          type: 'log/status',
          status: {
            text: asToastText('Set deleted'),
            tone: asToastTone('info'),
          },
        });

        // Background persist (debounced)
        scheduleSave(nextState.events);
      },

      toggleFavorite: async (slug: ExerciseSlug, isFavorite: boolean) => {
        await setExerciseFavorite(slug, isFavorite);
        const next = isFavorite
          ? [...state.catalog.favorites, slug]
          : state.catalog.favorites.filter(item => item !== slug);
        dispatch({ type: 'catalog/favorites', favorites: next });
      },
      saveCustomExercise: async (
        values: ExerciseCatalogEntry,
        originalSlug?: ExerciseSlug,
      ) => {
        await persistCustomExercise(
          values,
          originalSlug ? { originalSlug } : undefined,
        );
        await refreshCatalog();
      },
      archiveCustomExercise: async (slug: ExerciseSlug, archived: boolean) => {
        await setCustomExerciseArchived(slug, archived);
        await refreshCatalog();
      },
      deleteExercise: async (entry: ExerciseCatalogEntry) => {
        const matchedEvents = state.events.filter(
          event =>
            asExerciseName(
              String(event.payload?.exercise ?? ''),
            ).toLowerCase() === entry.display_name.toLowerCase(),
        );
        const setCount = matchedEvents.length;
        const favorite = state.catalog.favorites.includes(entry.slug);
        const firstTs =
          matchedEvents.length > 0
            ? Math.min(...matchedEvents.map(event => event.ts))
            : null;
        const lastTs =
          matchedEvents.length > 0
            ? Math.max(...matchedEvents.map(event => event.ts))
            : null;
        const confirmMessage = [
          setCount > 0
            ? `${setCount} logged ${
                setCount === 1 ? 'set' : 'sets'
              } will be permanently deleted.`
            : 'No logged sets found for this exercise.',
          firstTs
            ? `First log: ${new Date(firstTs).toLocaleDateString()}`
            : null,
          lastTs ? `Last log: ${new Date(lastTs).toLocaleDateString()}` : null,
          favorite ? 'This exercise will be removed from favorites.' : null,
        ]
          .filter(Boolean)
          .join('\n');
        const confirmed = await new Promise<boolean>(resolve => {
          let resolved = false;
          const finish = (value: boolean) => {
            if (resolved) return;
            resolved = true;
            resolve(value);
          };
          Alert.alert(
            'Delete exercise',
            confirmMessage,
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => finish(false),
              },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => finish(true),
              },
            ],
            {
              cancelable: true,
              onDismiss: () => finish(false),
            },
          );
        });
        if (!confirmed) {
          return;
        }
        const remainingEvents = state.events.filter(
          event =>
            asExerciseName(
              String(event.payload?.exercise ?? ''),
            ).toLowerCase() !== entry.display_name.toLowerCase(),
        );
        dispatch({ type: 'events/set', events: remainingEvents });
        scheduleSave(remainingEvents);
        if (favorite) {
          await setExerciseFavorite(entry.slug, false);
          dispatch({
            type: 'catalog/favorites',
            favorites: state.catalog.favorites.filter(
              slug => slug !== entry.slug,
            ),
          });
        }
        if (entry.source === asExerciseSource('custom')) {
          await deleteCustomExercise(entry.slug);
        } else {
          await removeDefaultOverride(entry.slug);
          await setExerciseHidden(entry.slug, true);
        }
        dispatch({
          type: 'log/status',
          status: {
            text: asToastText('Exercise deleted'),
            tone: asToastTone('info'),
          },
        });
        await refreshCatalog();
      },
      beginImport,
      importFitnotes: beginImport,
      resetImportSummary: () => {
        dispatch({ type: 'import/summary', summary: null });
      },
    }),
    [
      beginImport,
      getCurrentScreen,
      handleBack,
      pushScreen,
      refreshCatalog,
      refreshFromStorage,
      state.catalog.entries,
      state.catalog.favorites,
      state.events,
      state.logging.logDate,
      state.logging.tab,
      navigationRef,
    ],
  );

  const baseStatusBarStyle =
    contrastColor(palette.background) === '#0f172a' ? 'dark' : 'light';

  const browserGestureEnabled =
    state.browser.mode === 'groups' &&
    !state.browser.searchExpanded &&
    !state.browser.menuOpen &&
    !state.browser.contextEntry;
  const primaryScreenAnimation =
    Platform.OS === 'ios' ? 'slide_from_right' : 'default';

  if (!settingsHydrated) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color={palette.primary} />
        <Text
          style={{
            marginTop: spacing(2),
            color: palette.mutedText,
            fontSize: 14,
          }}
        >
          Loading your workouts...
        </Text>
      </View>
    );
  }

  return (
    <AppProvider state={state} dispatch={dispatch} actions={actions}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: palette.background }}
        edges={['left', 'right', 'bottom']}
      >
        <View style={{ flex: 1, backgroundColor: palette.background }}>
          <NavigationContainer ref={navigationRef}>
            <Stack.Navigator
              initialRouteName="home"
              screenOptions={{
                headerShown: false,
                gestureEnabled: true,
                gestureResponseDistance: { start: 24 },
                fullScreenGestureEnabled: false,
                statusBarStyle: baseStatusBarStyle,
              }}
            >
              <Stack.Screen name="home" component={HomeRoute} />
              <Stack.Screen
                name="calendar"
                component={CalendarRoute}
                options={{
                  animation: primaryScreenAnimation,
                  animationTypeForReplace: 'pop',
                }}
              />
              <Stack.Screen
                name="analytics"
                component={AnalyticsRoute}
                options={{
                  animation: primaryScreenAnimation,
                  animationTypeForReplace: 'pop',
                }}
              />
              <Stack.Screen
                name="more"
                component={MoreRoute}
                options={{
                  animation: primaryScreenAnimation,
                  animationTypeForReplace: 'pop',
                }}
              />
              <Stack.Screen
                name="browser"
                component={BrowserRoute}
                options={{
                  gestureEnabled: browserGestureEnabled,
                  headerBackButtonMenuEnabled: false,
                }}
              />
              <Stack.Screen name="log" component={LogRoute} />
              <Stack.Screen name="history" component={HistoryRoute} />
              <Stack.Screen
                name="importSummary"
                component={ImportSummaryRoute}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </SafeAreaView>
    </AppProvider>
  );
};

const App = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <BottomSheetModalProvider>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AppInner />
        </ErrorBoundary>
      </SafeAreaProvider>
    </BottomSheetModalProvider>
  </GestureHandlerRootView>
);

const formatLabel = (value: string) =>
  value
    .split('_')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

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

const enrichSetPayloadWithCatalog = (
  payload: SetPayload,
  catalog: ExerciseCatalogEntry[],
): SetPayload => {
  const entry = catalog.find(item => item.display_name === payload.exercise);
  if (!entry) {
    return payload;
  }
  return {
    ...payload,
    exercise_slug: payload.exercise_slug ?? entry.slug,
    modality: payload.modality ?? entry.modality,
  };
};

const buildLogTimestamp = (date: Date, now = new Date()) => {
  const combined = new Date(date);
  combined.setHours(
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  );
  return combined.getTime();
};

const loggingFieldsFromEvent = (event: WorkoutEvent) => ({
  reps:
    typeof event.payload?.reps === 'number'
      ? asNumericInput(event.payload.reps.toString())
      : asNumericInput(''),
  weight:
    typeof event.payload?.weight === 'number'
      ? asNumericInput(event.payload.weight.toString())
      : asNumericInput(''),
  duration:
    typeof event.payload?.duration === 'number'
      ? asNumericInput(
          formatTrimmedNumber(secondsToMinutes(event.payload.duration), 2),
        )
      : asNumericInput(''),
  distance:
    typeof event.payload?.distance === 'number'
      ? asNumericInput(event.payload.distance.toString())
      : asNumericInput(''),
});

const pickPrefillEventForExerciseDate = (
  events: WorkoutEvent[],
  exerciseName: ExerciseName,
  date: Date,
): WorkoutEvent | undefined => {
  const targetDay = roundToLocalDay(date.getTime());
  const exerciseEvents = events.filter(
    event =>
      asExerciseName(String(event.payload?.exercise ?? '')) === exerciseName,
  );
  if (exerciseEvents.length === 0) {
    return undefined;
  }

  const sameDayEvents = exerciseEvents
    .filter(event => roundToLocalDay(event.ts) === targetDay)
    .sort((a, b) => b.ts - a.ts);
  if (sameDayEvents.length > 0) {
    return sameDayEvents[0];
  }

  const dayBuckets = Array.from(
    new Set(
      exerciseEvents
        .map(event => roundToLocalDay(event.ts))
        .filter(bucket => bucket < targetDay),
    ),
  ).sort((a, b) => b - a);
  if (dayBuckets.length === 0) {
    return exerciseEvents.sort((a, b) => b.ts - a.ts)[0];
  }

  const previousDay = dayBuckets[0];
  const previousDayEvents = exerciseEvents
    .filter(event => roundToLocalDay(event.ts) === previousDay)
    .sort((a, b) => a.ts - b.ts);
  return previousDayEvents[0];
};

export default App;
