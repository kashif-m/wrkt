import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  ViewStyle,
  TouchableWithoutFeedback,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ScrollView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { getMuscleColor } from '../ui/muscleColors';
import { roundToLocalDay } from '../timePolicy';
import { palette, radius, spacing } from '../ui/theme';
import ChevronLeftIcon from '../assets/chevron-left.svg';
import ChevronRightIcon from '../assets/chevron-right.svg';
import TodayIcon from '../assets/today-target.svg';
import ArrowLeftIcon from '../assets/arrow-left.svg';
import {
  useAppActions,
  useAppDispatch,
  useAppState,
} from '../state/appContext';
import { ExerciseCatalogEntry } from '../exercise/catalogStorage';
import { Card } from '../ui/components';
import {
  ColorHex,
  ExerciseName,
  MuscleGroup,
  asDisplayLabel,
  asExerciseName,
  asScreenKey,
} from '../domain/types';

const DAYS_IN_WEEK = 7;
const TOTAL_CELLS = 42;
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const CalendarScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const events = state.events;
  const selectedDate = state.selectedDate;
  const catalog = state.catalog.entries;
  const visibleMonth = state.calendar.visibleMonth;
  const yearSheetOpen = state.calendar.yearSheetOpen;
  const monthAnim = useRef(new Animated.Value(1)).current;
  const sheetTranslate = useRef(new Animated.Value(0)).current;
  const gridRef = useRef<View>(null);
  const gridBounds = useRef<{ top: number; bottom: number } | null>(null);
  const [showAllMuscles, setShowAllMuscles] = useState(false);

  useEffect(() => {
    if (yearSheetOpen) {
      sheetTranslate.setValue(0);
    }
  }, [yearSheetOpen, sheetTranslate]);

  const updateGridBounds = useCallback(() => {
    gridRef.current?.measureInWindow((_x, y, _width, height) => {
      gridBounds.current = { top: y, bottom: y + height };
    });
  }, []);

  useEffect(() => {
    setShowAllMuscles(false);
  }, [visibleMonth]);

  const catalogMap = useMemo(() => {
    const map = new Map<ExerciseName, ExerciseCatalogEntry>();
    catalog.forEach(entry => map.set(entry.display_name, entry));
    return map;
  }, [catalog]);

  const dayColorMap = useMemo(() => {
    const buckets = new Map<number, ColorHex[]>();
    events.forEach(event => {
      const day = roundToLocalDay(event.ts);
      const exerciseName =
        typeof event.payload?.exercise === 'string'
          ? asExerciseName(event.payload.exercise)
          : null;
      const meta = exerciseName ? catalogMap.get(exerciseName) : null;
      const color = getMuscleColor(meta?.primary_muscle_group);
      const colors = buckets.get(day) ?? [];
      if (!colors.includes(color)) {
        colors.push(color);
        buckets.set(day, colors);
      }
    });
    return buckets;
  }, [events, catalogMap]);

  const legendEntries = useMemo(() => {
    const groups = new Map<MuscleGroup, ColorHex>();
    events.forEach(event => {
      const exerciseName =
        typeof event.payload?.exercise === 'string'
          ? asExerciseName(event.payload.exercise)
          : null;
      const meta = exerciseName ? catalogMap.get(exerciseName) : null;
      const group = meta?.primary_muscle_group;
      if (group && !groups.has(group)) {
        groups.set(group, getMuscleColor(group));
      }
    });
    return Array.from(groups.entries())
      .map(([group, color]) => ({
        key: group,
        label: asDisplayLabel(group.replace(/_/g, ' ')),
        color,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [events, catalogMap]);

  const monthStats = useMemo(() => {
    const start = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const end = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      1,
    );
    const daysInMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      0,
    ).getDate();
    const today = new Date();
    const daysElapsed =
      today.getFullYear() === visibleMonth.getFullYear() &&
      today.getMonth() === visibleMonth.getMonth()
        ? today.getDate()
        : daysInMonth;
    const sessionDays = new Set<number>();
    const dayGroups = new Map<number, Set<MuscleGroup>>();
    const muscleSetCounts = new Map<MuscleGroup, number>();
    events.forEach(event => {
      if (event.ts < start.getTime() || event.ts >= end.getTime()) return;
      const day = roundToLocalDay(event.ts);
      sessionDays.add(day);
      const exerciseName =
        typeof event.payload?.exercise === 'string'
          ? asExerciseName(event.payload.exercise)
          : null;
      const meta = exerciseName ? catalogMap.get(exerciseName) : null;
      const group = meta?.primary_muscle_group;
      if (!group) return;
      const daySet = dayGroups.get(day) ?? new Set<MuscleGroup>();
      daySet.add(group);
      dayGroups.set(day, daySet);
      muscleSetCounts.set(group, (muscleSetCounts.get(group) ?? 0) + 1);
    });
    const muscleSessionCounts = new Map<MuscleGroup, number>();
    dayGroups.forEach(groups => {
      groups.forEach(group => {
        muscleSessionCounts.set(
          group,
          (muscleSessionCounts.get(group) ?? 0) + 1,
        );
      });
    });
    const sessions = sessionDays.size;
    const attendance = daysElapsed
      ? Math.round((sessions / daysElapsed) * 100)
      : 0;
    const allMuscles = Array.from(muscleSessionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([group, count]) => ({
        group,
        count,
        color: getMuscleColor(group),
      }));
    const topMuscles = allMuscles.slice(0, 3);
    const totalSets = Array.from(muscleSetCounts.values()).reduce(
      (sum, count) => sum + count,
      0,
    );
    const pieData =
      totalSets > 0
        ? Array.from(muscleSetCounts.entries()).map(([group, count]) => ({
            key: asDisplayLabel(group),
            label: asDisplayLabel(group.replace(/_/g, ' ')),
            percent: Math.round((count / totalSets) * 100),
            color: getMuscleColor(group),
          }))
        : [];
    return {
      daysInMonth,
      sessions,
      attendance,
      topMuscles,
      allMuscles,
      pieData,
    };
  }, [events, visibleMonth, catalogMap]);

  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthLabel = visibleMonth.toLocaleDateString(undefined, {
    month: 'long',
  });
  const yearLabel = visibleMonth.getFullYear();
  const yearOptions = useMemo(() => {
    const base = visibleMonth.getFullYear() - 25;
    return Array.from({ length: 60 }, (_, index) => base + index);
  }, [visibleMonth]);

  const animateToMonth = useCallback(
    (target: Date) => {
      Animated.timing(monthAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        dispatch({ type: 'calendar/visibleMonth', date: target });
        Animated.timing(monthAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      });
    },
    [dispatch, monthAnim],
  );

  const handleShift = useCallback(
    (delta: number) => {
      animateToMonth(shiftMonth(visibleMonth, delta));
    },
    [animateToMonth, visibleMonth],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-15, 15])
        .onEnd(event => {
          'worklet';
          if (event.translationX > 20) {
            runOnJS(handleShift)(-1);
          } else if (event.translationX < -20) {
            runOnJS(handleShift)(1);
          }
        }),
    [handleShift],
  );

  const closeSheet = useCallback(() => {
    dispatch({ type: 'calendar/yearSheet', open: false });
    sheetTranslate.setValue(0);
  }, [dispatch, sheetTranslate]);

  const resetSheet = useCallback(() => {
    Animated.timing(sheetTranslate, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [sheetTranslate]);

  const updateSheetTranslate = useCallback(
    (value: number) => {
      sheetTranslate.setValue(value);
    },
    [sheetTranslate],
  );

  const sheetPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([6, 6])
        .failOffsetX([-10, 10])
        .onUpdate(event => {
          'worklet';
          if (event.translationY > 0) {
            runOnJS(updateSheetTranslate)(event.translationY);
          }
        })
        .onEnd(event => {
          'worklet';
          if (event.translationY > 80) {
            runOnJS(closeSheet)();
            return;
          }
          runOnJS(resetSheet)();
        }),
    [closeSheet, resetSheet, updateSheetTranslate],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={headerRow}>
        <TouchableOpacity
          onPress={() => actions.navigate(asScreenKey('home'))}
          style={headerButton}
        >
          <ArrowLeftIcon width={18} height={18} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => dispatch({ type: 'calendar/yearSheet', open: true })}
          style={monthTitle}
        >
          <Text
            style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}
          >
            {monthLabel}
          </Text>
          <Text style={{ color: palette.mutedText, fontSize: 12 }}>
            {yearLabel}
          </Text>
        </TouchableOpacity>
        <View style={headerActions}>
          <TouchableOpacity onPress={() => handleShift(-1)} style={iconButton}>
            <ChevronLeftIcon width={18} height={18} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleShift(1)} style={iconButton}>
            <ChevronRightIcon width={18} height={18} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const today = new Date();
              animateToMonth(today);
              actions.setSelectedDate(new Date(today));
            }}
            style={todayButton}
          >
            <TodayIcon width={16} height={16} color={palette.text} />
            <Text
              style={{ color: palette.text, fontWeight: '600', fontSize: 12 }}
            >
              Today
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <GestureDetector gesture={panGesture}>
        <ScrollView
          contentContainerStyle={{
            paddingBottom: spacing(6),
          }}
        >
          <Card style={summaryCard}>
            <View style={summaryHeader}>
              <Text style={summaryTitle}>Monthly summary</Text>
              <Text style={summarySubtitle}>
                {monthStats.sessions} sessions • {monthStats.attendance}%
                attendance
              </Text>
            </View>
            <View style={summaryBody}>
              <View style={{ flex: 1 }}>
                <View style={summaryRow}>
                  <Text style={summaryLabel}>Top muscle groups</Text>
                  {monthStats.allMuscles.length > 3 ? (
                    <TouchableOpacity
                      onPress={() => setShowAllMuscles(current => !current)}
                    >
                      <Text style={summaryLink}>
                        {showAllMuscles ? 'Show less' : 'Show all'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {(showAllMuscles
                  ? monthStats.allMuscles
                  : monthStats.topMuscles
                ).length === 0 ? (
                  <Text style={summaryValue}>No sessions yet</Text>
                ) : (
                  (showAllMuscles
                    ? monthStats.allMuscles
                    : monthStats.topMuscles
                  ).map(item => (
                    <View key={item.group} style={summaryRow}>
                      <View style={[dot, { backgroundColor: item.color }]} />
                      <Text style={summaryValue}>
                        {formatLabel(item.group)} · {item.count}
                      </Text>
                    </View>
                  ))
                )}
              </View>
              <View style={summaryChart}>
                <MusclePie data={monthStats.pieData} radius={38} />
              </View>
            </View>
          </Card>

          <View style={weekdayRow}>
            {DAY_NAMES.map(label => (
              <Text
                key={label}
                style={{
                  color:
                    label === 'SUN' || label === 'SAT'
                      ? palette.danger
                      : palette.mutedText,
                  fontSize: 12,
                  flex: 1,
                  textAlign: 'center',
                }}
              >
                {label}
              </Text>
            ))}
          </View>

          <Animated.View style={{ opacity: monthAnim }}>
            <View ref={gridRef} onLayout={updateGridBounds} style={grid}>
              {days.map((day, index) => {
                const dateKey = roundToLocalDay(day.getTime());
                const colors = dayColorMap.get(dateKey) ?? [];
                const isCurrentMonth =
                  day.getMonth() === visibleMonth.getMonth();
                const isSelected =
                  roundToLocalDay(selectedDate.getTime()) === dateKey;
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const isLastColumn = (index + 1) % DAYS_IN_WEEK === 0;
                const isLastRow = index >= TOTAL_CELLS - DAYS_IN_WEEK;
                return (
                  <TouchableOpacity
                    key={day.toISOString()}
                    style={[
                      cell,
                      {
                        borderRightWidth: isLastColumn ? 0 : 1,
                        borderBottomWidth: isLastRow ? 0 : 1,
                      },
                      !isCurrentMonth && { opacity: 0.3 },
                      isSelected && {
                        borderColor: palette.primary,
                        borderWidth: 2,
                      },
                      isWeekend && {
                        backgroundColor: addAlpha(palette.surface, 0.35),
                      },
                    ]}
                    onPress={() => {
                      actions.setSelectedDate(new Date(day));
                      actions.navigate(asScreenKey('home'));
                    }}
                  >
                    <Text
                      style={{
                        color: isWeekend ? palette.warning : palette.text,
                        fontWeight: '600',
                      }}
                    >
                      {day.getDate()}
                    </Text>
                    <View style={dotRow}>
                      {colors.slice(0, 3).map(color => (
                        <View
                          key={`${dateKey}-${color}`}
                          style={[dot, { backgroundColor: color }]}
                        />
                      ))}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        </ScrollView>
      </GestureDetector>

      {yearSheetOpen ? (
        <TouchableWithoutFeedback
          onPress={() => dispatch({ type: 'calendar/yearSheet', open: false })}
        >
          <View style={sheetOverlay}>
            <GestureDetector gesture={sheetPanGesture}>
              <Animated.View
                style={[
                  sheetContainer,
                  { transform: [{ translateY: sheetTranslate }] },
                ]}
              >
                <Text
                  style={{ color: palette.mutedText, marginBottom: spacing(1) }}
                >
                  Select year
                </Text>
                <ScrollView>
                  {yearOptions.map(year => (
                    <TouchableOpacity
                      key={year}
                      onPress={() => {
                        const target = new Date(visibleMonth);
                        target.setFullYear(year, target.getMonth(), 1);
                        animateToMonth(target);
                        dispatch({ type: 'calendar/yearSheet', open: false });
                      }}
                      style={[
                        sheetRow,
                        visibleMonth.getFullYear() === year && {
                          backgroundColor: palette.mutedSurface,
                        },
                      ]}
                    >
                      <Text style={{ color: palette.text, fontSize: 16 }}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  onPress={() =>
                    dispatch({ type: 'calendar/yearSheet', open: false })
                  }
                  style={{ paddingVertical: spacing(1) }}
                >
                  <Text
                    style={{
                      color: palette.primary,
                      fontWeight: '600',
                      textAlign: 'center',
                    }}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </GestureDetector>
          </View>
        </TouchableWithoutFeedback>
      ) : null}
    </View>
  );
};

const buildCalendarDays = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = firstDay.getDay();
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - offset);
  const days: Date[] = [];
  for (let i = 0; i < TOTAL_CELLS; i += 1) {
    days.push(
      new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate() + i,
      ),
    );
  }
  return days;
};

const shiftMonth = (date: Date, delta: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + delta, 1);
  return next;
};

const headerRow = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.5),
  borderBottomWidth: 1,
  borderColor: palette.border,
  gap: spacing(1),
};

const headerButton = {
  width: 36,
  height: 36,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: palette.surface,
};

const headerActions = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: spacing(0.75),
};

const monthTitle = {
  flex: 1,
  alignItems: 'center' as const,
};

const iconButton = {
  width: 36,
  height: 36,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: palette.mutedSurface,
};

const todayButton = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: spacing(0.5),
  paddingHorizontal: spacing(1.5),
  paddingVertical: spacing(0.5),
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.surface,
};

