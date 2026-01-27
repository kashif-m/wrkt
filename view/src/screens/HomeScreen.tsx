import React, { useMemo, useState } from 'react';
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

const HomeScreen = () => {
  const state = useAppState();
  const actions = useAppActions();
  const [expandedExercises, setExpandedExercises] = useState<
    Record<string, boolean>
  >({});
  const { events } = state;
  const selectedDate = state.selectedDate;
  const catalog = state.catalog.entries;
  const dayBucket = roundToLocalDay(selectedDate.getTime());
  const todayBucket = roundToLocalDay(Date.now());
  const isToday = dayBucket === todayBucket;
  const primaryLabel = isToday
    ? 'Today'
    : selectedDate.toLocaleDateString(undefined, { weekday: 'long' });
  const secondaryLabel = selectedDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const catalogMap = useMemo(() => {
    const map = new Map<ExerciseName, (typeof catalog)[number]>();
    catalog.forEach(entry => map.set(entry.display_name, entry));
    return map;
  }, [catalog]);

  const dayEvents = useMemo(
    () =>
      events
        .filter(event => roundToLocalDay(event.ts) === dayBucket)
        .sort((a, b) => a.ts - b.ts),
    [events, dayBucket],
  );

  const sections = useMemo(() => {
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
      const groupKey = meta?.primary_muscle_group ?? asMuscleGroup('untracked');
      const label = asDisplayLabel(
        groupKey.replace(/_/g, ' ').toUpperCase() || 'UNTRACKED',
      );
      const color = getMuscleColor(meta?.primary_muscle_group);
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
    return Array.from(groupMap.entries())
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
  }, [dayEvents, catalogMap]);

  const emptyState = sections.length === 0;
  const muscleChips = useMemo(() => {
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
  }, [sections]);

  const musclePieData = useMemo(() => {
    if (muscleChips.length <= 4) return muscleChips;
    const top = muscleChips.slice(0, 3);
    const remainder = muscleChips.slice(3);
    const remainderPercent = remainder.reduce(
      (sum, item) => sum + item.percent,
      0,
    );
    return [
      ...top,
      {
        key: asDisplayLabel('Other'),
        label: asDisplayLabel('Other'),
        color: palette.mutedSurface,
        percent: remainderPercent,
      },
    ];
  }, [muscleChips]);

  const totalSets = dayEvents.length;
  const totalExercises = sections.reduce(
    (sum, section) => sum + section.exercises.length,
    0,
  );
  const averageSets = totalExercises
    ? Math.round(totalSets / totalExercises)
    : 0;

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
            {primaryLabel}
          </Text>
          <Text style={{ color: palette.mutedText, fontSize: 14 }}>
            {secondaryLabel}
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
              {muscleChips.length > 0 ? (
                <View style={donutWrap}>
                  <MusclePie data={musclePieData} radius={44} />
                </View>
              ) : null}
              <View style={{ flex: 1, gap: spacing(1) }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <PrimaryAction
                    label={asLabelText('Start workout')}
                    onPress={() => actions.startWorkoutForDate(selectedDate)}
                  />
                </View>
                {muscleChips.length > 0 ? (
                  <View style={{ gap: spacing(0.5) }}>
                    {musclePieData.map(chip => (
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
                  <Text style={statValue}>{totalSets} sets</Text>
                  <Text style={statMuted}>{averageSets} avg</Text>
                </View>
              </View>
            </View>
          </Card>

          {emptyState ? null : (
            <Card style={listContainer}>
              {sections.map((section, sectionIndex) => (
                <View key={section.key} style={sectionBlock}>
                  <Text style={sectionLabel}>{section.label}</Text>
                  {section.exercises.map((exercise, index) => (
                    <TouchableOpacity
                      key={`${section.key}-${exercise.name}-${index}`}
                      onPress={() =>
                        actions.openLogForExercise(
                          exercise.name,
                          selectedDate,
                          'Track',
                        )
                      }
                      style={[
                        listRow,
                        index !== section.exercises.length - 1 &&
                          listRowDivider,
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
                  {sectionIndex !== sections.length - 1 ? (
                    <View style={sectionDivider} />
                  ) : null}
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      </View>
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
