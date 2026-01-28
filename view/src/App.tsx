import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { BackHandler, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  NavigationContainer,
  StackActions,
  TabActions,
  useNavigation,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
import AnalyticsScreen from './screens/AnalyticsScreen';
import MoreScreen from './screens/MoreScreen';
import ImportSummaryScreen from './screens/ImportSummaryScreen';
import HomeScreen from './screens/HomeScreen';
import CalendarScreen from './screens/CalendarScreen';
import {
  PlanSuggestion,
  WorkoutEvent,
  WorkoutState,
  deleteLoggedSet,
  logSet,
  suggestNext,
  updateLoggedSet,
} from './workoutFlows';
import { init } from './storage';
import { loadAllEvents, scheduleSave } from './state/persistence';
import {
  estimateOneRm as rustEstimateOneRm,
  scoreSet as rustScoreSet,
} from './TrackerEngine';
import { palette } from './ui/theme';
import { getMuscleColor } from './ui/muscleColors';
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

type TabParamList = {
  home: undefined;
  calendar: undefined;
  analytics: undefined;
  more: undefined;
};

type RootStackParamList = {
  mainTabs: { screen?: keyof TabParamList } | undefined;
  browser: undefined;
  log: undefined;
  history: undefined;
  importSummary: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

enableScreens();

const ScreenShell = ({
  children,
  topInsetColor,
}: {
  children: React.ReactNode;
  topInsetColor?: string;
}) => {
  const insets = useSafeAreaInsets();
  const insetColor = topInsetColor ?? palette.background;

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

const getMainTabsKey = (state: unknown): string | null => {
  const navState = state as {
    routes?: Array<{ name: string; key?: string; state?: { key?: string } }>;
  };
  if (!navState?.routes?.length) return null;
  const route = navState.routes.find(item => item.name === 'mainTabs');
  return route?.state?.key ?? route?.key ?? null;
};

const HomeRoute = () => (
  <ScreenShell>
    <HomeScreen />
  </ScreenShell>
);

const CalendarRoute = () => (
  <ScreenShell>
    <CalendarScreen />
  </ScreenShell>
);

const AnalyticsRoute = () => (
  <ScreenShell>
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title={asLabelText('Trends')}
        subtitle={asLabelText('Charts & records')}
      />
      <AnalyticsScreen />
    </View>
  </ScreenShell>
);

const MoreRoute = () => (
  <ScreenShell>
    <MoreScreen />
  </ScreenShell>
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

const MainTabs = () => {
  const state = useAppState();
  const actions = useAppActions();
  const dispatch = useAppDispatch();

  const resetBrowserState = () => {
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

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={({ state: tabState, navigation }) => {
        const routeName =
          tabState.routes[tabState.index]?.name ?? ('home' as string);
        const currentKey = asNavKey(routeName as NavKeyValue);
        const isToday =
          roundToLocalDay(state.selectedDate.getTime()) ===
          roundToLocalDay(Date.now());
        return (
          <BottomNav
            current={currentKey}
            onSelect={key => {
              if (key === asNavKey('browser')) {
                resetBrowserState();
                actions.navigate(asScreenKey('browser'));
                return;
              }
              if (key === asNavKey('home')) {
                if (!isToday) {
                  actions.setSelectedDate(new Date());
                }
                if (currentKey !== asNavKey('home')) {
                  navigation.navigate('home');
                }
                return;
              }
              if (key === currentKey) return;
              navigation.navigate(key as unknown as keyof TabParamList);
            }}
          />
        );
      }}
    >
      <Tab.Screen name="home" component={HomeRoute} />
      <Tab.Screen name="calendar" component={CalendarRoute} />
      <Tab.Screen name="analytics" component={AnalyticsRoute} />
      <Tab.Screen name="more" component={MoreRoute} />
    </Tab.Navigator>
  );
};

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
  const [currentRouteName, setCurrentRouteName] =
    useState<ScreenKeyValue>('home');

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

  const jumpToMainTab = useCallback(
    (
      target: TabParamList extends infer T
        ? keyof T & ScreenKeyValue
        : ScreenKeyValue,
    ) => {
      if (!navigationRef.isReady()) return;
      const rootState = navigationRef.getRootState();
      const mainTabsKey = getMainTabsKey(rootState);
      if (!mainTabsKey) {
        navigationRef.navigate('mainTabs', { screen: target });
        return;
      }
      navigationRef.dispatch({
        ...TabActions.jumpTo(target),
        target: mainTabsKey,
      });
    },
    [navigationRef],
  );

  const handleBack = useCallback(() => {
    if (state.browser.menuOpen) {
      dispatch({ type: 'browser/menu', open: false });
      return true;
    }
    if (state.browser.searchExpanded) {
      dispatch({ type: 'browser/search', expanded: false });
      dispatch({ type: 'browser/query', query: asSearchQuery('') });
      return true;
    }
    if (state.browser.contextEntry) {
      dispatch({ type: 'browser/context', context: null });
      return true;
    }

    const activeRouteName =
      navigationRef.isReady() && navigationRef.getRootState()
        ? getActiveRouteName(navigationRef.getRootState())
        : currentRouteName;
    const currentScreen = asScreenKey(activeRouteName);

    if (currentScreen === asScreenKey('browser')) {
      if (state.browser.selectedGroup) {
        dispatch({ type: 'browser/group', group: null });
        dispatch({ type: 'browser/query', query: asSearchQuery('') });
        return true;
      }
    }

    if (currentScreen === asScreenKey('importSummary')) {
      if (navigationRef.isReady()) {
        navigationRef.goBack();
      }
      return true;
    }

    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
      return true;
    }

    if (currentScreen !== asScreenKey('home')) {
      if (navigationRef.isReady()) {
        jumpToMainTab('home');
      }
      return true;
    }

    return false;
  }, [currentRouteName, jumpToMainTab, navigationRef, state.browser]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBack,
    );
    return () => subscription.remove();
  }, [handleBack]);

  const actions = useMemo(
    () => ({
      navigate: (screen: ScreenKey) => {
        if (!navigationRef.isReady()) return;
        const target = unwrapScreenKey(screen);
        if (currentRouteName === target) return;
        if (
          target === 'home' ||
          target === 'calendar' ||
          target === 'analytics' ||
          target === 'more'
        ) {
          jumpToMainTab(target);
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
        pushScreen(asScreenKey('log'));
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
        const eventTs = buildLogTimestamp(state.logging.logDate);
        const eventId = asEventId(
          `evt-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        );
        if (__DEV__) {
          console.log('Logging set', payload, eventTs);
        }
        const baseEvent: WorkoutEvent = {
          tracker_id: asTrackerId('workout_v1'),
          event_id: eventId,
          ts: eventTs,
          payload,
          meta: { source: asJsonString('manual') },
        };
        const nextState = await logSet({ events: state.events }, baseEvent);
        const createdEvent =
          nextState.events.find(item => item.event_id === eventId) ??
          nextState.events[nextState.events.length - 1];

        // OPTIMIZATION: Filter events to only relevant exercise to reduce JSON serialization overhead
        const relevantEvents = state.events.filter(
          e =>
            asExerciseName(String(e.payload?.exercise ?? '')) ===
            payload.exercise,
        );

        const eventWithPr = createdEvent
          ? {
              ...createdEvent,
              payload: buildPrPayload(
                payload,
                createdEvent.ts,
                relevantEvents,
                state.catalog.entries,
                undefined, // existingEvent is undefined for new logs
              ),
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
      updateSet: async (
        eventId: EventId,
        payload: {
          exercise: ExerciseName;
          reps?: number;
          weight?: number;
          duration?: number;
          distance?: number;
        },
      ) => {
        const existing = state.events.find(event => event.event_id === eventId);
        if (!existing) return;
        // OPTIMIZATION: Filter events to only relevant exercise
        const relevantEvents = state.events.filter(
          e =>
            asExerciseName(String(e.payload?.exercise ?? '')) ===
            payload.exercise,
        );

        const nextState = await updateLoggedSet(
          { events: state.events },
          eventId,
          buildPrPayload(
            payload,
            existing.ts,
            relevantEvents,
            state.catalog.entries,
            existing,
          ),
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
        const hasEvents = state.events.some(
          event =>
            asExerciseName(String(event.payload?.exercise ?? '')) ===
            entry.display_name,
        );
        if (entry.source === asExerciseSource('custom')) {
          if (hasEvents) {
            await setCustomExerciseArchived(entry.slug, true);
          } else {
            await deleteCustomExercise(entry.slug);
          }
        } else {
          await setExerciseHidden(entry.slug, true);
        }
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
      currentRouteName,
      handleBack,
      jumpToMainTab,
      pushScreen,
      refreshCatalog,
      refreshFromStorage,
      state.catalog.entries,
      state.catalog.favorites,
      state.events,
      state.logging.logDate,
      state.logging.tab,
      state.suggestions.planner,
      navigationRef,
    ],
  );

  const baseStatusBarStyle =
    contrastColor(palette.background) === '#0f172a' ? 'dark' : 'light';

  const handleNavStateChange = useCallback(() => {
    const rootState = navigationRef.getRootState();
    const activeRoute = getActiveRouteName(rootState);
    setCurrentRouteName(activeRoute);
  }, [navigationRef]);

  const browserGestureEnabled =
    state.browser.mode === 'groups' &&
    !state.browser.selectedGroup &&
    !state.browser.searchExpanded &&
    !state.browser.menuOpen &&
    !state.browser.contextEntry;

  return (
    <AppProvider state={state} dispatch={dispatch} actions={actions}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: palette.background }}
        edges={['left', 'right', 'bottom']}
      >
        <View style={{ flex: 1, backgroundColor: palette.background }}>
          <NavigationContainer
            ref={navigationRef}
            onReady={handleNavStateChange}
            onStateChange={handleNavStateChange}
          >
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                gestureEnabled: true,
                gestureResponseDistance: { start: 24 },
                fullScreenGestureEnabled: false,
                statusBarStyle: baseStatusBarStyle,
              }}
            >
              <Stack.Screen name="mainTabs" component={MainTabs} />
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
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  </GestureHandlerRootView>
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

export default App;
