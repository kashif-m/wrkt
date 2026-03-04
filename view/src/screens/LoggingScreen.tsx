import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardEvent,
  Platform,
  Pressable,
  SectionList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { WorkoutEvent } from '../workoutFlows';
import { Card, PrimaryButton, BodyText } from '../ui/components';
import {
  cardShadowStyle,
  palette,
  radius,
  spacing,
} from '../ui/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addAlpha } from '../ui/color';
import { JsonObject } from '../TrackerEngine';
import { roundToLocalDay } from '../timePolicy';
import { getMuscleColor } from '../ui/muscleColors';
import ChevronLeftIcon from '../assets/chevron-left.svg';
import ChevronRightIcon from '../assets/chevron-right.svg';
import {
  useAppActions,
  useAppDispatch,
  useAppState,
} from '../state/appContext';
import { LoggingFields } from '../state/appState';
import {
  ColorHex,
  DisplayLabel,
  ExerciseName,
  LoggingModeValue,
  NumericInput,
  asDisplayLabel,
  asExerciseName,
  asLabelText,
  asNumericInput,
  unwrapLoggingMode,
} from '../domain/types';
import { AnalyticsRangeSelector } from '../components/analytics/AnalyticsRangeSelector';
import { AnalyticsInlineSelect } from '../components/analytics/AnalyticsInlineSelect';
import { analyticsRangeOptions } from '../components/analytics/analyticsRanges';
import {
  exerciseMetricOptionsForMode,
  unitForExerciseMetric,
} from '../components/analytics/analyticsExercises';
import { SkiaTrendChart } from '../components/analytics/SkiaTrendChart';
import { useExerciseTrendSeries } from '../components/analytics/useExerciseTrendSeries';
import {
  formatDurationMinutes,
  formatTrimmedNumber,
  minutesToSeconds,
  secondsToMinutes,
} from '../ui/formatters';
import PagerTabsRail from '../ui/pager/PagerTabsRail';
import { usePagerTabsController } from '../ui/pager/usePagerTabsController';

const sessionTabs = ['Track', 'History', 'Trends'] as const;
const sessionTabLabels: Record<SessionTab, string> = {
  Track: 'Track',
  History: 'History',
  Trends: 'Trends',
};
export type SessionTab = (typeof sessionTabs)[number];
const sessionTabDefinitions = sessionTabs.map(tab => ({
  key: tab,
  label: sessionTabLabels[tab],
}));

const INITIAL_FIELDS: LoggingFields = {
  reps: asNumericInput(''),
  weight: asNumericInput(''),
  duration: asNumericInput(''),
  distance: asNumericInput(''),
};
type FieldKey = keyof typeof INITIAL_FIELDS;
type FieldConfig = {
  key: FieldKey;
  label: DisplayLabel;
  unit?: DisplayLabel;
  step: number;
};

const FIELD_CONFIGS: Record<LoggingModeValue | 'default', FieldConfig[]> = {
  reps_weight: [
    {
      key: 'weight',
      label: asDisplayLabel('Weight'),
      unit: asDisplayLabel('kg'),
      step: 2.5,
    },
    {
      key: 'reps',
      label: asDisplayLabel('Reps'),
      unit: asDisplayLabel('reps'),
      step: 1,
    },
  ],
  reps: [
    {
      key: 'reps',
      label: asDisplayLabel('Reps'),
      unit: asDisplayLabel('reps'),
      step: 1,
    },
  ],
  time: [
    {
      key: 'duration',
      label: asDisplayLabel('Time'),
      unit: asDisplayLabel('min'),
      step: 0.5,
    },
  ],
  distance: [
    {
      key: 'distance',
      label: asDisplayLabel('Distance'),
      unit: asDisplayLabel('m'),
      step: 50,
    },
  ],
  time_distance: [
    {
      key: 'duration',
      label: asDisplayLabel('Time'),
      unit: asDisplayLabel('min'),
      step: 0.5,
    },
    {
      key: 'distance',
      label: asDisplayLabel('Distance'),
      unit: asDisplayLabel('m'),
      step: 50,
    },
  ],
  distance_weight: [
    {
      key: 'distance',
      label: asDisplayLabel('Distance'),
      unit: asDisplayLabel('m'),
      step: 50,
    },
    {
      key: 'weight',
      label: asDisplayLabel('Weight'),
      unit: asDisplayLabel('kg'),
      step: 2.5,
    },
  ],
  default: [
    {
      key: 'reps',
      label: asDisplayLabel('Reps'),
      unit: asDisplayLabel('reps'),
      step: 1,
    },
    {
      key: 'weight',
      label: asDisplayLabel('Weight'),
      unit: asDisplayLabel('kg'),
      step: 2.5,
    },
  ],
};

