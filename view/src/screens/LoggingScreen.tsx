import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  TouchableOpacity,
} from 'react-native';
import { WorkoutEvent } from '../workoutFlows';
import { Card, Divider, PrimaryButton, BodyText } from '../ui/components';
import { getContrastTextColor, palette, radius, spacing } from '../ui/theme';
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

const sessionTabs = ['Track', 'History', 'Trends'] as const;
const INPUT_ACCESSORY_ID = 'logging-numeric-accessory';
export type SessionTab = (typeof sessionTabs)[number];

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

const scheduleIdle = (work: () => void) => {
  const idleCallback = (
    globalThis as typeof globalThis & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    }
  ).requestIdleCallback;
  if (idleCallback) {
    const id = idleCallback(work);
    return () => {
      const cancel = (
        globalThis as typeof globalThis & {
          cancelIdleCallback?: (id: number) => void;
        }
      ).cancelIdleCallback;
      cancel?.(id);
    };
  }
  const timeout = setTimeout(work, 0);
  return () => clearTimeout(timeout);
};

const LoggingScreen = () => {
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
  const selectedTrendRange = state.logging.selectedTrendRange;
  const selectedTrendMetric = state.logging.selectedTrendMetric;
  const selectedTrendRmReps = state.logging.selectedTrendRmReps;
  const loggingDate = state.logging.logDate;
  const editingEventId = state.logging.editingEventId;
  const [historySets, setHistorySets] = useState<WorkoutEvent[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [interactionLocked, setInteractionLocked] = useState(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeKey = `${state.preferences.themeMode}:${
    state.preferences.themeAccent
  }:${state.preferences.customAccentHex ?? ''}`;
  const styles = useMemo(() => createStyles(), [themeKey]);

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

  const needsTodaySets = sessionTab === 'Track';
  const needsHistorySets = sessionTab === 'History' || sessionTab === 'Trends';

  const todaySets = useMemo(() => {
    if (!selectedExercise || !needsTodaySets) return [];
    const start = new Date(loggingDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return state.events.filter(event => {
      const exerciseName = readExerciseName(event);
      return (
        exerciseName === selectedExercise.display_name &&
        event.ts >= start.getTime() &&
        event.ts < end.getTime()
      );
    });
  }, [state.events, selectedExercise, loggingDate, needsTodaySets]);

  useEffect(() => {
    if (!selectedExercise || !needsHistorySets) {
      setHistorySets([]);
      setHistoryReady(false);
      return;
    }
    setHistoryReady(false);
    const cancel = scheduleIdle(() => {
      const filtered = state.events.filter(
        event => readExerciseName(event) === selectedExercise.display_name,
      );
      setHistorySets(filtered);
      setHistoryReady(true);
    });
    return () => cancel();
  }, [needsHistorySets, selectedExercise, state.events]);

  const groupedHistory = useMemo(() => {
    if (sessionTab !== 'History') return [];
    const groups = new Map<number, WorkoutEvent[]>();
    historySets.forEach(event => {
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
  }, [historySets, sessionTab]);

  const prEventIds = useMemo(() => {
    const source = needsHistorySets ? historySets : todaySets;
    const ids = source
      .filter(event => event.payload?.pr === true)
      .map(event => event.event_id);
    return new Set(ids);
  }, [historySets, needsHistorySets, todaySets]);

  const { chartData: trendData, exerciseEventsInRange: trendEventsInRange } =
    useExerciseTrendSeries({
      events: historyReady ? historySets : [],
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
    console.log('LoggingScreen: submitting payload', payload);
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

  const setFieldValue = (key: FieldKey, delta: number) => {
    const nextFields = { ...fields };
    const current = parseFloat(nextFields[key]) || 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    nextFields[key] = asNumericInput(next === 0 ? '' : next.toString());
    dispatch({ type: 'log/fields', fields: nextFields });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={!interactionLocked}
        contentContainerStyle={{
          padding: spacing(2),
          gap: spacing(2),
          paddingBottom: spacing(2),
        }}
      >
        {selectedExercise ? null : (
          <Card>
            <Text style={{ color: palette.mutedText }}>
              Select an exercise to log sets.
            </Text>
          </Card>
        )}

        {selectedExercise && (
          <Card variant="analytics" style={{ gap: spacing(0.75) }}>
            <View
              style={{
                flexDirection: 'row',
                gap: spacing(1),
                marginBottom: spacing(1.25),
              }}
            >
              {sessionTabs.map(tab => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => dispatch({ type: 'log/tab', tab })}
                  style={{
                    flex: 1,
                    paddingVertical: spacing(1),
                    borderRadius: radius.card,
                    backgroundColor:
                      sessionTab === tab
                        ? palette.primary
                        : palette.mutedSurface,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color:
                        sessionTab === tab
                          ? getContrastTextColor(palette.primary)
                          : palette.text,
                      fontWeight: '600',
                    }}
                  >
                    {tab}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {sessionTab === 'Track' && (
              <>
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
                      step={definition.step}
                      onIncrement={() =>
                        setFieldValue(definition.key, definition.step)
                      }
                      onDecrement={() =>
                        setFieldValue(definition.key, -definition.step)
                      }
                      onChange={value =>
                        dispatch({
                          type: 'log/fields',
                          fields: {
                            ...fields,
                            [definition.key]: asNumericInput(value),
                          },
                        })
                      }
                    />
                  ))}
                </View>
                <Divider />
                {todaySets.length === 0 ? (
                  <BodyText style={{ color: palette.mutedText }}>
                    No sets logged today.
                  </BodyText>
                ) : (
                  todaySets.map(set => (
                    <SetRow
                      key={set.event_id}
                      event={set}
                      highlightColor={getMuscleColor(
                        selectedExercise?.primary_muscle_group,
                      )}
                      onPress={() => handleSelectSet(set)}
                      active={editingEventId === set.event_id}
                      pr={prEventIds.has(set.event_id)}
                    />
                  ))
                )}
              </>
            )}

            {sessionTab === 'History' && (
              <>
                {!historyReady ? (
                  <BodyText style={{ color: palette.mutedText }}>
                    Loading history...
                  </BodyText>
                ) : null}
                {groupedHistory.length === 0 ? (
                  <BodyText style={{ color: palette.mutedText }}>
                    Log sets to unlock history.
                  </BodyText>
                ) : (
                  groupedHistory.map(bucket => (
                    <View
                      key={bucket.day}
                      style={{ marginBottom: spacing(1.5) }}
                    >
                      <Text
                        style={{
                          color: palette.mutedText,
                          marginBottom: spacing(0.5),
                        }}
                      >
                        {bucket.label}
                      </Text>
                      {bucket.events.map(event => (
                        <SetRow
                          key={event.event_id}
                          event={event}
                          compact
                          onPress={() => handleSelectSet(event)}
                          active={editingEventId === event.event_id}
                          pr={prEventIds.has(event.event_id)}
                        />
                      ))}
                    </View>
                  ))
                )}
              </>
            )}

            {sessionTab === 'Trends' && (
              <>
                {!historyReady ? (
                  <BodyText style={{ color: palette.mutedText }}>
                    Loading trends...
                  </BodyText>
                ) : null}
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
              </>
            )}
          </Card>
        )}
      </ScrollView>

      {selectedExercise && (
        <View style={styles.bottomCta}>
          {editingEventId ? (
            <>
              <PrimaryButton
                label={asLabelText('Update set')}
                onPress={handleUpdateSet}
                disabled={trackDisabled}
              />
              <TouchableOpacity
                onPress={handleDeleteSet}
                style={styles.dangerButton}
              >
                <Text style={{ color: '#fffaf2', fontWeight: '600' }}>
                  Delete set
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <PrimaryButton
              label={asLabelText('Log set')}
              onPress={handleAddSet}
              disabled={trackDisabled}
            />
          )}
        </View>
      )}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID}>
          <View
            style={{
              paddingHorizontal: spacing(2),
              paddingVertical: spacing(1),
              borderTopWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.background,
              alignItems: 'flex-end',
            }}
          >
            <TouchableOpacity onPress={() => Keyboard.dismiss()}>
              <Text style={{ color: palette.primary, fontWeight: '700' }}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
};

const createStyles = () => ({
  bottomCta: {
    padding: spacing(2),
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
    backgroundColor: palette.mutedSurface,
  },
  dateButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: addAlpha(palette.background, 0.32),
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
  step,
  onIncrement,
  onDecrement,
  onChange,
}: {
  label: DisplayLabel;
  unit?: DisplayLabel;
  value: NumericInput;
  step: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onChange: (value: NumericInput) => void;
}) => (
  <View
    style={{
      width: '100%',
      backgroundColor: palette.mutedSurface,
      borderRadius: radius.card,
      paddingHorizontal: spacing(1),
      paddingVertical: spacing(0.9),
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
          backgroundColor: addAlpha(palette.background, 0.35),
          width: 48,
          height: 48,
          borderRadius: radius.card,
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
          backgroundColor: addAlpha(palette.background, 0.35),
          width: 48,
          height: 48,
          borderRadius: radius.card,
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
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        paddingVertical: 0,
        paddingHorizontal: spacing(1.5),
        backgroundColor: addAlpha(palette.background, 0.45),
      }}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={next => onChange(asNumericInput(next))}
        keyboardType="numeric"
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={() => Keyboard.dismiss()}
        placeholder="0"
        placeholderTextColor={palette.mutedText}
        selectTextOnFocus
        inputAccessoryViewID={INPUT_ACCESSORY_ID}
        style={{
          color: palette.text,
          fontSize: 18,
          fontWeight: '600',
          textAlign: 'center',
          lineHeight: 22,
          paddingVertical: 0,
          height: 48,
          minWidth: 48,
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
  onPress,
  pr = false,
  onPrPress,
}: {
  event: WorkoutEvent;
  highlightColor?: ColorHex;
  compact?: boolean;
  active?: boolean;
  onPress?: () => void;
  pr?: boolean;
  onPrPress?: () => void;
}) => {
  const description = describeLoggedSet(event);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing(0.75),
        borderBottomWidth: compact ? 0 : 1,
        borderColor: palette.border,
        backgroundColor: active
          ? addAlpha(highlightColor ?? palette.primary, 0.15)
          : 'transparent',
        paddingHorizontal: onPress ? spacing(0.5) : 0,
        borderRadius: active ? radius.card : 0,
      }}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}
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
