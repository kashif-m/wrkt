import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { DonutChart } from '../components/analytics/DonutChart';
import { roundToLocalDay } from '../timePolicy';
import { palette, radius, spacing } from '../ui/theme';
import { Card } from '../ui/components';
import { getMuscleColor } from '../ui/muscleColors';
import {
  formatDurationMinutes,
  formatMuscleLabel,
  formatPercent,
} from '../ui/formatters';
import ChevronLeftIcon from '../assets/chevron-left.svg';
import ChevronRightIcon from '../assets/chevron-right.svg';
import {
  useAppActions,
  useAppDispatch,
  useAppState,
} from '../state/appContext';
import { WorkoutEvent } from '../workoutFlows';
import {
  ColorHex,
  DisplayLabel,
  ExerciseName,
  MuscleGroup,
  asDisplayLabel,
  asExerciseName,
  asLabelText,
  asMuscleGroup,
  asScreenKey,
} from '../domain/types';
import HorizontalSwipePager, {
  SwipeDirection,
} from '../ui/HorizontalSwipePager';

type HomeDayModel = {
  date: Date;
  dayBucket: number;
  primaryLabel: string;
  secondaryLabel: string;
  sections: Array<{
    key: MuscleGroup;
    label: DisplayLabel;
    firstTs: number;
    exerciseOrder: ExerciseName[];
    exerciseSets: Map<ExerciseName, WorkoutEvent[]>;
    exercises: {
      name: ExerciseName;
      sets: { description: DisplayLabel; count: number }[];
      color: ColorHex;
      totalSets: number;
    }[];
  }>;
  emptyState: boolean;
  muscleChips: Array<{
    key: DisplayLabel;
    label: DisplayLabel;
    color?: ColorHex;
    percent: number;
  }>;
  musclePieData: Array<{
    key: DisplayLabel;
    label: DisplayLabel;
    color?: ColorHex;
    percent: number;
  }>;
  volumeChips: Array<{
    key: DisplayLabel;
    label: DisplayLabel;
    color?: ColorHex;
    percent: number;
  }>;
  volumePieData: Array<{
    key: DisplayLabel;
    label: DisplayLabel;
    color?: ColorHex;
    percent: number;
  }>;
  totalSets: number;
  totalExercises: number;
  averageSets: number;
};

const HomeScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const [expandedExercises, setExpandedExercises] = useState<
    Record<string, boolean>
  >({});
  const homeSplitMode = state.preferences.homeSplitMode;
  const themeKey = `${state.preferences.themeMode}:${
    state.preferences.themeAccent
  }:${state.preferences.customAccentHex ?? ''}`;
  const styles = useMemo(() => createStyles(), [themeKey]);
  const { events } = state;
  const selectedDate = state.selectedDate;
  const catalog = state.catalog.entries;
  const pageDatesRef = useRef<[Date, Date, Date]>([
    new Date(selectedDate.getTime() - 24 * 60 * 60 * 1000),
    selectedDate,
    new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000),
  ]);
  const [pageDates, setPageDates] = useState<[Date, Date, Date]>(
    pageDatesRef.current,
  );
  const [resetKey, setResetKey] = useState(0);
  const [overrideCenterDate, setOverrideCenterDate] = useState<Date | null>(
    null,
  );
  const pendingCommitRef = useRef<SwipeDirection | null>(null);

  const catalogMap = useMemo(() => {
    const map = new Map<ExerciseName, (typeof catalog)[number]>();
    catalog.forEach(entry => map.set(entry.display_name, entry));
    return map;
  }, [catalog]);

  useEffect(() => {
    setExpandedExercises({});
  }, [selectedDate]);

  useEffect(() => {
    pageDatesRef.current = pageDates;
  }, [pageDates]);

  const buildDayModel = useCallback(
    (date: Date): HomeDayModel => {
      const dayBucket = roundToLocalDay(date.getTime());
      const todayBucket = roundToLocalDay(Date.now());
      const isToday = dayBucket === todayBucket;
      const primaryLabel = isToday
        ? 'Today'
        : date.toLocaleDateString(undefined, { weekday: 'long' });
      const secondaryLabel = date.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      const dayEvents = events
        .filter(event => roundToLocalDay(event.ts) === dayBucket)
        .sort((a, b) => a.ts - b.ts);
      const groupMap = new Map<
        MuscleGroup,
        {
          label: DisplayLabel;
          firstTs: number;
          exerciseOrder: ExerciseName[];
          exerciseSets: Map<ExerciseName, WorkoutEvent[]>;
          exercises: {
            name: ExerciseName;
            sets: { description: DisplayLabel; count: number }[];
            color: ColorHex;
            totalSets: number;
          }[];
        }
      >();
      const volumeByGroup = new Map<MuscleGroup, number>();
      dayEvents.forEach(event => {
        const exercise = asExerciseName(
          typeof event.payload?.exercise === 'string'
            ? event.payload.exercise
            : 'Exercise',
        );
        const meta = catalogMap.get(exercise);
        const groupKey =
          meta?.primary_muscle_group ?? asMuscleGroup('untracked');
        const label = asDisplayLabel(
          groupKey.replace(/_/g, ' ').toUpperCase() || 'UNTRACKED',
        );
        const bucket = groupMap.get(groupKey) ?? {
          label,
          firstTs: event.ts,
          exerciseOrder: [] as ExerciseName[],
          exerciseSets: new Map<ExerciseName, WorkoutEvent[]>(),
          exercises: [],
        };
        if (!bucket.exerciseSets.has(exercise)) {
          bucket.exerciseSets.set(exercise, []);
          bucket.exerciseOrder.push(exercise);
        }
        bucket.exerciseSets.get(exercise)?.push(event);
        groupMap.set(groupKey, bucket);
        const reps =
          typeof event.payload?.reps === 'number' && event.payload.reps > 0
            ? event.payload.reps
            : 0;
        const weight =
          typeof event.payload?.weight === 'number' && event.payload.weight > 0
            ? event.payload.weight
            : 0;
        if (reps > 0 && weight > 0) {
          volumeByGroup.set(
            groupKey,
            (volumeByGroup.get(groupKey) ?? 0) + reps * weight,
          );
        }
      });
      const sections = Array.from(groupMap.entries())
        .map(([key, section]) => {
          const exercises = section.exerciseOrder.map(name => {
            const sets = section.exerciseSets.get(name) ?? [];
            const setChunks = summarizeSets(sets);
            const meta = catalogMap.get(name);
            return {
              name,
              sets: setChunks,
              color: getMuscleColor(meta?.primary_muscle_group),
              totalSets: setChunks.reduce(
                (total, chunk) => total + chunk.count,
                0,
              ),
            };
          });
          return { key, ...section, exercises };
        })
        .sort((a, b) => a.firstTs - b.firstTs);

      const emptyState = sections.length === 0;
      const muscleChips = (() => {
        const total = sections.reduce(
          (sum, section) => sum + section.exercises.length,
          0,
        );
        if (!total) return [];
        return sections
          .map(section => ({
            key: formatMuscleLabel(section.key),
            label: formatMuscleLabel(section.key),
            color: section.exercises[0]?.color,
            percent: (section.exercises.length / total) * 100,
          }))
          .sort((a, b) => b.percent - a.percent);
      })();
      const musclePieData =
        muscleChips.length <= 4
          ? muscleChips
          : [
              ...muscleChips.slice(0, 3),
              {
                key: asDisplayLabel('Other'),
                label: asDisplayLabel('Other'),
                color: palette.mutedSurface,
                percent: muscleChips
                  .slice(3)
                  .reduce((sum, item) => sum + item.percent, 0),
              },
            ];
      const totalVolume = Array.from(volumeByGroup.values()).reduce(
        (sum, value) => sum + value,
        0,
      );
      const volumeChips =
        totalVolume <= 0
          ? []
          : Array.from(volumeByGroup.entries())
              .map(([group, volume]) => ({
                key: formatMuscleLabel(group),
                label: formatMuscleLabel(group),
                color: getMuscleColor(group),
                percent: (volume / totalVolume) * 100,
              }))
              .sort((a, b) => b.percent - a.percent);
      const volumePieData =
        volumeChips.length <= 4
          ? volumeChips
          : [
              ...volumeChips.slice(0, 3),
              {
                key: asDisplayLabel('Other'),
                label: asDisplayLabel('Other'),
                color: palette.mutedSurface,
                percent: volumeChips
                  .slice(3)
                  .reduce((sum, item) => sum + item.percent, 0),
              },
            ];
      const totalSets = dayEvents.length;
      const totalExercises = sections.reduce(
        (sum, section) => sum + section.exercises.length,
        0,
      );
      const averageSets = totalExercises
        ? Math.round(totalSets / totalExercises)
        : 0;

      return {
        date,
        dayBucket,
        primaryLabel,
        secondaryLabel,
        sections,
        emptyState,
        muscleChips,
        musclePieData,
        volumeChips,
        volumePieData,
        totalSets,
        totalExercises,
        averageSets,
      };
    },
    [catalogMap, events],
  );

  const shiftDate = useCallback((date: Date, delta: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + delta);
    return next;
  }, []);

  const buildPageDates = useCallback(
    (center: Date): [Date, Date, Date] => [
      shiftDate(center, -1),
      center,
      shiftDate(center, 1),
    ],
    [shiftDate],
  );

  useEffect(() => {
    const selectedBucket = roundToLocalDay(selectedDate.getTime());
    if (overrideCenterDate) {
      const centerBucket = roundToLocalDay(pageDatesRef.current[1].getTime());
      if (!pendingCommitRef.current || selectedBucket !== centerBucket) {
        pendingCommitRef.current = null;
        setOverrideCenterDate(null);
        const nextDates = buildPageDates(selectedDate);
        pageDatesRef.current = nextDates;
        setPageDates(nextDates);
        setResetKey(value => value + 1);
      }
      return;
    }
    const centerBucket = roundToLocalDay(pageDatesRef.current[1].getTime());
    if (selectedBucket !== centerBucket) {
      const nextDates = buildPageDates(selectedDate);
      pageDatesRef.current = nextDates;
      setPageDates(nextDates);
    }
  }, [buildPageDates, overrideCenterDate, selectedDate]);

  const prevDate = pageDates[0];
  const nextDate = pageDates[2];
  const currentDate = overrideCenterDate ?? pageDates[1];
  const currentModel = useMemo(
    () => buildDayModel(currentDate),
    [buildDayModel, currentDate],
  );
  const prevModel = useMemo(
    () => buildDayModel(prevDate),
    [buildDayModel, prevDate],
  );
  const nextModel = useMemo(
    () => buildDayModel(nextDate),
    [buildDayModel, nextDate],
  );

  const rotateDates = useCallback(
    (
      dates: [Date, Date, Date],
      direction: SwipeDirection,
    ): [Date, Date, Date] => {
      if (direction === 1) {
        const nextCenter = dates[2];
        return [dates[1], nextCenter, shiftDate(nextCenter, 1)];
      }
      const prevCenter = dates[0];
      return [shiftDate(prevCenter, -1), prevCenter, dates[1]];
    },
    [shiftDate],
  );

  const handleCommit = useCallback((direction: SwipeDirection) => {
    if (pendingCommitRef.current) return;
    const targetDate =
      direction === 1 ? pageDatesRef.current[2] : pageDatesRef.current[0];
    pendingCommitRef.current = direction;
    setOverrideCenterDate(targetDate);
    setResetKey(value => value + 1);
  }, []);

  const handleReset = useCallback(() => {
    const direction = pendingCommitRef.current;
    if (!direction) {
      setOverrideCenterDate(null);
      return;
    }
    const nextDates = rotateDates(pageDatesRef.current, direction);
    pageDatesRef.current = nextDates;
    setPageDates(nextDates);
    actions.setSelectedDate(nextDates[1]);
    pendingCommitRef.current = null;
    setOverrideCenterDate(null);
  }, [actions, rotateDates]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.daySelector}>
        <TouchableOpacity
          onPress={() => actions.shiftDate(-1)}
          style={styles.arrowButton}
        >
          <ChevronLeftIcon width={20} height={20} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => actions.navigate(asScreenKey('calendar'))}
          style={{ alignItems: 'center' }}
        >
          <Text
            style={{ color: palette.text, fontSize: 24, fontWeight: '600' }}
          >
            {currentModel.primaryLabel}
          </Text>
          <Text style={{ color: palette.mutedText, fontSize: 14 }}>
            {currentModel.secondaryLabel}
          </Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: spacing(0.75) }}>
          <TouchableOpacity
            onPress={() => actions.shiftDate(1)}
            style={styles.arrowButton}
          >
            <ChevronRightIcon width={20} height={20} color={palette.text} />
          </TouchableOpacity>
        </View>
      </View>

      <HorizontalSwipePager
        currentKey={pageDates[1].getTime()}
        onCommit={handleCommit}
        onReset={handleReset}
        resetKey={resetKey}
        edgeThreshold={24}
        commitThreshold={0.25}
        renderPage={offset => {
          const model =
            offset === -1 ? prevModel : offset === 1 ? nextModel : currentModel;
          const date =
            offset === -1 ? prevDate : offset === 1 ? nextDate : currentDate;
          return (
            <HomeDayContent
              key={date.getTime()}
              model={model}
              date={date}
              expandedExercises={expandedExercises}
              setExpandedExercises={setExpandedExercises}
              onOpenLog={actions.openLogForExercise}
              splitMode={homeSplitMode}
              onSplitModeChange={mode =>
                dispatch({ type: 'preferences/homeSplitMode', mode })
              }
              styles={styles}
            />
          );
        }}
      />
    </View>
  );
};

