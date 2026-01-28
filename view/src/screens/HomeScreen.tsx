import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { roundToLocalDay } from '../timePolicy';
import { palette, radius, spacing, fontSizes } from '../ui/theme';
import { Card } from '../ui/components';
import { getMuscleColor } from '../ui/muscleColors';
import ChevronLeftIcon from '../assets/chevron-left.svg';
import ChevronRightIcon from '../assets/chevron-right.svg';
import PlusIcon from '../assets/plus.svg';
import { useAppActions, useAppState } from '../state/appContext';
import { WorkoutEvent } from '../workoutFlows';
import {
  ColorHex,
  DisplayLabel,
  ExerciseName,
  LabelText,
  MuscleGroup,
  asDisplayLabel,
  asExerciseName,
  asLabelText,
  asMuscleGroup,
  asScreenKey,
  unwrapLabelText,
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
  totalSets: number;
  totalExercises: number;
  averageSets: number;
};

const HomeScreen = () => {
  const state = useAppState();
  const actions = useAppActions();
  const [expandedExercises, setExpandedExercises] = useState<
    Record<string, boolean>
  >({});
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
            percent: Math.round((section.exercises.length / total) * 100),
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
      <View style={daySelector}>
        <TouchableOpacity
          onPress={() => actions.shiftDate(-1)}
          style={arrowButton}
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
            style={arrowButton}
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
              onStartWorkout={actions.startWorkoutForDate}
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
  onStartWorkout,
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
  onStartWorkout: (date: Date) => void;
}) => {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing(2),
          paddingBottom: spacing(6),
          gap: spacing(2),
        }}
      >
        <Card style={heroCard}>
          <View style={{ flexDirection: 'row', gap: spacing(2) }}>
            {model.muscleChips.length > 0 ? (
              <View style={donutWrap}>
                <MusclePie data={model.musclePieData} radius={44} />
              </View>
            ) : null}
            <View style={{ flex: 1, gap: spacing(1) }}>
              <View style={{ alignItems: 'flex-end' }}>
                <PrimaryAction
                  label={asLabelText('Start workout')}
                  onPress={() => onStartWorkout(date)}
                />
              </View>
              {model.muscleChips.length > 0 ? (
                <View style={{ gap: spacing(0.5) }}>
                  {model.musclePieData.map(chip => (
                    <View key={chip.key} style={legendRow}>
                      <View style={legendLabel}>
                        <View
                          style={[
                            legendDot,
                            {
                              backgroundColor: chip.color ?? palette.primary,
                            },
                          ]}
                        />
                        <Text style={legendText}>{chip.label}</Text>
                      </View>
                      <Text style={legendValue}>{chip.percent}%</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
          <View style={statsRow}>
            <View style={statCard}>
              <Text style={statTitle}>Sets logged</Text>
              <View>
                <Text style={statValue}>{model.totalSets} sets</Text>
                <Text style={statMuted}>{model.averageSets} avg</Text>
              </View>
            </View>
          </View>
        </Card>

        {model.emptyState ? null : (
          <Card style={listContainer}>
            {model.sections.map((section, sectionIndex) => (
              <View key={section.key} style={sectionBlock}>
                <Text style={sectionLabel}>{section.label}</Text>
                {section.exercises.map((exercise, index) => (
                  <TouchableOpacity
                    key={`${section.key}-${exercise.name}-${index}`}
                    onPress={() => onOpenLog(exercise.name, date, 'Track')}
                    style={[
                      listRow,
                      index !== section.exercises.length - 1 && listRowDivider,
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
                          <Text style={exerciseTitle}>{exercise.name}</Text>
                          <View style={{ gap: spacing(0.25) }}>
                            {visibleSets.map((setItem, chunkIndex) => (
                              <Text
                                key={`${exercise.name}-${chunkIndex}`}
                                style={exerciseMeta}
                              >
                                {formatSetLabel(setItem)}
                              </Text>
                            ))}
                            {hasOverflow && !isExpanded ? (
                              <View style={moreSetsRow}>
                                <Text style={exerciseMeta}>
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
                                  onPress={() =>
                                    setExpandedExercises(previous => ({
                                      ...previous,
                                      [exerciseKey]: true,
                                    }))
                                  }
                                >
                                  <Text style={showMoreLink}>Show all</Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                            {hasOverflow && isExpanded ? (
                              <TouchableOpacity
                                onPress={() =>
                                  setExpandedExercises(previous => ({
                                    ...previous,
                                    [exerciseKey]: false,
                                  }))
                                }
                              >
                                <Text style={showMoreLink}>Show fewer</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      );
                    })()}
                    <View style={setCountPill}>
                      <Text style={setCountText}>{`${exercise.totalSets} ${
                        exercise.totalSets === 1 ? 'set' : 'sets'
                      }`}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {sectionIndex !== model.sections.length - 1 ? (
                  <View style={sectionDivider} />
                ) : null}
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
};

const PrimaryAction = ({
  label,
  onPress,
}: {
  label: LabelText;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: palette.primary,
      backgroundColor: palette.primary,
      paddingVertical: spacing(0.75),
      paddingHorizontal: spacing(1.5),
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing(0.5),
    }}
  >
    <PlusIcon width={16} height={16} color="#0f172a" />
    <Text
      style={{
        color: '#0f172a',
        fontWeight: '700',
        fontSize: fontSizes.actionButton,
      }}
    >
      {unwrapLabelText(label)}
    </Text>
  </TouchableOpacity>
);

type SetChunk = { description: DisplayLabel; count: number };
const MAX_SET_PREVIEW = 4;

const formatMuscleLabel = (label: MuscleGroup): DisplayLabel =>
  asDisplayLabel(
    label
      .split('_')
      .map(part => (part.length ? part[0].toUpperCase() + part.slice(1) : ''))
      .join(' '),
  );

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
    return asDisplayLabel(`${distance} m / ${duration} s`);
  }
  if (distance > 0) {
    return asDisplayLabel(`${distance} m`);
  }
  if (duration > 0) {
    return asDisplayLabel(`${duration} s`);
  }
  return asDisplayLabel('Logged set');
};

const formatSetLabel = (chunk: SetChunk): DisplayLabel => {
  if (chunk.count === 1) {
    return chunk.description;
  }
  return asDisplayLabel(`${chunk.count} sets · ${chunk.description}`);
};

const daySelector = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.25),
  borderBottomWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.background,
};

const arrowButton = {
  width: 38,
  height: 38,
  borderRadius: 19,
  borderWidth: 1,
  borderColor: palette.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: palette.surface,
};

const heroCard = {
  paddingVertical: spacing(2),
  gap: spacing(1.5),
};

const donutWrap = {
  width: 96,
  height: 96,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  borderRadius: 48,
  borderWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.mutedSurface,
};

const legendRow = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
};

const legendLabel = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: spacing(0.5),
};

const legendText = {
  color: palette.text,
  fontWeight: '600' as const,
  fontSize: 12,
};

const legendValue = {
  color: palette.mutedText,
  fontSize: 12,
};

const statsRow = {
  flexDirection: 'row' as const,
  gap: spacing(1.5),
};

const statCard = {
  flex: 1,
  paddingVertical: spacing(1.5),
  gap: spacing(1),
};

const statTitle = {
  color: palette.text,
  fontWeight: '600' as const,
  fontSize: 14,
};

const statValue = {
  color: palette.text,
  fontSize: 18,
  fontWeight: '700' as const,
};

const statMuted = {
  color: palette.mutedText,
  fontSize: 12,
};

const listContainer = {
  padding: spacing(2),
  gap: spacing(1.5),
};

const sectionBlock = {
  gap: spacing(0.75),
};

const sectionLabel = {
  color: palette.mutedText,
  fontSize: 12,
  letterSpacing: 0.5,
  textTransform: 'uppercase' as const,
};

const listRow = {
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'flex-start' as const,
  paddingVertical: spacing(1),
};

const listRowDivider = {
  borderBottomWidth: 1,
  borderColor: palette.border,
};

const sectionDivider = {
  height: 1,
  backgroundColor: palette.border,
  marginTop: spacing(1),
};

const legendDot = {
  width: 8,
  height: 8,
  borderRadius: 999,
};

const exerciseTitle = {
  color: palette.text,
  fontSize: 16,
  fontWeight: '600' as const,
};

const exerciseMeta = {
  color: palette.mutedText,
  fontSize: 12,
};

const setCountPill = {
  paddingHorizontal: spacing(1.25),
  paddingVertical: spacing(0.5),
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.mutedSurface,
  alignSelf: 'flex-start' as const,
};

const setCountText = {
  color: palette.mutedText,
  fontSize: 12,
  fontWeight: '600' as const,
};

const moreSetsRow = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: spacing(0.5),
};

const showMoreLink = {
  color: palette.primary,
  fontSize: 12,
  fontWeight: '600' as const,
};

const MusclePie = ({
  data,
  radius = 36,
}: {
  data: {
    key: DisplayLabel;
    label: DisplayLabel;
    percent: number;
    color?: ColorHex;
  }[];
  radius?: number;
}) => {
  if (!data.length) return null;
  const center = radius;
  let currentAngle = 0;
  const arcs = data.map(slice => {
    const sweep = (slice.percent / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sweep;
    currentAngle = endAngle;
    return {
      key: slice.key,
      label: slice.label,
      color: slice.color ?? palette.primary,
      percent: slice.percent,
      path: describeArc(center, center, radius, startAngle, endAngle),
    };
  });
  return (
    <Svg width={radius * 2} height={radius * 2}>
      {arcs.map(arc => (
        <Path key={arc.key} d={arc.path} fill={arc.color} opacity={0.9} />
      ))}
    </Svg>
  );
};

const polarToCartesian = (
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const describeArc = (
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${x} ${y}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
};

const countHiddenSets = (chunks: SetChunk[], maxShown: number) =>
  chunks.slice(maxShown).reduce((total, chunk) => total + chunk.count, 0);

export default HomeScreen;