const weekdayRow = {
  flexDirection: 'row' as const,
  paddingHorizontal: spacing(2),
  paddingBottom: spacing(1),
};

const grid = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  paddingHorizontal: spacing(1.5),
  paddingBottom: spacing(1),
  backgroundColor: palette.surface,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  marginHorizontal: spacing(1.5),
  overflow: 'hidden' as const,
};

const cell: ViewStyle = {
  width: `${100 / DAYS_IN_WEEK}%`,
  paddingVertical: spacing(1.75),
  alignItems: 'center',
  borderColor: palette.border,
};

const dotRow = {
  flexDirection: 'row' as const,
  gap: 4,
  marginTop: spacing(1),
};

const dot = {
  width: 8,
  height: 8,
  borderRadius: 999,
};

const legendContainer = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: spacing(1.25),
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.5),
  justifyContent: 'center' as const,
};

const legendItem = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: spacing(0.5),
};

const summaryCard = {
  marginHorizontal: spacing(2),
  marginBottom: spacing(1.5),
  gap: spacing(1),
};

const summaryHeader = {
  gap: spacing(0.25),
};

const summaryTitle = {
  color: palette.text,
  fontSize: 16,
  fontWeight: '700' as const,
};

const summarySubtitle = {
  color: palette.mutedText,
  fontSize: 12,
};