const LoggingScreen = () => {
  const insets = useSafeAreaInsets();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const catalog = state.catalog.entries;
  const selectedExercise = useMemo(
    () =>
      catalog.find(
        entry => entry.display_name === state.logging.exerciseName,
      ) ?? null,
    [catalog, state.logging.exerciseName],
  );
  const fields = state.logging.fields;
  const sessionTab = state.logging.tab;
  const sessionTabController = usePagerTabsController({
    tabs: sessionTabs,
    selectedTab: sessionTab,
    onTabChange: nextTab => {
      if (state.logging.editingEventId) {
        dispatch({ type: 'log/editing', eventId: null });
      }
      dispatch({ type: 'log/tab', tab: nextTab });
    },
  });
  const [historyViewportHeight, setHistoryViewportHeight] = useState(0);
  const selectedTrendRange = state.logging.selectedTrendRange;
  const selectedTrendMetric = state.logging.selectedTrendMetric;
  const selectedTrendRmReps = state.logging.selectedTrendRmReps;
  const loggingDate = state.logging.logDate;
  const editingEventId = state.logging.editingEventId;
  const updateCtaProgress = useSharedValue(0);
  const deleteCtaProgress = useSharedValue(0);
  const [interactionLocked, setInteractionLocked] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = createStyles();

  const handleInteractionLockChange = useCallback((locked: boolean) => {
    if (unlockTimerRef.current) {
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    setInteractionLocked(locked);
    if (locked) {
      unlockTimerRef.current = setTimeout(() => {
        setInteractionLocked(false);
      }, 1800);
    }
  }, []);

  useEffect(
    () => () => {
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const handleKeyboardFrame = (event: KeyboardEvent) => {
      if (Platform.OS === 'ios') {
        const windowHeight = Dimensions.get('window').height;
        const frameY = event.endCoordinates?.screenY ?? windowHeight;
        setKeyboardInset(Math.max(0, windowHeight - frameY));
        return;
      }
      setKeyboardInset(event.endCoordinates?.height ?? 0);
    };
    const handleKeyboardHide = () => {
      setKeyboardInset(0);
    };

    if (Platform.OS === 'ios') {
      const frameSub = Keyboard.addListener(
        'keyboardWillChangeFrame',
        handleKeyboardFrame,
      );
      const hideSub = Keyboard.addListener('keyboardWillHide', handleKeyboardHide);
      return () => {
        frameSub.remove();
        hideSub.remove();
      };
    }

    const showSub = Keyboard.addListener('keyboardDidShow', handleKeyboardFrame);
    const hideSub = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (editingEventId) {
      updateCtaProgress.value = withTiming(1, { duration: 180 });
      deleteCtaProgress.value = withDelay(70, withTiming(1, { duration: 180 }));
      return;
    }
    updateCtaProgress.value = withTiming(0, { duration: 120 });
    deleteCtaProgress.value = withTiming(0, { duration: 100 });
  }, [deleteCtaProgress, editingEventId, updateCtaProgress]);
  const handleHistoryPageLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const nextHeight = event.nativeEvent.layout.height;
      if (nextHeight > 0 && Math.abs(nextHeight - historyViewportHeight) > 1) {
        setHistoryViewportHeight(nextHeight);
      }
    },
    [historyViewportHeight],
  );

  const shiftLogDate = (deltaDays: number) => {
    const next = new Date(loggingDate);
    next.setDate(next.getDate() + deltaDays);
    dispatch({ type: 'log/date', date: next });
  };

  const fieldDefinitions = useMemo(() => {
    return selectedExercise
      ? FIELD_CONFIGS[unwrapLoggingMode(selectedExercise.logging_mode)] ??
          FIELD_CONFIGS.default
      : FIELD_CONFIGS.default;
  }, [selectedExercise]);

  const exerciseSets = useMemo(() => {
    if (!selectedExercise) return [];
    return state.events.filter(
      event => readExerciseName(event) === selectedExercise.display_name,
    );
  }, [selectedExercise, state.events]);

  const todaySets = useMemo(() => {
    if (!selectedExercise) return [];
    const start = new Date(loggingDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return exerciseSets.filter(
      event => event.ts >= start.getTime() && event.ts < end.getTime(),
    );
  }, [exerciseSets, selectedExercise, loggingDate]);

  const latestTodaySet = useMemo(() => {
    if (todaySets.length === 0) return null;
    return todaySets.reduce((latest, event) =>
      event.ts > latest.ts ? event : latest,
    );
  }, [todaySets]);

  const groupedHistory = useMemo(() => {
    const groups = new Map<number, WorkoutEvent[]>();
    exerciseSets.forEach(event => {
      const day = roundToLocalDay(event.ts);
      const bucket = groups.get(day) ?? [];
      bucket.push(event);
      groups.set(day, bucket);
    });
    return [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([day, events]) => ({
        day,
        label: new Date(day).toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        }),
        events: events.sort((a, b) => b.ts - a.ts),
      }));
  }, [exerciseSets]);
  const historySections = useMemo(
    () =>
      groupedHistory.map(group => ({
        key: `${group.day}`,
        title: group.label,
        data: group.events,
      })),
    [groupedHistory],
  );
  const historyEventCount = useMemo(
    () =>
      historySections.reduce((count, section) => count + section.data.length, 0),
    [historySections],
  );
  const historyEstimatedHeight = useMemo(() => {
    const rowHeight = 52;
    const sectionHeaderHeight = 26;
    const cardPadding = spacing(2);
    return (
      historyEventCount * rowHeight +
      historySections.length * sectionHeaderHeight +
      cardPadding
    );
  }, [historyEventCount, historySections.length]);
  const historyShouldFillHeight =
    historyViewportHeight > 0 &&
    historyEstimatedHeight >= historyViewportHeight - spacing(3);

  const prEventIdsAll = useMemo(
    () =>
      new Set(
        exerciseSets
          .filter(event => event.payload?.pr === true)
          .map(event => event.event_id),
      ),
    [exerciseSets],
  );
  const prEventIdsToday = useMemo(
    () =>
      new Set(
        todaySets
          .filter(event => event.payload?.pr === true)
          .map(event => event.event_id),
      ),
    [todaySets],
  );

  const { chartData: trendData, exerciseEventsInRange: trendEventsInRange } =
    useExerciseTrendSeries({
      events: exerciseSets,
      catalog: state.catalog.entries as unknown as JsonObject[],
      exercise: selectedExercise?.display_name ?? null,
      metric: selectedTrendMetric,
      range: selectedTrendRange,
      rmReps: selectedTrendMetric === 'pr_by_rm' ? selectedTrendRmReps : null,
      traceSource: 'logging/trends',
      revisions: {
        eventsRevision: state.eventsRevision,
        catalogRevision: state.catalogRevision,
      },
    });

  const displayTrendData = useMemo(() => {
    const usesDurationMetric =
      selectedTrendMetric === 'max_active_duration' ||
      selectedTrendMetric === 'workout_active_duration';
    if (!usesDurationMetric) return trendData;
    return trendData.map(point => ({
      ...point,
      value: secondsToMinutes(point.value),
    }));
  }, [selectedTrendMetric, trendData]);

  const trendMetricSignals = useMemo(
    () =>
      trendEventsInRange.reduce(
        (signals, event) => {
          const weight = readNumber(event.payload?.weight);
          const reps = readNumber(event.payload?.reps);
          const distance = readNumber(event.payload?.distance);
          const duration = readNumber(event.payload?.duration);
          if (typeof weight === 'number' && weight > 0)
            signals.hasWeight = true;
          if (typeof reps === 'number' && reps > 0) signals.hasReps = true;
          if (typeof distance === 'number' && distance > 0) {
            signals.hasDistance = true;
          }
          if (typeof duration === 'number' && duration > 0) {
            signals.hasDuration = true;
          }
          return signals;
        },
        {
          hasWeight: false,
          hasReps: false,
          hasDistance: false,
          hasDuration: false,
        },
      ),
    [trendEventsInRange],
  );

  const trendMetricOptions = useMemo(
    () =>
      exerciseMetricOptionsForMode(
        selectedExercise
          ? unwrapLoggingMode(selectedExercise.logging_mode)
          : null,
        trendMetricSignals,
      ),
    [selectedExercise, trendMetricSignals],
  );

  useEffect(() => {
    if (trendMetricOptions.length === 0) return;
    if (
      !trendMetricOptions.some(option => option.key === selectedTrendMetric)
    ) {
      dispatch({ type: 'log/trendMetric', metric: trendMetricOptions[0].key });
    }
  }, [dispatch, selectedTrendMetric, trendMetricOptions]);

  const trendRmOptions = useMemo(() => {
    const reps = new Set<number>();
    trendEventsInRange.forEach(event => {
      const weight = readNumber(event.payload?.weight);
      const setReps = readNumber(event.payload?.reps);
      if (
        typeof weight === 'number' &&
        weight > 0 &&
        typeof setReps === 'number' &&
        setReps > 0
      ) {
        reps.add(Math.round(setReps));
      }
    });
    return Array.from(reps)
      .sort((a, b) => a - b)
      .map(value => ({
        key: `${value}`,
        label: asLabelText(`${value}RM`),
      }));
  }, [trendEventsInRange]);

  useEffect(() => {
    if (selectedTrendMetric !== 'pr_by_rm') {
      if (selectedTrendRmReps !== null) {
        dispatch({ type: 'log/trendRm', rmReps: null });
      }
      return;
    }

    if (trendRmOptions.length === 0) {
      if (selectedTrendRmReps !== null) {
        dispatch({ type: 'log/trendRm', rmReps: null });
      }
      return;
    }

    const selectedKey =
      selectedTrendRmReps === null ? null : `${selectedTrendRmReps}`;
    if (
      !selectedKey ||
      !trendRmOptions.some(option => option.key === selectedKey)
    ) {
      dispatch({
        type: 'log/trendRm',
        rmReps: Number(trendRmOptions[0].key),
      });
    }
  }, [dispatch, selectedTrendMetric, selectedTrendRmReps, trendRmOptions]);

  const trackDisabled =
    !selectedExercise ||
    fieldDefinitions.every(definition => {
      const numericValue = parseNumericField(fields[definition.key]);
      return typeof numericValue !== 'number';
    });

  const handleAddSet = async () => {
    if (!selectedExercise) return;
    const payload = buildPayloadFromFields(
      fields,
      selectedExercise.display_name,
    );
    await actions.logSet(payload);
    const nextFields = { ...fields };
    if (typeof payload.reps === 'number')
      nextFields.reps = asNumericInput(payload.reps.toString());
    if (typeof payload.weight === 'number')
      nextFields.weight = asNumericInput(payload.weight.toString());
    if (typeof payload.duration === 'number')
      nextFields.duration = asNumericInput(
        formatTrimmedNumber(secondsToMinutes(payload.duration), 2),
      );
    if (typeof payload.distance === 'number')
      nextFields.distance = asNumericInput(payload.distance.toString());
    dispatch({ type: 'log/fields', fields: nextFields });
    dispatch({ type: 'log/tab', tab: 'Track' });
  };

  const handleSelectSet = (event: WorkoutEvent) => {
    dispatch({ type: 'log/date', date: new Date(roundToLocalDay(event.ts)) });
    dispatch({ type: 'log/editing', eventId: event.event_id });
    dispatch({ type: 'log/fields', fields: fieldsFromEvent(event) });
    dispatch({ type: 'log/tab', tab: 'Track' });
  };

  const handleUpdateSet = async () => {
    if (!selectedExercise || !editingEventId) return;
    const payload = buildPayloadFromFields(
      fields,
      selectedExercise.display_name,
    );
    await actions.updateSet(editingEventId, payload);
    dispatch({ type: 'log/editing', eventId: null });
  };

  const handleDeleteSet = async () => {
    if (!editingEventId) return;
    await actions.deleteSet(editingEventId);
    dispatch({ type: 'log/editing', eventId: null });
    dispatch({ type: 'log/fields', fields: { ...INITIAL_FIELDS } });
  };

  const clearEditingSelection = useCallback(() => {
    if (!editingEventId) return;
    dispatch({ type: 'log/editing', eventId: null });
    dispatch({
      type: 'log/fields',
      fields: latestTodaySet ? fieldsFromEvent(latestTodaySet) : { ...INITIAL_FIELDS },
    });
  }, [dispatch, editingEventId, latestTodaySet]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        dispatch({ type: 'log/editing', eventId: null });
      };
    }, [dispatch]),
  );


  const setFieldValue = (key: FieldKey, delta: number) => {
    const nextFields = { ...fields };
    const current = parseFloat(nextFields[key]) || 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    nextFields[key] = asNumericInput(next === 0 ? '' : next.toString());
    dispatch({ type: 'log/fields', fields: nextFields });
  };
  const handleSessionTabPress = useCallback(
    (tab: SessionTab) => {
      if (editingEventId) {
        dispatch({ type: 'log/editing', eventId: null });
      }
      sessionTabController.onTabPress(tab);
    },
    [dispatch, editingEventId, sessionTabController],
  );

  const updateCtaStyle = useAnimatedStyle(() => ({
    opacity: updateCtaProgress.value,
    transform: [{ translateY: (1 - updateCtaProgress.value) * 8 }],
  }));
  const deleteCtaStyle = useAnimatedStyle(() => ({
    opacity: deleteCtaProgress.value,
    transform: [{ translateY: (1 - deleteCtaProgress.value) * 10 }],
  }));
  const ctaPaddingTop = spacing(1);
  const ctaPaddingBottom =
    keyboardInset > 0
      ? ctaPaddingTop
      : Math.max(insets.bottom, ctaPaddingTop);
  const ctaKeyboardLift = Math.max(0, keyboardInset - insets.bottom);

  return (
    <View style={{ flex: 1 }}>
      {!selectedExercise ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: spacing(2),
            gap: spacing(2),
            paddingBottom: spacing(2),
          }}
        >
          <Card>
            <Text style={{ color: palette.mutedText }}>
              Select an exercise to log sets.
            </Text>
          </Card>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <PagerTabsRail
            tabs={sessionTabDefinitions}
            activeKey={sessionTab}
            progress={sessionTabController.progress}
            onSelect={handleSessionTabPress}
            containerStyle={styles.sessionRailWrap}
          />

            <PagerView
              ref={sessionTabController.pagerRef}
              style={{ flex: 1 }}
              initialPage={sessionTabController.selectedIndex}
              offscreenPageLimit={3}
              scrollEnabled={!interactionLocked}
              overdrag={false}
              onPageSelected={sessionTabController.onPageSelected}
              onPageScroll={sessionTabController.onPageScroll}
            >
              <View key="Track" style={styles.sessionPage}>
                <View style={styles.sessionPage}>
                  <ScrollView
                    style={styles.sessionPage}
                    keyboardShouldPersistTaps="handled"
                    directionalLockEnabled
                    contentContainerStyle={{
                      paddingHorizontal: spacing(2),
                      paddingTop: spacing(1.25),
                      paddingBottom: spacing(2),
                    }}
                  >
                    <Card style={styles.sessionContentCard}>
                      <View style={styles.dateRow}>
                        <TouchableOpacity
                          onPress={() => shiftLogDate(-1)}
                          style={styles.dateButton}
                        >
                          <ChevronLeftIcon
                            width={16}
                            height={16}
                            color={palette.text}
                          />
                        </TouchableOpacity>
                        <View style={{ alignItems: 'center', flex: 1 }}>
                          <Text style={{ color: palette.text, fontWeight: '600' }}>
                            {formatDateLabel(loggingDate)}
                          </Text>
                          <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                            {loggingDate.toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => shiftLogDate(1)}
                          style={styles.dateButton}
                        >
                          <ChevronRightIcon
                            width={16}
                            height={16}
                            color={palette.text}
                          />
                        </TouchableOpacity>
                      </View>
                      <View style={{ gap: spacing(1) }}>
                        {fieldDefinitions.map(definition => (
                          <Stepper
                            key={definition.key}
                            label={definition.label}
                            unit={definition.unit}
                            value={fields[definition.key]}
                            onIncrement={() => {
                              setFieldValue(definition.key, definition.step);
                            }}
                            onDecrement={() => {
                              setFieldValue(definition.key, -definition.step);
                            }}
                            onChange={value => {
                              dispatch({
                                type: 'log/fields',
                                fields: {
                                  ...fields,
                                  [definition.key]: asNumericInput(value),
                                },
                              });
                            }}
                          />
                        ))}
                      </View>
                      <View style={{ marginTop: spacing(2) }}>
                        {todaySets.length === 0 ? (
                          <BodyText style={{ color: palette.mutedText }}>
                            No sets logged today.
                          </BodyText>
                        ) : (
                          todaySets.map((set, index) => (
                            <SetRow
                              key={set.event_id}
                              event={set}
                              highlightColor={getMuscleColor(
                                selectedExercise?.primary_muscle_group,
                              )}
                              onPress={() => handleSelectSet(set)}
                              active={editingEventId === set.event_id}
                              previousActive={
                                index > 0 &&
                                editingEventId === todaySets[index - 1].event_id
                              }
                              isLast={index === todaySets.length - 1}
                              pr={prEventIdsToday.has(set.event_id)}
                            />
                          ))
                        )}
                      </View>
                    </Card>
                    <Pressable
                      onPress={clearEditingSelection}
                      style={{ minHeight: spacing(4) }}
                    />
                  </ScrollView>
                  <View
                    style={[
                      styles.trackStickyCta,
                      {
                        paddingTop: ctaPaddingTop,
                        paddingBottom: ctaPaddingBottom,
                        marginBottom: ctaKeyboardLift,
                      },
                    ]}
                  >
                    {editingEventId ? (
                      <>
                        <Animated.View style={updateCtaStyle}>
                          <PrimaryButton
                            label={asLabelText('Update set')}
                            onPress={handleUpdateSet}
                            disabled={trackDisabled}
                          />
                        </Animated.View>
                        <Animated.View style={deleteCtaStyle}>
                          <TouchableOpacity
                            onPress={handleDeleteSet}
                            style={styles.dangerButton}
                          >
                            <Text style={{ color: '#fffaf2', fontWeight: '600' }}>
                              Delete set
                            </Text>
                          </TouchableOpacity>
                        </Animated.View>
                      </>
                    ) : (
                      <PrimaryButton
                        label={asLabelText('Log set')}
                        onPress={handleAddSet}
                        disabled={trackDisabled}
                      />
                    )}
                  </View>
                </View>
              </View>

              <View
                key="History"
                style={styles.sessionPage}
                onLayout={handleHistoryPageLayout}
              >
                <Card
                  style={
                    historyShouldFillHeight
                      ? [
                          styles.sessionContentCard,
                          styles.historyCard,
                          styles.historyCardExpanded,
                          styles.historyCardFrame,
                        ]
                      : [
                          styles.sessionContentCard,
                          styles.historyCard,
                          styles.historyCardFrame,
                        ]
                  }
                >
                  {historySections.length === 0 ? (
                    <BodyText
                      style={{
                        color: palette.mutedText,
                        paddingHorizontal: spacing(2),
                      }}
                    >
                      Log sets to unlock history.
                    </BodyText>
                  ) : (
                    <SectionList
                      sections={historySections}
                      keyExtractor={item => item.event_id}
                      onTouchStart={clearEditingSelection}
                      onScrollBeginDrag={clearEditingSelection}
                      keyboardShouldPersistTaps="handled"
                      directionalLockEnabled
                      scrollEnabled={historyShouldFillHeight}
                      showsVerticalScrollIndicator={false}
                      stickySectionHeadersEnabled={false}
                      style={
                        historyShouldFillHeight
                          ? styles.historyListExpanded
                          : styles.historyListCompact
                      }
                      contentContainerStyle={{
                        paddingHorizontal: spacing(2),
                        paddingBottom: spacing(1),
                      }}
                      renderSectionHeader={({ section }) => (
                        <Text
                          style={{
                            color: palette.mutedText,
                            marginTop: spacing(0.75),
                            marginBottom: spacing(0.5),
                          }}
                        >
                          {section.title}
                        </Text>
                      )}
                      renderItem={({ item, index, section }) => (
                        <SetRow
                          event={item}
                          compact
                          onPress={() => handleSelectSet(item)}
                          active={editingEventId === item.event_id}
                          previousActive={
                            index > 0 &&
                            editingEventId === section.data[index - 1].event_id
                          }
                          isLast={index === section.data.length - 1}
                          pr={prEventIdsAll.has(item.event_id)}
                        />
                      )}
                    />
                  )}
                </Card>
              </View>

              <View key="Trends" style={styles.sessionPage}>
                <ScrollView
                  style={styles.sessionPage}
                  onTouchStart={clearEditingSelection}
                  onScrollBeginDrag={clearEditingSelection}
                  keyboardShouldPersistTaps="handled"
                  directionalLockEnabled
                  contentContainerStyle={{
                    paddingHorizontal: spacing(2),
                    paddingTop: spacing(1.25),
                    paddingBottom: spacing(2),
                  }}
                >
                  <Card style={styles.sessionContentCard}>
                  <View style={{ gap: spacing(1) }}>
                    {trendMetricOptions.length > 0 ? (
                      <AnalyticsInlineSelect
                        title={asLabelText('Metric')}
                        options={trendMetricOptions}
                        selected={selectedTrendMetric}
                        onSelect={metric =>
                          dispatch({ type: 'log/trendMetric', metric })
                        }
                        onInteractionLockChange={handleInteractionLockChange}
                      />
                    ) : (
                      <BodyText style={{ color: palette.mutedText }}>
                        No metrics available for this range.
                      </BodyText>
                    )}
                    <View style={{ gap: spacing(0.5) }}>
                      <Text
                        style={{
                          color: palette.mutedText,
                          fontWeight: '600',
                          fontSize: 12,
                        }}
                      >
                        RANGE
                      </Text>
                      <AnalyticsRangeSelector
                        selected={selectedTrendRange}
                        onSelect={range =>
                          dispatch({ type: 'log/trendRange', range })
                        }
                        options={analyticsRangeOptions.map(option => option.key)}
                        onInteractionLockChange={handleInteractionLockChange}
                      />
                    </View>
                    {selectedTrendMetric === 'pr_by_rm' &&
                    trendRmOptions.length > 0 ? (
                      <AnalyticsInlineSelect
                        title={asLabelText('RM')}
                        options={trendRmOptions}
                        selected={
                          selectedTrendRmReps === null
                            ? trendRmOptions[0].key
                            : `${selectedTrendRmReps}`
                        }
                        onSelect={value =>
                          dispatch({
                            type: 'log/trendRm',
                            rmReps: Number(value),
                          })
                        }
                        onInteractionLockChange={handleInteractionLockChange}
                      />
                    ) : null}
                    {selectedTrendMetric === 'pr_by_rm' &&
                    trendRmOptions.length === 0 ? (
                      <BodyText style={{ color: palette.mutedText }}>
                        No RM-specific records in this range.
                      </BodyText>
                    ) : null}
                    {displayTrendData.length === 0 ? (
                      <BodyText style={{ color: palette.mutedText }}>
                        No trend data for this selection.
                      </BodyText>
                    ) : (
                      <View style={{ height: 220 }}>
                        <SkiaTrendChart
                          data={displayTrendData}
                          height={220}
                          unit={unitForExerciseMetric(selectedTrendMetric)}
                          showTooltip
                          rangeKey={selectedTrendRange}
                          countLabel="set"
                          onInteractionLockChange={handleInteractionLockChange}
                        />
                      </View>
                    )}
                  </View>
                  </Card>
                  <Pressable
                    onPress={clearEditingSelection}
                    style={{ minHeight: spacing(4) }}
                  />
                </ScrollView>
              </View>
            </PagerView>
        </View>
      )}
    </View>
  );
};