const HomeDayContent = ({
  model,
  date,
  expandedExercises,
  setExpandedExercises,
  onOpenLog,
  splitMode,
  onSplitModeChange,
  styles,
}: {
  model: HomeDayModel;
  date: Date;
  expandedExercises: Record<string, boolean>;
  setExpandedExercises: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  onOpenLog: (
    exerciseName: ExerciseName | undefined,
    date: Date,
    tab: 'Track' | 'History' | 'Trends',
  ) => void;
  splitMode: 'muscle' | 'volume';
  onSplitModeChange: (mode: 'muscle' | 'volume') => void;
  styles: ReturnType<typeof createStyles>;
}) => {
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const splitLabel = splitMode === 'muscle' ? 'Muscle Split' : 'Volume Split';
  const splitLegend =
    splitMode === 'muscle' ? model.musclePieData : model.volumePieData;
  const hasSplitData = splitLegend.length > 0;
  const showSplitEmpty = !hasSplitData && !model.emptyState;

  useEffect(() => {
    setSplitMenuOpen(false);
  }, [date, splitMode]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing(2),
          paddingBottom: spacing(6),
          gap: spacing(2),
        }}
      >
        {!model.emptyState ? (
          <Card style={styles.heroCard}>
            <View style={{ flexDirection: 'row', gap: spacing(2) }}>
              {hasSplitData ? (
                <View style={styles.donutWrap}>
                  <DonutChart data={splitLegend} radius={44} />
                </View>
              ) : null}
              <View style={{ flex: 1, gap: spacing(1) }}>
                <View style={styles.splitHeader}>
                  <TouchableOpacity
                    onPress={() => setSplitMenuOpen(current => !current)}
                    style={styles.splitLabelRow}
                    accessibilityRole="button"
                    accessibilityLabel="Change split mode"
                  >
                    <Text style={styles.splitHeaderLabel}>{splitLabel}</Text>
                    <View style={styles.splitDropdownTrigger}>
                      <ChevronRightIcon
                        width={14}
                        height={14}
                        color={palette.mutedText}
                        style={{
                          transform: [
                            { rotate: splitMenuOpen ? '270deg' : '90deg' },
                          ],
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                </View>
                {splitMenuOpen ? (
                  <View style={styles.splitInlineDropdown}>
                    <TouchableOpacity
                      onPress={() => {
                        onSplitModeChange('muscle');
                        setSplitMenuOpen(false);
                      }}
                      style={styles.splitInlineOption}
                    >
                      <Text
                        style={[
                          styles.splitInlineOptionText,
                          splitMode === 'muscle' &&
                            styles.splitInlineOptionTextActive,
                        ]}
                      >
                        Muscle Split
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        onSplitModeChange('volume');
                        setSplitMenuOpen(false);
                      }}
                      style={styles.splitInlineOption}
                    >
                      <Text
                        style={[
                          styles.splitInlineOptionText,
                          splitMode === 'volume' &&
                            styles.splitInlineOptionTextActive,
                        ]}
                      >
                        Volume Split
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {hasSplitData ? (
                  <View style={{ gap: spacing(0.5) }}>
                    {splitLegend.map(chip => (
                      <View key={chip.key} style={styles.legendRow}>
                        <View style={styles.legendLabel}>
                          <View
                            style={[
                              styles.legendDot,
                              {
                                backgroundColor: chip.color ?? palette.primary,
                              },
                            ]}
                          />
                          <Text style={styles.legendText}>{chip.label}</Text>
                        </View>
                        <Text style={styles.legendValue}>
                          {formatPercent(chip.percent)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : showSplitEmpty ? (
                  <Text style={styles.splitEmptyHint}>
                    No {splitMode === 'volume' ? 'volume' : 'muscle'} data for
                    this day
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statTitle}>Sets logged</Text>
                <View>
                  <Text style={styles.statValue}>{model.totalSets} sets</Text>
                  <Text style={styles.statMuted}>{model.averageSets} avg</Text>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        {model.emptyState ? (
          <Card style={styles.emptySetsCard}>
            <Text style={styles.emptySetsText}>No sets logged</Text>
          </Card>
        ) : null}

        {model.emptyState ? null : (
          <Card style={styles.listContainer}>
            {model.sections.map((section, sectionIndex) => (
              <View key={section.key} style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>{section.label}</Text>
                {section.exercises.map((exercise, index) => (
                  <TouchableOpacity
                    key={`${section.key}-${exercise.name}-${index}`}
                    onPress={() => onOpenLog(exercise.name, date, 'Track')}
                    activeOpacity={0.78}
                    style={[
                      styles.listRow,
                      index !== section.exercises.length - 1 &&
                        styles.listRowDivider,
                    ]}
                  >
                    {(() => {
                      const exerciseKey = `${section.key}-${exercise.name}`;
                      const isExpanded = Boolean(
                        expandedExercises[exerciseKey],
                      );
                      const hasOverflow =
                        exercise.sets.length > MAX_SET_PREVIEW;
                      const visibleSets = isExpanded
                        ? exercise.sets
                        : exercise.sets.slice(0, MAX_SET_PREVIEW);
                      return (
                        <View style={{ flex: 1, gap: spacing(0.5) }}>
                          <Text style={styles.exerciseTitle}>
                            {exercise.name}
                          </Text>
                          <View style={{ gap: spacing(0.25) }}>
                            {visibleSets.map((setItem, chunkIndex) => (
                              <Text
                                key={`${exercise.name}-${chunkIndex}`}
                                style={styles.exerciseMeta}
                              >
                                {formatSetLabel(setItem)}
                              </Text>
                            ))}
                            {hasOverflow && !isExpanded ? (
                              <View style={styles.moreSetsRow}>
                                <Text style={styles.exerciseMeta}>
                                  {(() => {
                                    const hiddenCount = countHiddenSets(
                                      exercise.sets,
                                      MAX_SET_PREVIEW,
                                    );
                                    return `+ ${hiddenCount} more ${
                                      hiddenCount === 1 ? 'set' : 'sets'
                                    }`;
                                  })()}
                                </Text>
                                <TouchableOpacity
                                  onPress={event => {
                                    event.stopPropagation?.();
                                    setExpandedExercises(previous => ({
                                      ...previous,
                                      [exerciseKey]: true,
                                    }));
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.showMoreLink,
                                      { color: palette.primary },
                                    ]}
                                  >
                                    Show all
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                            {hasOverflow && isExpanded ? (
                              <TouchableOpacity
                                onPress={event => {
                                  event.stopPropagation?.();
                                  setExpandedExercises(previous => ({
                                    ...previous,
                                    [exerciseKey]: false,
                                  }));
                                }}
                              >
                                <Text
                                  style={[
                                    styles.showMoreLink,
                                    { color: palette.primary },
                                  ]}
                                >
                                  Show fewer
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      );
                    })()}
                    <View style={styles.setCountPill}>
                      <Text style={styles.setCountText}>{`${
                        exercise.totalSets
                      } ${exercise.totalSets === 1 ? 'set' : 'sets'}`}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {sectionIndex !== model.sections.length - 1 ? (
                  <View style={styles.sectionDivider} />
                ) : null}
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
};

type SetChunk = { description: DisplayLabel; count: number };
const MAX_SET_PREVIEW = 4;

const summarizeSets = (sets: WorkoutEvent[]): SetChunk[] => {
  const condensation: Array<{ description: DisplayLabel; count: number }> = [];
  sets.forEach(event => {
    const description = describeSet(event);
    const last = condensation[condensation.length - 1];
    if (last && last.description === description) {
      last.count += 1;
    } else {
      condensation.push({ description, count: 1 });
    }
  });
  return condensation;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const describeSet = (event: WorkoutEvent): DisplayLabel => {
  const reps = toNumber(event.payload?.reps);
  const weight = toNumber(event.payload?.weight);
  const distance = toNumber(event.payload?.distance);
  const duration = toNumber(event.payload?.duration);
  if (weight > 0 && reps > 0) {
    return asDisplayLabel(`${weight} kg × ${reps} reps`);
  }
  if (reps > 0) {
    return asDisplayLabel(`${reps} reps`);
  }
  if (distance > 0 && duration > 0) {
    return asDisplayLabel(`${distance} m / ${formatDurationMinutes(duration)}`);
  }
  if (distance > 0) {
    return asDisplayLabel(`${distance} m`);
  }
  if (duration > 0) {
    return asDisplayLabel(formatDurationMinutes(duration));
  }
  return asDisplayLabel('Logged set');
};

const formatSetLabel = (chunk: SetChunk): DisplayLabel => {
  if (chunk.count === 1) {
    return chunk.description;
  }
  return asDisplayLabel(`${chunk.count} sets · ${chunk.description}`);
};

const createStyles = () => ({
  daySelector: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.25),
    borderBottomWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
  },
  arrowButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: palette.surface,
  },
  heroCard: {
    paddingVertical: spacing(2),
    gap: spacing(1.5),
  },
  splitHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: spacing(1),
  },
  splitLabelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(0.25),
    paddingVertical: spacing(0.25),
    paddingRight: spacing(0.25),
  },
  splitHeaderLabel: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    flexShrink: 1 as const,
  },
  splitDropdownTrigger: {
    width: 18,
    height: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  splitInlineDropdown: {
    backgroundColor: palette.mutedSurface,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
  },
  splitInlineOption: {
    minHeight: 32,
    paddingHorizontal: spacing(1.5),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  splitInlineOptionText: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  splitInlineOptionTextActive: {
    color: palette.primary,
  },
  splitEmptyHint: {
    color: palette.mutedText,
    fontSize: 12,
  },
  donutWrap: {
    width: 96,
    height: 96,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.mutedSurface,
  },
  legendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  legendLabel: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(0.5),
  },
  legendText: {
    color: palette.text,
    fontWeight: '600' as const,
    fontSize: 12,
  },
  legendValue: {
    color: palette.mutedText,
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row' as const,
    gap: spacing(1.5),
  },
  emptySetsCard: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: spacing(4),
  },
  emptySetsText: {
    color: palette.mutedText,
    fontSize: 20,
    fontWeight: '600' as const,
  },
  statCard: {
    flex: 1,
    paddingVertical: spacing(1.5),
    gap: spacing(1),
  },
  statTitle: {
    color: palette.text,
    fontWeight: '600' as const,
    fontSize: 14,
  },
  statValue: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  statMuted: {
    color: palette.mutedText,
    fontSize: 12,
  },
  listContainer: {
    padding: spacing(2),
    gap: spacing(1.5),
  },
  sectionBlock: {
    gap: spacing(0.75),
  },
  sectionLabel: {
    color: palette.mutedText,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  listRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    paddingVertical: spacing(1),
  },
  listRowDivider: {
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: palette.border,
    marginTop: spacing(1),
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  exerciseTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  exerciseMeta: {
    color: palette.mutedText,
    fontSize: 12,
  },
  setCountPill: {
    paddingHorizontal: spacing(1.25),
    paddingVertical: spacing(0.5),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.mutedSurface,
    alignSelf: 'flex-start' as const,
  },
  setCountText: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  moreSetsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(0.5),
  },
  showMoreLink: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
});

const countHiddenSets = (chunks: SetChunk[], maxShown: number) =>
  chunks.slice(maxShown).reduce((total, chunk) => total + chunk.count, 0);

export default HomeScreen;