const summaryBody = {
  flexDirection: 'row' as const,
  gap: spacing(2),
  alignItems: 'center' as const,
};

const summaryLabel = {
  color: palette.mutedText,
  fontSize: 12,
  marginBottom: spacing(0.5),
};

const summaryLink = {
  color: palette.primary,
  fontSize: 12,
  fontWeight: '600' as const,
};

const summaryValue = {
  color: palette.text,
  fontSize: 12,
};

const summaryRow = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: spacing(0.5),
  marginBottom: spacing(0.25),
};

const summaryChart = {
  width: 80,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

const formatLabel = (value: MuscleGroup) =>
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

const MusclePie = ({
  data,
  radius = 36,
}: {
  data: {
    key: ReturnType<typeof asDisplayLabel>;
    label: ReturnType<typeof asDisplayLabel>;
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
      color: slice.color ?? palette.primary,
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

const sheetOverlay = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: '#00000099',
  alignItems: 'center' as const,
  justifyContent: 'flex-end' as const,
};

const sheetContainer: ViewStyle = {
  width: '100%',
  maxHeight: '60%',
  backgroundColor: palette.surface,
  borderTopLeftRadius: radius.card,
  borderTopRightRadius: radius.card,
  padding: spacing(2),
};

const sheetRow = {
  paddingVertical: spacing(1),
  paddingHorizontal: spacing(0.5),
  borderRadius: radius.card,
};

export default CalendarScreen;