const createStyles = () => ({
  sessionRailWrap: {
    marginHorizontal: spacing(2),
    marginTop: spacing(1),
    marginBottom: 0,
  },
  sessionContentCard: {
    backgroundColor: palette.surface,
    borderWidth: 0,
    borderColor: 'transparent',
    ...cardShadowStyle,
  },
  sessionPage: {
    flex: 1,
  },
  historyCard: {
    alignSelf: 'stretch' as const,
  },
  historyCardFrame: {
    marginTop: spacing(1.25),
    marginHorizontal: spacing(2),
    marginBottom: spacing(1),
    paddingHorizontal: 0,
    paddingVertical: spacing(1),
  },
  historyCardExpanded: {
    flex: 1,
  },
  historyListExpanded: {
    flex: 1,
  },
  historyListCompact: {
    flexGrow: 0,
  },
  trackStickyCta: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(1),
    borderTopWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
    gap: spacing(1),
  },
  dateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(1),
    paddingHorizontal: spacing(1),
    paddingVertical: spacing(1),
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'transparent',
  },
  dateButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'transparent',
  },
  dangerButton: {
    paddingVertical: spacing(1.5),
    borderRadius: radius.card,
    backgroundColor: palette.danger,
    alignItems: 'center' as const,
  },
});

const Stepper = ({
  label,
  unit,
  value,
  onIncrement,
  onDecrement,
  onChange,
}: {
  label: DisplayLabel;
  unit?: DisplayLabel;
  value: NumericInput;
  onIncrement: () => void;
  onDecrement: () => void;
  onChange: (value: NumericInput) => void;
}) => (
  <View
    style={{
      width: '100%',
      borderRadius: radius.card,
      paddingHorizontal: spacing(1),
      paddingVertical: spacing(1.1),
      backgroundColor: 'transparent',
    }}
  >
    <Text style={{ color: palette.mutedText, marginBottom: spacing(0.5) }}>
      {label}
    </Text>
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing(1),
      }}
    >
      <TouchableOpacity
        onPress={onDecrement}
        style={{
          width: 54,
          height: 54,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: palette.text, fontSize: 20 }}>-</Text>
      </TouchableOpacity>
      <InputPill value={value} unit={unit} onChange={onChange} />
      <TouchableOpacity
        onPress={onIncrement}
        style={{
          width: 54,
          height: 54,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: palette.text, fontSize: 20 }}>+</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const InputPill = ({
  value,
  unit,
  onChange,
}: {
  value: NumericInput;
  unit?: DisplayLabel;
  onChange: (value: NumericInput) => void;
}) => {
  const inputRef = useRef<TextInput>(null);
  const focusInput = () => {
    inputRef.current?.focus();
  };
  return (
    <TouchableOpacity
      onPress={focusInput}
      activeOpacity={0.85}
      style={{
        flex: 1,
        height: 54,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: palette.border,
        paddingVertical: 0,
        paddingHorizontal: spacing(1.5),
        backgroundColor: 'transparent',
      }}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={next => onChange(asNumericInput(next))}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={palette.mutedText}
        selectTextOnFocus
        style={{
          color: palette.text,
          fontSize: 20,
          fontWeight: '600',
          textAlign: 'center',
          lineHeight: 22,
          paddingVertical: 0,
          height: 54,
          minWidth: 54,
        }}
      />
      {unit ? (
        <Text style={{ color: palette.mutedText, fontSize: 12 }}>
          {` ${unit}`}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

const readNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readExerciseName = (event: WorkoutEvent): ExerciseName | undefined =>
  typeof event.payload?.exercise === 'string'
    ? asExerciseName(event.payload.exercise)
    : undefined;

type LoggedSetPayload = {
  exercise: ExerciseName;
  reps?: number;
  weight?: number;
  duration?: number;
  distance?: number;
};

type LoggedSetRead = {
  exercise?: ExerciseName;
  reps?: number;
  weight?: number;
  duration?: number;
  distance?: number;
};

const readLoggedSetPayload = (event: WorkoutEvent): LoggedSetRead => ({
  exercise:
    typeof event.payload?.exercise === 'string'
      ? asExerciseName(event.payload.exercise)
      : undefined,
  reps: readNumber(event.payload?.reps),
  weight: readNumber(event.payload?.weight),
  duration: readNumber(event.payload?.duration),
  distance: readNumber(event.payload?.distance),
});

const describeLoggedSet = (event: WorkoutEvent) => {
  const payload = readLoggedSetPayload(event);
  if (payload.weight && payload.reps) {
    return `${payload.weight} kg × ${payload.reps} reps`;
  }
  if (payload.distance && payload.weight) {
    return `${payload.distance} m × ${payload.weight} kg`;
  }
  if (payload.distance && payload.duration) {
    return `${payload.distance} m / ${formatDurationMinutes(payload.duration)}`;
  }
  if (payload.reps) {
    return `${payload.reps} reps`;
  }
  if (payload.distance) {
    return `${payload.distance} m`;
  }
  if (payload.duration) {
    return formatDurationMinutes(payload.duration);
  }
  return 'Logged set';
};

const SetRow = ({
  event,
  highlightColor,
  compact = false,
  active = false,
  previousActive = false,
  isLast = false,
  onPress,
  pr = false,
  onPrPress,
}: {
  event: WorkoutEvent;
  highlightColor?: ColorHex;
  compact?: boolean;
  active?: boolean;
  previousActive?: boolean;
  isLast?: boolean;
  onPress?: () => void;
  pr?: boolean;
  onPrPress?: () => void;
}) => {
  const description = describeLoggedSet(event);
  const activeDividerColor = addAlpha(highlightColor ?? palette.primary, 0.3);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: spacing(1.10),
        paddingBottom: spacing(1.10),
        paddingHorizontal: 0,
        borderTopWidth: compact ? 0 : 1,
        borderBottomWidth: !compact && (isLast || active) ? 1 : 0,
        borderTopColor: compact
          ? 'transparent'
          : active
            ? activeDividerColor
            : previousActive
              ? 'transparent'
              : palette.border,
        borderBottomColor: compact
          ? 'transparent'
          : active
            ? activeDividerColor
            : palette.border,
        backgroundColor: active
          ? addAlpha(highlightColor ?? palette.primary, 0.14)
          : 'transparent',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing(1),
          paddingHorizontal: spacing(0.9),
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: highlightColor ?? palette.primary,
          }}
        />
        <Text style={{ color: palette.text }}>{description}</Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing(0.5),
          paddingHorizontal: spacing(0.9),
        }}
      >
        {pr ? (
          <TouchableOpacity
            onPress={onPrPress}
            disabled={!onPrPress}
            activeOpacity={0.7}
          >
            <Text
              style={{
                color: palette.warning,
                fontSize: 12,
                fontWeight: '700',
              }}
            >
              ★ PR
            </Text>
          </TouchableOpacity>
        ) : null}
        <Text style={{ color: palette.mutedText, fontSize: 12 }}>
          {new Date(event.ts).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const formatDateLabel = (date: Date): DisplayLabel => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diff === 0) return asDisplayLabel('Today');
  if (diff === -1) return asDisplayLabel('Yesterday');
  if (diff === 1) return asDisplayLabel('Tomorrow');
  return asDisplayLabel(target.toLocaleDateString());
};

const formatNumberInput = (value: unknown): NumericInput => {
  if (value === null || value === undefined) return asNumericInput('');
  if (typeof value === 'number') return asNumericInput(value.toString());
  return asNumericInput(String(value));
};

const fieldsFromEvent = (event: WorkoutEvent): LoggingFields => ({
  reps: formatNumberInput(event.payload?.reps),
  weight: formatNumberInput(event.payload?.weight),
  duration:
    typeof event.payload?.duration === 'number'
      ? asNumericInput(
          formatTrimmedNumber(secondsToMinutes(event.payload.duration), 2),
        )
      : asNumericInput(''),
  distance: formatNumberInput(event.payload?.distance),
});

const buildPayloadFromFields = (
  fieldsState: typeof INITIAL_FIELDS,
  exerciseName: ExerciseName,
) => {
  const reps = parseNumericField(fieldsState.reps);
  const weight = parseNumericField(fieldsState.weight);
  const duration = parseNumericField(fieldsState.duration);
  const distance = parseNumericField(fieldsState.distance);
  const payload: LoggedSetPayload = { exercise: exerciseName };
  if (typeof reps === 'number') payload.reps = reps;
  if (typeof weight === 'number') payload.weight = weight;
  if (typeof duration === 'number')
    payload.duration = minutesToSeconds(duration);
  if (typeof distance === 'number') payload.distance = distance;
  return payload;
};

const parseNumericField = (value: NumericInput): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export default LoggingScreen;
